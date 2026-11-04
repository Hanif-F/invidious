'use strict';
// Own only this document's next-item read and ended navigation. Media remains in
// the existing player; a late read can never revive a retired page/player.
(function () {
    var node = document.getElementById('video_data'), config = document.getElementById('embed-config');
    var ui = window.InvidiousUI, storage = window.InvidiousStorage, media = window.player;
    if (!node || node.dataset.embedInitialized || !ui || !storage || !media) return;
    node.dataset.embedInitialized = 'true';
    var data = JSON.parse(node.textContent), words = config ? JSON.parse(config.textContent) : {};
    var life = new AbortController(), active = true, disposed = false, started = false;
    var pending, epoch = 0, ended, next, status = document.getElementById('embed-status');
    [status,document.getElementById('ui-notice')].forEach(function (notice) { if (notice) media.el().append(notice); });
    var series = Array.isArray(data.video_series) ? data.video_series.slice() : [];
    function validID(id) { return typeof id === 'string' && /^[A-Za-z0-9_-]{11}$/.test(id); }
    function validCursor(value) {
        if (Number.isSafeInteger(value)) return value >= 0;
        if (typeof value !== 'string' || !/^[0-9]{1,19}$/.test(value)) return false;
        var decimal = value.replace(/^0+(?=\d)/,'');
        return decimal.length < 19 || decimal <= '9223372036854775807';
    }
    function current() { return active && !disposed && storage.isCurrent() && !media.isDisposed() && media.el().isConnected; }
    function detach() { if (ended) media.off('ended',ended); ended = null; next = null; }
    function cancel() { epoch++; if (pending) pending.abort(); pending = null; detach(); }
    function clearStatus() { if (status) { status.hidden = true; status.replaceChildren(); } }
    function failure() {
        if (!current() || !status) return;
        status.replaceChildren(document.createTextNode(words.queue_failed || 'Could not load the next playlist item. Retry to check again.'));
        var retry = document.createElement('button'); retry.type = 'button'; retry.className = 'button'; retry.textContent = words.queue_retry || 'Retry playlist continuation';
        retry.addEventListener('click',read,{signal:life.signal}); status.append(retry); status.hidden = false;
    }
    function destination(item) {
        var url = new URL('/embed/'+item.id,location.origin), params = data.params;
        if (data.plid) {
            url.searchParams.set('list',data.plid);
            if (!data.plid.startsWith('RD')) url.searchParams.set('index',item.index);
        } else if (series.length > 1) url.searchParams.set('playlist',series.slice(1).join(','));
        if (params.autoplay || params.continue_autoplay) url.searchParams.set('autoplay','1');
        // Preserve the current playback choices even if account defaults changed
        // while this cached document was away. Do not carry unrelated URL fields.
        ['listen','speed','local'].forEach(function (key) { url.searchParams.set(key,String(params[key])); });
        return url.pathname+url.search;
    }
    function arm(item) {
        if (!current() || !item || data.clip || data.params.video_loop) return;
        detach(); next = item;
        ended = function () {
            if (!current() || !next) return;
            var target = destination(next); suspend(); location.assign(target);
        };
        media.on('ended',ended);
    }
    async function read() {
        if (!current() || data.clip || data.params.video_loop) return;
        cancel(); clearStatus();
        if (!data.plid) { if (series.length && series.every(validID)) arm({id:series[0]}); return; }
        var generation = epoch, request = pending = new AbortController();
        var mix = data.plid.startsWith('RD');
        var query = new URLSearchParams({continuation:data.id,format:'html',hl:data.preferences.locale});
        if (!mix) query.set('index',String(data.index));
        try {
            var result = await ui.request('/api/v1/'+(mix?'mixes/':'playlists/')+encodeURIComponent(data.plid)+'?'+query,{signal:request.signal});
            if (!current() || generation !== epoch || request.signal.aborted) return;
            if (!result || typeof result !== 'object' || Array.isArray(result) || !Object.prototype.hasOwnProperty.call(result,'nextVideo')) throw new Error();
            if (result.nextVideo === null || result.nextVideo === '') return;
            if (!validID(result.nextVideo)) throw new Error();
            // Decimal strings stay strings, including native occurrence-sized
            // cursors; converting through Number would lose valid precision.
            if (!mix && !validCursor(result.index)) throw new Error();
            arm({id:result.nextVideo,index:result.index});
        } catch (_) {
            if (current() && generation === epoch && !request.signal.aborted) failure();
        } finally { if (pending === request) pending = null; }
    }
    function suspend() { active = false; cancel(); clearStatus(); }
    function dispose() {
        if (disposed) return;
        suspend(); disposed = true; life.abort(); media.off('dispose',dispose);
    }
    function start() { if (started || disposed) return; started = true; read(); }
    window.InvidiousEmbed = {suspend:suspend,dispose:dispose};
    window.addEventListener('load',start,{once:true,signal:life.signal});
    window.addEventListener('pagehide',function (event) { suspend(); if (!event.persisted) dispose(); },{signal:life.signal});
    window.addEventListener('pageshow',function (event) { if (!disposed && storage.isCurrent()) { active = true; if (event.persisted) read(); } },{signal:life.signal});
    window.addEventListener('browserprofilechange',dispose,{signal:life.signal});
    media.on('dispose',dispose);
    if (document.readyState === 'complete') start();
})();
