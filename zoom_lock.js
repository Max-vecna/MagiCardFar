(() => {
    const viewportContent = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no, viewport-fit=cover';
    const zoomKeys = new Set(['+', '-', '=', '0']);
    let lastTouchEnd = 0;

    function lockViewport() {
        let viewport = document.querySelector('meta[name="viewport"]');
        if (!viewport) {
            viewport = document.createElement('meta');
            viewport.name = 'viewport';
            document.head.appendChild(viewport);
        }

        viewport.content = viewportContent;
    }

    lockViewport();
    document.addEventListener('DOMContentLoaded', lockViewport);

    document.addEventListener('wheel', event => {
        if (event.ctrlKey || event.metaKey) {
            event.preventDefault();
        }
    }, { passive: false });

    document.addEventListener('keydown', event => {
        if ((event.ctrlKey || event.metaKey) && zoomKeys.has(event.key)) {
            event.preventDefault();
        }
    });

    document.addEventListener('touchmove', event => {
        if (event.touches.length > 1) {
            event.preventDefault();
        }
    }, { passive: false });

    document.addEventListener('touchend', event => {
        const now = Date.now();
        if (now - lastTouchEnd <= 300) {
            event.preventDefault();
        }
        lastTouchEnd = now;
    }, { passive: false });

    ['gesturestart', 'gesturechange', 'gestureend'].forEach(type => {
        document.addEventListener(type, event => event.preventDefault(), { passive: false });
    });
})();
