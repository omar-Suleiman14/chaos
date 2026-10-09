/* eslint-disable @next/next/no-img-element -- rendered by next/og into a PNG, not shown in a page */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { zipSync, strToU8 } from "fflate";
import { readStudySkillFiles } from "@/lib/integrations/studySkill";
import { chaosIntegration, integrationPlatformList } from "@/lib/integrations";
import { integrationPackage, platformForPackageFile, type LogoAssets } from "@/lib/integrations/packages";

/**
 * Downloadable Chaos packages and icons: /api/plugins/chaos-for-claude.zip, chaos-for-chatgpt.zip
 * and chaos-icon-<size>.png. Built once per deploy from lib/integrations and public/icon.svg, so the
 * packages never drift from the site. They contain only public metadata and the public MCP URL.
 */
export const dynamic = "force-static";
export const dynamicParams = false;

const ICON_SIZES = [128, 512] as const;
const iconFile = (size: number) => `chaos-icon-${size}.png`;

export function generateStaticParams() {
  return [...integrationPlatformList.map((platform) => ({ file: platform.packageFile })), ...ICON_SIZES.map((size) => ({ file: iconFile(size) }))];
}

/** The canonical mark, read from the same file the site serves at /icon.svg. */
const logoSvg = () => readFile(join(process.cwd(), "public", chaosIntegration.logoPath.slice(1)), "utf8");

async function renderPng(svg: string, size: number): Promise<Uint8Array> {
  const src = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
  const image = new ImageResponse(<img src={src} width={size} height={size} alt="" />, { width: size, height: size });
  return new Uint8Array(await image.arrayBuffer());
}

/** A fixed timestamp keeps the ZIP byte-identical between builds when nothing changed. */
const mtime = new Date("2026-01-01T00:00:00Z");

export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const svg = await logoSvg();

  const icon = ICON_SIZES.find((size) => iconFile(size) === file);
  if (icon) {
    return new Response(Buffer.from(await renderPng(svg, icon)), { headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=86400" } });
  }

  const platform = platformForPackageFile(file);
  if (!platform) return new Response("Not found", { status: 404 });
  const logo: LogoAssets = { svg, png512: await renderPng(svg, 512), png128: await renderPng(svg, 128) };
  const files = integrationPackage(platform, logo, await readStudySkillFiles());
  const zip = zipSync(
    Object.fromEntries(Object.entries(files).map(([path, content]) => [path, [typeof content === "string" ? strToU8(content) : content, { mtime }]])),
    { level: 9 },
  );
  return new Response(Buffer.from(zip), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${file}"`,
      // The CDN serves the build's copy; browsers re-check, so a download after a deploy is never the old package.
      "Cache-Control": "public, max-age=0, must-revalidate",
    },
  });
}
