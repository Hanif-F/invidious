'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../../assets/js/player.js'), 'utf8');
const start = source.lastIndexOf('\nif (', source.indexOf('    const rememberedTime ='));
const end = source.indexOf('\nif (video_data.params.autoplay)', start);
assert.notEqual(start, -1, "Resume implementation must be included in this harness");
function session({saved = 492, clip = false, save = true, sync = true, skip = false, completion = false,
    scope = 'account', duration = 2000, live = false, boundary = -1, timestamp = ''} = {}) {
    const events = {}, windowEvents = {}, documentEvents = {}, requests = [];
    const storage = {};
    let time = 0, now = 20000, cleared = false;
    let active = true, available = true, paused = false, ended = false, seeking = false;
    function addListener(target, event, callback) {
        const previous = target[event];
        target[event] = previous ? () => { previous(); callback(); } : callback;
    }
    const document = {body: {dataset: {}}, visibilityState: 'visible', dispatchEvent() {},
        addEventListener: (e, cb) => addListener(documentEvents, e, cb)};
    const context = {
        video_data: {id: 'abcdefghijk', clip: clip ? {} : null, params: {save_player_pos: save, video_end: boundary},
            playback_sync: sync, playback_position: saved, length_seconds: duration, skip_playback_position: skip,
            record_completion: completion, live_now: live},
        URL, Event, location: 'https://test/watch?v=abcdefghijk' + timestamp, Date: {now: () => now}, isFinite,
        player: {on: (e, cb) => addListener(events, e, cb), currentTime: () => time, ended: () => ended,
            paused: () => paused, seeking: () => seeking, duration: () => duration, liveTracker: {isLive: () => live}},
        window: {addEventListener: (e, cb) => addListener(windowEvents, e, cb)}, document,
        playerAvailable:()=>available,currentPlayerWork:()=>active&&available,playerWorkLife:{signal:{}},playerWorkEpoch:0,
        set_seconds_after_start: value => time = value, get_video_time:()=>saved, save_video_time:position=>requests.push({action:"local",position}),
        remove_all_video_times: () => cleared = true,
        clear_video_time: () => requests.push({action: 'clear_local'}),
        browserStorage: {scope, report() {}}, storageStatus() {},
        completed_videos_key: 'completed_videos',
        helpers: {storage: {get: key => storage[key], set: (key, value) => { storage[key] = value; return true; }}},
        send_playback_position: (action, position, beacon, done) => requests.push({action, position, beacon, done})
    };
    const guardStart=source.indexOf('function clip_editing()');assert.notEqual(guardStart,-1);
    vm.runInNewContext(source.slice(guardStart,source.indexOf('\n\n',guardStart))+'\n'+source.slice(start, end), context);
    return {requests, events, windowEvents, documentEvents, document, storage, setTime: v => time = v, tick: () => now += 15000,
        time: () => time, cleared: () => cleared, setPaused: v => paused = v, setSeeking: v => seeking = v, setEnded: v => ended = v,
        leave:()=>{active=false;context.playerWorkEpoch++;windowEvents.pagehide?.();},resume:()=>{active=true;},dispose:()=>{available=false;active=false;context.playerWorkEpoch++;}};
}
test('native clips never restore, save or clear full-video progress', () => {
    for (const save of [true, false]) {
        const s = session({clip: true, save, completion: true});
        assert.equal(s.time(), 0); assert.deepEqual(s.events, {});
        assert.equal(s.requests.length, 0); assert.equal(s.cleared(), false);
    }
});
test('Music skips account and local positions without clearing local progress for other videos', () => {
    for (const sync of [true, false]) {
        for (const save of [true, false]) {
            const s = session({save, sync, skip: true});
            assert.equal(s.time(), 0);
            assert.deepEqual(s.events, {});
            assert.deepEqual(s.windowEvents, {});
            assert.deepEqual(s.documentEvents, {});
            assert.deepEqual(s.requests, []);
            assert.equal(s.cleared(), false);
        }
    }
    const ordinary = session({sync: false});
    assert.equal(ordinary.time(), 492);
    ordinary.events.playing();
    ordinary.setTime(600);
    ordinary.events.timeupdate();
    assert.deepEqual(ordinary.requests, [{action: 'local', position: 600}]);
});
test('startup does not overwrite restored progress; periodic save survives a fresh load', () => {
    const s = session();
    assert.equal(s.time(), 492);
    for (const e of ['timeupdate', 'seeked', 'pause']) s.events[e]();
    assert.equal(s.requests.length, 0);
    s.events.playing(); s.setTime(672); s.events.timeupdate();
    assert.equal(s.requests[0].position, 672);
    s.requests[0].done(true);
    assert.equal(session({saved: s.requests[0].position}).time(), 672);
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
test('resume retains the final seconds and only clears after playback ends', () => {
    const s = session(); s.events.playing(); s.setTime(700); s.events.timeupdate(); s.requests[0].done(true);
    s.setTime(710); s.events.timeupdate(); assert.equal(s.requests.length, 1);
    s.tick(); s.events.timeupdate(); assert.equal(s.requests.length, 2); s.requests[1].done(true);
    s.setTime(1990); s.events.pause(); assert.equal(s.requests[2].action, 'set_progress');
    assert.equal(s.requests[2].position, 1990);
    assert.equal(session({saved: 1990}).time(), 1990);
    s.requests[2].done(true);
    s.setTime(2000); s.setEnded(true); s.events.ended();
    assert.equal(s.requests[3].action, 'clear_progress'); s.requests[3].done(false);
    s.events.timeupdate(); assert.equal(s.requests.length, 4);
    s.tick(); s.events.timeupdate(); assert.equal(s.requests.length, 5);
});

test('a failed position write cannot strand an already queued end clear', () => {
    const s = session();
    s.events.playing(); s.setTime(1990); s.events.timeupdate();
    s.setEnded(true); s.events.ended();
    s.requests[0].done(false);
    assert.deepEqual(s.requests.map(request => request.action), ['set_progress', 'clear_progress']);
});

test('account completion needs actual playback at 95% and works with position saving off', () => {
    const s = session({save: false, sync: false, completion: true, timestamp: '&t=1900'});
    s.setTime(1900); s.events.timeupdate(); assert.equal(s.requests.length, 0);
    s.setTime(1899); s.events.playing(); s.events.timeupdate(); assert.equal(s.requests.length, 0);
    s.setTime(1900); s.setPaused(true); s.events.timeupdate(); assert.equal(s.requests.length, 0);
    s.setPaused(false); s.setSeeking(true); s.events.timeupdate(); assert.equal(s.requests.length, 0);
    s.setSeeking(false); s.events.timeupdate();
    assert.equal(s.requests[0].action, 'complete_progress');
    s.events.timeupdate(); assert.equal(s.requests.length, 1);
    s.requests[0].done(false, 503);
    s.events.timeupdate(); assert.equal(s.requests.length, 1);
    s.tick(); s.events.timeupdate(); assert.equal(s.requests[1].action, 'complete_progress');
    s.requests[1].done(true);
    s.tick(); s.events.timeupdate(); s.leave(); assert.equal(s.requests.length, 2);
});

test('reaching the threshold uses a single background completion delivery per departure', () => {
    const s = session({save: false, sync: false, completion: true});
    s.events.playing(); s.setTime(1900); s.events.timeupdate();
    s.document.visibilityState = 'hidden'; s.documentEvents.visibilitychange(); s.leave();
    assert.deepEqual(s.requests.map(request => [request.action, request.beacon]),
        [['complete_progress', false], ['complete_progress', true]]);
});

test('paused history, live playback and bounded or temporary previews do not record completion', () => {
    for (const options of [{completion: false}, {live: true}, {boundary: 1999}, {duration: Infinity}]) {
        const s = session({completion: true, ...options});
        s.events.playing(); s.setTime(1999); s.events.timeupdate();
        assert.ok(s.requests.every(request => request.action !== 'complete_progress'));
    }
    const preview = session({completion: true, save: false});
    preview.document.body.dataset.clipEditing = 'true';
    preview.setTime(2000); preview.events.playing(); preview.events.timeupdate(); preview.leave();
    assert.deepEqual(preview.requests, []);
});

test('guests who save positions store completion locally and clear the individual resume position on end', () => {
    const s = session({scope: 'guest', sync: false, duration: 10});
    s.events.playing(); s.setTime(3); s.events.timeupdate();
    assert.deepEqual(s.requests, [{action: 'local', position: 3}]);
    assert.equal(s.storage.completed_videos, undefined);
    s.setTime(9.5); s.events.timeupdate();
    assert.equal(s.storage.completed_videos.abcdefghijk, true);
    s.setTime(10); s.setEnded(true); s.events.ended();
    assert.deepEqual(s.requests.map(request => request.action), ['local', 'local', 'clear_local']);
    const disabled = session({scope: 'guest', save: false, sync: false});
    assert.equal(disabled.cleared(), true);
    assert.deepEqual(disabled.events, {});
});

const indicatorSource = fs.readFileSync(require('node:path').join(__dirname, '../../assets/js/watched_indicator.js'), 'utf8');
function indicators({account = false, sync = false, local = {}, guestCompleted = {}} = {}) {
    let callback, mutation;
    const events = {};
    const nodes = [{dataset: {id: 'video', length: '1000', watched: 'true'}, style: {}, hidden: true}];
    vm.runInNewContext(indicatorSource, {
        document: {getElementById: () => ({textContent: JSON.stringify({account, sync})}), querySelectorAll: () => nodes,
            body: {}, addEventListener: (name, handler) => events[name] = handler}, window: {InvidiousStorage: {isCurrent: () => true}, addEventListener() {}},
        MutationObserver: class {constructor(fn) {mutation = fn;} observe() {}},
        helpers: {storage: {get: key => key === 'completed_videos' ? guestCompleted : local}, xhr: (_, __, ___, cb) => callback = cb}
    });
    return {nodes, get callback() { return callback; }, events,
        render: () => mutation([{addedNodes: [{nodeType: 1, matches: () => true}]}])};
}
test('account bars wait for server data and never fall back to stale local progress on error', () => {
    const s = indicators({account: true, sync: true, local: {video: 999}});
    s.callback.onError(); assert.equal(s.nodes[0].hidden, true);
    s.callback.on200({positions: {video: 492}, watched: ['video']});
    assert.equal(s.nodes[0].style.width, '49%');
    s.nodes.push({dataset: {id: 'video', length: '1000'}, style: {}}); s.render();
    assert.equal(s.nodes[1].style.width, '49%');
});
test('history alone has no bar and a usable position takes precedence over completion', () => {
    const s = indicators({account: true, sync: true});
    s.callback.on200({positions: {}, watched: ['video'], completed: []});
    assert.equal(s.nodes[0].hidden, true);
    s.events['iv:library-change']();
    s.callback.on200({positions: {video: 3}, watched: ['video'], completed: ['video']});
    assert.equal(s.nodes[0].style.width, '5%');
    s.nodes[0].dataset.length = '0'; s.render(); assert.equal(s.nodes[0].style.width, '100%');
});

test('manual actions update completion with sync off and across refreshed snapshots', () => {
    const s = indicators({account: true, guestCompleted: {video: true}});
    s.callback.on200({positions: {}, watched: ['video'], completed: []});
    assert.equal(s.nodes[0].hidden, true);
    s.events['iv:watched-change']({detail: {id: 'video', watched: true}});
    assert.equal(s.nodes[0].style.width, '100%');
    s.events['iv:library-change']();
    s.callback.on200({positions: {}, watched: ['video'], completed: ['video']});
    assert.equal(s.nodes[0].hidden, false);
    s.events['iv:watched-change']({detail: {id: 'video', watched: false}});
    assert.equal(s.nodes[0].hidden, true);
    s.events['iv:library-change']();
    s.callback.on200({positions: {}, watched: [], completed: []});
    assert.equal(s.nodes[0].hidden, true);
});

test('only snapshots requested after a manual action supersede its completion mark', () => {
    const s = indicators({account: true});
    const stale = s.callback;
    s.events['iv:watched-change']({detail: {id: 'video', watched: true}});
    s.events['iv:library-change']();
    stale.on200({positions: {}, watched: [], completed: []});
    assert.equal(s.nodes[0].hidden, false);
    s.callback.on200({positions: {}, watched: [], completed: []});
    assert.equal(s.nodes[0].hidden, true);
});

test('local bars use guest completion, the 91% visual rule and valid durations', () => {
    const complete = indicators({guestCompleted: {video: true}});
    assert.equal(complete.nodes[0].style.width, '100%');
    const late = indicators({local: {video: 910}});
    assert.equal(late.nodes[0].style.width, '100%');
    late.nodes[0].dataset.length = '0'; late.render(); assert.equal(late.nodes[0].hidden, true);
    const zero = indicators({local: {video: 0}}); assert.equal(zero.nodes[0].hidden, true);
});

test('preview playback cannot start account tracking or save completion and beacon positions',()=>{
    const s=session();s.document.body.dataset.clipEditing='true';s.events.playing();s.setTime(1990);
    for(const name of ['timeupdate','seeked','pause','ended'])s.events[name]();s.windowEvents.pagehide();s.document.visibilityState='hidden';s.documentEvents.visibilitychange();assert.equal(s.requests.length,0);
    delete s.document.body.dataset.clipEditing;s.setTime(600);s.events.timeupdate();assert.equal(s.requests.length,0,'preview playing never enabled normal tracking');
    s.events.playing();s.events.timeupdate();assert.equal(s.requests[0].position,600);
});
test('pending account saves and local progress exclude temporary editing positions',()=>{
    const s=session();s.events.playing();s.setTime(600);s.events.timeupdate();s.document.body.dataset.clipEditing='true';s.setTime(1990);s.events.seeked();s.events.timeupdate();s.requests[0].done(true);assert.equal(s.requests.length,1);
    s.setTime(600);delete s.document.body.dataset.clipEditing;s.events.seeked();assert.equal(s.requests.length,1);s.setTime(700);s.events.seeked();assert.equal(s.requests[1].position,700);
    const local=session({sync:false});local.events.playing();local.document.body.dataset.clipEditing='true';local.setTime(1000);local.events.timeupdate();assert.equal(local.requests.length,0);delete local.document.body.dataset.clipEditing;local.events.timeupdate();assert.equal(local.requests[0].position,1000);
});

test('pagehide still flushes the account beacon while late ordinary saves cannot enqueue another write',()=>{
    const s=session();s.events.playing();s.setTime(100);s.events.timeupdate();assert.equal(s.requests.length,1);
    s.setTime(110);s.events.seeked();s.leave();assert.equal(s.requests.length,2);assert.equal(s.requests[1].beacon,true);assert.equal(s.requests[1].position,110);
    s.resume();s.requests[0].done(true);assert.equal(s.requests.length,2);
});
test('disposed media cannot be read or saved by retained visibility/online callbacks',()=>{
    const s=session();s.events.playing();s.setTime(100);s.dispose();s.document.visibilityState='hidden';s.documentEvents.visibilitychange();s.windowEvents.online();assert.equal(s.requests.length,0);
});
