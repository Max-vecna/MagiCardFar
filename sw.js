const CACHE_NAME = 'magic-cards-shell-v6';

const LOCAL_ASSETS = [
    './',
    './index.html',
    './style.css',
    './vendor/rpg-awesome/css/rpg-awesome.min.css',
    './vendor/rpg-awesome/fonts/rpgawesome-webfont.eot',
    './vendor/rpg-awesome/fonts/rpgawesome-webfont.svg',
    './vendor/rpg-awesome/fonts/rpgawesome-webfont.ttf',
    './vendor/rpg-awesome/fonts/rpgawesome-webfont.woff',
    './splash_screen.js',
    './settings_manager.js',
    './pwa_manager.js',
    './drive_adapter.js',
    './local_db.js',
    './ui_utils.js',
    './category_manager.js',
    './card-renderer.js',
    './character_manager.js',
    './magic_renderer.js',
    './magic_manager.js',
    './item_renderer.js',
    './item_manager.js',
    './attack_renderer.js',
    './grimoire_manager.js',
    './navigation_manager.js',
    './manifest.webmanifest',
    './favicon.svg',
    './icons/back.svg',
    './icons/fundo.svg',
    './icons/app-icon.svg',
    './icons/app-icon-maskable.svg',
    './icons/apple-touch-icon.svg'
];

const EXTERNAL_STATIC_ASSETS = [
    'https://cdn.tailwindcss.com',
    'https://apis.google.com/js/api.js',
    'https://accounts.google.com/gsi/client',
    'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/+esm'
];

function isSupportedExternalAsset(url) {
    return EXTERNAL_STATIC_ASSETS.includes(url);
}

async function cacheCoreAssets() {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(LOCAL_ASSETS);

    await Promise.allSettled(EXTERNAL_STATIC_ASSETS.map(async (url) => {
        const request = new Request(url, { mode: 'no-cors' });
        const response = await fetch(request);
        await cache.put(request, response);
    }));
}

async function cacheFirst(request) {
    const cache = await caches.open(CACHE_NAME);
    const cachedResponse = await cache.match(request);

    if (cachedResponse) return cachedResponse;

    try {
        const networkResponse = await fetch(request);
        if (networkResponse && (networkResponse.ok || networkResponse.type === 'opaque')) {
            cache.put(request, networkResponse.clone());
        }
        return networkResponse;
    } catch (error) {
        if (request.mode === 'navigate') {
            return cache.match('./index.html');
        }
        throw error;
    }
}

async function networkFirst(request) {
    const cache = await caches.open(CACHE_NAME);

    try {
        const networkResponse = await fetch(request);
        if (networkResponse && (networkResponse.ok || networkResponse.type === 'opaque')) {
            cache.put(request, networkResponse.clone());
        }
        return networkResponse;
    } catch (error) {
        const cachedResponse = await cache.match(request);
        if (cachedResponse) return cachedResponse;

        if (request.mode === 'navigate') {
            return cache.match('./index.html');
        }
        throw error;
    }
}

self.addEventListener('install', (event) => {
    event.waitUntil(cacheCoreAssets().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        const cacheKeys = await caches.keys();
        await Promise.all(
            cacheKeys
                .filter((key) => key !== CACHE_NAME)
                .map((key) => caches.delete(key))
        );
        await self.clients.claim();
    })());
});

self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;

    const requestUrl = new URL(event.request.url);
    const isLocalAsset = requestUrl.origin === self.location.origin;
    const pathname = requestUrl.pathname;
    const isLocalCodeAsset = isLocalAsset && (
        pathname.endsWith('.js') ||
        pathname.endsWith('.css') ||
        pathname.endsWith('.html') ||
        pathname.endsWith('.webmanifest') ||
        pathname.endsWith('.svg')
    );

    if (isLocalCodeAsset) {
        event.respondWith(networkFirst(event.request));
        return;
    }

    if (isLocalAsset || isSupportedExternalAsset(requestUrl.href)) {
        event.respondWith(cacheFirst(event.request));
    }
});
