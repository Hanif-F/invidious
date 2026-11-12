'use strict';
(function () {
    var settings = document.getElementById('dearrow-config'), storage = window.InvidiousStorage;
    if (!settings || !storage || window.InvidiousDeArrow) return;
    var config = JSON.parse(settings.textContent), requests = new Map(), entries = new Map(), seen = new WeakSet();
    var queue = [], jobs = new Set(), observer, visible, epoch = 0, suspended = false, disposed = false, activePage = true;
    var life = new AbortController(), failures = new Set(), state = 'disabled';
    config.enabled = config.enabled !== false;
    function current() { return !disposed && activePage && storage.isCurrent(); }
    function enabled() { return current() && !suspended && config.enabled; }
    function setState(value) {
        if (state === value) return;
        state = value;
        if (window.player && typeof player.trigger === 'function' && (!player.isDisposed || !player.isDisposed())) player.trigger('dearrowstatechange');
    }
    function readState() { setState(disposed || !config.enabled ? 'disabled' : suspended || !activePage ? 'suspended' : jobs.size || queue.length ? 'loading' : failures.size ? 'unavailable' : 'ready'); }
    function finish(job,title,failed) {
        if (job.settled) return;
        job.settled = true; clearTimeout(job.timer); jobs.delete(job);
        if (failed) failures.add(job.id);
        job.resolve(title); readState();
    }
    function cancelReads() {
        epoch++;
        var pending = queue.splice(0).concat(Array.from(jobs));
        pending.forEach(function (job) {
            if (job.controller) job.controller.abort();
            finish(job,null,false);
            if (requests.get(job.id) === job.promise) requests.delete(job.id);
        });
    }
    function pump() {
        if (!enabled()) return;
        while (jobs.size < 4 && queue.length) {
            var job = queue.shift();
            if (job.settled) continue;
            jobs.add(job);
            (function (job) {
                var generation = epoch, controller = job.controller = new AbortController();
                job.timer = setTimeout(function () { controller.abort(); finish(job,null,true); pump(); },10000);
                fetch('/api/v1/dearrow/'+encodeURIComponent(job.id),{credentials:'same-origin',signal:controller.signal})
                    .then(function (response) { if (!response.ok || response.redirected || !storage.checkResponse(response)) throw new Error(); return response.json(); })
                    .then(function (data) {
                        if (!enabled() || generation !== epoch || controller.signal.aborted || job.settled) return;
                        if (!data || !Object.prototype.hasOwnProperty.call(data,'title') || data.title !== null && typeof data.title !== 'string' || typeof data.title === 'string' && data.title.length > 4096) throw new Error();
                        finish(job,typeof data.title === 'string' && data.title.trim() ? data.title : null,false);
                    }).catch(function () { if (enabled() && generation === epoch && !job.settled) finish(job,null,true); })
                    .finally(function () { clearTimeout(job.timer); pump(); });
            })(job);
        }
        readState();
    }
    function request(id) {
        if (!enabled() || !/^[A-Za-z0-9_-]{11}$/.test(id)) return Promise.resolve(null);
        if (!requests.has(id)) {
            var job = {id:id};job.promise = new Promise(function (resolve) { job.resolve = resolve; });
            requests.set(id,job.promise); queue.push(job); pump();
        }
        return requests.get(id) || Promise.resolve(null);
    }
    function display(entry,value) {
        var element = entry.element;
        if (!enabled() || !element.isConnected || element.dataset.spoilerHidden === 'true') return;
        var secondary = element.hasAttribute('data-dearrow-watch') && element.closest('.vjs-overlay') && document.querySelector('.watch-heading [data-dearrow-watch]');
        if (secondary) value = secondary.textContent;
        if (element.textContent !== value) element.textContent = value;
        if (element.hasAttribute('data-dearrow-watch')) {
            if (secondary) return;
            if (window.InvidiousSpoilers) InvidiousSpoilers.displayTitle(value);
            else document.title = value+' - Invidious';
            if (window.player_data) player_data.title = value;
            if (window.shareOptions) shareOptions.title = value;
        }
    }
    function clean(entry,restore) {
        if (entry.life) entry.life.abort();
        if (entry.button) { entry.button.remove(); entry.button = null; }
        var row = entry.element.closest('[data-dearrow-row]');
        if (row && !row.querySelector('.dearrow-reveal')) row.classList.remove('dearrow-title-row');
        delete entry.element.dearrowCleanup; delete entry.element.dataset.dearrowOriginal;
        if (restore && entry.element.dataset.spoilerHidden !== 'true') {
            if (entry.element.textContent !== entry.original) entry.element.textContent = entry.original;
            if (entry.element.hasAttribute('data-dearrow-watch') && (!entry.element.closest('.vjs-overlay') || !document.querySelector('.watch-heading [data-dearrow-watch]'))) {
                display(entry,entry.original);
            }
        }
    }
    function render(entry) {
        if (!entry.replacement || entry.element.dataset.spoilerHidden === 'true') return;
        var showing = entry.showingOriginal;
        display(entry,showing ? entry.original : entry.replacement);
        if (entry.button) {
            entry.button.setAttribute('aria-pressed',String(showing));
            var label = showing ? config.replacementLabel || 'Show DeArrow title' : config.originalLabel || 'Show original title';
            entry.button.setAttribute('aria-label',label);
        }
    }
    function addTitleToggle(entry) {
        var element = entry.element, row = element.closest('[data-dearrow-row]');
        if (!row || entry.button) return;
        var button = entry.button = document.createElement('button'); entry.life = new AbortController();
        button.type = 'button'; button.className = 'dearrow-reveal';
        button.addEventListener('click',function () {
            if (!enabled()) return;
            entry.showingOriginal = !entry.showingOriginal;
            render(entry);
        },{signal:entry.life.signal});
        row.classList.add('dearrow-title-row'); row.appendChild(button);
    }
    function replace(element) {
        if (!enabled()) return;
        var entry = entries.get(element);
        if (!entry) {
            entry = {element:element,showingOriginal:false,original:element.dataset.spoilerOriginal !== undefined ? element.dataset.spoilerOriginal : element.dataset.dearrowOriginal !== undefined ? element.dataset.dearrowOriginal : element.textContent};
            entries.set(element,entry);
        }
        var generation = epoch;
        request(element.dataset.dearrowId).then(function (title) {
            if (!enabled() || generation !== epoch || !element.isConnected || entries.get(element) !== entry || element.dataset.spoilerHidden === 'true') return;
            if (!title || title === entry.original) { clean(entry,true); entry.replacement = null; return; }
            entry.replacement = title; element.dataset.dearrowOriginal = entry.original;
            if (config.showOriginal) addTitleToggle(entry);
            element.dearrowCleanup = function (temporary) {
                clean(entry,false); entry.hiddenByMask = !!temporary;
                if (!temporary) { entries.delete(element); seen.delete(element); if (visible) visible.unobserve(element); }
            };
            render(entry);
        });
    }
    function scan(root) {
        if (!enabled() || !root || root.nodeType !== 1) return;
        var elements = root.matches('[data-dearrow-id]') ? [root] : [];
        if (root.childElementCount) elements = elements.concat(Array.from(root.querySelectorAll('[data-dearrow-id]')));
        elements.forEach(function (element) {
            if (seen.has(element) || !/^[A-Za-z0-9_-]{11}$/.test(element.dataset.dearrowId)) return;
            seen.add(element);
            if (visible && !element.hasAttribute('data-dearrow-watch')) visible.observe(element); else replace(element);
        });
    }
    function rescan(root) {
        if (!root || root.nodeType !== 1) return;
        seen.delete(root); if (root.childElementCount) root.querySelectorAll('[data-dearrow-id]').forEach(function (element) { seen.delete(element); });
        scan(root);
    }
    function disconnect() { if (observer) observer.disconnect(); if (visible) visible.disconnect(); observer = visible = null; }
    function observe() {
        if (!enabled() || observer) return;
        var generation = epoch;
        visible = typeof IntersectionObserver === 'function' ? new IntersectionObserver(function (observations) {
            if (!enabled() || generation !== epoch) return;
            observations.forEach(function (entry) { if (entry.isIntersecting) { visible.unobserve(entry.target); replace(entry.target); } });
        },{rootMargin:'200px'}) : null;
        observer = new MutationObserver(function (records) {
            if (!enabled() || generation !== epoch) return;
            var roots = new Set();
            records.forEach(function (record) { record.addedNodes.forEach(function (node) { if (node.nodeType === 1 && node.isConnected) roots.add(node); }); });
            entries.forEach(function (entry,element) { if (!element.isConnected) { clean(entry,true); entries.delete(element); seen.delete(element); if (visible) visible.unobserve(element); } });
            roots.forEach(function (root) { for (var parent=root.parentElement;parent;parent=parent.parentElement) if (roots.has(parent)) return;scan(root); });
        });
        observer.observe(document.body,{childList:true,subtree:true});
    }
    function suspend() {
        if (disposed || suspended) return;
        suspended = true; cancelReads(); disconnect();
        entries.forEach(function (entry) { if (entry.button) entry.button.disabled = true; }); readState();
    }
    function resume() {
        if (!current() || !suspended) return;
        suspended = false;
        entries.forEach(function (entry) { if (entry.button) entry.button.disabled = false; });
        seen = new WeakSet(); observe(); scan(document.body); readState();
    }
    // A confirmed contribution affects only this video's title in this document.
    function invalidate(id) {
        if (!enabled() || !/^[A-Za-z0-9_-]{11}$/.test(id)) return;
        var affected = queue.filter(function (job) { return job.id === id; }).concat(Array.from(jobs).filter(function (job) { return job.id === id; }));
        queue = queue.filter(function (job) { return job.id !== id; });
        affected.forEach(function (job) { if (job.controller) job.controller.abort(); finish(job,null,false); });
        requests.delete(id); failures.delete(id);
        document.querySelectorAll('[data-dearrow-id]').forEach(function (element) {
            if (element.dataset.dearrowId !== id) return;
            var entry = entries.get(element);
            if (entry) { clean(entry,true); entries.delete(element); }
            seen.delete(element);
            if (window.InvidiousSpoilers) InvidiousSpoilers.invalidateTitle(element);
            scan(element);
        });
        pump();
    }
    function dispose() {
        if (disposed) return;
        suspend(); disposed = true; activePage = false; life.abort(); requests.clear(); failures.clear(); queue = [];
        entries.forEach(function (entry) { clean(entry,false); if (!window.InvidiousSpoilers) entry.element.hidden = true; }); entries.clear(); setState('disabled');
    }
    function forget(element) {
        var entry = entries.get(element);
        if (entry) { clean(entry,false); entries.delete(element); }
        seen.delete(element); if (visible) visible.unobserve(element);
    }
    var api = window.InvidiousDeArrow = {invalidate:invalidate,suspend:suspend,dispose:dispose,rescan:rescan,forget:forget,request:request,readState:function () { return state; },retry:function () {
        if (!enabled() || !failures.size) return;
        failures.forEach(function (id) { requests.delete(id); }); failures.clear(); seen = new WeakSet(); scan(document.body); readState();
    }};
    if (window.InvidiousSpoilers) InvidiousSpoilers.bindDeArrow(request);
    window.addEventListener('pagehide',function (event) { activePage = false; suspend(); if (!event.persisted) dispose(); },{signal:life.signal});
    window.addEventListener('pageshow',function () { activePage = !disposed; resume(); },{signal:life.signal});
    window.addEventListener('browserprofilechange',dispose,{signal:life.signal});
    if (config.enabled) { observe(); scan(document.body); } readState();
}());
