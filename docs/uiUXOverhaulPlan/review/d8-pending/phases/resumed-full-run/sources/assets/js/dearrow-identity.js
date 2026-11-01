'use strict';
(function () {
    var root = document.getElementById('dearrow-identity-editor'), node = document.getElementById('identity-editor-config');
    if (!root || !node || root.dataset.identityReady) return;
    var config = JSON.parse(node.textContent), ui = window.InvidiousUI, storage = window.InvidiousStorage;
    if (!ui || !storage) return;
    root.dataset.identityReady = 'true';
    var state = config.state, profile = state.profile, unavailable = config.unavailable, uncertain = config.uncertain;
    var form = root.querySelector('#identity-form'), draft = form.elements.private_id, confirmation = form.elements.confirm_replace;
    var save = form.querySelector('[type=submit]'), discard = form.querySelector('[type=reset]');
    var status = root.querySelector('#identity-status'), current = root.querySelector('#identity-current'), setup = root.querySelector('#identity-setup');
    var check = root.querySelector('[data-identity-check]'), keep = root.querySelector('[data-identity-keep]');
    var busy = false, reading = false, dispatched = false, checked = false, active = true, disposed = false, epoch = 0, request, warned = false;
    var life = new AbortController();
    function on(target, name, callback) { target.addEventListener(name, callback, {signal: life.signal}); }
    function alive() { return active && !disposed && root.isConnected && storage.scope === profile && storage.isCurrent(); }
    function message(text, error) { status.textContent = text; status.setAttribute('role', error ? 'alert' : 'status'); }
    function warn(event) { event.preventDefault(); event.returnValue = ''; }
    function dirty() { return !!draft.value || confirmation.checked; }
    function update() {
        var disabled = busy || disposed || unavailable || !state.ready || uncertain;
        draft.disabled = disabled; confirmation.disabled = disabled;
        save.disabled = disabled || !draft.value.trim() || state.configured && !confirmation.checked;
        discard.disabled = busy || disposed; discard.hidden = !dirty() || uncertain;
        check.disabled = busy || disposed; keep.disabled = busy || disposed; keep.hidden = !uncertain || !checked;
        root.setAttribute('aria-busy', String(busy));
        if (disposed) message(config.words.profile, true);
        else if (busy) message(reading ? ui.label('loading') : config.words.saving);
        else if (uncertain && (!status.textContent || [config.words.saving, ui.label('loading')].includes(status.textContent))) message(config.words.uncertain, true);
        var warning = !disposed && (dirty() || uncertain || busy);
        if (warning && !warned) { window.addEventListener('beforeunload', warn); warned = true; }
        if (!warning && warned) { window.removeEventListener('beforeunload', warn); warned = false; }
    }
    function accept(saved) {
        if (saved.revision !== state.revision) confirmation.checked = false;
        state = saved; unavailable = false;
        form.elements.csrf_token.value = saved.csrf; form.elements.revision.value = saved.revision;
        current.textContent = saved.configured ? config.words.configured : config.words.new_identity;
        confirmation.closest('label').hidden = !saved.configured; confirmation.required = saved.configured;
        setup.hidden = saved.ready; setup.textContent = config.words.setup;
    }
    function canonical(value) {
        if (value && typeof value.profile === 'string' && value.profile !== profile) { dispose(); throw new Error(); }
        if (!value || typeof value !== 'object' || Array.isArray(value) || value.profile !== profile || typeof value.ready !== 'boolean' || typeof value.configured !== 'boolean' || typeof value.revision !== 'string' || !/^[0-9a-f]{64}$/.test(value.revision) || typeof value.csrf !== 'string' || !value.csrf) throw new Error();
        return value;
    }
    async function read() {
        if (!alive() || busy) return;
        var generation = ++epoch, controller = new AbortController(); request = controller; busy = true; reading = true; update();
        try {
            var result = await ui.request('/preferences/dearrow/identity?format=json', {signal: controller.signal});
            if (!alive() || generation !== epoch) return;
            accept(canonical(result)); checked = true;
            message(uncertain ? config.words.review_saved : config.words.refreshed, uncertain);
        } catch (_) {
            if (alive() && generation === epoch && !controller.signal.aborted) message(config.words.load, true);
        } finally {
            if (alive() && generation === epoch) { busy = false; reading = false; request = null; update(); }
        }
    }
    async function submit() {
        if (!alive() || busy || uncertain || unavailable || !state.ready) return;
        var literal = draft.value;
        if (!/^[A-Za-z0-9_-]{30,256}$/.test(literal.trim())) { message(config.words.invalid, true); draft.focus(); return; }
        if (state.configured && !confirmation.checked) { message(config.words.confirm, true); confirmation.focus(); return; }
        var generation = ++epoch, controller = new AbortController(); request = controller; busy = true; reading = false; dispatched = false; checked = false; update();
        try {
            var result = await ui.request('/preferences/dearrow/identity?format=json', {signal: controller.signal});
            if (!alive() || generation !== epoch) return;
            var fresh = canonical(result);
            if (fresh.revision !== state.revision || fresh.ready !== state.ready) { accept(fresh); message(config.words.changed, true); return; }
            var body = new URLSearchParams({identity_editor: '1', private_id: literal, confirm_replace: confirmation.checked ? 'on' : '', revision: fresh.revision, browser_profile: profile, csrf_token: fresh.csrf});
            dispatched = true; uncertain = true;
            var written = await ui.request('/dearrow_identity?format=json', {method: 'POST', body: body, signal: controller.signal});
            if (!alive() || generation !== epoch) return;
            if (!written || written.imported !== true) throw new Error();
            var saved = canonical(written.state);
            if (!saved.ready || !saved.configured || saved.revision === fresh.revision) throw new Error();
            accept(saved); uncertain = false; draft.value = ''; confirmation.checked = false;
            message(config.words.saved); status.focus({preventScroll: true});
        } catch (error) {
            if (!alive() || generation !== epoch || controller.signal.aborted) return;
            if (!dispatched || [400,401,403,404,405,409,413,415,422,429].includes(error.status)) uncertain = false;
            message(uncertain ? config.words.uncertain : error.status === 409 ? config.words.changed : dispatched ? config.words.error : config.words.load, true);
            status.focus({preventScroll: true});
        } finally {
            if (alive() && generation === epoch) { busy = false; reading = false; request = null; update(); }
        }
    }
    function reset() {
        draft.value = ''; confirmation.checked = false; message(config.words.discarded); update();
    }
    function dispose() {
        if (disposed) return;
        epoch++; if (request) request.abort(); disposed = true; active = false; busy = false;
        draft.value = ''; confirmation.checked = false; life.abort(); window.removeEventListener('beforeunload', warn); warned = false; update();
    }
    root.querySelectorAll('.js-only').forEach(function (element) { element.hidden = false; });
    form.noValidate = true;
    if (storage.scope !== profile || !storage.isCurrent()) { dispose(); return; }
    on(form, 'input', function (event) { if (event.target === draft) confirmation.checked = false; if (!busy && !uncertain && !disposed) message(config.words.unsaved); update(); });
    on(form, 'submit', function (event) { event.preventDefault(); submit(); });
    on(form, 'reset', function (event) { event.preventDefault(); if (!busy && !uncertain && alive()) reset(); });
    on(check, 'click', read);
    on(keep, 'click', function () { if (!alive() || busy || !uncertain || !checked) return; uncertain = false; checked = false; reset(); (state.ready ? draft : check).focus({preventScroll: true}); });
    on(window, 'browserprofilechange', dispose);
    on(window, 'pagehide', function (event) { if (busy) message(uncertain ? config.words.uncertain : config.words.load, true); epoch++; if (request) request.abort(); request = null; busy = false; active = false; if (!event.persisted) dispose(); });
    on(window, 'pageshow', function () { active = !disposed; if (alive()) update(); else if (!disposed) dispose(); });
    on(document, 'iv:content-added', function () { if (!root.isConnected) dispose(); });
    update();
    if (new URL(location.href).searchParams.get('field') === 'private_id' && !draft.disabled) draft.focus({preventScroll: true});
})();
