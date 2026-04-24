const CACHE_NAME = 'grandparent-setup-v1';
const urlsToCache = [
    '/',
    '/manifest.json',
];

// Install event - cache assets
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(urlsToCache))
    );
    self.skipWaiting();
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request)
            .then((response) => {
                return response || fetch(event.request);
            })
    );
});

// Push event - handle incoming push messages
self.addEventListener('push', (event) => {
    const options = {
        body: event.data ? event.data.text() : 'New message from your grandchild!',
        icon: '/icon-192.png',
        badge: '/badge-72.png',
        vibrate: [200, 100, 200],
        tag: 'grandparent-notification',
        requireInteraction: true,
    };

    event.waitUntil(
        self.registration.showNotification('Faraway Grandparents', options)
    );
});

// Notification click event
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    event.waitUntil(
        clients.openWindow('/')
    );
});