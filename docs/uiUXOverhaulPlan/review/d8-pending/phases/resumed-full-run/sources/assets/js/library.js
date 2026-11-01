'use strict';
// A collection owns its rendered controls, selections and requests. Writes are
// explicit; an uncertain playlist addition cannot be repeated in this document.
(function () {
    var ui = window.InvidiousUI, owners = new Map(), page = new AbortController();
    if (!ui || !ui.config.signedIn) return;
    function start(root) {
        if (owners.has(root)) return;
        var lifetime = new AbortController(), active = new Set(), uncertain = new WeakMap(), seenButtons = new WeakSet(), unavailableButtons = new WeakSet();
        var toolbar = root.querySelector('[data-collection-toolbar]');
        if (!toolbar) return;
        owners.set(root,lifetime);
        var toggle = toolbar.querySelector('[data-select-toggle]'), actions = toolbar.querySelector('[data-selection-actions]');
        var operation = toolbar.querySelector('[data-batch-operation]'), playlists = toolbar.querySelector('[data-batch-playlist]');
        var apply = toolbar.querySelector('[data-batch-apply]'), status = root.querySelector('[data-collection-status]');
        var selecting = false, pending = false, loading = false, loaded = false, orderPending = false, activePage = true, epoch = 0, feedbackEpoch = 0, currentAddition;
        var manager = root.dataset.collectionKind === 'manager', history = root.dataset.collectionKind === 'history';
        function alive() { return activePage && !lifetime.signal.aborted && root.isConnected && InvidiousStorage.isCurrent(); }
        function on(target,type,callback) { target.addEventListener(type,callback,{signal:lifetime.signal}); }
        function rows() { return Array.from(root.querySelectorAll(manager ? '.subscription-row[data-channel-id]' : '.media-item[data-video-id]')).filter(function (row) { return !row.hidden && row.querySelector('[data-select-item]') && (manager || /^[A-Za-z0-9_-]{11}$/.test(row.dataset.videoId)); }); }
        function selected() { return rows().filter(function (row) { return row.querySelector('[data-select-item]').checked; }); }
        function targetPlaylist() { return root.dataset.fixedPlaylist || (playlists && playlists.value) || ''; }
        function isUncertain(row, id) { return (uncertain.get(row) || new Set()).has(id); }
        function update() {
            if (!root.isConnected || lifetime.signal.aborted) return;
            var entries = rows(), chosen = selected(), blocked = pending || orderPending || !alive();
            root.dataset.selecting = String(selecting); root.dataset.collectionBusy = String(blocked);
            toolbar.hidden = !entries.length;
            toggle.setAttribute('aria-pressed',String(selecting)); toggle.disabled = blocked;
            actions.hidden = !selecting;
            toolbar.querySelector('[data-selection-count]').textContent = ui.label('count',{count:chosen.length});
            toolbar.querySelectorAll('button,select').forEach(function (control) { if (control !== toggle) control.disabled = blocked; });
            if (playlists) { playlists.hidden = !selecting || operation.value !== 'playlist'; playlists.disabled = blocked || loading; }
            apply.disabled = blocked || !chosen.length || (operation.value === 'playlist' && (!targetPlaylist() || chosen.some(function (row) { return isUncertain(row,targetPlaylist()); })));
            entries.forEach(function (row) { var box = row.querySelector('[data-select-item]'); box.closest('.library-checkbox').hidden = !selecting; box.disabled = blocked; row.dataset.selected = String(selecting && box.checked); });
            root.querySelectorAll('.playlist-grip').forEach(function (grip) { grip.disabled = selecting || blocked || !!grip.closest('[aria-invalid=true]'); });
            root.querySelectorAll('[data-collection-action] button').forEach(function (button) { if (!seenButtons.has(button)) { seenButtons.add(button); if (button.disabled) unavailableButtons.add(button); } var form = button.closest('form'), row = button.closest('.media-item,.subscription-row'); button.disabled = blocked || unavailableButtons.has(button) || (form.dataset.collectionAction === 'playlist' && row && isUncertain(row,targetPlaylist())); });
            var empty = root.querySelector('[data-collection-empty]');
            if (empty) empty.hidden = entries.length > 0 || !root.dataset.hadItems;
            if (entries.length) root.dataset.hadItems = 'true';
        }
        async function request(url, body) {
            if (!alive()) throw new Error(ui.label('error'));
            var controller = new AbortController(), generation = epoch; active.add(controller);
            try {
                var result = await ui.request(url,{signal:controller.signal,...(body ? {method:'POST',body:new URLSearchParams(Object.assign({csrf_token:ui.config.csrf},body))} : {})});
                if (!alive() || generation !== epoch) { var canceled = new Error(ui.label('error')); canceled.stalePage = true; throw canceled; }
                return result;
            } finally { active.delete(controller); }
        }
        async function loadPlaylists() {
            if (!playlists || loaded || loading || !alive()) return;
            var generation = epoch, feedback = feedbackEpoch; loading = true; update();
            try {
                var data = await request('/video_actions');
                if (!alive() || generation !== epoch) return;
                if (!data || !Array.isArray(data.playlists) || data.playlists.some(function (item) { return typeof item.id !== 'string' || !/^IV[A-Za-z0-9_-]+$/.test(item.id) || typeof item.title !== 'string'; })) throw new Error(ui.label('error'));
                playlists.replaceChildren();
                data.playlists.forEach(function (item) { playlists.add(new Option(item.title,item.id)); });
                if (data.playlists.some(function (item) { return item.id === data.defaultPlaylist; })) playlists.value = data.defaultPlaylist;
                loaded = true; if (feedback === feedbackEpoch && selecting && operation.value === 'playlist' && !pending) ui.status(status,data.playlists.length ? '' : ui.label('no_playlists'));
            } catch (_) { if (alive() && generation === epoch && feedback === feedbackEpoch && selecting && operation.value === 'playlist' && !pending) ui.status(status,ui.label('error'),loadPlaylists); }
            finally { if (generation === epoch) { loading = false; if (alive()) update(); } }
        }
        function confirmBatch(count, label) {
            var dialog = root.querySelector('[data-batch-confirm]');
            if (!dialog) return Promise.resolve(false);
            dialog.querySelector('[data-confirm-description]').textContent = ui.label('confirm_bulk',{count:count,action:label});
            dialog.returnValue = 'cancel';
            return new Promise(function (resolve) {
                function complete() { lifetime.signal.removeEventListener('abort',abort); resolve(dialog.returnValue === 'confirm' && alive()); }
                function abort() { dialog.close('cancel'); }
                dialog.addEventListener('close',complete,{once:true}); lifetime.signal.addEventListener('abort',abort,{once:true});
                dialog.showModal();
            });
        }
        function markUncertain(row, id, error) {
            if (error.status >= 400 && error.status < 500 && error.status !== 408) return;
            var ids = uncertain.get(row) || new Set(); ids.add(id); uncertain.set(row,ids);
        }
        function checkLink(id) {
            var link = document.createElement('a'); link.href = '/playlist?list=' + encodeURIComponent(id); link.className = 'button'; link.textContent = ui.label('check_playlist'); status.append(' ',link);
        }
        async function perform(row, action, playlist) {
            var id = row.dataset.videoId, url;
            if (action === 'playlist') url = '/playlist_ajax?action=add_video&redirect=false&video_id='+encodeURIComponent(id)+'&playlist_id='+encodeURIComponent(playlist);
            else if (action === 'unsubscribe') url = '/subscription_ajax?action=remove_subscriptions&redirect=false&c='+encodeURIComponent(row.dataset.channelId);
            else if (action === 'remove' && !history) url = '/playlist_ajax?action=remove_video&redirect=false&set_video_id='+encodeURIComponent(row.dataset.occurrence)+'&playlist_id='+encodeURIComponent(root.dataset.playlistId);
            else url = '/watch_ajax?action=mark_'+(action === 'watched' ? 'watched' : 'unwatched')+'&redirect=false&id='+encodeURIComponent(id);
            if (action === 'playlist') currentAddition = {row:row,id:playlist};
            var result;
            try { result = await request(url,action === 'playlist' || action === 'remove' && !history ? {include_positions:'1'} : {}); }
            catch (error) { if (action === 'playlist') markUncertain(row,playlist,error); throw error; }
            finally { if (currentAddition && currentAddition.row === row && currentAddition.id === playlist) currentAddition = null; }
            if (!alive()) return false;
            var list = root.querySelector('.media-rows[data-playlist-id]');
            var reconciled = false;
            if (list && (action === 'remove' && !history || action === 'playlist' && list.dataset.playlistId === playlist)) {
                try { ui.playlistOrder(list,result,action === 'remove' ? row : null); reconciled = true; }
                catch (error) {
                    list.setAttribute('aria-invalid','true'); list.querySelectorAll('.playlist-grip').forEach(function (grip) { grip.disabled = true; });
                    if (action === 'playlist') markUncertain(row,playlist,error);
                    ui.notice(ui.label('check_playlist'),function () { location.reload(); }); throw error;
                }
            }
            if (action === 'watched' || action === 'unwatched' || (history && action === 'remove')) ui.watched(id,action === 'watched');
            else if (!reconciled && (action === 'remove' || action === 'unsubscribe')) ui.removeRows([row]);
            var box = row.querySelector('[data-select-item]'); if (box) box.checked = false;
            if (action === 'unsubscribe') document.dispatchEvent(new Event('iv:subscriptions-change'));
            return true;
        }
        async function run() {
            if (pending || orderPending || !alive()) return;
            var generation = epoch, chosen = selected(), action = operation.value, playlist = targetPlaylist();
            if (!chosen.length || (action === 'playlist' && (!playlist || chosen.some(function (row) { return isUncertain(row,playlist); })))) return;
            if (['remove','unsubscribe'].includes(action) && !await confirmBatch(chosen.length,operation.selectedOptions[0].textContent)) return;
            if (!alive() || generation !== epoch || pending || orderPending) return;
            feedbackEpoch++; pending = true; root.dispatchEvent(new Event('iv:collection-busy',{bubbles:true})); update(); var done = 0, completed = new Set();
            var watched = ['watched','unwatched'].includes(action) || (history && action === 'remove');
            try {
                for (var row of chosen) {
                    if (!alive() || generation !== epoch) break;
                    if (watched && completed.has(row.dataset.videoId)) { done++; row.querySelector('[data-select-item]').checked = false; continue; }
                    try { if (await perform(row,action,playlist)) { done++; if (watched) completed.add(row.dataset.videoId); } }
                    catch (_) { /* Preserve the failed selection; never retry a write. */ }
                    if (alive() && generation === epoch) ui.status(status,ui.label('progress',{done:done,total:chosen.length}));
                }
                if (alive() && generation === epoch) {
                    document.dispatchEvent(new Event('iv:library-change'));
                    ui.status(status,ui.label('partial',{done:done,failed:chosen.length-done}));
                    if (action === 'playlist' && chosen.some(function (row) { return isUncertain(row,playlist); })) checkLink(playlist);
                }
            } finally {
                if (generation !== epoch) return;
                pending = false;
                if (alive()) { update(); if (document.activeElement === document.body) (apply.disabled ? toggle : apply).focus({preventScroll:true}); }
            }
        }
        on(toggle,'click',function () { if (pending || orderPending) return; feedbackEpoch++; ui.status(status,''); selecting = !selecting; if (!selecting) rows().forEach(function (row) { row.querySelector('[data-select-item]').checked = false; }); update(); if (selecting) root.dispatchEvent(new Event('iv:collection-busy',{bubbles:true})); if (selecting && operation.value === 'playlist') loadPlaylists(); });
        on(toolbar.querySelector('[data-select-all]'),'click',function () { rows().forEach(function (row) { row.querySelector('[data-select-item]').checked = true; }); update(); });
        on(toolbar.querySelector('[data-select-clear]'),'click',function () { rows().forEach(function (row) { row.querySelector('[data-select-item]').checked = false; }); update(); });
        on(operation,'change',function () { feedbackEpoch++; ui.status(status,''); update(); if (operation.value === 'playlist') loadPlaylists(); });
        if (playlists) on(playlists,'change',update);
        on(apply,'click',run);
        on(root,'change',function (event) { if (event.target.matches('[data-select-item]')) update(); });
        on(root,'submit',async function (event) {
            var form = event.target.closest('[data-collection-action]'); if (!form || !root.contains(form)) return;
            event.preventDefault(); if (pending || orderPending || !alive()) return;
            var row = form.closest('.media-item,.subscription-row'), action = form.dataset.collectionAction, playlist = targetPlaylist();
            if (!row || (action === 'playlist' && isUncertain(row,playlist))) return;
            var generation = epoch; feedbackEpoch++; pending = true; root.dispatchEvent(new Event('iv:collection-busy',{bubbles:true})); var submit = event.submitter; if (submit) submit.disabled = true; update();
            try { await perform(row,action,playlist); if (alive() && generation === epoch) { ui.status(status,ui.label('saved')); document.dispatchEvent(new Event('iv:library-change')); } }
            catch (_) { if (alive() && generation === epoch) { ui.status(status,ui.label('error')); if (action === 'playlist' && isUncertain(row,playlist)) checkLink(playlist); } }
            finally { if (generation !== epoch) return; pending = false; if (alive()) { if (submit && submit.isConnected) submit.disabled = action === 'playlist' && isUncertain(row,playlist); update(); if (document.activeElement === document.body) document.getElementById('main-content').focus({preventScroll:true}); } }
        });
        on(document,'iv:content-added',function (event) { if (!root.isConnected) { dispose(); return; } if (!event.detail || root.contains(event.detail)) update(); });
        on(document,'iv:library-change',update);
        on(document,'iv:watched-change',update);
        on(document,'iv:order-pending',function (event) { if (root.contains(event.detail.list)) { orderPending = event.detail.pending; update(); } });
        function cancelReads() { active.forEach(function (controller) { controller.abort(); }); }
        function dispose() { cancelReads(); lifetime.abort(); owners.delete(root); }
        lifetime.signal.addEventListener('abort',cancelReads,{once:true});
        on(window,'browserprofilechange',function () { update(); dispose(); });
        on(window,'pagehide',function (event) {
            activePage = false; epoch++;
            if (currentAddition) markUncertain(currentAddition.row,currentAddition.id,{});
            if (pending) { ui.status(status,ui.label('error')); if (currentAddition) checkLink(currentAddition.id); }
            pending = false; loading = false;
            var dialog = root.querySelector('[data-batch-confirm]'); if (dialog && dialog.open) dialog.close('cancel');
            cancelReads(); update(); if (!event.persisted) dispose();
        });
        on(window,'pageshow',function () { activePage = true; update(); if (selecting && operation.value === 'playlist' && !loaded) loadPlaylists(); });
        update();
    }
    function scan() { document.querySelectorAll('[data-collection]').forEach(start); owners.forEach(function (lifetime,root) { if (!root.isConnected) { lifetime.abort(); owners.delete(root); } }); }
    document.addEventListener('iv:content-added',scan,{signal:page.signal});
    window.addEventListener('pagehide',function (event) { if (!event.persisted) page.abort(); },{signal:page.signal});
    scan();
})();
