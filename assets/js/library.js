'use strict';
(function () {
    var ui = InvidiousUI, root = document.getElementById('main-content');
    if (!root || !ui.config.signedIn || document.body.dataset.page === 'watch') return;
    var manager = location.pathname === '/subscription_manager';
    var historyPage = location.pathname === '/feed/history';
    var selecting = false, pending = false, ordering = false, toolbar;
    var boxes = new WeakMap(), orderInitialized = new WeakSet();
    var toggle, all, clear, count, operation, playlists, apply, status;
    function rows() {
        return Array.from(root.querySelectorAll(manager ? '.subscription-row' : '.media-item[data-video-id]')).filter(function (row) {
            return !row.hidden && (manager || /^[\w-]{11}$/.test(row.dataset.videoId));
        });
    }
    function selected() { return rows().filter(function (row) { return boxes.get(row) && boxes.get(row).checked; }); }
    function ownerInfo(row) {
        var button = row.querySelector('[data-onclick=remove_playlist_item]');
        return button ? {entry: button.dataset.index, playlist: button.dataset.plid} : null;
    }
    function button(text, fn) {
        var element = document.createElement('button'); element.type = 'button'; element.className = 'pure-button'; element.textContent = text; element.onclick = fn; return element;
    }
    function update() {
        var chosen = selected();
        toolbar.dataset.selecting = String(selecting);
        count.textContent = ui.label('count', {count: chosen.length});
        toggle.setAttribute('aria-pressed', String(selecting));
        all.hidden = clear.hidden = count.hidden = operation.hidden = apply.hidden = !selecting;
        playlists.hidden = !selecting || operation.value !== 'playlist';
        apply.disabled = pending || !chosen.length || (operation.value === 'playlist' && !playlists.value);
        rows().forEach(function (row) {
            var box = boxes.get(row);
            if (box) { box.closest('label').hidden = !selecting; row.dataset.selected = String(selecting && box.checked); }
        });
    }
    function init() {
        var entries = rows();
        if (!entries.length) return;
        if (!toolbar || !toolbar.isConnected) createToolbar(entries);
        entries.forEach(function (row) {
            if (!boxes.has(row)) {
                var label = document.createElement('label'); label.className = 'library-checkbox';
                var box = document.createElement('input'); box.type = 'checkbox'; box.onchange = update;
                label.append(box, document.createTextNode(ui.label('selection_label'))); label.hidden = !selecting;
                row.prepend(label); boxes.set(row, box);
            }
            var info = ownerInfo(row);
            if (info && !orderInitialized.has(row)) addOrder(row, info);
        });
        update();
    }
    function createToolbar(entries) {
        selecting = false;
        toolbar = document.createElement('div'); toolbar.className = 'library-toolbar'; toolbar.setAttribute('role', 'group'); toolbar.setAttribute('aria-label', ui.label('select'));
        toggle = button(ui.label('select'), function () { if (pending) return; selecting = !selecting; update(); });
        all = button(ui.label('select_all'), function () { rows().forEach(function (row) { boxes.get(row).checked = true; }); update(); });
        clear = button(ui.label('clear_selection'), function () { rows().forEach(function (row) { boxes.get(row).checked = false; }); update(); });
        count = document.createElement('span'); count.setAttribute('role', 'status');
        operation = document.createElement('select'); operation.setAttribute('aria-label', ui.label('operation'));
        var choices = manager ? [['unsubscribe', 'unsubscribe']] : [['playlist', 'add_playlist'], ['watched', 'watched'], ['unwatched', 'unwatched']];
        if (!manager && (historyPage || entries.some(ownerInfo))) choices.push(['remove', 'remove']);
        choices.forEach(function (choice) { operation.add(new Option(ui.label(choice[1]), choice[0])); });
        playlists = document.createElement('select'); playlists.setAttribute('aria-label', ui.label('add_playlist'));
        playlists.add(new Option(ui.label('loading'), ''));
        operation.onchange = function () { if (operation.value === 'playlist') loadPlaylists(); update(); };
        toggle.addEventListener('click', function () { if (selecting && operation.value === 'playlist') loadPlaylists(); });
        playlists.onchange = update;
        apply = button(ui.label('apply'), run);
        status = document.createElement('span'); status.setAttribute('role', 'status');
        toolbar.append(toggle, count, all, clear, operation, playlists, apply, status);
        var container = entries[0].closest('.history-groups') || entries[0].closest('.media-grid') || entries[0];
        container.before(toolbar);
    }
    async function loadPlaylists() {
        if (playlists.dataset.loaded || playlists.dataset.loading) return;
        playlists.dataset.loading = 'true';
        try {
            var data = await ui.request('/video_actions');
            playlists.replaceChildren();
            data.playlists.forEach(function (playlist) { playlists.add(new Option(playlist.title, playlist.id)); });
            if (data.playlists.some(function (playlist) { return playlist.id === data.defaultPlaylist; })) playlists.value = data.defaultPlaylist;
            playlists.dataset.loaded = 'true';
            ui.status(status, data.playlists.length ? '' : ui.label('no_playlists'));
        } catch (_) { ui.status(status, ui.label('error'), loadPlaylists); }
        finally { delete playlists.dataset.loading; update(); }
    }
    async function run() {
        if (pending) return;
        var chosen = selected(), action = operation.value, playlist = playlists.value;
        if (!chosen.length || (action === 'playlist' && !playlist)) return;
        if (['remove', 'unsubscribe'].includes(action) && !window.confirm(ui.label('confirm_bulk', {count: chosen.length, action: operation.selectedOptions[0].textContent}))) return;
        var restoreFocus = toolbar.contains(document.activeElement);
        pending = true;
        var controls = Array.from(root.querySelectorAll('.library-toolbar button, .library-toolbar select, .library-checkbox input, .playlist-order button'));
        controls.forEach(function (control) { control.disabled = true; });
        var done = 0;
        var watchedAction = action === 'watched' || action === 'unwatched' || (action === 'remove' && historyPage);
        var completedVideos = new Set();
        try {
            for (var row of chosen) {
                if (!InvidiousStorage.isCurrent()) break;
                var id = row.dataset.videoId, url;
                if (watchedAction && completedVideos.has(id)) { done++; boxes.get(row).checked = false; continue; }
                if (action === 'playlist') url = '/playlist_ajax?action=add_video&redirect=false&video_id=' + encodeURIComponent(id) + '&playlist_id=' + encodeURIComponent(playlist);
                else if (action === 'unsubscribe') url = '/subscription_ajax?action=remove_subscriptions&redirect=false&c=' + encodeURIComponent(row.querySelector('[data-ucid]').dataset.ucid);
                else if (action === 'remove' && !historyPage) {
                    var info = ownerInfo(row);
                    url = '/playlist_ajax?action=remove_video&redirect=false&set_video_id=' + encodeURIComponent(info.entry) + '&playlist_id=' + encodeURIComponent(info.playlist);
                } else url = '/watch_ajax?action=mark_' + (action === 'watched' ? 'watched' : 'unwatched') + '&redirect=false&id=' + encodeURIComponent(id);
                try {
                    await ui.post(url, {});
                    done++; boxes.get(row).checked = false; row.dataset.selected = 'false';
                    if (watchedAction) { completedVideos.add(id); ui.watched(id, action === 'watched'); }
                    else if (action === 'remove' || action === 'unsubscribe') ui.removeRows([row]);
                } catch (_) { /* Keep failed occurrences selected; never automatically retry. */ }
                ui.status(status, ui.label('progress', {done: done, total: chosen.length}));
            }
            document.dispatchEvent(new Event('iv:library-change'));
            ui.status(status, ui.label('partial', {done: done, failed: chosen.length - done}) +
                (action === 'playlist' && done < chosen.length ? ' ' + ui.label('check_playlist') : ''));
        } finally {
            pending = false;
            controls.forEach(function (control) { control.disabled = false; });
            update(); refreshOrderButtons();
            if (restoreFocus && document.activeElement === document.body) (apply.disabled ? toggle : apply).focus();
        }
    }
    function addOrder(row) {
        orderInitialized.add(row);
        var controls = document.createElement('div'); controls.className = 'playlist-order';
        // The grip is a pointer handle; adjacent buttons provide keyboard/touch
        // operation without exposing an otherwise inert button to tab order.
        var handle = document.createElement('span'); handle.textContent = '↕'; handle.className = 'pure-button playlist-drag'; handle.draggable = true;
        handle.setAttribute('role', 'img'); handle.setAttribute('aria-label', ui.label('drag'));
        controls.append(handle, button(ui.label('move_up'), function () { moveNeighbor(row, -1); }), button(ui.label('move_down'), function () { moveNeighbor(row, 1); }));
        row.append(controls);
        refreshOrderButtons();
    }
    function peers(row) { return Array.from(row.parentElement.children).filter(function (entry) { return entry.classList.contains('media-item') && ownerInfo(entry); }); }
    function refreshOrderButtons() {
        root.querySelectorAll('.playlist-order').forEach(function (controls) {
            var row = controls.closest('.media-item'), list = peers(row), index = list.indexOf(row);
            controls.children[0].draggable = !pending && !ordering;
            controls.children[1].disabled = pending || ordering || index === 0;
            controls.children[2].disabled = pending || ordering || index === list.length - 1;
        });
    }
    function moveNeighbor(row, direction) {
        var list = peers(row), anchor = list[list.indexOf(row) + direction];
        if (anchor) move(row, anchor, direction < 0 ? 'before' : 'after');
    }
    async function move(row, anchor, placement) {
        if (pending || ordering || row === anchor) return;
        var sourceInfo = ownerInfo(row), anchorInfo = ownerInfo(anchor);
        if (!sourceInfo || !anchorInfo || sourceInfo.playlist !== anchorInfo.playlist) return;
        var focus = document.activeElement, restoreFocus = row.contains(focus);
        ordering = true; refreshOrderButtons();
        try {
            await ui.post('/playlist_ajax?action=move_video_before&redirect=false&playlist_id=' + encodeURIComponent(sourceInfo.playlist),
                {source: sourceInfo.entry, anchor: anchorInfo.entry, placement: placement});
            if (placement === 'before') anchor.before(row); else anchor.after(row);
            // Server-rendered watch links carry stable entry identities, so
            // changing visual row order does not change what clicking opens.
            var positions = peers(row);
            var first = Math.min(...positions.map(function (entry) { return Number(entry.querySelector('.playlist-position').textContent); }));
            positions.forEach(function (entry, index) { entry.querySelector('.playlist-position').textContent = first + index; });
            ui.notice(ui.label('saved'));
            document.dispatchEvent(new Event('iv:library-change'));
        } catch (error) {
            if (error.status === 409) location.reload();
            else ui.notice(ui.label('error'));
        } finally {
            ordering = false; refreshOrderButtons();
            if (restoreFocus && document.activeElement === document.body && row.isConnected) {
                var target = focus.disabled ? row.querySelector('.playlist-order button:not([disabled])') : focus;
                if (target) target.focus();
            }
        }
    }
    var dragged;
    document.addEventListener('dragstart', function (event) {
        var handle = event.target.closest('.playlist-drag');
        if (!handle || pending || ordering) return;
        dragged = handle.closest('.media-item'); dragged.classList.add('is-dragging');
        event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', ownerInfo(dragged).entry);
    });
    document.addEventListener('dragover', function (event) { if (dragged && event.target.closest('.media-item')) event.preventDefault(); });
    document.addEventListener('drop', function (event) {
        var anchor = event.target.closest('.media-item');
        if (!dragged || !anchor) return;
        event.preventDefault();
        var box = anchor.getBoundingClientRect();
        move(dragged, anchor, event.clientY < box.top + box.height / 2 ? 'before' : 'after');
    });
    document.addEventListener('dragend', function () { if (dragged) dragged.classList.remove('is-dragging'); dragged = null; });
    document.addEventListener('iv:content-added', init);
    document.addEventListener('iv:library-change', function () { if (toolbar && toolbar.isConnected) { update(); refreshOrderButtons(); } });
    init();
})();
