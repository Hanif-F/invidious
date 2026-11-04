'use strict';
(function () {
    var shell = document.querySelector('.watch-player'), container = document.getElementById('player-container');
    if (!shell || !container || !window.player || typeof player.el !== 'function' || !window.InvidiousStorage || player.invidiousDockStarted) return;
    player.invidiousDockStarted = true;
    var storage = InvidiousStorage, ui = window.InvidiousUI, words = (window.player_data || {}).interface_labels || {};
    var life = new AbortController(), active = true, dismissed = false, docked = false, frame = null;
    var editing = false;
    if (player.invidiousDockEnabled === undefined) player.invidiousDockEnabled = storage.local.get('player_dock_enabled') === true;
    var started = typeof player.hasStarted === 'function' && player.hasStarted();
    var desktop = matchMedia('(min-width:1100px)'), controls = document.createElement('div');
    controls.className = 'dock-controls'; controls.hidden = true;
    var buttons = {};
    function label(key, fallback) { return words[key] || (ui ? ui.label(fallback || key) : key); }
    function icon(button, name, text) {
        button.setAttribute('aria-label',text); button.title = text;
        if (window.InvidiousPlayerInterface) button.replaceChildren(InvidiousPlayerInterface.icon(name));
        else button.textContent = text;
    }
    function current() { return active && !life.signal.aborted && storage.isCurrent() && !(player.isDisposed && player.isDisposed()); }
    function on(target,name,handler,options) { target.addEventListener(name,handler,Object.assign({signal:life.signal},options)); }
    function updateButtons() {
        if (!current()) return;
        icon(buttons.play,player.paused() ? 'play' : 'pause',label(player.paused() ? 'play' : 'pause','play_pause'));
        icon(buttons.mute,player.muted() ? 'volume-x' : 'volume-2',label(player.muted() ? 'unmute' : 'mute','mute'));
        buttons.mute.setAttribute('aria-pressed',String(player.muted()));
    }
    function setDock(value) {
        if (docked === value) return;
        docked = value; shell.classList.toggle('is-docked',value); controls.hidden = !value;
        if (typeof player.trigger === 'function') { player.trigger('dockchange'); player.trigger('playerresize'); }
    }
    function returnToVideo() {
        setDock(false); shell.scrollIntoView({block:'start',behavior:'instant'});
        player.userActive(true); player.reportUserActivity();
        var bar = player.getChild && player.getChild('controlBar'), play = bar && bar.getChild('playToggle');
        if (play) play.el().focus({preventScroll:true});
    }
    ['play','mute','return','dismiss'].forEach(function (action) {
        var button = document.createElement('button'); button.type = 'button'; button.className = 'icon-button'; button.dataset.dock = action;
        buttons[action] = button; controls.append(button);
        on(button,'click',function () {
            if (!current()) return;
            if (action === 'play') {
                if (player.paused()) { var promise = player.play(); if (promise) promise.catch(function () {}); }
                else player.pause();
            } else if (action === 'mute') player.muted(!player.muted());
            else if (action === 'return') returnToVideo();
            else {
                dismissed = true; setDock(false);
                var navigation = document.getElementById('sidebar-toggle'); if (navigation) navigation.focus({preventScroll:true});
            }
        });
    });
    icon(buttons.return,'layout-panel-top',label('dock_return'));
    icon(buttons.dismiss,'x',label('dock_dismiss'));
    container.append(controls);
    function update() {
        frame = null;
        if (!current()) { setDock(false); return; }
        var params = (window.video_data || {}).params || {}, root = player.el();
        var blocked = !player.invidiousDockEnabled || !desktop.matches || dismissed || !started ||
            document.fullscreenElement || document.pictureInPictureElement || player.isFullscreen && player.isFullscreen() ||
            params.listen || params.controls === false || editing || document.body.dataset.clipEditing === 'true' || root.dataset.clipPreview === 'true';
        // The shell keeps its aspect ratio while only its existing media surface is fixed.
        setDock(!blocked && shell.getBoundingClientRect().bottom <= 96);
    }
    function schedule() { if (active && frame === null) frame = requestAnimationFrame(update); }
    function played() { started = true; updateButtons(); schedule(); }
    function cleanup() {
        active = false; cancelAnimationFrame(frame); frame = null; setDock(false); life.abort(); controls.remove();
        player.off('play',played); player.off('pause',updateButtons); player.off('volumechange',updateButtons);
        ['fullscreenchange','watchlayoutchange','dockpreferencechange'].forEach(function (name) { player.off(name,schedule); });
    }
    player.on('play',played); player.on('pause',updateButtons); player.on('volumechange',updateButtons);
    ['fullscreenchange','watchlayoutchange','dockpreferencechange'].forEach(function (name) { player.on(name,schedule); });
    on(window,'scroll',schedule,{passive:true}); on(window,'resize',schedule);
    on(document,'fullscreenchange',schedule); on(document,'enterpictureinpicture',schedule,{capture:true}); on(document,'leavepictureinpicture',schedule,{capture:true});
    on(document,'iv:clip-preview',function (event) { editing = !!event.detail && event.detail.active === true; schedule(); });
    on(window,'browserprofilechange',function () { active = false; setDock(false); });
    on(window,'pagehide',function (event) { active = false; cancelAnimationFrame(frame); frame = null; setDock(false); if (!event.persisted) cleanup(); });
    on(window,'pageshow',function () { active = !life.signal.aborted; updateButtons(); schedule(); });
    if (desktop.addEventListener) on(desktop,'change',schedule);
    player.on('dispose',cleanup);
    updateButtons(); update();
})();
