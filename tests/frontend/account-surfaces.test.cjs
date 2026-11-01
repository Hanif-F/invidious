'use strict';
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const playwright=require('playwright');
const root=path.resolve(__dirname,'../..'),generated=path.join(__dirname,'.generated'),artifacts=path.join(__dirname,'artifacts','d7-account');
const engines=(process.env.FRONTEND_BROWSERS||'chromium,firefox').split(','),browsers={};
before(async()=>{fs.mkdirSync(artifacts,{recursive:true});for(const engine of engines)browsers[engine]=await playwright[engine].launch({headless:true});});
after(async()=>{for(const browser of Object.values(browsers))await browser.close();});
async function setup(engine,screen,variant='light',options={}) {
    const context=await browsers[engine].newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce',javaScriptEnabled:options.javascript!==false,colorScheme:variant==='light'?'light':'dark'});
    const page=await context.newPage(),requests=[],errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await context.route('**/*',async route=>{
        const req=route.request(),url=new URL(req.url());requests.push({url,method:req.method(),body:req.postData()||''});
        if(options.reply){const response=await options.reply({url,method:req.method(),body:req.postData()||''});if(response)return route.fulfill(response);}
        if(req.isNavigationRequest()&&req.method()==='GET'&&options.dataPicker&&url.pathname==='/data_control'){const source=['invidious','youtube','youtube-playlist','youtube-history','freetube','newpipe-subscriptions','newpipe'].includes(url.searchParams.get('source'))?url.searchParams.get('source'):'invidious';return route.fulfill({contentType:'text/html',path:path.join(generated,`d7-data-${source}-${variant}.html`)});}
        if(req.method()==='POST')return route.fulfill({contentType:'text/html',body:'<!doctype html><title>Submitted</title><p>Received</p>'});
        if(req.isNavigationRequest())return route.fulfill({contentType:'text/html',path:path.join(generated,`d7-${screen}-${variant}.html`)});
        if(url.origin!=='https://invidious.test')return route.fulfill({status:502,body:'External request blocked'});
        const file=path.join(root,'assets',url.pathname);
        return fs.existsSync(file)&&fs.statSync(file).isFile()?route.fulfill({path:file}):route.fulfill({status:404,body:''});
    });
    const url=options.url||({account:'/account',sessions:'/token_manager','sessions-empty':'/token_manager',delete:'/delete_account?referer=%2Faccount',authorize:'/authorize_token','authorize-empty':'/authorize_token','token-issued':'/authorize_token',tv:'/tv',login:'/login?referer=%2Faccount',signup:'/signup?referer=%2Faccount'}[screen.replace('-failed','')]);
    await page.goto('https://invidious.test'+url);
    if(options.javascript!==false)await page.waitForFunction(()=>document.body.dataset.uiInitialized==='true'&&document.documentElement.dataset.accountForms==='true');
    return {context,page,requests,errors};
}
for(const engine of engines) {
    test(`${engine}: D7 account light/dark layouts, scoped assets and readable security consequences`,async()=>{
        for(const mode of ['light','dark'])for(const screen of ['login','signup','account','account-failed','delete','delete-failed','sessions','sessions-empty','authorize','authorize-empty','token-issued','tv','tv-failed','tv-approved','signup-captcha']) {
            const {context,page,requests,errors}=await setup(engine,screen,mode,{url:screen==='tv-approved'?'/tv':screen==='signup-captcha'?'/signup':undefined});
            for(const width of [1280,1440,1920]) {
                await page.setViewportSize({width,height:1000});
                assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,`${screen} ${mode} ${width} overflow`);
            }
            assert.equal(await page.locator('body').getAttribute('class'),mode+'-theme',screen+' actual color mode');
            assert.equal(await page.locator('main h1').count(),1,screen+' main heading');
            assert.equal(await page.locator('nav.app-sidebar').count(),1);
            assert.equal(await page.locator('main [class*="pure-"]').count(),0);
            assert.ok(!requests.some(r=>/\/themes\/|ionicons|pure-min|grids-responsive|\/(enhancements|browse|channel-spoilers|dearrow|timezone|subscriptions|notifications|sse)\.js/.test(r.url.pathname)),screen+' unnecessary assets');
            assert.equal(requests.filter(r=>r.method!=='GET').length,0,screen+' unrequested writes');
            assert.deepEqual(errors,[],screen+' script errors');
            if(['account','authorize','sessions','delete'].includes(screen))await page.screenshot({path:path.join(artifacts,`${engine}-${screen}-${mode}.png`),fullPage:true});
            await context.close();
        }
    });
    test(`${engine}: D7 RTL, enlarged text, keyboard and forced-color focus`,async()=>{
        for(const screen of ['account','sessions','authorize','delete','tv','signup']) {
            const {context,page,errors}=await setup(engine,screen,'rtl');
            assert.equal(await page.locator('html').getAttribute('dir'),'rtl');
            await page.addStyleTag({content:'body{font-size:20px}.muted,.button{font-size:18px}h1{font-size:30px}h2{font-size:24px}input{font-size:20px}'});
            await page.setViewportSize({width:1280,height:900});
            assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,screen+' enlarged RTL overflow');
            await page.emulateMedia({forcedColors:'active'});
            await page.locator('main button,main summary,main input:not([type=hidden]),main a').first().focus();
            assert.equal(await page.evaluate(()=>getComputedStyle(document.activeElement).outlineStyle!=='none'),true);
            await page.screenshot({path:path.join(artifacts,`${engine}-${screen}-rtl-enlarged.png`),fullPage:true});
            assert.deepEqual(errors,[]);await context.close();
        }
    });
    test(`${engine}: D7 failed usernames and private issued tokens remain literal text`,async()=>{
        for(const screen of ['account-failed','login-failed','signup-failed','delete-failed']) {
            const {context,page}=await setup(engine,screen);
            assert.equal(await page.locator('[role=alert]').count(),1);
            if(screen==='account-failed')assert.equal(await page.locator('#username').inputValue(),'<unavailable>" draft');
            if(screen.includes('login')||screen.includes('signup'))assert.equal(await page.locator('#username').inputValue(),'<escaped>" user');
            assert.equal(await page.locator('main input[type=password]').evaluateAll(nodes=>nodes.every(n=>n.value===''&&!n.hasAttribute('value'))),true);
            assert.equal(await page.locator('main [onfocus],main [autofocus]').count(),0);await context.close();
        }
        const {context,page}=await setup(engine,'token-issued');
        const token=JSON.parse(await page.locator('.issued-token').innerText());
        assert.equal(token.session,'synthetic-private-token');assert.ok(token.scopes[1].includes('<script>'));
        assert.equal(await page.evaluate(()=>window.injected),undefined);
        assert.equal(await page.locator('script[type="application/json"]').evaluateAll(nodes=>nodes.some(n=>n.textContent.includes('synthetic-private-token'))),false);
        assert.equal(JSON.stringify(await context.storageState()).includes('synthetic-private-token'),false);
        assert.equal(await page.evaluate(()=>JSON.stringify(Object.entries(sessionStorage)).includes('synthetic-private-token')),false);
        await context.close();
    });
    test(`${engine}: D7 credential forms submit complete ordinary requests with and without JavaScript`,async()=>{
        for(const javascript of [false,true])for(const screen of ['login','signup','account','password','delete']) {
            const {context,page,requests}=await setup(engine,screen==='password'?'account':screen,'light',{javascript});
            if(screen!=='delete'&&screen!=='password')await page.locator('#username').fill(screen==='account'?'RenamedObserver':'NewObserver');
            const pass=screen==='account'?'#rename-password':screen==='password'?'#current-password':'#password';await page.locator(pass).fill('a synthetic long password');
            if(screen==='password'){await page.locator('#new-password').fill('a synthetic replacement password');await page.locator('#confirm-password').fill('a synthetic replacement password');}
            if(screen==='signup')await page.locator('#password_confirmation').fill('a synthetic long password');
            const action=screen==='account'?'/account/username':screen==='password'?'/change_password':'/'+(screen==='delete'?'delete_account':screen);
            const form=page.locator(`main form[action^="${action}"]`);
            await form.getByRole('button').click();await page.waitForURL('**'+action+'*');
            const writes=requests.filter(r=>r.method==='POST');assert.equal(writes.length,1);
            const fields=new URLSearchParams(writes[0].body);assert.ok(fields.get('csrf_token'));
            assert.equal(fields.get('password'),'a synthetic long password');
            if(screen==='delete')assert.equal(fields.get('submit'),'delete_account');
            else if(screen==='password'){assert.equal(fields.get('new_password[0]'),'a synthetic replacement password');assert.equal(fields.get('new_password[1]'),'a synthetic replacement password');assert.equal(fields.get('username'),'StudioObserver');}
            else assert.equal(fields.get('username'),screen==='account'?'RenamedObserver':'NewObserver');
            await context.close();
        }
    });
    test(`${engine}: D7 token consent preserves exact scopes and native callback without unsafe Cancel`,async()=>{
        for(const javascript of [false,true]) {
            const {context,page,requests}=await setup(engine,'authorize','light',{javascript});
            assert.equal(await page.locator('main [autofocus],main [onfocus]').count(),0);
            assert.equal(await page.locator('main a').filter({hasText:'Cancel'}).getAttribute('href'),'/token_manager');
            const callback='tividious://authorize/path?client="quoted"&label=<safe>';
            assert.equal(await page.locator('[name=callbackUrl]').inputValue(),callback);
            assert.equal(await page.locator('.callback-address').innerText(),callback);
            await page.getByRole('button',{name:'Authorize token',exact:true}).click();
            await page.waitForURL('**/authorize_token');
            await page.waitForFunction(()=>document.title==='Submitted');
            const writes=requests.filter(r=>r.method==='POST');assert.equal(writes.length,1);
            const fields=new URLSearchParams(writes[0].body);assert.equal(fields.get('callbackUrl'),callback);assert.equal(fields.get('expire'),'2000000000');
            assert.equal(fields.get('scopes[0]'),'GET:subscriptions');assert.equal(fields.get('scopes[1]'),'" autofocus onfocus="window.injected=true');
            await context.close();
        }
    });
    test(`${engine}: D7 full native expiration timestamps survive consent`,async()=>{
        const {context,page}=await setup(engine,'authorize-wide','light',{url:'/authorize_token?expire=9223372036854775807'});
        assert.equal(await page.locator('[name=expire]').inputValue(),'9223372036854775807');assert.match(await page.locator('main').innerText(),/Expires at Unix timestamp 9223372036854775807/);await context.close();
    });
    test(`${engine}: D7 session revocation is explicit, private and usable without JavaScript`,async()=>{
        for(const javascript of [false,true]) {
            const {context,page,requests}=await setup(engine,'sessions','light',{javascript});
            assert.ok(!(await page.locator('main').innerText()).includes('synthetic-private-api-session'));
            const row=page.locator('.session-row').nth(1);await row.locator('summary').click();
            assert.equal(requests.filter(r=>r.method==='POST').length,0);
            assert.equal(await row.getByRole('button',{name:'Revoke session',exact:true}).isVisible(),true);
            await row.getByRole('button',{name:'Revoke session',exact:true}).click();
            await page.waitForURL('**/token_ajax*');const writes=requests.filter(r=>r.method==='POST');assert.equal(writes.length,1);
            assert.equal(writes[0].url.searchParams.has('session'),false);
            const fields=new URLSearchParams(writes[0].body);assert.equal(fields.get('session'),'v1:synthetic-private-api-session');assert.equal(fields.get('csrf_token'),'fixture-token');
            await context.close();
        }
    });
    test(`${engine}: D7 TV approve and deny retain the chosen ordinary submitter`,async()=>{
        for(const javascript of [false,true])for(const decision of ['approve','deny']) {
            const {context,page,requests}=await setup(engine,'tv','light',{javascript});
            assert.equal(await page.locator('#user_code').inputValue(),'ABCD-2345');
            await page.locator(`button[value="${decision}"]`).click();await page.waitForFunction(()=>document.title==='Submitted');
            const writes=requests.filter(r=>r.method==='POST');assert.equal(writes.length,1);
            const fields=new URLSearchParams(writes[0].body);assert.equal(fields.get('decision'),decision);assert.equal(fields.get('user_code'),'ABCD-2345');assert.ok(fields.get('csrf_token'));
            await context.close();
        }
    });
    test(`${engine}: D7 data source matrix and grouped portable exports`,async()=>{
        const fields={invidious:'import_invidious',youtube:'import_youtube','youtube-playlist':'import_youtube_pl','youtube-history':'import_youtube_wh',freetube:'import_freetube','newpipe-subscriptions':'import_newpipe_subscriptions',newpipe:'import_newpipe',unknown:'import_invidious'};
        for(const variant of ['light','dark','rtl'])for(const [source,field]of Object.entries(fields)) {
            const {context,page,requests,errors}=await setup(engine,'data-'+source,variant,{url:'/data_control?source='+source});
            assert.equal(await page.locator('body').getAttribute('class'),(variant==='light'?'light':'dark')+'-theme');assert.equal(await page.locator('html').getAttribute('dir'),variant==='rtl'?'rtl':'ltr');
            assert.equal(await page.locator('input[type=file]').count(),1);assert.equal(await page.locator('input[type=file]').getAttribute('name'),field);
            const inputs=await page.locator('form[enctype] input').evaluateAll(nodes=>nodes.map(n=>n.name));assert.deepEqual(inputs,['csrf_token',field]);
            const links=await page.locator('main a[href^="/subscription_manager?action_takeout=1"]').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('href')));assert.deepEqual(links,['/subscription_manager?action_takeout=1&format=json','/subscription_manager?action_takeout=1','/subscription_manager?action_takeout=1&format=opml','/subscription_manager?action_takeout=1&format=newpipe_json']);
            assert.match(await page.locator('main').innerText(),/not all-or-nothing|ux_data_partial/);
            await page.setViewportSize({width:1280,height:900});if(variant==='rtl')await page.addStyleTag({content:'body{font-size:20px}.muted,.button{font-size:18px}'});
            assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,source+' '+variant+' overflow');assert.deepEqual(errors,[]);
            assert.equal(requests.filter(r=>r.method==='POST').length,0);if(source==='invidious')await page.screenshot({path:path.join(artifacts,`${engine}-data-${variant}.png`),fullPage:true});await context.close();
        }
    });
    test(`${engine}: D7 source choice works by GET and import keeps CSRF first without JavaScript`,async()=>{
        for(const javascript of [false,true]) {
            const {context,page,requests}=await setup(engine,'data-invidious','light',{javascript,url:'/data_control?source=invidious',dataPicker:true});
            await page.locator('#import-source').selectOption('youtube-history');assert.equal(requests.filter(r=>r.method==='POST').length,0);
            await page.getByRole('button',{name:'Choose source',exact:true}).click();await page.waitForURL('**/data_control?source=youtube-history*');
            assert.equal(await page.locator('input[type=file]').getAttribute('name'),'import_youtube_wh');
            await page.getByRole('button',{name:'Import',exact:true}).click();assert.equal(requests.filter(r=>r.method==='POST').length,0,'empty file must not submit');
            await page.locator('input[type=file]').setInputFiles({name:'history.json',mimeType:'application/json',buffer:Buffer.from('[]')});
            await page.getByRole('button',{name:'Import',exact:true}).click();await page.waitForFunction(()=>document.title==='Submitted');
            const writes=requests.filter(r=>r.method==='POST');assert.equal(writes.length,1);assert.equal(writes[0].url.searchParams.get('source'),'youtube-history');
            assert.ok(writes[0].body.indexOf('name="csrf_token"')<writes[0].body.indexOf('name="import_youtube_wh"'));assert.ok(writes[0].body.includes('filename="history.json"'));await context.close();
        }
    });
    test(`${engine}: D7 import error keeps source and truthful partial-result guidance`,async()=>{
        for(const javascript of [false,true]) {
            const {context,page,requests,errors}=await setup(engine,'data-youtube','light',{javascript,url:'/data_control?source=youtube',reply:entry=>entry.method==='POST'?{status:415,contentType:'text/html',path:path.join(generated,'d7-data-failed-light.html')}:null});
            await page.locator('input[type=file]').setInputFiles({name:'unsupported.txt',mimeType:'text/plain',buffer:Buffer.from('unsupported')});await page.getByRole('button',{name:'Import',exact:true}).click();
            await page.getByRole('alert').waitFor();assert.match(await page.getByRole('alert').innerText(),/Earlier parts of an import may already have been saved/);assert.equal(await page.locator('#import-source').inputValue(),'youtube');assert.equal(await page.locator('input[type=file]').inputValue(),'');
            assert.equal(requests.filter(r=>r.method==='POST').length,1);assert.deepEqual(errors,[]);await context.close();
        }
    });
    test(`${engine}: D7 parser failures retain a safe source form without claiming rollback`,async()=>{
        const {context,page,errors}=await setup(engine,'data-partial','light',{url:'/data_control?source=youtube-history'});
        assert.match(await page.getByRole('alert').innerText(),/Check your imported data before trying again/);assert.match(await page.getByRole('alert').innerText(),/Earlier parts/);assert.equal(await page.locator('input[type=file]').getAttribute('name'),'import_youtube_wh');assert.equal(await page.locator('input[type=file]').inputValue(),'');assert.deepEqual(errors,[]);await context.close();
    });
    test(`${engine}: D7 CAPTCHA is labeled and retained in the ordinary registration form`,async()=>{
        for(const javascript of [false,true]) {
            const {context,page,requests}=await setup(engine,'signup-captcha','light',{javascript,url:'/signup'});
            assert.equal(await page.getByAltText('CAPTCHA clock').isVisible(),true);assert.ok(await page.locator('[name="token[0]"]').inputValue());
            await page.locator('#username').fill('CaptchaObserver');await page.locator('#password').fill('a synthetic long password');await page.locator('#password_confirmation').fill('a synthetic long password');await page.locator('#answer').fill('1:05:10');
            await page.getByRole('button',{name:'Register',exact:true}).click();await page.waitForFunction(()=>document.title==='Submitted');
            const writes=requests.filter(r=>r.method==='POST');assert.equal(writes.length,1);const fields=new URLSearchParams(writes[0].body);assert.ok(fields.get('token[0]'));assert.equal(fields.get('answer'),'1:05:10');await context.close();
        }
    });
    test(`${engine}: D7 duplicate submission guard retains fields and resets on cached return`,async()=>{
        const {context,page,requests,errors}=await setup(engine,'tv');
        await page.addScriptTag({path:path.join(root,'assets/js/account-forms.js')});
        const result=await page.evaluate(()=>{
            const form=document.querySelector('main form'),button=form.querySelector('[value=deny]'),events=[];
            form.addEventListener('submit',event=>{events.push({blocked:event.defaultPrevented,data:Object.fromEntries(new FormData(form,event.submitter))});event.preventDefault();});
            form.requestSubmit(button);form.requestSubmit(button);
            const pending={busy:form.getAttribute('aria-busy'),disabled:button.disabled,ariaDisabled:button.getAttribute('aria-disabled')};
            window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));
            const restored={busy:form.getAttribute('aria-busy'),ariaDisabled:button.getAttribute('aria-disabled')};form.requestSubmit(button);
            return {events,pending,restored};
        });
        assert.deepEqual(result.events.map(e=>e.blocked),[false,true,false]);
        assert.ok(result.events.every(e=>e.data.decision==='deny'&&e.data.user_code==='ABCD-2345'&&e.data.csrf_token));
        assert.deepEqual(result.pending,{busy:'true',disabled:false,ariaDisabled:'true'});assert.deepEqual(result.restored,{busy:null,ariaDisabled:null});
        assert.equal(requests.filter(r=>r.method==='POST').length,0);assert.deepEqual(errors,[]);await context.close();
    });
}
