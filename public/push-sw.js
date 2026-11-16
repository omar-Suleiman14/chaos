/* One root registration handles push and the public-only offline fallback. */
importScripts("/chaos-offline-sw.js");
self.addEventListener("push", (event) => {
  let lang = "en";
  try {
    const payload = event.data && event.data.json();
    if (payload && payload.lang === "ar") lang = "ar";
  } catch { /* Invalid payloads remain generic. */ }
  event.waitUntil(self.registration.showNotification("Chaos", {
    body: lang === "ar" ? "لديك إشعار جديد في Chaos." : "You have a new notification in Chaos.",
    icon: "/icon.svg",
    badge: "/icon.svg",
    tag: "chaos-activity",
    data: { path: "/dashboard" },
  }));
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const pages = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const page of pages) {
      if (new URL(page.url).origin === self.location.origin && "focus" in page) {
        await page.focus(); return;
      }
    }
    await self.clients.openWindow("/dashboard");
  })());
});
