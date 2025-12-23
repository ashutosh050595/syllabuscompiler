
// Service Worker for background sync
const CACHE_NAME = 'sh-syllabus-v2';
const OFFLINE_URL = '/offline.html';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.add(OFFLINE_URL).catch(() => console.debug('Offline cache skip')))
  );
  self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  if (event.request.url.includes('script.google.com')) {
    event.respondWith(
      fetch(event.request)
        .catch(() => {
          return new Response(JSON.stringify({
            result: 'queued',
            message: 'Network offline. Request will be retried by app engine.'
          }), {
            headers: { 'Content-Type': 'application/json' }
          });
        })
    );
  }
});

self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-submissions') {
    console.debug('Background sync triggered');
  }
});
