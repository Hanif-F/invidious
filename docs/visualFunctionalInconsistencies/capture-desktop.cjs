'use strict';

// Documentation-only capture utility. Reuses the existing test transport and
// production fixtures; it never contacts the network or changes product files.
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const root = path.resolve(__dirname, '../..');
const tests = path.join(root, 'tests/frontend');
const output = process.env.AUDIT_OUTPUT || path.join(__dirname, 'evidence');
const playwright = require(path.join(tests, 'node_modules/playwright'));
fs.mkdirSync(output, {recursive: true});

function transport() {
  const filename = path.join(tests, 'overhaul.test.cjs');
  let source = fs.readFileSync(filename, 'utf8').split('for(const engine of engines) {')[0];
  source = source.replace("const {test,before,after} = require('node:test');", 'const before=()=>{}, after=()=>{};');
  source = source.replace("if(options.javascript!==false)await page.waitForFunction(()=>document.body.dataset.uiInitialized==='true');", '');
  source += '\nmodule.exports={setup,browsers};';
  const harness = new Module(filename, module);
  harness.filename = filename;
  harness.paths = Module._nodeModulePaths(tests);
  harness._compile(source, filename);
  return harness.exports;
}

function routeFor(name) {
  if (/search-home/.test(name)) return '/';
  if (/chat-settings/.test(name)) return '/preferences?section=chat';
  if (/audit-hashtag/.test(name)) return '/hashtag/light';
  if (/audit-feed-menu/.test(name)) return '/preferences?section=browsing';
  if (/settings-|preferences/.test(name)) return '/preferences?section=' + (name.startsWith('settings-') ? name.slice(9) : 'appearance');
  if (/identity/.test(name)) return '/preferences/dearrow/identity';
  if (/sb-|sponsorblock-channel/.test(name)) return '/preferences/sponsorblock/channels';
  if (/masking|spoiler-editor/.test(name)) return '/preferences/spoilers/channels';
  if (/blocks/.test(name)) return '/blocked_channels';
  if (/create-clip|clip-draft/.test(name)) return '/create_clip?v=2isYuQZMbdU';
  if (/clip-delete/.test(name)) return '/delete_clip?id=ICfixture';
  if (/clip-unavailable|clip-missing|clip-unconfirmed/.test(name)) return '/clip/ICfixture';
  if (/embed/.test(name)) return '/embed/2isYuQZMbdU';
  if (/watch|d5-|d6-comments|contribution|d6-clip-(chat|empty|queue|sync|native)/.test(name)) return '/watch?v=2isYuQZMbdU&list=PLfixture&index=2';
  if (/channel-search/.test(name)) return '/channel/UCfixture/search?q=fixture';
  if (/channel-clips/.test(name)) return '/channel/UCfixture/clips';
  if (/community/.test(name)) return '/channel/UCfixture/community';
  if (/d3-post/.test(name)) return '/post/fixture';
  if (/channel|upstream-shows/.test(name)) return '/channel/UCfixture';
  if (/d4-add/.test(name)) return '/add_playlist_items?list=IVfixture&q=fixture';
  if (/search/.test(name)) return '/search?q=fixture';
  if (/clear-history/.test(name)) return '/clear_watch_history';
  if (/history/.test(name)) return '/feed/history';
  if (/manager/.test(name)) return '/subscription_manager';
  if (/subscriptions/.test(name)) return '/feed/subscriptions';
  if (/d4-create/.test(name)) return '/create_playlist';
  if (/d4-edit/.test(name)) return '/edit_playlist?list=IVfixture';
  if (/d4-delete|d4-unsave/.test(name)) return '/delete_playlist?list=IVfixture';
  if (/d4-library/.test(name)) return '/feed/playlists';
  if (/playlist|d4-mix/.test(name)) return '/playlist?list=IVfixture';
  if (/clips/.test(name)) return '/feed/clips';
  if (/trending/.test(name)) return '/feed/trending';
  if (/admin-settings/.test(name)) return '/admin/settings';
  if (/verify-admin/.test(name)) return '/admin/bot-protection';
  if (/verify/.test(name)) return '/verify';
  if (/signup/.test(name)) return '/signup';
  if (/login/.test(name)) return '/login';
  if (/authorize/.test(name)) return '/authorize_token';
  if (/sessions|token-issued/.test(name)) return '/token_manager';
  if (/d7-delete/.test(name)) return '/delete_account';
  if (/d7-tv/.test(name)) return '/tv';
  if (/d7-data/.test(name)) return '/data_control';
  if (/d7-account/.test(name)) return '/account';
  if (/privacy/.test(name)) return '/privacy';
  if (/licenses/.test(name)) return '/licenses';
  return '/feed/popular';
}

async function inspect(page) {
  return page.evaluate(() => {
    const visible = el => {
      if (!el.getClientRects().length || getComputedStyle(el).visibility === 'hidden') return false;
      for (let parent = el; parent; parent = parent.parentElement) {
        if (parent.tagName === 'DETAILS' && !parent.open && !parent.querySelector(':scope > summary')?.contains(el)) return false;
      }
      return true;
    };
    const identify = el => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 3).join('.') : '');
    const nodes = Array.from(document.querySelectorAll('main *, .app-header *, .app-sidebar *')).filter(visible);
    const outside = nodes.filter(el => { const r = el.getBoundingClientRect(); return r.width > 0 && (r.left < -1 || r.right > innerWidth + 1); }).slice(0, 30).map(identify);
    const clipped = nodes.filter(el => {
      const style = getComputedStyle(el);
      return el.children.length === 0 && el.textContent.trim() && el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 2 && ['hidden', 'clip'].includes(style.overflowX);
    }).slice(0, 30).map(el => ({element: identify(el), text: el.textContent.trim().slice(0, 100)}));
    const unlabeled = Array.from(document.querySelectorAll('input:not([type=hidden]),select,textarea,button,a[href],summary')).filter(visible).filter(el => el.tabIndex >= 0).filter(el => {
      return !el.innerText.trim() && !el.getAttribute('aria-label') && !el.getAttribute('aria-labelledby') && !el.getAttribute('title') && !(el.labels && el.labels.length) && !el.querySelector('img[alt]:not([alt=""])') && el.type !== 'submit' && el.type !== 'reset';
    }).map(identify);
    const ids = Array.from(document.querySelectorAll('[id]'), el => el.id);
    return {title: document.title, width: innerWidth, height: innerHeight, documentWidth: document.documentElement.scrollWidth, documentHeight: document.documentElement.scrollHeight, h1: Array.from(document.querySelectorAll('h1'), el => el.textContent.trim()), outside, clipped, unlabeled, duplicateIds: ids.filter((id, i) => ids.indexOf(id) !== i), bodyText: document.body.innerText};
  });
}

async function main() {
  const helper = transport();
  const engine = process.env.AUDIT_ENGINE || 'chromium';
  helper.browsers[engine] = await playwright[engine].launch({headless: true});
  const files = process.argv.slice(2);
  const generated = process.env.FRONTEND_FIXTURES || path.join(tests, '.generated');
  const names = files.length ? files : fs.readdirSync(generated).filter(name => name.endsWith('.html') && fs.readFileSync(path.join(generated,name),'utf8').includes('/css/foundation.css')).map(name => name.slice(0, -5));
  const records = [];
  try {
    for (const name of names) {
      let context;
      try {
        const mode = /dark$/.test(name) ? 'dark' : 'light';
        const target = routeFor(name);
        const setup = await helper.setup(engine, 'browse', mode, {
          fixture: name, url: target, width: 1440, height: 900, javascript: process.env.AUDIT_NO_JS !== '1',
          reply: entry => {
            // The shared test transport otherwise stubs /embed for community
            // attachments. A top-level embed audit needs the actual document.
            if (entry.navigation && entry.url.pathname === target.split('?')[0]) return {contentType:'text/html',body:fs.readFileSync(path.join(generated,name+'.html'))};
            const match = /^d7-embed-(.+)-(light|dark|rtl)$/.exec(name);
            if (match && entry.url.pathname === '/preferences' && entry.url.searchParams.get('format') === 'runtime') {
              const owner = path.join(generated, `d7-embed-owner-${match[1]}-${match[2]}.json`);
              if (fs.existsSync(owner)) return {contentType:'application/json',body:fs.readFileSync(owner)};
            }
            return null;
          }
        });
        context = setup.context;
        await setup.page.evaluate(() => document.fonts.ready);
        // A bounded settle for local deferred controllers; no upstream requests.
        await setup.page.waitForTimeout(100);
        const views = [];
        for (const [width, height] of [[1280,720], [1440,900], [1920,1080]]) {
          await setup.page.setViewportSize({width, height});
          views.push(await inspect(setup.page));
        }
        await setup.page.setViewportSize({width:1440,height:900});
        if (process.env.AUDIT_SCREENSHOTS !== '0') await setup.page.screenshot({path:path.join(output, `${engine}-${name}.png`), fullPage:true});
        records.push({name, url: routeFor(name), engine, javascript: process.env.AUDIT_NO_JS !== '1', views, errors: setup.errors});
        console.log(`${records.length}/${names.length} ${name}`);
      } catch (error) { records.push({name, engine, captureError:error.message}); console.log(`ERROR ${name}: ${error.message}`); }
      finally { if (context) await context.close(); }
      fs.writeFileSync(path.join(output, `capture-${engine}.json`), JSON.stringify(records,null,2)+'\n');
    }
  } finally { await helper.browsers[engine].close(); }
}
if (require.main === module) main().catch(error => { console.error(error); process.exitCode=1; });
module.exports={transport,routeFor,inspect};
