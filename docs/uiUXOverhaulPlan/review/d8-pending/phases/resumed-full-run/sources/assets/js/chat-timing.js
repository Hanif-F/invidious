'use strict';
// A per-video timing edit has its own draft, endpoint and confirmation state.
(function () {
    var form = document.getElementById('chat-timing-form'), node = document.getElementById('chat-timing-config');
    if (!form || !node || form.dataset.initialized || !window.InvidiousChatPreferences) return;
    form.dataset.initialized = 'true';
    var config = JSON.parse(node.textContent), ui = InvidiousUI, storage = InvidiousStorage, life = new AbortController();
    var input = form.elements.namedItem('timing'), save = form.querySelector('[type=submit]'), discard = form.querySelector('[type=reset]'), check = form.querySelector('[data-timing-readback]'), status = form.querySelector('[role=status]');
    var baseline = config.account ? config.offsetMs : storage.local.get('chat-timing-v1-'+config.videoId), applied = 0, pendingLocal = false, uncertain = false, busy = false, active = true, disposed = false, operation = null, epoch = 0, warned = false;
    var url = '/api/v1/auth/chat_timing/'+encodeURIComponent(config.videoId);
    function valid(value) { return Number.isInteger(value) && Math.abs(value) <= 3600000; }
    if (!valid(baseline)) baseline = 0;
    function alive() { return active && !disposed && form.isConnected && storage.isCurrent(); }
    function on(target,name,handler) { target.addEventListener(name,handler,{signal:life.signal}); }
    function value() { return Math.round(Number(input.value)*1000); }
    function dirty() { return uncertain || pendingLocal || value() !== baseline; }
    function warn(event) { if (dirty()) { event.preventDefault(); event.returnValue = ''; } }
    function emit() {
        if (!alive() || busy || !input.checkValidity() || !valid(value())) return;
        applied = value(); form.dispatchEvent(new CustomEvent('iv:chat-timing',{bubbles:true,detail:{offsetMs:applied}}));
    }
    function update(message) {
        save.disabled = busy || uncertain || !dirty(); discard.hidden = !dirty(); discard.disabled = busy || uncertain; check.hidden = !config.account || !uncertain; check.disabled = busy;
        input.disabled = busy; form.setAttribute('aria-busy',String(busy));
        var changed = dirty();
        if (changed && !warned) { window.addEventListener('beforeunload',warn); warned = true; }
        if (!changed && warned) { window.removeEventListener('beforeunload',warn); warned = false; }
        var next = message === undefined ? dirty() ? config.words.unsaved : '' : message; if (status.textContent !== next) status.textContent = next;
    }
    function canonical(data) { if (!data || !valid(data.offsetMs)) throw new Error('Invalid timing'); return data.offsetMs; }
    on(form,'submit',async function (event) {
        event.preventDefault(); if (!alive() || busy || uncertain || !form.reportValidity() || !valid(value())) return;
        var wanted = value(), controller = new AbortController(), token = ++epoch, responded = false; operation = controller; busy = true; update(config.words.saving);
        try {
            if (config.account) {
                var result = canonical(await InvidiousChatPreferences.mutation('PUT',url,{offsetMs:wanted},controller.signal,function () { uncertain = true; }));
                if (!alive() || token !== epoch) return; responded = true;
                var read = canonical(await ui.request(url,{signal:controller.signal}));
                if (!alive() || token !== epoch) return;
                if (read !== result || read !== wanted) throw new Error('Unconfirmed timing');
                baseline = read; uncertain = false;
            } else {
                pendingLocal = true;
                if (!storage.local.set('chat-timing-v1-'+config.videoId,wanted) || storage.local.get('chat-timing-v1-'+config.videoId) !== wanted) { update(config.words.page_only); return; }
                baseline = wanted; pendingLocal = false;
            }
            update(config.words.saved);
        } catch (error) {
            if (alive() && token === epoch && !controller.signal.aborted) { if (!responded && [400,401,403,404,409,422].includes(error.status)) uncertain = false; update(uncertain ? config.words.unconfirmed : config.words.error); }
        } finally { if (alive() && token === epoch) { operation = null; busy = false; update(status.textContent); emit(); } }
    });
    on(check,'click',async function () {
        if (!alive() || busy) return;
        var controller = new AbortController(), token = ++epoch; operation = controller; busy = true; update(ui.label('loading'));
        try {
            var read = canonical(await ui.request(url,{signal:controller.signal}));
            if (!alive() || token !== epoch) return;
            baseline = read; uncertain = false; update(dirty() ? config.words.unsaved : config.words.saved);
        } catch (_) { if (alive() && token === epoch && !controller.signal.aborted) update(config.words.unconfirmed); }
        finally { if (alive() && token === epoch) { operation = null; busy = false; update(status.textContent); emit(); } }
    });
    on(form,'reset',function (event) {
        event.preventDefault(); if (!alive() || busy || uncertain) return;
        if (pendingLocal && storage.local.set('chat-timing-v1-'+config.videoId,baseline)) pendingLocal = false;
        input.value = String(baseline/1000); emit(); update(pendingLocal ? config.words.page_only : '');
    });
    on(input,'input',function () { if (alive() && !busy) update(); });
    on(input,'change',function () { if (alive() && !busy) { emit(); update(); } });
    function dispose() { if (disposed) return; disposed = true; active = false; epoch++; if (operation) operation.abort(); life.abort(); window.removeEventListener('beforeunload',warn); input.disabled = true; save.disabled = discard.disabled = check.disabled = true; }
    on(window,'pagehide',function (event) { epoch++; if (operation) operation.abort(); operation = null; active = false; busy = false; if (!event.persisted) dispose(); });
    on(window,'pageshow',function () { active = !disposed; if (alive()) update(uncertain ? config.words.unconfirmed : undefined); });
    on(window,'browserprofilechange',dispose);
    on(document,'iv:content-added',function () { if (!form.isConnected) dispose(); });
    on(window,'storage',function (event) {
        if (!alive() || config.account || busy || dirty() || !storage.local.matchesEvent(event,'chat-timing-v1-'+config.videoId)) return;
        var read = storage.local.get('chat-timing-v1-'+config.videoId); baseline = valid(read) ? read : 0; input.value = String(baseline/1000); emit(); update();
    });
    input.value = String(baseline/1000); applied = baseline; update();
    window.InvidiousChatTiming = {value:function () { return alive() ? applied : null; },dispose:dispose}; emit();
})();
