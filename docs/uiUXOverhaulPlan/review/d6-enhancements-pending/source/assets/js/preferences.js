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
            ui.invalidate();
            var result = await ui.request(url, {method: 'POST', body: body});
            if (!result || !result.preferences || typeof result.preferences !== 'object' || Array.isArray(result.preferences) || !/^[a-f0-9]{64}$/.test(result.fingerprint)) throw new Error('Missing saved preferences');
            // The default GET now opens one category. Its JSON metadata attests
            // the full saved receipt, including the actual retained guest cookie.
            var canonical = await ui.request('/preferences?section=appearance&format=json');
            if (!canonical || canonical.profile !== InvidiousStorage.scope || canonical.fingerprint !== result.fingerprint || !/^[a-f0-9]{64}$/.test(canonical.browseFingerprint)) throw new Error('Preferences did not persist');
            function savedValue(name) {
                var array = /^(captions|comments|feed_menu)\[([0-9]+)\]$/.exec(name);
                if (array) return result.preferences[array[1]] && result.preferences[array[1]][Number(array[2])] || '';
                var category = /^sponsorblock_(mode|color)_(.+)$/.exec(name);
                if (category) { var map = result.preferences[category[1] === 'mode' ? 'sponsorblock_modes' : 'sponsorblock_colors']; return map && map[category[2]]; }
                return result.preferences[name];
            }
            controls.forEach(function (el) { el.disabled = false; });
            Array.from(form.elements).forEach(function (el) {
                if (!el.name) return;
                var value = savedValue(el.name);
                if (value === undefined) return;
                if (el.type === 'checkbox' || el.type === 'radio') { el.checked = value === true; el.defaultChecked = el.checked; }
                else if (el.tagName === 'SELECT') {
                    value = value === null ? '' : String(value);
                    if (!Array.from(el.options).some(function (option) { return option.value === value; })) el.add(new Option(value, value));
                    el.value = value;
                    Array.from(el.options).forEach(function (option) { option.defaultSelected = option.selected; });
                } else { el.value = value === null ? '' : String(value); el.defaultValue = el.value; }
            });
            initial = snapshot(); dirty = false;
            savedMode = form.elements.dark_mode.value; savedDensity = form.elements.ui_density.value;
            helpers.storage.set('dark_mode', savedMode);
            ui.config.fingerprint = result.fingerprint;
            ui.config.browseFingerprint = canonical.browseFingerprint;
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
