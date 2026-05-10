const THEME_STORAGE_KEY = 'theme';
const THEME_COLORS = {
    dark: '#111827',
    light: '#f8fafc'
};

function getThemeMetaElement() {
    return document.getElementById('theme-color-meta') || document.querySelector('meta[name="theme-color"]');
}

function updateThemeSwitcherIcons(theme) {
    document.querySelectorAll('#theme-switcher, #theme-switcher-mobile').forEach((switcher) => {
        const icon = switcher.querySelector('i');
        if (icon) {
            icon.className = theme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
        }
    });
}

export function applyTheme(theme) {
    const normalizedTheme = theme === 'light' ? 'light' : 'dark';
    document.body.classList.toggle('dark', normalizedTheme === 'dark');

    const themeMeta = getThemeMetaElement();
    if (themeMeta) {
        themeMeta.setAttribute('content', THEME_COLORS[normalizedTheme]);
    }

    updateThemeSwitcherIcons(normalizedTheme);
    localStorage.setItem(THEME_STORAGE_KEY, normalizedTheme);
}

function bindThemeSwitchers() {
    document.querySelectorAll('#theme-switcher, #theme-switcher-mobile').forEach((switcher) => {
        switcher.addEventListener('click', () => {
            const currentTheme = localStorage.getItem(THEME_STORAGE_KEY) || 'dark';
            applyTheme(currentTheme === 'dark' ? 'light' : 'dark');
        });
    });
}

function bindSidebarToggle(toggleId, sidebarId) {
    const toggle = document.getElementById(toggleId);
    const sidebar = document.getElementById(sidebarId);

    if (!toggle || !sidebar) return;

    toggle.addEventListener('click', () => {
        sidebar.classList.toggle('active');
    });
}

document.addEventListener('DOMContentLoaded', () => {
    const savedTheme = localStorage.getItem(THEME_STORAGE_KEY) || 'dark';
    applyTheme(savedTheme);

    bindThemeSwitchers();
    bindSidebarToggle('sidebar-toggle', 'actions-sidebar');
    bindSidebarToggle('sidebar-toggle-1', 'actions-sidebar-1');
});
