'use strict';
(function () {
    var dialog = document.getElementById('dearrow-dialog');
    if (!dialog) return;
    var config = JSON.parse(document.getElementById('dearrow-contribution-config').textContent);
    var open = document.getElementById('dearrow-open');
    var status = document.getElementById('dearrow-status');
    var editor = document.getElementById('dearrow-editor');
    var confirm = document.getElementById('dearrow-confirm');
    var draft = document.getElementById('dearrow-draft');
    var send = document.getElementById('dearrow-send');
    var refresh = document.getElementById('dearrow-refresh');
    var originalRow = document.getElementById('dearrow-original');
    var titles = document.getElementById('dearrow-titles');
    var checks = Array.from(confirm.querySelectorAll('input[type=checkbox]'));
    var pending = false;
    var loaded = false;
    var proposal = '';

    function busy(value) {
        pending = value;
        dialog.setAttribute('aria-busy', String(value));
        dialog.querySelectorAll('.dearrow-votes button, #dearrow-refresh, #dearrow-draft-form button, #dearrow-edit').forEach(function (button) {
            button.disabled = value || button.dataset.unavailable === 'true';
        });
        send.disabled = value || !checks.every(function (check) { return check.checked; });
        checks.forEach(function (check) { check.disabled = value; });
    }

    async function request(url, body) {
        var controller = new AbortController();
        var timeout = setTimeout(function () { controller.abort(); }, 15000);
        try {
            var response = await fetch(url, {
                method: body ? 'POST' : 'GET',
                credentials: 'same-origin',
                cache: 'no-store',
                signal: controller.signal,
                headers: body ? {'Content-Type': 'application/x-www-form-urlencoded'} : {},
                body: body ? new URLSearchParams(body).toString() : undefined
            });
            var result = await response.json();
            if (!response.ok) throw new Error(result.error || config.error);
            return result;
        } finally { clearTimeout(timeout); }
    }

    function buttons(container, item, original) {
        container.replaceChildren();
        ['upvote', 'downvote'].forEach(function (action) {
            var button = document.createElement('button');
            button.type = 'button';
            button.className = 'pure-button';
            button.setAttribute('aria-label', config[action] + ': ' + (original ? originalRow.firstElementChild.textContent : item.title.replace(/>/g, '')));
            var icon = document.createElement('i');
            icon.className = 'icon ion-ios-thumbs-up';
            if (action === 'downvote') icon.className = 'icon ion-ios-thumbs-down';
            icon.setAttribute('aria-hidden', 'true');
            button.appendChild(icon);
            var reason = action === 'downvote' ? (!item ? config.no_original : item.locked ? config.locked : '') : '';
            button.dataset.unavailable = String(!!reason);
            button.disabled = pending || !!reason;
            button.title = reason || config[action];
            if (reason) {
                var wrapper = document.createElement('span');
                wrapper.tabIndex = 0;
                wrapper.title = reason;
                wrapper.setAttribute('aria-label', reason);
                wrapper.appendChild(button);
                container.appendChild(wrapper);
            } else container.appendChild(button);
            button.addEventListener('click', function () {
                contribute({action: action, original: String(original), uuid: item ? item.UUID : ''});
            });
        });
    }

    async function load() {
        var result = await request('/api/v1/dearrow/' + encodeURIComponent(dialog.dataset.videoId) + '/submissions');
        if (!Array.isArray(result.titles)) throw new Error(config.error);
        buttons(originalRow.querySelector('.dearrow-votes'), result.titles.find(function (item) { return item.original; }), true);
        titles.replaceChildren();
        result.titles.filter(function (item) { return !item.original; }).forEach(function (item) {
            var row = document.createElement('div');
            row.className = 'dearrow-row';
            var text = document.createElement('span');
            text.dir = 'auto';
            text.textContent = item.title.replace(/>/g, '');
            var votes = document.createElement('div');
            votes.className = 'dearrow-votes';
            buttons(votes, item, false);
            row.append(text, votes);
            titles.appendChild(row);
        });
        if (!titles.childElementCount) titles.textContent = config.empty;
        loaded = true;
    }

    async function reload() {
        if (pending) return;
        busy(true);
        status.textContent = config.loading;
        try { await load(); status.textContent = ''; }
        catch (error) { status.textContent = error.message || config.error; }
        finally { busy(false); }
    }

    function edit(focusDraft) {
        confirm.hidden = true;
        editor.hidden = false;
        checks.forEach(function (check) { check.checked = false; });
        send.disabled = true;
        if (dialog.open && focusDraft !== false) draft.focus();
    }

    async function contribute(fields) {
        if (pending) return;
        busy(true);
        status.textContent = config.sending;
        try {
            fields.video_id = dialog.dataset.videoId;
            fields.csrf_token = config.csrf;
            await request('/dearrow_submit', fields);
            if (fields.action === 'submit') { draft.value = ''; edit(false); }
            status.textContent = config.success;
            try { await load(); }
            catch (_) { status.textContent = config.partial; }
            if (dialog.open) { status.focus(); dialog.scrollTop = 0; }
        } catch (error) { status.textContent = error.message || config.error; }
        finally { busy(false); }
    }

    function show() {
        dialog.showModal();
        if (!loaded) reload();
    }
    open.addEventListener('click', show);
    show();
    document.getElementById('dearrow-close').addEventListener('click', function () { dialog.close(); });
    dialog.addEventListener('close', function () { open.focus(); });
    refresh.addEventListener('click', reload);
    document.getElementById('dearrow-edit').addEventListener('click', edit);
    document.getElementById('dearrow-draft-form').addEventListener('submit', function (event) {
        event.preventDefault();
        if (pending || !draft.value.trim()) return;
        proposal = draft.value.trim();
        checks.forEach(function (check) { check.checked = false; });
        send.disabled = true;
        document.getElementById('dearrow-preview').textContent = proposal;
        editor.hidden = true;
        confirm.hidden = false;
        checks[0].focus();
    });
    confirm.addEventListener('change', function () { busy(pending); });
    confirm.addEventListener('submit', function (event) {
        event.preventDefault();
        if (!checks.every(function (check) { return check.checked; })) return;
        contribute({action: 'submit', title: proposal, confirmed: 'true'});
    });
})();
