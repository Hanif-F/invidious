'use strict';
// One canonical read for a document's enhancement owners. Change messages are
// hints only; settings and guest-local rules never travel through that channel.
(function () {
    var ui = window.InvidiousUI, storage = window.InvidiousStorage;
    if (!ui || !storage || window.InvidiousEnhancements) return;
    var consumers = new Map(), changes = new Set(), life = new AbortController();
    var active = true, disposed = false, timer, pending, pendingKinds = [], epoch = 0, state = 'initial', accepted, acceptedKinds = [], failureNotice, failureRetry;
    var categories = ['sponsor','selfpromo','interaction','intro','outro','preview','music_offtopic','filler'];
    var blurred = false, hidden = document.visibilityState === 'hidden';
    var maskingLabels = ['title_hidden','title_hidden_unknown','thumbnail_hidden','thumbnail_hidden_unknown','reveal_title','reveal_thumbnail','hide_title','next_original','next_dearrow','loading'];
    function object(value) { return !!value && typeof value === 'object' && !Array.isArray(value); }
    function string(value) { return typeof value === 'string' && value.length > 0 && value.length <= 500; }
    function hash(value) { return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value); }
    function channel(value) { return /^UC[A-Za-z0-9_-]{22}$/.test(value); }
    function mode(value) { return ['auto','manual','marker','disabled'].includes(value); }
    function labels(value, keys) {
        if (!object(value) || keys.some(function (key) { return !string(value[key]); })) throw new Error();
        return Object.fromEntries(keys.map(function (key) { return [key,value[key]]; }));
    }
    function map(value, check) {
        if (!object(value) || Object.keys(value).length > 1000) throw new Error();
        var result = Object.create(null);
        Object.keys(value).forEach(function (id) { if (!channel(id)) throw new Error(); result[id] = check(value[id]); });
        return result;
    }
    function validate(raw) {
        if (!object(raw) || !hash(raw.fingerprint) || !Number.isSafeInteger(raw.now) || raw.now < 1104537600 || !object(raw.state)) throw new Error();
        var value = raw.state;
        if (value.version !== 1 || value.profile !== storage.scope || value.account !== (storage.scope !== 'guest') ||
            value.account !== ui.config.signedIn || typeof value.locale !== 'string' || !/^[A-Za-z0-9_-]{2,30}$/.test(value.locale) ||
            !hash(value.browseFingerprint) || !hash(value.historyFingerprint) || typeof value.showMemberVideos !== 'boolean' || typeof value.showOriginalTitle !== 'boolean' ||
            !Array.isArray(value.blockedChannels) || value.blockedChannels.length > 100000 || value.blockedChannels.some(function (id) { return typeof id !== 'string' || !channel(id); })) throw new Error();
        var ai = value.ai, cleanAI = {};
        if (!object(ai) || typeof ai.ai_filter_enabled !== 'boolean') throw new Error();
        cleanAI.ai_filter_enabled = ai.ai_filter_enabled;
        ['blocklist','warnlist'].forEach(function (list) {
            ['feeds','search','recommendations','other_pages'].forEach(function (group) {
                var field = 'ai_'+list+'_'+group+'_action', action = ai[field];
                if (!(group === 'other_pages' ? ['off','replace_thumbnail'] : ['off','hide','replace_thumbnail']).includes(action)) throw new Error();
                cleanAI[field] = action;
            });
        });
        var dearrow = value.dearrow, masking = value.masking, sb = value.sponsorblock;
        if (!object(dearrow) || typeof dearrow.enabled !== 'boolean' || typeof dearrow.showOriginal !== 'boolean' || !string(dearrow.originalLabel) ||
            !object(masking) || !object(sb) || typeof sb.enabled !== 'boolean' || !object(sb.modes) || !object(sb.colors) ||
            categories.some(function (category) { return !mode(sb.modes[category]) || typeof sb.colors[category] !== 'string' || !/^#[a-f0-9]{6}$/i.test(sb.colors[category]); }) ||
            !string(sb.skip) || !string(sb.skipped) || !string(sb.dismiss)) throw new Error();
        var rules = map(masking.rules,function (rule) {
            if (!object(rule) || typeof rule.hide_title !== 'boolean' || typeof rule.hide_thumbnail !== 'boolean' ||
                rule.reveal_after_days !== null && (!Number.isInteger(rule.reveal_after_days) || rule.reveal_after_days < 1 || rule.reveal_after_days > 2147483647)) throw new Error();
            return {hide_title:rule.hide_title,hide_thumbnail:rule.hide_thumbnail,reveal_after_days:rule.reveal_after_days};
        });
        var overrides = map(sb.overrides,function (entry) {
            if (!object(entry) || entry.enabled !== null && typeof entry.enabled !== 'boolean' || !object(entry.modes) || Object.keys(entry.modes).some(function (key) { return !categories.includes(key) || !mode(entry.modes[key]); })) throw new Error();
            return {enabled:entry.enabled,modes:Object.assign({},entry.modes)};
        });
        if (!value.account && (value.blockedChannels.length || Object.keys(rules).length || Object.keys(overrides).length)) throw new Error();
        return freeze({fingerprint:raw.fingerprint,now:raw.now,state:{
            version:1,profile:value.profile,account:value.account,locale:value.locale,browseFingerprint:value.browseFingerprint,historyFingerprint:value.historyFingerprint,
            showMemberVideos:value.showMemberVideos,showOriginalTitle:value.showOriginalTitle,
            blockedChannels:Array.from(new Set(value.blockedChannels)).sort(),ai:cleanAI,
            dearrow:{enabled:dearrow.enabled,showOriginal:dearrow.showOriginal,originalLabel:dearrow.originalLabel},
            masking:{rules:rules,labels:labels(masking.labels,maskingLabels)},
            sponsorblock:{enabled:sb.enabled,modes:labels(sb.modes,categories),colors:labels(sb.colors,categories),overrides:overrides,labels:labels(sb.labels,categories),skip:sb.skip,skipped:sb.skipped,dismiss:sb.dismiss}
        }});
    }
    function freeze(value) {
        if (object(value) || Array.isArray(value)) { Object.values(value).forEach(freeze); Object.freeze(value); }
        return value;
    }
    function current() { return active && !disposed && storage.isCurrent(); }
    function setState(value) {
        if (state === value) return;
        state = value; document.dispatchEvent(new CustomEvent('iv:enhancements-state',{detail:{state:value}}));
    }
    function clearFailure() {
        if (failureNotice && failureRetry && failureNotice.contains(failureRetry)) ui.dismissNotice();
        failureNotice = failureRetry = null;
    }
    function suspend() { consumers.forEach(function (consumer) { try { if (consumer.suspend) consumer.suspend(); } catch (_) {} }); }
    function cancel() {
        epoch++; clearTimeout(timer); timer = null;
        if (pending) { pendingKinds.forEach(function (kind) { changes.add(kind); }); pending.abort(); pending = null; pendingKinds = []; }
    }
    function context(snapshot, kinds, previous) { return freeze({now:snapshot.now,kinds:kinds.slice(),unchanged:!!previous && previous.fingerprint === snapshot.fingerprint}); }
    async function read() {
        timer = null;
        if (!current()) return;
        var generation = ++epoch, request = pending = new AbortController(), kinds = Array.from(changes);
        pendingKinds = kinds;
        changes.clear(); setState('loading');
        try {
            var raw = await ui.request('/preferences?format=runtime',{signal:request.signal});
            if (!current() || generation !== epoch || request.signal.aborted) return;
            var snapshot = validate(raw), detail = context(snapshot,kinds,accepted);
            consumers.forEach(function (consumer) { if (consumer.apply(snapshot.state,detail) === false) throw new Error(); });
            if (!current() || generation !== epoch || request.signal.aborted) return;
            accepted = snapshot; acceptedKinds = kinds; setState('ready'); clearFailure();
        } catch (_) {
            if (!current() || generation !== epoch || request.signal.aborted) return;
            setState('unavailable'); suspend();
            kinds.forEach(function (kind) { changes.add(kind); });
            failureNotice = ui.notice(ui.config.words.read_error || ui.label('error'),function () { refresh(); });
            failureRetry = failureNotice && failureNotice.querySelector('.ui-retry');
        } finally { if (pending === request) { pending = null; pendingKinds = []; } }
    }
    function refresh(kind) {
        if (!current()) return;
        if (['preferences','blocks','dearrow'].includes(kind)) changes.add(kind);
        cancel(); setState('loading'); suspend();
        timer = setTimeout(read,25);
    }
    function dispose() {
        if (disposed) return;
        disposed = true; active = false; cancel(); setState('disposed'); life.abort(); suspend(); clearFailure();
        consumers.forEach(function (consumer) { try { if (consumer.dispose) consumer.dispose(); } catch (_) {} });
        consumers.clear(); changes.clear(); accepted = null;
    }
    var api = window.InvidiousEnhancements = {
        refresh:refresh,readState:function () { return state; },dispose:dispose,
        register:function (name,consumer) {
            if (!current() || typeof name !== 'string' || consumers.has(name) || !consumer || typeof consumer.apply !== 'function') return false;
            consumers.set(name,consumer);
            if (state === 'ready') {
                try { if (consumer.apply(accepted.state,context(accepted,acceptedKinds,null)) === false) throw new Error(); }
                catch (_) { refresh(); }
            } else if (state !== 'initial' && consumer.suspend) consumer.suspend();
            return true;
        }
    };
    var masking = window.InvidiousSpoilers;
    if (masking && masking.configure) {
        masking.setManaged();
        api.register('masking',{
            suspend:masking.suspend,
            apply:function (value,detail) { return masking.configure({rules:value.masking.rules,labels:value.masking.labels,dearrow:value.dearrow.enabled},detail.now); },
            dispose:masking.dispose
        });
    }
    var dearrow = window.InvidiousDeArrow;
    if (dearrow) {
        dearrow.setManaged();
        api.register('dearrow',{
            suspend:dearrow.suspend,
            apply:function (value,detail) { return dearrow.configure(value.dearrow,detail); },
            dispose:dearrow.dispose
        });
    }
    // The existing player/controller owns media and page-local skip history.
    // Applying owner settings only changes its effective per-channel config.
    var sponsorblock = window.InvidiousSponsorBlock;
    if (sponsorblock && window.video_data) {
        sponsorblock.setManaged();
        api.register('sponsorblock',{
            suspend:sponsorblock.suspend,
            apply:function (value) {
                var config = Object.assign({},value.sponsorblock), override = config.overrides[video_data.channel_id];
                if (value.account && override) config = Object.assign({},config,{
                    enabled:override.enabled === null ? config.enabled : override.enabled,
                    modes:Object.assign({},config.modes,override.modes)
                });
                config = storage.sponsorblock(config,video_data.channel_id,video_data.live_now);
                return sponsorblock.configure(Object.assign({},config,{enabled:config.enabled && !video_data.live_now}));
            },
            dispose:sponsorblock.dispose
        });
    }
    var browse = window.InvidiousBrowse;
    if (browse) {
        browse.setManaged();
        api.register('browse',{suspend:browse.suspend,apply:browse.apply,dispose:browse.dispose});
    }
    var watch = window.InvidiousWatchEnhancements;
    if (watch) api.register('watch',{suspend:watch.suspend,apply:watch.apply,dispose:watch.dispose});
    var embed = window.InvidiousEmbed;
    if (embed) {
        embed.setManaged();
        api.register('embed',{suspend:embed.suspend,apply:embed.apply,dispose:embed.dispose});
    }
    var actions = window.InvidiousVideoActions;
    if (actions) api.register('video-actions',{suspend:actions.suspend,apply:actions.apply});
    document.addEventListener('iv:preferences-change',function (event) { refresh(event.detail && event.detail.kind); },{signal:life.signal});
    window.addEventListener('storage',function (event) {
        if (storage.scope === 'guest' && ['channel_spoiler_settings','sponsorblock_channel_overrides'].some(function (key) { return storage.local.matchesEvent(event,key); })) refresh('preferences');
    },{signal:life.signal});
    window.addEventListener('pagehide',function (event) { active = false; cancel(); setState('suspended'); suspend(); if (!event.persisted) dispose(); },{signal:life.signal});
    window.addEventListener('pageshow',function (event) { if (!disposed) { active = true; if (event.persisted) refresh(); } },{signal:life.signal});
    // Native/other-window edits and denied BroadcastChannel access have no hint.
    // Returning to the document checks its owner without rebuilding playback.
    window.addEventListener('blur',function () { blurred = true; },{signal:life.signal});
    window.addEventListener('focus',function () { if (blurred) { blurred = false; refresh(); } },{signal:life.signal});
    document.addEventListener('visibilitychange',function () {
        var next = document.visibilityState === 'hidden';
        if (hidden && !next) { blurred = false; refresh(); }
        hidden = next;
    },{signal:life.signal});
    window.addEventListener('browserprofilechange',dispose,{signal:life.signal});
    var missed = ui.invalidationsSince(0);
    missed.forEach(function (kind) { changes.add(kind); });
    if (missed.length) refresh();
}());
