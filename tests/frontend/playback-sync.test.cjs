'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../../assets/js/player.js'), 'utf8');
const start = source.indexOf('if (video_data.params.save_player_pos) {');
const end = source.indexOf('\nif (video_data.params.autoplay)', start);
function session(saved = 492) {
    const events = {}, windowEvents = {}, documentEvents = {}, requests = [];
    let time = 0, now = 20000;
    const document = {visibilityState: 'visible', addEventListener: (e, cb) => documentEvents[e] = cb};
    const context = {
        video_data: {params: {save_player_pos: true}, playback_sync: true, playback_position: saved, length_seconds: 2000},
        URL, location: 'https://test/watch?v=abcdefghijk', Date: {now: () => now}, isFinite,
        player: {on: (e, cb) => events[e] = cb, currentTime: () => time, ended: () => false},
        window: {addEventListener: (e, cb) => windowEvents[e] = cb}, document,
        set_seconds_after_start: value => time = value,
        send_playback_position: (action, position, beacon, done) => requests.push({action, position, beacon, done})
    };
    vm.runInNewContext(source.slice(start, end), context);
    return {requests, events, windowEvents, documentEvents, document, setTime: v => time = v, tick: () => now += 15000, time: () => time};
}
test('startup does not overwrite restored progress; periodic save survives a fresh load', () => {
    const s = session();
    assert.equal(s.time(), 492);
    for (const e of ['timeupdate', 'seeked', 'pause']) s.events[e]();
    assert.equal(s.requests.length, 0);
    s.events.playing(); s.setTime(672); s.events.timeupdate();
    assert.equal(s.requests[0].position, 672);
    s.requests[0].done(true);
    assert.equal(session(s.requests[0].position).time(), 672);
});
test('failed saves retry and normal requests never overlap', () => {
    const s = session(); s.events.playing(); s.setTime(600); s.events.timeupdate();
    s.setTime(620); s.events.seeked();
    assert.equal(s.requests.length, 1);
    s.requests[0].done(false); s.tick(); s.events.timeupdate();
    assert.equal(s.requests[1].position, 620);
    s.requests[1].done(true); s.events.pause();
    assert.equal(s.requests.length, 2);
});
test('hidden page sends current position even with an outstanding request', () => {
    const s = session(); s.events.playing(); s.setTime(600); s.events.timeupdate();
    s.setTime(675); s.document.visibilityState = 'hidden'; s.documentEvents.visibilitychange();
    assert.equal(s.requests[1].position, 675);
    assert.equal(s.requests[1].beacon, true);
    s.requests[0].done(true); s.document.visibilityState = 'visible'; s.documentEvents.visibilitychange();
    assert.equal(s.requests[2].position, 675);
});
test('successful in-flight save flushes the latest pending seek', () => {
    const s = session(); s.events.playing(); s.setTime(800); s.events.timeupdate();
    s.setTime(650); s.events.seeked(); s.requests[0].done(true);
    assert.equal(s.requests[1].position, 650);
});
test('periodic attempts stay fifteen seconds apart, including failed completion clears', () => {
    const s = session(); s.events.playing(); s.setTime(700); s.events.timeupdate(); s.requests[0].done(true);
    s.setTime(710); s.events.timeupdate(); assert.equal(s.requests.length, 1);
    s.tick(); s.events.timeupdate(); assert.equal(s.requests.length, 2); s.requests[1].done(true);
    s.setTime(1990); s.events.timeupdate(); assert.equal(s.requests[2].action, 'clear_progress'); s.requests[2].done(false);
    s.events.timeupdate(); assert.equal(s.requests.length, 3);
    s.tick(); s.events.timeupdate(); assert.equal(s.requests.length, 4);
});

const indicatorSource = fs.readFileSync(require('node:path').join(__dirname, '../../assets/js/watched_indicator.js'), 'utf8');
function indicators(sync, local = {}) {
    let callback, mutation;
    const nodes = [{dataset: {id: 'video', length: '1000', watched: 'true'}, style: {}, hidden: true}];
    vm.runInNewContext(indicatorSource, {
        document: {getElementById: () => ({textContent: JSON.stringify({sync})}), querySelectorAll: () => nodes,
            body: {}, addEventListener() {}}, window: {addEventListener() {}},
        MutationObserver: class {constructor(fn) {mutation = fn;} observe() {}},
        helpers: {storage: {get: () => local}, xhr: (_, __, ___, cb) => callback = cb}
    });
    return {nodes, callback, render: () => mutation([{addedNodes: [{nodeType: 1, matches: () => true}]}])};
}
test('account bars wait for server data and never fall back to stale local progress on error', () => {
    const s = indicators(true, {video: 999});
    s.callback.onError(); assert.equal(s.nodes[0].hidden, true);
    s.callback.on200({positions: {video: 492}, watched: ['video']});
    assert.equal(s.nodes[0].style.width, '49%');
    s.nodes.push({dataset: {id: 'video', length: '1000'}, style: {}}); s.render();
    assert.equal(s.nodes[1].style.width, '49%');
});
test('local bars retain rounding and watched fallback; invalid durations hide partial bars', () => {
    const s = indicators(false, {video: 1}); assert.equal(s.nodes[0].style.width, '5%');
    const full = indicators(false); assert.equal(full.nodes[0].style.width, '100%');
    const late = indicators(false, {video: 950}); assert.equal(late.nodes[0].style.width, '100%');
    s.nodes[0].dataset.length = '0'; s.render(); assert.equal(s.nodes[0].hidden, true);
});
