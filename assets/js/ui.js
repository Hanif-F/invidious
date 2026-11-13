'use strict';
// Shared, profile-guarded requests. Mutations are never automatically retried.
window.InvidiousUI = (function () {
    if (window.InvidiousUI) return window.InvidiousUI;
    var config = JSON.parse(document.getElementById('ui-config').textContent);
    // Keep the viewport condition in sync with the phone rules in Foundation.
    var phoneViewport = window.matchMedia('(width < 768px), (width < 960px) and (orientation: landscape) and (height <= 500px)');
    var locks = new Set();
    var viewport = window.visualViewport;
    function visibleBounds() {
        var safe = getComputedStyle(document.documentElement);
        function inset(edge) { return parseFloat(safe.getPropertyValue('--safe-' + edge)) || 0; }
        var top = viewport ? viewport.offsetTop : 0, left = viewport ? viewport.offsetLeft : 0;
        var width = viewport ? viewport.width : document.documentElement.clientWidth;
        var height = viewport ? viewport.height : window.innerHeight;
        return {top: top + inset('top'), left: left + inset('left'),
            right: left + width - inset('right'), bottom: top + height - inset('bottom')};
    }
    if (viewport) {
        var focusFrame;
        function updateVisibleViewport() {
            var root = document.documentElement;
            if (!phoneViewport.matches) {
                ['top', 'left', 'right', 'bottom', 'height'].forEach(function (edge) { root.style.removeProperty('--visible-' + edge); });
                return;
            }
            root.style.setProperty('--visible-top', viewport.offsetTop + 'px');
            root.style.setProperty('--visible-left', viewport.offsetLeft + 'px');
            root.style.setProperty('--visible-right', Math.max(0, root.clientWidth - viewport.offsetLeft - viewport.width) + 'px');
            root.style.setProperty('--visible-bottom', Math.max(0, window.innerHeight - viewport.offsetTop - viewport.height) + 'px');
            root.style.setProperty('--visible-height', viewport.height + 'px');
        }
        viewport.addEventListener('resize', function () {
            updateVisibleViewport();
            if (!phoneViewport.matches) return;
            cancelAnimationFrame(focusFrame);
            focusFrame = requestAnimationFrame(function () {
                var focused = document.activeElement;
                if (focused && focused.matches('input,select,textarea') && focused.closest('dialog:modal')) {
                    focused.scrollIntoView({block:'nearest',inline:'nearest'});
                }
            });
        });
        viewport.addEventListener('scroll', updateVisibleViewport);
        phoneViewport.addEventListener('change', updateVisibleViewport);
        updateVisibleViewport();
    }
    function showModal(dialog) {
        if (dialog.open || document.querySelector('dialog:modal')) return false;
        dialog.showModal();
        return true;
    }
    function updateNoticePlacement() {
        var root = document.documentElement, focused = document.activeElement;
        if (!phoneViewport.matches) { root.removeAttribute('data-notice-at-top'); return; }
        if (focused && focused.closest('.ui-notice, dialog')) return;
        root.removeAttribute('data-notice-at-top');
        var notice = document.querySelector('#browser-profile-recovery:not([hidden])') || document.querySelector('.ui-notice:not([hidden])');
        if (!notice || !focused || focused === document.body) return;
        var box = notice.getBoundingClientRect(), focus = focused.getBoundingClientRect();
        if (focus.bottom > box.top && focus.top < box.bottom && focus.right > box.left && focus.left < box.right) {
            root.setAttribute('data-notice-at-top', '');
        }
    }
    document.addEventListener('focusin', updateNoticePlacement);
    window.addEventListener('iv:profile-recovery', updateNoticePlacement);
    window.addEventListener('resize', updateNoticePlacement);
    var noticeFrame;
    function queueNoticePlacement() {
        if (!phoneViewport.matches || noticeFrame !== undefined || !document.querySelector('.ui-notice:not([hidden])')) return;
        noticeFrame = requestAnimationFrame(function () {
            noticeFrame = undefined;
            updateNoticePlacement();
        });
    }
    document.addEventListener('scroll', queueNoticePlacement, {capture:true, passive:true});
    if (viewport) {
        viewport.addEventListener('resize', updateNoticePlacement);
        viewport.addEventListener('scroll', queueNoticePlacement);
    }
    var active = true, disposed = false;
    window.addEventListener('pagehide', function (event) { active = false; if (!event.persisted) disposed = true; });
    window.addEventListener('pageshow', function () { if (!disposed) active = true; });
    window.addEventListener('browserprofilechange', function () { disposed = true; active = false; });
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
        var owner = options.signal;
        function abortOwner() { controller.abort(); }
        if (owner) {
            if (owner.aborted) controller.abort();
            else owner.addEventListener('abort', abortOwner, {once:true});
        }
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
                if (!response.redirected && (response.headers.get('Content-Type') || '').includes('application/json')) {
                    try {
                        var detail = await response.json();
                        if (typeof detail.error === 'string' && detail.error.length <= 500) failure.userMessage = detail.error;
                        if (typeof detail.field === 'string' && /^[a-z_]{1,100}$/.test(detail.field)) failure.field = detail.field;
                    } catch (_) { /* A failed response need not contain JSON. */ }
                }
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
        } finally {
            clearTimeout(timer);
            if (owner) owner.removeEventListener('abort', abortOwner);
        }
    }
    function post(url, data) {
        return request(url, {method: 'POST', body: new URLSearchParams(Object.assign({csrf_token: config.csrf}, data))});
    }
    function status(target, text, retry) {
        target.replaceChildren(document.createTextNode(text));
        target.setAttribute('role', 'status');
        if (retry) {
            var button = document.createElement('button');
            button.type = 'button'; button.className = 'button ui-retry'; button.textContent = label('retry');
            button.onclick = retry;
            target.append(' ', button);
        }
    }
    function notice(text, retry) {
        var target = document.getElementById('ui-notice');
        if (!target) return;
        target.hidden = false;
        status(target.querySelector('[role=status]'), text, retry);
        updateNoticePlacement();
        return target;
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
        if (active && !disposed && InvidiousStorage.isCurrent()) InvidiousStorage.session.remove('browse_state');
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
    // Apply a server snapshot only after every surviving occurrence is accounted
    // for. IDs stay strings; filtered/unloaded entries retain their real ordinal.
    function playlistOrder(list, saved, removed) {
        var entries = Array.from(list.querySelectorAll('[data-occurrence]')).filter(function (row) { return row !== removed; });
        var positions = saved && saved.positions;
        if (!positions || typeof positions !== 'object' || Array.isArray(positions) || !Number.isSafeInteger(saved.total) || saved.total < entries.length || Object.keys(positions).some(function (id) { return !/^[0-9]{1,19}$/.test(id) || !Number.isSafeInteger(positions[id]) || positions[id] < 1 || positions[id] > saved.total; }) || entries.some(function (row) { return !Object.prototype.hasOwnProperty.call(positions,row.dataset.occurrence); }) || new Set(Object.values(positions)).size !== Object.keys(positions).length || removed && Object.prototype.hasOwnProperty.call(positions,removed.dataset.occurrence)) throw new Error(label('error'));
        entries.sort(function (a,b) { return positions[a.dataset.occurrence]-positions[b.dataset.occurrence]; });
        if (removed) removeRows([removed]);
        entries.forEach(function (row) { list.append(row); row.querySelector('.playlist-position').textContent = positions[row.dataset.occurrence]; });
        list.dataset.orderTotal = String(saved.total);
        var count = document.querySelector('[data-playlist-count]'); if (count && typeof saved.countText === 'string') count.textContent = saved.countText;
        return positions;
    }
    return {config: config, phoneViewport: phoneViewport, visibleBounds: visibleBounds, showModal: showModal, label: label, request: request, post: post, status: status, notice: notice, dismissNotice: dismissNotice,
        action: action, changed: changed, invalidate: invalidate, removeRows: removeRows, watched: watched, playlistOrder: playlistOrder};
})();
