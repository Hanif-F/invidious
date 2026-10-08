'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../../assets/js/browser-storage.js'), 'utf8');
const alice = 'a'.repeat(64), bob = 'b'.repeat(64), video = 'abcdefghijk', channel = 'UC' + 'c'.repeat(22);
const prefix = 'iv:browser:v2:';
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
        if (options.marker !== false) cookies.set('IV_BROWSER_PROFILE', options.marker || scope);
        const events = {}, docEvents = {}, timers = [];
        const session = options.session || memoryStorage();
        const document = {
            getElementById(id) { return id === 'browser-profile' ? {textContent: JSON.stringify({scope, saveError: 'Save failed'})} : null; },
            addEventListener(name, callback) { (docEvents[name] ||= []).push(callback); }
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
        const context = vm.createContext({window, document, location: {protocol: 'https:', hostname: 'invidious.test', reload() { reloads++; }},
            Event: function (type) { this.type = type; }, setTimeout(callback) { timers.push(callback); }});
        vm.runInContext(source, context);
        return {api: window.InvidiousStorage, context, session, document, events,
            dispatch(name, event = {type: name}) { window.dispatchEvent({...event, type: name}); },
            flush() { while (timers.length) timers.shift()(); }, reloads: () => reloads};
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
    assert.equal(b.cookies.has('PREFS'), false);
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
    b.cookies.set('PREFS', JSON.stringify({theme: 'diary', volume: 7, speed: 1, password: 'discarded'}));
    assert.equal(p.api.guestSpeed(1.5, {theme: 'modern-neon', speed: 1}), true);
    assert.deepEqual(JSON.parse(b.cookies.get('PREFS')), {theme: 'diary', speed: 1.5});
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
    b.cookies.set('IV_BROWSER_PROFILE', alice); // A request started before Bob signed in.
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

function loadNotifications(p) {
    const streams = [], intervals = new Map();
    const original = p.document.getElementById;
    p.document.getElementById = id => id === 'notification_data' ? {textContent: '{"csrf_token":"fixture"}'} :
        id === 'notification_ticker' ? {innerHTML: ''} : original(id);
    Object.assign(p.context, {
        helpers: {storage: p.api.local, xhr(method, url, options, callbacks) { callbacks.on200([]); }},
        addEventListener: (...args) => p.context.window.addEventListener(...args),
        setInterval(callback) { const id = intervals.size + 1; intervals.set(id, callback); return id; },
        clearInterval(id) { intervals.delete(id); },
        console: {info() {}, warn() {}},
        SSE: class {
            constructor() { streams.push(this); this.closed = false; }
            close() { this.closed = true; } addEventListener() {} stream() {}
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
