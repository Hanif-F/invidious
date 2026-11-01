'use strict';
(function () {
    var menus = [];
    var initialized = new WeakSet();
    function closeMenu(menu, restoreFocus) {
        if (!menu.matches("details")) return;
        menu.open = false;
        if (menu.hasAttribute('data-ui-menu')) { if (restoreFocus) menu.querySelector('summary').focus(); return; }
        delete menu.querySelector('.video-context-actions').dataset.positioned;
        menu.querySelector('.video-context-actions').style.visibility = 'hidden';
        if (restoreFocus) menu.querySelector('summary').focus();
    }
    function positionMenu(menu) {
        if (menu.hasAttribute('data-ui-menu')) return;
        var panel = menu.querySelector('.video-context-actions');
        var anchor = menu.querySelector('summary').getBoundingClientRect();
        var width = panel.offsetWidth;
        var height = panel.offsetHeight;
        var left = anchor.right - width;
        left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
        var top = Math.max(8, Math.min(anchor.bottom, window.innerHeight - height - 8));
        // Apply positioning atomically. A temporary fixed element with top:100%
        // can make Chromium scroll/focus it outside the viewport during opening.
        panel.style.cssText = 'position:fixed;inset:auto;left:' + left + 'px;top:' + top + 'px;visibility:visible;';
    }
    window.addEventListener('resize', function () { menus.forEach(function (menu) { if (menu.open) positionMenu(menu); }); });
    document.addEventListener('scroll', function () { menus.forEach(function (menu) { if (menu.open) positionMenu(menu); }); }, true);
    function initMenus() {
    menus = Array.from(document.querySelectorAll('.video-context'));
    menus.forEach(function (menu) {
        if (menu.hasAttribute('data-ui-menu') || initialized.has(menu)) return;
        initialized.add(menu);
        menu.classList.add('js-video-context');
        menu.addEventListener('toggle', function () {
            menu.querySelector('summary').setAttribute('aria-expanded', String(menu.open));
            if (menu.open) {
                positionMenu(menu);
                requestAnimationFrame(function () {
                    if (!menu.open) return;
                    positionMenu(menu);
                    menu.querySelector('.video-context-actions').dataset.positioned = 'true';
                });
            } else delete menu.querySelector('.video-context-actions').dataset.positioned;
            if (menu.open) menus.forEach(function (other) { if (other !== menu) closeMenu(other, false); });
        });
        menu.addEventListener('keydown', function (event) {
            if (event.key === 'Escape') { event.preventDefault(); closeMenu(menu, true); }
            if (['ArrowDown', 'ArrowUp', 'Home', 'End'].indexOf(event.key) === -1) return;
            event.preventDefault();
            menu.open = true;
            positionMenu(menu);
            menu.querySelector('.video-context-actions').dataset.positioned = 'true';
            var actions = Array.from(menu.querySelectorAll('.video-context-actions a, .video-context-actions button'));
            var index = actions.indexOf(document.activeElement);
            if (event.key === 'Home') index = 0;
            else if (event.key === 'End') index = actions.length - 1;
            else index = (index + (event.key === 'ArrowUp' ? -1 : 1) + actions.length) % actions.length;
            if (actions[index]) {
                var attempts = 0;
                var origin = document.activeElement;
                function focusAction() {
                    if (!menu.open || (document.activeElement !== origin && document.activeElement !== actions[index])) return;
                    actions[index].focus();
                    // Details content can remain non-focusable while its opening
                    // layout is pending. Stop if the user moves focus elsewhere.
                    if (document.activeElement !== actions[index] && ++attempts < 30) requestAnimationFrame(focusAction);
                }
                focusAction();
            }
        });
    });
    }
    initMenus();
    document.addEventListener('iv:content-added', initMenus);
    document.addEventListener('click', function (event) {
        menus.forEach(function (menu) { if (!menu.contains(event.target)) closeMenu(menu, false); });
    });
    var config = document.getElementById('video-actions-config');
    if (!config) return;
    var words = config.dataset;
    var dialog = document.getElementById('video-playlist-dialog');
    var select = document.getElementById('video-playlist-select');
    var status = document.getElementById('video-playlist-status');
    var saveForm = document.getElementById('video-playlist-save');
    var createForm = document.getElementById('video-playlist-create');
    var notice = document.getElementById('video-actions-notice');
    var undo = document.getElementById('video-actions-undo');
    var noticeTimeout;
    var selectedVideo = '';
    var returnFocus;
    var pending = false;
    var lastBlock, ownerPending = false;
    var activePage = true, requests = new Set(), additions = new Set(), uncertainAdditions = new Set(), creationUncertain = false, uncertainBlocks = new Set();
    var playlistEpoch = 0, pageEpoch = 0;
    function alive() { return activePage && dialog.isConnected && InvidiousStorage.isCurrent(); }
    function additionKey() { return selectedVideo + ':' + select.value; }
    function isUncertain(error) { return !error.status || error.status >= 500 || error.status === 408 || error.status < 400; }
    function checkLibrary() { var link = document.createElement('a'); link.href = '/feed/playlists'; link.textContent = words.library; link.className = 'button'; status.append(' ',link); }
    function checkPlaylist() {
        var link = document.createElement('a'); link.className = 'button'; link.href = '/playlist?list='+encodeURIComponent(select.value); link.textContent = InvidiousUI.label('check_playlist'); status.append(' ',link);
    }
    var hiddenCards = new Map();
    var busyChannels = new Set();
    var query = new URLSearchParams(location.search);
    var blockedToggle = document.querySelector('#filters input[type=checkbox][name=include_blocked]');
    var includeBlocked = blockedToggle ? blockedToggle.checked : query.get('include_blocked') === '1';
    var discovery = ['/feed/popular', '/feed/trending', '/'].indexOf(location.pathname) !== -1 ||
        location.pathname.startsWith('/hashtag/') || (location.pathname === '/search' && !includeBlocked);

    if (typeof InvidiousUI.config.discovery === 'boolean') discovery = InvidiousUI.config.discovery && !includeBlocked;

    async function request(url, data) {
        var controller = new AbortController(), generation = pageEpoch; requests.add(controller);
        try {
            var result = await InvidiousUI.request(url,Object.assign({signal:controller.signal},data ? {method:'POST',body:new URLSearchParams(Object.assign({csrf_token:words.csrf},data))} : {}));
            if (!alive() || generation !== pageEpoch) { var canceled = new Error(words.error); canceled.stalePage = true; throw canceled; }
            return result;
        } finally { requests.delete(controller); }
    }
    window.addEventListener('pagehide',function () {
        busyChannels.forEach(function (id) { uncertainBlocks.add(id); });
        if (lastBlock && uncertainBlocks.has(lastBlock.ucid)) undo.disabled = true;
        activePage = false; pageEpoch++; playlistEpoch++; requests.forEach(function (controller) { controller.abort(); }); clearTimeout(noticeTimeout);
        if (pending) {
            if (createForm.dataset.pending === 'true') creationUncertain = true;
            if (saveForm.dataset.pending === 'true') uncertainAdditions.add(additionKey());
            status.textContent = InvidiousUI.label('check_playlist');
        }
        pending = false;
    });
    window.addEventListener('pageshow',function () { activePage = true; busy(false); if (uncertainBlocks.size && alive()) InvidiousUI.notice(words.blockUncertain,function () { location.reload(); }); });
    window.addEventListener('browserprofilechange',function () { activePage = false; pageEpoch++; playlistEpoch++; requests.forEach(function (controller) { controller.abort(); }); busy(true); });
    function message(text, allowUndo) {
        clearTimeout(noticeTimeout);
        notice.hidden = false;
        notice.querySelector('span').textContent = text;
        undo.hidden = !allowUndo;
        noticeTimeout = setTimeout(function () { notice.hidden = true; }, 5000);
    }
    function updateAutoplay() {
        if (typeof video_data === 'undefined' || video_data.plid) return;
        var next = Array.from(document.querySelectorAll('.recommendation')).find(function (card) { return !card.hidden; });
        video_data.next_video = next ? next.dataset.videoId : null;
        if (typeof player !== 'undefined' && typeof next_video === 'function') {
            player.off('ended', next_video);
            var toggle = document.getElementById('continue');
            if (next && toggle && toggle.checked) player.on('ended', next_video);
        }
    }
    async function setBlocked(ucid, name, blocked) {
        includeBlocked = new URLSearchParams(location.search).get('include_blocked') === '1' || !!document.querySelector('#filters input[name=include_blocked]:checked');
        discovery = ['/feed/popular', '/feed/trending', '/'].includes(location.pathname) || location.pathname.startsWith('/hashtag/') || (location.pathname === '/search' && !includeBlocked);
        if (ownerPending || busyChannels.has(ucid) || uncertainBlocks.has(ucid) || !alive()) return;
        if (typeof InvidiousUI.config.discovery === 'boolean') discovery = InvidiousUI.config.discovery && !includeBlocked;
        busyChannels.add(ucid);
        var buttons = Array.from(menus).filter(function (menu) { return menu.dataset.channelId === ucid; })
            .map(function (menu) { return menu.querySelector('[data-video-action="block"], [data-video-action="unblock"]'); }).filter(Boolean);
        buttons.forEach(function (button) { button.disabled = true; });
        try {
            InvidiousUI.invalidate('blocks');
            var result = await request('/blocked_channels?redirect=false', { action: blocked ? 'block' : 'unblock', ucid: ucid, name: name, browser_profile: InvidiousStorage.scope });
            if (!result || result.blocked !== blocked) throw new Error(words.blockUncertain);
            if (!alive()) return;
            InvidiousUI.invalidate('blocks');
            buttons.forEach(function (button) {
                button.dataset.videoAction = blocked ? 'unblock' : 'block';
                (button.querySelector('[data-action-label]') || button).textContent = blocked ? words.unblock : words.block;
            });
            if (blocked) {
                var cards = new Set();
                document.querySelectorAll(discovery ? '.recommendation, .media-item' : '.recommendation').forEach(function (card) {
                    if (card.dataset.channelId === ucid && !card.hidden) { card.hidden = true; cards.add(card); }
                });
                hiddenCards.set(ucid, cards);
                lastBlock = { ucid: ucid, name: name };
            } else {
                (hiddenCards.get(ucid) || []).forEach(function (card) { card.hidden = false; });
                hiddenCards.delete(ucid);
                lastBlock = null;
            }
            document.dispatchEvent(new Event('iv:library-change'));
            if (!alive()) return;
            updateAutoplay();
            InvidiousUI.dismissNotice();
            message(blocked ? words.blocked : words.unblocked, blocked);
            if (blocked) undo.focus();
            else if (buttons[0]) buttons[0].closest("details").querySelector("summary").focus();
        } catch (error) {
            if (!alive() || error.stalePage) return;
            notice.hidden = true;
            if (isUncertain(error)) {
                uncertainBlocks.add(ucid);
                if (lastBlock && lastBlock.ucid === ucid) undo.disabled = true;
                InvidiousUI.invalidate('blocks');
                InvidiousUI.notice(words.blockUncertain, function () { location.reload(); });
            } else InvidiousUI.notice(error.userMessage || words.error, function () { setBlocked(ucid, name, blocked); });
        }
        finally { busyChannels.delete(ucid); buttons.forEach(function (button) { if (alive()) button.disabled = ownerPending || uncertainBlocks.has(ucid); }); }
    }
    function blockControls(blocked) {
        if (blocked && lastBlock && !busyChannels.has(lastBlock.ucid) && !blocked.has(lastBlock.ucid)) { lastBlock = null; undo.hidden = true; }
        undo.disabled = ownerPending || !alive() || !!lastBlock && (busyChannels.has(lastBlock.ucid) || uncertainBlocks.has(lastBlock.ucid));
        menus.forEach(function (menu) {
            var id = menu.dataset.channelId, button = menu.querySelector('[data-video-action="block"],[data-video-action="unblock"]');
            if (!button) return;
            button.disabled = ownerPending || !alive() || busyChannels.has(id) || uncertainBlocks.has(id);
            if (blocked && !busyChannels.has(id)) {
                var hidden = blocked.has(id);
                button.dataset.videoAction = hidden ? 'unblock' : 'block';
                (button.querySelector('[data-action-label]') || button).textContent = hidden ? words.unblock : words.block;
            }
        });
    }
    window.InvidiousVideoActions = {
        suspend:function () { ownerPending = true; blockControls(); },
        apply:function (value) { if (!alive()) return false; ownerPending = false; blockControls(new Set(value.blockedChannels)); return true; }
    };
    undo.addEventListener('click', async function () {
        if (!lastBlock) return;
        undo.disabled = true;
        await setBlocked(lastBlock.ucid, lastBlock.name, false);
        if (alive()) undo.disabled = !!(lastBlock && uncertainBlocks.has(lastBlock.ucid));
    });
    function busy(value) {
        pending = value;
        dialog.querySelectorAll('#video-playlist-save button, #video-playlist-create button').forEach(function (button) { button.disabled = value || !alive(); });
        select.disabled = value || !alive() || !select.options.length;
        saveForm.querySelector('[type=submit]').disabled = value || !alive() || !select.options.length || uncertainAdditions.has(additionKey()) || additions.has(additionKey());
        createForm.querySelector('[type=submit]').disabled = value || !alive() || creationUncertain;
    }
    async function loadPlaylists() {
        if (pending || !alive()) return;
        var epoch = ++playlistEpoch;
        busy(true); status.textContent = words.loading;
        try {
            var data = await request('/video_actions');
            if (!alive() || epoch !== playlistEpoch) return;
            if (!data || !Array.isArray(data.playlists) || data.playlists.some(function (item) { return typeof item.id !== 'string' || !/^IV[A-Za-z0-9_-]+$/.test(item.id) || typeof item.title !== 'string'; })) throw new Error(words.error);
            var previous = select.value;
            select.replaceChildren();
            data.playlists.forEach(function (playlist) { select.add(new Option(playlist.title, playlist.id)); });
            if (data.playlists.some(function (playlist) { return playlist.id === previous; })) select.value = previous;
            else if (data.playlists.some(function (playlist) { return playlist.id === data.defaultPlaylist; })) select.value = data.defaultPlaylist;
            status.textContent = creationUncertain ? words.creationUncertain : data.playlists.length ? '' : words.empty;
            if (creationUncertain) checkLibrary();
            if (uncertainAdditions.has(additionKey())) { status.append(' ',InvidiousUI.label('check_playlist')); checkPlaylist(); }
            else if (!creationUncertain && additions.has(additionKey())) status.textContent = words.saved;
        } catch (_) { if (alive() && epoch === playlistEpoch) status.textContent = words.error; }
        finally { if (alive() && epoch === playlistEpoch) busy(false); }
    }
    async function addVideo() {
        var key = additionKey(), video = selectedVideo, playlist = select.value;
        if (uncertainAdditions.has(key) || additions.has(key)) return;
        saveForm.dataset.pending = 'true';
        try {
            await request('/playlist_ajax?action=add_video&redirect=false&video_id=' + encodeURIComponent(video) + '&playlist_id=' + encodeURIComponent(playlist), {});
            if (alive()) { additions.add(key); status.textContent = words.saved; }
        } catch (error) { if (isUncertain(error)) uncertainAdditions.add(key); throw error; }
        finally { delete saveForm.dataset.pending; }
    }
    select.addEventListener('change',function () {
        if (pending) return;
        status.textContent = additions.has(additionKey()) ? words.saved : uncertainAdditions.has(additionKey()) ? InvidiousUI.label('check_playlist') : '';
        if (uncertainAdditions.has(additionKey())) checkPlaylist(); busy(false);
    });
    document.addEventListener('click', function (event) {
        var action = event.target.closest('[data-video-action]');
        var menu = action && action.closest('.video-context,[data-video-actions]');
        if (!menu || action.disabled || !alive()) return;
        event.preventDefault();
        closeMenu(menu, true);
        if (action.dataset.videoAction === 'playlist') {
            if (pending) return;
            selectedVideo = menu.dataset.videoId;
            additions.forEach(function (key) { if (key.startsWith(selectedVideo+':')) additions.delete(key); });
            returnFocus = menu.matches('details') ? menu.querySelector('summary') : action;
            document.getElementById('video-playlist-create-details').open = false;
            dialog.showModal();
            loadPlaylists();
        } else {
            setBlocked(menu.dataset.channelId, menu.dataset.channelName, action.dataset.videoAction === 'block');
        }
    });
    dialog.addEventListener('close', function () { if (returnFocus) returnFocus.focus(); });
    // Keep the selected video stable until the current request finishes.
    dialog.addEventListener('cancel', function (event) { if (pending) event.preventDefault(); });
    dialog.querySelector('form[method=dialog]').addEventListener('submit', function (event) { if (pending) event.preventDefault(); });
    dialog.addEventListener('click', function (event) {
        if (event.target !== dialog || pending) return;
        var box = dialog.getBoundingClientRect();
        if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close();
    });
    document.getElementById('video-playlist-reload').addEventListener('click', loadPlaylists);
    saveForm.addEventListener('submit', async function (event) {
        event.preventDefault();
        if (pending || !select.value) return;
        busy(true);
        try { await addVideo(); } catch (error) { if (alive()) { status.textContent = error.userMessage || InvidiousUI.label('check_playlist'); checkPlaylist(); } }
        finally { if (alive()) busy(false); }
    });
    createForm.addEventListener('submit', async function (event) {
        event.preventDefault();
        if (pending || creationUncertain || !alive()) return;
        busy(true);
        var created = false;
        createForm.dataset.pending = 'true';
        try {
            var playlist = await request('/create_playlist?redirect=false', { title: createForm.elements.title.value, privacy: createForm.elements.privacy.value });
            if (!alive()) return;
            if (!playlist || typeof playlist.playlistId !== 'string' || !/^IV[A-Za-z0-9_-]+$/.test(playlist.playlistId) || typeof playlist.title !== 'string') throw new Error(words.error);
            delete createForm.dataset.pending;
            select.add(new Option(playlist.title, playlist.playlistId));
            select.value = playlist.playlistId;
            created = true;
            createForm.reset();
            document.getElementById('video-playlist-create-details').open = false;
            await addVideo();
        } catch (error) {
            if (!created && isUncertain(error)) creationUncertain = true;
            if (alive()) {
                status.textContent = created ? (uncertainAdditions.has(additionKey()) ? words.createdUncertain : words.created) : creationUncertain ? words.creationUncertain : error.userMessage || words.error;
                if (created) checkPlaylist();
                else if (creationUncertain) checkLibrary();
            }
        } finally { delete createForm.dataset.pending; if (alive()) busy(false); }
    });
})();
