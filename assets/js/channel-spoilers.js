'use strict';
(function () {
    var settings = document.getElementById('channel-spoiler-config'), storage = window.InvidiousStorage;
    if (!settings || !storage || window.InvidiousSpoilers) return;
    var config = JSON.parse(settings.textContent), rules = config.rules, requestTitle, playerMask;
    var titles = new Map(), thumbnails = new Map(), observer, life = new AbortController();
    var suspended = false, disposed = false, mainDisplay;
    if (storage.scope === 'guest') { rules = storage.local.get('channel_spoiler_settings') || {}; config.now = Math.floor(Date.now()/1000); }
    function current() { return !disposed && storage.isCurrent(); }
    function text(element,value) { if (element.textContent !== value) element.textContent = value; }
    function attribute(element,name,value) { if (element.getAttribute(name) !== value) element.setAttribute(name,value); }
    function decision(channel,published,kind) {
        var rule = rules[channel], known = Number.isFinite(published) && published >= 1104537600;
        return {hidden:suspended || !!rule && !!rule['hide_'+kind] && (rule.reveal_after_days === null || rule.reveal_after_days === undefined || !known || config.now < published+rule.reveal_after_days*86400),
            label:config.labels[kind+'_hidden'+(known?'':'_unknown')]};
    }
    function state(element,kind) {
        return decision(element.dataset.spoilerChannel,element.dataset.spoilerPublished ? Number(element.dataset.spoilerPublished) : NaN,kind);
    }
    function setDocumentTitle(value) {
        var display = value + ' - Invidious';
        var titleElement = document.head.querySelector('title');
        // The document.title getter collapses whitespace. Compare the raw text
        // so the observer does not keep reacting to its own writes.
        if (!titleElement || titleElement.textContent !== display) document.title = display;
    }
    function updateMain(value) {
        mainDisplay = value;
        setDocumentTitle(value);
        if (window.player_data) window.player_data.title = value;
        if (window.shareOptions) window.shareOptions.title = value;
        document.querySelectorAll('.vjs-overlay [data-spoiler-title]').forEach(function (element) { text(element,value); });
    }
    function identity(element,kind,result) {
        var rule = rules[element.dataset.spoilerChannel];
        return JSON.stringify([rule && rule['hide_'+kind],rule && rule.reveal_after_days,result.hidden,result.label,kind==='title'&&config.dearrow]);
    }
    function signature(channel,published,kind) {
        var rule = rules[channel], result = decision(channel,published,kind);
        return JSON.stringify([rule && rule['hide_'+kind],rule && rule.reveal_after_days,result.hidden,result.label,kind==='title'&&config.dearrow]);
    }
    function original(element) { return element.dataset.spoilerOriginal !== undefined ? element.dataset.spoilerOriginal : element.dataset.dearrowOriginal !== undefined ? element.dataset.dearrowOriginal : element.textContent; }
    function primary(element) { return !element.closest('.vjs-overlay') || !document.querySelector('.watch-heading [data-dearrow-watch]'); }
    function resetDeArrow(element,temporary) {
        if (element.dearrowCleanup) { element.dearrowCleanup(temporary); delete element.dearrowCleanup; }
        delete element.dataset.dearrowOriginal;
    }
    function title(element) {
        var entry = titles.get(element), result = state(element,'title');
        if (!entry) { entry = {original:original(element),index:0,replacement:null,serial:0,loading:false,identity:null}; titles.set(element,entry); }
        var nextIdentity = identity(element,'title',result);
        // Lifecycle suspension retains each occurrence's reveal choice.
        if (!suspended && entry.identity !== nextIdentity) {
            entry.index = 0; entry.replacement = null; entry.loading = false; entry.serial++; entry.identity = nextIdentity;
        }
        attribute(element,'data-spoiler-hidden',String(result.hidden));
        if (!result.hidden) {
            if (entry.button) { entry.buttonLife.abort(); entry.button.remove(); entry.button = null; }
            var restoredRow = element.closest('[data-dearrow-row]');
            if (restoredRow && !restoredRow.querySelector('.dearrow-reveal')) restoredRow.classList.remove('dearrow-title-row');
            if (entry.masked) {
                resetDeArrow(element); text(element,entry.original); entry.masked = false;
                if (element.hasAttribute('data-dearrow-watch') && primary(element)) updateMain(entry.original);
                if (window.InvidiousDeArrow) InvidiousDeArrow.rescan(element);
            }
            return;
        }
        resetDeArrow(element,suspended); entry.masked = true;
        var row = element.closest('[data-dearrow-row]');
        function show() {
            var value = suspended || entry.index === 0 ? result.label : entry.index === 1 && entry.replacement ? entry.replacement : entry.original;
            if (element.hasAttribute('data-dearrow-watch') && !primary(element)) value = mainDisplay || result.label;
            text(element,value);
            if (entry.button) {
                entry.button.disabled = suspended || entry.loading;
                attribute(entry.button,'aria-label',entry.loading ? config.labels.loading : entry.index === 0 ? config.labels.reveal_title : entry.index === 1 && entry.replacement ? config.labels.next_original : config.labels.hide_title);
                attribute(entry.button,'aria-pressed',String(!suspended && entry.index !== 0));
            }
            if (element.hasAttribute('data-dearrow-watch') && primary(element)) updateMain(value);
        }
        entry.show = show;
        if (row && !entry.button) {
            var button = entry.button = document.createElement('button');
            entry.buttonLife = new AbortController();
            button.type = 'button'; button.className = 'dearrow-reveal spoiler-title-reveal';
            if (document.body && document.body.dataset.page === 'watch' && window.InvidiousPlayerInterface) button.append(InvidiousPlayerInterface.icon('rotate-cw'));
            row.classList.add('dearrow-title-row'); row.appendChild(button);
            button.addEventListener('click',function () {
                if (!current() || suspended || entry.loading || !element.isConnected) return;
                if (entry.index !== 0) { entry.index = entry.index === 1 && entry.replacement ? 2 : 0; entry.show(); return; }
                if (!config.dearrow || !requestTitle || !element.dataset.dearrowId) { entry.index = 2; entry.show(); return; }
                entry.loading = true; var serial = ++entry.serial; entry.show();
                Promise.resolve(requestTitle(element.dataset.dearrowId)).then(function (replacement) {
                    if (!current() || suspended || entry.serial !== serial || !element.isConnected) return;
                    entry.replacement = replacement && replacement !== entry.original ? replacement : null;
                    entry.index = entry.replacement ? 1 : 2;
                }).catch(function () { /* Keep the title hidden after a failed reveal. */ }).finally(function () {
                    if (!current() || entry.serial !== serial || !element.isConnected) return;
                    entry.loading = false; entry.show();
                });
            },{signal:entry.buttonLife.signal});
        }
        show();
    }
    function thumbnail(element) {
        var entry = thumbnails.get(element), result = state(element,'thumbnail');
        if (!entry) {
            entry = {identity:null,revealed:false,life:new AbortController(),normal:element.querySelector('.spoiler-placeholder') ? null : Array.from(element.childNodes,function (node) { return node.cloneNode(true); })};
            thumbnails.set(element,entry);
            var link = element.closest('a'), target = link || element;
            entry.target = target; entry.label = target.getAttribute('aria-label'); entry.tabindex = target.getAttribute('tabindex'); entry.role = element.getAttribute('role');
            function reveal(event) {
                if (!current() || suspended || element.dataset.spoilerHidden !== 'true') return;
                if (link && event.type === 'click' && event.target !== element && !element.contains(event.target) && event.detail !== 0) return;
                event.preventDefault(); event.stopImmediatePropagation(); entry.revealed = true; thumbnail(element);
            }
            target.addEventListener('click',reveal,{capture:true,signal:entry.life.signal});
            target.addEventListener('keydown',function (event) { if ((!link || event.target === link) && (event.key === 'Enter' || event.key === ' ')) reveal(event); },{signal:entry.life.signal});
        }
        var nextIdentity = identity(element,'thumbnail',result);
        if (!suspended && entry.identity !== nextIdentity) { entry.revealed = false; entry.identity = nextIdentity; }
        var hidden = result.hidden && (suspended || !entry.revealed);
        attribute(element,'data-spoiler-hidden',String(hidden));
        if (hidden) {
            var placeholder = element.firstElementChild;
            if (!placeholder || !placeholder.classList.contains('spoiler-placeholder')) {
                placeholder = document.createElement('span'); placeholder.className = 'spoiler-placeholder'; element.replaceChildren(placeholder);
            }
            text(placeholder,result.label);
            attribute(element,'aria-label',config.labels.reveal_thumbnail); attribute(entry.target,'aria-label',config.labels.reveal_thumbnail);
            if (entry.target === element) attribute(element,'role','button'); entry.target.tabIndex = 0;
        } else {
            if (element.querySelector('.spoiler-placeholder')) {
                if (entry.normal) element.replaceChildren(...entry.normal.map(function (node) { return node.cloneNode(true); }));
                else { var image = document.createElement('img'); image.src = element.dataset.spoilerOriginal; image.alt = ''; image.className = 'thumbnail'; element.replaceChildren(image); }
            }
            element.removeAttribute('aria-label');
            if (entry.label === null) entry.target.removeAttribute('aria-label'); else attribute(entry.target,'aria-label',entry.label);
            if (entry.tabindex === null) entry.target.removeAttribute('tabindex'); else attribute(entry.target,'tabindex',entry.tabindex);
            if (entry.role === null) element.removeAttribute('role'); else attribute(element,'role',entry.role);
        }
    }
    function metadata() {
        if (!config.page) return;
        var titleState = decision(config.page.channel,config.page.published,'title'), imageState = decision(config.page.channel,config.page.published,'thumbnail');
        var display = titleState.hidden ? mainDisplay || titleState.label : mainDisplay || config.page.title;
        if (display) setDocumentTitle(display);
        document.querySelectorAll('meta').forEach(function (element) {
            var name = element.getAttribute('property') || element.getAttribute('name');
            if (['og:title','twitter:title'].includes(name)) attribute(element,'content',titleState.hidden ? titleState.label : config.page.title);
            if (['thumbnail','og:image','twitter:image'].includes(name)) attribute(element,'content',imageState.hidden ? '' : config.page.thumbnail);
        });
        // Download forms may move into the dialog. Their submitted filename is
        // an auxiliary title surface and must stay generic while masked/unknown.
        document.querySelectorAll('#download-options input[type="hidden"][name="title"]').forEach(function (element) {
            attribute(element,'value',titleState.hidden ? titleState.label : config.page.title);
        });
        if (playerMask) playerMask(imageState.hidden);
    }
    function scan(root) {
        if (disposed || !root || root.nodeType !== 1 || !suspended && !Object.keys(rules).length) return;
        function visit(element) {
            if (element.hasAttribute('data-spoiler-title')) title(element);
            if (element.hasAttribute('data-spoiler-thumbnail')) thumbnail(element);
        }
        visit(root);
        if (root.childElementCount) root.querySelectorAll('[data-spoiler-title], [data-spoiler-thumbnail]').forEach(visit);
        if (root.tagName === 'TITLE' || root.tagName === 'META') metadata();
    }
    function watch() {
        if (observer || disposed) return;
        observer = new MutationObserver(function (records) {
            var roots = new Set();
            records.forEach(function (record) {
                if (record.target.nodeType === 1 && record.target.tagName === 'TITLE') roots.add(record.target);
                record.addedNodes.forEach(function (node) { if (node.nodeType === 1 && node.isConnected) roots.add(node); });
            });
            titles.forEach(function (entry,element) { if (!element.isConnected) { entry.serial++; if (entry.button) { entry.buttonLife.abort(); entry.button.remove(); } titles.delete(element); } });
            thumbnails.forEach(function (entry,element) { if (!element.isConnected) { entry.life.abort(); thumbnails.delete(element); } });
            roots.forEach(function (root) {
                for (var parent = root.parentElement; parent; parent = parent.parentElement) if (roots.has(parent)) return;
                scan(root);
            });
        });
        observer.observe(document.documentElement,{childList:true,subtree:true});
    }
    function refresh() {
        if (suspended || Object.keys(rules).length) { watch(); scan(document.documentElement); }
        // A removed last rule must also restore previously masked elements.
        titles.forEach(function (_,element) { if (element.isConnected) title(element); });
        thumbnails.forEach(function (_,element) { if (element.isConnected) thumbnail(element); }); metadata();
        if (!suspended && !Object.keys(rules).length && observer) { observer.disconnect(); observer = null; }
        document.dispatchEvent(new CustomEvent('iv:masking-change',{detail:{suspended:suspended}}));
    }
    function resume() {
        if (!current() || !suspended) return;
        suspended = false; refresh();
    }
    function suspend() {
        if (disposed || suspended || !Object.keys(rules).length) return;
        suspended = true; mainDisplay = null;
        titles.forEach(function (entry) { entry.serial++; entry.loading = false; }); refresh();
    }
    function dispose() {
        if (disposed) return;
        suspend(); disposed = true; life.abort(); if (observer) observer.disconnect(); observer = null;
        titles.forEach(function (entry) { if (entry.buttonLife) entry.buttonLife.abort(); });
        thumbnails.forEach(function (entry) { entry.life.abort(); });
        titles.clear(); thumbnails.clear(); requestTitle = playerMask = null;
    }
    var api = window.InvidiousSpoilers = {
        replacementRevealLabel:config.labels.next_dearrow,decision:decision,signature:signature,isSuspended:function () { return suspended; },scan:scan,suspend:suspend,dispose:dispose,
        invalidateTitle:function (element) {
            var entry = titles.get(element);
            if (entry) { entry.serial++; entry.loading = false; entry.replacement = null; entry.index = 0; title(element); }
        },
        bindDeArrow:function (request) { requestTitle = request; },
        bindPlayer:function (apply) { playerMask = apply; metadata(); },displayTitle:updateMain,
        player:function (data,channel,published) {
            var titleState = decision(channel,published,'title'), imageState = decision(channel,published,'thumbnail');
            if (titleState.hidden) { data.title = titleState.label; setDocumentTitle(data.title); }
            if (imageState.hidden) data.thumbnail = '';
            data.spoiler_thumbnail_hidden = imageState.hidden; return data;
        }
    };
    window.addEventListener('pagehide',function (event) { suspend(); if (!event.persisted) dispose(); },{signal:life.signal});
    window.addEventListener('pageshow',resume,{signal:life.signal});
    window.addEventListener('browserprofilechange',dispose,{signal:life.signal});
    if (Object.keys(rules).length) refresh();
}());
