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
window.__ended = []; window.__time = 0;
window.player = {
 on: function(event, cb) { if (event === 'ended') window.__ended.push(cb); },
 off: function(event, cb) { if (event === 'ended') window.__ended = window.__ended.filter(f => f !== cb); },
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
    const page = await context.newPage();
    const errors = [];
    const requests = [];
    page.on('pageerror', error => errors.push(error.message));
    let queueCalls = 0;
    let transcriptCalls = 0;
    const fixture = options.fixture || 'watch-dark';
    await page.route('**/*', async route => {
        const url = new URL(route.request().url());
        requests.push(url.pathname + url.search);
        if (route.request().isNavigationRequest()) {
            let body = fs.readFileSync(path.join(generated, fixture + '.html'), 'utf8');
            if (options.videoData) {
                body = body.replace(/(<script id="video_data"[^>]*>)([\s\S]*?)(<\/script>)/, (_, start, data, end) => {
                    const original = JSON.parse(data);
                    const updated = { ...original, ...options.videoData, params: { ...original.params, ...options.videoData.params } };
                    return start + JSON.stringify(updated).replace(/</g, '\\u003c') + end;
                });
            }
            if (options.extraQuality) body = body.replace('</video>', '<source src="/latest_version?id=2isYuQZMbdU&itag=44" type="video/webm" label="high"></video>');
            if (options.sponsorblock) body = body.replace(/(<script id="player_data"[^>]*>)([\s\S]*?)(<\/script>)/, (_, start, data, end) => start + JSON.stringify({...JSON.parse(data), sponsorblock: {...JSON.parse(data).sponsorblock, ...options.sponsorblock}}).replace(/</g, '\\u003c') + end);
            return route.fulfill({ contentType: 'text/html', body });
        }
        if (url.pathname.startsWith('/api/v1/sponsorblock/')) return route.fulfill({ status: options.sponsorblockError ? 503 : 200, contentType: 'application/json', body: JSON.stringify({segments: options.sponsorblockSegments || []}) });
        if (url.pathname.startsWith('/api/v1/dearrow/')) {
            if (options.dearrowError) return route.fulfill({ status: 503, body: '{}' });
            return route.fulfill({ contentType: 'application/json', body: JSON.stringify({title: options.dearrowMissing ? null : 'A clear title <img src=x onerror=alert(1)>'}) });
        }
        if (url.pathname === '/api/v1/auth/subscriptions') return route.fulfill({ contentType: 'application/json', body: '[]' });
        if (url.pathname === '/api/v1/auth/notifications') return route.fulfill({ contentType: 'text/event-stream', body: ': fixture\n\n' });
        if (/^\/api\/v1\/(playlists|mixes)\//.test(url.pathname)) {
            queueCalls++;
            if (options.queueError && queueCalls <= options.queueError) return route.fulfill({ status: 500, body: '{}' });
            const response = options.queue || (fixture === 'watch-thin' ? JSON.parse(fs.readFileSync(path.join(generated, 'queue-thin.json'))) : queue);
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
        if (url.pathname === '/js/silvermine-videojs-quality-selector.min.js' && !options.realPlayer) return route.fulfill({ contentType: 'application/javascript', body: '' });
        if (url.pathname === '/js/player.js' && !options.realPlayer) return route.fulfill({ contentType: 'application/javascript', body: playerStub });
        if (url.pathname.startsWith('/videojs/') && !options.realPlayer) return route.fulfill({ contentType: url.pathname.endsWith('.css') ? 'text/css' : 'application/javascript', body: '' });
        if (url.pathname.startsWith('/vi/') || url.pathname.startsWith('/ggpht')) return route.fulfill({ contentType: 'image/svg+xml', body: picture });
        if (options.realPlayer && url.pathname === '/latest_version') {
            const body = fs.readFileSync(path.join(generated, 'fixture.webm'));
            const range = route.request().headers().range;
            const match = range && range.match(/bytes=(\d+)-(\d*)/);
            if (match) {
                const start = Number(match[1]);
                const end = match[2] ? Math.min(Number(match[2]), body.length - 1) : body.length - 1;
                return route.fulfill({ status: 206, contentType: 'video/webm', headers: { 'accept-ranges': 'bytes', 'content-range': `bytes ${start}-${end}/${body.length}` }, body: body.subarray(start, end + 1) });
            }
            return route.fulfill({ contentType: 'video/webm', headers: { 'accept-ranges': 'bytes' }, body });
        }
        if (url.pathname.startsWith('/api/v1/captions/')) return route.fulfill({ contentType: 'text/vtt', body: 'WEBVTT\n\n00:00.000 --> 00:04.000\nFixture captions\n' });
        if (url.pathname === '/themes/fixture-theme/theme.css') return route.fulfill({ contentType: 'text/css', body: 'body { --fixture-theme: active; }' });
        if (options.fontFailure && url.pathname === '/themes/cinematic/Oswald.woff2') return route.abort();
        if (/^\/(css|js|fonts|videojs|themes)\//.test(url.pathname)) {
            const file = path.join(root, 'assets', url.pathname);
            if (!fs.existsSync(file)) return route.fulfill({ status: 404, body: '' });
            return route.fulfill({ contentType: url.pathname.endsWith('.css') ? 'text/css' : url.pathname.endsWith('.js') ? 'application/javascript' : url.pathname.endsWith('.svg') ? 'image/svg+xml' : 'application/octet-stream', body: fs.readFileSync(file) });
        }
        return route.fulfill({ contentType: 'application/json', body: '{}' });
    });
    await page.goto('https://invidious.test/' + (options.route || (fixture.startsWith('watch') ? 'watch?v=2isYuQZMbdU&list=PLfixture&index=2' : fixture.startsWith('preferences') ? 'preferences' : fixture.startsWith('search') ? 'search?q=light' : 'feed/popular')));
    return { page, context, errors, requests, queueCalls: () => queueCalls, transcriptCalls: () => transcriptCalls };
}

for (const engine of engines) {
    test(`${engine}: theme cards render and submit without JavaScript`, async () => {
        const { page, context } = await pageFor(engine, { fixture: 'preferences', javascript: false, width: 390 });
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
    test(`${engine}: Cinematic selection submits without JavaScript and loads alone`, async () => {
        const { page, context, requests } = await pageFor(engine, { fixture: 'preferences-cinematic', javascript: false, width: 390 });
        const radio = page.getByRole('radio', { name: 'Cinematic', exact: true });
        assert.equal(await radio.isChecked(), true);
        for (const img of await page.locator('.theme-card img').all()) {
            assert.equal(await img.evaluate(el => el.complete && el.naturalWidth > 0), true);
        }
        assert.ok(requests.some(url => url.startsWith('/themes/cinematic/theme.css')));
        assert.ok(!requests.some(url => url.startsWith('/themes/modern-neon/theme.css')));
        const posted = page.waitForRequest(request => request.method() === 'POST');
        await page.getByRole('button', { name: 'Save preferences', exact: true }).click();
        assert.equal(new URLSearchParams((await posted).postData()).get('theme'), 'cinematic');
        await context.close();
    });
    test(`${engine}: Cinematic editorial composition, font fallback, and feed order`, async () => {
        for (const fontFailure of [false, true]) {
            const { page, context, requests } = await pageFor(engine, { fixture: 'browse-cinematic-dark', fontFailure });
            await page.evaluate(() => document.fonts.ready);
            assert.ok(requests.some(url => url.startsWith('/themes/cinematic/Oswald.woff2')));
            assert.ok(!requests.some(url => url.startsWith('/themes/diary/') || url.startsWith('/themes/modern-neon/')));
            if (!fontFailure) assert.equal(await page.evaluate(() => document.fonts.check('600 56px Oswald')), true);
            const cards = page.locator('.editorial-feed > .media-item');
            const originalTitles = await cards.locator('[data-dearrow-id]').allTextContents();
            const lead = await cards.first().boundingBox();
            const second = await cards.nth(1).boundingBox();
            assert.ok(lead.width > second.width * 2.5, 'Opening entry must span the catalog');
            const frame = await cards.first().locator('.media-card > .thumbnail').boundingBox();
            assert.ok(frame.width / lead.width > .6 && frame.width / lead.width < .7);
            assert.ok(second.y > lead.y + lead.height - 1, 'Next entry must follow the opening entry');
            const rail = await page.locator('.navigation-rail').boundingBox();
            assert.ok(rail.width > 1200 && rail.height < 180, 'Navigation must be a horizontal index');
            await cards.first().locator('[data-dearrow-id]').evaluate(el => el.textContent = 'A very long multilingual film title — '.repeat(10));
            assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
            await cards.first().locator('[data-dearrow-id]').evaluate((el, title) => el.textContent = title, originalTitles[0]);
            for (const [attribute, value] of [['data-density', 'compact'], ['data-thin', 'true']]) {
                await page.locator('body').evaluate((el, [key, value]) => el.setAttribute(key, value), [attribute, value]);
                const firstBox = await cards.first().boundingBox(), nextBox = await cards.nth(1).boundingBox();
                assert.ok(Math.abs(firstBox.width - nextBox.width) < 2, `${attribute} must use equal entries`);
                assert.deepEqual(await cards.locator('[data-dearrow-id]').allTextContents(), originalTitles);
                await page.locator('body').evaluate((el, key) => el.setAttribute(key, key === 'data-density' ? 'balanced' : 'false'), attribute);
            }
            await page.emulateMedia({ forcedColors: 'active' });
            await page.keyboard.press('Tab');
            assert.equal(await page.locator('.skip-link').evaluate(el => el === document.activeElement), true);
            assert.notEqual(await page.locator('.skip-link').evaluate(el => getComputedStyle(el).outlineStyle), 'none');
            await cards.evaluateAll(items => items.slice(1).forEach(el => el.remove()));
            assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Single entry overflow');
            await cards.first().evaluate(el => el.remove());
            assert.equal(await page.locator('.navigation-rail').isVisible(), true);
            assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Empty feed overflow');
            await context.close();
        }
        const { page, context } = await pageFor(engine, { fixture: 'browse-cinematic-auto', systemTheme: 'dark' });
        await page.emulateMedia({ colorScheme: 'light' });
        assert.equal(await page.locator('body').evaluate(el => getComputedStyle(el).colorScheme), 'light');
        await page.emulateMedia({ colorScheme: 'dark' });
        assert.equal(await page.locator('body').evaluate(el => getComputedStyle(el).colorScheme), 'dark');
        await context.close();
    });
    test(`${engine}: Cinematic responsive layouts`, async () => {
        for (const width of [320, 390, 768, 1024, 1440, 1920]) {
            for (const fixture of ['browse-cinematic-light', 'browse-cinematic-dark', 'browse-cinematic-compact', 'browse-cinematic-thin', 'watch-cinematic-light', 'watch-cinematic-dark', 'watch-cinematic-rtl', 'preferences-cinematic', 'search-cinematic', 'playlist-cinematic', 'history-cinematic', 'playlist-library-cinematic', 'login-cinematic', 'error-cinematic', 'channel-cinematic']) {
                const { page, context, errors } = await pageFor(engine, { fixture, width });
                await page.evaluate(() => document.fonts.ready);
                assert.equal(await page.locator('body').getAttribute('data-theme'), 'cinematic', `${fixture} must exercise Cinematic`);
                assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${fixture} overflows at ${width}`);
                assert.deepEqual(errors, []);
                if ([320, 1440].includes(width)) {
                    await page.locator('img.thumbnail').evaluateAll(images => Promise.all(images.filter(img => img.getBoundingClientRect().top < innerHeight).map(img => img.decode())));
                    await page.screenshot({ path: path.join(artifacts, `${engine}-${fixture}-${width}.png`) });
                }
                if (fixture === 'browse-cinematic-light' && width === 320) {
                    await page.addStyleTag({ content: 'html { font-size: 200%; }' });
                    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Cinematic enlarged text overflows: ' + JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('body *')].filter(el => el.getBoundingClientRect().right > innerWidth + 1).slice(0, 12).map(el => [el.tagName, el.className, el.getBoundingClientRect().right]))));
                    await page.keyboard.press('Tab');
                    assert.equal(await page.locator('.skip-link').evaluate(el => el === document.activeElement), true);
                }
                await context.close();
            }
        }
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
    test(`${engine}: Cinematic palettes, mode toggle and keyboard selection`, async () => {
        for (const [mode, systemTheme, expected] of [['light', 'dark', 'light'], ['dark', 'light', 'dark'], ['auto', 'dark', 'dark'], ['auto', 'light', 'light']]) {
            const { page, context } = await pageFor(engine, { fixture: `browse-cinematic-${mode}`, systemTheme });
            assert.equal(await page.locator('body').evaluate(el => getComputedStyle(el).colorScheme), expected);
            const ratios = await page.locator('body').evaluate(el => {
                const style = getComputedStyle(el);
                const luminance = token => {
                    const hex = style.getPropertyValue(token).trim().replace('#', '');
                    const expanded = hex.length === 3 ? [...hex].map(c => c + c).join('') : hex;
                    return [0, 2, 4].map(i => parseInt(expanded.slice(i, i + 2), 16) / 255)
                        .map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4)
                        .reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
                };
                return [['--text', '--page'], ['--muted', '--page'], ['--accent', '--page'],
                    ['--text', '--surface'], ['--muted', '--surface'], ['--accent', '--surface'],
                    ['--accent-ink', '--accent']].map(([a, b]) => {
                    const x = luminance(a), y = luminance(b);
                    return (Math.max(x, y) + .05) / (Math.min(x, y) + .05);
                });
            });
            assert.ok(ratios.every(ratio => ratio >= 4.5), `Cinematic ${expected} contrast: ${ratios}`);
            assert.equal(await page.locator('.media-card .thumbnail').first().evaluate(el => getComputedStyle(el).transitionDuration), '0s');
            await page.locator('#toggle_theme').click();
            assert.equal(await page.locator('body').getAttribute('data-theme'), 'cinematic');
            assert.equal(await page.locator('body').getAttribute('data-density'), 'balanced');
            await context.close();
        }
        const { page, context } = await pageFor(engine, { fixture: 'preferences' });
        await page.getByRole('radio', { name: 'Modern Neon' }).focus();
        await page.keyboard.press('ArrowRight');
        await page.keyboard.press('ArrowRight');
        assert.equal(await page.getByRole('radio', { name: 'Cinematic', exact: true }).isChecked(), true);
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
    test(`${engine}: Cinematic preserves real player controls`, async () => {
        for (const width of [390, 1440]) {
            const { page, context, errors } = await pageFor(engine, { fixture: 'watch-cinematic-dark', realPlayer: true, width, touch: width === 390 });
            await page.waitForFunction(() => window.player && typeof player.play === 'function');
            await page.evaluate(() => { player.muted(true); player.play(); });
            await page.waitForFunction(() => player.currentTime() > 0.1);
            await page.evaluate(() => { player.pause(); player.currentTime(1); player.playbackRate(1.5); });
            assert.equal(await page.evaluate(() => player.paused()), true);
            assert.equal(await page.evaluate(() => player.playbackRate()), 1.5);
            await page.waitForFunction(() => player.currentTime() >= 0.9);
            if (width === 1440) {
                const checkGeometry = async () => {
                    assert.equal(Math.round((await page.locator('.watch-sidebar').boundingBox()).width), 440);
                    assert.equal(Math.round((await page.locator('.recommendation > .thumbnail').first().boundingBox()).width), 140);
                };
                await checkGeometry();
                const wasWide = await page.locator('.watch-layout').evaluate(el => el.classList.contains('watch-wide'));
                await page.locator('.vjs-wide-control').click();
                await checkGeometry();
                assert.equal(await page.locator('.watch-layout').evaluate(el => el.classList.contains('watch-wide')), !wasWide);
                await page.screenshot({ path: path.join(artifacts, `${engine}-cinematic-player-alternate.png`) });
                await page.locator('.vjs-wide-control').click();
                await checkGeometry();
                assert.equal(await page.locator('.watch-layout').evaluate(el => el.classList.contains('watch-wide')), wasWide);
            }
            assert.deepEqual(errors, []);
            await context.close();
        }
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

    test(`${engine}: cached history titles and compact desktop playlist library`, async () => {
        const history = await pageFor(engine, { fixture: 'history' });
        const cards = history.page.locator('.media-card');
        assert.match(await cards.nth(0).textContent(), /A journey through light/);
        assert.match(await cards.nth(1).textContent(), /Light <study> & color/);
        assert.equal(await cards.nth(2).locator('p').count(), 0);
        assert.equal(await cards.nth(2).locator('img').count(), 1);
        assert.equal(history.requests.some(url => url.startsWith('/api/v1/videos/')), false);
        assert.deepEqual(history.errors, []);
        await history.context.close();
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
        for (const fixture of ['browse-auto', 'browse-diary-auto', 'browse-cinematic-auto']) {
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

test('UI asset additions stay below the 30KB compressed initial-load budget', () => {
    const baseline = require('./asset-baseline.json');
    let delta = 0;
    const themeBytes = [];
    for (const [file, originalBytes] of Object.entries(baseline.gzipBytes)) {
        const current = fs.readFileSync(path.join(root, 'assets', file));
        const added = gzipSync(current).length - originalBytes;
        if (/^themes\/[^/]+\/theme\.css$/.test(file)) themeBytes.push(added);
        else delta += added;
    }
    // Only one theme stylesheet is loaded: budget the largest alongside shared assets.
    delta += Math.max(0, ...themeBytes);
    for (const file of ['dearrow.js', 'player-mobile.js', 'player-stats.js']) delta += gzipSync(fs.readFileSync(path.join(root, 'assets/js', file))).length;
    assert.ok(delta <= 30 * 1024, `${delta} bytes added`);
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
        const toggle = page.locator('#filters input[name=include_blocked]');
        assert.equal(await toggle.isChecked(), false);
        assert.equal(await page.locator('#filters input[name=page]').inputValue(), '1');
        assert.ok(await page.locator('a[href*="page=3"]').count() > 0);
        assert.ok(await page.locator('.no-results-error a[href*="include_blocked=1"]').count() > 0);
        await context.close();
        const included = await pageFor(engine, { fixture: 'search-included' });
        await included.page.locator('#filters-collapse > summary').click();
        assert.equal(await included.page.locator('#filters input[name=include_blocked]').isChecked(), true);
        assert.match(await included.page.locator('a[href*="page=3"]').first().getAttribute('href'), /include_blocked=1/);
        await included.context.close();
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
        const { page, context, errors } = await pageFor(engine, { realPlayer: true });
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
        await heading.hover();
        assert.equal(await heading.textContent(), original);
        assert.equal(await page.locator('.dearrow-tooltip').count(), 0);
        await page.mouse.move(0, 0);
        assert.equal(await heading.textContent(), replacement);
        await heading.focus();
        assert.equal(await heading.textContent(), original);
        await heading.evaluate(el => el.blur());
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
        await restoredTitle.hover();
        assert.equal(await restoredTitle.textContent(), await restoredTitle.getAttribute('data-dearrow-original'));
        await page.mouse.move(0, 0);
        assert.equal(await restoredTitle.textContent(), replacement);
        await page.screenshot({path: path.join(artifacts, `${engine}-dearrow-desktop.png`)});
        await context.close();
    });

    test(`${engine}: DeArrow keeps replacements on hover when original display is disabled`, async () => {
        const {page, context, errors} = await pageFor(engine, {fixture: 'browse-dearrow-no-original', width: 390});
        await page.waitForFunction(() => Array.from(document.querySelectorAll('[data-dearrow-id]')).some(el => el.textContent.startsWith('A clear title')));
        assert.equal(await page.locator('.dearrow-tooltip').count(), 0);
        assert.equal(await page.locator('[data-dearrow-id] img').count(), 0);
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
            helpers.xhr = (method, url, options) => {
                if (url.startsWith('/watch_ajax')) updates.push({
                    action: new URL(url, location.origin).searchParams.get('action'),
                    position: new URLSearchParams(options.payload).get('position')
                });
            };
            let time = 60;
            // Keep the real player's event handlers; simulate a longer video's clock.
            player.currentTime = () => time;
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

// Font transfer is reported separately from the existing CSS/JS and preview budgets.
test('Cinematic bundled font transfer stays within its recorded allowance', () => {
    const inventory = require('./asset-baseline.json').fontAssets;
    for (const [file, entry] of Object.entries(inventory)) {
        const bytes = fs.statSync(path.join(root, 'assets', file)).size;
        assert.equal(bytes, entry.bytes, `${file}: update the recorded transfer size`);
        assert.ok(bytes <= entry.maxBytes, `${file}: ${bytes} font bytes`);
        console.log(`${file}: ${bytes} font bytes (separate from CSS/JS)`);
    }
});

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
        await page.waitForFunction(() => player.currentTime() >= 3);
        await page.screenshot({path:path.join(artifacts, `${engine}-sponsorblock-notice.png`)});
        await page.evaluate(() => player.currentTime(.8));
        await page.waitForFunction(() => document.querySelector('.sb-overlay').classList.contains('sb-visible'));
        await page.waitForFunction(() => document.querySelector('.sb-overlay').innerText.includes('Sponsor'));
        await page.screenshot({path:path.join(artifacts, `${engine}-sponsorblock-manual.png`)});
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
        for (const fixture of ['preferences', 'preferences-cinematic', 'preferences-diary']) {
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
        await panel.getByRole('button', {name: '720p', exact: true}).tap();
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
