'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const playwright = require('playwright');

const assets = path.join(__dirname, '../../assets');
const generated = process.env.FRONTEND_FIXTURES || path.join(__dirname, '.generated');
const artifacts = path.join(__dirname, 'artifacts', 'responsive');
const engines = (process.env.FRONTEND_BROWSERS || 'chromium,firefox').split(',');
const viewports = [{width:320,height:568}, {width:390,height:844}, {width:844,height:390}];

// Branches with the same markup are represented by their production template.
// Focus, writes, lifetimes and runtime overlays also run in the owning suites.
const fixtures = {
    discovery: [
        'd3-search-home-light', 'd3-search-light', 'qol-search-post', 'qol-search-false-2', 'audit-hashtag-light',
        'd3-popular-light', 'd3-popular-empty-light', 'd3-trending-light', 'd3-trending-empty-light'
    ],
    channels: [
        'd3-channel-more', 'upstream-shows-light', 'channel-search', 'channel-search-private',
        'channel-playlists-diary', 'channel-clips', 'd3-community-light', 'd3-post-light', 'd3-post-nojs-light'
    ],
    library: [
        'd4-subscriptions-light', 'd4-subscriptions-empty', 'd4-subscriptions-filtered', 'd4-manager-light',
        'd4-history-light', 'd4-history-paused', 'd4-clear-history', 'd4-library-light', 'd4-library-add',
        'd4-library-empty', 'd4-playlist-light', 'd4-playlist-guest', 'd4-playlist-empty', 'd4-mix-light',
        'clips-library', 'clips-empty', 'd4-create-light', 'd4-create-failed', 'd4-edit-light', 'd4-edit-failed',
        'd4-delete-light', 'd4-add', 'd4-add-private', 'd4-add-error'
    ],
    watch: [
        'd5-single-light', 'd5-long-light', 'd5-no-tools-light', 'd5-owned-light', 'd5-queue-chat-light',
        'd5-portrait-light', 'd5-audio-light', 'd5-dash-light', 'd5-transcript-only-light', 'd5-timestamps-only-light',
        'd5-annotations-light', 'd5-vr-light', 'watch-actions', 'watch-chapters', 'd6-comments-nojs-light', 'd6-comments-disabled-light',
        'd6-contribution-masked-light', 'create-clip', 'd6-clip-native-light', 'd6-clip-delete-light', 'd6-clip-unavailable-light'
    ],
    embed: [
        'd7-embed-single-light', 'd7-embed-audio-light', 'd7-embed-dash-light', 'd7-embed-live-light',
        'd7-embed-masked-light', 'd7-embed-no-controls-light', 'd7-embed-playlist-light', 'd7-embed-portrait-light',
        'd7-embed-preview-light', 'd7-embed-private-light', 'd7-embed-series-light', 'd7-embed-login-light', 'd7-status-embed-light'
    ],
    settings: [
        'settings-appearance', 'settings-language', 'settings-browsing', 'settings-playback',
        'settings-captions-comments', 'settings-library', 'settings-sponsorblock', 'settings-dearrow', 'settings-ai-filter',
        'd6-chat-settings-account-light', 'sponsorblock-channels', 'd6-sb-invalid-light', 'spoiler-editor-account',
        'd6-masking-invalid-light', 'd6-blocks-filled-light',
        'd6-identity-configured-light', 'admin-settings', 'd7-api-admin-light'
    ],
    account: [
        'd7-login-light', 'd7-login-failed-light', 'd7-api-login-light', 'd7-signup-light', 'd7-signup-captcha-light',
        'd7-account-light', 'd7-delete-light', 'd7-sessions-light', 'd7-sessions-empty-light', 'd7-authorize-light',
        'd7-authorize-wide-light', 'd7-token-issued-light', 'd7-data-invidious-light', 'd7-data-youtube-light',
        'd7-data-youtube-playlist-light', 'd7-data-youtube-history-light', 'd7-data-freetube-light',
        'd7-data-newpipe-light', 'd7-data-newpipe-subscriptions-light', 'd7-data-partial-light', 'd7-tv-light', 'd7-tv-approved-light'
    ],
    recovery: [
        'd7-verify-browser-light', 'd7-verify-native-light', 'd7-verify-cloudflare-light', 'd7-verify-disabled-light',
        'd7-verify-unconfigured-light', 'd7-verify-admin-light', 'd7-verify-admin-missing-light', 'd7-verify-notice-iframe-light',
        'd7-api-verify-light', 'd7-api-cloudflare-light', 'd7-api-error-light', 'd7-status-privacy-light',
        'd7-status-licenses-light', 'd7-status-message-light', 'd7-status-known-light', 'd7-status-not-found-light',
        'd7-status-post-light', 'd7-status-unavailable-light', 'd7-status-unexpected-light'
    ]
};
const images = new Set(['d3-search-light','d3-channel-more','d4-playlist-light','d5-long-light',
    'settings-ai-filter','d7-signup-captcha-light','d7-verify-browser-light','d7-embed-single-light']);

function fileResponse(file) {
    const type = {'.html':'text/html', '.css':'text/css', '.js':'text/javascript', '.svg':'image/svg+xml',
        '.json':'application/json', '.webm':'video/webm'}[path.extname(file)];
    return {path:file, contentType:type || 'application/octet-stream'};
}

async function serve(context) {
    await context.route('**/*',async route=>{
        const url=new URL(route.request().url());
        if(url.hostname==='challenges.cloudflare.com') return route.fulfill({
            contentType:'text/javascript',
            body:`window.turnstile={render(selector,options){
                window.providerRenders=(window.providerRenders||0)+1;
                const frame=document.createElement('iframe');
                frame.title='Verification challenge';frame.style.border=0;
                frame.width=options.size==='compact'?150:300;frame.height=options.size==='compact'?140:65;
                frame.srcdoc='<style>body{margin:0;font:14px system-ui}label{display:flex;align-items:center;gap:8px;padding:12px;background:#f2f4f7;border:1px solid #c8d0dc}</style><label><input type="checkbox"> Verification challenge</label>';
                document.querySelector(selector).append(frame);return 1;
            }};window.invidiousTurnstileReady();`
        });
        if(url.hostname!=='invidious.test') return route.fulfill({status:404,body:''});
        if(url.pathname==='/framed') return route.fulfill({contentType:'text/html',body:'<!doctype html><meta name="viewport" content="width=device-width"><style>body{margin:0}iframe{display:block;border:0;width:100vw;height:100vh}</style><iframe title="Player" src="/fixtures/d7-embed-single-light.html"></iframe>'});
        if(/^\/fixtures\/[a-z0-9-]+\.html$/.test(url.pathname)) return route.fulfill(fileResponse(path.join(generated,path.basename(url.pathname))));
        if(url.pathname==='/latest_version') return route.fulfill(fileResponse(path.join(generated,'fixture.webm')));
        const asset = path.join(assets,url.pathname);
        if(fs.existsSync(asset) && fs.statSync(asset).isFile()) return route.fulfill(fileResponse(asset));
        if(/^\/(vi\/|ggpht)/.test(url.pathname)) return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><path fill="#526785" d="M0 0h320v180H0z"/><circle fill="#b6cee4" cx="190" cy="92" r="36"/></svg>'});
        return route.fulfill({contentType:'application/json',body:'{}'});
    });
}

async function geometry(page) {
    return page.evaluate(()=>{
        const root=document.documentElement;
        if(root.scrollWidth<=root.clientWidth+1) return [];
        return [`${root.scrollWidth} > ${root.clientWidth}`, ...Array.from(document.querySelectorAll('body *'))
            .filter(el=> {
                const rect=el.getBoundingClientRect();
                return rect.width && (rect.right>root.clientWidth+1 || rect.left< -1) &&
                    !el.closest('.channel-core-tabs,.license-table-scroll,.slides,.sr-only,[hidden]');
            })
            .slice(0,8).map(el=>[el.localName,el.id,el.getAttribute('class')])];
    });
}

for(const engine of engines) {
    test(`${engine}: production phone geometry and ordinary HTML matrix`,async t=>{
        fs.mkdirSync(artifacts,{recursive:true});
        const browser=await playwright[engine].launch({headless:true});
        try {
            for(const [family,examples] of Object.entries(fixtures)) await t.test(family,async()=>{
                const context=await browser.newContext({viewport:viewports[0],reducedMotion:'reduce'});
                try {
                    await serve(context);
                    const page=await context.newPage();
                    const issues=[];
                    for(const fixture of examples) {
                        await page.setViewportSize(viewports[0]);
                        await page.goto('https://invidious.test/fixtures/'+fixture+'.html',{waitUntil:'load'});
                        for(const viewport of viewports) {
                            await page.setViewportSize(viewport);
                            const overflow=await geometry(page);
                            if(overflow.length) issues.push({fixture,viewport,overflow});
                            if(images.has(fixture) && viewport.width!==390) {
                                if(fixture==='d3-search-light') await page.locator('#filters-collapse').evaluate(el=>{el.open=true;});
                                if(fixture==='d3-channel-more') await page.locator('.channel-tabs').evaluate(el=>el.scrollIntoView({block:'start'}));
                                if(fixture==='settings-ai-filter') await page.locator('.settings-matrix').evaluate(el=>el.scrollIntoView({block:'start'}));
                                await page.screenshot({path:path.join(artifacts,`${engine}-${fixture}-${viewport.width}x${viewport.height}.png`)});
                            }
                        }
                    }
                    assert.deepEqual(issues,[]);
                } finally { await context.close(); }
            });
            await t.test('ordinary forms, local reading scroller and iframe',async()=>{
                const context=await browser.newContext({viewport:viewports[0],javaScriptEnabled:false,forcedColors:'active'});
                try {
                    await serve(context);
                    const page=await context.newPage();
                    for(const [fixture,target] of [
                        ['d3-search-home-light','.search-home-form button'], ['d3-search-light','#filters-collapse > summary'],
                        ['d4-library-add','form[action*="playlist_ajax"] button'], ['d6-comments-nojs-light','#download-fallback > summary'],
                        ['settings-appearance','.settings-nav a[href*="playback"]'], ['d7-api-login-light','form button[type=submit]'],
                        ['d7-status-licenses-light','.license-table-scroll']
                    ]) {
                        await page.goto('https://invidious.test/fixtures/'+fixture+'.html');
                        const control=page.locator(target).first();
                        assert.equal(await control.isVisible(),true,`${fixture} ${target}`);
                        await control.focus();
                        assert.deepEqual(await geometry(page),[],fixture);
                    }
                    const license=page.locator('.license-table-scroll');
                    assert.equal(await license.evaluate(el=>el.scrollWidth>el.clientWidth),true);
                    for(const viewport of [{width:320,height:180},{width:640,height:360}]) {
                        await page.setViewportSize(viewport);
                        await page.goto('https://invidious.test/framed');
                        const player=page.frameLocator('iframe[title=Player]').locator('#player');
                        assert.equal(await player.isVisible(),true);
                        const box=await player.boundingBox();
                        assert.ok(box.width<=viewport.width && box.height<=viewport.height,JSON.stringify(box));
                    }
                } finally { await context.close(); }
            });
            await t.test('core channel tabs scroll independently of More',async()=>{
                const context=await browser.newContext({viewport:viewports[0],reducedMotion:'reduce'});
                try {
                    await serve(context);
                    const page=await context.newPage();
                    await page.goto('https://invidious.test/fixtures/channel-search-private.html');
                    const strip=page.locator('.channel-core-tabs');
                    const more=page.locator('.channel-more');
                    const selected=strip.locator('[aria-current=page]');
                    assert.equal(await strip.evaluate(el=>el.scrollWidth>el.clientWidth),true);
                    assert.equal(await more.evaluate(el=>!el.closest('.channel-core-tabs')),true);
                    assert.ok(await selected.evaluate(el=>el.getBoundingClientRect().right<=el.parentElement.getBoundingClientRect().right+1));
                    await strip.locator('a').first().focus();
                    assert.ok(await strip.locator('a').first().evaluate(el=>el.getBoundingClientRect().left>=el.parentElement.getBoundingClientRect().left-1));
                    assert.equal(await page.locator('.scoped-search').getAttribute('method'),'post');
                    await more.locator('summary').click();
                    await more.locator('summary[aria-expanded=true]').waitFor();
                    const menu=more.locator('.menu-content');
                    await menu.waitFor();
                    const box=await menu.boundingBox();
                    assert.ok(box.x>=7 && box.x+box.width<=313 && box.y>=7 && box.y+box.height<=561,JSON.stringify(box));
                    await page.keyboard.press('Escape');
                    assert.equal(await more.locator('summary').evaluate(el=>el===document.activeElement),true);
                    assert.deepEqual(await geometry(page),[]);
                } finally { await context.close(); }
            });
            await t.test('stacked settings tables keep named rows and controls',async()=>{
                const context=await browser.newContext({viewport:viewports[0]});
                try {
                    await serve(context);
                    const page=await context.newPage();
                    for(const fixture of ['settings-ai-filter','settings-sponsorblock']) {
                        await page.goto('https://invidious.test/fixtures/'+fixture+'.html');
                        const table=page.getByRole('table');
                        const rows=table.getByRole('row');
                        const row=rows.first();
                        const heading=row.getByRole('rowheader');
                        const field=row.getByRole('combobox');
                        const control=field.first();
                        const label=await control.evaluate(el=>el.labels[0].textContent.trim());
                        assert.ok(await rows.count()>1);
                        assert.ok(label);
                        assert.equal(await row.getByRole('combobox',{name:label,exact:true}).count(),1);
                        assert.ok((await heading.innerText()).trim());
                        const headerBox=await heading.boundingBox(), controlBox=await control.boundingBox();
                        assert.ok(controlBox.y>=headerBox.y+headerBox.height);
                        assert.deepEqual(await geometry(page),[]);
                    }
                } finally { await context.close(); }
            });
            await t.test('RTL, text enlargement, and verification survives rotation',async()=>{
                const context=await browser.newContext({viewport:viewports[0],reducedMotion:'reduce',colorScheme:'dark'});
                try {
                    await serve(context);
                    const page=await context.newPage();
                    await page.goto('https://invidious.test/fixtures/d5-watch-rtl.html');
                    await page.addStyleTag({content:'html {font-size: 150%} body {font-size: 1.25rem}'});
                    assert.equal(await page.locator('html').getAttribute('dir'),'rtl');
                    assert.deepEqual(await geometry(page),[]);
                    await page.screenshot({path:path.join(artifacts,`${engine}-d5-watch-rtl-enlarged-320x568.png`)});
                    await page.goto('https://invidious.test/fixtures/d7-verify-browser-light.html');
                    const frame=page.locator('#turnstile-widget iframe');
                    assert.equal(await frame.getAttribute('width'),'150');
                    await page.setViewportSize(viewports[2]);
                    assert.equal(await frame.getAttribute('width'),'150');
                    assert.equal(await page.evaluate(()=>window.providerRenders),1);
                    assert.deepEqual(await geometry(page),[]);
                } finally { await context.close(); }
            });
        } finally { await browser.close(); }
    });
}
