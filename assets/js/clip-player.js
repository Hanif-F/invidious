'use strict';
// A single owned boundary controller also supports temporary same-player previews.
window.InvidiousClipPlayer = function (player, clip, unavailableMessage, options) {
    var start = Number(clip.startTime), end = Number(clip.endTime);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start) return;
    var previous = player.invidiousClipBounds;
    if (previous && previous.isActive()) return;
    var originalTime = player.currentTime, correcting = false, initialized = false, unavailable = false, active = false, disposed = false;
    function seek(time) { originalTime.call(player, time); }
    function boundedTime(value) {
        if (active && value !== undefined && Number.isFinite(Number(value))) return originalTime.call(this, Math.max(start, Math.min(end - 0.001, Number(value))));
        return originalTime.apply(this, arguments);
    }
    function boundary() {
        if (!active || disposed || correcting || unavailable || !player.readyState()) return;
        var duration = player.duration();
        if (Number.isFinite(duration) && duration > 0 && duration + 0.05 < end) {
            unavailable = true; player.pause();
            if (options && options.onUnavailable) options.onUnavailable();
            else player.error({code:4,message:unavailableMessage});
            return;
        }
        var time = originalTime.call(player);
        if (!Number.isFinite(time)) return;
        correcting = true;
        try {
            if (!initialized || time < start) { initialized = true; seek(start); }
            else if (time >= end) {
                if (player.loop()) seek(start);
                else { player.pause(); seek(end - 0.001); }
            }
        } finally { correcting = false; }
    }
    function metadata() { if (active && !disposed) { unavailable = false; boundary(); } }
    function suspend() {
        if (!active) return !disposed;
        active = false;
        player.off('loadedmetadata',metadata); player.off('timeupdate',boundary); player.off('seeked',boundary); player.off('ended',boundary);
        if (player.currentTime !== boundedTime) return false;
        player.currentTime = originalTime; return true;
    }
    function resume() {
        if (disposed) return false;
        if (active) return true;
        var owner = player.invidiousClipBounds;
        if (owner && owner !== api && owner.isActive() || player.currentTime !== originalTime) return false;
        active = true; player.currentTime = boundedTime; player.invidiousClipBounds = api;
        player.on('loadedmetadata',metadata); player.on('timeupdate',boundary); player.on('seeked',boundary); player.on('ended',boundary);
        player.ready(boundary); return true;
    }
    function dispose() {
        if (disposed) return;
        suspend(); disposed = true; player.off('dispose',dispose);
        if (player.invidiousClipBounds === api) {
            if (previous && !previous.isDisposed()) player.invidiousClipBounds = previous;
            else delete player.invidiousClipBounds;
        }
    }
    var api = {suspend:suspend,resume:resume,dispose:dispose,isActive:function () { return active && !disposed; },isDisposed:function () { return disposed; },range:function () { return {startTime:start,endTime:end}; }};
    player.on('dispose',dispose);
    if (!resume()) { dispose(); return; }
    return api;
};
