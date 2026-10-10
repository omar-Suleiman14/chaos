/**
 * Destination checks for webhook URLs (SSRF protection). Pure functions, used when
 * a subscription is saved and again, with DNS answers, right before each delivery.
 */

export type UrlCheck =
  | { ok: true; url: URL; hostname: string; insecureLocal: boolean }
  | { ok: false; code: "invalid_url" | "https_required" | "credentials_not_allowed" | "port_not_allowed" | "ip_literal" | "internal_hostname" | "too_long" };

const MAX_URL_LENGTH = 2048;

/** Hostnames that name internal or special-purpose networks. */
const INTERNAL_SUFFIXES = [".localhost", ".local", ".internal", ".intranet", ".lan", ".home", ".corp", ".home.arpa", ".in-addr.arpa", ".ip6.arpa", ".onion", ".test", ".invalid", ".example"];
const INTERNAL_NAMES = new Set(["localhost", "metadata", "metadata.google.internal", "instance-data", "kubernetes", "kubernetes.default"]);

function isIpv4Literal(host: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
}

/**
 * Static checks on a URL. `allowLocalhost` (development only, behind
 * CHAOS_WEBHOOK_ALLOW_LOCALHOST=1) permits http://localhost and http://127.0.0.1.
 */
export function checkWebhookUrl(raw: string, options: { allowLocalhost?: boolean } = {}): UrlCheck {
  const text = raw.trim();
  if (text.length > MAX_URL_LENGTH) return { ok: false, code: "too_long" };
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return { ok: false, code: "invalid_url" };
  }
  // The WHATWG parser already normalises "2130706433", "0x7f.1" and "127.1" to dotted IPv4.
  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  if (options.allowLocalhost && url.protocol === "http:" && (hostname === "localhost" || hostname === "127.0.0.1") && !url.username && !url.password) {
    return { ok: true, url, hostname, insecureLocal: true };
  }
  if (url.protocol !== "https:") return { ok: false, code: url.protocol === "http:" ? "https_required" : "invalid_url" };
  if (url.username || url.password) return { ok: false, code: "credentials_not_allowed" };
  if (url.port && url.port !== "443" && Number(url.port) < 1024) return { ok: false, code: "port_not_allowed" };
  if (!hostname) return { ok: false, code: "invalid_url" };
  if (hostname.startsWith("[") || hostname.includes(":") || isIpv4Literal(hostname)) return { ok: false, code: "ip_literal" };
  if (!hostname.includes(".") || INTERNAL_NAMES.has(hostname) || INTERNAL_SUFFIXES.some((s) => hostname.endsWith(s))) {
    return { ok: false, code: "internal_hostname" };
  }
  if (!/^[a-z0-9.-]+$/.test(hostname) || hostname.split(".").some((label) => !label || label.length > 63)) return { ok: false, code: "invalid_url" };
  return { ok: true, url, hostname, insecureLocal: false };
}

// ── Address classification ──────────────────────────────────────────────────

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const b = Number(p);
    if (b > 255) return null;
    n = n * 256 + b;
  }
  return n;
}

/** [network, prefix length] ranges that are not publicly routable or are otherwise unsafe to call. */
const BLOCKED_V4: [string, number][] = [
  ["0.0.0.0", 8], // "this" network
  ["10.0.0.0", 8], // private
  ["100.64.0.0", 10], // carrier-grade NAT
  ["127.0.0.0", 8], // loopback
  ["169.254.0.0", 16], // link-local, including cloud metadata 169.254.169.254
  ["172.16.0.0", 12], // private
  ["192.0.0.0", 24], // IETF protocol assignments
  ["192.0.2.0", 24], // documentation
  ["192.88.99.0", 24], // 6to4 relay
  ["192.168.0.0", 16], // private
  ["198.18.0.0", 15], // benchmarking
  ["198.51.100.0", 24], // documentation
  ["203.0.113.0", 24], // documentation
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved and broadcast
];

function blockedV4(ip: string): boolean {
  const n = ipv4ToInt(ip);
  if (n === null) return true;
  return BLOCKED_V4.some(([net, bits]) => {
    const base = ipv4ToInt(net)!;
    const size = 2 ** (32 - bits);
    return n >= base && n < base + size;
  });
}

/** Expands an IPv6 address to eight 16-bit groups, or null when it is malformed. */
function ipv6Groups(ip: string): number[] | null {
  let text = ip.toLowerCase().replace(/^\[|\]$/g, "");
  const zone = text.indexOf("%");
  if (zone >= 0) text = text.slice(0, zone);
  // A trailing dotted IPv4 (::ffff:1.2.3.4) becomes two groups.
  const v4 = /(\d{1,3}(?:\.\d{1,3}){3})$/.exec(text);
  if (v4) {
    const n = ipv4ToInt(v4[1]);
    if (n === null) return null;
    text = text.slice(0, -v4[1].length) + `${(n >>> 16).toString(16)}:${(n & 0xffff).toString(16)}`;
  }
  const halves = text.split("::");
  if (halves.length > 2) return null;
  const parse = (s: string) => (s ? s.split(":") : []);
  const head = parse(halves[0]);
  const tail = halves.length === 2 ? parse(halves[1]) : [];
  const missing = 8 - head.length - tail.length;
  if (halves.length === 1 ? head.length !== 8 : missing < 1) return null;
  const all = [...head, ...Array(halves.length === 2 ? missing : 0).fill("0"), ...tail];
  const groups = all.map((g) => (/^[0-9a-f]{1,4}$/.test(g) ? parseInt(g, 16) : NaN));
  return groups.some(Number.isNaN) ? null : groups;
}

function embeddedV4(g: number[], from: number): string {
  return `${g[from] >> 8}.${g[from] & 255}.${g[from + 1] >> 8}.${g[from + 1] & 255}`;
}

function blockedV6(ip: string): boolean {
  const g = ipv6Groups(ip);
  if (!g) return true;
  const zeroUpTo = (n: number) => g.slice(0, n).every((x) => x === 0);
  if (zeroUpTo(8)) return true; // ::
  if (zeroUpTo(7) && g[7] === 1) return true; // ::1
  if (zeroUpTo(5) && g[5] === 0xffff) return blockedV4(embeddedV4(g, 6)); // IPv4-mapped
  if (zeroUpTo(4) && g[4] === 0xffff && g[5] === 0) return blockedV4(embeddedV4(g, 6)); // IPv4-translated (SIIT) ::ffff:0:0:0/96
  if (zeroUpTo(6)) return blockedV4(embeddedV4(g, 6)); // IPv4-compatible (deprecated)
  if (g[0] === 0x64 && g[1] === 0xff9b && g[2] === 1) return true; // local-use NAT64 64:ff9b:1::/48 reaches private IPv4 space
  if (g[0] === 0x64 && g[1] === 0xff9b) return blockedV4(embeddedV4(g, 6)); // NAT64 well-known prefix
  if (g[0] === 0x2002) return blockedV4(embeddedV4(g, 1)); // 6to4 carries an IPv4 address
  if ((g[0] & 0xfe00) === 0xfc00) return true; // unique local fc00::/7
  if ((g[0] & 0xffc0) === 0xfe80) return true; // link-local fe80::/10
  if ((g[0] & 0xffc0) === 0xfec0) return true; // site-local fec0::/10 (deprecated)
  if ((g[0] & 0xff00) === 0xff00) return true; // multicast
  if (g[0] === 0x2001 && g[1] === 0x0db8) return true; // documentation
  if (g[0] === 0x2001 && g[1] === 0) return true; // Teredo tunnels
  if (g[0] === 0x0100 && g[1] === 0 && g[2] === 0 && g[3] === 0) return true; // discard-only 100::/64
  if (g[0] === 0xfd00 && g[1] === 0x0ec2) return true; // AWS IMDS over IPv6 (fd00:ec2::254), also covered by fc00::/7
  return false;
}

/** True when the address must never be connected to (private, loopback, link-local, CGNAT, multicast, metadata, reserved). */
export function isBlockedAddress(address: string): boolean {
  if (isIpv4Literal(address)) return blockedV4(address);
  if (address.includes(":")) return blockedV6(address);
  return true;
}
