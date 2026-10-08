'use strict';
(function () {
    var root = document.getElementById('sponsorblock-channels');
    if (!root || root.dataset.guest !== 'true' || window.InvidiousStorage.scope !== 'guest') return;
    var storageKey = 'sponsorblock_channel_overrides';
    var saved = helpers.storage.get(storageKey) || {};
    var list = document.getElementById('sponsorblock-saved-channels');
    var status = document.getElementById('sponsorblock-save-status');
    document.getElementById('sponsorblock-controls').hidden = false;

    function save() {
        window.InvidiousStorage.report(helpers.storage.set(storageKey, saved), status);
        render();
    }
    function render() {
        list.replaceChildren();
        var ids = Object.keys(saved).sort(function (a, b) { return saved[a].name.localeCompare(saved[b].name); });
        if (!ids.length) {
            var empty = document.createElement('p');
            empty.textContent = list.dataset.empty;
            list.appendChild(empty);
        }
        ids.forEach(function (id) {
            var row = document.createElement('div');
            row.className = 'h-box';
            var channel = document.createElement('a');
            channel.href = '/channel/' + id;
            channel.textContent = saved[id].name;
            var edit = document.createElement('a');
            edit.href = '/preferences/sponsorblock/channels?channel=' + id;
            edit.textContent = list.dataset.edit;
            var reset = document.createElement('button');
            reset.type = 'button'; reset.className = 'pure-button'; reset.textContent = list.dataset.reset;
            reset.addEventListener('click', function () {
                if (!window.InvidiousStorage.isCurrent()) return;
                delete saved[id]; save(); restoreEditor(id);
            });
            row.append(channel, document.createTextNode(' · '), edit, document.createTextNode(' '), reset);
            list.appendChild(row);
        });
    }
    function restoreEditor(id) {
        root.querySelectorAll('.sponsorblock-channel-form').forEach(function (form) {
            if (form.elements.channel.value !== id) return;
            var entry = saved[id];
            form.elements.enabled.value = !entry || entry.enabled === null ? 'inherit' : String(entry.enabled);
            form.querySelectorAll('select[name^="mode_"]').forEach(function (select) {
                select.value = entry && entry.modes[select.name.slice(5)] || 'inherit';
            });
        });
    }
    root.querySelectorAll('.sponsorblock-channel-form').forEach(function (form) {
        restoreEditor(form.elements.channel.value);
        form.addEventListener('submit', function (event) {
            event.preventDefault();
            if (!window.InvidiousStorage.isCurrent()) return;
            var id = form.elements.channel.value;
            if (event.submitter && event.submitter.value === 'reset') delete saved[id];
            else {
                var overrides = {};
                form.querySelectorAll('select[name^="mode_"]').forEach(function (select) {
                    if (select.value !== 'inherit') overrides[select.name.slice(5)] = select.value;
                });
                var enabled = form.elements.enabled.value === 'inherit' ? null : form.elements.enabled.value === 'true';
                if (enabled === null && !Object.keys(overrides).length) delete saved[id];
                else saved[id] = {name: form.dataset.name, enabled: enabled, modes: overrides};
            }
            saved = window.InvidiousStorage.normalize(storageKey, saved);
            save(); restoreEditor(id);
        });
    });
    window.addEventListener('storage', function (event) {
        if (!helpers.storage.matchesEvent(event, storageKey)) return;
        saved = helpers.storage.get(storageKey) || {};
        render();
        root.querySelectorAll('.sponsorblock-channel-form').forEach(function (form) { restoreEditor(form.elements.channel.value); });
    });
    render();
}());
