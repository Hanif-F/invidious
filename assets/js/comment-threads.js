'use strict';
// Watch, community and post pages share one read-only thread owner.
(function () {
    var node = document.getElementById('comment-threads-config');
    if (!node) return;
    var config = JSON.parse(node.textContent), ui = InvidiousUI;
    var root = document.getElementById(config.target), lifetime = new AbortController();
    if (!root || root.dataset.threadInitialized) return;
    root.dataset.threadInitialized = 'true'; document.documentElement.classList.add('iv-thread-js');
    var owners = new WeakMap(), active = new Set(), activePage = true, epoch = 0, topNeeded = config.initial === true;
    var source = config.watch ? document.getElementById('comment-source') : null, sort = config.watch ? document.getElementById('comment-sort') : null;
    var sourceLink = config.watch ? document.getElementById('comment-source-link') : null;
    var sorts = {youtube:'top'}; if (config.initialSort) sorts[currentSource()] = config.initialSort;
    function alive(owner) { return activePage && !lifetime.signal.aborted && InvidiousStorage.isCurrent() && root.isConnected && owner.isConnected; }
    function statusFor(owner) {
        var status = owner.querySelector(':scope > [data-thread-status]');
        if (!status) { status = document.createElement('p'); status.className = 'thread-status'; status.dataset.threadStatus = ''; status.setAttribute('role','status'); owner.append(status); }
        return status;
    }
    function fragment(html) {
        if (typeof html !== 'string') throw new Error(ui.label('error'));
        var template = document.createElement('template'); template.innerHTML = html;
        template.content.querySelectorAll('script').forEach(function (script) { script.remove(); });
        return template.content;
    }
    function release(entry, clearStatus) {
        if (owners.get(entry.owner) !== entry) return;
        owners.delete(entry.owner); active.delete(entry);
        if (entry.owner.isConnected) entry.owner.setAttribute('aria-busy','false');
        if (entry.button && entry.button.isConnected) { entry.button.disabled = false; entry.button.removeAttribute('aria-busy'); }
        if (clearStatus && entry.status.isConnected) ui.status(entry.status,'');
    }
    function cancelAll() {
        epoch++;
        Array.from(active).forEach(function (entry) { entry.controller.abort(); release(entry,true); });
    }
    function currentSource() { return 'youtube'; }
    function metadata(data) {
        var heading = document.getElementById(config.heading);
        if (heading) heading.textContent = Number.isFinite(data.commentCount) && data.commentCount >= 0 ? config.countText.replace('{count}',data.commentCount.toLocaleString()) : config.headingText;
        if (!sourceLink) return;
        sourceLink.replaceChildren();

    }
    async function read(owner, button, loadMore, loadReplies, initial) {
        if (!alive(owner) || owners.has(owner)) return;
        if (initial && config.watch && currentSource() === 'youtube' && !config.youtubeEnabled) {
            ui.status(statusFor(root),config.disabledText); topNeeded = false; return;
        }
        var origin = document.activeElement, status = statusFor(owner), continuation = button && button.dataset.continuation;
        var entry = {owner:owner,button:button,status:status,controller:new AbortController(),epoch:epoch}; owners.set(owner,entry); active.add(entry);
        if (button) { button.disabled = true; button.setAttribute('aria-busy','true'); }
        owner.setAttribute('aria-busy','true'); ui.status(status,ui.label('loading'));
        try {
            var url = new URL(config.baseUrl,location.href);
            url.searchParams.set('format','html'); url.searchParams.set('hl',config.locale); url.searchParams.set('thin_mode',String(config.thinMode === true));
            if (config.ucid) url.searchParams.set('ucid',config.ucid);
            if (config.watch) { url.searchParams.set('source',currentSource()); url.searchParams.set('sort_by',sort.value); }
            if (continuation !== undefined && continuation !== null) url.searchParams.set('continuation',continuation);
            if (loadReplies) url.searchParams.set('action','action_get_comment_replies');
            var data = await ui.request(url.pathname + url.search,{signal:entry.controller.signal});
            if (!alive(owner) || entry.controller.signal.aborted || owners.get(owner) !== entry || entry.epoch !== epoch) return;
            var content = fragment(data.contentHtml), focus = content.querySelector('.comment-author a');
            var returnFocus = !initial && (document.activeElement === origin || (document.activeElement === document.body && origin === button));
            if (initial) {
                owner.replaceChildren(content); metadata(data); topNeeded = false;
                if (!owner.childElementCount) ui.status(statusFor(owner),config.empty);
            } else if (loadMore) {
                owner.before(content); owner.remove();
            } else {
                var toggle = document.createElement('button'); toggle.type = 'button'; toggle.className = 'text-button';
                toggle.dataset.threadToggle = ''; toggle.setAttribute('aria-expanded','true'); toggle.textContent = config.hideReplies;
                var children = document.createElement('div'); children.dataset.threadItems = ''; children.append(content);
                if (!children.childElementCount) ui.status(statusFor(children),config.empty);
                owner.replaceChildren(toggle,children); focus = toggle;
            }
            ui.changed(root);
            if (returnFocus && focus && focus.isConnected) focus.focus({preventScroll:true});
        } catch (error) {
            if (alive(owner) && !entry.controller.signal.aborted && entry.epoch === epoch && owners.get(owner) === entry) {
                if (initial) topNeeded = false;
                ui.status(status,error.status === 404 ? config.unavailable : ui.label('error'),function () { read(owner,button,loadMore,loadReplies,initial); });
            }
        } finally { release(entry,false); }
    }
    window.get_youtube_replies = function (button, loadMore, loadReplies) {
        if (!root.contains(button)) return;
        var owner = button.closest(loadMore ? '[data-comment-more]' : '[data-comment-replies]');
        if (owner) read(owner,button,loadMore,loadReplies,false);
    };
    root.addEventListener('click',function (event) {
        var button = event.target.closest('[data-thread-toggle]');
        if (!button || !alive(button)) return;
        var items = button.parentNode.querySelector(':scope > [data-thread-items]');
        if (!items) return;
        items.hidden = !items.hidden; button.setAttribute('aria-expanded',String(!items.hidden));
        button.textContent = items.hidden ? config.showReplies : config.hideReplies;
    },{signal:lifetime.signal});
    function startTop() {
        if (!alive(root)) return;
        cancelAll(); topNeeded = true; root.replaceChildren();
        var heading = document.getElementById(config.heading); if (heading) heading.textContent = config.headingText;
        if (sourceLink) sourceLink.replaceChildren();
        read(root,null,false,false,true);
    }
    function setSort() {
        var choices = config.youtubeSort;
        sort.replaceChildren(); choices.forEach(function (choice) { var option = document.createElement('option'); option.value = choice[0]; option.textContent = choice[1]; sort.append(option); });
        if (choices.some(function (choice) { return choice[0] === sorts[currentSource()]; })) sort.value = sorts[currentSource()];
    }
    if (source && sort) {
        setSort(); source.addEventListener('change',function () { setSort(); startTop(); },{signal:lifetime.signal});
        sort.addEventListener('change',function () { sorts[currentSource()] = sort.value; startTop(); },{signal:lifetime.signal});
    }
    document.addEventListener('iv:content-added',function () {
        Array.from(active).forEach(function (entry) { if (!entry.owner.isConnected) { entry.controller.abort(); release(entry,false); } });
        if (!root.isConnected) { cancelAll(); lifetime.abort(); }
    },{signal:lifetime.signal});
    window.addEventListener('pagehide',function (event) {
        cancelAll(); activePage = false;
        if (!event.persisted) lifetime.abort();
    },{signal:lifetime.signal});
    window.addEventListener('pageshow',function (event) { activePage = true; if (event.persisted && topNeeded && alive(root)) read(root,null,false,false,true); },{signal:lifetime.signal});
    window.addEventListener('browserprofilechange',function () { cancelAll(); activePage = false; lifetime.abort(); },{signal:lifetime.signal});
    if (config.initial) read(root,null,false,false,true);
})();
