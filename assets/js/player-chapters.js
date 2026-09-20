'use strict';
(function () {
    if (!player.el) return;
    var root = player.el(), bar = root.querySelector('.vjs-progress-holder');
    if (!bar) return;
    var progress = bar.closest('.vjs-progress-control') || bar;
    var chapters = [], segments = [], labels = player_data.sponsorblock.labels;
    function element(parent, name) {
        var node = document.createElement('div');
        node.className = name; parent.appendChild(node); return node;
    }
    var ticks = element(bar, 'chapter-markers'), tooltip = element(root, 'chapter-tooltip');
    var sponsor = element(tooltip, ''), title = element(tooltip, '');
    title.dir = 'auto';
    var pointerTime = null, focused = false;
    tooltip.id = 'chapter-tooltip';
    bar.setAttribute('aria-describedby', tooltip.id);
    function hide() {
        tooltip.hidden = true;
    }
    function show(time) {
        var duration = player.duration();
        if (!(duration > 0 && Number.isFinite(duration))) return hide();
        var chapter = chapters.findLast((c) => c.start <= time);
        var names = [...new Set(segments.filter((s) => s.start <= time && time < s.end)
            .map((s) => labels[s.category]))];
        title.textContent = chapter ? chapter.title : '';
        sponsor.textContent = names.join(', ');
        if (!chapter && !names.length) { hide(); return; }
        tooltip.hidden = false;
        var bounds = root.getBoundingClientRect(), track = bar.getBoundingClientRect();
        var preview = root.querySelector('.vjs-vtt-thumbnail-display');
        var top = track.top - 28;
        if (preview && preview.offsetHeight && getComputedStyle(preview).opacity !== '0') top = Math.min(top, preview.getBoundingClientRect().top);
        tooltip.style.bottom = (bounds.bottom - top + 8) + 'px';
        var center = track.left - bounds.left + time / duration * track.width;
        tooltip.style.left = Math.max(4, Math.min(bounds.width - tooltip.offsetWidth - 4, center - tooltip.offsetWidth / 2)) + 'px';
    }
    function refresh() {
        if (pointerTime !== null) show(pointerTime);
        else if (focused) show(player.currentTime());
    }
    function render() {
        var duration = player.duration();
        chapters = player_data.chapters.filter(function (c) {
            return Number.isFinite(duration) && c.start >= 0 && c.start < duration;
        });
        if (chapters.length < 2) chapters = [];
        ticks.textContent = '';
        chapters.forEach(function (c) {
            element(ticks, 'chapter-marker').style.left = 100 * c.start / duration + '%';
        });
        hide(); refresh();
    }
    function move(e) {
        var point = e.touches ? e.touches[0] : e;
        var bounds = bar.getBoundingClientRect();
        pointerTime = Math.max(0, Math.min(1, (point.clientX - bounds.left) / bounds.width)) * player.duration();
        requestAnimationFrame(refresh);
    }
    function leave() { pointerTime = null; hide(); if (focused) refresh(); }
    function receive(e) { segments = e.segments; refresh(); }
    var mouseListeners = {mousemove: move, mouseleave: leave};
    var barListeners = {focus: function () { focused = true; refresh(); }, blur: function () { focused = false; leave(); },
        touchstart: move, touchmove: move, touchend: leave, touchcancel: leave};
    Object.keys(mouseListeners).forEach((name) => progress.addEventListener(name, mouseListeners[name]));
    Object.keys(barListeners).forEach((name) => bar.addEventListener(name, barListeners[name]));
    var events = {sponsorblocksegments: receive, loadedmetadata: render, durationchange: render,
        timeupdate: refresh, seeked: refresh, playerresize: refresh};
    Object.keys(events).forEach((name) => player.on(name, events[name]));
    player.on('dispose', function () {
        Object.keys(mouseListeners).forEach((name) => progress.removeEventListener(name, mouseListeners[name]));
        Object.keys(barListeners).forEach((name) => bar.removeEventListener(name, barListeners[name]));
        Object.keys(events).forEach((name) => player.off(name, events[name]));
    });
    render();
}());
