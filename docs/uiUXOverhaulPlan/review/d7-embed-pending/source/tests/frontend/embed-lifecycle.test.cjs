'use strict';
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const playwright=require('playwright');
const engines=(process.env.FRONTEND_BROWSERS||'chromium,firefox').split(','),browsers={};
before(async()=>{for(const engine of engines)browsers[engine]=await playwright[engine].launch({headless:true});});
after(async()=>{for(const browser of Object.values(browsers))await browser.close();});
async function setup(engine,changes={}) {
    const context=await browsers[engine].newContext(),page=await context.newPage(),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    const data={id:'2isYuQZMbdU',plid:'IVfixture',index:2,video_series:null,clip:null,preferences:{locale:'en-US'},params:{listen:false,speed:1,local:true,autoplay:false,continue_autoplay:true,video_loop:false},...changes};
    let initial=true;
    await context.route('**/*',route=>{
        if(route.request().isNavigationRequest()) {
            if(!initial)return route.fulfill({contentType:'text/html',body:'<title>Advanced</title>'});initial=false;
            return route.fulfill({contentType:'text/html',body:`<div id="mock-player"></div><aside id="embed-status" hidden></aside><aside id="ui-notice" hidden><span role="status"></span></aside><script id="video_data" type="application/json">${JSON.stringify(data).replaceAll('<','\\u003c')}</script><script id="embed-config" type="application/json">{"queue_failed":"Continuation unavailable","queue_retry":"Retry continuation"}</script><script>
                window.calls=[];window.held=[];window.currentProfile=true;window.dead=false;window.handlers=new Map();
                window.player={isDisposed:()=>dead,el:()=>document.getElementById('mock-player'),on:(type,fn)=>{if(!handlers.has(type))handlers.set(type,new Set());handlers.get(type).add(fn);},off:(type,fn)=>{if(handlers.has(type))handlers.get(type).delete(fn);}};
                window.emit=type=>[...(handlers.get(type)||[])].forEach(fn=>fn());
                window.InvidiousStorage={isCurrent:()=>currentProfile};window.InvidiousUI={request:(url,options)=>{calls.push(url);return new Promise((resolve,reject)=>held.push({resolve,reject,signal:options.signal}));}};
            </script><script src="/js/embed.js"></script>`});
        }
        return new URL(route.request().url()).pathname==='/js/embed.js'?route.fulfill({path:path.resolve(__dirname,'../../assets/js/embed.js')}):route.fulfill({status:404});
    });
    await page.goto('https://invidious.test/embed/2isYuQZMbdU');
    return {context,page,errors};
}
for(const engine of engines) {
    test(`${engine}: D7 embed has one next-read owner and preserves exact cursors/current playback choices`,async()=>{
        const {context,page,errors}=await setup(engine);assert.equal(await page.evaluate(()=>calls.length),1);
        await page.addScriptTag({path:path.resolve(__dirname,'../../assets/js/embed.js')});assert.equal(await page.evaluate(()=>calls.length),1);
        const request=new URL(await page.evaluate(()=>calls[0]),'https://invidious.test');assert.equal(request.pathname,'/api/v1/playlists/IVfixture');assert.equal(request.searchParams.get('index'),'2');
        await page.evaluate(()=>held[0].resolve({nextVideo:'nextvideo01',index:'9223372036854775807'}));await page.waitForFunction(()=>handlers.get('ended')?.size===1);
        await page.evaluate(()=>{window.playerChoiceBefore=1;emit('ended');});await page.waitForFunction(()=>document.title==='Advanced');
        const next=new URL(page.url());assert.equal(next.pathname,'/embed/nextvideo01');assert.equal(next.searchParams.get('index'),'9223372036854775807');assert.equal(next.searchParams.get('list'),'IVfixture');assert.equal(next.searchParams.get('autoplay'),'1');assert.equal(next.searchParams.get('listen'),'false');assert.equal(next.searchParams.get('speed'),'1');assert.equal(next.searchParams.get('local'),'true');assert.deepEqual(errors,[]);await context.close();
    });
    test(`${engine}: D7 embed cached return retires late next results and waits for canonical managed owner`,async()=>{
        const {context,page,errors}=await setup(engine);await page.evaluate(()=>{InvidiousEmbed.setManaged();window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}));window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));held[0].resolve({nextVideo:'abcdefghijk',index:3});emit('ended');});
        assert.equal(await page.evaluate(()=>held[0].signal.aborted),true);assert.equal(await page.evaluate(()=>calls.length),1);assert.equal(await page.evaluate(()=>handlers.get('ended')?.size||0),0);assert.ok(page.url().endsWith('/embed/2isYuQZMbdU'));
        await page.evaluate(()=>InvidiousEmbed.apply());assert.equal(await page.evaluate(()=>calls.length),2);await page.evaluate(()=>held[1].resolve({nextVideo:'nextvideo01',index:4}));await page.waitForFunction(()=>handlers.get('ended')?.size===1);
        await page.evaluate(()=>{window.currentProfile=false;window.dispatchEvent(new Event('browserprofilechange'));emit('ended');});assert.equal(await page.evaluate(()=>handlers.get('ended')?.size||0),0);assert.equal(await page.evaluate(()=>InvidiousEmbed.apply()),false);assert.deepEqual(errors,[]);await context.close();
    });
    test(`${engine}: D7 embed failed/malformed next reads expose explicit Retry without automatic replay`,async()=>{
        for(const result of [{},null,[],{nextVideo:'https://outside.test/private',index:2},{nextVideo:'nextvideo01',index:'9223372036854775808'},{nextVideo:'nextvideo01',index:9007199254740992}]) {
            const {context,page,errors}=await setup(engine);await page.evaluate(value=>held[0].resolve(value),result);await page.getByRole('button',{name:'Retry continuation',exact:true}).waitFor();assert.equal(await page.evaluate(()=>calls.length),1);assert.equal(await page.evaluate(()=>handlers.get('ended')?.size||0),0);
            await page.getByRole('button',{name:'Retry continuation',exact:true}).click();assert.equal(await page.evaluate(()=>calls.length),2);await page.evaluate(()=>held[1].resolve({nextVideo:null,index:null}));await page.waitForFunction(()=>document.getElementById('embed-status').hidden);assert.equal(await page.evaluate(()=>handlers.get('ended')?.size||0),0);assert.deepEqual(errors,[]);await context.close();
        }
    });
    test(`${engine}: D7 embed series retains duplicates and player disposal blocks late navigation`,async()=>{
        const series=await setup(engine,{plid:null,video_series:['2isYuQZMbdU','2isYuQZMbdU','nextvideo01']});assert.equal(await series.page.evaluate(()=>calls.length),0);await series.page.evaluate(()=>emit('ended'));await series.page.waitForFunction(()=>document.title==='Advanced');assert.equal(new URL(series.page.url()).searchParams.get('playlist'),'2isYuQZMbdU,nextvideo01');await series.context.close();
        const disposed=await setup(engine);await disposed.page.evaluate(()=>{dead=true;emit('dispose');held[0].resolve({nextVideo:'nextvideo01',index:3});emit('ended');});assert.equal(await disposed.page.evaluate(()=>held[0].signal.aborted),true);assert.equal(await disposed.page.evaluate(()=>handlers.get('ended')?.size||0),0);assert.deepEqual(disposed.errors,[]);await disposed.context.close();
        for(const changes of [{clip:{startTime:1,endTime:6}},{params:{video_loop:true}}]){const result=await setup(engine,changes);assert.equal(await result.page.evaluate(()=>calls.length),0);assert.equal(await result.page.evaluate(()=>handlers.get('ended')?.size||0),0);await result.context.close();}
    });
}
