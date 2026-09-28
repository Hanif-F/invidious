'use strict';

(function () {
    var panel = document.getElementById('chat-panel');
    if (!panel || !window.player || !window.video_data) return;

    var list = document.getElementById('chat-messages');
    var status = document.getElementById('chat-status');
    var retry = document.getElementById('chat-retry');
    var sync = document.getElementById('chat-sync');
    var container = document.getElementById('player-container');
    var layout = document.getElementById('watch-layout');
    var labels = JSON.parse(document.getElementById('watch_ui_data').textContent);
    var controls = {
        timestamps: document.getElementById('chat-show-timestamps'),
        font: document.getElementById('chat-font-scale'),
        width: document.getElementById('chat-width'),
        users: document.getElementById('chat-user-blacklist'),
        words: document.getElementById('chat-word-blacklist'),
        timing: document.getElementById('chat-timing')
    };
    var settingsStatus = document.getElementById('chat-settings-status');
    var account = !!video_data.chat_account;
    var defaults = {
        chat_show_timestamps: true, chat_font_scale: 100, chat_width_px: 440,
        chat_user_blacklist: '', chat_word_blacklist: ''
    };
    var savedSettings = account ? video_data.preferences : readLocal('chat-settings-v1', {});
    var settings = Object.keys(defaults).reduce(function (result, key) {
        result[key] = savedSettings && savedSettings[key] !== undefined ? savedSettings[key] : defaults[key];
        return result;
    }, {});
    var timingMs = account ? (video_data.chat_timing_ms || 0) : Number(readLocal('chat-timing-v1-' + video_data.id, 0));
    if (!Number.isFinite(timingMs) || Math.abs(timingMs) > 3600000) timingMs = 0;
    var wordPatterns = [];
    var userBlacklist = [];
    var saveTimer;
    var csrfToken;
    var queue = [];
    var seen = new Set();
    var removed = new Set();
    var continuation = null;
    var highestOffset = 0;
    var hasMore = true;
    var loading = false;
    var failed = false;
    var generation = 0;
    var controller;
    var nextRequestAt = 0;
    var autoScroll = true;
    var mobileLayout = matchMedia('(max-width: 1099px)').matches || /\bMobile\b|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

    function readLocal(key, fallback) {
        try { return JSON.parse(localStorage.getItem(key)) || fallback; }
        catch (error) { return fallback; }
    }

    function writeLocal(key, value) {
        try { localStorage.setItem(key, JSON.stringify(value)); } catch (error) { /* Private browsing can disable storage. */ }
    }

    function compilePatterns(raw) {
        return raw.trim().split(/\s+/).filter(Boolean).map(function (token) {
            if (token.length > 128) throw new Error(labels.chat_invalid_pattern);
            if (token[0] === '/' && token[token.length - 1] === '/')
                return new RegExp(token.slice(1, -1), 'i');
            return {test: function (value) { return value.toLocaleLowerCase().includes(token.toLocaleLowerCase()); }};
        });
    }

    function validMessage(message) {
        var id = (message.authorChannelId || '').toLocaleLowerCase();
        var handle = (message.authorHandle || '').toLocaleLowerCase().replace(/^@/, '');
        if (userBlacklist.some(function (entry) { return entry === id || entry.replace(/^@/, '') === handle && !!handle; })) return false;
        return !wordPatterns.some(function (pattern) { return pattern.test(message.text); });
    }

    function applySettings() {
        settings.chat_font_scale = Math.max(75, Math.min(150, Number(settings.chat_font_scale) || 100));
        settings.chat_width_px = Math.max(280, Math.min(640, Number(settings.chat_width_px) || 440));
        controls.timestamps.checked = !!settings.chat_show_timestamps;
        controls.font.value = String(settings.chat_font_scale);
        controls.width.value = String(settings.chat_width_px);
        controls.users.value = settings.chat_user_blacklist || '';
        controls.words.value = settings.chat_word_blacklist || '';
        controls.timing.value = String(timingMs / 1000);
        document.getElementById('chat-font-output').value = settings.chat_font_scale + '%';
        document.getElementById('chat-width-output').value = settings.chat_width_px + 'px';
        panel.classList.toggle('chat-hide-timestamps', !settings.chat_show_timestamps);
        panel.style.setProperty('--chat-font-scale', String(settings.chat_font_scale / 100));
        player.el().style.setProperty('--chat-width', settings.chat_width_px + 'px');
        userBlacklist = (settings.chat_user_blacklist || '').trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
        try { wordPatterns = compilePatterns(settings.chat_word_blacklist || ''); settingsStatus.textContent = ''; }
        catch (error) { settingsStatus.textContent = labels.chat_invalid_pattern; return false; }
        updateGeometry();
        return true;
    }

    function updateGeometry() {
        if (panel.hidden) return;
        var fullscreen = player.isFullscreen();
        var width = fullscreen ? innerWidth : container.clientWidth;
        if (!width) return;
        if (!fullscreen) mobileLayout = matchMedia('(max-width: 1099px)').matches || /\bMobile\b|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
        var mobile = mobileLayout;
        player.el().classList.toggle('chat-mobile', mobile);
        var chatWidth = Math.min(settings.chat_width_px, Math.max(280, width - 480));
        var videoWidth = mobile ? width : width - chatWidth;
        var videoHeight = Math.round(videoWidth * 9 / 16);
        if (fullscreen && mobile) videoHeight = Math.min(videoHeight, Math.round(innerHeight * .65));
        else if (!fullscreen && !mobile && layout.classList.contains('watch-wide')) videoHeight = Math.min(videoHeight, Math.round(innerHeight * .78));
        var chatHeight = mobile ? (fullscreen ? innerHeight - videoHeight : Math.max(240, Math.min(360, Math.round(innerHeight * .38)))) : 0;
        player.el().style.setProperty('--chat-video-height', videoHeight + 'px', 'important');
        var tech = player.el().querySelector('.vjs-tech');
        if (mobile) {
            if (tech) tech.style.setProperty('height', videoHeight + 'px', 'important');
            panel.style.setProperty('top', videoHeight + 'px', 'important');
            panel.style.setProperty('height', chatHeight + 'px', 'important');
        } else {
            if (tech) tech.style.removeProperty('height');
            panel.style.removeProperty('top');
            panel.style.removeProperty('height');
        }
        if (!fullscreen) container.style.setProperty('--chat-container-height', videoHeight + chatHeight + 'px');
    }

    function saveSettings() {
        if (!account) { writeLocal('chat-settings-v1', settings); return; }
        clearTimeout(saveTimer);
        saveTimer = setTimeout(function () {
            fetch('/api/v1/auth/csrf').then(function (response) { if (!response.ok) throw new Error(); return response.json(); })
                .then(function (data) { csrfToken = data.csrfToken; return fetch('/api/v1/auth/chat_preferences', {
                    method: 'PATCH', headers: {'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken},
                    body: JSON.stringify(settings)
                }); }).then(function (response) { if (!response.ok) throw new Error(); settingsStatus.textContent = ''; })
                .catch(function () { settingsStatus.textContent = labels.chat_save_error; });
        }, 350);
    }

    function saveTiming() {
        if (!account) { writeLocal('chat-timing-v1-' + video_data.id, timingMs); return; }
        fetch('/api/v1/auth/csrf').then(function (response) { if (!response.ok) throw new Error(); return response.json(); })
            .then(function (data) { return fetch('/api/v1/auth/chat_timing/' + encodeURIComponent(video_data.id), {
                method: 'PUT', headers: {'Content-Type': 'application/json', 'X-CSRF-Token': data.csrfToken},
                body: JSON.stringify({offsetMs: timingMs})
            }); }).then(function (response) { if (!response.ok) throw new Error(); settingsStatus.textContent = ''; })
            .catch(function () { settingsStatus.textContent = labels.chat_save_error; });
    }

    function nearBottom() {
        return list.scrollHeight - list.clientHeight - list.scrollTop <= 32;
    }

    function setAutoScroll(enabled) {
        autoScroll = enabled;
        sync.hidden = enabled || !list.children.length;
    }

    function maintainScroll(mutate) {
        var oldTop = list.scrollTop;
        var anchor;
        var anchorTop;
        if (!autoScroll) {
            var viewportTop = list.getBoundingClientRect().top;
            anchor = Array.from(list.children).find(function (item) { return item.getBoundingClientRect().bottom > viewportTop; });
            if (anchor) anchorTop = anchor.getBoundingClientRect().top;
        }
        var removedHeight = mutate();
        if (autoScroll) list.scrollTop = list.scrollHeight;
        else if (anchor && anchor.isConnected) list.scrollTop += anchor.getBoundingClientRect().top - anchorTop;
        else list.scrollTop = Math.max(0, oldTop - removedHeight);
    }

    function positionMs() {
        var seconds = Number(player.currentTime());
        return Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds * 1000)) : 0;
    }

    function duePositionMs() { return positionMs() - timingMs; }
    function requestPositionMs() {
        var duration = Number(video_data.length_seconds) * 1000;
        return Math.max(0, Math.min(Number.isFinite(duration) && duration > 0 ? duration : Infinity, duePositionMs()));
    }

    function timestamp(ms) {
        var seconds = Math.floor(ms / 1000);
        return (seconds >= 3600 ? Math.floor(seconds / 3600) + ':' : '') +
            String(Math.floor(seconds / 60) % 60).padStart(2, '0') + ':' +
            String(seconds % 60).padStart(2, '0');
    }

    function append(message) {
        var row = document.createElement('div');
        row.className = 'chat-message';
        row.dataset.messageId = message.id;
        row.dataset.kind = message.kind;
        var time = document.createElement('span');
        time.className = 'chat-time';
        time.textContent = timestamp(message.offsetMs);
        row.appendChild(time);
        var content = document.createElement('div');
        content.className = 'chat-content';
        var meta = document.createElement('div');
        meta.className = 'chat-meta';
        if (message.author) {
            var author = document.createElement('strong');
            author.className = 'chat-author';
            author.textContent = message.author;
            meta.appendChild(author);
        }
        if (message.authorChannelId) {
            var authorId = document.createElement('span');
            authorId.className = 'chat-author-id';
            authorId.textContent = message.authorChannelId;
            meta.appendChild(authorId);
        }
        if (message.amount && message.amount !== message.text) {
            var amount = document.createElement('span');
            amount.className = 'chat-amount';
            amount.textContent = message.amount;
            meta.appendChild(amount);
        }
        if (meta.children.length) content.appendChild(meta);
        var text = document.createElement('span');
        text.className = 'chat-text';
        text.textContent = message.text;
        content.appendChild(text);
        row.appendChild(content);
        var removedHeight = 0;
        list.appendChild(row);
        while (list.children.length > 120) {
            removedHeight += list.firstElementChild.getBoundingClientRect().height;
            list.firstElementChild.remove();
        }
        return removedHeight;
    }

    function showDue() {
        if (panel.hidden) return;
        var now = duePositionMs();
        if (queue.length && queue[0].offsetMs <= now + 250) maintainScroll(function () {
            var removedHeight = 0;
            while (queue.length && queue[0].offsetMs <= now + 250) {
                var message = queue.shift();
                if (!removed.has(message.id) && validMessage(message)) removedHeight += append(message);
            }
            return removedHeight;
        });
        if (!loading && !failed && hasMore && Date.now() >= nextRequestAt &&
            (queue.length === 0 || highestOffset <= now + 15000)) load(false);
        if (!loading && !hasMore && !list.children.length && !queue.length)
            status.textContent = labels.chat_empty;
    }

    function load(initial) {
        if (panel.hidden || loading || failed || (!initial && !hasMore)) return;
        loading = true;
        var request = generation;
        var url = new URL('/api/v1/live_chat/' + encodeURIComponent(video_data.id), location.origin);
        url.searchParams.set('offset_ms', String(initial ? requestPositionMs() : Math.max(0, highestOffset)));
        if (!initial && continuation) url.searchParams.set('continuation', continuation);
        controller = new AbortController();
        list.setAttribute('aria-busy', 'true');
        retry.hidden = true;
        if (initial) status.textContent = labels.chat_loading;

        fetch(url.pathname + url.search, {signal: controller.signal}).then(function (response) {
            if (response.status === 404) {
                var error = new Error('unavailable');
                error.unavailable = true;
                throw error;
            }
            if (!response.ok) throw new Error('request failed');
            return response.json();
        }).then(function (data) {
            if (request !== generation) return;
            if (!data || !Array.isArray(data.messages) || !Array.isArray(data.removedIds))
                throw new Error('invalid chat response');
            (data.removedIds || []).forEach(function (id) {
                removed.add(id);
                Array.from(list.children).forEach(function (row) {
                    if (row.dataset.messageId === id) row.remove();
                });
                queue = queue.filter(function (message) { return message.id !== id; });
            });
            data.messages.forEach(function (message) {
                if (typeof message.id !== 'string' || typeof message.text !== 'string' ||
                    !Number.isFinite(message.offsetMs) || message.offsetMs < 0 ||
                    seen.has(message.id) || removed.has(message.id)) return;
                seen.add(message.id);
                queue.push(message);
                highestOffset = Math.max(highestOffset, message.offsetMs);
            });
            queue.sort(function (a, b) { return a.offsetMs - b.offsetMs; });
            continuation = typeof data.continuation === 'string' && data.continuation ? data.continuation : null;
            hasMore = !!continuation;
            loading = false;
            list.setAttribute('aria-busy', 'false');
            status.textContent = '';
            nextRequestAt = Date.now() + 800;
            showDue();
            if (hasMore && queue.length === 0)
                setTimeout(function () { if (request === generation) showDue(); }, 850);
        }).catch(function (error) {
            if (request !== generation || error.name === 'AbortError') return;
            loading = false;
            failed = true;
            list.setAttribute('aria-busy', 'false');
            status.textContent = error.unavailable ? labels.chat_unavailable : labels.chat_error;
            retry.hidden = !!error.unavailable;
        });
    }

    function reset() {
        if (panel.hidden) return;
        generation++;
        if (controller) controller.abort();
        queue = [];
        seen = new Set();
        removed = new Set();
        continuation = null;
        highestOffset = requestPositionMs();
        hasMore = true;
        loading = false;
        failed = false;
        nextRequestAt = 0;
        list.textContent = '';
        setAutoScroll(true);
        status.textContent = labels.chat_loading;
        retry.hidden = true;
        load(true);
    }

    function setVisible(visible) {
        if (visible === !panel.hidden) return;
        panel.hidden = !visible;
        player.el().classList.toggle('chat-docked', visible);
        container.classList.toggle('chat-docked', visible);
        if (visible) updateGeometry();
        else {
            container.style.removeProperty('--chat-container-height');
            var tech = player.el().querySelector('.vjs-tech');
            if (tech) tech.style.removeProperty('height');
            panel.style.removeProperty('top');
            panel.style.removeProperty('height');
        }
        if (player.chatControl) {
            player.chatControl.controlText(visible ? labels.hide_chat : labels.show_chat);
            player.chatControl.el().setAttribute('aria-pressed', String(visible));
        }
        if (visible) reset();
        else {
            generation++;
            if (controller) controller.abort();
            loading = false;
            list.setAttribute('aria-busy', 'false');
        }
    }

    window.invidiousChat = {
        toggle: function () { setVisible(panel.hidden); },
        isVisible: function () { return !panel.hidden; },
        showLabel: labels.show_chat,
        hideLabel: labels.hide_chat
    };

    // A child of Video.js's fullscreen element remains visible in page-element fullscreen.
    player.el().appendChild(panel);
    player.el().classList.add('chat-docked');
    container.classList.add('chat-docked');
    panel.addEventListener('click', function (event) { event.stopPropagation(); });
    panel.addEventListener('keydown', function (event) { if (event.target.closest('input')) event.stopPropagation(); });
    applySettings();
    if (window.ResizeObserver) {
        var geometryObserver = new ResizeObserver(updateGeometry);
        geometryObserver.observe(container);
        player.on('dispose', function () { geometryObserver.disconnect(); });
    }
    player.on('fullscreenchange', updateGeometry);
    player.on('playerresize', updateGeometry);
    window.addEventListener('resize', updateGeometry);

    controls.timestamps.addEventListener('change', function () {
        settings.chat_show_timestamps = controls.timestamps.checked;
        if (applySettings()) saveSettings();
    });
    controls.font.addEventListener('input', function () {
        settings.chat_font_scale = Number(controls.font.value);
        if (applySettings()) saveSettings();
    });
    controls.width.addEventListener('input', function () {
        settings.chat_width_px = Number(controls.width.value);
        if (applySettings()) saveSettings();
    });
    controls.users.addEventListener('change', function () {
        settings.chat_user_blacklist = controls.users.value.slice(0, 1024);
        if (applySettings()) { reset(); saveSettings(); }
    });
    controls.words.addEventListener('change', function () {
        var previous = settings.chat_word_blacklist;
        settings.chat_word_blacklist = controls.words.value.slice(0, 1024);
        if (applySettings()) { reset(); saveSettings(); }
        else { settings.chat_word_blacklist = previous; }
    });
    controls.timing.addEventListener('change', function () {
        var value = Number(controls.timing.value);
        if (!Number.isFinite(value) || Math.abs(value) > 3600) { controls.timing.value = String(timingMs / 1000); return; }
        timingMs = Math.round(value * 1000);
        reset(); saveTiming();
    });
    document.addEventListener('click', function (event) {
        var menu = document.getElementById('chat-settings');
        if (menu.open && !menu.contains(event.target)) menu.open = false;
    });
    document.getElementById('chat-settings').addEventListener('keydown', function (event) {
        if (event.key === 'Escape') {
            event.preventDefault();
            event.currentTarget.open = false;
            event.currentTarget.querySelector('summary').focus();
        }
    });

    retry.onclick = reset;
    sync.onclick = function () {
        setAutoScroll(true);
        list.scrollTop = list.scrollHeight;
    };
    list.addEventListener('scroll', function () {
        setAutoScroll(nearBottom());
    });
    player.on('timeupdate', showDue);
    player.on('seeked', reset);
    player.on('loadedmetadata', reset);
    reset();
}());
