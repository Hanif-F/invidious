'use strict';
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const playwright=require('playwright');
const root=path.resolve(__dirname,'../..'),generated=path.join(__dirname,'.generated'),artifacts=path.join(__dirname,'artifacts','d7-embed');
const engines=(process.env.FRONTEND_BROWSERS||'chromium,firefox').split(','),browsers={};
before(async()=>{fs.mkdirSync(artifacts,{recursive:true});for(const engine of engines)browsers[engine]=await playwright[engine].launch({headless:true});});
after(async()=>{for(const browser of Object.values(browsers))await browser.close();});
async function setup(engine,kind,variant='light',options={}) {
    const context=await browsers[engine].newContext({viewport:{width:1280,height:720},javaScriptEnabled:options.javascript!==false,colorScheme:variant==='light'?'light':'dark'});
    if(options.init)await context.addInitScript(options.init);
    const page=await context.newPage(),requests=[],errors=[],messages=[];page.on('console',message=>messages.push(message.text()));page.on('requestfailed',request=>messages.push({url:request.url(),failure:request.failure()}));page.setDefaultTimeout(12000);page.on('pageerror',error=>errors.push(error.message));
    const owner=kind==='login'?null:JSON.parse(fs.readFileSync(path.join(generated,`d7-embed-owner-${kind}-${variant}.json`)));
    await context.route('**/*',async route=>{
        const req=route.request(),url=new URL(req.url()),entry={url,method:req.method(),body:req.postData()||'',navigation:req.isNavigationRequest()};requests.push(entry);
        const custom=options.reply&&await options.reply(entry);if(custom)return route.fulfill(custom);
        if(req.isNavigationRequest()&&url.hostname==='container.test')return route.fulfill({contentType:'text/html',body:`<style>body{margin:0}iframe{border:0;width:100vw;height:100vh}</style><iframe src="https://invidious.test${(options.url||'/embed/2isYuQZMbdU').replaceAll('&','&amp;').replaceAll('"','&quot;')}"></iframe>`});
        if(req.isNavigationRequest())return route.fulfill({contentType:'text/html',path:path.join(generated,`d7-embed-${kind}-${variant}.html`)});
        if(/^\/(css|js|icons|videojs)\//.test(url.pathname)) {
            const file=path.join(root,'assets',url.pathname);if(!fs.existsSync(file))return route.fulfill({status:404});
            let body=fs.readFileSync(file);
            if(url.pathname==='/css/foundation.css'&&variant==='rtl')body=Buffer.from(body.toString()+'\nbody{font-size:20px}.button{font-size:18px}h1{font-size:30px}.player-settings-panel{font-size:20px}');
            return route.fulfill({contentType:url.pathname.endsWith('.js')?'application/javascript':url.pathname.endsWith('.css')?'text/css':url.pathname.endsWith('.svg')?'image/svg+xml':'application/octet-stream',body});
        }
        if(url.pathname==='/preferences'&&url.searchParams.get('format')==='runtime')return route.fulfill({json:owner});
        if(url.pathname==='/api/v1/stats')return route.fulfill({status:200,body:''});
        if(url.pathname==='/api/v1/verification')return route.fulfill({json:{required:false,expiresAt:null}});
        if(url.pathname.startsWith('/api/manifest/dash/'))return route.fulfill({contentType:'application/dash+xml',path:path.join(generated,'watch-media','manifest.mpd')});
        if(url.pathname.startsWith('/api/manifest/hls_variant/'))return route.fulfill({contentType:'application/x-mpegURL',path:path.join(generated,'watch-media','hls','manifest.m3u8')});
        if(url.pathname.startsWith('/d7-hls/'))return route.fulfill({contentType:'video/mp2t',path:path.join(generated,'watch-media','hls',path.basename(url.pathname))});
        if(url.pathname.startsWith('/d5-media/'))return route.fulfill({contentType:url.pathname.endsWith('.mpd')?'application/dash+xml':'video/mp4',path:path.join(generated,'watch-media',path.basename(url.pathname))});
        if(url.pathname==='/latest_version'&&['139','140'].includes(url.searchParams.get('itag')))return route.fulfill({contentType:'audio/mp4',path:path.join(generated,'watch-media','audio.m4a')});
        if(url.pathname==='/latest_version')return route.fulfill({contentType:'video/webm',headers:{'accept-ranges':'bytes'},path:path.join(generated,kind==='preview'?'clip-fixture.webm':kind==='portrait'?'watch-media/portrait.webm':'fixture.webm')});
        if(url.pathname.startsWith('/api/v1/captions/'))return route.fulfill({contentType:'text/vtt',body:'WEBVTT\n\n00:00.000 --> 00:08.000\nFixture caption\n'});
        if(url.pathname.startsWith('/api/v1/storyboards/'))return route.fulfill({contentType:'text/vtt',body:'WEBVTT\n\n00:00.000 --> 00:08.000\n/vi/board/mqdefault.jpg#xywh=0,0,90,50\n'});
        if(url.pathname.startsWith('/vi/'))return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><path fill="#34465a" d="M0 0h320v180H0z"/><circle fill="#8cabb7" cx="220" cy="60" r="30"/></svg>'});
        if(url.pathname.startsWith('/api/v1/playlists/'))return route.fulfill({json:{nextVideo:'nextvideo01',index:3,playlistHtml:''}});
        if(url.pathname.startsWith('/api/v1/mixes/'))return route.fulfill({json:{nextVideo:'nextvideo01',playlistHtml:''}});
        if(url.pathname.startsWith('/api/v1/dearrow/'))return route.fulfill({json:{title:'A replacement title'}});
        if(url.pathname.startsWith('/api/v1/sponsorblock/'))return route.fulfill({json:{segments:[]}});
        if(url.pathname==='/api/v1/auth/csrf')return route.fulfill({json:{csrfToken:'synthetic-csrf'}});
        return route.fulfill({json:{}});
    });
    await page.goto(options.frame?'https://container.test/host':'https://invidious.test'+(options.url||'/embed/2isYuQZMbdU'));
    const surface=options.frame?page.frames().find(frame=>frame.url().startsWith('https://invidious.test/')):page;
    if(options.javascript!==false&&kind!=='login'){await surface.waitForFunction(()=>window.InvidiousEmbed&&window.player&&player.isReady_);// Loading an already attached MSE source can reload a revoked blob URL.
        if(!['dash','live'].includes(kind))await surface.evaluate(()=>player.load());}
    return {context,page,surface,requests,errors,messages,owner};
}
for(const engine of engines) {
    test(`${engine}: D7 embeds use one full-size media surface in Light Dark RTL with ordinary no-JavaScript controls`,async()=>{
        for(const variant of ['light','dark','rtl'])for(const kind of ['single','audio','masked','preview','portrait','long','live','no-controls','login']) {
            const {context,page,requests,errors}=await setup(engine,kind,variant,{javascript:false});
            assert.equal(await page.locator('.app-header,.app-sidebar').count(),0);assert.equal(await page.locator('html').getAttribute('dir'),variant==='rtl'?'rtl':'ltr');
            if(kind!=='login'){assert.equal(await page.locator('video').count(),1);assert.equal(await page.locator('video').getAttribute('controls')!==null,kind!=='no-controls');assert.equal(await page.locator('body').getAttribute('data-page'),'embed');}
            for(const [width,height] of [[1280,720],[1440,900],[1920,1080],[640,360]]){await page.setViewportSize({width,height});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,kind+' horizontal overflow');if(kind!=='login')assert.equal(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight+1),true,kind+' vertical overflow');}
            assert.equal(await page.locator('img[src="x"]').count(),0);assert.ok(!requests.some(r=>/default\.css|diary|pure-min|ionicons|\/themes\//.test(r.url.pathname)));assert.ok(requests.every(r=>r.url.hostname==='invidious.test'));
            if(kind==='login'){assert.equal(await page.locator('script').count(),0);const login=new URL(await page.locator('main a[target="_blank"]').getAttribute('href'),'https://invidious.test');const target=new URL(login.searchParams.get('referer'),'https://invidious.test');assert.equal(target.pathname,'/watch');assert.equal(target.searchParams.get('occurrence'),'9223372036854775807');assert.equal(target.searchParams.get('start'),'1');assert.equal(target.searchParams.get('end'),'6');}
            if(kind==='long'){const track=page.locator('video track').first();assert.equal(await track.getAttribute('onload'),null);assert.equal(new URL(await track.getAttribute('src'),'https://invidious.test').searchParams.get('label'),await track.getAttribute('label'));}
            if(kind==='live'){const source=new URL(await page.locator('video source').getAttribute('src'),'https://invidious.test');assert.equal(source.searchParams.get('opaque'),'opaque+value=');assert.equal(source.searchParams.get('keep'),'1');assert.equal(source.searchParams.get('local'),'true');}
            assert.deepEqual(errors,[]);await context.close();
        }
    });
    test(`${engine}: D7 embedded Settings controls preserve real media, captions, speed and explicit watch access`,async()=>{
        const {context,page,requests,errors}=await setup(engine,'single','dark',{url:'/embed/2isYuQZMbdU?list=PLfixture&index=2&listen=false'});
        await page.evaluate(async()=>{player.muted(true);await player.play();player.pause();player.currentTime(.3);window.embedMedia=player.tech().el();});
        await page.locator('.vjs-desktop-settings').click();const panel=page.getByRole('dialog',{name:'Settings',exact:true});
        await panel.getByRole('menuitem',{name:/^Playback speed,/}).click();await panel.getByRole('menuitemradio',{name:'1.5×',exact:true}).click();
        await panel.getByRole('menuitem',{name:/^Captions,/}).click();await panel.getByRole('menuitemradio',{name:'English',exact:true}).click();await page.waitForFunction(()=>Array.from(player.textTracks()).some(t=>t.label==='English'&&t.mode==='showing'&&t.cues?.length));
        await panel.getByRole('menuitem',{name:'Advanced',exact:true}).click();assert.equal(await panel.getByRole('menuitemcheckbox').count(),0);
        await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>player.tech().el()===embedMedia&&player.paused()&&player.playbackRate()===1.5),true);
        assert.equal(await page.locator('.watch-on-invidious').evaluate(node=>node.tagName==='A'&&node.closest('button')===null&&node.target==='_blank'),true);
        await page.locator('.watch-on-invidious').evaluate(node=>node.addEventListener('click',event=>event.preventDefault(),{once:true}));await page.locator('.watch-on-invidious').click();
        const watch=new URL(await page.locator('.watch-on-invidious').getAttribute('href'),'https://invidious.test');assert.equal(watch.pathname,'/watch');assert.equal(watch.searchParams.get('list'),'PLfixture');assert.equal(watch.searchParams.get('index'),'2');assert.equal(watch.searchParams.get('speed'),'1.5');
        assert.equal(requests.filter(r=>r.method==='PATCH').length,0);assert.deepEqual(errors,[]);await page.screenshot({path:path.join(artifacts,`${engine}-settings-dark.png`)});await context.close();
    });
    test(`${engine}: D7 enhanced embed geometry, masking and keyboard Settings fit desktop and iframe sizes`,async()=>{
        for(const variant of ['light','dark','rtl'])for(const kind of ['single','masked','portrait']) {
            const {context,page,errors}=await setup(engine,kind,variant);await page.waitForFunction(()=>player.readyState()>=1);await page.evaluate(async()=>{player.muted(true);await player.play();player.pause();window.embedMedia=player.tech().el();player.userActive(true);});
            for(const [width,height] of [[1280,720],[1440,900],[1920,1080],[640,360]]) {
                await page.setViewportSize({width,height});await page.evaluate(()=>player.userActive(true));
                assert.equal(await page.evaluate(()=>{const rect=player.el().getBoundingClientRect();return Math.abs(rect.width-innerWidth)<=1&&Math.abs(rect.height-innerHeight)<=1;}),true);
                for(const selector of ['.vjs-play-control','.vjs-desktop-settings','.vjs-fullscreen-control','.watch-on-invidious'])assert.equal(await page.locator(selector).evaluate(node=>{const r=node.getBoundingClientRect();return r.width>=30&&r.height>=30&&r.left>=-1&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1;}),true,selector+' clipped');
                await page.locator('.vjs-desktop-settings').click();const panel=page.locator('.player-settings-panel');
                assert.equal(await panel.evaluate(node=>{const r=node.getBoundingClientRect();return r.left>=-1&&r.top>=-1&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1;}),true);
                await page.keyboard.press('Escape');assert.equal(await page.locator('.vjs-desktop-settings').evaluate(node=>node===document.activeElement),true);
            }
            if(kind==='masked'){assert.ok(!(await page.locator('body').innerText()).includes('A literal </script>'));assert.equal(await page.locator('meta[name=thumbnail]').getAttribute('content'),'');}
            assert.equal(await page.evaluate(()=>player.tech().el()===embedMedia&&!window.injected),true);assert.equal(await page.locator('video').count(),1);assert.deepEqual(errors,[]);
            if((kind==='single'&&variant==='light')||(kind==='masked'&&variant==='dark')||(kind==='single'&&variant==='rtl')||(kind==='portrait'&&variant==='light')) {
                await page.setViewportSize({width:1280,height:720});await page.evaluate(()=>player.userActive(true));if(variant==='rtl')await page.locator('.vjs-desktop-settings').click();
                await page.screenshot({path:path.join(artifacts,`${engine}-${kind}-${variant}.png`)});
            }
            if(kind==='single'&&variant==='light') {
                await page.emulateMedia({forcedColors:'active',reducedMotion:'reduce'});await page.locator('.vjs-desktop-settings').focus();await page.keyboard.press('Enter');
                assert.equal(await page.locator('.player-settings-panel').isVisible(),true);await page.keyboard.press('Escape');
                assert.equal(await page.locator('.vjs-desktop-settings').evaluate(node=>node===document.activeElement&&parseFloat(getComputedStyle(node).outlineWidth)>0),true);
                assert.equal(await page.locator('.vjs-control-bar').evaluate(node=>/^rgb\(/.test(getComputedStyle(node).backgroundColor)),true,'forced-color controls need an opaque background over arbitrary video');
                await page.screenshot({path:path.join(artifacts,`${engine}-forced-colors.png`)});
            }
            await context.close();
        }
    });
    test(`${engine}: D7 embedded DASH and audio choices retain the player and decoded source`,async()=>{
        for(const kind of ['dash','audio']) {
            const {context,page,errors,requests}=await setup(engine,kind,'light');await page.evaluate(()=>{player.muted(true);player.play().catch(()=>{});});
            if(kind==='dash')await page.waitForFunction(()=>player.currentTime()>.1&&player.qualityLevels().length===2&&player.audioTracks().length===3);
            else await page.waitForFunction(()=>player.currentTime()>.1&&player.readyState()>=2);
            await page.evaluate(()=>{player.pause();window.embedMedia=player.tech().el();});await page.locator('.vjs-desktop-settings').click();const panel=page.getByRole('dialog',{name:'Settings',exact:true});
            if(kind==='dash'){await panel.getByRole('menuitem',{name:/^Audio,/}).click();await panel.getByRole('menuitemradio',{name:/^Indonesian/}).click();await page.waitForFunction(()=>Array.from(player.audioTracks()).some(t=>t.language==='id'&&t.enabled));assert.ok(requests.some(r=>r.url.pathname.startsWith('/d5-media/chunk-stream')));}
            else {await panel.getByRole('menuitem',{name:/^Quality and codec,/}).click();assert.ok(await panel.getByRole('menuitemradio').count()>0);}
            assert.equal(await page.evaluate(()=>player.tech().el()===embedMedia&&player.paused()&&!player.error()),true);assert.deepEqual(errors,[]);await context.close();
        }
    });
    test(`${engine}: D7 embedded preview bounds and disabled controls keep their existing media contract`,async()=>{
        const preview=await setup(engine,'preview','light',{url:'/embed/2isYuQZMbdU?clip_preview=1&start=1&end=6'});await preview.page.evaluate(async()=>{player.muted(true);await player.play();player.pause();player.currentTime(0);player.trigger('seeked');});await preview.page.waitForFunction(()=>player.currentTime()>=.99);assert.equal(preview.requests.filter(r=>r.url.pathname==='/watch_ajax').length,0);assert.equal(preview.requests.filter(r=>r.url.pathname.startsWith('/api/v1/playlists')).length,0);assert.deepEqual(preview.errors,[]);await preview.context.close();
        const hidden=await setup(engine,'no-controls');assert.equal(await hidden.page.locator('.vjs-desktop-settings').count(),0);assert.equal(await hidden.page.evaluate(()=>player.controls()),false);assert.deepEqual(hidden.errors,[]);await hidden.context.close();
    });
    test(`${engine}: D7 embedded HLS decodes while preserving opaque manifest and segment query fields`,async()=>{
        const {context,page,requests,errors,messages}=await setup(engine,'live');await page.evaluate(()=>{player.muted(true);player.play().catch(()=>{});});await page.waitForFunction(()=>player.currentTime()>.1&&player.readyState()>=2).catch(async error=>{error.message+='; '+JSON.stringify(await page.evaluate(()=>({error:player.error(),source:player.currentSource(),state:player.readyState(),time:player.currentTime(),paused:player.paused(),network:player.networkState(),levels:player.qualityLevels().length,video:player.tech().el().videoWidth,url:location.href,tech:!!player.tech().vhs,vhs:player.tech().options_.vhs,native:player.tech().el().currentSrc,html:player.tech().el().outerHTML})))+'; console='+JSON.stringify(messages)+'; requests='+JSON.stringify(requests.filter(r=>r.url.pathname.startsWith('/api/manifest/')||r.url.pathname.startsWith('/d7-hls/')).map(r=>r.url.href));throw error;});await page.evaluate(()=>player.pause());
        await page.evaluate(()=>{window.embedMedia=player.tech().el();player.refreshBuffer();player.play().catch(()=>{});});
        await page.waitForFunction(()=>player.currentTime()>.1&&player.readyState()>=2&&!player.error());await page.evaluate(()=>player.pause());
        assert.equal(await page.evaluate(()=>player.tech().el()===embedMedia),true);
        const manifest=requests.find(r=>r.url.pathname.startsWith('/api/manifest/hls_variant/'));assert.equal(manifest.url.searchParams.get('opaque'),'opaque+value=');assert.equal(manifest.url.searchParams.get('keep'),'1');
        const segments=requests.filter(r=>r.url.pathname.startsWith('/d7-hls/'));assert.ok(segments.length>0);for(const request of segments){assert.equal(request.url.searchParams.get('opaque'),'segment+token=');assert.equal(request.url.searchParams.get('keep'),'1');assert.equal(request.url.searchParams.get('local'),'true');}
        assert.equal(requests.filter(r=>r.url.pathname.startsWith('/api/v1/sponsorblock/')).length,0);assert.deepEqual(errors,[]);await context.close();
    });
    test(`${engine}: D7 embedded cached return reads one canonical owner without replacing media`,async()=>{
        const {context,page,requests,errors}=await setup(engine,'single');await page.evaluate(async()=>{player.muted(true);await player.play();player.pause();window.embedMedia=player.tech().el();window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}));window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));});await page.waitForFunction(()=>InvidiousEnhancements.readState()==='ready');assert.equal(requests.filter(r=>r.url.pathname==='/preferences'&&r.url.searchParams.get('format')==='runtime').length,1);assert.equal(await page.evaluate(()=>player.tech().el()===embedMedia&&player.paused()),true);assert.deepEqual(errors,[]);await context.close();
    });
    test(`${engine}: D7 disposed real embedded player cannot issue a delayed speed write or react to keyboard/return`,async()=>{
        const {context,page,requests,errors}=await setup(engine,'masked');await page.evaluate(()=>{window.heldSpeed=[];const original=fetch;window.fetch=(url,options)=>String(url).includes('/api/v1/auth/csrf')?new Promise(resolve=>heldSpeed.push({resolve,signal:options.signal})):original(url,options);player.playbackRate(1.5);});await page.waitForFunction(()=>heldSpeed.length===1);await page.evaluate(()=>{player.dispose();heldSpeed[0].resolve(new Response(JSON.stringify({csrfToken:'late-speed-token'}),{headers:{'Content-Type':'application/json'}}));window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));window.dispatchEvent(new Event('online'));document.dispatchEvent(new Event('visibilitychange'));});await page.keyboard.press('k');assert.equal(await page.evaluate(()=>heldSpeed[0].signal.aborted),true);assert.equal(requests.filter(r=>r.method==='PATCH').length,0);assert.deepEqual(errors,[]);await context.close();
    });
    test(`${engine}: D7 private iframe expiry uses a local HEAD gate check and explicit login without a bot pass`,async()=>{
        let expired=false;
        const {context,page,surface,requests,errors}=await setup(engine,'private','dark',{frame:true,url:'/embed/2isYuQZMbdU?list=IVprivate&index=2&occurrence=9223372036854775807',reply:entry=>expired&&(entry.url.pathname==='/api/v1/stats'||entry.url.pathname==='/latest_version')?{status:401,headers:{'X-Invidious-Login-Required':'1'},json:{error:'login_required'}}:null});
        await surface.waitForFunction(()=>player.readyState()>=1);
        await surface.evaluate(()=>new Promise(resolve=>{player.one('seeked',resolve);player.currentTime(2.25);}));
        assert.equal(await surface.evaluate(()=>player.currentTime()>=2),true);expired=true;await surface.evaluate(()=>player.refreshBuffer());
        await surface.getByRole('link',{name:'Open this instance to sign in and watch',exact:true}).waitFor();assert.equal(await surface.evaluate(()=>player.isDisposed()),true);
        const login=new URL(await surface.locator('main a').getAttribute('href'),'https://invidious.test');assert.equal(login.pathname,'/login');const target=new URL(login.searchParams.get('referer'),'https://invidious.test');assert.equal(target.pathname,'/watch');assert.equal(target.searchParams.get('v'),'2isYuQZMbdU');assert.equal(target.searchParams.get('occurrence'),'9223372036854775807');assert.equal(target.searchParams.get('t'),'2');
        assert.equal(await surface.locator('main a').getAttribute('target'),'_blank');assert.equal(await surface.locator('meta[name=thumbnail]').count(),0);assert.equal(await surface.evaluate(()=>document.body.dataset.embedState),'blocked');
        const probes=requests.filter(r=>r.url.pathname==='/api/v1/stats');assert.equal(probes.length,1);assert.equal(probes[0].method,'HEAD');assert.equal(requests.filter(r=>r.url.pathname==='/api/v1/verification').length,0);assert.ok(!requests.some(r=>r.url.pathname.startsWith('/api/v1/videos/')||r.method==='POST'||r.method==='PATCH'));assert.deepEqual(errors,[]);
        await page.locator('iframe').screenshot({path:path.join(artifacts,`${engine}-private-expired-dark.png`)});await context.close();
    });
    test(`${engine}: D7 cached private iframe ignores late login probes and unrelated API authorization failures`,async()=>{
        const {context,surface,requests,errors}=await setup(engine,'private','light',{frame:true,init:()=>{
            const original=window.fetch;window.accessProbes=[];window.fetch=(url,options={})=>String(url).includes('/api/v1/stats')?new Promise(resolve=>accessProbes.push({resolve,signal:options.signal})):original(url,options);
        },reply:entry=>entry.url.pathname==='/permission-failure'?{status:401,json:{error:'invalid_scope'}}:null});
        await surface.evaluate(()=>{InvidiousVerification.check();window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}));window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));accessProbes[0].resolve(new Response('',{status:401,headers:{'X-Invidious-Login-Required':'1'}}));});
        await surface.waitForFunction(()=>InvidiousEnhancements.readState()==='ready');assert.equal(await surface.evaluate(()=>accessProbes.length),1);assert.equal(await surface.evaluate(()=>accessProbes[0].signal.aborted),true);assert.equal(await surface.evaluate(()=>player.isDisposed()),false);assert.equal(await surface.locator('main a[href^="/login"]').count(),0);
        await surface.evaluate(()=>{InvidiousVerification.check();accessProbes[1].resolve(new Response('',{status:200}));});await surface.waitForFunction(()=>accessProbes.length===2);await surface.evaluate(()=>fetch('/permission-failure'));assert.equal(await surface.evaluate(()=>player.isDisposed()),false);assert.equal(await surface.locator('main a[href^="/login"]').count(),0);
        assert.ok(!requests.some(r=>r.url.pathname.startsWith('/api/v1/videos/')||r.method==='POST'||r.method==='PATCH'));assert.deepEqual(errors,[]);await context.close();
    });
}
