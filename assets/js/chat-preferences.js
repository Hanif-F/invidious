'use strict';
// One editor owns browser display values and the existing native chat PATCH.
(function () {
    var form = document.querySelector('[data-chat-preferences]'), node = document.getElementById('chat-preferences-config');
    if (!form || !node || form.dataset.initialized) return;
    form.dataset.initialized = 'true';
    var config = JSON.parse(node.textContent), ui = InvidiousUI, storage = InvidiousStorage, life = new AbortController();
    var serverKeys = ['chat_show_timestamps','chat_user_blacklist','chat_word_blacklist'];
    var localKeys = config.account ? ['chat_hide_user_ids','chat_font_scale','chat_width_px'] : serverKeys.concat(['chat_hide_user_ids','chat_font_scale','chat_width_px']);
    var keys = serverKeys.concat(['chat_hide_user_ids','chat_font_scale','chat_width_px']);
    var status = form.querySelector('[data-chat-save-status]'), save = form.querySelector('[data-chat-save]'), discard = form.querySelector('[data-chat-discard]'), check = form.querySelector('[data-chat-readback]');
    var snapshot = Object.assign({chat_hide_user_ids:false,chat_font_scale:100,chat_width_px:440},config.values), preview = null;
    var localPending = new Set(), operation = null, issued = 0, busy = false, uncertain = false, activePage = true, disposed = false, warned = false;
    form.querySelectorAll('[data-chat-browser-fields] input').forEach(function (input) { input.disabled = false; });
    function on(target,name,handler,options) { target.addEventListener(name,handler,Object.assign({signal:life.signal},options)); }
    function alive() { return activePage && !disposed && form.isConnected && storage.isCurrent(); }
    function control(key) { return form.elements.namedItem(key); }
    function local() { return storage.local.get('chat-settings-v1') || {}; }
    function effective(source,key) {
        var value = source[key];
        if (key === 'chat_font_scale' || key === 'chat_width_px') {
            var input = control(key), number = Number(value);
            return Number.isInteger(number) ? Math.max(Number(input.min),Math.min(Number(input.max),number)) : key === 'chat_font_scale' ? 100 : 440;
        }
        if (key === 'chat_hide_user_ids' || key === 'chat_show_timestamps') return typeof value === 'boolean' ? value : key === 'chat_show_timestamps';
        return typeof value === 'string' ? value : '';
    }
    function readServer(data) {
        if (!data || serverKeys.some(function (key) { return typeof data[key] !== typeof config.values[key]; })) throw new Error('Invalid chat settings');
        var result = {}; serverKeys.forEach(function (key) { result[key] = data[key]; }); return result;
    }
    function readForm() {
        var result = {}; keys.forEach(function (key) { var input = control(key); result[key] = input.type === 'checkbox' ? input.checked : input.type === 'number' ? Number(input.value) : input.value; }); return result;
    }
    function writeForm(values) {
        keys.forEach(function (key) { var input = control(key); input.setCustomValidity(''); if (input.type === 'checkbox') input.checked = values[key]; else input.value = String(values[key]); }); mirrors();
    }
    function mirrors() {
        [['chat-font-scale','chat_font_scale','%'],['chat-width','chat_width_px','px']].forEach(function (entry) {
            var input = control(entry[1]), slider = form.querySelector('#'+entry[0]); slider.step = input.step;
            if (input.validity.valid) { slider.value = input.value; slider.setAttribute('aria-valuetext',input.value+entry[2]); }
        });
    }
    function patterns(raw) {
        return raw.trim().split(/\s+/).filter(Boolean).map(function (token) {
            if (token[0] === '/' && token[token.length-1] === '/') return new RegExp(token.slice(1,-1),'i');
            return {test:function (value) { return value.toLocaleLowerCase().includes(token.toLocaleLowerCase()); }};
        });
    }
    function validate(report) {
        ['chat_user_blacklist','chat_word_blacklist'].forEach(function (key) {
            var input = control(key); input.setCustomValidity(new TextEncoder().encode(input.value).length > 1024 ? config.words.too_long : '');
        });
        try { patterns(control('chat_word_blacklist').value); }
        catch (_) { control('chat_word_blacklist').setCustomValidity(config.words.invalid_pattern); }
        ['chat_font_scale','chat_width_px','chat_user_blacklist','chat_word_blacklist'].forEach(function (key) {
            var input = control(key), errorId = key === 'chat_font_scale' ? 'chat-font-error' : key === 'chat_width_px' ? 'chat-width-error' : key === 'chat_user_blacklist' ? 'chat-user-error' : 'chat-word-error';
            var error = form.querySelector('#'+errorId), message = input.validationMessage;
            input.setAttribute('aria-invalid',String(!input.validity.valid)); error.textContent = message; error.hidden = !message;
        });
        var valid = form.checkValidity(); if (!valid && report) form.reportValidity(); return valid;
    }
    function emit() {
        if (!alive() || busy) return false;
        var valid = validate(false);
        if (valid) preview = readForm();
        if (!preview) { preview = Object.assign({},snapshot); try { patterns(preview.chat_word_blacklist); } catch (_) { preview.chat_word_blacklist = ''; } }
        form.dispatchEvent(new CustomEvent('iv:chat-preferences',{bubbles:true,detail:{values:Object.assign({},preview)}}));
        return valid;
    }
    function invalidMessage() { var invalid = Array.from(form.elements).find(function (input) { return input.willValidate && !input.validity.valid; }); return invalid ? invalid.validationMessage : config.words.error; }
    function changedKeys(names, values) { return names.filter(function (key) { return values[key] !== snapshot[key] || localPending.has(key); }); }
    function dirty() { return uncertain || changedKeys(keys,readForm()).length > 0; }
    function warn(event) { event.preventDefault(); event.returnValue = ''; }
    function update(message) {
        var changed = dirty(); save.disabled = busy || !changed || uncertain; discard.hidden = !changed; discard.disabled = busy || uncertain; check.hidden = !config.account || !uncertain; check.disabled = busy;
        if (changed && !warned) { window.addEventListener('beforeunload',warn); warned = true; }
        if (!changed && warned) { window.removeEventListener('beforeunload',warn); warned = false; }
        var next = message === undefined ? (changed ? config.words.unsaved : '') : message;
        if (status.textContent !== next) status.textContent = next;
    }
    function lock(value) { busy = value; form.querySelectorAll('fieldset').forEach(function (set) { set.disabled = value; }); form.setAttribute('aria-busy',String(value)); }
    function patch(names, values) { var result = {}; names.forEach(function (key) { result[key] = values[key]; }); return result; }
    async function mutation(method,url,body,signal,beforeDispatch) {
        var token = await ui.request('/api/v1/auth/csrf',{signal:signal});
        if (!alive() || !token || typeof token.csrfToken !== 'string') throw new Error('Invalid session');
        if (beforeDispatch) beforeDispatch();
        return ui.request(url,{method:method,headers:{'Content-Type':'application/json','X-CSRF-Token':token.csrfToken},body:JSON.stringify(body),signal:signal});
    }
    async function persist(event) {
        event.preventDefault(); if (!alive() || busy || uncertain || !validate(true)) return;
        var values = readForm(), serverChanged = config.account ? changedKeys(serverKeys,values) : [], localChanged = changedKeys(localKeys,values);
        var controller = new AbortController(), token = ++issued, serverWritten = false, patchResponded = false; operation = controller; lock(true); update(config.words.saving);
        try {
            if (serverChanged.length) {
                // Mark ambiguity before dispatch; a failed request may have committed.
                var result = readServer(await mutation('PATCH','/api/v1/auth/chat_preferences',patch(serverChanged,values),controller.signal,function () { uncertain = true; }));
                if (!alive() || token !== issued) return;
                patchResponded = true;
                var canonical = readServer(await ui.request('/api/v1/auth/preferences',{signal:controller.signal}));
                if (!alive() || token !== issued) return;
                if (serverChanged.some(function (key) { return result[key] !== canonical[key] || canonical[key] !== values[key]; })) throw new Error('Unconfirmed save');
                serverKeys.forEach(function (key) { snapshot[key] = canonical[key]; var input = control(key); if (input.type === 'checkbox') input.checked = canonical[key]; else input.value = canonical[key]; }); uncertain = false; serverWritten = true;
            }
            if (localChanged.length) {
                localChanged.forEach(function (key) { localPending.add(key); });
                var merged = Object.assign({},local(),patch(localChanged,values));
                if (!storage.local.set('chat-settings-v1',merged)) { update(serverWritten ? config.words.partial : config.words.page_only); return; }
                var canonicalLocal = local();
                if (localChanged.some(function (key) { return canonicalLocal[key] !== values[key]; })) { update(config.words.unconfirmed); return; }
                localChanged.forEach(function (key) { localPending.delete(key); });
                localKeys.forEach(function (key) { snapshot[key] = effective(Object.prototype.hasOwnProperty.call(canonicalLocal,key) ? canonicalLocal : config.values,key); });
            }
            writeForm(snapshot); emit(); update(config.words.saved);
        } catch (error) {
            if (alive() && token === issued && !controller.signal.aborted) {
                if (!patchResponded && [400,401,403,404,409,422].includes(error.status)) uncertain = false;
                update(uncertain ? config.words.unconfirmed : config.words.error);
            }
        } finally {
            if (alive() && token === issued) { operation = null; lock(false); var valid = emit(); update(valid ? status.textContent : invalidMessage()); }
        }
    }
    async function readBack() {
        if (!alive() || busy) return;
        var controller = new AbortController(), token = ++issued; operation = controller; lock(true); update(ui.label('loading'));
        try {
            var canonical = readServer(await ui.request('/api/v1/auth/preferences',{signal:controller.signal}));
            if (!alive() || token !== issued) return;
            var draft = readForm();
            serverKeys.forEach(function (key) { if (draft[key] === snapshot[key]) { var input = control(key); if (input.type === 'checkbox') input.checked = canonical[key]; else input.value = canonical[key]; } snapshot[key] = canonical[key]; }); uncertain = false; update(dirty() ? config.words.unsaved : config.words.saved);
        } catch (_) { if (alive() && token === issued && !controller.signal.aborted) update(config.words.unconfirmed); }
        finally { if (alive() && token === issued) { operation = null; lock(false); var valid = emit(); update(valid ? status.textContent : invalidMessage()); } }
    }
    function reset(event) {
        event.preventDefault(); if (!alive() || busy) return;
        if (uncertain) { update(config.words.unconfirmed); return; }
        if (localPending.size) {
            var names = Array.from(localPending);
            if (storage.local.set('chat-settings-v1',Object.assign({},local(),patch(names,snapshot)))) localPending.clear();
        }
        preview = null; writeForm(snapshot); emit(); update(localPending.size ? config.words.page_only : '');
    }
    function suspend(event) {
        issued++; if (operation) operation.abort(); operation = null; lock(false); activePage = false;
        if (!event.persisted) dispose();
    }
    function dispose() {
        if (disposed) return; disposed = true; activePage = false; issued++; if (operation) operation.abort(); life.abort(); window.removeEventListener('beforeunload',warn);
        form.querySelectorAll('fieldset').forEach(function (set) { set.disabled = true; }); save.disabled = discard.disabled = check.disabled = true; snapshot = null; preview = null; config.values = null; localPending.clear();
    }
    var initialLocal = local(); localKeys.forEach(function (key) { if (Object.prototype.hasOwnProperty.call(initialLocal,key)) snapshot[key] = effective(initialLocal,key); });
    writeForm(snapshot); emit(); var invalid = Array.from(form.elements).find(function (input) { return input.willValidate && !input.validity.valid; }); update(invalid ? invalid.validationMessage : '');
    on(form,'submit',persist); on(form,'reset',reset); on(check,'click',readBack);
    on(form,'input',function (event) {
        if (!alive() || busy) return;
        var mirror = event.target.id === 'chat-font-scale' ? 'chat_font_scale' : event.target.id === 'chat-width' ? 'chat_width_px' : null;
        if (mirror) control(mirror).value = event.target.value;
        mirrors();
        if (event.target.tagName === 'TEXTAREA') validate(false); else emit();
        update();
    });
    on(form,'change',function (event) { if (alive() && !busy && event.target.tagName === 'TEXTAREA') { var valid = emit(); update(valid ? undefined : invalidMessage()); } });
    on(window,'pagehide',suspend); on(window,'pageshow',function () { activePage = !disposed; if (alive()) update(uncertain ? config.words.unconfirmed : undefined); });
    on(window,'browserprofilechange',dispose);
    on(window,'storage',function (event) {
        if (!alive() || busy || dirty() || !storage.local.matchesEvent(event,'chat-settings-v1')) return;
        var latest = local(); localKeys.forEach(function (key) { snapshot[key] = Object.prototype.hasOwnProperty.call(latest,key) ? effective(latest,key) : effective(config.values,key); }); writeForm(snapshot); emit(); update();
    });
    on(document,'iv:content-added',function () { if (!form.isConnected) dispose(); });
    window.InvidiousChatPreferences = {values:function () { return alive() && preview ? Object.assign({},preview) : null; },patterns:patterns,mutation:mutation,dispose:dispose};
    var focusField = new URLSearchParams(location.search).get('field'), target = focusField && control(focusField); if (target && typeof target.focus === 'function') target.focus();
})();
