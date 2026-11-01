'use strict';
// Normal HTML forms remain usable. Enhanced failures keep their typed draft;
// ambiguous additions/creations require checking the library before another write.
(function () {
    var ui = window.InvidiousUI;
    if (!ui) return;
    var words = JSON.parse(document.getElementById('overhaul-config').textContent);
    document.querySelectorAll('[data-playlist-form]').forEach(function (form) {
        var lifetime = new AbortController(), request, pending = false, active = true, epoch = 0;
        var mode = form.dataset.playlistForm, submit = form.querySelector('button[type=submit],button:not([type])');
        var status = form.querySelector('[data-playlist-form-status]'), check = form.querySelector('[data-check-playlist]');
        var uncertain = submit.disabled;
        function alive() { return active && !lifetime.signal.aborted && form.isConnected && InvidiousStorage.isCurrent(); }
        function render() { submit.disabled = pending || uncertain || !InvidiousStorage.isCurrent(); form.setAttribute('aria-busy',String(pending)); }
        function unknown() {
            uncertain = mode !== 'edit';
            status.hidden = false; ui.status(status,mode === 'add' ? ui.label('check_playlist') : words[mode === 'create' ? 'creation_uncertain' : 'edit_uncertain']);
            if (check) { check.hidden = false; if (form.dataset.playlistId) check.href = '/playlist?list='+encodeURIComponent(form.dataset.playlistId); }
        }
        form.addEventListener('submit',async function (event) {
            event.preventDefault(); if (!alive() || pending || uncertain || !form.reportValidity()) return;
            var generation = epoch; pending = true; render(); status.hidden = false; ui.status(status,ui.label('saving'));
            form.querySelectorAll('[aria-invalid=true]').forEach(function (field) { field.setAttribute('aria-invalid','false'); });
            var target = new URL(form.action,location.href); target.searchParams.set('redirect','false');
            request = new AbortController();
            try {
                var result = await ui.request(target.href,{method:'POST',body:new URLSearchParams(new FormData(form)),signal:request.signal});
                if (!alive() || generation !== epoch) return;
                var id = mode === 'add' ? form.dataset.playlistId : result.playlistId;
                if (typeof id !== 'string' || !/^IV[A-Za-z0-9_-]{1,98}$/.test(id) || (mode === 'edit' && id !== form.dataset.playlistId)) throw new Error(ui.label('error'));
                location.assign('/playlist?list='+encodeURIComponent(id));
            } catch (error) {
                if (!alive() || generation !== epoch) return;
                if (!error.status || error.status >= 500 || error.status === 408 || error.status < 400) unknown();
                else {
                    ui.status(status,error.userMessage || ui.label('error')); status.setAttribute('role','alert');
                    var field = error.field && form.elements.namedItem(error.field);
                    if (field && typeof field.focus === 'function') { field.setAttribute('aria-invalid','true'); field.focus(); }
                }
            } finally { if (generation === epoch) { pending = false; request = null; if (alive()) render(); } }
        },{signal:lifetime.signal});
        window.addEventListener('pagehide',function (event) {
            epoch++;
            if (pending) { unknown(); pending = false; render(); }
            active = false; if (request) request.abort(); request = null;
            if (!event.persisted) lifetime.abort();
        },{signal:lifetime.signal});
        window.addEventListener('pageshow',function () { active = true; render(); },{signal:lifetime.signal});
        window.addEventListener('browserprofilechange',function () { active = false; if (request) request.abort(); submit.disabled = true; lifetime.abort(); },{signal:lifetime.signal});
        document.addEventListener('iv:content-added',function () { if (!form.isConnected) { if (request) request.abort(); lifetime.abort(); } },{signal:lifetime.signal});
        render();
    });
})();
