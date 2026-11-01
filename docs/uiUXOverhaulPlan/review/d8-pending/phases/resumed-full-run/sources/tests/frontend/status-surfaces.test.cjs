'use strict';
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const playwright=require('playwright');
const root=path.resolve(__dirname,'../..');
const generated=path.join(__dirname,'.generated');
const artifacts=path.join(__dirname,'artifacts','d7-status');
const engines=(process.env.FRONTEND_BROWSERS||'chromium,firefox').split(',');
const browsers={};
before(async()=>{fs.mkdirSync(artifacts,{recursive:true});for(const engine of engines)browsers[engine]=await playwright[engine].launch({headless:true});});
after(async()=>{for(const browser of Object.values(browsers))await browser.close();});
async function setup(engine,screen,variant='light',options={}) {
    const context=await browsers[engine].newContext({viewport:{width:1440,height:900},colorScheme:variant==='light'?'light':'dark',javaScriptEnabled:options.javascript!==false});
    const page=await context.newPage(),requests=[],errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await context.route('**/*',async route=>{
        const request=route.request(),url=new URL(request.url());
        requests.push({url,method:request.method()});
        if(request.isNavigationRequest())return route.fulfill({contentType:'text/html',path:path.join(generated,options.fixture||`d7-status-${screen}-${variant}.html`)});
        const file=path.join(root,'assets',url.pathname);
        if(url.pathname==='/css/foundation.css'&&variant==='rtl')return route.fulfill({contentType:'text/css',body:fs.readFileSync(file,'utf8')+'\nbody{font-size:20px}.button,.muted{font-size:18px}h1{font-size:30px}h2{font-size:25px}.brand{font-size:25px}'});
        return fs.existsSync(file)?route.fulfill({path:file}):route.fulfill({status:404,body:''});
    });
    await page.goto('https://invidious.test'+(options.url||`/${screen==='privacy'||screen==='licenses'?screen:'watch?v=abcdefghijk'}`));
    return {context,page,requests,errors};
}
for(const engine of engines) {
    test(`${engine}: D7 reading and error Light Dark enlarged RTL layouts work without JavaScript`,async()=>{
        for(const variant of ['light','dark','rtl'])for(const screen of ['privacy','licenses','message','unexpected','post','search','embed','known','unavailable','not-found']) {
            const {context,page,requests,errors}=await setup(engine,screen,variant,{javascript:false});
            assert.equal(await page.locator('html').getAttribute('dir'),variant==='rtl'?'rtl':'ltr');
            assert.equal(await page.locator('body').getAttribute('class'),(variant==='light'?'light':'dark')+'-theme');
            assert.equal(await page.locator('main h1').count(),1);
            assert.equal(await page.locator('.app-sidebar').count(),['embed','unavailable'].includes(screen)?0:1);
            for(const width of [1280,1440,1920]){await page.setViewportSize({width,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,screen+' overflow');}
            assert.ok(requests.every(r=>r.url.hostname==='invidious.test'));
            assert.ok(!requests.some(r=>/pure-min|ionicons|diary|enhancements|dearrow|\/sse|\/subscriptions|timezone|player\.js/.test(r.url.pathname)));
            assert.equal(requests.filter(r=>r.method!=='GET').length,0);assert.deepEqual(errors,[]);
            if(screen==='privacy'){assert.equal(await page.locator('article').getAttribute('lang'),'en-US');assert.equal(await page.locator('article').getAttribute('dir'),'ltr');assert.match(await page.locator('article').innerText(),/Logging out changes the active profile but preserves locally stored profiles/);}
            if(screen==='known'){assert.equal(await page.locator('.error-reason').innerText(),'Unavailable <img src=x onerror="window.injected=true"> & "quoted"');assert.equal(await page.locator('main img').count(),0);assert.equal(await page.locator('.error-details').count(),0);}
            if(screen==='unavailable'){assert.equal(await page.locator('.error-reason').innerText(),'This video is unavailable.');assert.equal(await page.locator('.error-details').count(),0);}
            if(screen==='embed'){assert.equal(await page.locator('script').count(),0);assert.equal(await page.locator('main nav a[target="_blank"]').count(),2);}
            if(screen==='message'){assert.equal(await page.locator('main nav').count(),0);assert.equal(await page.locator('main section>p').innerText(),variant==='rtl'?'تم تعطيل الخلاصة الشائعة من قبل المسؤول.':'The Popular feed has been disabled by the administrator.');}
            if((screen==='privacy'&&variant==='light')||(screen==='licenses'&&variant==='dark')||(screen==='unexpected'&&variant==='dark')||(screen==='post'&&variant==='light')||(screen==='embed'&&variant==='rtl'))await page.screenshot({path:path.join(artifacts,`${engine}-${screen}-${variant}.png`),fullPage:true});
            if((screen==='privacy'&&variant==='light')||(screen==='licenses'&&variant==='dark')){await page.setViewportSize({width:1280,height:900});await page.screenshot({path:path.join(artifacts,`${engine}-${screen}-${variant}-viewport.png`)});}
            await context.close();
        }
    });
    test(`${engine}: D7 unexpected errors keep secrets out of HTML, actions and public reports`,async()=>{
        for(const screen of ['unexpected','post','search','unknown']) {
            const {context,page,requests,errors}=await setup(engine,screen);
            assert.ok(!(await page.content()).includes('private-'));
            assert.equal(await page.locator('body').getAttribute('data-page'),'reading');
            assert.equal(await page.locator('#player,.listing,.results-grid').count(),0);
            const details=page.locator('.error-details');assert.equal(await details.getAttribute('open'),null);
            await details.locator('summary').focus();await page.keyboard.press('Enter');assert.equal(await details.getAttribute('open'),'');
            assert.match(await details.locator('pre').innerText(),/Error type: Exception/);assert.ok(!(await details.locator('pre').innerText()).includes('Backtrace'));
            for(const href of await details.locator('a').evaluateAll(nodes=>nodes.map(node=>node.href))){const url=new URL(href);assert.equal(url.hostname,'github.com');assert.ok(!url.href.includes('private-'));}
            assert.ok(!requests.some(r=>r.url.pathname.startsWith('/api/')||r.method==='POST'));assert.deepEqual(errors,[]);await context.close();
        }
    });
    test(`${engine}: D7 failed writes offer deliberate safe navigation and never replay on cached return`,async()=>{
        for(const [screen,target] of [['post','/feed/playlists'],['search','/search']]) {
            const {context,page,requests,errors}=await setup(engine,screen);
            assert.equal(await page.locator('main form').count(),0);assert.equal(await page.getByRole('link',{name:'Try again',exact:true}).count(),0);
            assert.match(await page.locator('main .form-feedback').innerText(),/does not automatically repeat/);
            await page.evaluate(()=>{window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}));window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));});
            assert.equal(requests.filter(r=>r.method==='POST').length,0);
            await page.locator(`main nav a[href="${target}"]`).click();await page.waitForURL('**'+target);
            assert.equal(requests.at(-1).method,'GET');assert.deepEqual(errors,[]);await context.close();
        }
        const {context,page}=await setup(engine,'unexpected');assert.equal(await page.getByRole('link',{name:'Try again',exact:true}).getAttribute('href'),'/watch?v=abcdefghijk');
        assert.equal(await page.locator('main nav a[href^="/redirect?"]').getAttribute('href'),'/redirect?referer=%2Fwatch%3Fv%3Dabcdefghijk');
        assert.equal(await page.locator('main nav a[href^="https://www.youtube.com"]').getAttribute('href'),'https://www.youtube.com/watch?v=abcdefghijk');await context.close();
    });
    test(`${engine}: D7 licenses preserve all three machine-readable links and local script coverage`,async()=>{
        const {context,page,requests}=await setup(engine,'licenses');
        const rows=await page.locator('#jslicense-labels1 tbody tr').evaluateAll(nodes=>nodes.map(node=>[...node.querySelectorAll('td')].map(cell=>({text:cell.textContent.trim(),links:[...cell.querySelectorAll('a')].map(a=>a.href)}))));
        assert.ok(rows.length>40);
        for(const cells of rows){assert.equal(cells.length,3);assert.ok(cells.every(cell=>cell.links.length===1));const script=new URL(cells[0].links[0]);assert.equal(script.hostname,'invidious.test');assert.ok(fs.existsSync(path.join(root,'assets',script.pathname)));}
        for(const name of ['account-forms.js','verification.js','overhaul.js','player.js'])assert.ok(rows.some(row=>row[0].text===name));
        assert.ok(rows.some(row=>row[0].text==='video.js'&&row[1].text==='Apache-2.0-only'));
        assert.equal(await page.locator('a[href*="lucide-icons/lucide"]').count(),1);
        assert.equal(await page.locator('a[href="/icons/LICENSE.lucide"],a[href="/icons/LICENSE.feather"]').count(),2);
        await page.locator('.license-table-scroll').focus();assert.equal(await page.locator('.license-table-scroll').evaluate(node=>node===document.activeElement),true);
        assert.ok(!requests.some(r=>r.url.hostname!=='invidious.test'));await context.close();
    });
    test(`${engine}: D7 recovery actions and technical details keep keyboard focus in forced colors`,async()=>{
        const {context,page}=await setup(engine,'unexpected');await page.emulateMedia({forcedColors:'active'});
        const retry=page.getByRole('link',{name:'Try again',exact:true});await retry.focus();
        assert.equal(await retry.evaluate(node=>node===document.activeElement),true);assert.ok(await retry.evaluate(node=>parseFloat(getComputedStyle(node).outlineWidth)>0));
        const summary=page.locator('.error-details summary');await summary.focus();await page.keyboard.press('Enter');
        assert.equal(await page.locator('.error-details').getAttribute('open'),'');await page.keyboard.press('Tab');
        assert.equal(await page.getByRole('link',{name:'Read the FAQ',exact:true}).evaluate(node=>node===document.activeElement),true);
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);await context.close();
    });
    test(`${engine}: D7 reading preferences are escaped and API-only errors retain a valid minimal destination`,async()=>{
        const unsafe=await setup(engine,'unsafe-preferences','light',{fixture:'d7-status-unsafe-preferences.html'});
        assert.equal(await unsafe.page.locator('body').getAttribute('class'),'no-theme');assert.equal(await unsafe.page.locator('html').getAttribute('onload'),null);assert.equal(await unsafe.page.locator('body').getAttribute('onload'),null);assert.equal(await unsafe.page.evaluate(()=>!!window.injected),false);assert.deepEqual(unsafe.errors,[]);await unsafe.context.close();
        for(const variant of ['light','dark']) {
            const {context,page}=await setup(engine,'api-error',variant,{fixture:`d7-api-error-${variant}.html`});assert.equal(await page.locator('.app-sidebar,.app-header,script').count(),0);assert.ok(!(await page.content()).includes('private-sentinel'));assert.equal(await page.locator('main nav a').count(),1);assert.equal(await page.locator('main nav a').getAttribute('href'),'/admin/settings');await context.close();
        }
    });
}
