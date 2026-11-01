'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '../..');
const generated = process.env.FRONTEND_FIXTURES || path.join(__dirname, '.generated');

test('admin access controls show both states and work without JavaScript at desktop widths', async () => {
    const browser = await chromium.launch({ headless: true });
    try {
        const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 1440, height: 900 } });
        const page = await context.newPage();
        let fixture = 'admin-settings.html';
        let submitted;
        await page.route('https://invidious.test/**', async route => {
            const request = route.request();
            const url = new URL(request.url());
            if (request.method() === 'POST' && url.pathname === '/admin/settings') {
                submitted = new URLSearchParams(request.postData());
                return route.fulfill({ contentType: 'text/html', body: '<p>Saved</p>' });
            }
            if (url.pathname === '/admin/settings' || url.pathname === '/preferences') return route.fulfill({ contentType: 'text/html', path: path.join(generated, fixture) });
            const asset = path.join(root, 'assets', url.pathname);
            return fs.existsSync(asset) ? route.fulfill({ path: asset }) : route.fulfill({ status: 404 });
        });
        await page.goto('https://invidious.test/admin/settings');
        const gate = page.getByLabel('Require login:', { exact: true });
        const registration = page.getByLabel('Registration enabled:', { exact: true });
        assert.equal(await gate.isChecked(), false);
        assert.equal(await registration.isChecked(), true);
        assert.match(await page.locator('#registration-enabled-help').innerText(), /user whitelist mode/);
        await gate.check();
        await registration.uncheck();
        await page.getByLabel('Apply changes to instance access', {exact:true}).check();
        await page.getByRole('button', { name: 'Save instance settings', exact: true }).click();
        assert.equal(submitted.get('login_required'), 'on');
        assert.equal(submitted.has('registration_enabled'), false);

        fixture = 'admin-settings-private.html';
        await page.goto('https://invidious.test/admin/settings');
        assert.equal(await gate.isChecked(), true);
        assert.equal(await registration.isChecked(), false);
        await gate.scrollIntoViewIfNeeded();
        assert.equal(await page.locator('#login-required-help').isVisible(), true);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
        await page.screenshot({ path: '/tmp/invidious-required-login-admin.png' });

        fixture = 'preferences-admin.html';
        await page.goto('https://invidious.test/preferences');
        assert.equal(await page.locator('#login_required').count(), 0);
        assert.equal(await page.locator('#registration_enabled').count(), 0);
        assert.equal(await page.locator('#preferences-administration a[href="/admin/settings"]').count(), 1);
    } finally {
        await browser.close();
    }
});
