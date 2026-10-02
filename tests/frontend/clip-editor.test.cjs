'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const context = {window: {}, document: {getElementById() { return null; }}};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../../assets/js/clip-editor.js'), 'utf8'), context);
const time = context.window.InvidiousClipTime;
test('elapsed timestamp entry rejects malformed and unsafe boundaries', () => {
    for (const [value, expected] of [['00:01', 1], ['1:05', 65], ['01:00:05', 3605], ['25:01:05', 90065], [' 00:01 ', 1]]) assert.equal(time.parse(value), expected);
    for (const value of ['', '1', '1.234', '00:60', '60:00', '01:60:00', '-1:00', '00:01.250', '1:2', '1::02', '999999999999999999999:00:00']) assert.equal(time.parse(value), null, value);
});
test('whole-second formatting supports minutes and unbounded hours', () => {
    assert.equal(time.format(1.9), '00:01');
    assert.equal(time.format(3599), '59:59');
    assert.equal(time.format(3599, true), '00:59:59');
    assert.equal(time.format(3605), '01:00:05');
    assert.equal(time.format(90065), '25:01:05');
});
test('initial selections use whole seconds and fit both ends and short videos', () => {
    for (const [position, duration, expected] of [[60.999, 200, [45, 75]], [0, 200, [0, 30]], [199, 200, [170, 200]], [5, 8, [0, 8]], [NaN, 200, [0, 30]], [3600, 7205, [3585, 3615]]]) assert.deepEqual(Array.from(time.defaultRange(position, duration)), expected);
});
