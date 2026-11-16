/**
 * sw.js — Service Worker for BizHealth AI
 *
 * Strategy: Cache-first for all app shell assets (HTML, CSS, JS, icons).
 * The app has no network calls — everything is localStorage only — so
 * a simple install-and-cache approach is sufficient.
 *
 * Cache versioning: bump CACHE_NAME when assets change to force clients
 * to pick up the new shell on next visit.
 */

'use strict';

const CACHE_NAME = 'bizhealth-ai-v1';

/** All files that make up the app shell. */
const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/css/styles.css',
  '/js/parser.js',
  '/js/categorizer.js',
  '/js/pnl.js',
  '/js/trends.js',
  '/js/suggestions.js',
  '/js/market-day.js',
  '/js/taxi.js',
  '/js/ui.js',
  '/js/app.js',
  '/icons/icon-192.svg',
  '/icons/icon-512.svg',
  '/manifest.json',
];

// ── Install: pre-cache all shell assets ──────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting())   // activate immediately
  );
});

// ── Activate: delete old caches ───────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())  // take control of all open tabs
  );
});

// ── Fetch: cache-first, fall back to network ──────────────────────────────────
self.addEventListener('fetch', event => {
  // Only handle GET requests for same-origin resources
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;

      // Not in cache — fetch from network and cache for next time
      return fetch(event.request).then(response => {
        // Only cache valid responses
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }
        const toCache = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, toCache));
        return response;
      });
    })
  );
});
