'use strict';
(function () {
    var form = document.querySelector('.preferences-form');
    if (!form) return;
    var ui = InvidiousUI, search = document.getElementById('preferences-search');
    var status = document.getElementById('preferences-status');
    var save = form.querySelector('.preferences-save [type=submit]');
    var discard = document.getElementById('preferences-discard');
    var sections = Array.from(form.querySelectorAll('.preferences-section'));
    var initial = new URLSearchParams(new FormData(form)).toString();
    var busy = false, dirty = false;
    // Search can hide an invalid control. Reveal it before asking the browser
    // to focus/report it rather than letting native submit validation stall.
    form.noValidate = true;
    var savedMode = form.elements.dark_mode.value, savedDensity = form.elements.ui_density.value;
    var savedLocale = form.elements.locale.value;
    function snapshot() { return new URLSearchParams(new FormData(form)).toString(); }
    function preview() {
        setTheme(form.elements.dark_mode.value);
        document.body.dataset.density = form.elements.ui_density.value;
    }
    function update() {
        dirty = snapshot() !== initial;
        form.classList.toggle('is-dirty', dirty);
        save.disabled = busy || !dirty; discard.disabled = busy || !dirty;
        ui.status(status, busy ? ui.label('saving') : dirty ? ui.label('unsaved') : ui.label('saved'));
        preview();
    }
    function filter() {
        var term = search.value.trim().toLocaleLowerCase();
        var matches = 0;
        sections.forEach(function (section) {
            // Only control rows are filtered. They remain enabled so submitting
            // a search result never clears preferences hidden from view.
            var rows = section.querySelectorAll('.pure-control-group');
            var sectionMatch = section.querySelector('legend').textContent.toLocaleLowerCase().includes(term);
            var found = !term || sectionMatch;
            rows.forEach(function (row) {
                row.hidden = !!term && !sectionMatch && !row.textContent.toLocaleLowerCase().includes(term);
                if (!row.hidden) found = true;
            });
            if (!found && section.textContent.toLocaleLowerCase().includes(term)) found = true;
            section.hidden = !found;
            if (found) matches++;
            var link = document.querySelector('.preference-nav a[href="#' + section.id + '"]');
            if (link) link.hidden = !found;
        });
        document.getElementById('preferences-no-matches').hidden = matches > 0;
    }
    search.addEventListener('input', filter);
    document.getElementById('preferences-clear-search').onclick = function () { search.value = ''; filter(); search.focus(); };
    form.addEventListener('input', update);
    form.addEventListener('change', update);
    discard.onclick = function () {
        form.reset();
        setTheme(savedMode); document.body.dataset.density = savedDensity;
        update();
    };
    window.addEventListener('beforeunload', function (event) {
        if (dirty) { event.preventDefault(); event.returnValue = ''; }
    });
    form.addEventListener('submit', async function (event) {
        event.preventDefault();
        if (busy) return;
        if (!form.checkValidity()) {
            search.value = ''; filter();
            ui.status(status, ui.label('error'));
            form.reportValidity();
            return;
        }
        // Capture enabled fields before disabling controls.
        var body = new URLSearchParams(new FormData(form));
        busy = true;
        var controls = Array.from(form.elements).filter(function (el) { return !el.disabled; });
        ui.status(status, ui.label('saving'));
        controls.forEach(function (el) { el.disabled = true; });
        try {
            var url = new URL(form.action); url.searchParams.set('redirect', 'false');
            var result = await ui.request(url, {method: 'POST', body: body});
            if (!result.preferences) throw new Error('Missing saved preferences');
            // Read back the authoritative form, including normalized values,
            // admin controls and the guest cookie after Set-Cookie was applied.
            var documentAfterSave = await ui.request('/preferences', {html: true, headers: {Accept: 'text/html'}});
            var canonical = documentAfterSave.querySelector('.preferences-form');
            if (!canonical || JSON.parse(documentAfterSave.getElementById('ui-config').textContent).fingerprint !== result.fingerprint) throw new Error('Preferences did not persist');
            controls.forEach(function (el) { el.disabled = false; });
            Array.from(form.elements).forEach(function (el) {
                if (!el.name) return;
                var other = Array.from(canonical.elements).find(function (candidate) { return candidate.name === el.name; });
                if (!other) return;
                if (el.type === 'checkbox' || el.type === 'radio') { el.checked = other.checked; el.defaultChecked = other.checked; }
                else if (el.tagName === 'SELECT') {
                    el.value = other.value;
                    Array.from(el.options).forEach(function (option) { option.defaultSelected = option.selected; });
                } else { el.value = other.value; el.defaultValue = other.value; }
            });
            initial = snapshot(); dirty = false;
            savedMode = form.elements.dark_mode.value; savedDensity = form.elements.ui_density.value;
            helpers.storage.set('dark_mode', savedMode);
            ui.config.fingerprint = result.fingerprint;
            ui.config.browseFingerprint = JSON.parse(documentAfterSave.getElementById('ui-config').textContent).browseFingerprint;
            ui.invalidate();
            if (savedLocale !== result.preferences.locale) location.reload();
        } catch (_) {
            // Keep the submitted draft if persistence or read-back fails.
            ui.status(status, ui.label('error'));
            controls.forEach(function (el) { el.disabled = false; });
            busy = false;
            dirty = snapshot() !== initial;
            save.disabled = false; discard.disabled = !dirty;
            return;
        } finally {
            controls.forEach(function (el) { el.disabled = false; });
            busy = false;
        }
        update();
    });
    window.addEventListener('DOMContentLoaded', update);
    update();
})();
