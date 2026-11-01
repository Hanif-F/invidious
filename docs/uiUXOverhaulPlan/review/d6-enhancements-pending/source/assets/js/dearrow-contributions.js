'use strict';
(function () {
    var dialog = document.getElementById('dearrow-dialog'), node = document.getElementById('dearrow-contribution-config');
    if (!dialog || !node || dialog.dearrowController || dialog.dataset.dearrowDisposed === 'true') return;
    var config = JSON.parse(node.textContent), ui = window.InvidiousUI, storage = window.InvidiousStorage;
    if (!ui || !storage || storage.scope !== config.profile || !storage.isCurrent()) return;
    var trigger = document.getElementById('dearrow-open'), status = dialog.querySelector('#dearrow-status');
    if (!trigger) return;
    var content = dialog.querySelector('.dearrow-content'), editor = dialog.querySelector('#dearrow-editor'), confirm = dialog.querySelector('#dearrow-confirm');
    var draft = dialog.querySelector('#dearrow-draft'), preview = dialog.querySelector('#dearrow-preview'), send = dialog.querySelector('#dearrow-send');
    var refresh = dialog.querySelector('#dearrow-refresh'), editButton = dialog.querySelector('#dearrow-edit');
    var originalRow = dialog.querySelector('#dearrow-original'), originalTitle = dialog.querySelector('#dearrow-original-title'), titles = dialog.querySelector('#dearrow-titles');
    var maskActions = dialog.querySelector('#dearrow-mask-actions'), maskToggle = dialog.querySelector('#dearrow-mask-toggle');
    var maskState = dialog.querySelector('#dearrow-mask-state'), maskRetry = dialog.querySelector('#dearrow-mask-retry');
    var checks = Array.from(confirm.querySelectorAll('input[type=checkbox]')), template = document.getElementById('dearrow-vote-template');
    var original = originalTitle.dataset.originalTitle, rows = [], proposal = '', loaded = false, revealed = false, maskIdentity;
    var pending = null, epoch = 0, active = dialog.dataset.dearrowActive !== 'false', disposed = false, returnFocus;
    var uncertain = new Set(), life = new AbortController(), warned = false;
    function on(target, name, handler) { target.addEventListener(name, handler, {signal: life.signal}); }
    function alive() { return active && !disposed && dialog.isConnected && trigger.isConnected && storage.scope === config.profile && storage.isCurrent(); }
    function current(generation) { return alive() && dialog.open && epoch === generation; }
    function message(text, error) { status.textContent = text || ''; status.setAttribute('role', error ? 'alert' : 'status'); }
    function warn(event) { event.preventDefault(); event.returnValue = ''; }
    function titleKey(title) { return 'title:' + title; }
    function voteKey(item, isOriginal) { return isOriginal ? 'vote:original' : 'vote:' + item.UUID; }
    function masked() {
        return window.InvidiousSpoilers ? InvidiousSpoilers.decision(config.channel, Number.isFinite(config.published) ? config.published : NaN, 'title').hidden : config.masked;
    }
    function maskPending() { return !!(window.InvidiousSpoilers && InvidiousSpoilers.isSuspended && InvidiousSpoilers.isSuspended()); }
    function paintTitles() {
        if (!maskPending()) {
            var identity = window.InvidiousSpoilers && InvidiousSpoilers.signature ? InvidiousSpoilers.signature(config.channel,Number.isFinite(config.published) ? config.published : NaN,'title') : String(masked());
            if (maskIdentity !== undefined && identity !== maskIdentity) revealed = false;
            maskIdentity = identity;
        }
        var hidden = masked() && (!revealed || maskPending());
        originalTitle.textContent = hidden ? config.hidden_title : original;
        titles.querySelectorAll('[data-dearrow-proposal]').forEach(function (element) { element.textContent = hidden ? config.hidden_title : rows[Number(element.dataset.dearrowProposal)].title; });
        maskActions.hidden = !masked(); maskToggle.setAttribute('aria-pressed', String(revealed && !maskPending()));
        maskToggle.querySelector('span').textContent = revealed && !maskPending() ? config.hide : config.reveal;
    }
    function update() {
        dialog.setAttribute('aria-busy', String(!!pending));
        dialog.querySelectorAll('[data-dearrow-vote]').forEach(function (button) { button.disabled = !!pending || disposed || button.dataset.unavailable === 'true' || uncertain.has(button.dataset.target); });
        refresh.disabled = !!pending || disposed; draft.disabled = !!pending || disposed;
        editor.querySelector('[type=submit]').disabled = !!pending || disposed;
        editButton.disabled = !!pending || disposed;
        checks.forEach(function (check) { check.disabled = !!pending || disposed; });
        send.disabled = !!pending || disposed || !proposal || uncertain.has(titleKey(proposal)) || !checks.every(function (check) { return check.checked; });
        maskToggle.disabled = disposed || maskPending();
        var runtime = window.InvidiousEnhancements, unavailable = runtime && runtime.readState() === 'unavailable';
        if (maskState) { maskState.hidden = !maskPending(); maskState.textContent = maskPending() ? unavailable ? ui.config.words.read_error || ui.label('error') : ui.label('loading') : ''; }
        if (maskRetry) { maskRetry.hidden = !maskPending() || !unavailable; maskRetry.disabled = disposed; }
        dialog.querySelector('#dearrow-uncertain').hidden = uncertain.size === 0 || uncertain.size === 1 && !!pending && !!pending.key && uncertain.has(pending.key);
        var warning = !disposed && (!!draft.value || !!pending && !!pending.key || uncertain.size > 0);
        if (warning && !warned) { window.addEventListener('beforeunload', warn); warned = true; }
        if (!warning && warned) { window.removeEventListener('beforeunload', warn); warned = false; }
    }
    function canonical(value) {
        if (!value || !Array.isArray(value.titles) || value.titles.length > 5000 || value.titles.some(function (item) {
            return !item || typeof item.title !== 'string' || item.title.length > 10000 || typeof item.original !== 'boolean' || typeof item.locked !== 'boolean' || !Number.isSafeInteger(item.votes) || typeof item.UUID !== 'string' || item.UUID.length > 256 || !item.original && !item.UUID;
        })) throw new Error();
        return value.titles;
    }
    function score(row, item, reason) {
        row.querySelector('[data-dearrow-score]').textContent = item ? config.score.replace('{count}', String(item.votes)) : '';
        row.querySelector('[data-dearrow-reason]').textContent = reason;
    }
    function buttons(container, item, isOriginal, position) {
        container.replaceChildren();
        ['upvote','downvote'].forEach(function (action) {
            var button = template.content.firstElementChild.cloneNode(true), target = voteKey(item, isOriginal);
            button.dataset.dearrowVote = action; button.dataset.target = target;
            button.querySelector('span').textContent = config[action];
            button.setAttribute('aria-label', config[action] + ': ' + (isOriginal ? config.original : config.proposal.replace('{number}', String(position))));
            var reason = action === 'downvote' ? !item ? config.no_original : item.locked ? config.locked : '' : '';
            button.dataset.unavailable = String(!!reason);
            if (reason) button.title = reason;
            button.dataset.original = String(isOriginal); button.dataset.uuid = item ? item.UUID : '';
            container.append(button);
        });
    }
    function render(entries) {
        var originalEntry = entries.find(function (item) { return item.original; });
        buttons(originalRow.querySelector('.dearrow-votes'), originalEntry, true, 0);
        score(originalRow, originalEntry, originalEntry ? originalEntry.locked ? config.locked : '' : config.no_original);
        rows = entries.filter(function (item) { return !item.original; }); titles.replaceChildren();
        rows.forEach(function (item, index) {
            var row = document.createElement('div'); row.className = 'dearrow-row';
            var text = document.createElement('div'); text.className = 'dearrow-row-text';
            var title = document.createElement('span'); title.dir = 'auto'; title.dataset.dearrowProposal = String(index);
            var count = document.createElement('small'); count.dataset.dearrowScore = '';
            var reason = document.createElement('small'); reason.dataset.dearrowReason = '';
            text.append(title,count,reason);
            var votes = document.createElement('div'); votes.className = 'dearrow-votes';
            buttons(votes,item,false,index+1); row.append(text,votes); score(row,item,item.locked ? config.locked : ''); titles.append(row);
        });
        if (!rows.length) { var empty = document.createElement('p'); empty.textContent = config.empty; titles.append(empty); }
        loaded = true; paintTitles(); update();
    }
    async function fetchTitles(signal) {
        return canonical(await ui.request('/api/v1/dearrow/' + encodeURIComponent(dialog.dataset.videoId) + '/submissions', {signal: signal}));
    }
    async function reload() {
        if (!alive() || !dialog.open || pending) return;
        var generation = ++epoch, controller = new AbortController(); pending = {controller: controller, key: null}; update(); message(config.loading);
        try { var result = await fetchTitles(controller.signal); if (current(generation)) { render(result); message(uncertain.size ? config.uncertain : '', uncertain.size > 0); } }
        catch (_) { if (current(generation) && !controller.signal.aborted) message(config.error, true); }
        finally { if (current(generation)) { pending = null; update(); } }
    }
    function edit(focus) {
        confirm.hidden = true; editor.hidden = false; proposal = ''; checks.forEach(function (check) { check.checked = false; }); update();
        if (focus && dialog.open && alive()) draft.focus();
    }
    function focusStatus(origin) {
        if (dialog.open && (document.activeElement === document.body || document.activeElement === origin)) { status.focus({preventScroll: true}); content.scrollTop = 0; }
    }
    async function contribute(fields, key, origin) {
        if (!alive() || !dialog.open || pending || uncertain.has(key)) return;
        if (fields.action === 'submit' && (!proposal || !checks.every(function (check) { return check.checked; }))) return;
        var generation = ++epoch, controller = new AbortController();
        pending = {controller: controller, key: key}; uncertain.add(key); update(); message(config.sending); ui.invalidate('dearrow');
        try {
            fields.video_id = dialog.dataset.videoId; fields.csrf_token = config.csrf; fields.browser_profile = config.profile;
            var result = await ui.request('/dearrow_submit', {method: 'POST', body: new URLSearchParams(fields), signal: controller.signal});
            if (!current(generation)) return;
            if (!result || result.ok !== true) throw new Error();
            uncertain.delete(key); pending.key = null; pending.accepted = true; ui.invalidate('dearrow');
            if (fields.action === 'submit') { draft.value = ''; preview.textContent = ''; edit(false); }
            message(config.success);
            try { var entries = await fetchTitles(controller.signal); if (current(generation)) { render(entries); message(config.success); } }
            catch (_) { if (current(generation) && !controller.signal.aborted) message(config.partial, true); }
            if (current(generation)) focusStatus(origin);
        } catch (error) {
            if (!current(generation) || controller.signal.aborted) return;
            if ([400,401,403,404,405,409,413,415,422,429].includes(error.status)) uncertain.delete(key);
            message(uncertain.has(key) ? config.uncertain : config.rejected, true); focusStatus(origin);
        } finally { if (current(generation)) { pending = null; update(); } }
    }
    function cancel() {
        epoch++;
        if (pending) { pending.controller.abort(); message(pending.key ? config.uncertain : pending.accepted ? config.partial : config.error, !!pending.key); pending = null; }
        revealed = false; paintTitles(); update();
    }
    function show() {
        if (!alive() || dialog.open) return;
        var menu = trigger.closest('details'); returnFocus = menu ? menu.querySelector('summary') : trigger;
        if (menu) { menu.open = false; returnFocus.setAttribute('aria-expanded','false'); }
        dialog.showModal(); paintTitles(); update();
        if (!loaded) reload();
    }
    function dispose() {
        if (disposed) return;
        disposed = true; active = false; epoch++; if (pending) pending.controller.abort(); pending = null;
        draft.value = ''; preview.textContent = ''; proposal = ''; rows = []; titles.replaceChildren();
        originalTitle.textContent = config.hidden_title; checks.forEach(function (check) { check.checked = false; });
        life.abort(); observer.disconnect(); window.removeEventListener('beforeunload',warn); warned = false;
        if (dialog.open) dialog.close(); message(config.profile_changed,true); update();
    }
    function dismiss() { cancel(); dialog.close(); }
    on(dialog.querySelector('#dearrow-close'),'click',dismiss);
    on(dialog,'cancel',cancel);
    on(dialog,'close',function () { cancel(); if (alive() && returnFocus && returnFocus.isConnected) returnFocus.focus({preventScroll:true}); });
    on(dialog,'click',function (event) { if (event.target !== dialog) return; var box = dialog.getBoundingClientRect(); if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dismiss(); });
    on(dialog,'click',function (event) { var button = event.target.closest('[data-dearrow-vote]'); if (button && dialog.contains(button) && !button.disabled) contribute({action:button.dataset.dearrowVote,original:button.dataset.original,uuid:button.dataset.uuid},button.dataset.target,button); });
    on(refresh,'click',reload); on(editButton,'click',function () { if (!pending && alive()) edit(true); });
    on(maskToggle,'click',function () { if (alive() && !maskPending()) { revealed = !revealed; paintTitles(); } });
    on(document,'iv:masking-change',function () { if (!disposed) { paintTitles(); update(); } });
    on(document,'iv:enhancements-state',function () { if (!disposed) { paintTitles(); update(); } });
    if (maskRetry) on(maskRetry,'click',function () { if (alive() && window.InvidiousEnhancements) InvidiousEnhancements.refresh(); });
    on(dialog.querySelector('#dearrow-draft-form'),'submit',function (event) {
        event.preventDefault(); if (pending || !alive()) return;
        var title = draft.value.trim();
        if (!title || Array.from(title).length > 110 || /[\r\n]/.test(title)) { message(config.invalid,true); draft.focus(); return; }
        proposal = title; preview.textContent = title; checks.forEach(function (check) { check.checked = false; });
        editor.hidden = true; confirm.hidden = false; update(); checks[0].focus();
    });
    on(confirm,'change',update); on(confirm,'submit',function (event) { event.preventDefault(); contribute({action:'submit',title:proposal,confirmed:'true'},titleKey(proposal),send); });
    on(draft,'input',update); dialog.querySelector('#dearrow-draft-form').noValidate = true;
    on(window,'pagehide',function (event) { cancel(); active = false; if (!event.persisted) dispose(); });
    on(window,'pageshow',function () { active = !disposed; if (alive()) update(); else if (!disposed) dispose(); });
    on(window,'browserprofilechange',dispose);
    var observer = new MutationObserver(function () { if (!dialog.isConnected || !trigger.isConnected) dispose(); }); observer.observe(document.body,{childList:true,subtree:true});
    dialog.dearrowController = {show:show}; dialog.dataset.contributionReady = 'true'; paintTitles(); update();
})();
