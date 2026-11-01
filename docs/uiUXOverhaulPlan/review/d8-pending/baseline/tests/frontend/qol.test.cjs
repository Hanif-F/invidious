'use strict';
const {test, before, after} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const playwright = require('playwright');
const root = path.resolve(__dirname, '../..');
const generated = path.join(__dirname, '.generated');
const artifacts = path.join(__dirname, 'artifacts');
const engines = (process.env.FRONTEND_BROWSERS || 'chromium,firefox').split(',');
const browsers = {};
const html = name => fs.readFileSync(path.join(generated, name + '.html'), 'utf8');
const config = source => JSON.parse(source.match(/<script id="ui-config"[^>]*>([\s\S]*?)<\/script>/)[1]);
before(async () => { fs.mkdirSync(artifacts, {recursive: true}); for (const engine of engines) browsers[engine] = await playwright[engine].launch({headless: true}); });
after(async () => { for (const browser of Object.values(browsers)) await browser.close(); });

async function setup(engine, options = {}) {
    const fixture = options.fixture || 'qol-browse';
    const original = html(fixture);
    const scope = JSON.parse(original.match(/<script id="browser-profile"[^>]*>([\s\S]*?)<\/script>/)[1]).scope;
    const context = await browsers[engine].newContext({viewport: {width: options.width || 1440, height: 900}, reducedMotion: 'reduce'});
    if (options.init) await context.addInitScript(options.init);
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    const requests = [], errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await context.route('**/*', async route => {
        const request = route.request(), url = new URL(request.url());
        const record = {url, method: request.method(), body: new URLSearchParams(request.postData() || ''), navigation: request.isNavigationRequest()};
        requests.push(record);
        let reply = options.reply && await options.reply(record);
        if (reply) return route.fulfill(reply);
        if (/^\/(js|css|themes|fonts|videojs|icons)\//.test(url.pathname)) {
            let body;
            if (url.pathname === '/js/player.js' && !options.real) body = `
                window.video_data = JSON.parse(document.getElementById('video_data').textContent);
                window.__events = {}; window.__time = 0; window.__paused = true;
                window.player = {on:(key,fn)=>{(__events[key] ||= []).push(fn)},off:()=>{},trigger:(key)=>(__events[key]||[]).forEach(fn=>fn()),
                currentTime:(value)=>value===undefined?__time:(__time=value),paused:()=>__paused,pause:()=>{__paused=true},
                play:()=>{__paused=false;player.trigger('play');return Promise.resolve()}, muted:()=>true};`;
            else if (url.pathname.startsWith('/videojs/') && !options.real) body = '';
            else if (url.pathname === '/js/silvermine-videojs-quality-selector.min.js' && !options.real) body = '';
            else {
                const file = path.join(root, 'assets', url.pathname);
                if (!fs.existsSync(file)) return route.fulfill({status:404, body:''});
                body = fs.readFileSync(file);
            }
            return route.fulfill({contentType: url.pathname.endsWith('.js') ? 'application/javascript' : url.pathname.endsWith('.css') ? 'text/css' : url.pathname.endsWith('.svg') ? 'image/svg+xml' : 'application/octet-stream', body});
        }
        if (url.pathname.startsWith('/vi/') || url.pathname.startsWith('/ggpht')) return route.fulfill({contentType:'image/svg+xml', body:'<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><path fill="#456" d="M0 0h320v180H0z"/></svg>'});
        if (url.pathname === '/fixture.webm' || url.pathname === '/latest_version') {
            const body = fs.readFileSync(path.join(generated, options.fixture === 'clip-watch' ? 'clip-fixture.webm' : 'fixture.webm'));
            return route.fulfill({contentType:'video/webm', headers:{'accept-ranges':'bytes'}, body});
        }
        if (url.pathname.startsWith('/api/v1/transcripts/')) return route.fulfill({contentType:'application/json', body:JSON.stringify({transcript:{body:[{line:'First line',startMs:0},{line:'Second line',startMs:1000},{line:'Third line',startMs:2000}]}})});
        if (url.pathname === '/video_actions') return route.fulfill({contentType:'application/json', body:JSON.stringify({playlists:[{id:'IVfixture', title:'Saved videos'}],defaultPlaylist:'IVfixture'})});
        if (url.pathname === '/api/v1/auth/playback') return route.fulfill({contentType:'application/json', body:'{"positions":{},"watched":[]}'});
        if (url.pathname === '/api/v1/auth/subscriptions') return route.fulfill({contentType:'application/json', body:'[]'});
        if (url.pathname === '/api/v1/auth/notifications') return route.fulfill({contentType:'text/event-stream', body:': fixture\n\n'});
        if (url.pathname.startsWith('/api/v1/dearrow/')) return route.fulfill({contentType:'application/json', body:'{"title":null}'});
        if (record.navigation || ['/', '/feed/popular', '/preferences', '/watch', '/search', '/playlist', '/feed/history', '/subscription_manager'].includes(url.pathname) && request.method() === 'GET') {
            let source = options.resolve ? options.resolve(record) : fixture;
            if (url.pathname === '/watch') source = options.watchFixture || (options.fixture === 'clip-watch' ? 'clip-watch' : 'watch-single');
            let body = html(source || fixture);
            if (options.document) body = options.document(record, body);
            body = body.replace(/(<script id="browser-profile"[^>]*>)([\s\S]*?)(<\/script>)/, (_, start, json, end) => start + JSON.stringify({...JSON.parse(json),scope}) + end);
            // Playback data remains production-rendered; isolate unrelated queues
            // and comments so each test controls its own network responses.
            body = body.replace(/(<script id="video_data"[^>]*>)([\s\S]*?)(<\/script>)/, (_, start, json, end) => {
                const data = JSON.parse(json); data.plid = null; data.params.comments = ['', ''];
                return start + JSON.stringify(data).replace(/</g,'\\u003c') + end;
            });
            return route.fulfill({contentType:'text/html', headers:{'X-Invidious-Browser-Profile':scope}, body});
        }
        return route.fulfill({contentType:'application/json', body:'{}'});
    });
    await page.goto('https://invidious.test' + (options.path || '/feed/popular'));
    return {page, context, requests, errors};
}
function browseSource(record) {
    return record.url.searchParams.get('page') === '3' ? 'qol-browse-end' : record.url.searchParams.get('page') === '2' ? 'qol-browse-next' : 'qol-browse';
}

// Selection, occurrence ordering and inline library mutations now live in the
// production-template D4 cases in overhaul.test.cjs, including these regressions.
for (const engine of engines) {
    test(`${engine}: QoL appends duplicate occurrences, retries, and initializes new menus`, async () => {
        let fail = true;
        const {page,context,requests,errors} = await setup(engine,{resolve:browseSource,reply:record=>{
            if (!record.navigation && record.url.searchParams.get('page') === '2' && fail) {fail=false;return {status:503,body:''};}
        }});
        await page.getByRole('button',{name:'Load more',exact:true}).click();
        await page.locator('.browse-controls .ui-retry').waitFor();
        assert.equal(await page.locator('[data-browse-items] > .media-item').count(),12);
        await page.locator('.browse-controls .ui-retry').click();
        await page.waitForFunction(()=>document.querySelectorAll('[data-browse-items] > .media-item').length===24);
        const menu = page.locator('[data-browse-items] .video-context').last();
        await menu.locator('summary').click();
        await menu.locator('[data-video-action=playlist]').click();
        await page.locator('#video-playlist-select option').waitFor({state:'attached'});
        await page.keyboard.press('Escape');
        await page.getByRole('button',{name:'Load more',exact:true}).click();
        await page.waitForFunction(()=>document.querySelectorAll('[data-browse-items] > .media-item').length===36);
        assert.equal(await page.getByRole('button',{name:'Load more',exact:true}).isVisible(),false);
        assert.ok(!requests.some(r=>r.url.pathname.includes('/api/v1/search') || r.url.pathname.includes('/api/v1/videos/')));
        assert.deepEqual(errors,[]); await context.close();
    });
    test(`${engine}: QoL Back reconstructs loaded GET pages and scroll`, async () => {
        const {page,context,errors} = await setup(engine,{resolve:browseSource});
        await page.getByRole('button',{name:'Load more',exact:true}).click();
        await page.waitForFunction(()=>document.querySelectorAll('[data-browse-items] > .media-item').length===24);
        await page.evaluate(async()=>{await document.fonts.ready;scrollTo(0,650)});
        await page.goto('https://invidious.test/watch?v=aaaaaaaaaaa');
        await page.goBack();
        await page.waitForFunction(()=>document.querySelectorAll('[data-browse-items] > .media-item').length===24 && scrollY>500);
        assert.deepEqual(errors,[]); await context.close();
    });
    test(`${engine}: QoL serializes opaque continuation tokens without inventing page offsets`, async () => {
        const token='opaque+token/with=padding';
        const {page,context,requests,errors}=await setup(engine,{path:'/feed/popular?sort_by=oldest',resolve:record=>record.url.searchParams.has('continuation')?'qol-browse-end':'qol-browse',document:(record,body)=>{
            if(record.url.searchParams.has('continuation'))return body;
            return body.replaceAll(/href="\/feed\/popular\?[^\"]*page=2"/g,'href="/feed/popular?sort_by=oldest&amp;continuation='+encodeURIComponent(token)+'"');
        }});
        await page.getByRole('button',{name:'Load more',exact:true}).click();
        await page.waitForFunction(()=>document.querySelectorAll('[data-browse-items]>.media-item').length===24);
        const next=requests.find(record=>record.url.searchParams.has('continuation'));
        assert.equal(next.url.searchParams.get('continuation'),token);assert.equal(next.url.searchParams.get('sort_by'),'oldest');assert.equal(next.url.searchParams.has('page'),false);
        assert.deepEqual(errors,[]);await context.close();
    });
    test(`${engine}: QoL private search paginates filtered-empty batches by POST without stored queries`, async () => {
        const {page,context,requests,errors} = await setup(engine,{fixture:'qol-search-true-1',path:'/search',reply:record=>{
            if (record.method==='POST' && record.url.pathname==='/search') return {contentType:'text/html',body:html('qol-search-true-'+(record.body.get('page')||'1'))};
        }});
        await page.getByRole('button',{name:'Load more',exact:true}).click();
        await page.waitForFunction(()=>document.querySelector('[data-browse-region]').getAttribute('aria-busy')==='false');
        assert.equal(await page.locator('[data-browse-items] > .media-item').count(),1);
        assert.equal(await page.getByRole('button',{name:'Load more',exact:true}).isVisible(),true);
        await page.getByRole('button',{name:'Load more',exact:true}).click();
        await page.waitForFunction(()=>document.querySelectorAll('[data-browse-items] > .media-item').length===2);
        await page.locator('#searchbox').fill('private draft');
        await page.waitForTimeout(300);
        assert.ok(!requests.some(r=>r.url.pathname.includes('suggestions') || (r.method==='GET' && r.url.searchParams.has('q'))));
        assert.equal(new URL(page.url()).search,'');
        assert.equal(await page.evaluate(()=>InvidiousStorage.session.get('browse_state')),undefined);
        assert.deepEqual(errors,[]); await context.close();
    });
    test(`${engine}: QoL Apply filters navigates normally and keeps typing local`, async () => {
        const {page,context,requests,errors} = await setup(engine,{fixture:'qol-search-false-1',path:'/search?q=light',resolve:()=> 'qol-search-false-1'});
        await page.locator('#filters-collapse').evaluate(element=>element.open=true);
        await page.locator('#filter-duration-long').check();
        const navigationCount=requests.filter(r=>r.navigation).length;
        await page.locator('#filters-apply button').click();
        await page.waitForURL(url=>url.searchParams.get('duration')==='long');
        assert.equal(requests.filter(r=>r.navigation).length,navigationCount+1);
        await page.locator('#searchbox').fill('draft only');
        await page.waitForTimeout(300);
        assert.ok(!requests.some(r=>r.url.pathname.includes('suggestions')));
        assert.deepEqual(errors,[]); await context.close();
    });
    test(`${engine}: QoL settings search preserves fields, previews, discards, and retains failed edits`, async () => {
        const {page,context,requests,errors} = await setup(engine,{fixture:'preferences',path:'/preferences',reply:record=>record.method==='POST'&&record.url.pathname==='/preferences'?{status:503,body:'{}'}:null});
        await page.locator('#dark_mode').selectOption('light');
        await page.locator('#ui_density').selectOption('compact');
        assert.equal(await page.locator('body').getAttribute('data-density'),'compact');
        await page.locator('#preferences-search').fill('autoplay');
        assert.equal(await page.locator('#preferences-appearance').isVisible(),false);
        assert.equal(await page.locator('#dark_mode').isEnabled(),true);
        await page.getByRole('button',{name:'Save preferences',exact:true}).click();
        await page.waitForFunction(()=>document.getElementById('preferences-status').textContent.includes('Could not'));
        const post=requests.find(r=>r.method==='POST'&&r.url.pathname==='/preferences');
        assert.equal(post.body.get('dark_mode'),'light'); assert.equal(post.body.get('ui_density'),'compact');
        await page.getByRole('button',{name:'Discard changes',exact:true}).click();
        assert.equal(await page.locator('body').getAttribute('data-density'),'balanced');
        assert.equal(await page.locator('#dark_mode').inputValue(),'dark');
        await page.getByRole('button',{name:'Clear search',exact:true}).click();
        await page.setViewportSize({width:320,height:700});
        await page.evaluate(()=>document.documentElement.style.fontSize='200%');
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
        await page.screenshot({path:path.join(artifacts,`${engine}-qol-preferences-320-enlarged.png`)});
        assert.deepEqual(errors,[]); await context.close();
    });
    test(`${engine}: QoL preferences accept canonical saves and clear the dirty state`, async () => {
        const canonical=html('preferences-diary'); const saved=config(canonical);
        let posted=false;
        const {page,context,errors} = await setup(engine,{fixture:'preferences',path:'/preferences',reply:record=>{
            if(record.url.pathname==='/preferences'&&record.method==='POST'){posted=true;return {contentType:'application/json',body:JSON.stringify({preferences:{locale:'en-US',dark_mode:'light'},fingerprint:saved.fingerprint})};}
            if(posted&&record.url.pathname==='/preferences'&&record.method==='GET') return {contentType:'text/html',body:canonical};
        }});
        await page.locator('#dark_mode').selectOption('light');
        await page.getByRole('button',{name:'Save preferences',exact:true}).click();
        await page.waitForFunction(()=>document.getElementById('preferences-status').textContent==='Saved');
        assert.equal(await page.getByRole('button',{name:'Save preferences',exact:true}).isDisabled(),true);
        assert.equal(await page.locator('#dark_mode').inputValue(),'light');
        assert.deepEqual(errors,[]); await context.close();
    });
    test(`${engine}: QoL unconfirmed cookie saves keep the draft unsaved`, async () => {
        const {page,context,errors}=await setup(engine,{fixture:'preferences',path:'/preferences',reply:record=>record.method==='POST'&&record.url.pathname==='/preferences'?{
            contentType:'application/json',body:JSON.stringify({preferences:{locale:'en-US',dark_mode:'light'},fingerprint:config(html('preferences-diary')).fingerprint})
        }:null});
        await page.locator('#dark_mode').selectOption('light');
        await page.getByRole('button',{name:'Save preferences',exact:true}).click();
        await page.waitForFunction(()=>document.getElementById('preferences-status').textContent.includes('Could not'));
        assert.equal(await page.locator('#dark_mode').inputValue(),'light');
        assert.equal(await page.getByRole('button',{name:'Save preferences',exact:true}).isEnabled(),true);
        assert.deepEqual(errors,[]);await context.close();
    });
    test(`${engine}: QoL preferences reveal invalid settings hidden by search`, async () => {
        const {page,context,requests,errors}=await setup(engine,{fixture:'preferences-admin',path:'/preferences'});
        await page.locator('#max_results').fill('1.5');
        await page.locator('#preferences-search').fill('autoplay');
        assert.equal(await page.locator('#preferences-library').isVisible(),false);
        await page.getByRole('button',{name:'Save preferences',exact:true}).click();
        assert.equal(await page.locator('#preferences-library').isVisible(),true);
        assert.equal(await page.locator('#max_results').inputValue(),'1.5');
        assert.equal(await page.locator('#max_results').evaluate(el=>el===document.activeElement),true);
        assert.ok(!requests.some(r=>r.method==='POST'&&r.url.pathname==='/preferences'));
        assert.deepEqual(errors,[]);await context.close();
    });
    test(`${engine}: QoL real player docks without replacement or state loss`, async () => {
        const {page,context,requests,errors} = await setup(engine,{fixture:'watch-single',path:'/watch?v=aaaaaaaaaaa',real:true});
        await page.waitForFunction(()=>window.player&&typeof player.play==='function');
        await page.addStyleTag({content:'.watch-primary{min-height:2200px}'});
        await page.evaluate(()=>{InvidiousStorage.local.set('player_dock_enabled',true);player.trigger('dockpreferencechange');});
        await page.evaluate(async()=>{window.__originalPlayer=player;player.loop(true);player.muted(true);player.playbackRate(.5);await player.play();});
        await page.evaluate(()=>scrollTo(0,1000));
        await page.waitForFunction(()=>document.querySelector('.watch-player').classList.contains('is-docked'));
        assert.equal(await page.evaluate(()=>player===window.__originalPlayer&&player.playbackRate()===.5&&!player.paused()),true);
        await page.evaluate(()=>document.documentElement.dir='rtl');
        const rtlVideo=await page.locator('#player-container').boundingBox(),rtlControls=await page.locator('.dock-controls').boundingBox();
        assert.ok(Math.abs(rtlVideo.x-rtlControls.x)<=1&&Math.abs(rtlVideo.x-24)<=1);
        await page.screenshot({path:path.join(artifacts,`${engine}-qol-dock-rtl.png`)});
        await page.evaluate(()=>document.documentElement.dir='ltr');
        await page.locator('main').focus();
        await page.keyboard.press('f');
        await page.waitForFunction(()=>document.fullscreenElement!==null);
        await page.waitForFunction(()=>!document.querySelector('.watch-player').classList.contains('is-docked'));
        await page.evaluate(()=>document.exitFullscreen());
        await page.evaluate(()=>scrollTo(0,1000));
        await page.waitForFunction(()=>document.querySelector('.watch-player').classList.contains('is-docked'));
        await page.evaluate(()=>{player.currentTime(.5);player.addTextTrack('captions','Fixture captions','en').mode='showing'});
        await page.waitForFunction(()=>player.currentTime()>=.5);
        await page.evaluate(()=>player.refreshBuffer());
        await page.waitForFunction(()=>player.readyState()>0&&player.currentTime()>=.5);
        assert.equal(await page.evaluate(()=>Array.from(player.textTracks()).some(track=>track.label==='Fixture captions'&&track.mode==='showing')),true);
        await page.setViewportSize({width:390,height:900});
        await page.waitForFunction(()=>!document.querySelector('.watch-player').classList.contains('is-docked'));
        await page.setViewportSize({width:1440,height:900});
        await page.evaluate(()=>scrollTo(0,1000));
        await page.waitForFunction(()=>document.querySelector('.watch-player').classList.contains('is-docked'));
        await page.getByRole('button',{name:'Dismiss mini player',exact:true}).click();
        assert.equal(await page.evaluate(()=>player.paused()),false);
        await page.evaluate(()=>scrollTo(0,1100));
        assert.equal(await page.locator('.watch-player').evaluate(el=>el.classList.contains('is-docked')),false);
        await page.screenshot({path:path.join(artifacts,`${engine}-qol-watch.png`)});
        assert.deepEqual(errors,[]); await context.close();
    });
    test(`${engine}: QoL transcript highlights playback and manual search disables following`, async () => {
        const {page,context,errors} = await setup(engine,{fixture:'watch-single',path:'/watch?v=aaaaaaaaaaa'});
        await page.getByRole('tab',{name:'Transcript',exact:true}).click();
        await page.locator('.transcript-line').first().waitFor();
        await page.evaluate(()=>{player.currentTime(1.5);player.trigger('timeupdate')});
        assert.match(await page.locator('.transcript-line.is-active').textContent(),/Second line/);
        await page.locator('#transcript-search').fill('Third');
        assert.equal(await page.getByLabel('Follow playback').isChecked(),false);
        assert.deepEqual(errors,[]);await context.close();
    });
    test(`${engine}: QoL failed replies preserve their controls and retry successfully`, async () => {
        let calls=0;
        const {page,context,errors}=await setup(engine,{fixture:'d6-comments-light',watchFixture:'d6-comments-light',path:'/watch?v=aaaaaaaaaaa',reply:record=>{
            if(!record.url.pathname.startsWith('/api/v1/comments/'))return;
            if(!record.url.searchParams.has('continuation'))return {contentType:'application/json',body:fs.readFileSync(path.join(generated,'d6-comments-page.json'))};
            calls++;return {status:calls===1?503:200,contentType:'application/json',body:JSON.stringify({contentHtml:'<p>Loaded reply</p>'})};
        }});
        const owner=page.locator('[data-comment-id=post-a] [data-comment-replies]');
        await owner.locator('[data-load-replies]').click();
        await owner.locator('.thread-status .ui-retry').click();
        await page.getByText('Loaded reply',{exact:true}).waitFor();
        assert.equal(calls,2);assert.deepEqual(errors,[]);await context.close();
    });
    test(`${engine}: QoL docking preserves native clip boundaries`, async () => {
        const {page,context,errors}=await setup(engine,{fixture:'clip-watch',path:'/watch?v=2isYuQZMbdU',real:true});
        await page.waitForFunction(()=>window.player&&typeof player.play==='function');
        await page.addStyleTag({content:'.watch-primary{min-height:2200px}'});
        await page.evaluate(()=>{InvidiousStorage.local.set('player_dock_enabled',true);player.trigger('dockpreferencechange');});
        await page.evaluate(async()=>{player.muted(true);await player.play()});
        await page.evaluate(()=>scrollTo(0,1000));
        await page.waitForFunction(()=>document.querySelector('.watch-player').classList.contains('is-docked'));
        await page.evaluate(()=>player.currentTime(video_data.clip.endTime+10));
        await page.waitForFunction(()=>player.currentTime()>=video_data.clip.startTime&&player.currentTime()<=video_data.clip.endTime+.02);
        await page.getByRole('button',{name:'Return to player',exact:true}).click();
        assert.equal(await page.locator('.watch-player').evaluate(el=>el.classList.contains('is-docked')),false);
        assert.deepEqual(errors,[]);await context.close();
    });
    test(`${engine}: QoL header navigation, shortcuts and desktop widths remain accessible`, async () => {
        const {page,context,errors} = await setup(engine);
        await page.locator('#sidebar-toggle').click();
        assert.equal(await page.locator('body').getAttribute('data-nav-collapsed'),'true');
        await page.locator('main').focus();await page.keyboard.press('?');
        assert.equal(await page.locator('#shortcut-help').isVisible(),true);
        await page.keyboard.press('Escape');
        for(const width of [1280,1440,1920]){
            await page.setViewportSize({width,height:900});
            assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
            await page.screenshot({path:path.join(artifacts,`${engine}-qol-browse-${width}.png`)});
        }
        assert.deepEqual(errors,[]);await context.close();
    });
}
