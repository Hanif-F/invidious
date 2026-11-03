'use strict';
const {test,before,after} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const playwright = require('playwright');
const {runtimeOwner}=require('./runtime-owner.cjs');
const root=path.resolve(__dirname,'../..'), generated=process.env.FRONTEND_FIXTURES || path.join(__dirname,'.generated'), artifacts=path.join(__dirname,'artifacts','overhaul');
const engines=(process.env.FRONTEND_BROWSERS || 'chromium,firefox').split(','), browsers={},observations=[];
before(async()=>{fs.mkdirSync(artifacts,{recursive:true});for(const engine of engines)browsers[engine]=await playwright[engine].launch({headless:true});});
after(async()=>{for(const browser of Object.values(browsers))await browser.close();fs.writeFileSync(path.join(artifacts,'requests.json'),JSON.stringify({scope:'Synthetic D1–D6 desktop fixture requests, including intercepted metadata/media; not deployed-server measurements.',observations},null,2)+'\n');});
function savedPlaylistOrder(entry, order, offset=0, total=order.length) {
    const source=entry.body.get('source'),anchor=entry.body.get('anchor');
    order.splice(order.indexOf(source),1); order.splice(order.indexOf(anchor)+(entry.body.get('placement')==='after'?1:0),0,source);
    return JSON.stringify({positions:Object.fromEntries(order.map((id,index)=>[id,offset+index+1])),total,countText:`${total} videos`});
}
function watchQueueSnapshot(removed) {
    const value=JSON.parse(fs.readFileSync(path.join(generated,removed?`queue-removed-${removed}.json`:'queue-editable.json')));
    const rows=Array.from(value.playlistHtml.matchAll(/<li[^>]*data-index="([0-9]+)"[^>]*data-occurrence="([0-9]+)"/g));
    return {...value,positions:Object.fromEntries(rows.map(row=>[row[2],Number(row[1])+1])),total:rows.length,currentOccurrence:'9007199254740995',currentRemoved:removed==='current'};
}
// Deliberately ignore AbortSignal so lifetime tests prove stale responses are
// rejected even when cancellation races a completed server-side mutation.
function holdPlaylistWrites() {
    const original=window.fetch.bind(window);window.delayedPlaylistWrites=[];
    window.fetch=(url,options={})=>{
        const target=new URL(url,location.href);
        if(target.pathname!=='/playlist_ajax')return original(url,options);
        const fields=new URLSearchParams(options.body),order=Array.from(document.querySelectorAll('[data-occurrence]'),row=>row.dataset.occurrence);
        if(target.searchParams.get('action')==='move_video_before') {
            const source=fields.get('source'),anchor=fields.get('anchor');order.splice(order.indexOf(source),1);order.splice(order.indexOf(anchor)+(fields.get('placement')==='after'?1:0),0,source);
        }
        const data=target.searchParams.get('action')==='move_video_before'?{positions:Object.fromEntries(order.map((id,i)=>[id,101+i])),total:205,countText:'205 videos'}:{};
        return new Promise(resolve=>delayedPlaylistWrites.push({url:target.href,body:fields.toString(),release:()=>resolve(new Response(JSON.stringify(data),{status:200,headers:{'Content-Type':'application/json'}}))}));
    };
}
async function setup(engine,screen,mode='light',options={}) {
    const fixture=options.fixture || `overhaul-${screen}-${mode}`;
    const context=await browsers[engine].newContext({viewport:{width:options.width||1440,height:options.height||900},colorScheme:mode==='dark'?'dark':'light',reducedMotion:'reduce',javaScriptEnabled:options.javascript!==false});
    if(options.init)await context.addInitScript(options.init);
    const page=await context.newPage(),requests=[],errors=[];
    page.setDefaultTimeout(10000);
    page.on('pageerror',error=>errors.push(error.message));
    await context.route('**/*',async route=>{
        const req=route.request(),url=new URL(req.url()),entry={url,method:req.method(),navigation:req.isNavigationRequest(),body:new URLSearchParams(req.postData()||''),raw:req.postData()||'',headers:req.headers()};requests.push(entry);
        const response=options.reply&&await options.reply(entry);if(response)return response.abort?route.abort(response.abort):route.fulfill(response);
        if(url.pathname==='/preferences'&&url.searchParams.get('format')==='runtime') {
            const owner=runtimeOwner(fs.readFileSync(path.join(generated,fixture+'.html'),'utf8'),generated);
            return route.fulfill({status:owner?200:503,contentType:'application/json',body:JSON.stringify(owner||{error:'Fixture owner unavailable'})});
        }
        if(/^\/(js|css|icons|videojs|themes|fonts)\//.test(url.pathname)) {
            const file=path.join(root,'assets',url.pathname);
            if(!fs.existsSync(file))return route.fulfill({status:404,body:''});
            return route.fulfill({contentType:url.pathname.endsWith('.js')?'application/javascript':url.pathname.endsWith('.css')?'text/css':url.pathname.endsWith('.svg')?'image/svg+xml':'application/octet-stream',body:fs.readFileSync(file)});
        }
        if(url.pathname.startsWith('/api/manifest/dash/'))return route.fulfill({contentType:'application/dash+xml',body:fs.readFileSync(path.join(generated,'watch-media','manifest.mpd'))});
        if(url.pathname.startsWith('/d5-media/'))return route.fulfill({contentType:url.pathname.endsWith('.mpd')?'application/dash+xml':'video/mp4',body:fs.readFileSync(path.join(generated,'watch-media',path.basename(url.pathname)))});
        if(url.pathname==='/latest_version'&&['139','140'].includes(url.searchParams.get('itag')))return route.fulfill({contentType:'audio/mp4',body:fs.readFileSync(path.join(generated,'watch-media','audio.m4a'))});
        if(url.pathname==='/latest_version'&&url.searchParams.get('itag')==='44')return route.fulfill({contentType:'video/webm',headers:{'accept-ranges':'bytes'},body:fs.readFileSync(path.join(generated,'watch-media','large.webm'))});
        if(url.pathname==='/latest_version'&&fixture.includes('-portrait-'))return route.fulfill({contentType:'video/webm',body:fs.readFileSync(path.join(generated,'watch-media','portrait.webm'))});
        if(url.pathname==='/fixture.webm'||url.pathname==='/latest_version')return route.fulfill({contentType:'video/webm',headers:{'accept-ranges':'bytes'},body:fs.readFileSync(path.join(generated,'fixture.webm'))});
        if(url.pathname.startsWith('/vi/')||url.pathname.startsWith('/ggpht')) {
            const avatar=url.pathname.startsWith('/ggpht');
            const n=Array.from(url.pathname).reduce((a,c)=>a+c.charCodeAt(0),0)%5;
            const colors=['#607789','#7b7770','#627e75','#748093','#8c7b71'];
            return route.fulfill({contentType:'image/svg+xml',body:`<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180" viewBox="0 0 320 180"><path fill="${colors[n]}" d="M0 0h320v180H0z"/><circle fill="#e4dfcf" opacity=".7" cx="${avatar?160:230}" cy="${avatar?90:50}" r="${avatar?55:25}"/><path fill="#283c44" opacity=".55" d="M0 155L105 54l103 100 54-43 58 50v19H0z"/></svg>`});
        }
        if(['/invidious-colored-vector.svg','/hashtag.svg'].includes(url.pathname))return route.fulfill({contentType:'image/svg+xml',body:fs.readFileSync(path.join(root,'assets',url.pathname))});
        if(url.pathname==='/api/v1/auth/subscriptions')return route.fulfill({contentType:'application/json',body:'[]'});
        if(url.pathname==='/api/v1/playlists/PLfixture')return route.fulfill({contentType:'application/json',body:fs.readFileSync(path.join(generated,'queue.json'))});
        if(url.pathname.startsWith('/api/v1/transcripts/'))return route.fulfill({contentType:'application/json',body:JSON.stringify({transcript:{body:[{line:'First line',startMs:0},{line:'Second line',startMs:1000}]}})});
        if(url.pathname.startsWith('/embed/'))return route.fulfill({contentType:'text/html',body:'<!doctype html><html><body><video controls></video></body></html>'});
        if(req.isNavigationRequest())return route.fulfill({contentType:'text/html',body:fs.readFileSync(path.join(generated,fixture+'.html'))});
        return route.fulfill({contentType:'application/json',body:'{}'});
    });
    await page.goto('https://invidious.test'+(options.url || ({browse:'/feed/popular',watch:'/watch?v=2isYuQZMbdU&list=PLfixture&index=2',playlist:'/playlist?list=IVfixture',settings:'/preferences?section=appearance'}[screen])));
    if(options.javascript!==false)await page.waitForFunction(()=>document.body.dataset.uiInitialized==='true');
    if(screen === 'watch'&&options.javascript!==false) await page.evaluate(()=>player.load());
    return {page,context,requests,errors};
}
for(const engine of engines) {
    test(`${engine}: D1 representative light/dark desktop matrix`,async()=>{
        for(const screen of ['browse','watch','playlist','settings'])for(const mode of ['light','dark']) {
            const {page,context,requests,errors}=await setup(engine,screen,mode);
            assert.equal(await page.locator('body').getAttribute('class'),mode+'-theme');
            if(screen==='watch')await page.waitForFunction(()=>window.player&&player.readyState()>0);
            for(const [width,height]of[[1280,720],[1440,900],[1920,1080]]) {
                await page.setViewportSize({width,height});
                assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,`${screen} ${mode} ${width} overflow`);
                assert.equal(await page.locator('#sidebar-toggle').count(),1);
                assert.equal(await page.locator('nav.app-sidebar').count(),1);
                assert.equal(await page.locator('#notification_ticker').count(),0);
                if(screen==='playlist')assert.equal(await page.locator('.sidebar-link[href="/feed/playlists"]').getAttribute('aria-current'),'page');
                const boxes=await page.locator('.media-item').evaluateAll(items=>items.map(i=>i.getBoundingClientRect().width));
                if(screen==='browse')assert.ok(boxes.every(width=>width>=240));
                assert.equal(await page.locator('.media-item .thumbnail').evaluateAll(nodes=>nodes.filter(node=>node.getClientRects().length).every(node=>{const r=node.getBoundingClientRect();return Math.abs(r.width/r.height-16/9)<.02;})),true,'visible thumbnail aspect ratios');
                await page.screenshot({path:path.join(artifacts,`${engine}-${screen}-${mode}-${width}.png`)});
            }
            observations.push({engine,screen,mode,requests:requests.length,styles:requests.filter(r=>r.url.pathname.endsWith('.css')).length,scripts:requests.filter(r=>r.url.pathname.endsWith('.js')).length,sprites:requests.filter(r=>r.url.pathname.startsWith('/icons/')).length});
            assert.deepEqual(errors,[],`${screen}: JavaScript errors`);
            assert.ok(!requests.some(r=>/\/themes\/|ionicons|pure-min|grids-responsive/.test(r.url.pathname)));
            assert.ok(requests.filter(r=>r.url.pathname.startsWith('/icons/')).length<=1,'one cached icon sprite');
            await context.close();
        }
    });
    test(`${engine}: D1 RTL, enlarged desktop text, forced colors and contrast`,async()=>{
        for(const screen of ['browse','watch','playlist','settings']) {
            const{page,context,errors}=await setup(engine,screen,'rtl',{width:1280,height:720});
            assert.equal(await page.locator('html').getAttribute('dir'),'rtl');
            await page.addStyleTag({content:'body{font-size:20px}.media-title,h3{font-size:20px}.muted,.media-meta,.sidebar-link,.button{font-size:17.5px}h1{font-size:30px}'});
            await page.locator('.media-title').evaluateAll(elements=>elements.forEach((e,i)=>{if(i===0)e.append(' — A long multilingual title with words العربية 日本語 that must wrap and stay readable');}));
            await page.locator('.channel-attribution>span[dir]').evaluateAll(elements=>elements.forEach((e,i)=>{if(i===0)e.textContent='A very long creator name '+ 'LongUnbrokenCreator'.repeat(12);}));
            assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,screen+' RTL/enlarged overflow');
            assert.equal(await page.locator('.header-search input').evaluate(e=>{let r=e.getBoundingClientRect(),h=document.querySelector('.app-header').getBoundingClientRect();return r.top>=h.top+3&&r.bottom<=h.bottom-3;}),true,'enlarged search fits header');
            await page.screenshot({path:path.join(artifacts,`${engine}-${screen}-rtl-enlarged.png`)});
            await page.emulateMedia({forcedColors:'active'});
            await page.locator('#sidebar-toggle').focus();
            assert.equal(await page.locator('#sidebar-toggle').evaluate(e=>getComputedStyle(e).outlineStyle!=='none'),true);
            await page.screenshot({path:path.join(artifacts,`${engine}-${screen}-forced-colors.png`)});
            assert.deepEqual(errors,[]);await context.close();
        }
        for(const mode of ['light','dark']) {
            const{page,context}=await setup(engine,'browse',mode);
            const colors=await page.locator('body').evaluate(e=>{let style=getComputedStyle(e);return Object.fromEntries(['page','surface','raised','text','muted','border','accent','accent-text','selection','focus'].map(key=>[key,style.getPropertyValue('--'+key).trim()]));});
            for(const [fg,bg,min]of[['text','page',4.5],['muted','page',4.5],['muted','surface',4.5],['accent','selection',4.5],['accent-text','accent',4.5],['border','page',3],['focus','page',3]])assert.ok(contrast(colors[fg],colors[bg])>=min,`${mode} ${fg}/${bg}`);
            await context.close();
        }
    });
    test(`${engine}: D1 shell menus, collapse, watch drawer and focus`,async()=>{
        const browsing=await setup(engine,'browse');const{page,context}=browsing;
        await page.locator('#sidebar-toggle').click();assert.equal(await page.locator('body').getAttribute('data-nav-collapsed'),'true');
        await page.reload();assert.equal(await page.locator('#sidebar-toggle').getAttribute('aria-expanded'),'false');
        const summary=page.locator('.header-account>summary');await summary.focus();await page.keyboard.press('ArrowDown');
        assert.equal(await page.locator('.header-account').getAttribute('open'),'');assert.equal(await page.evaluate(()=>document.activeElement.textContent.trim()),'Log in');
        await page.keyboard.press('Escape');await assertFocus(page,'.header-account>summary');
        await page.locator('.app-footer [data-shortcut-help]').click();await page.locator('#shortcut-help').waitFor({state:'visible'});
        await page.keyboard.press('Escape');await assertFocus(page,'.app-footer [data-shortcut-help]');
        await summary.click();await page.locator('h1').click();assert.equal(await page.locator('.header-account').getAttribute('open'),null);
        assert.deepEqual(browsing.errors,[]);await context.close();
        const watching=await setup(engine,'watch');await watching.page.locator('#sidebar-toggle').click();
        assert.equal(await watching.page.locator('body').getAttribute('data-nav-drawer'),'true');
        await watching.page.keyboard.press('Escape');await assertFocus(watching.page,'#sidebar-toggle');
        await watching.page.locator('#sidebar-toggle').click();await watching.page.locator('.nav-scrim').click({position:{x:500,y:100}});
        assert.equal(await watching.page.locator('#sidebar-toggle').getAttribute('aria-expanded'),'false');
        assert.deepEqual(watching.errors,[]);await watching.context.close();
    });
    test(`${engine}: D1 actual player survives tab changes and transcript is deferred`,async()=>{
        const{page,context,requests,errors}=await setup(engine,'watch');
        await page.waitForFunction(()=>window.player&&player.readyState()>0);
        await page.evaluate(()=>{window.originalMedia=player.tech(true).el();player.pause();player.currentTime(1);player.playbackRate(1.5);player.volume(.4);});
        assert.ok(!requests.some(r=>r.url.pathname==='/js/transcript.js'));
        await page.getByRole('tab',{name:'Transcript',exact:true}).click();
        await page.waitForFunction(()=>document.querySelectorAll('.transcript-line').length>0);
        assert.equal(await page.evaluate(()=>player.tech(true).el()===originalMedia),true);
        assert.equal(await page.locator('video').count(),1);
        await page.getByRole('tab',{name:'Transcript',exact:true}).press('ArrowRight');
        assert.equal(await page.getByRole('tab',{name:'Up next',exact:true}).getAttribute('aria-selected'),'true');
        assert.equal(await page.evaluate(()=>player.tech(true).el()===originalMedia),true);
        assert.equal(await page.locator('video').count(),1);
        assert.equal(requests.filter(r=>r.url.pathname==='/js/transcript.js').length,1);
        assert.ok(Math.abs(await page.evaluate(()=>player.currentTime())-1)<.1);
        await page.waitForFunction(()=>player.playbackRate()===1.5);
        assert.ok(Math.abs(await page.evaluate(()=>player.volume())-.4)<.01);
        assert.equal(await page.evaluate(()=>player.paused()),true);
        assert.deepEqual(errors,[]);await context.close();
    });
    test(`${engine}: desktop menus contain long labels and reposition after live content changes`,async()=>{
        for(const mode of ['light','dark','rtl']) {
            const {page,context,errors}=await setup(engine,'browse',mode,{width:1280,height:720});
            const menu=page.locator('.header-account'),panel=menu.locator('.menu-content');
            await menu.locator('summary').click();
            const originalWidth=(await panel.boundingBox()).width;
            await menu.locator('a').first().evaluate(element=>element.append(' '+ 'LongUnbrokenUsername'.repeat(15)));
            await menu.locator('a[href="/preferences?section=appearance"]').evaluate(element=>element.append(' '+ 'LongTranslatedAction'.repeat(8)));
            await page.waitForFunction(()=>{
                const panel=document.querySelector('.header-account .menu-content'),r=panel.getBoundingClientRect();
                return r.left>=8&&r.right<=innerWidth-8&&r.top>=8&&r.bottom<=innerHeight-8&&panel.scrollWidth<=panel.clientWidth+1;
            });
            assert.ok((await panel.boundingBox()).width>originalWidth,'live growth was positioned');
            assert.equal(await panel.locator('a,button').evaluateAll(elements=>elements.every(element=>getComputedStyle(element).justifyContent==='flex-start')),true,'links and buttons share the same alignment');
            await page.setViewportSize({width:1920,height:1080});
            await page.setViewportSize({width:1280,height:720});
            await page.screenshot({path:path.join(artifacts,`${engine}-desktop-menu-long-${mode}.png`)});
            await page.keyboard.press('End');await assertFocus(page,'.header-account a[href="/preferences?section=appearance"]');
            await page.keyboard.press('Home');await assertFocus(page,'.header-account .menu-content a:first-child');
            await page.keyboard.press('Escape');await assertFocus(page,'.header-account>summary');
            assert.deepEqual(errors,[]);await context.close();
        }
    });
    test(`${engine}: desktop watch drawer contains focus, wraps labels and restores the page`,async()=>{
        const {page,context,errors}=await setup(engine,'watch','light',{width:1280,height:720});
        await page.locator('.sidebar-link span').first().evaluate(element=>element.textContent='A longer navigation translation that must wrap correctly');
        await page.addStyleTag({content:'.sidebar-link{font-size:20px}'});
        await page.evaluate(()=>{window.drawerMedia=player.tech(true).el();document.querySelector('.app-footer').inert=true;});
        await page.locator('#sidebar-toggle').focus();await page.keyboard.press('Enter');
        await assertFocus(page,'.sidebar-link:first-child');
        assert.equal(await page.locator('.app-sidebar').evaluate(element=>element.scrollWidth<=element.clientWidth+1),true);
        assert.equal(await page.locator('.app-main').evaluate(element=>element.inert),true);
        await page.locator('#searchbox').evaluate(element=>element.focus());
        await assertFocus(page,'.sidebar-link:first-child');
        await page.keyboard.press('Shift+Tab');await assertFocus(page,'#sidebar-toggle');
        await page.keyboard.press('Shift+Tab');await assertFocus(page,'.sidebar-settings');
        await page.keyboard.press('Tab');await assertFocus(page,'#sidebar-toggle');
        await page.keyboard.press('Tab');await assertFocus(page,'.sidebar-link:first-child');
        await page.screenshot({path:path.join(artifacts,`${engine}-desktop-drawer-long-label.png`)});
        await page.keyboard.press('Escape');await assertFocus(page,'#sidebar-toggle');
        assert.equal(await page.locator('.app-main').evaluate(element=>element.inert),false);
        assert.equal(await page.locator('.app-footer').evaluate(element=>element.inert),true,'existing inert state is retained');
        await page.locator('#searchbox').focus();await assertFocus(page,'#searchbox');
        await page.locator('#sidebar-toggle').click();await page.locator('.nav-scrim').click({position:{x:500,y:100}});
        await assertFocus(page,'#sidebar-toggle');
        assert.equal(await page.evaluate(()=>player.tech(true).el()===drawerMedia),true);
        assert.deepEqual(errors,[]);await context.close();
    });
    test(`${engine}: shell fallback hides unavailable controls and retains ordinary navigation`,async()=>{
        for(const failure of ['disabled','unavailable']) {
            let unavailable=false;
            const {page,context,requests,errors}=await setup(engine,'browse','light',{
                javascript:failure!=='disabled',
                reply:entry=>unavailable&&entry.url.pathname==='/js/overhaul.js'?{status:503,body:''}:null
            });
            if(failure==='unavailable') { unavailable=true; await page.reload(); }
            assert.equal(await page.locator('#sidebar-toggle').isVisible(),false);
            await page.locator('.header-account>summary').click();
            assert.equal(await page.locator('[data-shortcut-help]').isVisible(),false);
            assert.equal(await page.locator('.header-account a[href="/preferences?section=appearance"]').isVisible(),true);
            assert.equal(await page.locator('#toggle_theme').isEnabled(),true);
            await page.locator('.header-account>summary').click();
            await page.locator('.sidebar-link[href="/feed/trending"]').click();
            await page.waitForURL('**/feed/trending');
            assert.equal(requests.filter(entry=>entry.method==='POST').length,0);
            assert.deepEqual(errors,[]);await context.close();
        }
    });
    test(`${engine}: desktop header shows the selected icon-only color mode with and without JavaScript`,async()=>{
        for(const javascript of [true,false])for(const mode of ['light','dark','system']) {
            const {page,context,errors}=await setup(engine,'browse',mode,{javascript});
            const toggle=page.locator('#toggle_theme');
            assert.equal((await toggle.textContent()).trim(),'');
            assert.equal(await toggle.getAttribute('title'),await toggle.getAttribute('data-mode-'+mode));
            assert.equal(await toggle.getAttribute('aria-label'),await toggle.getAttribute('title'));
            assert.ok(await toggle.evaluate(el=>el.getBoundingClientRect().right<=document.querySelector('.header-account').getBoundingClientRect().left));
            assert.equal(await page.locator('.header-account #toggle_theme,.header-account [data-shortcut-help],.header-account a[href="/token_manager"],.header-account a[href="/admin/settings"]').count(),0);
            assert.equal(await page.locator('.app-footer [data-shortcut-help] svg').count(),0);
            if(javascript) {
                for(const next of ['dark','','light']) {
                    await page.evaluate(mode=>setTheme(mode),next);
                    const expected=await toggle.getAttribute('data-mode-'+(next||'system'));
                    assert.equal(await toggle.getAttribute('title'),expected);
                    assert.equal(await toggle.getAttribute('aria-label'),expected);
                }
            }
            assert.deepEqual(errors,[]);await context.close();
        }
    });
    test(`${engine}: D1 appearance preview/Discard and live System mode`,async()=>{
        const{page,context,requests,errors}=await setup(engine,'settings','system');
        await page.emulateMedia({colorScheme:'dark'});assert.equal(await page.locator('body').evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(16, 17, 20)');
        await page.emulateMedia({colorScheme:'light'});assert.equal(await page.locator('body').evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(255, 255, 255)');
        await page.locator('#setting-dark_mode').selectOption('dark');assert.equal(await page.locator('body').getAttribute('class'),'dark-theme');
        assert.equal(await page.locator('[data-category-form] [type=submit]').isEnabled(),true);
        await page.getByRole('button',{name:'Discard changes',exact:true}).click();assert.equal(await page.locator('#setting-dark_mode').inputValue(),'');
        await page.waitForFunction(()=>document.body.classList.contains('no-theme'));
        assert.ok(!requests.some(r=>r.method==='POST'));
        assert.deepEqual(errors,[]);await context.close();
    });
    test(`${engine}: D1 occurrence grip keyboard/pointer, cancel and failed writes`,async()=>{
        let fail=false;const writes=[],committed=Array.from(fs.readFileSync(path.join(generated,'overhaul-playlist-light.html'),'utf8').matchAll(/data-occurrence="([0-9]+)"/g),m=>m[1]);
        const{page,context,errors}=await setup(engine,'playlist','light',{reply(entry){if(entry.url.pathname==='/playlist_ajax'){writes.push(entry);return{status:fail?503:200,contentType:'application/json',body:fail?'{}':savedPlaylistOrder(entry,committed)};}}});
        const order=()=>page.locator('[data-occurrence]').evaluateAll(rows=>rows.map(r=>r.dataset.occurrence));
        const initial=await order(),first=page.locator('.playlist-grip').first();
        await first.focus();await page.keyboard.press('Space');await page.keyboard.press('ArrowDown');await page.keyboard.press('ArrowDown');await page.keyboard.press('Escape');assert.deepEqual(await order(),initial);assert.equal(writes.length,0);
        await page.keyboard.press('Space');await page.keyboard.press('ArrowDown');await page.keyboard.press('ArrowDown');await page.keyboard.press('Space');
        await page.waitForFunction(()=>document.querySelector('[data-order-status]').textContent.startsWith('Playlist order saved.'));
        assert.deepEqual(await order(),[initial[1],initial[2],initial[0],...initial.slice(3)]);
        assert.equal(writes[0].body.get('source'),initial[0]);assert.equal(writes[0].body.get('anchor'),initial[2]);
        assert.equal(writes[0].body.get('placement'),'after');assert.equal(writes[0].body.get('csrf_token'),'fixture-token');
        assert.equal(await page.getByRole('button',{name:/Move up|Move down/}).count(),0);
        const before=await order();fail=true;
        await page.locator('.playlist-grip').first().press('Space');await page.keyboard.press('ArrowDown');await page.keyboard.press('Space');
        await page.waitForFunction(()=>document.querySelector('[data-order-status]').textContent.includes('could not be confirmed'));
        assert.deepEqual(await order(),before);
        assert.equal(await page.locator('.media-rows[data-playlist-id]').getAttribute('aria-invalid'),'true');
        assert.equal(await page.locator('.playlist-grip:enabled').count(),0);
        assert.equal(writes.length,2,'ambiguous moves are not retried');
        assert.deepEqual(errors,[]);await context.close();
        const pointerOrder=initial.slice();
        const fresh=await setup(engine,'playlist','light',{reply(entry){if(entry.url.pathname==='/playlist_ajax')return{contentType:'application/json',body:savedPlaylistOrder(entry,pointerOrder)};}});
        const source=fresh.page.locator('[data-occurrence]').first(),target=fresh.page.locator('[data-occurrence]').last();
        const box=await target.boundingBox();await source.locator('.playlist-grip').dragTo(target,{targetPosition:{x:80,y:box.height-3}});
        await fresh.page.waitForFunction(id=>document.querySelector('[data-occurrence]:last-child').dataset.occurrence===id,initial[0]);
        assert.deepEqual(fresh.errors,[]);await fresh.context.close();
    });
}
async function assertFocus(page,selector){
    await page.waitForFunction(selector=>document.querySelector(selector)===document.activeElement,selector);
    assert.equal(await page.locator(selector).evaluate(e=>e===document.activeElement),true);
}

function contrast(a,b){
    function luminance(hex){let s=hex.replace('#','');if(s.length===3)s=Array.from(s).map(c=>c+c).join('');let c=[0,2,4].map(i=>parseInt(s.slice(i,i+2),16)/255).map(n=>n<=.04045?n/12.92:((n+.055)/1.055)**2.4);return c[0]*.2126+c[1]*.7152+c[2]*.0722;}
    let x=luminance(a),y=luminance(b);return(Math.max(x,y)+.05)/(Math.min(x,y)+.05);
}

const contributionTitles=[
    {title:'Original upstream title',original:true,locked:false,votes:7,UUID:'original'},
    {title:'Community <proposal> & literal',original:false,locked:false,votes:-2,UUID:'proposal-one'},
    {title:'Locked community title',original:false,locked:true,votes:31,UUID:'proposal-locked'}
];
function contributionServer() {
    return {reads:[],writes:[],titles:contributionTitles,readFailure:false,writeStatus:200,writeBody:{ok:true},
        reply(entry){
            if(entry.url.pathname.endsWith('/submissions')){this.reads.push(entry);return{status:this.readFailure?503:200,contentType:'application/json',body:JSON.stringify(this.readFailure?{}:{titles:this.titles})};}
            if(entry.url.pathname==='/dearrow_submit'){this.writes.push(entry);return{status:this.writeStatus,contentType:'application/json',body:JSON.stringify(this.writeBody)};}
        }
    };
}
async function openContributions(page,wait=true) {
    if(await page.locator('.watch-actions .ui-menu').getAttribute('open')===null)await page.locator('.watch-actions .ui-menu>summary').click();await page.locator('#dearrow-open').click();
    await page.locator('#dearrow-dialog').waitFor({state:'visible'});
    if(wait)await page.waitForFunction(()=>document.getElementById('dearrow-dialog').getAttribute('aria-busy')==='false');
}
async function reviewContribution(page,title) {
    await page.locator('#dearrow-draft').fill(title);await page.locator('#dearrow-draft-form [type=submit]').click();
    await page.locator('#dearrow-confirm').waitFor({state:'visible'});
}
async function acknowledgeContribution(page) {for(const check of await page.locator('#dearrow-confirm input').all())await check.check();}
function holdContributionRequests() {
    const fetch=window.fetch.bind(window);window.contributionPending=[];window.holdContributions='';
    window.fetch=(url,options={})=>{
        const target=new URL(url,location.href),kind=target.pathname==='/dearrow_submit'?'write':target.pathname.endsWith('/submissions')?'read':'';
        if(!kind||window.holdContributions!==kind)return fetch(url,options);
        return new Promise(resolve=>contributionPending.push({kind,body:String(options.body||''),release:data=>resolve(new Response(JSON.stringify(data),{status:200,headers:{'Content-Type':'application/json'}}))}));
    };
}
for(const engine of engines) {
    test(`${engine}: D6 contributions are lazy, survive asset retries and use shared accessible vote controls`,async()=>{
        const server=contributionServer();let cssFailure=true,scriptFailure=true;
        const{page,context,requests,errors}=await setup(engine,'watch','light',{fixture:'d6-contribution-regular-light',reply(entry){
            if(entry.url.pathname==='/css/dearrow-contributions.css'&&cssFailure){cssFailure=false;return{status:503,body:''};}
            if(entry.url.pathname==='/js/dearrow-contributions.js'&&scriptFailure){scriptFailure=false;return{status:503,body:''};}
            return server.reply(entry);
        }});
        assert.equal(requests.some(r=>r.url.pathname==='/js/dearrow-contributions.js'||r.url.pathname.endsWith('/submissions')),false);
        await page.locator('.watch-actions .ui-menu>summary').click();await page.locator('#dearrow-open').click();
        await page.locator('#ui-notice').getByRole('button',{name:'Retry',exact:true}).click();await page.locator('#ui-notice').getByRole('button',{name:'Retry',exact:true}).click();
        await page.locator('#dearrow-dialog').waitFor({state:'visible'});await page.waitForFunction(()=>document.querySelectorAll('[data-dearrow-vote]').length===6);
        assert.equal(server.reads.length,1);assert.equal(server.writes.length,0);assert.equal(await page.locator('link[data-dearrow-style]').count(),1);
        assert.equal(requests.filter(r=>r.url.pathname==='/css/dearrow-contributions.css').length,2,'successful stylesheet reused on script retry');
        assert.equal(await page.locator('#dearrow-original [data-dearrow-score]').textContent(),'Score: 7');
        assert.equal(await page.locator('#dearrow-titles [data-dearrow-score]').first().textContent(),'Score: -2');
        assert.equal(await page.locator('[data-uuid=proposal-locked][data-dearrow-vote=downvote]').isDisabled(),true);
        assert.equal(await page.locator('[data-uuid=proposal-locked][data-dearrow-vote=upvote]').isEnabled(),true);
        assert.equal(await page.locator('[data-uuid=proposal-one][data-dearrow-vote=upvote]').getAttribute('aria-label'),'Upvote: Community title 1');
        assert.equal(await page.locator('#dearrow-dialog i,#dearrow-dialog .pure-button').count(),0);assert.equal(await page.locator('[data-dearrow-vote] svg').count(),6);
        await page.keyboard.press('Escape');await assertFocus(page,'.watch-actions .ui-menu>summary');await openContributions(page);assert.equal(server.reads.length,1);
        assert.deepEqual(errors,[]);await context.close();
    });
    test(`${engine}: D6 contribution reads distinguish failed, malformed, empty and locked lists`,async()=>{
        const server=contributionServer();server.readFailure=true;
        const{page,context,errors}=await setup(engine,'watch','light',{fixture:'d6-contribution-regular-light',reply:e=>server.reply(e)});await openContributions(page);
        assert.equal(await page.locator('#dearrow-status').getAttribute('role'),'alert');assert.equal(await page.locator('#dearrow-titles').textContent(),'');
        server.readFailure=false;server.titles=[{...contributionTitles[1],votes:'malformed'}];await page.locator('#dearrow-refresh').click();await page.waitForFunction(()=>document.getElementById('dearrow-dialog').getAttribute('aria-busy')==='false');assert.equal(await page.locator('#dearrow-status').getAttribute('role'),'alert');
        server.titles=[];await page.locator('#dearrow-refresh').click();await page.waitForFunction(()=>document.querySelectorAll('[data-dearrow-vote]').length===2);assert.equal(await page.locator('#dearrow-original [data-dearrow-vote=downvote]').isDisabled(),true);assert.equal(await page.locator('#dearrow-original [data-dearrow-vote=upvote]').isEnabled(),true);assert.ok(await page.locator('#dearrow-original [data-dearrow-reason]').textContent());
        server.titles=contributionTitles;await page.locator('#dearrow-refresh').click();await page.waitForFunction(()=>document.querySelectorAll('[data-dearrow-vote]').length===6);server.readFailure=true;await page.locator('#dearrow-refresh').click();await page.waitForFunction(()=>document.getElementById('dearrow-dialog').getAttribute('aria-busy')==='false');assert.equal(await page.locator('[data-dearrow-proposal]').first().textContent(),contributionTitles[1].title,'failed refresh preserves last list');
        assert.equal(server.writes.length,0);assert.deepEqual(errors,[]);await context.close();
    });
    test(`${engine}: D6 bounded contribution asset loading recovers explicitly and playback continues through the dialog`,async()=>{
        let hold=true,release;const server=contributionServer(),{page,context,errors}=await setup(engine,'watch','light',{fixture:'d6-contribution-regular-light',reply(entry){if(hold&&entry.url.pathname==='/js/dearrow-contributions.js')return new Promise(resolve=>{release=()=>resolve({contentType:'application/javascript',body:fs.readFileSync(path.join(root,'assets/js/dearrow-contributions.js'))});});return server.reply(entry);}});
        await page.waitForFunction(()=>player.readyState()>0);await page.evaluate(()=>{const timer=window.setTimeout;window.setTimeout=(fn,ms,...args)=>timer(fn,ms===15000?100:ms,...args);window.contributionMedia=player.tech(true).el();player.loop(true);player.currentTime(0);return player.play();});await page.locator('.watch-actions .ui-menu>summary').click();await page.locator('#dearrow-open').click();await page.locator('#ui-notice').getByRole('button',{name:'Retry',exact:true}).waitFor();assert.equal(await page.locator('#dearrow-open').isEnabled(),true);assert.equal(await page.locator('#dearrow-dialog').isVisible(),false);hold=false;if(release)release();await page.locator('#ui-notice').getByRole('button',{name:'Retry',exact:true}).click();await page.locator('#dearrow-dialog').waitFor({state:'visible'});await page.waitForFunction(()=>player.currentTime()>.2);assert.equal(await page.evaluate(()=>player.tech(true).el()===contributionMedia&&!player.paused()),true);assert.equal(await page.locator('video').count(),1);assert.equal(server.writes.length,0);assert.deepEqual(errors,[]);await context.close();
    });
    test(`${engine}: D6 contribution review retains literal drafts, renews consent and submits one exact Unicode title`,async()=>{
        const server=contributionServer(),{page,context,errors}=await setup(engine,'watch','light',{fixture:'d6-contribution-regular-light',reply:e=>server.reply(e)});await openContributions(page);
        for(const invalid of ['   ','x'.repeat(111)]){await page.locator('#dearrow-draft').fill(invalid);await page.locator('#dearrow-draft-form [type=submit]').click();assert.equal(await page.locator('#dearrow-confirm').isVisible(),false);assert.equal(await page.locator('#dearrow-draft').inputValue(),invalid);assert.equal(await page.locator('#dearrow-status').getAttribute('role'),'alert');}
        const literal='  Literal <title> & '+ '🌏'.repeat(87)+'  ';await reviewContribution(page,literal);assert.equal(await page.locator('#dearrow-preview').textContent(),literal.trim());assert.equal(await page.locator('#dearrow-send').isDisabled(),true);await acknowledgeContribution(page);assert.equal(server.writes.length,0);
        await page.locator('#dearrow-close').click();await openContributions(page);assert.equal(await page.locator('#dearrow-confirm input:checked').count(),4);assert.equal(await page.locator('#dearrow-preview').textContent(),literal.trim());await page.locator('#dearrow-edit').click();assert.equal(await page.locator('#dearrow-draft').inputValue(),literal);await reviewContribution(page,literal);assert.equal(await page.locator('#dearrow-confirm input:checked').count(),0);
        await acknowledgeContribution(page);await page.locator('#dearrow-send').click();await page.waitForFunction(()=>document.getElementById('dearrow-draft').value==='');assert.equal(server.writes.length,1);assert.equal(server.writes[0].body.get('title'),literal.trim());assert.equal(server.writes[0].body.get('confirmed'),'true');assert.equal(server.writes[0].body.get('csrf_token'),'fixture-token');assert.ok(server.writes[0].body.get('browser_profile'));assert.equal(await page.locator('#dearrow-confirm').isVisible(),false);assert.equal(await page.locator('#dearrow-preview').textContent(),'');assert.deepEqual(errors,[]);await context.close();
    });
    test(`${engine}: D6 rejected contributions preserve review and an accepted vote never repeats after refresh failure`,async()=>{
        const server=contributionServer();server.writeStatus=403;server.writeBody={error:'Sensitive upstream title that must not be displayed'};
        const{page,context,errors}=await setup(engine,'watch','light',{fixture:'d6-contribution-regular-light',reply:e=>server.reply(e)});await openContributions(page);await reviewContribution(page,'  Exact <draft> & text  ');await acknowledgeContribution(page);await page.locator('#dearrow-send').click();await page.waitForFunction(()=>document.getElementById('dearrow-send').disabled===false);assert.equal(await page.locator('#dearrow-confirm input:checked').count(),4);assert.equal(await page.locator('#dearrow-draft').inputValue(),'  Exact <draft> & text  ');assert.equal(await page.locator('#dearrow-uncertain').isVisible(),false);assert.ok(!(await page.locator('#dearrow-status').textContent()).includes('Sensitive upstream'));
        server.writeStatus=200;server.writeBody={ok:true};server.readFailure=true;await page.locator('#dearrow-send').click();await page.waitForFunction(()=>document.getElementById('dearrow-status').textContent.includes('accepted, but'));assert.equal(server.writes.length,2);assert.equal(await page.locator('#dearrow-draft').inputValue(),'');assert.equal(await page.locator('#dearrow-uncertain').isVisible(),false);server.readFailure=false;await page.locator('#dearrow-refresh').click();await page.waitForFunction(()=>document.getElementById('dearrow-dialog').getAttribute('aria-busy')==='false');assert.equal(server.writes.length,2);assert.deepEqual(errors,[]);await context.close();
    });
    test(`${engine}: D6 unknown votes lock both directions across refresh and reopen without leaking upstream errors`,async()=>{
        for(const failure of ['server','malformed','network','timeout']){
            const server=contributionServer();if(failure==='server'){server.writeStatus=502;server.writeBody={error:'Hidden original secret'};}if(failure==='malformed')server.writeBody={};
            const{page,context,errors}=await setup(engine,'watch','light',{fixture:'d6-contribution-regular-light',reply:e=>failure==='network'&&e.url.pathname==='/dearrow_submit'?{abort:'failed'}:server.reply(e)});await openContributions(page);
            if(failure==='timeout')await page.evaluate(()=>{const timer=window.setTimeout;window.setTimeout=(fn,ms,...args)=>timer(fn,ms===15000?25:ms,...args);const fetch=window.fetch.bind(window);window.fetch=(url,options={})=>new URL(url,location.href).pathname==='/dearrow_submit'?new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')))):fetch(url,options);});
            const vote=page.locator('[data-uuid=proposal-one][data-dearrow-vote=upvote]');await vote.click();await page.waitForFunction(()=>document.getElementById('dearrow-dialog').getAttribute('aria-busy')==='false');assert.equal(await vote.isDisabled(),true);assert.equal(await page.locator('[data-uuid=proposal-one][data-dearrow-vote=downvote]').isDisabled(),true);assert.equal(await page.locator('#dearrow-original [data-dearrow-vote=upvote]').isEnabled(),true);assert.ok(!(await page.locator('#dearrow-status').textContent()).includes('Hidden original secret'));
            await page.locator('#dearrow-refresh').click();await page.waitForFunction(()=>document.getElementById('dearrow-dialog').getAttribute('aria-busy')==='false');await page.locator('#dearrow-close').click();await openContributions(page);assert.equal(await vote.isDisabled(),true);assert.equal(await page.locator('#dearrow-uncertain').isVisible(),true);assert.equal(server.writes.length,failure==='network'||failure==='timeout'?0:1);assert.deepEqual(errors,[]);await context.close();
        }
    });
    test(`${engine}: D6 unknown title creation retains acknowledgements and prevents the same trimmed proposal`,async()=>{
        const server=contributionServer();server.writeStatus=502;const{page,context,errors}=await setup(engine,'watch','light',{fixture:'d6-contribution-regular-light',reply:e=>server.reply(e)});await openContributions(page);await reviewContribution(page,'  uncertain <draft>  ');await acknowledgeContribution(page);await page.locator('#dearrow-send').click();await page.waitForFunction(()=>document.getElementById('dearrow-dialog').getAttribute('aria-busy')==='false');assert.equal(await page.locator('#dearrow-confirm input:checked').count(),4);assert.equal(await page.locator('#dearrow-send').isDisabled(),true);
        await page.locator('#dearrow-close').click();await openContributions(page);await page.locator('#dearrow-edit').click();await reviewContribution(page,'uncertain <draft>');await acknowledgeContribution(page);assert.equal(await page.locator('#dearrow-send').isDisabled(),true);assert.equal(server.writes.length,1);await page.locator('#dearrow-edit').click();await reviewContribution(page,'Different deliberate draft');await acknowledgeContribution(page);assert.equal(await page.locator('#dearrow-send').isEnabled(),true);assert.equal(server.writes.length,1);assert.deepEqual(errors,[]);await context.close();
    });
    test(`${engine}: D6 contribution writes reject duplicate dispatch and late replies across close, cache, profile and removal`,async()=>{
        for(const lifetime of ['close','cache','profile','removal']){
            const server=contributionServer(),{page,context,errors}=await setup(engine,'watch','light',{fixture:'d6-contribution-regular-light',init:holdContributionRequests,reply:e=>server.reply(e)});await openContributions(page);await reviewContribution(page,'Keep failed <draft>');await acknowledgeContribution(page);await page.evaluate(()=>{window.contributionRoot=document.getElementById('dearrow-dialog');window.holdContributions='write';});await page.locator('#dearrow-send').click();await page.waitForFunction(()=>contributionPending.length===1);await page.evaluate(()=>document.getElementById('dearrow-confirm').dispatchEvent(new Event('submit',{cancelable:true})));assert.equal(await page.evaluate(()=>contributionPending.length),1);
            await page.evaluate(lifetime=>{if(lifetime==='close')contributionRoot.close();else if(lifetime==='cache'){dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}));dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));}else if(lifetime==='profile')dispatchEvent(new Event('browserprofilechange'));else contributionRoot.remove();},lifetime);await page.evaluate(()=>contributionPending[0].release({ok:true}));await page.evaluate(()=>new Promise(resolve=>setTimeout(resolve,20)));
            assert.ok(!(await page.evaluate(()=>contributionRoot.querySelector('#dearrow-status').textContent)).includes('Accepted by'));assert.equal(await page.evaluate(()=>contributionRoot.querySelector('#dearrow-draft').value),lifetime==='profile'||lifetime==='removal'?'':'Keep failed <draft>');assert.equal(server.reads.length,1);if(lifetime==='close'){await openContributions(page);assert.equal(await page.locator('#dearrow-send').isDisabled(),true);}assert.deepEqual(errors,[]);await context.close();
        }
    });
    test(`${engine}: D6 late contribution reads and assets cannot open or populate a cancelled dialog`,async()=>{
        const server=contributionServer(),read=await setup(engine,'watch','light',{fixture:'d6-contribution-regular-light',init:holdContributionRequests,reply:e=>server.reply(e)});await read.page.evaluate(()=>holdContributions='read');await openContributions(read.page,false);await read.page.waitForFunction(()=>contributionPending.length===1);await read.page.keyboard.press('Escape');await read.page.evaluate(titles=>contributionPending[0].release({titles}),contributionTitles);await read.page.evaluate(()=>new Promise(resolve=>setTimeout(resolve,20)));assert.equal(await read.page.locator('[data-dearrow-proposal]').count(),0);await read.page.evaluate(()=>holdContributions='');await openContributions(read.page);assert.equal(await read.page.locator('[data-dearrow-proposal]').count(),2);assert.deepEqual(read.errors,[]);await read.context.close();
        for(const asset of ['style','script'])for(const lifetime of ['cache','profile','removal']){
            const assetPath=asset==='style'?'/css/dearrow-contributions.css':'/js/dearrow-contributions.js';let release;const{page,context,errors}=await setup(engine,'watch','light',{fixture:'d6-contribution-regular-light',reply(entry){if(entry.url.pathname===assetPath)return new Promise(resolve=>{release=()=>resolve({contentType:asset==='style'?'text/css':'application/javascript',body:fs.readFileSync(path.join(root,'assets',assetPath))});});return server.reply(entry);}});await page.locator('.watch-actions .ui-menu>summary').click();await page.locator('#dearrow-open').click();await page.waitForFunction(asset=>!!document.querySelector(asset==='style'?'link[data-dearrow-style]':'script[src*="dearrow-contributions.js"]'),asset);await page.evaluate(({lifetime,asset})=>{window.staleStyleCallback=document.querySelector(asset==='style'?'link[data-dearrow-style]':'script[src*="dearrow-contributions.js"]').onload;if(lifetime==='cache')dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}));else if(lifetime==='profile')dispatchEvent(new Event('browserprofilechange'));else document.getElementById('dearrow-open').remove();},{lifetime,asset});await page.evaluate(()=>new Promise(resolve=>setTimeout(resolve,0)));await page.evaluate(()=>staleStyleCallback());if(release)release();await page.addScriptTag({content:fs.readFileSync(path.join(root,'assets/js/dearrow-contributions.js'),'utf8')});assert.equal(await page.locator('#dearrow-dialog').isVisible(),false);if(lifetime!=='cache')assert.equal(await page.locator('#dearrow-dialog').getAttribute('data-contribution-ready'),null);else{await page.evaluate(()=>dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));await openContributions(page);}assert.deepEqual(errors,[]);await context.close();
        }
    });
    test(`${engine}: D6 contribution title masking covers labels, hover, notices and scoped reveal without changing playback`,async()=>{
        const server=contributionServer(),{page,context,requests,errors}=await setup(engine,'watch','light',{fixture:'d6-contribution-masked-light',reply:e=>server.reply(e)});await page.waitForFunction(()=>player.readyState()>0);await page.evaluate(()=>{window.contributionMedia=player.tech(true).el();player.pause();player.currentTime(1);player.volume(.35);player.playbackRate(1.5);});await openContributions(page);
        const hidden=await page.locator('#dearrow-original-title').textContent(),original=await page.locator('#dearrow-original-title').getAttribute('data-original-title');assert.notEqual(hidden,original);assert.equal(await page.locator('[data-dearrow-proposal]').first().textContent(),hidden);
        for(const vote of await page.locator('[data-dearrow-vote]').all()){await vote.hover();if(await vote.isEnabled())await vote.focus();const label=(await vote.getAttribute('aria-label'))+' '+(await vote.getAttribute('title'));assert.ok(!label.includes(original)&&!label.includes(contributionTitles[1].title));}
        const watchTitle=await page.locator('.watch-heading h1').textContent(),tabTitle=await page.title();await page.locator('#dearrow-mask-toggle').click();assert.equal(await page.locator('.watch-heading h1').textContent(),watchTitle);assert.equal(await page.title(),tabTitle);assert.equal(await page.locator('#dearrow-original-title').textContent(),original);assert.equal(await page.locator('[data-dearrow-proposal]').first().textContent(),contributionTitles[1].title);await page.locator('#dearrow-close').click();assert.equal(await page.locator('#dearrow-original-title').textContent(),hidden);await openContributions(page);assert.equal(await page.locator('[data-dearrow-proposal]').first().textContent(),hidden);
        assert.equal(await page.evaluate(()=>player.tech(true).el()===contributionMedia),true);assert.equal(await page.locator('video').count(),1);assert.ok(Math.abs(await page.evaluate(()=>player.currentTime())-1)<.1);assert.ok(Math.abs(await page.evaluate(()=>player.volume())-.35)<.01);assert.equal(await page.evaluate(()=>player.playbackRate()),1.5);assert.equal(await page.evaluate(()=>player.paused()),true);assert.equal(requests.filter(r=>r.url.pathname.startsWith('/api/v1/dearrow/')&&!r.url.pathname.endsWith('/submissions')).length,0);assert.deepEqual(errors,[]);await context.close();
    });
    test(`${engine}: D6 contribution role and no-JavaScript fallbacks explain the available destination`,async()=>{
        for(const kind of ['regular','guest','setup'])for(const javascript of [false,true]){
            const{page,context,requests,errors}=await setup(engine,'watch','light',{fixture:`d6-contribution-${kind}-light`,javascript});await page.locator('.watch-actions .ui-menu>summary').click();if(kind==='regular'){assert.equal(await page.locator('#dearrow-open').isVisible(),javascript);if(!javascript){assert.equal(await page.locator('.menu-note').isVisible(),true);assert.equal(await page.locator('.watch-actions a[href="/preferences/dearrow/identity"]').isVisible(),true);await page.locator('.menu-note').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(artifacts,`${engine}-d6-contribution-nojs-light.png`)});}}else{assert.equal(await page.locator('#dearrow-open').count(),0);assert.equal(await page.locator('.watch-actions a[href="/preferences?section=dearrow"]').isVisible(),true);}assert.equal(requests.some(r=>r.url.pathname==='/js/dearrow-contributions.js'||r.url.pathname.endsWith('/submissions')),false);assert.deepEqual(errors,[]);await context.close();
        }
    });
    test(`${engine}: D6 contribution persistent header, review and uncertainty fit Light, Dark and enlarged RTL desktops`,async()=>{
        for(const mode of ['light','dark']){
            const server=contributionServer(),{page,context,errors}=await setup(engine,'watch',mode,{fixture:`d6-contribution-regular-${mode}`,width:1280,height:720,reply:e=>server.reply(e)});await openContributions(page);if(mode==='dark'){await page.evaluate(()=>document.documentElement.dir='rtl');await page.addStyleTag({content:'body{font-size:20px}.button{font-size:18px}.dearrow-row-text>small,.dearrow-ack small{font-size:17px}'});}for(const stage of ['list','review','uncertain']){if(stage==='review'){await reviewContribution(page,'A deliberate contribution with a clearly reviewed title');await acknowledgeContribution(page);}if(stage==='uncertain'){server.writeStatus=502;await page.locator('#dearrow-send').click();await page.waitForFunction(()=>document.getElementById('dearrow-dialog').getAttribute('aria-busy')==='false');}const header=await page.locator('.dearrow-header').boundingBox();await page.locator('.dearrow-content').evaluate(e=>e.scrollTop=e.scrollHeight);assert.equal((await page.locator('.dearrow-header').boundingBox()).y,header.y);assert.ok(await page.locator('#dearrow-dialog').evaluate(e=>e.scrollWidth<=e.clientWidth+1));assert.ok(await page.locator('.dearrow-content').evaluate(e=>e.scrollWidth<=e.clientWidth+1));assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.locator('.dearrow-content').evaluate(e=>e.scrollTop=0);await page.screenshot({path:path.join(artifacts,`${engine}-d6-contribution-${stage}-${mode}${mode==='dark'?'-rtl':''}.png`)});}await page.emulateMedia({forcedColors:'active'});await page.keyboard.press('Tab');await page.locator('#dearrow-close').focus();assert.notEqual(await page.locator('#dearrow-close').evaluate(e=>getComputedStyle(e).outlineStyle),'none');assert.deepEqual(errors,[]);await context.close();
        }
    });
}

function settingsFixture(section) { return fs.readFileSync(path.join(generated,'settings-'+section+'.html'),'utf8'); }
function settingsConfig(section) { return JSON.parse(settingsFixture(section).match(/<script id="settings-config" type="application\/json">([\s\S]*?)<\/script>/)[1]); }
for (const engine of engines) {
    test(`${engine}: D2 category drafts, local search, Discard and guarded departure`, async()=>{
        let failBrowsing=true;
        const {page,context,requests,errors}=await setup(engine,'settings','light',{fixture:'settings-appearance',reply({url,method}){
            if(url.pathname==='/preferences'&&method==='GET'&&url.searchParams.get('section')==='browsing'&&failBrowsing){failBrowsing=false;return{status:503,contentType:'application/json',body:'{}'};}
            if(url.pathname==='/preferences'&&method==='GET')return{contentType:'text/html',body:settingsFixture(url.searchParams.get('section')||'appearance')};
        }});
        await page.locator('#setting-dark_mode').selectOption('dark');
        await page.waitForLoadState('networkidle');
        const categoryReads=()=>requests.filter(r=>r.url.pathname==='/preferences').length;
        const before=categoryReads();
        await page.locator('#settings-search').fill('Default speed');
        assert.equal(categoryReads(),before,'typing must not fetch a category');
        await page.locator('#settings-search-results [data-settings-field=speed]').click();
        await assertFocus(page,'#setting-speed');
        const original=await page.locator('#setting-speed').inputValue();
        await page.locator('#setting-speed').fill('1.1');
        await page.locator('#settings-search').fill('');
        await page.locator('.settings-nav [data-settings-category=appearance]').click();
        assert.equal(await page.locator('#setting-dark_mode').inputValue(),'dark');
        await page.getByRole('button',{name:'Discard changes',exact:true}).click();
        assert.equal(await page.locator('#setting-dark_mode').inputValue(),'light');
        const fetches=categoryReads();
        await page.locator('.settings-nav [data-settings-category=playback]').click();
        assert.equal(categoryReads(),fetches,'revisiting a draft must not fetch a category');
        assert.equal(await page.locator('#setting-speed').inputValue(),'1.1');
        await page.locator('.settings-nav [data-settings-category=browsing]').click();
        await page.getByRole('button',{name:'Retry',exact:true}).waitFor();
        assert.match(await page.locator('[data-settings-navigation-status]').textContent(),/category could not be loaded/);
        assert.equal(await page.locator('#setting-speed').inputValue(),'1.1');
        await page.getByRole('button',{name:'Retry',exact:true}).click();
        await page.waitForFunction(()=>document.querySelector('[data-category-form]').elements.section.value==='browsing');
        assert.equal(await page.locator('[data-settings-navigation-status]').isVisible(),false);
        assert.equal(await page.locator('[data-settings-panel] h2').evaluate(e=>e.getBoundingClientRect().top>=document.querySelector('.app-header').getBoundingClientRect().bottom),true);
        await page.locator('.settings-nav [data-settings-category=playback]').click();
        assert.equal(await page.locator('#setting-speed').inputValue(),'1.1');
        assert.equal(await page.locator('[data-category-form] [type=submit]').isEnabled(),true);
        const stored=await page.evaluate(()=>JSON.stringify({local:{...localStorage},session:{...sessionStorage},state:history.state}));
        assert.ok(!stored.includes('1.1')&&!stored.includes('setting-speed'),'draft values stay in page memory');
        page.once('dialog',async dialog=>{assert.equal(dialog.type(),'beforeunload');await dialog.dismiss();});
        await page.goto('https://invidious.test/feed/popular',{waitUntil:'commit',timeout:1500}).catch(()=>{});
        assert.equal(new URL(page.url()).searchParams.get('section'),'playback');
        assert.equal(await page.locator('#setting-speed').inputValue(),'1.1');
        await page.getByRole('button',{name:'Discard changes',exact:true}).click();
        assert.equal(Number(await page.locator('#setting-speed').inputValue()),Number(original));
        assert.ok(!requests.some(r=>r.method==='POST'));
        assert.deepEqual(errors,[]);await context.close();
    });
    test(`${engine}: D2 canonical category read-back, unchecked values and duplicate submit guard`, async()=>{
        const profile=settingsConfig('appearance').profile;
        let saved,release;const gate=new Promise(resolve=>release=resolve),writes=[];
        const {page,context,errors}=await setup(engine,'settings','light',{fixture:'settings-appearance',reply:async({url,method,body})=>{
            if(url.pathname!=='/preferences')return;
            if(method==='POST'){
                writes.push(body);await gate;
                saved={dark_mode:body.get('dark_mode'),show_nick:body.get('show_nick')==='on'};
                return{contentType:'application/json',body:JSON.stringify({section:'appearance',profile,values:saved,preferences:{...saved,speed:1.25},fingerprint:'before'})};
            }
            if(url.searchParams.get('format')==='json')return{contentType:'application/json',body:JSON.stringify({section:'appearance',profile,values:saved,fingerprint:'unrelated-category-changed'})};
            return{contentType:'text/html',body:settingsFixture('appearance')};
        }});
        await page.locator('#setting-dark_mode').selectOption('dark');await page.locator('#setting-show_nick').uncheck();
        await page.locator('[data-category-form] [type=submit]').click();
        await page.evaluate(()=>{document.querySelector('[data-category-form]').requestSubmit();document.querySelector('[data-category-form]').requestSubmit();});
        assert.equal(await page.locator('[data-category-form]').getAttribute('aria-busy'),'true');
        release();await page.waitForFunction(()=>document.querySelector('[data-category-status]').textContent==='Saved');
        assert.equal(writes.length,1);assert.equal(writes[0].has('show_nick'),false);
        assert.equal(writes[0].has('speed'),false);assert.equal(writes[0].get('browser_profile'),profile);
        assert.equal(await page.locator('#setting-show_nick').isChecked(),false);
        assert.equal(await page.locator('[data-category-form] [type=submit]').isDisabled(),true);
        assert.deepEqual(errors,[]);await context.close();
    });
    test(`${engine}: D2 failed and unconfirmed saves retain drafts without write retries`, async()=>{
        for(const failure of ['field','readback','guest-cookie','expired','profile']){
            const section=failure==='guest-cookie'?'overhaul-settings-light':'settings-appearance';
            const values={dark_mode:'dark',show_nick:true};let writes=0;
            const profile=failure==='guest-cookie'?'guest':settingsConfig('appearance').profile;
            const {page,context,errors}=await setup(engine,'settings','light',{fixture:section,reply({url,method}){
                if(url.pathname!=='/preferences')return;
                if(method==='POST'){
                    writes++;
                    if(failure==='field')return{status:400,contentType:'application/json',body:JSON.stringify({error:'Choose a valid color mode.',field:'dark_mode'})};
                    if(failure==='expired')return{status:403,contentType:'application/json',body:JSON.stringify({error:'Your session expired. Reload before saving.'})};
                    return{contentType:'application/json',body:JSON.stringify({section:'appearance',profile:failure==='profile'?'b'.repeat(64):profile,values})};
                }
                if(url.searchParams.get('format')==='json')return{contentType:'application/json',body:JSON.stringify({section:'appearance',profile,values:{dark_mode:'light',show_nick:true}})};
            }});
            await page.locator('#setting-dark_mode').selectOption('dark');await page.locator('[data-category-form] [type=submit]').click();
            await page.locator('[data-category-status] a').waitFor();
            assert.equal(await page.locator('#setting-dark_mode').inputValue(),'dark',failure);
            assert.equal(await page.locator('[data-category-form] [type=submit]').isEnabled(),true,failure);
            assert.equal(await page.locator('[data-category-status]').textContent().then(s=>s.trim()==='Saved'),false,failure);
            if(failure==='field')assert.equal(await page.locator('#setting-dark_mode').getAttribute('aria-invalid'),'true');
            assert.equal(writes,1,'an ambiguous write must not be retried');
            assert.deepEqual(errors,[]);await context.close();
        }
    });
    test(`${engine}: D2 all nine category forms and normal HTML fallback without JavaScript`, async()=>{
        const categories=['appearance','language','browsing','playback','captions-comments','library','sponsorblock','dearrow','ai-filter'];
        let submitted;
        const {page,context}=await setup(engine,'settings','light',{javascript:false,reply({url,method,body}){
            if(url.pathname!=='/preferences')return;
            if(method==='POST'){submitted=body;return{contentType:'text/html',body:'<p>Saved fallback</p>'};}
            return{contentType:'text/html',body:settingsFixture(url.searchParams.get('section')||'appearance')};
        }});
        for(const section of categories){
            await page.goto('https://invidious.test/preferences?section='+section);
            assert.equal(await page.locator('[name=section]').inputValue(),section);
            assert.equal(await page.locator('[data-category-form]').count(),1);
            assert.deepEqual(await page.locator('[data-category-form] label,[data-category-form] option,[data-category-form] legend').evaluateAll(elements=>elements.map(e=>e.textContent.trim()).filter(text=>/^(preferences_|settings_|sb_mode_|sb_category_|history_|overhaul_|ui_|ux_)/.test(text))),[],section+' unresolved labels');
            assert.equal(await page.locator('[data-settings-search]').isVisible(),false);
            assert.equal(await page.locator('[name=thin_mode],[name=ui_density],[name=player_style],[name=chat_overlay_enabled]').count(),0);
            assert.equal(await page.locator('[data-category-form] input:not([type=hidden]),[data-category-form] select').evaluateAll(controls=>controls.every(control=>!!document.querySelector('label[for="'+control.id+'"]'))),true,section+' labels');
            assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,section+' overflow');
            await page.screenshot({path:path.join(artifacts,engine+'-settings-'+section+'-nojs.png'),fullPage:true});
        }
        await page.goto('https://invidious.test/preferences?section=appearance');
        await page.locator('#setting-dark_mode').selectOption('dark');
        await page.getByRole('button',{name:'Save preferences',exact:true}).click();
        assert.equal(submitted.get('dark_mode'),'dark');assert.ok(submitted.get('browser_profile'));assert.ok(submitted.has('csrf_token'));
        await context.close();
    });
    test(`${engine}: D2 appended shared primitives initialize once and dispose on departure`, async()=>{
        const{page,context,errors}=await setup(engine,'browse');
        await page.evaluate(()=>{
            const region=document.createElement('div');region.id='appended-region';
            region.innerHTML='<details data-ui-menu><summary>New actions</summary><div class="menu-content"><button>First action</button><button>Second action</button></div></details>';
            region.insertAdjacentHTML('beforeend','<button id="dialog-b" data-open-dialog="appended-dialog">Open B</button><button id="dialog-a" data-open-dialog="appended-dialog">Open A</button><dialog id="appended-dialog" aria-labelledby="appended-heading"><h2 id="appended-heading">Shared dialog</h2><form method="dialog"><button>Close dialog</button></form></dialog>');
            document.querySelector('main').append(region);window.appendedRegion=region;
            for(let i=0;i<3;i++)InvidiousUI.changed(region);
        });
        await page.locator('#appended-region summary').focus();await page.keyboard.press('ArrowDown');
        await assertFocus(page,'#appended-region .menu-content button:first-child');
        await page.keyboard.press('Escape');await assertFocus(page,'#appended-region summary');
        for(const opener of ['dialog-a','dialog-b']){
            await page.locator('#'+opener).click();await page.locator('#appended-dialog').waitFor({state:'visible'});
            await page.getByRole('button',{name:'Close dialog',exact:true}).click();await page.waitForTimeout(40);
            await assertFocus(page,'#'+opener);
        }
        await page.evaluate(()=>{appendedRegion.remove();InvidiousUI.changed(document);document.querySelector('main').append(appendedRegion);InvidiousUI.changed(appendedRegion);});
        await page.locator('#appended-region summary').focus();await page.keyboard.press('ArrowDown');
        await assertFocus(page,'#appended-region .menu-content button:first-child');
        await page.locator('h1').click();assert.equal(await page.locator('#appended-region details').getAttribute('open'),null);
        await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true})));
        await page.locator('#sidebar-toggle').click();
        const before=await page.locator('body').getAttribute('data-nav-collapsed');
        await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:false})));
        await page.locator('#sidebar-toggle').click();assert.equal(await page.locator('body').getAttribute('data-nav-collapsed'),before);
        assert.deepEqual(errors,[]);await context.close();
    });
}

for(const engine of engines){
    test(`${engine}: D2 component departure aborts pending category reads and suppresses late output`,async()=>{
        const{page,context,errors}=await setup(engine,'settings');
        let held,observe;const seen=new Promise(resolve=>observe=resolve);
        await context.route('**/preferences?section=playback',route=>{held=route;observe();});
        const cancelled=page.waitForEvent('requestfailed',{predicate:request=>request.url().endsWith('/preferences?section=playback')});
        try{
            await page.locator('.settings-nav [data-settings-category=playback]').click();await seen;
            await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:false})));
            await cancelled;
            await held.fulfill({contentType:'text/html',body:settingsFixture('playback')}).catch(()=>{});
            await page.waitForTimeout(40);
            assert.equal(await page.locator('[data-settings-panel] h2').textContent(),'Appearance');
            assert.equal(await page.locator('#ui-notice').isVisible(),false);
            assert.deepEqual(errors,[]);
        }finally{
            if(held)await held.abort().catch(()=>{});
            await context.close();
        }
    });
}

for(const engine of engines) {
    test(`${engine}: D3 search submits, literal escape, filter chips and POST privacy`,async()=>{
        for(const privacy of [false,true]) {
            const fixture=`d3-search-literal-${privacy}`;
            const {page,context,requests,errors}=await setup(engine,'browse','light',{fixture,url:'/search'});
            const term='\\https://youtu.be/aaaaaaaaaaa';
            assert.equal(await page.locator('.header-search input').inputValue(),term);
            assert.equal(await page.locator('#filters input[name=q]').inputValue(),term);
            assert.equal(await page.locator('#filters form').getAttribute('method'),privacy?'post':'get');
            assert.equal(await page.locator('.page-next-container form').count(),privacy?1:0);
            const before=requests.filter(r=>r.url.pathname==='/search').length;
            await page.locator('.header-search input').fill('a new phrase');
            await page.waitForTimeout(80);
            assert.equal(requests.filter(r=>r.url.pathname==='/search').length,before,'typing makes no search request');
            await page.locator('#filters-collapse summary').click();
            await page.locator('#filter-date-month').check();
            await page.evaluate(()=>window.__d3BeforeNavigation=true);
            await Promise.all([page.waitForNavigation(),page.locator('#filters-apply button').click()]);
            assert.equal(await page.evaluate(()=>window.__d3BeforeNavigation),undefined,'Apply navigates normally');
            const sent=requests.filter(r=>r.url.pathname==='/search').at(-1);
            assert.equal(sent.method,privacy?'POST':'GET');
            const fields=privacy?sent.body:sent.url.searchParams;
            assert.equal(fields.get('q'),term);assert.equal(fields.get('date'),'month');assert.equal(fields.get('region'),'ID');
            assert.equal(fields.get('page'),'1');
            if(privacy) {
                assert.equal(sent.url.search,'');
                const state=await page.evaluate(()=>JSON.stringify({history:history.state,local:{...localStorage},session:{...sessionStorage}}));
                assert.ok(!state.includes('youtu.be')&&!state.includes('aaaaaaaaaaa'),'private POST query is never stored');
                assert.ok(!(await page.title()).includes('youtu.be'),'private history title');
            }
            assert.deepEqual(errors,[]);await context.close();
        }
    });
    test(`${engine}: D3 mixed result types, real scopes and desktop rows`,async()=>{
        const {page,context,errors}=await setup(engine,'browse','light',{fixture:'d3-search-false',url:'/search?q=light'});
        assert.equal(await page.locator('[data-browse-items] .media-row').count(),5);
        for(const kind of ['video','channel','playlist','hashtag','unavailable'])assert.equal(await page.locator(`[data-kind="${kind}"]`).count(),1);
        assert.match(await page.locator('[data-kind=video] .media-meta').innerText(),/0 views/);
        assert.equal(await page.locator('[data-kind=channel] img').count(),1,'provided channel avatar');
        assert.ok(!(await page.locator('[data-kind=channel]').innerText()).includes('0 videos'),'unknown channel video count omitted');
        assert.equal(await page.locator('[data-kind=playlist] img').count(),0,'missing aggregate cover has a placeholder');
        assert.match(await page.locator('[data-kind=playlist]').innerText(),/0 videos/);
        assert.equal(await page.locator('.active-filters .ui-icon').count(),3);
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
        const menu=page.locator('[data-kind=video] [data-ui-menu]');
        await menu.locator('summary').click();
        await page.waitForFunction(()=>document.querySelector('[data-kind=video] [data-ui-menu] .menu-content').style.position==='fixed');
        const menuBox=await menu.locator('.menu-content').evaluate(el=>{const r=el.getBoundingClientRect();return{left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height,viewport:[innerWidth,innerHeight],style:el.style.cssText,anchor:el.closest('details').querySelector('summary').getBoundingClientRect().toJSON()};});
        assert.equal(menuBox.left>=7&&menuBox.right<=menuBox.viewport[0]-7&&menuBox.top>=7&&menuBox.bottom<=menuBox.viewport[1]-7,true,'menu stays inside viewport: '+JSON.stringify(menuBox));
        await page.keyboard.press('Escape');
        await page.screenshot({path:path.join(artifacts,`${engine}-d3-search-1440.png`)});
        assert.deepEqual(errors,[]);await context.close();
        for(const scope of ['subscriptions','channel']) {
            const state=await setup(engine,'browse','light',{fixture:`d3-search-${scope}`,url:'/search'});
            assert.equal(await state.page.locator('#filters').count(),0,'unsupported global filters absent');
            assert.ok(!(await state.page.locator('.page-heading').innerText()).includes('all of YouTube'));
            assert.deepEqual(state.errors,[]);await state.context.close();
        }
    });
    test(`${engine}: upstream Shows uses channel More while retaining native Clips`,async()=>{
        const {page,context,errors}=await setup(engine,'browse','light',{fixture:'upstream-shows-light',url:'/channel/UCfixture/shows'});
        const more=page.locator('.channel-more');
        assert.match(await more.locator('summary').innerText(),/More.*Shows/);
        await more.locator('summary').click();
        assert.equal(await more.locator('strong[aria-current=page]').innerText(),'Shows');
        assert.equal(await page.locator('a[href="/channel/UCfixture/clips"]').count(),1);
        assert.deepEqual(errors,[]);await context.close();
    });
    test(`${engine}: D3 channel primary tabs, selected More and no-JS search home`,async()=>{
        const {page,context,errors}=await setup(engine,'browse','light',{fixture:'d3-channel-more',url:'/channel/UCfixture/podcasts'});
        const more=page.locator('.channel-more');
        assert.match(await more.locator('summary').innerText(),/More.*Podcasts/);
        assert.equal(await more.locator('summary').getAttribute('aria-current'),'page');
        await more.locator('summary').click();
        assert.match(await more.locator('.menu-content [aria-current=page]').innerText(),/Podcasts/);
        assert.equal(await more.locator('a[href="#channel-about"]').count(),1);
        await page.keyboard.press('Escape');
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
        assert.equal(await page.locator('.playlist-result-thumbnail').evaluateAll(nodes=>nodes.every(node=>{const r=node.getBoundingClientRect();return Math.abs(r.width/r.height-16/9)<.02;})),true,'playlist covers reserve their aspect ratio');
        await page.screenshot({path:path.join(artifacts,`${engine}-d3-channel-more-1440.png`)});
        assert.deepEqual(errors,[]);await context.close();
        const sorted=await setup(engine,'browse','light',{fixture:'channel-diary',url:'/channel/UCfixture'});
        assert.equal(await sorted.page.locator('.channel-sort button').innerText(),'Sort');
        const reads=sorted.requests.filter(r=>r.url.pathname==='/channel/UCfixture').length;
        await sorted.page.locator('#channel-sort').selectOption('oldest');
        assert.equal(sorted.requests.filter(r=>r.url.pathname==='/channel/UCfixture').length,reads);
        await Promise.all([sorted.page.waitForNavigation(),sorted.page.locator('.channel-sort button').click()]);
        assert.equal(sorted.requests.filter(r=>r.url.pathname==='/channel/UCfixture').at(-1).url.searchParams.get('sort_by'),'oldest');
        assert.deepEqual(sorted.errors,[]);await sorted.context.close();
        const home=await setup(engine,'browse','light',{fixture:'d3-search-home-light',url:'/search',javascript:false});
        assert.equal(await home.page.locator('input[name=q]').count(),1,'single landing search');
        assert.equal(await home.page.locator('form[role=search]').getAttribute('action'),'/search');
        assert.equal(await home.page.locator('input[name=q]').isVisible(),true);
        await home.context.close();
    });
    test(`${engine}: D3 append failure, filtered-empty continuation and Back descriptors`,async()=>{
        let fail=true;
        const result=await setup(engine,'browse','light',{fixture:'qol-search-false-1',url:'/search?q=light&duration=short',reply:entry=>{
            if(entry.url.pathname!=='/search'||!entry.url.searchParams.has('page'))return;
            const num=Number(entry.url.searchParams.get('page'));
            if(num===2&&fail){fail=false;return{status:503,body:'unavailable'};}
            return{contentType:'text/html',body:fs.readFileSync(path.join(generated,`qol-search-false-${num}.html`))};
        }});
        const {page,context,requests,errors}=result;
        const original=await page.locator('[data-browse-items] .media-item').count();
        await page.locator('[data-load-more]').click();
        await page.waitForFunction(()=>document.querySelector('[data-browse-status] .ui-retry'));
        assert.equal(await page.locator('[data-browse-items] .media-item').count(),original,'failed read retains results');
        await page.locator('[data-browse-status] .ui-retry').click();
        await page.waitForFunction(()=>document.querySelector('[data-browse-region]').getAttribute('aria-busy')==='false');
        assert.equal(await page.locator('[data-browse-items] .media-item').count(),original,'filtered-empty page does not erase prior items');
        assert.equal(await page.locator('[data-load-more]').isVisible(),true,'filtered-empty can continue');
        await page.locator('[data-load-more]').click();
        await page.waitForFunction(()=>document.querySelector('[data-load-more]').hidden);
        assert.equal(await page.locator('[data-browse-items] .media-item').count(),original+1,'valid repeated video occurrence retained');
        assert.equal(await page.evaluate(()=>location.search),'?q=light&duration=short','append does not create a route history entry');
        const snapshot=await page.evaluate(()=>InvidiousStorage.session.get('browse_state'));
        assert.equal(snapshot.views.at(-1).pages.length,2);
        assert.ok(snapshot.views.at(-1).pages.every(p=>p.method==='GET'&&!('body'in p)));
        const reads=requests.filter(r=>r.url.pathname==='/search'&&r.url.searchParams.has('page'));
        assert.deepEqual(reads.map(r=>r.url.searchParams.get('page')),['2','2','3'],'only explicit reads retry');
        assert.deepEqual(errors,[]);await context.close();
    });
    test(`${engine}: D3 shared community replies keep independent opaque cursors and content on failure`,async()=>{
        const calls=[];let fail=true;
        const {page,context,errors}=await setup(engine,'browse','light',{fixture:'d3-community-light',url:'/channel/UCfixture/community',reply:entry=>{
            if(entry.url.pathname.startsWith('/embed/'))return{contentType:'text/html',body:'<html><body><video controls></video></body></html>'};
            if(entry.url.pathname!=='/api/v1/channels/comments/UCfixture')return;
            calls.push(entry.url.searchParams.get('continuation'));
            if(fail){fail=false;return{status:503,contentType:'application/json',body:'{"error":"Unavailable"}'};}
            return{contentType:'application/json',body:fs.readFileSync(path.join(generated,'d3-thread-end.json'))};
        }});
        assert.equal(await page.locator('#comments > .comment').count(),3);
        assert.equal(await page.locator('[data-comment-id=post-c] [data-load-replies]').count(),0,'cursor never carried over from earlier post');
        assert.equal(await page.locator('.comment-avatar[src=""]').count(),0,'missing avatar does not request the page');
        assert.equal(await page.locator('[data-comment-id=post-a] .slides-item').count(),2);
        const a=page.locator('[data-comment-id=post-a] [data-comment-replies]');
        await a.locator('[data-load-replies]').click();
        await a.locator('.ui-retry').waitFor();
        assert.equal(await page.locator('#comments > .comment').count(),3);
        assert.equal(await a.locator('[data-load-replies]').count(),1,'failed read retains original control');
        await a.locator('.ui-retry').click();
        await a.locator('[data-thread-toggle]').waitFor();
        await a.locator('[data-thread-toggle]').click();
        assert.equal(await a.locator('[data-thread-items]').isVisible(),false);
        await a.locator('[data-thread-toggle]').click();
        assert.equal(await a.locator('[data-thread-items]').isVisible(),true);
        await page.locator('[data-comment-id=post-b] [data-load-replies]').click();
        await page.locator('[data-comment-id=post-b] [data-thread-toggle]').waitFor();
        assert.deepEqual(calls,['thread-a+/= &?日本語','thread-a+/= &?日本語','thread-b+/= &?日本語']);
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
        await page.screenshot({path:path.join(artifacts,`${engine}-d3-community-1440.png`)});
        assert.deepEqual(errors,[]);await context.close();
    });
}

const fixtureHTML = name => fs.readFileSync(path.join(generated,name+'.html'),'utf8');
function profileFrom(html) { return JSON.parse(html.match(/<script id="browser-profile"[^>]*>([\s\S]*?)<\/script>/)[1]).scope; }
function withProfile(html, scope) {
    return html.replace(/(<script id="browser-profile"[^>]*>)([\s\S]*?)(<\/script>)/,(_,start,json,end)=>start+JSON.stringify({...JSON.parse(json),scope})+end);
}
for(const engine of engines) {
    test(`${engine}: D3 browse to watch, Back and reload reconstruct GET pages and scroll`,async()=>{
        const scope=profileFrom(fixtureHTML('qol-browse'));
        const {page,context,requests,errors}=await setup(engine,'browse','light',{fixture:'qol-browse',reply:entry=>{
            if(entry.url.pathname==='/feed/popular')return{contentType:'text/html',body:fixtureHTML(entry.url.searchParams.has('page')?'qol-browse-next':'qol-browse')};
            if(entry.url.pathname==='/watch'&&entry.navigation)return{contentType:'text/html',body:withProfile(fixtureHTML('overhaul-watch-light'),scope)};
        }});
        await page.locator('[data-load-more]').click();
        await page.waitForFunction(()=>document.querySelectorAll('[data-browse-items] > .media-item').length===24);
        await page.evaluate(()=>scrollTo(0,650));
        await Promise.all([page.waitForURL(url=>url.pathname==='/watch'),page.locator('[data-browse-items] .media-title a').nth(8).click()]);
        assert.equal(await page.locator('video').count(),1,'actual player destination');
        await page.goBack();
        await page.waitForFunction(()=>document.querySelectorAll('[data-browse-items] > .media-item').length===24 && scrollY>500);
        const reads=requests.filter(r=>r.url.pathname==='/feed/popular'&&r.url.searchParams.has('page')).length;
        await page.reload();
        await page.waitForFunction(()=>document.querySelectorAll('[data-browse-items] > .media-item').length===24 && scrollY>500);
        assert.equal(requests.filter(r=>r.url.pathname==='/feed/popular'&&r.url.searchParams.has('page')).length,reads+1,'a fresh document replays descriptors once');
        assert.deepEqual(errors,[]);await context.close();
    });
    test(`${engine}: D3 stale and unsafe continuations preserve rows and require a new page`,async()=>{
        for(const unsafe of [false,true]) {
            const {page,context,requests,errors}=await setup(engine,'browse','light',{fixture:'qol-search-false-1',url:'/search?q=light',reply:entry=>{
                if(entry.url.pathname!=='/search'||!entry.url.searchParams.has('page'))return;
                let body=fixtureHTML('qol-search-false-2');
                if(unsafe)body=body.replaceAll(/href="\/search\?[^\"]*page=3"/g,'href="https://other.invalid/search?page=3"');
                else body=body.replace(/"browseFingerprint":"[a-f0-9]{64}"/,'"browseFingerprint":"'+'a'.repeat(64)+'"');
                return{contentType:'text/html',body};
            }});
            const before=await page.locator('[data-browse-items]').innerHTML();
            await page.locator('[data-load-more]').click();
            await page.locator('[data-browse-status] .ui-retry').waitFor();
            await page.waitForFunction(()=>InvidiousEnhancements.readState()==='initial'||InvidiousEnhancements.readState()==='ready');
            assert.equal(await page.locator('[data-browse-items]').innerHTML(),before,'failed continuation cannot replace existing results');
            if(!unsafe) {
                assert.equal(await page.locator('[data-load-more]').isVisible(),false);
                assert.equal(await page.evaluate(()=>InvidiousStorage.session.get('browse_state')),undefined);
            }
            assert.ok(!requests.some(r=>r.url.hostname==='other.invalid'));
            assert.deepEqual(errors,[]);await context.close();
        }
    });
    test(`${engine}: D3 private POST appends stay out of durable state and have HTML pagination`,async()=>{
        for(const javascript of [true,false]) {
            const {page,context,requests,errors}=await setup(engine,'browse','light',{fixture:'qol-search-true-1',url:'/search',javascript,reply:entry=>{
                if(entry.url.pathname==='/search'&&entry.method==='POST')return{contentType:'text/html',body:fixtureHTML('qol-search-true-'+entry.body.get('page'))};
            }});
            if(javascript) {
                await page.locator('[data-load-more]').click();
                await page.waitForFunction(()=>document.querySelector('[data-browse-region]').getAttribute('aria-busy')==='false');
                await page.locator('[data-load-more]').click();
                await page.waitForFunction(()=>document.querySelectorAll('[data-browse-items]>.media-item').length===2);
                const stored=await page.evaluate(()=>JSON.stringify({history:history.state,local:{...localStorage},session:{...sessionStorage}}));
                assert.ok(!stored.includes('light')&&!stored.includes('browse_state'),'private query/filter/continuation not retained');
            } else {
                assert.equal(await page.locator('[data-browse-controls]').isVisible(),false);
                const form=page.locator('.page-next-container form');
                assert.equal(await form.getAttribute('method'),'post');
                await Promise.all([page.waitForNavigation(),form.locator('button').click()]);
            }
            const reads=requests.filter(r=>r.url.pathname==='/search'&&r.method==='POST');
            assert.equal(reads.length,javascript?2:1);
            assert.ok(reads.every(r=>r.url.search===''&&r.body.get('q')==='light'));
            assert.equal(new URL(page.url()).search,'');
            assert.deepEqual(errors,[]);await context.close();
        }
    });
    test(`${engine}: D3 failed avatar fallback, channel About and desktop content matrix`,async()=>{
        for(const fixture of ['d3-search-light','d3-search-dark','d3-community-light','d3-community-dark','d3-channel-more']) {
            const channel=fixture==='d3-channel-more';
            const {page,context,requests,errors}=await setup(engine,'browse',fixture.includes('dark')?'dark':'light',{fixture,url:channel?'/channel/UCfixture/podcasts':fixture.includes('search')?'/search?q=light':'/channel/UCfixture/community',reply:entry=>{
                if(entry.url.pathname.startsWith('/ggpht')&&entry.url.pathname.includes('supplied'))return{status:404,body:''};
                if(entry.url.pathname.startsWith('/embed/'))return{contentType:'text/html',body:'<html><body>Video attachment</body></html>'};
            }});
            await page.locator('.channel-avatar img').evaluateAll(images=>images.forEach(image=>image.loading='eager'));
            await page.waitForFunction(()=>Array.from(document.querySelectorAll('.channel-avatar img')).every(image=>image.hidden));
            if(channel) {
                assert.equal(await page.locator('.channel-portrait .channel-avatar-initial').innerText(),'S');
                await page.locator('.channel-more summary').click();
                await page.locator('.channel-more a[href="#channel-about"]').click();
                await page.locator('#channel-about').waitFor({state:'visible'});
            }
            for(const [width,height]of[[1280,720],[1440,900],[1920,1080]]) {
                await page.setViewportSize({width,height});
                assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,fixture+' '+width);
                if(width===1440)await page.screenshot({path:path.join(artifacts,`${engine}-${fixture}-1440.png`)});
            }
            await page.setViewportSize({width:1280,height:720});
            await page.evaluate(()=>{document.documentElement.dir='rtl';document.documentElement.style.fontSize='125%';});
            await page.addStyleTag({content:'body{font-size:20px}.media-title,h3{font-size:20px}.muted,.media-meta,.sidebar-link,.button{font-size:17.5px}h1{font-size:30px}'});
            assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,fixture+' RTL/enlarged');
            await page.screenshot({path:path.join(artifacts,`${engine}-${fixture}-rtl-enlarged.png`)});
            assert.ok(!requests.some(r=>r.url.pathname.startsWith('/api/v1/videos/')||r.url.pathname.startsWith('/api/v1/channels/UCfixture')),'no per-card metadata requests');
            assert.deepEqual(errors,[]);await context.close();
        }
    });
    test(`${engine}: D3 standalone posts retry initial comments and preserve no-JS continuations`,async()=>{
        let fail=true;
        const {page,context,requests,errors}=await setup(engine,'browse','light',{fixture:'d3-post-light',url:'/post/post-a?ucid=UCfixture',reply:entry=>{
            if(entry.url.pathname!=='/api/v1/post/post-a/comments')return;
            if(fail){fail=false;return{status:503,contentType:'application/json',body:'{}'};}
            return{contentType:'application/json',body:fs.readFileSync(path.join(generated,'d3-thread-response.json'))};
        }});
        await page.locator('#comments .ui-retry').waitFor();
        assert.equal(await page.locator('#post > .comment').count(),1,'post survives failed comments');
        await page.locator('#comments .ui-retry').click();
        await page.waitForFunction(()=>document.querySelectorAll('#comments > .comment').length===3);
        assert.equal(await page.locator('#comments-heading').innerText(),'3 comments');
        assert.equal(requests.filter(r=>r.url.pathname==='/api/v1/post/post-a/comments').length,2);
        await page.screenshot({path:path.join(artifacts,`${engine}-d3-post-light-1440.png`)});
        assert.deepEqual(errors,[]);await context.close();
        const nojs=await setup(engine,'browse','dark',{fixture:'d3-post-nojs-dark',url:'/post/post-a?ucid=UCfixture&nojs=1',javascript:false});
        assert.equal(await nojs.page.locator('#comments > .comment').count(),3);
        const next=new URL(await nojs.page.locator('#comments [data-comment-more] a').getAttribute('href'),'https://invidious.test');
        assert.equal(next.pathname,'/post/post-a');
        assert.equal(next.searchParams.get('nojs'),'1');
        assert.equal(next.searchParams.get('continuation'),'post-more+/= &?日本語');
        assert.ok(!nojs.requests.some(r=>r.url.pathname.startsWith('/api/')));
        await nojs.page.screenshot({path:path.join(artifacts,`${engine}-d3-post-nojs-dark-1440.png`)});
        await nojs.context.close();
    });
}

for(const engine of engines) {
    test(`${engine}: D3 discovery grids, empty states and explicit Trending controls`,async()=>{
        for(const screen of ['popular','trending'])for(const mode of ['light','dark'])for(const empty of [false,true]) {
            const fixture=`d3-${screen}-${empty?'empty-':''}${mode}`;
            const {page,context,requests,errors}=await setup(engine,'browse',mode,{fixture,url:'/feed/'+screen});
            assert.equal(await page.locator('.page-heading h1').innerText(),screen==='popular'?'Popular':'Trending');
            if(empty) {
                assert.equal(await page.locator('.media-item').count(),0);
                assert.equal(await page.locator('.status-panel[role=status]').innerText(),'No results found.');
            } else {
                assert.ok(await page.locator('.media-grid > .media-item').count()>0);
                for(const [width,height]of[[1280,720],[1440,900],[1920,1080]]) {
                    await page.setViewportSize({width,height});
                    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,fixture+' '+width);
                }
                await page.setViewportSize({width:1440,height:900});
                await page.screenshot({path:path.join(artifacts,`${engine}-${fixture}-1440.png`)});
            }
            if(screen==='trending'&&!empty) {
                assert.deepEqual(await page.locator('#trending-type option').evaluateAll(options=>options.map(option=>option.value)),['Livestreams','Gaming']);
                assert.equal(await page.locator('#trending-type').inputValue(),'Gaming');
                assert.equal(await page.locator('.trending-filters button').innerText(),'Apply selected filters');
                assert.equal(await page.locator('#trending-region').inputValue(),'ID');
                const before=requests.filter(r=>r.url.pathname==='/feed/trending').length;
                await page.locator('#trending-region').selectOption('US');
                assert.equal(requests.filter(r=>r.url.pathname==='/feed/trending').length,before,'changing region does not fetch');
                await Promise.all([page.waitForNavigation(),page.locator('.trending-filters button[type=submit], .trending-filters button').click()]);
                const read=requests.filter(r=>r.url.pathname==='/feed/trending').at(-1);
                assert.equal(read.method,'GET');assert.equal(read.url.searchParams.get('region'),'US');assert.equal(read.url.searchParams.get('type'),'Gaming');
            }
            assert.deepEqual(errors,[]);await context.close();
        }
    });
    test(`${engine}: D3 private scoped channel search retains literal input through direct pagination`,async()=>{
        for(const javascript of [true,false]) {
            const {page,context,requests,errors}=await setup(engine,'browse','light',{fixture:'d3-channel-search-literal',url:'/channel/UCfixture/search',javascript});
            const input='\\https://youtu.be/aaaaaaaaaaa';
            assert.equal(await page.locator('#channel-search').inputValue(),input);
            assert.equal(await page.locator('#filters').count(),0);
            if(javascript) {
                await page.locator('[data-load-more]').click();
                await page.waitForFunction(()=>document.querySelector('[data-browse-region]').getAttribute('aria-busy')==='false');
                assert.equal(await page.evaluate(()=>InvidiousStorage.session.get('browse_state')),undefined);
            } else await Promise.all([page.waitForNavigation(),page.locator('.page-next-container form button').click()]);
            const sent=requests.filter(r=>r.method==='POST'&&r.url.pathname==='/channel/UCfixture/search');
            assert.equal(sent.length,1);assert.equal(sent[0].body.get('q'),input);assert.equal(sent[0].url.search,'');
            assert.equal(sent[0].body.get('page'),'3');
            assert.deepEqual(errors,[]);await context.close();
        }
    });
}

for(const engine of engines) {
    test(`${engine}: D3 stale restoration fingerprints and profile changes cannot mix views`,async()=>{
        const first=await setup(engine,'browse','light',{fixture:'qol-search-false-1',url:'/search?q=light'});
        await first.page.evaluate(()=>InvidiousStorage.session.set('browse_state',{views:[{id:history.state.ivBrowse,url:location.pathname+location.search,fingerprint:'f'.repeat(64),pages:[{url:'/search?q=light&page=3',method:'GET'}],scroll:400}]}));
        await first.page.reload();
        await first.page.waitForFunction(()=>document.body.dataset.uiInitialized==='true');
        assert.equal(await first.page.locator('[data-browse-items]>.media-item').count(),1);
        assert.ok(!first.requests.some(r=>r.url.searchParams.has('page')),'stale criteria are not replayed');
        assert.deepEqual(first.errors,[]);await first.context.close();
        let switched=false;
        const state=await setup(engine,'browse','light',{fixture:'qol-browse',reply:entry=>{
            if(entry.url.pathname!=='/feed/popular')return;
            if(entry.url.searchParams.has('page')) {
                switched=true;
                return{contentType:'text/html',headers:{'X-Invidious-Browser-Profile':'guest'},body:withProfile(fixtureHTML('qol-browse-next'),'guest')};
            }
            if(switched)return{contentType:'text/html',body:fixtureHTML('overhaul-browse-light')};
        }});
        await state.page.locator('[data-load-more]').click();
        await state.page.waitForFunction(()=>InvidiousStorage.scope==='guest'&&document.body.dataset.uiInitialized==='true');
        assert.equal(await state.page.locator('.media-grid>.media-item').count(),12,'new profile starts with its server-rendered view');
        assert.equal(await state.page.locator('[data-load-more]').count(),0,'the real Popular page has no synthetic continuation');
        assert.equal(await state.page.evaluate(()=>InvidiousStorage.session.get('browse_state')),undefined,'prior account descriptors are not read by the guest');
        assert.equal(state.requests.filter(r=>r.url.searchParams.has('page')).length,1,'profile failure never retries the read as the old account');
        assert.deepEqual(state.errors,[]);await state.context.close();
    });
    test(`${engine}: D3 a cached page cancels pending append and can load again after return`,async()=>{
        let held;
        const state=await setup(engine,'browse','light',{fixture:'qol-search-false-1',url:'/search?q=light',reply:entry=>{
            if(entry.url.pathname==='/search'&&entry.url.searchParams.has('page'))return{contentType:'text/html',body:fixtureHTML('qol-search-false-3')};
        }});
        const {page,context,errors}=state;
        const matcher='**/search?**page=2';
        await page.route(matcher,route=>{held=route;});
        await page.locator('[data-load-more]').click();
        await page.waitForFunction(()=>document.querySelector('[data-browse-region]').getAttribute('aria-busy')==='true');
        assert.ok(held);
        await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true})));
        await page.waitForFunction(()=>document.querySelector('[data-browse-region]').getAttribute('aria-busy')==='false');
        assert.equal(await page.locator('[data-browse-status]').innerText(),'','cached page does not retain a loading announcement');
        await held.fulfill({contentType:'text/html',body:fixtureHTML('qol-search-false-3')}).catch(()=>{});
        await page.unroute(matcher);
        assert.equal(await page.locator('[data-browse-items]>.media-item').count(),1,'canceled response was not appended');
        await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));
        await page.locator('[data-load-more]').click();
        await page.waitForFunction(()=>document.querySelectorAll('[data-browse-items]>.media-item').length===2);
        assert.deepEqual(errors,[]);await context.close();
    });
}

for(const engine of engines) {
    test(`${engine}: D3 append bound retains the current native Next destination`,async()=>{
        const {page,context,requests,errors}=await setup(engine,'browse','light',{fixture:'qol-search-false-1',url:'/search?q=light&duration=short',reply:entry=>{
            if(entry.url.pathname!=='/search'||!entry.url.searchParams.has('page'))return;
            const next=Number(entry.url.searchParams.get('page'))+1;
            return{contentType:'text/html',body:fixtureHTML('qol-search-false-1').replaceAll(/page=2/g,'page='+next)};
        }});
        for(let count=0;count<100;count++) {
            await page.locator('[data-load-more]').evaluate(button=>button.click());
            await page.waitForFunction(expected=>document.querySelectorAll('[data-browse-items]>.media-item').length===expected,count+2);
        }
        assert.equal(await page.locator('[data-load-more]').isVisible(),false);
        const next=page.locator('.page-next-container a');
        assert.equal(await next.isVisible(),true,'bounded append retains ordinary pagination');
        const url=new URL(await next.getAttribute('href'),page.url());
        assert.equal(url.searchParams.get('page'),'102');assert.equal(url.searchParams.get('q'),'light');
        assert.equal((await page.evaluate(()=>InvidiousStorage.session.get('browse_state'))).views.at(-1).pages.length,100);
        assert.equal(requests.filter(r=>r.url.pathname==='/search'&&r.url.searchParams.has('page')).length,100);
        await Promise.all([page.waitForNavigation(),next.click()]);
        assert.equal(new URL(page.url()).searchParams.get('page'),'102');
        assert.deepEqual(errors,[]);await context.close();
    });
}

for(const engine of engines) {
    test(`${engine}: D3 AI replacements and watched progress remain visible without extra metadata`,async()=>{
        for(const fixture of ['search-ai-thumbnails-diary','channel-ai-thumbnails-diary']) {
            const {page,context,requests,errors}=await setup(engine,'browse','dark',{fixture,url:fixture.startsWith('search')?'/search?q=videos':'/channel/UCfixture'});
            assert.equal(await page.locator('.ai-thumbnail').count(),2);
            const styles=await page.locator('.ai-thumbnail').evaluateAll(nodes=>nodes.map(node=>{
                const s=getComputedStyle(node),r=node.getBoundingClientRect();
                return{display:s.display,background:s.backgroundColor,color:s.color,weight:s.fontWeight,fit:node.scrollWidth<=node.clientWidth+1&&node.scrollHeight<=node.clientHeight+1,ratio:r.width/r.height};
            }));
            assert.ok(styles.every(s=>s.display==='flex'&&s.background==='rgb(32, 35, 38)'&&s.color==='rgb(133, 140, 147)'&&s.weight==='400'&&s.fit&&Math.abs(s.ratio-16/9)<.02));
            assert.equal(await page.locator('.media-item:has(.ai-thumbnail) .video-thumbnail img').count(),0);
            await page.screenshot({path:path.join(artifacts,`${engine}-d3-${fixture}-1440.png`)});
            assert.ok(!requests.some(r=>r.url.pathname.startsWith('/api/v1/videos/')));
            assert.deepEqual(errors,[]);await context.close();
        }
        const state=await setup(engine,'browse','light');
        const indicator=state.page.locator('.watched-indicator').first();
        const value=await indicator.evaluate(node=>({id:node.dataset.id,position:Number(node.dataset.length)/2}));
        await state.page.evaluate(value=>{InvidiousStorage.local.set('save_player_pos',{[value.id]:value.position});document.dispatchEvent(new Event('iv:library-change'));},value);
        await state.page.waitForFunction(()=>!document.querySelector('.watched-indicator').hidden);
        const style=await indicator.evaluate(node=>({width:node.style.width,background:getComputedStyle(node).backgroundColor,height:node.getBoundingClientRect().height}));
        assert.equal(style.width,'50%');assert.equal(style.height,3);assert.ok(!['transparent','rgba(0, 0, 0, 0)'].includes(style.background));
        assert.deepEqual(state.errors,[]);await state.context.close();
    });
}

for(const engine of engines) {
    test(`${engine}: D4 owned/saved library, seeds, forms and desktop geometry`,async()=>{
        for(const mode of ['light','dark']) {
            const {page,context,errors,requests}=await setup(engine,'browse',mode,{fixture:`d4-library-${mode}`,url:'/feed/playlists'});
            assert.equal(await page.locator('[data-library-playlist]').count(),4);
            assert.equal(await page.locator('[data-saved-playlist]').count(),3);
            assert.equal(await page.locator('[data-saved-playlist] a[href*="edit_playlist"]').count(),0);
            assert.ok((await page.locator('[data-saved-playlist="RDMixRadio"] h3 a').getAttribute('href')).includes('continuation=previous001'));
            assert.equal(await page.locator('[data-saved-playlist="IVshared"] a').last().textContent(),'Unsave playlist');
            assert.ok((await page.locator('[data-library-playlist="IVfixture2"] h3').textContent()).includes('<markup>'));
            for(const width of [1280,1440,1920]) {
                await page.setViewportSize({width,height:900});
                assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
                if(width===1440)await page.screenshot({path:path.join(artifacts,`${engine}-d4-library-${mode}-1440.png`),fullPage:true});
            }
            assert.ok(!requests.some(r=>r.url.pathname.startsWith('/api/v1/videos/')||r.url.pathname.startsWith('/api/v1/channels/')));
            assert.deepEqual(errors,[]);await context.close();
        }
        for(const kind of ['delete','unsave']) {
            const {page,context,requests}=await setup(engine,'browse','light',{fixture:`d4-${kind}-light`,url:'/delete_playlist?list=IVfixture',javascript:false});
            assert.equal(await page.locator('input[name=operation]').getAttribute('value'),kind==='delete'?'delete':'unsave');
            assert.ok((await page.locator('main').textContent()).includes(kind==='delete'?'Permanently delete':'original playlist'));
            await page.locator('main button[type=submit]').click();
            assert.equal(requests.filter(r=>r.method==='POST'&&r.url.pathname==='/delete_playlist').length,1);
            assert.equal(requests.find(r=>r.method==='POST'&&r.url.pathname==='/delete_playlist').body.get('csrf_token'),'fixture-csrf');
            await context.close();
        }
    });
    test(`${engine}: D4 playlist form failure keeps fields, guards duplicates and does not retry uncertain creation`,async()=>{
        let writes=0,release;
        const {page,context,errors,requests}=await setup(engine,'browse','light',{fixture:'d4-create-light',url:'/create_playlist',reply:async entry=>{
            if(entry.url.pathname==='/create_playlist'&&entry.method==='POST') {
                writes++;await new Promise(resolve=>release=resolve);
                return{status:400,contentType:'application/json',body:JSON.stringify({error:'Choose a valid privacy.',field:'privacy'})};
            }
        }});
        await page.locator('[name=title]').fill('Keep <my> draft');await page.locator('[name=privacy]').selectOption('Unlisted');
        assert.equal(writes,0);
        await page.locator('[data-playlist-form] button[type=submit]').click();
        await page.waitForFunction(()=>document.querySelector('[data-playlist-form]').getAttribute('aria-busy')==='true');
        await page.locator('[data-playlist-form]').evaluate(form=>form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
        assert.equal(writes,1);release();
        await page.waitForFunction(()=>document.querySelector('[data-playlist-form-status]').textContent.includes('valid privacy'));
        assert.equal(await page.locator('[name=title]').inputValue(),'Keep <my> draft');assert.equal(await page.locator('[name=privacy]').inputValue(),'Unlisted');
        assert.equal(await page.locator('[name=privacy]').getAttribute('aria-invalid'),'true');await assertFocus(page,'[name=privacy]');
        assert.deepEqual(errors,[]);await context.close();
        const state=await setup(engine,'browse','dark',{fixture:'d4-create-dark',url:'/create_playlist',reply:entry=>entry.method==='POST'&&entry.url.pathname==='/create_playlist'?{status:503,contentType:'application/json',body:'{}'}:null});
        await state.page.locator('[name=title]').fill('An uncertain new playlist');
        await state.page.locator('[data-playlist-form] button[type=submit]').click();
        await state.page.waitForFunction(()=>document.querySelector('[data-check-playlist]').hidden===false);
        assert.equal(await state.page.locator('[data-playlist-form] button[type=submit]').isDisabled(),true);
        assert.equal(await state.page.locator('[name=title]').inputValue(),'An uncertain new playlist');
        await state.page.locator('[data-playlist-form]').evaluate(form=>form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
        assert.equal(state.requests.filter(r=>r.method==='POST'&&r.url.pathname==='/create_playlist').length,1);
        assert.deepEqual(state.errors,[]);await state.context.close();
    });
    test(`${engine}: D4 add-items selects loaded rows, appends unchecked and retains partial failures without ambiguous retry`,async()=>{
        const next=fs.readFileSync(path.join(generated,'d4-add.html'),'utf8').replaceAll('00000000000','00000000010').replaceAll('00000000001','00000000011').replaceAll('00000000002','00000000012').replaceAll('page=2','page=3');
        const writes=[];
        const {page,context,requests,errors}=await setup(engine,'browse','light',{fixture:'d4-add',url:'/add_playlist_items?list=IVfixture&q=light',reply:entry=>{
            if(entry.url.pathname==='/add_playlist_items'&&entry.url.searchParams.get('page')==='2')return{contentType:'text/html',body:next};
            if(entry.url.pathname==='/playlist_ajax') { writes.push(entry);const id=entry.url.searchParams.get('video_id');return{status:id==='00000000000'?200:id==='00000000001'?403:503,contentType:'application/json',body:'{}'}; }
        }});
        await page.locator('#playlist-item-search').fill('No typing request');assert.equal(writes.length,0);
        assert.equal(await page.locator('.library-checkbox:visible').count(),0);
        await page.locator('[data-select-toggle]').click();await page.locator('[data-select-all]').click();
        assert.equal(await page.locator('[data-select-item]:checked').count(),3);
        assert.ok(!requests.some(r=>r.url.pathname==='/video_actions'));
        await page.locator('[data-load-more]').click();await page.waitForFunction(()=>document.querySelectorAll('[data-select-item]').length===6);
        assert.equal(await page.locator('[data-select-item]:checked').count(),3);
        assert.equal(await page.locator('.media-item').nth(3).locator('[data-select-item]').isChecked(),false);
        await page.locator('[data-batch-apply]').click();await page.waitForFunction(()=>document.querySelector('[data-collection-status]').textContent.includes('failed'));
        assert.equal(writes.length,3);assert.equal(await page.locator('[data-select-item]:checked').count(),2);
        assert.equal(await page.locator('[data-batch-apply]').isDisabled(),true);
        assert.ok((await page.locator('[data-collection-status] a').getAttribute('href')).includes('IVfixture'));
        assert.ok(writes.every(r=>r.body.get('csrf_token')==='fixture-token'));
        await page.locator('.media-item[data-video-id="00000000002"] [data-select-item]').uncheck();
        assert.equal(await page.locator('[data-batch-apply]').isEnabled(),true);
        assert.equal(writes.length,3);
        assert.deepEqual(errors,[]);await context.close();
    });
    test(`${engine}: D4 private playlist-item search keeps scope, literal input and continuation in POST only`,async()=>{
        const html=fs.readFileSync(path.join(generated,'d4-add-private.html'));
        const {page,context,requests,errors}=await setup(engine,'browse','light',{fixture:'d4-add-private',url:'/add_playlist_items',reply:entry=>entry.url.pathname==='/add_playlist_items'&&entry.method==='POST'?{contentType:'text/html',body:html}:null});
        assert.equal(await page.locator('.collection-search').getAttribute('method'),'post');
        assert.equal(await page.locator('#filters form').getAttribute('action'),'/add_playlist_items');
        assert.equal(await page.locator('#filters input[name=list]').getAttribute('value'),'IVfixture');
        assert.ok((await page.locator('#playlist-item-search').inputValue()).startsWith('\\https://'));
        await page.locator('[data-load-more]').click();await page.waitForFunction(()=>document.querySelectorAll('.media-item').length===6);
        const continuation=requests.find(r=>r.method==='POST'&&r.url.pathname==='/add_playlist_items');
        assert.equal(continuation.body.get('list'),'IVfixture');assert.equal(continuation.body.get('region'),'ID');assert.equal(continuation.body.get('page'),'2');
        assert.ok(continuation.body.get('q').startsWith('\\https://'));
        assert.ok(!requests.some(r=>r.url.href.includes('example.com')));
        assert.equal(await page.evaluate(()=>!!(history.state&&history.state.ivBrowse)),false);
        assert.deepEqual(errors,[]);await context.close();
        const nojs=await setup(engine,'browse','light',{fixture:'d4-add-private',url:'/add_playlist_items',javascript:false});
        assert.equal(await nojs.page.locator('.page-next-container form').getAttribute('method'),'post');
        await nojs.page.locator('.page-next-container button').click();
        assert.equal(nojs.requests.find(r=>r.method==='POST'&&r.url.pathname==='/add_playlist_items').body.get('list'),'IVfixture');await nojs.context.close();
    });
    test(`${engine}: D4 real playlist rows retain occurrence strings and canonical positions, serialize selection and reject stale order`,async()=>{
        let committed,fail=false,release;
        const {page,context,errors,requests}=await setup(engine,'browse','light',{fixture:'d4-playlist-light',url:'/playlist?list=IVfixture&page=2',reply:async entry=>{
            if(entry.url.pathname==='/playlist_ajax') {
                if(fail)return{status:409,contentType:'application/json',body:'{}'};
                await new Promise(resolve=>release=resolve);
                return{contentType:'application/json',body:savedPlaylistOrder(entry,committed,100,205)};
            }
            if(entry.url.pathname==='/video_actions')return{contentType:'application/json',body:JSON.stringify({playlists:[{id:'IVother',title:'Another list'}],defaultPlaylist:'IVother'})};
        }});
        const order=()=>page.locator('[data-occurrence]').evaluateAll(rows=>rows.map(row=>row.dataset.occurrence));
        const initial=await order();committed=initial.slice();assert.ok(BigInt(initial[0])>9007199254740991n);
        assert.deepEqual(await page.locator('.playlist-position').allTextContents(),['101','102','103','104','105','106']);
        assert.ok((await page.locator('[data-occurrence] .media-title a').first().getAttribute('href')).includes('index=100&occurrence='+initial[0]));
        await page.locator('.playlist-grip').first().press('Space');await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');
        await page.waitForFunction(()=>document.querySelector('[data-select-toggle]').disabled);
        assert.deepEqual(await order(),initial);release();
        await page.waitForFunction(()=>document.querySelector('[data-order-status]').textContent.startsWith('Playlist order saved.'));
        assert.deepEqual(await order(),[initial[1],initial[0],...initial.slice(2)]);
        assert.deepEqual(await page.locator('.playlist-position').allTextContents(),['101','102','103','104','105','106']);
        assert.equal(requests.find(r=>r.url.pathname==='/playlist_ajax').body.get('include_positions'),'1');
        await page.locator('[data-select-toggle]').click();assert.equal(await page.locator('.playlist-grip:enabled').count(),0);
        await page.locator('[data-select-toggle]').click();fail=true;
        const before=await order();await page.locator('.playlist-grip').first().press('Space');await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');
        await page.waitForFunction(()=>document.querySelector('.media-rows[data-playlist-id]').getAttribute('aria-invalid')==='true');
        assert.deepEqual(await order(),before);assert.equal(await page.locator('.playlist-grip:enabled').count(),0);
        await page.waitForFunction(()=>document.activeElement.matches('#ui-notice .ui-retry'));
        assert.equal(requests.filter(r=>r.url.pathname==='/playlist_ajax').length,2);
        assert.equal(await page.getByRole('button',{name:/Move up|Move down/}).count(),0);
        await page.screenshot({path:path.join(artifacts,`${engine}-d4-playlist-stale-1440.png`),fullPage:true});
        assert.deepEqual(errors,[]);await context.close();
    });
    test(`${engine}: D4 history merges adjacent date groups, keeps unknown metadata and removes explicitly`,async()=>{
        const {page,context,requests,errors}=await setup(engine,'browse','light',{fixture:'d4-history-light',url:'/feed/history?max_results=2&page=1',reply:entry=>{
            if(entry.url.pathname==='/feed/history'&&['2','3'].includes(entry.url.searchParams.get('page')))return{contentType:'text/html',body:fs.readFileSync(path.join(generated,`d4-history-page-${entry.url.searchParams.get('page')}.html`))};
            if(entry.url.pathname==='/watch_ajax')return{contentType:'application/json',body:'{}'};
        }});
        assert.equal(await page.locator('.history-group').count(),1);assert.equal(await page.locator('.media-item').count(),2);
        await page.locator('[data-load-more]').click();await page.waitForFunction(()=>document.querySelectorAll('.media-item').length===4);
        assert.equal(await page.locator('.history-group').count(),2);assert.equal(await page.locator('.history-group').first().locator('.media-item').count(),3);
        await page.locator('[data-load-more]').click();await page.waitForFunction(()=>document.querySelectorAll('.media-item').length===5);
        assert.equal(await page.locator('.history-group').count(),3);assert.equal(await page.locator('.history-group').last().locator('.media-meta').textContent().then(t=>/1970|NaN/.test(t)),false);
        await page.locator('.media-item').last().locator('summary').click();await page.locator('.media-item').last().locator('[data-collection-action=remove]').evaluate(form=>{form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));});
        await page.waitForFunction(()=>document.querySelectorAll('.media-item').length===4);
        assert.equal(await page.locator('.history-group').count(),2);assert.equal(await page.locator('#count').textContent(),'4');
        assert.equal(requests.filter(r=>r.url.pathname==='/watch_ajax').length,1);
        await page.evaluate(()=>window.scrollTo(0,0));
        await page.screenshot({path:path.join(artifacts,`${engine}-d4-history-1440.png`),fullPage:true});
        assert.deepEqual(errors,[]);await context.close();
        const paused=await setup(engine,'browse','dark',{fixture:'d4-history-paused',url:'/feed/history',reply:entry=>entry.url.pathname==='/api/v1/auth/playback'?{contentType:'application/json',body:JSON.stringify({positions:{'00000000000':500},watched:['00000000000','00000000001']})}:null});
        assert.ok((await paused.page.locator('main').textContent()).includes('History recording is off'));
        assert.equal(await paused.page.locator('.media-item').count(),2);
        await paused.page.waitForFunction(()=>document.querySelector('.watched-indicator').style.width==='50%');
        assert.equal(await paused.page.locator('[data-batch-operation] option[value=remove]').count(),0);
        assert.equal(await paused.page.locator('[data-collection-action=remove] button:enabled').count(),0);
        await paused.context.close();
        const clear=await setup(engine,'browse','light',{fixture:'d4-clear-history',url:'/clear_watch_history',javascript:false});
        assert.ok((await clear.page.locator('main').textContent()).includes('playback positions'));
        assert.equal(await clear.page.locator('main a').getAttribute('href'),'/feed/history');await clear.context.close();
    });
    test(`${engine}: D4 manager keeps cached statistics and failed selections after confirmed bulk unsubscribe`,async()=>{
        const {page,context,requests,errors}=await setup(engine,'browse','light',{fixture:'avatars-manager-diary',url:'/subscription_manager',reply:entry=>entry.url.pathname==='/subscription_ajax'?{status:entry.url.searchParams.get('c')==='UCdirect'?200:403,contentType:'application/json',body:'{}'}:null});
        assert.equal(await page.locator('.subscription-row').count(),3);assert.equal(await page.locator('.subscription-statistics').count(),3);
        assert.ok(!requests.some(r=>r.url.pathname.startsWith('/api/v1/channels/')));
        await page.locator('[data-select-toggle]').click();await page.locator('[data-select-all]').click();await page.locator('[data-batch-apply]').click();
        assert.equal(requests.filter(r=>r.url.pathname==='/subscription_ajax').length,0);
        await page.locator('[data-batch-confirm] button[value=confirm]').click();
        await page.waitForFunction(()=>document.querySelectorAll('.subscription-row').length===2);
        await page.waitForFunction(()=>document.querySelector('[data-collection-status]').textContent.includes('failed'));
        assert.equal(await page.locator('[data-select-item]:checked').count(),2);assert.equal(await page.locator('#count').textContent(),'2');
        assert.equal(requests.filter(r=>r.url.pathname==='/subscription_ajax').length,3);
        await page.screenshot({path:path.join(artifacts,`${engine}-d4-manager-partial-1440.png`),fullPage:true});
        assert.deepEqual(errors,[]);await context.close();
    });
    test(`${engine}: D4 subscriptions apply view choices explicitly and incoming uploads only offer refresh`,async()=>{
        const fakeSSE="window.fakeStreams=[];window.SSE=function(url,options){this.listeners={};this.url=url;this.options=options;this.addEventListener=(event,fn)=>this.listeners[event]=fn;this.stream=()=>{};this.close=()=>this.closed=true;window.fakeStreams.push(this)};";
        const {page,context,requests,errors}=await setup(engine,'browse','light',{fixture:'d4-subscriptions-light',url:'/feed/subscriptions',init:()=>{
            window.permissionCalls=0;window.Notification=function(title,options){window.lastBrowserNotification={title,options};};Notification.permission='default';Notification.requestPermission=async()=>{window.permissionCalls++;Notification.permission='granted';return'granted';};
        },reply:entry=>{
            if(entry.url.pathname==='/js/sse.js')return{contentType:'application/javascript',body:fakeSSE};
            if(entry.url.pathname==='/api/v1/auth/subscriptions')return{contentType:'application/json',body:JSON.stringify([{authorId:'UC'+'a'.repeat(22)}])};
        }});
        const initial=await page.locator('.media-item').evaluateAll(rows=>rows.map(row=>row.dataset.videoId));
        assert.equal(await page.locator('#subscription-sort option:checked').textContent(),'Newest uploads first');
        await page.locator('[name=latest_only][type=checkbox]').check();await page.locator('#subscription-sort').selectOption('alphabetically');
        assert.equal(await page.locator('#subscription-sort option:checked').textContent(),'Title A–Z');
        assert.equal(await page.locator('[data-notification-status]').isVisible(),false);
        assert.ok(!requests.some(r=>r.url.pathname==='/preferences'&&r.method==='POST'));assert.equal(await page.evaluate(()=>permissionCalls),0);
        await page.locator('details:has([data-browser-notifications]) > summary').click();await page.locator('[data-browser-notifications]').click();assert.equal(await page.evaluate(()=>permissionCalls),1);
        try {
        await page.waitForFunction(()=>{const r=document.querySelector('[data-browser-notifications]').closest('.menu-content').getBoundingClientRect();return r.left>=8&&r.right<=innerWidth-8&&r.top>=8&&r.bottom<=innerHeight-8;});
        } catch(error) {
            const bounds=await page.locator('[data-browser-notifications]').evaluate(button=>{const panel=button.closest('.menu-content'),r=panel.getBoundingClientRect();return{open:button.closest('details').open,focus:document.activeElement.outerHTML.slice(0,160),left:r.left,right:r.right,top:r.top,bottom:r.bottom,viewport:[innerWidth,innerHeight],style:panel.style.cssText,status:panel.querySelector('[data-notification-status]').textContent};});
            await page.screenshot({path:path.join(artifacts,`${engine}-d4-permission-menu-1440.png`),fullPage:true});
            throw new Error(JSON.stringify(bounds)+'; '+error.message);
        }
        assert.equal(await page.locator('[data-notification-status]').isVisible(),true);
        assert.equal(await page.evaluate(()=>document.activeElement===document.querySelector('[data-browser-notifications]').closest('details').querySelector('summary')),true);
        await page.screenshot({path:path.join(artifacts,`${engine}-d4-permission-menu-1440.png`),fullPage:true});
        await page.keyboard.press('Escape');
        await page.waitForFunction(()=>window.fakeStreams&&fakeStreams.length===1);
        await page.evaluate(()=>fakeStreams[0].onmessage({id:'one',data:JSON.stringify({videoId:'abcdefghijk',authorId:'UC'+'a'.repeat(22),author:'Studio North',title:'Fresh upload',published:Math.ceil(Date.now()/1000)+1})}));
        await page.waitForFunction(()=>!document.querySelector('[data-subscription-updates]').hidden);
        assert.deepEqual(await page.locator('.media-item').evaluateAll(rows=>rows.map(row=>row.dataset.videoId)),initial);
        assert.equal(await page.locator('header [href*="#bell"]').count(),0);
        assert.equal(await page.evaluate(()=>lastBrowserNotification.options.body),'Fresh upload');
        await page.screenshot({path:path.join(artifacts,`${engine}-d4-subscriptions-notice-1440.png`),fullPage:true});
        await page.locator('[data-subscription-updates] a').click();
        assert.ok(requests.filter(r=>r.url.pathname==='/feed/subscriptions'&&r.navigation).length>=2);
        await page.locator('[name=latest_only][type=checkbox]').check();await page.locator('#subscription-sort').selectOption('alphabetically');
        await page.locator('.subscription-filters button[type=submit]').click();
        const applied=requests.filter(r=>r.url.pathname==='/feed/subscriptions'&&r.navigation).at(-1);
        assert.equal(applied.url.searchParams.get('sort'),'alphabetically');assert.equal(applied.url.searchParams.getAll('latest_only').at(-1),'1');
        assert.ok(!requests.some(r=>r.url.pathname==='/preferences'&&r.method==='POST'));
        assert.deepEqual(errors,[]);await context.close();
    });
}

for(const engine of engines) {
    test(`${engine}: D4 cached-page interruption stops a batch and blocks the uncertain occurrence on return`,async()=>{
        const {page,context,errors}=await setup(engine,'browse','light',{fixture:'d4-add',url:'/add_playlist_items?list=IVfixture',init:holdPlaylistWrites});
        await page.locator('[data-select-toggle]').click();await page.locator('[data-select-all]').click();await page.locator('[data-batch-apply]').click();
        await page.waitForFunction(()=>document.querySelector('[data-collection]').dataset.collectionBusy==='true');
        assert.equal(await page.evaluate(()=>delayedPlaylistWrites.length),1);
        await page.evaluate(()=>{window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}));window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));});
        await page.evaluate(async()=>{delayedPlaylistWrites[0].release();await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);});
        await page.waitForFunction(()=>!document.querySelector('[data-select-toggle]').disabled);
        assert.equal(await page.evaluate(()=>delayedPlaylistWrites.length),1,'returning must not resume the old write loop');
        assert.equal(await page.locator('[data-select-item]:checked').count(),3);
        assert.equal(await page.locator('[data-batch-apply]').isDisabled(),true);
        await page.locator('[data-batch-apply]').evaluate(button=>button.click());assert.equal(await page.evaluate(()=>delayedPlaylistWrites.length),1);
        assert.ok(await page.locator('[data-collection-status] a').isVisible());
        assert.deepEqual(errors,[]);await context.close();
    });
    test(`${engine}: D4 subscription controls verify actual membership after failures and only retry the read`,async()=>{
        let subscribed=false,posts=0,readFailure=false;const id='UC'+'a'.repeat(22);
        const {page,context,requests,errors}=await setup(engine,'browse','light',{fixture:'d4-channel-subscription',url:'/channel/'+id,reply:entry=>{
            if(entry.url.pathname==='/subscription_ajax'){
                posts++;if(posts===1)return{status:403,contentType:'application/json',body:'{}'};
                subscribed=entry.url.searchParams.get('action')==='create_subscription_to_channel';readFailure=posts===3;
                return{contentType:'application/json',body:'{}'};
            }
            if(entry.url.pathname==='/api/v1/auth/subscriptions')return{status:readFailure?503:200,contentType:'application/json',body:JSON.stringify(subscribed?[{authorId:id}]:[])};
        }});
        const button=page.locator('[data-channel-subscription] > button');
        await button.click();await page.waitForFunction(()=>!document.querySelector('[data-channel-subscription] button').disabled);
        assert.equal(await button.textContent(),'Subscribe');assert.ok(!(await page.locator('[data-subscription-status]').textContent()).includes('Saved'));
        assert.equal(posts,1);await button.click();await page.waitForFunction(()=>document.querySelector('[data-channel-subscription] button').dataset.type==='unsubscribe');
        assert.equal(await button.textContent(),'Unsubscribe');assert.equal(posts,2);
        await button.click();await page.waitForFunction(()=>document.querySelector('[data-subscription-status] button'));
        assert.equal(await button.isDisabled(),true);assert.equal(posts,3);readFailure=false;
        await page.locator('[data-subscription-status] button').click();await page.waitForFunction(()=>document.querySelector('[data-channel-subscription] button').dataset.type==='subscribe');
        assert.equal(await button.isEnabled(),true);assert.equal(posts,3,'Retry verifies the read without repeating the mutation');
        assert.ok(requests.filter(r=>r.url.pathname==='/subscription_ajax').every(r=>r.body.get('csrf_token')==='fixture-token'));
        assert.deepEqual(errors,[]);await context.close();
    });
    test(`${engine}: D4 Save dialog retains uncertain creation drafts and never repeats an ambiguous addition`,async()=>{
        const {page,context,requests,errors}=await setup(engine,'playlist','light',{reply:entry=>{
            if(entry.url.pathname==='/video_actions')return{contentType:'application/json',body:JSON.stringify({playlists:[{id:'IVtarget',title:'Field notes'}],defaultPlaylist:'IVtarget'})};
            if(entry.url.pathname==='/playlist_ajax'||entry.url.pathname==='/create_playlist'&&entry.method==='POST')return{status:503,contentType:'application/json',body:'{}'};
        }});
        const menu=page.locator('.video-context').first();await menu.locator('summary').click();await menu.locator('[data-video-action=playlist]').click();
        await page.waitForFunction(()=>document.querySelector('#video-playlist-select').options.length===1);
        await page.locator('#video-playlist-save button[type=submit]').click();await page.waitForFunction(()=>document.querySelector('#video-playlist-status a'));
        assert.equal(await page.locator('#video-playlist-save button[type=submit]').isDisabled(),true);
        await page.locator('#video-playlist-reload').click();await page.waitForFunction(()=>!document.querySelector('#video-playlist-reload').disabled);
        assert.equal(await page.locator('#video-playlist-save button[type=submit]').isDisabled(),true);
        assert.equal(requests.filter(r=>r.url.pathname==='/playlist_ajax').length,1);
        await page.locator('#video-playlist-create-details > summary').click();await page.locator('#video-playlist-title').fill('Keep <this> creation draft');await page.locator('#video-playlist-privacy').selectOption('Private');
        await page.locator('#video-playlist-create button[type=submit]').click();await page.waitForFunction(()=>document.querySelector('#video-playlist-status a[href="/feed/playlists"]'));
        assert.equal(await page.locator('#video-playlist-create button[type=submit]').isDisabled(),true);
        assert.equal(await page.locator('#video-playlist-title').inputValue(),'Keep <this> creation draft');
        assert.equal(await page.locator('#video-playlist-privacy').inputValue(),'Private');
        await page.locator('#video-playlist-dialog .dialog-close').click();await menu.locator('summary').click();await menu.locator('[data-video-action=playlist]').click();
        await page.waitForFunction(()=>!document.querySelector('#video-playlist-reload').disabled);
        assert.equal(await page.locator('#video-playlist-title').inputValue(),'Keep <this> creation draft');
        assert.equal(await page.locator('#video-playlist-create button[type=submit]').isDisabled(),true);
        assert.equal(requests.filter(r=>r.url.pathname==='/create_playlist'&&r.method==='POST').length,1);
        assert.equal(requests.filter(r=>r.url.pathname==='/playlist_ajax').length,1);
        assert.deepEqual(errors,[]);await context.close();
    });
    test(`${engine}: D4 playlist forms keep no-JavaScript failed values and navigate after confirmed JSON saves`,async()=>{
        for(const kind of ['create','edit']) {
            const state=await setup(engine,'browse','light',{fixture:`d4-${kind}-failed`,url:`/${kind}_playlist?list=IVfixture`,javascript:false});
            assert.equal(await state.page.locator('[name=title]').inputValue(),'Keep my <typed> & quoted draft');
            assert.equal(await state.page.locator('[name=privacy]').inputValue(),'Unlisted');
            if(kind==='edit')assert.equal(await state.page.locator('[name=description]').inputValue(),'Keep this </textarea> & description.');
            assert.equal(await state.page.locator('[data-playlist-form]').getAttribute('method'),'post');await state.context.close();
            const id=kind==='edit'?'IVfixture':'IVcreated';
            const {page,context,requests,errors}=await setup(engine,'browse','light',{fixture:`d4-${kind}-light`,url:`/${kind}_playlist?list=IVfixture`,reply:entry=>{
                if(entry.url.pathname===`/${kind}_playlist`&&entry.method==='POST')return{contentType:'application/json',body:JSON.stringify({playlistId:id,title:'A confirmed draft',privacy:'Unlisted',description:'Retained description'})};
                if(entry.url.pathname==='/playlist'&&entry.navigation)return{contentType:'text/html',body:fs.readFileSync(path.join(generated,'d4-playlist-empty.html'),'utf8').replaceAll('IVfixture',id).replaceAll('Light and motion — field notes','A confirmed draft')};
            }});
            await page.locator('[name=title]').fill('A confirmed draft');await page.locator('[name=privacy]').selectOption('Unlisted');
            await page.locator('[data-playlist-form] button[type=submit]').click();await page.waitForURL(url=>url.pathname==='/playlist'&&url.searchParams.get('list')===id);
            assert.equal(await page.locator('main h1').textContent(),'A confirmed draft');
            const write=requests.find(r=>r.method==='POST'&&r.url.pathname===`/${kind}_playlist`);
            assert.equal(write.body.get('title'),'A confirmed draft');assert.equal(write.body.get('privacy'),'Unlisted');assert.equal(write.body.get('csrf_token'),'fixture-csrf');
            assert.deepEqual(errors,[]);await context.close();
        }
    });
    test(`${engine}: D4 grip scrolling uses the same pointer and canceled page lifetimes cannot apply a late order`,async()=>{
        const html=fs.readFileSync(path.join(generated,'d4-playlist-light.html'),'utf8');
        const long=html.replace(/(<article class="media-item[^]*?<\/article>)/,match=>Array.from({length:12},(_,i)=>match.replace(/data-occurrence="[0-9]+"/,`data-occurrence="${9007199254742000n+BigInt(i)}"`)).join(''));
        const {page,context,requests,errors}=await setup(engine,'browse','light',{fixture:'d4-playlist-light',url:'/playlist?list=IVfixture&page=2',init:holdPlaylistWrites,reply:entry=>entry.navigation&&entry.url.pathname==='/playlist'?{contentType:'text/html',body:long}:null});
        const handle=page.locator('.playlist-grip').first();await handle.scrollIntoViewIfNeeded();const box=await handle.boundingBox();
        await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2,875,{steps:10});
        await page.waitForFunction(()=>scrollY>60);
        assert.equal(await page.evaluate(()=>delayedPlaylistWrites.length),0);
        await page.mouse.up();await page.waitForFunction(()=>document.querySelectorAll('.playlist-grip:enabled').length===0);
        const before=await page.locator('[data-occurrence]').evaluateAll(rows=>rows.map(row=>row.dataset.occurrence));
        await page.evaluate(()=>{window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}));window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));});
        await page.evaluate(async()=>{delayedPlaylistWrites[0].release();await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);});
        await page.waitForFunction(()=>document.querySelector('.media-rows[data-playlist-id]').getAttribute('aria-invalid')==='true');
        assert.deepEqual(await page.locator('[data-occurrence]').evaluateAll(rows=>rows.map(row=>row.dataset.occurrence)),before);
        assert.equal(await page.evaluate(()=>delayedPlaylistWrites.length),1);assert.equal(await page.locator('.playlist-grip:enabled').count(),0);
        assert.deepEqual(errors,[]);await context.close();
    });
}

for(const engine of engines) {
    test(`${engine}: D4 confirmed occurrence removal reconciles the count and every surviving ordinal`,async()=>{
        let original;
        const {page,context,requests,errors}=await setup(engine,'browse','light',{fixture:'d4-playlist-light',url:'/playlist?list=IVfixture&page=2',reply:entry=>{
            if(entry.url.pathname==='/playlist_ajax') {
                const removed=entry.url.searchParams.get('set_video_id'),remaining=original.filter(id=>id!==removed);
                return{contentType:'application/json',body:JSON.stringify({positions:Object.fromEntries(remaining.map((id,i)=>[id,101+i])),total:204,countText:'204 videos'})};
            }
        }});
        original=await page.locator('[data-occurrence]').evaluateAll(rows=>rows.map(row=>row.dataset.occurrence));
        await page.locator('[data-occurrence]').first().locator('summary').click();await page.locator('[data-occurrence]').first().locator('[data-collection-action=remove] button').click();
        await page.waitForFunction(()=>document.querySelectorAll('[data-occurrence]').length===5);
        assert.deepEqual(await page.locator('[data-occurrence]').evaluateAll(rows=>rows.map(row=>row.dataset.occurrence)),original.slice(1));
        assert.deepEqual(await page.locator('.playlist-position').allTextContents(),['101','102','103','104','105']);
        assert.equal(await page.locator('[data-playlist-count]').textContent(),'204 videos');
        assert.equal(requests.filter(r=>r.url.pathname==='/playlist_ajax').length,1);assert.equal(requests.find(r=>r.url.pathname==='/playlist_ajax').body.get('include_positions'),'1');
        assert.deepEqual(errors,[]);await context.close();
    });
}

for(const engine of engines) {
    test(`${engine}: D4 signed-in discovery keeps selection and duplicate watched progress through appended pages`,async()=>{
        const {page,context,requests,errors}=await setup(engine,'browse','light',{fixture:'qol-browse',url:'/feed/popular',reply:entry=>{
            if(entry.url.pathname==='/feed/popular'&&entry.url.searchParams.get('page')==='2')return{contentType:'text/html',body:fs.readFileSync(path.join(generated,'qol-browse-next.html'))};
            if(entry.url.pathname==='/video_actions')return{contentType:'application/json',body:JSON.stringify({playlists:[{id:'IVtarget',title:'Field notes'}],defaultPlaylist:'IVtarget'})};
            if(entry.url.pathname==='/watch_ajax')return{contentType:'application/json',body:'{}'};
        }});
        await page.locator('[data-select-toggle]').click();await page.locator('[data-select-all]').click();
        assert.equal(await page.locator('[data-select-item]:checked').count(),12);
        await page.locator('[data-load-more]').click();await page.waitForFunction(()=>document.querySelectorAll('.media-item').length===24);
        assert.equal(await page.locator('[data-select-item]:checked').count(),12);
        await page.locator('[data-select-clear]').click();await page.locator('[data-select-item]').first().check();
        await page.locator('[data-batch-operation]').selectOption('watched');await page.locator('[data-batch-apply]').click();
        await page.waitForFunction(()=>document.querySelectorAll('.watched-indicator[data-id="00000000000"][data-watched=true]:not([hidden])').length===2);
        await page.locator('[data-select-item]').first().check();await page.locator('[data-batch-operation]').selectOption('unwatched');await page.locator('[data-batch-apply]').click();
        await page.waitForFunction(()=>document.querySelectorAll('.watched-indicator[data-id="00000000000"][data-watched=false][hidden]').length===2);
        assert.equal(requests.filter(r=>r.url.pathname==='/watch_ajax').length,2);
        assert.deepEqual(errors,[]);await context.close();
    });
    test(`${engine}: D4 inline failures retain manager rows and stale profiles disable the owner before reloading`,async()=>{
        let mismatch=false,report;const observed=new Promise(resolve=>report=resolve);
        const {page,context,requests,errors}=await setup(engine,'browse','light',{fixture:'avatars-manager-diary',url:'/subscription_manager',reply:entry=>{
            if(entry.url.pathname==='/subscription_ajax')return{status:mismatch?200:503,contentType:'application/json',headers:mismatch?{'X-Invidious-Browser-Profile':'f'.repeat(64)}:{},body:'{}'};
            if(mismatch&&entry.navigation)return{contentType:'text/html',body:fs.readFileSync(path.join(generated,'overhaul-browse-light.html'))};
        }});
        await page.exposeFunction('recordD4Profile',report);
        await page.evaluate(()=>window.addEventListener('browserprofilechange',()=>window.recordD4Profile({rows:document.querySelectorAll('.subscription-row').length,blocked:Array.from(document.querySelectorAll('[data-collection-action] button')).every(button=>button.disabled)}),{once:true}));
        const form=page.locator('.subscription-row [data-collection-action=unsubscribe]').first();
        await form.locator('button').click();await page.waitForFunction(()=>document.querySelector('[data-collection-status]').textContent.includes('Could not complete'));
        assert.equal(await page.locator('.subscription-row').count(),3);assert.equal(requests.filter(r=>r.url.pathname==='/subscription_ajax').length,1);
        mismatch=true;await form.locator('button').click();const snapshot=await observed;
        assert.deepEqual(snapshot,{rows:3,blocked:true});await page.waitForFunction(()=>document.body.dataset.uiInitialized==='true'&&!InvidiousUI.config.signedIn);
        assert.equal(requests.filter(r=>r.url.pathname==='/subscription_ajax').length,2);
        assert.deepEqual(errors,[]);await context.close();
    });
}

for(const engine of engines) {
    test(`${engine}: D4 light/dark screen matrix fits desktop widths and retains real mix save forms`,async()=>{
        const screens=[['library','/feed/playlists'],['playlist','/playlist?list=IVfixture&page=2'],['subscriptions','/feed/subscriptions'],['history','/feed/history?max_results=2'],['manager','/subscription_manager'],['mix','/mix?list=RDabcdefghijk&continuation=abcdefghijk'],['create','/create_playlist'],['edit','/edit_playlist?list=IVfixture'],['delete','/delete_playlist?list=IVfixture'],['unsave','/delete_playlist?list=IVfixture']];
        for(const mode of ['light','dark'])for(const [screen,url] of screens) {
            const {page,context,requests,errors}=await setup(engine,'browse',mode,{fixture:`d4-${screen}-${mode}`,url});
            for(const width of [1280,1440,1920]) {
                await page.setViewportSize({width,height:900});
                assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${screen}/${mode}/${width} fits`);
                if(width===1440) { await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:path.join(artifacts,`${engine}-d4-${screen}-${mode}-1440.png`),fullPage:true}); }
            }
            if(screen==='mix') {
                const target=new URL(await page.locator('main form[action^="/subscribe_playlist"]').getAttribute('action'),'https://invidious.test');
                assert.equal(target.searchParams.get('list'),'RDabcdefghijk');assert.equal(target.searchParams.get('continuation'),'abcdefghijk');
                assert.equal(await page.locator('main form[action^="/subscribe_playlist"] input[name=csrf_token]').getAttribute('value'),'fixture-token');
                assert.equal(await page.locator('.playlist-grip').count(),0);
            }
            if(['create','edit'].includes(screen)) {
                await page.setViewportSize({width:1280,height:900});await page.addStyleTag({content:'body{font-size:20px}input,select,textarea,button{font-size:20px}'});
                await page.evaluate(()=>{document.documentElement.dir='rtl';document.documentElement.lang='ar';});
                assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
                await page.screenshot({path:path.join(artifacts,`${engine}-d4-${screen}-${mode}-rtl-enlarged.png`),fullPage:true});
            }
            assert.ok(!requests.some(r=>r.url.pathname.startsWith('/api/v1/videos/')||r.url.pathname.startsWith('/api/v1/channels/')));
            assert.deepEqual(errors,[]);await context.close();
        }
    });
}

for(const engine of engines) {
    test(`${engine}: D5 production layout and utility tabs preserve the same paused media`,async()=>{
        const {page,context,errors,requests}=await setup(engine,'watch','light',{fixture:'d5-single-light',url:'/watch?v=2isYuQZMbdU',reply:entry=>{
            if(entry.navigation&&entry.url.searchParams.get('v')==='abcdefghijk')return{contentType:'text/html',body:fs.readFileSync(path.join(generated,'d5-second-light.html'))};
        }});
        await page.waitForFunction(()=>window.player&&typeof player.play==='function');
        await page.evaluate(async()=>{player.muted(true);await player.play();player.pause();player.currentTime(.25);player.playbackRate(1.25);window.originalMedia=player.tech().el();window.originalPlayer=player;});
        await page.waitForFunction(()=>player.currentTime()>=.2);
        assert.equal(await page.locator('[role=tab][aria-selected=true]').textContent(),'Up next');
        assert.ok(!requests.some(r=>r.url.pathname.startsWith('/api/v1/transcripts/')));
        await page.getByRole('tab',{name:'Transcript',exact:true}).click();
        await page.locator('.transcript-line').first().waitFor();
        await page.getByRole('tab',{name:'Up next',exact:true}).click();
        await page.getByRole('button',{name:'Theater mode',exact:true}).click();
        assert.equal(await page.locator('body').getAttribute('data-watch-layout'),'theater');
        assert.equal(await page.evaluate(()=>player===originalPlayer&&player.tech().el()===originalMedia&&player.paused()&&player.playbackRate()===1.25),true);
        assert.ok(await page.evaluate(()=>Math.abs(player.currentTime()-.25)<.08));
        assert.equal(await page.locator('video,audio').count(),1);
        await page.screenshot({path:path.join(artifacts,`${engine}-d5-theater-light-1440.png`),fullPage:true});
        await page.goto('https://invidious.test/watch?v=abcdefghijk');
        await page.waitForFunction(()=>document.body.dataset.watchLayout==='theater');
        assert.equal(await page.evaluate(()=>video_data.id),'abcdefghijk');
        await page.reload();await page.waitForFunction(()=>document.body.dataset.watchLayout==='theater');
        await page.evaluate(async()=>{player.muted(true);await player.play();player.pause();});
        await page.getByRole('button',{name:'Standard mode',exact:true}).click();
        assert.equal(await page.evaluate(()=>InvidiousStorage.local.get('watch_layout')),'standard');
        assert.deepEqual(errors,[]);await context.close();
    });
    test(`${engine}: D5 player Settings delegates speed and captions and keeps docking off by default`,async()=>{
        const {page,context,errors}=await setup(engine,'watch','dark',{fixture:'d5-single-dark',url:'/watch?v=2isYuQZMbdU',reply:entry=>{
            if(entry.url.pathname.startsWith('/api/v1/captions/'))return{contentType:'text/vtt',body:'WEBVTT\n\n00:00.000 --> 00:05.000\nFixture caption\n'};
        }});
        await page.waitForFunction(()=>window.player&&typeof player.play==='function');
        await page.evaluate(async()=>{player.muted(true);await player.play();player.pause();player.currentTime(.25);player.playbackRate(1.1);window.originalMedia=player.tech().el();});
        await page.waitForFunction(()=>player.playbackRate()===1.1);
        assert.ok(await page.locator('.vjs-play-control').evaluate(el=>el.getBoundingClientRect().left<document.querySelector('.vjs-desktop-settings').getBoundingClientRect().left),'Settings follows the playback controls');
        assert.equal(await page.locator('.vjs-play-control use').getAttribute('href'),'/icons/lucide.svg?v=fixture#play');
        await page.locator('.vjs-desktop-settings').click();
        const panel=page.getByRole('dialog',{name:'Settings',exact:true});
        await panel.getByRole('menuitem',{name:/^Playback speed,/}).click();
        assert.equal(await panel.getByRole('menuitemradio',{name:'1.1×',exact:true}).getAttribute('aria-checked'),'true');
        await panel.getByRole('menuitemradio',{name:'1.5×',exact:true}).click();
        await page.waitForFunction(()=>player.playbackRate()===1.5);
        await panel.getByRole('menuitem',{name:/^Captions,/}).click();
        await panel.getByRole('menuitemradio',{name:'English',exact:true}).click();
        await page.waitForFunction(()=>Array.from(player.textTracks()).some(track=>track.label==='English'&&track.mode==='showing'&&track.cues&&track.cues.length));
        await panel.getByRole('menuitem',{name:'Advanced',exact:true}).click();
        assert.equal(await panel.getByRole('menuitemcheckbox',{name:/Automatic mini player/}).getAttribute('aria-checked'),'false');
        await panel.getByRole('button',{name:'Back',exact:true}).click();
        await panel.getByRole('menuitem',{name:/^Captions,/}).click();
        await panel.getByRole('menuitem',{name:/appearance/i}).click();
        await panel.getByRole('combobox',{name:'Font Size',exact:true}).selectOption({label:'200%'});
        await panel.getByRole('button',{name:'Back',exact:true}).click();
        await page.keyboard.press('Escape');
        assert.equal(await page.locator('.player-settings-panel').isVisible(),false);
        assert.equal(await page.evaluate(()=>player.tech().el()===originalMedia&&player.paused()&&player.playbackRate()===1.5&&player.getChild('textTrackSettings').getValues().fontPercent===2),true);
        assert.equal(await page.locator('.player-secondary-control:visible').count(),0);
        assert.equal(await page.locator('video,audio').count(),1);
        await page.screenshot({path:path.join(artifacts,`${engine}-d5-settings-dark-1440.png`),fullPage:true});
        assert.deepEqual(errors,[]);await context.close();
    });
}

for(const engine of engines) {
    test(`${engine}: D5 utility defaults and deliberate transcript loading keep replay outside media`,async()=>{
        for(const [kind,selected] of [['queue','Queue'],['replay','Chat replay'],['queue-chat','Queue'],['single','Up next'],['transcript-only',null],['no-tools',null]]) {
            const {page,context,requests,errors}=await setup(engine,'watch','light',{fixture:`d5-${kind}-light`,url:'/watch?v=2isYuQZMbdU'+(kind==='queue'?'&list=PLfixture':kind==='queue-chat'?'&list=IVfixture':'')});
            assert.deepEqual(await page.locator('[role=tab][aria-selected=true]').allTextContents(),selected?[selected]:[]);
            assert.equal(await page.locator('#player-container #chat-panel').count(),0);
            assert.ok(!requests.some(r=>r.url.pathname.startsWith('/api/v1/transcripts/')));
            if(kind==='transcript-only') {
                assert.ok(await page.locator('[data-tab-placeholder]').isVisible());
                await page.getByRole('tab',{name:'Transcript',exact:true}).click();
                await page.locator('.transcript-line').first().waitFor();
                assert.equal(await page.locator('[data-tab-placeholder]').isVisible(),false);
            }
            if(kind==='no-tools')assert.equal(await page.locator('.utility-panel').count(),0);
            assert.equal(await page.locator('video,audio').count(),1);assert.deepEqual(errors,[],kind);await context.close();
        }
    });
    test(`${engine}: D5 opt-in docking preserves the placeholder and supports return, dismissal and exclusions`,async()=>{
        const {page,context,errors}=await setup(engine,'watch','light',{fixture:'d5-single-light',url:'/watch?v=2isYuQZMbdU'});
        await page.addStyleTag({content:'.watch-primary{min-height:2200px}'});
        await page.evaluate(async()=>{player.muted(true);await player.play();player.pause();player.currentTime(.25);window.originalMedia=player.tech().el();window.originalPlayer=player;window.shellHeight=document.querySelector('.watch-player').getBoundingClientRect().height;});
        await page.evaluate(()=>scrollTo(0,1000));
        assert.equal(await page.locator('.watch-player').evaluate(el=>el.classList.contains('is-docked')),false,'docking starts off');
        await page.evaluate(()=>scrollTo(0,0));await page.locator('.vjs-desktop-settings').click();
        const panel=page.getByRole('dialog',{name:'Settings',exact:true});await panel.getByRole('menuitem',{name:'Advanced',exact:true}).click();
        await panel.getByRole('menuitemcheckbox',{name:/Automatic mini player/}).click();await page.keyboard.press('Escape');
        assert.equal(await page.evaluate(()=>InvidiousStorage.local.get('player_dock_enabled')),true);
        await page.evaluate(()=>scrollTo(0,1000));await page.locator('.watch-player.is-docked').waitFor();
        assert.ok(await page.evaluate(()=>Math.abs(document.querySelector('.watch-player').getBoundingClientRect().height-shellHeight)<1));
        assert.equal(await page.locator('.dock-controls button:visible').count(),4);
        assert.equal(await page.evaluate(()=>player===originalPlayer&&player.tech().el()===originalMedia&&player.paused()),true);
        await page.screenshot({path:path.join(artifacts,`${engine}-d5-docked-light-1440.png`)});
        await page.locator('[data-dock=mute]').click();assert.equal(await page.evaluate(()=>player.muted()),false);
        await page.locator('[data-dock=return]').click();await page.waitForFunction(()=>!document.querySelector('.watch-player').classList.contains('is-docked'));
        assert.ok(await page.evaluate(()=>document.querySelector('.watch-player').getBoundingClientRect().top>=0));
        await page.locator('.vjs-fullscreen-control').click();await page.waitForFunction(()=>!!document.fullscreenElement);
        await page.evaluate(()=>scrollTo(0,1000));assert.equal(await page.locator('.watch-player.is-docked').count(),0);
        await page.evaluate(()=>document.exitFullscreen());await page.evaluate(()=>scrollTo(0,1000));await page.locator('.watch-player.is-docked').waitFor();
        await page.evaluate(()=>document.dispatchEvent(new CustomEvent('iv:clip-preview',{detail:{active:true}})));
        await page.waitForFunction(()=>!document.querySelector('.watch-player').classList.contains('is-docked'));
        await page.evaluate(()=>document.dispatchEvent(new CustomEvent('iv:clip-preview',{detail:{active:false}})));await page.locator('.watch-player.is-docked').waitFor();
        await page.evaluate(()=>{window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}));});
        assert.equal(await page.locator('.watch-player.is-docked').count(),0);
        await page.evaluate(()=>{window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));});await page.locator('.watch-player.is-docked').waitFor();
        await page.locator('[data-dock=dismiss]').click();await page.evaluate(()=>{scrollTo(0,0);scrollTo(0,1000);});
        assert.equal(await page.locator('.watch-player.is-docked').count(),0);
        assert.equal(await page.evaluate(()=>InvidiousStorage.local.get('player_dock_enabled')),true,'dismissal is per video');
        assert.ok(await page.evaluate(()=>player.tech().el()===originalMedia&&Math.abs(player.currentTime()-.25)<.08));
        assert.deepEqual(errors,[]);await context.close();
    });
}

for(const engine of engines) {
    test(`${engine}: D5 queue reconciles a removed earlier duplicate without losing the playing occurrence`,async()=>{
        let removed=false;
        const {page,context,errors,requests}=await setup(engine,'watch','light',{fixture:'d5-owned-light',url:'/watch?v=2isYuQZMbdU&list=IVfixture&index=2&occurrence=9007199254740995',reply:entry=>{
            if(entry.url.pathname==='/api/v1/playlists/IVfixture')return{contentType:'application/json',body:JSON.stringify(watchQueueSnapshot(removed?'before':null))};
            if(entry.url.pathname==='/playlist_ajax') {removed=true;const {positions,total}=watchQueueSnapshot('before');return{contentType:'application/json',body:JSON.stringify({positions,total})};}
        }});
        await page.locator('.queue-row [aria-current=true]').waitFor();
        await page.evaluate(async()=>{player.muted(true);await player.play();player.pause();player.currentTime(.25);window.originalMedia=player.tech().el();});
        assert.equal(await page.locator('.queue-row:has([aria-current=true])').getAttribute('data-occurrence'),'9007199254740995');
        await page.locator('[data-occurrence="9007199254740993"] .queue-remove').click();
        await page.waitForFunction(()=>document.querySelectorAll('.queue-row').length===3&&!document.querySelector('#playlist').getAttribute('aria-busy').includes('true'));
        assert.equal(await page.locator('.queue-row:has([aria-current=true])').getAttribute('data-occurrence'),'9007199254740995');
        assert.equal(await page.locator('.queue-row:has([aria-current=true])').getAttribute('data-index'),'1');
        assert.equal(new URL(page.url()).searchParams.get('index'),'1');assert.equal(new URL(page.url()).searchParams.get('occurrence'),'9007199254740995');
        const next=new URL(await page.locator('[data-direction=next]').getAttribute('href'),'https://invidious.test');
        assert.equal(next.searchParams.get('index'),'2');assert.equal(next.searchParams.get('occurrence'),'9007199254740996');
        assert.ok(await page.evaluate(()=>player.tech().el()===originalMedia&&player.paused()&&Math.abs(player.currentTime()-.25)<.08));
        const writes=requests.filter(r=>r.url.pathname==='/playlist_ajax');assert.equal(writes.length,1);assert.equal(writes[0].url.searchParams.get('set_video_id'),'9007199254740993');assert.equal(writes[0].body.get('include_positions'),'1');
        assert.deepEqual(errors,[]);await context.close();
    });
    test(`${engine}: D5 uncertain current removal only retries its canonical read and never jumps to another duplicate`,async()=>{
        let removed=false;
        const {page,context,errors,requests}=await setup(engine,'watch','dark',{fixture:'d5-owned-dark',url:'/watch?v=2isYuQZMbdU&list=IVfixture&index=2&occurrence=9007199254740995',reply:entry=>{
            if(entry.url.pathname==='/api/v1/playlists/IVfixture')return{contentType:'application/json',body:JSON.stringify(watchQueueSnapshot(removed?'current':null))};
            if(entry.url.pathname==='/playlist_ajax') {removed=true;return{status:503,contentType:'application/json',body:'{}'};}
        }});
        await page.locator('.queue-row [aria-current=true]').waitFor();await page.evaluate(()=>{window.originalMedia=player.tech().el();player.pause();});
        await page.locator('[data-occurrence="9007199254740995"] .queue-remove').click();await page.locator('#queue-retry').waitFor({state:'visible'});
        assert.equal(await page.locator('.queue-remove:enabled').count(),0);await page.evaluate(()=>player.trigger('ended'));
        assert.equal(new URL(page.url()).searchParams.get('v'),'2isYuQZMbdU');
        await page.locator('#queue-retry').click();await page.waitForFunction(()=>document.querySelectorAll('.queue-row').length===3&&document.querySelector('.queue-remove:enabled'));
        assert.equal(await page.locator('.queue-row [aria-current=true]').count(),0,'the surviving first copy must not become the playing entry');
        assert.equal(new URL(page.url()).searchParams.get('playlist_current_removed'),'1');
        const next=new URL(await page.locator('[data-direction=next]').getAttribute('href'),'https://invidious.test');assert.equal(next.searchParams.get('index'),'2');assert.equal(next.searchParams.get('occurrence'),'9007199254740996');
        assert.equal(requests.filter(r=>r.url.pathname==='/playlist_ajax').length,1);
        assert.equal(await page.evaluate(()=>player.tech().el()===originalMedia&&player.paused()),true);
        assert.deepEqual(errors,[]);await context.close();
    });
    test(`${engine}: D5 caption failures expose a retry that replaces the text track without replacing media`,async()=>{
        let attempts=0;
        const {page,context,errors}=await setup(engine,'watch','light',{fixture:'d5-single-light',url:'/watch?v=2isYuQZMbdU',reply:entry=>{
            if(entry.url.pathname.startsWith('/api/v1/captions/'))return ++attempts===1?{status:503,body:''}:{contentType:'text/vtt',body:'WEBVTT\n\n00:00.000 --> 00:05.000\nRecovered caption\n'};
        }});
        await page.evaluate(async()=>{player.muted(true);await player.play();player.pause();window.originalMedia=player.tech().el();});
        await page.locator('.vjs-desktop-settings').click();const panel=page.getByRole('dialog',{name:'Settings',exact:true});
        await panel.getByRole('menuitem',{name:/^Captions,/}).click();await panel.getByRole('menuitemradio',{name:'English',exact:true}).click();
        await panel.getByRole('menuitem',{name:/^Captions,/}).click();
        assert.equal(await panel.locator('.player-settings-content>button').first().getAttribute('data-setting'),'appearance');
        assert.match(await panel.locator('.player-settings-content>button').nth(1).getAttribute('data-setting'),/^retry-caption:/);
        assert.equal(await panel.getByRole('menuitem',{name:/Retry captions/}).locator('use[href$="#chevron-right"]').count(),0);
        await panel.getByRole('menuitem',{name:/Retry captions/}).click();
        await page.waitForFunction(()=>Array.from(player.textTracks()).some(track=>track.label==='English'&&track.mode==='showing'&&track.cues&&track.cues.length));
        assert.equal(attempts,2);assert.equal(await panel.getByRole('menuitem',{name:/Retry captions/}).count(),0);
        assert.equal(await page.evaluate(()=>player.tech().el()===originalMedia&&player.paused()),true);assert.equal(await page.locator('video,audio').count(),1);
        assert.deepEqual(errors,[]);await context.close();
    });
}

for(const engine of engines) {
    test(`${engine}: D5 progressive quality choices decode both sizes and retain pause, time and rate`,async()=>{
        const {page,context,errors}=await setup(engine,'watch','light',{fixture:'d5-quality-light',url:'/watch?v=2isYuQZMbdU'});
        await page.evaluate(async()=>{player.muted(true);await player.play();player.pause();player.currentTime(.3);player.playbackRate(1.25);window.originalMedia=player.tech().el();});
        await page.waitForFunction(()=>!player.seeking()&&Math.abs(player.currentTime()-.3)<.08&&player.playbackRate()===1.25);
        await page.evaluate(()=>{
            window.sourceTrace=[];
            const time=player.currentTime;player.currentTime=function(value){if(value!==undefined)sourceTrace.push({type:'seek-write',value,duration:player.duration(),nativeDuration:player.tech().el().duration});return time.apply(this,arguments);};
            player.on(['loadstart','loadedmetadata','loadeddata','canplay','seeking','seeked','ratechange'],event=>sourceTrace.push({type:event.type,time:player.currentTime(),native:player.tech().el().currentTime,rate:player.playbackRate()}));
            const select=InvidiousStreamMenus.selectFallbackSource;InvidiousStreamMenus.selectFallbackSource=(p,item)=>{sourceTrace.push({type:'select',time:p.currentTime(),rate:p.playbackRate()});select(p,item);};
        });
        await page.locator('.vjs-desktop-settings').click();const panel=page.getByRole('dialog',{name:'Settings',exact:true});
        await panel.getByRole('menuitem',{name:/^Quality and codec,/}).click();
        await panel.getByRole('menuitemradio',{name:/^360p12 · VP8,/}).click();
        await page.waitForFunction(()=>player.readyState()>=2&&player.tech().el().videoHeight===360&&Math.abs(player.currentTime()-.3)<.08&&player.playbackRate()===1.25).catch(async error=>{
            error.message+='; '+JSON.stringify(await page.evaluate(()=>({state:player.readyState(),height:player.tech().el().videoHeight,time:player.currentTime(),rate:player.playbackRate(),paused:player.paused(),source:player.currentSource(),error:player.error(),trace:sourceTrace})));throw error;
        });
        assert.equal(await page.evaluate(()=>player.paused()&&player.tech().el()===originalMedia),true);
        await panel.getByRole('menuitem',{name:/^Quality and codec,/}).click();
        assert.equal(await panel.getByRole('menuitemradio',{name:/^360p12 · VP8,/}).getAttribute('aria-checked'),'true');
        await panel.getByRole('menuitemradio',{name:/^180p12 · VP8,/}).click();
        await page.waitForFunction(()=>player.tech().el().videoHeight===180&&Math.abs(player.currentTime()-.3)<.08);
        assert.equal(await page.evaluate(()=>player.paused()&&player.tech().el()===originalMedia),true);
        assert.deepEqual(errors,[]);await context.close();
    });
    test(`${engine}: D5 decoded DASH uses the same Settings quality, Auto and distinct language/DRC callbacks`,async()=>{
        const {page,context,errors,requests}=await setup(engine,'watch','dark',{fixture:'d5-dash-dark',url:'/watch?v=2isYuQZMbdU'});
        await page.evaluate(()=>{player.muted(true);player.play().catch(()=>{});});
        await page.waitForFunction(()=>player.currentTime()>.1&&player.qualityLevels().length===2&&player.audioTracks().length===3);
        await page.evaluate(()=>{player.pause();window.originalMedia=player.tech().el();window.originalTime=player.currentTime();});
        await page.locator('.vjs-desktop-settings').click();const panel=page.getByRole('dialog',{name:'Settings',exact:true});
        await panel.getByRole('menuitem',{name:/^Quality and codec,/}).click();
        await panel.getByRole('menuitemradio',{name:/^360p12 · H.264,/}).click();
        assert.deepEqual(await page.evaluate(()=>Array.from(player.qualityLevels(),l=>({height:l.height,enabled:l.enabled}))),[{height:180,enabled:false},{height:360,enabled:true}]);
        await panel.getByRole('menuitem',{name:/^Audio,/}).click();
        await panel.getByRole('menuitemradio',{name:/^Indonesian/}).click();
        await page.waitForFunction(()=>Array.from(player.audioTracks()).some(t=>t.language==='id'&&t.enabled));
        await panel.getByRole('menuitem',{name:/^Audio,/}).click();await panel.getByRole('menuitemradio',{name:/Stable Volume/}).click();
        await page.waitForFunction(()=>Array.from(player.audioTracks()).some(t=>t.label.includes('Stable Volume')&&t.enabled));
        await panel.getByRole('menuitem',{name:/^Quality and codec,/}).click();await panel.getByRole('menuitemradio',{name:'Auto',exact:true}).click();
        assert.ok(await page.evaluate(()=>Array.from(player.qualityLevels()).every(level=>level.enabled)));
        assert.ok(await page.evaluate(()=>player.tech().el()===originalMedia&&player.paused()&&Math.abs(player.currentTime()-originalTime)<.12&&!player.error()));
        await page.screenshot({path:path.join(artifacts,`${engine}-d5-dash-settings-dark-1440.png`),fullPage:true});
        assert.ok(requests.some(r=>r.url.pathname.startsWith('/d5-media/chunk-stream')),'real DASH media segments were decoded');
        assert.deepEqual(errors,[]);await context.close();
    });
}

for(const engine of engines) {
    test(`${engine}: D5 layout follows same-profile tabs and isolates a different signed-in account`,async()=>{
        let profile='account';
        const {page,context,errors}=await setup(engine,'watch','light',{fixture:'d5-account-light',url:'/watch?v=2isYuQZMbdU',reply:entry=>{
            if(entry.navigation&&entry.url.pathname==='/watch') {
                if(entry.url.searchParams.has('profile'))profile=entry.url.searchParams.get('profile')==='bob'?'bob':'account';
                const body=fs.readFileSync(path.join(generated,`d5-${profile}-light.html`),'utf8'),scope=JSON.parse(body.match(/<script id="browser-profile"[^>]*>([^]*?)<\/script>/)[1]).scope;
                return{contentType:'text/html',headers:{'Set-Cookie':`IV_BROWSER_PROFILE=${scope}; Path=/; Secure; SameSite=Lax`},body};
            }
        }});
        await page.evaluate(()=>{InvidiousStorage.local.set('watch_layout','theater');InvidiousStorage.local.set('player_dock_enabled',true);});
        await page.reload();await page.waitForFunction(()=>document.body.dataset.watchLayout==='theater');
        const other=await context.newPage();await other.goto(page.url());await other.waitForFunction(()=>window.InvidiousStorage&&document.body.dataset.watchLayout==='theater');
        await other.evaluate(()=>InvidiousStorage.local.set('watch_layout','standard'));await page.waitForFunction(()=>document.body.dataset.watchLayout==='standard');
        await page.goto('https://invidious.test/watch?v=2isYuQZMbdU&profile=bob');await page.waitForFunction(()=>document.body.dataset.watchLayout==='standard');
        assert.equal(await page.evaluate(()=>InvidiousStorage.local.get('player_dock_enabled')===true),false);
        await page.goto('https://invidious.test/watch?v=2isYuQZMbdU&profile=alice');await page.waitForFunction(()=>document.body.dataset.watchLayout==='standard');
        assert.equal(await page.evaluate(()=>InvidiousStorage.local.get('player_dock_enabled')),true);
        assert.deepEqual(errors,[]);await context.close();
    });
    test(`${engine}: D5 light/dark watch geometry and contained controls fit the desktop matrix`,async()=>{
        for(const mode of ['light','dark'])for(const kind of ['single','owned','replay','portrait','audio','long','no-tools']) {
            const {page,context,errors}=await setup(engine,'watch',mode,{fixture:`d5-${kind}-${mode}`,url:'/watch?v=2isYuQZMbdU'+(kind==='owned'?'&list=IVfixture&index=2':''),reply:entry=>entry.url.pathname==='/api/v1/playlists/IVfixture'?{contentType:'application/json',body:JSON.stringify(watchQueueSnapshot())}:null});
            for(const [width,height] of [[1280,720],[1440,900],[1920,1080]]) {
                await page.setViewportSize({width,height});
                assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${kind}/${mode}/${width} fits`);
                assert.equal(await page.locator('video,audio').count(),1);
                if(kind==='no-tools')assert.ok(await page.locator('.watch-primary').evaluate(el=>Math.abs(el.getBoundingClientRect().width-document.querySelector('.watch-grid').getBoundingClientRect().width)<1),'details use the available column when no utility tools exist');
                if(kind==='replay') {assert.equal(await page.locator('#player-container #chat-panel').count(),0);assert.equal(await page.locator('#chat-panel').isVisible(),true);}
                if(kind==='single') {
                    const boxes=await page.locator('.recommendation').first().evaluate(row=>({thumbnail:row.querySelector('.thumbnail').getBoundingClientRect().top,menu:row.querySelector('summary').getBoundingClientRect().top}));
                    assert.ok(Math.abs(boxes.thumbnail-boxes.menu)<2,'recommendation menu stays in its row');
                }
                if(width===1440)await page.screenshot({path:path.join(artifacts,`${engine}-d5-${kind}-${mode}-1440.png`),fullPage:true});
            }
            if(kind==='audio') {
                await page.evaluate(()=>{InvidiousStorage.local.set('player_dock_enabled',true);player.trigger('dockpreferencechange');});
                await page.addStyleTag({content:'.watch-primary{min-height:2200px}'});await page.evaluate(async()=>{player.muted(true);await player.play();player.pause();scrollTo(0,1000);});
                assert.equal(await page.locator('.watch-player.is-docked').count(),0);
                assert.equal(await page.evaluate(()=>player.tech().el().videoHeight),0,'the listen fixture decodes audio rather than a video stand-in');
            }
            if(kind==='portrait') {
                await page.evaluate(async()=>{player.muted(true);await player.play();player.pause();});
                assert.ok(await page.evaluate(()=>{const media=player.tech().el(),box=player.el().getBoundingClientRect();return media.videoHeight>media.videoWidth&&Math.abs(box.width/box.height-media.videoWidth/media.videoHeight)<.01;}),'decoded portrait frames retain their aspect ratio');
            }
            assert.deepEqual(errors,[],kind);await context.close();
        }
    });
}

for(const engine of engines) {
    test(`${engine}: D5 queue rejects rounded identities and invalid canonical maps without enabling writes`,async()=>{
        let invalid=null;
        const {page,context,errors}=await setup(engine,'watch','light',{fixture:'d5-owned-light',url:'/watch?v=2isYuQZMbdU&list=IVfixture&index=2',reply:entry=>{
            if(entry.url.pathname==='/api/v1/playlists/IVfixture')return{contentType:'application/json',body:JSON.stringify({...watchQueueSnapshot(),...invalid})};
        }});
        await page.locator('.queue-remove:enabled').first().waitFor();const url=page.url();
        for(const bad of [{currentOccurrence:9007199254740995},{positions:{'9007199254740995':1},total:4},{currentRemoved:'false'}]) {
            invalid=bad;await page.evaluate(()=>get_playlist(video_data.plid));
            assert.equal(await page.locator('.queue-remove:enabled').count(),0);assert.ok(await page.locator('#queue-retry').isVisible());assert.equal(page.url(),url);
            invalid=null;await page.locator('#queue-retry').click();await page.locator('.queue-remove:enabled').first().waitFor();
        }
        assert.deepEqual(errors,[]);await context.close();
    });
    test(`${engine}: D5 cached queue lifetimes reject old reads even when transport ignores abort`,async()=>{
        const {page,context,errors}=await setup(engine,'watch','light',{fixture:'d5-owned-light',url:'/watch?v=2isYuQZMbdU&list=IVfixture&index=2',reply:entry=>entry.url.pathname==='/api/v1/playlists/IVfixture'?{contentType:'application/json',body:JSON.stringify(watchQueueSnapshot())}:null});
        await page.locator('.queue-remove:enabled').first().waitFor();
        await page.evaluate(()=>{
            const fetch=window.fetch.bind(window);window.queueReads=[];
            window.fetch=(url,options)=>new URL(url,location.href).pathname==='/api/v1/playlists/IVfixture'?new Promise(resolve=>queueReads.push(body=>resolve(new Response(JSON.stringify(body),{headers:{'Content-Type':'application/json'}})))):fetch(url,options);
            get_playlist(video_data.plid);
        });
        await page.waitForFunction(()=>queueReads.length===1);
        await page.evaluate(()=>{window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}));window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));});
        await page.waitForFunction(()=>queueReads.length===2);await page.evaluate(body=>queueReads[1](body),watchQueueSnapshot('before'));
        await page.waitForFunction(()=>document.querySelectorAll('.queue-row').length===3&&document.querySelector('#playlist').getAttribute('aria-busy')==='false');
        await page.evaluate(async body=>{queueReads[0](body);await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);},watchQueueSnapshot());
        assert.equal(await page.locator('.queue-row').count(),3);assert.equal(await page.locator('.queue-row:has([aria-current=true])').getAttribute('data-index'),'1');
        assert.equal(new URL(page.url()).searchParams.get('index'),'1');assert.deepEqual(errors,[]);await context.close();
    });
    test(`${engine}: D5 queue advances to the surviving successor after the playing occurrence disappeared`,async()=>{
        const {page,context,errors}=await setup(engine,'watch','light',{fixture:'d5-owned-light',url:'/watch?v=2isYuQZMbdU&list=IVfixture&index=2&occurrence=9007199254740995',reply:entry=>entry.url.pathname==='/api/v1/playlists/IVfixture'?{contentType:'application/json',body:JSON.stringify(watchQueueSnapshot('current'))}:null});
        await page.locator('[data-direction=next]').waitFor();await page.evaluate(async()=>{player.muted(true);await player.play();player.currentTime(player.duration()-.1);});
        await page.waitForURL(url=>url.searchParams.get('v')==='nextvideo01');
        const destination=new URL(page.url());assert.equal(destination.searchParams.get('index'),'2');assert.equal(destination.searchParams.get('occurrence'),'9007199254740996');
        assert.deepEqual(errors,[]);await context.close();
    });
}

for(const engine of engines) {
    test(`${engine}: D5 native picture-in-picture suspends docking where the browser exposes it`,async()=>{
        const {page,context,errors}=await setup(engine,'watch','light',{fixture:'d5-single-light',url:'/watch?v=2isYuQZMbdU'});
        const supported=await page.evaluate(()=>!!document.pictureInPictureEnabled);observations.push({engine,feature:'native-picture-in-picture',supported,scope:'API/media identity and docking; no claim about physical OS window appearance'});
        if(!supported) {assert.equal(await page.locator('.vjs-picture-in-picture-control').count(),0);assert.deepEqual(errors,[]);await context.close();return;}
        await page.addStyleTag({content:'.watch-primary{min-height:2200px}'});
        await page.evaluate(async()=>{InvidiousStorage.local.set('player_dock_enabled',true);player.muted(true);await player.play();player.pause();window.originalMedia=player.tech().el();});
        await page.locator('.vjs-picture-in-picture-control').click();await page.waitForFunction(()=>!!document.pictureInPictureElement);
        await page.evaluate(()=>scrollTo(0,1000));assert.equal(await page.locator('.watch-player.is-docked').count(),0);
        assert.equal(await page.evaluate(()=>document.pictureInPictureElement===originalMedia),true);
        await page.evaluate(()=>document.exitPictureInPicture());await page.locator('.watch-player.is-docked').waitFor();
        assert.equal(await page.evaluate(()=>player.tech().el()===originalMedia&&player.paused()),true);assert.deepEqual(errors,[]);await context.close();
    });
    test(`${engine}: D5 enlarged RTL text and forced colors retain watch/player focus and geometry`,async()=>{
        const {page,context,errors}=await setup(engine,'watch','dark',{fixture:'d5-watch-rtl',width:1280,height:720,url:'/watch?v=2isYuQZMbdU'});
        await page.addStyleTag({content:'body{font-size:20px}.creator-actions button,.creator-actions a{font-size:18px}.player-settings-panel{font-size:18px}.player-settings-panel>header h2{font-size:20px}'});
        await page.evaluate(async()=>{player.muted(true);await player.play();player.pause();});await page.locator('.vjs-desktop-settings').click();
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
        const panel=page.locator('.player-settings-panel');assert.ok(await panel.evaluate(el=>{const box=el.getBoundingClientRect(),video=player.el().getBoundingClientRect();return box.left>=video.left&&box.right<=video.right+1&&box.top>=video.top;}));
        assert.ok(await panel.locator('.player-setting-name').evaluateAll(names=>names.every(name=>{const value=name.nextElementSibling;if(!value||!value.classList.contains('player-setting-value'))return true;const a=name.getBoundingClientRect(),b=value.getBoundingClientRect();return a.left>=b.right||b.left>=a.right;})),'translated setting names and values do not overlap');
        await page.screenshot({path:path.join(artifacts,`${engine}-d5-rtl-enlarged.png`),fullPage:true});
        await page.emulateMedia({forcedColors:'active'});await page.keyboard.press('Tab');
        assert.ok(await page.evaluate(()=>getComputedStyle(document.activeElement).outlineStyle!=='none'));
        await page.screenshot({path:path.join(artifacts,`${engine}-d5-forced-colors.png`),fullPage:true});
        assert.deepEqual(errors,[]);await context.close();
    });
}

for(const engine of engines) {
    test(`${engine}: D5 Advanced diagnostics and refresh retain the media, captions and playback state`,async()=>{
        const {page,context,errors}=await setup(engine,'watch','dark',{fixture:'d5-single-dark',url:'/watch?v=2isYuQZMbdU',reply:entry=>entry.url.pathname.startsWith('/api/v1/captions/')?{contentType:'text/vtt',body:'WEBVTT\n\n00:00.000 --> 00:04.000\nKept caption\n'}:null});
        await page.evaluate(async()=>{player.muted(true);await player.play();player.pause();player.currentTime(1);player.playbackRate(1.5);player.volume(.4);window.originalMedia=player.tech().el();Array.from(player.textTracks()).find(track=>track.label==='English').mode='showing';});
        await page.waitForFunction(()=>!player.seeking()&&Math.abs(player.currentTime()-1)<.08&&player.playbackRate()===1.5);
        await page.locator('.vjs-desktop-settings').click();const panel=page.getByRole('dialog',{name:'Settings',exact:true});
        await panel.getByRole('menuitem',{name:'Advanced',exact:true}).click();await panel.getByRole('menuitem',{name:'Stats for nerds',exact:true}).click();
        const stats=page.locator('.player-stats');await stats.waitFor({state:'visible'});assert.equal(await panel.isVisible(),false);
        await stats.getByRole('button',{name:'Close',exact:true}).click();await assertFocus(page,'.vjs-desktop-settings');
        await page.locator('.vjs-desktop-settings').click();await panel.getByRole('menuitem',{name:'Advanced',exact:true}).click();await panel.getByRole('menuitem',{name:'Refresh video buffer',exact:true}).click();
        await page.waitForFunction(()=>player.readyState()>=2&&Math.abs(player.currentTime()-1)<.08&&player.playbackRate()===1.5&&player.paused()&&Array.from(player.textTracks()).some(track=>track.label==='English'&&track.mode==='showing'));
        assert.ok(await page.evaluate(()=>player.tech().el()===originalMedia&&Math.abs(player.volume()-.4)<.01&&player.muted()));
        assert.equal(await page.locator('video,audio').count(),1);assert.deepEqual(errors,[]);await context.close();
    });
    test(`${engine}: D5 a network-aborted caption load offers a bounded explicit retry`,async()=>{
        let attempts=0;
        const {page,context,errors}=await setup(engine,'watch','light',{fixture:'d5-single-light',url:'/watch?v=2isYuQZMbdU',reply:entry=>entry.url.pathname.startsWith('/api/v1/captions/')?(++attempts===1?{abort:'failed'}:{contentType:'text/vtt',body:'WEBVTT\n\n00:00.000 --> 00:04.000\nRecovered after network failure\n'}):null});
        await page.evaluate(async()=>{player.muted(true);await player.play();player.pause();window.originalMedia=player.tech().el();});
        await page.locator('.vjs-desktop-settings').click();const panel=page.getByRole('dialog',{name:'Settings',exact:true});
        await panel.getByRole('menuitem',{name:/^Captions,/}).click();await panel.getByRole('menuitemradio',{name:'English',exact:true}).click();await panel.getByRole('menuitem',{name:/^Captions,/}).click();
        await panel.getByRole('menuitem',{name:/Retry captions/}).waitFor({state:'visible',timeout:12000});assert.equal(attempts,1,'waiting does not automatically repeat the read');
        assert.ok((await panel.textContent()).includes('taking longer to load'));
        await panel.getByRole('menuitem',{name:/Retry captions/}).click();await page.waitForFunction(()=>Array.from(player.textTracks()).some(track=>track.label==='English'&&track.mode==='showing'&&track.cues&&track.cues.length));
        assert.equal(attempts,2);assert.equal(await page.evaluate(()=>player.tech().el()===originalMedia&&player.paused()),true);assert.deepEqual(errors,[]);await context.close();
    });
}

for(const engine of engines) {
    test(`${engine}: D5 title cycles use one SVG control and reveal masked names only after a click`,async()=>{
        for(const masked of [false,true]) {
            const {page,context,errors,requests}=await setup(engine,'watch','light',{fixture:masked?'watch-spoiler-dearrow':'watch-dearrow',url:'/watch?v=2isYuQZMbdU',reply:entry=>entry.url.pathname.startsWith('/api/v1/dearrow/')?{contentType:'application/json',body:JSON.stringify({title:'Replacement fixture title'})}:null});
            const title=page.locator('.watch-heading h1'),control=page.locator('.watch-heading .dearrow-reveal');
            await control.waitFor();const original=await title.evaluate(el=>el.dataset.spoilerOriginal||el.dataset.dearrowOriginal);
            assert.equal(await control.locator('use').count(),1);assert.ok((await control.locator('use').getAttribute('href')).endsWith('#rotate-cw'));
            if(masked)assert.ok(requests.filter(r=>r.url.pathname==='/api/v1/dearrow/2isYuQZMbdU').length<=1,'masked fields share the existing title cache');
            const before=await title.textContent();await control.hover();await control.focus();assert.equal(await title.textContent(),before);
            if(masked) {
                const reveal=page.getByRole('button',{name:'Reveal original thumbnail',exact:true});assert.ok(await reveal.isVisible());
                assert.ok(await reveal.evaluate(el=>{const a=el.getBoundingClientRect(),b=document.querySelector('.vjs-big-play-button').getBoundingClientRect();return a.bottom<=b.top||a.top>=b.bottom||a.right<=b.left||a.left>=b.right;}),'thumbnail reveal stays separate from Play');
            }
            if(masked)await page.screenshot({path:path.join(artifacts,`${engine}-d5-title-hidden-light-1440.png`),fullPage:true});
            assert.ok(!(await control.getAttribute('aria-label')).includes(original));assert.equal(await control.getAttribute('title'),null);
            await control.click();
            if(masked) {await page.waitForFunction(()=>document.querySelector('.watch-heading h1').textContent==='Replacement fixture title');await control.click();assert.equal(await title.textContent(),original);await control.click();assert.equal(await title.textContent(),before);assert.ok(!(await page.title()).includes(original));}
            else {assert.equal(await title.textContent(),original);await control.click();assert.equal(await title.textContent(),'Replacement fixture title');}
            assert.deepEqual(errors,[]);await context.close();
        }
    });
}

for(const engine of engines) {
    test(`${engine}: D5 watch Save, Share and Download keep one media element and retain HTML fallbacks`,async()=>{
        const {page,context,errors,requests}=await setup(engine,'watch','light',{fixture:'d5-account-light',url:'/watch?v=2isYuQZMbdU',reply:entry=>{
            if(entry.url.pathname==='/video_actions')return{contentType:'application/json',body:JSON.stringify({playlists:[{id:'IVtarget',title:'Saved videos'}],defaultPlaylist:'IVtarget'})};
            if(entry.url.pathname==='/playlist_ajax')return{contentType:'application/json',body:'{}'};
        }});
        await page.evaluate(async()=>{player.muted(true);await player.play();player.pause();player.currentTime(1);window.originalMedia=player.tech().el();});
        await page.locator('.watch-actions [data-video-action=playlist]').click();await page.locator('#video-playlist-dialog').waitFor({state:'visible'});
        await page.waitForFunction(()=>document.querySelector('#video-playlist-select').options.length===1);
        await page.locator('#video-playlist-save button[type=submit]').click();await page.waitForFunction(()=>document.querySelector('#video-playlist-status').textContent==='Added to playlist.');
        await page.locator('#video-playlist-dialog .dialog-close').click();
        assert.equal(requests.filter(r=>r.url.pathname==='/playlist_ajax').length,1);
        await page.evaluate(()=>{Object.defineProperty(navigator,'clipboard',{value:undefined,configurable:true});});
        await page.locator('#share-video').click();assert.ok(await page.locator('#share-fallback').isVisible());
        const shared=new URL(await page.locator('#share-url').inputValue());assert.equal(shared.searchParams.get('v'),'2isYuQZMbdU');assert.equal(shared.searchParams.get('t'),'1');
        const more=page.locator('.watch-actions>.ui-menu');await more.locator('summary').click();await more.locator('[data-open-dialog=download-dialog]').click();
        await page.locator('#download-dialog').waitFor({state:'visible'});assert.equal(await page.locator('#download_widget').count(),1);await page.keyboard.press('Escape');await assertFocus(page,'.watch-actions>.ui-menu>summary');
        assert.equal(await page.evaluate(()=>player.tech().el()===originalMedia&&player.paused()),true);assert.deepEqual(errors,[]);await context.close();
        const fallback=await setup(engine,'watch','light',{fixture:'d5-single-light',url:'/watch?v=2isYuQZMbdU',javascript:false});
        await fallback.page.locator('.watch-actions>.ui-menu>summary').click();assert.ok(await fallback.page.locator('.watch-actions a[href="#download-fallback"]').isVisible());
        await fallback.page.locator('#download-fallback>summary').click();assert.ok(await fallback.page.locator('#download_widget').isVisible());assert.equal(await fallback.page.locator('video[controls]').count(),1);
        assert.ok((await fallback.page.locator('#create-clip').getAttribute('href')).startsWith('/create_clip?videoId='));assert.deepEqual(fallback.errors,[]);await fallback.context.close();
    });
}

for(const engine of engines) {
    test(`${engine}: D6 transcript language, safe search, exact current line and manual following preserve media`,async()=>{
        const english=Array.from({length:100},(_,i)=>({line:i===99?'<img src=x onerror=alert(1)> literal text':`Line ${i}`,startMs:i*100,durationMs:100}));
        const {page,context,errors,requests}=await setup(engine,'watch','light',{fixture:'d5-single-light',url:'/watch?v=2isYuQZMbdU',reply:entry=>entry.url.pathname.startsWith('/api/v1/transcripts/')?{contentType:'application/json',body:JSON.stringify({transcript:{body:entry.url.searchParams.get('label').startsWith('English')?english:[{line:'Indonesian line',startMs:0}],autoGenerated:!entry.url.searchParams.get('label').startsWith('English')}})}:null});
        await page.evaluate(async()=>{player.muted(true);await player.play();player.pause();window.originalMedia=player.tech().el();});
        assert.ok(!requests.some(r=>r.url.pathname==='/js/transcript.js'));await page.getByRole('tab',{name:'Transcript',exact:true}).click();
        await page.waitForFunction(()=>document.querySelectorAll('.transcript-line').length===100);assert.equal(await page.locator('#transcript-panel>summary').count(),0);
        await page.evaluate(()=>player.currentTime(.8));await page.waitForFunction(()=>document.querySelector('.transcript-line.is-active p')?.textContent==='Line 8');
        const lines=page.getByRole('region',{name:'Transcript lines',exact:true});await lines.hover();await page.mouse.wheel(0,2000);
        await page.waitForFunction(()=>!document.querySelector('#transcript-follow').checked&&document.querySelector('#transcript-lines').scrollTop>500);
        const scroll=await lines.evaluate(el=>el.scrollTop),outer=await page.evaluate(()=>scrollY);await page.evaluate(()=>player.currentTime(1.2));
        await page.waitForFunction(()=>document.querySelector('.transcript-line.is-active p')?.textContent==='Line 12');assert.ok(Math.abs(await lines.evaluate(el=>el.scrollTop)-scroll)<1);assert.equal(await page.evaluate(()=>scrollY),outer);
        await page.getByLabel('Follow playback',{exact:true}).check();await page.evaluate(()=>player.currentTime(1.3));
        await page.waitForFunction(()=>{const row=document.querySelector('.transcript-line.is-active'),box=document.querySelector('#transcript-lines');return row&&row.getBoundingClientRect().top>=box.getBoundingClientRect().top&&row.getBoundingClientRect().bottom<=box.getBoundingClientRect().bottom;});
        await page.locator('#transcript-search').fill('Line 1');await page.waitForFunction(()=>document.querySelectorAll('.transcript-line').length===11);await page.evaluate(()=>player.currentTime(.8));
        await page.waitForFunction(()=>!document.querySelector('.transcript-line.is-active'));assert.equal(await page.getByLabel('Follow playback',{exact:true}).isChecked(),false);
        await page.locator('#transcript-search').fill('<img');await page.waitForFunction(()=>document.querySelectorAll('.transcript-line').length===1);assert.equal(await page.locator('.transcript-line img').count(),0);
        await page.locator('#transcript-search').fill('not present');await page.waitForFunction(()=>!document.querySelector('.transcript-line'));assert.equal(await page.locator('#transcript-status').textContent(),'No matching transcript lines.');
        assert.equal(requests.filter(r=>r.url.pathname.startsWith('/api/v1/transcripts/')).length,1,'typing never makes requests');
        await page.locator('#transcript-search').fill('');await page.waitForFunction(()=>document.querySelectorAll('.transcript-line').length===100);
        await page.locator('.transcript-line').nth(15).getByRole('button').click();await page.waitForFunction(()=>Math.abs(player.currentTime()-1.5)<.05);
        await lines.focus();const volume=await page.evaluate(()=>player.volume());await page.keyboard.press('ArrowDown');assert.equal(await page.evaluate(()=>player.volume()),volume,'a focused transcript viewport scrolls without invoking player volume');
        await page.locator('#transcript-language').selectOption({index:1});await page.waitForFunction(()=>document.querySelector('.transcript-line p')?.textContent==='Indonesian line');assert.ok((await page.locator('#transcript-status').textContent()).includes('Automatically'));
        await page.locator('#transcript-language').selectOption({index:0});await page.waitForFunction(()=>document.querySelectorAll('.transcript-line').length===100);
        assert.equal(requests.filter(r=>r.url.pathname.startsWith('/api/v1/transcripts/')).length,2);
        await page.getByRole('tab',{name:'Up next',exact:true}).click();await page.getByRole('tab',{name:'Transcript',exact:true}).click();assert.equal(await page.locator('#transcript-follow').count(),1);
        assert.equal(await page.evaluate(()=>player.tech().el()===originalMedia&&player.paused()),true);assert.deepEqual(errors,[]);await context.close();
    });
    test(`${engine}: D6 transcript failure, unavailable, empty and invalid responses retain explicit retry`,async()=>{
        let calls=0;
        const {page,context,errors}=await setup(engine,'watch','dark',{fixture:'d5-single-dark',url:'/watch?v=2isYuQZMbdU',reply:entry=>{
            if(!entry.url.pathname.startsWith('/api/v1/transcripts/'))return null;calls++;
            if(calls<=2)return{status:calls===1?503:404,contentType:'application/json',body:'{}'};
            return{contentType:'application/json',body:JSON.stringify({transcript:{body:calls===3?[]:calls===4?[{line:'Invalid time',startMs:'bad'}]:[{line:'Recovered transcript',startMs:0}]}})};
        }});
        await page.getByRole('tab',{name:'Transcript',exact:true}).click();await page.locator('#transcript-retry').waitFor({state:'visible'});const failed=await page.locator('#transcript-status').textContent();
        await page.locator('#transcript-retry').click();await page.waitForFunction(()=>document.querySelector('#transcript-status').textContent.includes('unavailable'));assert.notEqual(await page.locator('#transcript-status').textContent(),failed);
        await page.locator('#transcript-retry').click();await page.waitForFunction(()=>document.querySelector('#transcript-status').textContent==='No transcript lines are available.');assert.ok(await page.locator('#transcript-retry').isVisible());
        await page.locator('#transcript-retry').click();
        await page.waitForFunction(()=>!document.querySelector('#transcript-retry').hidden&&document.querySelector('#transcript-lines').getAttribute('aria-busy')==='false');assert.equal(await page.locator('#transcript-status').textContent(),failed);
        await page.locator('#transcript-retry').click();await page.waitForFunction(()=>document.querySelector('.transcript-line p')?.textContent==='Recovered transcript');assert.equal(calls,5);
        assert.equal(await page.locator('#transcript-lines').getAttribute('aria-busy'),'false');assert.deepEqual(errors,[]);await context.close();
    });
    test(`${engine}: D6 transcript script recovery stays deferred and initializes only once`,async()=>{
        let scripts=0;
        const {page,context,errors,requests}=await setup(engine,'watch','light',{fixture:'d5-single-light',url:'/watch?v=2isYuQZMbdU',reply:entry=>entry.url.pathname==='/js/transcript.js'&&++scripts===1?{status:503,body:''}:null});
        await page.getByRole('tab',{name:'Up next',exact:true}).click();assert.equal(scripts,0);await page.getByRole('tab',{name:'Transcript',exact:true}).click();await page.locator('#transcript-retry').waitFor({state:'visible'});
        await page.locator('#transcript-retry').click();await page.locator('.transcript-line').first().waitFor();await page.getByRole('tab',{name:'Up next',exact:true}).click();await page.getByRole('tab',{name:'Transcript',exact:true}).click();
        assert.equal(scripts,2);assert.equal(requests.filter(r=>r.url.pathname.startsWith('/api/v1/transcripts/')).length,1);assert.equal(await page.locator('#transcript-follow').count(),1);assert.deepEqual(errors,[]);await context.close();
    });
    test(`${engine}: D6 transcript generations and cached-page lifetimes reject transport that ignores abort`,async()=>{
        const {page,context,errors}=await setup(engine,'watch','light',{fixture:'d5-single-light',url:'/watch?v=2isYuQZMbdU',init:()=>{
            const original=window.fetch.bind(window);window.transcriptReads=[];
            window.fetch=(url,options)=>new URL(url,location.href).pathname.startsWith('/api/v1/transcripts/')?new Promise(resolve=>transcriptReads.push(body=>resolve(new Response(JSON.stringify({transcript:{body:[{line:body,startMs:0}]}}),{headers:{'Content-Type':'application/json'}})))):original(url,options);
        }});
        await page.getByRole('tab',{name:'Transcript',exact:true}).click();await page.waitForFunction(()=>transcriptReads.length===1);
        await page.locator('#transcript-language').selectOption({index:1});await page.waitForFunction(()=>transcriptReads.length===2);await page.evaluate(()=>transcriptReads[0]('Stale English'));
        assert.equal(await page.locator('.transcript-line').count(),0);await page.evaluate(()=>transcriptReads[1]('Current Indonesian'));await page.waitForFunction(()=>document.querySelector('.transcript-line p')?.textContent==='Current Indonesian');
        await page.locator('#transcript-language').selectOption({index:0});await page.waitForFunction(()=>transcriptReads.length===3);
        await page.evaluate(()=>{window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}));window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));});await page.waitForFunction(()=>transcriptReads.length===4);
        await page.evaluate(()=>transcriptReads[2]('Stale cached-page reply'));assert.equal(await page.locator('.transcript-line').count(),0);await page.evaluate(()=>transcriptReads[3]('Current English'));await page.waitForFunction(()=>document.querySelector('.transcript-line p')?.textContent==='Current English');
        await page.evaluate(()=>window.dispatchEvent(new Event('browserprofilechange')));await page.locator('#transcript-language').selectOption({index:1});assert.equal(await page.evaluate(()=>transcriptReads.length),4);
        assert.deepEqual(errors,[]);await context.close();
    });
}

for(const engine of engines) test(`${engine}: D6 transcript light, dark and enlarged RTL keyboard views`,async()=>{
    for(const mode of ['light','dark','rtl']) {
        const {page,context,errors}=await setup(engine,'watch',mode==='rtl'?'dark':mode,{fixture:mode==='rtl'?'d5-watch-rtl':`d5-single-${mode}`,url:'/watch?v=2isYuQZMbdU',width:1280,height:900,reply:entry=>entry.url.pathname.startsWith('/api/v1/transcripts/')?{contentType:'application/json',body:JSON.stringify({transcript:{body:Array.from({length:35},(_,i)=>({line:i===2?'A multilingual line العربية 日本語 with a very long literal '+ 'UnbrokenWord'.repeat(20):`A useful transcript passage ${i+1}.`,startMs:i*1000}))}})}:null});
        await page.locator('#tab-transcript').click();await page.locator('.transcript-line').first().waitFor();
        if(mode==='rtl')await page.addStyleTag({content:'.transcript-panel .transcript-line,.transcript-panel .transcript-line p,.transcript-panel .transcript-line h3,.transcript-panel .transcript-toolbar>label{font-size:20px}'});
        assert.ok(await page.locator('#transcript-lines').evaluate(el=>el.scrollWidth<=el.clientWidth+1));assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
        await page.locator('#transcript-follow').focus();await page.keyboard.press('Tab');await assertFocus(page,'#transcript-lines');assert.ok(await page.locator('#transcript-lines').evaluate(el=>getComputedStyle(el).outlineStyle!=='none'));
        await page.screenshot({path:path.join(artifacts,`${engine}-d6-transcript-${mode}-1280.png`)});assert.deepEqual(errors,[]);await context.close();
    }
});

for(const engine of engines) {
    test(`${engine}: D6 watch comments retain source/sort controls, compact independent replies and explicit continuations`,async()=>{
        const calls=[];let failed=false;
        const {page,context,errors,requests}=await setup(engine,'watch','light',{fixture:'d6-comments-light',url:'/watch?v=2isYuQZMbdU',reply:entry=>{
            if(!entry.url.pathname.startsWith('/api/v1/comments/'))return null;
            const source=entry.url.searchParams.get('source'),sort=entry.url.searchParams.get('sort_by'),cursor=entry.url.searchParams.get('continuation');calls.push({source,sort,cursor});
            if(cursor==='thread-a+/= &?日本語'&&!failed){failed=true;return{status:503,contentType:'application/json',body:'{}'};}
            return{contentType:'application/json',body:fs.readFileSync(path.join(generated,cursor?'d3-thread-end.json':'d6-comments-page.json'))};
        }});
        await page.locator('#comments-results>[data-comment-id]').first().waitFor();await page.evaluate(()=>window.commentMedia=player.tech().el());assert.equal(await page.locator('.comment-pinned').textContent(),'Pinned');
        await page.locator('#comment-sort').selectOption('new');await page.waitForFunction(()=>document.querySelectorAll('#comments-results>[data-comment-id]').length===3);
        const a=page.locator('[data-comment-id=post-a] [data-comment-replies]');await a.locator('[data-load-replies]').click();await a.locator('.ui-retry').waitFor();assert.equal(await a.locator('[data-load-replies]').count(),1);
        await a.locator('.ui-retry').click();await a.locator('[data-thread-toggle]').waitFor();await a.locator('[data-thread-toggle]').click();assert.equal(await a.locator('[data-thread-items]').isVisible(),false);await a.locator('[data-thread-toggle]').click();
        await page.locator('[data-comment-id=post-b] [data-load-replies]').click();await page.locator('[data-comment-id=post-b] [data-thread-toggle]').waitFor();
        await page.evaluate(()=>{InvidiousUI.changed(document.getElementById('comments-results'));InvidiousUI.changed(document.getElementById('comments-results'));});
        await page.locator('#comments-results>[data-comment-more] [data-load-more]').click();await page.waitForFunction(()=>document.querySelectorAll('#comments-results>.comment').length===4);
        assert.deepEqual(calls.filter(c=>c.cursor).map(c=>[c.cursor,c.sort]),[['thread-a+/= &?日本語','new'],['thread-a+/= &?日本語','new'],['thread-b+/= &?日本語','new'],['more+/= &?日本語','new']]);
        assert.deepEqual(await page.locator('#comment-source option').evaluateAll(nodes=>nodes.map(node=>node.value)),['youtube']);
        assert.equal(await page.locator('#comment-source-link>a').count(),0);
        await page.locator('#comment-sort').selectOption('top');await page.locator('[data-comment-id=post-a]').waitFor();
        assert.equal(calls.at(-1).source,'youtube');assert.equal(calls.at(-1).sort,'top');
        await page.locator('#comments').screenshot({path:path.join(artifacts,`${engine}-d6-comments-youtube-light.png`)});
        assert.equal(await page.evaluate(()=>player.tech().el()===commentMedia),true);assert.ok(!requests.some(r=>/^\/api\/v1\/(channels|videos)\//.test(r.url.pathname)));assert.deepEqual(errors,[]);await context.close();
    });
    test(`${engine}: D6 watch comments distinguish unavailable and empty results, known disabled sources, thin mode and no-JS`,async()=>{
        let reads=0;
        const {page,context,errors}=await setup(engine,'watch','dark',{fixture:'d6-comments-dark',url:'/watch?v=2isYuQZMbdU',reply:entry=>{
            if(!entry.url.pathname.startsWith('/api/v1/comments/'))return null;reads++;
            return reads<=2?{status:reads===1?503:404,contentType:'application/json',body:'{}'}:{contentType:'application/json',body:'{"contentHtml":"","commentCount":0}'};
        }});
        await page.locator('#comments-results .ui-retry').waitFor();const error=await page.locator('#comments-results>[data-thread-status]').textContent();
        await page.locator('#comments-results .ui-retry').click();await page.waitForFunction(()=>document.querySelector('#comments-results>[data-thread-status]').textContent.includes('unavailable'));assert.notEqual(await page.locator('#comments-results>[data-thread-status]').textContent(),error);
        await page.locator('#comments-results .ui-retry').click();await page.waitForFunction(()=>document.querySelector('#comments-results>[data-thread-status]').textContent==='No comments are available.');assert.equal(reads,3);
        assert.equal(await page.locator('#comment-source').isEnabled(),true);assert.equal(await page.locator('#comment-sort').isEnabled(),true);await page.locator('#comments').screenshot({path:path.join(artifacts,`${engine}-d6-comments-empty-dark.png`)});assert.deepEqual(errors,[]);await context.close();
        const disabled=await setup(engine,'watch','light',{fixture:'d6-comments-disabled-light',url:'/watch?v=2isYuQZMbdU',reply:entry=>entry.url.pathname.startsWith('/api/v1/comments/')?{contentType:'application/json',body:fs.readFileSync(path.join(generated,'d6-comments-page.json'))}:null});
        await disabled.page.locator('#comments-results>[data-thread-status]').waitFor();assert.equal(disabled.requests.filter(r=>r.url.pathname.startsWith('/api/v1/comments/')).length,0);
        assert.equal(await disabled.page.locator('#comment-source option[value=reddit]').count(),0);await disabled.page.locator('#comment-sort').selectOption('new');assert.equal(disabled.requests.filter(r=>r.url.pathname.startsWith('/api/v1/comments/')).length,0);assert.deepEqual(disabled.errors,[]);await disabled.context.close();
        const off=await setup(engine,'watch','light',{fixture:'d5-single-light',url:'/watch?v=2isYuQZMbdU'});assert.equal(await off.page.locator('#comment-source').count(),0);assert.equal(off.requests.filter(r=>r.url.pathname.startsWith('/api/v1/comments/')).length,0);assert.deepEqual(off.errors,[]);await off.context.close();
        const thin=await setup(engine,'watch','light',{fixture:'d6-comments-thin-light',url:'/watch?v=2isYuQZMbdU',reply:entry=>entry.url.pathname.startsWith('/api/v1/comments/')?{contentType:'application/json',body:fs.readFileSync(path.join(generated,'d6-comments-thin.json'))}:null});await thin.page.locator('[data-comment-id=post-a]').waitFor();assert.equal(await thin.page.locator('#comments .comment-avatar').count(),0);assert.equal(thin.requests.find(r=>r.url.pathname.startsWith('/api/v1/comments/')).url.searchParams.get('thin_mode'),'true');assert.deepEqual(thin.errors,[]);await thin.context.close();
        const nojs=await setup(engine,'watch','light',{fixture:'d6-comments-nojs-light',url:'/watch?v=2isYuQZMbdU&nojs=1',javascript:false});assert.equal(await nojs.page.locator('#comments-results>.comment').count(),3);const next=new URL(await nojs.page.locator('#comments-results>[data-comment-more] a').getAttribute('href'),'https://invidious.test');assert.equal(next.searchParams.get('comments_continuation'),'more+/= &?日本語');assert.equal(next.searchParams.get('nojs'),'1');assert.equal(next.searchParams.get('comments_source'),'youtube');assert.equal(nojs.requests.filter(r=>r.url.pathname.startsWith('/api/v1/comments/')).length,0);await nojs.context.close();
    });
    test(`${engine}: D6 comment sort and cached-page generations reject late reads after cancellation`,async()=>{
        const {page,context,errors}=await setup(engine,'watch','light',{fixture:'d6-comments-light',url:'/watch?v=2isYuQZMbdU',init:()=>{
            const original=window.fetch.bind(window);window.commentReads=[];window.fetch=(url,options)=>new URL(url,location.href).pathname.startsWith('/api/v1/comments/')?new Promise(resolve=>commentReads.push(data=>resolve(new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json'}})))):original(url,options);
        }});
        await page.waitForFunction(()=>commentReads.length===1);await page.locator('#comment-sort').selectOption('new');await page.waitForFunction(()=>commentReads.length===2);
        await page.evaluate(()=>commentReads[0]({contentHtml:'<p>Stale YouTube response</p>'}));assert.equal(await page.locator('#comments-results').getByText('Stale YouTube response').count(),0);
        const comments=JSON.parse(fs.readFileSync(path.join(generated,'d6-comments-page.json')));await page.evaluate(data=>commentReads[1](data),comments);await page.locator('[data-comment-id=post-a]').waitFor();
        await page.locator('#comment-sort').selectOption('top');await page.waitForFunction(()=>commentReads.length===3);await page.evaluate(()=>{window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}));window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));});await page.waitForFunction(()=>commentReads.length===4);
        await page.evaluate(()=>commentReads[2]({contentHtml:'<p>Stale cached-page response</p>'}));assert.equal(await page.locator('#comments-results').getByText('Stale cached-page response').count(),0);
        await page.evaluate(data=>commentReads[3](data),comments);await page.locator('[data-comment-id=post-a]').waitFor();await page.locator('#comment-sort').selectOption('new');await page.waitForFunction(()=>commentReads.length===5);
        await page.evaluate(()=>window.dispatchEvent(new Event('browserprofilechange')));await page.evaluate(()=>commentReads[4]({contentHtml:'<p>Stale profile response</p>'}));assert.equal(await page.locator('#comments-results').getByText('Stale profile response').count(),0);
        await page.locator('#comment-sort').selectOption('new');assert.equal(await page.evaluate(()=>commentReads.length),5);assert.deepEqual(errors,[]);await context.close();
    });
}

for(const engine of engines) {
    test(`${engine}: D6 chat editor saves explicit guest deltas, retains native overlay values and shares Settings search`,async()=>{
        const raw={chat_font_scale:100,chat_width_px:880,chat_overlay_mode:true,chat_overlay_opacity:0,chat_overlay_x:550,chat_overlay_y:75,chat_overlay_width:400,chat_overlay_height:800};
        const {page,context,requests,errors}=await setup(engine,'settings','light',{fixture:'d6-chat-settings-guest-light',url:'/preferences?section=chat',init:`localStorage.setItem('iv:browser:v2:guest:chat-settings-v1',${JSON.stringify(JSON.stringify(raw))})`});
        await page.waitForFunction(()=>window.InvidiousChatPreferences);const form=page.locator('[data-chat-preferences]');
        assert.equal(await page.locator('[id^=chat-overlay]').count(),0);assert.equal(await page.locator('#chat-show-timestamps').isChecked(),false);
        for(const [field,min,max] of [['#chat-font-value','75','150'],['#chat-width-value','280','640']]){assert.equal(await page.locator(field).getAttribute('min'),min);assert.equal(await page.locator(field).getAttribute('max'),max);}
        await page.locator('#chat-font-value').fill('101');assert.equal(await page.locator('#chat-font-scale').inputValue(),'101');assert.equal(await page.locator('#chat-font-scale').getAttribute('aria-valuetext'),'101%');
        await page.locator('#chat-font-value').fill('');assert.equal(await page.locator('#chat-font-scale').inputValue(),'101','an invalid numeric draft does not move the slider');assert.ok(await page.locator('#chat-font-error').isVisible());
        await page.locator('#chat-width-value').fill('617');assert.equal(await page.locator('#chat-width').inputValue(),'617');await page.locator('#chat-width-value').fill('640');
        await page.locator('#chat-font-value').fill('125');assert.equal(await page.locator('#chat-font-error').isVisible(),false);assert.equal(await form.locator('[data-chat-save]').isEnabled(),true);assert.equal(requests.filter(r=>r.method!=='GET').length,0,'preview does not save');
        await form.locator('[data-chat-save]').click();await page.waitForFunction(()=>document.querySelector('[data-chat-save]').disabled);
        const saved=await page.evaluate(()=>InvidiousStorage.local.get('chat-settings-v1'));assert.equal(saved.chat_font_scale,125);assert.equal(saved.chat_width_px,880,'unmodified historical display values stay raw');for(const key of Object.keys(raw).filter(k=>k.startsWith('chat_overlay')))assert.equal(saved[key],raw[key]);
        assert.equal(await page.locator('#chat-show-timestamps').isChecked(),false,'saving display does not replace an untouched guest timestamp default');assert.equal(await page.locator('#chat-word-blacklist').inputValue(),'/spam/','untouched cookie/default filters survive');
        await page.locator('#chat-word-blacklist').fill('/[/');await page.locator('#chat-word-blacklist').blur();assert.equal(await page.locator('#chat-word-blacklist').evaluate(el=>el.validity.valid),false);assert.equal(await page.evaluate(()=>InvidiousChatPreferences.values().chat_word_blacklist),'/spam/');
        await form.locator('[data-chat-discard]').click();assert.equal(await page.locator('#chat-word-blacklist').inputValue(),'/spam/');
        await page.locator('#settings-search').fill('Chat size');assert.ok(await page.locator('#settings-search-results a').first().isVisible());assert.equal(await page.locator('#settings-search-results a').first().getAttribute('data-settings-category'),null,'dedicated chat editor uses ordinary navigation');
        await page.locator('#settings-search').fill('captions');assert.ok(await page.locator('#settings-search-results [data-settings-category=captions-comments]').count());
        assert.equal(requests.filter(r=>r.url.pathname.startsWith('/api/')).length,0);assert.deepEqual(errors,[]);await context.close();
    });
    test(`${engine}: D6 chat account editor retains drafts, checks uncertain writes and confirms only changed fields`,async()=>{
        let state={chat_show_timestamps:false,chat_user_blacklist:'',chat_word_blacklist:'/spam/',chat_overlay_mode:true},attempts=0,reads=0;const writes=[];
        const {page,context,errors}=await setup(engine,'settings','dark',{fixture:'d6-chat-settings-account-dark',url:'/preferences?section=chat',reply:entry=>{
            if(entry.url.pathname==='/api/v1/auth/csrf')return{contentType:'application/json',body:'{"csrfToken":"test-session-token"}'};
            if(entry.url.pathname==='/api/v1/auth/chat_preferences'){
                const value=JSON.parse(entry.raw);
                writes.push(value);attempts++;if(attempts===1)return{status:403,contentType:'application/json',body:'{}'};
                state={...state,...value};return{contentType:'application/json',body:JSON.stringify(state)};
            }
            if(entry.url.pathname==='/api/v1/auth/preferences'){
                reads++;if(reads===1)return{status:503,contentType:'application/json',body:'{}'};
                if(reads===3)state={...state,chat_word_blacklist:'changed by another native client'};
                return{contentType:'application/json',body:JSON.stringify(state)};
            }
        }});
        await page.waitForFunction(()=>window.InvidiousChatPreferences);const form=page.locator('[data-chat-preferences]');await page.locator('#chat-show-timestamps').check();
        await form.locator('[data-chat-save]').click();await page.waitForFunction(()=>!document.querySelector('[data-chat-save]').disabled);assert.equal(await form.locator('[data-chat-readback]').isVisible(),false,'a known rejected write stays editable');assert.equal(await page.locator('#chat-show-timestamps').isChecked(),true);
        await form.locator('[data-chat-save]').click();await form.locator('[data-chat-readback]').waitFor({state:'visible'});assert.equal(await form.locator('[data-chat-save]').isDisabled(),true);assert.equal(attempts,2);
        await form.locator('[data-chat-readback]').click();await page.waitForFunction(()=>document.querySelector('[data-chat-readback]').hidden);assert.equal(await form.locator('[data-chat-save]').isDisabled(),true,'read-back confirms the committed value without another write');
        await page.locator('#chat-user-blacklist').fill('UCblocked');await form.locator('[data-chat-save]').click();await page.waitForFunction(()=>document.querySelector('[data-chat-save]').disabled&&document.querySelector('[data-chat-preferences]').getAttribute('aria-busy')==='false');
        assert.equal(await page.locator('#chat-word-blacklist').inputValue(),'changed by another native client');assert.deepEqual(writes,[{chat_show_timestamps:true},{chat_show_timestamps:true},{chat_user_blacklist:'UCblocked'}]);
        assert.ok(writes.every(value=>Object.keys(value).every(k=>['chat_show_timestamps','chat_user_blacklist','chat_word_blacklist'].includes(k))));assert.deepEqual(errors,[]);await context.close();
    });
    test(`${engine}: D6 chat editor reports denied persistence and restores the literal unsaved draft`,async()=>{
        const {page,context,errors}=await setup(engine,'settings','light',{fixture:'d6-chat-settings-guest-light',url:'/preferences?section=chat',init:()=>{
            const original=Storage.prototype.setItem,descriptor=Object.getOwnPropertyDescriptor(Document.prototype,'cookie');window.allowChatPersistence=false;
            Storage.prototype.setItem=function(key,value){if(!allowChatPersistence&&key.endsWith(':chat-settings-v1'))throw new DOMException('Quota','QuotaExceededError');return original.call(this,key,value);};
            Object.defineProperty(Document.prototype,'cookie',{configurable:true,get:descriptor.get,set(value){if(!allowChatPersistence&&value.startsWith('iv_browser_v2_'))return;descriptor.set.call(this,value);}});
        }});
        await page.waitForFunction(()=>window.InvidiousChatPreferences);const form=page.locator('[data-chat-preferences]');await page.locator('#chat-font-value').fill('120');await form.locator('[data-chat-save]').click();
        await page.waitForFunction(()=>document.querySelector('[data-chat-save-status]').textContent.includes('page'));assert.equal(await page.locator('#chat-font-value').inputValue(),'120');assert.equal(await form.locator('[data-chat-save]').isEnabled(),true);
        await form.locator('[data-chat-discard]').click();assert.equal(await page.locator('#chat-font-value').inputValue(),'100');assert.equal(await page.evaluate(()=>InvidiousChatPreferences.values().chat_font_scale),100);
        await page.evaluate(()=>window.allowChatPersistence=true);await form.locator('[data-chat-save]').click();await page.waitForFunction(()=>document.querySelector('[data-chat-save]').disabled);assert.equal(await page.evaluate(()=>InvidiousStorage.local.get('chat-settings-v1').chat_font_scale),100);assert.deepEqual(errors,[]);await context.close();
    });
    test(`${engine}: D6 chat editor ignores cached-page and profile completions without repeating a write`,async()=>{
        const {page,context,errors}=await setup(engine,'settings','light',{fixture:'d6-chat-settings-account-light',url:'/preferences?section=chat',init:()=>{
            const original=window.fetch.bind(window);window.chatEditorWrites=[];
            window.fetch=(url,options)=>new URL(url,location.href).pathname==='/api/v1/auth/chat_preferences'?new Promise(resolve=>chatEditorWrites.push(()=>resolve(new Response(JSON.stringify({chat_show_timestamps:true,chat_user_blacklist:'',chat_word_blacklist:'/spam/'}),{headers:{'Content-Type':'application/json'}})))):original(url,options);
        },reply:entry=>entry.url.pathname==='/api/v1/auth/csrf'?{contentType:'application/json',body:'{"csrfToken":"test-token"}'}:entry.url.pathname==='/api/v1/auth/preferences'?{contentType:'application/json',body:'{"chat_show_timestamps":true,"chat_user_blacklist":"","chat_word_blacklist":"/spam/"}'}:null});
        await page.waitForFunction(()=>window.InvidiousChatPreferences);const form=page.locator('[data-chat-preferences]');await page.locator('#chat-show-timestamps').check();await page.locator('#chat-font-value').fill('125');await form.locator('[data-chat-save]').click();await page.waitForFunction(()=>chatEditorWrites.length===1);
        await page.evaluate(()=>{window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}));window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));chatEditorWrites[0]();});await form.locator('[data-chat-readback]').waitFor({state:'visible'});assert.equal(await page.evaluate(()=>chatEditorWrites.length),1);
        await form.locator('[data-chat-readback]').click();await page.waitForFunction(()=>document.querySelector('[data-chat-readback]').hidden);assert.equal(await form.locator('[data-chat-save]').isEnabled(),true);await form.locator('[data-chat-save]').click();await page.waitForFunction(()=>document.querySelector('[data-chat-save]').disabled);assert.equal(await page.evaluate(()=>chatEditorWrites.length),1,'the remaining local save never repeats the server mutation');
        await page.evaluate(()=>window.dispatchEvent(new Event('browserprofilechange')));assert.equal(await page.evaluate(()=>InvidiousChatPreferences.values()),null);assert.equal(await page.locator('#chat-show-timestamps').isDisabled(),true);assert.deepEqual(errors,[]);await context.close();
    });
}

for(const engine of engines) test(`${engine}: D6 chat Settings light, dark and enlarged RTL views retain keyboard focus`,async()=>{
    for(const mode of ['light','dark','rtl']) {
        const {page,context,errors}=await setup(engine,'settings',mode==='rtl'?'dark':mode,{fixture:mode==='rtl'?'d6-chat-settings-rtl':`d6-chat-settings-guest-${mode}`,url:'/preferences?section=chat',width:1280,height:900});
        await page.waitForFunction(()=>window.InvidiousChatPreferences);
        if(mode==='rtl')await page.addStyleTag({content:'.chat-preferences-form label,.chat-preferences-form legend,.chat-preferences-form textarea{font-size:20px}'});
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.locator('#chat-show-timestamps').focus();await page.keyboard.press('Tab');await assertFocus(page,'#chat-hide-user-ids');
        assert.ok(await page.locator('#chat-hide-user-ids').evaluate(el=>getComputedStyle(el).outlineStyle!=='none'));
        await page.screenshot({path:path.join(artifacts,`${engine}-d6-chat-settings-${mode}-1280.png`)});assert.deepEqual(errors,[]);await context.close();
    }
});

function replayMessage(id,offsetMs,text,extra={}) { return {id,offsetMs,text,author:'A reader',authorChannelId:'UCreader',authorHandle:'@reader',kind:'text',amount:'',...extra}; }
for(const engine of engines) {
    test(`${engine}: D6 replay panel and dialog fit desktop light, dark, enlarged RTL and forced colors`,async()=>{
        for(const view of [{name:'light',mode:'light',width:1280,height:720},{name:'dark',mode:'dark',width:1920,height:1080},{name:'rtl',mode:'dark',width:1440,height:900},{name:'forced',mode:'light',width:1280,height:720}]) {
            const {page,context,errors}=await setup(engine,'watch',view.mode,{fixture:`d5-replay-${view.mode}`,url:'/watch?v=2isYuQZMbdU',width:view.width,height:view.height,init:`localStorage.setItem('iv:browser:v2:guest:chat-settings-v1','{"chat_show_timestamps":true,"chat_font_scale":150,"chat_width_px":640}')`,reply:entry=>entry.url.pathname.startsWith('/api/v1/live_chat/')?{contentType:'application/json',body:JSON.stringify({messages:[replayMessage('visible',0,'مرحبا بالعالم — a long message '+ 'LongUnbrokenMessage'.repeat(25),{author:'قارئ — Reader',authorChannelId:'UClong'.repeat(25)})],removedIds:[],continuation:null})}:null});
            await page.locator('[data-message-id=visible]').waitFor();
            if(view.name==='rtl') { await page.locator('html').evaluate(el=>el.dir='rtl');await page.addStyleTag({content:'.chat-preferences-form label,.chat-preferences-form legend,.chat-preferences-form textarea{font-size:20px}'}); }
            if(view.name==='forced')await page.emulateMedia({forcedColors:'active'});
            assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
            assert.ok(await page.locator('#chat-messages').evaluate(el=>el.scrollWidth<=el.clientWidth+1),'long messages and IDs wrap inside the log');
            const media=await page.locator('.watch-player').boundingBox(),panel=await page.locator('.utility-panel').boundingBox();
            assert.ok(view.name==='rtl'?panel.x+panel.width<=media.x-8:media.x+media.width<=panel.x-8,'the panel stays outside the media');
            await page.locator('#chat-messages').focus();await page.keyboard.press('Tab');await assertFocus(page,'.chat-time');assert.ok(await page.locator('.chat-time').evaluate(el=>getComputedStyle(el).outlineStyle!=='none'));
            await page.screenshot({path:path.join(artifacts,`${engine}-d6-replay-panel-${view.name}.png`)});
            await page.locator('[data-open-dialog=chat-settings-dialog]').click();await page.locator('#chat-word-blacklist').fill('/[/');await page.locator('#chat-word-blacklist').blur();await page.locator('[data-chat-save-status]').getByText('Invalid regular expression').waitFor();
            assert.equal(await page.locator('#chat-word-blacklist').inputValue(),'/[/');assert.equal(await page.locator('#chat-word-blacklist').evaluate(el=>getComputedStyle(el).direction),'ltr');assert.equal(await page.locator('#chat-word-error').textContent(),'Invalid regular expression');assert.equal(await page.locator('#chat-word-blacklist').getAttribute('aria-invalid'),'true');assert.equal(await page.locator('[data-message-id=visible]').count(),1);
            assert.ok(await page.locator('#chat-settings-dialog').evaluate(el=>{const b=el.getBoundingClientRect();return b.left>=0&&b.top>=0&&b.right<=innerWidth&&b.bottom<=innerHeight;}));
            assert.ok(await page.locator('.chat-settings-content').evaluate(el=>el.scrollWidth<=el.clientWidth+1));
            await page.locator('#chat-settings-dialog .icon-button').focus();await page.keyboard.press('Tab');
            // Firefox includes the native scroll container in keyboard order.
            if(await page.locator('.chat-settings-content').evaluate(el=>document.activeElement===el))await page.keyboard.press('Tab');
            await assertFocus(page,'#chat-show-timestamps');await page.locator('[data-chat-save-status]').scrollIntoViewIfNeeded();
            await page.screenshot({path:path.join(artifacts,`${engine}-d6-replay-dialog-${view.name}.png`)});await page.keyboard.press('Escape');await assertFocus(page,'[data-open-dialog=chat-settings-dialog]');
            assert.deepEqual(errors,[]);await context.close();
        }
    });
    test(`${engine}: D6 replay suspends outside native fullscreen and returns to its cached panel`,async()=>{
        const {page,context,errors,requests}=await setup(engine,'watch','dark',{fixture:'d5-replay-dark',url:'/watch?v=2isYuQZMbdU',reply:entry=>entry.url.pathname.startsWith('/api/v1/live_chat/')?{contentType:'application/json',body:JSON.stringify({messages:[replayMessage('cached',0,'Cached replay')],removedIds:[],continuation:null})}:null});
        await page.locator('[data-message-id=cached]').waitFor();await page.evaluate(async()=>{player.muted(true);await player.play();player.pause();window.fullscreenReplayMedia=player.tech().el();});
        await page.locator('.vjs-fullscreen-control').click();await page.waitForFunction(()=>player.isFullscreen()&&!invidiousChat.isVisible());
        assert.equal(await page.locator('#chat-panel').isVisible(),false);assert.equal(await page.locator('#player #chat-panel').count(),0);assert.equal(requests.filter(r=>r.url.pathname.startsWith('/api/v1/live_chat/')).length,1);
        await page.evaluate(()=>{player.exitFullscreen();});await page.waitForFunction(()=>!player.isFullscreen()&&invidiousChat.isVisible());await page.locator('[data-message-id=cached]').waitFor();
        assert.equal(requests.filter(r=>r.url.pathname.startsWith('/api/v1/live_chat/')).length,1);assert.equal(await page.evaluate(()=>player.tech().el()===fullscreenReplayMedia),true);assert.deepEqual(errors,[]);await context.close();
    });
}
for(const engine of engines) {
    test(`${engine}: D6 replay settings, filters, timing and timestamp seeks retain the same real media`,async()=>{
        const raw={chat_overlay_mode:true,chat_overlay_opacity:0,chat_overlay_x:550,chat_overlay_y:75,chat_overlay_width:400,chat_overlay_height:800};
        const messages=[replayMessage('first',0,'First message',{author:'Reader <literal>'}),replayMessage('blocked',100,'Hidden user message',{authorChannelId:'UCblocked'}),replayMessage('spam',200,'A spam message'),replayMessage('safe',1000,'Literal <img src=x onerror=alert(1)>'),replayMessage('paid',1500,'Thank you',{kind:'paid',amount:'$2.00'}),replayMessage('later',3000,'A later message')];
        const {page,context,requests,errors}=await setup(engine,'watch','light',{fixture:'d5-replay-light',url:'/watch?v=2isYuQZMbdU',init:`localStorage.setItem('iv:browser:v2:guest:chat-settings-v1',${JSON.stringify(JSON.stringify(raw))})`,reply:entry=>entry.url.pathname.startsWith('/api/v1/live_chat/')?{contentType:'application/json',body:JSON.stringify({messages,removedIds:[],continuation:null})}:null});
        await page.locator('[data-message-id=first]').waitFor();await page.evaluate(async()=>{player.muted(true);await player.play();player.pause();player.currentTime(1.5);window.replayMedia=player.tech().el();});await page.waitForFunction(()=>document.querySelectorAll('.chat-message').length===5);
        assert.equal(await page.locator('#chat-panel img').count(),0);assert.equal(await page.locator('[data-message-id=first] .chat-author').textContent(),'Reader <literal>');assert.equal(await page.locator('#player-container #chat-panel').count(),0);assert.equal(await page.locator('[id^=chat-overlay]').count(),0);
        await page.locator('[data-open-dialog=chat-settings-dialog]').click();const dialog=page.locator('#chat-settings-dialog');await dialog.waitFor({state:'visible'});
        await page.locator('#chat-hide-user-ids').check();await page.locator('#chat-font-value').fill('125');await page.locator('#chat-width-value').fill('600');await page.locator('#chat-user-blacklist').fill('UCblocked');await page.locator('#chat-word-blacklist').fill('spam');await page.locator('#chat-word-blacklist').blur();
        await page.waitForFunction(()=>document.querySelectorAll('.chat-message').length===3);assert.equal(await page.locator('#chat-panel .chat-author-id').first().isVisible(),false);
        await dialog.locator('[data-chat-save]').click();await page.waitForFunction(()=>document.querySelector('[data-chat-save]').disabled);const saved=await page.evaluate(()=>InvidiousStorage.local.get('chat-settings-v1'));for(const key of Object.keys(raw))assert.equal(saved[key],raw[key]);
        const timing=page.locator('#chat-timing-form');assert.equal(await page.locator('#chat-timing').getAttribute('step'),'0.001');await page.locator('#chat-timing').fill('-0.125');await page.locator('#chat-timing').blur();await timing.getByRole('button',{name:'Save timing',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#chat-timing-form [type=submit]').disabled);assert.equal(await page.evaluate(()=>InvidiousStorage.local.get('chat-timing-v1-'+video_data.id)),-125);
        assert.ok(await dialog.getByRole('button',{name:'Close',exact:true}).evaluate(el=>{const a=el.getBoundingClientRect(),b=document.querySelector('#chat-settings-dialog').getBoundingClientRect();return a.top>=b.top&&a.bottom<=b.bottom&&a.top>=0;}),'the close control remains visible after scrolling to timing');
        assert.ok(await page.locator('.utility-panel').evaluate(el=>{const w=document.querySelector('#watch-layout').getBoundingClientRect().width;return Math.abs(el.getBoundingClientRect().width-Math.min(600,w*.45))<2;}),'the preferred panel width affects the actual standard grid');
        await page.screenshot({path:path.join(artifacts,`${engine}-d6-replay-settings-light.png`)});await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.querySelector('#chat-settings-dialog').open);await assertFocus(page,'[data-open-dialog=chat-settings-dialog]');
        assert.equal(await page.evaluate(()=>player.tech().el()===replayMedia&&player.paused()&&Math.abs(player.currentTime()-1.5)<.05),true);
        await page.locator('[data-message-id=safe] .chat-time').click();await page.waitForFunction(()=>Math.abs(player.currentTime()-.875)<.05);const volume=await page.evaluate(()=>player.volume());await page.locator('#chat-messages').focus();await page.keyboard.press('ArrowDown');assert.equal(await page.evaluate(()=>player.volume()),volume);
        assert.equal(requests.filter(r=>r.url.pathname.startsWith('/api/v1/live_chat/')).length,1,'completed replay cache survives settings and nearby seeks');assert.equal(requests.filter(r=>r.method!=='GET').length,0);assert.equal(await page.locator('video,audio').count(),1);assert.deepEqual(errors,[]);await context.close();
    });
    test(`${engine}: D6 replay manual reading stays anchored until current-time return and DOM stays bounded`,async()=>{
        const messages=Array.from({length:300},(_,i)=>replayMessage('m'+i,i*10,'Message '+i));
        const {page,context,errors}=await setup(engine,'watch','dark',{fixture:'d5-replay-dark',url:'/watch?v=2isYuQZMbdU',reply:entry=>entry.url.pathname.startsWith('/api/v1/live_chat/')?{contentType:'application/json',body:JSON.stringify({messages,removedIds:[],continuation:null})}:null});
        await page.locator('.chat-message').first().waitFor();await page.evaluate(async()=>{player.muted(true);await player.play();player.pause();player.currentTime(1.7);});await page.waitForFunction(()=>document.querySelectorAll('.chat-message').length===120);
        const log=page.locator('#chat-messages');await log.hover();await page.mouse.wheel(0,-1000);await page.locator('#chat-sync').waitFor({state:'visible'});const top=await log.evaluate(el=>el.scrollTop),ids=await log.locator('.chat-message').evaluateAll(rows=>rows.map(row=>row.dataset.messageId));
        await page.evaluate(()=>player.play());await page.waitForFunction(()=>player.currentTime()>3.1);await page.evaluate(()=>player.pause());assert.ok(Math.abs(await log.evaluate(el=>el.scrollTop)-top)<1);assert.deepEqual(await log.locator('.chat-message').evaluateAll(rows=>rows.map(row=>row.dataset.messageId)),ids,'newly due messages do not replace the reading window');
        await page.locator('#chat-sync').click();await page.waitForFunction(()=>document.querySelector('#chat-messages').lastElementChild?.dataset.messageId==='m299');assert.equal(await log.locator('.chat-message').count(),120);assert.equal(await page.locator('#chat-sync').isVisible(),false);
        await log.evaluate(el=>{el.scrollTop=0;});await page.waitForFunction(()=>document.querySelector('#chat-messages').firstElementChild?.dataset.messageId!=='m180');assert.ok(await log.locator('.chat-message').count()<=120);assert.equal(await page.locator('#chat-sync').isVisible(),true);assert.deepEqual(errors,[]);await context.close();
    });
    test(`${engine}: D6 replay error, unavailable, invalid, waiting, filtered and empty states remain distinct`,async()=>{
        let calls=0;const messages=[replayMessage('future',1000,'A future message')];
        const {page,context,errors}=await setup(engine,'watch','light',{fixture:'d5-replay-light',url:'/watch?v=2isYuQZMbdU',reply:entry=>{
            if(!entry.url.pathname.startsWith('/api/v1/live_chat/'))return null;calls++;
            if(calls<=2)return{status:calls===1?503:404,contentType:'application/json',body:'{}'};
            return{contentType:'application/json',body:JSON.stringify({messages:calls===3?[{id:'bad',text:17,offsetMs:0}]:messages,removedIds:[],continuation:null})};
        }});
        await page.locator('#chat-retry').waitFor({state:'visible'});const failed=await page.locator('#chat-status').textContent();await page.locator('#chat-retry').click();await page.waitForFunction(()=>document.querySelector('#chat-status').textContent===JSON.parse(document.querySelector('#watch_ui_data').textContent).chat_unavailable);assert.notEqual(await page.locator('#chat-status').textContent(),failed);
        await page.locator('#chat-retry').click();await page.waitForFunction(()=>!document.querySelector('#chat-retry').hidden&&document.querySelector('#chat-status').textContent===JSON.parse(document.querySelector('#watch_ui_data').textContent).chat_error);
        await page.locator('#chat-retry').click();await page.waitForFunction(()=>document.querySelector('#chat-status').textContent===JSON.parse(document.querySelector('#watch_ui_data').textContent).chat_waiting);assert.equal(calls,4);assert.equal(await page.locator('.chat-message').count(),0);
        await page.evaluate(async()=>{player.muted(true);await player.play();player.pause();player.currentTime(1.1);});await page.locator('[data-message-id=future]').waitFor();await page.locator('[data-open-dialog=chat-settings-dialog]').click();await page.locator('#chat-word-blacklist').fill('future');await page.locator('#chat-word-blacklist').blur();await page.waitForFunction(()=>document.querySelector('#chat-status').textContent===JSON.parse(document.querySelector('#watch_ui_data').textContent).chat_filtered_empty);assert.equal(calls,4);await page.locator('[data-chat-discard]').click();await page.keyboard.press('Escape');assert.deepEqual(errors,[]);await context.close();
        const empty=await setup(engine,'watch','dark',{fixture:'d5-replay-dark',url:'/watch?v=2isYuQZMbdU',reply:entry=>entry.url.pathname.startsWith('/api/v1/live_chat/')?{contentType:'application/json',body:'{"messages":[],"removedIds":[],"continuation":null}'}:null});await empty.page.waitForFunction(()=>document.querySelector('#chat-status').textContent===JSON.parse(document.querySelector('#watch_ui_data').textContent).chat_empty);assert.equal(await empty.page.locator('.chat-message').count(),0);assert.deepEqual(empty.errors,[]);await empty.context.close();
        let stuckCalls=0;const stuck=await setup(engine,'watch','light',{fixture:'d5-replay-light',url:'/watch?v=2isYuQZMbdU',reply:entry=>{if(!entry.url.pathname.startsWith('/api/v1/live_chat/'))return null;stuckCalls++;return{contentType:'application/json',body:JSON.stringify({messages:[replayMessage('same',0,'Same cursor')],removedIds:[],continuation:'same'})};}});await stuck.page.locator('#chat-retry').waitFor({state:'visible'});assert.equal(stuckCalls,2,'a replay continuation without progress cannot poll forever');assert.deepEqual(stuck.errors,[]);await stuck.context.close();
    });
    test(`${engine}: D6 replay tab, cached-page and profile owners reject ignored aborts`,async()=>{
        const {page,context,errors}=await setup(engine,'watch','light',{fixture:'d5-replay-light',url:'/watch?v=2isYuQZMbdU',init:()=>{
            const original=window.fetch.bind(window);window.replayReads=[];window.fetch=(url,options)=>new URL(url,location.href).pathname.startsWith('/api/v1/live_chat/')?new Promise(resolve=>replayReads.push(data=>resolve(new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json'}})))):original(url,options);
        }});
        await page.waitForFunction(()=>replayReads.length===1);await page.getByRole('tab',{name:'Transcript',exact:true}).click();await page.evaluate(()=>replayReads[0]({messages:[{id:'late',offsetMs:0,text:'Late hidden reply'}],removedIds:[],continuation:null}));assert.equal(await page.locator('[data-message-id=late]').count(),0);
        await page.getByRole('tab',{name:'Chat replay',exact:true}).click();await page.waitForFunction(()=>replayReads.length===2);await page.evaluate(()=>replayReads[1]({messages:[{id:'ahead',offsetMs:40000,text:'Ahead'}],removedIds:[],continuation:'next'}));await page.waitForFunction(()=>document.querySelector('#chat-messages').getAttribute('aria-busy')==='false');
        await page.locator('[data-open-dialog=chat-settings-dialog]').click();await page.locator('#chat-timing').fill('-120');await page.locator('#chat-timing').blur();await page.waitForFunction(()=>replayReads.length===3);await page.evaluate(()=>{window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}));window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));});await page.waitForFunction(()=>replayReads.length===4);
        await page.evaluate(()=>replayReads[2]({messages:[{id:'stale-page',offsetMs:120000,text:'Stale cached page'}],removedIds:[],continuation:null}));assert.equal(await page.locator('[data-message-id=stale-page]').count(),0);await page.evaluate(()=>replayReads[3]({messages:[{id:'current',offsetMs:120000,text:'Current cached page'}],removedIds:[],continuation:'next'}));await page.locator('[data-message-id=current]').waitFor({state:'attached'});
        await page.locator('#chat-timing').fill('-240');await page.locator('#chat-timing').blur();await page.waitForFunction(()=>replayReads.length===5);await page.evaluate(()=>{window.dispatchEvent(new Event('browserprofilechange'));replayReads[4]({messages:[{id:'stale-profile',offsetMs:240000,text:'Stale profile'}],removedIds:[],continuation:null});});assert.equal(await page.locator('[data-message-id=stale-profile]').count(),0);assert.equal(await page.evaluate(()=>invidiousChat.isVisible()),false);assert.equal(await page.locator('#chat-timing').isDisabled(),true);assert.deepEqual(errors,[]);await context.close();
    });
    test(`${engine}: D6 account video timing uses native millisecond limits and explicit recovery`,async()=>{
        let offset=0,puts=0;const writes=[];
        const {page,context,errors}=await setup(engine,'watch','dark',{fixture:'d5-queue-chat-dark',url:'/watch?v=2isYuQZMbdU&list=IVfixture',reply:entry=>{
            if(entry.url.pathname==='/api/v1/playlists/IVfixture')return{contentType:'application/json',body:JSON.stringify(watchQueueSnapshot())};
            if(entry.url.pathname.startsWith('/api/v1/live_chat/'))return{contentType:'application/json',body:JSON.stringify({messages:[replayMessage('start',0,'Start')],removedIds:[],continuation:null})};
            if(entry.url.pathname==='/api/v1/auth/csrf')return{contentType:'application/json',body:'{"csrfToken":"timing-test-token"}'};
            if(entry.url.pathname.startsWith('/api/v1/auth/chat_timing/')){
                if(entry.method==='PUT'){puts++;offset=JSON.parse(entry.raw).offsetMs;writes.push({value:offset,token:entry.headers['x-csrf-token']});if(puts===1)return{status:503,contentType:'application/json',body:'{}'};}
                return{contentType:'application/json',body:JSON.stringify({offsetMs:offset})};
            }
        }});
        await page.getByRole('tab',{name:'Chat replay',exact:true}).click();await page.locator('[data-message-id=start]').waitFor();await page.locator('[data-open-dialog=chat-settings-dialog]').click();const form=page.locator('#chat-timing-form');await page.locator('#chat-timing').fill('0.125');await page.locator('#chat-timing').blur();assert.equal(puts,0);
        await form.getByRole('button',{name:'Save timing',exact:true}).click();await form.locator('[data-timing-readback]').waitFor({state:'visible'});assert.equal(await page.locator('#chat-timing').inputValue(),'0.125');assert.equal(puts,1);await form.locator('[data-timing-readback]').click();await page.waitForFunction(()=>document.querySelector('[data-timing-readback]').hidden);assert.equal(await form.locator('[type=submit]').isDisabled(),true);assert.deepEqual(writes,[{value:125,token:'timing-test-token'}]);
        await page.locator('#chat-timing').fill('3600.001');await form.locator('[type=submit]').click();assert.equal(puts,1);assert.equal(await page.locator('#chat-timing').evaluate(el=>el.validity.rangeOverflow),true);await form.locator('[type=reset]').click();assert.equal(await page.locator('#chat-timing').inputValue(),'0.125');assert.equal(await page.evaluate(()=>InvidiousStorage.local.get('chat-timing-v1-'+video_data.id)),undefined);assert.deepEqual(errors,[]);await context.close();
    });
}

for(const engine of engines) {
    test(`${engine}: D6 replay cache eviction is bounded and removed IDs cannot reappear in a chunk`,async()=>{
        const calls=[];
        const {page,context,errors}=await setup(engine,'watch','light',{fixture:'d5-replay-light',url:'/watch?v=2isYuQZMbdU',reply:entry=>{
            if(!entry.url.pathname.startsWith('/api/v1/live_chat/'))return null;
            const offset=Number(entry.url.searchParams.get('offset_ms'));calls.push(offset);
            return{contentType:'application/json',body:JSON.stringify({messages:Array.from({length:200},(_,i)=>replayMessage(offset+':'+i,offset+i,'Cached message '+i)),removedIds:[],continuation:'pending'})};
        }});
        await page.locator('.chat-message').first().waitFor();await page.locator('[data-open-dialog=chat-settings-dialog]').click();
        for(let position=1;position<=25;position++) {
            await page.locator('#chat-timing').fill(String(-35*position));await page.locator('#chat-timing').blur();
            await page.waitForFunction(prefix=>document.querySelector('#chat-messages').lastElementChild?.dataset.messageId.startsWith(prefix),String(position*35000)+':');assert.ok(await page.locator('.chat-message').count()<=120);
        }
        await page.locator('#chat-timing').fill('0');await page.locator('#chat-timing').blur();await page.waitForFunction(()=>document.querySelector('#chat-messages').lastElementChild?.dataset.messageId.startsWith('0:'));
        assert.equal(calls.filter(offset=>offset===0).length,2,'returning beyond the retained replay ranges rereads the evicted range');assert.ok(await page.locator('.chat-message').count()<=120);assert.deepEqual(errors,[]);await context.close();
        let chunks=0;const removed=await setup(engine,'watch','dark',{fixture:'d5-replay-dark',url:'/watch?v=2isYuQZMbdU',reply:entry=>{
            if(!entry.url.pathname.startsWith('/api/v1/live_chat/'))return null;chunks++;
            const messages=chunks===1?[replayMessage('alpha',0,'Removed message'),replayMessage('beta',100,'Surviving message')]:[replayMessage('alpha',0,'Must stay removed'),replayMessage('beta',100,'Duplicate'),replayMessage('gamma',200,'New message')];
            return{contentType:'application/json',body:JSON.stringify({messages,removedIds:chunks===1?[]:['alpha'],continuation:chunks===1?'second':null})};
        }});
        await removed.page.locator('[data-message-id=alpha]').waitFor();await removed.page.locator('[data-message-id=gamma]').waitFor();assert.equal(await removed.page.locator('[data-message-id=alpha]').count(),0);assert.equal(await removed.page.locator('[data-message-id=beta]').count(),1);assert.equal(await removed.page.locator('.chat-message').count(),2);assert.equal(chunks,2);assert.deepEqual(removed.errors,[]);await removed.context.close();
    });
}

function clipFixtureReply(entry) {
    if(entry.url.pathname==='/fixture.webm'||entry.url.pathname==='/latest_version')return{contentType:'video/webm',headers:{'accept-ranges':'bytes'},body:fs.readFileSync(path.join(generated,'watch-media','clip.webm'))};
    if(entry.url.pathname.startsWith('/api/v1/live_chat/'))return{contentType:'application/json',body:'{"messages":[],"removedIds":[],"continuation":null}'};
    return null;
}
async function configureRuntimeSponsorBlock(page, patch={}) {
    return page.evaluate(patch=>{
        const base=structuredClone(player_data.sponsorblock);
        const modes=Object.fromEntries(Object.keys(base.modes).map(key=>[key,'disabled']));
        window.runtimeSponsorConfig={...base,enabled:true,...patch,modes:{...modes,...patch.modes},colors:{...base.colors,...patch.colors}};
        return InvidiousSponsorBlock.configure(runtimeSponsorConfig);
    },patch);
}
function runtimeSnapshot(account=false) {
    return JSON.parse(fs.readFileSync(path.join(generated,`enhancement-runtime-${account?'account':'guest'}.json`),'utf8'));
}
function watchContent(kind,url) {
    const value=JSON.parse(fs.readFileSync(path.join(generated,`d6-watch-content-${kind}.json`)));
    if(url&&value.titles) { const ids=(url.searchParams.get('ids')||'').split(',');value.titles=Object.fromEntries(Object.entries(value.titles).filter(([id])=>ids.includes(id))); }
    if(url&&value.queueThumbnails) { const ids=(url.searchParams.get('channels')||'').split(',');value.queueThumbnails=Object.fromEntries(Object.entries(value.queueThumbnails).filter(([id])=>ids.includes(id))); }
    return value;
}
function watchOwner(kind) { return JSON.parse(fs.readFileSync(path.join(generated,`d6-watch-owner-${kind}.json`))); }
async function attachWatchEnhancements(page) {
    await page.addScriptTag({content:fs.readFileSync(path.join(root,'assets/js/watch-enhancements.js'),'utf8')});
    await attachEnhancementRuntime(page);
}
function holdWatchContentReads() {
    const original=window.fetch.bind(window);window.watchContentReads=[];
    window.fetch=(url,options={})=>{
        const target=new URL(url,location.href);
        if(target.pathname!=='/watch'||target.searchParams.get('format')!=='enhancements')return original(url,options);
        return new Promise(resolve=>watchContentReads.push({url:target.href,release:body=>resolve(new Response(JSON.stringify(body),{status:200,headers:{'Content-Type':'application/json'}}))}));
    };
}
for(const engine of engines) {
    test(`${engine}: D6 runtime automatic watch/listing owners handle hints and cached returns without manual script injection`,async()=>{
        for(const screen of ['watch','browse']) {
            const {page,context,requests,errors}=await setup(engine,screen,'light',{fixture:screen==='watch'?'d5-single-light':'qol-browse',url:screen==='watch'?'/watch?v=2isYuQZMbdU':'/feed/popular',reply:screen==='watch'?clipFixtureReply:undefined});
            await page.waitForFunction(()=>!!window.InvidiousEnhancements);
            assert.equal(await page.locator('script[src*="/js/enhancements.js"]').count(),1);
            assert.equal(requests.filter(r=>r.url.searchParams.get('format')==='runtime').length,0,'initial server state needs no extra owner GET');
            if(screen==='watch') {await readyClipMedia(page,13);assert.equal(await page.locator('script[src*="/js/watch-enhancements.js"]').count(),1);}
            await page.evaluate(()=>InvidiousUI.invalidate('preferences'));await page.waitForFunction(()=>InvidiousEnhancements.readState()==='ready');
            assert.equal(requests.filter(r=>r.url.searchParams.get('format')==='runtime').length,1);
            await page.evaluate(()=>{dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}));dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));});await page.waitForFunction(()=>InvidiousEnhancements.readState()==='ready');
            assert.equal(requests.filter(r=>r.url.searchParams.get('format')==='runtime').length,2);
            if(screen==='watch')assert.equal(await page.evaluate(()=>player.tech().el()===clipSourceMedia&&Math.abs(player.currentTime()-13)<.1),true);
            assert.equal(requests.filter(r=>r.url.searchParams.get('format')==='enhancements').length,0,'unchanged presentation needs no collection read');
            assert.deepEqual(errors,[]);await context.close();
        }
    });
    test(`${engine}: D6 watch content updates filters, original titles and advancement on the same media`,async()=>{
        let kind='all',snapshot=watchOwner(kind);
        const {page,context,requests,errors}=await setup(engine,'watch','light',{fixture:'d6-watch-content-initial-light',url:'/watch?v=2isYuQZMbdU',reply:entry=>{
            if(entry.url.searchParams.get('format')==='runtime')return{contentType:'application/json',body:JSON.stringify(snapshot)};
            if(entry.url.searchParams.get('format')==='enhancements')return{contentType:'application/json',body:JSON.stringify(watchContent(kind,entry.url))};
            return clipFixtureReply(entry);
        }});
        await readyClipMedia(page,13);await attachWatchEnhancements(page);
        await page.addScriptTag({content:fs.readFileSync(path.join(root,'assets/js/watch-enhancements.js'),'utf8')});await attachEnhancementRuntime(page,false);
        await page.evaluate(()=>InvidiousEnhancements.refresh());await page.waitForFunction(()=>InvidiousEnhancements.readState()==='ready');
        assert.equal(requests.filter(r=>r.url.searchParams.get('format')==='enhancements').length,0,'unchanged owner needs no content read');
        snapshot.state.ai.ai_blocklist_recommendations_action='replace_thumbnail';snapshot.state.sponsorblock.modes.intro='manual';
        await page.evaluate(()=>InvidiousEnhancements.refresh());await page.waitForFunction(()=>InvidiousEnhancements.readState()==='ready');
        assert.equal(requests.filter(r=>r.url.searchParams.get('format')==='enhancements').length,0,'inactive AI and segment preferences need no content read');
        await page.locator('#continue').uncheck();kind='filtered';snapshot=watchOwner(kind);
        await page.evaluate(()=>InvidiousEnhancements.refresh());await page.waitForFunction(()=>InvidiousWatchEnhancements.readState()==='ready'&&document.querySelectorAll('#watch-recommendation-items article').length===1);
        assert.deepEqual(await page.locator('#watch-recommendation-items article').evaluateAll(rows=>rows.map(row=>row.dataset.videoId)),['previous001']);
        assert.equal(await page.locator('.watch-heading h1').textContent(),'Selected original <literal> 2isYuQZMbdU');
        assert.equal(await page.evaluate(()=>document.title),'Selected original <literal> 2isYuQZMbdU - Invidious');
        assert.equal(await page.locator('#download-options input[name="title"]').inputValue(),'Selected original <literal> 2isYuQZMbdU');
        assert.equal(await page.evaluate(()=>video_data.next_video),'previous001');assert.equal(await page.locator('#continue').isChecked(),false);
        await page.screenshot({path:path.join(artifacts,`${engine}-d6-watch-content-filtered-light.png`)});
        kind='ai';snapshot=watchOwner(kind);await page.evaluate(()=>InvidiousEnhancements.refresh());await page.waitForFunction(()=>InvidiousWatchEnhancements.readState()==='ready'&&document.querySelectorAll('#watch-recommendation-items article').length===2);
        assert.deepEqual(await page.locator('#watch-recommendation-items article').evaluateAll(rows=>rows.map(row=>row.dataset.videoId)),['nextvideo01','abcdefghijk']);
        assert.equal(await page.locator('#watch-recommendation-items .ai-thumbnail').count(),1);
        kind='empty';snapshot=watchOwner(kind);await page.evaluate(()=>InvidiousEnhancements.refresh());await page.waitForFunction(()=>InvidiousWatchEnhancements.readState()==='ready'&&document.querySelectorAll('#watch-recommendation-items article').length===0);
        assert.equal(await page.evaluate(()=>video_data.next_video),null);assert.equal(await page.locator('#continue').isDisabled(),true);
        assert.equal(await page.locator('.watch-actions [data-video-action="unblock"]').count(),1,'canonical blocks refresh the existing contextual action');
        kind='all';snapshot=watchOwner(kind);await page.evaluate(()=>InvidiousEnhancements.refresh());await page.waitForFunction(()=>InvidiousWatchEnhancements.readState()==='ready'&&document.querySelectorAll('#watch-recommendation-items article').length===3);
        assert.equal(await page.locator('.watch-heading h1').textContent(),'A journey through light, color, and motion');
        assert.equal(await page.locator('#download-options input[name="title"]').inputValue(),'A journey through light, color, and motion');
        assert.equal(await page.evaluate(()=>player.tech().el()===clipSourceMedia&&player.paused()&&Math.abs(player.currentTime()-13)<.1),true);
        assert.equal(requests.filter(r=>r.url.searchParams.get('format')==='enhancements').length,4);assert.equal(requests.filter(r=>r.url.pathname.startsWith('/api/v1/playlists/')).length,0);
        assert.deepEqual(errors,[]);await context.close();
    });
    test(`${engine}: D6 watch content activates an initially empty Up next without rebuilding playback`,async()=>{
        const snapshot=watchOwner('all');
        const {page,context,errors}=await setup(engine,'watch','light',{fixture:'d6-watch-content-empty-light',url:'/watch?v=2isYuQZMbdU',reply:entry=>{
            if(entry.url.searchParams.get('format')==='runtime')return{contentType:'application/json',body:JSON.stringify(snapshot)};
            if(entry.url.searchParams.get('format')==='enhancements')return{contentType:'application/json',body:JSON.stringify(watchContent('all',entry.url))};
            return clipFixtureReply(entry);
        }});
        await readyClipMedia(page,13);assert.equal(await page.locator('#watch-recommendation-items article').count(),0);
        await attachWatchEnhancements(page);await page.evaluate(()=>InvidiousEnhancements.refresh());await page.waitForFunction(()=>InvidiousWatchEnhancements.readState()==='ready'&&document.querySelectorAll('#watch-recommendation-items article').length===3);
        assert.equal(await page.locator('#continue').isVisible(),true);assert.equal(await page.locator('#continue').isDisabled(),false);
        assert.equal(await page.evaluate(()=>player.tech().el()===clipSourceMedia&&Math.abs(player.currentTime()-13)<.1),true);
        await page.locator('#continue').check();await page.evaluate(()=>player.trigger('ended'));await page.waitForURL(/v=previous001/);
        assert.deepEqual(errors,[]);await context.close();
    });
    test(`${engine}: D6 watch content preserves duplicate member queue rows while changing AI/title/masking presentation`,async()=>{
        let kind='all',snapshot=watchOwner(kind);
        const {page,context,requests,errors}=await setup(engine,'watch','dark',{fixture:'d6-watch-content-queue-dark',url:'/watch?v=2isYuQZMbdU&list=IVfixture&index=2',reply:entry=>{
            if(entry.url.searchParams.get('format')==='runtime')return{contentType:'application/json',body:JSON.stringify(snapshot)};
            if(entry.url.searchParams.get('format')==='enhancements')return{contentType:'application/json',body:JSON.stringify(watchContent(kind,entry.url))};
            if(entry.url.pathname==='/api/v1/playlists/IVfixture')return{contentType:'application/json',body:JSON.stringify(watchContent('queue'))};
            return clipFixtureReply(entry);
        }});
        await readyClipMedia(page,13);await page.waitForFunction(()=>document.querySelectorAll('#playlist .queue-row').length===4);
        const before=await page.locator('#playlist .queue-row').evaluateAll(rows=>{window.preservedQueueRows=rows;return rows.map(row=>[row.dataset.videoId,row.dataset.occurrence]);});
        await attachWatchEnhancements(page);kind='ai';snapshot=watchOwner(kind);snapshot.state.masking.rules['UC'+'a'.repeat(22)]={hide_title:true,hide_thumbnail:true,reveal_after_days:null};
        await page.evaluate(()=>InvidiousEnhancements.refresh());await page.waitForFunction(()=>InvidiousWatchEnhancements.readState()==='ready');
        assert.deepEqual(await page.locator('#playlist .queue-row').evaluateAll(rows=>rows.map(row=>[row.dataset.videoId,row.dataset.occurrence])),before);
        assert.equal(await page.evaluate(()=>preservedQueueRows.every((row,i)=>row===document.querySelectorAll('#playlist .queue-row')[i])),true);
        assert.equal(await page.locator('#playlist [data-spoiler-thumbnail] .ai-thumbnail').count(),0,'canonical masking wins over AI replacement');
        assert.ok((await page.locator('#playlist [data-spoiler-title]').allTextContents()).every(text=>text.startsWith('Title hidden')));
        await page.locator('#tab-queue').click();await page.locator('#playlist [data-spoiler-thumbnail]').first().click();
        assert.equal(await page.locator('#playlist [data-spoiler-thumbnail] .ai-thumbnail').count(),1,'explicit image reveal shows the current AI replacement');
        await page.screenshot({path:path.join(artifacts,`${engine}-d6-watch-content-queue-dark.png`)});
        await page.evaluate(()=>document.documentElement.dir='rtl');await page.addStyleTag({content:'.queue-row,.queue-row button{font-size:20px!important}'});
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
        await page.screenshot({path:path.join(artifacts,`${engine}-d6-watch-content-queue-dark-rtl.png`)});
        kind='filtered';snapshot=watchOwner(kind);await page.evaluate(()=>InvidiousEnhancements.refresh());await page.waitForFunction(()=>InvidiousWatchEnhancements.readState()==='ready'&&document.querySelectorAll('#watch-recommendation-items article').length===1);
        assert.equal(await page.locator('#playlist .queue-row').count(),4,'membership and manual discovery hides preserve member occurrences');
        assert.equal(await page.locator('#playlist .ai-thumbnail').count(),0);
        assert.equal(requests.filter(r=>r.url.pathname==='/api/v1/playlists/IVfixture').length,1,'display preference changes never refetch/reorder the playlist');
        assert.equal(await page.evaluate(()=>player.tech().el()===clipSourceMedia&&player.paused()&&Math.abs(player.currentTime()-13)<.1),true);
        assert.deepEqual(errors,[]);await context.close();
    });
    test(`${engine}: D6 watch content failure keeps Queue usable and Retry reachable outside inactive tabs`,async()=>{
        let fail=true;const snapshot=watchOwner('ai');
        const {page,context,requests,errors}=await setup(engine,'watch','light',{fixture:'d6-watch-content-queue-light',url:'/watch?v=2isYuQZMbdU&list=IVfixture&index=2',reply:entry=>{
            if(entry.url.searchParams.get('format')==='runtime')return{contentType:'application/json',body:JSON.stringify(snapshot)};
            if(entry.url.searchParams.get('format')==='enhancements')return{contentType:'application/json',body:JSON.stringify(fail?{unexpected:'Unavailable'}:watchContent('ai',entry.url))};
            if(entry.url.pathname==='/api/v1/playlists/IVfixture')return{contentType:'application/json',body:JSON.stringify(watchContent('queue'))};
            return clipFixtureReply(entry);
        }});
        await readyClipMedia(page,13);await page.waitForFunction(()=>document.querySelectorAll('#playlist .queue-row').length===4);
        await attachWatchEnhancements(page);await page.evaluate(()=>InvidiousEnhancements.refresh());await page.waitForFunction(()=>InvidiousWatchEnhancements.readState()==='unavailable');
        assert.equal(await page.locator('#tool-queue').isVisible(),true);assert.equal(await page.locator('#tool-next').isVisible(),false);
        assert.equal(await page.locator('#watch-enhancements-feedback').isVisible(),true);assert.equal(await page.locator('#watch-enhancements-retry').isVisible(),true);
        assert.equal(await page.locator('#playlist .queue-remove').evaluateAll(buttons=>buttons.every(button=>!button.disabled)),true,'accepted owner state permits unrelated explicit queue actions');
        await page.screenshot({path:path.join(artifacts,`${engine}-d6-watch-content-error-queue-light.png`)});
        fail=false;await page.locator('#watch-enhancements-retry').click();await page.waitForFunction(()=>InvidiousWatchEnhancements.readState()==='ready');
        assert.equal(await page.locator('#watch-enhancements-feedback').isVisible(),false);assert.equal(await page.locator('#tool-queue').isVisible(),true);
        assert.equal(requests.filter(r=>r.url.pathname==='/api/v1/playlists/IVfixture').length,1);assert.equal(requests.filter(r=>r.method==='POST'&&r.url.pathname!=='/preferences/timezone').length,0);
        assert.equal(await page.evaluate(()=>player.tech().el()===clipSourceMedia&&Math.abs(player.currentTime()-13)<.1),true);assert.deepEqual(errors,[]);await context.close();
    });
    test(`${engine}: D6 watch content unknown/malformed reads suspend advancement and Retry rechecks only reads`,async()=>{
        let snapshot=watchOwner('filtered');
        const {page,context,requests,errors}=await setup(engine,'watch','light',{fixture:'d6-watch-content-initial-light',url:'/watch?v=2isYuQZMbdU',init:holdWatchContentReads,reply:entry=>entry.url.searchParams.get('format')==='runtime'?{contentType:'application/json',body:JSON.stringify(snapshot)}:clipFixtureReply(entry)});
        await readyClipMedia(page,13);await attachWatchEnhancements(page);await page.evaluate(()=>InvidiousEnhancements.refresh());await page.waitForFunction(()=>watchContentReads.length===1);
        assert.equal(await page.locator('#watch-recommendation-items').isVisible(),false);assert.equal(await page.locator('#continue').isDisabled(),true);
        await page.evaluate(()=>player.trigger('ended'));assert.equal(requests.filter(r=>r.navigation).length,1,'unknown optional state cannot navigate away from playback');
        await page.evaluate(()=>watchContentReads[0].release({error:'Unknown result'}));await page.locator('#watch-enhancements-retry').waitFor({state:'visible'});
        await page.evaluate(()=>InvidiousEnhancements.refresh());await page.waitForFunction(()=>InvidiousEnhancements.readState()==='ready');
        assert.equal(await page.evaluate(()=>watchContentReads.length),1,'unrelated owner checks do not retry the failed content read');
        const readsBefore=requests.filter(r=>r.url.searchParams.get('format')==='runtime').length;
        await page.locator('#watch-enhancements-retry').click();await page.waitForFunction(()=>watchContentReads.length===2);
        assert.equal(requests.filter(r=>r.url.searchParams.get('format')==='runtime').length,readsBefore+1,'Retry first proves the current owner');
        await page.evaluate(data=>watchContentReads[1].release(data),watchContent('filtered',new URL(await page.evaluate(()=>watchContentReads[1].url))));await page.waitForFunction(()=>InvidiousWatchEnhancements.readState()==='ready');
        assert.equal(await page.locator('#watch-recommendation-items').isVisible(),true);assert.equal(requests.filter(r=>r.method==='POST'&&r.url.pathname!=='/preferences/timezone').length,0);
        assert.equal(await page.evaluate(()=>player.tech().el()===clipSourceMedia&&Math.abs(player.currentTime()-13)<.1),true);assert.deepEqual(errors,[]);await context.close();
    });
    test(`${engine}: D6 watch content rejects late reads after owner changes, cached returns and profile disposal`,async()=>{
        for(const boundary of ['owner','cache','profile']) {
            let snapshot=watchOwner('filtered');
            const {page,context,errors}=await setup(engine,'watch','light',{fixture:'d6-watch-content-initial-light',url:'/watch?v=2isYuQZMbdU',init:holdWatchContentReads,reply:entry=>entry.url.searchParams.get('format')==='runtime'?{contentType:'application/json',body:JSON.stringify(snapshot)}:clipFixtureReply(entry)});
            await readyClipMedia(page,13);await attachWatchEnhancements(page);await page.evaluate(()=>InvidiousEnhancements.refresh());await page.waitForFunction(()=>watchContentReads.length===1);
            if(boundary==='owner') {snapshot=watchOwner('all');await page.evaluate(()=>InvidiousEnhancements.refresh());await page.waitForFunction(()=>InvidiousEnhancements.readState()==='ready');}
            else if(boundary==='cache') {snapshot=watchOwner('all');await page.evaluate(()=>{dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}));dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));});await page.waitForFunction(()=>InvidiousEnhancements.readState()==='ready');}
            else await page.evaluate(()=>dispatchEvent(new Event('browserprofilechange')));
            await page.evaluate(data=>watchContentReads[0].release(data),watchContent('filtered'));await page.evaluate(()=>new Promise(resolve=>setTimeout(resolve,50)));
            assert.equal(await page.locator('#watch-recommendation-items article').count(),3,'late content never replaces the retained owner rows');
            if(boundary!=='profile')assert.equal(await page.locator('.watch-heading h1').textContent(),'A journey through light, color, and motion');
            else assert.equal(await page.locator('#watch-recommendation-items').isVisible(),false);
            assert.equal(await page.evaluate(()=>player.tech().el()===clipSourceMedia&&Math.abs(player.currentTime()-13)<.1),true);assert.deepEqual(errors,[]);await context.close();
        }
    });
}
async function isolateRuntimeTitle(page) {
    await page.evaluate(()=>document.querySelectorAll('[data-dearrow-id]').forEach(element=>{if(!element.hasAttribute('data-dearrow-watch'))element.removeAttribute('data-dearrow-id');}));
}
for(const engine of engines) {
    test(`${engine}: D6 runtime DeArrow activates, retains explicit title cycles, disables and refreshes contribution winners in place`,async()=>{
        const snapshot=runtimeSnapshot(true);let title='First replacement <literal>';
        const {page,context,requests,errors}=await setup(engine,'watch','light',{fixture:'d6-clip-chat-light',url:'/watch?v=2isYuQZMbdU',reply:entry=>{
            if(entry.url.searchParams.get('format')==='runtime')return{contentType:'application/json',body:JSON.stringify(snapshot)};
            if(entry.url.pathname.startsWith('/api/v1/dearrow/'))return{contentType:'application/json',body:JSON.stringify({title})};
            return clipFixtureReply(entry);
        }});
        await readyClipMedia(page,13);await isolateRuntimeTitle(page);snapshot.state.profile=await page.evaluate(()=>InvidiousStorage.scope);
        const original=await page.locator('.watch-heading h1').textContent();await attachEnhancementRuntime(page);
        assert.equal(await page.evaluate(()=>InvidiousDeArrow.readState()),'disabled');assert.equal(requests.filter(r=>r.url.pathname.startsWith('/api/v1/dearrow/')).length,0);
        snapshot.state.dearrow.enabled=true;snapshot.fingerprint='b'.repeat(64);await page.evaluate(()=>InvidiousEnhancements.refresh('preferences'));
        await page.waitForFunction(title=>document.querySelector('.watch-heading h1').textContent===title,title);
        let cycle=page.locator('.watch-heading .dearrow-reveal');await cycle.hover();await cycle.focus();assert.equal(await page.locator('.watch-heading h1').textContent(),title);
        await cycle.click();assert.equal(await page.locator('.watch-heading h1').textContent(),original);assert.equal(await cycle.getAttribute('aria-label'),'Show DeArrow title');
        assert.equal(await page.evaluate(original=>document.title===original+' - Invidious'&&player_data.title===original&&shareOptions.title===original,original),true);
        snapshot.now++;await page.evaluate(()=>InvidiousEnhancements.refresh());await page.waitForFunction(()=>InvidiousEnhancements.readState()==='ready');
        await page.waitForFunction(original=>document.querySelector('.watch-heading h1').textContent===original,original);
        assert.equal(await cycle.getAttribute('aria-pressed'),'true');assert.equal(requests.filter(r=>r.url.pathname==='/api/v1/dearrow/2isYuQZMbdU').length,1);
        snapshot.state.dearrow.enabled=false;snapshot.fingerprint='c'.repeat(64);await page.evaluate(()=>InvidiousEnhancements.refresh('preferences'));await page.waitForFunction(()=>InvidiousEnhancements.readState()==='ready');
        assert.equal(await cycle.count(),0);assert.equal(await page.locator('.watch-heading h1').textContent(),original);
        snapshot.state.dearrow.enabled=true;snapshot.state.dearrow.showOriginal=false;snapshot.fingerprint='d'.repeat(64);
        await page.evaluate(()=>InvidiousEnhancements.refresh('preferences'));await page.waitForFunction(title=>document.querySelector('.watch-heading h1').textContent===title,title);
        assert.equal(await cycle.count(),0);assert.equal(requests.filter(r=>r.url.pathname==='/api/v1/dearrow/2isYuQZMbdU').length,1);
        title='Second replacement';await page.evaluate(()=>InvidiousUI.invalidate('dearrow'));await page.waitForFunction(title=>document.querySelector('.watch-heading h1').textContent===title,title);
        assert.equal(requests.filter(r=>r.url.pathname==='/api/v1/dearrow/2isYuQZMbdU').length,2);
        assert.equal(await page.evaluate(title=>player.tech().el()===clipSourceMedia&&player.paused()&&Math.abs(player.currentTime()-13)<.1&&shareOptions.title===title,title),true);
        assert.deepEqual(errors,[]);await context.close();
    });
    test(`${engine}: D6 runtime DeArrow ignores late reads after disabling, cached restoration and profile changes`,async()=>{
        for(const lifetime of ['disable','cache','profile']) {
            const snapshot=runtimeSnapshot(true);snapshot.state.dearrow.enabled=true;
            const {page,context,errors}=await setup(engine,'watch','light',{fixture:'d6-clip-chat-light',url:'/watch?v=2isYuQZMbdU',init:()=>{
                const fetch=window.fetch.bind(window);window.heldTitleReads=[];
                window.fetch=(url,options)=>new URL(url,location.href).pathname.startsWith('/api/v1/dearrow/')?new Promise(resolve=>heldTitleReads.push(title=>resolve(new Response(JSON.stringify({title}),{headers:{'Content-Type':'application/json'}})))):fetch(url,options);
            },reply:entry=>entry.url.searchParams.get('format')==='runtime'?{contentType:'application/json',body:JSON.stringify(snapshot)}:clipFixtureReply(entry)});
            await readyClipMedia(page,13);await isolateRuntimeTitle(page);snapshot.state.profile=await page.evaluate(()=>InvidiousStorage.scope);const original=await page.locator('.watch-heading h1').textContent();
            await attachEnhancementRuntime(page);await page.evaluate(()=>InvidiousEnhancements.refresh());await page.waitForFunction(()=>heldTitleReads.length===1);
            if(lifetime==='disable') {snapshot.state.dearrow.enabled=false;snapshot.fingerprint='b'.repeat(64);await page.evaluate(()=>InvidiousEnhancements.refresh());await page.waitForFunction(()=>InvidiousEnhancements.readState()==='ready');}
            else if(lifetime==='cache') {await page.evaluate(()=>{dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}));dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));});await page.waitForFunction(()=>heldTitleReads.length===2);}
            else await page.evaluate(()=>dispatchEvent(new Event('browserprofilechange')));
            await page.evaluate(()=>heldTitleReads[0]('A late winner'));await page.evaluate(()=>new Promise(resolve=>setTimeout(resolve,20)));
            assert.notEqual(await page.locator('.watch-heading h1').textContent(),'A late winner');
            if(lifetime==='cache'){await page.evaluate(()=>heldTitleReads[1]('Current winner'));await page.waitForFunction(()=>document.querySelector('.watch-heading h1').textContent==='Current winner');}
            else assert.equal(await page.locator('.watch-heading h1').textContent(),lifetime==='profile'?'Title hidden':original);
            assert.equal(await page.evaluate(()=>player.tech().el()===clipSourceMedia&&Math.abs(player.currentTime()-13)<.1),true);assert.deepEqual(errors,[]);await context.close();
        }
    });
    test(`${engine}: D6 runtime DeArrow failures keep originals and require the explicit player Settings Retry`,async()=>{
        for(const failure of ['http','malformed','timeout']) {
            const snapshot=runtimeSnapshot(true);snapshot.state.dearrow.enabled=true;let reads=0;
            const {page,context,errors}=await setup(engine,'watch','light',{fixture:'d6-clip-chat-light',url:'/watch?v=2isYuQZMbdU',reply:entry=>{
                if(entry.url.searchParams.get('format')==='runtime')return{contentType:'application/json',body:JSON.stringify(snapshot)};
                if(entry.url.pathname.startsWith('/api/v1/dearrow/')){reads++;return reads===1&&failure!=='timeout'?(failure==='http'?{status:503,body:''}:{contentType:'application/json',body:'{"title":{}}'}):{contentType:'application/json',body:'{"title":"Retried title"}'};}
                return clipFixtureReply(entry);
            }});
            await readyClipMedia(page,13);await isolateRuntimeTitle(page);snapshot.state.profile=await page.evaluate(()=>InvidiousStorage.scope);const original=await page.locator('.watch-heading h1').textContent();
            if(failure==='timeout')await page.evaluate(()=>{
                const schedule=setTimeout;window.setTimeout=(fn,ms,...args)=>schedule(fn,ms===10000?40:ms,...args);
                const fetch=window.fetch.bind(window);let first=true;
                window.fetch=(url,options={})=>{if(new URL(url,location.href).pathname.startsWith('/api/v1/dearrow/')&&first){first=false;return new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError'))));}return fetch(url,options);};
            });
            await attachEnhancementRuntime(page);await page.evaluate(()=>InvidiousEnhancements.refresh());await page.waitForFunction(()=>InvidiousDeArrow.readState()==='unavailable');
            assert.equal(await page.locator('.watch-heading h1').textContent(),original);
            await page.evaluate(()=>InvidiousEnhancements.refresh());await page.waitForFunction(()=>InvidiousEnhancements.readState()==='ready'&&InvidiousDeArrow.readState()==='unavailable');assert.equal(reads,failure==='timeout'?0:1);
            await page.locator('.vjs-desktop-settings').click();const panel=page.getByRole('dialog',{name:'Settings',exact:true});await panel.getByRole('menuitem',{name:'Enhancements',exact:true}).click();
            await panel.getByRole('menuitem',{name:'DeArrow · Retry',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.watch-heading h1').textContent==='Retried title');
            assert.equal(reads,failure==='timeout'?1:2);assert.equal(await page.evaluate(()=>player.tech().el()===clipSourceMedia&&player.paused()&&Math.abs(player.currentTime()-13)<.1),true);assert.deepEqual(errors,[]);await context.close();
        }
    });
    test(`${engine}: D6 runtime DeArrow has zero disabled scans, four concurrent reads and one lookup per duplicate ID`,async()=>{
        const {page,context,errors}=await setup(engine,'browse','light',{fixture:'spoiler-cards-inactive',url:'/feed/popular',init:()=>{
            window.dearrowScans=0;const query=Element.prototype.querySelectorAll;
            Element.prototype.querySelectorAll=function(selector){if(selector==='[data-dearrow-id]')dearrowScans++;return query.call(this,selector);};
        }});
        assert.equal(await page.evaluate(()=>InvidiousDeArrow.readState()),'disabled');
        await page.evaluate(()=>{const root=document.createElement('div');for(let i=0;i<1000;i++)root.append(document.createElement('span'));document.body.append(root);});
        await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));assert.equal(await page.evaluate(()=>dearrowScans),0);
        await page.evaluate(()=>{
            document.querySelectorAll('[data-dearrow-id]').forEach(element=>element.removeAttribute('data-dearrow-id'));
            window.budgetTitleReads=[];window.budgetActive=0;window.budgetMax=0;const fetch=window.fetch.bind(window);
            window.fetch=(url,options)=>{const target=new URL(url,location.href);if(!target.pathname.startsWith('/api/v1/dearrow/'))return fetch(url,options);
                budgetActive++;budgetMax=Math.max(budgetMax,budgetActive);
                return new Promise(resolve=>budgetTitleReads.push({id:target.pathname.split('/').at(-1),release(){budgetActive--;resolve(new Response(JSON.stringify({title:'Clear '+this.id}),{headers:{'Content-Type':'application/json'}}));}}));
            };
            const region=document.createElement('div');region.id='title-budget';region.style.cssText='position:fixed;inset:100px auto auto 100px;width:400px;height:200px';
            for(let i=0;i<109;i++) {
                const row=document.createElement('div');row.dataset.dearrowRow='';row.style.cssText='position:absolute;inset:0';
                const title=document.createElement('span');title.dataset.dearrowId='runtime'+String(i<9?i:0).padStart(4,'0');title.textContent='Original '+i;row.append(title);region.append(row);
            }
            document.body.append(region);InvidiousDeArrow.configure({enabled:true,showOriginal:false,originalLabel:'Show original title'});
        });
        await page.waitForFunction(()=>budgetTitleReads.length===4);await page.evaluate(()=>new Promise(resolve=>setTimeout(resolve,30)));assert.equal(await page.evaluate(()=>budgetTitleReads.length),4);
        for(let index=0;index<9;index++){await page.waitForFunction(index=>budgetTitleReads.length>index,index);await page.evaluate(index=>budgetTitleReads[index].release(),index);}
        await page.waitForFunction(()=>InvidiousDeArrow.readState()==='ready');
        assert.equal(await page.evaluate(()=>budgetTitleReads.length),9);assert.equal(await page.evaluate(()=>budgetMax),4);
        assert.equal(await page.locator('#title-budget [data-dearrow-id="runtime0000"]').count(),101);
        assert.ok((await page.locator('#title-budget [data-dearrow-id="runtime0000"]').allTextContents()).every(title=>title==='Clear runtime0000'));
        await page.evaluate(()=>{InvidiousDeArrow.configure({enabled:false,showOriginal:false,originalLabel:'Show original title'});dearrowScans=0;const region=document.createElement('div');for(let i=0;i<1000;i++)region.append(document.createElement('span'));document.body.append(region);});
        await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));assert.equal(await page.evaluate(()=>dearrowScans),0);assert.equal(await page.evaluate(()=>budgetTitleReads.length),9);
        assert.deepEqual(errors,[]);await context.close();
    });
}
for(const engine of engines) {
    test(`${engine}: D6 runtime masking activates, preserves unchanged reveals and removes rules on the same media`,async()=>{
        const snapshot=runtimeSnapshot(true);
        const {page,context,requests,errors}=await setup(engine,'watch','light',{fixture:'d6-clip-chat-light',url:'/watch?v=2isYuQZMbdU',reply:entry=>entry.url.searchParams.get('format')==='runtime'?{contentType:'application/json',body:JSON.stringify(snapshot)}:clipFixtureReply(entry)});
        await readyClipMedia(page,13);
        const original=await page.locator('.watch-heading h1').textContent(),channel=await page.evaluate(()=>video_data.channel_id);
        snapshot.state.profile=await page.evaluate(()=>InvidiousStorage.scope);
        await attachEnhancementRuntime(page);
        snapshot.state.masking.rules[channel]={hide_title:true,hide_thumbnail:true,reveal_after_days:null};snapshot.fingerprint='b'.repeat(64);
        await page.evaluate(()=>InvidiousUI.invalidate('preferences'));await page.waitForFunction(()=>InvidiousEnhancements.readState()==='ready');
        const cycle=page.locator('.watch-heading .spoiler-title-reveal');
        assert.equal(await page.locator('.watch-heading h1').textContent(),'Title hidden');assert.equal(await page.title(),'Title hidden - Invidious');
        assert.equal(await page.evaluate(()=>player.poster()===''&&player_data.thumbnail===''&&shareOptions.image===''&&shareOptions.title==='Title hidden'),true);
        assert.ok((await page.locator('meta[property="og:title"],meta[name="twitter:title"]').evaluateAll(nodes=>nodes.map(n=>n.content))).every(value=>value==='Title hidden'));
        assert.equal(await page.locator('#download-options input[name="title"]').inputValue(),'Title hidden');
        assert.equal(await page.locator('#download-options form').evaluate(form=>new FormData(form).get('title')),'Title hidden');
        await cycle.hover();await cycle.focus();assert.equal(await page.locator('.watch-heading h1').textContent(),'Title hidden');
        await cycle.click();assert.equal(await page.locator('.watch-heading h1').textContent(),original);assert.equal(await page.title(),original+' - Invidious');
        assert.equal(await page.locator('#download-options input[name="title"]').inputValue(),'Title hidden','a scoped main-title reveal does not reveal the download filename');
        await page.locator('.spoiler-poster-reveal').click();assert.equal(await page.locator('.spoiler-poster-reveal').count(),0);
        assert.equal(await page.evaluate(()=>!!player.poster()&&!player_data.spoiler_thumbnail_hidden),true);
        snapshot.now++;await page.evaluate(()=>InvidiousEnhancements.refresh());await page.waitForFunction(()=>InvidiousEnhancements.readState()==='ready');
        assert.equal(await page.locator('.watch-heading h1').textContent(),original,'an unchanged check retains an explicit title reveal');
        assert.equal(await page.locator('.spoiler-poster-reveal').count(),0,'an unchanged check retains an explicit image reveal');
        snapshot.state.masking.rules[channel].reveal_after_days=7;snapshot.fingerprint='c'.repeat(64);
        await page.evaluate(()=>InvidiousEnhancements.refresh('preferences'));await page.waitForFunction(()=>InvidiousEnhancements.readState()==='ready');
        assert.equal(await cycle.count(),0);assert.equal(await page.locator('.watch-heading h1').textContent(),original);
        assert.equal(await page.locator('#download-options input[name="title"]').inputValue(),original);
        assert.equal(await page.evaluate(()=>!!player.poster()&&!player_data.spoiler_thumbnail_hidden),true);
        snapshot.state.masking.rules={};snapshot.fingerprint='d'.repeat(64);
        await page.evaluate(()=>InvidiousEnhancements.refresh('preferences'));await page.waitForFunction(()=>InvidiousEnhancements.readState()==='ready');
        assert.equal(await page.locator('.spoiler-title-reveal,.spoiler-poster-reveal').count(),0);
        assert.equal(await page.evaluate(()=>player.tech().el()===clipSourceMedia&&player.paused()&&Math.abs(player.currentTime()-13)<.1),true);
        assert.equal(requests.filter(r=>/^\/api\/v1\/(videos|dearrow)\//.test(r.url.pathname)).length,0);assert.deepEqual(errors,[]);await context.close();
    });
    test(`${engine}: D6 runtime masking fails closed while owner state is unknown and Retry preserves playback`,async()=>{
        const snapshot=runtimeSnapshot();
        const {page,context,errors}=await setup(engine,'watch','light',{fixture:'d5-single-light',url:'/watch?v=2isYuQZMbdU',init:()=>{
            const fetch=window.fetch.bind(window);window.maskingReads=[];
            window.fetch=(url,options)=>new URL(url,location.href).searchParams.get('format')==='runtime'?new Promise(resolve=>maskingReads.push(data=>resolve(new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json'}})))):fetch(url,options);
        },reply:clipFixtureReply});
        await readyClipMedia(page,13);const original=await page.locator('.watch-heading h1').textContent();await attachEnhancementRuntime(page);
        await page.evaluate(()=>InvidiousEnhancements.refresh());await page.waitForFunction(()=>maskingReads.length===1);
        assert.equal(await page.locator('.watch-heading h1').textContent(),'Title hidden');assert.equal(await page.locator('.watch-heading .spoiler-title-reveal').isDisabled(),true);
        assert.equal(await page.locator('.spoiler-poster-reveal').isDisabled(),true);assert.equal(await page.evaluate(()=>player.poster()===''&&player_data.thumbnail===''&&shareOptions.image===''),true);
        assert.equal(await page.locator('#download-options input[name="title"]').inputValue(),'Title hidden');
        await page.evaluate(()=>maskingReads[0]({error:'Unavailable'}));await page.waitForFunction(()=>InvidiousEnhancements.readState()==='unavailable');
        assert.equal(await page.locator('.watch-heading h1').textContent(),'Title hidden');assert.equal(await page.title(),'Title hidden - Invidious');
        assert.equal(await page.locator('#download-options form').evaluate(form=>{form.reset();return new FormData(form).get('title');}),'Title hidden','a form reset cannot restore the old hidden filename');
        await page.locator('#ui-notice').getByRole('button',{name:'Retry',exact:true}).click();await page.waitForFunction(()=>maskingReads.length===2);
        await page.evaluate(data=>maskingReads[1](data),snapshot);await page.waitForFunction(()=>InvidiousEnhancements.readState()==='ready');
        assert.equal(await page.locator('.watch-heading h1').textContent(),original);assert.equal(await page.locator('.spoiler-poster-reveal').count(),0);
        assert.equal(await page.locator('#download-options input[name="title"]').inputValue(),original);
        assert.equal(await page.evaluate(()=>player.tech().el()===clipSourceMedia&&player.paused()&&Math.abs(player.currentTime()-13)<.1),true);assert.deepEqual(errors,[]);await context.close();
    });
    test(`${engine}: D6 runtime masking activates guest rules in an open tab without navigation or per-item reads`,async()=>{
        const {page,context,requests,errors}=await setup(engine,'watch','light',{fixture:'d5-single-light',url:'/watch?v=2isYuQZMbdU',reply:clipFixtureReply});
        await readyClipMedia(page,13);const original=await page.locator('.watch-heading h1').textContent(),url=page.url();
        const other=await context.newPage();await other.goto('https://invidious.test/watch?v=2isYuQZMbdU');
        await other.evaluate(()=>InvidiousStorage.local.set('channel_spoiler_settings',{[video_data.channel_id]:{name:'Local only',hide_title:true,hide_thumbnail:true,reveal_after_days:null}}));
        await page.waitForFunction(()=>document.querySelector('.watch-heading h1').textContent==='Title hidden');assert.equal(page.url(),url);
        assert.equal(await page.evaluate(()=>player.tech().el()===clipSourceMedia&&Math.abs(player.currentTime()-13)<.1),true);
        await other.evaluate(()=>InvidiousStorage.local.set('channel_spoiler_settings',{}));await page.waitForFunction(original=>document.querySelector('.watch-heading h1').textContent===original,original);
        assert.equal(await page.locator('.spoiler-poster-reveal').count(),0);assert.equal(page.url(),url);
        assert.equal(requests.filter(r=>/^\/api\/v1\/(videos|dearrow)\//.test(r.url.pathname)).length,0);assert.deepEqual(errors,[]);await context.close();
    });
    test(`${engine}: D6 runtime masking reevaluates age boundaries while preserving unknown-date reveals and occurrence order`,async()=>{
        const snapshot=runtimeSnapshot(true),id='UC'+'a'.repeat(22);snapshot.state.masking.rules[id]={hide_title:true,hide_thumbnail:true,reveal_after_days:7};
        const {page,context,requests,errors}=await setup(engine,'watch','light',{fixture:'d6-clip-chat-light',url:'/watch?v=2isYuQZMbdU',reply:entry=>entry.url.searchParams.get('format')==='runtime'?{contentType:'application/json',body:JSON.stringify(snapshot)}:clipFixtureReply(entry)});
        await readyClipMedia(page,13);snapshot.state.profile=await page.evaluate(()=>InvidiousStorage.scope);
        await page.evaluate(({id,now})=>{
            const region=document.createElement('div');region.id='masking-occurrences';
            for(const [key,published] of [['recent',now-6*86400],['unknown',null],['old',now-8*86400]]) {
                const row=document.createElement('div');row.dataset.dearrowRow='';row.dataset.occurrence=key;
                const title=document.createElement('span');title.dataset.spoilerTitle='';title.dataset.spoilerChannel=id;title.dataset.spoilerPublished=published===null?'':String(published);title.dataset.spoilerOriginal=key+' original';title.textContent=title.dataset.spoilerOriginal;row.append(title);region.append(row);
            }
            document.querySelector('main').append(region);
        },{id,now:snapshot.now});
        await attachEnhancementRuntime(page);await page.evaluate(()=>InvidiousEnhancements.refresh());await page.waitForFunction(()=>InvidiousEnhancements.readState()==='ready');
        const recent=page.locator('[data-occurrence=recent]'),unknown=page.locator('[data-occurrence=unknown]');
        assert.equal(await recent.locator('[data-spoiler-title]').textContent(),'Title hidden');assert.match(await unknown.locator('[data-spoiler-title]').textContent(),/upload date unknown/);
        await unknown.locator('.spoiler-title-reveal').click();assert.equal(await unknown.locator('[data-spoiler-title]').textContent(),'unknown original');
        snapshot.now+=2*86400;await page.evaluate(()=>InvidiousEnhancements.refresh());await page.waitForFunction(()=>InvidiousEnhancements.readState()==='ready');
        assert.equal(await recent.locator('[data-spoiler-title]').textContent(),'recent original');assert.equal(await recent.locator('.spoiler-title-reveal').count(),0);
        assert.equal(await unknown.locator('[data-spoiler-title]').textContent(),'unknown original');assert.equal(await unknown.locator('.spoiler-title-reveal').count(),1);
        assert.deepEqual(await page.locator('#masking-occurrences>[data-occurrence]').evaluateAll(nodes=>nodes.map(n=>n.dataset.occurrence)),['recent','unknown','old']);
        assert.equal(await page.evaluate(()=>player.tech().el()===clipSourceMedia&&Math.abs(player.currentTime()-13)<.1),true);
        assert.equal(requests.filter(r=>/^\/api\/v1\/(videos|dearrow)\//.test(r.url.pathname)).length,0);assert.deepEqual(errors,[]);await context.close();
    });
    test(`${engine}: D6 runtime masking rejects pending title reveals after rule and profile changes`,async()=>{
        for(const lifetime of ['rules','profile']) {
            const snapshot=runtimeSnapshot(true);
            const {page,context,errors}=await setup(engine,'watch','light',{fixture:'d6-clip-chat-light',url:'/watch?v=2isYuQZMbdU',reply:entry=>entry.url.searchParams.get('format')==='runtime'?{contentType:'application/json',body:JSON.stringify(snapshot)}:clipFixtureReply(entry)});
            await readyClipMedia(page,13);snapshot.state.profile=await page.evaluate(()=>InvidiousStorage.scope);snapshot.state.dearrow.enabled=true;
            snapshot.state.masking.rules[await page.evaluate(()=>video_data.channel_id)]={hide_title:true,hide_thumbnail:false,reveal_after_days:null};
            await attachEnhancementRuntime(page);await page.evaluate(()=>{InvidiousSpoilers.bindDeArrow(()=>new Promise(resolve=>window.releaseMaskedTitle=resolve));InvidiousEnhancements.refresh();});await page.waitForFunction(()=>InvidiousEnhancements.readState()==='ready');
            await page.locator('.watch-heading .spoiler-title-reveal').click();await page.waitForFunction(()=>typeof releaseMaskedTitle==='function');
            if(lifetime==='rules') {
                snapshot.state.dearrow.enabled=false;snapshot.fingerprint='e'.repeat(64);await page.evaluate(()=>InvidiousEnhancements.refresh());await page.waitForFunction(()=>InvidiousEnhancements.readState()==='ready');
            } else await page.evaluate(()=>dispatchEvent(new Event('browserprofilechange')));
            await page.evaluate(()=>releaseMaskedTitle('A late title must stay hidden'));await page.evaluate(()=>new Promise(resolve=>setTimeout(resolve,20)));
            assert.equal(await page.locator('.watch-heading h1').textContent(),'Title hidden');assert.equal(await page.title(),'Title hidden - Invidious');
            assert.equal(await page.getByText('A late title must stay hidden',{exact:true}).count(),0);
            assert.equal(await page.evaluate(()=>player.tech().el()===clipSourceMedia&&Math.abs(player.currentTime()-13)<.1),true);assert.deepEqual(errors,[]);await context.close();
        }
    });
    test(`${engine}: D6 runtime masking prevents late storyboards from reinstalling hover images and reuses the VTT read`,{timeout:20000},async()=>{
        const snapshot=runtimeSnapshot(true);let releaseVTT,signalVTT,vttReads=0;const vttStarted=new Promise(resolve=>{signalVTT=resolve;});
        const {page,context,requests,errors}=await setup(engine,'watch','light',{fixture:'watch-spoiler-original',url:'/watch?v=2isYuQZMbdU',reply:entry=>{
            if(entry.url.searchParams.get('format')==='runtime')return{contentType:'application/json',body:JSON.stringify(snapshot)};
            if(entry.url.pathname.startsWith('/api/v1/storyboards/')){vttReads++;return new Promise(resolve=>{releaseVTT=()=>resolve({contentType:'text/vtt',body:'WEBVTT\n\n00:00:00.000 --> 00:03:00.000\n/vi/board-image/mqdefault.jpg#xywh=0,0,90,50\n'});signalVTT();});}
            return clipFixtureReply(entry);
        }});
        await readyClipMedia(page,13);snapshot.state.profile=await page.evaluate(()=>InvidiousStorage.scope);const id=await page.evaluate(()=>video_data.channel_id);
        snapshot.state.masking.rules[id]={hide_title:true,hide_thumbnail:true,reveal_after_days:7};
        assert.equal(vttReads,0);await page.locator('.spoiler-poster-reveal').click();await page.waitForFunction(()=>!player_data.spoiler_thumbnail_hidden);await vttStarted;
        await attachEnhancementRuntime(page);snapshot.state.masking.rules[id].reveal_after_days=8;snapshot.fingerprint='f'.repeat(64);
        await page.evaluate(()=>InvidiousEnhancements.refresh());await page.waitForFunction(()=>InvidiousEnhancements.readState()==='ready');
        assert.equal(await page.evaluate(()=>player_data.spoiler_thumbnail_hidden&&player.poster()===''),true);
        releaseVTT();await page.evaluate(()=>new Promise(resolve=>setTimeout(resolve,40)));assert.equal(await page.locator('.vjs-vtt-thumbnail-display').count(),0);
        assert.equal(requests.filter(r=>r.url.pathname==='/vi/board-image/mqdefault.jpg').length,0);
        await page.locator('.spoiler-poster-reveal').click();await page.locator('.vjs-vtt-thumbnail-display').waitFor({state:'attached'});assert.equal(vttReads,1);
        assert.equal(await page.evaluate(()=>player.tech().el()===clipSourceMedia&&player.paused()&&Math.abs(player.currentTime()-13)<.1),true);assert.deepEqual(errors,[]);await context.close();
    });
}
async function attachEnhancementRuntime(page, collect=true) {
    await page.addScriptTag({content:fs.readFileSync(path.join(root,'assets/js/enhancements.js'),'utf8')});
    if(collect)await page.evaluate(()=>{
        window.runtimeApplications=[];window.runtimeSuspensions=0;window.runtimeDisposals=0;
        InvidiousEnhancements.register('verification',{
            suspend(){runtimeSuspensions++;},dispose(){runtimeDisposals++;},
            apply(value,detail){runtimeApplications.push({value,detail,frozen:Object.isFrozen(value)&&Object.isFrozen(value.masking.rules)&&Object.isFrozen(detail.kinds)});}
        });
    });
}
async function browseOwnerSnapshot(page) {
    const owner=await page.evaluate(()=>({profile:InvidiousStorage.scope,fingerprint:InvidiousUI.config.ownerBrowseFingerprint,history:location.pathname==='/feed/history'}));
    const snapshot=runtimeSnapshot(owner.profile!=='guest');snapshot.state.profile=owner.profile;
    snapshot.state[owner.history?'historyFingerprint':'browseFingerprint']=owner.fingerprint;
    return snapshot;
}
function fixtureWithBrowseOwner(name,fingerprint) {
    return fixtureHTML(name).replace(/(<script id="ui-config"[^>]*>)([\s\S]*?)(<\/script>)/,(_,start,raw,end)=>{
        const config=JSON.parse(raw);config.browseFingerprint=config.ownerBrowseFingerprint=fingerprint;return start+JSON.stringify(config).replace(/</g,'\\u003c')+end;
    });
}
for(const engine of engines) {
    test(`${engine}: D6 runtime browse unchanged owner checks retain appended pages, Back scroll and reusable descriptors`,async()=>{
        let snapshot;
        const {page,context,requests,errors}=await setup(engine,'browse','light',{fixture:'qol-browse',url:'/feed/popular',reply:entry=>{
            if(entry.url.searchParams.get('format')==='runtime')return{contentType:'application/json',body:JSON.stringify(snapshot)};
            if(entry.url.pathname==='/feed/popular'&&entry.url.searchParams.has('page'))return{contentType:'text/html',body:fixtureHTML('qol-browse-next')};
        }});
        snapshot=await browseOwnerSnapshot(page);await attachEnhancementRuntime(page);
        await page.locator('[data-load-more]').click();await page.waitForFunction(()=>document.querySelectorAll('[data-browse-items]>.media-item').length===24);
        const order=await page.locator('[data-browse-items]>.media-item').evaluateAll(nodes=>nodes.map(node=>node.dataset.videoId));await page.evaluate(()=>scrollTo(0,650));
        await page.evaluate(()=>InvidiousUI.invalidate('preferences'));await page.waitForFunction(()=>InvidiousEnhancements.readState()==='ready');
        assert.deepEqual(await page.locator('[data-browse-items]>.media-item').evaluateAll(nodes=>nodes.map(node=>node.dataset.videoId)),order);
        assert.equal(await page.evaluate(()=>InvidiousStorage.session.get('browse_state').views.at(-1).pages.length),1);
        await page.evaluate(()=>{dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}));dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));});
        await page.waitForFunction(()=>InvidiousEnhancements.readState()==='ready');assert.ok(await page.evaluate(()=>scrollY>500));
        assert.equal(requests.filter(r=>r.url.pathname==='/feed/popular'&&r.url.searchParams.has('page')).length,1,'a cached return does not replay unchanged continuations');
        assert.equal(requests.filter(r=>r.url.searchParams.get('format')==='runtime').length,2);assert.deepEqual(errors,[]);await context.close();
    });
    test(`${engine}: D6 runtime browse changed Back owner state retires old continuations and refreshes through ordinary navigation`,async()=>{
        let snapshot,changed=false;
        const {page,context,requests,errors}=await setup(engine,'browse','light',{fixture:'qol-browse',url:'/feed/popular',reply:entry=>{
            if(entry.url.searchParams.get('format')==='runtime')return{contentType:'application/json',body:JSON.stringify(snapshot)};
            if(entry.url.pathname==='/feed/popular')return{contentType:'text/html',body:changed?fixtureWithBrowseOwner('qol-browse','f'.repeat(64)):fixtureHTML(entry.url.searchParams.has('page')?'qol-browse-next':'qol-browse')};
        }});
        snapshot=await browseOwnerSnapshot(page);await attachEnhancementRuntime(page);await page.locator('[data-load-more]').click();await page.waitForFunction(()=>document.querySelectorAll('[data-browse-items]>.media-item').length===24);
        const order=await page.locator('[data-browse-items]>.media-item').evaluateAll(nodes=>nodes.map(node=>node.dataset.videoId));
        changed=true;snapshot.state.blockedChannels=['UC'+'a'.repeat(22)];snapshot.state.browseFingerprint='f'.repeat(64);snapshot.fingerprint='b'.repeat(64);
        await page.evaluate(()=>{dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}));dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));});
        await page.waitForFunction(()=>InvidiousEnhancements.readState()==='ready');assert.match(await page.locator('[data-browse-status]').textContent(),/changed/i);
        assert.equal(await page.locator('[data-load-more]').isVisible(),false);assert.equal(await page.evaluate(()=>InvidiousStorage.session.get('browse_state')),undefined);
        assert.deepEqual(await page.locator('[data-browse-items]>.media-item').evaluateAll(nodes=>nodes.map(node=>node.dataset.videoId)),order);
        assert.equal(requests.filter(r=>r.url.pathname==='/feed/popular'&&r.url.searchParams.has('page')).length,1);
        await Promise.all([page.waitForNavigation(),page.locator('[data-browse-status] .ui-retry').click()]);await page.waitForFunction(()=>document.body.dataset.uiInitialized==='true');
        assert.equal(await page.locator('[data-browse-items]>.media-item').count(),12);assert.equal(requests.filter(r=>r.url.pathname==='/feed/popular'&&r.url.searchParams.has('page')).length,1,'the new owner never replays an old preview');
        assert.deepEqual(errors,[]);await context.close();
    });
    test(`${engine}: D6 runtime browse failed owner checks and late aborted pages cannot unlock or duplicate a later continuation`,async()=>{
        let snapshot,failed=true;
        const {page,context,requests,errors}=await setup(engine,'browse','light',{fixture:'qol-browse',url:'/feed/popular',init:()=>{
            const fetch=window.fetch.bind(window);window.heldBrowsePages=[];
            window.fetch=(url,options)=>new URL(url,location.href).searchParams.has('page')?new Promise(resolve=>heldBrowsePages.push(html=>resolve(new Response(html,{headers:{'Content-Type':'text/html'}})))):fetch(url,options);
        },reply:entry=>{
            if(entry.url.searchParams.get('format')==='runtime')return failed?{status:503,body:''}:{contentType:'application/json',body:JSON.stringify(snapshot)};
        }});
        snapshot=await browseOwnerSnapshot(page);await attachEnhancementRuntime(page);await page.locator('[data-load-more]').click();await page.waitForFunction(()=>heldBrowsePages.length===1);
        await page.evaluate(()=>InvidiousUI.invalidate('preferences'));await page.waitForFunction(()=>InvidiousEnhancements.readState()==='unavailable');
        assert.equal(await page.locator('[data-load-more]').isDisabled(),true);assert.equal(await page.locator('[data-browse-items]>.media-item').count(),12);
        failed=false;await page.locator('#ui-notice .ui-retry').click();await page.waitForFunction(()=>InvidiousEnhancements.readState()==='ready');
        await page.locator('[data-load-more]').click();await page.waitForFunction(()=>heldBrowsePages.length===2);
        await page.evaluate(html=>heldBrowsePages[0](html),fixtureHTML('qol-browse-next'));await page.evaluate(()=>new Promise(resolve=>setTimeout(resolve,20)));
        assert.equal(await page.locator('[data-load-more]').isDisabled(),true);assert.equal(await page.locator('[data-browse-region]').getAttribute('aria-busy'),'true');
        assert.equal(await page.locator('[data-browse-items]>.media-item').count(),12);
        await page.evaluate(html=>heldBrowsePages[1](html),fixtureHTML('qol-browse-next'));await page.waitForFunction(()=>document.querySelectorAll('[data-browse-items]>.media-item').length===24);
        assert.equal(await page.evaluate(()=>InvidiousStorage.session.get('browse_state').views.at(-1).pages.length),1);
        assert.ok(requests.filter(r=>r.url.searchParams.get('format')==='runtime').every(r=>r.method==='GET'&&!r.raw));assert.deepEqual(errors,[]);await context.close();
    });
    test(`${engine}: D6 runtime browse uses the history owner key and keeps private POST state out of durable previews`,async()=>{
        let snapshot;
        const history=await setup(engine,'browse','light',{fixture:'d4-history-light',url:'/feed/history',reply:entry=>entry.url.searchParams.get('format')==='runtime'?{contentType:'application/json',body:JSON.stringify(snapshot)}:null});
        snapshot=await browseOwnerSnapshot(history.page);await attachEnhancementRuntime(history.page);snapshot.state.browseFingerprint='f'.repeat(64);
        await history.page.evaluate(()=>InvidiousEnhancements.refresh());await history.page.waitForFunction(()=>InvidiousEnhancements.readState()==='ready');
        assert.doesNotMatch(await history.page.locator('[data-browse-status]').textContent(),/changed/i);
        const order=await history.page.locator('[data-browse-items] [data-video-id]').evaluateAll(nodes=>nodes.map(node=>node.dataset.videoId));
        snapshot.state.historyFingerprint='e'.repeat(64);await history.page.evaluate(()=>InvidiousEnhancements.refresh());await history.page.waitForFunction(()=>InvidiousEnhancements.readState()==='ready');
        assert.match(await history.page.locator('[data-browse-status]').textContent(),/changed/i);assert.deepEqual(await history.page.locator('[data-browse-items] [data-video-id]').evaluateAll(nodes=>nodes.map(node=>node.dataset.videoId)),order);
        assert.deepEqual(history.errors,[]);await history.context.close();
        const privatePage=await setup(engine,'browse','light',{fixture:'qol-search-true-1',url:'/search',reply:entry=>entry.url.searchParams.get('format')==='runtime'?{contentType:'application/json',body:JSON.stringify(snapshot)}:null});
        snapshot=await browseOwnerSnapshot(privatePage.page);await attachEnhancementRuntime(privatePage.page);await privatePage.page.evaluate(()=>InvidiousEnhancements.refresh());await privatePage.page.waitForFunction(()=>InvidiousEnhancements.readState()==='ready');
        assert.equal(await privatePage.page.evaluate(()=>InvidiousStorage.session.get('browse_state')),undefined);assert.equal(await privatePage.page.evaluate(()=>!!(history.state&&history.state.ivBrowse)),false);
        assert.equal(privatePage.requests.filter(r=>r.method==='POST'&&r.url.pathname==='/search').length,0);
        assert.ok(privatePage.requests.filter(r=>r.url.searchParams.get('format')==='runtime').every(r=>r.method==='GET'&&!r.raw));
        assert.deepEqual(privatePage.errors,[]);await privatePage.context.close();
    });
}
function holdAuxiliaryRuntimeReads() {
    const fetch=window.fetch.bind(window);window.auxiliaryRuntimeReads=[];
    window.fetch=(url,options)=>new URL(url,location.href).searchParams.get('format')==='runtime'?new Promise(resolve=>auxiliaryRuntimeReads.push(data=>resolve(new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json'}})))):fetch(url,options);
}
for(const engine of engines) {
    test(`${engine}: D6 runtime auxiliary contribution masking tracks pending/rule changes and offers a read-only Retry inside the dialog`,async()=>{
        const snapshot=runtimeSnapshot(true),server=contributionServer();
        const {page,context,requests,errors}=await setup(engine,'watch','light',{fixture:'d6-contribution-regular-light',url:'/watch?v=2isYuQZMbdU',init:holdAuxiliaryRuntimeReads,reply:entry=>server.reply(entry)||clipFixtureReply(entry)});
        await readyClipMedia(page,13);snapshot.state.profile=await page.evaluate(()=>InvidiousStorage.scope);const channel=await page.evaluate(()=>video_data.channel_id);
        await openContributions(page);const original=await page.locator('#dearrow-original-title').textContent(),hidden=await page.evaluate(()=>JSON.parse(document.getElementById('dearrow-contribution-config').textContent).hidden_title);
        await page.locator('#dearrow-draft').fill('A retained private draft');await attachEnhancementRuntime(page);
        snapshot.state.masking.rules[channel]={hide_title:true,hide_thumbnail:true,reveal_after_days:null};snapshot.fingerprint='b'.repeat(64);
        await page.evaluate(()=>InvidiousEnhancements.refresh('preferences'));await page.waitForFunction(()=>auxiliaryRuntimeReads.length===1);
        assert.equal(await page.locator('#dearrow-original-title').textContent(),hidden);assert.equal(await page.locator('#dearrow-mask-toggle').isDisabled(),true);
        assert.ok((await page.locator('[data-dearrow-proposal]').allTextContents()).every(value=>value===hidden));
        await page.evaluate(data=>auxiliaryRuntimeReads[0](data),snapshot);await page.waitForFunction(()=>InvidiousEnhancements.readState()==='ready');
        await page.locator('#dearrow-mask-toggle').click();assert.equal(await page.locator('#dearrow-original-title').textContent(),original);assert.equal(await page.locator('.watch-heading h1').textContent(),'Title hidden');
        snapshot.now++;await page.evaluate(()=>InvidiousEnhancements.refresh());await page.waitForFunction(()=>auxiliaryRuntimeReads.length===2);
        assert.equal(await page.locator('#dearrow-original-title').textContent(),hidden);assert.equal(await page.locator('#dearrow-mask-toggle').getAttribute('aria-pressed'),'false');
        await page.evaluate(data=>auxiliaryRuntimeReads[1](data),snapshot);await page.waitForFunction(()=>InvidiousEnhancements.readState()==='ready');
        assert.equal(await page.locator('#dearrow-original-title').textContent(),original,'an unchanged canonical read retains only the dialog-scoped reveal');
        await page.evaluate(()=>InvidiousEnhancements.refresh());await page.waitForFunction(()=>auxiliaryRuntimeReads.length===3);await page.evaluate(()=>auxiliaryRuntimeReads[2]({error:'Unavailable'}));
        await page.locator('#dearrow-mask-retry').waitFor({state:'visible'});assert.equal(await page.locator('#dearrow-original-title').textContent(),hidden);
        assert.equal(await page.locator('#dearrow-mask-toggle').isDisabled(),true);assert.equal(await page.locator('#dearrow-draft').inputValue(),'A retained private draft');
        await page.locator('#dearrow-mask-actions').scrollIntoViewIfNeeded();assert.ok(await page.locator('#dearrow-mask-actions').evaluate(element=>element.scrollWidth<=element.clientWidth+1));
        await page.screenshot({path:path.join(artifacts,`${engine}-d6-runtime-masking-dialog-error-light.png`)});
        await page.evaluate(()=>{setTheme('dark');document.documentElement.dir='rtl';});await page.addStyleTag({content:'#dearrow-dialog :is(button,input,span){font-size:20px!important}'});
        assert.ok(await page.locator('.dearrow-content').evaluate(element=>element.scrollWidth<=element.clientWidth+1));assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
        await page.screenshot({path:path.join(artifacts,`${engine}-d6-runtime-masking-dialog-error-dark-rtl.png`)});
        snapshot.state.masking.rules={};snapshot.fingerprint='c'.repeat(64);await page.locator('#dearrow-mask-retry').click();await page.waitForFunction(()=>auxiliaryRuntimeReads.length===4);
        await page.evaluate(data=>auxiliaryRuntimeReads[3](data),snapshot);await page.waitForFunction(()=>InvidiousEnhancements.readState()==='ready');
        assert.equal(await page.locator('#dearrow-original-title').textContent(),original);assert.equal(await page.locator('#dearrow-mask-retry').isVisible(),false);
        assert.equal(await page.locator('#dearrow-draft').inputValue(),'A retained private draft');assert.equal(server.writes.length,0);
        assert.equal(requests.filter(r=>r.url.pathname==='/dearrow_submit').length,0);assert.equal(await page.evaluate(()=>player.tech().el()===clipSourceMedia&&player.paused()&&Math.abs(player.currentTime()-13)<.1),true);
        assert.deepEqual(errors,[]);await context.close();
    });
    test(`${engine}: D6 runtime auxiliary browser notifications hide titles during checks and follow accepted rules without reordering subscriptions`,async()=>{
        const snapshot=runtimeSnapshot(true),id='UC'+'a'.repeat(22);
        const {page,context,requests,errors}=await setup(engine,'browse','light',{fixture:'d4-subscriptions-light',url:'/feed/subscriptions',init:holdAuxiliaryRuntimeReads,reply:entry=>{
            if(entry.url.pathname==='/js/sse.js')return{contentType:'application/javascript',body:"window.fakeStreams=[];window.SSE=function(){this.listeners={};this.addEventListener=(name,fn)=>this.listeners[name]=fn;this.stream=()=>{};this.close=()=>{};fakeStreams.push(this);};"};
            if(entry.url.pathname==='/api/v1/auth/subscriptions')return{contentType:'application/json',body:JSON.stringify([{authorId:id}])};
        }});
        // This init is installed explicitly before notifications are delivered;
        // no browser permission prompt or operating-system notification is used.
        await page.evaluate(()=>{window.browserNotifications=[];window.Notification=function(title,options){browserNotifications.push({title,options});};Notification.permission='granted';});
        await page.waitForFunction(()=>window.fakeStreams&&fakeStreams.length===1);snapshot.state.profile=await page.evaluate(()=>InvidiousStorage.scope);
        const order=await page.locator('.media-item').evaluateAll(rows=>rows.map(row=>row.dataset.videoId));
        await attachEnhancementRuntime(page);snapshot.state.masking.rules[id]={hide_title:true,hide_thumbnail:true,reveal_after_days:null};
        await page.evaluate(()=>InvidiousEnhancements.refresh());await page.waitForFunction(()=>auxiliaryRuntimeReads.length===1);
        const notify=async(index,title)=>page.evaluate(({index,title,id})=>fakeStreams[0].onmessage({id:String(index),data:JSON.stringify({videoId:'notify'+String(index).padStart(5,'0'),authorId:id,author:'Studio North',title,published:Math.ceil(Date.now()/1000)+1})}),{index,title,id});
        await notify(1,'A title during an unknown check');assert.equal(await page.evaluate(()=>browserNotifications[0].options.body),'Title hidden');
        await page.evaluate(data=>auxiliaryRuntimeReads[0](data),snapshot);await page.waitForFunction(()=>InvidiousEnhancements.readState()==='ready');
        await notify(2,'A title hidden by the accepted rule');assert.equal(await page.evaluate(()=>browserNotifications[1].options.body),'Title hidden');
        snapshot.state.masking.rules={};snapshot.fingerprint='d'.repeat(64);await page.evaluate(()=>InvidiousEnhancements.refresh());await page.waitForFunction(()=>auxiliaryRuntimeReads.length===2);
        await notify(3,'Still unknown');assert.equal(await page.evaluate(()=>browserNotifications[2].options.body),'Title hidden');
        await page.evaluate(data=>auxiliaryRuntimeReads[1](data),snapshot);await page.waitForFunction(()=>InvidiousEnhancements.readState()==='ready');
        await notify(4,'A permitted upload title');assert.equal(await page.evaluate(()=>browserNotifications[3].options.body),'A permitted upload title');
        assert.deepEqual(await page.locator('.media-item').evaluateAll(rows=>rows.map(row=>row.dataset.videoId)),order);
        assert.equal(requests.filter(r=>/^\/api\/v1\/(videos|dearrow)\//.test(r.url.pathname)).length,0);assert.deepEqual(errors,[]);await context.close();
    });
    test(`${engine}: D6 runtime owner foreground checks refresh without a change channel or media replacement`,async()=>{
        const snapshot=runtimeSnapshot(true);
        const {page,context,requests,errors}=await setup(engine,'watch','light',{fixture:'d6-clip-chat-light',url:'/watch?v=2isYuQZMbdU',init:()=>{
            Object.defineProperty(window,'BroadcastChannel',{value:class{constructor(){throw new DOMException('Denied','SecurityError');}}});
        },reply:entry=>entry.url.searchParams.get('format')==='runtime'?{contentType:'application/json',body:JSON.stringify(snapshot)}:clipFixtureReply(entry)});
        await readyClipMedia(page,13);snapshot.state.profile=await page.evaluate(()=>InvidiousStorage.scope);const original=await page.locator('.watch-heading h1').textContent(),id=await page.evaluate(()=>video_data.channel_id);
        await attachEnhancementRuntime(page);await page.evaluate(()=>dispatchEvent(new Event('focus')));assert.equal(requests.filter(r=>r.url.searchParams.get('format')==='runtime').length,0);
        snapshot.state.masking.rules[id]={hide_title:true,hide_thumbnail:true,reveal_after_days:null};snapshot.fingerprint='b'.repeat(64);
        await page.evaluate(()=>{dispatchEvent(new Event('blur'));dispatchEvent(new Event('focus'));});await page.waitForFunction(()=>InvidiousEnhancements.readState()==='ready');
        assert.equal(await page.locator('.watch-heading h1').textContent(),'Title hidden');assert.equal(requests.filter(r=>r.url.searchParams.get('format')==='runtime').length,1);
        snapshot.state.masking.rules={};snapshot.fingerprint='c'.repeat(64);
        await page.evaluate(()=>{window.runtimeVisibility='hidden';Object.defineProperty(document,'visibilityState',{configurable:true,get(){return runtimeVisibility;}});document.dispatchEvent(new Event('visibilitychange'));runtimeVisibility='visible';document.dispatchEvent(new Event('visibilitychange'));});
        await page.waitForFunction(original=>InvidiousEnhancements.readState()==='ready'&&document.querySelector('.watch-heading h1').textContent===original,original);
        assert.equal(requests.filter(r=>r.url.searchParams.get('format')==='runtime').length,2);
        assert.equal(await page.evaluate(()=>player.tech().el()===clipSourceMedia&&player.paused()&&Math.abs(player.currentTime()-13)<.1),true);assert.deepEqual(errors,[]);await context.close();
    });
}
for(const engine of engines) {
    test(`${engine}: D6 runtime owner reads coalesce hints, validate projections and retain the current media`,async()=>{
        const snapshot=runtimeSnapshot(true);snapshot.state.sponsorblock.enabled=true;snapshot.state.sponsorblock.modes.sponsor='manual';
        snapshot.state.future_native={private_id:'must not reach consumers'};snapshot.state.sponsorblock.private_id='must not reach consumers';
        const {page,context,requests,errors}=await setup(engine,'watch','light',{fixture:'d6-clip-chat-light',url:'/watch?v=2isYuQZMbdU',reply:entry=>{
            if(entry.url.searchParams.get('format')==='runtime')return{contentType:'application/json',body:JSON.stringify(snapshot)};
            if(entry.url.pathname.startsWith('/api/v1/sponsorblock/'))return{contentType:'application/json',body:'{"segments":[{"id":"manual","category":"sponsor","start":10,"end":18}]}'};
            return clipFixtureReply(entry);
        }});
        await readyClipMedia(page,13);snapshot.state.profile=await page.evaluate(()=>InvidiousStorage.scope);
        await attachEnhancementRuntime(page);assert.equal(requests.filter(r=>r.url.searchParams.get('format')==='runtime').length,0);
        await page.evaluate(()=>{InvidiousUI.invalidate('dearrow');InvidiousUI.invalidate('blocks');InvidiousUI.invalidate('preferences');});
        await page.waitForFunction(()=>InvidiousEnhancements.readState()==='ready'&&InvidiousSponsorBlock.readState()==='ready');
        assert.equal(requests.filter(r=>r.url.searchParams.get('format')==='runtime').length,1);
        assert.deepEqual(await page.evaluate(()=>runtimeApplications[0].detail.kinds),['dearrow','blocks','preferences']);
        assert.equal(await page.evaluate(()=>runtimeApplications[0].frozen&&!('future_native'in runtimeApplications[0].value)&&!('private_id'in runtimeApplications[0].value.sponsorblock)),true);
        assert.equal(await page.evaluate(()=>InvidiousEnhancements.register('verification',{apply(){throw Error('duplicate');}})),false);
        await page.addScriptTag({content:fs.readFileSync(path.join(root,'assets/js/enhancements.js'),'utf8')});
        snapshot.now++;await page.evaluate(()=>InvidiousEnhancements.refresh());await page.waitForFunction(()=>runtimeApplications.length===2);
        assert.equal(await page.evaluate(()=>runtimeApplications.at(-1).detail.unchanged),true,'clock advancement does not reset configuration identity');
        assert.equal(requests.filter(r=>r.url.pathname.startsWith('/api/v1/sponsorblock/')).length,1);
        assert.equal(await page.evaluate(()=>player.tech().el()===clipSourceMedia&&player.paused()&&Math.abs(player.currentTime()-13)<.1),true);
        assert.equal(await page.locator('.sb-range').count(),1);assert.deepEqual(errors,[]);await context.close();
    });
    test(`${engine}: D6 runtime owner reads reject malformed, foreign and guest-account state without an automatic retry`,async()=>{
        for(const failure of ['http','profile','version','clock','fingerprint','account','guestRules','mode','color','mask','ai']) {
            let valid=false,reads=0;const snapshot=runtimeSnapshot();
            const {page,context,errors}=await setup(engine,'watch','light',{fixture:'d5-single-light',url:'/watch?v=2isYuQZMbdU',reply:entry=>{
                if(entry.url.searchParams.get('format')!=='runtime')return null;
                reads++;if(!valid&&failure==='http')return{status:503,contentType:'application/json',body:'{"error":"Unavailable"}'};
                const value=structuredClone(snapshot);
                if(!valid){
                    if(failure==='profile')value.state.profile='a'.repeat(64);
                    if(failure==='version')value.state.version=2;
                    if(failure==='clock')value.now='1700000000';
                    if(failure==='fingerprint')value.fingerprint='invalid';
                    if(failure==='account')value.state.account=true;
                    if(failure==='guestRules')value.state.masking.rules['UC'+'a'.repeat(22)]={hide_title:true,hide_thumbnail:true,reveal_after_days:null};
                    if(failure==='mode')value.state.sponsorblock.modes.sponsor='future';
                    if(failure==='color')value.state.sponsorblock.colors.sponsor='url(https://external.invalid/)';
                    if(failure==='mask')value.state.masking.labels.title_hidden=42;
                    if(failure==='ai')value.state.ai.ai_blocklist_other_pages_action='hide';
                }
                return{contentType:'application/json',body:JSON.stringify(value)};
            }});
            await attachEnhancementRuntime(page);await page.evaluate(()=>InvidiousEnhancements.refresh('preferences'));
            await page.waitForFunction(()=>InvidiousEnhancements.readState()==='unavailable');
            assert.equal(await page.evaluate(()=>runtimeApplications.length),0);assert.ok(await page.evaluate(()=>runtimeSuspensions>=2));assert.equal(reads,1);
            await page.evaluate(()=>new Promise(resolve=>setTimeout(resolve,40)));assert.equal(reads,1);
            valid=true;await page.locator('#ui-notice').getByRole('button',{name:'Retry',exact:true}).click();await page.waitForFunction(()=>InvidiousEnhancements.readState()==='ready');
            assert.equal(reads,2);assert.equal(await page.evaluate(()=>runtimeApplications.length),1);assert.deepEqual(errors,[]);await context.close();
        }
    });
    test(`${engine}: D6 runtime owner reads reject stale cached/profile replies and preserve superseded invalidation kinds`,async()=>{
        const snapshot=runtimeSnapshot();
        const {page,context,errors}=await setup(engine,'watch','light',{fixture:'d5-single-light',url:'/watch?v=2isYuQZMbdU',init:()=>{
            const fetch=window.fetch.bind(window);window.heldRuntimeReads=[];
            window.fetch=(url,options={})=>new URL(url,location.href).searchParams.get('format')==='runtime'?new Promise(resolve=>heldRuntimeReads.push(data=>resolve(new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json'}})))):fetch(url,options);
        }});
        await attachEnhancementRuntime(page);await page.evaluate(()=>InvidiousUI.invalidate('dearrow'));await page.waitForFunction(()=>heldRuntimeReads.length===1);
        await page.evaluate(()=>InvidiousUI.invalidate('blocks'));await page.waitForFunction(()=>heldRuntimeReads.length===2);
        await page.evaluate(data=>heldRuntimeReads[0](data),snapshot);await page.evaluate(()=>new Promise(resolve=>setTimeout(resolve,20)));assert.equal(await page.evaluate(()=>runtimeApplications.length),0);
        await page.evaluate(data=>heldRuntimeReads[1](data),snapshot);await page.waitForFunction(()=>runtimeApplications.length===1);
        assert.deepEqual(await page.evaluate(()=>runtimeApplications[0].detail.kinds),['blocks','dearrow']);
        await page.evaluate(()=>{dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}));dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));});await page.waitForFunction(()=>heldRuntimeReads.length===3);
        await page.evaluate(()=>dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true})));await page.evaluate(data=>heldRuntimeReads[2](data),snapshot);
        await page.evaluate(()=>new Promise(resolve=>setTimeout(resolve,20)));assert.equal(await page.evaluate(()=>runtimeApplications.length),1);
        await page.evaluate(()=>dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));await page.waitForFunction(()=>heldRuntimeReads.length===4);
        await page.evaluate(()=>dispatchEvent(new Event('browserprofilechange')));await page.evaluate(data=>heldRuntimeReads[3](data),snapshot);await page.evaluate(()=>new Promise(resolve=>setTimeout(resolve,20)));
        assert.equal(await page.evaluate(()=>InvidiousEnhancements.readState()),'disposed');assert.equal(await page.evaluate(()=>runtimeApplications.length),1);assert.equal(await page.evaluate(()=>runtimeDisposals),1);
        await page.evaluate(()=>{dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));InvidiousEnhancements.refresh();InvidiousUI.invalidate();});
        assert.equal(await page.evaluate(()=>heldRuntimeReads.length),4);assert.deepEqual(errors,[]);await context.close();
    });
    test(`${engine}: D6 runtime owner reads apply account and browser-local SponsorBlock inheritance without importing guest rules`,async()=>{
        for(const account of [false,true]) {
            const snapshot=runtimeSnapshot(account),id='UC'+'a'.repeat(22);snapshot.state.sponsorblock.enabled=false;
            snapshot.state.sponsorblock.overrides=account?{[id]:{enabled:true,modes:{sponsor:'manual'}}}:{};
            const {page,context,requests,errors}=await setup(engine,'watch','light',{fixture:account?'d6-clip-chat-light':'d5-single-light',url:'/watch?v=2isYuQZMbdU',reply:entry=>{
                if(entry.url.searchParams.get('format')==='runtime')return{contentType:'application/json',body:JSON.stringify(snapshot)};
                if(entry.url.pathname.startsWith('/api/v1/sponsorblock/'))return{contentType:'application/json',body:'{"segments":[{"id":"a","category":"sponsor","start":10,"end":18}]}'};
                return clipFixtureReply(entry);
            }});
            await readyClipMedia(page,13);snapshot.state.profile=await page.evaluate(()=>InvidiousStorage.scope);
            await page.evaluate(({account,id})=>{video_data.channel_id=id;InvidiousStorage.local.set('sponsorblock_channel_overrides',{[id]:{enabled:!account,modes:{sponsor:account?'disabled':'manual'}}});},{account,id});
            await attachEnhancementRuntime(page);await page.evaluate(()=>dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));
            await page.waitForFunction(()=>InvidiousEnhancements.readState()==='ready'&&InvidiousSponsorBlock.readState()==='ready');assert.equal(await page.locator('.sb-range').count(),1);
            assert.equal(await page.evaluate(()=>player.tech().el()===clipSourceMedia&&player.paused()&&Math.abs(player.currentTime()-13)<.1),true);
            assert.equal(requests.filter(r=>r.url.searchParams.get('format')==='runtime').length,1);assert.equal(requests.filter(r=>r.url.pathname.startsWith('/api/v1/sponsorblock/')).length,1);
            assert.deepEqual(errors,[]);await context.close();
        }
    });
    test(`${engine}: D6 runtime owner reads recover from timeouts and failed consumers with a read-only Retry`,async()=>{
        for(const failure of ['timeout','consumer']) {
            const snapshot=runtimeSnapshot();let reads=0;
            const {page,context,requests,errors}=await setup(engine,'watch','light',{fixture:'d5-single-light',url:'/watch?v=2isYuQZMbdU',reply:entry=>{
                if(entry.url.searchParams.get('format')==='runtime'){reads++;return{contentType:'application/json',body:JSON.stringify(snapshot)};}
            }});
            await attachEnhancementRuntime(page);
            await page.evaluate(failure=>{
                window.failRuntimeConsumer=failure==='consumer';
                InvidiousEnhancements.register('failure-owner',{apply(){if(failRuntimeConsumer)throw Error('optional owner failed');}});
                if(failure==='timeout') {
                    const schedule=setTimeout;window.setTimeout=(fn,ms,...args)=>schedule(fn,ms===15000?40:ms,...args);
                    const fetch=window.fetch.bind(window);let first=true;
                    window.fetch=(url,options={})=>{if(new URL(url,location.href).searchParams.get('format')==='runtime'&&first){first=false;return new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError'))));}return fetch(url,options);};
                }
                InvidiousEnhancements.refresh('dearrow');
            },failure);
            await page.waitForFunction(()=>InvidiousEnhancements.readState()==='unavailable');
            assert.equal(reads,failure==='timeout'?0:1);
            await page.evaluate(()=>failRuntimeConsumer=false);
            await page.locator('#ui-notice').getByRole('button',{name:'Retry',exact:true}).click();await page.waitForFunction(()=>InvidiousEnhancements.readState()==='ready');
            assert.equal(await page.locator('#ui-notice').isVisible(),false);assert.deepEqual(await page.evaluate(()=>runtimeApplications.at(-1).detail.kinds),['dearrow']);
            assert.ok(requests.filter(r=>r.url.searchParams.get('format')==='runtime').every(r=>r.method==='GET'&&!r.raw));
            assert.deepEqual(errors,[]);await context.close();
        }
    });
    test(`${engine}: D6 runtime owner reads deliver missed hints and late owners once without dismissing another notice`,async()=>{
        let failed=true;const snapshot=runtimeSnapshot();
        const {page,context,requests,errors}=await setup(engine,'watch','light',{fixture:'d5-single-light',url:'/watch?v=2isYuQZMbdU',reply:entry=>{
            if(entry.url.searchParams.get('format')==='runtime')return failed?{status:503,body:''}:{contentType:'application/json',body:JSON.stringify(snapshot)};
        }});
        await page.evaluate(()=>InvidiousUI.invalidate('blocks'));await attachEnhancementRuntime(page);await page.waitForFunction(()=>InvidiousEnhancements.readState()==='unavailable');
        await page.evaluate(()=>InvidiousUI.notice('Another operation completed'));
        failed=false;await page.evaluate(()=>InvidiousEnhancements.refresh());await page.waitForFunction(()=>InvidiousEnhancements.readState()==='ready');
        assert.equal(await page.locator('#ui-notice').isVisible(),true);assert.equal(await page.locator('#ui-notice [role=status]').textContent(),'Another operation completed');
        assert.equal(await page.evaluate(()=>{window.lateApplications=[];return InvidiousEnhancements.register('late-owner',{apply(value,detail){lateApplications.push({profile:value.profile,detail});}});}),true);
        assert.equal(await page.evaluate(()=>lateApplications.length),1);assert.deepEqual(await page.evaluate(()=>lateApplications[0].detail.kinds),['blocks']);
        assert.equal(requests.filter(r=>r.url.searchParams.get('format')==='runtime').length,2);
        await page.evaluate(()=>dispatchEvent(new PageTransitionEvent('pagehide',{persisted:false})));
        assert.equal(await page.evaluate(()=>InvidiousEnhancements.register('disposed-owner',{apply(){}})),false);
        assert.equal(await page.locator('#ui-notice').isVisible(),true);assert.deepEqual(errors,[]);await context.close();
    });
}
for(const engine of engines) {
    test(`${engine}: D6 runtime SponsorBlock changes reuse segments, skip history and the existing media`,async()=>{
        const {page,context,requests,errors}=await setup(engine,'watch','light',{fixture:'d6-clip-chat-light',url:'/watch?v=2isYuQZMbdU',reply:entry=>{
            if(entry.url.pathname.startsWith('/api/v1/sponsorblock/'))return{contentType:'application/json',body:JSON.stringify({segments:[{id:'manual',category:'sponsor',start:10,end:18},{id:'auto',category:'intro',start:20,end:30},{id:'marker',category:'outro',start:35,end:40}]})};
            return clipFixtureReply(entry);
        }});
        await readyClipMedia(page,13);
        await page.evaluate(()=>{player.playbackRate(1.25);player.volume(.4);window.segmentEvents=[];player.on('sponsorblocksegments',event=>segmentEvents.push(event.segments.map(s=>s.id)));});
        assert.equal(await page.evaluate(()=>InvidiousSponsorBlock.readState()),'disabled');
        assert.equal(await page.locator('.sb-overlay').count(),0);
        assert.equal(requests.filter(r=>r.url.pathname.startsWith('/api/v1/sponsorblock/')).length,0);
        assert.equal(await configureRuntimeSponsorBlock(page,{modes:{sponsor:'manual',intro:'auto',outro:'marker'}}),true);
        await page.waitForFunction(()=>InvidiousSponsorBlock.readState()==='ready'&&document.querySelectorAll('.sb-range').length===3);
        await page.locator('.sb-skip').waitFor({state:'visible'});
        assert.equal(await page.evaluate(()=>player.tech().el()===clipSourceMedia&&player.paused()&&Math.abs(player.currentTime()-13)<.1&&player.playbackRate()===1.25&&player.volume()===.4),true);
        await page.locator('.sb-close').click();
        await configureRuntimeSponsorBlock(page,{modes:{sponsor:'manual',intro:'auto'},colors:{sponsor:'#123456'}});
        assert.equal(await page.locator('.sb-overlay.sb-visible').count(),0,'a canonical refresh retains a dismissal');
        assert.equal(await page.locator('.sb-range').first().evaluate(el=>el.style.backgroundColor),'rgb(18, 52, 86)');
        await page.evaluate(()=>player.currentTime(21));await page.waitForFunction(()=>!player.seeking()&&Math.abs(player.currentTime()-30)<.1);
        await configureRuntimeSponsorBlock(page,{enabled:false,modes:{sponsor:'manual',intro:'auto'}});
        assert.equal(await page.locator('.sb-range,.sb-overlay.sb-visible').count(),0);
        assert.deepEqual(await page.evaluate(()=>segmentEvents.at(-1)),[],'chapters receive an empty segment list when disabled');
        await configureRuntimeSponsorBlock(page,{modes:{sponsor:'manual',intro:'auto'}});
        await page.evaluate(()=>player.currentTime(21));await page.waitForFunction(()=>!player.seeking()&&document.querySelector('.sb-skip').offsetParent);
        await page.evaluate(()=>{for(let i=0;i<10;i++)player.trigger('timeupdate');});
        assert.ok(await page.evaluate(()=>Math.abs(player.currentTime()-21)<.1),'configuration changes cannot repeat a completed automatic skip');
        await page.locator('.sb-skip').click();await page.waitForFunction(()=>player.currentTime()>=29.9);
        await page.addScriptTag({content:fs.readFileSync(path.join(root,'assets/js/sponsorblock.js'),'utf8')});
        assert.equal(await page.locator('.sb-overlay:not(.sb-notice)').count(),1);
        assert.equal(requests.filter(r=>r.url.pathname.startsWith('/api/v1/sponsorblock/')).length,1);
        assert.equal(await page.locator('.sb-close svg use').getAttribute('href'),await page.evaluate(()=>player_data.icon_sprite+'#x'));
        assert.equal(await page.evaluate(()=>player.tech().el()===clipSourceMedia&&player.paused()&&player.playbackRate()===1.25&&player.volume()===.4),true);
        assert.deepEqual(errors,[]);await context.close();
    });
    test(`${engine}: D6 runtime SponsorBlock failed reads require an explicit Settings retry`,async()=>{
        for(const failure of ['http','malformed','timeout']) {
            let reads=0;
            const {page,context,requests,errors}=await setup(engine,'watch','dark',{fixture:'d6-clip-chat-dark',url:'/watch?v=2isYuQZMbdU',init:failure==='timeout'?()=>{
                const schedule=window.setTimeout;window.setTimeout=(fn,ms,...args)=>schedule(fn,ms===10000?40:ms,...args);
                const fetch=window.fetch.bind(window);let first=true;
                window.fetch=(url,options={})=>{if(new URL(url,location.href).pathname.startsWith('/api/v1/sponsorblock/')&&first){first=false;return new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError'))));}return fetch(url,options);};
            }:null,reply:entry=>{
                if(entry.url.pathname.startsWith('/api/v1/sponsorblock/')){reads++;return reads===1&&failure!=='timeout'?(failure==='http'?{status:503,body:''}:{contentType:'application/json',body:'{"segments":{}}'}):{contentType:'application/json',body:'{"segments":[]}'};}
                return clipFixtureReply(entry);
            }});
            await readyClipMedia(page,13);await configureRuntimeSponsorBlock(page,{modes:{sponsor:'manual'}});
            await page.waitForFunction(()=>InvidiousSponsorBlock.readState()==='unavailable');
            await page.evaluate(()=>{InvidiousSponsorBlock.configure(runtimeSponsorConfig);InvidiousSponsorBlock.suspend();InvidiousSponsorBlock.configure(runtimeSponsorConfig);});
            assert.equal(await page.evaluate(()=>InvidiousSponsorBlock.readState()),'unavailable');
            assert.equal(reads,failure==='timeout'?0:1,'refreshing settings never retries a failed optional read');
            await page.locator('.vjs-desktop-settings').click();const panel=page.getByRole('dialog',{name:'Settings',exact:true});
            await panel.getByRole('menuitem',{name:'Enhancements',exact:true}).click();
            assert.match(await panel.locator('.player-settings-status').textContent(),/SponsorBlock/);
            await panel.getByRole('menuitem',{name:'SponsorBlock · Retry',exact:true}).click();
            await page.waitForFunction(()=>InvidiousSponsorBlock.readState()==='ready');
            await panel.getByRole('menuitem',{name:'SponsorBlock · Retry',exact:true}).waitFor({state:'hidden'});
            assert.equal(reads,failure==='timeout'?1:2);assert.equal(await page.locator('.sb-range').count(),0);
            assert.ok(requests.filter(r=>r.url.pathname.startsWith('/api/v1/sponsorblock/')).every(r=>r.method==='GET'));
            assert.equal(requests.filter(r=>r.method==='POST'&&['/preferences','/dearrow_submit','/dearrow_vote'].includes(r.url.pathname)).length,0);
            assert.equal(await page.evaluate(()=>player.tech().el()===clipSourceMedia&&player.paused()&&Math.abs(player.currentTime()-13)<.1),true);
            assert.deepEqual(errors,[]);await context.close();
        }
    });
    test(`${engine}: D6 runtime SponsorBlock ignores pending reads after cache, disable, profile and player removal`,async()=>{
        for(const lifetime of ['cache','disable','profile','remove']) {
            const {page,context,errors}=await setup(engine,'watch','light',{fixture:'d6-clip-chat-light',url:'/watch?v=2isYuQZMbdU',init:()=>{
                const fetch=window.fetch.bind(window);window.pendingSegments=[];
                window.fetch=(url,options)=>new URL(url,location.href).pathname.startsWith('/api/v1/sponsorblock/')?new Promise(resolve=>pendingSegments.push(()=>resolve(new Response('{"segments":[{"id":"late","category":"sponsor","start":10,"end":18}]}',{headers:{'Content-Type':'application/json'}})))):fetch(url,options);
            },reply:clipFixtureReply});
            await readyClipMedia(page,13);await configureRuntimeSponsorBlock(page,{modes:{sponsor:'auto'}});
            await page.waitForFunction(()=>pendingSegments.length===1);
            await page.evaluate(lifetime=>{
                window.staleSponsorAPI=InvidiousSponsorBlock;
                if(lifetime==='cache'){InvidiousSponsorBlock.setManaged();dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}));dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));}
                else if(lifetime==='disable')InvidiousSponsorBlock.configure({...runtimeSponsorConfig,enabled:false});
                else if(lifetime==='profile')dispatchEvent(new Event('browserprofilechange'));
                else player.el().remove();
            },lifetime);
            await page.evaluate(()=>pendingSegments[0]());await page.evaluate(()=>new Promise(resolve=>setTimeout(resolve,20)));
            assert.equal(await page.locator('.sb-range,.sb-overlay.sb-visible').count(),0);
            assert.equal(await page.evaluate(()=>pendingSegments.length),1);
            if(lifetime==='cache'||lifetime==='disable') {
                assert.equal(await page.evaluate(()=>player.tech().el()===clipSourceMedia&&Math.abs(player.currentTime()-13)<.1),true);
                if(lifetime==='cache')await page.waitForFunction(()=>InvidiousEnhancements.readState()==='ready');
                assert.equal(await page.evaluate(()=>InvidiousSponsorBlock.readState()),'disabled','the current canonical owner disables the temporary controller-only setting on Back');
                await configureRuntimeSponsorBlock(page,{modes:{sponsor:'manual'}});await page.waitForFunction(()=>pendingSegments.length===2);
                await page.evaluate(()=>pendingSegments[1]());await page.waitForFunction(()=>InvidiousSponsorBlock.readState()==='ready');
                assert.equal(await page.locator('.sb-range').count(),1);
            } else assert.equal(await page.evaluate(()=>!window.InvidiousSponsorBlock&&!staleSponsorAPI.configure(runtimeSponsorConfig)),true);
            assert.deepEqual(errors,[]);await context.close();
        }
    });
    test(`${engine}: D6 runtime SponsorBlock validates optional data and keeps marker-only playback unchanged`,async()=>{
        const {page,context,requests,errors}=await setup(engine,'watch','light',{fixture:'d6-clip-chat-light',url:'/watch?v=2isYuQZMbdU',reply:entry=>{
            if(entry.url.pathname.startsWith('/api/v1/sponsorblock/'))return{contentType:'application/json',body:JSON.stringify({segments:[null,{id:'a',category:'sponsor',start:0,end:18,untrusted:'<img>'},{id:'a',category:'sponsor',start:3,end:19},{id:'future',category:'unknown',start:1,end:2},{id:'bad',category:'intro',start:-1,end:3},{id:'text',category:'intro',start:'1',end:3}]})};
            return clipFixtureReply(entry);
        }});
        await readyClipMedia(page,13);
        await page.evaluate(()=>{window.publishedSegments=[];player.on('sponsorblocksegments',event=>publishedSegments.push(event.segments));});
        await configureRuntimeSponsorBlock(page,{modes:{sponsor:'marker'}});await page.waitForFunction(()=>InvidiousSponsorBlock.readState()==='ready');
        assert.equal(await page.locator('.sb-range').count(),1);assert.equal(await page.locator('.sb-overlay.sb-visible').count(),0);
        assert.deepEqual(await page.evaluate(()=>publishedSegments.at(-1)),[{id:'a',category:'sponsor',start:0,end:18}]);
        assert.equal(await page.evaluate(()=>InvidiousSponsorBlock.configure({...runtimeSponsorConfig,modes:{sponsor:'invalid'}})),false);
        assert.equal(await page.evaluate(()=>InvidiousSponsorBlock.readState()),'suspended');assert.equal(await page.locator('.sb-range').count(),0);
        await configureRuntimeSponsorBlock(page,{modes:{sponsor:'marker'}});
        assert.equal(await page.evaluate(()=>InvidiousSponsorBlock.readState()),'ready');assert.equal(await page.locator('.sb-range').count(),1);
        assert.equal(requests.filter(r=>r.url.pathname.startsWith('/api/v1/sponsorblock/')).length,1);
        assert.equal(await page.evaluate(()=>player.tech().el()===clipSourceMedia&&player.paused()&&Math.abs(player.currentTime()-13)<.1),true);
        assert.deepEqual(errors,[]);await context.close();
    });
}
async function readyClipMedia(page,time=40,playing=false) {
    await page.evaluate(async({time,playing})=>{player.muted(true);await player.play();player.pause();player.currentTime(time);window.clipSourceMedia=player.tech().el();if(playing)await player.play();},{time,playing});
    await page.waitForFunction(time=>!player.seeking()&&Math.abs(player.currentTime()-time)<1,time);
}
for(const engine of engines) {
    test(`${engine}: D6 clip side editor previews on the same media and restores its tab, draft and local progress`,async()=>{
        const {page,context,errors,requests}=await setup(engine,'watch','light',{fixture:'d6-clip-chat-light',url:'/watch?v=2isYuQZMbdU',reply:clipFixtureReply});
        await readyClipMedia(page);const before=await page.evaluate(()=>JSON.stringify(InvidiousStorage.local.get('save_player_pos')));const initialWrites=requests.filter(r=>r.method!=='GET').length;
        await page.locator('#create-clip').click();const panel=page.locator('#tool-clip-editor');await panel.waitFor({state:'visible'});assert.equal(await page.locator('#clip-dialog').count(),0);assert.equal(await page.locator('iframe').count(),0);assert.equal(await page.locator('#clip-start').inputValue(),'00:25');assert.equal(await page.locator('#clip-end').inputValue(),'00:55');
        assert.equal(await page.locator('[role=tablist]').isVisible(),false);assert.equal(await page.locator('#tool-chat').isVisible(),false);
        await page.locator('#clip-title').fill('A clip <literal> 🎵');await page.locator('#clip-start').fill('00:10');await page.locator('#clip-end').fill('00:15');await page.locator('#clip-end').blur();await page.locator('#clip-preview').click();await page.waitForFunction(()=>player.currentTime()>=10&&player.currentTime()<15&&!player.paused());
        assert.equal(await page.evaluate(()=>player.tech().el()===clipSourceMedia),true);await page.evaluate(()=>player.currentTime(100));await page.waitForFunction(()=>player.paused()&&player.currentTime()>14.9&&player.currentTime()<15);
        assert.equal(await page.evaluate(()=>JSON.stringify(InvidiousStorage.local.get('save_player_pos'))),before,'preview positions never enter local full-video progress');
        await page.locator('#clip-close').click();await page.waitForFunction(()=>player.paused()&&!player.seeking()&&Math.abs(player.currentTime()-40)<.05);await assertFocus(page,'#create-clip');assert.equal(await page.locator('#tool-chat').isVisible(),true);
        await page.locator('#create-clip').click();await panel.waitFor({state:'visible'});assert.equal(await page.locator('#clip-title').inputValue(),'A clip <literal> 🎵');assert.equal(await page.locator('#clip-start').inputValue(),'00:10');await page.locator('#clip-title').focus();await page.keyboard.press('Escape');await panel.waitFor({state:'hidden'});assert.equal(await page.locator('video,audio').count(),1);
        assert.equal(requests.filter(r=>r.url.pathname==='/js/clip-editor.js').length,1);assert.equal(requests.filter(r=>r.url.pathname==='/js/clip-session.js').length,1);assert.equal(requests.filter(r=>r.method!=='GET').length,initialWrites,'the editor makes no mutation before Publish');assert.deepEqual(errors,[]);await context.close();
    });
    test(`${engine}: D6 clip editor creates an empty utility slot and excludes account progress and queue advancement`,async()=>{
        for(const kind of ['empty','sync','queue']) {
            const {page,context,requests,errors}=await setup(engine,'watch','dark',{fixture:`d6-clip-${kind}-dark`,url:'/watch?v=2isYuQZMbdU'+(kind==='queue'?'&list=PLfixture&index=2':''),reply:entry=>entry.url.pathname==='/watch_ajax'?{contentType:'application/json',body:'{}'}:clipFixtureReply(entry)});
            await readyClipMedia(page,40,true);if(kind==='queue')await page.locator('#playlist .queue-row').first().waitFor();
            if(kind==='empty')assert.equal(await page.locator('#watch-layout').evaluate(el=>el.classList.contains('watch-no-tools')),true);
            await page.locator('#create-clip').click();await page.locator('#tool-clip-editor').waitFor({state:'visible'});assert.equal(await page.locator('#watch-layout').evaluate(el=>el.classList.contains('watch-no-tools')),false);
            await page.locator('#clip-start').fill('01:45');await page.locator('#clip-end').fill('01:55');await page.locator('#clip-end').blur();const writes=requests.filter(r=>r.url.pathname==='/watch_ajax').length,navigations=requests.filter(r=>r.navigation).length;
            await page.locator('#clip-preview').click();await page.waitForFunction(()=>player.currentTime()>=105&&player.currentTime()<115);await page.evaluate(()=>{player.trigger('timeupdate');player.trigger('seeked');player.trigger('ended');});
            assert.equal(requests.filter(r=>r.url.pathname==='/watch_ajax').length,writes);assert.equal(requests.filter(r=>r.navigation).length,navigations);assert.equal(await page.evaluate(()=>player.tech().el()===clipSourceMedia),true);
            await page.locator('#clip-close').click();await page.waitForFunction(()=>!player.paused()&&player.currentTime()>=40&&player.currentTime()<42);await page.evaluate(()=>player.pause());
            if(kind==='empty'){assert.equal(await page.locator('#watch-layout').evaluate(el=>el.classList.contains('watch-no-tools')),true);assert.equal(await page.locator('.utility-panel').isVisible(),false);}
            assert.equal(await page.locator('video,audio').count(),1);assert.deepEqual(errors,[]);await context.close();
        }
    });
    test(`${engine}: D6 clip publishing keeps rejected drafts and blocks an ambiguous duplicate creation`,async()=>{
        let posts=0;const mutations=[];
        const {page,context,errors}=await setup(engine,'watch','light',{fixture:'d6-clip-chat-light',url:'/watch?v=2isYuQZMbdU',reply:entry=>{
            if(entry.url.pathname==='/api/v1/auth/csrf')return{contentType:'application/json',body:'{"csrfToken":"clip-csrf"}'};
            if(entry.url.pathname==='/api/v1/auth/clips'&&entry.method==='POST'){posts++;mutations.push({body:JSON.parse(entry.raw),token:entry.headers['x-csrf-token']});return{status:posts===1?400:503,contentType:'application/json',body:posts===1?' {"error":"Clip source is temporarily ineligible"}':'{}'};}
            return clipFixtureReply(entry);
        }});
        await readyClipMedia(page);await page.locator('#create-clip').click();await page.locator('#tool-clip-editor').waitFor({state:'visible'});await page.locator('#clip-title').fill('Literal <title>');await page.locator('#clip-start').fill('00:10');await page.locator('#clip-end').fill('00:15');await page.locator('#clip-publish').click();await page.locator('#clip-submit-status').getByText('Clip source is temporarily ineligible').waitFor();assert.equal(await page.locator('#clip-publish').isEnabled(),true);assert.equal(await page.locator('#clip-title').inputValue(),'Literal <title>');
        await page.locator('#clip-publish').click();await page.locator('#clip-unconfirmed').waitFor({state:'visible'});assert.equal(await page.locator('#clip-publish').isDisabled(),true);assert.equal(posts,2);assert.equal(await page.locator('#clip-title').inputValue(),'Literal <title>');assert.equal(await page.locator('#clip-unconfirmed a').getAttribute('target'),'_blank');
        await page.locator('#clip-close').click();await page.locator('#create-clip').click();await page.locator('#tool-clip-editor').waitFor({state:'visible'});await page.locator('#clip-title').press('Enter');assert.equal(posts,2);assert.equal(await page.locator('#clip-publish').isDisabled(),true);assert.equal(mutations[0].token,'clip-csrf');assert.deepEqual(mutations[0].body,{videoId:'2isYuQZMbdU',title:'Literal <title>',startTime:10,endTime:15});assert.deepEqual(errors,[]);await context.close();
    });
}
for(const engine of engines) {
    test(`${engine}: D6 clip preview escapes and restores native saved bounds across a real source refresh`,async()=>{
        const {page,context,errors}=await setup(engine,'watch','dark',{fixture:'d6-clip-native-dark',url:'/clip/IVCL'+ 'a'.repeat(32),reply:clipFixtureReply});
        await readyClipMedia(page,12.5);assert.equal(await page.evaluate(()=>player.invidiousClipBounds.isActive()),true);
        await page.locator('#create-clip').click();await page.locator('#tool-clip-editor').waitFor({state:'visible'});await page.locator('#clip-start').fill('00:30');await page.locator('#clip-end').fill('00:35');await page.locator('#clip-end').blur();await page.locator('#clip-preview').click();await page.waitForFunction(()=>player.currentTime()>=30&&player.currentTime()<35&&!player.paused());
        await page.locator('.vjs-desktop-settings').click();const settings=page.getByRole('dialog',{name:'Settings',exact:true});await settings.getByRole('menuitem',{name:'Advanced',exact:true}).click();await settings.getByRole('menuitem',{name:'Refresh video buffer',exact:true}).click();await page.waitForFunction(()=>player.readyState()>=2&&player.currentTime()>=30&&player.currentTime()<35);
        assert.equal(await page.evaluate(()=>player.tech().el()===clipSourceMedia),true);await page.locator('#clip-close').click();await page.waitForFunction(()=>player.paused()&&!player.seeking()&&Math.abs(player.currentTime()-12.5)<.05);
        await page.evaluate(()=>player.currentTime(0));await page.waitForFunction(()=>Math.abs(player.currentTime()-10.25)<.05);assert.equal(await page.evaluate(()=>player.loop()),true);assert.equal(await page.locator('video,audio').count(),1);assert.equal(await page.locator('iframe').count(),0);assert.deepEqual(errors,[]);await context.close();
    });
    test(`${engine}: D6 a published clip received after close is shown once before a new draft`,async()=>{
        let deliver,arrived;const pending=new Promise(resolve=>arrived=resolve);let posts=0;const id='IVCL'+'b'.repeat(32);
        const {page,context,errors}=await setup(engine,'watch','light',{fixture:'d6-clip-chat-light',url:'/watch?v=2isYuQZMbdU',reply:entry=>{
            if(entry.url.pathname==='/api/v1/auth/csrf')return{contentType:'application/json',body:'{"csrfToken":"clip-csrf"}'};
            if(entry.url.pathname==='/api/v1/auth/clips'&&entry.method==='POST'){posts++;return new Promise(resolve=>{deliver=()=>resolve({status:201,contentType:'application/json',body:JSON.stringify({clipId:id,clipTitle:'Published <literal>'})});arrived();});}
            return clipFixtureReply(entry);
        }});
        await readyClipMedia(page);await page.locator('#create-clip').click();await page.locator('#tool-clip-editor').waitFor({state:'visible'});await page.locator('#clip-title').fill('Published <literal>');await page.locator('#clip-publish').click();await pending;await page.locator('#clip-close').click();deliver();await page.waitForFunction(()=>!document.getElementById('clip-result').hidden);
        await page.locator('#create-clip').click();await page.locator('#clip-result').waitFor({state:'visible'});assert.equal(await page.locator('#clip-result-title').textContent(),'Published <literal>');assert.equal(await page.locator('#clip-result img, #clip-result literal').count(),0);assert.equal(await page.locator('#clip-share-url').inputValue(),'https://invidious.test/clip/'+id);assert.equal(posts,1);
        await page.locator('#clip-done').click();await page.locator('#create-clip').click();await page.locator('#clip-editor').waitFor({state:'visible'});assert.equal(await page.locator('#clip-title').inputValue(),'');assert.equal(posts,1);assert.deepEqual(errors,[]);await context.close();
    });
}
for(const engine of engines) {
    test(`${engine}: D6 clip creation rejects stale cached-page and profile completions without another POST`,async()=>{
        for(const lifetime of ['cached','profile']) {
            const {page,context,errors}=await setup(engine,'watch','light',{fixture:'d6-clip-chat-light',url:'/watch?v=2isYuQZMbdU',init:()=>{
                const original=window.fetch.bind(window);window.clipWrites=[];window.fetch=(url,options={})=>new URL(url,location.href).pathname==='/api/v1/auth/clips'&&options.method==='POST'?new Promise(resolve=>clipWrites.push(()=>resolve(new Response(JSON.stringify({clipId:'IVCL'+'c'.repeat(32),clipTitle:'Late result'}),{status:201,headers:{'Content-Type':'application/json'}})))):original(url,options);
            },reply:entry=>entry.url.pathname==='/api/v1/auth/csrf'?{contentType:'application/json',body:'{"csrfToken":"clip-csrf"}'}:clipFixtureReply(entry)});
            await readyClipMedia(page);await page.locator('#create-clip').click();await page.locator('#tool-clip-editor').waitFor({state:'visible'});await page.locator('#clip-title').fill('Kept literal <draft>');await page.locator('#clip-publish').click();await page.waitForFunction(()=>clipWrites.length===1);
            if(lifetime==='cached') {
                await page.evaluate(()=>{window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}));window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));clipWrites[0]();});
                await page.locator('#create-clip').click();await page.locator('#tool-clip-editor').waitFor({state:'visible'});await page.locator('#clip-unconfirmed').waitFor({state:'visible'});assert.equal(await page.locator('#clip-title').inputValue(),'Kept literal <draft>');assert.equal(await page.locator('#clip-publish').isDisabled(),true);
            } else {
                await page.evaluate(()=>{window.dispatchEvent(new Event('browserprofilechange'));clipWrites[0]();});assert.equal(await page.locator('#clip-title').isDisabled(),true);
            }
            assert.equal(await page.locator('#clip-result').evaluate(el=>el.hidden),true);assert.equal(await page.evaluate(()=>clipWrites.length),1);assert.equal(await page.evaluate(()=>player.tech().el()===clipSourceMedia),true);assert.deepEqual(errors,[]);await context.close();
        }
    });
    test(`${engine}: D6 clip editor light, dark, enlarged RTL and forced-color states fit the desktop panel`,async()=>{
        for(const view of [{name:'light',mode:'light',width:1280,height:720},{name:'dark',mode:'dark',width:1920,height:1080},{name:'rtl',mode:'dark',width:1440,height:900},{name:'forced',mode:'light',width:1280,height:720}]) {
            const {page,context,errors}=await setup(engine,'watch',view.mode,{fixture:`d6-clip-chat-${view.mode}`,url:'/watch?v=2isYuQZMbdU',width:view.width,height:view.height,reply:clipFixtureReply});await readyClipMedia(page);if(view.name==='rtl')await page.locator('html').evaluate(el=>el.dir='rtl');if(view.name==='forced')await page.emulateMedia({forcedColors:'active'});
            await page.locator('#create-clip').click();await page.locator('#tool-clip-editor').waitFor({state:'visible'});if(view.name==='rtl')await page.addStyleTag({content:'.clip-editor label,.clip-editor input[type=text],.clip-editor .button{font-size:20px!important}'});
            await page.locator('#clip-title').fill('A literal clip — مقطع');await page.locator('#clip-end').fill('00:60');await page.locator('#clip-end').blur();assert.equal(await page.locator('#clip-end').inputValue(),'00:60');assert.equal(await page.locator('#clip-end').getAttribute('aria-invalid'),'true');assert.equal(await page.locator('#clip-publish').isDisabled(),true);
            await page.locator('#clip-start').focus();await page.keyboard.press('Tab');await assertFocus(page,'#clip-end');assert.ok(await page.locator('#clip-end').evaluate(el=>getComputedStyle(el).outlineStyle!=='none'));
            await page.locator('#clip-publish').scrollIntoViewIfNeeded();assert.ok(await page.locator('#clip-close').evaluate(el=>{const b=el.getBoundingClientRect();return b.top>=0&&b.bottom<=innerHeight;}));assert.ok(await page.locator('.clip-panel-body').evaluate(el=>el.scrollWidth<=el.clientWidth+1));assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
            await page.screenshot({path:path.join(artifacts,`${engine}-d6-clip-editor-${view.name}.png`)});assert.equal(await page.locator('iframe').count(),0);assert.equal(await page.locator('video,audio').count(),1);assert.deepEqual(errors,[]);await context.close();
        }
    });
}
for(const engine of engines) {
    test(`${engine}: D6 clip fallback retains literal failed drafts with and without JavaScript`,async()=>{
        for(const javascript of [true,false]) {
            const {page,context,errors,requests}=await setup(engine,'browse','light',{fixture:'d6-clip-draft-light',url:'/create_clip?videoId=2isYuQZMbdU',javascript});
            assert.equal(await page.locator('#clip-title').inputValue(),'  Kept <draft> 🎵  ');assert.equal(await page.locator('#clip-start').inputValue(),'001');assert.equal(await page.locator('#clip-end').inputValue(),'00:60');assert.equal(await page.locator('draft').count(),0);assert.equal(await page.locator('#clip-editor').getAttribute('method'),'post');
            if(javascript){assert.equal(await page.locator('#clip-start-range').evaluate(el=>getComputedStyle(el).borderTopWidth),'0px');assert.equal(await page.locator('#clip-start-range').evaluate(el=>getComputedStyle(el).backgroundColor),'rgba(0, 0, 0, 0)');assert.equal(await page.locator('#clip-publish').isDisabled(),true);await page.locator('#clip-start').fill('00:10');await page.locator('#clip-end').fill('00:15');await page.locator('#clip-end').blur();assert.equal(await page.locator('#clip-publish').isEnabled(),true);}
            assert.equal(requests.filter(r=>r.url.pathname==='/create_clip'&&r.method==='POST').length,0);assert.deepEqual(errors,[]);await context.close();
        }
    });
    test(`${engine}: D6 clip boundary keyboard, playhead capture, Unicode title and looping preview retain the original state`,async()=>{
        const {page,context,errors}=await setup(engine,'watch','light',{fixture:'d6-clip-chat-light',url:'/watch?v=2isYuQZMbdU',reply:clipFixtureReply});await readyClipMedia(page,50);
        await page.locator('#create-clip').click();await page.locator('#tool-clip-editor').waitFor({state:'visible'});await page.locator('#clip-title').fill('😀'.repeat(140));assert.equal(await page.locator('#clip-title-count').textContent(),'140 / 140');assert.equal(await page.locator('#clip-publish').isEnabled(),true);
        await page.locator('#clip-title').fill('x'.repeat(141));assert.equal(await page.locator('#clip-publish').isDisabled(),true);assert.equal(await page.locator('#clip-title').getAttribute('aria-invalid'),'true');await page.locator('#clip-title').fill('Range preview');
        await page.locator('#clip-start-range').focus();await page.keyboard.press('ArrowRight');assert.equal(await page.locator('#clip-start').inputValue(),'00:36');assert.equal(await page.locator('#clip-end').inputValue(),'01:05');
        await page.evaluate(()=>player.currentTime(70));await page.waitForFunction(()=>!player.seeking());await page.locator('#clip-boundary').selectOption('end');await page.locator('#clip-use-time').click();assert.equal(await page.locator('#clip-end').inputValue(),'01:10');
        await page.locator('#clip-preview-loop').check();await page.locator('#clip-preview').click();await page.waitForFunction(()=>!player.paused()&&player.currentTime()>=36&&player.currentTime()<40);assert.equal(await page.evaluate(()=>player.loop()),true);
        await page.evaluate(()=>{player.pause();player.tech().el().currentTime=71;});await page.waitForFunction(()=>!player.seeking()&&Math.abs(player.currentTime()-36)<.1);await page.locator('#clip-preview').click();await page.waitForFunction(()=>!player.seeking()&&Math.abs(player.currentTime()-70)<.1);assert.equal(await page.evaluate(()=>player.loop()),false);
        await page.locator('#clip-close').click();await page.waitForFunction(()=>player.paused()&&!player.seeking()&&Math.abs(player.currentTime()-50)<.1);assert.equal(await page.evaluate(()=>player.tech().el()===clipSourceMedia),true);assert.deepEqual(errors,[]);await context.close();
    });
    test(`${engine}: D6 clip editing suspends SponsorBlock skips and optional docking on the same media`,async()=>{
        const snapshot=runtimeSnapshot(true);snapshot.state.sponsorblock.enabled=true;snapshot.state.sponsorblock.modes.sponsor='auto';snapshot.state.sponsorblock.modes.intro='manual';
        const {page,context,errors}=await setup(engine,'watch','light',{fixture:'d6-clip-chat-light',url:'/watch?v=2isYuQZMbdU',reply:entry=>{
            if(entry.url.searchParams.get('format')==='runtime')return{contentType:'application/json',body:JSON.stringify(snapshot)};
            if(entry.navigation){const body=fs.readFileSync(path.join(generated,'d6-clip-chat-light.html'),'utf8').replace(/(<script id="player_data"[^>]*>)([\s\S]*?)(<\/script>)/,(_,start,raw,end)=>{const data=JSON.parse(raw);data.sponsorblock={...data.sponsorblock,enabled:true,modes:{...data.sponsorblock.modes,sponsor:'auto',intro:'manual'}};return start+JSON.stringify(data).replace(/</g,'\\u003c')+end;});return{contentType:'text/html',body};}
            if(entry.url.pathname.startsWith('/api/v1/sponsorblock/'))return{contentType:'application/json',body:JSON.stringify({segments:[{id:'auto',category:'sponsor',start:20,end:30},{id:'manual',category:'intro',start:12,end:18}]})};
            return clipFixtureReply(entry);
        }});
        await readyClipMedia(page,13);await page.locator('.sb-overlay.sb-visible').first().waitFor();assert.equal(await page.locator('.sb-range').count(),2);
        await page.evaluate(()=>{InvidiousStorage.local.set('player_dock_enabled',true);player.trigger('dockpreferencechange');});
        await page.locator('#create-clip').click();await page.locator('#tool-clip-editor').waitFor({state:'visible'});assert.equal(await page.locator('.sb-overlay.sb-visible').count(),0);
        await page.locator('#clip-title').fill('Preview without skips');await page.locator('#clip-start').fill('00:10');await page.locator('#clip-end').fill('00:35');await page.locator('#clip-preview').click();await page.waitForFunction(()=>!player.paused()&&!player.seeking()&&player.currentTime()>=10&&player.currentTime()<12);
        await page.evaluate(()=>{player.pause();player.currentTime(21);});await page.waitForFunction(()=>!player.seeking()&&Math.abs(player.currentTime()-21)<.1);await page.evaluate(()=>{player.trigger('timeupdate');document.querySelector('.sb-skip').click();});
        snapshot.state.masking.rules[await page.evaluate(()=>video_data.channel_id)]={hide_title:true,hide_thumbnail:true,reveal_after_days:null};
        assert.equal(await page.evaluate(()=>!!window.InvidiousEnhancements),true,'the template activates the owner coordinator');
        await page.evaluate(()=>InvidiousUI.invalidate('preferences'));await page.waitForFunction(()=>InvidiousEnhancements.readState()==='ready');
        assert.equal(await page.locator('#clip-title').inputValue(),'Preview without skips');assert.equal(await page.locator('.watch-heading h1').textContent(),'Title hidden');
        assert.ok(await page.evaluate(()=>Math.abs(player.currentTime()-21)<.1));assert.equal(await page.locator('.sb-overlay.sb-visible').count(),0);assert.equal(await page.evaluate(()=>player.tech().el()===clipSourceMedia),true);
        await page.evaluate(()=>{const space=document.createElement('div');space.style.height='2000px';document.body.append(space);scrollTo(0,2000);});await page.waitForFunction(()=>document.querySelector('.watch-player').getBoundingClientRect().bottom<=96);await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));assert.equal(await page.locator('.watch-player.is-docked').count(),0);
        await page.locator('#clip-close').click();await page.waitForFunction(()=>!player.seeking()&&Math.abs(player.currentTime()-13)<.1);await page.evaluate(()=>player.currentTime(21));await page.waitForFunction(()=>player.currentTime()>=29.9);assert.equal(await page.locator('.sb-notice.sb-visible').count(),1);assert.deepEqual(errors,[]);await context.close();
    });
    test(`${engine}: D6 clip missing metadata and uncertain standalone POSTs retain drafts without duplicate publication`,async()=>{
        for(const javascript of [true,false])for(const kind of ['missing','unconfirmed']) {
            const {page,context,requests,errors}=await setup(engine,'browse','dark',{fixture:`d6-clip-${kind}-dark`,url:'/create_clip?videoId=2isYuQZMbdU',javascript});
            assert.equal(await page.locator('#clip-title').inputValue(),'  Kept <draft> 🎵  ');assert.equal(await page.locator('#clip-start').inputValue(),'001');assert.equal(await page.locator('#clip-end').inputValue(),'00:60');
            if(kind==='unconfirmed') {
                assert.equal(await page.locator('#clip-publish').isDisabled(),true);assert.equal(await page.locator('#clip-unconfirmed').isVisible(),true);assert.equal(await page.locator('#clip-unconfirmed a').getAttribute('href'),'/feed/clips');
                await page.locator('#clip-start').fill('00:10');await page.locator('#clip-end').fill('00:15');await page.locator('#clip-end').blur();assert.equal(await page.locator('#clip-publish').isDisabled(),true);
                if(javascript)assert.equal(await page.evaluate(()=>{const event=new Event('submit',{cancelable:true});document.querySelector('#clip-editor').dispatchEvent(event);return event.defaultPrevented;}),true);
            } else {
                assert.equal(await page.locator('#clip-editor').getAttribute('data-duration'),'');assert.equal(await page.locator('#clip-start-range').count(),0);
                if(javascript){assert.equal(await page.locator('#clip-preview').isDisabled(),true);await page.locator('#clip-start').fill('00:10');await page.locator('#clip-end').fill('00:15');await page.locator('#clip-end').blur();assert.equal(await page.locator('#clip-publish').isEnabled(),true);}
            }
            assert.equal(await page.locator('iframe[src]').count(),0);assert.equal(requests.filter(r=>r.url.pathname==='/create_clip'&&r.method==='POST').length,0);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
            if(javascript)await page.screenshot({path:path.join(artifacts,`${engine}-d6-clip-${kind}.png`)});assert.deepEqual(errors,[]);await context.close();
        }
    });
    test(`${engine}: D6 saved clips, deletion and unavailable sources use shared pages and owner controls`,async()=>{
        const library=await setup(engine,'browse','light',{fixture:'clips-library',url:'/feed/clips'});const card=library.page.locator('[data-kind=clip]');assert.equal(await card.count(),1);assert.equal(await library.page.locator('body').getAttribute('data-overhaul'),'');await card.locator('.ui-menu>summary').click();assert.equal(await card.locator('a[href^="/delete_clip"]').isVisible(),true);assert.equal(await card.locator('script').count(),0);await library.page.screenshot({path:path.join(artifacts,`${engine}-d6-clip-library-dark.png`)});assert.deepEqual(library.errors,[]);await library.context.close();
        const empty=await setup(engine,'browse','light',{fixture:'clips-empty',url:'/feed/clips'});assert.equal(await empty.page.locator('.empty-state').isVisible(),true);assert.equal(await empty.page.locator('[data-kind=clip]').count(),0);assert.equal(await empty.page.locator('#main-content p').filter({hasText:await empty.page.locator('.empty-state').textContent()}).count(),1);await empty.context.close();
        const deletion=await setup(engine,'browse','light',{fixture:'d6-clip-delete-light',url:'/delete_clip?id=IVCL'+'a'.repeat(32),javascript:false});assert.equal(await deletion.page.locator('form[action="/delete_clip"]').getAttribute('method'),'post');assert.equal(await deletion.page.locator('form[action="/delete_clip"] input[name=csrf_token]').inputValue(),'fixture-token');assert.equal(await deletion.page.locator('input[name=id]').inputValue(),'IVCL'+'a'.repeat(32));assert.equal(await deletion.page.locator('video,iframe').count(),0);await deletion.page.screenshot({path:path.join(artifacts,`${engine}-d6-clip-delete-light.png`)});await deletion.context.close();
        for(const owner of [true,false]) {
            const {page,context,errors}=await setup(engine,'browse','dark',{fixture:owner?'d6-clip-unavailable-dark':'d6-clip-unavailable-guest-dark',url:'/clip/IVCL'+'a'.repeat(32)});await page.getByRole('heading',{name:'Clip unavailable',exact:true}).waitFor();assert.equal(await page.locator('a[href^="/delete_clip"]').count(),owner?1:0);assert.equal(await page.locator('video,iframe').count(),0);assert.equal(await page.getByRole('link',{name:'Try again',exact:true}).getAttribute('href'),'/clip/IVCL'+'a'.repeat(32));if(owner)await page.screenshot({path:path.join(artifacts,`${engine}-d6-clip-unavailable-dark.png`)});assert.deepEqual(errors,[]);await context.close();
        }
        for(const [kind,mode]of[['delete','dark'],['unavailable','light']]){const {page,context,errors}=await setup(engine,'browse',mode,{fixture:`d6-clip-${kind}-${mode}`,url:kind==='delete'?'/delete_clip?id=IVCL'+'a'.repeat(32):'/clip/IVCL'+'a'.repeat(32),width:1280,height:720});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:path.join(artifacts,`${engine}-d6-clip-${kind}-${mode}.png`)});assert.deepEqual(errors,[]);await context.close();}
    });
    test(`${engine}: D6 clip asset failure keeps the timestamp-aware standalone fallback and guest login return`,async()=>{
        const failed=await setup(engine,'watch','light',{fixture:'d6-clip-chat-light',url:'/watch?v=2isYuQZMbdU',reply:entry=>entry.url.pathname==='/js/clip-session.js'?{status:503,body:''}:entry.navigation&&entry.url.pathname==='/create_clip'?{contentType:'text/html',body:fs.readFileSync(path.join(generated,'create-clip.html'))}:clipFixtureReply(entry)});await readyClipMedia(failed.page);await failed.page.locator('#create-clip').click();await failed.page.waitForURL('**/create_clip?**');assert.equal(new URL(failed.page.url()).searchParams.get('startTime'),'40');assert.equal(await failed.page.locator('#clip-editor').getAttribute('method'),'post');assert.deepEqual(failed.errors,[]);await failed.context.close();
        const guest=await setup(engine,'watch','light',{fixture:'d5-single-light',url:'/watch?v=2isYuQZMbdU',reply:entry=>entry.navigation&&entry.url.pathname==='/login'?{contentType:'text/html',body:'<h1>Sign in</h1>'}:clipFixtureReply(entry)});await readyClipMedia(guest.page);await guest.page.locator('#create-clip').click();await guest.page.waitForURL('**/login?**');const back=new URL(new URL(guest.page.url()).searchParams.get('referer'),'https://invidious.test');assert.equal(back.searchParams.get('create_clip'),'1');assert.equal(back.searchParams.get('t'),'40');assert.deepEqual(guest.errors,[]);await guest.context.close();
        const returned=await setup(engine,'watch','light',{fixture:'d6-clip-chat-light',url:'/watch?v=2isYuQZMbdU&create_clip=1&t=40',reply:clipFixtureReply});await returned.page.locator('#tool-clip-editor').waitFor({state:'visible'});assert.equal(await returned.page.locator('#clip-start').inputValue(),'00:25');assert.equal(await returned.page.locator('#clip-end').inputValue(),'00:55');assert.equal(new URL(returned.page.url()).searchParams.has('create_clip'),false);assert.deepEqual(returned.errors,[]);await returned.context.close();
    });
}

for(const engine of engines) {
    test(`${engine}: D6 AI actions have one matrix owner, retain paused drafts and preserve ordinary form fields`,async()=>{
        for(const view of [{name:'light',javascript:true},{name:'rtl',javascript:true},{name:'nojs',javascript:false}]) {
            const {page,context,requests,errors}=await setup(engine,'settings','light',{fixture:'settings-ai-filter',url:'/preferences?section=ai-filter',javascript:view.javascript,width:1280,height:900});
            const form=page.locator('[data-category-form]'),matrix=page.locator('.settings-matrix');assert.equal(await matrix.locator('th[scope=row]').count(),4);assert.equal(await matrix.locator('select').count(),8);assert.equal(await matrix.locator('thead th').first().textContent(),'Pages');assert.equal(await form.locator('[type=submit]').count(),1);
            const original=await matrix.locator('select').evaluateAll(nodes=>Object.fromEntries(nodes.map(n=>[n.name,n.value])));
            for(const surface of ['feeds','search','recommendations','other_pages'])for(const kind of ['blocklist','warnlist']) {
                const name=`ai_${kind}_${surface}_action`,control=form.locator(`[name=${name}]`);assert.equal(await control.count(),1);assert.equal(await control.getAttribute('id'),`setting-${name}`);assert.equal(await form.locator(`label[for="setting-${name}"]`).count(),1);
                if(surface==='other_pages')assert.equal(await control.locator('option[value=hide]').count(),0);
            }
            const enabled=await page.locator('#setting-ai_filter_enabled').isChecked();await page.locator('#setting-ai_filter_enabled').uncheck();assert.equal(await page.locator('.ai-filter-paused').isVisible(),true);assert.deepEqual(await matrix.locator('select').evaluateAll(nodes=>Object.fromEntries(nodes.map(n=>[n.name,n.value]))),original);assert.equal(await matrix.locator('select:disabled').count(),0);
            if(view.javascript){await page.locator('[name=ai_blocklist_feeds_action]').selectOption(original.ai_blocklist_feeds_action==='hide'?'off':'hide');assert.equal(await form.locator('[type=submit]').isEnabled(),true);await form.locator('[type=reset]').click();assert.equal(await page.locator('#setting-ai_filter_enabled').isChecked(),enabled);assert.deepEqual(await matrix.locator('select').evaluateAll(nodes=>Object.fromEntries(nodes.map(n=>[n.name,n.value]))),original);assert.equal(await form.locator('[type=submit]').isDisabled(),true);}
            await page.locator('.ai-filter-details>summary').click();assert.equal(await page.locator('.ai-filter-details h3').count(),2);assert.equal(await page.locator('.ai-filter-details a[href="https://aisloplist.com/"]').isVisible(),true);
            if(view.name==='rtl'){await page.evaluate(()=>{setTheme('dark');document.documentElement.dir='rtl';});await page.addStyleTag({content:'.settings-matrix{font-size:20px!important}'});}
            assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.equal(requests.filter(r=>r.url.pathname==='/api/v1/ai/channels').length,0);assert.equal(await form.getAttribute('method'),'post');assert.deepEqual(errors,[]);
            if(view.javascript){await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:path.join(artifacts,`${engine}-d6-ai-matrix-${view.name}.png`),fullPage:true});}await context.close();
        }
    });
}

function sbEditorConfig(fixture='sponsorblock-channels') {
    return JSON.parse(fs.readFileSync(path.join(generated,fixture+'.html'),'utf8').match(/<script id="sponsorblock-editor-config" type="application\/json">([\s\S]*?)<\/script>/)[1]);
}
function sbEditorServer(options={}) {
    const config=sbEditorConfig(),state=structuredClone(config.overrides),writes=[];let attempts=0;
    function apply(entry){const id=entry.body.get('channel');if(entry.body.get('action')==='reset')delete state[id];else{const modes={};for(const [name,value]of entry.body)if(name.startsWith('mode_')&&value!=='inherit')modes[name.slice(5)]=value;const enabled=entry.body.get('enabled')==='inherit'?null:entry.body.get('enabled')==='true';if(enabled===null&&!Object.keys(modes).length)delete state[id];else state[id]={name:state[id]?.name||'<Channel>',enabled,modes};}}
    const body=()=>JSON.stringify({profile:config.profile,csrf:'sb-route-token',overrides:state});
    return{state,writes,config,body,apply,reply(entry){if(entry.url.pathname!=='/preferences/sponsorblock/channels'||entry.url.searchParams.get('format')!=='json')return null;
        if(entry.method==='POST'){attempts++;writes.push(Object.fromEntries(entry.body));const failure=options.failure?.(attempts,entry);if(failure){if(failure.commit)apply(entry);return{status:failure.status,contentType:'application/json',body:JSON.stringify({error:failure.error||'Channel save rejected'})};}apply(entry);}
        return{contentType:'application/json',body:body()};
    }};
}
for(const engine of engines) {
    test(`${engine}: D6 SponsorBlock channel editor owns inherited drafts, canonical saves and searchable management`,async()=>{
        const server=sbEditorServer(),{page,context,errors}=await setup(engine,'settings','light',{fixture:'sponsorblock-channels',url:'/preferences/sponsorblock/channels?channel=UC'+'a'.repeat(22),reply:server.reply});
        const form=page.locator('.sponsorblock-channel-form'),save=form.locator('[value=save]');await page.waitForFunction(()=>document.querySelector('#sponsorblock-channels').dataset.editorReady==='true');assert.equal(await page.locator('.settings-nav a[aria-current=page]').getAttribute('href'),'/preferences/sponsorblock/channels');assert.equal(await page.locator('.sidebar-settings').getAttribute('aria-current'),'page');assert.equal(await page.locator('body').getAttribute('data-page'),'settings');assert.equal(await form.locator('select').count(),9);assert.equal(await form.locator('option[value=inherit]').count(),9);assert.equal(await save.isDisabled(),true);
        const original=await form.locator('select').evaluateAll(nodes=>nodes.map(n=>[n.name,n.value]));await page.locator('#mode_intro').selectOption('auto');assert.equal(await save.isEnabled(),true);await form.locator('[type=reset]').click();assert.deepEqual(await form.locator('select').evaluateAll(nodes=>nodes.map(n=>[n.name,n.value])),original);assert.equal(await save.isDisabled(),true);
        await page.locator('#mode_intro').selectOption('marker');await save.click();await page.waitForFunction(()=>document.querySelector('#sponsorblock-channels').getAttribute('aria-busy')==='false'&&document.querySelector('#sponsorblock-save-status').textContent==='Saved');assert.equal(server.writes.length,1);assert.equal(server.writes[0].csrf_token,'sb-route-token');assert.equal(server.writes[0].browser_profile,server.config.profile);assert.equal(server.writes[0].mode_intro,'marker');assert.equal(await save.isDisabled(),true);assert.equal(await page.evaluate(()=>InvidiousStorage.local.get('sponsorblock_channel_overrides')),undefined);
        await page.locator('#sponsorblock-search').fill('not found');assert.equal(await page.locator('#sponsorblock-saved-channels .channel-rule-row').count(),0);await page.locator('#sponsorblock-search').fill('channel');assert.equal(await page.locator('#sponsorblock-saved-channels .channel-rule-row').count(),1);assert.equal(await page.locator('#sponsorblock-saved-channels channel').count(),0);
        await page.locator('#settings-search').fill('Channel SponsorBlock');const destination=page.locator('#settings-search-results a[href^="/preferences/sponsorblock/channels"]');assert.equal(await destination.count(),1);assert.equal(await destination.getAttribute('href'),'/preferences/sponsorblock/channels?field=channel');await page.locator('#settings-search').fill('');await page.evaluate(()=>{document.activeElement.blur();scrollTo(0,0);});await page.screenshot({path:path.join(artifacts,`${engine}-d6-sb-channel-light.png`),fullPage:true});await page.evaluate(()=>{setTheme('dark');scrollTo(0,0);});await page.screenshot({path:path.join(artifacts,`${engine}-d6-sb-channel-dark.png`),fullPage:true});assert.deepEqual(errors,[]);await context.close();
    });
    test(`${engine}: D6 SponsorBlock rejected and uncertain writes keep drafts and require a saved-state check`,async()=>{
        for(const commit of [true,false]){
            const server=sbEditorServer({failure:n=>n===1?{status:400,error:'Kept literal channel draft'}:n===2?{status:503,commit}:null});let failCheck=true;const {page,context,errors}=await setup(engine,'settings','light',{fixture:'sponsorblock-channels',url:'/preferences/sponsorblock/channels',reply(entry){if(failCheck&&server.writes.length===2&&entry.method==='GET'&&entry.url.searchParams.get('format')==='json'){failCheck=false;return{status:503,contentType:'application/json',body:'{}'};}return server.reply(entry);}});const form=page.locator('.sponsorblock-channel-form'),save=form.locator('[value=save]');
            await page.locator('#mode_intro').selectOption('marker');await save.click();await page.getByText('Kept literal channel draft',{exact:true}).waitFor();assert.equal(await page.locator('#mode_intro').inputValue(),'marker');assert.equal(await save.isEnabled(),true);assert.equal(server.writes.length,1);
            await save.click();await page.waitForFunction(()=>document.querySelector('#sponsorblock-channels').getAttribute('aria-busy')==='false'&&document.querySelector('#sponsorblock-save-status').textContent.includes('could not be confirmed'));assert.equal(await save.isDisabled(),true);assert.equal(await form.locator('[value=reset]').isDisabled(),true);assert.equal(server.writes.length,2);assert.equal(await page.locator('#mode_intro').inputValue(),'marker');
            await page.locator('[data-sb-readback]').click();await page.waitForFunction(message=>document.querySelector('#sponsorblock-save-status').textContent===message,server.config.words.load);assert.equal(await save.isDisabled(),true);assert.equal(await page.locator('#mode_intro').inputValue(),'marker');assert.equal(server.writes.length,2);await page.locator('[data-sb-readback]').click();await page.waitForFunction(()=>document.querySelector('#sponsorblock-channels').getAttribute('aria-busy')==='false'&&!document.querySelector('#sponsorblock-save-status').textContent.includes('could not be confirmed'));assert.equal(server.writes.length,2);assert.equal(await save.isDisabled(),commit);assert.equal(await page.locator('#mode_intro').inputValue(),'marker');assert.deepEqual(errors,[]);await context.close();
        }
    });
    test(`${engine}: D6 SponsorBlock cached pages and profile changes reject late completed writes`,async()=>{
        for(const lifecycle of ['cache','profile','removal']){
            const server=sbEditorServer(),{page,context,errors}=await setup(engine,'settings','light',{fixture:'sponsorblock-channels',url:'/preferences/sponsorblock/channels',reply:server.reply,init:()=>{const fetch=window.fetch.bind(window);window.sbPending=[];window.fetch=(url,options={})=>{if(new URL(url,location.href).pathname==='/preferences/sponsorblock/channels'&&options.method==='POST'){const config=JSON.parse(document.getElementById('sponsorblock-editor-config').textContent),data=structuredClone(config.overrides),id=new URLSearchParams(options.body).get('channel');data[id].modes.intro='marker';return new Promise(resolve=>sbPending.push(()=>resolve(new Response(JSON.stringify({profile:config.profile,csrf:'token',overrides:data}),{status:200,headers:{'Content-Type':'application/json'}}))));}return fetch(url,options);};}});
            await page.locator('#mode_intro').selectOption('marker');await page.locator('.sponsorblock-channel-form [value=save]').click();await page.waitForFunction(()=>sbPending.length===1);
            if(lifecycle==='removal'){
                await page.evaluate(()=>{window.removedEditor=document.querySelector('#sponsorblock-channels');removedEditor.remove();document.dispatchEvent(new Event('iv:content-added'));sbPending[0]();});
                assert.equal(await page.evaluate(()=>removedEditor.querySelector('#sponsorblock-save-status').textContent.includes('profile changed')),true);assert.deepEqual(errors,[]);await context.close();continue;
            }
            if(lifecycle==='cache')await page.evaluate(()=>{dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}));dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));sbPending[0]();});else await page.evaluate(()=>{dispatchEvent(new Event('browserprofilechange'));sbPending[0]();});
            assert.equal(await page.locator('.sponsorblock-channel-form [value=save]').isDisabled(),true);assert.equal(await page.locator('#mode_intro').inputValue(),'marker');assert.equal(await page.locator('#mode_intro').isDisabled(),lifecycle==='profile');assert.equal(await page.locator('#sponsorblock-save-status').textContent().then(s=>s==='Saved'),false);assert.deepEqual(errors,[]);await context.close();
        }
    });
    test(`${engine}: D6 SponsorBlock guest saves verify durable state and preserve storage-failure drafts`,async()=>{
        const id='UC'+'a'.repeat(22),initial={[id]:{name:'<Channel>',enabled:false,modes:{sponsor:'manual'}}};const {page,context,requests,errors}=await setup(engine,'settings','dark',{fixture:'sponsorblock-channels-guest-editor',url:'/preferences/sponsorblock/channels'});
        // Populate through the storage API to use its actual profile/cookie keys.
        await page.evaluate(data=>{InvidiousStorage.local.set('sponsorblock_channel_overrides',data);dispatchEvent(new StorageEvent('storage',{key:InvidiousStorage.local.key('sponsorblock_channel_overrides'),storageArea:localStorage}));},initial);
        const form=page.locator('.sponsorblock-channel-form'),save=form.locator('[value=save]');await page.locator('#mode_intro').selectOption('auto');await save.click();await page.waitForFunction(()=>document.querySelector('#sponsorblock-save-status').textContent==='Saved');assert.equal((await page.evaluate(()=>InvidiousStorage.local.readStored('sponsorblock_channel_overrides')))[id].modes.intro,'auto');
        await page.evaluate(()=>{window.sbSet=InvidiousStorage.local.set;InvidiousStorage.local.set=()=>false;});await page.locator('#mode_intro').selectOption('marker');await save.click();await page.waitForFunction(()=>document.querySelector('#sponsorblock-save-status').textContent.includes('could not be saved'));assert.equal(await page.locator('#mode_intro').inputValue(),'marker');assert.equal(await save.isEnabled(),true);assert.equal((await page.evaluate(()=>InvidiousStorage.local.readStored('sponsorblock_channel_overrides')))[id].modes.intro,'auto');
        await page.evaluate(()=>{InvidiousStorage.local.set=sbSet;});await save.click();await page.waitForFunction(()=>document.querySelector('#sponsorblock-save-status').textContent==='Saved');assert.equal((await page.evaluate(()=>InvidiousStorage.local.readStored('sponsorblock_channel_overrides')))[id].modes.intro,'marker');assert.equal(requests.filter(r=>r.url.pathname==='/preferences/sponsorblock/channels'&&r.method==='POST').length,0);assert.deepEqual(errors,[]);await context.close();
    });
}

for(const engine of engines) {
    test(`${engine}: D6 SponsorBlock defaults pair mode/color controls with category Save, Discard and search focus`,async()=>{
        const config=settingsConfig('sponsorblock'),values=structuredClone(config.values),writes=[];
        const {page,context,errors}=await setup(engine,'settings','light',{fixture:'settings-sponsorblock',url:'/preferences?section=sponsorblock&field=sponsorblock_colors',reply(entry){
            if(entry.url.pathname!=='/preferences')return;
            if(entry.method==='POST'){
                writes.push(Object.fromEntries(entry.body));values.sponsorblock_enabled=entry.body.get('sponsorblock_enabled')==='on';
                for(const category of Object.keys(values.sponsorblock_modes)){values.sponsorblock_modes[category]=entry.body.get('sponsorblock_mode_'+category);values.sponsorblock_colors[category]=entry.body.get('sponsorblock_color_'+category);}
            }
            if(entry.method==='POST'||entry.url.searchParams.get('format')==='json')return{contentType:'application/json',body:JSON.stringify({section:'sponsorblock',profile:config.profile,values})};
            return{contentType:'text/html',body:settingsFixture(entry.url.searchParams.get('section')||'sponsorblock')};
        }});
        const form=page.locator('[data-category-form]'),save=form.locator('[type=submit]');await assertFocus(page,'#sponsorblock_color_sponsor');assert.equal(await form.locator('.sponsorblock-defaults tbody tr').count(),8);assert.equal(await form.locator('select').count(),8);assert.equal(await form.locator('input[type=color]').count(),8);assert.equal(await form.locator('[type=submit]').count(),1);
        for(const category of Object.keys(values.sponsorblock_modes))for(const type of ['mode','color'])assert.ok(await page.locator(`#sponsorblock_${type}_${category}`).getAttribute('id').then(id=>form.locator(`label[for="${id}"]`).textContent()));
        await page.locator('#sponsorblock_mode_intro').selectOption('auto');await page.locator('#sponsorblock_color_intro').fill('#123456');await form.locator('[type=reset]').click();assert.equal(await page.locator('#sponsorblock_mode_intro').inputValue(),config.values.sponsorblock_modes.intro);assert.equal(await page.locator('#sponsorblock_color_intro').inputValue(),config.values.sponsorblock_colors.intro);
        await page.locator('#setting-sponsorblock_enabled').check();await page.locator('#sponsorblock_mode_intro').selectOption('marker');await page.locator('#sponsorblock_color_intro').fill('#123456');await save.click();await page.waitForFunction(()=>document.querySelector('[data-category-status]').textContent==='Saved');assert.equal(writes.length,1);assert.equal(writes[0].sponsorblock_mode_intro,'marker');assert.equal(writes[0].sponsorblock_color_intro,'#123456');assert.equal(writes[0].section,'sponsorblock');assert.equal(writes[0].browser_profile,config.profile);assert.equal(await save.isDisabled(),true);
        await page.locator('#settings-search').fill('Segment behavior');await page.locator('#settings-search-results [data-settings-field=sponsorblock_modes]').click();await assertFocus(page,'#sponsorblock_mode_sponsor');assert.equal(await page.locator('.toolbar a[href="/preferences/sponsorblock/channels"]').count(),1);
        await page.locator('#settings-search').fill('');await page.evaluate(()=>{document.activeElement.blur();scrollTo(0,0);});await page.screenshot({path:path.join(artifacts,`${engine}-d6-sb-defaults-light.png`),fullPage:true});await page.evaluate(()=>{setTheme('dark');document.documentElement.dir='rtl';});await page.addStyleTag({content:'body{font-size:20px}.settings-matrix{font-size:20px}'});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:path.join(artifacts,`${engine}-d6-sb-defaults-dark-rtl.png`),fullPage:true});await page.emulateMedia({forcedColors:'active'});await page.locator('#sponsorblock_mode_sponsor').focus();await page.keyboard.press('Tab');await page.keyboard.press('Shift+Tab');await assertFocus(page,'#sponsorblock_mode_sponsor');assert.notEqual(await page.locator('#sponsorblock_mode_sponsor').evaluate(e=>getComputedStyle(e).outlineStyle),'none');assert.deepEqual(errors,[]);await context.close();
    });
    test(`${engine}: D6 SponsorBlock literal invalid maps and future native values stay visible`,async()=>{
        for(const kind of ['invalid','future']){
            const {page,context,errors}=await setup(engine,'settings','light',{fixture:'d6-sb-defaults-'+kind,url:'/preferences?section=sponsorblock'}), expected=kind==='invalid'?['manual<draft>&','color<draft>&']:['future<mode>&','future<color>&'];
            assert.equal(await page.locator('#sponsorblock_mode_intro').inputValue(),expected[0]);assert.equal(await page.locator('#sponsorblock_color_intro').inputValue(),expected[1]);assert.equal(await page.locator('#sponsorblock_color_intro').getAttribute('type'),'text');assert.equal(await page.locator('[data-category-form] [type=submit]').isDisabled(),kind==='future');assert.equal(await page.locator('[data-category-form] draft,[data-category-form] mode,[data-category-form] color').count(),0);assert.deepEqual(errors,[]);await context.close();
        }
    });
    test(`${engine}: D6 SponsorBlock guest external updates preserve drafts, latest resets and cleared channels`,async()=>{
        const id='UC'+'a'.repeat(22),other='UC'+'b'.repeat(22),third='UC'+'c'.repeat(22);
        const {page,context,requests,errors}=await setup(engine,'settings','light',{fixture:'sponsorblock-channels-guest-editor',url:'/preferences/sponsorblock/channels'});
        const external=async data=>page.evaluate(value=>{InvidiousStorage.local.set('sponsorblock_channel_overrides',value);dispatchEvent(new StorageEvent('storage',{key:InvidiousStorage.local.key('sponsorblock_channel_overrides'),storageArea:localStorage}));},data);
        await external({[id]:{name:'Initial',enabled:false,modes:{sponsor:'manual'}},[other]:{name:'Other',enabled:true,modes:{intro:'auto'}}});
        const form=page.locator('.sponsorblock-channel-form'),save=form.locator('[value=save]');await page.locator('#mode_intro').selectOption('marker');
        await external({[id]:{name:'Renamed upstream',enabled:true,modes:{sponsor:'auto'}},[other]:{name:'Other',enabled:false,modes:{intro:'manual'}},[third]:{name:'Third',enabled:true,modes:{outro:'disabled'}}});
        assert.equal(await page.locator('#mode_intro').inputValue(),'marker');assert.match(await page.locator('#sponsorblock-save-status').textContent(),/Saved settings changed/);await form.locator('[type=reset]').click();assert.equal(await page.locator('#mode_sponsor').inputValue(),'auto');assert.equal(await page.locator('#enabled').inputValue(),'true');assert.equal(await save.isDisabled(),true,'Discard uses the latest saved baseline');
        await page.locator('#mode_intro').selectOption('marker');await page.locator(`[data-channel="${other}"] [value=reset]`).click();await page.waitForFunction(id=>!InvidiousStorage.local.readStored('sponsorblock_channel_overrides')[id],other);assert.equal(await page.locator('#mode_intro').inputValue(),'marker');assert.equal(await save.isEnabled(),true);assert.ok((await page.evaluate(()=>InvidiousStorage.local.readStored('sponsorblock_channel_overrides')))[third]);
        // A removal without a delivered storage event must not resurrect the old list.
        await page.evaluate(()=>InvidiousStorage.local.remove('sponsorblock_channel_overrides'));await save.click();await page.waitForFunction(()=>document.querySelector('#sponsorblock-save-status').textContent==='Saved');const stored=await page.evaluate(()=>InvidiousStorage.local.readStored('sponsorblock_channel_overrides'));assert.deepEqual(Object.keys(stored),[id]);assert.equal(stored[id].modes.intro,'marker');assert.equal(requests.filter(r=>r.method==='POST').length,0);assert.deepEqual(errors,[]);await context.close();
    });
    test(`${engine}: D6 SponsorBlock actual denied storage keeps a retryable browser draft`,async()=>{
        const {page,context,requests,errors}=await setup(engine,'settings','light',{fixture:'sponsorblock-channels-guest-editor',url:'/preferences/sponsorblock/channels'});await page.evaluate(()=>{
            window.sbOriginalLocal=Object.getOwnPropertyDescriptor(window,'localStorage');window.sbOriginalCookie=Object.getOwnPropertyDescriptor(Document.prototype,'cookie');
            Object.defineProperty(window,'localStorage',{configurable:true,get(){throw new DOMException('Storage denied','SecurityError');}});Object.defineProperty(document,'cookie',{configurable:true,get(){return sbOriginalCookie.get.call(document);},set(){throw new DOMException('Cookies denied','SecurityError');}});
        });
        const save=page.locator('.sponsorblock-channel-form [value=save]');await page.locator('#mode_intro').selectOption('marker');await save.click();await page.waitForFunction(()=>document.querySelector('#sponsorblock-save-status').textContent.includes('could not be saved'));assert.equal(await page.locator('#mode_intro').inputValue(),'marker');assert.equal(await save.isEnabled(),true);assert.equal(await page.evaluate(()=>InvidiousStorage.local.readStored('sponsorblock_channel_overrides')),undefined);assert.equal((await page.evaluate(()=>InvidiousStorage.local.get('sponsorblock_channel_overrides')))['UC'+'a'.repeat(22)].modes.intro,'marker','failed in-memory fallback is not reported as saved');
        await page.evaluate(()=>{Object.defineProperty(window,'localStorage',sbOriginalLocal);delete document.cookie;});await save.click();await page.waitForFunction(()=>document.querySelector('#sponsorblock-save-status').textContent==='Saved');assert.equal(await save.isDisabled(),true);assert.equal(requests.filter(r=>r.method==='POST').length,0);assert.deepEqual(errors,[]);await context.close();
    });
    test(`${engine}: D6 SponsorBlock unavailable scripts retain ordinary account forms and explain guest storage`,async()=>{
        for(const javascript of [false,true])for(const account of [false,true]){
            const fixture=account?'sponsorblock-channels':'sponsorblock-channels-guest-editor',writes=[];
            const {page,context,errors}=await setup(engine,'settings','light',{fixture,javascript,url:'/preferences/sponsorblock/channels',reply(entry){if(javascript&&entry.url.pathname==='/js/sponsorblock-preferences.js')return{status:404,body:''};if(entry.method==='POST'&&entry.url.pathname==='/preferences/sponsorblock/channels'){writes.push(entry);return{contentType:'text/html',body:'<!doctype html><p id="native-result">Ordinary account form received</p>'};}}});
            assert.equal(await page.locator('.sponsorblock-channel-form').isVisible(),account);assert.equal(await page.locator('#settings-search').isVisible(),javascript);if(!account){assert.equal(await page.locator('[data-sb-browser-required]').isVisible(),true);assert.equal(await page.locator('.sponsorblock-channel-form select').first().isDisabled(),true);}else{await page.locator('#mode_intro').selectOption('marker');await page.locator('.sponsorblock-channel-form [value=save]').click();await page.locator('#native-result').waitFor();assert.equal(writes.length,1);assert.equal(writes[0].navigation,true);assert.equal(writes[0].body.get('mode_intro'),'marker');assert.ok(writes[0].body.get('csrf_token'));assert.equal(writes[0].body.get('browser_profile'),sbEditorConfig().profile);assert.equal(writes[0].url.searchParams.has('format'),false);}assert.deepEqual(errors,[]);await context.close();
        }
        const {page,context}=await setup(engine,'settings','light',{fixture:'settings-sponsorblock',javascript:false,url:'/preferences?section=sponsorblock'});assert.equal(await page.locator('[name^=sponsorblock_mode_]').count(),8);assert.equal(await page.locator('[name^=sponsorblock_color_]').count(),8);assert.equal(await page.locator('[data-category-form]').getAttribute('method'),'post');assert.equal(await page.locator('[data-category-form] noscript a').isVisible(),true);await context.close();
    });
    test(`${engine}: D6 SponsorBlock rejects failed preflight, malformed canonical results and changed profiles`,async()=>{
        for(const failure of ['preflight','malformed','profile']){
            const server=sbEditorServer(),{page,context,errors}=await setup(engine,'settings','light',{fixture:'sponsorblock-channels',url:'/preferences/sponsorblock/channels',reply(entry){if(entry.url.pathname==='/preferences/sponsorblock/channels'&&entry.url.searchParams.get('format')==='json'){
                if(failure==='preflight')return{status:503,contentType:'application/json',body:'{}'};
                if(entry.method==='POST'){server.writes.push(Object.fromEntries(entry.body));return{contentType:'application/json',body:failure==='profile'?JSON.stringify({profile:'b'.repeat(64),csrf:'token',overrides:server.state}):JSON.stringify({profile:server.config.profile,csrf:'token',overrides:{invalid:{enabled:true,modes:{}}}})};}
            }return server.reply(entry);}});
            await page.locator('#mode_intro').selectOption('marker');await page.locator('.sponsorblock-channel-form [value=save]').click();await page.waitForFunction(()=>document.querySelector('#sponsorblock-channels').getAttribute('aria-busy')==='false'&&document.querySelector('#sponsorblock-save-status').textContent!=='Saving…');assert.equal(await page.locator('#mode_intro').inputValue(),'marker');assert.equal(server.writes.length,failure==='preflight'?0:1);assert.equal(await page.locator('.sponsorblock-channel-form [value=save]').isDisabled(),failure!=='preflight');assert.equal(await page.locator('#mode_intro').isDisabled(),failure==='profile');assert.notEqual(await page.locator('#sponsorblock-save-status').textContent(),'Saved');assert.deepEqual(errors,[]);await context.close();
        }
    });
    test(`${engine}: D6 SponsorBlock failure views preserve literal values in Light, Dark, RTL and forced colors`,async()=>{
        for(const kind of ['invalid','uncertain','stale'])for(const mode of ['light','dark']){
            const {page,context,errors}=await setup(engine,'settings',mode,{fixture:`d6-sb-${kind}-${mode}`,url:'/preferences/sponsorblock/channels',width:1280});assert.equal(await page.locator('#mode_intro').inputValue(),'manual<draft>&');assert.equal(await page.locator('#sponsorblock-save-status').getAttribute('role'),'alert');assert.equal(await page.locator('.settings-nav [aria-current=page]').getAttribute('href'),'/preferences/sponsorblock/channels');assert.equal(await page.locator('#mode_intro').isDisabled(),kind==='stale');assert.equal(await page.locator('.sponsorblock-channel-form [value=save]').isDisabled(),kind!=='invalid');
            if(mode==='dark'){await page.evaluate(()=>document.documentElement.dir='rtl');await page.addStyleTag({content:'body{font-size:20px}.button,.field-row select{font-size:18px}'});}
            assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:path.join(artifacts,`${engine}-d6-sb-${kind}-${mode}${mode==='dark'?'-rtl':''}.png`),fullPage:true});await page.emulateMedia({forcedColors:'active'});await page.locator('#channel').focus();if(kind!=='stale')assert.notEqual(await page.locator('#channel').evaluate(e=>getComputedStyle(e).outlineStyle),'none');assert.deepEqual(errors,[]);await context.close();
        }
    });
}

function maskingEditorConfig(fixture='spoiler-editor-account') {
    return JSON.parse(fs.readFileSync(path.join(generated,fixture+'.html'),'utf8').match(/<script id="masking-editor-config" type="application\/json">([\s\S]*?)<\/script>/)[1]);
}
function maskingEditorServer(options={}) {
    const config=maskingEditorConfig(),state=structuredClone(config.rules),writes=[];let attempts=0;
    const body=()=>JSON.stringify({profile:config.profile,csrf:'masking-route-token',rules:state});
    function apply(entry){const id=entry.body.get('channel');if(entry.body.get('action')==='reset'||entry.body.get('hide_title')!=='on'&&entry.body.get('hide_thumbnail')!=='on')delete state[id];else state[id]={name:state[id]?.name||'<Known channel>',hide_title:entry.body.get('hide_title')==='on',hide_thumbnail:entry.body.get('hide_thumbnail')==='on',reveal_after_days:entry.body.get('reveal_after_days')?Number(entry.body.get('reveal_after_days')):null};}
    return{config,state,writes,body,apply,reply(entry){if(entry.url.pathname!=='/preferences/spoilers/channels'||entry.url.searchParams.get('format')!=='json')return;
        if(entry.method==='POST'){attempts++;writes.push(Object.fromEntries(entry.body));const failure=options.failure?.(attempts,entry);if(failure){if(failure.commit)apply(entry);return{status:failure.status,contentType:'application/json',body:JSON.stringify({error:failure.error||'Masking save rejected'})};}apply(entry);}
        return{contentType:'application/json',body:body()};
    }};
}
for(const engine of engines) {
    test(`${engine}: D6 masking editor owns canonical fields, Discard, searchable rules and native age semantics`,async()=>{
        const server=maskingEditorServer(),{page,context,requests,errors}=await setup(engine,'settings','light',{fixture:'spoiler-editor-account',url:'/preferences/spoilers/channels',reply:server.reply});const id=Object.keys(server.config.rules)[0],form=page.locator('.spoiler-channel-form'),save=form.locator('[value=save]');
        assert.equal(await page.locator('#channel-spoilers').getAttribute('data-editor-ready'),'true');assert.equal(await page.locator('.settings-nav [aria-current=page]').getAttribute('href'),'/preferences/spoilers/channels');assert.equal(await page.locator('.sidebar-settings').getAttribute('aria-current'),'page');assert.equal(await save.isDisabled(),true);assert.equal(await form.locator('input:not([type=hidden])').count(),3);assert.equal(await page.locator('#channel-spoiler-config').count(),0);assert.match(await page.locator('#spoiler-days-hint').textContent(),/Unknown upload dates stay hidden/);
        await page.locator('#spoiler-hide-title').uncheck();await page.locator('#spoiler-days').fill('14');await form.locator('[type=reset]').click();assert.equal(await page.locator('#spoiler-hide-title').isChecked(),server.state[id].hide_title);assert.equal(await page.locator('#spoiler-days').inputValue(),String(server.state[id].reveal_after_days));assert.equal(server.writes.length,0);
        await page.locator('#spoiler-hide-thumbnail').uncheck();await page.locator('#spoiler-days').fill('14');await save.click();await page.waitForFunction(()=>document.querySelector('#spoiler-save-status').textContent==='Saved');assert.equal(server.writes.length,1);assert.equal(server.writes[0].hide_thumbnail,'off');assert.equal(server.writes[0].hide_title,'on');assert.equal(server.writes[0].reveal_after_days,'14');assert.equal(server.writes[0].csrf_token,'masking-route-token');assert.equal(server.writes[0].browser_profile,server.config.profile);assert.equal(await save.isDisabled(),true);assert.equal(await page.evaluate(()=>InvidiousStorage.local.get('channel_spoiler_settings')),undefined);
        await page.locator('#spoiler-search').fill('not found');assert.equal(await page.locator('#spoiler-saved-channels .channel-rule-row').count(),0);await page.locator('#spoiler-search').fill('');assert.equal(await page.locator('#spoiler-saved-channels .channel-rule-row').count(),1);assert.equal(await page.locator('#spoiler-saved-channels north').count(),0);const reads=requests.filter(r=>r.url.searchParams.get('format')==='json').length;await page.locator('#settings-search').fill('Hide title');const link=page.locator('#settings-search-results a[href="/preferences/spoilers/channels?field=hide_title"]');assert.equal(await link.count(),1);assert.equal(requests.filter(r=>r.url.searchParams.get('format')==='json').length,reads);await page.locator('#settings-search').fill('');assert.equal(requests.filter(r=>/publications/.test(r.url.pathname)).length,0);
        await page.evaluate(()=>{setTheme('light');document.activeElement.blur();scrollTo(0,0);});assert.equal(await page.locator('body').getAttribute('class'),'light-theme');await page.screenshot({path:path.join(artifacts,`${engine}-d6-masking-editor-light.png`),fullPage:true});await page.evaluate(()=>{setTheme('dark');document.documentElement.dir='rtl';});await page.addStyleTag({content:'body{font-size:20px}.button{font-size:18px}'});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:path.join(artifacts,`${engine}-d6-masking-editor-dark-rtl.png`),fullPage:true});assert.deepEqual(errors,[]);await context.close();
    });
    test(`${engine}: D6 masking uncertain and rejected writes retain drafts and require explicit read-back`,async()=>{
        for(const commit of [true,false]){
            const server=maskingEditorServer({failure:n=>n===1?{status:400,error:'Literal masking draft retained'}:n===2?{status:503,commit}:null});let failRead=true;
            const {page,context,errors}=await setup(engine,'settings','light',{fixture:'spoiler-editor-account',url:'/preferences/spoilers/channels',reply(entry){if(failRead&&server.writes.length===2&&entry.method==='GET'&&entry.url.searchParams.get('format')==='json'){failRead=false;return{status:503,body:'{}',contentType:'application/json'};}return server.reply(entry);}}),form=page.locator('.spoiler-channel-form'),save=form.locator('[value=save]');
            await page.locator('#spoiler-days').fill('21');await save.click();await page.getByText('Literal masking draft retained',{exact:true}).waitFor();assert.equal(await save.isEnabled(),true);assert.equal(await page.locator('#spoiler-days').inputValue(),'21');await save.click();await page.waitForFunction(()=>document.querySelector('#channel-spoilers').getAttribute('aria-busy')==='false'&&document.querySelector('#spoiler-save-status').textContent.includes('could not be confirmed'));assert.equal(await save.isDisabled(),true);assert.equal(await form.locator('[value=reset]').isDisabled(),true);assert.equal(server.writes.length,2);
            await page.locator('[data-mask-readback]').click();await page.waitForFunction(message=>document.querySelector('#spoiler-save-status').textContent===message,server.config.words.load);assert.equal(await save.isDisabled(),true);assert.equal(await page.locator('#spoiler-days').inputValue(),'21');await page.locator('[data-mask-readback]').click();await page.waitForFunction(()=>document.querySelector('#channel-spoilers').getAttribute('aria-busy')==='false'&&!document.querySelector('#spoiler-save-status').textContent.includes('could not be read'));assert.equal(await save.isDisabled(),commit);assert.equal(server.writes.length,2);assert.equal(await page.locator('#spoiler-days').inputValue(),'21');assert.deepEqual(errors,[]);await context.close();
        }
    });
    test(`${engine}: D6 masking validates literal days and preserves retryable guest drafts under denied storage`,async()=>{
        const server=maskingEditorServer(),invalid=await setup(engine,'settings','light',{fixture:'d6-masking-invalid-light',url:'/preferences/spoilers/channels',reply:server.reply});assert.equal(await invalid.page.locator('#spoiler-days').inputValue(),'days<draft>&');await invalid.page.locator('#spoiler-days').fill('2147483648');await invalid.page.locator('.spoiler-channel-form [value=save]').click();assert.equal(server.writes.length,0);assert.equal(await invalid.page.locator('#spoiler-days').getAttribute('aria-invalid'),'true');await invalid.page.locator('#spoiler-days').fill('14');await invalid.page.locator('.spoiler-channel-form [value=save]').click();await invalid.page.waitForFunction(()=>document.querySelector('#spoiler-save-status').textContent==='Saved');assert.equal(server.writes.length,1);assert.equal(await invalid.page.locator('#spoiler-days').getAttribute('type'),'text');assert.deepEqual(invalid.errors,[]);await invalid.context.close();
        const {page,context,requests,errors}=await setup(engine,'settings','light',{fixture:'spoiler-editor-guest',url:'/preferences/spoilers/channels'}),id=await page.locator('.spoiler-channel-form [name=channel]').inputValue();await page.locator('#spoiler-hide-title').check();await page.locator('#spoiler-days').fill('7');await page.locator('.spoiler-channel-form [value=save]').click();await page.waitForFunction(()=>document.querySelector('#spoiler-save-status').textContent==='Saved');assert.equal((await page.evaluate(()=>InvidiousStorage.local.readStored('channel_spoiler_settings')))[id].reveal_after_days,7);assert.ok((await context.cookies()).some(c=>c.name==='iv_spoilers_guest'&&c.value==='1'));
        await page.evaluate(()=>{window.maskLocal=Object.getOwnPropertyDescriptor(window,'localStorage');window.maskCookie=Object.getOwnPropertyDescriptor(Document.prototype,'cookie');Object.defineProperty(window,'localStorage',{configurable:true,get(){throw new DOMException('Denied','SecurityError');}});Object.defineProperty(document,'cookie',{configurable:true,get(){return maskCookie.get.call(document);},set(){throw new DOMException('Denied','SecurityError');}});});await page.locator('#spoiler-days').fill('14');await page.locator('.spoiler-channel-form [value=save]').click();await page.waitForFunction(()=>document.querySelector('#spoiler-save-status').textContent.includes('could not be saved'));assert.equal(await page.locator('#spoiler-days').inputValue(),'14');assert.equal(await page.locator('.spoiler-channel-form [value=save]').isEnabled(),true);assert.equal(await page.evaluate(()=>InvidiousStorage.local.readStored('channel_spoiler_settings')),undefined);await page.evaluate(()=>{Object.defineProperty(window,'localStorage',maskLocal);delete document.cookie;});await page.locator('.spoiler-channel-form [value=save]').click();await page.waitForFunction(()=>document.querySelector('#spoiler-save-status').textContent==='Saved');assert.equal((await page.evaluate(()=>InvidiousStorage.local.readStored('channel_spoiler_settings')))[id].reveal_after_days,14);assert.equal(requests.filter(r=>r.method==='POST').length,0);assert.deepEqual(errors,[]);await context.close();
    });
    test(`${engine}: D6 masking external updates, Discard and targeted removal preserve other guest rules`,async()=>{
        const {page,context,requests,errors}=await setup(engine,'settings','light',{fixture:'spoiler-editor-guest',url:'/preferences/spoilers/channels'}),id=await page.locator('.spoiler-channel-form [name=channel]').inputValue(),other='UC'+'b'.repeat(22);
        const external=async value=>page.evaluate(data=>{InvidiousStorage.local.set('channel_spoiler_settings',data);dispatchEvent(new StorageEvent('storage',{key:InvidiousStorage.local.key('channel_spoiler_settings'),storageArea:localStorage}));},value);
        await external({[id]:{name:'Original',hide_title:true,hide_thumbnail:false,reveal_after_days:7},[other]:{name:'Other',hide_title:false,hide_thumbnail:true,reveal_after_days:null}});await page.locator('#spoiler-days').fill('21');assert.equal(await page.locator('.spoiler-channel-form [value=save]').isEnabled(),true,JSON.stringify(await page.evaluate(()=>({status:document.querySelector('#spoiler-save-status').textContent,fields:Array.from(document.querySelector('.spoiler-channel-form').elements,e=>[e.name,e.value,e.checked])}))));await external({[id]:{name:'Latest <channel>',hide_title:false,hide_thumbnail:true,reveal_after_days:14},[other]:{name:'Other',hide_title:true,hide_thumbnail:false,reveal_after_days:null}});assert.equal(await page.locator('#spoiler-days').inputValue(),'21');assert.equal(await page.locator('.spoiler-channel-form [type=reset]').isVisible(),true,JSON.stringify(await page.evaluate(()=>({status:document.querySelector('#spoiler-save-status').textContent,fields:Array.from(document.querySelector('.spoiler-channel-form').elements,e=>[e.name,e.value,e.checked]),saved:InvidiousStorage.local.readStored('channel_spoiler_settings')}))));await page.locator('.spoiler-channel-form [type=reset]').click();assert.equal(await page.locator('#spoiler-days').inputValue(),'14');assert.equal(await page.locator('#spoiler-hide-title').isChecked(),false);assert.equal(await page.locator('.spoiler-channel-form [value=save]').isDisabled(),true);await page.locator('#spoiler-days').fill('21');await page.locator(`[data-channel="${other}"] [value=reset]`).click();await page.waitForFunction(id=>!InvidiousStorage.local.readStored('channel_spoiler_settings')[id],other);assert.equal(await page.locator('#spoiler-days').inputValue(),'21');await page.locator('.spoiler-channel-form [value=save]').click();await page.waitForFunction(()=>document.querySelector('#spoiler-save-status').textContent==='Saved');assert.equal((await page.evaluate(()=>InvidiousStorage.local.readStored('channel_spoiler_settings')))[id].name,'Latest <channel>');
        await page.locator('#spoiler-days').fill('28');await page.evaluate(()=>InvidiousStorage.local.remove('channel_spoiler_settings'));await page.locator('.spoiler-channel-form [value=save]').click();await page.waitForFunction(()=>document.querySelector('#spoiler-save-status').textContent==='Saved');assert.deepEqual(Object.keys(await page.evaluate(()=>InvidiousStorage.local.readStored('channel_spoiler_settings'))),[id]);await page.locator('.spoiler-channel-form [value=reset]').click();await page.waitForFunction(()=>Object.keys(InvidiousStorage.local.readStored('channel_spoiler_settings')).length===0);assert.equal((await context.cookies()).some(c=>c.name==='iv_spoilers_guest'),false);assert.equal(requests.filter(r=>r.method==='POST').length,0);assert.deepEqual(errors,[]);await context.close();
    });
    test(`${engine}: D6 masking cached pages, profile changes and detached editors reject completed stale writes`,async()=>{
        for(const lifetime of ['cache','profile','removal']){
            const server=maskingEditorServer(),{page,context,errors}=await setup(engine,'settings','light',{fixture:'spoiler-editor-account',url:'/preferences/spoilers/channels',reply:server.reply,init:()=>{const fetch=window.fetch.bind(window);window.maskPending=[];window.fetch=(url,options={})=>{if(new URL(url,location.href).pathname==='/preferences/spoilers/channels'&&options.method==='POST'){const config=JSON.parse(document.getElementById('masking-editor-config').textContent),rules=structuredClone(config.rules),id=new URLSearchParams(options.body).get('channel');rules[id].reveal_after_days=21;return new Promise(resolve=>maskPending.push(()=>resolve(new Response(JSON.stringify({profile:config.profile,csrf:'token',rules}),{status:200,headers:{'Content-Type':'application/json'}}))));}return fetch(url,options);};}});
            await page.locator('#spoiler-days').fill('21');await page.locator('.spoiler-channel-form [value=save]').click();await page.waitForFunction(()=>maskPending.length===1);await page.evaluate(lifetime=>{window.maskRoot=document.getElementById('channel-spoilers');if(lifetime==='cache'){dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}));dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));}else if(lifetime==='profile')dispatchEvent(new Event('browserprofilechange'));else{maskRoot.remove();document.dispatchEvent(new Event('iv:content-added'));}maskPending[0]();},lifetime);assert.equal(await page.evaluate(()=>maskRoot.querySelector('[value=save]').disabled),true);assert.notEqual(await page.evaluate(()=>maskRoot.querySelector('#spoiler-save-status').textContent),'Saved');assert.equal(await page.evaluate(()=>maskRoot.querySelector('#spoiler-days').value),'21');assert.equal(await page.evaluate(()=>maskRoot.querySelector('#spoiler-days').disabled),lifetime!=='cache');assert.deepEqual(errors,[]);await context.close();
        }
    });
    test(`${engine}: D6 masking ordinary forms and unavailable guest scripts retain their scope`,async()=>{
        for(const javascript of [false,true])for(const account of [false,true]){
            const fixture=account?'spoiler-editor-account':'spoiler-editor-guest',writes=[];const {page,context,errors}=await setup(engine,'settings','light',{fixture,javascript,url:'/preferences/spoilers/channels',reply(entry){if(javascript&&entry.url.pathname==='/js/channel-spoiler-preferences.js')return{status:404,body:''};if(entry.method==='POST'&&entry.url.pathname==='/preferences/spoilers/channels'){writes.push(entry);return{contentType:'text/html',body:'<p id="mask-native-result">Ordinary form received</p>'};}}});assert.equal(await page.locator('.spoiler-channel-form').isVisible(),account);if(account){await page.locator('#spoiler-hide-thumbnail').uncheck();await page.locator('#spoiler-days').fill('14');await page.locator('.spoiler-channel-form [value=save]').click();await page.locator('#mask-native-result').waitFor();assert.equal(writes.length,1);assert.equal(writes[0].navigation,true);assert.equal(writes[0].body.has('hide_thumbnail'),false);assert.equal(writes[0].body.get('reveal_after_days'),'14');assert.ok(writes[0].body.get('browser_profile'));assert.ok(writes[0].body.get('csrf_token'));}else{assert.equal(await page.locator('[data-mask-browser-required]').isVisible(),true);assert.equal(await page.locator('#spoiler-hide-title').isDisabled(),true);}assert.deepEqual(errors,[]);await context.close();
        }
    });
    test(`${engine}: D6 masking failure views retain literal days in Light, Dark, RTL and forced colors`,async()=>{
        for(const kind of ['invalid','uncertain','stale'])for(const mode of ['light','dark']){
            const {page,context,errors}=await setup(engine,'settings',mode,{fixture:`d6-masking-${kind}-${mode}`,url:'/preferences/spoilers/channels',width:1280});assert.equal(await page.locator('#spoiler-days').inputValue(),'days<draft>&');assert.equal(await page.locator('#spoiler-hide-title').isChecked(),true);assert.equal(await page.locator('#spoiler-hide-thumbnail').isChecked(),false);assert.equal(await page.locator('#spoiler-save-status').getAttribute('role'),'alert');assert.equal(await page.locator('#spoiler-days').isDisabled(),kind==='stale');assert.equal(await page.locator('.spoiler-channel-form [value=save]').isDisabled(),kind!=='invalid');if(mode==='dark'){await page.evaluate(()=>document.documentElement.dir='rtl');await page.addStyleTag({content:'body{font-size:20px}.button{font-size:18px}'});}assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:path.join(artifacts,`${engine}-d6-masking-${kind}-${mode}${mode==='dark'?'-rtl':''}.png`),fullPage:true});await page.emulateMedia({forcedColors:'active'});if(kind!=='stale'){await page.locator('#spoiler-days').focus();assert.notEqual(await page.locator('#spoiler-days').evaluate(e=>getComputedStyle(e).outlineStyle),'none');}assert.deepEqual(errors,[]);await context.close();
        }
    });
    test(`${engine}: D6 channel editors reject a new entry at the persisted limit without losing existing rules`,async()=>{
        for(const kind of ['masking','sponsorblock'])for(const account of [false,true]){
            const masking=kind==='masking',fixture=masking?(account?'spoiler-editor-account':'spoiler-editor-guest'):(account?'sponsorblock-channels':'sponsorblock-channels-guest-editor'),config=masking?maskingEditorConfig():sbEditorConfig(),key=masking?'channel_spoiler_settings':'sponsorblock_channel_overrides',path=masking?'/preferences/spoilers/channels':'/preferences/sponsorblock/channels',formSelector=masking?'.spoiler-channel-form':'.sponsorblock-channel-form',status=masking?'#spoiler-save-status':'#sponsorblock-save-status',entries=Object.fromEntries(Array.from({length:1000},(_,i)=>['UC'+String(i).padStart(22,'0'),masking?{name:'Channel '+i,hide_title:true,hide_thumbnail:false,reveal_after_days:null}:{name:'Channel '+i,enabled:true,modes:{}}]));
            const {page,context,requests,errors}=await setup(engine,'settings','light',{fixture,url:path,reply(entry){if(account&&entry.url.pathname===path&&entry.url.searchParams.get('format')==='json')return{contentType:'application/json',body:JSON.stringify({profile:config.profile,csrf:'token',[masking?'rules':'overrides']:entries})};}});if(!account)await page.evaluate(({key,entries})=>InvidiousStorage.local.set(key,entries),{key,entries});if(masking){await page.locator('#spoiler-hide-title').check();await page.locator('#spoiler-days').fill('14');}else await page.locator('#mode_intro').selectOption('marker');assert.equal(await page.locator(formSelector+' [value=save]').isEnabled(),true,kind+' '+account+' '+await page.locator(status).textContent());await page.locator(formSelector+' [value=save]').click();await page.waitForFunction(({selector,message})=>document.querySelector(selector).textContent===message,{selector:status,message:config.words.limit});assert.equal(await page.locator(formSelector+' [value=save]').isEnabled(),true);assert.equal(requests.filter(r=>r.method==='POST'&&r.url.pathname===path).length,0);if(!account)assert.equal(Object.keys(await page.evaluate(key=>InvidiousStorage.local.readStored(key),key)).length,1000);assert.deepEqual(errors,[]);await context.close();
        }
    });
}

for(const engine of engines) {
    test(`${engine}: D6 masking failed preflight and malformed/profile responses cannot report Saved`,async()=>{
        for(const failure of ['preflight','malformed','profile']){
            const server=maskingEditorServer(),{page,context,errors}=await setup(engine,'settings','light',{fixture:'spoiler-editor-account',url:'/preferences/spoilers/channels',reply(entry){if(entry.url.pathname==='/preferences/spoilers/channels'&&entry.url.searchParams.get('format')==='json'){
                if(failure==='preflight')return{status:503,contentType:'application/json',body:'{}'};
                if(entry.method==='POST'){server.writes.push(Object.fromEntries(entry.body));return{contentType:'application/json',body:JSON.stringify({profile:failure==='profile'?'b'.repeat(64):server.config.profile,csrf:'token',rules:failure==='profile'?server.state:{invalid:{hide_title:true}}})};}
            }return server.reply(entry);}});
            await page.locator('#spoiler-days').fill('21');await page.locator('.spoiler-channel-form [value=save]').click();await page.waitForFunction(()=>document.querySelector('#channel-spoilers').getAttribute('aria-busy')==='false'&&document.querySelector('#spoiler-save-status').textContent!=='Saving…');assert.equal(await page.locator('#spoiler-days').inputValue(),'21');assert.equal(server.writes.length,failure==='preflight'?0:1);assert.equal(await page.locator('.spoiler-channel-form [value=save]').isDisabled(),failure!=='preflight');assert.equal(await page.locator('#spoiler-days').isDisabled(),failure==='profile');assert.notEqual(await page.locator('#spoiler-save-status').textContent(),'Saved');assert.deepEqual(errors,[]);await context.close();
        }
    });
}

for(const engine of engines) {
    test(`${engine}: D6 channel failure drafts retain omitted-field semantics in ordinary forms`,async()=>{
        const masking=await setup(engine,'settings','light',{fixture:'d6-masking-missing-light',url:'/preferences/spoilers/channels',javascript:false});assert.equal(await masking.page.locator('#spoiler-days').inputValue(),'');assert.equal(await masking.page.locator('#spoiler-hide-title').isChecked(),true);assert.equal(await masking.page.locator('#spoiler-hide-thumbnail').isChecked(),false);await masking.context.close();
        const sponsorblock=await setup(engine,'settings','light',{fixture:'d6-sb-missing-light',url:'/preferences/sponsorblock/channels',javascript:false});assert.equal(await sponsorblock.page.locator('#enabled').inputValue(),'');assert.equal(await sponsorblock.page.locator('#enabled').evaluate(e=>e.checkValidity()),false);assert.equal(await sponsorblock.page.locator('#mode_sponsor').inputValue(),'inherit');assert.equal(await sponsorblock.page.locator('#mode_intro').inputValue(),'manual<draft>&');await sponsorblock.context.close();
        const spaces=await setup(engine,'settings','light',{fixture:'d6-masking-spaces-light',url:'/preferences/spoilers/channels',javascript:false});assert.equal(await spaces.page.locator('#spoiler-days').inputValue(),' 7 ');assert.equal(await spaces.page.locator('#spoiler-days').getAttribute('inputmode'),'numeric');await spaces.context.close();
    });
}

function blockedManagerConfig(fixture='d6-blocks-filled-light') {
    return JSON.parse(fs.readFileSync(path.join(generated,fixture+'.html'),'utf8').match(/id="blocked-manager-config" type="application\/json">([\s\S]*?)<\/script>/)[1]);
}
function blockedManagerServer(options={}) {
    const config=blockedManagerConfig(),channels=structuredClone(config.channels),writes=[];let attempts=0;
    const body=()=>JSON.stringify({profile:config.profile,csrf:'blocked-route-token',channels});
    function apply(entry){const id=entry.body.get('ucid'),index=channels.findIndex(c=>c.authorId===id);if(entry.body.get('action')==='unblock'&&index>=0)channels.splice(index,1);}
    return{config,channels,writes,body,apply,reply(entry){if(entry.url.pathname!=='/blocked_channels'||entry.url.searchParams.get('format')!=='json')return;
        if(entry.method==='POST'){attempts++;writes.push(Object.fromEntries(entry.body));const failure=options.failure?.(attempts,entry);if(failure){if(failure.commit)apply(entry);return{status:failure.status,contentType:'application/json',body:JSON.stringify({error:failure.error||'Unblock rejected'})};}apply(entry);}
        return{contentType:'application/json',body:body()};
    }};
}
for(const engine of engines) {
    test(`${engine}: D6 blocked manager searches locally and removes canonical rows with explicit profile/CSRF and focus`,async()=>{
        const server=blockedManagerServer(),{page,context,requests,errors}=await setup(engine,'settings','light',{fixture:'d6-blocks-filled-light',url:'/blocked_channels?field=channels',reply:server.reply});await assertFocus(page,'#blocked-search');assert.equal(await page.locator('#blocked-channel-manager').getAttribute('data-manager-ready'),'true');assert.equal(await page.locator('.settings-nav [aria-current=page]').getAttribute('href'),'/blocked_channels');assert.equal(await page.locator('.sidebar-settings').getAttribute('aria-current'),'page');assert.equal(await page.locator('body').getAttribute('data-page'),'settings');assert.equal(await page.locator('#channel-spoiler-config').count(),0);assert.equal(await page.locator('[data-block-channel]').count(),6);assert.equal(await page.locator('#blocked-channel-list channel').count(),0);
        const reads=()=>requests.filter(r=>r.url.pathname==='/blocked_channels').length,before=reads();await page.locator('#blocked-search').fill('Alpha');assert.equal(await page.locator('[data-block-channel]').count(),2);assert.equal(reads(),before);const id=await page.locator('[data-block-channel]').first().getAttribute('data-block-channel');assert.equal(await page.locator(`[data-block-channel="${id}"] a`).getAttribute('href'),'/channel/'+id);await page.evaluate(()=>InvidiousStorage.session.set('browse_state',{views:[]}));await page.locator('[data-block-unblock] button').first().click();await page.waitForFunction(()=>document.querySelector('#blocked-status').textContent==='Channel unblocked');assert.equal(server.writes.length,1);assert.equal(server.writes[0].ucid,id);assert.equal(server.writes[0].action,'unblock');assert.equal(server.writes[0].csrf_token,'blocked-route-token');assert.equal(server.writes[0].browser_profile,server.config.profile);assert.equal(await page.locator('#blocked-search').inputValue(),'Alpha');assert.equal(await page.locator('[data-block-channel]').count(),1);await assertFocus(page,'[data-block-unblock] button');assert.equal(await page.evaluate(()=>InvidiousStorage.session.get('browse_state')),undefined);
        await page.locator('#settings-search').fill('Unblock channel');const destination=page.locator('#settings-search-results a[href="/blocked_channels?field=unblock"]');assert.equal(await destination.count(),1);assert.equal(requests.filter(r=>/\/api\/v1\/videos|\/ggpht\/|\/vi\//.test(r.url.pathname)).length,0);assert.deepEqual(errors,[]);await context.close();
    });
    test(`${engine}: D6 blocked manager retains failed rows and requires read-back after uncertain unblocks`,async()=>{
        for(const commit of [true,false]){
            const server=blockedManagerServer({failure:n=>n===1?{status:400}:n===2?{status:503,commit}:null});let failRead=true;const id=server.config.channels[0].authorId;
            const {page,context,errors}=await setup(engine,'settings','light',{fixture:'d6-blocks-filled-light',url:'/blocked_channels',reply(entry){if(failRead&&server.writes.length===2&&entry.method==='GET'&&entry.url.searchParams.get('format')==='json'){failRead=false;return{status:503,body:'{}',contentType:'application/json'};}return server.reply(entry);}});await page.locator('#blocked-search').fill(id);await page.locator('[data-block-unblock] button').click();await page.getByText('Unblock rejected',{exact:true}).waitFor();assert.equal(await page.locator('[data-block-channel]').count(),1);assert.equal(await page.locator('[data-block-unblock] button').isEnabled(),true);await page.locator('[data-block-unblock] button').click();await page.waitForFunction(()=>document.querySelector('#blocked-channel-manager').getAttribute('aria-busy')==='false'&&document.querySelector('#blocked-status').textContent.includes('could not be confirmed'));assert.equal(server.writes.length,2);assert.equal(await page.locator('[data-block-unblock] button').isDisabled(),true);assert.equal(await page.locator('#blocked-search').inputValue(),id);
            await page.locator('[data-block-check]').click();await page.waitForFunction(message=>document.querySelector('#blocked-status').textContent===message,server.config.words.load);assert.equal(await page.locator('[data-block-unblock] button').isDisabled(),true);await page.locator('[data-block-check]').click();await page.waitForFunction(()=>document.querySelector('#blocked-channel-manager').getAttribute('aria-busy')==='false'&&!document.querySelector('#blocked-status').textContent.includes('could not be read'));assert.equal(server.writes.length,2);assert.equal(await page.locator('[data-block-channel]').count(),commit?0:1);if(!commit)assert.equal(await page.locator('[data-block-unblock] button').isEnabled(),true);assert.equal(await page.locator('#blocked-search').inputValue(),id);assert.deepEqual(errors,[]);await context.close();
        }
    });
    test(`${engine}: D6 blocked manager invalidates cached, switched-profile and detached late responses without duplicate writes`,async()=>{
        for(const lifetime of ['cache','profile','removal']){
            const server=blockedManagerServer(),{page,context,errors}=await setup(engine,'settings','light',{fixture:'d6-blocks-filled-light',url:'/blocked_channels',reply:server.reply,init:()=>{const fetch=window.fetch.bind(window);window.blockPending=[];window.fetch=(url,options={})=>{if(new URL(url,location.href).pathname==='/blocked_channels'&&options.method==='POST'){const config=JSON.parse(document.getElementById('blocked-manager-config').textContent),id=new URLSearchParams(options.body).get('ucid'),channels=config.channels.filter(c=>c.authorId!==id);return new Promise(resolve=>blockPending.push(()=>resolve(new Response(JSON.stringify({profile:config.profile,csrf:'token',channels}),{status:200,headers:{'Content-Type':'application/json'}}))));}return fetch(url,options);};}});
            await page.locator('[data-block-unblock] button').first().click();await page.waitForFunction(()=>blockPending.length===1);await page.evaluate(()=>document.querySelector('[data-block-unblock]').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));assert.equal(await page.evaluate(()=>blockPending.length),1);await page.evaluate(lifetime=>{window.blockRoot=document.getElementById('blocked-channel-manager');if(lifetime==='cache'){dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}));dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));}else if(lifetime==='profile')dispatchEvent(new Event('browserprofilechange'));else{blockRoot.remove();document.dispatchEvent(new Event('iv:content-added'));}blockPending[0]();},lifetime);assert.equal(await page.evaluate(()=>blockRoot.querySelectorAll('[data-block-channel]').length),6);assert.equal(await page.evaluate(()=>Array.from(blockRoot.querySelectorAll('[data-block-unblock] button')).every(b=>b.disabled)),true);assert.notEqual(await page.evaluate(()=>blockRoot.querySelector('#blocked-status').textContent),'Channel unblocked');assert.equal(await page.evaluate(()=>blockRoot.querySelector('[data-block-check]').disabled),lifetime!=='cache');assert.deepEqual(errors,[]);await context.close();
        }
    });
    test(`${engine}: D6 blocked manager preserves ordinary forms when JavaScript is absent or its script fails`,async()=>{
        for(const javascript of [false,true]){
            const writes=[],{page,context,errors}=await setup(engine,'settings','light',{fixture:'d6-blocks-filled-light',url:'/blocked_channels',javascript,reply(entry){if(javascript&&entry.url.pathname==='/js/blocked-channels.js')return{status:404,body:''};if(entry.url.pathname==='/blocked_channels'&&entry.method==='POST'){writes.push(entry);return{contentType:'text/html',body:'<p id="block-native-result">Ordinary unblock received</p>'};}}});assert.equal(await page.locator('#blocked-search').isVisible(),false);assert.equal(await page.locator('[data-block-unblock]').count(),6);const id=await page.locator('[data-block-channel]').first().getAttribute('data-block-channel');await page.locator('[data-block-unblock] button').first().click();await page.locator('#block-native-result').waitFor();assert.equal(writes.length,1);assert.equal(writes[0].navigation,true);assert.equal(writes[0].body.get('ucid'),id);assert.equal(writes[0].body.get('action'),'unblock');assert.ok(writes[0].body.get('csrf_token'));assert.equal(writes[0].body.get('browser_profile'),blockedManagerConfig().profile);assert.equal(writes[0].url.searchParams.has('format'),false);assert.deepEqual(errors,[]);await context.close();
        }
        const guest=await setup(engine,'settings','light',{fixture:'overhaul-settings-light',url:'/preferences?section=appearance'});assert.equal(await guest.page.locator('.settings-nav a[href="/blocked_channels"]').count(),0);await guest.page.locator('#settings-search').fill('blocked');assert.equal(await guest.page.locator('#settings-search-results a[href^="/blocked_channels"]').count(),0);await guest.context.close();
    });
    test(`${engine}: D6 blocked manager distinguishes unavailable lists and rejects malformed or foreign canonical state`,async()=>{
        const server=blockedManagerServer(),recovered=await setup(engine,'settings','light',{fixture:'d6-blocks-unavailable-light',url:'/blocked_channels',reply:server.reply});assert.equal(await recovered.page.locator('#blocked-empty').isVisible(),false);assert.equal(await recovered.page.locator('#blocked-status').getAttribute('role'),'alert');await recovered.page.locator('#blocked-search').fill('Alpha');await recovered.page.locator('[data-block-check]').click();await recovered.page.waitForFunction(()=>document.querySelector('#blocked-status').textContent==='Saved blocked channels refreshed.');assert.equal(await recovered.page.locator('[data-block-channel]').count(),2);assert.equal(server.writes.length,0);await assertFocus(recovered.page,'[data-block-check]');assert.deepEqual(recovered.errors,[]);await recovered.context.close();
        for(const failure of ['preflight','malformed','profile']){
            const current=blockedManagerServer(),{page,context,errors}=await setup(engine,'settings','light',{fixture:'d6-blocks-filled-light',url:'/blocked_channels',reply(entry){if(entry.url.pathname==='/blocked_channels'&&entry.url.searchParams.get('format')==='json'){
                if(failure==='preflight')return{status:503,contentType:'application/json',body:'{}'};
                if(entry.method==='POST'){current.writes.push(Object.fromEntries(entry.body));return{contentType:'application/json',body:JSON.stringify({profile:failure==='profile'?'b'.repeat(64):current.config.profile,csrf:'token',channels:failure==='profile'?[]:[{authorId:12,author:'Bad'}]})};}
            }return current.reply(entry);}});await page.locator('[data-block-unblock] button').first().click();await page.waitForFunction(()=>document.querySelector('#blocked-channel-manager').getAttribute('aria-busy')==='false'&&document.querySelector('#blocked-status').textContent!=='Saving…');assert.equal(current.writes.length,failure==='preflight'?0:1);assert.equal(await page.locator('[data-block-channel]').count(),6);assert.equal(await page.locator('[data-block-unblock] button').first().isDisabled(),failure!=='preflight');assert.equal(await page.locator('#blocked-search').isDisabled(),failure==='profile');assert.notEqual(await page.locator('#blocked-status').textContent(),'Channel unblocked');assert.deepEqual(errors,[]);await context.close();
        }
    });
    test(`${engine}: D6 blocked manager Light/Dark/RTL error views fit desktop and keep truthful states`,async()=>{
        for(const kind of ['filled','empty','invalid','expired','stale','uncertain','unavailable'])for(const mode of ['light','dark']){
            const {page,context,errors}=await setup(engine,'settings',mode,{fixture:`d6-blocks-${kind}-${mode}`,url:'/blocked_channels',width:1280});assert.equal(await page.locator('.settings-nav [aria-current=page]').getAttribute('href'),'/blocked_channels');assert.equal(await page.locator('#blocked-channel-list channel').count(),0);assert.equal(await page.locator('[data-block-channel]').count(),['empty','unavailable'].includes(kind)?0:6);assert.equal(await page.locator('#blocked-channel-list').evaluate(list=>Array.from(list.children).every(row=>row.getAttribute('role')==='listitem')),true);assert.equal(await page.locator('#blocked-empty').isVisible(),kind==='empty');assert.equal(await page.locator('#blocked-status').getAttribute('role'),['filled','empty'].includes(kind)?'status':'alert');if(['stale','uncertain'].includes(kind))assert.equal(await page.locator('[data-block-unblock] button:enabled').count(),0);if(kind==='invalid')assert.match(await page.locator('[data-block-pending]').textContent(),/invalid<draft>&/);if(mode==='dark'){await page.evaluate(()=>document.documentElement.dir='rtl');await page.addStyleTag({content:'body{font-size:20px}.button,.settings-nav a{font-size:18px}.channel-rule-identity code{font-size:16px}'});}assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:path.join(artifacts,`${engine}-d6-blocks-${kind}-${mode}${mode==='dark'?'-rtl':''}.png`),fullPage:true});await page.emulateMedia({forcedColors:'active'});if(kind!=='stale'){await page.locator('#blocked-search').focus();assert.notEqual(await page.locator('#blocked-search').evaluate(e=>getComputedStyle(e).outlineStyle),'none');}assert.deepEqual(errors,[]);await context.close();
        }
    });
    test(`${engine}: D6 contextual blocking preserves retry/Undo and keeps personal library rows in place`,async()=>{
        for(const library of [false,true]){
            let fail=!library,blocked=false;const writes=[];
            const fixture=library?'d6-block-context-library':'d6-block-context-popular';
            const {page,context,errors}=await setup(engine,'browse','light',{fixture,url:library?'/feed/history':'/feed/popular',reply(entry){
                if(entry.url.searchParams.get('format')==='runtime')return{contentType:'application/json',body:JSON.stringify(runtimeOwner(fixtureHTML(blocked?'d6-block-context-filtered':fixture),generated))};
                if(entry.url.pathname==='/blocked_channels'&&entry.method==='POST'){
                    writes.push(Object.fromEntries(entry.body));if(fail)return{status:400,contentType:'application/json',body:JSON.stringify({error:'Block rejected'})};
                    blocked=entry.body.get('action')==='block';return{contentType:'application/json',body:JSON.stringify({blocked})};
                }
            }});
            const menu=page.locator('.video-context').first();await menu.locator('summary').click();await menu.locator('[data-video-action=block]').click();
            if(fail){await page.locator('#ui-notice .ui-retry').waitFor();assert.equal(await page.locator('.media-item:visible').count(),6);fail=false;await page.locator('#ui-notice .ui-retry').click();}
            await page.locator('#video-actions-undo').waitFor({state:'visible'});assert.equal(await page.locator('.media-item:visible').count(),library?6:0);
            assert.equal(writes.at(-1).browser_profile,await page.evaluate(()=>InvidiousStorage.scope));
            await page.screenshot({path:path.join(artifacts,`${engine}-d6-blocks-context-${library?'library':'discovery'}.png`)});
            await page.locator('#video-actions-undo').click();await page.waitForFunction(()=>document.querySelector('#video-actions-notice span').textContent===document.getElementById('video-actions-config').dataset.unblocked);
            assert.equal(await page.locator('.media-item:visible').count(),6);assert.deepEqual(writes.map(w=>w.action),library?['block','unblock']:['block','block','unblock']);assert.deepEqual(errors,[]);await context.close();
        }
    });
    test(`${engine}: D6 uncertain contextual block responses retain visible content until an explicit canonical reload`,async()=>{
        for(const failure of ['committed','malformed']){
            const writes=[];let attempted=false;const {page,context,errors}=await setup(engine,'browse','light',{fixture:'d6-block-context-popular',url:'/feed/popular',reply(entry){if(entry.url.pathname==='/blocked_channels'&&entry.method==='POST'){attempted=true;writes.push(entry);return{status:failure==='committed'?503:200,contentType:'application/json',body:'{}'};}if(attempted&&entry.navigation)return{contentType:'text/html',body:fs.readFileSync(path.join(generated,failure==='committed'?'d6-block-context-filtered.html':'d6-block-context-popular.html'),'utf8')};}});await page.locator('.video-context').first().locator('summary').click();await page.locator('.video-context').first().locator('[data-video-action=block]').click();await page.locator('#ui-notice .ui-retry').waitFor();assert.match(await page.locator('#ui-notice').textContent(),/could not be confirmed/);assert.equal(await page.locator('.media-item:visible').count(),6);assert.equal(await page.locator('[data-video-action=block]:enabled').count(),0);assert.equal(writes.length,1);await Promise.all([page.waitForEvent('domcontentloaded'),page.locator('#ui-notice .ui-retry').click()]);await page.waitForFunction(()=>document.body.dataset.uiInitialized==='true');assert.equal(writes.length,1);assert.equal(await page.locator('.media-item:visible').count(),failure==='committed'?0:6);assert.deepEqual(errors,[]);await context.close();
        }
    });
}

function identityEditorConfig(kind='configured') {
    return JSON.parse(fs.readFileSync(path.join(generated,`d6-identity-${kind}-light.html`),'utf8').match(/<script id="identity-editor-config"[^>]*>([^]*?)<\/script>/)[1]);
}
function identityEditorServer(kind='configured',options={}) {
    const config=identityEditorConfig(kind),state={...config.state,csrf:'identity-route-token'},writes=[];
    return {config,state,writes,reply(entry) {
        if(entry.method==='GET'&&entry.url.pathname==='/preferences/dearrow/identity'&&entry.url.searchParams.get('format')==='json')return options.read?.(entry,state)||{contentType:'application/json',body:JSON.stringify(state)};
        if(entry.method==='POST'&&entry.url.pathname==='/dearrow_identity') {
            writes.push(Object.fromEntries(entry.body));
            if(options.write)return options.write(entry,state,writes);
            state.configured=true;state.revision='b'.repeat(64);
            return {contentType:'application/json',body:JSON.stringify({imported:true,state})};
        }
    }};
}
async function identityDraft(page,text='n'.repeat(64)) {
    await page.locator('#identity-private-id').fill(text);
    if(await page.locator('[name=confirm_replace]').isVisible())await page.locator('[name=confirm_replace]').check();
}
for(const engine of engines) {
    test(`${engine}: D6 identity editor imports only explicit credentials and keeps private values out of page/storage metadata`,async()=>{
        for(const kind of ['new','configured']) {
            const server=identityEditorServer(kind),{page,context,requests,errors}=await setup(engine,'settings','light',{fixture:`d6-identity-${kind}-light`,url:'/preferences/dearrow/identity?field=private_id',reply:server.reply});
            await assertFocus(page,'#identity-private-id');assert.equal(await page.locator('#identity-private-id').inputValue(),'');assert.equal(await page.locator('.settings-nav [aria-current=page]').getAttribute('href'),'/preferences/dearrow/identity');assert.equal(await page.locator('.sidebar-settings').getAttribute('aria-current'),'page');assert.equal(await page.locator('#channel-spoiler-config').count(),0);assert.equal(await page.locator('#identity-form [type=submit]').isDisabled(),true);
            await identityDraft(page);assert.equal(server.writes.length,0);const privateReads=()=>requests.filter(r=>r.url.pathname==='/preferences/dearrow/identity').length,before=privateReads();assert.equal(await page.evaluate(()=>JSON.stringify({...localStorage,...sessionStorage}).includes('n'.repeat(64))),false);
            await page.locator('#identity-form [type=submit]').click();await page.waitForFunction(()=>document.querySelector('#identity-status').textContent===JSON.parse(document.getElementById('identity-editor-config').textContent).words.saved);
            assert.equal(server.writes.length,1);assert.equal(server.writes[0].private_id,'n'.repeat(64));assert.equal(server.writes[0].csrf_token,'identity-route-token');assert.equal(server.writes[0].identity_editor,'1');assert.equal(server.writes[0].revision,server.config.state.revision);assert.equal(server.writes[0].browser_profile,server.config.state.profile);assert.equal(server.writes[0].confirm_replace,kind==='configured'?'on':'');assert.equal(privateReads(),before+1);assert.equal(await page.locator('#identity-private-id').inputValue(),'');assert.equal(await page.locator('[name=confirm_replace]').isChecked(),false);await assertFocus(page,'#identity-status');
            const exposed=await page.evaluate(()=>({config:document.getElementById('identity-editor-config').textContent,storage:JSON.stringify({...localStorage,...sessionStorage}),url:location.href}));assert.ok(Object.values(exposed).every(text=>!text.includes('n'.repeat(64))&&!text.includes('FixturePrivateIdentity')));assert.equal(requests.filter(r=>/\/api\/v1\/dearrow|\/api\/v1\/videos/.test(r.url.pathname)).length,0);assert.deepEqual(errors,[]);await context.close();
        }
    });
    test(`${engine}: D6 identity editor preserves literal invalid and rejected drafts and discards explicitly`,async()=>{
        let reject=true;const server=identityEditorServer('configured',{write(entry,state){if(reject)return{status:403,contentType:'application/json',body:JSON.stringify({error:'Session expired'})};state.revision='c'.repeat(64);return{contentType:'application/json',body:JSON.stringify({imported:true,state})};}}),{page,context,errors}=await setup(engine,'settings','light',{fixture:'d6-identity-configured-light',url:'/preferences/dearrow/identity',reply:server.reply});
        const literal=' <invalid private>& draft ';await identityDraft(page,literal);await page.locator('#identity-form [type=submit]').click();assert.equal(server.writes.length,0);assert.equal(await page.locator('#identity-private-id').inputValue(),literal);assert.equal(await page.locator('#identity-status').textContent(),server.config.words.invalid);
        await identityDraft(page,' '+ 'n'.repeat(64)+' ');await page.locator('#identity-form [type=submit]').click();await page.waitForFunction(()=>document.querySelector('#dearrow-identity-editor').getAttribute('aria-busy')==='false');assert.equal(server.writes.length,1);assert.equal(await page.locator('#identity-private-id').inputValue(),' '+ 'n'.repeat(64)+' ');assert.equal(await page.locator('#identity-form [type=submit]').isEnabled(),true);assert.equal(await page.locator('#identity-status').textContent(),server.config.words.error);
        await page.locator('#identity-form [type=reset]').click();assert.equal(await page.locator('#identity-private-id').inputValue(),'');assert.equal(await page.locator('#identity-status').textContent(),server.config.words.discarded);assert.equal(server.writes.length,1);assert.deepEqual(errors,[]);await context.close();
    });
    test(`${engine}: D6 identity editor rejects changed revisions before dispatch and requires renewed replacement consent`,async()=>{
        let newer=true;const server=identityEditorServer('configured',{read(entry,state){if(newer){state.revision='c'.repeat(64);newer=false;}return null;}}),{page,context,errors}=await setup(engine,'settings','light',{fixture:'d6-identity-configured-light',url:'/preferences/dearrow/identity',reply:server.reply});await identityDraft(page);await page.locator('#identity-form [type=submit]').click();await page.waitForFunction(()=>document.querySelector('#identity-status').textContent===JSON.parse(document.getElementById('identity-editor-config').textContent).words.changed);assert.equal(server.writes.length,0);assert.equal(await page.locator('#identity-private-id').inputValue(),'n'.repeat(64));assert.equal(await page.locator('[name=confirm_replace]').isChecked(),false);assert.equal(await page.locator('#identity-form [type=submit]').isDisabled(),true);await page.locator('[name=confirm_replace]').check();await page.locator('#identity-form [type=submit]').click();await page.waitForFunction(()=>document.querySelector('#identity-private-id').value==='');assert.equal(server.writes.length,1);assert.equal(server.writes[0].revision,'c'.repeat(64));assert.deepEqual(errors,[]);await context.close();
    });
    test(`${engine}: D6 identity editor requires explicit status reconciliation after committed or unknown write outcomes`,async()=>{
        for(const committed of [false,true]) {
            let failRead=false;const server=identityEditorServer('configured',{read(entry,state){if(failRead)return{status:503,contentType:'application/json',body:'{}'};},write(entry,state){if(committed)state.revision='c'.repeat(64);return{status:503,contentType:'application/json',body:'{}'};}}),{page,context,errors}=await setup(engine,'settings','light',{fixture:'d6-identity-configured-light',url:'/preferences/dearrow/identity',reply:server.reply});await identityDraft(page);await page.locator('#identity-form [type=submit]').click();await page.waitForFunction(()=>document.querySelector('#identity-status').textContent===JSON.parse(document.getElementById('identity-editor-config').textContent).words.uncertain);assert.equal(await page.locator('#identity-form [type=submit]').isDisabled(),true);assert.equal(await page.locator('#identity-form [type=reset]').isVisible(),false);assert.equal(await page.locator('#identity-private-id').inputValue(),'n'.repeat(64));failRead=true;await page.locator('[data-identity-check]').click();await page.waitForFunction(()=>document.querySelector('#dearrow-identity-editor').getAttribute('aria-busy')==='false');assert.equal(await page.locator('[data-identity-keep]').isVisible(),false);assert.equal(await page.locator('#identity-private-id').inputValue(),'n'.repeat(64));failRead=false;await page.locator('[data-identity-check]').click();await page.locator('[data-identity-keep]').waitFor({state:'visible'});assert.equal(await page.locator('#identity-status').textContent(),server.config.words.review_saved);assert.equal(await page.locator('#identity-form [type=submit]').isDisabled(),true);assert.equal(server.writes.length,1);await page.locator('[data-identity-keep]').click();assert.equal(await page.locator('#identity-private-id').inputValue(),'');assert.equal(await page.locator('#identity-private-id').isEnabled(),true);assert.equal(server.writes.length,1);assert.deepEqual(errors,[]);await context.close();
        }
    });
    test(`${engine}: D6 identity editor ignores duplicate and late writes across cached, switched-profile and detached lifetimes`,async()=>{
        for(const boundary of ['cached','profile','removed']) {
            const server=identityEditorServer(),{page,context,errors}=await setup(engine,'settings','light',{fixture:'d6-identity-configured-light',url:'/preferences/dearrow/identity',reply:server.reply,init:()=>{const fetch=window.fetch.bind(window);window.identityWrites=[];window.fetch=(url,options={})=>{if(new URL(url,location.href).pathname==='/dearrow_identity'&&options.method==='POST'){const config=JSON.parse(document.getElementById('identity-editor-config').textContent);return new Promise(resolve=>identityWrites.push(()=>resolve(new Response(JSON.stringify({imported:true,state:{...config.state,revision:'b'.repeat(64)}}),{status:200,headers:{'Content-Type':'application/json'}}))));}return fetch(url,options);};}});
            await identityDraft(page);await page.locator('#identity-form [type=submit]').click();await page.waitForFunction(()=>identityWrites.length===1);await page.locator('#identity-form').evaluate(form=>form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));assert.equal(await page.evaluate(()=>identityWrites.length),1);
            await page.evaluate(boundary=>{window.oldIdentity=document.getElementById('dearrow-identity-editor');if(boundary==='cached'){dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}));dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));}else if(boundary==='profile')dispatchEvent(new Event('browserprofilechange'));else{oldIdentity.remove();document.dispatchEvent(new Event('iv:content-added'));}identityWrites[0]();},boundary);
            await page.waitForTimeout(40);assert.notEqual(await page.evaluate(()=>oldIdentity.querySelector('#identity-status').textContent),server.config.words.saved);assert.equal(await page.evaluate(()=>oldIdentity.querySelector('#identity-private-id').value),boundary==='cached'?'n'.repeat(64):'');assert.equal(await page.evaluate(()=>oldIdentity.querySelector('[type=submit]').disabled),true);if(boundary==='cached'){await page.locator('[data-identity-check]').click();await page.locator('[data-identity-keep]').waitFor({state:'visible'});}assert.deepEqual(errors,[]);await context.close();
        }
    });
    test(`${engine}: D6 identity ordinary forms retain route/profile/revision/confirmation when scripting is absent or unavailable`,async()=>{
        for(const javascript of [false,true]) {
            const writes=[],{page,context,errors}=await setup(engine,'settings','light',{fixture:'d6-identity-configured-light',url:'/preferences/dearrow/identity',javascript,reply(entry){if(javascript&&entry.url.pathname==='/js/dearrow-identity.js')return{status:404,body:''};if(entry.url.pathname==='/dearrow_identity'&&entry.method==='POST'){writes.push(entry);return{contentType:'text/html',body:'<p id="identity-ordinary-result">Import received</p>'};}}});await identityDraft(page);await page.locator('#identity-form [type=submit]').click();await page.locator('#identity-ordinary-result').waitFor();assert.equal(writes.length,1);assert.equal(writes[0].navigation,true);assert.equal(writes[0].body.get('private_id'),'n'.repeat(64));assert.equal(writes[0].body.get('identity_editor'),'1');assert.equal(writes[0].body.get('revision'),identityEditorConfig().state.revision);assert.equal(writes[0].body.get('browser_profile'),identityEditorConfig().state.profile);assert.equal(writes[0].body.get('confirm_replace'),'on');assert.equal(writes[0].url.searchParams.has('format'),false);assert.deepEqual(errors,[]);await context.close();
        }
    });
    test(`${engine}: D6 identity setup and unavailable states recover through read-only checks without false empty claims`,async()=>{
        for(const kind of ['setup','unavailable']) {
            const server=identityEditorServer(),{page,context,errors}=await setup(engine,'settings','light',{fixture:`d6-identity-${kind}-light`,url:'/preferences/dearrow/identity',reply:server.reply});assert.equal(await page.locator('#identity-private-id').isDisabled(),true);if(kind==='unavailable'){assert.equal(await page.locator('#identity-current').textContent(),'');assert.equal(await page.locator('#identity-status').getAttribute('role'),'alert');}await page.locator('[data-identity-check]').click();await page.waitForFunction(()=>document.querySelector('#identity-private-id').disabled===false);assert.equal(await page.locator('#identity-current').textContent(),server.config.words.configured);assert.equal(server.writes.length,0);assert.deepEqual(errors,[]);await context.close();
        }
    });
    test(`${engine}: D6 identity malformed reads and write receipts never clear credentials or claim success`,async()=>{
        for(const failure of ['read','receipt','profile']) {
            const server=identityEditorServer('configured',{read(entry,state){if(failure==='read')return{contentType:'application/json',body:JSON.stringify({...state,configured:'yes'})};},write(entry,state){return{contentType:'application/json',body:JSON.stringify(failure==='receipt'?{}:{imported:true,state:{...state,profile:'f'.repeat(64),revision:'c'.repeat(64)}})};}}),{page,context,errors}=await setup(engine,'settings','light',{fixture:'d6-identity-configured-light',url:'/preferences/dearrow/identity',reply:server.reply});await identityDraft(page);await page.locator('#identity-form [type=submit]').click();await page.waitForFunction(()=>document.querySelector('#dearrow-identity-editor').getAttribute('aria-busy')==='false');assert.equal(server.writes.length,failure==='read'?0:1);assert.notEqual(await page.locator('#identity-status').textContent(),server.config.words.saved);assert.equal(await page.locator('#identity-private-id').inputValue(),failure==='profile'?'':'n'.repeat(64));assert.equal(await page.locator('#identity-form [type=submit]').isDisabled(),failure!=='read');assert.deepEqual(errors,[]);await context.close();
        }
    });
    test(`${engine}: D6 identity Settings shortcuts and local search respect account ownership`,async()=>{
        const account=await setup(engine,'settings','light',{fixture:'d6-identity-configured-light',url:'/preferences/dearrow/identity'});await account.page.locator('#settings-search').fill('contribution identity');assert.equal(await account.page.locator('#settings-search-results a[href="/preferences/dearrow/identity?field=private_id"]').count(),1);assert.equal(account.requests.filter(r=>r.url.searchParams.get('format')==='json').length,0);await account.context.close();const guest=await setup(engine,'settings','light',{fixture:'overhaul-settings-light'});assert.equal(await guest.page.locator('.settings-nav a[href="/preferences/dearrow/identity"]').count(),0);await guest.page.locator('#settings-search').fill('contribution identity');assert.equal(await guest.page.locator('#settings-search-results a[href^="/preferences/dearrow/identity"]').count(),0);await guest.context.close();
    });
    test(`${engine}: D6 identity Light/Dark and enlarged RTL error/setup states fit desktop without credential disclosure`,async()=>{
        for(const mode of ['light','dark'])for(const kind of ['new','configured','setup','invalid','expired','stale','uncertain','unavailable']) {
            const {page,context,errors}=await setup(engine,'settings',mode,{fixture:`d6-identity-${kind}-${mode}`,url:'/preferences/dearrow/identity',width:1280});assert.equal(await page.locator('.settings-nav [aria-current=page]').getAttribute('href'),'/preferences/dearrow/identity');assert.equal(await page.locator('#identity-private-id').inputValue(),'');assert.equal(await page.locator('#identity-private-id').getAttribute('value'),null);assert.ok(!(await page.content()).includes('FixturePrivateIdentity'));if(mode==='dark'){await page.evaluate(()=>document.documentElement.dir='rtl');await page.addStyleTag({content:'body{font-size:20px}.button,.settings-nav a{font-size:18px}'});}assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);await page.screenshot({path:path.join(artifacts,`${engine}-d6-identity-${kind}-${mode}${mode==='dark'?'-rtl':''}.png`),fullPage:true});await page.emulateMedia({forcedColors:'active'});await page.locator('[data-identity-check]').focus();assert.notEqual(await page.locator('[data-identity-check]').evaluate(e=>getComputedStyle(e).outlineStyle),'none');assert.deepEqual(errors,[]);await context.close();
        }
    });
}

for(const engine of engines) {
    test(`${engine}: D6 identity cached preflight and status reads reject late metadata and leave no loading claim`,async()=>{
        for(const operation of ['import','check']) {
            const server=identityEditorServer(),{page,context,errors}=await setup(engine,'settings','light',{fixture:'d6-identity-configured-light',url:'/preferences/dearrow/identity',reply:server.reply,init:()=>{const fetch=window.fetch.bind(window);window.identityReads=[];window.fetch=(url,options={})=>{const target=new URL(url,location.href);if(target.pathname==='/preferences/dearrow/identity'&&target.searchParams.get('format')==='json'){const config=JSON.parse(document.getElementById('identity-editor-config').textContent);return new Promise(resolve=>identityReads.push(()=>resolve(new Response(JSON.stringify({...config.state,revision:'b'.repeat(64)}),{status:200,headers:{'Content-Type':'application/json'}}))));}return fetch(url,options);};}});
            await identityDraft(page);await page.locator(operation==='import'?'#identity-form [type=submit]':'[data-identity-check]').click();await page.waitForFunction(()=>identityReads.length===1);await page.evaluate(()=>{dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}));dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));identityReads[0]();});await page.waitForTimeout(40);assert.equal(await page.locator('#identity-private-id').inputValue(),'n'.repeat(64));assert.equal(await page.locator('[name=revision]').inputValue(),server.config.state.revision);assert.equal(await page.locator('#identity-private-id').isEnabled(),true);assert.equal(await page.locator('#identity-status').textContent(),server.config.words.load);assert.equal(server.writes.length,0);assert.deepEqual(errors,[]);await context.close();
        }
    });
}

function settingsEntryReply(entry,account=true,mode='light') {
    if(entry.url.pathname!=='/preferences'||entry.method!=='GET')return;
    const section=entry.url.searchParams.get('section'),retired=entry.url.searchParams.get('retired');
    const fixture=!section?`d6-settings-entry-${account?'account':'guest'}-${mode}`:retired?`d6-settings-retired-${retired}`:section==='chat'?'d6-chat-settings-account-light':'settings-'+section;
    return{contentType:'text/html',body:fs.readFileSync(path.join(generated,fixture+'.html'))};
}
function holdPreferenceMutation() {
    const fetch=window.fetch.bind(window);window.preferenceMutations=[];
    window.fetch=(url,options={})=>{
        const target=new URL(url,location.href);
        if(options.method==='POST'&&(target.pathname==='/preferences'||target.pathname.startsWith('/preferences/')))return new Promise(resolve=>preferenceMutations.push(()=>resolve(new Response('{}',{status:502,headers:{'Content-Type':'application/json'}}))));
        return fetch(url,options);
    };
}
async function sameProfileObserver(context) {
    const page=await context.newPage(),errors=[];page.setDefaultTimeout(10000);page.on('pageerror',error=>errors.push(error.message));await page.goto('https://invidious.test/preferences?section=appearance');await page.waitForFunction(()=>document.body.dataset.uiInitialized==='true');await page.evaluate(()=>{window.remoteChanges=[];document.addEventListener('iv:preferences-change',event=>{if(event.detail.remote)remoteChanges.push(event.detail);});});return{page,errors};
}
for(const engine of engines) {
    test(`${engine}: D6 cross-document invalidations clear same-profile previews with bounded metadata and no echo`,async()=>{
        const{page,context,requests,errors}=await setup(engine,'settings','light',{fixture:'settings-appearance',url:'/preferences?section=appearance'}),other=await sameProfileObserver(context);await seedBrowsePreview(page);await seedBrowsePreview(other.page);await page.evaluate(()=>{window.changeWire=[];window.changeTap=new BroadcastChannel('invidious:changes:v1:'+InvidiousStorage.scope);changeTap.onmessage=event=>changeWire.push(event.data);window.localChanges=[];document.addEventListener('iv:preferences-change',event=>localChanges.push(event.detail));InvidiousUI.invalidate('dearrow');});await other.page.waitForFunction(()=>remoteChanges.length===1);assert.equal(await other.page.evaluate(()=>InvidiousStorage.session.readStored('browse_state')),undefined);assert.deepEqual(await other.page.evaluate(()=>InvidiousUI.invalidationsSince(0)),['dearrow']);assert.equal(await page.evaluate(()=>localChanges.length),1);assert.equal(await other.page.evaluate(()=>remoteChanges[0].kind),'dearrow');await page.waitForFunction(()=>changeWire.length===1);assert.deepEqual(await page.evaluate(()=>Object.keys(changeWire[0]).sort()),['kind','profile','sender','serial','version']);assert.ok(!(await page.evaluate(()=>JSON.stringify(changeWire))).includes('fixture-token'));
        await other.page.addScriptTag({content:fs.readFileSync(path.join(root,'assets/js/ui.js'),'utf8')});await page.evaluate(()=>InvidiousUI.invalidate('blocks'));await other.page.waitForFunction(()=>remoteChanges.length===2);assert.deepEqual(await other.page.evaluate(()=>InvidiousUI.invalidationsSince(0)),['dearrow','blocks']);assert.equal(await other.page.evaluate(()=>InvidiousStorage.local.get('watch_layout')),'theater');assert.equal(requests.filter(r=>r.method==='POST'||r.url.searchParams.get('format')==='runtime').length,0);assert.deepEqual([...errors,...other.errors],[]);await context.close();
    });
    test(`${engine}: D6 cross-document invalidations reject foreign, malformed and disposed-profile signals`,async()=>{
        const{page,context,errors}=await setup(engine,'settings','light',{fixture:'settings-appearance',url:'/preferences?section=appearance'});await seedBrowsePreview(page);await page.evaluate(()=>{window.remoteChanges=[];document.addEventListener('iv:preferences-change',event=>{if(event.detail.remote)remoteChanges.push(event.detail);});window.signalChannel=new BroadcastChannel('invidious:changes:v1:'+InvidiousStorage.scope);window.otherChannel=new BroadcastChannel('invidious:changes:v1:another-profile');window.signalMessage={version:1,profile:InvidiousStorage.scope,kind:'preferences',sender:'other-document-123',serial:1};for(const patch of [{version:2},{profile:'b'.repeat(64)},{kind:'untrusted title'},{sender:'<invalid>'},{serial:0},{serial:1.5}])signalChannel.postMessage({...signalMessage,...patch});otherChannel.postMessage(signalMessage);});await page.evaluate(()=>new Promise(resolve=>setTimeout(resolve,40)));assert.equal(await page.evaluate(()=>remoteChanges.length),0);assert.equal((await page.evaluate(()=>InvidiousStorage.session.readStored('browse_state'))).views.length,1);await page.evaluate(()=>signalChannel.postMessage(signalMessage));await page.waitForFunction(()=>remoteChanges.length===1);await page.evaluate(()=>{dispatchEvent(new Event('browserprofilechange'));dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));signalChannel.postMessage({...signalMessage,serial:2,kind:'blocks'});InvidiousUI.invalidate('dearrow');});await page.evaluate(()=>new Promise(resolve=>setTimeout(resolve,40)));assert.equal(await page.evaluate(()=>remoteChanges.length),1);assert.deepEqual(await page.evaluate(()=>InvidiousUI.invalidationsSince(0)),['preferences']);assert.deepEqual(errors,[]);await context.close();
    });
    test(`${engine}: D6 cross-document channels close for cached pages and reconnect once on restoration`,async()=>{
        const{page,context,errors}=await setup(engine,'settings','light',{fixture:'settings-appearance',url:'/preferences?section=appearance'}),other=await sameProfileObserver(context);await seedBrowsePreview(other.page);await other.page.evaluate(()=>dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true})));await page.evaluate(()=>InvidiousUI.invalidate('preferences'));await other.page.evaluate(()=>new Promise(resolve=>setTimeout(resolve,40)));assert.equal(await other.page.evaluate(()=>remoteChanges.length),0);assert.equal((await other.page.evaluate(()=>InvidiousStorage.session.readStored('browse_state'))).views.length,1,'restoration still needs its canonical state check');await other.page.evaluate(()=>{dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));});await page.evaluate(()=>InvidiousUI.invalidate('blocks'));await other.page.waitForFunction(()=>remoteChanges.length===1);assert.equal(await other.page.evaluate(()=>InvidiousStorage.session.readStored('browse_state')),undefined);assert.deepEqual([...errors,...other.errors],[]);await context.close();
    });
    test(`${engine}: D6 cross-document channel denial preserves local invalidation and ordinary requests`,async()=>{
        const{page,context,requests,errors}=await setup(engine,'settings','light',{fixture:'settings-appearance',url:'/preferences?section=appearance',init:()=>{Object.defineProperty(window,'BroadcastChannel',{configurable:true,value:class{constructor(){throw new DOMException('Denied','SecurityError');}}});},reply:entry=>entry.url.pathname==='/preferences'&&entry.url.searchParams.get('format')==='runtime'?{contentType:'application/json',body:'{"checked":true}'}:null});await seedBrowsePreview(page);assert.equal(await page.evaluate(async()=>{InvidiousUI.invalidate('unknown kind');return(await InvidiousUI.request('/preferences?format=runtime')).checked;}),true);assert.equal(await page.evaluate(()=>InvidiousStorage.session.readStored('browse_state')),undefined);assert.deepEqual(await page.evaluate(()=>InvidiousUI.invalidationsSince(0)),['preferences']);assert.equal(await page.evaluate(()=>InvidiousStorage.local.get('watch_layout')),'theater');assert.equal(requests.filter(r=>r.method==='POST').length,0);assert.deepEqual(errors,[]);await context.close();
    });
}
async function seedBrowsePreview(page) {
    await page.evaluate(()=>{
        const value={views:[{id:'freshness-check',url:'/feed/popular',fingerprint:'a'.repeat(64),pages:[{url:'/feed/popular?page=2',method:'GET'}],scroll:240}]};
        if(!InvidiousStorage.session.set('browse_state',value))throw new Error('Test preview was not stored');
        InvidiousStorage.local.set('watch_layout','theater');
    });
}
for(const engine of engines) {
    test(`${engine}: D6 enhancement mutation dispatch invalidates browse previews before an unknown reply`,async()=>{
        for(const masking of [false,true]){
            const server=masking?maskingEditorServer():sbEditorServer(),root=masking?'#channel-spoilers':'#sponsorblock-channels',form=masking?'.spoiler-channel-form':'.sponsorblock-channel-form';
            const{page,context,errors}=await setup(engine,'settings','light',{fixture:masking?'spoiler-editor-account':'sponsorblock-channels',url:masking?'/preferences/spoilers/channels':'/preferences/sponsorblock/channels',init:holdPreferenceMutation,reply:server.reply});await seedBrowsePreview(page);if(masking)await page.locator('#spoiler-days').fill('21');else await page.locator('#mode_intro').selectOption('marker');await page.locator(form+' [value=save]').click();await page.waitForFunction(()=>preferenceMutations.length===1);assert.equal(await page.evaluate(()=>InvidiousStorage.session.readStored('browse_state')),undefined,'uncertain dispatch cannot retain stale Back previews');assert.equal(await page.evaluate(()=>InvidiousStorage.local.get('watch_layout')),'theater');await page.evaluate(()=>preferenceMutations[0]());await page.waitForFunction(root=>document.querySelector(root).getAttribute('aria-busy')==='false',root);assert.equal(await page.locator(form+' [value=save]').isDisabled(),true);assert.equal(await page.evaluate(()=>preferenceMutations.length),1);assert.deepEqual(errors,[]);await context.close();
        }
    });
    test(`${engine}: D6 canonical enhancement changes invalidate previews while an unchanged check preserves them`,async()=>{
        for(const masking of [false,true]){
            const server=masking?maskingEditorServer():sbEditorServer(),button=masking?'[data-mask-readback]':'[data-sb-readback]',root=masking?'#channel-spoilers':'#sponsorblock-channels';const{page,context,errors}=await setup(engine,'settings','light',{fixture:masking?'spoiler-editor-account':'sponsorblock-channels',url:masking?'/preferences/spoilers/channels':'/preferences/sponsorblock/channels',reply:server.reply});await seedBrowsePreview(page);await page.locator(button).click();await page.waitForFunction(root=>document.querySelector(root).getAttribute('aria-busy')==='false',root);assert.equal((await page.evaluate(()=>InvidiousStorage.session.readStored('browse_state'))).views.length,1,'unchanged canonical checks do not erase valid previews');const id=Object.keys(server.state)[0];if(masking)server.state[id].reveal_after_days=27;else server.state[id].modes.intro='marker';await page.locator(button).click();await page.waitForFunction(root=>document.querySelector(root).getAttribute('aria-busy')==='false',root);assert.equal(await page.evaluate(()=>InvidiousStorage.session.readStored('browse_state')),undefined);assert.equal(server.writes.length,0);assert.equal(await page.evaluate(()=>InvidiousStorage.local.get('watch_layout')),'theater');assert.deepEqual(errors,[]);await context.close();
        }
    });
    test(`${engine}: D6 saved and external guest enhancement rules clear previews without changing unrelated browser state`,async()=>{
        for(const masking of [false,true]){
            const key=masking?'channel_spoiler_settings':'sponsorblock_channel_overrides',form=masking?'.spoiler-channel-form':'.sponsorblock-channel-form';const{page,context,requests,errors}=await setup(engine,'settings','light',{fixture:masking?'spoiler-editor-guest':'sponsorblock-channels-guest-editor',url:masking?'/preferences/spoilers/channels':'/preferences/sponsorblock/channels'});await seedBrowsePreview(page);if(masking){await page.locator('#spoiler-hide-title').check();await page.locator('#spoiler-days').fill('7');}else await page.locator('#mode_intro').selectOption('marker');await page.locator(form+' [value=save]').click();await page.waitForFunction(masking=>document.querySelector(masking?'#spoiler-save-status':'#sponsorblock-save-status').textContent==='Saved',masking);assert.equal(await page.evaluate(()=>InvidiousStorage.session.readStored('browse_state')),undefined);await seedBrowsePreview(page);await page.evaluate(({key,masking})=>{const rules=InvidiousStorage.local.readStored(key),id=Object.keys(rules)[0];if(masking)rules[id].reveal_after_days=14;else rules[id].modes.intro='auto';InvidiousStorage.local.set(key,rules);dispatchEvent(new StorageEvent('storage',{key:InvidiousStorage.local.key(key),storageArea:localStorage}));},{key,masking});assert.equal(await page.evaluate(()=>InvidiousStorage.session.readStored('browse_state')),undefined);assert.equal(await page.evaluate(()=>InvidiousStorage.local.get('watch_layout')),'theater');assert.equal(requests.filter(r=>r.method==='POST').length,0);assert.deepEqual(errors,[]);await context.close();
        }
    });
    test(`${engine}: D6 default and explicit category unknown saves invalidate previews at dispatch and retain drafts`,async()=>{
        for(const defaultEntry of [false,true]){
            const{page,context,errors}=await setup(engine,'settings','light',{fixture:defaultEntry?'d6-settings-entry-account-light':'settings-appearance',url:defaultEntry?'/preferences':'/preferences?section=appearance',init:holdPreferenceMutation});await seedBrowsePreview(page);await page.locator('#setting-dark_mode').selectOption('dark');await page.locator('[data-category-form] [type=submit]').click();await page.waitForFunction(()=>preferenceMutations.length===1);assert.equal(await page.evaluate(()=>InvidiousStorage.session.readStored('browse_state')),undefined);await page.evaluate(()=>preferenceMutations[0]());await page.waitForFunction(()=>document.querySelector('[data-category-form]').getAttribute('aria-busy')!=='true');assert.equal(await page.locator('#setting-dark_mode').inputValue(),'dark');assert.equal(await page.evaluate(()=>preferenceMutations.length),1);assert.deepEqual(errors,[]);await context.close();
        }
    });
}
for(const engine of engines) {
    test(`${engine}: D6 Settings default entry is the real category for guests and accounts without retired or private controls`,async()=>{
        for(const account of [false,true])for(const mode of ['light','dark']){
            const{page,context,requests,errors}=await setup(engine,'settings',mode,{fixture:`d6-settings-entry-${account?'account':'guest'}-${mode}`,url:'/preferences?referer=%2Fwatch'});assert.equal(JSON.parse(await page.locator('#settings-config').textContent()).section,'appearance');assert.equal(await page.locator('form[data-category-form]').count(),1);assert.equal(await page.locator('.preferences-form,[name=ui_density],[name=thin_mode],[name=player_style],input[type=password]').count(),0);assert.equal(await page.locator('[data-settings-legacy-entry] a:visible').count(),0);assert.equal(await page.locator('#sidebar-toggle').count(),1);assert.equal(await page.locator('.settings-nav [aria-current=page]').getAttribute('href'),'/preferences?section=appearance');assert.equal(requests.filter(r=>r.method==='POST').length,0);assert.deepEqual(errors,[]);await context.close();
        }
    });
    test(`${engine}: D6 every historical Settings control has one safe bookmark destination`,async()=>{
        const{page,context,errors}=await setup(engine,'settings','light',{fixture:'d6-settings-entry-account-light',url:'/preferences'});
        const result=await page.evaluate(source=>{const ids=source,root=document.querySelector('[data-settings-legacy-entry]');if(ids.length!==77)throw new Error('Historical bookmark inventory is incomplete');return{missing:ids.filter(id=>!Array.from(root.children).some(link=>link.id===id)),unique:new Set(Array.from(document.querySelectorAll('[id]'),e=>e.id)).size===document.querySelectorAll('[id]').length,safe:Array.from(root.children).every(link=>{const url=new URL(link.href);return url.origin===location.origin&&['/preferences','/preferences/dearrow/identity','/preferences/spoilers/channels','/admin/settings'].includes(url.pathname)&&!url.hash&&Array.from(url.searchParams.keys()).every(key=>['section','field','retired'].includes(key));})};},JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures','legacy-settings-controls.json'),'utf8')).ids);assert.deepEqual(result,{missing:[],unique:true,safe:true});assert.deepEqual(errors,[]);await context.close();
    });
    test(`${engine}: D6 old category, field, array, AI and SponsorBlock bookmarks open and focus the owning editor`,async()=>{
        const cases=[['preferences-playback','playback'],['locale','language','locale'],['region','language','region'],['save_player_pos','library','save_player_pos'],['captions[1]','captions-comments','captions[1]'],['comments[1]','captions-comments','comments[1]'],['dearrow_enabled','dearrow','dearrow_enabled'],['preferences-ai-filter','ai-filter'],['ai_warnlist_search','ai-filter','ai_warnlist_search_action'],['sponsorblock_mode_intro','sponsorblock','sponsorblock_mode_intro'],['thin_mode','appearance',null,'layout'],['player_style','playback',null,'player']];
        for(const[anchor,section,field,retired]of cases){
            const{page,context,requests,errors}=await setup(engine,'settings','light',{fixture:'d6-settings-entry-account-light',url:'/preferences#'+encodeURIComponent(anchor),reply:e=>settingsEntryReply(e)});await page.waitForURL(url=>url.searchParams.get('section')===section);await page.locator('[data-category-form]').waitFor();assert.equal(JSON.parse(await page.locator('#settings-config').textContent()).section,section);assert.equal(new URL(page.url()).hash,'');assert.equal(await page.locator('[data-settings-legacy-entry]').count(),0);if(field){assert.equal(new URL(page.url()).searchParams.get('field'),field);assert.equal(await page.locator('[data-category-form]').evaluate((form,name)=>form.elements.namedItem(name)===document.activeElement,field),true,anchor+' focuses its exact control');}if(retired){assert.equal(new URL(page.url()).searchParams.get('retired'),retired);assert.equal(await page.locator('[data-settings-panel] [role=status]').filter({hasText:retired==='layout'?'replaced':'appearance'}).count(),1);assert.equal(await page.locator(`[name=${anchor}]`).count(),0);}assert.equal(requests.filter(r=>r.method==='POST').length,0);assert.deepEqual(errors,[]);await context.close();
        }
    });
    test(`${engine}: D6 old identity and channel-mask bookmarks use dedicated routes without echoing credentials`,async()=>{
        for(const anchor of ['dearrow-private-id','dearrow-identity-form','preferences-channel-spoilers']){
            const identity=anchor.startsWith('dearrow'),destination=identity?'/preferences/dearrow/identity':'/preferences/spoilers/channels';const{page,context,requests,errors}=await setup(engine,'settings','light',{fixture:'d6-settings-entry-account-light',url:'/preferences#'+anchor,reply(entry){if(entry.url.pathname===destination)return{contentType:'text/html',body:fs.readFileSync(path.join(generated,identity?'d6-identity-configured-light.html':'spoiler-editor-account.html'))};return settingsEntryReply(entry);}});await page.waitForURL(url=>url.pathname===destination);if(identity){assert.equal(await page.locator('#identity-private-id').inputValue(),'');await assertFocus(page,'#identity-private-id');assert.ok(!(await page.content()).includes('FixturePrivateIdentity'));}else assert.equal(await page.locator('#channel-spoilers').isVisible(),true);assert.equal(requests.filter(r=>r.method==='POST'&&r.url.pathname!=='/preferences/timezone').length,0,JSON.stringify(requests.filter(r=>r.method==='POST'&&r.url.pathname!=='/preferences/timezone').map(r=>[r.url.href,r.raw])));assert.deepEqual(errors,[]);await context.close();
        }
    });
    test(`${engine}: D6 old Settings anchors retain an ordinary visible link when scripts are absent or unavailable`,async()=>{
        for(const javascript of [false,true])for(const mode of ['light','dark']){
            const{page,context,requests,errors}=await setup(engine,'settings',mode,{fixture:`d6-settings-entry-account-${mode}`,javascript,url:'/preferences#preferences-ai-filter',width:1280,height:720,reply(entry){if(javascript&&entry.url.pathname==='/js/settings-navigation.js')return{status:404,body:''};return settingsEntryReply(entry,true,mode);}});assert.equal(await page.locator('[data-settings-legacy-entry] a:visible').count(),1);const link=page.locator('#preferences-ai-filter');assert.equal(await link.getAttribute('href'),'/preferences?section=ai-filter');assert.ok((await link.textContent()).includes('AI channel filter'));if(mode==='dark'){await page.evaluate(()=>{document.documentElement.dir='rtl';const style=document.createElement('style');style.textContent='body{font-size:20px}.button{font-size:18px}';document.head.append(style);});}await link.scrollIntoViewIfNeeded();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:path.join(artifacts,`${engine}-d6-settings-legacy-${javascript?'asset-failure':'nojs'}-${mode}.png`)});await link.click();await page.waitForURL(url=>url.searchParams.get('section')==='ai-filter');assert.equal(await page.locator('[name=ai_filter_enabled]').count(),1);assert.equal(requests.filter(r=>r.method==='POST').length,0);assert.deepEqual(errors,[]);await context.close();
        }
    });
    test(`${engine}: D6 unknown and malformed Settings anchors cannot navigate or replace an explicit category`,async()=>{
        const{page,context,requests,errors}=await setup(engine,'settings','light',{fixture:'d6-settings-entry-account-light',url:'/preferences',reply:e=>settingsEntryReply(e)});for(const hash of ['#settings-config','#%E0%A4%A','#//outside.invalid/path','#%3Cscript%3E','#unrecognized-setting']){await page.goto('https://invidious.test/preferences'+hash);assert.equal(new URL(page.url()).search,'');assert.equal(JSON.parse(await page.locator('#settings-config').textContent()).section,'appearance');}assert.equal(requests.filter(r=>r.navigation&&r.url.pathname==='/preferences').length,1);await page.locator('.settings-nav [data-settings-category=playback]').click();await page.waitForFunction(()=>new URL(location.href).searchParams.get('section')==='playback');assert.equal(await page.locator('[data-settings-legacy-entry]').count(),0);await page.goto('https://invidious.test/preferences?section=playback#preferences-ai-filter');assert.equal(new URL(page.url()).searchParams.get('section'),'playback');assert.equal(await page.locator('[data-settings-legacy-entry]').count(),0);assert.equal(requests.filter(r=>r.method==='POST').length,0);assert.deepEqual(errors,[]);await context.close();
    });
    test(`${engine}: D6 legacy hash navigation honors an unsaved draft and never saves it automatically`,async()=>{
        const{page,context,requests,errors}=await setup(engine,'settings','light',{fixture:'d6-settings-entry-account-light',url:'/preferences',reply:e=>settingsEntryReply(e)});await page.locator('#setting-dark_mode').selectOption('dark');await page.locator('h1').click();let type;const prompt=page.waitForEvent('dialog').then(async dialog=>{type=dialog.type();await dialog.dismiss();});await page.evaluate(()=>location.hash='preferences-ai-filter');await prompt;assert.equal(type,'beforeunload');assert.equal(await page.locator('#setting-dark_mode').inputValue(),'dark');assert.equal(new URL(page.url()).search,'');assert.equal(requests.filter(r=>r.method==='POST').length,0);await page.getByRole('button',{name:'Discard changes',exact:true}).click();await page.locator('#preferences-ai-filter').click();await page.waitForURL(url=>url.searchParams.get('section')==='ai-filter');assert.deepEqual(errors,[]);await context.close();
    });
    test(`${engine}: D6 legacy entry replacement preserves normal Back without an intermediate bookmark redirect`,async()=>{
        const{page,context,requests,errors}=await setup(engine,'browse','light',{reply:e=>settingsEntryReply(e)});await page.goto('https://invidious.test/preferences#dearrow_enabled');await page.waitForURL(url=>url.searchParams.get('section')==='dearrow');await page.goBack();await page.waitForURL('https://invidious.test/feed/popular');assert.equal(requests.filter(r=>r.method==='POST').length,0);assert.deepEqual(errors,[]);await context.close();
    });
    // Retired full-form projection/read-back checks are replaced by the D8
    // category cases below and tests/database/settings_entry_checks.cr.

}

for(const engine of engines) test(`${engine}: D8 repeated player setup preserves one media, controls and keyboard owner across cached return and disposal`,async()=>{
    const {page,context,requests,errors}=await setup(engine,'watch','light',{fixture:'d5-single-light',url:'/watch?v=2isYuQZMbdU'});
    await page.evaluate(async()=>{player.muted(true);await player.play();player.pause();player.currentTime(.3);player.playbackRate(1.25);player.volume(.4);window.firstPlayer=player;window.firstMedia=player.tech().el();window.firstStreams=InvidiousStreamMenus;});
    await page.waitForFunction(()=>player.currentTime()>=.25);
    const selectors=['video','.vjs-desktop-settings','.player-settings-panel','.chapter-markers','.player-stats','.dock-controls','.vjs-theater-control'];
    for(const selector of selectors)assert.equal(await page.locator(selector).count(),1,selector+' initially');
    const scripts=['player-stream-menu.js','player.js','player-chapters.js','player-stats.js','player-settings.js','player-mobile.js','player-ui.js','player-dock.js','themes.js','handlers.js','overhaul.js','ui.js'];
    const reads=()=>requests.filter(r=>r.url.pathname==='/latest_version').length,initialReads=reads();
    for(const script of scripts)await page.addScriptTag({url:'/js/'+script+'?duplicate=1'});
    for(const selector of selectors)assert.equal(await page.locator(selector).count(),1,selector+' after repeat');
    assert.equal(await page.evaluate(()=>player===firstPlayer&&player.tech().el()===firstMedia&&InvidiousStreamMenus===firstStreams&&player.paused()&&player.playbackRate()===1.25&&Math.abs(player.currentTime()-.3)<.1&&Math.abs(player.volume()-.4)<.01),true);
    assert.equal(reads(),initialReads,'duplicate setup reloaded media');
    const themeWrites=requests.filter(r=>r.url.pathname==='/toggle_theme'&&r.method==='POST').length;await page.locator('.header-account>summary').click();await page.locator('#toggle_theme').click();assert.equal(await page.locator('body').getAttribute('class'),'dark-theme');assert.equal(requests.filter(r=>r.url.pathname==='/toggle_theme'&&r.method==='POST').length,themeWrites+1);
    await page.evaluate(()=>document.activeElement.blur());await page.keyboard.press('k');await page.waitForFunction(()=>!player.paused());await page.keyboard.press('k');await page.waitForFunction(()=>player.paused());
    await page.evaluate(()=>{window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}));window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));});await page.waitForFunction(()=>InvidiousEnhancements.readState()==='ready');
    for(const script of scripts)await page.addScriptTag({url:'/js/'+script+'?duplicate=2'});
    for(const selector of selectors)assert.equal(await page.locator(selector).count(),1,selector+' after cached return');
    await page.locator('.vjs-desktop-settings').click();assert.equal(await page.locator('.player-settings-panel').isVisible(),true);await page.keyboard.press('Escape');
    await page.evaluate(()=>player.dispose());const retiredReads=reads();for(const script of scripts)await page.addScriptTag({url:'/js/'+script+'?duplicate=retired'});
    await page.keyboard.press('k');assert.equal(await page.evaluate(()=>player===firstPlayer&&player.isDisposed()),true);assert.equal(await page.locator('video').count(),0);assert.equal(reads(),retiredReads,'retired setup reloaded media');assert.deepEqual(errors,[]);await context.close();
});

for (const engine of engines) {
    test(`${engine}: D8 category canonical arrays, maps, nulls and future selections become the saved Discard baseline`, async () => {
        for (const section of ['captions-comments', 'browsing', 'sponsorblock', 'language']) {
            const initial = settingsConfig(section), values = structuredClone(initial.values), writes = [], reads = [];
            if (section === 'captions-comments') Object.assign(values, {captions:['id','',''], comments:['','youtube'], related_videos:false});
            if (section === 'browsing') Object.assign(values, {feed_menu:['Trending','History','Native future',''], show_original_title:false});
            if (section === 'sponsorblock') { values.sponsorblock_modes.intro = 'marker'; values.sponsorblock_colors.intro = '#123456'; }
            if (section === 'language') values.timezone = null;
            const canonical = {section, profile:initial.profile, values};
            const {page, context, errors} = await setup(engine, 'settings', 'light', {
                fixture:'settings-' + section, url:'/preferences?section=' + section,
                reply(entry) {
                    if (entry.url.pathname !== '/preferences') return;
                    if (entry.method === 'POST') { writes.push(entry); return {contentType:'application/json',body:JSON.stringify(canonical)}; }
                    if (entry.url.searchParams.get('format') === 'json') { reads.push(entry); return {contentType:'application/json',body:JSON.stringify(canonical)}; }
                }
            });
            const edit = async () => {
                if (section === 'captions-comments') await page.locator('#setting-related_videos').setChecked(true);
                if (section === 'browsing') await page.locator('#setting-show_original_title').setChecked(true);
                if (section === 'sponsorblock') await page.locator('#sponsorblock_mode_intro').selectOption('manual');
                if (section === 'language') await page.locator('#setting-timezone').fill('Asia/Jakarta');
            };
            // Toggle away from the actual initial state before the first save.
            if (section === 'captions-comments') await page.locator('#setting-related_videos').setChecked(!initial.values.related_videos);
            else if (section === 'browsing') await page.locator('#setting-show_original_title').setChecked(!initial.values.show_original_title);
            else if (section === 'sponsorblock') await page.locator('#sponsorblock_mode_intro').selectOption(initial.values.sponsorblock_modes.intro === 'manual' ? 'auto' : 'manual');
            else await edit();
            assert.equal(await page.locator('[data-category-form] [type=submit]').isEnabled(), true, section + ' must have an edited draft');
            await page.locator('[data-category-form] [type=submit]').click();
            await page.waitForFunction(() => document.querySelector('[data-category-status]').textContent === 'Saved');
            const assertCanonical = async () => {
                if (section === 'captions-comments') {
                    assert.equal(await page.locator('[name="captions[0]"]').inputValue(), 'id');
                    assert.equal(await page.locator('[name="comments[1]"]').inputValue(), 'youtube');
                    assert.equal(await page.locator('#setting-related_videos').isChecked(), false);
                }
                if (section === 'browsing') {
                    assert.equal(await page.locator('[name="feed_menu[2]"]').inputValue(), 'Native future');
                    assert.equal(await page.locator('#setting-show_original_title').isChecked(), false);
                }
                if (section === 'sponsorblock') {
                    assert.equal(await page.locator('#sponsorblock_mode_intro').inputValue(), 'marker');
                    assert.equal(await page.locator('#sponsorblock_color_intro').inputValue(), '#123456');
                }
                if (section === 'language') assert.equal(await page.locator('#setting-timezone').inputValue(), '');
                assert.equal(await page.locator('[data-category-form] [type=submit]').isDisabled(), true);
            };
            await assertCanonical(); await edit(); await page.locator('[data-category-form] [type=reset]').click(); await assertCanonical();
            assert.equal(writes.length, 1); assert.equal(reads.length, 1);
            assert.equal(writes[0].body.get('section'), section);
            assert.equal(writes[0].body.get('browser_profile'), initial.profile);
            assert.equal(writes[0].body.has('private_id'), false);
            assert.equal(writes[0].body.has('ui_density'), false);
            assert.deepEqual(errors, []); await context.close();
        }
    });
    test(`${engine}: D8 category malformed receipts and matching malformed read-backs retain the draft and never claim Saved`, async () => {
        const profile = settingsConfig('appearance').profile;
        for (const phase of ['receipt', 'read']) for (const failure of ['scalar', 'array', 'missing', 'wrong-type', 'foreign-profile', 'wrong-section']) {
            let writes = 0;
            const values = failure === 'scalar' ? true : failure === 'array' ? [] : failure === 'missing' ? {dark_mode:'dark'} : {dark_mode:'dark',show_nick:failure === 'wrong-type' ? 'false' : true};
            const malformed = {section:failure === 'wrong-section' ? 'playback' : 'appearance', profile:failure === 'foreign-profile' ? 'c'.repeat(64) : profile, values};
            const {page, context, errors} = await setup(engine, 'settings', 'light', {
                fixture:'settings-appearance', url:'/preferences?section=appearance',
                reply(entry) {
                    if (entry.url.pathname !== '/preferences') return;
                    if (entry.method === 'POST') { writes++; return {contentType:'application/json',body:JSON.stringify(phase === 'receipt' ? malformed : {section:'appearance',profile,values:{dark_mode:'dark',show_nick:true}})}; }
                    if (entry.url.searchParams.get('format') === 'json') return {contentType:'application/json',body:JSON.stringify(malformed)};
                }
            });
            await page.locator('#setting-dark_mode').selectOption('dark');
            await page.locator('[data-category-form] [type=submit]').click();
            await page.locator('[data-category-status] a').waitFor();
            assert.equal(await page.locator('#setting-dark_mode').inputValue(), 'dark', failure);
            assert.equal(await page.locator('[data-category-form] [type=submit]').isEnabled(), true, failure);
            assert.equal((await page.locator('[data-category-status]').textContent()).trim() === 'Saved', false, failure);
            assert.equal(writes, 1, failure + ' retried a write');
            assert.deepEqual(errors, []); await context.close();
        }
    });
}

for (const engine of engines) test(`${engine}: D8 category malformed canonical maps and array members cannot erase the current draft`, async () => {
    for (const failure of ['map-array','map-member','map-missing','array-member']) {
        const section = failure === 'array-member' ? 'captions-comments' : 'sponsorblock';
        const initial = settingsConfig(section), values = structuredClone(initial.values), writes = [];
        if (failure === 'map-array') values.sponsorblock_modes = [];
        if (failure === 'map-member') values.sponsorblock_modes.intro = false;
        if (failure === 'map-missing') delete values.sponsorblock_colors.intro;
        if (failure === 'array-member') values.captions = ['id', {label:'untrusted'}, ''];
        const {page, context, errors} = await setup(engine, 'settings', 'light', {
            fixture:'settings-' + section, url:'/preferences?section=' + section,
            reply(entry) {
                if (entry.url.pathname !== '/preferences') return;
                if (entry.method === 'POST') {
                    writes.push(entry);
                    return {contentType:'application/json',body:JSON.stringify({section,profile:initial.profile,values})};
                }
            }
        });
        const field = page.locator(failure === 'array-member' ? '#setting-related_videos' : '#setting-sponsorblock_enabled');
        const edited = !(await field.isChecked()); await field.setChecked(edited);
        await page.locator('[data-category-form] [type=submit]').click();
        await page.locator('[data-category-status] a').waitFor();
        assert.equal(await field.isChecked(), edited, failure);
        assert.equal(await page.locator('[data-category-form] [type=submit]').isEnabled(), true, failure);
        assert.equal(writes.length, 1); assert.deepEqual(errors, []); await context.close();
    }
});

for (const engine of engines) test(`${engine}: D8 sticky header, sidebar and focused skip link remain above scrolled media with and without JavaScript`, async () => {
    for (const javascript of [false, true]) for (const mode of ['light', 'dark']) {
        const {page, context, errors} = await setup(engine, 'browse', mode, {javascript, width:1280, height:600});
        for (const width of [1280,1920]) {
            await page.setViewportSize({width,height:600});
            const header = page.locator('.app-header');
            assert.equal(await header.evaluate(node => getComputedStyle(node).position), 'sticky');
            assert.notEqual(await header.evaluate(node => getComputedStyle(node).backgroundColor), 'rgba(0, 0, 0, 0)');
            await page.evaluate(() => scrollTo(0,400));
            await page.waitForFunction(() => scrollY > 100);
            const bar = await header.boundingBox(), sidebar = await page.locator('.app-sidebar').boundingBox();
            assert.ok(Math.abs(bar.y) <= 1); assert.ok(sidebar.y >= bar.y + bar.height - 1);
            assert.ok(sidebar.y + sidebar.height <= 601);
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
            const coversThumbnail = await page.locator('.media-item .thumbnail').first().evaluate(node => {
                const bar = document.querySelector('.app-header'), height = bar.getBoundingClientRect().height;
                scrollTo(0,node.getBoundingClientRect().top + scrollY - height + 24);
                const target = node.getBoundingClientRect(), header = bar.getBoundingClientRect();
                const x = target.left + target.width/2, y = header.bottom-12;
                return target.top < y && target.bottom > y && !!document.elementFromPoint(x,y)?.closest('.app-header');
            });
            assert.equal(coversThumbnail, true, 'Scrolled artwork must stay under the opaque header');
            await page.evaluate(() => { document.body.tabIndex=-1; document.body.focus({preventScroll:true}); document.body.removeAttribute('tabindex'); });
            await page.keyboard.press('Tab');
            assert.equal(await page.evaluate(() => document.activeElement.className), 'skip-link', `${javascript}/${mode}/${width}: first document Tab`);
            assert.equal(await page.locator('.skip-link').evaluate(node => {
                const box=node.getBoundingClientRect(); return document.elementFromPoint(box.left+box.width/2,box.top+box.height/2)===node;
            }), true, 'Focused skip link must remain above the header');
            await page.locator('.skip-link').press('Enter');
            await page.waitForFunction(() => location.hash === '#main-content');
            assert.equal(await page.locator('#main-content').evaluate(node => node===document.activeElement), true);
            await page.evaluate(() => { document.activeElement.blur(); history.replaceState(null,'',location.pathname); scrollTo(0,0); });
        }
        assert.deepEqual(errors, []); await context.close();
    }
});

for (const engine of engines) test(`${engine}: D8 Settings search finds descriptions and feature choices without reads or private playlist metadata`, async () => {
    const {page,context,requests,errors}=await setup(engine,'settings','light',{
        fixture:'settings-appearance',url:'/preferences?section=appearance',
        reply(entry){if(entry.method==='GET'&&entry.url.pathname==='/preferences'&&entry.url.searchParams.has('section'))return{contentType:'text/html',body:settingsFixture(entry.url.searchParams.get('section'))};}
    });
    const metadata=JSON.parse(await page.locator('#settings-navigation-config').textContent()).search;
    assert.ok(metadata.length>30);
    assert.ok(!JSON.stringify(metadata).includes('Fixture playlist'),'search metadata must not enumerate owned playlist titles');
    assert.ok(!JSON.stringify(metadata).includes('Reddit'),'retired comment sources must not appear in Settings search');
    const reads=()=>requests.filter(entry=>entry.url.pathname==='/preferences').length,before=reads();
    for (const [query,field] of [['if your choice is unavailable','preferred_audio'],['Stable Volume','preferred_audio'],['System','dark_mode'],['YouTube','comments']]) {
        await page.locator('#settings-search').fill(query);
        assert.ok(await page.locator('#settings-search-results [data-settings-field="'+field+'"]').count()>0,query+' finds its owning field');
        assert.equal(reads(),before,'typing searches local metadata only');
    }
    await page.locator('#settings-search-results [data-settings-field=comments]').click();
    await assertFocus(page,'#setting-comments-0');
    assert.equal(new URL(page.url()).searchParams.get('section'),'captions-comments');
    assert.equal(reads(),before+1,'only deliberate navigation reads a category');
    assert.equal(requests.filter(entry=>entry.method==='POST').length,0);
    assert.deepEqual(errors,[]);await context.close();
});

for (const engine of engines) {
    test(`${engine}: desktop menu cleanup retains collection actions and trims watch More`, async () => {
        for (const screen of ['browse', 'playlist']) {
            const {page, context, errors} = await setup(engine, screen);
            const menu = page.locator('.media-item .video-context').first();
            await menu.locator('summary').click();
            const labels = await menu.locator('.menu-content a,.menu-content button').allTextContents();
            for (const removed of ['Play video', 'Mark watched', 'Mark unwatched', 'View channel', 'Channel title and thumbnail settings', 'Watch on YouTube', 'Switch Invidious Instance']) assert.ok(!labels.includes(removed), removed);
            for (const retained of ['Add to playlist', 'Block channel', 'Audio mode']) assert.ok(labels.includes(retained), retained);
            if (screen === 'playlist') assert.ok(labels.includes('Remove selected'));
            assert.deepEqual(errors, []);
            await context.close();
        }
        const {page, context, errors} = await setup(engine, 'watch', 'dark', {fixture:'d5-single-dark', url:'/watch?v=2isYuQZMbdU'});
        await page.locator('.watch-actions>.ui-menu>summary').click();
        const menu = page.locator('.watch-actions .menu-content');
        assert.equal(await menu.locator('[data-video-action=block],[data-video-action=unblock],a[href^="/preferences/sponsorblock/channels"],a[href^="/preferences/spoilers/channels"],#link-yt-watch,#link-iv-other,#link-iv-embed,#annotations').count(), 0);
        assert.equal(await menu.locator('#link-yt-embed').textContent(), 'Embed');
        assert.equal(await menu.getByRole('button', {name:'Download', exact:true}).count(), 1);
        const avatar = page.locator('.creator .channel-avatar').first();
        assert.equal(await avatar.evaluate(el=>el.clientWidth===40&&el.clientHeight===40&&el.querySelector('img').getBoundingClientRect().width===40&&el.querySelector('img').getBoundingClientRect().height===40), true);
        await page.screenshot({path:path.join(artifacts,`${engine}-desktop-watch-menu.png`)});
        assert.deepEqual(errors, []);
        await context.close();
    });

    test(`${engine}: desktop channel menu blocks, unblocks and restores saved state`, async () => {
        let blocked = false;
        const writes = [];
        const {page, context, errors} = await setup(engine, 'browse', 'light', {fixture:'desktop-channel', url:'/channel/UC'+'a'.repeat(22), reply(entry) {
            if (entry.url.searchParams.get('format') === 'runtime') return {contentType:'application/json', body:JSON.stringify(runtimeOwner(fixtureHTML(blocked ? 'desktop-channel-blocked' : 'desktop-channel'), generated))};
            if (entry.url.pathname === '/blocked_channels' && entry.method === 'POST') {
                writes.push(entry.body);
                blocked = entry.body.get('action') === 'block';
                return {contentType:'application/json', body:JSON.stringify({blocked})};
            }
            if (entry.navigation) return {contentType:'text/html', body:fixtureHTML(blocked ? 'desktop-channel-blocked' : 'desktop-channel')};
        }});
        const menu = page.locator('.channel-controls .video-context');
        await menu.locator('summary').click();
        await menu.getByRole('button', {name:'Block channel', exact:true}).click();
        await page.locator('#video-actions-undo').waitFor({state:'visible'});
        assert.equal(writes[0].get('ucid'), 'UC'+'a'.repeat(22));
        assert.equal(writes[0].get('csrf_token'), 'fixture-token');
        assert.equal(writes[0].get('browser_profile'), await page.evaluate(()=>InvidiousStorage.scope));
        await page.reload();
        await menu.locator('summary').click();
        await menu.getByRole('button', {name:'Unblock channel', exact:true}).click();
        await page.waitForFunction(()=>document.querySelector('#video-actions-notice span').textContent===document.getElementById('video-actions-config').dataset.unblocked);
        await menu.locator('summary').click();
        await menu.getByRole('button', {name:'Block channel', exact:true}).click();
        await page.locator('#video-actions-undo').click();
        await page.waitForFunction(()=>document.querySelector('#video-actions-notice span').textContent===document.getElementById('video-actions-config').dataset.unblocked);
        assert.deepEqual(writes.map(body=>body.get('action')), ['block', 'unblock', 'block', 'unblock']);
        assert.deepEqual(errors, []);
        await context.close();
        const guest = await setup(engine, 'browse', 'light', {fixture:'channel-diary', url:'/channel/UCfixture'});
        await guest.page.locator('.channel-controls .ui-menu>summary').click();
        assert.equal(await guest.page.locator('.channel-controls').getByRole('link', {name:'Block channel', exact:true}).getAttribute('href'), '/login?referer=%2Fchannel%2FUCfixture');
        await guest.context.close();
    });

    test(`${engine}: desktop Admin is a role-aware Settings category with searchable form navigation`, async () => {
        const admin = await setup(engine, 'settings', 'light', {fixture:'preferences-admin', url:'/preferences', reply(entry) {
            if (entry.url.pathname === '/admin/settings') return {contentType:'text/html', body:fixtureHTML('admin-settings')};
        }});
        await admin.page.locator('#settings-search').fill('Admin');
        const result = admin.page.locator('#settings-search-results a[href^="/admin/settings"]');
        assert.equal(await result.count(), 1);
        await result.click();
        await admin.page.waitForURL('**/admin/settings?field=login_required');
        assert.equal(await admin.page.locator('.settings-nav [aria-current=page]').textContent(), 'Admin');
        assert.equal(await admin.page.locator('body').getAttribute('data-page'), 'settings');
        assert.equal(await admin.page.locator('.settings-category .admin-settings-form').count(), 1);
        await assertFocus(admin.page, '#login_required');
        assert.deepEqual(admin.errors, []);
        await admin.context.close();
        for (const fixture of ['preferences', 'preferences-signed-in']) {
            const ordinary = await setup(engine, 'settings', 'light', {fixture, url:'/preferences'});
            assert.equal(await ordinary.page.locator('.settings-nav a[href="/admin/settings"]').count(), 0);
            await ordinary.page.locator('#settings-search').fill('Admin');
            assert.equal(await ordinary.page.locator('#settings-search-results a[href^="/admin/settings"]').count(), 0);
            assert.deepEqual(ordinary.errors, []);
            await ordinary.context.close();
        }
    });

    test(`${engine}: desktop player settings widths transparency and caption appearance remain contained`, async () => {
        const views = [{mode:'light',width:1440,height:900},{mode:'dark',width:1280,height:720},{mode:'system',width:1920,height:1080},{mode:'dark',width:1280,height:720,rtl:true},{mode:'dark',width:1440,height:900,fullscreen:true},{mode:'light',width:1280,height:900,narrow:true}];
        for (const view of views) {
            const {page, context, errors} = await setup(engine, 'watch', view.mode, {fixture:`d5-dash-${view.mode==='system'?'light':view.mode}`, url:'/watch?v=2isYuQZMbdU', width:view.width, height:view.height, reply(entry) {
                if (entry.url.pathname === '/metadata.vtt') return {contentType:'text/vtt', body:'WEBVTT\n\n'};
                if (entry.url.pathname.startsWith('/api/v1/captions/')) return {contentType:'text/vtt', body:'WEBVTT\n\n00:00.000 --> 00:05.000\nFixture captions\n'};
            }});
            await page.evaluate(()=>{player.muted(true);player.play().catch(()=>{});});
            await page.waitForFunction(()=>player.currentTime()>.1&&player.qualityLevels().length===2&&player.audioTracks().length===3);
            await page.evaluate(()=>{player.pause();window.desktopMedia=player.tech().el();const metadata=player.addRemoteTextTrack({kind:'metadata',label:'segment-metadata',src:'/metadata.vtt'},false);metadata.track.mode='hidden';});
            if (view.mode === 'system') await page.evaluate(()=>setTheme(''));
            if (view.narrow) await page.addStyleTag({content:'.watch-grid>.watch-player{width:440px}'});
            if (view.rtl) {
                await page.evaluate(()=>document.documentElement.dir='rtl');
                await page.addStyleTag({content:'.player-settings-panel{font-size:18px}.player-settings-panel>header h2{font-size:20px}'});
            }
            if (view.fullscreen) {
                await page.locator('.vjs-fullscreen-control').click();
                await page.waitForFunction(()=>player.isFullscreen());
            }
            await page.locator('.vjs-desktop-settings').click();
            const panel = page.locator('.player-settings-panel');
            assert.equal(await panel.locator('[data-setting=enhancements]').count(), 0);
            for (const [name, target] of [['main',360],['quality',300],['audio',300],['speed',240],['captions',320],['appearance',600],['advanced',340]]) {
                if (name !== 'main') {
                    if (name === 'appearance') await panel.locator('[data-setting=captions]').click();
                    await panel.locator(`[data-setting=${name}]`).click();
                }
                assert.equal(await panel.getAttribute('data-view'), name);
                await page.locator('#player').screenshot({path:path.join(artifacts,`${engine}-desktop-settings-${view.mode}-${view.rtl?'rtl':view.fullscreen?'fullscreen':view.narrow?'narrow':view.width}-${name}.png`)});
                const geometry = await panel.evaluate(el=>{const box=el.getBoundingClientRect(),root=player.el().getBoundingClientRect();return {width:box.width,available:root.width-16,inside:box.left>=root.left&&box.right<=root.right+1&&box.top>=root.top&&box.bottom<=root.bottom,overflow:el.scrollWidth>el.clientWidth+1||el.querySelector('.player-settings-content').scrollWidth>el.querySelector('.player-settings-content').clientWidth+1,bg:getComputedStyle(el).backgroundColor,opacity:getComputedStyle(el).opacity};});
                assert.ok(geometry.inside, JSON.stringify({view,name,geometry}));
                assert.ok(!geometry.overflow, JSON.stringify({view,name,geometry}));
                assert.ok(Math.abs(geometry.width-Math.min(target,geometry.available))<1, JSON.stringify({view,name,geometry}));
                assert.match(geometry.bg, /0\.5/);
                assert.equal(geometry.opacity, '1');
                assert.equal(await panel.locator('header').evaluate(el=>getComputedStyle(el).backgroundColor), 'rgba(0, 0, 0, 0)');
                if (name === 'captions') {
                    assert.equal(await panel.locator('.player-settings-content>button').first().getAttribute('data-setting'), 'appearance');
                    assert.equal(await panel.locator('[data-setting^="retry-caption:"]').count(), 0);
                    assert.equal(await panel.getByRole('menuitemradio', {name:'Off',exact:true}).count(), 1);
                }
                if (name === 'advanced') assert.equal(await panel.locator('.player-settings-content use[href$="#chevron-right"]').count(), 0);
                if (name === 'appearance') {
                    const controls = await panel.locator('select').evaluateAll(controls=>controls.map(el=>({id:el.id,width:el.getBoundingClientRect().width,right:el.getBoundingClientRect().right,edge:el.closest('.player-settings-content').getBoundingClientRect().right})));
                    assert.ok(controls.every(el=>el.width>100&&el.right<=el.edge), JSON.stringify(controls));
                    await panel.getByRole('button', {name:'Done',exact:true}).scrollIntoViewIfNeeded();
                    assert.equal(await panel.locator('.vjs-default-button').isVisible(), true);
                    await page.locator('#player').screenshot({path:path.join(artifacts,`${engine}-desktop-settings-${view.mode}-${view.rtl?'rtl':view.fullscreen?'fullscreen':view.narrow?'narrow':view.width}-appearance-controls.png`)});
                }
                if (name !== 'main') {
                    await panel.getByRole('button', {name:'Back',exact:true}).click();
                    if (name === 'appearance') await panel.getByRole('button', {name:'Back',exact:true}).click();
                }
            }
            assert.equal(await page.evaluate(()=>player.tech().el()===desktopMedia&&player.paused()), true);
            assert.deepEqual(errors, []);
            await context.close();
        }
    });

    test(`${engine}: desktop Advanced annotations preserve the route and query context`, async () => {
        for (const enabled of [false, true]) {
            const {page, context, errors} = await setup(engine, 'watch', 'light', {fixture:'d5-single-light', url:'/watch?v=2isYuQZMbdU&list=PLfixture&index=2&iv_load_policy=1'});
            await page.evaluate(value=>video_data.params.annotations=value, enabled);
            await page.locator('.vjs-desktop-settings').click();
            await page.locator('[data-setting=advanced]').click();
            await page.getByRole('menuitem', {name:enabled?'Hide annotations':'Show annotations',exact:true}).click();
            await page.waitForURL(url=>url.searchParams.get('iv_load_policy')===(enabled?'3':'1'));
            const url = new URL(page.url());
            assert.equal(url.pathname, '/watch');
            assert.equal(url.searchParams.get('v'), '2isYuQZMbdU');
            assert.equal(url.searchParams.get('list'), 'PLfixture');
            assert.equal(url.searchParams.get('index'), '2');
            assert.equal(url.searchParams.getAll('iv_load_policy').length, 1);
            assert.deepEqual(errors, []);
            await context.close();
        }
    });
}
