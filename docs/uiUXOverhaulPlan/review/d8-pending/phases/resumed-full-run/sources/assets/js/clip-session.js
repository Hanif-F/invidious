'use strict';
// Own temporary bounds on the existing player; this module never creates media.
window.InvidiousClipSession = function (player, changed) {
    if (player.invidiousClipSession || !window.InvidiousClipPlayer) return;
    var storage = window.InvidiousStorage, life = new AbortController(), active = false, disposed = false, ending = false, pageActive = true;
    var opening = null, base = null, baseWasActive = false, preview = null, previousFlag;
    function current() { return pageActive && !disposed && storage.isCurrent() && !(player.isDisposed && player.isDisposed()); }
    function capture() {
        var time = Number(player.currentTime());
        return Number.isFinite(time) ? {time:time,paused:player.paused(),loop:player.loop()} : null;
    }
    function announce(event) {
        var state = {active:active,preview:!!preview,event:event};
        document.dispatchEvent(new CustomEvent('iv:clip-preview',{detail:state}));
        if (changed) changed(state);
    }
    function play() {
        if (!current()) return;
        var promise = player.play();
        if (promise && promise.catch) promise.catch(function () { if (current()) announce('play-blocked'); });
    }
    function restore(state, resume) {
        player.loop(state.loop); player.currentTime(state.time);
        if (resume && !state.paused) play();
    }
    function begin() {
        if (!current() || active || document.body.dataset.clipEditing === 'true') return false;
        opening = capture(); if (!opening) return false;
        base = player.invidiousClipBounds || null; baseWasActive = !!base && base.isActive();
        if (baseWasActive && !base.suspend()) { opening = null; base = null; return false; }
        previousFlag = document.body.dataset.clipEditing; active = true; document.body.dataset.clipEditing = 'true';
        player.pause(); announce('open'); return true;
    }
    function stop(options) {
        if (!preview) return;
        options = options || {}; var record = preview; preview = null;
        player.pause(); if (record.owner) record.owner.dispose();
        if (options.restore !== false && current()) restore(record.state,options.resume !== false);
        announce('stop');
    }
    function start(range, loop) {
        if (!current() || !active || ending || !range || !Number.isFinite(range.startTime) || !Number.isFinite(range.endTime) || range.startTime < 0 || range.endTime-range.startTime < 5 || range.endTime-range.startTime > 120) return false;
        stop({resume:false}); var state = capture(); if (!state) return false;
        var failed = false, record = {state:state,owner:null}; preview = record;
        player.pause(); player.loop(loop === true);
        record.owner = window.InvidiousClipPlayer(player,range,'',{onUnavailable:function () {
            failed = true;
            if (record.owner && preview === record) { stop({resume:false}); announce('unavailable'); }
        }});
        if (!record.owner || failed) { stop({resume:false}); announce('unavailable'); return false; }
        announce('preview'); play(); return true;
    }
    function finish(options) {
        if (!active || ending) return;
        options = options || {}; ending = true;
        var canRestore = options.restore !== false && current(), state = opening;
        stop({restore:false,resume:false}); player.pause();
        if (canRestore) restore(state,false);
        if (baseWasActive && base && !base.isDisposed() && !(player.isDisposed && player.isDisposed()) && options.playerDisposed !== true) base.resume();
        if (document.body.dataset.clipEditing === 'true') {
            if (previousFlag === undefined) delete document.body.dataset.clipEditing;
            else document.body.dataset.clipEditing = previousFlag;
        }
        active = false; opening = null; base = null; baseWasActive = false; ending = false;
        announce('close');
        if (canRestore && options.resume !== false && !state.paused) play();
    }
    function dispose(playerDisposed) {
        if (disposed) return;
        finish({restore:false,resume:false,playerDisposed:playerDisposed === true}); disposed = true;
        life.abort(); player.off('dispose',playerDisposal);
        if (player.invidiousClipSession === api) delete player.invidiousClipSession;
    }
    function playerDisposal() { dispose(true); }
    window.addEventListener('pagehide',function (event) { finish({resume:false}); pageActive = false; if (!event.persisted) dispose(); },{signal:life.signal});
    window.addEventListener('pageshow',function () { pageActive = !disposed; },{signal:life.signal});
    window.addEventListener('browserprofilechange',function () { dispose(); },{signal:life.signal});
    player.on('dispose',playerDisposal);
    var api = {begin:begin,preview:start,stop:stop,finish:finish,dispose:dispose,isActive:function () { return current() && active; },isPreviewing:function () { return current() && !!preview; }};
    player.invidiousClipSession = api; return api;
};
