/**
 * Orange Dashboard - Sidebar: active link + mobile toggle
 */
(function () {
    function getCurrentPage() {
        var path = window.location.pathname || '';
        var file = path.split('/').pop() || window.location.href.split('/').pop();
        file = file.replace(/\?.*$/, '');
        if (!file) return 'index.html';
        return file;
    }

    function setActiveLink() {
        var current = getCurrentPage();
        document.querySelectorAll('.sidebar-nav .nav-link[href], .sidebar-footer .nav-link[href]').forEach(function (a) {
            var href = a.getAttribute('href') || '';
            var linkFile = href.split('/').pop().replace(/\?.*$/, '');
            a.classList.remove('active');
            if (linkFile === current || (current === '' && linkFile === 'index.html')) {
                a.classList.add('active');
            }
        });
    }

    function initMobileToggle() {
        var sidebar = document.querySelector('.sidebar');
        var overlay = document.querySelector('.sidebar-overlay');
        var toggle = document.querySelector('.sidebar-toggle');
        if (!sidebar || !toggle) return;

        function open() {
            if (overlay) overlay.classList.add('show');
            sidebar.classList.add('open');
        }
        function close() {
            if (overlay) overlay.classList.remove('show');
            sidebar.classList.remove('open');
        }

        toggle.addEventListener('click', function () {
            if (sidebar.classList.contains('open')) close(); else open();
        });
        if (overlay) overlay.addEventListener('click', close);
        document.querySelectorAll('.sidebar-nav .nav-link').forEach(function (a) {
            a.addEventListener('click', function () {
                if (window.innerWidth <= 991) close();
            });
        });
    }

    function applyRoleVisibility() {
        try {
            var cu = localStorage.getItem('currentUser');
            if (!cu) return;
            var user = JSON.parse(cu);
            var role = user.role || '';
            var name = user.name || '';

            document.querySelectorAll('.sidebar-nav .nav-link[href*="admin_targets"]').forEach(function (a) {
                a.style.display = (role === 'Admin') ? '' : 'none';
            });
            document.querySelectorAll('.sidebar-nav .nav-link[href*="data_audit"]').forEach(function (a) {
                a.style.display = (role === 'Auditor') ? '' : 'none';
            });
            document.querySelectorAll('.sidebar-nav .nav-link[href*="target_setting"]').forEach(function (a) {
                a.style.display = (role === 'Admin' || name === 'Sales Manager') ? '' : 'none';
            });
        } catch (e) {}
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
            setActiveLink();
            initMobileToggle();
            applyRoleVisibility();
        });
    } else {
        setActiveLink();
        initMobileToggle();
        applyRoleVisibility();
    }
})();
