'use strict';
// One boundary controller for every native clip/preview seek, including source changes.
window.InvidiousClipPlayer = function (player, clip, unavailableMessage) {
    var start = Number(clip.startTime), end = Number(clip.endTime);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return;
    var originalTime = player.currentTime, correcting = false, initialized = false, unavailable = false;
    function seek(time) { originalTime.call(player, time); }
    player.currentTime = function (value) {
        if (value !== undefined && Number.isFinite(Number(value))) return originalTime.call(this, Math.max(start, Math.min(end - 0.001, Number(value))));
        return originalTime.call(this);
    };
    function boundary() {
        if (correcting || unavailable || !player.readyState()) return;
        var duration = player.duration();
        if (Number.isFinite(duration) && duration > 0 && duration + 0.05 < end) {
            unavailable = true;
            player.pause();
            player.error({code: 4, message: unavailableMessage});
            return;
        }
        var time = originalTime.call(player);
        if (!Number.isFinite(time)) return;
        correcting = true;
        if (!initialized || time < start) {
            initialized = true; seek(start);
        } else if (time >= end) {
            if (player.loop()) seek(start);
            else { player.pause(); seek(end - 0.001); }
        }
        correcting = false;
    }
    player.on('loadedmetadata', function () {
        unavailable = false;
        boundary();
    });
    player.on('timeupdate', boundary);
    player.on('seeked', boundary);
    player.on('ended', boundary);
    player.ready(boundary);
};
