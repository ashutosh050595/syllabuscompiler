
// Service Worker for background sync
const CACHE_NAME = 'syllabus-v1';
const OFFLINE_URL = '/offline.html';
const SYNC_QUEUE = 'sync-queue';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.add(OFFLINE_URL).catch(() => console.debug('Offline URL cache skip')))
  );
  self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  // Handle API requests
  if (event.request.url.includes('script.google.com')) {
    event.respondWith(
      fetch(event.request)
        .catch(() => {
          // Return a placeholder response when offline
          return new Response(JSON.stringify({
            result: 'queued',
            message: 'Will sync when online'
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
