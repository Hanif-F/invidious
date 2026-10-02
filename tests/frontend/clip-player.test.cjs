'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function session(loop = true, duration = 100) {
    const events = {}; let time = 0, paused = false, error;
    const player = {
        currentTime(value) { if (value !== undefined) time = value; return time; },
        on(event, fn) { events[event] = fn; }, ready(fn) { fn(); }, readyState() { return 1; },
        loop() { return loop; }, pause() { paused = true; }, duration() { return duration; },
        error(value) { error = value; }
    };
    const context = {window: {}};
    vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../../assets/js/clip-player.js'), 'utf8'), context);
    context.window.InvidiousClipPlayer(player, {startTime: 10.25, endTime: 15.25});
    return {player, events, setTime(value) { time = value; }, setDuration(value) { duration = value; }, paused: () => paused, error: () => error};
}
test('native seeks clamp keyboard, scrub, refresh and SponsorBlock targets', () => {
    const s = session();
    assert.equal(s.player.currentTime(), 10.25);
    s.player.currentTime(0); assert.equal(s.player.currentTime(), 10.25);
    s.player.currentTime(100); assert.ok(s.player.currentTime() < 15.25);
    s.player.currentTime(12.34); assert.equal(s.player.currentTime(), 12.34);
    s.setTime(0); s.events.loadedmetadata(); assert.equal(s.player.currentTime(), 10.25);
});
test('the saved end loops to the fractional start or pauses with looping disabled', () => {
    const looping = session(); looping.setTime(15.25); looping.events.timeupdate();
    assert.equal(looping.player.currentTime(), 10.25); assert.equal(looping.paused(), false);
    const stopped = session(false); stopped.setTime(16); stopped.events.timeupdate();
    assert.equal(stopped.paused(), true); assert.ok(stopped.player.currentTime() < 15.25);
    assert.ok(stopped.player.currentTime() > 15.24);
});
test('native source ending and direct tech seeks cannot escape the range', () => {
    const s = session(); s.setTime(100); s.events.ended(); assert.equal(s.player.currentTime(), 10.25);
    s.setTime(1); s.events.seeked(); assert.equal(s.player.currentTime(), 10.25);
});
test('a shortened media source stops with an unavailable range error', () => {
    const s = session(true, 12);
    assert.equal(s.paused(), true); assert.equal(s.error().code, 4);
});
test('a recovered source reactivates the saved boundaries after refresh', () => {
    const s = session(true, 12);
    s.setDuration(100); s.events.loadedmetadata();
    assert.equal(s.player.currentTime(), 10.25);
    s.setTime(20); s.events.timeupdate();
    assert.equal(s.player.currentTime(), 10.25);
});
