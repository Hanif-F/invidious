'use strict';
// Refresh supporting presentation on the current player. Queue occurrences and
// media state remain owned by watch.js; this module never fetches a playlist.
(function () {
    var ui = window.InvidiousUI, storage = window.InvidiousStorage, settings = document.getElementById('watch-enhancements-config');
    if (!ui || !storage || !settings || window.InvidiousWatchEnhancements) return;
    var initial = JSON.parse(settings.textContent), acceptedKey = key(initial), target, targetKey, failedKey;
    var life = new AbortController(), active = true, disposed = false, epoch = 0, pending, state = 'ready', ownerKnown = true;
    var items = document.getElementById('watch-recommendation-items'), status = document.getElementById('watch-enhancements-status'), retry = document.getElementById('watch-enhancements-retry');
    var continueChoice = document.getElementById('continue'), choice = continueChoice && continueChoice.checked;
    function key(value) {
        var ai = value.ai, enabled = ai.ai_filter_enabled;
        return JSON.stringify([value.locale,value.showMemberVideos,value.showOriginalTitle,value.blockedChannels.slice().sort(),
            enabled ? ai.ai_blocklist_recommendations_action : 'off',enabled ? ai.ai_warnlist_recommendations_action : 'off',
            enabled ? ai.ai_blocklist_other_pages_action : 'off',enabled ? ai.ai_warnlist_other_pages_action : 'off']);
    }
    function current() { return active && !disposed && storage.isCurrent() && settings.isConnected; }
    function cancel() { epoch++; if (pending) pending.abort(); pending = null; }
    function controls(value) {
        state = value;
        var feedback = document.getElementById('watch-enhancements-feedback'); if (feedback) feedback.hidden = value === 'ready';
        if (items) { items.hidden = value !== 'ready'; items.setAttribute('aria-busy',String(value === 'loading')); }
        if (status) status.textContent = value === 'loading' ? ui.label('loading') : value === 'unavailable' ? ui.config.words.read_error || ui.label('error') : '';
        if (retry) retry.hidden = value !== 'unavailable';
        if (continueChoice) continueChoice.disabled = value !== 'ready' || !video_data.next_video;
        if (continueChoice) continueChoice.closest('.continue-control').hidden = !video_data.next_video;
        if (window.InvidiousWatch) InvidiousWatch.setOwnerPending(value !== 'ready',ownerKnown);
    }
    function suspend() {
        if (disposed) return;
        cancel(); ownerKnown = false;
        if (continueChoice) choice = continueChoice.checked;
        controls(window.InvidiousEnhancements && InvidiousEnhancements.readState() === 'unavailable' ? 'unavailable' : 'loading');
    }
    function titleMap(value) {
        return value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length <= 200 &&
            Object.entries(value).every(function (pair) { return /^[A-Za-z0-9_-]{11}$/.test(pair[0]) && (pair[1] === null || typeof pair[1] === 'string' && pair[1].length <= 4096); });
    }
    async function read() {
        if (!current() || !target) return;
        cancel(); controls('loading');
        var generation = epoch, controller = pending = new AbortController(), owner = target, ownerKey = targetKey;
        var titles = Array.from(document.querySelectorAll('.watch-heading [data-dearrow-id][data-title-source],.vjs-overlay [data-dearrow-id][data-title-source],#playlist [data-dearrow-id][data-title-source]'));
        var rows = Array.from(document.querySelectorAll('#playlist .queue-row'));
        var ids = Array.from(new Set(titles.map(function (element) { return element.dataset.dearrowId; }))).slice(0,200);
        var channels = Array.from(new Set(rows.map(function (row) { return row.dataset.channelId; }).filter(function (id) { return /^UC[A-Za-z0-9_-]{22}$/.test(id || ''); }))).slice(0,200);
        var url = new URL('/watch',location.origin);
        url.searchParams.set('v',video_data.id); url.searchParams.set('format','enhancements'); url.searchParams.set('owner',owner.browseFingerprint);
        if (video_data.params.listen) url.searchParams.set('listen','1');
        url.searchParams.set('ids',ids.join(',')); url.searchParams.set('channels',channels.join(','));
        function valid() { return current() && generation === epoch && !controller.signal.aborted; }
        try {
            var response = await ui.request(url.pathname+url.search,{signal:controller.signal});
            if (!valid()) return;
            if (!response || response.profile !== storage.scope || response.browseFingerprint !== owner.browseFingerprint || typeof response.recommendations !== 'string' || response.recommendations.length > 1000000 ||
                response.nextVideo !== null && (typeof response.nextVideo !== 'string' || !/^[A-Za-z0-9_-]{11}$/.test(response.nextVideo)) || !titleMap(response.titles) || Object.keys(response.titles).some(function (id) { return !ids.includes(id); }) ||
                !response.queueThumbnails || typeof response.queueThumbnails !== 'object' || Array.isArray(response.queueThumbnails) ||
                Object.entries(response.queueThumbnails).some(function (pair) { return !channels.includes(pair[0]) || typeof pair[1] !== 'string' || pair[1].length > 10000; })) throw new Error();
            var fragment = document.createElement('template'); fragment.innerHTML = response.recommendations;
            if (fragment.content.querySelector('script,video,audio,iframe,object,embed,link,style,form')) throw new Error();
            titles.forEach(function (element) {
                if (!element.isConnected) return;
                var original = owner.showOriginalTitle && response.titles[element.dataset.dearrowId] || element.dataset.titleSource;
                if (window.InvidiousSpoilers) InvidiousSpoilers.updateTitle(element,original);
            });
            rows.forEach(function (row) {
                var thumbnail = row.querySelector('[data-spoiler-thumbnail]');
                if (!thumbnail || !window.InvidiousSpoilers) return;
                var normal = document.createElement('template'), replacement = response.queueThumbnails[row.dataset.channelId];
                if (replacement) normal.innerHTML = replacement;
                else { var image = document.createElement('img'); image.src = thumbnail.dataset.spoilerOriginal; image.alt = ''; image.loading = 'lazy'; image.width = 88; image.height = 50; normal.content.append(image); }
                InvidiousSpoilers.updateThumbnail(thumbnail,normal.content);
            });
            if (items) { items.replaceChildren(fragment.content); ui.changed(items); }
            video_data.next_video = response.nextVideo;
            if (continueChoice) continueChoice.checked = !!choice;
            acceptedKey = ownerKey; failedKey = null; controls('ready');
        } catch (_) {
            if (!valid()) return;
            failedKey = ownerKey; controls('unavailable');
        } finally { if (pending === controller) pending = null; }
    }
    var api = window.InvidiousWatchEnhancements = {
        suspend:suspend,readState:function () { return state; },
        apply:function (value) {
            if (!current()) return false;
            target = value; targetKey = key(value); ownerKnown = true;
            if (acceptedKey === targetKey) { failedKey = null; controls('ready'); }
            else if (failedKey === targetKey) controls('unavailable');
            else read();
            return true;
        },
        dispose:function () { if (disposed) return; suspend(); disposed = true; active = false; life.abort(); target = null; }
    };
    if (window.InvidiousWatch) InvidiousWatch.setManaged();
    if (retry) retry.addEventListener('click',function () {
        if (!current()) return;
        failedKey = null;
        if (window.InvidiousEnhancements) InvidiousEnhancements.refresh(); else read();
    },{signal:life.signal});
    if (continueChoice) continueChoice.addEventListener('change',function () { choice = continueChoice.checked; },{signal:life.signal});
    window.addEventListener('pagehide',function (event) { active = false; suspend(); if (!event.persisted) api.dispose(); },{signal:life.signal});
    window.addEventListener('pageshow',function () { active = !disposed; },{signal:life.signal});
    window.addEventListener('browserprofilechange',api.dispose,{signal:life.signal});
    if (window.player) player.on('dispose',api.dispose);
}());
