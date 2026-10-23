'use strict';
(function () {
    var ui = InvidiousUI;
    var collapsed = InvidiousStorage.local.get('navigation_collapsed') === true;
    function rail() {
        document.body.dataset.navCollapsed = String(collapsed);
        document.querySelectorAll('[data-rail-toggle]').forEach(function (button) { button.setAttribute('aria-expanded', String(!collapsed)); });
    }
    document.querySelectorAll('.navigation-settings').forEach(function (settings) {
        var tools = document.createElement('div'); tools.className = 'navigation-tools';
        var toggle = document.createElement('button'); toggle.type = 'button'; toggle.className = 'pure-button';
        toggle.dataset.railToggle = ''; toggle.textContent = '☰'; toggle.title = ui.label('navigation_toggle'); toggle.setAttribute('aria-label', toggle.title);
        toggle.onclick = function () {
            collapsed = !collapsed; rail();
            if (!InvidiousStorage.local.set('navigation_collapsed', collapsed)) ui.notice(ui.label('page_only'));
        };
        var help = document.createElement('button'); help.type = 'button'; help.className = 'pure-button';
        help.textContent = '?'; help.title = ui.label('shortcuts'); help.setAttribute('aria-label', help.title); help.onclick = openHelp;
        tools.append(toggle, help); settings.append(tools);
    });
    document.querySelectorAll('.navigation-link').forEach(function (link) {
        link.setAttribute('aria-label', link.textContent.trim()); link.title = link.textContent.trim();
    });
    rail();
    var help = document.getElementById('shortcut-help'), returnFocus;
    function openHelp() {
        returnFocus = document.activeElement;
        if (menu) menu.open = false;
        if (!help.open) help.showModal();
    }
    help.addEventListener('close', function () { if (returnFocus && returnFocus.isConnected) returnFocus.focus(); });
    document.querySelector('[data-ui-dismiss]').onclick = ui.dismissNotice;
    document.addEventListener('keydown', function (event) {
        if (event.key !== '?' || event.defaultPrevented || event.isComposing || event.ctrlKey || event.altKey || event.metaKey ||
            event.target.closest('input, textarea, select, button, a, summary, [contenteditable], dialog') ||
            document.querySelector('dialog[open], .video-context[open]')) return;
        event.preventDefault(); openHelp();
    });
    var menu = document.querySelector('.navigation-menu');
    if (menu) {
        document.addEventListener('keydown', function (event) {
            if (event.key === 'Escape' && menu.open) {
                menu.open = false;
                menu.querySelector('summary').focus();
            }
            if (event.key === 'Tab' && menu.open) {
                var items = Array.from(menu.querySelectorAll('summary, a, button')).filter(function (item) { return item.getClientRects().length; });
                var first = items[0], last = items[items.length - 1];
                if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
                else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
            }
        });
        document.addEventListener('click', function (event) {
            if (menu.open && !menu.contains(event.target)) menu.open = false;
        });
    }
})();
