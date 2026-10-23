'use strict';
(function () {
    var shell = document.querySelector('.watch-player');
    var container = document.getElementById('player-container');
    if (!shell || !container || typeof player === 'undefined') return;
    var ui = InvidiousUI, started = false, dismissed = false, docked = false;
    var desktop = matchMedia('(min-width: 1100px)');
    var controls = document.createElement('div'); controls.className = 'dock-controls'; controls.hidden = true;
    ['play', 'mute', 'return', 'dismiss'].forEach(function (action) {
        var button = document.createElement('button'); button.type = 'button'; button.className = 'pure-button'; button.dataset.dock = action;
        var label = ui.label({play: 'play_pause', mute: 'mute', return: 'dock_return', dismiss: 'dock_dismiss'}[action]);
        button.textContent = action === 'play' ? '▶ / Ⅱ' : action === 'mute' ? '♪' : action === 'dismiss' ? '×' : label;
        button.setAttribute('aria-label', label); button.title = label;
        button.onclick = function () {
            if (action === 'play') { if (player.paused()) player.play().catch(function () {}); else player.pause(); }
            if (action === 'mute') player.muted(!player.muted());
            if (action === 'return') { setDock(false); shell.scrollIntoView({block: 'start'}); container.querySelector('video, audio').focus({preventScroll: true}); }
            if (action === 'dismiss') { dismissed = true; setDock(false); }
        };
        controls.append(button);
    });
    document.body.append(controls);
    function buttons() {
        controls.querySelector('[data-dock=play]').textContent = player.paused() ? '▶' : 'Ⅱ';
        if (player.muted) controls.querySelector('[data-dock=mute]').setAttribute('aria-pressed', String(player.muted()));
    }
    function setDock(value) {
        if (docked === value) return;
        docked = value;
        shell.classList.toggle('is-docked', value); controls.hidden = !value;
        // Preserve the exact inline height while the same player becomes fixed.
        if (!value) shell.style.minHeight = '';
        if (player.trigger) player.trigger('resize');
    }
    function update() {
        var audioOnly = typeof video_data !== 'undefined' && video_data.params && video_data.params.listen;
        var blocked = !desktop.matches || dismissed || !started || document.fullscreenElement ||
            document.pictureInPictureElement || (player.isFullscreen && player.isFullscreen()) || audioOnly;
        var rect = shell.getBoundingClientRect();
        var out = rect.bottom <= 96;
        if (!blocked && out && !docked) shell.style.minHeight = shell.offsetHeight + 'px';
        setDock(!blocked && out);
    }
    var scheduled = false;
    function schedule() {
        if (scheduled) return;
        scheduled = true; requestAnimationFrame(function () { scheduled = false; update(); });
    }
    player.on('play', function () { started = true; buttons(); schedule(); });
    player.on('pause', buttons);
    player.on('volumechange', buttons);
    player.on('fullscreenchange', schedule);
    player.on('dispose', function () { controls.remove(); window.removeEventListener('scroll', schedule); });
    window.addEventListener('scroll', schedule, {passive: true});
    window.addEventListener('resize', schedule);
    document.addEventListener('fullscreenchange', schedule);
    document.addEventListener('enterpictureinpicture', schedule, true);
    document.addEventListener('leavepictureinpicture', schedule, true);
    if (desktop.addEventListener) desktop.addEventListener('change', schedule);
    buttons();
    update();
})();
