'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../../assets/js/channel-spoilers.js'), 'utf8');
const channel = 'UC' + 'a'.repeat(22);

function runtime(rules = {}, scope = 'account', code = source) {
    const callbacks = [], events = {}, scans = [];
    let reloads = 0, storedRules = rules, clock = 1791986400000;
    function element(parentElement = null, children = 0) {
        const attrs = new Map();
        return {nodeType: 1, tagName: 'DIV', isConnected: true, parentElement, childElementCount: children,
            hasAttribute(name) { return attrs.has(name); }, getAttribute(name) { return attrs.get(name) ?? null; },
            setAttribute(name, value) { attrs.set(name, value); },
            querySelectorAll(selector) { scans.push(selector); return []; }};
    }
    const document = {documentElement: element(), querySelectorAll() { return []; }, dispatchEvent() {},
        getElementById() { return {textContent: JSON.stringify({rules, now: 1791986400, page: null,
            labels: {title_hidden: 'Title hidden', thumbnail_hidden: 'Thumbnail hidden'}})}; }};
    const window = {InvidiousStorage: {scope, isCurrent() { return true; }, local: {get() { return storedRules; }, matchesEvent() { return true; }}},
        addEventListener(name, callback) { events[name] = callback; }};
    vm.runInNewContext(code, {window, document, AbortController, CustomEvent:class {constructor(type,options){this.type=type;this.detail=options.detail;}}, location: {reload() { reloads++; }},
        Date: class extends Date { static now() { return clock; } },
        MutationObserver: class { constructor(callback) { callbacks.push(callback); } observe() {} disconnect() {} }});
    return {window, callbacks, events, scans, element, reloads: () => reloads, setRules(value) { storedRules = value; }, advanceTime(ms) { clock += ms; }};
}

test('missing and null delays hide old uploads indefinitely; timed rules still expire', () => {
    for (const delay of [{}, {reveal_after_days: null}]) {
        const r = runtime({[channel]: {hide_title: true, hide_thumbnail: true, ...delay}});
        for (const kind of ['title', 'thumbnail']) {
            assert.equal(r.window.InvidiousSpoilers.decision(channel, 1262304000, kind).hidden, true);
        }
    }
    const r = runtime({[channel]: {hide_title: true, hide_thumbnail: true, reveal_after_days: 7}});
    assert.equal(r.window.InvidiousSpoilers.decision(channel, 1262304000, 'title').hidden, false);
});

test('inactive rules install no observers, scans, or storage listeners', () => {
    for (const scope of ['account', 'guest']) {
        const r = runtime({}, scope);
        assert.equal(r.callbacks.length, 0);
        assert.equal(r.scans.length, 0);
        assert.equal(typeof r.window.InvidiousSpoilers.scan, 'function');
        assert.equal(r.events.storage, undefined);
    }
});

test('a mutation batch scans only topmost subtrees and never queries leaf descendants', () => {
    const r = runtime({[channel]: {hide_title: true, reveal_after_days: null}});
    const root = r.element(null, 2), child = r.element(root, 1), grandchild = r.element(child, 1);
    r.scans.length = 0;
    r.callbacks[0]([{target: root, addedNodes: [root, child]}, {target: child, addedNodes: [grandchild, child]}]);
    assert.equal(r.scans.length, 1);
    r.scans.length = 0;
    r.callbacks[0]([{target: root, addedNodes: Array.from({length: 1000}, () => r.element())}]);
    assert.equal(r.scans.length, 0);
});

test('guest rules and masking clock stay fixed across storage edits and cached return', () => {
    const r=runtime({[channel]:{hide_title:true,hide_thumbnail:true,reveal_after_days:null}},'guest');
    r.setRules({});
    r.events.pagehide({persisted:true});r.events.pageshow({persisted:true});
    assert.equal(r.window.InvidiousSpoilers.decision(channel,1262304000,'title').hidden,true);
    assert.equal(r.events.storage,undefined);assert.equal(r.reloads(),0);
    const empty=runtime({},'guest');empty.setRules({[channel]:{hide_title:true,hide_thumbnail:true,reveal_after_days:null}});
    empty.events.pagehide({persisted:true});empty.events.pageshow({persisted:true});
    assert.equal(empty.window.InvidiousSpoilers.decision(channel,1262304000,'title').hidden,false);
    assert.equal(empty.callbacks.length,0);
});

test('cached return preserves the upload-age boundary captured when the document loaded', () => {
    const r=runtime({[channel]:{hide_title:true,reveal_after_days:7}},'guest');
    const published=1791986400-6*86400;
    assert.equal(r.window.InvidiousSpoilers.decision(channel,published,'title').hidden,true);
    r.advanceTime(2*86400*1000);
    r.events.pagehide({persisted:true});r.events.pageshow({persisted:true});
    assert.equal(r.window.InvidiousSpoilers.decision(channel,published,'title').hidden,true);
});

if (process.env.SPOILER_BASELINE_SCRIPT) {
    test('report before/after scanning work for 1000 unrelated leaf insertions', () => {
        const baseline = fs.readFileSync(process.env.SPOILER_BASELINE_SCRIPT, 'utf8');
        const results = [baseline, source].map(code => {
            const r = runtime({}, 'account', code);
            r.scans.length = 0;
            r.callbacks.forEach(callback => callback([{target: r.element(), addedNodes: Array.from({length: 1000}, () => r.element())}]));
            return {observers: r.callbacks.length, descendantScans: r.scans.length};
        });
        console.log('Inactive masking work: ' + JSON.stringify({before: results[0], after: results[1]}));
    });
}
