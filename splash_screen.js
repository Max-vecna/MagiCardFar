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
