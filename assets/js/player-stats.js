'use strict';

// Read-only diagnostics: never fetch metadata or modify playback configuration.
(function () {
    if (!window.player || typeof player.ready !== 'function') return;
    player.ready(function () {
        var root = player.el(), labels = player_data.stats_labels;
        if (!labels) return;
        var enabled = false, expanded = false, timer, opener, samples = [], last;
        var observed = 0, tick = null, stalls = 0, stalled = null, stallTime = 0, played = false;
        var mobile = typeof isMobile === 'function' && isMobile();
        var panel = document.createElement('section');
        panel.className = 'player-stats'; panel.hidden = true;
        panel.setAttribute('aria-label', labels.title);
        var header = document.createElement('header');
        var title = document.createElement('strong'); title.textContent = labels.title; header.appendChild(title);
        panel.appendChild(header);
        function button(text, action) {
            var el = document.createElement('button'); el.type = 'button'; el.textContent = text;
            el.addEventListener('click', action); header.appendChild(el); return el;
        }
        var detailButton = button(labels.details, function () { details(!expanded); });
        var closeButton = button(labels.close, function () { if (mobile && expanded) details(false); else hide(); });
        var disableButton = button(labels.disable, hide);
        var copyButton = button(labels.copy, copy);
        var list = document.createElement('dl'); panel.appendChild(list);
        var keys = ['resolution', 'frames', 'buffer', 'bandwidth', 'identity', 'viewport', 'quality', 'codecs', 'fps', 'bitrate', 'bytes', 'requests', 'state', 'stalls', 'live'];
        var cells = {};
        keys.forEach(function (key, index) {
            var row = document.createElement('div'); row.className = index > 3 ? 'stats-extra' : '';
            var dt = document.createElement('dt'); dt.textContent = labels[key] || labels.title;
            var dd = document.createElement('dd'); row.append(dt, dd); list.appendChild(row); cells[key] = dd;
        });
        var graphs = document.createElement('div'); graphs.className = 'stats-extra'; panel.appendChild(graphs);
        var help = document.createElement('details'); help.className = 'stats-extra';
        var summary = document.createElement('summary'); summary.textContent = labels.details;
        var explanation = document.createElement('p'); explanation.textContent = labels.help;
        help.append(summary, explanation); panel.appendChild(help);
        var actions = document.createElement('footer'); actions.append(copyButton, disableButton); panel.appendChild(actions);
        var status = document.createElement('div'); status.setAttribute('role', 'status'); panel.appendChild(status);
        var fallback = document.createElement('textarea'); fallback.hidden = true;
        fallback.readOnly = true; fallback.setAttribute('aria-label', labels.fallback); panel.appendChild(fallback);
        root.appendChild(panel);
        var bar = player.getChild('controlBar'), control = new (videojs.getComponent('Button'))(player);
        control.addClass('vjs-stats-control'); control.controlText(labels.title);
        control.el().setAttribute('aria-pressed', 'false');
        control.on('click', function () { toggle(control.el()); });
        bar.addChild(control, {}, bar.children().indexOf(bar.getChild('fullscreenToggle')));
        function finite(value) { return typeof value === 'number' && Number.isFinite(value); }
        function number(value) { return finite(value) ? Math.round(value * 100) / 100 : null; }
        function rangesAhead(ranges, time) {
            for (var i = 0; i < ranges.length; i++) if (ranges.start(i) <= time && time < ranges.end(i)) return ranges.end(i) - time;
            return 0;
        }
        function read() {
            var video = root.querySelector('video'), source = player.currentSource() || {};
            var tech = player.tech({IWillNotUseThisInPlugins: true}), vhs = tech && tech.vhs;
            var stats = vhs && vhs.stats, media = vhs && vhs.playlists && vhs.playlists.media();
            var attrs = media && media.attributes || {}, id;
            if (!vhs && source.src) { try { id = new URL(source.src, location.href).searchParams.get('itag'); } catch (_) {} }
            if (media) id = attrs.NAME || (media.id && String(media.id));
            var format = (player_data.stats_formats || []).find(function (f) { return id != null && String(f.itag) === String(id); }) || {};
            var time = player.currentTime(), quality;
            try { quality = video && video.getVideoPlaybackQuality && video.getVideoPlaybackQuality(); } catch (_) {}
            var data = {}, reasons = {};
            function set(key, value, pending) {
                data[key] = value == null ? null : value;
                if (value == null) reasons[key] = pending ? labels.waiting : labels.unavailable;
            }
            var ready = video && video.readyState > 0;
            set('resolution', video && video.videoWidth ? video.videoWidth + ' × ' + video.videoHeight : null, !ready);
            set('identity', video_data.id + ' / ' + (video_data.params.listen ? 'audio-only' : /dash/i.test(source.type || '') ? 'DASH' : /mpegurl/i.test(source.type || '') ? 'HLS' : 'progressive'));
            set('viewport', Math.round(root.clientWidth) + ' × ' + Math.round(root.clientHeight) + ' / ' + window.devicePixelRatio);
            set('quality', vhs ? (attrs.RESOLUTION ? attrs.RESOLUTION.width + ' × ' + attrs.RESOLUTION.height : format.height ? format.height + 'p' : null) : source.label || null, !ready);
            // Only use active playlist or exactly matched format metadata.
            var codecMatch = (format.mimeType || '').match(/codecs="([^"]+)"/);
            set('codecs', attrs.CODECS || (codecMatch ? codecMatch[1] : null), !ready);
            set('fps', number(format.fps || attrs['FRAME-RATE']), !ready);
            set('bitrate', number(format.bitrate || attrs.BANDWIDTH), !ready);
            set('frames', quality ? quality.droppedVideoFrames + ' / ' + quality.totalVideoFrames + ' (' + (quality.totalVideoFrames ? number(100 * quality.droppedVideoFrames / quality.totalVideoFrames) : 0) + '%)' : null);
            set('buffer', ready ? number(rangesAhead(player.buffered(), time)) : null, !ready);
            set('bandwidth', stats && stats.mediaBytesTransferred > 0 && stats.mediaTransferDuration > 0 ? number(stats.bandwidth / 1000000) : null, !!stats);
            set('bytes', stats ? number(stats.mediaBytesTransferred) : null);
            set('requests', stats ? [stats.mediaRequests, stats.mediaRequestsErrored, stats.mediaRequestsTimedout, stats.mediaRequestsAborted].map(function (n) { return finite(n) ? n : '—'; }).join(' / ') : null);
            var error = player.error();
            set('state', [number(time), player.playbackRate() + 'x', Math.round(player.volume() * 100) + '%', String(player.muted()), error && finite(error.code) ? error.code : 0].join(' / '));
            set('stalls', stalls + ' / ' + number((stallTime + (stalled === null ? 0 : performance.now() - stalled)) / 1000));
            var seekable = player.seekable();
            set('live', video_data.live_now && seekable.length ? number(Math.max(0, seekable.end(seekable.length - 1) - time)) : null);
            return {version: 1, videoId: video_data.id, playerVersion: videojs.VERSION,
                mode: video_data.params.listen ? 'audio-only' : /dash/i.test(source.type || '') ? 'DASH' : /mpegurl/i.test(source.type || '') ? 'HLS' : 'progressive',
                observationSeconds: number(observed / 1000), metrics: data, availabilityReasons: reasons};
        }
        function graph(key) {
            var container = document.createElement('div'), caption = document.createElement('span'); caption.textContent = labels[key]; container.appendChild(caption);
            var ns = 'http://www.w3.org/2000/svg', svg = document.createElementNS(ns, 'svg');
            svg.setAttribute('viewBox', '0 0 300 40'); svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', labels[key]);
            var maximum = Math.max(1, ...samples.map(function (s) { return s[key] || 0; })), segment = [];
            function flush() { if (segment.length) { var line = document.createElementNS(ns, 'polyline'); line.setAttribute('points', segment.join(' ')); svg.appendChild(line); segment = []; } }
            samples.forEach(function (s) { if (s[key] == null) flush(); else segment.push(Math.max(0, 300 - (performance.now() - s.at) / 200) + ',' + (38 - s[key] / maximum * 36)); }); flush();
            container.appendChild(svg); return container;
        }
        function sample() {
            if (!enabled || document.hidden) return;
            var now = performance.now(); if (tick !== null) observed += now - tick; tick = now;
            last = read(); keys.forEach(function (key) { cells[key].textContent = last.metrics[key] == null ? (last.availabilityReasons[key] === labels.waiting ? labels.waiting : labels.unavailable.split(' — ')[0]) : last.metrics[key]; cells[key].title = last.availabilityReasons[key] || ''; });
            samples = samples.filter(function (s) { return now - s.at < 60000; });
            samples.push({at: now, buffer: last.metrics.buffer, bandwidth: last.metrics.bandwidth}); if (samples.length > 60) samples.shift();
            if (expanded) graphs.replaceChildren(graph('buffer'), graph('bandwidth'));
        }
        function endStall() { if (stalled !== null) { stallTime += performance.now() - stalled; stalled = null; } }
        function stop() { if (tick !== null) observed += performance.now() - tick; clearInterval(timer); timer = null; tick = null; endStall(); }
        function start() { stop(); if (samples.length) { samples.push({at: performance.now(), buffer: null, bandwidth: null}); if (samples.length > 60) samples.shift(); } if (enabled && !document.hidden) { sample(); timer = setInterval(sample, 1000); } }
        function details(value) {
            expanded = value; panel.classList.toggle('stats-expanded', value);
            detailButton.hidden = value; detailButton.setAttribute('aria-expanded', String(value)); disableButton.hidden = !value; copyButton.hidden = !value;
            if (value) { graphs.replaceChildren(graph('buffer'), graph('bandwidth')); closeButton.focus(); } else detailButton.focus();
        }
        function show(origin) {
            if (enabled) return; opener = origin || document.activeElement; enabled = true; panel.hidden = false;
            control.el().setAttribute('aria-pressed', 'true'); details(false); start();
        }
        function hide() { enabled = false; panel.hidden = true; stop(); control.el().setAttribute('aria-pressed', 'false'); if (opener && opener.isConnected) opener.focus(); }
        function toggle(origin) { if (enabled) hide(); else show(origin); }
        async function copy() {
            var text = JSON.stringify(read(), null, 2);
            try { await navigator.clipboard.writeText(text); status.textContent = labels.copied; }
            catch (_) { fallback.hidden = false; fallback.value = text; fallback.focus(); fallback.select(); }
        }
        function visibility() { if (document.hidden) stop(); else start(); }
        function reset() { samples = []; observed = stalls = stallTime = 0; stalled = null; played = false; tick = null; fallback.hidden = true; status.textContent = ''; }
        function suspend() { played = false; endStall(); }
        function playing() { played = true; endStall(); }
        function waiting() { if (enabled && !document.hidden && played && !player.paused() && !player.seeking() && stalled === null) { stalls++; stalled = performance.now(); } }
        panel.addEventListener('keydown', function (e) { e.stopPropagation(); if (e.key === 'Escape') { e.preventDefault(); if (expanded) details(false); else hide(); } });
        ['click', 'touchstart', 'touchmove', 'touchend', 'dblclick'].forEach(function (name) { panel.addEventListener(name, function (e) { e.stopPropagation(); }); });
        document.addEventListener('visibilitychange', visibility);
        player.on('loadstart', reset); player.on('playing', playing); player.on('waiting', waiting);
        player.on(['pause', 'seeking', 'ended', 'error'], suspend);
        player.statsForNerds = {show: show, hide: hide, toggle: toggle, details: details, snapshot: read};
        player.on('dispose', function () { stop(); document.removeEventListener('visibilitychange', visibility); panel.remove(); delete player.statsForNerds; });
    });
}());
