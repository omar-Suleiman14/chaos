/* Chaos Index PWA shell; no credentials, personal data, or third-party responses cached. */
"use strict";
const CACHE="chaos-index-shell-v1";
const SHELL=["/","/icon.svg","/manifest.webmanifest"];
self.addEventListener("install",event=>{
 event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting()));
});
self.addEventListener("activate",event=>{
 event.waitUntil(Promise.all([
  caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith("chaos-index-shell-")&&k!==CACHE).map(k=>caches.delete(k)))),
  self.clients.claim()
 ]));
});
self.addEventListener("fetch",event=>{
 if(event.request.method!=="GET")return;
 const url=new URL(event.request.url);
 if(url.origin!==self.location.origin||url.pathname.startsWith("/admin"))return;
 if(event.request.mode==="navigate"){
  event.respondWith(fetch(event.request).then(response=>{
   if(response.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put("/",copy)).catch(()=>{});}
   return response;
  }).catch(()=>caches.match("/").then(hit=>hit||Response.error())));
  return;
 }
 if(SHELL.includes(url.pathname)){
  event.respondWith(caches.match(event.request).then(hit=>hit||fetch(event.request)));
 }
});
