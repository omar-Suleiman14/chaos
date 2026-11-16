/* Accessible share links are discovered from the current catalogue DOM.
 * No separate manually maintained metadata list; build.mjs reads the same data. */
(() => {
  "use strict";
  const view = document.getElementById("view");
  if (!view) return;
  const slug = text => String(text).toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 65) || "resource";
  function attach() {
    for (const row of view.querySelectorAll(".material-row:not([data-share-processed])")) {
      row.dataset.shareProcessed = "true";
      const moduleEl = row.closest(".module");
      const moduleIndex = Number(moduleEl?.getAttribute("data-module-group"));
      if (!moduleEl || !Number.isInteger(moduleIndex)) continue;
      const original = row.querySelector('a.material-main[href*="t.me/"],a.quiz-link[href*="t.me/"]');
      if (!original) continue;
      let url;
      try { url = new URL(original.href); }
      catch { continue; }
      if (url.hostname !== "t.me" || !/^\/(?:zatoona44|ZatOona46|medics_44_mcq)\/\d+$/i.test(url.pathname)) continue;
      const [, channel, message] = url.pathname.split("/");
      const kind = row.dataset.kind || "resource";
      const source = channel.toLowerCase() === "zatoona46" ? channel + "/" + message : message;
      const path = channel === "medics_44_mcq"
        ? "/questions/q" + moduleIndex + "-" + slug(message)
        : "/material/m" + moduleIndex + "-" + slug(kind) + "-" + slug(source);
      const link = document.createElement("a");
      link.href = path;
      link.className = "index-share-link";
      link.textContent = "Share";
      link.setAttribute("aria-label", "Share an Index link for " + (row.querySelector(".material-name")?.textContent || "this material"));
      link.title = "Share this index entry with its own preview";
      const report = row.querySelector(".material-report");
      if (report) row.insertBefore(link, report);
      else row.appendChild(link);
      link.addEventListener("click", async event => {
        if (!navigator.share) return;
        event.preventDefault();
        try { await navigator.share({ title: document.title, url: link.href }); }
        catch (error) { if (error?.name !== "AbortError") location.assign(link.href); }
      });
    }
  }
  const style = document.createElement("style");
  style.textContent = '.index-share-link{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:0 9px;border-left:1px solid var(--border);font-size:11px;color:var(--muted);white-space:nowrap}.index-share-link:hover{color:var(--text);background:var(--hover)}.index-share-link:focus-visible{outline:2px solid var(--focus);outline-offset:-3px}.skip-to-index{position:absolute;top:-100px;left:14px;z-index:500;padding:10px 14px;background:var(--raised);border:2px solid var(--focus);color:var(--text);border-radius:5px}.skip-to-index:focus{top:12px}.sr-only-index{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}.network-status[hidden]{display:none!important}.network-status{position:fixed;bottom:72px;left:14px;right:14px;z-index:300;background:var(--raised);color:var(--text);border:1px solid var(--border-hover);border-radius:8px;max-width:400px;margin:auto;padding:11px 14px;text-align:center;box-shadow:0 8px 26px var(--shadow)}.network-status a{text-decoration:underline;text-underline-offset:3px}@media(max-width:550px){.index-share-link{min-height:44px;padding:0 7px;font-size:10px}}';
  document.head.appendChild(style);
  const indicator = document.createElement("div");
  indicator.className = "network-status";
  indicator.setAttribute("role", "status");
  indicator.setAttribute("aria-live", "polite");
  indicator.hidden = true;
  indicator.innerHTML = 'You are offline. <a href="/offline">Play the offline game</a> or use any materials saved on this device.';
  document.body.appendChild(indicator);
  function onlineState() { indicator.hidden = navigator.onLine; }
  addEventListener("online", onlineState);
  addEventListener("offline", onlineState);
  onlineState();
  attach();
  const observer = new MutationObserver(attach);
  observer.observe(view, { childList: true, subtree: true });
})();