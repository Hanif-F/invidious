'use strict';
// Settings is one bounded, server-rendered component. Category fragments and
// their drafts stay in this document's memory; all other links navigate normally.
(function () {
    var initial = document.getElementById('settings-config');
    if (!initial || document.documentElement.dataset.settingsInitialized) return;
    document.documentElement.dataset.settingsInitialized = 'true';
    var ui = window.InvidiousUI, storage = window.InvidiousStorage;
    var config = JSON.parse(initial.textContent), entries = new Map();
    var root = document.querySelector('.settings-layout'), current, pending = false, navigation = 0, categoryController;
    var navigationStatus = root.querySelector('[data-settings-navigation-status]');
    var lifecycle = new AbortController(), beforeUnload = false;
    function text(key) { return config.words[key] || ui.label(key); }
    function json(value) {
        if (Array.isArray(value)) return '[' + value.map(json).join(',') + ']';
        if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(function (key) { return JSON.stringify(key) + ':' + json(value[key]); }).join(',') + '}';
        return JSON.stringify(value);
    }
    function snapshot(form) {
        return Array.from(new FormData(form)).filter(function (entry) { return !['section','csrf_token','browser_profile'].includes(entry[0]); }).map(function (entry) { return entry[0] + '=' + entry[1]; }).join('&');
    }
    function warn(event) { event.preventDefault(); event.returnValue = ''; }
    function fieldControl(form, field) {
        return Array.from(form.elements).find(function (control) {
            return control.name === field || control.name.startsWith(field + '[') ||
                (field === 'sponsorblock_modes' && control.name.startsWith('sponsorblock_mode_')) ||
                (field === 'sponsorblock_colors' && control.name.startsWith('sponsorblock_color_'));
        });
    }
    function update(entry) {
        entry.dirty = entry.failedDraft || snapshot(entry.form) !== entry.original;
        entry.save.disabled = pending || !entry.dirty;
        entry.discard.hidden = !entry.dirty;
        var dirty = Array.from(entries.values()).some(function (item) { return item.dirty; });
        if (dirty && !beforeUnload) { window.addEventListener('beforeunload', warn); beforeUnload = true; }
        if (!dirty && beforeUnload) { window.removeEventListener('beforeunload', warn); beforeUnload = false; }
        if (entry.dirty && !pending) entry.status.textContent = text('unsaved');
    }
    function setValues(entry, values) {
        Array.from(entry.form.elements).forEach(function (control) {
            if (!control.name || ['section','csrf_token','browser_profile'].includes(control.name)) return;
            var name = control.name, value, array = /^(captions|comments|feed_menu)\[(\d+)\]$/.exec(name);
            var map = /^sponsorblock_(mode|color)_(.+)$/.exec(name);
            if (array) value = (values[array[1]] || [])[Number(array[2])];
            else if (map) value = (values[map[1] === 'mode' ? 'sponsorblock_modes' : 'sponsorblock_colors'] || {})[map[2]];
            else value = values[name];
            if (control.type === 'checkbox') { control.checked = value === true; control.defaultChecked = control.checked; }
            else {
                value = value === null || value === undefined ? '' : String(value);
                if (control.tagName === 'SELECT' && !Array.from(control.options).some(function (option) { return option.value === value; })) control.add(new Option(value, value));
                control.value = value; control.defaultValue = value;
                if (control.tagName === 'SELECT') Array.from(control.options).forEach(function (option) { option.defaultSelected = option.selected; });
            }
        });
    }
    function preview(entry) {
        if (entry.config.section === 'appearance' && window.setTheme) window.setTheme(entry.form.elements.dark_mode.value);
    }
    function register(panel, data) {
        var form = panel.querySelector('[data-category-form]');
        var entry = {panel:panel, config:data, form:form, save:form.querySelector('[type=submit]'), discard:form.querySelector('[type=reset]'), status:form.querySelector('[data-category-status]')};
        entry.original = snapshot(form); entry.dirty = false; entry.failedDraft = !!panel.querySelector('.settings-error');
        entries.set(data.section, entry);
        form.addEventListener('input', function (event) { event.target.removeAttribute('aria-invalid'); update(entry); preview(entry); }, {signal:lifecycle.signal});
        form.addEventListener('change', function () { update(entry); preview(entry); }, {signal:lifecycle.signal});
        form.addEventListener('reset', function (event) {
            event.preventDefault();
            entry.failedDraft = false; setValues(entry, entry.config.values); preview(entry); entry.original = snapshot(entry.form); update(entry); entry.status.textContent = '';
        }, {signal:lifecycle.signal});
        form.addEventListener('submit', function (event) { event.preventDefault(); save(entry); }, {signal:lifecycle.signal});
        update(entry);
        return entry;
    }
    async function save(entry) {
        if (lifecycle.signal.aborted || pending || !storage.isCurrent() || !entry.form.reportValidity()) return;
        pending = true;
        var controls = Array.from(entry.form.querySelectorAll('input:not([type=hidden]),select,button'));
        var body = new FormData(entry.form);
        controls.forEach(function (control) { control.disabled = true; });
        entry.form.setAttribute('aria-busy','true'); entry.status.textContent = text('saving');
        try {
            ui.invalidate();
            var result = await ui.request('/preferences?redirect=false', {method:'POST',body:body,signal:lifecycle.signal});
            if (lifecycle.signal.aborted) return;
            if (result.section !== entry.config.section || result.profile !== config.profile || !result.values) throw new Error(text('save_unconfirmed'));
            var read = await ui.request('/preferences?section=' + encodeURIComponent(entry.config.section) + '&format=json', {signal:lifecycle.signal});
            if (lifecycle.signal.aborted) return;
            if (read.section !== result.section || read.profile !== config.profile || json(read.values) !== json(result.values)) throw new Error(text('save_unconfirmed'));
            var localeChanged = entry.config.section === 'language' && entry.config.values.locale !== read.values.locale;
            entry.config.values = read.values;
            setValues(entry, read.values);
            controls.forEach(function (control) { control.disabled = false; control.removeAttribute('aria-invalid'); });
            entry.failedDraft = false;
            entry.original = snapshot(entry.form);
            ui.invalidate();
            if (entry.config.section === 'appearance') {
                preview(entry);
                storage.local.set('dark_mode', read.values.dark_mode);
            }
            entry.status.textContent = text(localeChanged ? 'language_saved' : 'saved');
        } catch (error) {
            if (lifecycle.signal.aborted) return;
            entry.status.textContent = error.userMessage || text('save_unconfirmed');
            var reload = document.createElement('a'); reload.className = 'button'; reload.href = '/preferences?section=' + encodeURIComponent(entry.config.section); reload.textContent = text('reload');
            entry.status.append(' ', reload);
            if (error.field) {
                var target = fieldControl(entry.form, error.field);
                if (target) target.setAttribute('aria-invalid','true');
            }
        } finally {
            pending = false;
            if (lifecycle.signal.aborted) return;
            entry.form.removeAttribute('aria-busy');
            controls.forEach(function (control) { control.disabled = false; });
            // Preserve the truthful outcome notice while recalculating dirtiness.
            var outcome = Array.from(entry.status.childNodes);
            update(entry); entry.status.replaceChildren.apply(entry.status,outcome);
            if (!entry.dirty) entry.discard.hidden = true;
        }
    }
    async function category(id, field) {
        if (lifecycle.signal.aborted || pending || !storage.isCurrent()) return;
        var request = ++navigation;
        if (categoryController) categoryController.abort();
        categoryController = null;
        navigationStatus.hidden = true; navigationStatus.replaceChildren();
        try {
            var entry = entries.get(id);
            if (!entry) {
                root.setAttribute('aria-busy','true');
                categoryController = new AbortController();
                var documentResult = await ui.request('/preferences?section=' + encodeURIComponent(id), {html:true,signal:categoryController.signal});
                if (lifecycle.signal.aborted) return;
                var source = documentResult.getElementById('settings-config');
                var panel = documentResult.querySelector('[data-settings-panel]');
                var data = source && JSON.parse(source.textContent);
                if (!data || data.section !== id || data.profile !== config.profile || !panel) throw new Error(text('save_error'));
                if (request !== navigation) return;
                entry = register(document.importNode(panel,true), data);
            }
            if (request !== navigation || !storage.isCurrent()) return;
            current.panel.replaceWith(entry.panel); current = entry; ui.changed(entry.panel);
            document.querySelectorAll('[data-settings-category]').forEach(function (link) {
                if (link.closest('.settings-nav') && link.dataset.settingsCategory === id) link.setAttribute('aria-current','page'); else link.removeAttribute('aria-current');
            });
            // This URL is always a real Crystal/ECR GET fallback. No drafts or
            // preference values enter history, localStorage or sessionStorage.
            history.replaceState(history.state,'','/preferences?section=' + encodeURIComponent(id));
            var legacyEntry = document.querySelector('[data-settings-legacy-entry]');
            if (legacyEntry) legacyEntry.remove();
            var heading = entry.panel.querySelector('h2'); heading.tabIndex = -1;
            var target = field && fieldControl(entry.form, field);
            (target || heading).focus({preventScroll:true});
            if (target) target.scrollIntoView({block:'center'}); else heading.scrollIntoView({block:'start'});
        } catch (_) {
            if (!lifecycle.signal.aborted && request === navigation) {
                navigationStatus.hidden = false;
                ui.status(navigationStatus, text('load_error'), function () { category(id,field); });
                navigationStatus.focus({preventScroll:true}); navigationStatus.scrollIntoView({block:'nearest'});
            }
        } finally {
            if (request === navigation) { categoryController = null; root.removeAttribute('aria-busy'); }
        }
    }
    root.addEventListener('click', function (event) {
        var link = event.target.closest('a[data-settings-category]');
        if (!link || event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
        event.preventDefault(); category(link.dataset.settingsCategory,link.dataset.settingsField);
    }, {signal:lifecycle.signal});
    current = register(document.querySelector('[data-settings-panel]'), config);
    var field = new URLSearchParams(location.search).get('field');
    if (field) { var control = fieldControl(current.form, field); if (control) control.focus(); }
    window.addEventListener('pagehide', function (event) {
        if (event.persisted) return;
        if (categoryController) categoryController.abort();
        lifecycle.abort(); entries.clear(); window.removeEventListener('beforeunload',warn);
    }, {signal:lifecycle.signal});
})();
