'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../../assets/js/browser-storage.js'), 'utf8');
const alice = 'a'.repeat(64), bob = 'b'.repeat(64), video = 'abcdefghijk', channel = 'UC' + 'c'.repeat(22);
const prefix = 'iv:browser:v2:';
const marker = 'IV_BROWSER_PROFILE_V2';
const plain = value => value === undefined ? value : JSON.parse(JSON.stringify(value));

function memoryStorage() {
    const data = {};
    Object.defineProperties(data, {
        getItem: {value(key) { return Object.hasOwn(this, key) ? this[key] : null; }},
        setItem: {writable: true, value(key, value) { this[key] = String(value); }},
        removeItem: {writable: true, value(key) { delete this[key]; }}
    });
    return data;
}
function browser() {
    const local = memoryStorage(), cookies = new Map(), writes = [];
    function page(scope = 'guest', options = {}) {
        if (options.marker !== false) cookies.set(marker, options.marker || scope);
        const events = {}, docEvents = {}, timers = new Map(); let timerId = 0;
        const session = options.session || memoryStorage();
        const refresh = new EventTarget();
        const notice = {hidden: true, querySelector() { return refresh; }};
        const document = {
            getElementById(id) {
                if (id === 'browser-profile') return {textContent: JSON.stringify({scope, saveError: 'Save failed'})};
                if (id === 'browser-profile-recovery') return notice;
                return null;
            },
            addEventListener(name, callback) { (docEvents[name] ||= []).push(callback); },
            dispatchEvent(event) { for (const callback of docEvents[event.type] || []) callback(event); },
            querySelector() { return null; }
        };
        Object.defineProperty(document, 'cookie', {
            get() { if (options.cookieDenied) throw new Error('Cookie access denied'); if (options.noCookies) return ''; return [...cookies].map(([name, value]) => name + '=' + (options.formEncoding ? encodeURIComponent(value).replace(/%20/g, '+') : encodeURIComponent(value))).join('; '); },
            set(value) {
                writes.push(value);
                if (options.cookieDenied) throw new Error('Cookie access denied');
                if (options.noCookies) return;
                const [pair] = value.split(';'), at = pair.indexOf('='), name = pair.slice(0, at);
                if (/Max-Age=0/.test(value)) cookies.delete(name);
                else cookies.set(name, decodeURIComponent(pair.slice(at + 1)));
            }
        });
        const window = {
            document, addEventListener(name, callback) { (events[name] ||= []).push(callback); },
            dispatchEvent(event) { for (const callback of events[event.type] || []) callback(event); }
        };
        for (const [name, value] of [['localStorage', local], ['sessionStorage', session]]) {
            Object.defineProperty(window, name, {get() { if (options.denied) throw new Error('Denied'); return value; }});
        }
        let reloads = 0;
        const history = {state: null, replaceState(state) {
            if (options.historyDenied) throw new Error('History denied');
            this.state = state;
        }};
        const context = vm.createContext({window, document, history, location: {protocol: 'https:', hostname: 'invidious.test', reload() { reloads++; }},
            Event: function (type) { this.type = type; }, setTimeout(callback) { timers.set(++timerId,callback); return timerId; }, clearTimeout(id) { timers.delete(id); }});
        vm.runInContext(source, context);
        return {api: window.InvidiousStorage, context, session, document, events, notice, refresh,
            dispatch(name, event = {type: name}) { window.dispatchEvent({...event, type: name}); },
            flush() { while (timers.size) { const [id, callback] = timers.entries().next().value; timers.delete(id); callback(); } }, reloads: () => reloads};
    }
    return {page, local, cookies, writes};
}

test('guest → Alice → guest → Bob → Alice restores only the active profile', () => {
    const b = browser();
    let p = b.page();
    p.api.local.set('invidious_player_volume', .3);
    p.api.local.set('chat-settings-v1', {chat_font_scale: 120});
    p = b.page(alice);
    assert.equal(p.api.local.get('invidious_player_volume'), undefined);
    assert.equal(p.api.local.get('chat-settings-v1'), undefined);
    p.api.local.set('invidious_player_volume', .7);
    p.api.local.set('caption_settings', {fontPercent: 2});
    p = b.page();
    assert.equal(p.api.local.get('invidious_player_volume'), .3);
    assert.equal(p.api.local.get('caption_settings'), undefined);
    p = b.page(bob);
    assert.equal(p.api.local.get('invidious_player_volume'), undefined);
    p.api.local.set('invidious_player_volume', .9);
    p = b.page(alice);
    assert.equal(p.api.local.get('invidious_player_volume'), .7);
    assert.deepEqual(plain(p.api.local.get('caption_settings')), {fontPercent: 2});
});

test('legacy raw, encoded, and cookie saves migrate only to guests on an account visit', () => {
    const b = browser();
    b.local.setItem('invidious_player_volume', '.25');
    b.local.setItem('dark_mode', encodeURIComponent(JSON.stringify('dark')));
    b.local.setItem('vjs-text-track-settings', JSON.stringify({fontPercent: 1.5}));
    b.local.setItem('save_player_pos', encodeURIComponent(JSON.stringify({[video]: 492})));
    b.cookies.set('chat-timing-v1-' + video, '1500');
    b.local.setItem('stream', 'true');
    const session = memoryStorage(); session.setItem('continuation_cache_%2Fsearch', '[null]');
    const account = b.page(alice, {session});
    assert.equal(account.api.local.get('invidious_player_volume'), undefined);
    assert.equal(b.local.getItem('invidious_player_volume'), null);
    assert.equal(b.local.getItem('stream'), null);
    assert.equal(session.getItem('continuation_cache_%2Fsearch'), null);
    const guest = b.page();
    assert.equal(guest.api.local.get('invidious_player_volume'), .25);
    assert.equal(guest.api.local.get('dark_mode'), 'dark');
    assert.equal(guest.api.local.get('chat-timing-v1-' + video), 1500);
    assert.deepEqual(plain(guest.api.local.get('save_player_pos')), {[video]: 492});
    assert.deepEqual(plain(guest.api.local.get('caption_settings')), {fontPercent: 1.5});
});

test('migration preserves new-format guest values and removes invalid legacy data', () => {
    const b = browser();
    b.local.setItem(prefix + 'guest:invidious_player_volume', '0.6');
    b.local.setItem('invidious_player_volume', '.1');
    b.local.setItem('chat-settings-v1', 'broken json');
    const p = b.page();
    assert.equal(p.api.local.get('invidious_player_volume'), .6);
    assert.equal(b.local.getItem('chat-settings-v1'), null);
});

test('stale tabs reject writes, callbacks and guest preference updates after switching', () => {
    const b = browser(), guest = b.page();
    let changed = 0;
    guest.events.browserprofilechange = [() => changed++];
    b.page(alice);
    assert.equal(guest.api.local.set('dark_mode', 'dark'), false);
    assert.equal(guest.api.guestSpeed(1.5), false);
    assert.equal(guest.api.isCurrent(), false);
    assert.equal(changed, 1);
    guest.flush();
    assert.equal(guest.reloads(), 1);
    assert.equal(guest.notice.hidden, false, 'manual refresh remains available if navigation is canceled');
    assert.equal(b.cookies.has('PREFS'), false);
});

test('a stale page offers manual refresh when it cannot record an automatic attempt', () => {
    const b = browser(), p = b.page(alice, {historyDenied: true});
    assert.equal(p.notice.hidden, true);
    b.page(bob);
    assert.equal(p.api.local.set('dark_mode', 'dark'), false);
    p.flush();
    assert.equal(p.reloads(), 0);
    assert.equal(p.notice.hidden, false);
    p.refresh.dispatchEvent(new Event('click'));
    assert.equal(p.reloads(), 1);
});

test('storage events and session continuations are filtered by profile and backend', () => {
    const b = browser(), p = b.page(alice);
    assert.equal(p.api.local.matchesEvent({key: prefix + 'guest:dark_mode', storageArea: b.local}, 'dark_mode'), false);
    assert.equal(p.api.local.matchesEvent({key: prefix + alice + ':dark_mode', storageArea: b.local}, 'dark_mode'), true);
    assert.equal(p.api.local.matchesEvent({key: prefix + alice + ':dark_mode', storageArea: p.session}), false);
    p.api.session.set('continuation_cache_%2Fsearch', [null, 'token']);
    assert.deepEqual(plain(p.api.session.get('continuation_cache_%2Fsearch')), [null, 'token']);
    const other = b.page(bob, {session: p.session});
    assert.equal(other.api.session.get('continuation_cache_%2Fsearch'), undefined);
});

test('denied storage uses bounded profile cookies, larger data stays in memory and reports failure', () => {
    const b = browser(), p = b.page(alice, {denied: true});
    assert.equal(p.api.local.set('invidious_player_volume', 0), true);
    assert.equal(p.api.local.get('invidious_player_volume'), 0);
    assert.ok(b.writes.some(value => value.startsWith('iv_browser_v2_' + alice) && value.includes('Path=/; SameSite=Lax; Secure')));
    const entries = {};
    for (let i = 0; i < 50; i++) entries['UC' + String(i).padStart(22, '0')] = {name: 'Long name '.repeat(20), enabled: true, modes: {sponsor: 'auto'}};
    const saved = p.api.local.set('sponsorblock_channel_overrides', entries);
    assert.equal(saved, false);
    assert.equal(Object.keys(p.api.local.get('sponsorblock_channel_overrides')).length, 50);
    const status = {textContent: ''}; p.api.report(saved, status); assert.equal(status.textContent, 'Save failed');
    assert.ok(!b.writes.some(value => value.includes('sponsorblock_channel_overrides=')));
});

test('cookie and storage denial does not break playback settings in page memory', () => {
    const b = browser(), p = b.page('guest', {denied: true, noCookies: true});
    assert.equal(p.api.local.set('invidious_player_volume', .4), false);
    assert.equal(p.api.local.get('invidious_player_volume'), .4);
    assert.equal(p.api.local.remove('invidious_player_volume'), false);
    assert.equal(p.api.local.get('invidious_player_volume'), undefined);
});

test('quota failures retain current values instead of resurrecting an old save', () => {
    const b = browser(), p = b.page();
    p.api.local.set('invidious_player_volume', .2);
    b.local.setItem = () => { throw new Error('Quota'); };
    b.local.removeItem = () => { throw new Error('Denied'); };
    assert.equal(p.api.local.set('invidious_player_volume', .8), true);
    assert.equal(p.api.local.get('invidious_player_volume'), .8);
    assert.equal(b.page().api.local.get('invidious_player_volume'), .8);
});

test('failed persistence leaves the last successful save intact for the next visit', () => {
    const b = browser();
    b.page().api.local.set('invidious_player_volume', .2);
    b.local.setItem = () => { throw new Error('Quota'); };
    const p = b.page('guest', {noCookies: true});
    assert.equal(p.api.local.set('invidious_player_volume', .8), false);
    assert.equal(p.api.local.get('invidious_player_volume'), .8);
    assert.equal(b.page('guest', {noCookies: true}).api.local.get('invidious_player_volume'), .2);
});

test('invalid stored values are removed and complex settings are allowlisted', () => {
    const b = browser(), p = b.page();
    for (const value of ['garbage', '2', '-1', '', 'null', '"0.4"']) {
        b.local.setItem(p.api.local.key('invidious_player_volume'), value);
        assert.equal(p.api.local.get('invidious_player_volume'), undefined);
    }
    p.api.local.set('chat-settings-v1', {chat_font_scale: 100, chat_show_timestamps: 'false', password: 'secret'});
    assert.deepEqual(plain(p.api.local.get('chat-settings-v1')), {chat_font_scale: 100});
    p.api.local.set('save_player_pos', {[video]: 492, bad: 200, invalid0001: -5});
    assert.deepEqual(plain(p.api.local.get('save_player_pos')), {[video]: 492});
    assert.equal(p.api.local.set('chat-timing-v1-' + video, 3600001), false);
    assert.equal(p.api.local.set('SID', 'secret'), false);
});

test('guest completion is validated and stays in the guest profile', () => {
    const b = browser(), guest = b.page();
    assert.equal(guest.api.local.set('completed_videos', {[video]: true, bad: true, invalid0001: 1}), true);
    assert.deepEqual(plain(guest.api.local.get('completed_videos')), {[video]: true});
    assert.equal(b.page(alice).api.local.get('completed_videos'), undefined);
    assert.deepEqual(plain(b.page().api.local.get('completed_videos')), {[video]: true});
});

test('guest SponsorBlock overrides inherit categories, support enablement and never affect accounts or live video', () => {
    const b = browser(), p = b.page();
    p.api.local.set('sponsorblock_channel_overrides', {[channel]: {name: '<Channel>', enabled: true, modes: {sponsor: 'auto', unknown: 'manual'}}});
    const global = {enabled: false, modes: {sponsor: 'manual', intro: 'marker'}};
    assert.deepEqual(plain(p.api.sponsorblock(global, channel, false)), {enabled: true, modes: {sponsor: 'auto', intro: 'marker'}});
    assert.equal(p.api.sponsorblock(global, channel, true).enabled, false);
    assert.deepEqual(plain(b.page(alice).api.sponsorblock(global, channel, false)), global);
});

test('account deletion purges only its own profile and leaves guest and other accounts intact', () => {
    const b = browser();
    b.page().api.local.set('dark_mode', 'light');
    b.page(alice).api.local.set('dark_mode', 'dark');
    b.page(bob).api.local.set('dark_mode', '');
    b.cookies.set('IV_BROWSER_PURGE', alice);
    const p = b.page();
    assert.equal(b.local.getItem(prefix + alice + ':dark_mode'), null);
    assert.equal(b.local.getItem(prefix + bob + ':dark_mode'), '""');
    assert.equal(p.api.local.get('dark_mode'), 'light');
    assert.equal(b.cookies.has('IV_BROWSER_PURGE'), false);
});

test('guest playback speed preserves other guest preferences and account calls never write PREFS', () => {
    const b = browser(), p = b.page();
    b.cookies.set('PREFS', JSON.stringify({theme: 'diary', theme_random: true, theme_random_interval_hours: 6, theme_random_next_at: 1800000000, dark_mode: 'dark', volume: 7, speed: 1, password: 'discarded'}));
    assert.equal(p.api.guestSpeed(1.5, {dark_mode: 'light', speed: 1}), true);
    assert.deepEqual(JSON.parse(b.cookies.get('PREFS')), {dark_mode: 'dark', speed: 1.5});
    assert.equal(b.page(alice).api.guestSpeed(2), false);
    assert.equal(JSON.parse(b.cookies.get('PREFS')).speed, 1.5);
});

test('guest speed preserves form-encoded spaces and literal plus signs', () => {
    const b = browser(), p = b.page('guest', {formEncoding: true});
    b.cookies.set('PREFS', JSON.stringify({chat_word_blacklist: 'first second+third', speed: 1}));
    assert.equal(p.api.guestSpeed(1.5, {chat_word_blacklist: '', speed: 1}), true);
    assert.deepEqual(JSON.parse(b.cookies.get('PREFS')), {chat_word_blacklist: 'first second+third', speed: 1.5});
});

test('late response cookies cannot override a newer active profile, and response headers guard denied storage', () => {
    const b = browser(), old = b.page(alice);
    b.page(bob);
    b.cookies.set(marker, alice); // A request started before Bob signed in.
    assert.equal(old.api.isCurrent(), false);
    const denied = b.page(alice, {denied: true, cookieDenied: true});
    assert.equal(denied.api.checkResponse({headers: {get: () => bob}}), false);
    assert.equal(denied.api.local.set('dark_mode', 'dark'), false);
    denied.flush();
    assert.equal(denied.reloads(), 1);
});

test('large legacy saves remain usable in guest page memory when migration exceeds quota', () => {
    const b = browser(), positions = {};
    for (let i = 0; i < 1000; i++) positions[String(i).padStart(11, '0')] = i;
    b.local.setItem('save_player_pos', JSON.stringify(positions));
    b.local.setItem = () => { throw new Error('Quota'); };
    const p = b.page('guest', {noCookies: true});
    assert.equal(p.api.local.get('save_player_pos')['00000000042'], 42);
    assert.ok(b.local.getItem('save_player_pos'));
});

function loadHelpers(p) {
    const requests = [];
    Object.assign(p.context, {
        addEventListener: (...args) => p.context.window.addEventListener(...args),
        NodeList: function () {}, console: {warn() {}},
        XMLHttpRequest: class {
            constructor() { requests.push(this); }
            open() {} send() {} setRequestHeader() {} getResponseHeader() { return null; }
        }
    });
    p.context.window.HTMLDetailsElement = function () {};
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../../assets/js/_helpers.js'), 'utf8'), p.context);
    p.context.helpers = p.context.window.helpers;
    return requests;
}

test('delayed helper responses and retries are discarded after switching profiles', () => {
    const b = browser(), p = b.page(alice), requests = loadHelpers(p), calls = [];
    p.context.helpers.xhr('GET', '/test', {}, {on200: () => calls.push('success'), onError: () => calls.push('error')});
    p.context.helpers.xhr('GET', '/retry', {retries: 2}, {onTotalFail: () => calls.push('retry')});
    requests[1].onerror();
    b.page(bob);
    requests[0].status = 200; requests[0].response = {};
    requests[0].onloadend(); requests[0].onerror();
    p.flush();
    assert.deepEqual(calls, []);
    assert.equal(requests.length, 2);
});

function loadNotifications(p, options = {}) {
    const streams = [], intervals = new Map();
    const original = p.document.getElementById;
    p.document.getElementById = id => id === 'notification_data' ? {textContent: JSON.stringify({csrf_token: 'fixture', initial_count: options.initialCount})} :
        id === 'notification_ticker' ? (options.ticker === false ? null : {innerHTML: ''}) : original(id);
    Object.assign(p.context, {
        InvidiousStorage: p.api,
        helpers: {storage: p.api.local, xhr(method, url, requestOptions, callbacks) { callbacks.on200(options.subscriptions === undefined ? [{authorId: channel}] : options.subscriptions); }},
        addEventListener: (...args) => p.context.window.addEventListener(...args),
        setInterval(callback) { const id = intervals.size + 1; intervals.set(id, callback); return id; },
        clearInterval(id) { intervals.delete(id); },
        console: {info() {}, warn() {}},
        SSE: class {
            constructor(url, options) { streams.push(this); this.closed = false; this.options = options; this.listeners = {}; }
            close() { this.closed = true; } addEventListener(name, callback) { this.listeners[name] = callback; } stream() {}
        }
    });
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../../assets/js/notifications.js'), 'utf8'), p.context);
    p.dispatch('load'); p.flush();
    return {streams, intervals};
}

test('one notification tab owns each profile lease; expired owners close and account switches discard messages', () => {
    const b = browser(), first = b.page(alice), one = loadNotifications(first);
    assert.equal(one.streams.length, 1);
    const second = b.page(alice), two = loadNotifications(second);
    assert.equal(two.streams.length, 0);
    first.api.local.set('stream', {owner: 'expired', expires: 0});
    second.dispatch('storage', {key: second.api.local.key('stream'), storageArea: b.local}); second.flush();
    assert.equal(two.streams.length, 1);
    first.dispatch('storage', {key: first.api.local.key('stream'), storageArea: b.local}); first.flush();
    assert.equal(one.streams[0].closed, true);
    const event = {id: 'message', data: JSON.stringify({videoId: video, published: Math.round(Date.now() / 1000) + 1})};
    two.streams[0].onmessage(event);
    assert.equal(second.api.local.get('notification_count'), 1);
    second.dispatch('storage', {key: prefix + 'guest:stream', storageArea: b.local});
    assert.equal(two.streams[0].closed, false);
    const bobPage = b.page(bob), bobStreams = loadNotifications(bobPage);
    two.streams[0].onmessage(event); second.flush();
    assert.equal(two.streams[0].closed, true);
    assert.equal(two.intervals.size, 0);
    assert.equal(bobStreams.streams.length, 1);
    assert.equal(bobPage.api.local.get('notification_count'), 0);
    assert.equal(JSON.parse(b.local.getItem(prefix + alice + ':notification_count')), 1);
});

test('notifications retain server counts without a header ticker and skip empty or malformed subscription reads', () => {
    for (const subscriptions of [[], {}]) {
        const b = browser(), p = b.page(alice);
        const state = loadNotifications(p, {ticker: false, initialCount: 3, subscriptions});
        assert.equal(state.streams.length, 0);
        assert.equal(p.api.local.get('notification_count'), 3);
        assert.doesNotThrow(() => p.context.update_notification_count());
    }
    const b = browser(), p = b.page(alice), state = loadNotifications(p, {ticker: false, initialCount: 3});
    assert.equal(state.streams.length, 1);
    const event = {id: 'message', data: JSON.stringify({videoId: video, published: Math.round(Date.now() / 1000) + 1})};
    state.streams[0].onmessage(event);
    state.streams[0].onmessage(event);
    assert.equal(p.api.local.get('notification_count'), 4, 'one delivery increments the server count once');
});

test('channel spoiler rules reject malformed timers and remain isolated from account profiles', () => {
    const b = browser();
    const p = b.page();
    const rule = {name: 'Channel <name>', hide_title: true, hide_thumbnail: true, reveal_after_days: 7};
    assert.equal(p.api.local.set('channel_spoiler_settings', {[channel]: rule}), true);
    assert.deepEqual(plain(p.api.local.get('channel_spoiler_settings')), {[channel]: rule});
    for (const days of [-1, 0, 1.5, '7', true, 2147483648]) {
        assert.deepEqual(plain(p.api.normalize('channel_spoiler_settings', {[channel]: {...rule, reveal_after_days: days}})), {});
    }
    assert.deepEqual(plain(p.api.normalize('channel_spoiler_settings', {invalid: rule})), {});
    const account = b.page(alice);
    assert.equal(account.api.local.get('channel_spoiler_settings'), undefined);
    assert.deepEqual(plain(b.page().api.local.get('channel_spoiler_settings')), {[channel]: rule});
});

test('browse restoration keeps bounded GET descriptors in the owning tab/profile only', () => {
    const b = browser(), p = b.page();
    const entry = {id:'view',url:'/search?q=ordinary',fingerprint:'a'.repeat(64),scroll:420,
        pages:[{url:'/search?q=ordinary&page=2',method:'GET'}]};
    assert.equal(p.api.session.set('browse_state',{views:[entry]}),true);
    assert.deepEqual(plain(p.api.session.get('browse_state')),{views:[entry]});
    assert.equal(b.page(alice).api.session.get('browse_state'),undefined);
    const clean = b.page().api.normalize('browse_state',{views:[entry,
        {...entry,id:'post',pages:[{url:'/search',method:'POST',body:'q=private'}]},
        {...entry,id:'external',pages:[{url:'//other.test/search',method:'GET'}]},
        {...entry,id:'huge',pages:Array(101).fill(entry.pages[0])}]});
    assert.deepEqual(plain(clean),{views:[entry]});
    assert.equal(p.api.normalize('navigation_collapsed','yes'),undefined);
    assert.equal(p.api.normalize('navigation_collapsed',true),true);
});

test('watch layout and docking use isolated validated profiles without inheriting guest state', () => {
    const b = browser();
    let p = b.page();
    assert.equal(p.api.local.get('watch_layout'), undefined);
    assert.equal(p.api.local.get('player_dock_enabled'), undefined);
    assert.equal(p.api.local.set('watch_layout', 'theater'), true);
    assert.equal(p.api.local.set('player_dock_enabled', true), true);
    for (const value of ['wide', '', true, {}, null]) assert.equal(p.api.local.set('watch_layout', value), false);
    for (const value of ['true', 1, {}, null]) assert.equal(p.api.local.set('player_dock_enabled', value), false);
    assert.equal(p.api.local.get('watch_layout'), 'theater');
    assert.equal(p.api.local.get('player_dock_enabled'), true);
    const guest = p;
    p = b.page(alice);
    assert.equal(p.api.local.get('watch_layout'), undefined);
    assert.equal(p.api.local.get('player_dock_enabled'), undefined);
    assert.equal(guest.api.local.set('watch_layout', 'standard'), false, 'stale guest cannot write after account change');
    p.api.local.set('watch_layout', 'standard'); p.api.local.set('player_dock_enabled', false);
    p = b.page(bob);
    assert.equal(p.api.local.get('watch_layout'), undefined);
    p = b.page();
    assert.equal(p.api.local.get('watch_layout'), 'theater');
    assert.equal(p.api.local.get('player_dock_enabled'), true);
    p = b.page(alice);
    assert.equal(p.api.local.get('watch_layout'), 'standard');
    assert.equal(p.api.local.get('player_dock_enabled'), false);
});

test('watch browser state distinguishes durable cookie fallback from page-only storage', () => {
    const b = browser();
    let p = b.page(alice, {denied:true});
    assert.equal(p.api.local.set('watch_layout', 'theater'), true);
    assert.equal(p.api.local.set('player_dock_enabled', true), true);
    p = b.page(alice, {denied:true});
    assert.equal(p.api.local.get('watch_layout'), 'theater');
    assert.equal(p.api.local.get('player_dock_enabled'), true);
    const c = browser();
    let ephemeral = c.page(alice, {denied:true,noCookies:true});
    assert.equal(ephemeral.api.local.set('watch_layout', 'theater'), false);
    assert.equal(ephemeral.api.local.set('player_dock_enabled', true), false);
    assert.equal(ephemeral.api.local.get('watch_layout'), 'theater');
    assert.equal(ephemeral.api.local.get('player_dock_enabled'), true);
    ephemeral = c.page(alice, {denied:true,noCookies:true});
    assert.equal(ephemeral.api.local.get('watch_layout'), undefined);
    assert.equal(ephemeral.api.local.get('player_dock_enabled'), undefined);
});


test('notification cached-page departure releases its lease and timers, then return starts one new stream', () => {
    const b = browser(), p = b.page(alice), state = loadNotifications(p);
    assert.equal(state.streams.length, 1);
    const old = state.streams[0];
    old.listeners.error();
    p.dispatch('pagehide', {persisted: true});
    p.flush();
    assert.equal(state.streams.length, 1, 'queued reconnect was canceled');
    assert.equal(old.closed, true);
    assert.equal(state.intervals.size, 0);
    assert.equal(p.api.local.get('stream'), undefined);
    p.dispatch('pageshow', {persisted: true}); p.flush();
    assert.equal(state.streams.length, 2);
    assert.equal(state.intervals.size, 1);
    const event = {id: 'message', data: JSON.stringify({videoId: video, published: Math.round(Date.now()/1000)+1})};
    old.onmessage(event);
    assert.equal(p.api.local.get('notification_count'), 0, 'closed stream callbacks are ignored after return');
    state.streams[1].onmessage(event);
    assert.equal(p.api.local.get('notification_count'), 1);
});

test('notification messages retain masking and tolerate missing optional avatar metadata', () => {
    const b = browser(), p = b.page(alice), messages = [];
    class Notification { static permission = 'granted'; constructor(title, options) { messages.push({title, options}); } }
    const spoilers = {decision() { return {hidden:true,label:'Title hidden'}; }};
    Object.assign(p.context, {Notification, InvidiousSpoilers: spoilers});
    Object.assign(p.context.window, {Notification, InvidiousSpoilers: spoilers});
    const state = loadNotifications(p);
    assert.doesNotThrow(() => state.streams[0].onmessage({id:'message',data:JSON.stringify({videoId:video,authorId:channel,author:'Creator',title:'Secret title',published:Math.round(Date.now()/1000)+1})}));
    assert.equal(messages.length, 1);
    assert.equal(messages[0].options.body, 'Title hidden');
    assert.equal(messages[0].options.icon, undefined);
    p.context.document.dispatchEvent({type:'iv:subscriptions-change'});
    assert.equal(typeof p.api.local.get('subscription_revision'), 'number');
    assert.equal(state.streams[0].closed, true);
});

test('unresolved notification channel identity keeps the in-page count without exposing a title in OS notifications', () => {
    const b=browser(),p=b.page(alice),messages=[];
    class Notification { static permission='granted'; constructor(title,options){messages.push({title,options});} }
    Object.assign(p.context,{Notification});Object.assign(p.context.window,{Notification});
    const state=loadNotifications(p);
    state.streams[0].onmessage({id:'unknown',data:JSON.stringify({videoId:video,title:'Unresolved title',published:Math.ceil(Date.now()/1000)+1})});
    assert.equal(p.api.local.get('notification_count'),1);assert.equal(messages.length,0);
});

test('persisted reads distinguish failed page-memory drafts from durable channel overrides',()=>{
    const b=browser(),p=b.page('guest',{denied:true,cookieDenied:true}),value={[channel]:{name:'Draft',enabled:true,modes:{sponsor:'manual'}}};
    assert.equal(p.api.local.set('sponsorblock_channel_overrides',value),false);
    assert.deepEqual(plain(p.api.local.get('sponsorblock_channel_overrides')),value);
    assert.equal(p.api.local.readStored('sponsorblock_channel_overrides'),undefined);
});

test('persisted channel reads follow durable changes and remain profile guarded',()=>{
    const b=browser(),p=b.page(alice),value={[channel]:{name:'Saved',enabled:null,modes:{intro:'marker'}}};
    assert.equal(p.api.local.set('sponsorblock_channel_overrides',value),true);
    assert.deepEqual(plain(p.api.local.readStored('sponsorblock_channel_overrides')),value);
    b.local[prefix+alice+':sponsorblock_channel_overrides']=JSON.stringify({});
    assert.deepEqual(plain(p.api.local.readStored('sponsorblock_channel_overrides')),{});
    b.cookies.set(marker,bob);
    assert.equal(p.api.local.readStored('sponsorblock_channel_overrides'),undefined);
});
