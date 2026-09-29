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
        hideUserIds: document.getElementById('chat-hide-user-ids'),
        overlay: document.getElementById('chat-overlay-mode'),
        opacity: document.getElementById('chat-overlay-opacity'),
        font: document.getElementById('chat-font-scale'),
        fontValue: document.getElementById('chat-font-value'),
        width: document.getElementById('chat-width'),
        widthValue: document.getElementById('chat-width-value'),
        users: document.getElementById('chat-user-blacklist'),
        words: document.getElementById('chat-word-blacklist'),
        timing: document.getElementById('chat-timing')
    };
    var settingsStatus = document.getElementById('chat-settings-status');
    var overlayOptions = document.getElementById('chat-overlay-options');
    var overlayEditor = document.getElementById('chat-overlay-editor');
    var editRect = null;
    var account = !!video_data.chat_account;
    var defaults = {
        chat_show_timestamps: true, chat_hide_user_ids: false, chat_font_scale: 100, chat_width_px: 440,
        chat_overlay_mode: false, chat_overlay_opacity: 75,
        chat_overlay_x: 560, chat_overlay_y: 50, chat_overlay_width: 400, chat_overlay_height: 750,
        chat_user_blacklist: '', chat_word_blacklist: ''
    };
    var localKeys = ['chat_hide_user_ids', 'chat_font_scale', 'chat_width_px', 'chat_overlay_mode', 'chat_overlay_opacity',
        'chat_overlay_x', 'chat_overlay_y', 'chat_overlay_width', 'chat_overlay_height'];
    var localSettings = readLocal('chat-settings-v1', {});
    var savedSettings = account ? video_data.preferences : localSettings;
    var settings = Object.keys(defaults).reduce(function (result, key) {
        var source = account && localKeys.includes(key) ? localSettings : savedSettings;
        result[key] = source && source[key] !== undefined ? source[key] : defaults[key];
        return result;
    }, {});
    var timingMs = account ? (video_data.chat_timing_ms || 0) : Number(readLocal('chat-timing-v1-' + video_data.id, 0));
    if (!Number.isFinite(timingMs) || Math.abs(timingMs) > 3600000) timingMs = 0;
    var wordPatterns = [];
    var userBlacklist = [];
    var saveTimer;
    var csrfToken;
    var segments = [];
    var activeSegment = null;
    var removed = new Set();
    var cacheUse = 0;
    var displayCursor = 0;
    var lastPlaybackPosition = 0;
    var seekStartPosition = null;
    var loading = false;
    var generation = 0;
    var controller;
    var prefetchTimer;
    var nextRequestAt = 0;
    var autoScroll = true;
    var windowAtTail = true;
    var MAX_CACHED_MESSAGES = 5000;
    var MAX_SEGMENTS = 24;
    var MAX_VISIBLE_MESSAGES = 120;
    var PREFETCH_MS = 30000;

    function readLocal(key, fallback) {
        try { return JSON.parse(localStorage.getItem(key)) || fallback; }
        catch (error) { return fallback; }
    }

    function writeLocal(key, value) {
        try { localStorage.setItem(key, JSON.stringify(value)); } catch (error) { /* Private browsing can disable storage. */ }
    }

    function clamp(value, min, max, fallback) {
        value = Number(value);
        return Math.max(min, Math.min(max, Math.round(Number.isFinite(value) ? value : fallback)));
    }

    function overlayRect(source) {
        return {x: source.chat_overlay_x, y: source.chat_overlay_y,
            width: source.chat_overlay_width, height: source.chat_overlay_height};
    }

    function setOverlayRect(target, rect) {
        target.chat_overlay_x = rect.x;
        target.chat_overlay_y = rect.y;
        target.chat_overlay_width = rect.width;
        target.chat_overlay_height = rect.height;
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
        settings.chat_font_scale = clamp(settings.chat_font_scale, 25, 300, 100);
        settings.chat_width_px = clamp(settings.chat_width_px, 160, 1000, 440);
        settings.chat_overlay_mode = settings.chat_overlay_mode === true;
        settings.chat_overlay_opacity = clamp(settings.chat_overlay_opacity, 0, 100, 75);
        settings.chat_overlay_width = clamp(settings.chat_overlay_width, 1, 1000, 400);
        settings.chat_overlay_height = clamp(settings.chat_overlay_height, 1, 1000, 750);
        settings.chat_overlay_x = clamp(settings.chat_overlay_x, 0, 1000 - settings.chat_overlay_width, 560);
        settings.chat_overlay_y = clamp(settings.chat_overlay_y, 0, 1000 - settings.chat_overlay_height, 50);
        controls.timestamps.checked = !!settings.chat_show_timestamps;
        controls.hideUserIds.checked = !!settings.chat_hide_user_ids;
        controls.overlay.checked = settings.chat_overlay_mode;
        controls.opacity.value = String(settings.chat_overlay_opacity);
        document.getElementById('chat-overlay-opacity-output').value = settings.chat_overlay_opacity + '%';
        overlayOptions.hidden = !settings.chat_overlay_mode;
        document.getElementById('chat-docked-size').hidden = settings.chat_overlay_mode;
        controls.font.value = String(clamp(settings.chat_font_scale, 75, 150, 100));
        controls.fontValue.value = String(settings.chat_font_scale);
        controls.width.value = String(clamp(settings.chat_width_px, 280, 640, 440));
        controls.widthValue.value = String(settings.chat_width_px);
        controls.users.value = settings.chat_user_blacklist || '';
        controls.words.value = settings.chat_word_blacklist || '';
        controls.timing.value = String(timingMs / 1000);
        panel.classList.toggle('chat-hide-timestamps', !settings.chat_show_timestamps);
        panel.classList.toggle('chat-hide-user-ids', !!settings.chat_hide_user_ids);
        panel.style.setProperty('--chat-font-scale', String(settings.chat_font_scale / 100));
        panel.style.setProperty('--chat-overlay-opacity', String(settings.chat_overlay_opacity / 100));
        player.el().style.setProperty('--chat-width', settings.chat_width_px + 'px');
        player.el().classList.toggle('chat-overlay', settings.chat_overlay_mode && !panel.hidden);
        player.el().classList.toggle('chat-docked', !settings.chat_overlay_mode && !panel.hidden);
        container.classList.toggle('chat-docked', !settings.chat_overlay_mode && !panel.hidden);
        layout.classList.toggle('watch-chat-docked', !settings.chat_overlay_mode && !panel.hidden);
        if (settings.chat_overlay_mode) {
            container.style.removeProperty('--chat-container-height');
            player.el().classList.remove('chat-mobile');
            var tech = player.el().querySelector('.vjs-tech');
            if (tech) tech.style.removeProperty('height');
        } else {
            ['left', 'top', 'width', 'height'].forEach(function (property) { panel.style.removeProperty(property); });
        }
        userBlacklist = (settings.chat_user_blacklist || '').trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
        try { wordPatterns = compilePatterns(settings.chat_word_blacklist || ''); settingsStatus.textContent = ''; }
        catch (error) { settingsStatus.textContent = labels.chat_invalid_pattern; return false; }
        updateGeometry();
        return true;
    }

    function updateGeometry() {
        if (panel.hidden) return;
        if (settings.chat_overlay_mode) { renderOverlay(); return; }
        var fullscreen = player.isFullscreen();
        var width = fullscreen ? innerWidth : container.clientWidth;
        if (!width) return;
        var mobile = (matchMedia('(max-width: 1099px)').matches ||
            /\bMobile\b|Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) &&
            matchMedia('(orientation: portrait)').matches;
        player.el().classList.toggle('chat-mobile', mobile);
        var chatWidth = Math.min(settings.chat_width_px, Math.max(160, width - 480));
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

    function renderOverlay() {
        if (!settings.chat_overlay_mode || panel.hidden) return;
        var width = player.el().clientWidth;
        var height = player.el().clientHeight;
        if (!width || !height) return;
        var rect = editRect || overlayRect(settings);
        var boxWidth = Math.min(width, Math.max(Math.min(220, width), Math.round(width * rect.width / 1000)));
        var boxHeight = Math.min(height, Math.max(Math.min(120, height), Math.round(height * rect.height / 1000)));
        var left = clamp(Math.round(width * rect.x / 1000), 0, width - boxWidth, 0);
        var top = clamp(Math.round(height * rect.y / 1000), 0, height - boxHeight, 0);
        panel.style.setProperty('left', left + 'px');
        panel.style.setProperty('top', top + 'px');
        panel.style.setProperty('width', boxWidth + 'px');
        panel.style.setProperty('height', boxHeight + 'px');
    }

    function currentOverlayPixels() {
        return {x: parseFloat(panel.style.left) || 0, y: parseFloat(panel.style.top) || 0,
            width: parseFloat(panel.style.width) || panel.offsetWidth, height: parseFloat(panel.style.height) || panel.offsetHeight};
    }

    function updateDraft(kind, original, dx, dy) {
        var width = player.el().clientWidth;
        var height = player.el().clientHeight;
        if (!width || !height) return;
        var next = {x: original.x, y: original.y, width: original.width, height: original.height};
        if (kind === 'move') {
            next.x = clamp(original.x + dx, 0, width - original.width, 0);
            next.y = clamp(original.y + dy, 0, height - original.height, 0);
        } else {
            next.width = clamp(original.width + dx, Math.min(220, width), width - original.x, original.width);
            next.height = clamp(original.height + dy, Math.min(120, height), height - original.y, original.height);
        }
        var x = clamp(next.x * 1000 / width, 0, 1000, 0);
        var y = clamp(next.y * 1000 / height, 0, 1000, 0);
        editRect = {x: x, y: y, width: clamp(next.width * 1000 / width, 1, 1000 - x, 400),
            height: clamp(next.height * 1000 / height, 1, 1000 - y, 750)};
        renderOverlay();
    }

    function cancelOverlayEdit() {
        if (!editRect) return;
        editRect = null;
        overlayEditor.hidden = true;
        panel.classList.remove('chat-editing');
        renderOverlay();
        document.querySelector('#chat-settings summary').focus();
    }

    function saveSettings(scope) {
        if (!account) { writeLocal('chat-settings-v1', settings); return; }
        if (scope === 'local') {
            var local = Object.assign({}, readLocal('chat-settings-v1', {}));
            localKeys.forEach(function (key) { local[key] = settings[key]; });
            writeLocal('chat-settings-v1', local);
            return;
        }
        clearTimeout(saveTimer);
        saveTimer = setTimeout(function () {
            fetch('/api/v1/auth/csrf').then(function (response) { if (!response.ok) throw new Error(); return response.json(); })
                .then(function (data) { csrfToken = data.csrfToken; return fetch('/api/v1/auth/chat_preferences', {
                    method: 'PATCH', headers: {'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken},
                    body: JSON.stringify({chat_show_timestamps: settings.chat_show_timestamps,
                        chat_user_blacklist: settings.chat_user_blacklist,
                        chat_word_blacklist: settings.chat_word_blacklist})
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

    function messageRow(message) {
        var row = document.createElement('div');
        row.className = 'chat-message';
        row.dataset.messageId = message.id;
        row.dataset.offsetMs = String(message.offsetMs);
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
        return row;
    }

    function append(message) {
        var removedHeight = 0;
        list.appendChild(messageRow(message));
        while (list.children.length > MAX_VISIBLE_MESSAGES) {
            removedHeight += list.firstElementChild.getBoundingClientRect().height;
            list.firstElementChild.remove();
        }
        return removedHeight;
    }

    function videoEndMs() {
        var duration = Number(video_data.length_seconds) * 1000;
        return Number.isFinite(duration) && duration > 0 ? duration : Infinity;
    }

    function touchSegment(segment) { segment.lastUsed = ++cacheUse; }

    function trimCache() {
        var total = segments.reduce(function (count, segment) { return count + segment.messages.length; }, 0);
        while (segments.length > MAX_SEGMENTS || total > MAX_CACHED_MESSAGES) {
            var inactive = segments.filter(function (segment) { return segment !== activeSegment; })
                .sort(function (a, b) { return a.lastUsed - b.lastUsed; })[0];
            if (!inactive) break;
            total -= inactive.messages.length;
            segments.splice(segments.indexOf(inactive), 1);
        }
        if (total > MAX_CACHED_MESSAGES && activeSegment) {
            var excess = total - MAX_CACHED_MESSAGES;
            activeSegment.messages.splice(0, excess).forEach(function (message) { activeSegment.ids.delete(message.id); });
            activeSegment.start = activeSegment.messages.length ? activeSegment.messages[0].offsetMs : activeSegment.end;
            displayCursor = Math.max(0, displayCursor - excess);
        }
    }

    function segmentFor(position) {
        var covered = segments.filter(function (segment) {
            return position >= segment.start && (position <= segment.end || segment.complete);
        }).sort(function (a, b) { return b.lastUsed - a.lastUsed; })[0];
        if (covered) return covered;
        if (activeSegment && position >= activeSegment.start &&
            position <= activeSegment.end + PREFETCH_MS && !activeSegment.complete) return activeSegment;
        return null;
    }

    function dueMessages() {
        if (!activeSegment) return [];
        var now = duePositionMs() + 250;
        return activeSegment.messages.filter(function (message) {
            return message.offsetMs <= now && validMessage(message);
        });
    }

    function rebuildVisible() {
        if (panel.hidden || !activeSegment) return;
        var due = dueMessages();
        list.textContent = '';
        due.slice(-MAX_VISIBLE_MESSAGES).forEach(function (message) { list.appendChild(messageRow(message)); });
        displayCursor = activeSegment.messages.findIndex(function (message) { return message.offsetMs > duePositionMs() + 250; });
        if (displayCursor < 0) displayCursor = activeSegment.messages.length;
        windowAtTail = true;
        setAutoScroll(true);
        list.scrollTop = list.scrollHeight;
        if (activeSegment.complete && !due.length) status.textContent = labels.chat_empty;
        else if (!activeSegment.failed) status.textContent = '';
    }

    function showOlder() {
        if (autoScroll || !activeSegment || list.scrollTop > 48 || !list.firstElementChild) return;
        var due = dueMessages();
        var firstId = list.firstElementChild.dataset.messageId;
        var first = due.findIndex(function (message) { return message.id === firstId; });
        if (first <= 0) return;
        var previous = due.slice(Math.max(0, first - 40), first);
        var oldHeight = list.scrollHeight;
        var fragment = document.createDocumentFragment();
        previous.forEach(function (message) { fragment.appendChild(messageRow(message)); });
        list.insertBefore(fragment, list.firstElementChild);
        list.scrollTop += list.scrollHeight - oldHeight;
        while (list.children.length > MAX_VISIBLE_MESSAGES) {
            list.lastElementChild.remove();
            windowAtTail = false;
        }
    }

    function showDue() {
        if (panel.hidden || !activeSegment) return;
        var now = duePositionMs() + 250;
        if (windowAtTail && activeSegment.messages[displayCursor] && activeSegment.messages[displayCursor].offsetMs <= now) {
            maintainScroll(function () {
                var removedHeight = 0;
                while (activeSegment.messages[displayCursor] && activeSegment.messages[displayCursor].offsetMs <= now) {
                    var message = activeSegment.messages[displayCursor++];
                    if (validMessage(message)) removedHeight += append(message);
                }
                return removedHeight;
            });
        }
        if (!autoScroll) sync.hidden = false;
        maybePrefetch();
    }

    function maybePrefetch() {
        clearTimeout(prefetchTimer);
        if (panel.hidden || !activeSegment || loading || activeSegment.failed || activeSegment.complete ||
            activeSegment.end > duePositionMs() + PREFETCH_MS) return;
        var delay = Math.max(0, nextRequestAt - Date.now());
        prefetchTimer = setTimeout(load, delay);
    }

    function load() {
        if (panel.hidden || !activeSegment || loading || activeSegment.failed || activeSegment.complete) return;
        var segment = activeSegment;
        var request = generation;
        var initial = !segment.started;
        var url = new URL('/api/v1/live_chat/' + encodeURIComponent(video_data.id), location.origin);
        url.searchParams.set('offset_ms', String(initial ? segment.requestOffset : Math.max(segment.requestOffset, segment.end)));
        if (!initial && segment.continuation) url.searchParams.set('continuation', segment.continuation);
        loading = true;
        controller = new AbortController();
        list.setAttribute('aria-busy', 'true');
        retry.hidden = true;
        if (initial && !list.children.length) status.textContent = labels.chat_loading;

        fetch(url.pathname + url.search, {signal: controller.signal}).then(function (response) {
            if (response.status === 404) {
                var error = new Error('unavailable');
                error.unavailable = true;
                throw error;
            }
            if (!response.ok) throw new Error('request failed');
            return response.json();
        }).then(function (data) {
            if (request !== generation || segment !== activeSegment) return;
            if (!data || !Array.isArray(data.messages) || !Array.isArray(data.removedIds))
                throw new Error('invalid chat response');
            var removedInChunk = new Set(data.removedIds);
            removedInChunk.forEach(function (id) { removed.add(id); });
            if (removedInChunk.size) {
                segments.forEach(function (cached) {
                    cached.messages = cached.messages.filter(function (message) { return !removedInChunk.has(message.id); });
                    removedInChunk.forEach(function (id) { cached.ids.delete(id); });
                });
            }
            data.messages.forEach(function (message) {
                if (typeof message.id !== 'string' || typeof message.text !== 'string' ||
                    !Number.isFinite(message.offsetMs) || message.offsetMs < 0 ||
                    segment.ids.has(message.id) || removed.has(message.id)) return;
                segment.ids.add(message.id);
                segment.messages.push(message);
                segment.end = Math.max(segment.end, message.offsetMs);
            });
            segment.messages.sort(function (a, b) { return a.offsetMs - b.offsetMs; });
            segment.continuation = typeof data.continuation === 'string' && data.continuation ? data.continuation : null;
            segment.started = true;
            segment.complete = !segment.continuation;
            if (segment.complete) segment.end = videoEndMs();
            loading = false;
            controller = null;
            list.setAttribute('aria-busy', 'false');
            status.textContent = '';
            nextRequestAt = Date.now() + 800;
            trimCache();
            if (autoScroll || !list.children.length) rebuildVisible();
            else {
                Array.from(list.children).forEach(function (row) {
                    if (removed.has(row.dataset.messageId)) row.remove();
                });
                if (windowAtTail) {
                    var last = list.lastElementChild && list.lastElementChild.dataset.messageId;
                    var lastIndex = segment.messages.findIndex(function (message) { return message.id === last; });
                    if (lastIndex < 0) rebuildVisible();
                    else {
                        displayCursor = lastIndex + 1;
                        showDue();
                    }
                }
            }
            maybePrefetch();
        }).catch(function (error) {
            if (request !== generation || error.name === 'AbortError') return;
            loading = false;
            controller = null;
            segment.failed = true;
            list.setAttribute('aria-busy', 'false');
            status.textContent = error.unavailable ? labels.chat_unavailable : labels.chat_error;
            retry.hidden = !!error.unavailable;
        });
    }

    function selectPosition(force) {
        if (panel.hidden) return;
        var position = requestPositionMs();
        var segment = segmentFor(position);
        if (!segment) {
            segment = {requestOffset: position, start: Math.max(0, position - 15000), end: -1,
                messages: [], ids: new Set(), continuation: null, started: false, complete: false,
                failed: false, lastUsed: 0};
            segments.push(segment);
        }
        if (segment !== activeSegment) {
            generation++;
            clearTimeout(prefetchTimer);
            if (controller) controller.abort();
            controller = null;
            loading = false;
            activeSegment = segment;
            nextRequestAt = 0;
            force = true;
        }
        touchSegment(segment);
        trimCache();
        if (force) rebuildVisible();
        maybePrefetch();
    }

    function setVisible(visible) {
        if (visible === !panel.hidden) return;
        if (!visible) cancelOverlayEdit();
        panel.hidden = !visible;
        player.el().classList.toggle('chat-docked', visible && !settings.chat_overlay_mode);
        player.el().classList.toggle('chat-overlay', visible && settings.chat_overlay_mode);
        container.classList.toggle('chat-docked', visible && !settings.chat_overlay_mode);
        layout.classList.toggle('watch-chat-docked', visible && !settings.chat_overlay_mode);
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
        if (visible) selectPosition(true);
        else {
            generation++;
            clearTimeout(prefetchTimer);
            if (controller) controller.abort();
            controller = null;
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
        if (applySettings()) saveSettings('account');
    });
    controls.hideUserIds.addEventListener('change', function () {
        settings.chat_hide_user_ids = controls.hideUserIds.checked;
        if (applySettings()) saveSettings('local');
    });
    controls.overlay.addEventListener('change', function () {
        if (!controls.overlay.checked) cancelOverlayEdit();
        settings.chat_overlay_mode = controls.overlay.checked;
        if (applySettings()) {
            requestAnimationFrame(updateGeometry);
            saveSettings('local');
        }
    });
    controls.opacity.addEventListener('input', function () {
        settings.chat_overlay_opacity = Number(controls.opacity.value);
        if (applySettings()) saveSettings('local');
    });
    document.getElementById('chat-modify-overlay').addEventListener('click', function () {
        document.getElementById('chat-settings').open = false;
        updateDraft('move', currentOverlayPixels(), 0, 0);
        overlayEditor.hidden = false;
        panel.classList.add('chat-editing');
        document.getElementById('chat-overlay-move').focus();
    });
    document.getElementById('chat-overlay-save').addEventListener('click', function () {
        if (!editRect) return;
        setOverlayRect(settings, editRect);
        editRect = null;
        overlayEditor.hidden = true;
        panel.classList.remove('chat-editing');
        renderOverlay();
        saveSettings('local');
        document.querySelector('#chat-settings summary').focus();
    });
    document.getElementById('chat-overlay-cancel').addEventListener('click', cancelOverlayEdit);
    [['chat-overlay-move', 'move'], ['chat-overlay-resize', 'resize']].forEach(function (entry) {
        var handle = document.getElementById(entry[0]);
        var kind = entry[1];
        var drag = null;
        handle.addEventListener('pointerdown', function (event) {
            if (!editRect || !event.isPrimary) return;
            event.preventDefault();
            event.stopPropagation();
            drag = {id: event.pointerId, x: event.clientX, y: event.clientY, rect: currentOverlayPixels()};
            handle.setPointerCapture(event.pointerId);
        });
        handle.addEventListener('pointermove', function (event) {
            if (!drag || drag.id !== event.pointerId) return;
            updateDraft(kind, drag.rect, event.clientX - drag.x, event.clientY - drag.y);
        });
        function endDrag(event) {
            if (drag && drag.id === event.pointerId) drag = null;
        }
        handle.addEventListener('pointerup', endDrag);
        handle.addEventListener('pointercancel', endDrag);
        handle.addEventListener('keydown', function (event) {
            if (!editRect) return;
            var step = event.shiftKey ? 20 : 5;
            var dx = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0;
            var dy = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0;
            if (!dx && !dy) return;
            event.preventDefault();
            event.stopPropagation();
            updateDraft(kind, currentOverlayPixels(), dx, dy);
        });
    });
    document.addEventListener('keydown', function (event) {
        if (event.key === 'Escape' && editRect) {
            event.preventDefault();
            cancelOverlayEdit();
        }
    });
    controls.font.addEventListener('input', function () {
        settings.chat_font_scale = Number(controls.font.value);
        if (applySettings()) saveSettings('local');
    });
    controls.width.addEventListener('input', function () {
        settings.chat_width_px = Number(controls.width.value);
        if (applySettings()) saveSettings('local');
    });
    [[controls.fontValue, 'chat_font_scale', 25, 300],
        [controls.widthValue, 'chat_width_px', 160, 1000]].forEach(function (entry) {
        entry[0].addEventListener('change', function () {
            var value = Number(entry[0].value);
            if (!Number.isInteger(value) || value < entry[2] || value > entry[3]) {
                entry[0].value = String(settings[entry[1]]);
                return;
            }
            settings[entry[1]] = value;
            if (applySettings()) saveSettings('local');
        });
    });
    controls.users.addEventListener('change', function () {
        settings.chat_user_blacklist = controls.users.value.slice(0, 1024);
        if (applySettings()) { rebuildVisible(); saveSettings('account'); }
    });
    controls.words.addEventListener('change', function () {
        var previous = settings.chat_word_blacklist;
        settings.chat_word_blacklist = controls.words.value.slice(0, 1024);
        if (applySettings()) { rebuildVisible(); saveSettings('account'); }
        else { settings.chat_word_blacklist = previous; }
    });
    controls.timing.addEventListener('change', function () {
        var value = Number(controls.timing.value);
        if (!Number.isFinite(value) || Math.abs(value) > 3600) { controls.timing.value = String(timingMs / 1000); return; }
        timingMs = Math.round(value * 1000);
        selectPosition(true); saveTiming();
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

    retry.onclick = function () {
        if (!activeSegment) return;
        activeSegment.failed = false;
        status.textContent = labels.chat_loading;
        nextRequestAt = 0;
        maybePrefetch();
    };
    sync.onclick = function () {
        rebuildVisible();
    };
    list.addEventListener('scroll', function () {
        if (nearBottom()) {
            if (!autoScroll) {
                if (windowAtTail) setAutoScroll(true);
                else rebuildVisible();
            }
        } else {
            setAutoScroll(false);
            showOlder();
        }
    });
    player.on('timeupdate', function () {
        if (!player.seeking || !player.seeking()) lastPlaybackPosition = positionMs();
        showDue();
    });
    player.on('seeking', function () { seekStartPosition = lastPlaybackPosition; });
    player.on('seeked', function () {
        var previous = seekStartPosition === null ? lastPlaybackPosition : seekStartPosition;
        var current = positionMs();
        var moved = Math.abs(current - previous) > 750;
        selectPosition(moved);
        if (!moved && current < previous && activeSegment) {
            var now = duePositionMs() + 250;
            Array.from(list.children).forEach(function (row) {
                if (Number(row.dataset.offsetMs) > now) row.remove();
            });
            displayCursor = activeSegment.messages.findIndex(function (message) { return message.offsetMs > now; });
            if (displayCursor < 0) displayCursor = activeSegment.messages.length;
        }
        showDue();
        lastPlaybackPosition = current;
        seekStartPosition = null;
    });
    player.on('dispose', function () {
        generation++;
        clearTimeout(prefetchTimer);
        if (controller) controller.abort();
    });
    lastPlaybackPosition = positionMs();
    selectPosition(true);
}());
