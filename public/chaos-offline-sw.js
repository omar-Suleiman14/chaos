/* Offline navigation fallback only. Never cache accounts, lessons, forms, or API responses. */
"use strict";
const NAME = "chaos-offline-fallback-v1";
const FILES = ["/offline.html", "/offline-game.js"];
self.addEventListener("install", event => { event.waitUntil(caches.open(NAME).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener("activate", event => { event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith("chaos-offline-fallback-") && k !== NAME).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", event => {
 if (event.request.mode !== "navigate" || event.request.method !== "GET") return;
 event.respondWith(fetch(event.request).catch(async () => (await caches.match("/offline.html")) || Response.error()));
});