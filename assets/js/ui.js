'use strict';
// Shared, profile-guarded requests. Mutations are never automatically retried.
window.InvidiousUI = (function () {
    var config = JSON.parse(document.getElementById('ui-config').textContent);
    var locks = new Set();
    function label(key, values) {
        var text = config.words[key] || key;
        Object.keys(values || {}).forEach(function (name) { text = text.replaceAll('{' + name + '}', String(values[name])); });
        return text;
    }
    async function request(url, options) {
        options = Object.assign({credentials: 'same-origin', cache: 'no-store'}, options);
        var target = new URL(url, location.href);
        if (target.origin !== location.origin || !InvidiousStorage.isCurrent()) throw new Error(label('error'));
        var controller = new AbortController();
        var timer = setTimeout(function () { controller.abort(); }, options.timeout || 15000);
        options.signal = controller.signal;
        options.headers = Object.assign({Accept: 'application/json'}, options.headers);
        if (options.body instanceof FormData) options.body = new URLSearchParams(options.body);
        try {
            var response = await fetch(target.href, options);
            if (!InvidiousStorage.checkResponse(response)) throw new Error(label('error'));
            if (!response.ok || response.redirected) {
                var failure = new Error(label('error'));
                failure.status = response.status;
                throw failure;
            }
            if (options.html) {
                if (!(response.headers.get('Content-Type') || '').includes('text/html')) throw new Error(label('error'));
                var source = await response.text();
                if (!InvidiousStorage.isCurrent()) throw new Error(label('error'));
                return new DOMParser().parseFromString(source, 'text/html');
            }
            var data = response.status === 204 ? {} : await response.json();
            if (!InvidiousStorage.isCurrent()) throw new Error(label('error'));
            return data;
        } finally { clearTimeout(timer); }
    }
    function post(url, data) {
        return request(url, {method: 'POST', body: new URLSearchParams(Object.assign({csrf_token: config.csrf}, data))});
    }
    function status(target, text, retry) {
        target.replaceChildren(document.createTextNode(text));
        target.setAttribute('role', 'status');
        if (retry) {
            var button = document.createElement('button');
            button.type = 'button'; button.className = 'pure-button ui-retry'; button.textContent = label('retry');
            button.onclick = retry;
            target.append(' ', button);
        }
    }
    function notice(text, retry) {
        var target = document.getElementById('ui-notice');
        if (!target) return;
        target.hidden = false;
        status(target.querySelector('[role=status]'), text, retry);
    }
    function dismissNotice() {
        var target = document.getElementById('ui-notice');
        if (target) target.hidden = true;
    }
    async function action(key, button, task, onSuccess) {
        if (locks.has(key)) return false;
        locks.add(key);
        var restoreFocus = button && button.contains(document.activeElement);
        var row = button && button.closest('.media-item, .subscription-row');
        var neighbor = row && (row.nextElementSibling || row.previousElementSibling);
        if (button) { button.disabled = true; button.setAttribute('aria-busy', 'true'); }
        try {
            var result = await task();
            if (onSuccess) onSuccess(result);
            if (restoreFocus && !button.isConnected) {
                var next = neighbor && neighbor.isConnected && neighbor.querySelector('a[href], button, input');
                (next || document.getElementById('main-content')).focus();
            }
            document.dispatchEvent(new Event('iv:library-change'));
            notice(label('saved'));
            return true;
        } catch (_) {
            // A playlist addition may have committed before a timeout. Ask the
            // user to check it instead of offering a duplicate-producing retry.
            notice(label(key.startsWith('add:') ? 'check_playlist' : 'error'), key.startsWith('add:') ? null : function () {
                action(key, button, task, onSuccess);
            });
            return false;
        } finally {
            locks.delete(key);
            if (button) { button.disabled = false; button.removeAttribute('aria-busy'); }
        }
    }
    function changed(root) { document.dispatchEvent(new CustomEvent('iv:content-added', {detail: root})); }
    function invalidate() {
        InvidiousStorage.session.remove('browse_state');
        document.dispatchEvent(new Event('iv:preferences-change'));
    }
    function removeRows(rows, amount) {
        var count = document.getElementById('count');
        if (count && /^\d+$/.test(count.textContent.trim())) count.textContent = Math.max(0, Number(count.textContent) - (amount === undefined ? rows.length : amount));
        rows.forEach(function (row) {
            var group = row.closest('.history-group');
            row.remove();
            if (group && !group.querySelector('.media-item')) group.remove();
        });
    }
    function watched(id, value) {
        if (!InvidiousStorage.isCurrent()) return;
        document.querySelectorAll('.watched-indicator').forEach(function (indicator) {
            if (indicator.dataset.id === id) indicator.dataset.watched = String(value);
        });
        var rows = Array.from(document.querySelectorAll('.media-item[data-video-id]')).filter(function (row) { return row.dataset.videoId === id; });
        rows.forEach(function (row) {
            row.querySelectorAll('.watched-overlay').forEach(function (overlay) { overlay.remove(); });
            var thumbnail = row.querySelector('.video-thumbnail');
            if (value && thumbnail && thumbnail.querySelector('img')) {
                var overlay = document.createElement('div'); overlay.className = 'watched-overlay'; thumbnail.append(overlay);
            }
        });
        if (!value && location.pathname === '/feed/history') removeRows(rows, 1);
        if (value && config.unseenOnly && location.pathname === '/feed/subscriptions') removeRows(rows);
        document.dispatchEvent(new CustomEvent('iv:watched-change', {detail: {id: id, watched: value}}));
    }
    return {config: config, label: label, request: request, post: post, status: status, notice: notice, dismissNotice: dismissNotice,
        action: action, changed: changed, invalidate: invalidate, removeRows: removeRows, watched: watched};
})();
