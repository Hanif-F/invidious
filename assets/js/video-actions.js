'use strict';
(function () {
    var menus = document.querySelectorAll('.video-context');
    function closeMenu(menu, restoreFocus) {
        menu.open = false;
        delete menu.querySelector('.video-context-actions').dataset.positioned;
        menu.querySelector('.video-context-actions').style.visibility = 'hidden';
        if (restoreFocus) menu.querySelector('summary').focus();
    }
    function positionMenu(menu) {
        var panel = menu.querySelector('.video-context-actions');
        var anchor = menu.querySelector('summary').getBoundingClientRect();
        var width = panel.offsetWidth;
        var height = panel.offsetHeight;
        var left = menu.closest('.recommendation') ? anchor.left : anchor.right - width;
        left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
        var top = Math.max(8, Math.min(anchor.bottom, window.innerHeight - height - 8));
        // Apply positioning atomically. A temporary fixed element with top:100%
        // can make Chromium scroll/focus it outside the viewport during opening.
        panel.style.cssText = 'position:fixed;inset:auto;left:' + left + 'px;top:' + top + 'px;visibility:visible;';
    }
    window.addEventListener('resize', function () { menus.forEach(function (menu) { if (menu.open) positionMenu(menu); }); });
    document.addEventListener('scroll', function () { menus.forEach(function (menu) { if (menu.open) positionMenu(menu); }); }, true);
    menus.forEach(function (menu) {
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
    var selectedVideo = '';
    var returnFocus;
    var pending = false;
    var lastBlock;
    var hiddenCards = new Map();
    var busyChannels = new Set();
    var query = new URLSearchParams(location.search);
    var discovery = ['/feed/popular', '/feed/trending', '/'].indexOf(location.pathname) !== -1 ||
        location.pathname.startsWith('/hashtag/') || (location.pathname === '/search' && query.get('include_blocked') !== '1');

    async function request(url, data) {
        var options = { credentials: 'same-origin', headers: { 'Accept': 'application/json' } };
        if (data) {
            options.method = 'POST';
            options.body = new URLSearchParams(Object.assign({ csrf_token: words.csrf }, data));
        }
        var controller = new AbortController();
        options.signal = controller.signal;
        var timeout = setTimeout(function () { controller.abort(); }, 15000);
        try {
            var response = await fetch(url, options);
            if (!response.ok || response.redirected) throw new Error(words.error);
            return await response.json();
        } finally { clearTimeout(timeout); }
    }
    function message(text, allowUndo) {
        notice.hidden = false;
        notice.querySelector('span').textContent = text;
        undo.hidden = !allowUndo;
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
        if (busyChannels.has(ucid)) return;
        busyChannels.add(ucid);
        var buttons = Array.from(menus).filter(function (menu) { return menu.dataset.channelId === ucid; })
            .map(function (menu) { return menu.querySelector('[data-video-action="block"], [data-video-action="unblock"]'); }).filter(Boolean);
        buttons.forEach(function (button) { button.disabled = true; });
        try {
            await request('/blocked_channels?redirect=false', { action: blocked ? 'block' : 'unblock', ucid: ucid, name: name });
            buttons.forEach(function (button) {
                button.dataset.videoAction = blocked ? 'unblock' : 'block';
                button.textContent = blocked ? words.unblock : words.block;
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
            updateAutoplay();
            message(blocked ? words.blocked : words.unblocked, blocked);
            if (blocked) undo.focus();
            else if (buttons[0]) buttons[0].closest("details").querySelector("summary").focus();
        } catch (_) { message(words.error, !!lastBlock); }
        finally { busyChannels.delete(ucid); buttons.forEach(function (button) { button.disabled = false; }); }
    }
    undo.addEventListener('click', async function () {
        if (!lastBlock) return;
        undo.disabled = true;
        await setBlocked(lastBlock.ucid, lastBlock.name, false);
        undo.disabled = false;
    });
    function busy(value) {
        pending = value;
        dialog.querySelectorAll('#video-playlist-save button, #video-playlist-create button').forEach(function (button) { button.disabled = value; });
        select.disabled = value || !select.options.length;
        saveForm.querySelector('[type=submit]').disabled = value || !select.options.length;
    }
    async function loadPlaylists() {
        busy(true);
        status.textContent = words.loading;
        try {
            var data = await request('/video_actions');
            select.replaceChildren();
            data.playlists.forEach(function (playlist) { select.add(new Option(playlist.title, playlist.id)); });
            if (data.playlists.some(function (playlist) { return playlist.id === data.defaultPlaylist; })) select.value = data.defaultPlaylist;
            status.textContent = data.playlists.length ? '' : words.empty;
        } catch (_) { status.textContent = words.error; }
        finally { busy(false); }
    }
    async function addVideo() {
        await request('/playlist_ajax?action=add_video&redirect=false&video_id=' + encodeURIComponent(selectedVideo) + '&playlist_id=' + encodeURIComponent(select.value), {});
        status.textContent = words.saved;
    }
    menus.forEach(function (menu) {
        menu.addEventListener('click', function (event) {
            var action = event.target.closest('[data-video-action]');
            if (!action || action.disabled) return;
            closeMenu(menu, true);
            if (action.dataset.videoAction === 'playlist') {
                selectedVideo = menu.dataset.videoId;
                returnFocus = menu.querySelector('summary');
                document.getElementById('video-playlist-create-details').open = false;
                createForm.reset();
                dialog.showModal();
                loadPlaylists();
            } else {
                setBlocked(menu.dataset.channelId, menu.dataset.channelName, action.dataset.videoAction === 'block');
            }
        });
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
        try { await addVideo(); } catch (_) { status.textContent = words.error; }
        finally { busy(false); }
    });
    createForm.addEventListener('submit', async function (event) {
        event.preventDefault();
        if (pending) return;
        busy(true);
        var created = false;
        try {
            var playlist = await request('/create_playlist?redirect=false', { title: createForm.elements.title.value, privacy: createForm.elements.privacy.value });
            select.add(new Option(playlist.title, playlist.playlistId));
            select.value = playlist.playlistId;
            created = true;
            createForm.reset();
            document.getElementById('video-playlist-create-details').open = false;
            await addVideo();
        } catch (_) { status.textContent = created ? words.created : words.error; }
        finally { busy(false); }
    });
})();
