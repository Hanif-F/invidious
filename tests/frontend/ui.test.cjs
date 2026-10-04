'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { gzipSync } = require('node:zlib');
const playwright = require('playwright');
const root = path.resolve(__dirname, '../..');
const generated = process.env.FRONTEND_FIXTURES || path.join(__dirname, '.generated');
const artifacts = path.join(__dirname, 'artifacts');
const engines = (process.env.FRONTEND_BROWSERS || 'chromium,firefox').split(',');
const browsers = {};
fs.mkdirSync(artifacts, { recursive: true });
const queue = JSON.parse(fs.readFileSync(path.join(generated, 'queue.json')));

before(async () => {
    for (const engine of engines) browsers[engine] = await playwright[engine].launch({ headless: true });
});
after(async () => { for (const browser of Object.values(browsers)) await browser.close(); });

// Only playback and upstream responses are stubbed. Templates, CSS and UI scripts
// are production code. No request is allowed to escape this fixture origin.
const playerStub = `
window.__ended = []; window.__time = 0; window.__paused = true;
window.player = {
 on: function(event, cb) { if (event === 'ended') window.__ended.push(cb); },
 off: function(event, cb) { if (event === 'ended') window.__ended = window.__ended.filter(f => f !== cb); },
 paused: function() { return window.__paused; },
 pause: function() { window.__paused = true; },
 play: function() { window.__paused = false; return Promise.resolve(); },
 currentTime: function(value) { if (value !== undefined) window.__time = value; return window.__time; }
};`;
const picture = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720"><defs><linearGradient id="sky" x2="1" y2="1"><stop stop-color="#213b6b"/><stop offset=".6" stop-color="#744287"/><stop offset="1" stop-color="#df9378"/></linearGradient></defs><path fill="url(#sky)" d="M0 0h1280v720H0z"/><circle cx="860" cy="230" r="92" fill="#f4ccaf"/><path d="m0 520 360-330 440 440 250-285 230 235v140H0z" fill="#1e253d"/><path d="m0 655 430-215 470 200 380-160v240H0z" fill="#131b2d"/></svg>`;

async function pageFor(engine, options = {}) {
    const context = await browsers[engine].newContext({
        viewport: { width: options.width || 1440, height: options.height || 1000 },
        javaScriptEnabled: options.javascript !== false,
        colorScheme: options.systemTheme || 'dark',
        reducedMotion: 'reduce',
        hasTouch: Boolean(options.touch),
        ...(options.mobileUserAgent ? { userAgent: 'Mozilla/5.0 (Linux; Android 15; Mobile) AppleWebKit/537.36 Chrome/140 Mobile Safari/537.36' } : {})
    });
    if (options.initScript) await context.addInitScript(options.initScript);
    const page = await context.newPage();
    const errors = [];
    const requests = [];
    page.on('pageerror', error => errors.push(error.message));
    let queueCalls = 0;
    let transcriptCalls = 0;
    let chatCalls = 0;
    const chatWrites = [];
    const fixture = options.fixture || 'watch-dark';
    await context.route('**/*', async route => {
        const url = new URL(route.request().url());
        requests.push(url.pathname + url.search);
        if (route.request().isNavigationRequest()) {
            let body = fs.readFileSync(path.join(generated, (url.pathname.startsWith('/embed/') ? 'embed-mobile' : fixture) + '.html'), 'utf8');
            if (url.searchParams.get('clip_preview') === '1') {
                body = body.replace(/(<script id="video_data"[^>]*>)([\s\S]*?)(<\/script>)/, (_, start, data, end) => {
                    const original = JSON.parse(data);
                    return start + JSON.stringify({...original, clip: {startTime: Number(url.searchParams.get('start')), endTime: Number(url.searchParams.get('end'))}, params: {...original.params, video_start: Number(url.searchParams.get('start')), video_end: Number(url.searchParams.get('end')), video_loop: true, autoplay: true, save_player_pos: false}}) + end;
                });
            }
            if (options.videoData) {
                body = body.replace(/(<script id="video_data"[^>]*>)([\s\S]*?)(<\/script>)/, (_, start, data, end) => {
                    const original = JSON.parse(data);
                    const updated = { ...original, ...options.videoData, params: { ...original.params, ...options.videoData.params } };
                    return start + JSON.stringify(updated).replace(/</g, '\\u003c') + end;
                });
            }
            if (options.playerData) {
                body = body.replace(/(<script id="player_data"[^>]*>)([\s\S]*?)(<\/script>)/, (_, start, data, end) => {
                    const original = JSON.parse(data);
                    return start + JSON.stringify({...original, ...options.playerData}).replace(/</g, '\\u003c') + end;
                });
            }
            if (options.dearrowOriginal) body = body.replace(/(<[^>]+data-dearrow-id=[^>]+>)[^<]*(<\/)/g, (_, start, end) => start + options.dearrowOriginal + end);
            if (options.extraQuality) body = body.replace('</video>', '<source src="/latest_version?id=2isYuQZMbdU&itag=44" type="video/webm" label="high"></video>');
            if (options.sponsorblock) body = body.replace(/(<script id="player_data"[^>]*>)([\s\S]*?)(<\/script>)/, (_, start, data, end) => start + JSON.stringify({...JSON.parse(data), sponsorblock: {...JSON.parse(data).sponsorblock, ...options.sponsorblock}}).replace(/</g, '\\u003c') + end);
            return route.fulfill({ contentType: 'text/html', body });
        }
        if (url.pathname.startsWith('/api/v1/sponsorblock/')) return route.fulfill({ status: options.sponsorblockError ? 503 : 200, contentType: 'application/json', body: JSON.stringify({segments: options.sponsorblockSegments || []}) });
        if (url.pathname.startsWith('/api/v1/dearrow/')) {
            if (options.dearrowError) return route.fulfill({ status: 503, body: '{}' });
            return route.fulfill({ contentType: 'application/json', body: JSON.stringify({title: options.dearrowMissing ? null : (options.dearrowTitle ?? 'A clear title <img src=x onerror=alert(1)>')}) });
        }
        if (url.pathname === '/api/v1/auth/playback') return route.fulfill({ contentType: 'application/json', body: JSON.stringify(options.playback || {positions: {}, watched: []}) });
        if (url.pathname === '/api/v1/auth/subscriptions') return route.fulfill({ contentType: 'application/json', body: '[]' });
        if (url.pathname === '/api/v1/auth/notifications') return route.fulfill({ contentType: 'text/event-stream', body: ': fixture\n\n' });
        if (/^\/api\/v1\/(playlists|mixes)\//.test(url.pathname)) {
            queueCalls++;
            if (options.queueError && queueCalls <= options.queueError) return route.fulfill({ status: 500, body: '{}' });
            let response = options.queue || (fixture === 'watch-thin' ? JSON.parse(fs.readFileSync(path.join(generated, 'queue-thin.json'))) : queue);
            if (options.dearrowOriginal) response = {...response, playlistHtml: response.playlistHtml.replace(/(<[^>]+data-dearrow-id=[^>]+>)[^<]*(<\/)/g, (_, start, end) => start + options.dearrowOriginal + end)};
            return route.fulfill({ contentType: 'application/json', body: JSON.stringify(response) });
        }
        if (url.pathname.startsWith('/api/v1/transcripts/')) {
            transcriptCalls++;
            if (options.transcriptError && transcriptCalls <= options.transcriptError) return route.fulfill({ status: 500, body: '{}' });
            return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ transcript: { autoGenerated: url.searchParams.get('label').includes('Indonesian'), body: [
                { type: 'heading', startMs: 0, line: 'Introduction' },
                { type: 'regular', startMs: 80000, line: 'Finding the light <img src=x onerror=alert(1)>' },
                { type: 'regular', startMs: 225000, line: 'Color in motion' }
            ] } }) });
        }
        if (url.pathname.startsWith('/api/v1/live_chat/')) {
            chatCalls++;
            if (options.chatReply) {
                const reply = options.chatReply(url, chatCalls);
                if (reply.delay) await new Promise(resolve => setTimeout(resolve, reply.delay));
                return route.fulfill({contentType: 'application/json', body: JSON.stringify(reply.data)});
            }
            if (options.chatError && chatCalls <= options.chatError) return route.fulfill({status: 503, contentType: 'application/json', body: '{}'});
            if (options.chatUnavailable) return route.fulfill({status: 404, contentType: 'application/json', body: '{}'});
            if (options.chatMessages) return route.fulfill({contentType: 'application/json', body: JSON.stringify({messages: options.chatMessages, removedIds: [], continuation: null})});
            const offset = Number(url.searchParams.get('offset_ms') || 0);
            const second = Boolean(url.searchParams.get('continuation')) || offset >= 2000;
            const messages = second ? [
                {id: 'late', offsetMs: 2500, author: 'Supporter', text: 'Great stream', kind: 'paid', amount: '$5'}
            ] : [
                {id: 'early', offsetMs: 0, author: 'Viewer <img src=x onerror=alert(1)>', text: 'Hello <script>alert(1)</script>', kind: 'text', amount: ''},
                {id: 'middle', offsetMs: 1000, author: 'Member', text: 'Here!', kind: 'membership', amount: ''}
            ];
            return route.fulfill({contentType: 'application/json', body: JSON.stringify({messages, removedIds: [], continuation: second ? null : 'next'})});
        }
        if (url.pathname === '/api/v1/auth/csrf') return route.fulfill({contentType: 'application/json', body: '{"csrfToken":"fixture-token"}'});
        if (url.pathname === '/api/v1/auth/chat_preferences' || url.pathname.startsWith('/api/v1/auth/chat_timing/')) {
            chatWrites.push({path: url.pathname, method: route.request().method(), body: JSON.parse(route.request().postData() || '{}')});
            return route.fulfill({contentType: 'application/json', body: '{}'});
        }
        if (url.pathname === '/js/silvermine-videojs-quality-selector.min.js' && !options.realPlayer) return route.fulfill({ contentType: 'application/javascript', body: '' });
        if (url.pathname === '/js/player.js' && !options.realPlayer) return route.fulfill({ contentType: 'application/javascript', body: playerStub });
        if (url.pathname.startsWith('/videojs/') && !options.realPlayer) return route.fulfill({ contentType: url.pathname.endsWith('.css') ? 'text/css' : 'application/javascript', body: '' });
        if (options.brokenAvatars && url.pathname.startsWith('/ggpht')) return route.fulfill({ status: 404, body: '' });
        if (url.pathname.startsWith('/vi/') || url.pathname.startsWith('/ggpht')) return route.fulfill({ contentType: 'image/svg+xml', body: picture });
        if (options.realPlayer && url.pathname === '/latest_version') {
            const body = fs.readFileSync(path.join(generated, fixture === 'clip-watch' || new URL(route.request().frame().url()).searchParams.get('clip_preview') === '1' ? 'clip-fixture.webm' : 'fixture.webm'));
            const range = route.request().headers().range;
            const match = range && range.match(/bytes=(\d+)-(\d*)/);
            if (match) {
                const start = Number(match[1]);
                const end = match[2] ? Math.min(Number(match[2]), body.length - 1) : body.length - 1;
                return route.fulfill({ status: 206, contentType: 'video/webm', headers: { 'accept-ranges': 'bytes', 'content-range': `bytes ${start}-${end}/${body.length}` }, body: body.subarray(start, end + 1) });
            }
            return route.fulfill({ contentType: 'video/webm', headers: { 'accept-ranges': 'bytes' }, body });
        }
        if (options.storyboards && url.pathname.startsWith('/api/v1/storyboards/')) return route.fulfill({contentType:'text/vtt', body:'WEBVTT\n\n00:00.000 --> 00:04.000\nhttps://invidious.test/vi/fixture/preview.jpg#xywh=0,0,160,90\n'});
        if (url.pathname.startsWith('/api/v1/captions/')) return route.fulfill({ contentType: 'text/vtt', body: 'WEBVTT\n\n00:00.000 --> 00:04.000\nFixture captions\n' });
        if (url.pathname === '/themes/fixture-theme/theme.css') return route.fulfill({ contentType: 'text/css', body: 'body { --fixture-theme: active; }' });
        if (/^\/(css|js|fonts|videojs|themes)\//.test(url.pathname)) {
            const file = path.join(root, 'assets', url.pathname);
            if (!fs.existsSync(file)) return route.fulfill({ status: 404, body: '' });
            return route.fulfill({ contentType: url.pathname.endsWith('.css') ? 'text/css' : url.pathname.endsWith('.js') ? 'application/javascript' : url.pathname.endsWith('.svg') ? 'image/svg+xml' : 'application/octet-stream', body: fs.readFileSync(file) });
        }
        return route.fulfill({ contentType: 'application/json', body: '{}' });
    });
    await page.goto('https://invidious.test/' + (options.route || (fixture.startsWith('watch') ? 'watch?v=2isYuQZMbdU&list=PLfixture&index=2' : fixture.startsWith('preferences') ? 'preferences' : fixture.startsWith('search') ? 'search?q=light' : 'feed/popular')));
    return { page, context, errors, requests, chatWrites, queueCalls: () => queueCalls, transcriptCalls: () => transcriptCalls, chatCalls: () => chatCalls };
}

for (const engine of engines) {
    test(`${engine}: native clip cards, tab, attribution and no-JavaScript library`, async () => {
        for (const fixture of ['clips-library', 'clips-diary', 'clips-rtl', 'channel-clips', 'clips-empty']) {
            const {page, context, errors} = await pageFor(engine, {fixture, width: 390, javascript: false});
            if (fixture !== 'clips-empty') {
                assert.match(await page.locator('.clip-card h3').textContent(), /Moment <script>/);
                assert.equal(await page.locator('.clip-card script').count(), 0);
                assert.match(await page.locator('.clip-card').textContent(), /viewer/);
            }
            if (fixture === 'channel-clips') assert.equal(await page.locator('.channel-tabs [aria-current=page]').textContent(), 'Clips');
            if (fixture === 'clips-library') {
                const links = await page.locator('.navigation-link').allTextContents();
                assert.ok(links.findIndex(x => x.includes('My Clips')) === links.findIndex(x => x.includes('Playlists')) + 1);
                assert.equal(await page.locator('a[href^="/delete_clip"]').count(), 1);
            }
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
            assert.deepEqual(errors, []); await context.close();
        }
    });
    test(`${engine}: clip creation timestamps, draggable selection, preview and no-JavaScript form`, async () => {
        const {page, context, errors} = await pageFor(engine, {fixture:'create-clip', width:390});
        await page.locator('#clip-title').fill('A new moment');
        await page.locator('#clip-start').fill('00:01'); await page.locator('#clip-end').fill('00:06');
        assert.match(await page.locator('#clip-duration').textContent(), /00:05/);
        await page.locator('#clip-end').fill('00:03'); assert.equal(await page.locator('#clip-preview').isDisabled(), true);
        await page.locator('#clip-end').fill('00:06');
        await page.locator('#clip-start-range').evaluate(input => { input.value = '2'; input.dispatchEvent(new Event('input', {bubbles:true})); });
        assert.equal(await page.locator('#clip-start').inputValue(), '00:01');
        await page.locator('#clip-preview').click();
        const src = await page.locator('#clip-preview-frame').getAttribute('src');
        assert.ok(src.startsWith('/embed/')); assert.ok(src.includes('clip_preview=1')); assert.ok(src.includes('loop=1'));
        await page.locator('#clip-end').fill('00:07');
        assert.equal(await page.locator('#clip-preview-frame').getAttribute('src'), null);
        assert.deepEqual(errors, []); await context.close();
        const nojs = await pageFor(engine, {fixture:'create-clip-diary', width:320, javascript:false});
        assert.equal(await nojs.page.locator('form#clip-editor').getAttribute('method'), 'post');
        assert.equal(await nojs.page.locator('#clip-editor input[name=csrf_token]').count(), 1);
        assert.equal(await nojs.page.locator('#clip-start').getAttribute('type'), 'text');
        await nojs.page.locator('#clip-start').fill('00:01'); await nojs.page.locator('#clip-end').fill('00:06');
        assert.equal(await nojs.page.locator('#clip-editor').evaluate(form => form.checkValidity()), false); // Title is required.
        await nojs.page.locator('#clip-title').fill('Fallback clip');
        assert.equal(await nojs.page.locator('#clip-editor').evaluate(form => form.checkValidity()), true);
        assert.equal(await nojs.page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        await nojs.context.close();
    });
    test(`${engine}: clip popup preserves playback, timestamps, drafts and keyboard focus`, async () => {
        const {page, context, requests, errors} = await pageFor(engine, {fixture:'watch-clips-modern-neon-dark'});
        assert.ok(!requests.some(url => /\/(clip-editor.js|clips.css)/.test(url)));
        await page.evaluate(() => { player.currentTime(3600.9); player.play(); });
        const watchURL = page.url();
        await page.locator('#create-clip').click();
        await page.waitForFunction(() => document.getElementById('clip-dialog').open);
        assert.equal(page.url(), watchURL);
        assert.equal(await page.evaluate(() => player.paused()), true);
        assert.equal(await page.locator('#clip-start').inputValue(), '00:59:45');
        assert.equal(await page.locator('#clip-end').inputValue(), '01:00:15');
        assert.equal(await page.locator('#clip-publish').isDisabled(), true);
        await page.locator('#clip-title').fill('A draft <script> & title');
        await page.locator('#clip-start').fill('59:59'); await page.locator('#clip-end').fill('01:00:04');
        await page.locator('#clip-start').focus(); await page.locator('#clip-start').blur();
        assert.equal(await page.locator('#clip-start').inputValue(), '00:59:59');
        assert.equal(await page.locator('#clip-publish').isDisabled(), false);
        for (const value of ['00:60', '60:00', '1', '00:01.250', '03:00:00']) {
            await page.locator('#clip-end').fill(value);
            assert.equal(await page.locator('#clip-publish').isDisabled(), true, value);
            assert.equal(await page.locator('#clip-end').getAttribute('aria-invalid'), 'true');
        }
        await page.locator('#clip-start').fill('00:00'); await page.locator('#clip-end').fill('02:00');
        assert.equal(await page.locator('#clip-publish').isDisabled(), false);
        await page.locator('#clip-end').fill('02:01'); assert.equal(await page.locator('#clip-publish').isDisabled(), true);
        await page.locator('#clip-end').fill('02:00');
        const sliderBox = await page.locator('#clip-start-range').boundingBox();
        await page.mouse.move(sliderBox.x + 12, sliderBox.y + 12);
        await page.mouse.down(); await page.mouse.move(sliderBox.x + 90, sliderBox.y + 12, {steps:5}); await page.mouse.up();
        assert.ok(Number(await page.locator('#clip-start-range').inputValue()) > 0);
        await page.locator('#clip-start').fill('00:00');
        await page.locator('#clip-start-range').focus(); await page.keyboard.press('ArrowRight');
        assert.equal(await page.locator('#clip-start').inputValue(), '00:01');
        await page.locator('[data-clip-boundary=start][data-clip-step="1"]').click();
        assert.equal(await page.locator('#clip-start').inputValue(), '00:02');
        await page.locator('.clip-use-time[data-clip-boundary=start]').click();
        assert.equal(await page.locator('#clip-start').inputValue(), '01:00:00');
        await page.keyboard.press('Escape');
        await page.waitForFunction(() => !document.getElementById('clip-dialog').open);
        assert.equal(await page.evaluate(() => player.paused()), false);
        assert.equal(await page.evaluate(() => player.currentTime()), 3600.9);
        assert.equal(await page.locator('#create-clip').evaluate(el => el === document.activeElement), true);
        assert.equal(await page.evaluate(() => document.documentElement.style.overflow), '');
        await page.locator('#create-clip').click();
        assert.equal(await page.locator('#clip-title').inputValue(), 'A draft <script> & title');
        assert.equal(await page.locator('#clip-start').inputValue(), '01:00:00');
        await page.locator('#clip-close').focus(); await page.keyboard.press('Shift+Tab');
        assert.equal(await page.evaluate(() => document.getElementById('clip-dialog').contains(document.activeElement)), true);
        await page.locator('#clip-close').click();
        assert.deepEqual(errors, []); await context.close();
    });
    test(`${engine}: clip popup publishes once, recovers errors and shows a safe share result`, async () => {
        const {page, context, errors} = await pageFor(engine, {fixture:'watch-clips-modern-neon-dark', initScript: () => Object.defineProperty(navigator, 'clipboard', {value: undefined, configurable:true})});
        let calls = 0, received;
        await page.route('**/api/v1/auth/clips', async route => {
            calls++; received = JSON.parse(route.request().postData());
            assert.equal(route.request().headers()['x-csrf-token'], 'fixture-token');
            if (calls === 1) return route.fulfill({status:403, contentType:'application/json', body:'{"error":"Expired session"}'});
            if (calls === 2) return route.fulfill({status:500, contentType:'application/json', body:'{"error":"Source temporarily unavailable"}'});
            await new Promise(resolve => setTimeout(resolve, 100));
            return route.fulfill({status:201, contentType:'application/json', body:JSON.stringify({clipId:'IVCL' + 'a'.repeat(32), clipTitle:'Safe <script> & title'})});
        });
        await page.locator('#create-clip').click();
        await page.waitForFunction(() => document.getElementById('clip-dialog').open);
        await page.locator('#clip-title').fill('Safe <script> & title');
        await page.locator('#clip-start').fill('00:10'); await page.locator('#clip-end').fill('00:15');
        await page.locator('#clip-publish').click(); await page.locator('#clip-submit-status').waitFor({state:'visible'});
        assert.match(await page.locator('#clip-submit-status').textContent(), /session expired/);
        await page.waitForFunction(() => !document.getElementById('clip-publish').disabled);
        await page.locator('#clip-publish').click();
        await page.waitForFunction(() => document.getElementById('clip-submit-status').textContent.includes('Source temporarily'));
        assert.equal(await page.locator('#clip-title').inputValue(), 'Safe <script> & title');
        assert.equal(await page.locator('#clip-start').inputValue(), '00:10');
        await page.waitForFunction(() => !document.getElementById('clip-publish').disabled);
        await page.evaluate(() => { const form = document.getElementById('clip-editor'); form.dispatchEvent(new Event('submit', {cancelable:true})); form.dispatchEvent(new Event('submit', {cancelable:true})); });
        await page.locator('#clip-result').waitFor({state:'visible'});
        assert.equal(calls, 3);
        assert.deepEqual(received, {videoId:'2isYuQZMbdU', title:'Safe <script> & title', startTime:10, endTime:15});
        assert.equal(await page.locator('#clip-result script').count(), 0);
        assert.equal(await page.locator('#clip-result-title').textContent(), 'Safe <script> & title');
        assert.equal(await page.locator('#clip-share-url').inputValue(), 'https://invidious.test/clip/IVCL' + 'a'.repeat(32));
        await page.locator('#clip-copy').click();
        assert.match(await page.locator('#clip-copy-status').textContent(), /Select and copy/);
        assert.equal(await page.locator('#clip-share-url').evaluate(el => el.selectionEnd - el.selectionStart), (await page.locator('#clip-share-url').inputValue()).length);
        await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', {value: {writeText: async value => { window.__copiedClip = value; }}, configurable:true}));
        await page.locator('#clip-copy').click();
        assert.equal(await page.evaluate(() => window.__copiedClip), 'https://invidious.test/clip/IVCL' + 'a'.repeat(32));
        await page.locator('#clip-done').click(); await page.locator('#create-clip').click();
        assert.equal(await page.locator('#clip-title').inputValue(), '');
        assert.equal(await page.locator('#clip-result').isVisible(), false);
        assert.deepEqual(errors, []); await context.close();
    });
    test(`${engine}: closing during publishing preserves the pending draft and unseen result`, async () => {
        const {page, context, errors} = await pageFor(engine, {fixture:'watch-clips-modern-neon-dark'});
        let release, submitted, calls = 0;
        const sent = new Promise(resolve => { submitted = resolve; });
        const response = new Promise(resolve => { release = resolve; });
        await page.route('**/api/v1/auth/clips', async route => {
            calls++; submitted(); await response;
            return route.fulfill({status:201, contentType:'application/json', body:JSON.stringify({clipId:'IVCL' + 'b'.repeat(32), clipTitle:'Pending draft'})});
        });
        await page.locator('#create-clip').click(); await page.waitForFunction(() => document.getElementById('clip-dialog').open);
        await page.locator('#clip-title').fill('Pending draft'); await page.locator('#clip-publish').click(); await sent;
        await page.locator('#clip-close').click(); await page.locator('#create-clip').click();
        assert.equal(await page.locator('#clip-title').inputValue(), 'Pending draft');
        assert.equal(await page.locator('#clip-publish').isDisabled(), true);
        await page.locator('#clip-close').click(); release();
        await page.waitForFunction(() => document.getElementById('clip-result-title').textContent === 'Pending draft');
        await page.locator('#create-clip').click();
        assert.equal(await page.locator('#clip-result').isVisible(), true);
        assert.equal(await page.locator('#clip-share-url').inputValue(), 'https://invidious.test/clip/IVCL' + 'b'.repeat(32));
        assert.equal(calls, 1); assert.deepEqual(errors, []); await context.close();
    });
    test(`${engine}: clip popup preview uses its playhead and never changes source resume data`, async () => {
        const {page, context, errors} = await pageFor(engine, {fixture:'watch-clips-modern-neon-dark', realPlayer:true,
            initScript: () => localStorage.setItem('save_player_pos', JSON.stringify({'2isYuQZMbdU': 123}))});
        await page.evaluate(() => { player.muted(true); player.currentTime(1); });
        await page.locator('#create-clip').click();
        await page.waitForFunction(() => document.getElementById('clip-dialog').open);
        await page.locator('#clip-start').fill('00:01'); await page.locator('#clip-end').fill('00:06');
        await page.locator('#clip-preview').click();
        const preview = page.frameLocator('#clip-preview-frame');
        await preview.locator('#player').waitFor();
        await page.locator('#clip-preview-frame').evaluate(frame => { frame.contentWindow.player.muted(true); frame.contentWindow.player.play(); });
        await page.waitForFunction(() => { const p = document.getElementById('clip-preview-frame').contentWindow.player; return p && p.currentTime() >= 1; });
        await page.locator('#clip-preview-frame').evaluate(frame => {
            const p = frame.contentWindow.player;
            p.currentTime(0); if (p.currentTime() < 1) throw new Error('Preview escaped start');
            p.currentTime(100); if (p.currentTime() >= 6) throw new Error('Preview escaped end');
        });
        await page.locator('#clip-preview-frame').evaluate(frame => { frame.contentWindow.player.pause(); frame.contentWindow.player.currentTime(2.8); });
        await page.locator('.clip-use-time[data-clip-boundary=start]').click();
        assert.equal(await page.locator('#clip-start').inputValue(), '00:02');
        assert.equal(await page.locator('#clip-preview-frame').getAttribute('src'), null);
        await page.locator('#clip-close').click();
        assert.equal(await page.evaluate(() => player.paused()), true);
        assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('save_player_pos'))['2isYuQZMbdU']), 123);
        assert.deepEqual(errors, []); await context.close();
    });
    test(`${engine}: clip popup themes, RTL, short videos and responsive actions`, async () => {
        for (const fixture of ['watch-clips-modern-neon-dark', 'watch-clips-modern-neon-light', 'watch-clips-diary-dark', 'watch-clips-diary-light', 'watch-clips-rtl', 'watch-clips-short']) {
            for (const width of [1440, 390, 320]) {
                const {page, context, errors} = await pageFor(engine, {fixture, width, height:844, touch:width < 500});
                await page.locator('#create-clip').click(); await page.waitForFunction(() => document.getElementById('clip-dialog').open);
                if (fixture === 'watch-clips-short') assert.equal(await page.locator('#clip-end').inputValue(), '00:05');
                const box = await page.locator('#clip-dialog').boundingBox();
                if (width < 500) { assert.equal(box.x, 0); assert.equal(box.width, width); }
                assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
                assert.equal(await page.locator('#clip-dialog').evaluate(el => el.scrollWidth > el.clientWidth + 1), false);
                const footer = await page.locator('.clip-footer').boundingBox();
                assert.ok(footer.y + footer.height <= 845);
                await page.locator('#clip-title').fill('Responsive clip');
                if (width === 390 || (width === 1440 && fixture === 'watch-clips-modern-neon-dark')) await page.screenshot({path:path.join(artifacts, `${engine}-${fixture}-popup-${width}.png`)});
                await page.locator('.clip-body').evaluate(el => { el.scrollTop = el.scrollHeight; });
                assert.equal(await page.locator('#clip-close').isVisible(), true);
                assert.deepEqual(errors, []); await context.close();
            }
        }
    });
    test(`${engine}: clip popup enlarged text and landscape keep fields and actions reachable`, async () => {
        for (const [width, height, touch] of [[1440, 900, false], [390, 844, true], [844, 390, true]]) {
            const {page, context, errors} = await pageFor(engine, {fixture:'watch-clips-modern-neon-dark', width, height, touch});
            await page.locator('#create-clip').click(); await page.waitForFunction(() => document.getElementById('clip-dialog').open);
            await page.addStyleTag({content:'html { font-size: 200% !important; }'});
            assert.equal(await page.locator('#clip-dialog').evaluate(el => el.scrollWidth > el.clientWidth + 1), false);
            const box = await page.locator('#clip-publish').boundingBox();
            assert.ok(box.y >= 0 && box.y + box.height <= height + 1);
            await page.locator('#clip-end').fill('00:05');
            assert.equal(await page.locator('#clip-end').isVisible(), true);
            await page.locator('#clip-close').click();
            assert.deepEqual(errors, []); await context.close();
        }
    });
    test(`${engine}: guests return from login to the clip popup and asset failures use the fallback form`, async () => {
        const guest = await pageFor(engine, {fixture:'watch-dark'});
        await guest.page.evaluate(() => player.currentTime(65));
        await guest.page.locator('#create-clip').click(); await guest.page.waitForURL('**/login?*');
        const referer = new URL(new URL(guest.page.url()).searchParams.get('referer'), 'https://invidious.test');
        assert.equal(referer.searchParams.get('create_clip'), '1'); assert.equal(referer.searchParams.get('t'), '65');
        await guest.context.close();
        const returned = await pageFor(engine, {fixture:'watch-clips-modern-neon-dark', route:'watch?v=2isYuQZMbdU&create_clip=1&t=65'});
        await returned.page.waitForFunction(() => document.getElementById('clip-dialog').open);
        assert.equal(await returned.page.locator('#clip-start').inputValue(), '00:50');
        assert.equal(new URL(returned.page.url()).searchParams.has('create_clip'), false);
        await returned.context.close();
        const fallback = await pageFor(engine, {fixture:'watch-clips-modern-neon-dark'});
        await fallback.page.route('**/js/clip-editor.js?*', route => route.abort());
        await fallback.page.locator('#create-clip').click(); await fallback.page.waitForURL('**/create_clip?*');
        assert.equal(new URL(fallback.page.url()).searchParams.get('videoId'), '2isYuQZMbdU');
        await fallback.context.close();
    });
    test(`${engine}: native clip boundaries, loop toggle, canonical sharing and resume isolation`, async () => {
        const {page, context, errors, requests} = await pageFor(engine, {
            fixture:'clip-watch', realPlayer:true, route:'clip/IVCL' + 'a'.repeat(32),
            initScript: () => { localStorage.setItem('save_player_pos', JSON.stringify({'2isYuQZMbdU': 123})); Object.defineProperty(navigator, 'clipboard', {value: undefined}); }
        });
        await page.evaluate(() => { player.muted(true); player.play(); });
        await page.waitForFunction(() => player.currentTime() >= .5 && !player.paused());
        await page.evaluate(() => player.currentTime(0));
        await page.waitForFunction(() => player.currentTime() >= .5 && player.currentTime() < 1.5);
        await page.evaluate(() => player.currentTime(5.45));
        await page.waitForFunction(() => player.currentTime() >= .5 && player.currentTime() < 1.5);
        await page.locator('#clip-loop').uncheck();
        await page.evaluate(() => player.currentTime(5.45));
        await page.waitForFunction(() => player.paused());
        assert.ok(await page.evaluate(() => player.currentTime()) <= 5.5);
        assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('save_player_pos'))['2isYuQZMbdU']), 123);
        assert.equal(requests.some(url => /watch_ajax.*(set_progress|clear_progress)/.test(url)), false);
        assert.equal(requests.some(url => url.startsWith('/api/v1/playlists/')), false);
        assert.equal(await page.locator('#continue').count(), 0);
        assert.ok((await page.locator('#link-iv-listen').getAttribute('href')).includes('loop=0'));
        await page.locator('#share-video').click();
        assert.equal(await page.locator('#share-url').inputValue(), 'https://invidious.test/clip/IVCL' + 'a'.repeat(32));
        assert.equal(await page.locator('meta[property="og:url"]').getAttribute('content'), 'https://invidious.test/clip/IVCL' + 'a'.repeat(32));
        assert.equal(await page.locator('link[rel="canonical"]').getAttribute('href'), 'https://invidious.test/clip/IVCL' + 'a'.repeat(32));
        assert.equal(await page.locator('meta[name="twitter:player"]').count(), 0);
        assert.equal(await page.locator('#link-yt-embed, #link-iv-embed').count(), 0);
        assert.ok((await page.locator('#annotations a').getAttribute('href')).startsWith('/clip/IVCL'));
        assert.ok((await page.locator('#link-iv-listen').getAttribute('href')).startsWith('/clip/IVCL'));
        assert.equal(await page.locator('.watch-heading script').count(), 0);
        await page.screenshot({path:path.join(artifacts, `${engine}-native-clip.png`)});
        assert.deepEqual(errors, []); await context.close();
    });
    test(`${engine}: native clip SponsorBlock, audio settings and source refresh retain saved bounds`, async () => {
        const {page, context, errors} = await pageFor(engine, {
            fixture:'clip-watch', realPlayer:true, extraQuality:true,
            videoData:{params:{listen:true}},
            sponsorblock:{enabled:true,modes:{sponsor:'manual'}},
            sponsorblockSegments:[{id:'beyond-clip',category:'sponsor',start:1,end:7}]
        });
        await page.evaluate(() => { player.muted(true); player.play(); });
        await page.waitForFunction(() => player.currentTime() >= .5 && !player.seeking());
        await page.evaluate(() => { player.pause(); player.currentTime(2); });
        await page.waitForFunction(() => document.querySelector('.sb-overlay').classList.contains('sb-visible'));
        await page.getByRole('button', {name:'Skip (Enter)',exact:true}).click();
        await page.waitForFunction(() => player.currentTime() >= .5 && player.currentTime() < 1);
        await page.locator('#clip-loop').uncheck();
        await page.evaluate(() => player.currentTime(2));
        await page.waitForFunction(() => document.querySelector('.sb-overlay').classList.contains('sb-visible'));
        await page.getByRole('button', {name:'Skip (Enter)',exact:true}).click();
        await page.waitForFunction(() => player.paused() && player.currentTime() > 5.49 && player.currentTime() <= 5.5);
        await page.evaluate(() => { player.currentTime(3); player.refreshBuffer(); });
        await page.waitForFunction(() => !player.seeking() && Math.abs(player.currentTime() - 3) < .05);
        await page.evaluate(() => { player.src({src:'/latest_version?id=2isYuQZMbdU&itag=44',type:'video/webm'}); player.play(); });
        await page.waitForFunction(() => player.readyState() > 0 && !player.seeking() && player.currentTime() >= .5 && player.currentTime() < 5.5);
        await page.evaluate(() => player.currentTime(0));
        await page.waitForFunction(() => player.currentTime() >= .5 && player.currentTime() < 1);
        assert.deepEqual(errors, []); await context.close();
    });
}

for (const engine of engines) {
    test(`${engine}: chat replay keeps fetched messages across pause and seeks`, async () => {
        const {page, context, errors, requests, chatCalls} = await pageFor(engine, {fixture: 'watch-chat', realPlayer: true});
        await page.locator('.chat-message').first().waitFor();
        assert.equal(await page.locator('.chat-message').count(), 1);
        assert.match(await page.locator('.chat-message').first().textContent(), /Hello <script>alert\(1\)<\/script>/);
        assert.equal(await page.locator('.chat-message script, .chat-message img').count(), 0);
        await page.evaluate(() => player.play());
        await page.waitForFunction(() => player.currentTime() >= 1.1);
        await page.getByText('Here!', {exact: true}).waitFor();
        await page.evaluate(() => player.pause());
        const pausedCount = await page.locator('.chat-message').count();
        await page.waitForTimeout(900);
        const callsBeforePause = chatCalls();
        await page.waitForTimeout(300);
        assert.equal(await page.locator('.chat-message').count(), pausedCount);
        await page.evaluate(() => player.currentTime(0.6));
        await page.getByText('Here!', {exact: true}).waitFor({state: 'detached'});
        await page.evaluate(() => player.currentTime(1.1));
        await page.getByText('Here!', {exact: true}).waitFor();
        assert.equal(chatCalls(), callsBeforePause);
        await page.evaluate(() => { player.play(); player.pause(); player.trigger('loadedmetadata'); });
        await page.waitForTimeout(100);
        assert.equal(chatCalls(), callsBeforePause);
        await page.evaluate(() => player.currentTime(2.7));
        await page.getByText('Great stream', {exact: true}).waitFor();
        assert.equal(await page.getByText('Here!', {exact: true}).count(), 1);
        assert.ok(requests.some(url => url.startsWith('/api/v1/live_chat/') && new URL(url, 'https://invidious.test').searchParams.has('continuation')));
        await page.evaluate(() => player.currentTime(0));
        await page.getByText('Great stream', {exact: true}).waitFor({state: 'detached'});
        await page.getByText('Hello <script>alert(1)</script>', {exact: true}).waitFor();
        assert.equal(chatCalls(), callsBeforePause);
        await page.setViewportSize({width: 390, height: 844});
        assert.equal(await page.locator('#chat-panel').isVisible(), true);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
        assert.deepEqual(errors, []);
        await context.close();
    });

    test(`${engine}: cached ranges are reused and distant seeks fetch near the playhead`, async () => {
        const message = (id, offsetMs) => ({id, offsetMs, author: 'Viewer', text: id, kind: 'text', amount: ''});
        const chatReply = (url) => {
            const offset = Number(url.searchParams.get('offset_ms'));
            if (url.searchParams.has('continuation')) return {data: {messages: [message('ahead', 60000)], removedIds: [], continuation: 'later'}};
            if (offset >= 100000) return {data: {messages: [message('distant', 120000)], removedIds: [], continuation: null}};
            return {data: {messages: [message('start', 0), message('near', 1000)], removedIds: [], continuation: 'next'}};
        };
        const {page, context, chatCalls, requests, errors} = await pageFor(engine, {fixture: 'watch-chat', realPlayer: true,
            videoData: {length_seconds: 180}, chatReply});
        await page.getByText('start', {exact: true}).waitFor();
        await page.waitForTimeout(950);
        assert.equal(chatCalls(), 2);
        await page.evaluate(() => {
            window.chatTestTime = 0;
            player.currentTime = function (value) {
                if (value !== undefined) window.chatTestTime = value;
                return window.chatTestTime;
            };
            player.currentTime(20);
            player.trigger('seeked');
        });
        await page.waitForTimeout(100);
        assert.equal(chatCalls(), 2);
        await page.evaluate(() => { player.currentTime(120); player.trigger('seeked'); });
        await page.getByText('distant', {exact: true}).waitFor();
        assert.equal(chatCalls(), 3);
        assert.ok(requests.some(url => url.startsWith('/api/v1/live_chat/') && Number(new URL(url, 'https://invidious.test').searchParams.get('offset_ms')) >= 100000));
        await page.evaluate(() => { player.currentTime(0); player.trigger('seeked'); });
        await page.getByText('start', {exact: true}).waitFor();
        assert.equal(chatCalls(), 3);
        assert.deepEqual(errors, []);
        await context.close();
    });

    test(`${engine}: stale chat responses cannot replace a later seek`, async () => {
        const message = (id, offsetMs) => ({id, offsetMs, author: 'Viewer', text: id, kind: 'text', amount: ''});
        const chatReply = url => Number(url.searchParams.get('offset_ms')) < 100000 ?
            {delay: 350, data: {messages: [message('stale', 0)], removedIds: [], continuation: null}} :
            {data: {messages: [message('current', 120000)], removedIds: [], continuation: null}};
        const {page, context, chatCalls, errors} = await pageFor(engine, {fixture: 'watch-chat', realPlayer: true,
            videoData: {length_seconds: 180}, chatReply});
        await page.waitForTimeout(50);
        assert.equal(chatCalls(), 1);
        await page.evaluate(() => {
            window.chatTestTime = 120;
            player.currentTime = function (value) {
                if (value !== undefined) window.chatTestTime = value;
                return window.chatTestTime;
            };
            player.trigger('seeked');
        });
        await page.getByText('current', {exact: true}).waitFor();
        await page.waitForTimeout(400);
        assert.equal(await page.getByText('stale', {exact: true}).count(), 0);
        assert.equal(chatCalls(), 2);
        assert.deepEqual(errors, []);
        await context.close();
    });

    test(`${engine}: removals and timing changes reuse cached replay`, async () => {
        const message = (id, offsetMs) => ({id, offsetMs, author: 'Viewer', text: id, kind: 'text', amount: ''});
        const chatReply = url => url.searchParams.has('continuation') ?
            {data: {messages: [message('ahead', 60000)], removedIds: ['deleted'], continuation: 'later'}} :
            {data: {messages: [message('kept', 0), message('deleted', 0)], removedIds: [], continuation: 'next'}};
        const {page, context, chatCalls, errors} = await pageFor(engine, {fixture: 'watch-chat', realPlayer: true,
            videoData: {length_seconds: 180}, chatReply});
        await page.getByText('kept', {exact: true}).waitFor();
        await page.waitForTimeout(950);
        assert.equal(await page.getByText('deleted', {exact: true}).count(), 0);
        const calls = chatCalls();
        await page.locator('#chat-settings summary').click();
        await page.locator('#chat-timing').fill('-1');
        await page.locator('#chat-timing').press('Tab');
        await page.getByText('kept', {exact: true}).waitFor();
        assert.equal(await page.getByText('deleted', {exact: true}).count(), 0);
        assert.equal(chatCalls(), calls);
        assert.deepEqual(errors, []);
        await context.close();
    });

    test(`${engine}: scrolling up exposes earlier cached chat without another request`, async () => {
        const chatMessages = Array.from({length: 151}, (_, index) => ({
            id: `old-${index}`, offsetMs: 0, author: `Viewer ${index}`, text: `Old message ${index}`, kind: 'text', amount: ''
        }));
        const {page, context, chatCalls, errors} = await pageFor(engine, {fixture: 'watch-chat', realPlayer: true, chatMessages});
        await page.waitForFunction(() => document.querySelectorAll('.chat-message').length === 120);
        assert.equal(await page.locator('[data-message-id="old-0"]').count(), 0);
        const calls = chatCalls();
        await page.locator('#chat-messages').evaluate(el => { el.scrollTop = 0; });
        await page.locator('[data-message-id="old-0"]').waitFor();
        assert.equal(await page.locator('.chat-message').count(), 120);
        assert.equal(chatCalls(), calls);
        await page.locator('#chat-sync').click();
        assert.equal(await page.locator('[data-message-id="old-0"]').count(), 0);
        assert.equal(await page.locator('[data-message-id="old-150"]').count(), 1);
        assert.deepEqual(errors, []);
        await context.close();
    });

    test(`${engine}: chat cache evicts beyond 5000 messages and refetches evicted time`, async () => {
        const chatMessages = Array.from({length: 5001}, (_, index) => ({
            id: `bulk-${index}`, offsetMs: index, author: 'Viewer', text: `Bulk ${index}`, kind: 'text', amount: ''
        }));
        const {page, context, chatCalls, errors} = await pageFor(engine, {fixture: 'watch-chat', realPlayer: true, chatMessages});
        await page.locator('[data-message-id="bulk-250"]').waitFor();
        assert.equal(chatCalls(), 1);
        await page.evaluate(() => player.trigger('seeked'));
        await page.waitForTimeout(100);
        assert.equal(chatCalls(), 2);
        assert.deepEqual(errors, []);
        await context.close();
    });

    test(`${engine}: ordinary VOD does not load chat replay`, async () => {
        const {page, context, requests, errors} = await pageFor(engine, {fixture: 'watch-single'});
        assert.equal(await page.locator('#chat-panel').count(), 0);
        assert.equal(await page.locator('.vjs-chat-control').count(), 0);
        assert.equal(requests.some(url => url.startsWith('/api/v1/live_chat/')), false);
        assert.deepEqual(errors, []);
        await context.close();
    });

    test(`${engine}: player chat control hides and restores replay`, async () => {
        const {page, context, requests, chatCalls, errors} = await pageFor(engine, {fixture: 'watch-chat-only', realPlayer: true});
        await page.locator('.chat-message').first().waitFor();
        await page.waitForTimeout(950);
        await page.evaluate(() => { player.muted(true); player.play(); });
        await page.waitForFunction(() => player.currentTime() > 0.1);
        await page.evaluate(() => { player.pause(); player.userActive(true); });
        const toggle = page.locator('.vjs-chat-control');
        const share = page.locator('.vjs-share-control');
        const wide = page.locator('.vjs-wide-control');
        assert.equal(await toggle.getAttribute('title'), 'Hide chat');
        assert.equal(await toggle.getAttribute('aria-pressed'), 'true');
        const chatBox = await toggle.boundingBox();
        const shareBox = await share.boundingBox();
        const wideBox = await wide.boundingBox();
        const videoBefore = await page.locator('#player .vjs-tech').first().boundingBox();
        assert.ok(chatBox.x >= shareBox.x + shareBox.width - 4);
        assert.ok(wideBox.x >= chatBox.x + chatBox.width - 4);
        await toggle.click();
        assert.equal(await page.locator('#chat-panel').isVisible(), false);
        await page.waitForFunction(before => document.querySelector('#player .vjs-tech').getBoundingClientRect().width > before, videoBefore.width);
        assert.equal(await toggle.getAttribute('title'), 'Show chat');
        assert.equal(await toggle.getAttribute('aria-pressed'), 'false');
        assert.equal(await page.locator('#watch-layout').evaluate(el => el.classList.contains('watch-without-sidebar')), true);
        assert.equal(await page.locator('.watch-sidebar').count(), 0);
        const calls = chatCalls();
        await page.evaluate(() => player.currentTime(2.7));
        await page.waitForTimeout(950);
        assert.equal(chatCalls(), calls);
        await toggle.click();
        await page.getByText('Great stream', {exact: true}).waitFor();
        assert.equal(await toggle.getAttribute('aria-pressed'), 'true');
        assert.equal(await page.locator('#watch-layout').evaluate(el => el.classList.contains('watch-without-sidebar')), true);
        assert.equal(await page.locator('.watch-sidebar').count(), 0);
        assert.equal(chatCalls(), calls);
        assert.deepEqual(errors, []);
        await context.close();
    });

    test(`${engine}: chat keeps 120 messages and lets readers resync scrolling`, async () => {
        const chatMessages = Array.from({length: 151}, (_, index) => ({
            id: `message-${index}`, offsetMs: index < 120 ? 0 : index < 150 ? 2500 : 3500,
            author: `Viewer ${index}`, text: `Message ${index} with enough words to wrap in a narrow panel`, kind: 'text', amount: ''
        }));
        const {page, context, errors} = await pageFor(engine, {fixture: 'watch-chat', realPlayer: true, chatMessages});
        await page.evaluate(() => { player.muted(true); player.play(); });
        await page.waitForFunction(() => player.currentTime() > 0.1);
        await page.evaluate(() => player.pause());
        await page.waitForFunction(() => document.querySelectorAll('.chat-message').length === 120);
        const list = page.locator('#chat-messages');
        const author = page.locator('.chat-message').first().locator('.chat-author');
        const body = page.locator('.chat-message').first().locator('.chat-text');
        const authorBox = await author.boundingBox();
        const bodyBox = await body.boundingBox();
        assert.ok(Math.abs(authorBox.x - bodyBox.x) <= 1);
        assert.ok(bodyBox.y >= authorBox.y + authorBox.height - 1);
        await list.evaluate(el => { el.scrollTop = el.querySelector('[data-message-id="message-50"]').offsetTop - el.offsetTop; });
        await page.locator('#chat-sync').waitFor({state: 'visible'});
        const syncBox = await page.locator('#chat-sync').boundingBox();
        const scrollBox = await list.boundingBox();
        assert.ok(Math.abs(syncBox.x + syncBox.width / 2 - (scrollBox.x + scrollBox.width / 2)) <= 2);
        const before = await page.locator('[data-message-id="message-50"]').boundingBox();
        const beforeList = await list.boundingBox();
        await page.evaluate(() => { player.muted(true); player.play(); });
        await page.waitForFunction(() => player.currentTime() >= 2.7);
        await page.waitForFunction(() => document.querySelector('[data-message-id="message-149"]'));
        const after = await page.locator('[data-message-id="message-50"]').boundingBox();
        const afterList = await list.boundingBox();
        assert.ok(Math.abs((after.y - afterList.y) - (before.y - beforeList.y)) <= 2, JSON.stringify({before, after, beforeList, afterList, scrollTop: await list.evaluate(el => el.scrollTop)}));
        assert.equal(await page.locator('.chat-message').count(), 120);
        assert.equal(await page.locator('[data-message-id="message-0"]').count(), 0);
        assert.equal(await page.locator('#chat-sync').isVisible(), true);
        await page.locator('#chat-sync').click();
        assert.equal(await page.locator('#chat-sync').isVisible(), false);
        assert.equal(await list.evaluate(el => el.scrollHeight - el.clientHeight - el.scrollTop <= 32), true);
        await page.waitForFunction(() => player.currentTime() >= 3.7);
        await page.locator('[data-message-id="message-150"]').waitFor();
        assert.equal(await page.locator('#chat-sync').isVisible(), false);
        assert.equal(await list.evaluate(el => el.scrollHeight - el.clientHeight - el.scrollTop <= 32), true);
        assert.deepEqual(errors, []);
        await context.close();
    });

    test(`${engine}: mobile player settings can hide and show chat`, async () => {
        const {page, context, errors} = await pageFor(engine, {fixture: 'watch-chat', realPlayer: true, touch: true, mobileUserAgent: true, width: 390, height: 844});
        await page.locator('.chat-message').first().waitFor();
        assert.equal(await page.locator('.vjs-chat-control').isVisible(), false);
        await page.evaluate(() => { player.muted(true); player.play(); player.userActive(true); });
        await page.waitForFunction(() => player.currentTime() > 0.1);
        await page.locator('.vjs-mobile-settings').tap();
        const settings = page.locator('.mobile-player-settings');
        await settings.getByRole('button', {name: 'Hide chat'}).tap();
        assert.equal(await page.locator('#chat-panel').isVisible(), false);
        await page.locator('.vjs-mobile-settings').tap();
        await settings.getByRole('button', {name: 'Show chat'}).tap();
        await page.locator('#chat-panel').waitFor({state: 'visible'});
        assert.deepEqual(errors, []);
        await context.close();
    });

    test(`${engine}: chat replay errors can be retried`, async () => {
        const {page, context, errors, chatCalls} = await pageFor(engine, {fixture: 'watch-chat', realPlayer: true, chatError: 1});
        await page.locator('#chat-retry').waitFor({state: 'visible'});
        await page.locator('#chat-retry').click();
        await page.locator('.chat-message').first().waitFor();
        assert.equal(chatCalls(), 2);
        assert.deepEqual(errors, []);
        await context.close();
    });

    test(`${engine}: unavailable chat replay has a clear state`, async () => {
        const {page, context, errors} = await pageFor(engine, {fixture: 'watch-chat', realPlayer: true, chatUnavailable: true});
        await page.getByText('Chat replay is unavailable for this video.').waitFor();
        assert.equal(await page.locator('#chat-retry').isVisible(), false);
        assert.deepEqual(errors, []);
        await context.close();
    });

    test(`${engine}: chat is beside the video in normal, wide, and fullscreen modes`, async () => {
        const {page, context, errors} = await pageFor(engine, {fixture: 'watch-chat', realPlayer: true, width: 1440, height: 900});
        await page.locator('.chat-message').first().waitFor();
        await page.evaluate(() => { player.muted(true); player.play(); });
        await page.waitForFunction(() => player.currentTime() > 0.1);
        await page.evaluate(() => { player.pause(); player.userActive(true); });
        async function positions() {
            return {video: await page.locator('#player .vjs-tech').first().boundingBox(), chat: await page.locator('#chat-panel').boundingBox()};
        }
        assert.equal(await page.locator('#chat-panel').evaluate(el => el.parentElement.id), 'player');
        const wide = await positions();
        assert.ok(Math.abs(wide.chat.x - (wide.video.x + wide.video.width)) <= 3);
        assert.ok(Math.abs(wide.chat.y - wide.video.y) <= 3);
        for (const selector of ['.watch-primary', '.watch-sidebar']) {
            const box = await page.locator(selector).boundingBox();
            assert.ok(box.y >= wide.chat.y + wide.chat.height - 3, `${selector} overlaps the wide player`);
        }
        await page.locator('.vjs-wide-control').click();
        await page.waitForFunction(() => {
            const container = document.getElementById('player-container').getBoundingClientRect();
            const chat = document.getElementById('chat-panel').getBoundingClientRect();
            const primary = document.querySelector('.watch-primary').getBoundingClientRect();
            return Math.abs(chat.height - Math.round((container.width - 440) * 9 / 16)) <= 2 &&
                Math.abs(chat.bottom - container.bottom) <= 4 && primary.top >= chat.bottom - 3;
        });
        const normal = await positions();
        assert.ok(Math.abs(normal.chat.x - (normal.video.x + normal.video.width)) <= 3);
        assert.ok(wide.video.width >= normal.video.width);
        for (const selector of ['.watch-primary', '.watch-sidebar']) {
            const box = await page.locator(selector).boundingBox();
            assert.ok(box.y >= normal.chat.y + normal.chat.height - 3, `${selector} overlaps the normal player`);
        }
        await page.locator('.vjs-chat-control').click();
        await page.waitForFunction(() => !document.getElementById('watch-layout').classList.contains('watch-chat-docked'));
        const hiddenVideo = await page.locator('#player-container').boundingBox();
        const hiddenSidebar = await page.locator('.watch-sidebar').boundingBox();
        assert.ok(Math.abs(hiddenVideo.y - hiddenSidebar.y) <= 3);
        assert.ok(hiddenVideo.x + hiddenVideo.width <= hiddenSidebar.x - 10);
        assert.ok(hiddenVideo.width > normal.video.width);
        await page.evaluate(() => player.userActive(true));
        await page.locator('.vjs-chat-control').click();
        await page.waitForFunction(() => document.getElementById('watch-layout').classList.contains('watch-chat-docked'));
        await page.locator('.vjs-fullscreen-control').click();
        await page.waitForFunction(() => player.isFullscreen());
        const full = await positions();
        assert.ok(Math.abs(full.chat.x - (full.video.x + full.video.width)) <= 3);
        assert.ok(await page.locator('#chat-panel').isVisible());
        await page.evaluate(() => { player.exitFullscreen(); });
        assert.deepEqual(errors, []);
        await context.close();
    });

    test(`${engine}: mobile play/pause stays over the video with docked chat`, async () => {
        const {page, context, errors} = await pageFor(engine, {fixture: 'watch-chat', realPlayer: true, touch: true,
            mobileUserAgent: true, width: 390, height: 844});
        await page.locator('.chat-message').first().waitFor();
        await page.evaluate(() => { player.muted(true); player.play(); });
        await page.waitForFunction(() => player.currentTime() > 0.1);
        const control = page.locator('.vjs-touch-overlay .vjs-play-control');
        async function assertPlayable() {
            await page.evaluate(() => { player.pause(); player.userActive(true); });
            await page.waitForFunction(() => {
                const video = document.querySelector('#player .vjs-tech').getBoundingClientRect();
                const overlay = document.querySelector('.vjs-touch-overlay').getBoundingClientRect();
                const control = document.querySelector('.vjs-touch-overlay .vjs-play-control');
                const button = control.getBoundingClientRect();
                if (getComputedStyle(control).opacity !== '1') return false;
                if (Math.abs(overlay.height - video.height) > 2) return false;
                if (Math.abs(button.y + button.height / 2 - (video.y + video.height / 2)) > 2) return false;
                if (button.y < video.y || button.bottom > video.bottom) return false;
                return true;
            });
            await control.tap();
            await page.waitForFunction(() => !player.paused());
            await control.tap();
            await page.waitForFunction(() => player.paused());
        }
        await assertPlayable();
        await page.evaluate(() => player.userActive(true));
        await page.locator('.vjs-fullscreen-control').tap();
        await page.waitForFunction(() => player.isFullscreen());
        await assertPlayable();
        await page.evaluate(() => { player.exitFullscreen(); });
        await page.waitForFunction(() => !player.isFullscreen());
        await assertPlayable();
        assert.deepEqual(errors, []);
        await context.close();
    });

    test(`${engine}: mobile docked chat follows orientation in and out of fullscreen`, async () => {
        const {page, context, errors} = await pageFor(engine, {fixture: 'watch-chat', realPlayer: true, touch: true,
            mobileUserAgent: true, width: 390, height: 844});
        await page.locator('.chat-message').first().waitFor();
        async function assertPlacement(side) {
            await page.waitForFunction(side => {
                const video = document.querySelector('#player .vjs-tech').getBoundingClientRect();
                const chat = document.getElementById('chat-panel').getBoundingClientRect();
                return side === 'below' ? chat.top >= video.bottom - 3 && chat.height > 80 :
                    Math.abs(chat.left - video.right) <= 3 && Math.abs(chat.top - video.top) <= 3 && chat.width > 150;
            }, side);
        }
        await assertPlacement('below');
        await page.setViewportSize({width: 844, height: 390});
        await assertPlacement('beside');
        await page.setViewportSize({width: 390, height: 844});
        await assertPlacement('below');
        await page.evaluate(() => { player.hasStarted(true); player.userActive(true); });
        await page.locator('.vjs-fullscreen-control').click();
        await page.waitForFunction(() => player.isFullscreen());
        await assertPlacement(await page.evaluate(() => matchMedia('(orientation: portrait)').matches ? 'below' : 'beside'));
        if (engine === 'chromium') {
            const client = await context.newCDPSession(page);
            await client.send('Emulation.setDeviceMetricsOverride', {width: 844, height: 390,
                deviceScaleFactor: 1, mobile: true, screenOrientation: {type: 'landscapePrimary', angle: 90}});
            await assertPlacement('beside');
            await client.send('Emulation.setDeviceMetricsOverride', {width: 390, height: 844,
                deviceScaleFactor: 1, mobile: true, screenOrientation: {type: 'portraitPrimary', angle: 0}});
            await assertPlacement('below');
            await client.send('Emulation.clearDeviceMetricsOverride');
        }
        await page.locator('#chat-settings summary').click();
        assert.ok(await page.locator('.chat-settings-menu').isVisible());
        await page.evaluate(() => { player.exitFullscreen(); });
        await page.waitForFunction(() => !player.isFullscreen());
        await assertPlacement('below');
        assert.deepEqual(errors, []);
        await context.close();
    });

    test(`${engine}: chat overlay can be edited, saved, and restored`, async () => {
        const {page, context, errors} = await pageFor(engine, {fixture: 'watch-chat', realPlayer: true, width: 1440, height: 900});
        await page.locator('.chat-message').first().waitFor();
        const dockedVideo = await page.locator('#player .vjs-tech').first().boundingBox();
        await page.locator('#chat-settings summary').click();
        await page.locator('#chat-width').evaluate(el => { el.value = '640'; el.dispatchEvent(new Event('input', {bubbles: true})); });
        await page.locator('#chat-overlay-mode').check();
        await page.waitForFunction(() => document.getElementById('player').classList.contains('chat-overlay'));
        assert.equal(await page.locator('#watch-layout').evaluate(el => el.classList.contains('watch-chat-docked')), false);
        await page.waitForFunction(() => {
            const player = document.getElementById('player').getBoundingClientRect();
            const video = document.querySelector('#player .vjs-tech').getBoundingClientRect();
            return Math.abs(player.width - video.width) <= 2;
        });
        const overlay = page.locator('#chat-panel');
        const video = await page.locator('#player .vjs-tech').first().boundingBox();
        const initial = await overlay.boundingBox();
        assert.ok(video.width > dockedVideo.width + 200);
        assert.ok(initial.x >= video.x && initial.x + initial.width <= video.x + video.width + 2);
        assert.ok(initial.y >= video.y && initial.y + initial.height <= video.y + video.height + 2);
        assert.equal(await page.locator('#chat-overlay-options').isVisible(), true);
        assert.equal(await page.locator('#chat-docked-size').isVisible(), false);
        await page.locator('#chat-overlay-opacity').evaluate(el => { el.value = '0'; el.dispatchEvent(new Event('input', {bubbles: true})); });
        await page.waitForFunction(() => getComputedStyle(document.getElementById('chat-panel'), '::before').opacity === '0');
        assert.equal(await page.locator('.chat-message').first().isVisible(), true);
        await page.locator('#chat-overlay-opacity').evaluate(el => { el.value = '100'; el.dispatchEvent(new Event('input', {bubbles: true})); });
        await page.waitForFunction(() => getComputedStyle(document.getElementById('chat-panel'), '::before').opacity === '1');
        await page.locator('#chat-modify-overlay').click();
        const move = await page.locator('#chat-overlay-move').boundingBox();
        await page.mouse.move(move.x + move.width / 2, move.y + move.height / 2);
        await page.mouse.down();
        await page.mouse.move(move.x + move.width / 2 - 45, move.y + move.height / 2 + 25, {steps: 4});
        await page.mouse.up();
        await page.waitForFunction(start => {
            const box = document.getElementById('chat-panel').getBoundingClientRect();
            return box.x < start.x - 25 && box.y > start.y + 10;
        }, initial, {timeout: 5000});
        const moved = await overlay.boundingBox();
        assert.ok(moved.x < initial.x - 25 && moved.y > initial.y + 10);
        await page.locator('#chat-overlay-resize').focus();
        await page.keyboard.press('ArrowLeft');
        await page.waitForFunction(previous => document.getElementById('chat-panel').getBoundingClientRect().width < previous - 1, moved.width);
        const keyboardResized = await overlay.boundingBox();
        assert.ok(keyboardResized.width < moved.width);
        const resizeHandle = await page.locator('#chat-overlay-resize').boundingBox();
        await page.mouse.move(resizeHandle.x + resizeHandle.width / 2, resizeHandle.y + resizeHandle.height / 2);
        await page.mouse.down();
        await page.mouse.move(resizeHandle.x + resizeHandle.width / 2 + 30, resizeHandle.y + resizeHandle.height / 2 + 20, {steps: 4});
        await page.mouse.up();
        await page.waitForFunction(previous => {
            const box = document.getElementById('chat-panel').getBoundingClientRect();
            return box.width > previous.width + 25 && box.height > previous.height + 15;
        }, keyboardResized);
        const resized = await overlay.boundingBox();
        await page.locator('#chat-overlay-save').click();
        assert.equal(await page.locator('#chat-overlay-editor').isVisible(), false);
        await page.reload();
        await page.locator('.chat-message').first().waitFor();
        const restored = await overlay.boundingBox();
        assert.ok(Math.abs(restored.x - resized.x) <= 3 && Math.abs(restored.width - resized.width) <= 3,
            JSON.stringify({restored, resized, settings: await page.evaluate(() => localStorage.getItem('chat-settings-v1'))}));
        assert.equal(await page.locator('#chat-overlay-mode').isChecked(), true);
        assert.equal(await page.locator('#chat-overlay-opacity').inputValue(), '100');
        await page.locator('#chat-settings summary').click();
        await page.locator('#chat-modify-overlay').click();
        await page.locator('#chat-overlay-move').focus();
        await page.keyboard.press('ArrowLeft');
        await page.keyboard.press('Escape');
        const cancelled = await overlay.boundingBox();
        assert.ok(Math.abs(cancelled.x - restored.x) <= 2);
        await page.locator('#chat-settings summary').click();
        await page.locator('#chat-overlay-mode').uncheck();
        await page.waitForFunction(() => document.getElementById('player').classList.contains('chat-docked'));
        await page.waitForFunction(() => {
            const video = document.querySelector('#player .vjs-tech').getBoundingClientRect();
            const chat = document.getElementById('chat-panel').getBoundingClientRect();
            return Math.abs(chat.x - video.right) <= 3 && Math.round(chat.width) === 640;
        });
        const docked = await overlay.boundingBox();
        const dockedTech = await page.locator('#player .vjs-tech').first().boundingBox();
        assert.ok(Math.abs(docked.x - dockedTech.x - dockedTech.width) <= 3);
        assert.equal(Math.round(docked.width), 640);
        assert.deepEqual(errors, []);
        await context.close();
    });

    test(`${engine}: chat overlay stays within mobile and fullscreen video`, async () => {
        const {page, context, errors} = await pageFor(engine, {fixture: 'watch-chat', realPlayer: true, touch: true,
            mobileUserAgent: true, width: 390, height: 844});
        await page.locator('.chat-message').first().waitFor();
        await page.locator('#chat-settings summary').tap();
        await page.locator('#chat-overlay-mode').check();
        async function insideVideo() {
            await page.waitForFunction(() => {
                const video = document.querySelector('#player .vjs-tech').getBoundingClientRect();
                const chat = document.getElementById('chat-panel').getBoundingClientRect();
                return chat.x >= video.x - 2 && chat.y >= video.y - 2 &&
                    chat.right <= video.right + 2 && chat.bottom <= video.bottom + 2;
            });
            const video = await page.locator('#player .vjs-tech').first().boundingBox();
            const chat = await page.locator('#chat-panel').boundingBox();
            assert.ok(chat.x >= video.x - 2 && chat.y >= video.y - 2);
            assert.ok(chat.x + chat.width <= video.x + video.width + 2);
            assert.ok(chat.y + chat.height <= video.y + video.height + 2, JSON.stringify({chat, video, player: await page.locator('#player').boundingBox()}));
        }
        await insideVideo();
        if (engine === 'chromium') {
            await page.locator('#chat-modify-overlay').tap();
            const client = await context.newCDPSession(page);
            async function touchDrag(selector, dx, dy) {
                const box = await page.locator(selector).boundingBox();
                const x = box.x + box.width / 2;
                const y = box.y + box.height / 2;
                await client.send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: [{x, y, id: 0}]});
                await client.send('Input.dispatchTouchEvent', {type: 'touchMove', touchPoints: [{x: x + dx, y: y + dy, id: 0}]});
                await client.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []});
            }
            const beforeMove = await page.locator('#chat-panel').boundingBox();
            await touchDrag('#chat-overlay-move', -30, 5);
            await page.waitForFunction(previous => document.getElementById('chat-panel').getBoundingClientRect().x < previous - 15, beforeMove.x);
            const beforeResize = await page.locator('#chat-panel').boundingBox();
            await touchDrag('#chat-overlay-resize', 15, 10);
            await page.waitForFunction(previous => document.getElementById('chat-panel').getBoundingClientRect().width > previous + 8, beforeResize.width);
            await page.locator('#chat-overlay-save').tap();
            await insideVideo();
        }
        await page.evaluate(() => { player.requestFullscreen(); });
        await page.waitForFunction(() => player.isFullscreen());
        await insideVideo();
        await page.evaluate(() => { player.exitFullscreen(); });
        assert.deepEqual(errors, []);
        await context.close();
    });

    test(`${engine}: chat settings filter messages and persist for guests`, async () => {
        const chatMessages = [
            {id: 'keep', offsetMs: 0, author: 'Reader', authorChannelId: 'UCFullIdentifierThatMustWrapWithoutTruncation1234567890123456789012345678901234567890', text: 'Hello', kind: 'text', amount: ''},
            {id: 'blocked', offsetMs: 0, author: 'Blocked', authorChannelId: 'UCBlockedViewer', text: 'Welcome', kind: 'text', amount: ''},
            {id: 'handle', offsetMs: 0, author: 'Hidden', authorChannelId: 'UCOtherViewer', authorHandle: '@hidden', text: 'Welcome', kind: 'text', amount: ''},
            {id: 'spam', offsetMs: 0, author: 'Other', authorChannelId: 'UCOther', text: 'SpAm message', kind: 'text', amount: ''}
        ];
        const {page, context, errors} = await pageFor(engine, {fixture: 'watch-chat', realPlayer: true, chatMessages});
        await page.waitForFunction(() => document.querySelectorAll('.chat-message').length === 4);
        assert.equal(await page.locator('.chat-author-id').first().textContent(), chatMessages[0].authorChannelId);
        assert.ok(await page.locator('.chat-author-id').first().evaluate(el => el.scrollWidth <= el.clientWidth));
        await page.locator('#chat-settings summary').click();
        await page.locator('#chat-hide-user-ids').check();
        assert.equal(await page.locator('.chat-author-id').first().isVisible(), false);
        await page.locator('#chat-show-timestamps').uncheck();
        await page.locator('#chat-font-scale').evaluate(el => { el.value = '150'; el.dispatchEvent(new Event('input', {bubbles: true})); });
        await page.locator('#chat-width').evaluate(el => { el.value = '640'; el.dispatchEvent(new Event('input', {bubbles: true})); });
        await page.locator('#chat-user-blacklist').fill('UCBlockedViewer @hidden');
        await page.locator('#chat-user-blacklist').press('Tab');
        await page.waitForFunction(() => document.querySelectorAll('.chat-message').length === 2);
        assert.equal(await page.locator('#chat-panel').evaluate(el => Math.round(parseFloat(getComputedStyle(el).fontSize))), 27);
        assert.equal(Math.round((await page.locator('#chat-panel').boundingBox()).width), 640);
        await page.locator('#chat-word-blacklist').fill('SPAM');
        await page.locator('#chat-word-blacklist').press('Tab');
        await page.waitForFunction(() => document.querySelectorAll('.chat-message').length === 1);
        await page.locator('#chat-word-blacklist').fill('/sp.m/');
        await page.locator('#chat-word-blacklist').press('Tab');
        await page.waitForFunction(() => document.querySelectorAll('.chat-message').length === 1);
        assert.equal(await page.locator('.chat-time').first().isVisible(), false);
        assert.equal(await page.locator('#chat-font-value').inputValue(), '150');
        await page.locator('#chat-word-blacklist').fill('/[/');
        await page.locator('#chat-word-blacklist').press('Tab');
        await page.getByText('Invalid regular expression').waitFor();
        await page.locator('#chat-timing').fill('-1');
        await page.locator('#chat-timing').press('Tab');
        await page.reload();
        await page.waitForFunction(() => document.querySelectorAll('.chat-message').length === 1);
        assert.equal(await page.locator('#chat-font-scale').inputValue(), '150');
        assert.equal(await page.locator('#chat-width').inputValue(), '640');
        assert.equal(await page.locator('#chat-timing').inputValue(), '-1');
        assert.equal(await page.locator('#chat-hide-user-ids').isChecked(), true);
        assert.equal(await page.locator('.chat-author-id').first().isVisible(), false);
        assert.equal(await page.locator('.chat-time').first().isVisible(), false);
        assert.equal(await page.evaluate(() => localStorage.getItem('chat-timing-v1-other')), null);
        assert.deepEqual(errors, []);
        await context.close();
    });

    test(`${engine}: typed chat sizes extend the sliders and persist locally`, async () => {
        const {page, context, errors} = await pageFor(engine, {fixture: 'watch-chat', realPlayer: true});
        await page.locator('.chat-message').first().waitFor();
        await page.locator('#chat-settings summary').click();
        await page.locator('#chat-font-value').fill('50');
        await page.locator('#chat-font-value').press('Tab');
        await page.locator('#chat-width-value').fill('700');
        await page.locator('#chat-width-value').press('Tab');
        assert.equal(await page.locator('#chat-font-scale').inputValue(), '75');
        assert.equal(await page.locator('#chat-width').inputValue(), '640');
        assert.equal(await page.locator('#chat-panel').evaluate(el => Math.round(parseFloat(getComputedStyle(el).fontSize))), 9);
        assert.equal(Math.round((await page.locator('#chat-panel').boundingBox()).width), 700);
        await page.locator('#chat-font-value').fill('301');
        await page.locator('#chat-font-value').press('Tab');
        await page.locator('#chat-width-value').fill('159');
        await page.locator('#chat-width-value').press('Tab');
        assert.equal(await page.locator('#chat-font-value').inputValue(), '50');
        assert.equal(await page.locator('#chat-width-value').inputValue(), '700');
        await page.reload();
        assert.equal(await page.locator('#chat-font-value').inputValue(), '50');
        assert.equal(await page.locator('#chat-width-value').inputValue(), '700');
        assert.equal(await page.locator('#chat-font-scale').inputValue(), '75');
        assert.equal(await page.locator('#chat-width').inputValue(), '640');
        await page.locator('#chat-font-scale').evaluate(el => { el.value = '100'; el.dispatchEvent(new Event('input', {bubbles: true})); });
        await page.locator('#chat-width').evaluate(el => { el.value = '440'; el.dispatchEvent(new Event('input', {bubbles: true})); });
        assert.equal(await page.locator('#chat-font-value').inputValue(), '100');
        assert.equal(await page.locator('#chat-width-value').inputValue(), '440');
        assert.deepEqual(errors, []);
        await context.close();
    });

    test(`${engine}: signed-in chat display settings are independent by browser`, async () => {
        const fixture = fs.readFileSync(path.join(generated, 'watch-chat-account.html'), 'utf8');
        const original = JSON.parse(fixture.match(/<script id="video_data"[^>]*>([\s\S]*?)<\/script>/)[1]).preferences;
        const legacy = {...original, chat_font_scale: 150, chat_width_px: 640, chat_overlay_mode: true};
        const first = await pageFor(engine, {fixture: 'watch-chat-account', realPlayer: true,
            videoData: {preferences: legacy},
            initScript: "if (!localStorage.getItem('chat-settings-v1')) localStorage.setItem('chat-settings-v1', JSON.stringify({chat_hide_user_ids:true, chat_font_scale:50, chat_width_px:200, chat_overlay_mode:false}))"});
        const second = await pageFor(engine, {fixture: 'watch-chat-account', realPlayer: true,
            videoData: {preferences: legacy}});
        await first.page.locator('.chat-message').first().waitFor();
        await second.page.locator('.chat-message').first().waitFor();
        assert.equal(await first.page.locator('#chat-font-value').inputValue(), '50');
        assert.equal(await first.page.locator('#chat-width-value').inputValue(), '200');
        assert.equal(await first.page.locator('#chat-hide-user-ids').isChecked(), true);
        assert.equal(await second.page.locator('#chat-font-value').inputValue(), '100');
        assert.equal(await second.page.locator('#chat-width-value').inputValue(), '440');
        assert.equal(await second.page.locator('#chat-overlay-mode').isChecked(), false);
        assert.equal(await second.page.locator('#chat-hide-user-ids').isChecked(), false);
        await first.page.locator('#chat-settings summary').click();
        await first.page.locator('#chat-font-value').fill('225');
        await first.page.locator('#chat-font-value').press('Tab');
        await first.page.locator('#chat-width-value').fill('720');
        await first.page.locator('#chat-width-value').press('Tab');
        await first.page.locator('#chat-overlay-mode').check();
        await first.page.locator('#chat-overlay-opacity').evaluate(el => { el.value = '40'; el.dispatchEvent(new Event('input', {bubbles: true})); });
        await first.page.locator('#chat-modify-overlay').click();
        await first.page.locator('#chat-overlay-move').focus();
        await first.page.keyboard.press('ArrowLeft');
        await first.page.locator('#chat-overlay-save').click();
        const savedLocal = JSON.parse(await first.page.evaluate(() => localStorage.getItem('chat-settings-v1')));
        assert.equal(savedLocal.chat_overlay_mode, true);
        assert.equal(savedLocal.chat_overlay_opacity, 40);
        assert.ok(savedLocal.chat_overlay_x < 560);
        await first.page.reload();
        assert.equal(await first.page.locator('#chat-font-value').inputValue(), '225');
        assert.equal(await first.page.locator('#chat-width-value').inputValue(), '720');
        assert.equal(await first.page.locator('#chat-overlay-mode').isChecked(), true);
        assert.equal(await first.page.locator('#chat-overlay-opacity').inputValue(), '40');
        assert.equal(await second.page.locator('#chat-font-value').inputValue(), '100');
        assert.equal(await second.page.locator('#chat-overlay-mode').isChecked(), false);
        assert.equal(first.chatWrites.filter(write => write.path === '/api/v1/auth/chat_preferences').length, 0);
        assert.deepEqual(first.errors, []);
        assert.deepEqual(second.errors, []);
        await first.context.close();
        await second.context.close();
    });

    test(`${engine}: Diary chat overlay has no frame or reserved heading band`, async () => {
        const {page, context, errors} = await pageFor(engine, {fixture: 'watch-chat-diary', realPlayer: true});
        await page.locator('.chat-message').first().waitFor();
        await page.locator('#chat-settings summary').click();
        await page.locator('#chat-overlay-mode').check();
        await page.waitForFunction(() => document.getElementById('player').classList.contains('chat-overlay'));
        const geometry = await page.evaluate(() => {
            const panel = document.getElementById('chat-panel');
            const style = getComputedStyle(panel);
            return {panel: panel.getBoundingClientRect().toJSON(),
                scroll: panel.querySelector('.chat-scroll-area').getBoundingClientRect().toJSON(),
                message: panel.querySelector('.chat-message').getBoundingClientRect().toJSON(),
                borderRight: style.borderRightWidth, borderBottom: style.borderBottomWidth,
                shadow: style.boxShadow};
        });
        assert.equal(geometry.borderRight, '0px');
        assert.equal(geometry.borderBottom, '0px');
        assert.equal(geometry.shadow, 'none');
        assert.ok(Math.abs(geometry.scroll.top - geometry.panel.top) <= 2);
        assert.ok(geometry.message.top <= geometry.panel.top + 35);
        await page.locator('#chat-settings').evaluate(el => { el.open = false; });
        await page.locator('#chat-settings summary').click();
        assert.ok(await page.locator('.chat-settings-menu').isVisible());
        assert.deepEqual(errors, []);
        await context.close();
    });

    test(`${engine}: custom chat timing shifts messages and account changes are saved`, async () => {
        const chatMessages = [{id: 'timed', offsetMs: 500, author: 'Reader', authorChannelId: 'UCReader', text: 'Timed message', kind: 'text', amount: ''}];
        const {page, context, chatWrites, errors} = await pageFor(engine, {fixture: 'watch-chat-account', realPlayer: true, chatMessages,
            initScript: "localStorage.setItem('chat-settings-v1', JSON.stringify({chat_show_timestamps:false}))"});
        assert.equal(await page.locator('#chat-show-timestamps').isChecked(), true);
        await page.evaluate(() => { player.muted(true); player.play(); });
        await page.waitForFunction(() => player.currentTime() > 0.1);
        await page.evaluate(() => { player.pause(); player.currentTime(0); });
        await page.locator('#chat-settings summary').click();
        const timingRequest = page.waitForResponse(response => new URL(response.url()).pathname.endsWith('/chat_timing/2isYuQZMbdU'));
        await page.locator('#chat-timing').fill('1');
        await page.locator('#chat-timing').press('Tab');
        await timingRequest;
        assert.equal(await page.locator('.chat-message').count(), 0);
        await page.evaluate(() => player.currentTime(1.6));
        await page.locator('.chat-message').first().waitFor();
        assert.ok(chatWrites.some(write => write.path.endsWith('/2isYuQZMbdU') && write.body.offsetMs === 1000));
        await page.evaluate(() => player.currentTime(0));
        await page.waitForFunction(() => document.querySelectorAll('.chat-message').length === 0);
        const earlyRequest = page.waitForResponse(response => new URL(response.url()).pathname.endsWith('/chat_timing/2isYuQZMbdU'));
        await page.locator('#chat-timing').fill('-1');
        await page.locator('#chat-timing').press('Tab');
        await earlyRequest;
        await page.evaluate(() => { player.currentTime(0); });
        await page.locator('.chat-message').first().waitFor();
        assert.ok(chatWrites.some(write => write.path.endsWith('/2isYuQZMbdU') && write.body.offsetMs === -1000));
        const settingsRequest = page.waitForResponse(response => new URL(response.url()).pathname === '/api/v1/auth/chat_preferences');
        await page.locator('#chat-show-timestamps').uncheck();
        await settingsRequest;
        assert.ok(chatWrites.some(write => write.path === '/api/v1/auth/chat_preferences' && write.body.chat_show_timestamps === false));
        const accountWrites = chatWrites.filter(write => write.path === '/api/v1/auth/chat_preferences').length;
        await page.locator('#chat-overlay-mode').check();
        await page.locator('#chat-overlay-opacity').evaluate(el => { el.value = '0'; el.dispatchEvent(new Event('input', {bubbles: true})); });
        assert.deepEqual(JSON.parse(await page.evaluate(() => localStorage.getItem('chat-settings-v1'))).chat_overlay_mode, true);
        await page.waitForTimeout(500);
        assert.equal(chatWrites.filter(write => write.path === '/api/v1/auth/chat_preferences').length, accountWrites);
        assert.ok(chatWrites.filter(write => write.path === '/api/v1/auth/chat_preferences').every(write =>
            Object.keys(write.body).every(key => ['chat_show_timestamps', 'chat_user_blacklist', 'chat_word_blacklist'].includes(key))));
        assert.deepEqual(errors, []);
        await context.close();
    });

    test(`${engine}: preferences sections, labels, and form fields`, async () => {
        const base = ['preferences-appearance', 'preferences-playback', 'preferences-browsing', 'preferences-enhancements'];
        const cases = [
            ['preferences', base],
            ['preferences-signed-in', [...base, 'preferences-library']],
            ['preferences-admin', [...base, 'preferences-library', 'preferences-administration']]
        ];
        for (const [fixture, expected] of cases) {
            const {page, context, errors} = await pageFor(engine, {fixture, width: 390, javascript: false});
            const sections = await page.locator('.preferences-section').evaluateAll(nodes => nodes.map(node => node.id));
            const links = await page.locator('.preference-nav a').evaluateAll(nodes => nodes.map(node => node.hash.slice(1)));
            assert.deepEqual(sections, expected);
            assert.deepEqual(links, expected);
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, `${fixture} overflows`);
            for (const id of await page.locator('.preferences-form input:not([type=hidden]), .preferences-form select').evaluateAll(nodes => nodes.map(node => node.id))) {
                assert.ok(id, `${fixture}: control has no id`);
                assert.equal(await page.locator(`label[for="${id}"]`).count(), 1, `${fixture}: ${id} needs one label`);
            }
            assert.equal(await page.locator('#timezone').count(), fixture === 'preferences' ? 0 : 1);
            if (fixture !== 'preferences') {
                assert.equal(await page.locator('#timezone').locator('..').locator('#watch_history').count(), 0);
            }
            await page.screenshot({path: path.join(artifacts, `${engine}-${fixture}-reorganized-390.png`), fullPage: true});
            const posted = page.waitForRequest(request => request.method() === 'POST' && new URL(request.url()).pathname === '/preferences');
            await page.locator('#video_loop').check();
            await page.locator('#dearrow_enabled').check();
            await page.getByRole('button', {name: 'Save preferences', exact: true}).click();
            const data = new URLSearchParams((await posted).postData());
            assert.equal(data.get('video_loop'), 'on');
            assert.equal(data.get('dearrow_enabled'), 'on');
            assert.ok(data.has('captions[1]') && data.has('comments[1]') && data.has('feed_menu[1]'));
            assert.equal(data.has('default_playlist'), fixture !== 'preferences');
            assert.equal(data.has('admin_default_home'), fixture === 'preferences-admin');
            assert.deepEqual(errors, []);
            await context.close();
        }
        for (const fixture of ['preferences', 'preferences-diary', 'preferences-rtl']) {
            for (const width of [320, 1440]) {
                const {page, context, errors} = await pageFor(engine, {fixture, width, javascript: false});
                assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, `${fixture} overflows at ${width}`);
                const save = await page.locator('.preferences-save button').boundingBox();
                assert.ok(save && save.x >= 0 && save.x + save.width <= width, `${fixture}: Save is clipped`);
                if (width === 320 && fixture !== 'preferences-rtl') {
                    await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
                    const pageWidth = await page.locator('.preferences-page').evaluate(el => ({client: el.clientWidth, scroll: el.scrollWidth}));
                    assert.ok(pageWidth.scroll <= pageWidth.client + 1, `${fixture} overflows at enlarged text: ${JSON.stringify(pageWidth)}`);
                }
                await page.screenshot({path: path.join(artifacts, `${engine}-${fixture}-reorganized-${width}.png`), fullPage: true});
                assert.deepEqual(errors, []);
                await context.close();
            }
        }
    });
    test(`${engine}: theme cards render and submit without JavaScript`, async () => {
        const { page, context } = await pageFor(engine, { fixture: 'preferences', javascript: false, width: 390 });
        assert.equal(await page.getByRole('radio', { name: 'Scrapbook' }).count(), 0);
        assert.equal(await page.getByRole('radio', { name: 'Cinematic' }).count(), 0);
        const radio = page.getByRole('radio', { name: 'Modern Neon' });
        assert.equal(await radio.isChecked(), true);
        assert.equal(await page.locator('body').getAttribute('data-theme'), 'modern-neon');
        assert.equal(await page.locator('.theme-option').filter({ has: radio }).locator('.theme-card-selected').isVisible(), true);
        await radio.scrollIntoViewIfNeeded();
        const preview = page.locator('.theme-option').filter({ has: radio }).locator('img');
        await preview.waitFor();
        assert.equal(await preview.evaluate(img => img.complete && img.naturalWidth > 0), true);
        await radio.focus();
        await page.keyboard.press('Space');
        await page.locator('.theme-picker').screenshot({ path: path.join(artifacts, `${engine}-theme-picker.png`) });
        const posted = page.waitForRequest(request => request.method() === 'POST');
        await page.getByRole('button', { name: 'Save preferences', exact: true }).click();
        assert.equal(new URLSearchParams((await posted).postData()).get('theme'), 'modern-neon');
        await context.close();
    });
    test(`${engine}: alternative theme loads in isolation and supports keyboard selection`, async () => {
        const { page, context, requests } = await pageFor(engine, { fixture: 'preferences-alternative' });
        assert.equal(await page.locator('body').getAttribute('data-theme'), 'fixture-theme');
        assert.equal(await page.getByRole('radio', { name: 'Fixture Theme' }).isChecked(), true);
        assert.ok(requests.some(url => url.startsWith('/themes/fixture-theme/theme.css')));
        assert.ok(!requests.some(url => url.startsWith('/themes/modern-neon/theme.css')));
        await page.getByRole('radio', { name: 'Fixture Theme' }).focus();
        await page.keyboard.press('ArrowRight');
        assert.equal(await page.getByRole('radio', { name: 'Random', exact: true }).isChecked(), true);
        assert.equal(await page.locator('body').getAttribute('data-theme'), 'fixture-theme');
        await page.locator('#toggle_theme').click();
        assert.equal(await page.locator('body').getAttribute('data-theme'), 'fixture-theme');
        await context.close();
    });
    test(`${engine}: Diary selection submits without JavaScript and loads alone`, async () => {
        const { page, context, requests } = await pageFor(engine, { fixture: 'preferences-diary', javascript: false, width: 390 });
        const radio = page.getByRole('radio', { name: 'Diary', exact: true });
        assert.equal(await radio.isChecked(), true);
        for (const img of await page.locator('.theme-card img').all()) {
            assert.equal(await img.evaluate(el => el.complete && el.naturalWidth > 0), true);
        }
        assert.ok(requests.some(url => url.startsWith('/themes/diary/theme.css')));
        assert.ok(!requests.some(url => url.startsWith('/themes/modern-neon/theme.css')));
        const posted = page.waitForRequest(request => request.method() === 'POST');
        await page.getByRole('button', { name: 'Save preferences', exact: true }).click();
        assert.equal(new URLSearchParams((await posted).postData()).get('theme'), 'diary');
        await context.close();
    });
    test(`${engine}: Diary palettes, mode toggle and keyboard selection`, async () => {
        for (const [mode, systemTheme, expected] of [['light', 'dark', 'light'], ['dark', 'light', 'dark'], ['auto', 'dark', 'dark'], ['auto', 'light', 'light']]) {
            const { page, context } = await pageFor(engine, { fixture: `browse-diary-${mode}`, systemTheme });
            assert.equal(await page.locator('body').evaluate(el => getComputedStyle(el).colorScheme), expected);
            await page.locator('#toggle_theme').click();
            assert.equal(await page.locator('body').getAttribute('data-theme'), 'diary');
            assert.equal(await page.locator('body').getAttribute('data-density'), 'balanced');
            await context.close();
        }
        const { page, context } = await pageFor(engine, { fixture: 'preferences' });
        await page.getByRole('radio', { name: 'Modern Neon' }).focus();
        await page.keyboard.press('ArrowRight');
        assert.equal(await page.getByRole('radio', { name: 'Diary', exact: true }).isChecked(), true);
        await context.close();
    });
    test(`${engine}: Diary local lettering loads and decorations stay noninteractive`, async () => {
        const { page, context, requests } = await pageFor(engine, { fixture: 'browse-diary-light' });
        await page.evaluate(() => document.fonts.ready);
        assert.deepEqual(await page.evaluate(() => [...document.fonts].filter(font => ['Dudu', 'Helvetica Punk'].includes(font.family.replace(/["']/g, ''))).map(font => font.status)), ['loaded', 'loaded']);
        assert.ok(requests.some(url => url.includes('/themes/diary/Dudu_Calligraphy.ttf')));
        assert.ok(requests.some(url => url.includes('/themes/diary/Helvetica-Punk.ttf')));
        assert.equal(await page.locator('.media-card').first().evaluate(el => getComputedStyle(el, '::before').pointerEvents), 'none');
        assert.equal(await page.locator('.media-card').first().evaluate(el => getComputedStyle(el, '::after').pointerEvents), 'none');
        await page.emulateMedia({ forcedColors: 'active' });
        assert.equal(await page.locator('.media-card').first().evaluate(el => getComputedStyle(el, '::before').display), 'none');
        await context.close();
    });
    test(`${engine}: Diary preserves real player controls`, async () => {
        for (const width of [390, 1440]) {
            const { page, context, errors } = await pageFor(engine, { fixture: 'watch-diary-light', realPlayer: true, width, touch: width === 390 });
            await page.waitForFunction(() => window.player && typeof player.play === 'function');
            await page.evaluate(() => { player.muted(true); player.play(); });
            await page.waitForFunction(() => player.currentTime() > 0.1);
            await page.evaluate(() => { player.pause(); player.currentTime(1); player.playbackRate(1.5); });
            assert.equal(await page.evaluate(() => player.paused()), true);
            assert.equal(await page.evaluate(() => player.playbackRate()), 1.5);
            await page.waitForFunction(() => player.currentTime() >= 0.9);
            assert.deepEqual(errors, []);
            await context.close();
        }
    });
    test(`${engine}: Diary responsive paper layouts`, async () => {
        for (const width of [320, 390, 768, 1024, 1440, 1920]) {
            for (const fixture of ['browse-diary-light', 'browse-diary-dark', 'browse-diary-compact', 'browse-diary-thin', 'watch-diary-light', 'watch-diary-dark', 'watch-diary-rtl', 'preferences-diary', 'search-diary', 'playlist-diary', 'history-diary', 'playlist-library-diary', 'login-diary', 'error-diary', 'channel-diary']) {
                const { page, context, errors } = await pageFor(engine, { fixture, width });
                await page.evaluate(() => document.fonts.ready);
                assert.equal(await page.locator('body').getAttribute('data-theme'), 'diary', `${fixture} must exercise Diary`);
                assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${fixture} overflows at ${width}`);
                assert.deepEqual(errors, []);
                if ([320, 1440].includes(width)) {
                    await page.locator('img.thumbnail').evaluateAll(images => Promise.all(images.filter(img => img.getBoundingClientRect().top < innerHeight).map(img => img.decode())));
                    await page.screenshot({ path: path.join(artifacts, `${engine}-${fixture}-${width}.png`) });
                }
                if (fixture === 'browse-diary-light' && width === 320) {
                    await page.addStyleTag({ content: 'html { font-size: 200%; }' });
                    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Diary enlarged text overflows');
                    await page.keyboard.press('Tab');
                    assert.equal(await page.locator('.skip-link').evaluate(el => el === document.activeElement), true);
                }
                await context.close();
            }
        }
    });
    test(`${engine}: actual Video.js player retains playback, seeking and controls`, async () => {
        for (const [width, height, touch] of [[1440, 1000, false], [320, 700, true], [390, 844, true], [768, 1000, true], [844, 390, true], [1024, 768, false]]) {
            const { page, context, errors } = await pageFor(engine, { realPlayer: true, touch, width, height });
            await page.waitForFunction(() => window.player && typeof player.play === 'function');
            await page.evaluate(() => { player.muted(true); player.play(); });
            await page.waitForFunction(() => player.currentTime() > 0.1, { timeout: 10000 });
            await page.evaluate(() => { player.pause(); player.currentTime(1); player.playbackRate(1.5); });
            assert.equal(await page.evaluate(() => player.paused()), true);
            assert.equal(await page.evaluate(() => player.playbackRate()), 1.5);
            await page.waitForFunction(() => player.currentTime() >= 0.9);
            assert.ok(await page.evaluate(() => player.currentTime() >= 0.9));
            assert.equal(await page.locator('.vjs-fullscreen-control').count(), 1);
            assert.equal(await page.locator('button.vjs-captions-button').count(), 1);
            assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
            const playerBox = await page.locator('#player').boundingBox();
            const fullBox = await page.locator('.vjs-fullscreen-control').boundingBox();
            assert.ok(fullBox.width >= 44 && fullBox.height >= 44);
            assert.ok(fullBox.x >= playerBox.x && fullBox.x + fullBox.width <= playerBox.x + playerBox.width + 1);
            assert.equal(await page.locator('.vjs-wide-control').isVisible(), width >= 1100);
            await page.screenshot({ path: path.join(artifacts, `${engine}-actual-player-${width}.png`) });
            if ([390, 1440].includes(width)) await page.screenshot({ path: path.join(artifacts, `${engine}-actual-player-${touch ? 'mobile' : 'desktop'}.png`) });
            assert.deepEqual(errors, []);
            await context.close();
        }
    });

    test(`${engine}: buffer refresh reloads the selected source and restores playback`, async () => {
        for (const fixture of ['watch-single', 'embed-mobile']) {
            const {page, context, errors, requests} = await pageFor(engine, {
                fixture, realPlayer: true, extraQuality: true,
                route: fixture === 'embed-mobile' ? 'embed/2isYuQZMbdU' : undefined
            });
            const refresh = page.locator('.vjs-refresh-buffer');
            assert.equal(await refresh.getAttribute('title'), 'Refresh video buffer');
            assert.equal(await page.evaluate(() => {
                const controls = player.getChild('controlBar').children();
                return controls.findIndex(control => control.hasClass('vjs-refresh-buffer')) + 1 ===
                    controls.findIndex(control => control.hasClass('vjs-captions-button'));
            }), true);

            await page.evaluate(() => {
                player.muted(true); player.volume(.4); player.play();
            });
            await page.waitForFunction(() => player.currentTime() > .1);
            await page.evaluate(() => {
                player.pause(); player.currentTime(1);
                const selector = player.getChild('controlBar').getChild('qualitySelector');
                selector.items.find(item => item.source.label === 'high').handleClick();
                player.ready(() => player.load());
            });
            await page.waitForFunction(() => player.currentSource().label === 'high' && player.currentTime() >= .9, null, {timeout: 10000}).catch(async () => {
                throw new Error(JSON.stringify(await page.evaluate(() => ({
                    source: player.currentSource(), time: player.currentTime(), paused: player.paused(),
                    ready: player.readyState(), error: player.error()
                }))));
            });
            await page.evaluate(() => {
                player.playbackRate(1.5);
                player.hasStarted(true);
                const caption = Array.from(player.textTracks()).find(track => track.kind === 'captions');
                if (caption) caption.mode = 'showing';
            });
            const before = requests.filter(path => path.startsWith('/latest_version')).length;
            const source = await page.evaluate(() => player.currentSrc());
            await page.evaluate(() => { window.refreshEmptied = []; player.on('emptied', () => {
                window.refreshEmptied.push(player.tech({IWillNotUseThisInPlugins: true}).el().buffered.length);
            }); player.userActive(true); });
            const mediaRequest = page.waitForRequest(request => new URL(request.url()).pathname === '/latest_version');
            await refresh.click();
            await mediaRequest;
            await page.waitForFunction(() => window.refreshEmptied.length && player.currentTime() >= .9 && player.readyState() >= 1);
            assert.equal(await page.evaluate(() => player.currentSrc()), source);
            assert.equal(await page.evaluate(() => player.currentSource().label), 'high');
            assert.ok(requests.filter(path => path.startsWith('/latest_version')).length > before);
            assert.ok((await page.evaluate(() => window.refreshEmptied)).includes(0));
            assert.equal(await page.evaluate(() => player.paused()), true);
            assert.equal(await page.evaluate(() => player.playbackRate()), 1.5);
            assert.equal(await page.evaluate(() => player.volume()), .4);
            assert.equal(await page.evaluate(() => player.muted()), true);
            assert.equal(await page.evaluate(() => Array.from(player.textTracks()).find(track => track.mode === 'showing').label), 'English');
            assert.deepEqual(errors, []);
            await context.close();
        }
    });

    test(`${engine}: mobile refresh is in settings on watch and embed players`, async () => {
        for (const fixture of ['watch-single', 'embed-mobile']) {
            const {page, context, requests, errors} = await pageFor(engine, {
                fixture, realPlayer: true, touch: true, width: 390, height: 844,
                route: fixture === 'embed-mobile' ? 'embed/2isYuQZMbdU' : undefined
            });
            assert.equal(await page.locator('.vjs-refresh-buffer').isVisible(), false);
            await page.evaluate(() => { player.muted(true); player.play(); });
            await page.waitForFunction(() => player.currentTime() > .1);
            const source = await page.evaluate(() => player.currentSrc());
            const before = requests.filter(path => path.startsWith('/latest_version')).length;
            await page.locator('.vjs-mobile-settings').tap();
            const panel = page.locator('.mobile-player-settings');
            const mediaRequest = page.waitForRequest(request => new URL(request.url()).pathname === '/latest_version');
            await panel.getByRole('button', {name: 'Refresh video buffer'}).tap();
            await mediaRequest;
            await panel.waitFor({state: 'hidden'});
            await page.waitForFunction(() => player.currentTime() > .1 && !player.paused());
            assert.equal(await page.evaluate(() => player.currentSrc()), source);
            assert.ok(requests.filter(path => path.startsWith('/latest_version')).length > before);
            if (fixture === 'watch-single') {
                await page.evaluate(() => { video_data.local_disabled = true; player.error({code: MediaError.MEDIA_ERR_DECODE}); player.userActive(true); });
                await page.locator('.vjs-mobile-settings').tap();
                const retry = page.waitForRequest(request => new URL(request.url()).pathname === '/latest_version');
                await page.locator('.mobile-player-settings').getByRole('button', {name: 'Refresh video buffer'}).tap();
                await retry;
                await page.waitForFunction(() => !player.error() && !player.paused());
            }
            assert.deepEqual(errors, []);
            await context.close();
        }
    });

    test(`${engine}: refresh can retry a player error and then refresh again`, async () => {
        const {page, context, requests, errors} = await pageFor(engine, {fixture: 'watch-single', realPlayer: true});
        await page.evaluate(() => { player.muted(true); player.play(); });
        await page.waitForFunction(() => player.currentTime() > .1);
        await page.evaluate(() => { video_data.local_disabled = true; player.error({code: MediaError.MEDIA_ERR_DECODE}); player.userActive(true); });
        assert.equal(await page.evaluate(() => player.error().code), 3);
        const refresh = page.locator('.vjs-refresh-buffer');
        assert.equal(await refresh.isVisible(), true);
        const before = requests.filter(path => path.startsWith('/latest_version')).length;
        const firstRequest = page.waitForRequest(request => new URL(request.url()).pathname === '/latest_version', {timeout: 5000}).then(() => true, () => false);
        await refresh.click({timeout: 5000});
        assert.ok(await firstRequest);
        await page.waitForFunction(() => !player.error() && !player.paused() && player.currentTime() > .1);
        assert.ok(requests.filter(path => path.startsWith('/latest_version')).length > before);
        const secondRequest = page.waitForRequest(request => new URL(request.url()).pathname === '/latest_version');
        await refresh.click();
        await secondRequest;
        assert.deepEqual(errors, []);
        await context.close();
    });

    test(`${engine}: refresh restores DASH quality and audio after tracks are recreated`, async () => {
        const {page, context, errors} = await pageFor(engine, {
            fixture: 'watch-single', realPlayer: true, videoData: {params: {quality: 'dash'}}
        });
        await page.evaluate(() => {
            player.muted(true); player.play();
        });
        await page.waitForFunction(() => player.currentTime() > .1);
        await page.evaluate(() => {
            const levels = player.qualityLevels();
            [360, 720].forEach(height => {
                let enabled = height === 720;
                levels.addQualityLevel({id: String(height), height, bitrate: height * 1000,
                    enabled: value => value === undefined ? enabled : (enabled = value)});
            });
            player.audioTracks().addTrack(new videojs.AudioTrack({id: 'en', kind: 'main', label: 'English', language: 'en'}));
            player.audioTracks().addTrack(new videojs.AudioTrack({id: 'id', kind: 'alternative', label: 'Indonesian', language: 'id', enabled: true}));
            player.one('loadstart', () => {
                Array.from(levels).forEach(level => levels.removeQualityLevel(level));
                [360, 720].forEach(height => {
                    let enabled = true;
                    levels.addQualityLevel({id: String(height), height, bitrate: height * 1000,
                        enabled: value => value === undefined ? enabled : (enabled = value)});
                });
                player.audioTracks().addTrack(new videojs.AudioTrack({id: 'en', kind: 'main', label: 'English', language: 'en', enabled: true}));
                player.audioTracks().addTrack(new videojs.AudioTrack({id: 'id', kind: 'alternative', label: 'Indonesian', language: 'id'}));
            });
            player.refreshBuffer();
        });
        await page.waitForFunction(() => player.readyState() >= 1 &&
            Array.from(player.qualityLevels()).length === 2 &&
            Array.from(player.qualityLevels()).find(level => level.height === 720).enabled &&
            !Array.from(player.qualityLevels()).find(level => level.height === 360).enabled &&
            Array.from(player.audioTracks()).some(track => track.id === 'id' && track.enabled));
        assert.deepEqual(errors, []);
        await context.close();
    });

    test(`${engine}: header is horizontal and Library navigation is always available`, async () => {
        const { page, context, errors } = await pageFor(engine, { fixture: 'browse-dark' });
        const rail = page.locator('.navigation-rail');
        for (const feed of ['history', 'subscriptions', 'playlists']) assert.equal(await rail.locator(`a[href="/feed/${feed}"]`).isVisible(), true);
        assert.equal(await rail.locator('a[href="/preferences"]').isVisible(), true);
        assert.equal(await rail.locator('a[href="/"]').count(), 0);
        assert.equal(await page.locator('.index-link').getAttribute('href'), '/');
        assert.equal((await page.locator('.navigation-menu > summary').textContent()).trim(), '☰');
        assert.equal(await page.locator('.user-field a[href*="preferences"]').count(), 0);
        assert.ok((await page.locator('.index-link').boundingBox()).height <= 40);
        await page.setViewportSize({ width: 390, height: 844 });
        await page.locator('.navigation-menu > summary').click();
        for (const feed of ['history', 'subscriptions', 'playlists']) assert.equal(await page.locator(`.navigation-menu a[href="/feed/${feed}"]`).isVisible(), true);
        await page.keyboard.press('Escape');
        assert.equal(await page.locator('.navigation-menu').getAttribute('open'), null);
        assert.deepEqual(errors, []);
        await context.close();
    });

    test(`${engine}: account link lives in Preferences and the mobile header stays visible`, async () => {
        const signedIn = await pageFor(engine, {fixture: 'preferences-signed-in', javascript: false});
        assert.equal(await signedIn.page.locator('header a[href="/account"]').count(), 1);
        assert.equal(await signedIn.page.locator('#preferences-library a[href^="/account?referer="]').textContent(), 'Account settings');
        assert.equal(await signedIn.page.locator('header .pure-menu-heading[href="/account"]').count(), 0);
        assert.equal(await signedIn.page.locator('#user_name').isVisible(), true);
        assert.equal(await signedIn.page.locator('#user_name').getAttribute('href'), '/account');
        await signedIn.page.setViewportSize({width: 390, height: 844});
        assert.equal(await signedIn.page.locator('#user_name').isVisible(), false);
        await signedIn.context.close();

        const noNick = await pageFor(engine, {fixture: 'preferences-signed-in-no-nick', javascript: false});
        assert.equal(await noNick.page.locator('header a[href="/account"]').count(), 0);
        await noNick.context.close();

        for (const fixture of ['preferences', 'preferences-diary', 'preferences-rtl', 'preferences-signed-in', 'preferences-diary-signed-in']) {
            for (const [width, javascript] of [[320, false], [390, true]]) {
            const {page, context, errors} = await pageFor(engine, {fixture, width, height: 640, javascript});
            const header = page.locator('.navbar');
            assert.equal(await header.evaluate(el => getComputedStyle(el).position), 'sticky');
            assert.notEqual(await header.evaluate(el => getComputedStyle(el).backgroundColor), 'rgba(0, 0, 0, 0)');
            await page.evaluate(() => scrollTo(0, 700));
            await page.waitForFunction(() => scrollY > 300);
            assert.ok(Math.abs((await header.boundingBox()).y) <= 1, `${fixture}: header did not stick`);
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, `${fixture}: horizontal overflow`);
            const search = page.locator('.navbar input[type=search]');
            await search.fill('light');
            assert.equal(await search.inputValue(), 'light');
            await page.locator('.navigation-menu > summary').click();
            assert.equal(await page.locator('.navigation-menu nav').isVisible(), true);
            const firstLink = await page.locator('.navigation-menu nav a').first().boundingBox();
            assert.equal(await page.evaluate(({x, y}) => document.elementFromPoint(x, y)?.closest('.navigation-menu') !== null, {x: firstLink.x + 10, y: firstLink.y + 10}), true);
            await page.locator('.navigation-menu > summary').focus();
            await page.keyboard.press('Enter');
            assert.equal(await page.locator('.navigation-menu nav').isVisible(), false);
            if (width === 390) {
                await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
                const overflow = await page.evaluate(() => ({viewport: innerWidth, content: document.documentElement.scrollWidth}));
                assert.ok(overflow.content <= overflow.viewport + 1, `${fixture}: enlarged text overflows ${JSON.stringify(overflow)}`);
            }
            const target = fixture.endsWith('-signed-in') ? 'preferences-library' : 'preferences-playback';
            await page.locator(`.preference-nav a[href="#${target}"]`).click();
            await page.waitForFunction(id => location.hash === `#${id}`, target);
            const targetBox = await page.locator(`#${target}`).boundingBox();
            const headerBox = await header.boundingBox();
            assert.ok(targetBox.y >= headerBox.y + headerBox.height - 2, `${fixture} at ${width}: section hidden by header (target ${targetBox.y}, header ${headerBox.height})`);
            assert.deepEqual(errors, []);
            await context.close();
            }
        }

    });

    test(`${engine}: header stays visible on tablet and desktop pages`, async () => {
        const cases = [
            ...['preferences', 'preferences-diary', 'preferences-signed-in', 'preferences-diary-signed-in'].flatMap(fixture => [768, 1024, 1440].map(width => [fixture, width])),
            ...['watch-dark', 'watch-diary-light'].flatMap(fixture => [1024, 1440].map(width => [fixture, width])),
            ['preferences-rtl', 1440], ['browse-signed-in', 1920]
        ];
        for (const [fixture, width] of cases) {
            const {page, context, errors} = await pageFor(engine, {fixture, width, height: 640, javascript: false});
            const header = page.locator('.navbar');
            assert.equal(await header.evaluate(el => getComputedStyle(el).position), 'sticky');
            assert.notEqual(await header.evaluate(el => getComputedStyle(el).backgroundColor), 'rgba(0, 0, 0, 0)');
            if (width === 1440 && fixture.startsWith('preferences') && fixture !== 'preferences-rtl') {
                await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
            }
            await page.evaluate(() => scrollTo(0, 700));
            await page.waitForFunction(() => scrollY > 300);
            const headerBox = await header.boundingBox();
            assert.ok(Math.abs(headerBox.y) <= 1, `${fixture} at ${width}: header did not stick`);
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, `${fixture} at ${width}: horizontal overflow`);
            const search = page.locator('.navbar input[type=search]');
            await search.fill('light');
            assert.equal(await search.inputValue(), 'light');
            if (fixture.startsWith('preferences')) {
                await page.locator('.preference-nav a[href="#preferences-playback"]').click();
                await page.waitForFunction(() => location.hash === '#preferences-playback');
                const targetBox = await page.locator('#preferences-playback').boundingBox();
                assert.ok(targetBox.y >= (await header.boundingBox()).height - 2, `${fixture} at ${width}: section hidden by header`);
                if (width >= 1100) {
                    await page.evaluate(() => scrollTo(0, 700));
                    const railBox = await page.locator('.navigation-rail').boundingBox();
                    const currentHeader = await header.boundingBox();
                    assert.ok(railBox.y >= currentHeader.y + currentHeader.height, `${fixture}: rail overlaps header`);
                    assert.ok(railBox.y + railBox.height <= 640 + 1, `${fixture}: rail exceeds viewport`);
                }
            } else {
                await page.evaluate(() => { location.hash = '#main-content'; });
                await page.waitForFunction(() => location.hash === '#main-content');
                const mainBox = await page.locator('#main-content').boundingBox();
                assert.ok(mainBox.y >= (await header.boundingBox()).height - 2, `${fixture} at ${width}: main content hidden by header`);
            }
            assert.deepEqual(errors, []);
            await context.close();
        }
    });

    test(`${engine}: sticky header covers thumbnails while video menus can overlap it`, async () => {
        const cases = [
            ['browse-diary-light', '.media-item[data-kind=video] .bottom-right-overlay .length'],
            ['playlist-diary-editable', '.media-item[data-kind=playlist-video] .top-left-overlay .ion-md-trash'],
            ['browse-diary-thin', '.media-item[data-kind=video] .video-placeholder']
        ];
        for (const [fixture, selector] of cases) {
            const {page, context, errors} = await pageFor(engine, {fixture, width: 1280, height: 500, javascript: false});
            const overlap = await page.locator(selector).first().evaluate(element => {
                const header = document.querySelector('.navbar');
                const before = element.getBoundingClientRect();
                scrollBy(0, before.top + before.height / 2 - header.getBoundingClientRect().height / 2);
                const target = element.getBoundingClientRect();
                const bar = header.getBoundingClientRect();
                const x = target.left + target.width / 2;
                const y = target.top + target.height / 2;
                return {intersects: y > bar.top && y < bar.bottom, headerOnTop: header.contains(document.elementFromPoint(x, y))};
            });
            assert.equal(overlap.intersects, true, `${fixture}: control did not reach the sticky header`);
            assert.equal(overlap.headerOnTop, true, `${fixture}: control painted above the sticky header`);
            assert.deepEqual(errors, []);
            await context.close();
        }

        const {page, context, errors} = await pageFor(engine, {fixture: 'browse-diary-light', width: 1280, height: 500});
        await page.keyboard.press('Tab');
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
        const skipLink = await page.locator('.skip-link').evaluate(element => {
            const box = element.getBoundingClientRect();
            return document.activeElement === element && element === document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
        });
        assert.equal(skipLink, true, 'Focused skip link must be above the header');

        const menu = page.locator('.video-context').first();
        await menu.locator('summary').click();
        const panel = menu.locator('.video-context-actions');
        await panel.waitFor({state: 'visible'});
        await page.evaluate(() => scrollBy(0, 450));
        await page.waitForFunction(() => {
            const bar = document.querySelector('.navbar').getBoundingClientRect();
            const panel = document.querySelector('.video-context[open] .video-context-actions');
            const box = panel?.getBoundingClientRect();
            return box && panel.dataset.positioned === 'true' && box.top < bar.bottom && box.bottom > bar.top;
        });
        assert.equal(await panel.evaluate(element => {
            const box = element.getBoundingClientRect();
            const bar = document.querySelector('.navbar').getBoundingClientRect();
            const x = box.left + box.width / 2;
            const y = Math.max(box.top, bar.top) + (Math.min(box.bottom, bar.bottom) - Math.max(box.top, bar.top)) / 2;
            return element.contains(document.elementFromPoint(x, y));
        }), true, 'Open video menu must appear above the header');
        assert.deepEqual(errors, []);
        await context.close();
    });

    test(`${engine}: player wide control, paused idle state and keyboard access`, async () => {
        const { page, context, errors } = await pageFor(engine, { realPlayer: true });
        await page.evaluate(() => { player.muted(true); player.play(); });
        await page.waitForFunction(() => player.currentTime() > 0.1);
        await page.evaluate(() => player.pause());
        const wide = page.locator('.vjs-wide-control');
        assert.equal(await wide.getAttribute('title'), 'Wide player');
        assert.equal(await page.locator('.watch-actions #wide-player').count(), 0);
        const before = await page.locator('#player-container').boundingBox();
        assert.equal(await wide.getAttribute('aria-pressed'), 'true');
        await wide.click();
        assert.equal(await wide.getAttribute('aria-pressed'), 'false');
        assert.ok((await page.locator('#player-container').boundingBox()).width < before.width);
        await wide.click();
        assert.equal(await wide.getAttribute('aria-pressed'), 'true');
        const wideBox = await wide.boundingBox();
        const fullBox = await page.locator('.vjs-fullscreen-control').boundingBox();
        assert.ok(Math.abs(fullBox.x - (wideBox.x + wideBox.width)) <= 4);
        assert.ok(wideBox.width >= 44 && wideBox.height >= 44);
        await page.mouse.move(0, 0);
        await page.waitForFunction(() => !player.userActive(), null, { timeout: 6000 });
        await page.waitForFunction(() => getComputedStyle(player.controlBar.el()).opacity === '0');
        assert.equal(await page.evaluate(() => player.paused()), true);
        await page.mouse.move(before.x + 100, before.y + 100, { steps: 5 });
        await page.waitForFunction(() => getComputedStyle(player.controlBar.el()).opacity === '1');
        // Keyboard focus must keep the focused control accessible during inactivity.
        await page.keyboard.press('Tab');
        await wide.focus();
        await page.evaluate(() => player.userActive(false));
        assert.equal(await wide.isVisible(), true);
        await page.keyboard.press('Enter');
        assert.equal(await wide.getAttribute('aria-pressed'), 'false');
        assert.equal(await page.evaluate(() => player.paused()), true);
        assert.deepEqual(errors, []);
        await context.close();
    });

    test(`${engine}: player menus support transient hover and persistent click modes`, async () => {
        const { page, context, errors } = await pageFor(engine, { realPlayer: true });
        const button = page.locator('button.vjs-playback-rate');
        const menu = page.locator('.vjs-playback-rate .vjs-menu-content');
        await page.evaluate(() => { player.muted(true); player.play(); });
        await page.waitForFunction(() => player.currentTime() > 0.1);
        await page.evaluate(() => player.userActive(true));
        await button.hover();
        await menu.waitFor({ state: 'visible' });
        await menu.getByText('1.5x', { exact: true }).hover();
        assert.equal(await menu.isVisible(), true);
        await menu.getByText('1.5x', { exact: true }).click();
        await page.waitForFunction(() => player.playbackRate() === 1.5);
        await menu.waitFor({ state: 'hidden' });

        await button.hover();
        await menu.waitFor({ state: 'visible' });
        await page.mouse.move(0, 0);
        await menu.waitFor({ state: 'hidden' });

        await button.click();
        await menu.waitFor({ state: 'visible' });
        await page.mouse.move(0, 0);
        assert.equal(await menu.isVisible(), true);
        await menu.getByText('1.25x', { exact: true }).click();
        await page.waitForFunction(() => player.playbackRate() === 1.25);
        await menu.waitFor({ state: 'hidden' });
        assert.deepEqual(errors, []);
        await context.close();
    });

    test(`${engine}: history search by title or channel`, async () => {
        const result = await pageFor(engine, { fixture: 'history-search', javascript: false });
        assert.equal(await result.page.locator('.media-card').count(), 1);
        assert.match(await result.page.locator('.media-card').textContent(), /Studio North/);
        assert.equal(await result.page.locator('#history-search').inputValue(), 'STUDIO north');
        assert.equal(await result.page.getByRole('link', { name: 'Clear search', exact: true }).getAttribute('href'), '/feed/history');
        await result.page.locator('#history-search').fill('Light & color');
        await Promise.all([
            result.page.waitForURL(url => url.pathname === '/feed/history' && url.searchParams.get('q') === 'Light & color'),
            result.page.locator('form[aria-label="Search history"] button').click()
        ]);
        assert.equal(new URL(result.page.url()).searchParams.has('page'), false);
        assert.equal(result.requests.some(url => url.startsWith('/api/v1/videos/')), false);
        assert.deepEqual(result.errors, []);
        await result.context.close();
        const empty = await pageFor(engine, { fixture: 'history-no-matches', width: 390 });
        assert.equal(await empty.page.locator('.media-card').count(), 0);
        assert.equal(await empty.page.locator('.history-group').count(), 0);
        assert.equal(await empty.page.getByText('No videos match your search.', { exact: true }).isVisible(), true);
        assert.equal(await empty.page.locator('#history-search').inputValue(), '<unmatched>');
        assert.deepEqual(empty.errors, []);
        await empty.context.close();
    });

    test(`${engine}: cached history titles and compact desktop playlist library`, async () => {
        const history = await pageFor(engine, { fixture: 'history' });
        const cards = history.page.locator('.media-card');
        assert.match(await cards.nth(0).textContent(), /A journey through light/);
        assert.match(await cards.nth(1).textContent(), /Light <study> & color/);
        assert.match(await cards.nth(2).textContent(), /Watch date unknown/);
        assert.equal(await cards.nth(0).locator('a[href="/channel/UCfixture"]').count(), 1);
        assert.match(await cards.nth(0).textContent(), /2026-08-01/);
        assert.deepEqual(await history.page.locator('.history-group h2').allTextContents(), ['Today', 'Yesterday', 'Older']);
        assert.equal(await cards.nth(2).locator('img').count(), 1);
        assert.equal(history.requests.some(url => url.startsWith('/api/v1/videos/')), false);
        assert.deepEqual(history.errors, []);
        await history.page.screenshot({ path: path.join(artifacts, `history-${engine}.png`), fullPage: true });
        await history.page.route('**/watch_ajax?**', route => route.fulfill({ status: 500, body: '{}' }));
        await cards.nth(0).locator('[data-onclick="mark_unwatched"]').click();
        await history.page.waitForFunction(() => document.querySelector('.history-group').style.display === '');
        assert.equal(await history.page.locator('.history-group').first().isVisible(), true);
        await history.page.route('**/watch_ajax?**', route => route.fulfill({ status: 200, body: '{}' }));
        await cards.nth(0).locator('[data-onclick="mark_unwatched"]').click();
        assert.equal(await history.page.locator('.history-group').first().isVisible(), false);
        await history.context.close();
        for (const fixture of ['history-empty', 'history-thin']) {
            const variant = await pageFor(engine, { fixture, width: 390, javascript: false });
            assert.equal(await variant.page.locator('.media-card img').count(), 0);
            assert.equal(await variant.page.locator('.history-group').count(), fixture === 'history-empty' ? 0 : 3);
            assert.deepEqual(variant.errors, []);
            await variant.context.close();
        }
        const library = await pageFor(engine, { fixture: 'playlist-library' });
        const image = library.page.locator('.playlist-library img').first();
        assert.ok((await image.boundingBox()).width < 420);
        await library.page.setViewportSize({ width: 390, height: 844 });
        assert.ok((await image.boundingBox()).width > 300);
        assert.deepEqual(library.errors, []);
        await library.context.close();
    });

    test(`${engine}: mobile paused controls hide, wake on tap, and keep menus usable`, async () => {
        const { page, context, errors } = await pageFor(engine, { realPlayer: true, touch: true, width: 390, height: 844 });
        await page.evaluate(() => { player.muted(true); player.play(); });
        await page.waitForFunction(() => player.currentTime() > 0.1);
        await page.evaluate(() => player.pause());
        await page.waitForFunction(() => !player.userActive(), null, { timeout: 6000 });
        await page.locator('.vjs-mobile-settings').waitFor({ state: 'hidden' });
        const box = await page.locator('#player').boundingBox();
        await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
        await page.waitForFunction(() => player.userActive());
        await page.locator('.vjs-mobile-settings').waitFor({ state: 'visible' });
        assert.equal(await page.locator('.vjs-mobile-settings').isVisible(), true);
        assert.equal(await page.evaluate(() => player.paused()), true);
        await page.locator('.vjs-mobile-settings').tap();
        assert.deepEqual(errors, []);
        const panel = page.locator('.mobile-player-settings');
        await panel.waitFor({state: 'visible'});
        const panelBox = await panel.boundingBox();
        assert.equal(panelBox.width, 390);
        assert.equal(panelBox.height, 844);
        await panel.getByRole('button', {name: /Playback speed/}).tap();
        await panel.getByRole('button', {name: '1.5x', exact: true}).tap();
        await page.waitForFunction(() => player.playbackRate() === 1.5);
        assert.equal(await page.evaluate(() => player.playbackRate()), 1.5);
        assert.equal(await page.evaluate(() => player.paused()), true);
        await page.setViewportSize({width: 844, height: 390});
        await page.waitForFunction(() => document.querySelector('.mobile-player-settings').getBoundingClientRect().height === 390);
        await page.screenshot({path: path.join(artifacts, `${engine}-player-mobile-menu.png`)});
        await panel.getByRole('button', {name: 'Close', exact: true}).tap();
        await panel.waitFor({state: 'hidden'});
        assert.deepEqual(errors, []);
        await context.close();
    });

    test(`${engine}: mobile video taps toggle all controls while playing`, async () => {
        const { page, context, errors } = await pageFor(engine, { realPlayer: true, touch: true, mobileUserAgent: true, width: 390, height: 844 });
        await page.evaluate(() => { player.muted(true); player.play(); });
        await page.waitForFunction(() => player.currentTime() > 0.1);
        await page.waitForFunction(() => !player.userActive(), null, { timeout: 6000 });
        const box = await page.locator('#player').boundingBox();
        await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 3);
        await page.waitForFunction(() => player.userActive());
        await page.locator('.vjs-touch-overlay.show-play-toggle').waitFor({ state: 'attached' });
        await page.locator('.vjs-mobile-settings').waitFor({ state: 'visible' });
        assert.equal(await page.locator('.vjs-mobile-settings').isVisible(), true);
        await page.touchscreen.tap(box.x + box.width / 4, box.y + box.height / 3);
        await page.waitForFunction(() => !player.userActive());
        await page.locator('.vjs-mobile-settings').waitFor({ state: 'hidden' });
        await page.waitForFunction(() => getComputedStyle(document.querySelector('.vjs-touch-overlay .vjs-play-control')).opacity === '0');
        assert.deepEqual(errors, []);
        await context.close();
    });

    test(`${engine}: queue selects a repeated occurrence, and keeps recommendations separate`, async () => {
        const { page, context, errors } = await pageFor(engine);
        await page.waitForSelector('.queue-row a[aria-current]');
        assert.equal(await page.locator('.queue-row:has([aria-current])').getAttribute('data-index'), '2');
        assert.equal(await page.locator('.queue-row [aria-current]').count(), 1);
        assert.match(await page.locator('[data-direction=previous]').getAttribute('href'), /index=1/);
        assert.match(await page.locator('[data-direction=next]').getAttribute('href'), /index=3/);
        assert.equal(await page.locator('#queue-title').textContent(), 'Light & motion <study>');
        assert.equal(await page.locator('.recommendations a[href*="list="]').count(), 0);
        assert.equal(await page.evaluate(() => window.__ended.length), 1);
        assert.deepEqual(errors, []);
        await context.close();
    });

    test(`${engine}: queue failure is retryable and does not enable recommendation autoplay`, async () => {
        const { page, context, errors } = await pageFor(engine, { queueError: 1 });
        await page.waitForSelector('#queue-retry:not([hidden])');
        assert.equal(await page.evaluate(() => window.__ended.length), 0);
        await page.locator('#queue-retry').click();
        await page.waitForSelector('.queue-row [aria-current]');
        assert.equal(await page.evaluate(() => window.__ended.length), 1);
        await page.evaluate(() => get_playlist('PLfixture'));
        await page.waitForSelector('.queue-row [aria-current]');
        assert.equal(await page.evaluate(() => window.__ended.length), 1);
        assert.deepEqual(errors, []);
        await context.close();
    });

    test(`${engine}: missing, empty and ended queues do not attach an advancement handler`, async () => {
        for (const response of [{ playlistHtml: '<ol></ol>', nextVideo: null }, { ...queue, nextVideo: null }]) {
            const { page, context, errors } = await pageFor(engine, { queue: response });
            await page.waitForFunction(() => document.getElementById('playlist').getAttribute('aria-busy') === 'false');
            assert.equal(await page.evaluate(() => window.__ended.length), 0);
            assert.equal(await page.locator('[data-direction=next]').count(), 0);
            assert.ok(await page.locator('#queue-status').textContent());
            assert.deepEqual(errors, []);
            await context.close();
        }
    });

    test(`${engine}: transcript loads on demand, searches safely, seeks, caches, and retries`, async () => {
        const { page, context, errors, requests, transcriptCalls } = await pageFor(engine, { transcriptError: 1 });
        assert.equal(transcriptCalls(), 0);
        assert.equal(requests.some(url => url.startsWith('/js/transcript.js')), false);
        await page.locator('#transcript-panel > summary').click();
        await page.waitForSelector('#transcript-retry:not([hidden])');
        await page.locator('#transcript-retry').click();
        await page.waitForSelector('.transcript-line');
        assert.equal(await page.locator('.transcript-line img').count(), 0);
        await page.locator('#transcript-search').fill('Finding');
        assert.equal(await page.locator('.transcript-line').count(), 1);
        await page.locator('.transcript-line button').click();
        assert.equal(await page.evaluate(() => window.__time), 80);
        await page.locator('#transcript-search').fill('not present');
        assert.equal(await page.locator('#transcript-status').textContent(), 'No matching transcript lines.');
        await page.locator('#transcript-search').fill('');
        await page.locator('#transcript-language').selectOption({ index: 1 });
        await page.waitForFunction(() => document.getElementById('transcript-status').textContent.includes('Automatically'));
        await page.locator('#transcript-language').selectOption({ index: 0 });
        assert.equal(transcriptCalls(), 3);
        assert.equal(await page.locator('#timestamp-panel').evaluate(panel => panel.open), false);
        await page.locator('#timestamp-panel > summary').click();
        await page.locator('#timestamp-list a').nth(1).click();
        assert.equal(await page.evaluate(() => window.__time), 80);
        assert.deepEqual(errors, []);
        await context.close();
    });

    test(`${engine}: mobile queue is immediately below player, collapsible, and keyboard operable`, async () => {
        const { page, context, errors } = await pageFor(engine, { width: 390 });
        await page.waitForSelector('.queue-row', { state: 'attached' });
        assert.equal(await page.locator('#playlist').isVisible(), false);
        const player = await page.locator('#player-container').boundingBox();
        const panel = await page.locator('#playlist-panel').boundingBox();
        const title = await page.locator('.watch-heading').boundingBox();
        assert.ok(player.y + player.height <= panel.y + 1);
        assert.ok(panel.y + panel.height <= title.y + 1);
        await page.locator('#queue-toggle').focus();
        await page.keyboard.press('Enter');
        assert.equal(await page.locator('#playlist').isVisible(), true);
        assert.equal(await page.locator('#queue-toggle').getAttribute('aria-expanded'), 'true');
        assert.equal(await page.evaluate(() => document.activeElement.id), 'queue-toggle');
        await page.evaluate(() => {
            const list = document.getElementById('playlist');
            const rows = list.querySelector('ol');
            for (let i = 0; i < 8; i++) rows.appendChild(rows.lastElementChild.cloneNode(true));
            list.scrollTop = list.scrollHeight;
        });
        const scroll = await page.locator('#playlist').evaluate(el => el.scrollTop);
        assert.ok(scroll > 0);
        await page.setViewportSize({ width: 390, height: 800 });
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        assert.equal(await page.locator('#playlist').evaluate(el => el.scrollTop), scroll);
        assert.deepEqual(errors, []);
        await context.close();
    });

    test(`${engine}: Random is the leftmost accessible theme choice and submits without JavaScript`, async () => {
        const { page, context } = await pageFor(engine, { fixture: 'preferences', javascript: false });
        const random = page.locator('#theme-random');
        assert.equal(await page.locator('.theme-option input').first().getAttribute('value'), 'random');
        assert.equal(await page.locator('label[for="theme-random"] svg').count(), 1);
        await random.check();
        await page.locator('#theme_random_interval_hours').fill('12');
        const posted = page.waitForRequest(request => request.method() === 'POST');
        await page.getByRole('button', { name: 'Save preferences', exact: true }).click();
        const data = new URLSearchParams((await posted).postData());
        assert.equal(data.get('theme'), 'random');
        assert.equal(data.get('theme_random_interval_hours'), '12');
        await context.close();
    });

    test(`${engine}: Random remains selected and open pages do not change at the deadline`, async () => {
        const selection = await pageFor(engine, { fixture: 'preferences-random' });
        assert.equal(await selection.page.locator('#theme-random').isChecked(), true);
        await selection.page.locator('#theme-random').focus();
        await selection.page.keyboard.press('ArrowRight');
        assert.equal(await selection.page.locator('#theme-modern-neon').isChecked(), true);
        await selection.context.close();
        const { page, context, requests } = await pageFor(engine, { fixture: 'browse-random' });
        const theme = await page.locator('body').getAttribute('data-theme');
        const navigations = requests.length;
        await page.clock.install();
        await page.clock.fastForward(7 * 60 * 60 * 1000);
        assert.equal(await page.locator('body').getAttribute('data-theme'), theme);
        assert.equal(requests.length, navigations);
        await context.close();
    });

    test(`${engine}: System follows live appearance changes and cycles independently of visual themes`, async () => {
        for (const fixture of ['browse-auto', 'browse-diary-auto']) {
            const { page, context, requests, errors } = await pageFor(engine, { fixture, systemTheme: 'dark' });
            const activeTheme = await page.locator('body').getAttribute('data-theme');
            const scheme = () => page.locator('body').evaluate(el => getComputedStyle(el).colorScheme);
            assert.equal(await scheme(), 'dark');
            await page.emulateMedia({ colorScheme: 'light' });
            assert.equal(await scheme(), 'light');
            await page.evaluate(() => document.body.classList.add('extra-class'));
            for (const [mode, css] of [['light', 'light'], ['dark', 'dark'], ['', 'light']]) {
                await page.locator('#toggle_theme').click();
                assert.equal(await scheme(), css);
                assert.equal(await page.locator('#toggle_theme').getAttribute('data-mode'), mode || 'system');
                assert.equal(await page.locator('body').getAttribute('data-theme'), activeTheme);
                assert.ok(await page.locator('body').evaluate(el => el.classList.contains('extra-class')));
            }
            assert.ok(requests.some(url => url === '/toggle_theme?redirect=false&mode='));
            await page.reload();
            assert.equal(await page.locator('#toggle_theme').getAttribute('data-mode'), 'system');
            await page.emulateMedia({ colorScheme: 'dark' });
            assert.equal(await scheme(), 'dark');
            const otherTab = await context.newPage();
            await otherTab.route('**/*', route => route.fulfill({ contentType: 'text/html', body: '<html></html>' }));
            await otherTab.goto('https://invidious.test/other-tab');
            await otherTab.evaluate(() => localStorage.setItem('dark_mode', encodeURIComponent(JSON.stringify('light'))));
            await page.waitForFunction(() => document.body.classList.contains('light-theme'));
            assert.equal(await scheme(), 'light');
            await otherTab.evaluate(() => localStorage.setItem('dark_mode', encodeURIComponent(JSON.stringify(''))));
            await page.waitForFunction(() => document.body.classList.contains('no-theme'));
            assert.equal(await scheme(), 'dark');
            assert.deepEqual(errors, []);
            await context.close();
        }
    });

    test(`${engine}: signed-in theme controls submit CSRF by POST with and without JavaScript`, async () => {
        for (const javascript of [true, false]) {
            const { page, context, errors } = await pageFor(engine, { fixture: 'browse-signed-in', javascript });
            const request = page.waitForRequest(req => new URL(req.url()).pathname === '/toggle_theme');
            await page.locator('#toggle_theme').click();
            const sent = await request;
            assert.equal(sent.method(), 'POST');
            assert.equal(new URLSearchParams(sent.postData()).get('csrf_token'), 'fixture-token');
            assert.deepEqual(errors, []);
            await context.close();
        }
    });

    test(`${engine}: theme switching preserves density and page layout`, async () => {
        const { page, context, errors } = await pageFor(engine, { fixture: 'browse-compact' });
        await page.locator('#toggle_theme').click();
        assert.equal(await page.locator('body').getAttribute('data-density'), 'compact');
        assert.equal(await page.locator('body').getAttribute('class'), 'no-theme');
        assert.deepEqual(errors, []);
        await context.close();
    });

    test(`${engine}: no-JavaScript and thin modes retain essential navigation`, async () => {
        const nojs = await pageFor(engine, { javascript: false });
        assert.equal(await nojs.page.locator('#queue-title').isVisible(), true);
        assert.equal(await nojs.page.locator('#share-video').isVisible(), false);
        assert.equal(await nojs.page.locator('#transcript-panel').isVisible(), false);
        if (await nojs.page.locator('#description-box').getAttribute('open') === null) await nojs.page.locator('#description-box > summary').click();
        assert.equal(await nojs.page.locator('#descriptionWrapper').isVisible(), true);
        await nojs.context.close();
        const thin = await pageFor(engine, { fixture: 'watch-thin' });
        await thin.page.waitForSelector('.queue-row');
        assert.equal(await thin.page.locator('.queue-row img, .recommendation img').count(), 0);
        assert.deepEqual(thin.errors, []);
        await thin.context.close();
    });

    test(`${engine}: responsive layouts and representative visual snapshots`, async () => {
        for (const fixture of ['watch-dark', 'watch-light', 'watch-rtl', 'browse-dark', 'browse-light', 'browse-compact', 'browse-signed-in', 'preferences', 'history', 'playlist-library']) {
            const session = await pageFor(engine, { fixture });
            for (const width of [320, 390, 768, 1024, 1440, 1920]) {
                await session.page.setViewportSize({ width, height: 1000 });
                await session.page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
                assert.ok(await session.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${fixture} overflows at ${width}px`);
                if ([390, 1440].includes(width)) await session.page.screenshot({ path: path.join(artifacts, `${engine}-${fixture}-${width}.png`), fullPage: true });
            }
            assert.deepEqual(session.errors, [], fixture);
            await session.context.close();
        }
    });

    test(`${engine}: enlarged text and phone landscape keep navigation usable`, async () => {
        for (const fixture of ['watch-dark', 'browse-signed-in', 'preferences']) {
            const { page, context, errors } = await pageFor(engine, { fixture, width: 390 });
            await page.evaluate(() => document.documentElement.style.fontSize = '200%');
            await page.evaluate(() => document.fonts.ready);
            await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
            const overflow = await page.evaluate(() => Array.from(document.querySelectorAll('body *')).filter(el => {
                const box = el.getBoundingClientRect();
                return box.width && box.right > innerWidth + 1;
            }).slice(0, 8).map(el => `${el.tagName}.${el.className}#${el.id}`));
            assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${fixture}: enlarged text ${overflow.join(', ')}`);
            await page.evaluate(() => document.documentElement.style.fontSize = '');
            await page.setViewportSize({ width: 844, height: 390 });
            await page.locator('.navigation-menu > summary').click();
            assert.equal(await page.locator('.navigation-menu a[href="/feed/subscriptions"]').isVisible(), true);
            assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${fixture}: landscape`);
            assert.deepEqual(errors, []);
            await context.close();
        }
    });
}

test('library navigation survives custom feed settings without channel management links', () => {
    const html = fs.readFileSync(path.join(generated, 'navigation-subscribed.html'), 'utf8');
    for (const feed of ['history', 'subscriptions', 'playlists']) assert.ok(html.includes(`href="/feed/${feed}"`));
    assert.ok(html.includes('href="/feed/subscriptions" aria-current=page'));
    assert.ok(!html.includes('/subscription_manager'));
    assert.ok(!html.includes('/channel/'));
    assert.ok(!html.includes('<img'));
});

test('UI asset additions report the advisory 35KB compressed target', () => {
    const baseline = require('./asset-baseline.json');
    let delta = 0;
    let totalShared = 0;
    const themeTotals = [];
    const themeBytes = [];
    for (const [file, originalBytes] of Object.entries(baseline.gzipBytes)) {
        const current = fs.readFileSync(path.join(root, 'assets', file));
        const compressed = gzipSync(current).length;
        if (/^themes\/[^/]+\/theme\.css$/.test(file)) themeTotals.push(compressed);
        else totalShared += compressed;
        const added = compressed - originalBytes;
        if (/^themes\/[^/]+\/theme\.css$/.test(file)) themeBytes.push(added);
        else delta += added;
    }
    // Only one theme stylesheet is loaded: budget the largest alongside shared assets.
    delta += Math.max(0, ...themeBytes);
    for (const file of ['js/dearrow.js', 'js/player-mobile.js', 'js/player-stats.js', 'js/player-stream-menu.js', 'js/dearrow-loader.js', 'js/clip-loader.js', 'js/player-chapters.js', 'css/dearrow.css']) {
        const bytes = gzipSync(fs.readFileSync(path.join(root, 'assets', file))).length;
        delta += bytes;
        totalShared += bytes;
    }
    assert.ok(Number.isFinite(delta) && delta > 0, "Asset inventory must report valid sizes");
    console.log(`Advisory target: 35840 gzip bytes; difference: ${delta - 35840} bytes (visual variety may exceed target).`);
    console.log(`Inventoried initial assets (shared plus largest theme): ${totalShared + Math.max(...themeTotals)} gzip bytes.`);
    console.log(`Initial UI asset increase: ${delta} gzip bytes; transcript loaded on demand.`);
});

// Picker previews are lazy-loaded on preferences, not part of the site-wide CSS/JS budget.
test('Theme preview images stay within the aggregate 12KB-per-theme budget', () => {
    const baseline = require('./asset-baseline.json');
    let delta = 0;
    for (const [file, originalBytes] of Object.entries(baseline.previewGzipBytes)) {
        delta += gzipSync(fs.readFileSync(path.join(root, 'assets', file))).length - originalBytes;
    }
    const budget = Object.keys(baseline.previewGzipBytes).length * 12 * 1024;
    assert.ok(delta <= budget, `${delta} preview bytes added (budget ${budget})`);
});

for (const engine of engines) {
    test(`${engine}: video menus support keyboard dismissal and signed-out sign-in links`, async () => {
        const { page, context, errors } = await pageFor(engine, { fixture: 'browse-dark' });
        const menu = page.locator('.video-context').first();
        await menu.locator('summary').focus();
        await page.keyboard.press('ArrowDown');
        assert.equal(await menu.getAttribute('open'), '');
        await page.waitForFunction(() => document.querySelector('.video-context[open] .video-context-actions a') === document.activeElement);
        assert.equal(await menu.locator('a').first().evaluate(el => el === document.activeElement), true);
        assert.match(await menu.locator('a').first().getAttribute('href'), /^\/login\?referer=/);
        await page.keyboard.press('Escape');
        assert.equal(await menu.getAttribute('open'), null);
        assert.equal(await menu.locator('summary').evaluate(el => el === document.activeElement), true);
        assert.deepEqual(errors, []);
        await context.close();
    });

    test(`${engine}: block removes discovery cards only after success and Undo restores them`, async () => {
        const { page, context } = await pageFor(engine, { fixture: 'browse-signed-in' });
        let fail = true;
        const changes = [];
        await page.route('**/blocked_channels?*', route => {
            changes.push(new URLSearchParams(route.request().postData()));
            return route.fulfill({ status: fail ? 500 : 200, contentType: 'application/json', body: '{}' });
        });
        const menu = page.locator('.video-context').first();
        await menu.locator('summary').click();
        await menu.locator('[data-video-action=block]').click();
        await page.locator('#video-actions-notice').waitFor({ state: 'visible' });
        assert.equal(await page.locator('.media-item:visible').count(), 12);
        fail = false;
        await menu.locator('summary').click();
        await menu.locator('[data-video-action=block]').click();
        await page.locator('#video-actions-undo').waitFor({ state: 'visible' });
        assert.equal(await page.locator('.media-item:visible').count(), 0);
        await page.locator('#video-actions-undo').click();
        await page.locator('.media-item').first().waitFor({ state: 'visible' });
        assert.equal(await page.locator('.media-item:visible').count(), 12);
        assert.deepEqual(changes.map(p => p.get('action')), ['block', 'block', 'unblock']);
        assert.equal(changes[1].get('csrf_token'), 'fixture-token');
        await context.close();
    });

    test(`${engine}: block notice disappears after five seconds and a new status resets the timer`, async () => {
        for (const undoBeforeExpiry of [false, true]) {
            const {page, context, errors} = await pageFor(engine, {fixture: 'browse-signed-in'});
            await page.clock.install();
            await page.route('**/blocked_channels?*', route => route.fulfill({contentType: 'application/json', body: '{}'}));
            const menu = page.locator('.video-context').first();
            await menu.locator('summary').click();
            await menu.locator('[data-video-action=block]').click();
            const notice = page.locator('#video-actions-notice');
            await page.locator('#video-actions-undo').waitFor({state: 'visible'});
            await page.clock.fastForward(4500);
            assert.equal(await notice.isVisible(), true, 'Undo must remain available before five seconds');

            if (undoBeforeExpiry) {
                await page.locator('#video-actions-undo').click();
                await page.waitForFunction(() => document.querySelector('#video-actions-notice span').textContent === document.getElementById('video-actions-config').dataset.unblocked);
                await page.clock.fastForward(600);
                assert.equal(await notice.isVisible(), true, 'Previous timer must not hide the new status');
                await page.clock.fastForward(4600);
            } else {
                await page.clock.fastForward(600);
            }
            await notice.waitFor({state: 'hidden'});
            assert.deepEqual(errors, []);
            await context.close();
        }
    });

    test(`${engine}: playlist creation retains the created playlist when adding fails`, async () => {
        const { page, context, errors } = await pageFor(engine, { fixture: 'browse-signed-in', width: 390 });
        await page.route('**/video_actions', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ playlists: [{ id: 'IVexisting', title: 'Existing' }], defaultPlaylist: 'IVexisting' }) }));
        let creations = 0;
        await page.route('**/create_playlist?*', route => {
            creations++;
            const body = new URLSearchParams(route.request().postData());
            assert.equal(body.get('privacy'), 'Private');
            return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ playlistId: 'IVnew', title: 'New playlist' }) });
        });
        let saves = 0;
        await page.route('**/playlist_ajax?*', route => {
            saves++;
            assert.equal(new URL(route.request().url()).searchParams.get('playlist_id'), 'IVnew');
            return route.fulfill({ status: saves === 1 ? 500 : 200, contentType: 'application/json', body: '{}' });
        });
        const menu = page.locator('.video-context').first();
        await menu.locator('summary').click();
        await menu.locator('[data-video-action=playlist]').click();
        await page.waitForFunction(() => document.getElementById('video-playlist-select').value === 'IVexisting');
        await page.locator('#video-playlist-create-details > summary').click();
        await page.locator('#video-playlist-title').fill('New playlist');
        await page.locator('#video-playlist-create button').click();
        await page.waitForFunction(() => document.getElementById('video-playlist-status').textContent.includes('retry'));
        assert.equal(await page.locator('#video-playlist-select').inputValue(), 'IVnew');
        await page.locator('#video-playlist-save [type=submit]').click();
        await page.waitForFunction(() => document.getElementById('video-playlist-status').textContent === document.getElementById('video-actions-config').dataset.saved);
        assert.equal(creations, 1);
        assert.equal(saves, 2);
        const box = await page.locator('#video-playlist-dialog').boundingBox();
        assert.ok(box.x >= 0 && box.x + box.width <= 390);
        await page.keyboard.press('Escape');
        assert.equal(await menu.locator('summary').evaluate(el => el === document.activeElement), true);
        assert.deepEqual(errors, []);
        await context.close();
    });

    test(`${engine}: search Filters owns the override and filtered-empty pages retain pagination`, async () => {
        const { page, context } = await pageFor(engine, { fixture: 'search-blocked' });
        await page.locator('#filters-collapse > summary').click();
        const toggle = page.locator('#filters input[type=checkbox][name=include_blocked]');
        assert.equal(await toggle.isChecked(), false);
        assert.equal(await page.locator('#filters input[name=page]').inputValue(), '1');
        assert.ok(await page.locator('a[href*="page=3"]').count() > 0);
        assert.ok(await page.locator('.no-results-error a[href*="include_blocked=1"]').count() > 0);
        await context.close();
        const included = await pageFor(engine, { fixture: 'search-included' });
        await included.page.locator('#filters-collapse > summary').click();
        assert.equal(await included.page.locator('#filters input[type=checkbox][name=include_blocked]').isChecked(), true);
        assert.match(await included.page.locator('a[href*="page=3"]').first().getAttribute('href'), /include_blocked=1/);
        await included.context.close();
    });

    test(`${engine}: members-only search controls work without JavaScript and retain pagination`, async () => {
        for (const javascript of [true, false]) {
            const { page, context, errors } = await pageFor(engine, { fixture: 'search-members-hidden', javascript });
            assert.equal(await page.locator('.media-item').count(), 1);
            assert.match(await page.locator('.media-item').innerText(), /Public video/);
            await page.locator('#filters-collapse > summary').click();
            const toggle = page.locator('#filters input[type=checkbox][name=show_member_videos]');
            assert.equal(await toggle.isChecked(), false);
            assert.equal(await page.locator('#filters input[type=checkbox][name=include_blocked]').isChecked(), true);
            assert.match(await page.locator('a[href*="page=3"]').first().getAttribute('href'), /show_member_videos=0/);
            const reset = page.locator('#filters a[href*="reset_member_videos=1"]');
            assert.doesNotMatch(await reset.getAttribute('href'), /[?&]show_member_videos=/);
            await toggle.check();
            await page.locator('#filters-apply button').click();
            assert.deepEqual(new URL(page.url()).searchParams.getAll('show_member_videos'), ['0', '1']);
            assert.deepEqual(errors, []);
            await context.close();
        }
        const shown = await pageFor(engine, { fixture: 'search-members-shown' });
        assert.equal(await shown.page.locator('.media-item').count(), 2);
        assert.equal(await shown.page.locator('#filters input[type=checkbox][name=show_member_videos]').isChecked(), true);
        await shown.page.locator('#filters-collapse > summary').click();
        await shown.page.screenshot({ path: path.join(artifacts, engine + '-members-search.png') });
        await shown.page.setViewportSize({ width: 390, height: 844 });
        assert.equal(await shown.page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        await shown.context.close();
        const empty = await pageFor(engine, { fixture: 'search-members-empty', javascript: false });
        assert.match(await empty.page.locator('.no-results-error').innerText(), /Members-only videos were hidden/);
        assert.ok(await empty.page.locator('.no-results-error a[href*="show_member_videos=1"]').count());
        assert.ok(await empty.page.locator('a[href*="page=3"]').count());
        await empty.context.close();
    });

    test(`${engine}: blocking the next recommendation updates autoplay and Undo restores it`, async () => {
        const { page, context, errors } = await pageFor(engine, { fixture: 'watch-actions' });
        await page.route('**/blocked_channels?*', route => route.fulfill({ contentType: 'application/json', body: '{}' }));
        const first = page.locator('.recommendation').first();
        const videoId = await first.getAttribute('data-video-id');
        const channelId = await first.getAttribute('data-channel-id');
        const expected = await page.locator('.recommendation').evaluateAll((cards, channel) => cards.find(card => card.dataset.channelId !== channel)?.dataset.videoId || null, channelId);
        await first.locator('.video-context > summary').click();
        await first.locator('[data-video-action=block]').click();
        await page.locator('#video-actions-undo').waitFor({ state: 'visible' });
        assert.equal(await page.evaluate(() => video_data.next_video), expected);
        await page.locator('#video-actions-undo').click();
        await first.waitFor({ state: 'visible' });
        assert.equal(await page.evaluate(() => video_data.next_video), videoId);
        assert.deepEqual(errors, []);
        await context.close();
    });
}

for (const engine of engines) {
    test(`${engine}: blocking leaves subscribed and explicitly included search results visible`, async () => {
        for (const routePath of ['feed/subscriptions', 'playlist?list=IVsaved', 'search?q=light&include_blocked=1']) {
            const { page, context } = await pageFor(engine, { fixture: 'browse-signed-in', route: routePath });
            await page.route('**/blocked_channels?*', route => route.fulfill({ contentType: 'application/json', body: '{}' }));
            const menu = page.locator('.video-context').first();
            await menu.locator('summary').click();
            await menu.locator('[data-video-action=block]').click();
            await page.locator('#video-actions-undo').waitFor({ state: 'visible' });
            assert.equal(await page.locator('.media-item:visible').count(), 12);
            assert.equal(await menu.locator('[data-video-action=unblock]').count(), 1);
            await context.close();
        }
    });

    test(`${engine}: blocking the only remaining recommendation disables autoplay`, async () => {
        const { page, context } = await pageFor(engine, { fixture: 'watch-actions' });
        await page.route('**/blocked_channels?*', route => route.fulfill({ contentType: 'application/json', body: '{}' }));
        await page.locator('.recommendation').evaluateAll(cards => cards.slice(1).forEach(card => card.remove()));
        const menu = page.locator('.recommendation .video-context').first();
        await menu.locator('summary').click();
        await menu.locator('[data-video-action=block]').click();
        await page.locator('#video-actions-undo').waitFor({ state: 'visible' });
        assert.equal(await page.evaluate(() => video_data.next_video), null);
        assert.equal(await page.evaluate(() => window.__ended.includes(next_video)), false);
        await context.close();
    });

    test(`${engine}: video menus stay within mobile and compact viewports`, async () => {
        for (const fixture of ['browse-compact', 'watch-dark']) {
            const { page, context, errors } = await pageFor(engine, { fixture, width: 390 });
            const menu = page.locator('.video-context').first();
            await menu.locator('summary').click();
            const panel = menu.locator('.video-context-actions');
            await panel.waitFor({ state: 'visible' });
            await page.waitForFunction(() => {
                var panel = document.querySelector('.video-context[open] .video-context-actions');
                if (!panel || panel.dataset.positioned !== 'true') return false;
                var box = panel.getBoundingClientRect();
                return box.x >= 0 && box.y >= 0 && box.right <= innerWidth && box.bottom <= innerHeight;
            });
            const box = await panel.boundingBox();
            assert.deepEqual(errors, []);
            assert.ok(box.x >= 0 && box.x + box.width <= 390 && box.y >= 0 && box.y + box.height <= 1000, JSON.stringify({ box, style: await panel.getAttribute('style'), viewport: await page.evaluate(() => [innerWidth, innerHeight]) }));
            assert.deepEqual(await panel.evaluate(el => {
                var box = el.getBoundingClientRect();
                var overlaps = [];
                for (var y = box.top + 10; y < box.bottom - 10; y += 10) {
                    var hit = document.elementFromPoint(box.left + box.width / 2, y);
                    if (!el.contains(hit)) overlaps.push(hit ? hit.outerHTML.slice(0, 150) : 'outside viewport');
                }
                return overlaps;
            }), [], 'Thumbnail overlays must not cover the menu: ' + fixture);
            await panel.screenshot({ path: path.join(artifacts, `${engine}-${fixture}-video-menu.png`) });
            await context.close();
        }
    });

    test(`${engine}: control-bar transparency preserves opaque controls on bright and dark video`, async () => {
        const { page, context, errors } = await pageFor(engine, { realPlayer: true });
        for (const color of ['#eeeeee', '#111111']) {
            await page.evaluate(color => {
                var video = document.querySelector('video');
                player.hasStarted(true);
                player.pause();
                player.poster('');
                video.style.opacity = '0';
                player.el().style.backgroundColor = color;
                player.userActive(true);
                player.controlBar.el().style.opacity = '1';
            }, color);
            const bar = page.locator('.vjs-control-bar');
            await bar.waitFor({ state: 'visible' });
            assert.match(await bar.evaluate(el => getComputedStyle(el).backgroundColor), /0\.2\)/);
            assert.equal(await page.locator('.vjs-fullscreen-control').evaluate(el => getComputedStyle(el).opacity), '1');
            await page.locator('#player-container').screenshot({ path: path.join(artifacts, `${engine}-transparent-controls-${color.slice(1)}.png`) });
        }
        assert.deepEqual(errors, []);
        await context.close();
    });
}

for (const engine of engines) {
    test(`${engine}: owned queue removes a specific occurrence and keeps playback running`, async () => {
        for (const [removePosition, fixture, currentIndex, currentRemoved, nextIndex] of [
            [0, 'queue-removed-before', 1, false, 2],
            [2, 'queue-removed-current', 2, true, 2],
            [3, 'queue-removed-next', 2, false, null]
        ]) {
            const initial = JSON.parse(fs.readFileSync(path.join(generated, 'queue-editable.json')));
            const { page, context, errors } = await pageFor(engine, { fixture: 'watch-owned', queue: initial, route: 'watch?v=2isYuQZMbdU&list=IVfixture&index=2', width: 390 });
            await page.locator('#queue-toggle').click();
            await page.locator('.queue-remove').first().waitFor({ state: 'visible' });
            if (removePosition === 2) await page.locator('#playlist-panel').screenshot({ path: path.join(artifacts, `${engine}-editable-watch-queue.png`) });
            await page.evaluate(() => player.currentTime(123));
            let posts = 0;
            let fail = true;
            const gets = [];
            await page.route('**/api/v1/playlists/IVfixture?*', route => {
                gets.push(new URL(route.request().url()));
                return route.fulfill({ contentType: 'application/json', body: fs.readFileSync(path.join(generated, fixture + '.json'), 'utf8') });
            });
            await page.route('**/playlist_ajax?*', route => {
                posts++;
                const url = new URL(route.request().url());
                assert.equal(url.searchParams.get('action'), 'remove_video');
                assert.equal(url.searchParams.get('playlist_id'), 'IVfixture');
                assert.equal(url.searchParams.get('set_video_id'), String(9007199254740993n + BigInt(removePosition)));
                assert.equal(new URLSearchParams(route.request().postData()).get('csrf_token'), 'fixture-token');
                return route.fulfill({ status: fail ? 500 : 200, contentType: 'application/json', body: '{}' });
            });
            await page.locator('.queue-row').nth(removePosition).locator('.queue-remove').click();
            await page.waitForFunction(() => document.getElementById('queue-status').textContent === watch_ui.queue_remove_error);
            assert.equal(await page.locator('.queue-row').count(), 4);
            assert.equal(await page.evaluate(() => window.__ended.length), 1);
            fail = false;
            await page.locator('.queue-row').nth(removePosition).locator('.queue-remove').click();
            await page.waitForFunction(() => document.querySelectorAll('.queue-row').length === 3);
            assert.equal(posts, 2);
            assert.equal(await page.evaluate(() => player.currentTime()), 123);
            assert.equal(await page.evaluate(() => video_data.index), currentIndex);
            assert.equal(await page.evaluate(() => video_data.playlist_current_removed), currentRemoved);
            assert.equal(await page.locator('.queue-row [aria-current]').count(), currentRemoved ? 0 : 1);
            assert.equal(gets[0].searchParams.get('current_removed'), currentRemoved ? '1' : null);
            if (nextIndex === null) {
                assert.equal(await page.locator('#queue-navigation [data-direction=next]').count(), 0);
                assert.equal(await page.evaluate(() => window.__ended.length), 0);
            } else {
                assert.equal(new URL(await page.locator('#queue-navigation [data-direction=next]').getAttribute('href'), 'https://invidious.test').searchParams.get('index'), String(nextIndex));
                assert.equal(await page.evaluate(() => window.__ended.length), 1);
            }
            assert.deepEqual(errors, []);
            await context.close();
        }
        const readonly = await pageFor(engine);
        await readonly.page.locator('.queue-row').first().waitFor();
        assert.equal(await readonly.page.locator('.queue-remove').count(), 0);
        await readonly.context.close();
    });

    test(`${engine}: mobile center play and control bars share visibility through play, pause, idle and seeking`, async () => {
        const { page, context, errors } = await pageFor(engine, { realPlayer: true, touch: true, mobileUserAgent: true, width: 390, height: 844 });
        await page.evaluate(() => { player.muted(true); player.loop(true); player.play(); });
        await page.waitForFunction(() => player.currentTime() > 0.1);
        await page.evaluate(() => { player.pause(); player.userActive(true); });
        const center = page.locator('.vjs-touch-overlay .vjs-play-control');
        await center.waitFor({ state: 'visible' });
        await page.waitForFunction(() => getComputedStyle(document.querySelector('.vjs-touch-overlay .vjs-play-control')).opacity === '1');
        // This is the reported bug: pressing the center Play button must not hide it alone.
        await center.tap();
        await page.waitForFunction(() => !player.paused());
        await page.waitForFunction(() => player.currentTime() > 0.2);
        async function sameVisibility(expected) {
            await page.waitForFunction(expected => {
                const nodes = [...document.querySelectorAll('.vjs-control-bar'), document.querySelector('.vjs-touch-overlay .vjs-play-control')];
                return nodes.every(el => getComputedStyle(el).opacity === expected);
            }, expected);
        }
        await sameVisibility('1');
        await page.locator('#player-container').screenshot({ path: path.join(artifacts, `${engine}-mobile-controls-together.png`) });
        const durations = await page.locator('.vjs-control-bar, .vjs-touch-overlay .vjs-play-control').evaluateAll(nodes => nodes.map(el => getComputedStyle(el).transition));
        assert.equal(new Set(durations).size, 1);
        // The plugin emits playing and removes its independent class; visibility stays tied.
        await page.evaluate(() => player.trigger('playing'));
        await sameVisibility('1');
        await page.evaluate(() => { document.activeElement.blur(); player.userActive(false); });
        await sameVisibility('0');
        const box = await page.locator('#player').boundingBox();
        await page.touchscreen.tap(box.x + box.width / 4, box.y + box.height / 3);
        await sameVisibility('1');
        await center.tap();
        await page.waitForFunction(() => player.paused());
        await sameVisibility('1');
        await page.waitForFunction(() => !player.userActive(), null, { timeout: 6000 });
        await sameVisibility('0');
        await page.touchscreen.tap(box.x + box.width / 4, box.y + box.height / 3);
        await sameVisibility('1');
        await page.touchscreen.tap(box.x + box.width * .85, box.y + box.height / 3);
        await page.touchscreen.tap(box.x + box.width * .85, box.y + box.height / 3);
        await page.locator('.mobile-seek-feedback').waitFor({state: 'visible'});
        assert.equal(await page.locator('.vjs-touch-overlay').evaluate(el => getComputedStyle(el).animationName), 'none');
        await sameVisibility('1');
        assert.deepEqual(errors, []);
        await context.close();
    });
}

for (const engine of engines) {
    test(`${engine}: playback shortcuts work from page content and respect interactive controls`, async () => {
        // Seeking to the end must not navigate to a playlist entry during this shortcut test.
        const { page, context, errors } = await pageFor(engine, { realPlayer: true, fixture: 'watch-single',
            route: 'watch?v=2isYuQZMbdU', videoData: {params: {continue: false}} });
        await page.waitForFunction(() => typeof player !== 'undefined');
        await page.evaluate(() => player.load());
        await page.waitForFunction(() => player.readyState() >= 1);
        await page.evaluate(() => {
            player.pause();
            player.volume(0.5);
            document.activeElement.blur();
        });
        await page.keyboard.press('Space');
        await page.waitForFunction(() => !player.paused());
        await page.keyboard.press('Space');
        await page.waitForFunction(() => player.paused());
        await page.keyboard.press('ArrowUp');
        assert.ok(Math.abs(await page.evaluate(() => player.volume()) - 0.6) < 0.01);
        await page.keyboard.press('ArrowDown');
        assert.ok(Math.abs(await page.evaluate(() => player.volume()) - 0.5) < 0.01);
        await page.evaluate(() => player.currentTime(1));
        await page.keyboard.press('ArrowRight');
        await page.waitForFunction(() => Math.abs(player.currentTime() - Math.min(6, player.duration())) < 0.1);
        await page.keyboard.press('ArrowLeft');
        assert.ok(await page.evaluate(() => player.currentTime()) < 2);
        const input = page.locator('input[name="q"]').first();
        await input.focus();
        await page.keyboard.press('Space');
        await page.keyboard.press('ArrowUp');
        assert.equal(await page.evaluate(() => player.paused()), true);
        assert.ok(Math.abs(await page.evaluate(() => player.volume()) - 0.5) < 0.01);
        const menu = page.locator('.video-context').first();
        await menu.locator('summary').focus();
        await page.keyboard.press('ArrowDown');
        await page.waitForFunction(() => document.activeElement.closest('.video-context-actions'));
        assert.ok(Math.abs(await page.evaluate(() => player.volume()) - 0.5) < 0.01);
        assert.deepEqual(errors, []);
        await context.close();
    });
}

for (const engine of engines) {
    test(`${engine}: DeArrow replaces titles safely, deduplicates queues, and exposes originals`, async () => {
        const {page, context, requests, errors} = await pageFor(engine, {fixture: 'watch-dearrow'});
        const replacement = 'A clear title <img src=x onerror=alert(1)>';
        await page.waitForFunction(() => document.querySelector('[data-dearrow-watch]').textContent.startsWith('A clear title'));
        assert.equal(await page.title(), replacement + ' - Invidious');
        assert.equal(await page.locator('[data-dearrow-watch] img').count(), 0);
        const heading = page.locator('[data-dearrow-watch]');
        const original = 'A journey through light, color, and motion';
        const reveal = heading.locator('..').locator('.dearrow-reveal');
        await heading.hover();
        assert.equal(await heading.textContent(), replacement);
        const bounds = await reveal.boundingBox();
        await reveal.hover();
        assert.equal(await heading.textContent(), original);
        assert.deepEqual(await reveal.boundingBox(), bounds);
        assert.equal(await page.locator('.dearrow-tooltip').count(), 0);
        await page.mouse.move(0, 0);
        assert.equal(await heading.textContent(), replacement);
        await reveal.focus();
        assert.equal(await heading.textContent(), original);
        await reveal.evaluate(el => el.blur());
        assert.equal(await heading.textContent(), replacement);
        assert.equal(await page.title(), replacement + ' - Invidious');
        await page.locator('.queue-row').first().waitFor();
        const id = '2isYuQZMbdU';
        const duplicate = page.locator('#playlist [data-dearrow-id="' + id + '"]').first();
        await duplicate.scrollIntoViewIfNeeded();
        await page.waitForFunction(() => document.querySelector('#playlist [data-dearrow-id="2isYuQZMbdU"]').textContent.startsWith('A clear title'));
        assert.equal(requests.filter(url => url === '/api/v1/dearrow/' + id).length, 1);
        assert.equal(await page.locator('.queue-playing').count(), 1);
        assert.ok((await page.locator('.recommendation img').first().getAttribute('src')).startsWith('/vi/'));
        await page.evaluate(() => get_playlist('PLfixture'));
        await page.waitForFunction(() => document.querySelector('#playlist [data-dearrow-id="2isYuQZMbdU"]')?.textContent.startsWith('A clear title'));
        assert.equal(requests.filter(url => url === '/api/v1/dearrow/' + id).length, 1);
        assert.deepEqual(errors, []);
        await page.evaluate(() => {
            window.removedRecommendation = document.querySelector('.recommendation');
            window.removedRecommendation.remove();
        });
        await page.waitForFunction(() => !window.removedRecommendation.querySelector('[data-dearrow-id]').hasAttribute('data-dearrow-original'));
        await page.evaluate(() => document.querySelector('.recommendations').appendChild(window.removedRecommendation));
        const restored = page.locator('.recommendation').last().locator('h3 a');
        await restored.scrollIntoViewIfNeeded();
        await page.waitForFunction(() => window.removedRecommendation.querySelector('[data-dearrow-id]').textContent.startsWith('A clear title'));
        const restoredTitle = restored.locator('[data-dearrow-id]');
        assert.equal(await restored.locator('..').locator('.dearrow-reveal').count(), 1);
        await restored.locator('..').locator('.dearrow-reveal').hover();
        assert.equal(await restoredTitle.textContent(), await restoredTitle.getAttribute('data-dearrow-original'));
        await page.mouse.move(0, 0);
        assert.equal(await restoredTitle.textContent(), replacement);
        await heading.scrollIntoViewIfNeeded();
        await page.screenshot({path: path.join(artifacts, `${engine}-dearrow-desktop.png`)});
        await context.close();
    });

    test(`${engine}: DeArrow icon stays fixed with wrapping, RTL, themes, and touch`, async () => {
        for (const theme of ['modern-neon', 'diary']) {
            const {page, context, errors} = await pageFor(engine, {fixture: 'browse-dearrow', width: 390, touch: true});
            await page.waitForSelector('.dearrow-reveal');
            await page.evaluate(async theme => {
                document.body.dataset.theme = theme;
                const stylesheet = document.querySelector('link[href*="/themes/"]');
                await new Promise(resolve => { stylesheet.onload = resolve; stylesheet.href = '/themes/' + theme + '/theme.css'; });
                await document.fonts.ready;
            }, theme);
            const title = page.locator('[data-dearrow-id]').first();
            const row = title.locator('xpath=ancestor::*[@data-dearrow-row][1]');
            const button = row.locator('.dearrow-reveal');
            const replacement = await title.textContent();
            const original = await title.getAttribute('data-dearrow-original');
            assert.equal(await button.evaluate(el => !!el.closest('a')), false);
            const url = page.url();
            for (const direction of ['ltr', 'rtl']) {
                await page.evaluate(dir => document.documentElement.dir = dir, direction);
                await row.evaluate(el => el.style.fontSize = '24px');
                await button.scrollIntoViewIfNeeded();
                const before = await button.boundingBox();
                await button.tap();
                assert.equal(await title.textContent(), original);
                assert.equal(await button.getAttribute('aria-pressed'), 'true');
                assert.deepEqual(await button.boundingBox(), before);
                await button.tap();
                assert.equal(await title.textContent(), replacement);
                assert.deepEqual(await button.boundingBox(), before);
                assert.equal(page.url(), url);
                assert.equal(await row.evaluate(el => el.scrollWidth <= el.clientWidth + 1), true);
            }
            await page.screenshot({path: path.join(artifacts, `${engine}-dearrow-${theme}-touch.png`)});
            assert.deepEqual(errors, []);
            await context.close();
        }
    });

    test(`${engine}: DeArrow targets stay fixed across title lengths and page layouts`, async () => {
        for (const fixture of ['watch-dearrow', 'history-dearrow']) {
            const longTitle = 'An original title with many more words to wrap across multiple lines. '.repeat(4);
            const {page, context, errors} = await pageFor(engine, {fixture, dearrowOriginal: longTitle, dearrowTitle: 'Short'});
            const selectors = fixture === 'watch-dearrow'
                ? ['[data-dearrow-watch]', '#queue-current [data-dearrow-id]', '.queue-row [data-dearrow-id]', '.recommendation [data-dearrow-id]']
                : ['[data-dearrow-id]'];
            for (const selector of selectors) {
                const title = page.locator(selector).first();
                await title.scrollIntoViewIfNeeded();
                await page.waitForFunction(selector => document.querySelector(selector).dataset.dearrowOriginal !== undefined, selector);
                const row = title.locator('xpath=ancestor::*[@data-dearrow-row][1]');
                const button = row.locator('.dearrow-reveal');
                assert.equal(await button.evaluate(el => !!el.closest('a')), false);
                // A removable queue row has a separate action at its trailing edge.
                if (selector.startsWith('.queue-row')) await row.evaluate(el => {
                    const remove = document.createElement('button');
                    remove.className = 'queue-remove';
                    remove.textContent = '×';
                    el.appendChild(remove);
                });
                for (const direction of ['ltr', 'rtl']) {
                    await page.evaluate(dir => document.documentElement.dir = dir, direction);
                    await button.scrollIntoViewIfNeeded();
                    const before = await button.boundingBox();
                    await button.hover();
                    assert.equal(await title.textContent(), await title.getAttribute('data-dearrow-original'));
                    assert.deepEqual(await button.boundingBox(), before);
                    const url = page.url();
                    await button.click();
                    assert.equal(page.url(), url);
                    await page.mouse.move(0, 0);
                    assert.equal(await title.textContent(), 'Short');
                    assert.deepEqual(await button.boundingBox(), before);
                    const link = row.locator('a').first();
                    if (await link.count()) {
                        await link.focus();
                        assert.equal(await title.textContent(), 'Short');
                        await page.keyboard.press('Tab');
                    } else {
                        await page.keyboard.press('Tab');
                        await button.focus();
                    }
                    assert.equal(await button.evaluate(el => el === document.activeElement), true);
                    assert.equal(await title.textContent(), await title.getAttribute('data-dearrow-original'));
                    await page.keyboard.press('Tab');
                    assert.equal(await title.textContent(), 'Short');
                }
            }
            assert.deepEqual(errors, []);
            await context.close();
        }
    });

    test(`${engine}: DeArrow keeps replacements on hover when original display is disabled`, async () => {
        const {page, context, errors} = await pageFor(engine, {fixture: 'browse-dearrow-no-original', width: 390});
        await page.waitForFunction(() => Array.from(document.querySelectorAll('[data-dearrow-id]')).some(el => el.textContent.startsWith('A clear title')));
        assert.equal(await page.locator('.dearrow-tooltip').count(), 0);
        assert.equal(await page.locator('[data-dearrow-id] img').count(), 0);
        assert.equal(await page.locator('.dearrow-reveal').count(), 0);
        const cardTitle = page.locator('[data-dearrow-id]').first();
        await cardTitle.hover();
        assert.equal(await cardTitle.textContent(), 'A clear title <img src=x onerror=alert(1)>');

        await page.screenshot({path: path.join(artifacts, `${engine}-dearrow-mobile.png`)});
        assert.deepEqual(errors, []);
        await context.close();
    });

    test(`${engine}: DeArrow disabled, missing, failed and no-JavaScript modes retain originals`, async () => {
        for (const options of [{fixture: 'watch-dark'}, {fixture: 'watch-dearrow', javascript: false}, {fixture: 'watch-dearrow', dearrowError: true}, {fixture: 'watch-dearrow', dearrowMissing: true}]) {
            const {page, context, requests, errors} = await pageFor(engine, options);
            await page.waitForLoadState('networkidle');
            assert.equal(await page.locator('.dearrow-reveal').count(), 0);
            assert.equal(await page.locator('h1').first().textContent(), 'A journey through light, color, and motion');
            assert.equal(await page.locator('.dearrow-tooltip').count(), 0);
            if (options.fixture === 'watch-dark' || options.javascript === false) assert.ok(!requests.some(url => url.startsWith('/api/v1/dearrow/')));
            assert.deepEqual(errors, []);
            await context.close();
        }
    });

    test(`${engine}: DeArrow preference controls submit without JavaScript`, async () => {
        const {page, context} = await pageFor(engine, {fixture: 'preferences', javascript: false});
        assert.equal(await page.locator('#dearrow_enabled').isChecked(), false);
        assert.equal(await page.locator('#dearrow_show_original').isChecked(), true);
        await page.locator('#dearrow_enabled').check();
        await page.locator('#dearrow_show_original').uncheck();
        const posted = page.waitForRequest(request => request.method() === 'POST');
        await page.getByRole('button', {name: 'Save preferences', exact: true}).click();
        const body = new URLSearchParams((await posted).postData());
        assert.equal(body.get('dearrow_enabled'), 'on');
        assert.equal(body.has('dearrow_show_original'), false);
        await context.close();
    });
}

// Exercise the complete embed script without network or media dependencies.
test('embed playlist requests identify the current video and preserve advancement settings', () => {
    const vm = require('node:vm');
    const data = {
        id: 'abcdefghijk', index: null, plid: 'PLfixture',
        preferences: { locale: 'en-US', listen: false, speed: 1, local: false },
        params: { autoplay: true, listen: true, speed: 1.5, local: true }
    };
    let requested, ended, navigated;
    const events = {};
    vm.runInNewContext(fs.readFileSync(path.join(root, 'assets/js/embed.js'), 'utf8'), {
        URL,
        document: { getElementById: () => ({ textContent: JSON.stringify(data) }) },
        addEventListener: (name, callback) => { events[name] = callback; },
        helpers: { xhr: (_, url, options, callbacks) => {
            requested = new URL(url, 'https://invidious.test');
            callbacks.on200({ nextVideo: 'nextvideo01', index: 4 });
        } },
        player: { on: (_, callback) => { ended = callback; } },
        location: { assign: url => { navigated = new URL(url, 'https://invidious.test'); } }
    });
    events.load();
    assert.equal(requested.searchParams.get('continuation'), data.id);
    ended();
    assert.equal(navigated.pathname, '/embed/nextvideo01');
    for (const [key, value] of Object.entries({ list: data.plid, index: '4', autoplay: '1', listen: 'true', speed: '1.5', local: 'true' })) {
        assert.equal(navigated.searchParams.get(key), value);
    }
});

for (const engine of engines) {
    test(`${engine}: synced playback restores progress after seeking back from completion`, async () => {
        const { page, context, errors } = await pageFor(engine, {
            fixture: 'watch-single', realPlayer: true,
            videoData: { playback_sync: true, playback_position: 0, csrf_token: 'fixture-csrf', params: { save_player_pos: true } }
        });
        await page.waitForFunction(() => window.player && player.isReady_);
        const updates = await page.evaluate(() => {
            const updates = [];
            helpers.xhr = (method, url, options, callbacks) => {
                if (url.startsWith('/watch_ajax')) updates.push({
                    action: new URL(url, location.origin).searchParams.get('action'),
                    position: new URLSearchParams(options.payload).get('position')
                });
                if (callbacks.on200) callbacks.on200({});
            };
            let time = 60;
            // Keep the real player's event handlers; simulate a longer video's clock.
            player.currentTime = () => time;
            player.ended = () => false;
            player.trigger('playing');
            player.trigger('timeupdate');
            time = video_data.length_seconds - 1;
            player.trigger('timeupdate');
            time = 60;
            player.trigger('seeked');
            time = video_data.length_seconds - 15 + 0.5;
            player.trigger('timeupdate');
            player.trigger('pause');
            return updates;
        });
        assert.deepEqual(updates, [
            { action: 'set_progress', position: '60' },
            { action: 'clear_progress', position: null },
            { action: 'set_progress', position: '60' },
            { action: 'clear_progress', position: null }
        ]);
        assert.deepEqual(errors, []);
        await context.close();
    });

    test(`${engine}: rejected progress beacon falls back to a keepalive request`, async () => {
        const { page, context } = await pageFor(engine, { fixture: 'watch-single', realPlayer: true });
        const request = await page.evaluate(async () => {
            navigator.sendBeacon = () => false;
            let captured = null;
            window.fetch = async (url, options) => { captured = { url, ...options }; return { ok: true }; };
            send_playback_position('set_progress', 123, true);
            await Promise.resolve();
            return captured && { url: captured.url, keepalive: captured.keepalive, method: captured.method,
                position: new URLSearchParams(captured.body).get('position') };
        });
        assert.deepEqual(request, {
            url: '/watch_ajax?action=set_progress&redirect=false&id=2isYuQZMbdU',
            keepalive: true, method: 'POST', position: '123'
        });
        await context.close();
    });

}

for (const engine of engines) {
    test(`${engine}: SponsorBlock modes, overlay, keyboard, ranges and replay`, async () => {
        const segments = [
            {id:'a', category:'sponsor', start:.5, end:1.5},
            {id:'b', category:'intro', start:2, end:2.5},
            {id:'c', category:'intro', start:2.5, end:3},
            {id:'d', category:'filler', start:0, end:4},
            {id:'e', category:'outro', start:3, end:3.8}
        ];
        const {page, context, errors} = await pageFor(engine, {realPlayer:true, sponsorblock: {enabled:true, modes:{sponsor:'manual', intro:'auto', filler:'disabled', outro:'marker'}}, sponsorblockSegments:segments});
        await page.waitForFunction(() => window.player && typeof player.play === 'function');
        await page.evaluate(() => { player.muted(true); player.play(); });
        await page.waitForFunction(() => player.duration() > 0 && document.querySelectorAll('.sb-range').length === 4);
        await page.evaluate(() => { player.pause(); player.currentTime(.7); });
        await page.waitForFunction(() => document.querySelector('.sb-overlay').classList.contains('sb-visible'));
        await page.waitForFunction(() => document.querySelector('.sb-overlay').innerText.includes('Sponsor'));
        assert.equal(await page.locator('.sb-range').first().evaluate(el => el.style.backgroundColor), 'rgb(76, 175, 80)');
        await page.evaluate(() => {
            const input = document.createElement('input'); input.id = 'sb-keyboard-test'; document.body.appendChild(input); input.focus();
        });
        await page.keyboard.press('Enter');
        assert.ok(await page.evaluate(() => player.currentTime() < 1.5));
        await page.evaluate(() => document.getElementById('sb-keyboard-test').remove());
        await page.keyboard.press('Enter');
        await page.waitForFunction(() => player.currentTime() >= 1.5);
        await page.evaluate(() => player.currentTime(.8));
        await page.waitForFunction(() => document.querySelector('.sb-overlay').classList.contains('sb-visible'));
        await page.getByRole('button', {name:'Dismiss', exact:true}).click();
        assert.equal(await page.locator('.sb-overlay.sb-visible').count(), 0);
        await page.evaluate(() => player.trigger('timeupdate'));
        assert.equal(await page.locator('.sb-overlay.sb-visible').count(), 0);
        await page.evaluate(() => player.currentTime(1.8));
        await page.waitForTimeout(100);
        await page.evaluate(() => player.currentTime(.8));
        await page.getByRole('button', {name:'Skip (Enter)', exact:true}).click();
        await page.waitForFunction(() => player.currentTime() >= 1.5);
        await page.evaluate(() => player.currentTime(2.1));
        await page.waitForFunction(() => player.currentTime() >= 3);
        assert.match(await page.locator('.sb-notice').innerText(), /Skipped Intro/);
        assert.equal(await page.evaluate(() => player.paused()), true);
        await page.waitForTimeout(3200);
        assert.equal(await page.locator('.sb-notice.sb-visible').count(), 0);
        await page.evaluate(() => player.currentTime(2.1));
        await page.waitForFunction(() => document.querySelector('.sb-overlay').classList.contains('sb-visible'));
        assert.ok(await page.evaluate(() => player.currentTime() < 2.5));
        await page.getByRole('button', {name:'Skip (Enter)', exact:true}).click();
        await page.waitForFunction(() => player.currentTime() >= 2.5 && player.currentTime() < 3);
        await page.waitForFunction(() => document.querySelector('.sb-overlay').classList.contains('sb-visible'));
        await page.evaluate(() => document.activeElement.blur());
        await page.keyboard.press('Enter');
        await page.waitForFunction(() => player.currentTime() >= 3);
        await page.screenshot({path:path.join(artifacts, `${engine}-sponsorblock-notice.png`)});
        await page.evaluate(() => player.currentTime(.8));
        await page.waitForFunction(() => document.querySelector('.sb-overlay').classList.contains('sb-visible'));
        await page.waitForFunction(() => document.querySelector('.sb-overlay').innerText.includes('Sponsor'));
        await page.screenshot({path:path.join(artifacts, `${engine}-sponsorblock-manual.png`)});
        assert.deepEqual(errors, []);
        await context.close();
    });
    test(`${engine}: SponsorBlock auto skips once per segment and resets on reload or another tab`, async () => {
        const options = {realPlayer:true, sponsorblock:{enabled:true,modes:{sponsor:'auto'}},
            sponsorblockSegments:[
                {id:'a',category:'sponsor',start:.5,end:1.2},
                {id:'b',category:'sponsor',start:1,end:1.5},
                {id:'c',category:'sponsor',start:2,end:2.5}
            ]};
        const {page, context, errors} = await pageFor(engine, options);
        async function ready(target) {
            await target.waitForFunction(() => window.player && typeof player.play === 'function');
            await target.evaluate(() => { player.muted(true); player.play(); });
            await target.waitForFunction(() => player.duration() > 0);
            await target.evaluate(() => player.pause());
        }
        async function replay(time, end) {
            await page.evaluate(t => player.currentTime(t), time);
            await page.waitForFunction(t => !player.seeking() && Math.abs(player.currentTime() - t) < .05, time);
            await page.evaluate(() => player.trigger('timeupdate'));
            await page.waitForFunction(() => document.querySelector('.sb-overlay').classList.contains('sb-visible'));
            await page.evaluate(() => { for (let i = 0; i < 10; i++) player.trigger('timeupdate'); });
            assert.ok(await page.evaluate(end => player.currentTime() < end, end));
        }
        await ready(page);
        await page.evaluate(() => player.currentTime(.6));
        await page.waitForFunction(() => player.currentTime() >= 1.5);
        await replay(.6, 1.2);
        await page.getByRole('button', {name:'Dismiss',exact:true}).click();
        await page.evaluate(() => player.trigger('timeupdate'));
        assert.equal(await page.locator('.sb-overlay:not(.sb-notice).sb-visible').count(), 0);
        await replay(1.3, 1.5);
        await page.evaluate(() => player.currentTime(2.1));
        await page.waitForFunction(() => player.currentTime() >= 2.5);
        await replay(2.1, 2.5);
        await page.reload();
        await ready(page);
        await page.evaluate(() => player.currentTime(.6));
        await page.waitForFunction(() => player.currentTime() >= 1.5);
        await replay(.6, 1.2);
        // Use the same browser context so accidental shared storage is observable.
        const other = await context.newPage();
        other.on('pageerror', error => errors.push(error.message));
        await other.goto(page.url());
        await ready(other);
        await other.evaluate(() => player.currentTime(.6));
        await other.waitForFunction(() => player.currentTime() >= 1.5);
        await other.close();
        assert.deepEqual(errors, []);
        await context.close();
    });
    test(`${engine}: SponsorBlock disabled avoids requests`, async () => {
        const {context, requests, errors} = await pageFor(engine, {realPlayer:true, sponsorblock:{enabled:true,modes:{sponsor:'disabled'}}});
        assert.equal(requests.some(url => url.startsWith('/api/v1/sponsorblock/')), false);
        assert.deepEqual(errors, []);
        await context.close();
    });
    test(`${engine}: preference Save remains visible throughout all themes`, async () => {
        for (const fixture of ['preferences', 'preferences-diary']) {
            for (const width of [390, 1440]) {
                const {page, context} = await pageFor(engine, {fixture, width, javascript:false});
                const button = page.getByRole('button', {name:'Save preferences', exact:true});
                for (const fraction of [0,.5,1]) {
                    await page.evaluate(f => window.scrollTo(0, document.documentElement.scrollHeight * f), fraction);
                    const box = await button.boundingBox();
                    assert.ok(box && box.y >= 0 && box.y + box.height <= 1000 && box.x >= 0 && box.x + box.width <= width);
                }
                await page.screenshot({path:path.join(artifacts, `${engine}-${fixture}-save-${width}.png`)});
                await context.close();
            }
        }
    });
}

for (const engine of engines) {
    test(`${engine}: SponsorBlock overlap, end boundary and upstream failure`, async () => {
        const {page, context, errors} = await pageFor(engine, {realPlayer:true,
            sponsorblock:{enabled:true,modes:{sponsor:'manual',intro:'manual'}},
            sponsorblockSegments:[{id:'a',category:'sponsor',start:.5,end:1.8},{id:'b',category:'intro',start:.5,end:1.2}]});
        await page.waitForFunction(() => window.player && typeof player.play === 'function');
        await page.evaluate(() => { player.muted(true); player.play(); });
        await page.waitForFunction(() => player.duration() > 0);
        await page.evaluate(() => { player.pause(); player.currentTime(.6); });
        await page.waitForFunction(() => document.querySelector('.sb-overlay').innerText.includes('Intro'));
        await page.getByRole('button', {name:'Skip (Enter)',exact:true}).click();
        await page.waitForFunction(() => player.currentTime() >= 1.2 && document.querySelector('.sb-overlay').innerText.includes('Sponsor'));
        await page.getByRole('button', {name:'Skip (Enter)',exact:true}).click();
        await page.waitForFunction(() => player.currentTime() >= 1.8);
        await page.waitForFunction(() => !document.querySelector('.sb-overlay').classList.contains('sb-visible'));
        assert.deepEqual(errors, []);
        await context.close();
        for (const failure of [false,true]) {
            const result = await pageFor(engine, {realPlayer:true,sponsorblock:{enabled:true},sponsorblockError:failure});
            await result.page.waitForFunction(() => window.player && typeof player.play === 'function');
            await result.page.evaluate(() => { player.muted(true); player.play(); });
            await result.page.waitForFunction(() => player.currentTime() > .1);
            assert.equal(await result.page.locator('.sb-range, .sb-overlay.sb-visible').count(),0);
            assert.deepEqual(result.errors,[]);
            await result.context.close();
        }
    });
}

for (const engine of engines) {
    test(`${engine}: SponsorBlock respects clip end and loop in audio mode`, async () => {
        const {page, context, errors} = await pageFor(engine, {realPlayer:true,
            videoData:{params:{listen:true,video_end:2.5}},
            sponsorblock:{enabled:true,modes:{sponsor:'auto'}},
            sponsorblockSegments:[{id:'a',category:'sponsor',start:.5,end:3.8}]});
        await page.waitForFunction(() => window.player && typeof player.play === 'function');
        await page.evaluate(() => { player.muted(true); player.play(); });
        await page.waitForFunction(() => player.currentTime() > .1 && !player.seeking());
        await page.evaluate(() => { player.pause(); player.currentTime(.7); });
        await page.waitForFunction(() => player.currentTime() >= 2.49);
        assert.ok(await page.evaluate(() => player.currentTime() < 2.6));
        await page.evaluate(() => { player.loop(true); player.currentTime(.7); });
        await page.waitForFunction(() => document.querySelector('.sb-overlay').classList.contains('sb-visible'));
        assert.ok(await page.evaluate(() => player.currentTime() >= .5 && player.currentTime() < 1));
        await page.getByRole('button', {name:'Skip (Enter)',exact:true}).click();
        await page.waitForFunction(() => player.currentTime() < .5);
        await page.evaluate(() => {
            video_data.params.video_start = 1;
            window.sbSeekCount = 0;
            const currentTime = player.currentTime;
            player.currentTime = function (value) {
                if (value !== undefined) window.sbSeekCount++;
                return currentTime.apply(this, arguments);
            };
            player.currentTime(.7);
        });
        await page.waitForFunction(() => document.querySelector('.sb-overlay').classList.contains('sb-visible'));
        await page.getByRole('button', {name:'Skip (Enter)',exact:true}).click();
        await page.waitForFunction(() => player.currentTime() >= 1 && player.currentTime() < 1.1);
        await page.evaluate(() => { for (let i = 0; i < 10; i++) player.trigger('timeupdate'); });
        assert.ok(await page.evaluate(() => window.sbSeekCount <= 2));
        assert.deepEqual(errors, []);
        await context.close();
    });
}

for (const engine of engines) {
    test(`${engine}: mobile accumulated seeking commits once and restores playback`, async () => {
        const {page, context, errors} = await pageFor(engine, {realPlayer: true, touch: true, width: 390, height: 844});
        await page.evaluate(() => { player.muted(true); player.play(); });
        await page.waitForFunction(() => player.currentTime() > .1 && player.getChild('TouchOverlay'));
        // Keep the real input surface and player event system, with a deterministic
        // long timeline so timing assertions do not depend on the four-second clip.
        await page.evaluate(() => {
            player.pause();
            window.seekState = {position: 40, playing: true, writes: []};
            player.currentTime = function (value) {
                if (value !== undefined) { seekState.position = value; seekState.writes.push(value); player.trigger('seeking'); }
                return seekState.position;
            };
            player.seekable = () => ({length: 1, start: () => 0, end: () => 120});
            player.paused = () => !seekState.playing;
            player.pause = () => { seekState.playing = false; player.trigger('pause'); };
            player.play = () => { seekState.playing = true; player.trigger('play'); return Promise.resolve(); };
        });
        const box = await page.locator('.vjs-touch-overlay').boundingBox();
        const tap = direction => page.touchscreen.tap(box.x + box.width * (direction === 'left' ? .15 : .85), box.y + box.height * .3);
        await tap('right'); await tap('right');
        assert.equal(await page.locator('.mobile-seek-feedback').textContent(), '+10 s');
        await tap('right');
        assert.equal(await page.locator('.mobile-seek-feedback').textContent(), '+20 s');
        assert.deepEqual(await page.evaluate(() => [seekState.playing, seekState.writes]), [false, []]);
        await tap('left');
        assert.equal(await page.locator('.mobile-seek-feedback').textContent(), '+10 s');
        await page.waitForFunction(() => seekState.writes.length === 1);
        assert.deepEqual(await page.evaluate(() => [seekState.position, seekState.playing]), [50, true]);
        await page.evaluate(() => { seekState.playing = false; seekState.position = 5; seekState.writes = []; });
        await tap('left'); await tap('left');
        assert.equal(await page.locator('.mobile-seek-feedback').textContent(), '−5 s');
        await page.waitForFunction(() => seekState.writes.length === 1);
        assert.deepEqual(await page.evaluate(() => [seekState.position, seekState.playing]), [0, false]);
        await page.evaluate(() => { seekState.position = 40; seekState.writes = []; });
        await tap('right'); await tap('right'); await tap('left');
        assert.equal(await page.locator('.mobile-seek-feedback').textContent(), '+0 s');
        await page.waitForTimeout(600);
        assert.deepEqual(await page.evaluate(() => seekState.writes), []);
        await page.evaluate(() => { seekState.position = 40; seekState.writes = []; player.userActive(true); });
        await tap('right'); await tap('right');
        await page.locator('.vjs-mobile-settings').tap();
        await page.waitForTimeout(600);
        assert.deepEqual(await page.evaluate(() => seekState.writes), []);
        assert.equal(await page.locator('.mobile-seek-feedback').textContent(), '');
        assert.deepEqual(errors, []);
        await context.close();
    });
}

for (const engine of engines) {
    test(`${engine}: mobile settings preserve playing, captions, sharing and SponsorBlock`, async () => {
        const {page, context, errors} = await pageFor(engine, {realPlayer: true, touch: true, width: 390, height: 844,
            sponsorblock: {enabled: true, modes: {sponsor: 'manual'}},
            sponsorblockSegments: [{id: 'mobile', category: 'sponsor', start: 0, end: 3.8}]});
        await page.evaluate(() => { player.muted(true); player.loop(true); player.play(); });
        await page.waitForFunction(() => player.currentTime() > .1);
        const skip = page.locator('.sb-skip');
        await skip.waitFor({state: 'visible'});
        assert.match(await skip.getAttribute('aria-label'), /^Skip/);
        assert.ok((await skip.boundingBox()).width >= 44);
        assert.equal(await page.locator('.sb-overlay > span').first().isVisible(), false);
        await page.locator('.vjs-mobile-settings').tap();
        const panel = page.locator('.mobile-player-settings');
        assert.equal(await page.evaluate(() => player.paused()), false);
        assert.equal(await skip.isVisible(), false);
        await panel.getByRole('button', {name: /^Captions/}).tap();
        await panel.getByRole('button', {name: 'Caption appearance'}).tap();
        await page.screenshot({path: path.join(artifacts, `${engine}-mobile-caption-appearance.png`)});
        await panel.getByRole('button', {name: 'Back', exact: true}).focus();
        await page.keyboard.press('Shift+Tab');
        assert.equal(await panel.evaluate(el => el.contains(document.activeElement)), true);
        assert.equal(await page.evaluate(() => player.paused()), false);
        await panel.getByRole('button', {name: 'Back', exact: true}).tap();
        await panel.getByRole('button', {name: 'Share', exact: true}).tap();
        assert.ok(await panel.locator('input').count() > 0);
        await page.screenshot({path: path.join(artifacts, `${engine}-mobile-sharing.png`)});
        assert.equal(await page.evaluate(() => player.paused()), false);
        await page.keyboard.press('Escape');
        await panel.waitFor({state: 'hidden'});
        assert.equal(await page.locator('.vjs-mobile-settings').evaluate(el => el === document.activeElement), true);
        await page.evaluate(() => { player.pause(); player.currentTime(.5); });
        await skip.waitFor({state: 'visible'});
        await skip.tap();
        await page.waitForFunction(() => player.currentTime() >= 3.8);
        assert.deepEqual(errors, []);
        await context.close();
    });
    test(`${engine}: embed mobile settings fill viewport and fullscreen`, async () => {
        const {page, context, errors} = await pageFor(engine, {fixture: 'embed-mobile', realPlayer: true, touch: true, width: 390, height: 844});
        await page.evaluate(() => { player.muted(true); player.play(); });
        await page.waitForFunction(() => player.currentTime() > .1);
        await page.locator('.vjs-mobile-settings').tap();
        const panel = page.locator('.mobile-player-settings');
        await panel.waitFor({state: 'visible'});
        assert.equal((await panel.boundingBox()).height, 844);
        await panel.getByRole('button', {name: 'Close', exact: true}).tap();
        await page.locator('.vjs-fullscreen-control').tap();
        await page.waitForFunction(() => player.isFullscreen());
        await page.locator('.vjs-mobile-settings').tap();
        await panel.waitFor({state: 'visible'});
        assert.equal(await panel.evaluate(el => Math.abs(el.getBoundingClientRect().height - innerHeight) < 1), true);
        await page.screenshot({path: path.join(artifacts, `${engine}-embed-mobile-settings.png`)});
        assert.deepEqual(errors, []);
        await context.close();
    });
}

for (const engine of engines) {
    test(`${engine}: mobile quality and track settings follow available options`, async () => {
        const {page, context, errors} = await pageFor(engine, {realPlayer: true, touch: true, width: 390, height: 844, extraQuality: true});
        await page.evaluate(() => { player.muted(true); player.play(); });
        await page.waitForFunction(() => player.currentTime() > .1);
        await page.evaluate(() => { player.pause(); player.currentTime(1); player.userActive(true); });
        await page.waitForFunction(() => player.currentTime() >= .9 && !player.seeking());
        await page.locator('.vjs-mobile-settings').tap();
        const initialPanel = page.locator('.mobile-player-settings');
        await initialPanel.getByRole('button', {name: /^Quality/}).tap();
        await initialPanel.getByRole('button', {name: 'high', exact: true}).tap();
        await page.waitForFunction(() => player.currentTime() >= .9 && !player.seeking());
        assert.equal(await page.evaluate(() => player.paused()), true);
        await page.evaluate(() => player.play());
        await initialPanel.getByRole('button', {name: /^Quality/}).tap();
        await initialPanel.getByRole('button', {name: 'medium', exact: true}).tap();
        await page.waitForFunction(() => !player.paused() && player.currentTime() >= .9);
        await initialPanel.getByRole('button', {name: 'Close', exact: true}).tap();
        await page.evaluate(() => {
            player.pause(); player.userActive(true);
            // Synthetic renditions exercise the installed quality-level API without upstream DASH.
            video_data.params.quality = 'dash';
            [360, 720].forEach(height => {
                let enabled = true;
                player.qualityLevels().addQualityLevel({id: String(height), height, bitrate: height * 1000,
                    enabled: value => value === undefined ? enabled : (enabled = value)});
            });
            player.audioTracks().addTrack(new videojs.AudioTrack({id: 'en', kind: 'main', label: 'English', language: 'en', enabled: true}));
            player.audioTracks().addTrack(new videojs.AudioTrack({id: 'id', kind: 'alternative', label: 'Indonesian', language: 'id'}));
        });
        await page.locator('.vjs-mobile-settings').tap();
        const panel = page.locator('.mobile-player-settings');
        await panel.getByRole('button', {name: /^Quality/}).tap();
        await panel.getByRole('button', {name: /^720p/}).tap();
        assert.deepEqual(await page.evaluate(() => Array.from(player.qualityLevels()).map(level => level.enabled)), [false, true]);
        await panel.getByRole('button', {name: /^Quality/}).tap();
        await panel.getByRole('button', {name: 'Auto', exact: true}).tap();
        assert.deepEqual(await page.evaluate(() => Array.from(player.qualityLevels()).map(level => level.enabled)), [true, true]);
        await panel.getByRole('button', {name: /^Audio/}).tap();
        await panel.getByRole('button', {name: /Indonesian/}).tap();
        assert.equal(await page.evaluate(() => Array.from(player.audioTracks()).find(track => track.enabled).language), 'id');
        await panel.getByRole('button', {name: /^Captions/}).tap();
        await panel.getByRole('button', {name: 'English', exact: true}).tap();
        assert.equal(await page.evaluate(() => Array.from(player.textTracks()).find(track => track.mode === 'showing').label), 'English');
        assert.deepEqual(errors, []);
        await context.close();
    });
}

test('DASH player source keeps the complete rendition manifest', () => {
    const playerTemplate = fs.readFileSync(path.join(root, 'src/invidious/views/components/player.ecr'), 'utf8');
    assert.doesNotMatch(playerTemplate, /unique_res=1/);
    assert.match(playerTemplate, /\/api\/manifest\/dash\/id\/.*\?local=true/);
});

for (const engine of engines) {
    test(`${engine}: rich stream menus rank video and audio variants consistently`, async () => {
        const videoFormats = [
            {itag:'v8', height:1080, fps:30, bitrate:8000000, contentLength:'800000000'},
            {itag:'v6', height:1080, fps:30, bitrate:6000000, contentLength:'600000000'},
            {itag:'v5', height:1080, fps:30, bitrate:5000000, contentLength:'500000000'},
            {itag:'v3', height:1080, fps:30, bitrate:3000000, contentLength:'300000000'},
            {itag:'v1', height:1080, fps:30, bitrate:1000000, contentLength:'100000000'},
            {itag:'v60', height:720, fps:60, bitrate:4000000, contentLength:'350000000'},
            {itag:'v30', height:720, fps:30, bitrate:2000000}
        ];
        const audioFormats = [
            {itag:'oa-h', bitrate:128000, contentLength:'12800000', audioTrack:{id:'en.4', displayName:'English original', audioIsDefault:true}},
            {itag:'oa-m', bitrate:96000, contentLength:'9600000', audioTrack:{id:'en.4', displayName:'English original', audioIsDefault:true}},
            {itag:'oa-l', bitrate:64000, contentLength:'6400000', audioTrack:{id:'en.4', displayName:'English original', audioIsDefault:true}},
            {itag:'os-h', bitrate:120000, contentLength:'12000000', isDrc:true, audioTrack:{id:'en.4', displayName:'English original', audioIsDefault:true}},
            {itag:'os-l', bitrate:60000, contentLength:'6000000', isDrc:true, audioTrack:{id:'en.4', displayName:'English original', audioIsDefault:true}},
            {itag:'fr-h', bitrate:100000, contentLength:'10000000', audioTrack:{id:'fr.3', displayName:'French', audioIsDefault:false}},
            {itag:'fr-l', bitrate:50000, contentLength:'5000000', audioTrack:{id:'fr.3', displayName:'French', audioIsDefault:false}}
        ];
        const setup = async page => {
            await page.evaluate(() => {
                [
                    ['0-','v3',1080,3000000], ['1-','v60',720,4000000], ['2-','v8',1080,8000000], ['3-','v1',1080,1000000],
                    ['4-','v30',720,2000000], ['5-','v5',1080,5000000], ['6-','v6',1080,6000000]
                ].forEach(([id,itag,height,bitrate]) => {
                    let enabled = true;
                    const tech = player.tech({IWillNotUseThisInPlugins:true});
                    tech.vhs = tech.vhs || {};
                    tech.vhs._testRepresentations = tech.vhs._testRepresentations || [];
                    tech.vhs._testRepresentations.push({id, playlist:{attributes:{NAME:itag}}});
                    tech.vhs.representations = () => tech.vhs._testRepresentations;
                    player.qualityLevels().addQualityLevel({id, height, bandwidth:bitrate,
                        enabled: value => value === undefined ? enabled : (enabled = value)});
                });
                [
                    ['oa-h','English original [128000k]',false], ['oa-m','English original [96000k]',true],
                    ['oa-l','English original [64000k]',false], ['os-h','English original [120000k] Stable Volume',false],
                    ['os-l','English original [60000k] Stable Volume',false], ['fr-h','French [100000k]',false],
                    ['fr-l','French [50000k]',false]
                ].forEach(([id,label,enabled]) => player.audioTracks().addTrack(new videojs.AudioTrack({id, kind:id.startsWith('fr') || id.startsWith('os') ? 'alternative' : 'main', label, language:id.startsWith('fr') ? 'fr' : 'en', enabled})));
            });
        };

        const desktop = await pageFor(engine, {realPlayer:true, videoData:{params:{quality:'dash'}}, playerData:{stats_formats:videoFormats.concat(audioFormats)}});
        await setup(desktop.page);
        const desktopResult = await desktop.page.evaluate(() => {
            player.hasStarted(true); player.userActive(true);
            const quality = InvidiousStreamMenus.qualityOptions(player);
            const audio = InvidiousStreamMenus.audioOptions(player);
            const bar = player.getChild('controlBar');
            const controls = ['captionsButton','richAudioButton','richQualityButton','playbackRateMenuButton'].map(name => bar.getChild(name));
            const stableOnly = InvidiousStreamMenus.audioOptions({audioTracks: () => [
                new videojs.AudioTrack({id:'regular', kind:'main', label:'English original', language:'en', enabled:true}),
                new videojs.AudioTrack({id:'stable', kind:'alternative', label:'English Stable Volume', language:'en'})
            ]});
            const uncertain = InvidiousStreamMenus.audioOptions({audioTracks: () => [
                new videojs.AudioTrack({id:'unknown-high', kind:'main', label:'Original A', language:'zz'}),
                new videojs.AudioTrack({id:'unknown-active', kind:'main', label:'Original B', language:'zz', enabled:true})
            ]});
            const genericTracks = [
                new videojs.AudioTrack({id:'generic-regular', kind:'main', label:'Original', language:'en', enabled:true}),
                new videojs.AudioTrack({id:'generic-stable', kind:'alternative', label:'Stable Volume', language:'en'})
            ];
            const generic = InvidiousStreamMenus.audioOptions({
                audioTracks: () => genericTracks,
                tech: () => ({vhs:{playlists:{master:{mediaGroups:{AUDIO:{main:{
                    Original:{playlists:[{attributes:{NAME:'oa-h'}}]},
                    'Stable Volume':{playlists:[{attributes:{NAME:'os-h'}}]}
                }}}}}}})
            });
            return {
                quality: quality.map(option => [option.primary, option.secondary]),
                rankedQuality: InvidiousStreamMenus.rankedQualityLevels(player).map(entry => entry.level.id),
                desktopQuality: player.getChild('controlBar').getChild('richQualityButton').items.map(item => item.options_.primary),
                audio: audio.map(option => option.divider ? `--${option.primary}--` : option.primary),
                stableOnly: stableOnly.map(option => option.divider ? `--${option.primary}--` : option.primary),
                stableSecondary: stableOnly.map(option => option.secondary),
                uncertain: uncertain.map(option => [option.primary, option.secondary, option.selected]),
                generic: generic.map(option => [option.primary, option.secondary]),
                controlClasses: controls.map(control => control.el().className),
                controlOrders: controls.map(control => Number(getComputedStyle(control.el()).order)),
                controlIconSizes: controls.slice(1, 3).map(control => getComputedStyle(control.el().querySelector('.vjs-icon-placeholder'), '::before').fontSize),
                controlFontSizes: controls.slice(1, 3).map(control => getComputedStyle(control.el()).fontSize),
                spacerOrder: Number(getComputedStyle(bar.el().querySelector('.vjs-spacer')).order),
                controlPositions: controls.map(control => control.el().getBoundingClientRect().left),
                formatting: [InvidiousStreamMenus.formatBytes(999), InvidiousStreamMenus.formatBytes(1200),
                    InvidiousStreamMenus.formatBytes(1e9), InvidiousStreamMenus.formatBitrate(128000),
                    InvidiousStreamMenus.formatBytes(0), InvidiousStreamMenus.formatBitrate(0),
                    InvidiousStreamMenus.formatBitrate(-1), InvidiousStreamMenus.formatBitrate('unknown')]
            };
        });
        assert.deepEqual(desktopResult.quality, [
            ['Auto',''], ['1080p30 High Bitrate','800 MB · 8 Mbps'], ['1080p30 Medium Bitrate','500 MB · 5 Mbps'],
            ['1080p30 Low Bitrate','100 MB · 1 Mbps'], ['720p60','350 MB · 4 Mbps'], ['720p30','2 Mbps']
        ]);
        assert.deepEqual(desktopResult.desktopQuality, desktopResult.quality.map(option => option[0]));
        assert.deepEqual(desktopResult.rankedQuality, ['2-','6-','5-','0-','3-','1-','4-']);
        assert.deepEqual(desktopResult.formatting, ['999 B','1.2 kB','1 GB','128 kbps','','','','']);
        assert.deepEqual(desktopResult.audio, [
            'English original · High Bitrate', 'English original', 'English original · Low Bitrate',
            'English original · Stable Volume · High Bitrate', 'English original · Stable Volume · Low Bitrate',
            '--Dubbed Audio--', 'French'
        ]);
        assert.deepEqual(desktopResult.stableOnly, ['English original', 'English · Original Audio · Stable Volume']);
        assert.deepEqual(desktopResult.stableSecondary, ['', '']);
        assert.deepEqual(desktopResult.uncertain, [['Original B', '', true]]);
        assert.deepEqual(desktopResult.generic, [
            ['English original', '12.8 MB · 128 kbps'],
            ['English original · Stable Volume', '12 MB · 120 kbps']
        ]);
        assert.match(desktopResult.controlClasses[1], /\bvjs-rich-audio\b/);
        assert.match(desktopResult.controlClasses[2], /\bvjs-rich-quality\b/);
        assert.deepEqual(desktopResult.controlOrders, [2, 3, 4, 5]);
        const iconGeometry = await desktop.page.evaluate(() => ['.vjs-rich-audio', '.vjs-rich-quality'].map(selector => {
            const control = document.querySelector(selector);
            const button = control.querySelector('button');
            const icon = button.querySelector('.vjs-icon-placeholder');
            const a = control.getBoundingClientRect(), b = button.getBoundingClientRect();
            return {inside: Boolean(icon), dx: Math.abs(a.x + a.width / 2 - b.x - b.width / 2),
                dy: Math.abs(a.y + a.height / 2 - b.y - b.height / 2)};
        }));
        for (const icon of iconGeometry) {
            assert.ok(icon.inside);
            assert.ok(icon.dx < 1 && icon.dy < 1, JSON.stringify(icon));
        }
        const selection = await desktop.page.evaluate(() => {
            const selected = document.querySelector('.vjs-rich-quality .vjs-selected');
            const style = getComputedStyle(selected);
            return [style.backgroundColor, style.color, style.textShadow];
        });
        assert.deepEqual(selection, ['rgb(214, 214, 214)', 'rgb(32, 32, 32)', 'none']);

        assert.deepEqual(desktopResult.controlIconSizes, ['24px', '24px']);
        assert.deepEqual(desktopResult.controlFontSizes, ['10px', '10px']);
        assert.ok(desktopResult.spacerOrder < desktopResult.controlOrders[1]);
        assert.ok(desktopResult.controlPositions[1] < desktopResult.controlPositions[2]);
        assert.ok(desktopResult.controlPositions[2] < desktopResult.controlPositions[3]);
        await desktop.page.evaluate(() => InvidiousStreamMenus.qualityOptions(player)[2].select());
        assert.equal(await desktop.page.evaluate(() => InvidiousStreamMenus.selectedText(InvidiousStreamMenus.qualityOptions(player))), '1080p30 Medium Bitrate');
        assert.deepEqual(await desktop.page.evaluate(() => Array.from(player.qualityLevels()).map(level => level.enabled)), [false,false,false,false,false,true,false]);
        await desktop.page.evaluate(() => InvidiousStreamMenus.qualityOptions(player)[0].select());
        assert.equal(await desktop.page.evaluate(() => Array.from(player.qualityLevels()).every(level => level.enabled)), true);
        await desktop.page.evaluate(() => InvidiousStreamMenus.audioOptions(player)[0].select());
        assert.deepEqual(await desktop.page.evaluate(() => InvidiousStreamMenus.audioOptions(player).map(option => option.divider ? `--${option.primary}--` : option.primary)), [
            'English original · High Bitrate', 'English original · Low Bitrate',
            'English original · Stable Volume · High Bitrate', 'English original · Stable Volume · Low Bitrate',
            '--Dubbed Audio--', 'French'
        ]);
        await desktop.page.screenshot({path:path.join(artifacts, `${engine}-rich-stream-controls.png`)});
        assert.deepEqual(desktop.errors, []);
        await desktop.context.close();

        const mobile = await pageFor(engine, {realPlayer:true, touch:true, width:320, height:700, videoData:{params:{quality:'dash'}}, playerData:{stats_formats:videoFormats.concat(audioFormats)}});
        await setup(mobile.page);
        await mobile.page.evaluate(() => { player.hasStarted(true); player.userActive(true); });
        await mobile.page.locator('.vjs-mobile-settings').tap();
        const audioRow = mobile.page.locator('.mobile-player-settings .mobile-setting-row').filter({hasText:'Audio'});
        assert.match(await audioRow.getAttribute('aria-label'), /^Audio, English original/);
        assert.equal(await audioRow.locator('.mobile-setting-value').getAttribute('title'), 'English original');
        assert.equal(await audioRow.locator('.mobile-setting-value').evaluate(el => getComputedStyle(el).textOverflow), 'ellipsis');
        await mobile.page.locator('.mobile-player-settings').getByRole('button', {name:/^Quality/}).tap();
        assert.deepEqual(await mobile.page.locator('.mobile-player-settings .stream-option-primary').allTextContents(), desktopResult.quality.map(option => option[0]));
        assert.deepEqual(mobile.errors, []);
        await mobile.context.close();

        const preferred = await pageFor(engine, {realPlayer:true, videoData:{params:{quality:'dash', quality_dash:'720p'}}, playerData:{stats_formats:videoFormats}});
        await setup(preferred.page);
        const selectedFor = async preference => preferred.page.evaluate(value => {
            video_data.params.quality_dash = value;
            player.trigger('loadedmetadata');
            return Array.from(player.qualityLevels()).find(level => level.enabled).id;
        }, preference);
        assert.equal(await selectedFor('720p'), '1-');
        assert.equal(await selectedFor('best'), '2-');
        assert.equal(await selectedFor('worst'), '4-');
        assert.deepEqual(preferred.errors, []);
        await preferred.context.close();
    });
}

for (const engine of engines) {
    test(`${engine}: diagnostics are local, accessible and sanitize snapshots`, async () => {
        const {page, context, requests, errors} = await pageFor(engine, {realPlayer: true});
        await page.waitForFunction(() => !!player.statsForNerds);
        await page.evaluate(() => { player.hasStarted(true); player.userActive(true); });
        const result = await page.evaluate(() => {
            const video = player.el().querySelector('video');
            Object.defineProperty(video, 'readyState', {configurable:true, get:() => 4});
            video.getVideoPlaybackQuality = () => ({droppedVideoFrames:0,totalVideoFrames:0});
            player.currentTime = () => 5;
            player.buffered = () => ({length:2,start:i => [0,10][i],end:i => [4,20][i]});
            const gap = player.statsForNerds.snapshot();
            player.currentTime = () => 12;
            const ahead = player.statsForNerds.snapshot();
            const tech = player.tech({IWillNotUseThisInPlugins:true});
            tech.vhs = {stats:{bandwidth:9000000, mediaBytesTransferred:0,mediaTransferDuration:0}, playlists:{media:() => ({attributes:{NAME:'137',CODECS:'avc1.test',RESOLUTION:{width:1920,height:1080}}})}};
            const initial = player.statsForNerds.snapshot();
            tech.vhs.stats.mediaBytesTransferred = 1000; tech.vhs.stats.mediaTransferDuration = 10;
            const measured = player.statsForNerds.snapshot();
            tech.vhs.playlists.media = () => ({attributes:{NAME:'136',RESOLUTION:{width:1280,height:720}}});
            const switched = player.statsForNerds.snapshot();
            delete tech.vhs;
            video.getVideoPlaybackQuality = undefined;
            const originalSource = player.currentSource;
            player.currentSource = () => ({type:'application/x-mpegURL'});
            video_data.live_now = true;
            player.seekable = () => ({length:1,start:() => 0,end:() => 20});
            const native = player.statsForNerds.snapshot();
            video_data.live_now = false; video_data.params.listen = true;
            const audio = player.statsForNerds.snapshot();
            video_data.params.listen = false; player.currentSource = originalSource;
            return {gap,ahead,initial,measured,switched,native,audio};
        });
        assert.equal(result.gap.metrics.buffer, 0);
        assert.equal(result.ahead.metrics.buffer, 8);
        assert.equal(result.gap.metrics.frames, '0 / 0 (0%)');
        assert.equal(result.gap.metrics.bandwidth, null);
        assert.equal(result.initial.metrics.bandwidth, null);
        assert.equal(result.measured.metrics.bandwidth, 9);
        assert.equal(result.switched.metrics.quality, '1280 × 720');
        assert.equal(result.switched.metrics.codecs, null);
        assert.equal(result.native.metrics.frames, null);
        assert.equal(result.native.metrics.bandwidth, null);
        assert.equal(result.native.metrics.live, 8);
        assert.equal(result.native.mode, 'HLS');
        assert.equal(result.audio.mode, 'audio-only');
        assert.ok(!JSON.stringify(result).includes('https://'));
        await page.waitForLoadState('networkidle');
        const before = requests.length;
        await page.locator('.vjs-stats-control').click();
        const buffering = await page.evaluate(() => {
            player.paused = () => false; player.seeking = () => false;
            player.trigger('waiting');
            const initial = player.statsForNerds.snapshot().metrics.stalls;
            player.trigger('playing'); player.trigger('seeking'); player.trigger('waiting');
            const seeking = player.statsForNerds.snapshot().metrics.stalls;
            player.trigger('playing'); player.trigger('waiting');
            const stalled = player.statsForNerds.snapshot().metrics.stalls;
            player.trigger('pause'); player.trigger('waiting');
            const paused = player.statsForNerds.snapshot().metrics.stalls;
            player.trigger('loadstart');
            return {initial,seeking,stalled,paused,reset:player.statsForNerds.snapshot().metrics.stalls};
        });
        assert.ok(buffering.initial.startsWith('0 /'));
        assert.ok(buffering.seeking.startsWith('0 /'));
        assert.ok(buffering.stalled.startsWith('1 /'));
        assert.ok(buffering.paused.startsWith('1 /'));
        assert.ok(buffering.reset.startsWith('0 /'));
        await page.locator('.player-stats button', {hasText:'Details'}).click();
        await page.waitForTimeout(1100);
        assert.equal(await page.locator('.player-stats svg').count(), 2);
        await page.screenshot({path:path.join(artifacts, engine + '-stats-desktop.png')});
        await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', {configurable:true,value:{writeText:() => Promise.reject(new Error('Denied'))}}));
        await page.locator('.player-stats button', {hasText:'Copy diagnostics'}).click();
        const copied = JSON.parse(await page.locator('.player-stats textarea').inputValue());
        assert.deepEqual(Object.keys(copied).sort(), ['availabilityReasons','metrics','mode','observationSeconds','playerVersion','version','videoId'].sort());
        await page.evaluate(() => player.statsForNerds.hide());
        const seconds = await page.evaluate(() => player.statsForNerds.snapshot().observationSeconds);
        await page.waitForTimeout(1100);
        assert.equal(await page.evaluate(() => player.statsForNerds.snapshot().observationSeconds), seconds);
        assert.equal(requests.length, before, JSON.stringify(requests.slice(before)));
        assert.deepEqual(errors, []);
        await context.close();
    });
    test(`${engine}: mobile and embed diagnostics fit and return to compact view`, async () => {
        for (const fixture of ['watch-single','embed-mobile']) {
            const {page,context,errors} = await pageFor(engine,{fixture,realPlayer:true,touch:true,width:390,height:844});
            await page.waitForFunction(() => !!player.statsForNerds);
        await page.evaluate(() => { player.hasStarted(true); player.userActive(true); });
            await page.locator('.vjs-mobile-settings').click();
            await page.locator('.mobile-player-settings button', {hasText:'Stats for nerds'}).click();
            assert.equal(await page.locator('.mobile-player-settings').isVisible(),false);
            await page.locator('.player-stats button', {hasText:'Details'}).click();
            assert.equal(await page.locator('.player-stats').evaluate(el => el.scrollWidth <= el.clientWidth + 1),true);
            await page.screenshot({path:path.join(artifacts, engine + '-stats-' + fixture + '.png')});
            await page.locator('.player-stats button', {hasText:'Close',exact:true}).click();
            assert.equal(await page.locator('.player-stats').isVisible(),true);
            assert.equal(await page.locator('.player-stats').evaluate(el => el.classList.contains('stats-expanded')),false);
            await page.locator('.player-stats button', {hasText:'Close',exact:true}).click();
            assert.equal(await page.locator('.player-stats').isVisible(),false);
            assert.deepEqual(errors,[]);
            await context.close();
        }
    });
}

for (const engine of engines) {
    for (const width of [320, 390, 1440]) {
        test(`${engine}: DeArrow contributions at ${width}px`, async () => {
            const {page, context, errors} = await pageFor(engine, {fixture: 'watch-dearrow-contributions', width, height: 844, touch: width < 500});
            const votes = [];
            let fail = false;
            const submissions = [
                {title: 'A <script>safe</script> title', original: false, votes: -1, locked: false, UUID: 'first'},
                {title: 'A locked title', original: false, votes: 10, locked: true, UUID: 'second'}
            ];
            await page.route('**/api/v1/dearrow/*/submissions', route => route.fulfill({contentType: 'application/json', body: JSON.stringify({titles: submissions})}));
            await page.route('**/dearrow_submit', async route => {
                const body = new URLSearchParams(route.request().postData());
                votes.push(Object.fromEntries(body));
                if (fail) return route.fulfill({status: 429, contentType: 'application/json', body: JSON.stringify({error: 'Please wait and retry.'})});
                if (body.get('action') === 'submit') submissions.push({title: body.get('title'), original: false, votes: -1, locked: false, UUID: 'own'});
                await new Promise(resolve => setTimeout(resolve, 80));
                return route.fulfill({contentType: 'application/json', body: '{"ok":true}'});
            });
            await page.locator('#dearrow-open').click();
            await page.waitForFunction(() => document.querySelectorAll('#dearrow-titles .dearrow-row').length === 2);
            const dialog = page.locator('#dearrow-dialog');
            assert.equal(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth + 1), true);
            const box = await dialog.boundingBox();
            assert.ok(box.x >= 0 && box.x + box.width <= width);
            assert.equal(await page.locator('#dearrow-titles script').count(), 0);
            assert.equal(await page.locator('#dearrow-original button').last().isDisabled(), true);
            assert.equal(await page.locator('#dearrow-titles .dearrow-row').last().locator('button').last().isDisabled(), true);
            const up = page.locator('#dearrow-titles .dearrow-row').first().locator('button').first();
            assert.ok((await up.boundingBox()).height >= 44);
            assert.notEqual(await up.locator('i').evaluate(el => getComputedStyle(el, '::before').content), 'none');
            await up.click();
            await page.waitForFunction(() => document.querySelector('#dearrow-status').textContent.includes('Accepted'));
            assert.equal(votes.length, 1);
            assert.equal(votes[0].action, 'upvote');
            assert.equal(votes[0].uuid, 'first');
            assert.equal(votes[0].userID, undefined);
            await page.locator('#dearrow-draft').fill('My own clear title');
            await page.locator('#dearrow-draft-form button').click();
            const checks = page.locator('#dearrow-confirm input[type=checkbox]');
            assert.equal(await checks.count(), 4);
            for (let i = 0; i < 3; i++) await checks.nth(i).check();
            assert.equal(await page.locator('#dearrow-send').isDisabled(), true);
            await checks.nth(3).check();
            assert.equal(await page.locator('#dearrow-send').isEnabled(), true);
            await page.locator('#dearrow-edit').click();
            await page.locator('#dearrow-draft-form button').click();
            assert.equal(await page.locator('#dearrow-confirm input:checked').count(), 0);
            for (let i = 0; i < 4; i++) await checks.nth(i).check();
            await page.screenshot({path: path.join(artifacts, `${engine}-dearrow-confirm-${width}.png`)});
            if (width < 500) await page.setViewportSize({width, height: 430});
            assert.equal(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth + 1), true);
            fail = true;
            await page.locator('#dearrow-send').click();
            await page.waitForFunction(() => document.querySelector('#dearrow-status').textContent.includes('Please wait'));
            assert.equal(await page.locator('#dearrow-draft').inputValue(), 'My own clear title');
            assert.equal(await page.locator('#dearrow-confirm').isVisible(), true);
            fail = false;
            await page.locator('#dearrow-send').click();
            await page.waitForFunction(() => document.querySelectorAll('#dearrow-titles .dearrow-row').length === 3);
            assert.equal(await page.locator('#dearrow-draft').inputValue(), '');
            assert.equal(votes.at(-1).confirmed, 'true');
            assert.equal(votes.at(-1).title, 'My own clear title');
            if (width < 500) await page.setViewportSize({width, height: 844});
            await dialog.evaluate(el => el.scrollTop = 0);
            await page.screenshot({path: path.join(artifacts, `${engine}-dearrow-contributions-${width}.png`)});
            await page.keyboard.press('Escape');
            assert.equal(await dialog.isVisible(), false);
            assert.equal(await page.locator('#dearrow-open').evaluate(el => el === document.activeElement), true);
            assert.deepEqual(errors, []);
            await context.close();
        });
    }
    test(`${engine}: DeArrow identity import stays outside ordinary preferences`, async () => {
        const {page, context, errors} = await pageFor(engine, {fixture: 'preferences-dearrow-contributions', width: 390});
        const input = page.locator('#dearrow-private-id');
        assert.equal(await input.getAttribute('type'), 'password');
        assert.equal(await input.inputValue(), '');
        await input.fill('a'.repeat(64));
        const forms = await input.evaluate(el => ({
            target: el.form.action,
            ordinary: new FormData(document.querySelector('form[action^="/preferences"]')).has('private_id')
        }));
        assert.ok(forms.target.endsWith('/dearrow_identity'));
        assert.equal(forms.ordinary, false);
        assert.deepEqual(errors, []);
        await context.close();
    });
}

for (const engine of engines) {
    test(`${engine}: DeArrow contribution themes, empty results and loading errors`, async () => {
        for (const theme of ['light', 'diary']) {
            const {page, context, errors} = await pageFor(engine, {fixture: 'watch-dearrow-contributions-' + theme, width: 390, height: 844});
            let fail = true;
            await page.route('**/api/v1/dearrow/*/submissions', route => route.fulfill({status: fail ? 503 : 200, contentType: 'application/json', body: fail ? '{"error":"Temporary failure"}' : '{"titles":[]}'}));
            await page.locator('#dearrow-open').click();
            await page.waitForFunction(() => document.querySelector('#dearrow-status').textContent.includes('Temporary failure'));
            fail = false;
            await page.locator('#dearrow-refresh').click();
            await page.waitForFunction(() => document.querySelector('#dearrow-titles').textContent.includes('No community'));
            assert.equal(await page.locator('#dearrow-original button').first().isEnabled(), true);
            assert.equal(await page.locator('#dearrow-original button').last().isDisabled(), true);
            await page.locator('#dearrow-dialog').evaluate(el => { el.style.fontSize = '24px'; el.dir = 'rtl'; });
            assert.equal(await page.locator('#dearrow-dialog').evaluate(el => el.scrollWidth <= el.clientWidth + 1), true);
            await page.screenshot({path: path.join(artifacts, `${engine}-dearrow-${theme}.png`)});
            await page.locator('#dearrow-close').click();
            assert.deepEqual(errors, []);
            await context.close();
        }
    });
}

for (const engine of engines) {
    test(`${engine}: browser volume is local, ignores legacy values and preserves speed`, async () => {
        const {page, context, errors} = await pageFor(engine, {realPlayer: true,
            videoData: {params: {volume: 12}}, route: 'watch?v=2isYuQZMbdU&volume=8',
            initScript: () => { if (!localStorage.getItem('seeded')) { localStorage.setItem('seeded', '1'); localStorage.setItem('invidious_player_volume', '0'); document.cookie = 'PREFS=' + encodeURIComponent(JSON.stringify({volume: 7, speed: 1})) + '; path=/; domain=.invidious.test'; } }});
        await page.waitForFunction(() => window.player && player.volume);
        assert.equal(await page.evaluate(() => player.volume()), 0);
        await page.evaluate(() => { player.muted(true); return player.play(); });
        await page.waitForFunction(() => player.readyState() >= 1);
        await page.evaluate(() => { player.pause(); player.volume(.37); player.playbackRate(1.5); });
        await page.waitForFunction(() => localStorage.getItem('invidious_player_volume') === '0.37');
        await page.waitForFunction(() => JSON.parse(decodeURIComponent(document.cookie.split('; ').find(c => c.startsWith('PREFS=')).slice(6))).speed === 1.5);
        assert.deepEqual(await page.evaluate(() => JSON.parse(decodeURIComponent(document.cookie.split('; ').find(c => c.startsWith('PREFS=')).slice(6)))), {speed: 1.5});
        await page.reload();
        await page.waitForFunction(() => window.player && player.volume);
        assert.equal(await page.evaluate(() => player.volume()), .37);
        await page.evaluate(() => player.muted(true));
        assert.equal(await page.evaluate(() => localStorage.getItem('invidious_player_volume')), '0.37');
        await page.evaluate(() => { localStorage.setItem('invidious_player_volume', '.62'); player.muted(false); });
        assert.equal(await page.evaluate(() => localStorage.getItem('invidious_player_volume')), '.62');
        for (const value of ['garbage', '2', '-1', '', 'NaN']) {
            await page.evaluate(value => localStorage.setItem('invidious_player_volume', value), value);
            await page.reload();
            await page.waitForFunction(() => window.player && player.volume);
            assert.equal(await page.evaluate(() => player.volume()), 1);
        }
        assert.deepEqual(errors, []);
        await context.close();
        const blocked = await pageFor(engine, {realPlayer: true, initScript: () => {
            const get = Storage.prototype.getItem, set = Storage.prototype.setItem;
            Storage.prototype.getItem = function (key) { if (key === 'invidious_player_volume') throw new Error('Storage blocked'); return get.call(this, key); };
            Storage.prototype.setItem = function (key, value) { if (key === 'invidious_player_volume') throw new Error('Storage blocked'); return set.call(this, key, value); };
        }});
        await blocked.page.waitForFunction(() => window.player && player.volume);
        assert.equal(await blocked.page.evaluate(() => player.volume()), 1);
        await blocked.page.evaluate(() => player.volume(.5));
        assert.deepEqual(blocked.errors, []);
        await blocked.context.close();
    });

    test(`${engine}: mobile volume stays device controlled with neutral translucent controls`, async () => {
        for (const fixture of ['watch-dark', 'watch-light', 'watch-diary-dark', 'watch-diary-light', 'embed-mobile']) {
            const {page, context, errors} = await pageFor(engine, {fixture, realPlayer: true, touch: true, width: 390, height: 844,
                initScript: () => localStorage.setItem('invidious_player_volume', '.25')});
            await page.waitForFunction(() => window.player && player.volume);
            assert.equal(await page.evaluate(() => player.volume()), 1);
            await page.evaluate(() => { change_volume(-.5); toggle_muted(); });
            assert.equal(await page.evaluate(() => player.volume()), 1);
            assert.equal(await page.evaluate(() => localStorage.getItem('invidious_player_volume')), '.25');
            assert.equal(await page.locator('.vjs-volume-panel').isVisible(), false);
            await page.evaluate(() => { player.muted(true); return player.play(); });
            await page.waitForFunction(() => player.currentTime() > .1);
            await page.locator('.vjs-mobile-settings').click();
            assert.equal(await page.locator('.mobile-player-settings').getByRole('button', {name: /Volume/}).count(), 0);
            await page.keyboard.press('Escape');
            for (const fullscreen of [false, true]) {
                if (fullscreen) await page.evaluate(() => player.addClass('vjs-fullscreen'));
                for (const youtube of [false, true]) {
                    await page.evaluate(value => player.el().classList.toggle('player-style-youtube', value), youtube);
                    assert.notEqual(await page.locator('.vjs-control-bar').first().evaluate(el => getComputedStyle(el).backgroundColor), 'rgba(0, 0, 0, 0.5)');
                    assert.equal(await page.locator('.vjs-touch-overlay .vjs-play-control').evaluate(el => getComputedStyle(el).backgroundColor), 'rgba(0, 0, 0, 0.15)');
                }
            }
            await page.evaluate(() => { player.pause(); player.userActive(true); });
            await page.locator('.vjs-mobile-settings').click();
            const panel = page.locator('.mobile-player-settings');
            async function checkSettingsSurface() {
                assert.equal(await panel.evaluate(el => getComputedStyle(el).backgroundColor), 'rgba(0, 0, 0, 0.5)');
                assert.equal(await panel.evaluate(el => getComputedStyle(el, '::backdrop').backgroundColor), 'rgba(0, 0, 0, 0)');
                assert.equal(await panel.locator('header').evaluate(el => getComputedStyle(el).backgroundColor), 'rgba(0, 0, 0, 0)');
                assert.equal(await panel.evaluate(el => getComputedStyle(el).opacity), '1');
                assert.equal(await panel.locator('button').first().evaluate(el => getComputedStyle(el).opacity), '1');
            }
            await checkSettingsSurface();
            for (const background of ['#eeeeee', '#111111']) {
                await page.evaluate(color => {
                    player.poster('');
                    player.el().querySelector('video').style.opacity = '0';
                    player.el().style.backgroundColor = color;
                }, background);
                await page.waitForTimeout(100);
                await page.screenshot({path: path.join(artifacts, `${engine}-${fixture}-settings-${background.slice(1)}.png`)});
            }
            for (const name of [/^Quality/, /^Audio/, /^Captions/, /^Speed/]) {
                const option = panel.getByRole('button', {name});
                if (await option.count()) {
                    await option.click();
                    await checkSettingsSurface();
                    await panel.getByRole('button', {name: 'Back', exact: true}).click();
                }
            }
            await page.keyboard.press('Escape');
            assert.deepEqual(errors, []);
            await context.close();
        }
    });

    test(`${engine}: channel playlists match library sizing in every theme`, async () => {
        for (const theme of ['modern-neon', 'diary']) {
            const channel = await pageFor(engine, {fixture: `channel-playlists-${theme}`});
            const library = await pageFor(engine, {fixture: `library-${theme}`});
            for (const width of [390, 768, 1440]) {
                for (const density of ['balanced', 'compact']) {
                    const dimensions = [];
                    for (const view of [channel, library]) {
                        await view.page.setViewportSize({width, height: 1000});
                        await view.page.evaluate(async d => { document.body.dataset.density = d; await document.fonts.ready; }, density);
                        await view.page.waitForTimeout(100);
                        dimensions.push(await view.page.locator('.playlist-library img').first().evaluate(el => ({width: el.offsetWidth, height: el.offsetHeight})));
                    }
                    for (const axis of ['width', 'height']) assert.ok(Math.abs(dimensions[0][axis] - dimensions[1][axis]) < .1, `${theme} ${width} ${density} ${axis}`);
                }
            }
            await channel.page.screenshot({path: path.join(artifacts, `${engine}-${theme}-channel-playlists.png`)});
            assert.deepEqual(channel.errors, []);
            assert.deepEqual(library.errors, []);
            await channel.context.close(); await library.context.close();
        }
    });
}

for (const engine of engines) {
    test(`${engine}: channel search preserves scope, query, and numeric pagination`, async () => {
        const query = '<cats> & "dogs" + café';
        for (const [width, javascript] of [[390, false], [1440, false], [390, true], [1440, true]]) {
            const {page, context} = await pageFor(engine, {fixture: 'channel-search', route: 'channel/UCfixture/search', width, javascript});
            assert.equal(await page.getByRole('searchbox', {name: 'Search this channel', exact: true}).isVisible(), true);
            assert.equal(await page.locator('#channel-search').inputValue(), query);
            assert.equal(await page.locator('.channel-tabs [aria-current="page"]').textContent(), 'Search');
            assert.equal(await page.locator('.channel-sort a').count(), 0);
            assert.equal(await page.getByRole('link', {name: 'Back to channel videos'}).getAttribute('href'), '/channel/UCfixture');
            for (const [selector, number] of [['.page-next-container a', '3'], ['.page-prev-container a', '1']]) {
                const url = new URL(await page.locator(selector).first().getAttribute('href'), page.url());
                assert.equal(url.pathname, '/channel/UCfixture/search');
                assert.equal(url.searchParams.get('q'), query);
                assert.equal(url.searchParams.get('page'), number);
            }
            assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
            await page.locator('#channel-search').focus();
            const requestPromise = page.waitForRequest(request => request.isNavigationRequest());
            await page.keyboard.press('Enter');
            const request = await requestPromise;
            assert.equal(request.method(), 'GET');
            assert.equal(new URL(request.url()).searchParams.get('q'), query);
            await page.screenshot({path: path.join(artifacts, `${engine}-channel-search-${width}.png`)});
            await context.close();
        }
    });

    test(`${engine}: channel search privacy and empty results work without JavaScript`, async () => {
        const {page, context} = await pageFor(engine, {fixture: 'channel-search-private', route: 'channel/UCfixture/search', javascript: false});
        await page.locator('#channel-search').fill('linux & audio');
        const requestPromise = page.waitForRequest(request => request.isNavigationRequest());
        await page.locator('.channel-search button').click();
        const request = await requestPromise;
        assert.equal(request.method(), 'POST');
        assert.equal(new URL(request.url()).search, '');
        assert.equal(new URLSearchParams(request.postData()).get('q'), 'linux & audio');
        await context.close();
        const empty = await pageFor(engine, {fixture: 'channel-search-empty', route: 'channel/UCfixture/search', javascript: false});
        assert.equal(await empty.page.locator('.no-results-error').isVisible(), true);
        assert.equal(await empty.page.locator('.page-next-container a').count(), 0);
        assert.equal(await empty.page.locator('.page-prev-container a').count(), 2);
        await empty.context.close();
    });
}

for (const engine of engines) {
    test(`${engine}: channel SponsorBlock editor supports mobile and no-JavaScript forms`, async () => {
        for (const width of [390, 1440]) {
            const {page, context, errors} = await pageFor(engine, {fixture:'sponsorblock-channels', width, javascript:false});
            assert.equal(await page.locator('#mode_sponsor').inputValue(), 'auto');
            assert.equal(await page.locator('#mode_intro').inputValue(), 'inherit');
            assert.match(await page.locator('#mode_intro option:checked').textContent(), /Use global/);
            await page.locator('#mode_sponsor').selectOption('marker');
            const requestPromise = page.waitForRequest(request => request.isNavigationRequest());
            await page.locator('button[value="save"]').click();
            const request = await requestPromise;
            assert.equal(request.method(), 'POST');
            assert.equal(new URLSearchParams(request.postData()).get('mode_sponsor'), 'marker');
            assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
            await page.screenshot({path:path.join(artifacts, `${engine}-sponsorblock-channels-${width}.png`)});
            assert.deepEqual(errors, []);
            await context.close();
        }
    });
}

for (const engine of engines) {
    for (const width of [390, 1440]) {
        test(`${engine}: account thumbnail bars ignore local progress and update dynamic queues at ${width}px`, async () => {
            const page = await browsers[engine].newPage({viewport: {width, height: 900}});
            await page.setContent(`<script id="watched-config" type="application/json">{"sync":true}</script>
                <div class="watched-indicator" data-id="partial" data-length="1000" hidden></div>
                <div class="watched-indicator" data-id="full" data-length="1000" hidden></div>
                <div class="watched-indicator" data-id="new" data-length="1000" hidden></div>`);
            await page.evaluate(() => {
                window.calls = 0;
                window.helpers = {
                    storage: {get: () => { throw new Error('Account bars must not read local storage'); }},
                    xhr: (method, url, options, callbacks) => {
                        window.calls++;
                        callbacks.on200({positions: {partial: 492, early: 1, late: 950}, watched: ['partial', 'full']});
                    }
                };
            });
            await page.addStyleTag({path: path.join(root, 'assets/css/default.css')});
            await page.addScriptTag({path: path.join(root, 'assets/js/watched_indicator.js')});
            assert.equal(await page.locator('[data-id="partial"]').evaluate(el => el.style.width), '49%');
            assert.deepEqual(await page.locator('[data-id="partial"]').evaluate(el => {
                const style = getComputedStyle(el);
                return {color: style.backgroundColor, height: style.height};
            }), {color: 'rgb(255, 0, 0)', height: '4px'});
            assert.equal(await page.locator('[data-id="full"]').evaluate(el => el.style.width), '100%');
            assert.equal(await page.locator('[data-id="new"]').evaluate(el => el.hidden), true);
            await page.evaluate(() => document.body.insertAdjacentHTML('beforeend',
                '<span class="watched-indicator" data-id="partial" data-length="1000" hidden></span>' +
                '<span class="watched-indicator" data-id="early" data-length="1000" hidden></span>' +
                '<span class="watched-indicator" data-id="late" data-length="1000" hidden></span>'));
            await page.waitForFunction(() => document.querySelector('[data-id="early"]').style.width === '5%');
            assert.equal(await page.locator('[data-id="late"]').evaluate(el => el.style.width), '100%');
            assert.deepEqual(await page.locator('[data-id="partial"]').evaluateAll(els => els.map(el => el.style.width)), ['49%', '49%']);
            assert.equal(await page.evaluate(() => calls), 1);
            await page.close();
        });
    }
}

for (const engine of engines) {
    test(`${engine}: current chapter beside duration follows playback and seeking`, async () => {
        const {page, context, errors} = await pageFor(engine, {realPlayer:true,
            playerData:{chapters:[{start:0.5,title:'Intro <img src=x>'},{start:2,title:'日本語 & details'}]}});
        await page.evaluate(() => { player.muted(true); player.play(); });
        await page.waitForFunction(() => document.querySelectorAll('.chapter-marker').length === 2);
        await page.evaluate(() => { player.pause(); player.userActive(true); player.currentTime(0.1); });
        const current = page.locator('.current-chapter');
        assert.equal(await current.isVisible(), false);
        assert.equal(await page.locator('.video-js').evaluate(el => el.classList.contains('has-chapters')), true);
        await page.evaluate(() => player.currentTime(0.7));
        await page.waitForFunction(() => document.querySelector('.current-chapter').textContent === 'Intro <img src=x>');
        assert.equal(await current.isVisible(), true);
        assert.equal(await current.getAttribute('title'), 'Intro <img src=x>');
        assert.equal(await page.locator('.current-chapter img').count(), 0);
        assert.equal(await page.locator('.vjs-duration').evaluate(el => el.nextElementSibling.classList.contains('current-chapter')), true);
        const durationBox = await page.locator('.vjs-duration').boundingBox();
        const titleBox = await current.boundingBox();
        assert.ok(durationBox.width > 0 && titleBox.x >= durationBox.x + durationBox.width);
        await page.evaluate(() => player.currentTime(2.5));
        await page.waitForFunction(() => document.querySelector('.current-chapter').textContent === '日本語 & details');
        await page.evaluate(() => player.currentTime(0.1));
        await page.waitForFunction(() => document.querySelector('.current-chapter').hidden);
        await page.evaluate(() => player.duration(1.5));
        assert.equal(await page.locator('.video-js').evaluate(el => el.classList.contains('has-chapters')), false);
        assert.equal(await current.isVisible(), false);
        assert.deepEqual(errors, []);
        await context.close();

        const empty = await pageFor(engine, {realPlayer:true, playerData:{chapters:[]}});
        assert.equal(await empty.page.locator('.current-chapter').isVisible(), false);
        assert.equal(await empty.page.locator('.video-js').evaluate(el => el.classList.contains('has-chapters')), false);
        assert.deepEqual(empty.errors, []);
        await empty.context.close();
    });

    test(`${engine}: chapter title fits mobile watch and embed controls`, async () => {
        const longTitle = 'A long chapter title that should be truncated before it covers any playback control';
        for (const [width, style, embed] of [[320, 'youtube', false], [320, 'invidious', true],
            [390, 'invidious', false], [390, 'youtube', true]]) {
            const {page, context, errors} = await pageFor(engine, {realPlayer:true, width, touch:true,
                fixture:embed ? 'embed-mobile' : 'watch-dark', route:embed ? 'embed/2isYuQZMbdU' : undefined,
                playerData:{chapters:[{start:0,title:'Start'},{start:2,title:longTitle}]}});
            await page.evaluate(style => {
                player.el().classList.remove('player-style-youtube', 'player-style-invidious');
                player.el().classList.add('player-style-' + style);
                player.muted(true); player.play();
            }, style);
            await page.waitForFunction(() => document.querySelectorAll('.chapter-marker').length === 2);
            await page.evaluate(() => { player.pause(); player.currentTime(2.5); player.userActive(true); });
            await page.waitForFunction(title => document.querySelector('.current-chapter').textContent === title, longTitle);
            const layout = await page.evaluate(() => {
                const title = document.querySelector('.current-chapter');
                const duration = document.querySelector('.vjs-duration');
                const controls = ['.vjs-mobile-settings', '.vjs-fullscreen-control']
                    .map(selector => document.querySelector(selector));
                const box = el => el.getBoundingClientRect();
                const overlaps = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
                return {title:box(title), duration:box(duration), controls:controls.map(box),
                    overlap:controls.some(el => overlaps(box(title), box(el))),
                    titleAttribute:title.title, titleOverflow:getComputedStyle(title).textOverflow,
                    titleScrollWidth:title.scrollWidth,
                    rootWidth:player.el().clientWidth, rootScrollWidth:player.el().scrollWidth};
            });
            assert.ok(layout.duration.width > 0 && layout.title.width >= 40, `${width}px ${style}: time and title readable`);
            assert.ok(layout.duration.right <= layout.title.left + 1, `${width}px ${style}: title follows duration`);
            assert.equal(layout.overlap, false, `${width}px ${style}: playback controls remain clear`);
            assert.ok(layout.controls.every(box => box.width > 0), `${width}px ${style}: playback controls visible`);
            assert.equal(layout.titleAttribute, longTitle);
            assert.equal(layout.titleOverflow, 'ellipsis');
            assert.ok(layout.titleScrollWidth > layout.title.width, `${width}px ${style}: long title is truncated`);
            assert.ok(layout.rootScrollWidth <= layout.rootWidth + 1, `${width}px ${style}: no horizontal overflow`);
            if (!embed && width === 320) {
                await page.evaluate(() => player.userActive(false));
                await page.waitForFunction(() => getComputedStyle(document.querySelector('.vjs-control-bar')).visibility === 'hidden');
                assert.equal(await page.locator('.current-chapter').isVisible(), false);
                await page.evaluate(() => player.userActive(true));
                await page.locator('.current-chapter').waitFor({state:'visible'});
                assert.equal(await page.locator('.current-chapter').isVisible(), true);
            }
            if (embed && width === 320) {
                await page.evaluate(() => player.currentTime(0.5));
                const track = page.locator('.vjs-progress-holder');
                const bounds = await track.boundingBox();
                await track.tap({position:{x:bounds.width * .75, y:bounds.height / 2}});
                await page.waitForFunction(() => player.currentTime() > 2);
            }
            assert.deepEqual(errors, []);
            await context.close();
        }
    });

    test(`${engine}: manual chapter markers and SponsorBlock hover priority`, async () => {
        const {page, context, errors} = await pageFor(engine, {realPlayer:true,
            playerData:{chapters:[{start:0.5,title:'Intro <img src=x>'},{start:2,title:'日本語 & details'}]},
            sponsorblock:{enabled:true,modes:{sponsor:'marker',intro:'disabled'}},
            sponsorblockSegments:[{id:'a',category:'sponsor',start:1,end:1.8},{id:'b',category:'sponsor',start:1.1,end:1.9}]});
        await page.evaluate(() => { player.muted(true); player.play(); });
        await page.waitForFunction(() => document.querySelectorAll('.chapter-marker').length === 2 && document.querySelectorAll('.sb-range').length === 2);
        await page.evaluate(() => { player.pause(); player.userActive(true); });
        const bar = page.locator('.vjs-progress-holder');
        const bounds = await bar.boundingBox();
        const duration = await page.evaluate(() => player.duration());
        const hover = async time => page.mouse.move(bounds.x + bounds.width * time / duration, bounds.y + bounds.height / 2);
        await hover(1.3);
        assert.equal(await page.locator('.chapter-tooltip > :first-child').innerText(), 'Sponsor');
        assert.equal(await page.locator('.chapter-tooltip > div').nth(1).innerText(), 'Intro <img src=x>');
        assert.equal(await page.locator('.chapter-tooltip img').count(), 0);
        await hover(2.5);
        assert.equal(await page.locator('.chapter-tooltip > div').nth(1).innerText(), '日本語 & details');
        assert.equal(await page.locator('.chapter-tooltip > :first-child').isVisible(), false);
        const progress = await page.locator('.vjs-progress-control').boundingBox();
        const nearbyY = bounds.y - progress.y > 2
            ? (progress.y + bounds.y) / 2
            : (bounds.y + bounds.height + progress.y + progress.height) / 2;
        assert.ok(nearbyY >= progress.y && nearbyY <= progress.y + progress.height);
        assert.ok(nearbyY < bounds.y || nearbyY > bounds.y + bounds.height);
        await page.mouse.move(bounds.x + bounds.width * 2.5 / duration, nearbyY);
        await page.waitForFunction(() => !document.querySelector('.chapter-tooltip').hidden);
        assert.equal(await page.locator('.chapter-tooltip > div').nth(1).innerText(), '日本語 & details');
        await hover(0.1);
        assert.equal(await page.locator('.chapter-tooltip').isVisible(), false);
        await bar.focus();
        await page.evaluate(() => { player.currentTime(2.5); });
        await page.mouse.move(0, 0);
        await page.waitForFunction(() => !document.querySelector('.chapter-tooltip').hidden);
        assert.equal(await page.locator('.chapter-tooltip > div').nth(1).innerText(), '日本語 & details');
        await page.evaluate(() => { player.duration(1.5); });
        assert.equal(await page.locator('.chapter-marker').count(), 0);
        assert.deepEqual(errors, []);
        await context.close();
    });
    test(`${engine}: manual chapters survive disabled and failed SponsorBlock`, async () => {
        for (const enabled of [false, true]) {
            const {page, context, errors} = await pageFor(engine, {realPlayer:true, width:390, touch:true,
                playerData:{chapters:[{start:0,title:'Start'},{start:2,title:'Finish'}]},
                sponsorblock:{enabled}, sponsorblockError:true});
            await page.evaluate(() => { player.muted(true); player.play(); });
        await page.waitForFunction(() => document.querySelectorAll('.chapter-marker').length === 2);
            await page.evaluate(() => {
                player.pause(); player.currentTime(2.5);
                var bar = document.querySelector('.vjs-progress-holder'), rect = bar.getBoundingClientRect();
                var event = new Event('touchstart');
                Object.defineProperty(event, 'touches', {value:[{clientX:rect.left + rect.width * 2.5 / player.duration()}]});
                bar.dispatchEvent(event);
            });
            assert.equal(await page.locator('.chapter-tooltip > div').nth(1).innerText(), 'Finish');
            const tip = await page.locator('.chapter-tooltip').boundingBox();
            const playerBox = await page.locator('.video-js').boundingBox();
            assert.ok(tip.x >= playerBox.x && tip.x + tip.width <= playerBox.x + playerBox.width);
            assert.deepEqual(errors, []);
            await context.close();
        }
    });
}

for (const engine of engines) {
    test(`${engine}: manual chapters in embeds, player styles and thumbnail previews`, async () => {
        for (const style of ['youtube', 'invidious']) {
            const {page, context, errors} = await pageFor(engine, {realPlayer:true, fixture:'embed-mobile', route:'embed/2isYuQZMbdU', storyboards:true,
                playerData:{chapters:[{start:0,title:'Start'},{start:2,title:'Final section'}]}});
            await page.evaluate(style => { player.el().classList.remove('player-style-youtube', 'player-style-invidious'); player.el().classList.add('player-style-' + style); player.muted(true); player.play(); }, style);
            await page.waitForFunction(() => document.querySelectorAll('.chapter-marker').length === 2);
            await page.evaluate(() => { player.pause(); player.userActive(true); });
            const bar = page.locator('.vjs-progress-holder');
            const bounds = await bar.boundingBox();
            await page.mouse.move(bounds.x + bounds.width * .65, bounds.y + bounds.height / 2);
            await page.waitForFunction(() => !document.querySelector('.chapter-tooltip').hidden);
            assert.equal(await page.locator('.chapter-tooltip > div').nth(1).innerText(), 'Final section');
            const preview = page.locator('.vjs-vtt-thumbnail-display');
            await preview.waitFor({state:'visible',timeout:3000});
            // A second move also exercises the preview's normal hover update.
            await page.mouse.move(bounds.x + bounds.width * .66, bounds.y + bounds.height / 2);
            await page.waitForFunction(() => {
                const tip = document.querySelector('.chapter-tooltip').getBoundingClientRect();
                const thumb = document.querySelector('.vjs-vtt-thumbnail-display').getBoundingClientRect();
                return tip.bottom <= thumb.top;
            });
            await bar.click({position:{x:bounds.width * .65,y:bounds.height / 2}});
            assert.ok(await page.evaluate(() => player.currentTime() > 2));
            await page.locator('.vjs-fullscreen-control').click();
            await page.waitForFunction(() => player.isFullscreen());
            await bar.focus();
            await page.keyboard.press('ArrowLeft');
            assert.ok(await page.evaluate(() => player.currentTime() < 2));
            await page.screenshot({path:path.join(artifacts, `${engine}-chapters-${style}.png`)});
            assert.deepEqual(errors, []);
            await context.close();
        }
    });
}

test('manual chapter template serializes titles safely for watch and embed', () => {
    const html = fs.readFileSync(path.join(generated, 'watch-chapters.html'), 'utf8');
    const payload = html.match(/<script id="player_data"[^>]*>([\s\S]*?)<\/script>/)[1];
    assert.equal(payload.includes('</script>'), false);
    assert.deepEqual(JSON.parse(payload).chapters, [{start:0,title:'</script><script>alert(1)</script>'},{start:2,title:'日本語 & details'}]);
    const embed = fs.readFileSync(path.join(generated, 'embed-mobile.html'), 'utf8');
    assert.equal(JSON.parse(embed.match(/<script id="player_data"[^>]*>([\s\S]*?)<\/script>/)[1]).chapters.length, 3);
});

for (const engine of engines) {
    for (const width of [390, 1440]) {
        test(`${engine}: production thumbnail progress spans history, all card types and thin layouts at ${width}px`, async () => {
            for (const theme of ['modern-neon', 'diary']) {
                for (const thin of [false, true]) {
                    const suffix = theme + '-' + (thin ? 'thin' : 'normal');
                    const history = await pageFor(engine, {fixture: 'history-progress-' + suffix, route: 'feed/history', width,
                        playback: {positions: {'2isYuQZMbdU': 492, nextvideo01: 100}, watched: ['2isYuQZMbdU', 'previous001', 'nextvideo01']}});
                    const partial = history.page.locator('.watched-indicator[data-id="2isYuQZMbdU"]');
                    await partial.waitFor({state: 'visible'});
                    assert.equal(await partial.evaluate(el => el.style.width), '49%');
                    assert.equal(await history.page.locator('.watched-indicator[data-id="previous001"]').evaluate(el => el.style.width), '100%');
                    assert.equal(await history.page.locator('.watched-indicator[data-id="nextvideo01"]').isVisible(), false);
                    assert.equal(history.requests.filter(url => url === '/api/v1/auth/playback').length, 1);
                    assert.equal(history.requests.some(url => url.startsWith('/api/v1/videos/')), false);
                    if (thin) {
                        assert.equal(await history.page.locator('.media-card img').count(), 0);
                        const remove = await history.page.locator('.media-card button').first().boundingBox();
                        const bar = await partial.boundingBox();
                        assert.ok(remove.y + remove.height <= bar.y, 'History actions must not cover the thin-mode progress bar');
                    }
                    assert.equal(await history.page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
                    if (theme === 'modern-neon') await history.page.screenshot({path: path.join(artifacts, `${engine}-history-progress-${width}-${thin}.png`), fullPage: true});
                    assert.deepEqual(history.errors, []);
                    await history.context.close();

                    const cards = await pageFor(engine, {fixture: 'cards-progress-' + suffix, route: 'playlist?list=PLfixture', width,
                        playback: {positions: {progress001: 492}, watched: ['progress001']}});
                    const indicators = cards.page.locator('.watched-indicator');
                    await indicators.first().waitFor({state: 'visible'});
                    assert.deepEqual(await indicators.evaluateAll(els => els.map(el => el.style.width)), ['49%', '49%', '49%', '49%']);
                    for (const indicator of await indicators.all()) assert.equal(await indicator.isVisible(), true);
                    if (thin) assert.equal(await cards.page.locator('.media-card img').count(), 0);
                    assert.deepEqual(cards.errors, []);
                    await cards.context.close();
                }
            }
        });

        test(`${engine}: production queue and recommendation progress survives thin mode and refresh at ${width}px`, async () => {
            for (const thin of [false, true]) {
                const suffix = 'modern-neon-' + (thin ? 'thin' : 'normal');
                const response = thin ? JSON.parse(fs.readFileSync(path.join(generated, 'queue-thin.json'))) : queue;
                const session = await pageFor(engine, {fixture: 'watch-progress-' + suffix, width, queue: response,
                    playback: {positions: {'2isYuQZMbdU': 120}, watched: []}});
                if (width < 768) await session.page.locator('#queue-toggle').click();
                const duplicates = session.page.locator('.queue-row .watched-indicator[data-id="2isYuQZMbdU"]');
                await duplicates.first().waitFor({state: 'visible'});
                assert.deepEqual(await duplicates.evaluateAll(els => els.map(el => el.style.width)), ['50%', '13%']);
                const recommendation = session.page.locator('.recommendation .watched-indicator[data-length]:not([data-length="0"])').first();
                const metadata = await recommendation.evaluate(el => ({id: el.dataset.id, length: Number(el.dataset.length)}));
                await session.page.route('**/api/v1/auth/playback', route => route.fulfill({contentType: 'application/json', body: JSON.stringify({positions: {[metadata.id]: metadata.length / 2, '2isYuQZMbdU': 60}, watched: []})}));
                await session.page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', {persisted: true})));
                await recommendation.waitFor({state: 'visible'});
                assert.equal(await recommendation.evaluate(el => el.style.width), '50%');
                await session.page.waitForFunction(() => document.querySelector('.queue-row .watched-indicator[data-id="2isYuQZMbdU"]').style.width === '25%');
                if (thin) assert.equal(await session.page.locator('.queue-row img, .recommendation img').count(), 0);
                assert.deepEqual(session.errors, []);
                await session.context.close();
            }
        });
    }

    test(`${engine}: history search and browser-local progress use existing saved positions`, async () => {
        const search = await pageFor(engine, {fixture: 'history-progress-search', route: 'feed/history?q=STUDIO+north', playback: {positions: {'2isYuQZMbdU': 492}, watched: []}});
        const indicator = search.page.locator('.watched-indicator');
        await indicator.waitFor({state: 'visible'});
        assert.equal(await indicator.evaluate(el => el.style.width), '49%');
        await search.context.close();
        const local = await pageFor(engine, {fixture: 'history', route: 'feed/history', initScript: "localStorage.setItem('save_player_pos', JSON.stringify({'2isYuQZMbdU':492}));"});
        const partial = local.page.locator('.watched-indicator[data-id="2isYuQZMbdU"]');
        await partial.waitFor({state: 'visible'});
        assert.equal(await partial.evaluate(el => el.style.width), '49%');
        assert.equal(local.requests.some(url => url === '/api/v1/auth/playback'), false);
        await local.page.evaluate(() => {localStorage.setItem('save_player_pos', JSON.stringify({'2isYuQZMbdU':250})); window.dispatchEvent(new StorageEvent('storage'));});
        assert.equal(await partial.evaluate(el => el.style.width), '25%');
        assert.deepEqual(local.errors, []);
        await local.context.close();
    });
}

for (const engine of engines) {
    test(`${engine}: account forms are accessible and responsive`, async () => {
        for (const width of [360, 1280]) {
            for (const fixture of ['login-diary', 'signup-account', 'account-settings']) {
                const session = await pageFor(engine, {fixture, width, javascript: false});
                const page = session.page;
                assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${fixture} overflows at ${width}`);
                for (const input of await page.locator('input:not([type=hidden])').all()) {
                    const id = await input.getAttribute('id');
                    if (await input.getAttribute('name') === 'q') continue;
                    assert.ok(id && await page.locator(`label[for="${id}"]`).count(), 'Input needs an associated label');
                }
                assert.equal(await page.locator('input[type=password][value]').count(), 0);
                if (fixture === 'signup-account') {
                    await page.locator('#username').fill('valid.name-1');
                    assert.equal(await page.locator('#username').evaluate(el => el.checkValidity()), true);
                    await page.locator('#username').fill('invalid name');
                    assert.equal(await page.locator('#username').evaluate(el => el.checkValidity()), false);
                }
                if (fixture === 'account-settings') {
                    assert.equal(await page.locator('input[autocomplete=current-password]').count(), 2);
                    assert.equal(await page.locator('input[autocomplete=new-password]').count(), 2);
                }
                await page.screenshot({path: path.join(artifacts, `${engine}-${fixture}-${width}.png`), fullPage: true});
                assert.deepEqual(session.errors, []);
                await session.context.close();
            }
        }
    });
}

async function assertAvatarCardLayout(page) {
    // Firefox does not settle fonts.ready with page JavaScript disabled.
    // Poll from the test runner so the same geometry checks cover that mode.
    for (let attempt = 0; attempt < 50 && await page.evaluate(() => document.fonts.status) !== 'loaded'; attempt++) {
        await page.waitForTimeout(100);
    }
    assert.equal(await page.evaluate(() => document.fonts.status), 'loaded');
    const cards = await page.locator('.media-card .video-card-details:has(.channel-avatar)').evaluateAll(elements => elements.map(el => {
        const rect = node => {
            const {x, y, width, height, right, bottom} = node.getBoundingClientRect();
            return {x, y, width, height, right, bottom};
        };
        const avatar = el.querySelector('.channel-avatar');
        const link = avatar.closest('a');
        return {
            details: rect(el), title: rect(el.querySelector('[data-dearrow-row]')),
            avatar: rect(avatar), name: rect(link.querySelector(':scope > [dir=auto]')),
            metadata: rect(el.lastElementChild),
            menu: el.querySelector('.video-context summary') ? rect(el.querySelector('.video-context summary')) : null,
            rtl: getComputedStyle(link).direction === 'rtl',
            channelLinks: el.querySelectorAll('a[href^="/channel/"]').length,
            avatarInNameLink: link.classList.contains('channel-name-link'),
            channelFocusable: link.tabIndex === 0 && link.getAttribute('aria-hidden') !== 'true',
            decorative: avatar.getAttribute('aria-hidden') === 'true'
        };
    }));
    assert.ok(cards.length > 0);
    for (const card of cards) {
        assert.ok(card.avatarInNameLink && card.channelFocusable && card.decorative);
        assert.equal(card.channelLinks, 1, 'one channel link per card');
        assert.ok(card.title.bottom <= card.avatar.y + 1, 'title above avatar and creator');
        assert.ok(Math.abs(card.title.width - card.details.width) <= 4, 'title uses full details width');
        assert.ok(Math.abs(card.metadata.width - card.details.width) <= 4, 'metadata has no avatar indentation');
        assert.ok(Math.abs(card.avatar.y + card.avatar.height / 2 - card.name.y - card.name.height / 2) <= 1, 'avatar centered beside creator');
        if (card.rtl) {
            assert.ok(card.name.right <= card.avatar.x, 'avatar precedes creator in RTL');
            if (card.menu) assert.ok(card.menu.right <= card.name.x, 'creator does not overlap menu in RTL');
        } else {
            assert.ok(card.avatar.right <= card.name.x, 'avatar precedes creator');
            if (card.menu) assert.ok(card.name.right <= card.menu.x, 'creator does not overlap menu');
        }
    }
}

for (const engine of engines) {
    test(`${engine}: channel avatars use response URLs, cache URLs and local placeholders beside creator names below full-width titles`, async () => {
        for (const theme of ['modern-neon', 'diary']) {
            for (const width of [320, 390, 768, 1440]) {
                const { page, context, requests, errors } = await pageFor(engine, { fixture: `avatars-${theme}`, width });
                assert.equal(await page.locator('.channel-avatar').count(), 4);
                assert.equal(await page.locator('.channel-avatar img').count(), 3);
                assert.equal(await page.locator('.channel-avatar-36').count(), 4);
                const images = page.locator('.channel-avatar img');
                assert.match(await images.nth(0).getAttribute('src'), /\/ggpht\/direct=s88/);
                assert.match(await images.nth(1).getAttribute('src'), /\/ggpht\/cached=s88/);
                assert.equal(await images.nth(0).getAttribute('alt'), '');
                assert.equal(await images.nth(0).getAttribute('loading'), 'lazy');
                assert.deepEqual(await page.locator('.channel-avatar-initial').allTextContents(), ['A', 'C', 'U', 'C']);
                assert.equal(await images.nth(0).evaluate(img => {
                    const rect = img.getBoundingClientRect();
                    return document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2) === img;
                }), true, 'real avatar covers the initial');
                const geometry = await page.locator('.channel-avatar').first().evaluate(el => ({ width: el.getBoundingClientRect().width, height: el.getBoundingClientRect().height, radius: getComputedStyle(el).borderRadius }));
                assert.deepEqual(geometry, { width: 36, height: 36, radius: '50%' });
                await assertAvatarCardLayout(page);
                const firstCard = page.locator('.media-card').first();
                assert.ok(await firstCard.locator('[data-dearrow-id]').evaluate(el => el.getBoundingClientRect().height > parseFloat(getComputedStyle(el).lineHeight)), 'long title wraps');
                assert.ok(await firstCard.locator('.channel-name').evaluate(el => el.getBoundingClientRect().height > parseFloat(getComputedStyle(el).lineHeight)), 'long creator name wraps');
                assert.match(await page.locator('.channel-name').first().textContent(), /<script> & details/);
                assert.equal(await page.locator('.media-card script').count(), 0);
                assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
                assert.ok(!requests.some(url => /\/api\/v1\/(channels|videos)|avatar.*lookup/.test(url)));
                if (width === 390) await page.screenshot({path: path.join(artifacts, `${engine}-avatars-${theme}-mobile.png`), fullPage: true});
                if (width === 1440) await page.screenshot({path: path.join(artifacts, `${engine}-avatars-${theme}-desktop.png`), fullPage: true});
                await firstCard.locator('[data-dearrow-row] > a').focus();
                await page.keyboard.press('Tab');
                assert.equal(await firstCard.locator('.channel-name-link').evaluate(el => el === document.activeElement), true);
                await page.keyboard.press('Tab');
                const summary = firstCard.locator('.video-context summary');
                assert.equal(await summary.evaluate(el => el === document.activeElement), true);
                await page.keyboard.press('Enter');
                await firstCard.locator('.video-context-actions').waitFor({state: 'visible'});
                await page.keyboard.press('Enter');
                assert.deepEqual(errors, []);
                await context.close();
            }
        }
    });

    test(`${engine}: channel avatars fit compact rows, history and subscription manager without JavaScript`, async () => {
        for (const theme of ['modern-neon', 'diary']) {
            for (const kind of ['search', 'playlist', 'history', 'manager']) {
                const {page, context, requests, errors} = await pageFor(engine, {fixture: `avatars-${kind}-${theme}`, width: 320, javascript: false});
                const size = kind === 'manager' ? 40 : kind === 'history' ? 36 : 24;
                assert.ok(await page.locator(`.channel-avatar-${size}`).count() > 0);
                assert.equal(await page.locator('.channel-avatar').first().evaluate(el => el.getBoundingClientRect().width), size);
                assert.equal(await page.locator('.channel-avatar-initial').first().evaluate(el => parseFloat(getComputedStyle(el).fontSize)), size / 2);
                assert.equal(await page.locator('.channel-avatar-initial').first().textContent(), kind === 'manager' ? 'A' : kind === 'history' ? 'S' : 'A');
                assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
                if (kind === 'manager') {
                    assert.equal(await page.locator('form[action^="/subscription_ajax"]').count(), 3);
                    assert.equal(await page.locator('.deleted .channel-avatar img').count(), 0);
                    assert.match(await page.locator('.channel-name-link').first().textContent(), /<script> & details/);
                } else {
                    await assertAvatarCardLayout(page);
                    const summary = page.locator('.media-card .video-context summary').first();
                    if (await summary.count()) {
                        await summary.focus();
                        await page.keyboard.press('Enter');
                        assert.equal(await summary.evaluate(el => el.parentElement.open), true);
                    }
                }
                assert.ok(!requests.some(url => /\/api\/v1\/(channels|videos)/.test(url)));
                assert.deepEqual(errors, []);
                await context.close();
            }
        }
    });

    test(`${engine}: channel avatars preserve thin mode, channel ownership and RTL layout`, async () => {
        for (const fixture of ['avatars-thin', 'avatars-manager-thin', 'avatars-channel', 'avatars-rtl']) {
            const {page, context, requests, errors} = await pageFor(engine, {fixture, width: 390});
            if (fixture.includes('thin')) {
                assert.equal(await page.locator('.channel-avatar').count(), 0);
                assert.ok(!requests.some(url => url.startsWith('/ggpht')));
            } else if (fixture === 'avatars-channel') {
                assert.equal(await page.locator('[data-channel-id=UCdirect] .channel-avatar').count(), 0);
                assert.equal(await page.locator('.channel-avatar').count(), 3);
            } else {
                assert.equal(await page.locator('html').getAttribute('dir'), 'rtl');
                await assertAvatarCardLayout(page);
            }
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
            assert.deepEqual(errors, []);
            await context.close();
        }
    });

    test(`${engine}: channel avatar initials preserve Unicode, stable colors and readable contrast`, async () => {
        const expected = ['Z', 'Z', 'É', 'É', 'Ж', 'ع', '山', 'कि', 'ß', '#', '#', '#', '#', 'B', 'C', 'D', 'E', 'F', 'A'];
        const luminance = color => {
            const channels = color.match(/[\d.]+/g).slice(0, 3).map(value => {
                const channel = Number(value) / 255;
                return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4;
            });
            return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
        };
        const colors = [];
        for (const theme of ['modern-neon', 'diary']) {
            for (const mode of ['dark', 'light']) {
                const {page, context, requests, errors} = await pageFor(engine, {fixture: `avatar-initials-${theme}-${mode}`, width: 390, javascript: false});
                assert.deepEqual(await page.locator('.channel-avatar-initial').allTextContents(), expected);
                assert.equal(await page.locator('.channel-avatar img').count(), 0);
                await assertAvatarCardLayout(page);
                const styles = await page.locator('.channel-avatar-initial').evaluateAll(elements => elements.map(el => {
                    const initial = getComputedStyle(el), avatar = getComputedStyle(el.parentElement);
                    return {text: initial.color, background: avatar.backgroundColor, font: initial.fontFamily, centered: initial.placeItems, direction: el.dir};
                }));
                assert.equal(styles[0].background, styles[1].background, 'uppercase and lowercase share a color');
                assert.equal(styles[2].background, styles[3].background, 'equivalent accents share a color');
                assert.equal(new Set(styles.map(style => style.background)).size, 6);
                for (const style of styles) {
                    const foreground = luminance(style.text), background = luminance(style.background);
                    assert.ok((Math.max(foreground, background) + .05) / (Math.min(foreground, background) + .05) >= 4.5, 'readable initial contrast');
                    assert.match(style.font, /system-ui/);
                    assert.equal(style.centered, 'center');
                    assert.equal(style.direction, 'auto');
                }
                const backgrounds = styles.map(style => style.background);
                if (colors.length) assert.deepEqual(backgrounds, colors, 'colors stable across themes and modes');
                else colors.push(...backgrounds);
                assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
                assert.ok(!requests.some(url => url.startsWith('/ggpht') || /\/api\/v1\/(channels|videos)/.test(url)));
                if (mode === 'light') {
                    await page.setViewportSize({width: 1440, height: 1000});
                    await assertAvatarCardLayout(page);
                    await page.screenshot({path: path.join(artifacts, `${engine}-avatar-initials-${theme}.png`), fullPage: true});
                }
                assert.deepEqual(errors, []);
                await context.close();
            }
        }
    });

    test(`${engine}: failed avatar images keep placeholders and never retry metadata`, async () => {
        for (const theme of ['modern-neon', 'diary']) {
            const {page, context, requests, errors} = await pageFor(engine, {fixture: `avatars-${theme}`, width: 1440, brokenAvatars: true});
            await page.waitForFunction(() => Array.from(document.querySelectorAll('.channel-avatar img')).every(img => img.hidden));
            assert.equal(await page.locator('.channel-avatar-initial:visible').count(), 4);
            assert.deepEqual(await page.locator('.channel-avatar-initial').allTextContents(), ['A', 'C', 'U', 'C']);
            await assertAvatarCardLayout(page);
            const before = requests.length;
            await page.waitForTimeout(100);
            assert.equal(requests.length, before);
            assert.ok(!requests.some(url => /\/api\/v1\/(channels|videos)/.test(url)));
            assert.deepEqual(errors, []);
            await context.close();
        }
    });
}
