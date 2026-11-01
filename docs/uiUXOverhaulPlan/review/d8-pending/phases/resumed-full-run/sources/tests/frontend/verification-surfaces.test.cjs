'use strict';
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const playwright=require('playwright');
const root=path.resolve(__dirname,'../..'),generated=path.join(__dirname,'.generated'),artifacts=path.join(__dirname,'artifacts','d7-verification');
const engines=(process.env.FRONTEND_BROWSERS||'chromium,firefox').split(','),browsers={};
before(async()=>{fs.mkdirSync(artifacts,{recursive:true});for(const engine of engines)browsers[engine]=await playwright[engine].launch({headless:true});});
after(async()=>{for(const browser of Object.values(browsers))await browser.close();});
async function setup(engine,screen,variant='light',options={}) {
 const context=await browsers[engine].newContext({viewport:{width:1440,height:900},colorScheme:variant==='light'?'light':'dark',javaScriptEnabled:options.javascript!==false});
 await context.addInitScript(()=>{window.bridgeEvents=[];window.addEventListener('invidious-verification-complete',event=>bridgeEvents.push(event.detail));});
 const page=await context.newPage(),requests=[],errors=[];page.on('pageerror',error=>errors.push(error.message));
 await context.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url());requests.push({url,method:req.method(),body:req.postData()||''});
  if(url.hostname==='challenges.cloudflare.com')return route.fulfill({contentType:'application/javascript',body:`window.providerRenders=0;window.providerResets=0;window.turnstile={render:function(selector,options){providerRenders++;window.widgetOptions=options;return 1;},reset:function(){providerResets++;}};window.invidiousTurnstileReady();`});
  if(url.pathname==='/api/v1/verification/complete')return route.fulfill(options.complete?await options.complete(req):{json:screen==='disabled'?{enabled:false}:{verificationToken:'private-native-pass',expiresAt:2000000000}});
  if(req.method()==='POST')return route.fulfill({contentType:'text/html',body:'<title>Submitted</title>Received'});
  if(req.isNavigationRequest())return route.fulfill({contentType:'text/html',path:path.join(generated,options.fixture||`d7-verify-${screen}-${variant}.html`)});
  const file=path.join(root,'assets',url.pathname);
  if(url.pathname==='/css/foundation.css'&&variant==='rtl')return route.fulfill({contentType:'text/css',body:fs.readFileSync(file,'utf8')+'\nbody{font-size:20px}.muted,.button{font-size:18px}h1{font-size:30px}h2{font-size:25px}.brand{font-size:25px}'});
  return fs.existsSync(file)?route.fulfill({path:file}):route.fulfill({status:404,body:''});
 });
 await page.goto('https://invidious.test'+(options.url||(screen.startsWith('admin')?'/admin/bot-protection':'/verify')));
 if(!options.api&&options.javascript!==false&&!screen.startsWith('admin')&&screen!=='disabled'&&screen!=='unconfigured')await page.waitForFunction(()=>window.widgetOptions);
 return {context,page,requests,errors};
}
for(const engine of engines) {
 test(`${engine}: D7 standalone verification/admin Light Dark RTL and no-JavaScript geometry`,async()=>{
  for(const variant of ['light','dark','rtl'])for(const screen of ['browser','native','unconfigured','admin','admin-missing','admin-failed','notice-iframe','notice-denied']) {
   const {context,page,requests,errors}=await setup(engine,screen,variant,{javascript:false});
   assert.equal(await page.locator('html').getAttribute('dir'),variant==='rtl'?'rtl':'ltr');assert.equal(await page.locator('body').getAttribute('class'),(variant==='light'?'light':'dark')+'-theme');
   assert.equal(await page.locator('main h1').count(),1);assert.equal(await page.locator('.app-header,.app-sidebar').count(),0);
   for(const width of [1280,1440,1920]){await page.setViewportSize({width,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,screen+' overflow');}
   await page.setViewportSize({width:1280,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
   assert.ok(requests.some(r=>r.url.pathname==='/css/foundation.css'));assert.ok(!requests.some(r=>/\/themes\/|pure-min|ionicons|browser-storage|enhancements|sse/.test(r.url.pathname)));assert.equal(requests.filter(r=>r.method==='POST').length,0);
   if(screen==='admin-failed'){assert.equal(await page.locator('[name=enabled]').isChecked(),true);assert.equal(await page.locator('#duration_hours').inputValue(),'1');assert.equal(await page.getByRole('alert').count(),1);}
   if(screen.startsWith('admin')){assert.equal(await page.locator('form[action^="/signout"] input[name=csrf_token]').inputValue(),'synthetic-admin-csrf');assert.equal(await page.locator('form[action^="/signout"] [type=submit]').count(),1);}
   if(screen==='admin'&&variant==='light')assert.equal(await page.locator('#duration_hours option[value="1"]').innerText(),'1 hour');
   if(screen==='notice-iframe'){assert.equal(await page.locator('a[target="_blank"]').count(),1);assert.equal(await page.locator('script').count(),0);}
   if(screen==='notice-denied'){assert.equal(await page.locator('form[action^="/signout"] input[name=csrf_token]').count(),1);assert.equal(await page.locator('[name=enabled],[name=duration_hours]').count(),0);}
   if(screen==='admin-missing')assert.match(await page.locator('main').innerText(),/<unsafe> & "diagnostic"/);
   if(['admin','browser','admin-failed','notice-iframe','notice-denied'].includes(screen))await page.screenshot({path:path.join(artifacts,`${engine}-${screen}-${variant}.png`),fullPage:true});
   assert.deepEqual(errors,[]);await context.close();
  }
 });
 test(`${engine}: D7 recovery policy choices use ordinary forms with and without JavaScript`,async()=>{
  for(const javascript of [false,true]) {
   const {context,page,requests,errors}=await setup(engine,'admin','light',{javascript});await page.locator('[name=enabled]').uncheck();await page.locator('#duration_hours').selectOption('24');await page.getByRole('button',{name:'Save verification settings',exact:true}).click();await page.waitForFunction(()=>document.title==='Submitted');
   const writes=requests.filter(r=>r.method==='POST');assert.equal(writes.length,1);const fields=new URLSearchParams(writes[0].body);assert.equal(fields.get('csrf_token'),'synthetic-admin-csrf');assert.equal(fields.get('duration_hours'),'24');assert.equal(fields.has('enabled'),false);assert.deepEqual(errors,[]);await context.close();
  }
 });
 test(`${engine}: D7 native challenge is idempotent and keeps issued credentials in the bridge only`,async()=>{
  const {context,page,requests,errors}=await setup(engine,'native');await page.addScriptTag({path:path.join(root,'assets/js/verification.js')});await page.evaluate(()=>{invidiousTurnstileReady();widgetOptions.callback('test-challenge');widgetOptions.callback('duplicate-challenge');});await page.waitForFunction(()=>bridgeEvents.length===1);
  assert.deepEqual(await page.evaluate(()=>bridgeEvents),[{verificationToken:'private-native-pass',expiresAt:2000000000,enabled:true}]);assert.equal(await page.evaluate(()=>providerRenders),1);assert.equal(requests.filter(r=>r.method==='POST').length,1);await page.evaluate(()=>widgetOptions['expired-callback']());assert.equal(await page.getByRole('alert').count(),0);assert.match(await page.locator('#verification-status').innerText(),/Verified/);
  assert.ok(!requests.some(r=>r.url.href.includes('private-native-pass')));assert.ok(!(await page.locator('body').innerText()).includes('private-native-pass'));assert.equal(JSON.stringify(await context.storageState()).includes('private-native-pass'),false);assert.equal(await page.evaluate(()=>Object.keys(sessionStorage).length+Object.keys(localStorage).length),0);assert.deepEqual(errors,[]);await context.close();
 });
 test(`${engine}: D7 failed verification is explicit and retries only a fresh challenge`,async()=>{
  let calls=0;const {context,page,requests}=await setup(engine,'native','light',{complete:()=>++calls===1?{status:503,json:{message:'<safe> retry'}}:{json:{verificationToken:'second-pass',expiresAt:2000000000}}});
  await page.evaluate(()=>widgetOptions.callback('first'));await page.getByRole('alert').waitFor();assert.equal(await page.getByRole('alert').innerText(),'<safe> retry');assert.equal(await page.locator('safe').count(),0);assert.equal(requests.filter(r=>r.method==='POST').length,1);
  await page.evaluate(()=>widgetOptions.callback('must-not-auto-retry'));assert.equal(requests.filter(r=>r.method==='POST').length,1);
  await page.getByRole('button',{name:'Retry verification',exact:true}).click();assert.equal(await page.evaluate(()=>providerResets),1);assert.equal(requests.filter(r=>r.method==='POST').length,1);
  await page.evaluate(()=>widgetOptions.callback('fresh'));await page.waitForFunction(()=>bridgeEvents.length===1);assert.equal(requests.filter(r=>r.method==='POST').length,2);await context.close();
 });
 test(`${engine}: D7 cached verification return rejects late passes and waits for deliberate Retry`,async()=>{
  const {context,page}=await setup(engine,'native');await page.evaluate(()=>{window.pending=[];window.fetch=()=>new Promise(resolve=>pending.push(resolve));widgetOptions.callback('first');window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}));window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));pending[0](new Response(JSON.stringify({verificationToken:'stale-pass',expiresAt:2000000000})));widgetOptions.callback('must-not-submit');});
  await page.getByRole('button',{name:'Retry verification',exact:true}).waitFor();assert.equal(await page.evaluate(()=>pending.length),1);assert.deepEqual(await page.evaluate(()=>bridgeEvents),[]);
  await page.getByRole('button',{name:'Retry verification',exact:true}).click();await page.evaluate(()=>{widgetOptions.callback('fresh');pending[1](new Response(JSON.stringify({verificationToken:'fresh-pass',expiresAt:2000000000})));});await page.waitForFunction(()=>bridgeEvents.length===1);assert.equal(await page.evaluate(()=>bridgeEvents[0].verificationToken),'fresh-pass');await context.close();
 });
 test(`${engine}: D7 provider failure retires its pending completion before explicit retry`,async()=>{
  const {context,page,errors}=await setup(engine,'native');await page.evaluate(()=>{window.pending=[];window.fetch=()=>new Promise(resolve=>pending.push(resolve));widgetOptions.callback('old');widgetOptions['timeout-callback']();});await page.getByRole('alert').waitFor();
  await page.getByRole('button',{name:'Retry verification',exact:true}).click();await page.evaluate(()=>{widgetOptions.callback('fresh');pending[0](new Response(JSON.stringify({verificationToken:'stale-pass',expiresAt:2000000000})));pending[1](new Response(JSON.stringify({verificationToken:'fresh-pass',expiresAt:2000000000})));});await page.waitForFunction(()=>bridgeEvents.length===1);assert.equal(await page.evaluate(()=>bridgeEvents[0].verificationToken),'fresh-pass');assert.deepEqual(errors,[]);await context.close();
 });
 test(`${engine}: D7 malformed verification replies cannot invent success or expose token fragments`,async()=>{
  for(const reply of [{json:null},{json:{}},{json:{verificationToken:'private-fragment',expiresAt:'invalid'}},{contentType:'application/json',body:'{"verificationToken":"private-fragment'}]) {
   const {context,page,errors}=await setup(engine,'native','light',{complete:()=>reply});await page.evaluate(()=>widgetOptions.callback('challenge'));await page.getByRole('alert').waitFor();assert.deepEqual(await page.evaluate(()=>bridgeEvents),[]);assert.ok(!(await page.locator('body').innerText()).includes('private-fragment'));assert.deepEqual(errors,[]);await context.close();
  }
  for(const target of ['https://outside.test/private-pass','//outside.test/private-pass','javascript:alert(1)']) {
   const {context,page}=await setup(engine,'browser','light',{complete:()=>({json:{expiresAt:2000000000,returnUrl:target}})});await page.evaluate(()=>widgetOptions.callback('challenge'));await page.getByRole('alert').waitFor();assert.equal(page.url(),'https://invidious.test/verify');await context.close();
  }
 });
 test(`${engine}: D7 API-only recovery has usable minimal login and native bootstrap`,async()=>{
  for(const mode of ['light','dark'])for(const javascript of [false,true]) {
   const {context,page,requests}=await setup(engine,'api-login',mode,{api:true,fixture:`d7-api-login-${mode}.html`,url:'/login?referer=%2Fadmin%2Fbot-protection',javascript});
   assert.equal(await page.locator('.app-sidebar,.app-header,a[href="/signup"]').count(),0);assert.equal(await page.locator('body').getAttribute('class'),mode+'-theme');
   await page.locator('#username').fill('RecoveryAdmin');await page.locator('#password').fill('synthetic recovery password');await page.getByRole('button',{name:'Sign In',exact:true}).click();await page.waitForFunction(()=>document.title==='Submitted');
   const writes=requests.filter(r=>r.method==='POST');assert.equal(writes.length,1);const fields=new URLSearchParams(writes[0].body);assert.ok(fields.get('csrf_token'));assert.equal(fields.get('username'),'RecoveryAdmin');assert.equal(fields.get('password'),'synthetic recovery password');assert.equal(writes[0].url.searchParams.get('referer'),'/admin/bot-protection');await context.close();
  }
  const {context,page,requests}=await setup(engine,'api-verify','light',{api:true,fixture:'d7-api-verify-light.html',complete:()=>({json:{enabled:false}})});await page.waitForFunction(()=>bridgeEvents.length===1);assert.deepEqual(await page.evaluate(()=>bridgeEvents),[{verificationToken:null,expiresAt:null,enabled:false}]);assert.equal(await page.locator('a[href="/privacy"],.app-sidebar').count(),0);assert.equal(requests.filter(r=>r.url.hostname==='challenges.cloudflare.com').length,0);await context.close();
 });
 test(`${engine}: D7 disabled and unconfigured verification stay truthful and localized`,async()=>{
  const disabled=await setup(engine,'disabled');await disabled.page.waitForFunction(()=>bridgeEvents.length===1);assert.deepEqual(await disabled.page.evaluate(()=>bridgeEvents),[{verificationToken:null,expiresAt:null,enabled:false}]);assert.equal(disabled.requests.filter(r=>r.url.hostname==='challenges.cloudflare.com').length,0);await disabled.context.close();
  const unavailable=await setup(engine,'unconfigured');assert.equal(await unavailable.page.getByRole('button',{name:'Retry verification',exact:true}).isVisible(),true);assert.equal(unavailable.requests.filter(r=>r.method==='POST'||r.url.hostname==='challenges.cloudflare.com').length,0);await unavailable.context.close();
  const translated=await setup(engine,'native','id');await translated.page.evaluate(()=>widgetOptions.callback('localized'));await translated.page.waitForFunction(()=>bridgeEvents.length===1);assert.match(await translated.page.locator('#verification-status').innerText(),/Terverifikasi/);await translated.context.close();
 });
}
