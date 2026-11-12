'use strict';
(function () {
    var config = document.getElementById('video-actions-config');
    if (!config || config.dataset.videoActionsReady) return;
    config.dataset.videoActionsReady = 'true';
    var menus = [];
    // The shared shell owns positioning, keyboard handling and dismissal.
    // This owner only dispatches the selected media action.
    function closeMenu(menu, restoreFocus) {
        if (!menu.matches('details')) return;
        menu.open = false;
        if (restoreFocus) menu.querySelector('summary').focus();
    }
    function initMenus() { menus = Array.from(document.querySelectorAll('.video-context[data-ui-menu]')); }
    initMenus();
    document.addEventListener('iv:content-added', initMenus);
    var words = config.dataset;
    var dialog = document.getElementById('video-playlist-dialog');
    var select = document.getElementById('video-playlist-select');
    var playlistChoices = document.getElementById('video-playlist-choices');
    var playlistList = playlistChoices.querySelector('.video-playlist-list');
    var status = document.getElementById('video-playlist-status');
    var saveForm = document.getElementById('video-playlist-save');
    var saveButton = saveForm.querySelector('[type=submit]');
    var reloadButton = document.getElementById('video-playlist-reload');
    var createDetails = document.getElementById('video-playlist-create-details');
    var createForm = document.getElementById('video-playlist-create');
    var createButton = createForm.querySelector('[type=submit]');
    var notice = document.getElementById('video-actions-notice');
    var undo = document.getElementById('video-actions-undo');
    var noticeTimeout;
    var selectedVideo = '';
    var returnFocus;
    var pending = false;
    var lastBlock;
    var activePage = true, requests = new Set(), additions = new Set(), uncertainAdditions = new Set(), creationUncertain = false, uncertainBlocks = new Set();
    var playlistEpoch = 0, pageEpoch = 0;
    function alive() { return activePage && dialog.isConnected && InvidiousStorage.isCurrent(); }
    function additionKey() { return selectedVideo + ':' + select.value; }
    function isUncertain(error) { return !error.status || error.status >= 500 || error.status === 408 || error.status < 400; }
    function checkLibrary() { var link = document.createElement('a'); link.href = '/feed/playlists'; link.textContent = words.library; link.className = 'button'; status.append(' ',link); }
    function checkPlaylist() {
        var link = document.createElement('a'); link.className = 'button'; link.href = '/playlist?list='+encodeURIComponent(select.value); link.textContent = words.openPlaylist; status.append(' ',link);
    }
    function updatePlaylistStatus(message, additionMessage) {
        var key = additionKey();
        if (!additionMessage && uncertainAdditions.has(key)) additionMessage = InvidiousUI.label('check_playlist');
        var result = additionMessage || (additions.has(key) ? words.saved : '');
        status.textContent = [message, creationUncertain && words.creationUncertain, result].filter(Boolean).join(' ');
        if (creationUncertain) checkLibrary();
        if (additionMessage) checkPlaylist();
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
            updatePlaylistStatus();
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
        if (busyChannels.has(ucid) || uncertainBlocks.has(ucid) || !alive()) return;
        if (typeof InvidiousUI.config.discovery === 'boolean') discovery = InvidiousUI.config.discovery && !includeBlocked;
        busyChannels.add(ucid);
        var buttons = Array.from(menus).filter(function (menu) { return menu.dataset.channelId === ucid; })
            .map(function (menu) { return menu.querySelector('[data-video-action="block"], [data-video-action="unblock"]'); }).filter(Boolean);
        buttons.forEach(function (button) { button.disabled = true; });
        try {
            InvidiousUI.invalidate();
            var result = await request('/blocked_channels?redirect=false', { action: blocked ? 'block' : 'unblock', ucid: ucid, name: name, browser_profile: InvidiousStorage.scope });
            if (!result || result.blocked !== blocked) throw new Error(words.blockUncertain);
            if (!alive()) return;
            InvidiousUI.invalidate();
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
                InvidiousUI.invalidate();
                InvidiousUI.notice(words.blockUncertain, function () { location.reload(); });
            } else InvidiousUI.notice(error.userMessage || words.error, function () { setBlocked(ucid, name, blocked); });
        }
        finally { busyChannels.delete(ucid); buttons.forEach(function (button) { if (alive()) button.disabled = uncertainBlocks.has(ucid); }); }
    }
    undo.addEventListener('click', async function () {
        if (!lastBlock) return;
        undo.disabled = true;
        await setBlocked(lastBlock.ucid, lastBlock.name, false);
        if (alive()) undo.disabled = !!(lastBlock && uncertainBlocks.has(lastBlock.ucid));
    });
    function busy(value) {
        pending = value;
        var disabled = value || !alive();
        select.disabled = disabled || !select.options.length;
        playlistChoices.disabled = select.disabled;
        reloadButton.disabled = disabled;
        saveButton.disabled = select.disabled || uncertainAdditions.has(additionKey()) || additions.has(additionKey());
        createButton.disabled = disabled || creationUncertain;
    }
    function renderPlaylistChoices() {
        var rows = Array.from(select.options, function (option) {
            var row = document.createElement('label');
            row.className = 'video-playlist-choice';
            var radio = document.createElement('input');
            radio.type = 'radio';
            radio.name = 'video-playlist-choice';
            radio.value = option.value;
            radio.checked = option.selected;
            var title = document.createElement('span');
            title.dir = 'auto';
            title.textContent = option.text;
            row.append(radio, title);
            return row;
        });
        playlistList.replaceChildren(...rows);
        playlistChoices.hidden = !rows.length;

        var selected = playlistList.querySelector(':checked');
        if (!selected || !playlistList.clientHeight) return;
        var rowBox = selected.parentElement.getBoundingClientRect();
        var listTop = playlistList.getBoundingClientRect().top + playlistList.clientTop;
        var listBottom = listTop + playlistList.clientHeight;
        if (rowBox.top < listTop || rowBox.height > playlistList.clientHeight) playlistList.scrollTop += rowBox.top - listTop;
        else if (rowBox.bottom > listBottom) playlistList.scrollTop += rowBox.bottom - listBottom;
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
            renderPlaylistChoices();
            updatePlaylistStatus(data.playlists.length ? '' : words.empty);
        } catch (_) { if (alive() && epoch === playlistEpoch) updatePlaylistStatus(InvidiousUI.label('read_error')); }
        finally { if (alive() && epoch === playlistEpoch) busy(false); }
    }
    async function addVideo() {
        var key = additionKey(), video = selectedVideo, playlist = select.value;
        if (uncertainAdditions.has(key) || additions.has(key)) return;
        saveForm.dataset.pending = 'true';
        try {
            await request('/playlist_ajax?action=add_video&redirect=false&video_id=' + encodeURIComponent(video) + '&playlist_id=' + encodeURIComponent(playlist), {});
            if (alive()) { additions.add(key); updatePlaylistStatus(); }
        } catch (error) { if (isUncertain(error)) uncertainAdditions.add(key); throw error; }
        finally { delete saveForm.dataset.pending; }
    }
    function playlistSelectionChanged() {
        updatePlaylistStatus();
        busy(false);
    }
    select.addEventListener('change', function () {
        if (pending) return;
        playlistList.querySelectorAll('input').forEach(function (radio) { radio.checked = radio.value === select.value; });
        playlistSelectionChanged();
    });
    playlistList.addEventListener('change', function (event) {
        if (pending || !event.target.checked) return;
        select.value = event.target.value;
        playlistSelectionChanged();
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
            createDetails.open = false;
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
    reloadButton.addEventListener('click', loadPlaylists);
    saveForm.addEventListener('submit', async function (event) {
        event.preventDefault();
        if (pending || !select.value) return;
        busy(true);
        try { await addVideo(); } catch (error) { if (alive()) updatePlaylistStatus('', error.userMessage || InvidiousUI.label('check_playlist')); }
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
            created = true;
            delete createForm.dataset.pending;
            select.add(new Option(playlist.title, playlist.playlistId));
            select.value = playlist.playlistId;
            renderPlaylistChoices();
            createForm.reset();
            if (createForm.contains(document.activeElement)) createDetails.querySelector('summary').focus();
            createDetails.open = false;
            await addVideo();
        } catch (error) {
            if (!created && isUncertain(error)) creationUncertain = true;
            if (alive()) {
                if (created) updatePlaylistStatus('', uncertainAdditions.has(additionKey()) ? words.createdUncertain : words.created);
                else updatePlaylistStatus(creationUncertain ? '' : error.userMessage || words.error);
            }
        } finally { delete createForm.dataset.pending; if (alive()) busy(false); }
    });
})();
