'use strict';
(function () {
    var config = JSON.parse(document.getElementById('player_data').textContent).sponsorblock;
    if (!config || !config.enabled || !Object.keys(config.modes).some(function (key) { return config.modes[key] !== 'disabled'; })) return;
    var segments = [], active = null, dismissed = new Set(), bypassedAuto = new Set(), timer, disposed = false, seeking = false;
    var root = player.el();
    var overlay = document.createElement('div');
    overlay.className = 'sb-overlay';
    var label = document.createElement('span');
    var skip = document.createElement('button');
    skip.type = 'button'; skip.textContent = config.skip;
    skip.className = 'sb-skip'; skip.setAttribute('aria-label', config.skip);
    var remaining = document.createElement('span');
    var close = document.createElement('button');
    close.type = 'button'; close.textContent = '×'; close.setAttribute('aria-label', config.dismiss);
    overlay.append(label, skip, remaining, close); root.appendChild(overlay);
    var notice = document.createElement('div');
    notice.className = 'sb-overlay sb-notice'; notice.setAttribute('role', 'status');
    root.appendChild(notice);
    var ranges = document.createElement('div'); ranges.className = 'sb-ranges';
    function limit() {
        var duration = player.duration();
        if (!Number.isFinite(duration) || duration <= 0) return 0;
        var end = video_data.params.video_end;
        return end > 0 ? Math.min(duration, end) : duration;
    }
    function hide() { active = null; overlay.classList.remove('sb-visible'); }
    function seek(end) {
        hide(); seeking = true;
        if (end >= limit() && player.loop()) {
            var start = Math.max(0, video_data.params.video_start || 0);
            // A segment covering the entire loop must not cause repeated seeks.
            segments.forEach(function (s) {
                if (s.start <= start && start < s.end) bypassedAuto.add(s.id);
            });
            player.currentTime(start);
        } else {
            player.currentTime(end);
            if (video_data.params.video_end > 0 && end >= limit()) player.pause();
        }
        seeking = false;
    }
    function manualSkip() {
        if (active) { var end = Math.min(active.end, limit()); if (end > player.currentTime()) seek(end); }
    }
    skip.addEventListener('click', manualSkip);
    close.addEventListener('click', function () { if (active) dismissed.add(active.id); hide(); });
    function keydown(e) {
        if (e.key !== 'Enter' || !active || e.repeat || e.defaultPrevented || e.isComposing || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey ||
            e.target.isContentEditable || e.target.closest('input, textarea, select, button, a, summary, [role="slider"], [role="menu"], dialog, [contenteditable="true"]') ||
            document.querySelector('dialog[open], .video-context[open], .vjs-menu-button-popup.vjs-menu-button-active')) return;
        e.preventDefault(); manualSkip();
    }
    window.addEventListener('keydown', keydown);
    function render() {
        var duration = player.duration(), bar = root.querySelector('.vjs-progress-holder');
        if (!bar || !Number.isFinite(duration) || duration <= 0) return;
        if (!ranges.parentNode) bar.appendChild(ranges);
        ranges.textContent = '';
        segments.forEach(function (s) {
            if (s.start >= duration) return;
            var marker = document.createElement('span'); marker.className = 'sb-range';
            marker.style.left = (100 * s.start / duration) + '%';
            marker.style.width = (100 * (Math.min(s.end, duration) - s.start) / duration) + '%';
            marker.style.backgroundColor = config.colors[s.category];
            marker.setAttribute('aria-label', config.labels[s.category]);
            ranges.appendChild(marker);
        });
    }
    function update() {
        if (disposed || seeking) return;
        var time = player.currentTime(), endLimit = limit();
        if (!endLimit || time >= endLimit) { hide(); return; }
        segments.forEach(function (s) { if (time < s.start || time >= s.end) { dismissed.delete(s.id); bypassedAuto.delete(s.id); } });
        var current = segments.filter(function (s) { return s.start <= time && time < s.end; });
        var autos = current.filter(function (s) { return config.modes[s.category] === 'auto' && !bypassedAuto.has(s.id); });
        if (autos.length) {
            var end = Math.max.apply(null, autos.map(function (s) { return s.end; }));
            var names = new Set(autos.map(function (s) { return config.labels[s.category]; }));
            // Expand through all touching/overlapping automatic ranges.
            var changed = true;
            while (changed) {
                changed = false;
                segments.forEach(function (s) {
                    if (config.modes[s.category] === 'auto' && !bypassedAuto.has(s.id) && s.start <= end && s.end > time) {
                        names.add(config.labels[s.category]);
                        if (s.end > end) { end = s.end; changed = true; }
                    }
                });
            }
            end = Math.min(end, endLimit);
            if (end > time) {
                seek(end);
                notice.textContent = config.skipped + ' ' + Array.from(names).join(', ');
                notice.classList.add('sb-visible'); clearTimeout(timer);
                timer = setTimeout(function () { notice.classList.remove('sb-visible'); }, 3000);
            }
            return;
        }
        active = current.filter(function (s) { return config.modes[s.category] === 'manual' && !dismissed.has(s.id); })
            .sort(function (a, b) { return a.end - b.end || a.start - b.start; })[0] || null;
        if (!active) { hide(); return; }
        label.textContent = config.labels[active.category];
        label.style.color = config.colors[active.category];
        remaining.textContent = Math.ceil(Math.min(active.end, endLimit) - time) + 's';
        overlay.classList.add('sb-visible');
    }
    ['timeupdate', 'seeked', 'play', 'loadedmetadata', 'durationchange'].forEach(function (event) { player.on(event, update); });
    player.on('loadedmetadata', render); player.on('durationchange', render);
    player.on('ended', hide);
    player.on('dispose', function () { disposed = true; clearTimeout(timer); window.removeEventListener('keydown', keydown); });
    helpers.xhr('GET', '/api/v1/sponsorblock/' + encodeURIComponent(video_data.id), {responseType: 'json'}, {
        on200: function (response) {
            if (disposed) return;
            segments = (response && Array.isArray(response.segments) ? response.segments : []).filter(function (s) {
                return Object.prototype.hasOwnProperty.call(config.modes, s.category) && config.modes[s.category] !== 'disabled' &&
                    Number.isFinite(s.start) && Number.isFinite(s.end) && s.start >= 0 && s.end > s.start;
            });
            render(); update();
        }
    });
}());
