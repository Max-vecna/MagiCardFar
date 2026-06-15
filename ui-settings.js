function bindSidebarToggle(toggleId, sidebarId) {
    const toggle = document.getElementById(toggleId);
    const sidebar = document.getElementById(sidebarId);

    if (!toggle || !sidebar) return;

    toggle.addEventListener('click', () => {
        sidebar.classList.toggle('active');
    });
}

document.addEventListener('DOMContentLoaded', () => {
    bindSidebarToggle('sidebar-toggle', 'actions-sidebar');
    bindSidebarToggle('sidebar-toggle-1', 'actions-sidebar-1');
});
