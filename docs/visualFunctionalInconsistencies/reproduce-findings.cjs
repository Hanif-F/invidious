'use strict';

// Verifies the resolved findings against synthetic production-template pages.
// Browser DOM substitutions supply ordinary description content or a long URL;
// no application source, real account, or upstream service is changed.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {transport} = require('./capture-desktop.cjs');
const root = path.resolve(__dirname, '../..');
const playwright = require(path.join(root, 'tests/frontend/node_modules/playwright'));
const output = process.env.AUDIT_OUTPUT || path.join(__dirname, 'evidence', 'resolved');
fs.mkdirSync(output,{recursive:true});

async function main() {
  const helper = transport(), records = [];
  try {
    for (const engine of ['chromium','firefox']) {
      helper.browsers[engine] = await playwright[engine].launch({headless:true});
      for (const mode of ['light','dark']) {
        const {page,context} = await helper.setup(engine,'browse',mode,{fixture:`overhaul-watch-${mode}`,url:'/watch?v=2isYuQZMbdU'});
        try {
          await page.waitForFunction(()=>document.body.dataset.uiInitialized==='true');
          await page.locator('#descriptionWrapper').evaluate(el=>{
            const link=document.createElement('a'); link.href='https://example.test/notes'; link.textContent='field notes';
            el.replaceChildren(document.createTextNode('Read the '),link,document.createTextNode(' for this video.'));
            document.getElementById('description-box').open=true;
          });
          const measurements=[];
          for (const [width,height] of [[1280,720],[1440,900],[1920,1080]]) {
            await page.setViewportSize({width,height});
            const measurement=await page.locator('#descriptionWrapper a').evaluate(link=>({width:innerWidth,color:getComputedStyle(link).color,parentColor:getComputedStyle(link.parentElement).color,decoration:getComputedStyle(link).textDecorationLine,weight:getComputedStyle(link).fontWeight,parentWeight:getComputedStyle(link.parentElement).fontWeight}));
            assert.notEqual(measurement.color,measurement.parentColor);
            assert.ok(measurement.decoration.includes('underline'));
            measurements.push(measurement);
          }
          await page.setViewportSize({width:1280,height:720});
          await page.locator('#descriptionWrapper').scrollIntoViewIfNeeded();
          await page.screenshot({path:path.join(output,`${engine}-inline-link-${mode}.png`)});
          records.push({id:'VF-002',engine,mode,measurements});

          // Secondary content-length observation, separate from ordinary flows.
          await page.locator('#descriptionWrapper').evaluate(el=>{el.textContent='Long URL: https://example.test/resource?token='+'a'.repeat(256);});
          const overflow=[];
          for (const [width,height] of [[1280,720],[1440,900],[1920,1080]]) {
            await page.setViewportSize({width,height});
            const measurement=await page.evaluate(()=>{const el=document.getElementById('descriptionWrapper');return {viewportWidth:innerWidth,documentWidth:document.documentElement.scrollWidth,contentWidth:el.clientWidth,contentScrollWidth:el.scrollWidth,overflowWrap:getComputedStyle(el).overflowWrap};});
            assert.ok(measurement.documentWidth<=measurement.viewportWidth+1);
            assert.ok(measurement.contentScrollWidth<=measurement.contentWidth+1);
            overflow.push(measurement);
          }
          records.push({id:'VF-003',engine,mode,measurements:overflow});
          await page.setViewportSize({width:1280,height:720});
          await page.screenshot({path:path.join(output,`${engine}-long-description-${mode}.png`)});
        } finally { await context.close(); }
      }
      {
        const {page,context}=await helper.setup(engine,'browse','light',{fixture:'audit-feed-menu-reordered',url:'/preferences?section=browsing'});
        try {
          await page.waitForFunction(()=>document.body.dataset.uiInitialized==='true');
          const measurement=await page.evaluate(()=>({configured:JSON.parse(document.getElementById('settings-config').textContent).values.feed_menu,sidebar:Array.from(document.querySelectorAll('.sidebar-link'),el=>({text:el.textContent.trim(),href:el.getAttribute('href')}))}));
          assert.deepEqual(measurement.configured,['Trending','Popular']);
          assert.deepEqual(measurement.sidebar.map(entry=>entry.href),['/feed/trending','/feed/popular','/feed/history','/feed/clips','/preferences?section=appearance']);
          records.push({id:'VF-001',engine,...measurement});
          await page.screenshot({path:path.join(output,`${engine}-feed-menu-reordered.png`)});
        } finally { await context.close(); }
      }
      {
        const {page,context}=await helper.setup(engine,'browse','light',{fixture:'overhaul-browse-light',url:'/feed/popular',javascript:false});
        try {
          const toggleVisible=await page.locator('#sidebar-toggle').isVisible();
          assert.equal(toggleVisible,false);
          await page.locator('.header-account>summary').click();
          const helpVisible=await page.locator('[data-shortcut-help]').isVisible();
          assert.equal(helpVisible,false);
          assert.equal(await page.locator('.app-sidebar').isVisible(),true);
          assert.equal(await page.locator('.header-account a[href="/preferences?section=appearance"]').isVisible(),true);
          records.push({id:'VF-004',engine,toggleVisible,helpVisible,ordinaryAccountMenuOpen:await page.locator('.header-account').evaluate(el=>el.open)});
          await page.screenshot({path:path.join(output,`${engine}-nojs-shell.png`)});
        } finally { await context.close(); }
      }
      for (const [kind,fixture,url] of [
        ['playlist','d4-delete-light','/delete_playlist?list=IVfixture'],
        ['clip','d6-clip-delete-light','/delete_clip?id=ICfixture'],
        ['account','d7-delete-light','/delete_account'],
        ['history','d4-clear-history','/clear_watch_history'],
        ['unsave','d4-unsave-light','/delete_playlist?list=PLfixture']
      ]) {
        const {page,context}=await helper.setup(engine,'browse','light',{fixture,url});
        try {
          await page.waitForFunction(()=>document.body.dataset.uiInitialized==='true');
          const controls=page.locator('main form.toolbar > a,main form.toolbar > button,main form .toolbar > a,main form .toolbar > button');
          const actions=(await controls.allTextContents()).map(value=>value.trim());
          assert.equal(actions.length,2);
          assert.equal(actions[0],'Cancel');
          assert.equal(await controls.nth(1).evaluate(el=>el.matches('button[type=submit].button-danger')),true);
          await page.waitForFunction(()=>document.activeElement.matches('main a[autofocus]'));
          records.push({id:'VF-005',engine,kind,actions,focusedAction:await page.evaluate(()=>document.activeElement.textContent.trim())});
          await page.screenshot({path:path.join(output,`${engine}-confirm-delete-${kind}.png`)});
        } finally { await context.close(); }
      }
      await helper.browsers[engine].close(); delete helper.browsers[engine];
    }
  } finally {
    for (const browser of Object.values(helper.browsers)) await browser.close();
    fs.writeFileSync(path.join(output,'resolution-measurements.json'),JSON.stringify(records,null,2)+'\n');
  }
  console.log(`Verified ${records.length} resolved browser observations in ${output}`);
}
main().catch(error=>{console.error(error);process.exitCode=1;});
