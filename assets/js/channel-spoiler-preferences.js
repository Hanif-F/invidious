'use strict';
(function () {
    var root = document.getElementById('channel-spoilers');
    if (!root || root.dataset.guest !== 'true' || window.InvidiousStorage.scope !== 'guest') return;
    var storage = window.InvidiousStorage.local;
    var saved = storage.get('channel_spoiler_settings') || {};
    var list = document.getElementById('spoiler-saved-channels');
    var status = document.getElementById('spoiler-save-status');
    document.getElementById('spoiler-controls').hidden = false;
    function restore() {
        root.querySelectorAll('.spoiler-channel-form').forEach(function (form) {
            var rule = saved[form.elements.channel.value];
            form.elements.hide_title.checked = !!rule && rule.hide_title;
            form.elements.hide_thumbnail.checked = !!rule && rule.hide_thumbnail;
            form.elements.reveal_after_days.value = rule && rule.reveal_after_days || '';
        });
    }
    function render() {
        list.replaceChildren();
        Object.keys(saved).sort(function (a, b) { return saved[a].name.localeCompare(saved[b].name); }).forEach(function (id) {
            var row = document.createElement('p');
            var channel = document.createElement('a'); channel.href = '/channel/' + id; channel.textContent = saved[id].name;
            var edit = document.createElement('a'); edit.href = '/preferences/spoilers/channels?channel=' + id; edit.textContent = list.dataset.edit;
            var reset = document.createElement('button'); reset.type = 'button'; reset.className = 'pure-button'; reset.textContent = list.dataset.reset;
            reset.addEventListener('click', function () { if (window.InvidiousStorage.isCurrent()) { delete saved[id]; save(); } });
            row.append(channel, document.createTextNode(' · '), edit, document.createTextNode(' '), reset); list.appendChild(row);
        });
        if (!Object.keys(saved).length) { var empty = document.createElement('p'); empty.textContent = list.dataset.empty; list.appendChild(empty); }
        restore();
    }
    function save() {
        var success = storage.set('channel_spoiler_settings', saved);
        window.InvidiousStorage.report(success, status);
        // A small marker lets server rendering batch-read already cached dates.
        try {
            document.cookie = 'iv_spoilers_guest=' + (Object.keys(saved).length ? '1; Max-Age=63072000' : '; Max-Age=0') + '; Path=/; SameSite=Lax';
        } catch (_) { /* The cache-read marker is optional; storage reports persistence failures. */ }
        render();
    }
    root.querySelectorAll('.spoiler-channel-form').forEach(function (form) {
        form.addEventListener('submit', function (event) {
            event.preventDefault();
            if (!window.InvidiousStorage.isCurrent()) return;
            var id = form.elements.channel.value;
            if (event.submitter && event.submitter.value === 'reset' || !form.elements.hide_title.checked && !form.elements.hide_thumbnail.checked) delete saved[id];
            else saved[id] = {name: form.dataset.name, hide_title: form.elements.hide_title.checked,
                hide_thumbnail: form.elements.hide_thumbnail.checked,
                reveal_after_days: form.elements.reveal_after_days.value === '' ? null : Number(form.elements.reveal_after_days.value)};
            saved = window.InvidiousStorage.normalize('channel_spoiler_settings', saved); save();
        });
    });
    window.addEventListener('storage', function (event) {
        if (!storage.matchesEvent(event, 'channel_spoiler_settings')) return;
        saved = storage.get('channel_spoiler_settings') || {}; render();
    });
    render();
}());
