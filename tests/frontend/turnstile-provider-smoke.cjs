// Opt-in browser smoke with Cloudflare's published always-pass test sitekey.
// Uses a mocked instance exchange; never grants a real instance pass or account.
'use strict';
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
(async () => {
    const browser = await chromium.launch({ headless: true });
    try {
        const page = await browser.newPage();
        page.on('requestfailed', request => console.error('Request failed:', new URL(request.url()).hostname, request.failure().errorText));
        page.on('pageerror', error => console.error('Page error:', error.message));
        page.on('console', message => { if (message.type() === 'error') console.error('Browser:', message.text().slice(0, 500)); });
        await page.addInitScript(() => window.addEventListener('invidious-verification-complete', event => { window.testResult = event.detail; }));
        await page.route('https://invidious.test/**', route => {
            const url = new URL(route.request().url());
            if (url.pathname === '/verify') return route.fulfill({
                contentType: 'text/html', body: fs.readFileSync(path.join(__dirname, '.generated/verification-native.html')),
                headers: { 'Content-Security-Policy': "default-src 'none'; script-src 'self' https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; connect-src 'self'; style-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'self'; frame-ancestors 'none'" }
            });
            if (url.pathname === '/api/v1/verification/complete') {
                const body = route.request().postDataJSON();
                assert.equal(body.transport, 'native');
                assert.ok(body.turnstileToken.length > 0);
                return route.fulfill({ json: { verificationToken: 'synthetic-smoke-pass', expiresAt: 2000000000 } });
            }
            const file = path.join(root, 'assets', url.pathname);
            if (fs.existsSync(file)) return route.fulfill({ path: file });
            return route.fulfill({ status: 404 });
        });
        await page.goto('https://invidious.test/verify?client=native');
        await page.waitForFunction(() => window.testResult, null, { timeout: 45000 });
        assert.equal(await page.evaluate(() => window.testResult.verificationToken), 'synthetic-smoke-pass');
        await page.screenshot({ path: '/tmp/invidious-turnstile-testkey-smoke.png' });
        await page.setViewportSize({ width: 320, height: 700 });
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'Verification widget overflows a narrow native WebView');
        console.log('Live Cloudflare test widget, strict verification-page CSP, hosted native event: passed. Production-key activation smoke remains required.');
    } finally { await browser.close(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
