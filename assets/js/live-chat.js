'use strict';
// One replay session follows the chat panel between the player and sidebar.
(function () {
    var panel = document.getElementById('chat-panel');
    if (!panel || !window.player || !window.video_data || panel.dataset.initialized) return;
    panel.dataset.initialized = 'true';
    var list = document.getElementById('chat-messages'), status = document.getElementById('chat-status'), retry = document.getElementById('chat-retry'), sync = document.getElementById('chat-sync');
    var labels = JSON.parse(document.getElementById('watch_ui_data').textContent), ui = InvidiousUI, storage = InvidiousStorage;
    var preferences = window.InvidiousChatPreferences, timing = window.InvidiousChatTiming;
    if (!preferences || !timing || !preferences.values() || timing.value() === null) {
        panel.hidden = false; status.textContent = labels.chat_error; return;
    }
    var settings = null, timingMs = timing.value(), life = new AbortController(), activePage = true, disposed = false, shown = false;
    var root = player.el(), shell = root.closest('.watch-player'), stack = document.getElementById('watch-tools');
    var section = document.getElementById('tool-chat'), dialog = document.getElementById('chat-settings-dialog');
    var sidebarToggle = document.getElementById('chat-toggle'), playerHeading = section.querySelector('.chat-player-heading');
    var shortcut = document.getElementById('chat-shortcut');
    var sidebarPosition = dialog.nextSibling, desktopViewport = matchMedia('(width >= 960px)');
    var control, desktop = false, expanded = false;
    var segments = [], activeSegment = null, removed = new Set(), cacheUse = 0, displayCursor = 0;
    var lastPlaybackPosition = 0, seekStartPosition = null, loading = false, generation = 0, controller = null, prefetchTimer = null;
    var nextRequestAt = 0, autoScroll = true, windowAtTail = true, wordPatterns = [], userBlacklist = [];
    var MAX_CACHED_MESSAGES = 5000, MAX_SEGMENTS = 24, MAX_VISIBLE_MESSAGES = 120, PREFETCH_MS = 30000;
    function on(target,name,handler,options) { target.addEventListener(name,handler,Object.assign({signal:life.signal},options)); }
    function alive() { return activePage && !disposed && panel.isConnected && storage.isCurrent() && !(player.isDisposed && player.isDisposed()); }
    function visible() { return shown && alive(); }
    function selected() {
        var fullscreen = document.fullscreenElement;
        return expanded && !document.hidden && !stack.hidden && (!fullscreen || fullscreen.contains(panel)) &&
            (!player.isFullscreen() || fullscreen || desktop && player.isFullWindow) &&
            !(desktop && shell.classList.contains('is-docked'));
    }
    function stop() {
        generation++; clearTimeout(prefetchTimer); prefetchTimer = null;
        if (controller) controller.abort(); controller = null; loading = false; list.setAttribute('aria-busy','false');
    }
    function validMessage(message) {
        var id = message.authorChannelId.toLocaleLowerCase(), handle = message.authorHandle.toLocaleLowerCase().replace(/^@/,'');
        return !userBlacklist.some(function (entry) { return entry === id || entry.replace(/^@/,'') === handle && !!handle; }) &&
            !wordPatterns.some(function (pattern) { return pattern.test(message.text); });
    }
    function normalizeChunk(data) {
        if (!data || !Array.isArray(data.messages) || !Array.isArray(data.removedIds) || data.removedIds.some(function (id) { return typeof id !== 'string'; })) throw new Error('Invalid replay');
        var messages = data.messages.filter(function (message) { return message && typeof message.id === 'string' && message.id && typeof message.text === 'string' && Number.isFinite(message.offsetMs) && message.offsetMs >= 0; }).map(function (message) {
            var result = {id:message.id,text:message.text,offsetMs:message.offsetMs};
            ['author','authorChannelId','authorHandle','amount','kind'].forEach(function (key) { result[key] = typeof message[key] === 'string' ? message[key] : ''; }); return result;
        });
        if (data.messages.length && !messages.length) throw new Error('Invalid replay messages');
        var continuation = data.continuation;
        if (continuation !== undefined && continuation !== null && (typeof continuation !== 'string' || new TextEncoder().encode(continuation).length > 4096)) throw new Error('Invalid replay continuation');
        return {messages:messages,removedIds:data.removedIds,continuation:continuation || null};
    }
    function refreshStatus() {
        if (!visible() || !activeSegment || activeSegment.failed || loading) return;
        if (list.children.length) { status.textContent = ''; return; }
        var due = activeSegment.messages.filter(function (message) { return message.offsetMs <= duePositionMs()+250; });
        status.textContent = due.length ? labels.chat_filtered_empty : activeSegment.messages.length ? labels.chat_waiting : activeSegment.complete ? labels.chat_empty : '';
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
        var time = document.createElement('button'); time.type = 'button';
        time.className = 'text-button chat-time'; time.dataset.chatSeek = String(message.offsetMs);
        time.setAttribute('aria-label',labels.chat_seek.replace('{time}',timestamp(message.offsetMs)));
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

    function rebuildVisible(preserveManual) {
        if (!visible() || !activeSegment) return;
        var wasFollowing = autoScroll, oldTop = list.getBoundingClientRect().top;
        var anchor = preserveManual && !autoScroll && Array.from(list.children).find(function (row) { return row.getBoundingClientRect().bottom > oldTop; });
        var anchorId = anchor && anchor.dataset.messageId, anchorOffset = anchor && anchor.getBoundingClientRect().top-oldTop;
        var due = dueMessages(), start = Math.max(0,due.length-MAX_VISIBLE_MESSAGES);
        if (anchor) { var index = due.findIndex(function (message) { return message.id === anchorId; }); if (index >= 0) start = Math.max(0,index-8); }
        var shown = due.slice(start,start+MAX_VISIBLE_MESSAGES);
        list.textContent = '';
        shown.forEach(function (message) { list.appendChild(messageRow(message)); });
        displayCursor = activeSegment.messages.findIndex(function (message) { return message.offsetMs > duePositionMs() + 250; });
        if (displayCursor < 0) displayCursor = activeSegment.messages.length;
        windowAtTail = start+shown.length >= due.length;
        setAutoScroll(!(preserveManual && !wasFollowing));
        if (autoScroll) list.scrollTop = list.scrollHeight;
        else if (anchorId) { var target = Array.from(list.children).find(function (row) { return row.dataset.messageId === anchorId; }); if (target) list.scrollTop = target.getBoundingClientRect().top-list.getBoundingClientRect().top+list.scrollTop-anchorOffset; }
        refreshStatus();
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
        if (!visible() || !activeSegment) return;
        var now = duePositionMs() + 250;
        if (autoScroll && windowAtTail && activeSegment.messages[displayCursor] && activeSegment.messages[displayCursor].offsetMs <= now) {
            maintainScroll(function () {
                var removedHeight = 0;
                while (activeSegment.messages[displayCursor] && activeSegment.messages[displayCursor].offsetMs <= now) {
                    var message = activeSegment.messages[displayCursor++];
                    if (validMessage(message)) removedHeight += append(message);
                }
                return removedHeight;
            });
        }
        sync.hidden = autoScroll || !list.children.length;
        refreshStatus(); maybePrefetch();
    }

    function maybePrefetch() {
        clearTimeout(prefetchTimer);
        if (!visible() || !activeSegment || loading || activeSegment.failed || activeSegment.complete ||
            activeSegment.end > duePositionMs() + PREFETCH_MS) return;
        var delay = Math.max(0, nextRequestAt - Date.now());
        prefetchTimer = setTimeout(load, delay);
    }

    function load() {
        if (!alive() || !visible() || !activeSegment || loading || activeSegment.failed || activeSegment.complete) return;
        var segment = activeSegment;
        var request = generation;
        var initial = !segment.started;
        var url = new URL('/api/v1/live_chat/' + encodeURIComponent(video_data.id), location.origin);
        url.searchParams.set('offset_ms', String(initial ? segment.requestOffset : Math.max(segment.requestOffset, segment.end)));
        if (!initial && segment.continuation) url.searchParams.set('continuation', segment.continuation);
        var readKey = JSON.stringify([url.searchParams.get('continuation'),url.searchParams.get('offset_ms')]);
        if (segment.reads.has(readKey)) { segment.failed = true; segment.errorText = labels.chat_error; status.textContent = segment.errorText; retry.hidden = false; return; }
        loading = true;
        controller = new AbortController();
        list.setAttribute('aria-busy', 'true');
        retry.hidden = true;
        if (initial && !list.children.length) status.textContent = labels.chat_loading;

        var read = controller;
        ui.request(url.pathname + url.search,{signal:read.signal}).then(function (data) {
            if (!alive() || !visible() || read.signal.aborted || request !== generation || segment !== activeSegment) return;
            data = normalizeChunk(data);
            segment.reads.add(readKey); while (segment.reads.size > 32) segment.reads.delete(segment.reads.values().next().value);
            var removedInChunk = new Set(data.removedIds);
            removedInChunk.forEach(function (id) { removed.add(id); });
            while (removed.size > 10000) removed.delete(removed.values().next().value);
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
                if (!list.children.length) rebuildVisible(true);
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
            if (!alive() || !visible() || read.signal.aborted || request !== generation || segment !== activeSegment) return;
            loading = false;
            controller = null;
            segment.failed = true;
            list.setAttribute('aria-busy', 'false');
            segment.errorText = error.status === 404 ? labels.chat_unavailable : labels.chat_error;
            status.textContent = segment.errorText;
            retry.hidden = false;
        });
    }

    function selectPosition(force) {
        if (!visible()) return;
        var position = requestPositionMs();
        var segment = segmentFor(position);
        if (!segment) {
            segment = {requestOffset: position, start: Math.max(0, position - 15000), end: -1,
                messages: [], ids: new Set(), continuation: null, started: false, complete: false,
                failed: false, lastUsed: 0, reads:new Set()};
            segments.push(segment);
        }
        if (segment !== activeSegment) {
            generation++;
            clearTimeout(prefetchTimer);
            if (controller) controller.abort();
            controller = null;
            loading = false;
            activeSegment = segment;
            retry.hidden = !segment.failed; if (segment.failed) status.textContent = segment.errorText || labels.chat_error;
            nextRequestAt = 0;
            force = true;
        }
        touchSegment(segment);
        trimCache();
        if (force) rebuildVisible();
        maybePrefetch();
    }


    function applyPreferences(event) {
        if (!alive()) return;
        var next = event ? event.detail.values : preferences.values();
        if (!next || settings && Object.keys(next).every(function (key) { return next[key] === settings[key]; })) return;
        var filtersChanged = !settings || next.chat_user_blacklist !== settings.chat_user_blacklist || next.chat_word_blacklist !== settings.chat_word_blacklist;
        var widthChanged = !settings || next.chat_width_px !== settings.chat_width_px;
        settings = Object.assign({},next); userBlacklist = settings.chat_user_blacklist.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean); wordPatterns = preferences.patterns(settings.chat_word_blacklist);
        maintainScroll(function () {
            panel.classList.toggle('chat-hide-timestamps',!settings.chat_show_timestamps); panel.classList.toggle('chat-hide-user-ids',settings.chat_hide_user_ids);
            panel.style.setProperty('--chat-font-scale',String(settings.chat_font_scale/100));
            if (widthChanged) root.style.setProperty('--chat-width', settings.chat_width_px + 'px');
            return 0;
        });
        if (widthChanged && desktop && shown) player.trigger('playerresize');
        if (filtersChanged) rebuildVisible(true);
    }
    function setVisible(value) {
        if (disposed) return;
        var next = !!(value && alive() && selected());
        var playerChatOpen = desktop && next;
        var resized = root.classList.contains('chat-replay-open') !== playerChatOpen;
        root.classList.toggle('chat-replay-open', playerChatOpen);
        section.hidden = desktop && !next;
        panel.hidden = !next;
        if (desktop && dialog.open && (stack.hidden || shell.classList.contains('is-docked'))) dialog.close();
        sidebarToggle.setAttribute('aria-expanded', String(expanded));
        shortcut.setAttribute('aria-expanded', String(next));
        if (control) {
            var label = next ? labels.hide_chat : labels.show_chat;
            control.controlText(label);
            control.el().title = label;
            control.el().setAttribute('aria-expanded', String(next));
            if (stack.hidden) control.disable(); else control.enable();
        }
        if (resized) player.trigger('playerresize');
        if (next === shown) return;
        shown = next;
        if (next) { selectPosition(false); showDue(); }
        else stop();
    }
    function navigate(value) {
        if (!alive() || stack.hidden) return;
        expanded = value === true;
        setVisible(expanded);
    }
    function placeChat() {
        if (!alive()) return;
        var inPlayer = !!control && desktopViewport.matches;
        if (desktop === inPlayer) return;
        var focused = section.contains(document.activeElement) || dialog.contains(document.activeElement) || document.activeElement === shortcut;
        var focusedControl = section.contains(document.activeElement) ? document.activeElement : null;
        var scroll = list.scrollTop;
        if (dialog.open) dialog.close();
        desktop = inPlayer;
        if (desktop) {
            root.append(section, dialog);
            control.show();
        } else {
            stack.insertBefore(section, sidebarPosition);
            stack.insertBefore(dialog, sidebarPosition);
            control.hide();
        }
        sidebarToggle.hidden = desktop;
        playerHeading.hidden = !desktop;
        section.hidden = desktop && !shown;
        updateWatchSidebar();
        list.scrollTop = scroll;
        if (focused) {
            var target = focusedControl && focusedControl.getClientRects().length ? focusedControl : desktop ? control.el() : sidebarToggle;
            target.focus({preventScroll:true});
        }
    }
    function timeupdate() { if (!player.seeking || !player.seeking()) lastPlaybackPosition = positionMs(); if (visible()) showDue(); }
    function seeking() { seekStartPosition = lastPlaybackPosition; }
    function seeked() {
        if (!visible()) { lastPlaybackPosition = positionMs(); seekStartPosition = null; return; }
        var previous = seekStartPosition === null ? lastPlaybackPosition : seekStartPosition, current = positionMs(), moved = Math.abs(current-previous)>750;
        selectPosition(moved);
        if (!moved && current < previous && activeSegment) {
            var now = duePositionMs()+250;
            Array.from(list.children).forEach(function (row) { if (Number(row.dataset.offsetMs)>now) row.remove(); });
            displayCursor = activeSegment.messages.findIndex(function (message) { return message.offsetMs>now; }); if (displayCursor<0) displayCursor=activeSegment.messages.length;
        }
        showDue(); lastPlaybackPosition = current; seekStartPosition = null;
    }
    function dispose() {
        if (disposed) return;
        setVisible(false); disposed = true; activePage = false; life.abort();
        if (control) control.hide();
        player.off('timeupdate',timeupdate); player.off('seeking',seeking); player.off('seeked',seeked); player.off(['fullscreenchange','dockchange'],syncVisibility); player.off('dispose',dispose);
        segments.length=0; activeSegment=null; removed.clear(); wordPatterns=[]; userBlacklist=[]; settings=null;
    }
    function syncVisibility() { setVisible(expanded); }
    on(stack,'iv:watch-tools-visibility',syncVisibility);
    on(sidebarToggle,'click',function () { navigate(!expanded); });
    shortcut.hidden = false;
    on(shortcut,'click',function () {
        navigate(true);
        if (visible()) focusWatchTool(sidebarToggle);
    });
    on(desktopViewport,'change',placeChat);
    on(document,'iv:chat-preferences',applyPreferences);
    on(document,'iv:chat-timing',function (event) { if (!alive() || event.detail.offsetMs === timingMs) return; timingMs=event.detail.offsetMs; if (visible()) selectPosition(true); });
    on(document,'visibilitychange',syncVisibility); on(document,'fullscreenchange',syncVisibility);
    on(window,'pagehide',function (event) { setVisible(false); activePage=false; if (!event.persisted) dispose(); });
    on(window,'pageshow',function () { activePage=!disposed; if (alive()) { placeChat(); syncVisibility(); } });
    on(window,'browserprofilechange',dispose); on(document,'iv:content-added',function () { if (!panel.isConnected) dispose(); });
    on(section,'keydown',function (event) { if (event.key !== 'Escape') event.stopPropagation(); });
    on(section,'click',function (event) { if (desktop) event.stopPropagation(); });
    on(section,'dblclick',function (event) { if (desktop) event.stopPropagation(); });
    on(list,'click',function (event) { var button=event.target.closest('[data-chat-seek]'); if (button && visible()) player.currentTime(Math.max(0,(Number(button.dataset.chatSeek)+timingMs)/1000)); });
    on(retry,'click',function () {
        if (!visible() || !activeSegment) return;
        activeSegment.failed=false; activeSegment.started=false; activeSegment.complete=false; activeSegment.continuation=null; activeSegment.requestOffset=requestPositionMs(); activeSegment.reads.clear();
        status.textContent=labels.chat_loading; retry.hidden=true; nextRequestAt=0; maybePrefetch();
    });
    on(sync,'click',function () { if (visible()) rebuildVisible(); });
    on(list,'scroll',function () {
        if (!visible()) return;
        if (nearBottom()) { if (!autoScroll) { if (windowAtTail) { setAutoScroll(true); showDue(); } else rebuildVisible(); } }
        else { setAutoScroll(false); showOlder(); }
    });
    player.on('timeupdate',timeupdate); player.on('seeking',seeking); player.on('seeked',seeked); player.on(['fullscreenchange','dockchange'],syncVisibility); player.on('dispose',dispose);
    window.invidiousChat={toggle:function () { navigate(!expanded); },setVisible:navigate,isVisible:visible,showLabel:labels.show_chat,hideLabel:labels.hide_chat};
    applyPreferences(); lastPlaybackPosition=positionMs();
    player.ready(function () {
        if (!alive()) return;
        var bar = player.getChild('controlBar');
        var gear = bar.children().find(function (child) { return child.hasClass('vjs-desktop-settings'); });
        if (gear) {
            control = new (videojs.getComponent('Button'))(player);
            control.addClass('vjs-chat-control');
            control.addClass('owned-control-icon');
            control.el().setAttribute('aria-controls', section.id);
            control.el().querySelector('.vjs-icon-placeholder').replaceChildren(document.getElementById('chat-control-icon').content.cloneNode(true));
            control.on('click', function () { navigate(!expanded); });
            bar.addChild(control, {}, bar.children().indexOf(gear));
            control.hide();
        }
        expanded = !control || !desktopViewport.matches;
        placeChat();
        syncVisibility();
    });
})();
