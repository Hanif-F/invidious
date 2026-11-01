'use strict';
// Explicit reads append into one owned listing. Filters, tabs, chips and search
// forms keep normal navigation; private POST queries live only in this page.
(function () {
    var ui = InvidiousUI, region = document.querySelector('[data-browse-region]');
    if (window.InvidiousBrowse || !region || !region.querySelector('[data-browse-items]')) return;
    var controls = region.querySelector('[data-browse-controls]');
    if (!controls) return;
    var load = controls.querySelector('[data-load-more]'), status = controls.querySelector('[data-browse-status]');
    var lifetime = new AbortController(), pending, scrollFrame;
    var privateSearch = ui.config.privateBrowse || (ui.config.privateSearch && /(?:^\/search$|\/search$|^\/add_playlist_items$)/.test(location.pathname));
    var next, busy = false, pages = [], seen = new Set(), restoreEntry, recordable = true;
    var managed = false, canonicalPending = false, stale = false, activePage = true;
    var initialURL = location.pathname + location.search;
    var view = !privateSearch && history.state && history.state.ivBrowse;
    if (!view && !privateSearch) {
        view = Date.now().toString(36) + Math.random().toString(36).slice(2);
        history.replaceState(Object.assign({}, history.state, {ivBrowse:view}), '', location.href);
    }
    function on(target, type, callback, options) {
        target.addEventListener(type, callback, Object.assign({signal:lifetime.signal}, options));
    }
    function alive() { return activePage && !lifetime.signal.aborted && region.isConnected; }
    function normalize(item) {
        var url = new URL(item.url, location.href);
        if (url.origin !== location.origin || url.pathname !== location.pathname || !['GET','POST'].includes(item.method)) throw new Error(ui.label('error'));
        return {url:url.pathname + url.search, method:item.method, ...(item.method === 'POST' ? {body:item.body || ''} : {})};
    }
    function descriptor(doc) {
        var container = doc.querySelector('.page-next-container');
        var link = container && container.querySelector('a[href]');
        if (link) return normalize({url:link.getAttribute('href'),method:'GET'});
        var form = container && container.querySelector('form');
        if (!form) return null;
        var fields = new URLSearchParams();
        form.querySelectorAll('input[name]').forEach(function (input) { fields.append(input.name,input.value); });
        return normalize({url:form.getAttribute('action'),method:'POST',body:fields.toString()});
    }
    function key(item) {
        var url = new URL(item.url,location.href); url.searchParams.sort();
        return item.method + ':' + url.pathname + url.search + ':' + (item.body || '');
    }
    function configure(doc, upcoming) {
        controls.hidden = false;
        next = upcoming;
        if (next && seen.has(key(next))) next = null;
        var bounded = pages.length >= 100;
        region.querySelectorAll('.page-nav-container').forEach(function (nav) {
            var forward = nav.querySelector('.page-next-container');
            var source = doc.querySelector('.page-next-container');
            if (forward && source && forward !== source) forward.replaceChildren(...Array.from(source.children).map(function (child) { return document.importNode(child,true); }));
            if (forward) forward.hidden = !bounded || !next;
            var previous = nav.querySelector('.page-prev-container');
            nav.hidden = !(previous && previous.children.length) && !(bounded && next);
        });
        load.hidden = !next || bounded; load.textContent = ui.label('load_more');
        ui.status(status,bounded && next ? (controls.dataset.limitLabel || ui.label('load_more')) : next ? '' : ui.label('end'));
        var items = region.querySelector('[data-browse-items]');
        region.querySelectorAll('[data-browse-empty]').forEach(function (empty) { empty.hidden = !!items.querySelector('.media-item'); });
        if (!items.id) items.id = 'browse-results';
        load.setAttribute('aria-controls',items.id);
        region.append(controls);
    }
    function save() {
        if (privateSearch || canonicalPending || !recordable || !view || !InvidiousStorage.isCurrent()) return;
        var state = InvidiousStorage.session.get('browse_state') || {views:[]};
        state.views = state.views.filter(function (entry) { return entry.id !== view; });
        if (pages.every(function (item) { return item.method === 'GET'; })) {
            state.views.push({id:view,url:initialURL,fingerprint:ui.config.browseFingerprint,pages:pages.slice(),scroll:window.scrollY});
        }
        state.views = state.views.slice(-10);
        InvidiousStorage.session.set('browse_state',state);
    }
    function clean(root) {
        root.querySelectorAll('script, .playlist-order').forEach(function (node) { node.remove(); });
        return root;
    }
    function append(source) {
        var target = region.querySelector('[data-browse-items]');
        var imported = clean(document.importNode(source,true));
        var first = imported.querySelector('.media-title a, a[href]:not([tabindex="-1"]), button:not([disabled])');
        // Occurrences are never deduplicated by video ID.
        if (target.classList.contains('history-groups')) {
            Array.from(imported.children).forEach(function (group) {
                var last = target.lastElementChild;
                if (last && last.dataset.historyGroup === group.dataset.historyGroup) {
                    last.querySelector('.media-rows, .media-grid').append(...group.querySelector('.media-rows, .media-grid').children);
                } else target.append(group);
            });
        } else target.append(...imported.childNodes);
        ui.changed(target); return first;
    }
    function changed() { var error = new Error(ui.label('error')); error.reload = true; return error; }
    async function fetchPage(item, signal) {
        if (!InvidiousStorage.isCurrent()) throw changed();
        var options = {html:true,headers:{Accept:'text/html'},method:item.method,signal:signal};
        if (item.method === 'POST') options.body = new URLSearchParams(item.body);
        var doc = await ui.request(item.url,options);
        if (!InvidiousStorage.isCurrent()) throw changed();
        if (!doc.querySelector('[data-browse-items]') || !doc.getElementById('ui-config')) throw new Error(ui.label('error'));
        if (JSON.parse(doc.getElementById('ui-config').textContent).browseFingerprint !== ui.config.browseFingerprint) {
            throw changed();
        }
        return {doc:doc,next:descriptor(doc)};
    }
    async function more(item, replay) {
        if (!alive() || canonicalPending || stale || busy || !item || seen.has(key(item)) || pages.length >= 100) return false;
        var origin = document.activeElement;
        busy = true; load.disabled = true; region.setAttribute('aria-busy','true'); ui.status(status,ui.label('loading'));
        var request = pending = new AbortController();
        try {
            item = normalize(item);
            var result = await fetchPage(item,request.signal);
            if (!alive() || request.signal.aborted) return false;
            var previousScroll = window.scrollY;
            var first = append(result.doc.querySelector('[data-browse-items]'));
            window.scrollTo(0,previousScroll);
            seen.add(key(item)); pages.push(item); configure(result.doc,result.next);
            if (!replay) {
                if (first && (document.activeElement === origin || (document.activeElement === document.body && origin === load))) first.focus({preventScroll:true});
                if (next) ui.status(status,ui.label('results_updated'));
                save();
            }
            return true;
        } catch (error) {
            if (!InvidiousStorage.isCurrent()) error = changed();
            if (alive() && !request.signal.aborted) ui.status(status,error.reload ? (controls.dataset.changedLabel || ui.label('error')) : ui.label('error'),function () {
                if (error.reload) location.reload(); else if (replay && restoreEntry) resumeRestore(); else more(item,false);
            });
            if (error.reload) { stale = true; recordable = false; load.hidden = true; ui.invalidate(); }
            return false;
        } finally {
            if (pending === request) {
                pending = null; busy = false;
                if (alive()) { load.disabled = canonicalPending || stale; region.setAttribute('aria-busy','false'); }
            }
        }
    }
    async function resumeRestore() {
        if (canonicalPending || stale || busy || !restoreEntry || !alive()) return;
        var entry = restoreEntry;
        while (pages.length < entry.pages.length) {
            if (!await more(entry.pages[pages.length],true)) return;
        }
        restoreEntry = null;
        scrollFrame = requestAnimationFrame(function () { if (alive() && InvidiousStorage.isCurrent()) window.scrollTo(0,entry.scroll); });
    }
    on(load,'click',function () { restoreEntry = null; more(next,false); });
    on(document,'click',function (event) { if (event.target.closest('a[href]')) save(); },{capture:true});
    function suspend() {
        if (lifetime.signal.aborted) return;
        canonicalPending = true;
        if (pending) { pending.abort(); pending = null; }
        busy = false; load.disabled = true; region.setAttribute('aria-busy','false'); cancelAnimationFrame(scrollFrame);
        if (alive()) ui.status(status,ui.label('loading'));
    }
    function requireRefresh() {
        InvidiousStorage.session.remove('browse_state');
        stale = true; recordable = false; pages = []; restoreEntry = null; load.hidden = true; load.disabled = true;
        region.querySelectorAll('.page-nav-container').forEach(function (navigation) { navigation.hidden = true; });
        controls.hidden = false;
        ui.status(status,controls.dataset.changedLabel || ui.label('error'),function () { if (alive() && InvidiousStorage.isCurrent()) location.reload(); });
    }
    function applyOwner(value) {
        if (!alive() || !InvidiousStorage.isCurrent()) return false;
        var fingerprint = location.pathname === '/feed/history' ? value.historyFingerprint : value.browseFingerprint;
        if (typeof fingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(fingerprint) || typeof ui.config.ownerBrowseFingerprint !== 'string') return false;
        canonicalPending = false;
        if (stale || fingerprint !== ui.config.ownerBrowseFingerprint) requireRefresh();
        else {
            configure(region,next); load.disabled = false; save();
            if (restoreEntry) resumeRestore();
        }
        return true;
    }
    function dispose() {
        if (lifetime.signal.aborted) return;
        suspend(); activePage = false; lifetime.abort(); pages = []; seen.clear(); restoreEntry = null;
    }
    on(document,'iv:preferences-change',function () { if (managed) suspend(); else { suspend(); requireRefresh(); } });
    on(window,'pagehide',function (event) {
        save();
        activePage = false;
        if (pending) { pending.abort(); pending = null; busy = false; region.setAttribute('aria-busy','false'); load.disabled = canonicalPending || stale; ui.status(status,''); }
        cancelAnimationFrame(scrollFrame);
        if (!event.persisted) dispose();
    });
    on(window,'pageshow',function (event) {
        activePage = true;
        if (!busy) { region.setAttribute('aria-busy','false'); load.disabled = canonicalPending || stale; }
        if (event.persisted || privateSearch) return;
        var state = InvidiousStorage.session.get('browse_state');
        restoreEntry = state && state.views.find(function (entry) { return entry.id === view && entry.url === initialURL && entry.fingerprint === ui.config.browseFingerprint; });
        resumeRestore();
    });
    try { configure(region,descriptor(region)); }
    catch (_) { load.hidden = true; ui.status(status,ui.label('error')); }
    seen.add(key({url:initialURL,method:privateSearch ? 'POST' : 'GET'}));
    on(window,'browserprofilechange',dispose);
    window.InvidiousBrowse = {setManaged:function () { managed = true; },suspend:suspend,apply:applyOwner,dispose:dispose};
})();
