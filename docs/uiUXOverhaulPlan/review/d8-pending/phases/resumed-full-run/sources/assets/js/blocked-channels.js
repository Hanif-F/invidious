'use strict';
(function () {
    var root = document.getElementById('blocked-channel-manager');
    var node = document.getElementById('blocked-manager-config');
    if (!root || !node || root.dataset.managerReady) return;
    var config = JSON.parse(node.textContent), ui = window.InvidiousUI, storage = window.InvidiousStorage;
    if (!ui || !storage) return;
    root.dataset.managerReady = 'true';
    var list = root.querySelector('#blocked-channel-list'), search = root.querySelector('#blocked-search');
    var empty = root.querySelector('#blocked-empty');
    var status = root.querySelector('#blocked-status'), readback = root.querySelector('[data-block-check]');
    var channels = config.channels, csrf = config.csrf, unavailable = config.unavailable;
    var uncertain = config.uncertain, outcome = uncertain ? config.pending : null;
    var busy = false, reading = false, active = true, disposed = false, epoch = 0, request, warned = false;
    var life = new AbortController(), currentMessage = !!status.textContent.trim();
    function on(target, event, handler) { target.addEventListener(event, handler, {signal: life.signal}); }
    function alive() { return active && !disposed && root.isConnected && storage.isCurrent() && storage.scope === config.profile; }
    function object(value) { return !!value && typeof value === 'object' && !Array.isArray(value); }
    function message(text, error) {
        status.textContent = text || ''; status.setAttribute('role', error ? 'alert' : 'status'); currentMessage = !!text;
    }
    function warn(event) { event.preventDefault(); event.returnValue = ''; }
    function update() {
        root.querySelectorAll('[data-block-unblock] button').forEach(function (button) { button.disabled = busy || uncertain || unavailable || disposed || config.stale; });
        readback.disabled = busy || disposed || config.stale;
        search.disabled = disposed || config.stale;
        root.setAttribute('aria-busy', String(busy));
        if (disposed) message(config.words.profile, true);
        else if (busy) message(reading ? ui.label('loading') : config.words.saving);
        else if (uncertain && (!currentMessage || status.textContent === config.words.saving || status.textContent === ui.label('loading'))) message(config.words.unconfirmed, true);
        if ((busy || uncertain) && !disposed && !warned) { window.addEventListener('beforeunload', warn); warned = true; }
        if ((!busy && !uncertain || disposed) && warned) { window.removeEventListener('beforeunload', warn); warned = false; }
    }
    function render() {
        var query = search.value.trim().toLocaleLowerCase(), fragment = document.createDocumentFragment(), count = 0;
        channels.forEach(function (channel) {
            if (query && !(channel.author + ' ' + channel.authorId).toLocaleLowerCase().includes(query)) return;
            count++;
            var row = document.getElementById('blocked-row').content.firstElementChild.cloneNode(true);
            var link = row.querySelector('[data-block-channel-link]'), form = row.querySelector('form');
            row.dataset.blockChannel = channel.authorId;
            link.href = '/channel/' + encodeURIComponent(channel.authorId); link.textContent = channel.author || channel.authorId;
            row.querySelector('code').textContent = channel.authorId;
            form.elements.ucid.value = channel.authorId; form.elements.name.value = channel.author;
            form.elements.csrf_token.value = csrf; form.elements.browser_profile.value = config.profile;
            fragment.append(row);
        });
        empty.hidden = count > 0 || unavailable;
        empty.textContent = query ? config.words.no_matches : config.words.empty;
        list.replaceChildren(fragment); update();
    }
    function canonical(data) {
        if (object(data) && typeof data.profile === 'string' && data.profile !== config.profile) { dispose(); throw new Error(config.words.profile); }
        if (!object(data) || data.profile !== config.profile || typeof data.csrf !== 'string' || !data.csrf || !Array.isArray(data.channels)) throw new Error(config.words.load);
        var ids = new Set();
        data.channels.forEach(function (channel) {
            if (!object(channel) || typeof channel.authorId !== 'string' || !channel.authorId || channel.authorId.length > 2048 || typeof channel.author !== 'string' || ids.has(channel.authorId)) throw new Error(config.words.load);
            ids.add(channel.authorId);
        });
        return data;
    }
    function desired(data, pending) { return pending && pending.action === 'unblock' && !data.channels.some(function (channel) { return channel.authorId === pending.id; }); }
    function accept(data, text, focusIndex) {
        var oldFocus = document.activeElement, restore = list.contains(oldFocus) || oldFocus === document.body;
        var changed = JSON.stringify(channels) !== JSON.stringify(data.channels);
        channels = data.channels; csrf = data.csrf; unavailable = false;
        root.querySelectorAll('[data-block-pending]').forEach(function (notice) { notice.hidden = true; });
        render(); message(text);
        if (changed) ui.invalidate('blocks');
        if (restore && focusIndex !== undefined) {
            var generation = epoch;
            queueMicrotask(function () {
                if (!alive() || generation !== epoch || busy || document.activeElement !== document.body && document.activeElement !== oldFocus) return;
                var buttons = list.querySelectorAll('[data-block-unblock] button'), next = buttons[Math.min(focusIndex, buttons.length - 1)];
                (next || search).focus({preventScroll: true});
            });
        }
    }
    async function unblock(form) {
        if (!alive() || busy || uncertain || unavailable || config.stale) return;
        var id = form.elements.ucid.value;
        if (!channels.some(function (channel) { return channel.authorId === id; })) return;
        var index = Array.from(list.querySelectorAll('form')).indexOf(form);
        var token = ++epoch, controller = new AbortController(), dispatched = false;
        request = controller; busy = true; reading = false; update();
        try {
            var read = await ui.request('/blocked_channels?format=json', {signal: controller.signal});
            if (!alive() || token !== epoch) return;
            var before = canonical(read);
            if (!before.channels.some(function (channel) { return channel.authorId === id; })) {
                accept(before, config.words.unblocked, index); return;
            }
            var body = new URLSearchParams({ucid: id, action: 'unblock', browser_profile: config.profile, csrf_token: before.csrf});
            outcome = {id: id, action: 'unblock'}; dispatched = true; uncertain = true; ui.invalidate('blocks');
            var written = await ui.request('/blocked_channels?format=json', {method: 'POST', body: body, signal: controller.signal});
            if (!alive() || token !== epoch) return;
            var saved = canonical(written), matched = desired(saved, outcome);
            uncertain = false; outcome = null; ui.invalidate('blocks');
            accept(saved, matched ? config.words.unblocked : config.words.changed, index);
        } catch (error) {
            if (!alive() || token !== epoch || controller.signal.aborted) return;
            if (error.status === 409) { dispose(); return; }
            if (!dispatched || [400,401,403,404,405,413,415,422,429].includes(error.status)) { uncertain = false; outcome = null; }
            if (uncertain) ui.invalidate('blocks');
            message(uncertain ? config.words.unconfirmed : error.userMessage || config.words.error, true);
            status.focus({preventScroll: true}); status.scrollIntoView({block: 'nearest'});
        } finally {
            if (alive() && token === epoch) { busy = false; reading = false; request = null; update(); }
        }
    }
    async function check() {
        if (!alive() || busy || config.stale) return;
        var token = ++epoch, controller = new AbortController(); request = controller; busy = true; reading = true; update();
        try {
            var response = await ui.request('/blocked_channels?format=json', {signal: controller.signal});
            if (!alive() || token !== epoch) return;
            var saved = canonical(response), pending = outcome, matched = desired(saved, pending);
            uncertain = false; outcome = null;
            accept(saved, matched ? config.words.unblocked : pending ? config.words.changed : config.words.refreshed);
        } catch (error) {
            if (alive() && token === epoch && !controller.signal.aborted) message(config.words.load, true);
        } finally {
            if (alive() && token === epoch) { busy = false; reading = false; request = null; update(); if (document.activeElement === document.body) readback.focus({preventScroll: true}); }
        }
    }
    function dispose() {
        if (disposed) return;
        epoch++; if (request) request.abort(); disposed = true; active = false; busy = false;
        life.abort(); window.removeEventListener('beforeunload', warn); update();
    }
    root.querySelectorAll('.js-only').forEach(function (element) { element.hidden = false; });
    if (config.stale || storage.scope !== config.profile || !storage.isCurrent()) { dispose(); return; }
    on(root, 'submit', function (event) { if (event.target.matches('[data-block-unblock]')) { event.preventDefault(); unblock(event.target); } });
    on(search, 'input', render); on(readback, 'click', check);
    on(window, 'browserprofilechange', dispose);
    on(window, 'pagehide', function (event) { epoch++; if (request) request.abort(); request = null; busy = false; active = false; if (!event.persisted) dispose(); });
    on(window, 'pageshow', function () { active = !disposed; if (alive()) update(); else if (!disposed) dispose(); });
    on(document, 'iv:content-added', function () { if (!root.isConnected) dispose(); });
    render();
    var field = new URL(location.href).searchParams.get('field');
    if (field === 'channels') search.focus({preventScroll: true});
    if (field === 'unblock') (list.querySelector('button') || search).focus({preventScroll: true});
})();
