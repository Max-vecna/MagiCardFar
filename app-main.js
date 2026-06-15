import './ui-settings.js';
import './app-navigation.js';

const zoomKeys = new Set(['+', '-', '=', '0']);
let lastTouchEnd = 0;

document.addEventListener('wheel', event => {
    if (event.ctrlKey || event.metaKey) event.preventDefault();
}, { passive: false });

document.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && zoomKeys.has(event.key)) event.preventDefault();
});

document.addEventListener('touchmove', event => {
    if (event.touches.length > 1) event.preventDefault();
}, { passive: false });

document.addEventListener('touchend', event => {
    const now = Date.now();
    if (now - lastTouchEnd <= 300) event.preventDefault();
    lastTouchEnd = now;
}, { passive: false });

['gesturestart', 'gesturechange', 'gestureend'].forEach(type => {
    document.addEventListener(type, event => event.preventDefault(), { passive: false });
});

window.addEventListener('load', () => {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker
            .getRegistrations()
            .then(registrations => registrations.forEach(registration => registration.unregister()))
            .catch(() => {});
    }

    if ('caches' in window) {
        caches.keys()
            .then(keys => keys.forEach(key => caches.delete(key)))
            .catch(() => {});
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const splashScreen = document.getElementById('splash-screen');
    const mainContent = document.getElementById('main-content');

    setTimeout(() => {
        if (splashScreen) splashScreen.classList.add('hidden');
        if (mainContent) {
            mainContent.style.visibility = 'visible';
            mainContent.style.opacity = '1';
        }
    }, 1200);
});
