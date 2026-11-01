'use strict';
(function () {
    var node = document.getElementById('player_data'), storage = window.InvidiousStorage;
    if (!node || !storage || typeof player === 'undefined' || typeof player.el !== 'function' || window.InvidiousSponsorBlock) return;
    var initial = storage.sponsorblock(JSON.parse(node.textContent).sponsorblock, video_data.channel_id, video_data.live_now), config;
    var segments = [], active = null, dismissed = new Set(), bypassedAuto = new Set(), timer, disposed = false, seeking = false;
    var allSegments = [], loaded = false, readFailed = false, pending = null, epoch = 0, activePage = true, suspended = false, managed = false, mounted = false, state = 'disabled';
    var categories = ['sponsor','selfpromo','interaction','intro','outro','preview','music_offtopic','filler'], life = new AbortController();
    // Page-local history: replayed automatic segments use the manual controls.
    var skippedAuto = new Set();
    var root = player.el();
    var overlay = document.createElement('div');
    overlay.className = 'sb-overlay';
    var label = document.createElement('span');
    var skip = document.createElement('button');
    skip.type = 'button'; skip.className = 'sb-skip';
    var remaining = document.createElement('span');
    var close = document.createElement('button');
    close.type = 'button'; close.className = 'sb-close';
    var symbol = document.createElementNS('http://www.w3.org/2000/svg','svg'), use = document.createElementNS('http://www.w3.org/2000/svg','use');
    symbol.setAttribute('width','20'); symbol.setAttribute('height','20'); symbol.setAttribute('aria-hidden','true');
    symbol.setAttribute('viewBox','0 0 24 24'); symbol.setAttribute('fill','none'); symbol.setAttribute('stroke','currentColor');
    symbol.setAttribute('stroke-width','2'); symbol.setAttribute('stroke-linecap','round'); symbol.setAttribute('stroke-linejoin','round'); symbol.setAttribute('focusable','false'); symbol.classList.add('ui-icon');
    use.setAttribute('href',JSON.parse(node.textContent).icon_sprite+'#x'); symbol.append(use); close.append(symbol);
    overlay.append(label, skip, remaining, close);
    var notice = document.createElement('div');
    notice.className = 'sb-overlay sb-notice'; notice.setAttribute('role', 'status');
    var ranges = document.createElement('div'); ranges.className = 'sb-ranges';
    function usable() { return activePage && !disposed && root.isConnected && (!player.isDisposed || !player.isDisposed()) && storage.isCurrent(); }
    function enabled() { return usable() && !suspended && config && config.enabled && !video_data.live_now && categories.some(function (category) { return config.modes[category] !== 'disabled'; }); }
    function setState(value) { if (state === value) return; state = value; if (!player.isDisposed || !player.isDisposed()) player.trigger('sponsorblockstatechange'); }
    function cancelRequest() { epoch++; if (pending) { clearTimeout(pending.timer); pending.controller.abort(); pending = null; } }
    function canonical(value) {
        if (!value || typeof value.enabled !== 'boolean' || !value.modes || !value.colors || !value.labels ||
            ['skip','skipped','dismiss'].some(function (key) { return typeof value[key] !== 'string' || !value[key] || value[key].length > 500; }) ||
            categories.some(function (category) { return value.modes[category] !== undefined && !['auto','manual','marker','disabled'].includes(value.modes[category]) || !/^#[a-f0-9]{6}$/i.test(value.colors[category]) || typeof value.labels[category] !== 'string' || !value.labels[category] || value.labels[category].length > 500; })) return;
        var modes = {}; categories.forEach(function (category) { modes[category] = value.modes[category] || 'disabled'; });
        return {enabled:value.enabled,modes:modes,colors:Object.assign({},value.colors),labels:Object.assign({},value.labels),skip:value.skip,skipped:value.skipped,dismiss:value.dismiss};
    }
    function mount() { if (mounted) return; mounted = true; root.append(overlay,notice); }
    function publish() {
        segments = enabled() ? allSegments.filter(function (segment) { return config.modes[segment.category] !== 'disabled'; }) : [];
        if (!player.isDisposed || !player.isDisposed()) player.trigger({type:'sponsorblocksegments',segments:segments});
        render(); update();
    }
    function clipEditing() { return document.body.dataset.clipEditing === 'true'; }
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
        if (!enabled() || clipEditing()) return;
        if (active) { var end = Math.min(active.end, limit()); if (end > player.currentTime()) seek(end); }
    }
    skip.addEventListener('click', manualSkip, {signal:life.signal});
    close.addEventListener('click', function () { if (active) dismissed.add(active.id); hide(); }, {signal:life.signal});
    function keydown(e) {
        if (e.key !== 'Enter' || !active || e.repeat || e.defaultPrevented || e.isComposing || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey ||
            e.target.isContentEditable || e.target.closest('input, textarea, select, button, a, summary, [role="slider"], [role="menu"], dialog, [contenteditable="true"]') ||
            document.querySelector('dialog[open], .video-context[open], .vjs-menu-button-popup.vjs-menu-button-active')) return;
        e.preventDefault(); manualSkip();
    }
    window.addEventListener('keydown', keydown, {signal:life.signal});
    function render() {
        if (!enabled()) { ranges.replaceChildren(); ranges.remove(); return; }
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
        if (!enabled()) { hide(); notice.classList.remove('sb-visible'); clearTimeout(timer); return; }
        if (clipEditing()) { hide(); notice.classList.remove('sb-visible'); clearTimeout(timer); return; }
        var time = player.currentTime(), endLimit = limit();
        if (!endLimit || time >= endLimit) { hide(); return; }
        segments.forEach(function (s) { if (time < s.start || time >= s.end) { dismissed.delete(s.id); bypassedAuto.delete(s.id); } });
        var current = segments.filter(function (s) { return s.start <= time && time < s.end; });
        var autos = current.filter(function (s) { return config.modes[s.category] === 'auto' && !bypassedAuto.has(s.id) && !skippedAuto.has(s.id); });
        if (autos.length) {
            var end = Math.max.apply(null, autos.map(function (s) { return s.end; }));
            var names = new Set(autos.map(function (s) { return config.labels[s.category]; }));
            var skipped = new Set(autos.map(function (s) { return s.id; }));
            // Expand through all touching/overlapping automatic ranges.
            var changed = true;
            while (changed) {
                changed = false;
                segments.forEach(function (s) {
                    if (config.modes[s.category] === 'auto' && !bypassedAuto.has(s.id) && !skippedAuto.has(s.id) && s.start <= end && s.start < endLimit && s.end > time) {
                        skipped.add(s.id);
                        names.add(config.labels[s.category]);
                        if (s.end > end) { end = s.end; changed = true; }
                    }
                });
            }
            end = Math.min(end, endLimit);
            if (end > time) {
                skipped.forEach(function (id) { skippedAuto.add(id); });
                seek(end);
                notice.textContent = config.skipped + ' ' + Array.from(names).join(', ');
                notice.classList.add('sb-visible'); clearTimeout(timer);
                timer = setTimeout(function () { notice.classList.remove('sb-visible'); }, 3000);
            }
            return;
        }
        active = current.filter(function (s) { return (config.modes[s.category] === 'manual' ||
            (config.modes[s.category] === 'auto' && skippedAuto.has(s.id))) && !dismissed.has(s.id); })
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
    function clipTransition() { update(); }
    document.addEventListener('iv:clip-preview', clipTransition, {signal:life.signal});
    async function load() {
        if (!enabled() || pending || loaded) return;
        var generation = ++epoch, controller = new AbortController(), job = pending = {controller:controller};
        readFailed = false;
        setState('loading');
        job.timer = setTimeout(function () { if (pending === job) { cancelRequest(); if (enabled()) { readFailed = true; setState('unavailable'); } } },10000);
        try {
            var response = await fetch('/api/v1/sponsorblock/'+encodeURIComponent(video_data.id), {credentials:'same-origin',signal:controller.signal});
            if (!response.ok || response.redirected) throw new Error();
            var data = await response.json();
            if (!enabled() || generation !== epoch || controller.signal.aborted) return;
            if (!data || !Array.isArray(data.segments)) throw new Error();
            var ids = new Set(); allSegments = [];
            data.segments.forEach(function (segment) {
                if (!segment || typeof segment.id !== 'string' || !segment.id || segment.id.length > 256 || ids.has(segment.id) || !categories.includes(segment.category) || !Number.isFinite(segment.start) || !Number.isFinite(segment.end) || segment.start < 0 || segment.end <= segment.start) return;
                ids.add(segment.id); allSegments.push({id:segment.id,category:segment.category,start:segment.start,end:segment.end});
            });
            loaded = true; setState('ready'); publish();
        } catch (_) { if (enabled() && generation === epoch && !controller.signal.aborted) { readFailed = true; setState('unavailable'); } }
        finally { clearTimeout(job.timer); if (pending === job) pending = null; }
    }
    function suspend() {
        suspended = true; cancelRequest(); hide(); notice.classList.remove('sb-visible'); clearTimeout(timer); publish(); setState('suspended');
    }
    function configure(value) {
        if (!usable()) return false;
        var next = canonical(value);
        if (!next) { suspend(); return false; }
        config = next; suspended = false; skip.textContent = config.skip; skip.setAttribute('aria-label',config.skip);
        close.setAttribute('aria-label',config.dismiss); close.title = config.dismiss;
        if (!enabled()) { cancelRequest(); clearTimeout(timer); publish(); setState('disabled'); return true; }
        mount(); publish();
        if (loaded) setState('ready'); else if (pending) setState('loading'); else if (readFailed) setState('unavailable'); else load();
        return true;
    }
    function dispose() {
        if (disposed) return;
        disposed = true; activePage = false; cancelRequest(); clearTimeout(timer); life.abort(); observer.disconnect();
        overlay.remove(); notice.remove(); ranges.remove(); allSegments = []; segments = []; config = null;
        skippedAuto.clear(); bypassedAuto.clear(); dismissed.clear();
        player.off(['timeupdate','seeked','play','loadedmetadata','durationchange'],update);
        player.off(['loadedmetadata','durationchange'],render); player.off('ended',hide); player.off('dispose',dispose);
        if (!player.isDisposed || !player.isDisposed()) player.trigger({type:'sponsorblocksegments',segments:[]});
        state = 'disabled'; if (window.InvidiousSponsorBlock === api) delete window.InvidiousSponsorBlock;
    }
    window.addEventListener('pagehide',function (event) { activePage = false; suspend(); if (!event.persisted) dispose(); },{signal:life.signal});
    window.addEventListener('pageshow',function () { activePage = !disposed; if (!usable()) return; if (!managed && config) configure(config); },{signal:life.signal});
    window.addEventListener('browserprofilechange',dispose,{signal:life.signal});
    var observer = new MutationObserver(function () { if (!root.isConnected) dispose(); }); observer.observe(document.body,{childList:true,subtree:true});
    var api = window.InvidiousSponsorBlock = {configure:configure,suspend:suspend,dispose:dispose,readState:function () { return state; },setManaged:function () { managed = true; },retry:function () { if (state === 'unavailable') load(); }};
    player.on('dispose',dispose); configure(initial);
}());
