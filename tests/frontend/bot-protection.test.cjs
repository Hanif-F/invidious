'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '../..');
const generated = process.env.FRONTEND_FIXTURES || path.join(__dirname, '.generated');

async function browserTest(run) {
    const browser = await chromium.launch({ headless: true });
    try { await run(await browser.newPage()); } finally { await browser.close(); }
}
async function serve(page, native, completions) {
    await page.route('https://challenges.cloudflare.com/**', route => route.fulfill({
        contentType: 'application/javascript',
        body: `window.turnstile={render:function(s,o){window.widgetOptions=o;setTimeout(()=>o.callback('test-challenge'),10);return 1;},reset:function(){window.widgetOptions.callback('fresh-challenge');}};window.invidiousTurnstileReady();`
    }));
    await page.route('https://invidious.test/**', async route => {
        const url = new URL(route.request().url());
        if (url.pathname === '/verify') return route.fulfill({ contentType: 'text/html', body: fs.readFileSync(path.join(generated, `verification-${native ? 'native' : 'browser'}.html`)) });
        if (url.pathname === '/api/v1/verification/complete') return completions(route);
        if (url.pathname === '/watch') return route.fulfill({ contentType: 'text/html', body: '<h1>Playback restored</h1>' });
        const file = path.join(root, 'assets', url.pathname);
        if (fs.existsSync(file)) return route.fulfill({ path: file });
        return route.fulfill({ status: 404 });
    });
}

test('standalone browser challenge uses scoped action, retries outages and returns to video position', async () => browserTest(async page => {
    let attempts = 0;
    await serve(page, false, route => {
        const body = route.request().postDataJSON();
        assert.equal(body.transport, 'browser');
        assert.equal(body.returnUrl, '/watch?v=abcdefghijk&t=42');
        if (++attempts === 1) return route.fulfill({ status: 503, json: { error: 'verification_unavailable', message: 'Please retry.' } });
        assert.equal(body.turnstileToken, 'fresh-challenge');
        return route.fulfill({ json: { expiresAt: 2000000000, returnUrl: body.returnUrl }, headers: { 'Set-Cookie': 'IV_VERIFIED=pass; Path=/; Secure; HttpOnly; SameSite=Lax' } });
    });
    await page.goto('https://invidious.test/verify');
    await page.locator('#verification-retry:visible').waitFor();
    assert.equal(await page.evaluate(() => window.widgetOptions.action), 'instance_access');
    assert.equal(await page.evaluate(() => window.widgetOptions.sitekey), '1x00000000000000000000AA');
    await page.locator('#verification-retry').click();
    await page.waitForURL('**/watch?v=abcdefghijk&t=42');
    assert.equal(attempts, 2);
    const cookies = await page.context().cookies();
    const pass = cookies.find(c => c.name === 'IV_VERIFIED');
    assert.ok(pass.secure && pass.httpOnly && pass.sameSite === 'Lax');
    assert.equal(await page.evaluate(() => document.cookie.includes('IV_VERIFIED')), false);
}));

test('native hosted challenge publishes credentials only through the documented event', async () => browserTest(async page => {
    const requests = [];
    page.on('request', request => requests.push(request.url()));
    await page.addInitScript(() => window.addEventListener('invidious-verification-complete', event => { window.bridgeResult = event.detail; }));
    await serve(page, true, route => {
        assert.equal(route.request().postDataJSON().transport, 'native');
        return route.fulfill({ json: { verificationToken: 'private-native-pass', expiresAt: 2000000000 } });
    });
    await page.goto('https://invidious.test/verify?client=native');
    await page.waitForFunction(() => window.bridgeResult);
    assert.deepEqual(await page.evaluate(() => window.bridgeResult), { verificationToken: 'private-native-pass', expiresAt: 2000000000, enabled: true });
    assert.ok(requests.every(url => !url.includes('private-native-pass')));
    assert.equal((await page.context().cookies()).length, 0);
    assert.ok(!await page.locator('body').textContent().then(text => text.includes('private-native-pass')));
}));

test('a denied media request preserves playback position when verification expires', async () => browserTest(async page => {
    await page.route('https://invidious.test/**', route => {
        const url = new URL(route.request().url());
        if (url.pathname === '/js/bot-protection.js') return route.fulfill({ path: path.join(root, 'assets/js/bot-protection.js') });
        if (url.pathname === '/api/v1/captions/test') return route.fulfill({ status: 403, headers: { 'X-Invidious-Verification-Required': 'verification_expired' }, json: { error: 'verification_expired' } });
        if (url.pathname === '/verify') return route.fulfill({ contentType: 'text/html', body: 'Verify again' });
        return route.fulfill({ contentType: 'text/html', body: '<script id="verification-access" type="application/json">1</script><script src="/js/bot-protection.js"></script>' });
    });
    await page.goto('https://invidious.test/watch?v=test');
    await page.evaluate(() => { window.player = { currentTime: () => 73.9, pause() {} }; fetch('/api/v1/captions/test'); });
    await page.waitForURL('**/verify?return=*');
    assert.equal(new URL(page.url()).searchParams.get('return'), '/watch?v=test&t=73');
}));

test('media errors check local status and embedded recovery offers a direct link', async () => browserTest(async page => {
    await page.route('https://invidious.test/**', route => {
        const url = new URL(route.request().url());
        if (url.pathname === '/js/bot-protection.js') return route.fulfill({ path: path.join(root, 'assets/js/bot-protection.js') });
        if (url.pathname === '/api/v1/verification') return route.fulfill({ json: { required: true } });
        return route.fulfill({ contentType: 'text/html', body: '<script id="verification-access" type="application/json">1</script><script src="/js/bot-protection.js"></script><video></video>' });
    });
    await page.route('https://outside.test/**', route => route.fulfill({ contentType: 'text/html', body: '<iframe src="https://invidious.test/embed/test"></iframe>' }));
    await page.goto('https://outside.test/');
    const frame = page.frames().find(f => f.url().includes('/embed/'));
    await frame.waitForFunction(() => window.InvidiousVerification);
    await frame.evaluate(() => document.querySelector('video').dispatchEvent(new Event('error')));
    const link = frame.locator('a[target="_blank"]');
    await link.waitFor();
    assert.match(await link.getAttribute('href'), /^\/verify\?return=/);
    assert.equal(page.url(), 'https://outside.test/');
}));
