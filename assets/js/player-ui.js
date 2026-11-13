'use strict';

// Watch layout changes resize the existing Video.js surface; media stays owned by player.js.
(function () {
    var layout = document.getElementById('watch-layout');
    if (!layout || !window.player || typeof player.getChild !== 'function' || player.invidiousLayoutStarted) return;
    player.invidiousLayoutStarted = true;
    var storage = window.InvidiousStorage, ui = window.InvidiousUI;
    var layoutChoice = storage.local.get('watch_layout');
    var labels = JSON.parse(document.getElementById('watch_ui_data').textContent);
    var words = player_data.interface_labels || {}, life = new AbortController(), active = true;
    var download = document.getElementById('download-options'), downloadDialog = document.getElementById('download-dialog'), downloadFallback = document.getElementById('download-fallback');
    if (download && downloadDialog) { downloadDialog.querySelector('.ui-dialog-body').append(download); if (downloadFallback) downloadFallback.hidden = true; }
    var bar = player.getChild('controlBar'), Button = videojs.getComponent('Button');
    var wideViewport = matchMedia('(width >= 960px)');
    var wide = new Button(player), shell = layout.querySelector('.watch-player');
    wide.addClass('vjs-theater-control');
    wide.el().setAttribute('aria-controls', 'watch-layout');
    if (window.InvidiousPlayerInterface) {
        var icon = wide.el().querySelector('.vjs-icon-placeholder');
        icon.replaceChildren(InvidiousPlayerInterface.icon('layout-panel-top'));
    }
    bar.addChild(wide, {}, bar.children().indexOf(bar.getChild('pictureInPictureToggle') || bar.getChild('fullscreenToggle')));
    function current() { return active && !life.signal.aborted && !player.isDisposed() && storage.isCurrent(); }
    function on(target, name, handler) { target.addEventListener(name, handler, {signal:life.signal}); }
    function apply(value) {
        if (!current()) return;
        var mode = layoutChoice = value === 'theater' ? 'theater' : 'standard', changed = document.body.dataset.watchLayout !== mode;
        document.body.dataset.watchLayout = mode;
        wide.el().setAttribute('aria-pressed', String(mode === 'theater'));
        wide.controlText(mode === 'theater' ? (words.exit_theater || labels.wide_player) : (words.enter_theater || labels.wide_player));
        if (changed) { player.trigger('watchlayoutchange'); player.trigger('playerresize'); }
    }
    function restore() { apply(layoutChoice); }
    wide.on('click', function () {
        if (!current() || !wideViewport.matches) return;
        var value = document.body.dataset.watchLayout === 'theater' ? 'standard' : 'theater';
        apply(value);
        if (!storage.local.set('watch_layout', value) && ui) ui.notice(ui.label('page_only'));
    });
    function syncTheaterControl() {
        if (wideViewport.matches) wide.show();
        else {
            if (wide.el().contains(document.activeElement)) {
                var replacement = bar.children().find(function (control) { return control.hasClass('vjs-desktop-settings') || control.hasClass('vjs-mobile-settings'); });
                (replacement ? replacement.el() : player.el()).focus({preventScroll:true});
            }
            wide.hide();
        }
    }
    on(wideViewport, 'change', syncTheaterControl);
    syncTheaterControl();
    on(window, 'browserprofilechange', function () { active = false; wide.disable(); });
    on(window, 'pagehide', function (event) { active = false; if (!event.persisted) dispose(); });
    on(window, 'pageshow', function () { active = !life.signal.aborted; if (current()) { restore(); size(); } });

    // Preserve the vendor speed control for legacy/mobile consumers of its items.
    var rate = bar.getChild('playbackRateMenuButton');
    if (rate) {
        rate.handleClick = videojs.getComponent('MenuButton').prototype.handleClick;
        rate.createMenu = function () {
            var Menu = videojs.getComponent('Menu'), Item = videojs.getComponent('PlaybackRateMenuItem');
            var menu = new Menu(player, {menuButton:this});
            this.playbackRates().slice().reverse().forEach(function (value) { menu.addItem(new Item(player, {rate:value+'x'})); });
            return menu;
        };
        rate.update();
    }
    function size() {
        if (!current()) return;
        var ratio = String(player.aspectRatio() || player_data.aspect_ratio || '16:9').match(/^([\d.]+)[:/]([\d.]+)$/);
        if (shell && ratio && Number(ratio[1]) > 0 && Number(ratio[2]) > 0) {
            shell.style.setProperty('--video-aspect', Number(ratio[1])+' / '+Number(ratio[2]));
            shell.style.setProperty('--video-ratio', Number(ratio[1])/Number(ratio[2]));
        }
        player.el().style.setProperty('--player-menu-height', Math.max(44, player.el().clientHeight-80)+'px');
    }
    function paused() { if (current()) { player.userActive(true); player.reportUserActivity(); } }
    var resize = window.ResizeObserver ? new ResizeObserver(size) : null;
    if (resize) resize.observe(player.el());
    function dispose() {
        life.abort(); if (resize) resize.disconnect();
        player.off('playerresize',size); player.off('loadedmetadata',size); player.off('pause',paused);
    }
    player.on('playerresize',size); player.on('loadedmetadata',size); player.on('pause',paused); player.on('dispose',dispose);
    restore(); size();
})();
