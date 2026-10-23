'use strict';
(function () {
    var ui = InvidiousUI, region = document.querySelector('[data-browse-region]');
    if (!region || !region.querySelector('[data-browse-items]')) return;
    var privateSearch = ui.config.privateSearch && /(?:^\/search$|\/search$)/.test(location.pathname);
    var next, busy = false, pages = [], seen = new Set(), restored = false;
    var initialURL = location.pathname + location.search;
    var view = !privateSearch && history.state && history.state.ivBrowse;
    if (!view && !privateSearch) {
        view = Date.now().toString(36) + Math.random().toString(36).slice(2);
        history.replaceState(Object.assign({}, history.state, {ivBrowse: view}), '', location.href);
    }
    var controls = document.createElement('div'); controls.className = 'browse-controls';
    var load = document.createElement('button'); load.type = 'button'; load.className = 'pure-button pure-button-primary';
    var status = document.createElement('span'); status.setAttribute('role', 'status');
    controls.append(load, status);
    function descriptor(doc) {
        var container = doc.querySelector('.page-next-container');
        var link = container && container.querySelector('a[href]');
        if (link) return {url: link.getAttribute('href'), method: 'GET'};
        var form = container && container.querySelector('form');
        if (form) {
            var fields = new URLSearchParams();
            form.querySelectorAll('input[name]').forEach(function (input) { fields.append(input.name, input.value); });
            return {url: form.getAttribute('action'), method: 'POST', body: fields.toString()};
        }
        return null;
    }
    function key(item) { return item.method + ':' + item.url + ':' + (item.body || ''); }
    function configure(doc) {
        next = descriptor(doc);
        if (next && seen.has(key(next))) next = null;
        region.querySelectorAll('.page-nav-container').forEach(function (nav) {
            // Keep the first/previous page navigation on a directly opened
            // continuation; appending itself does not add browser history entries.
            var forward = nav.querySelector('.page-next-container');
            if (forward) forward.hidden = true;
            var previous = nav.querySelector('.page-prev-container');
            nav.hidden = !previous || !previous.children.length;
        });
        load.hidden = !next;
        load.textContent = ui.label('load_more');
        ui.status(status, next ? '' : ui.label('end'));
        region.append(controls);
    }
    function save() {
        if (privateSearch || !view || !InvidiousStorage.isCurrent()) return;
        var state = InvidiousStorage.session.get('browse_state') || {views: []};
        state.views = state.views.filter(function (entry) { return entry.id !== view; });
        state.views.push({id: view, url: initialURL, fingerprint: ui.config.browseFingerprint, pages: pages.slice(), scroll: window.scrollY});
        state.views = state.views.slice(-10);
        InvidiousStorage.session.set('browse_state', state);
    }
    function clean(root) {
        root.querySelectorAll('script, .library-checkbox, .playlist-order').forEach(function (element) { element.remove(); });
        return root;
    }
    function append(source) {
        var target = region.querySelector('[data-browse-items]');
        var imported = clean(document.importNode(source, true));
        var first = imported.querySelector('a[href]:not([tabindex="-1"]), button:not([disabled])');
        if (target.classList.contains('history-groups')) {
            Array.from(imported.children).forEach(function (group) {
                var last = target.lastElementChild;
                if (last && last.dataset.historyGroup === group.dataset.historyGroup) {
                    last.querySelector('.media-grid').append(...group.querySelector('.media-grid').children);
                } else target.append(group);
            });
        } else target.append(...imported.childNodes);
        ui.changed(target);
        return first;
    }
    async function fetchPage(item) {
        var options = {html: true, headers: {Accept: 'text/html'}, method: item.method};
        if (item.method === 'POST') options.body = new URLSearchParams(item.body);
        var doc = await ui.request(item.url, options);
        var source = doc.querySelector('[data-browse-items]');
        var config = doc.getElementById('ui-config');
        if (!source || !config) throw new Error(ui.label('error'));
        if (JSON.parse(config.textContent).browseFingerprint !== ui.config.browseFingerprint) {
            ui.invalidate();
            var changed = new Error(ui.label('error')); changed.reload = true; throw changed;
        }
        return doc;
    }
    async function more(item, replay) {
        if (busy || !item || seen.has(key(item))) return false;
        busy = true; load.disabled = true; region.setAttribute('aria-busy', 'true');
        ui.status(status, ui.label('loading'));
        try {
            var doc = await fetchPage(item);
            var first = append(doc.querySelector('[data-browse-items]'));
            seen.add(key(item)); pages.push(item);
            configure(doc);
            if (!replay) {
                if (first) first.focus();
                if (next) ui.status(status, ui.label('results_updated'));
                save();
            }
            return true;
        } catch (error) {
            ui.status(status, ui.label('error'), function () { if (error.reload) location.reload(); else more(item, replay); });
            return false;
        } finally { busy = false; load.disabled = false; region.setAttribute('aria-busy', 'false'); }
    }
    load.onclick = function () { more(next, false); };
    // All filter interactions are explicit form submits or chip clicks. Typing
    // in search never sends a request.
    async function replace(item) {
        if (busy) return;
        busy = true; region.setAttribute('aria-busy', 'true');
        ui.status(status, ui.label('loading'));
        try {
            var doc = await fetchPage(item);
            var content = doc.querySelector('[data-browse-region]');
            region.replaceChildren(...clean(document.importNode(content, true)).childNodes);
            document.title = doc.title;
            var term = new URLSearchParams(item.method === 'POST' ? item.body : new URL(item.url, location.href).search).get('q');
            if (term !== null && document.getElementById('searchbox')) document.getElementById('searchbox').value = term;
            pages = []; seen = new Set([key(item)]);
            if (!privateSearch) {
                view = Date.now().toString(36) + Math.random().toString(36).slice(2);
                history.pushState({ivBrowse: view}, '', item.url);
                initialURL = location.pathname + location.search;
            }
            configure(doc); ui.changed(region); save();
            ui.status(status, ui.label('results_updated'));
            region.focus({preventScroll: true});
        } catch (error) { ui.status(status, ui.label('error'), function () { if (error.reload) location.reload(); else replace(item); }); }
        finally { busy = false; region.setAttribute('aria-busy', 'false'); }
    }
    document.addEventListener('submit', function (event) {
        var form = event.target;
        if (!form.matches('#filters form, .filter-chip, .clear-filters')) return;
        event.preventDefault();
        var fields = new URLSearchParams(new FormData(form));
        if (event.submitter && event.submitter.name) fields.append(event.submitter.name, event.submitter.value);
        var target = new URL(form.action);
        if (privateSearch) replace({url: target.pathname, method: 'POST', body: fields.toString()});
        else { target.search = fields.toString(); replace({url: target.pathname + target.search, method: 'GET'}); }
    });
    document.addEventListener('click', function (event) {
        var link = event.target.closest('.active-filters a, #filters .search-visibility-controls a');
        if (!link || event.button || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
        event.preventDefault(); replace({url: link.getAttribute('href'), method: 'GET'});
    });
    window.addEventListener('pagehide', save);
    document.addEventListener('click', function (event) { if (event.target.closest('a[href]')) save(); }, true);
    window.addEventListener('popstate', function () { location.reload(); });
    document.addEventListener('iv:preferences-change', function () { pages = []; });
    configure(region);
    seen.add(key({url: initialURL, method: privateSearch ? 'POST' : 'GET'}));
    async function restore() {
        if (restored || privateSearch) return;
        restored = true;
        var state = InvidiousStorage.session.get('browse_state');
        var entry = state && state.views.find(function (candidate) {
            return candidate.id === view && candidate.url === initialURL && candidate.fingerprint === ui.config.browseFingerprint;
        });
        if (!entry) return;
        for (var item of entry.pages) { if (!await more(item, true)) return; }
        requestAnimationFrame(function () { window.scrollTo(0, entry.scroll); });
    }
    window.addEventListener('pageshow', function (event) { if (event.persisted) restored = true; else restore(); });
})();
