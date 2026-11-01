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
        on(event, fn) { events[event] = fn; }, off(event, fn) { if(events[event]===fn)delete events[event]; }, ready(fn) { fn(); }, readyState() { return 1; },
        loop() { return loop; }, pause() { paused = true; }, duration() { return duration; },
        error(value) { error = value; }
    };
    const context = {window: {}};
    vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../../assets/js/clip-player.js'), 'utf8'), context);
    const originalTime=player.currentTime, bounds=context.window.InvidiousClipPlayer(player, {startTime: 10.25, endTime: 15.25});
    return {player, events, bounds, originalTime, create:context.window.InvidiousClipPlayer, setTime(value) { time = value; }, setDuration(value) { duration = value; }, paused: () => paused, error: () => error};
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

test('temporary preview ownership releases and restores native fractional bounds', () => {
    const s=session(false);s.player.currentTime(12.5);const oldBoundary=s.events.timeupdate;
    assert.equal(s.bounds.suspend(),true);assert.equal(s.player.currentTime,s.originalTime);
    s.player.currentTime(40);oldBoundary();assert.equal(s.player.currentTime(),40,'a detached callback cannot enforce old bounds');
    const preview=s.create(s.player,{startTime:30,endTime:35});assert.equal(s.player.currentTime(),30);
    s.player.currentTime(100);assert.ok(s.player.currentTime()<35);preview.dispose();
    assert.equal(s.player.currentTime,s.originalTime);assert.equal(s.player.invidiousClipBounds,s.bounds);
    s.player.currentTime(12.5);assert.equal(s.bounds.resume(),true);assert.equal(s.player.currentTime(),12.5);
    s.player.currentTime(0);assert.equal(s.player.currentTime(),10.25);s.bounds.dispose();
    assert.equal(s.player.currentTime,s.originalTime);assert.equal(s.player.invidiousClipBounds,undefined);
});
test('an active owner cannot be overwritten and disposed bounds cannot reattach', () => {
    const s=session();assert.equal(s.create(s.player,{startTime:30,endTime:40}),undefined);
    s.bounds.dispose();assert.equal(s.bounds.resume(),false);assert.equal(s.player.currentTime,s.originalTime);
    assert.equal(s.events.loadedmetadata,undefined);assert.equal(s.events.seeked,undefined);
});
test('preview source failures can report to their editor without poisoning the media', () => {
    const s=session();s.bounds.dispose();s.setDuration(12);let failures=0;
    const p=s.create(s.player,{startTime:10,endTime:15},'unavailable',{onUnavailable(){failures++;}});
    assert.equal(failures,1);assert.equal(s.error(),undefined);p.dispose();
});
