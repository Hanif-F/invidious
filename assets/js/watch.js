'use strict';

var watch_ui = JSON.parse(document.getElementById('watch_ui_data').textContent);
var playlist_ended_handler;
var playlist_request = 0;
var playlist_mutating = false;

// Keep ordinary navigation and playlist advancement on the existing playback settings.
function playback_url(url, advancing) {
    var target = new URL(url, location.origin);
    ['listen', 'speed', 'local'].forEach(function (key) {
        if (video_data.params[key] !== video_data.preferences[key])
            target.searchParams.set(key, video_data.params[key]);
    });
    if (advancing && (video_data.params.autoplay || video_data.params.continue_autoplay))
        target.searchParams.set('autoplay', '1');
    return target.pathname + target.search;
}

function next_video() {
    if (!watchCurrent() || document.body.dataset.clipEditing === 'true' || video_data.clip || video_data.plid || !video_data.next_video) return;
    location.assign(playback_url('/watch?v=' + encodeURIComponent(video_data.next_video) + '&continue=1', true));
}

function continue_autoplay(event) {
    player.off('ended', next_video);
    if (!video_data.clip && event.target.checked && !video_data.plid) player.on('ended', next_video);
}
var continue_button = document.getElementById('continue');
if (continue_button) continue_button.onclick = continue_autoplay;

function reveal_current_queue_item() {
    var list = document.getElementById('playlist');
    var current = list && list.querySelector('[aria-current="true"]');
    if (current && list.clientHeight) {
        var offset = current.getBoundingClientRect().top - list.getBoundingClientRect().top;
        list.scrollTop += offset - Math.max(0, (list.clientHeight - current.offsetHeight) / 2);
    }
}

var queueLife = new AbortController(), watchActive = true, watchEpoch = 0, queueRead = null, queueWrite = null, queueLoading = false, queueUnavailable = true, queueEnded = false;
var playingOccurrence = video_data.playlist_occurrence || null, pendingOccurrence = null, uncertainRemovals = new Set();
var queueList = document.getElementById('playlist');
if (queueList) queueList.addEventListener('keydown', function (event) {
    if (event.target === queueList && event.key !== 'Escape') event.stopPropagation();
}, {signal:queueLife.signal});
function watchCurrent() { return watchActive && !queueLife.signal.aborted && InvidiousStorage.isCurrent(); }
function stopQueueAdvancement() { if (playlist_ended_handler) player.off('ended',playlist_ended_handler); playlist_ended_handler = null; }
function queuePositions(response) {
    if (!response || response.positions === undefined) return null;
    var positions = response.positions, total = response.total;
    if (!positions || typeof positions !== 'object' || Array.isArray(positions) || !Number.isSafeInteger(total) || total < 0 || Object.keys(positions).length !== total ||
        Object.keys(positions).some(function (id) { return !/^[0-9]{1,19}$/.test(id) || !Number.isSafeInteger(positions[id]) || positions[id] < 1 || positions[id] > total; }) || new Set(Object.values(positions)).size !== total) throw new Error('Invalid playlist positions');
    return positions;
}
function queueURL() {
    var url = new URL(location.href);
    if (Number.isSafeInteger(video_data.index)) url.searchParams.set('index',String(video_data.index));
    if (playingOccurrence) url.searchParams.set('occurrence',playingOccurrence);
    if (video_data.playlist_current_removed) url.searchParams.set('playlist_current_removed','1'); else url.searchParams.delete('playlist_current_removed');
    history.replaceState(history.state,'',url.pathname+url.search+url.hash);
}
function queueButtons() {
    document.querySelectorAll('#playlist .queue-remove').forEach(function (button) {
        button.disabled = !watchCurrent() || queueLoading || queueUnavailable || playlist_mutating || uncertainRemovals.size > 0;
    });
}
async function readQueue(url, signal) {
    for (var attempt = 0; attempt < 3; attempt++) {
        try { return await InvidiousUI.request(url,{signal:signal}); }
        catch (error) { if (signal.aborted || !watchCurrent() || attempt === 2 || error.status >= 400 && error.status < 500) throw error; }
    }
}
async function get_playlist(plid, removedNotice, focusIndex) {
    var playlist = document.getElementById('playlist');
    if (!playlist || !watchCurrent()) return;
    if (queueRead) queueRead.abort();
    var controller = new AbortController(); queueRead = controller;
    var request = ++playlist_request, epoch = watchEpoch;
    var status = document.getElementById('queue-status'), retry = document.getElementById('queue-retry'), navigation = document.getElementById('queue-navigation');
    stopQueueAdvancement(); queueLoading = true; queueButtons(); playlist.setAttribute('aria-busy','true'); status.textContent = watch_ui.loading;
    retry.hidden = true; retry.textContent = watch_ui.retry; retry.onclick = function () { get_playlist(plid); }; navigation.hidden = true; navigation.replaceChildren();
    var mix = plid.startsWith('RD'), url = new URL('/api/v1/'+(mix ? 'mixes/' : 'playlists/')+encodeURIComponent(plid),location.origin);
    url.searchParams.set('format','html'); url.searchParams.set('ui','desktop'); url.searchParams.set('hl',video_data.preferences.locale);
    if (video_data.playlist_current_removed) url.searchParams.set('current_removed','1'); else url.searchParams.set('continuation',video_data.id);
    if (!mix && Number.isSafeInteger(video_data.index)) url.searchParams.set('index',String(video_data.index));
    if (!mix && playingOccurrence) url.searchParams.set('occurrence',playingOccurrence);
    if (video_data.params.listen) url.searchParams.set('listen','1');
    function current() { return watchCurrent() && epoch === watchEpoch && request === playlist_request && playlist.isConnected; }
    try {
        var response = await readQueue(url.pathname+url.search,controller.signal);
        if (!current()) return;
        if (!response || typeof response.playlistHtml !== 'string') throw new Error('Invalid queue');
        var positions = queuePositions(response);
        if (response.currentOccurrence !== undefined && response.currentOccurrence !== null && (typeof response.currentOccurrence !== 'string' || !/^[0-9]{1,19}$/.test(response.currentOccurrence))) throw new Error('Invalid current occurrence');
        if (response.currentRemoved !== undefined && typeof response.currentRemoved !== 'boolean') throw new Error('Invalid removed state');
        if (response.nextVideo && (typeof response.nextVideo !== 'string' || !/^[A-Za-z0-9_-]{11}$/.test(response.nextVideo))) throw new Error('Invalid next video');
        if (response.currentOccurrence) playingOccurrence = response.currentOccurrence;
        if (response.currentRemoved !== undefined) video_data.playlist_current_removed = response.currentRemoved === true;
        if (positions) {
            uncertainRemovals.forEach(function (id) { if (!Object.prototype.hasOwnProperty.call(positions,id)) uncertainRemovals.delete(id); });
            if (playingOccurrence && Object.prototype.hasOwnProperty.call(positions,playingOccurrence)) {
                video_data.index = positions[playingOccurrence]-1; video_data.playlist_current_removed = false;
            } else if (playingOccurrence) video_data.playlist_current_removed = true;
        } else if (Number.isSafeInteger(response.currentIndex)) video_data.index = response.currentIndex;
        playlist.innerHTML = response.playlistHtml; queueUnavailable = false;
        var metadata = playlist.querySelector('.queue-metadata');
        if (metadata) {
            document.getElementById('queue-title').textContent = metadata.dataset.title;
            document.getElementById('queue-count').textContent = metadata.dataset.count ? metadata.dataset.count+' · ' : '';
        }
        var rows = Array.from(playlist.querySelectorAll('.queue-row')), sameVideo = rows.filter(function (row) { return row.dataset.videoId === video_data.id; });
        playlist.hidden = rows.length === 0;
        var currentRow = !video_data.playlist_current_removed && (playingOccurrence ? sameVideo.find(function (row) { return row.dataset.occurrence === playingOccurrence; }) : sameVideo.find(function (row) { return row.dataset.index === String(video_data.index); }));
        if (!playingOccurrence && !video_data.playlist_current_removed && !currentRow && sameVideo.length === 1) currentRow = sameVideo[0];
        if (currentRow) {
            video_data.index = Number(currentRow.dataset.index);
            if (currentRow.dataset.occurrence) playingOccurrence = currentRow.dataset.occurrence;
            currentRow.querySelector('a').setAttribute('aria-current','true');
            var marker = document.createElement('span'); marker.className = 'queue-playing'; marker.textContent = watch_ui.now_playing; currentRow.querySelector('.queue-title').after(marker);
        }
        rows.forEach(function (row) {
            var link = row.querySelector('a'); link.href = playback_url(link.getAttribute('href'),false);
            if (row.dataset.removeIndex && video_data.csrf_token) {
                var remove = document.createElement('button'); remove.type = 'button'; remove.className = 'queue-remove icon-button';
                remove.title = watch_ui.queue_remove; remove.setAttribute('aria-label',watch_ui.queue_remove);
                if (window.InvidiousPlayerInterface) remove.append(InvidiousPlayerInterface.icon('trash-2')); else remove.textContent = watch_ui.queue_remove;
                remove.onclick = function () { remove_queue_item(row,plid); }; row.append(remove);
            }
        });
        queueURL(); InvidiousUI.changed(playlist);
        var notice = removedNotice || video_data.playlist_current_removed ? watch_ui.queue_removed+' ' : '';
        status.textContent = notice;
        function navigationLink(href,label,kind) { var link = document.createElement('a'); link.className = 'button'; link.dataset.direction = kind; link.href = href; link.textContent = label; navigation.append(link); navigation.hidden = false; }
        if (currentRow || video_data.playlist_current_removed) {
            var previous = rows.filter(function (row) { return Number(row.dataset.index) < Number(video_data.index) && row.dataset.unavailable !== 'true'; }).pop();
            if (previous) navigationLink(previous.querySelector('a').href,watch_ui.previous,'previous');
        }
        if (!rows.length) status.textContent = notice+(metadata && Number(metadata.dataset.count) > 0 ? watch_ui.queue_filtered_empty || watch_ui.queue_empty : watch_ui.queue_empty);
        else if (!response.nextVideo) status.textContent = notice+watch_ui.queue_end;
        if (uncertainRemovals.size) { status.textContent = watch_ui.queue_uncertain || watch_ui.queue_remove_error; retry.textContent = watch_ui.queue_refresh || watch_ui.retry; retry.hidden = false; }
        if (focusIndex !== undefined) {
            var focusRow = rows.find(function (row) { return Number(row.dataset.index) >= focusIndex; }) || rows[rows.length-1];
            if (focusRow) focusRow.querySelector('a').focus({preventScroll:true}); else document.getElementById('queue-title').focus({preventScroll:true});
        }
        if (currentRow) reveal_current_queue_item();
        if (response.nextVideo) {
            if (!/^[A-Za-z0-9_-]{11}$/.test(response.nextVideo)) throw new Error('Invalid next video');
            var next = new URL('/watch',location.origin); next.searchParams.set('v',response.nextVideo); next.searchParams.set('list',plid);
            if (!mix && Number.isSafeInteger(response.index)) next.searchParams.set('index',String(response.index));
            if (positions && Number.isSafeInteger(response.index)) {
                var nextOccurrence = Object.keys(positions).find(function (id) { return positions[id] === response.index+1; });
                if (nextOccurrence) next.searchParams.set('occurrence',nextOccurrence);
            }
            navigationLink(playback_url(next.href,false),watch_ui.next,'next');
            if (!uncertainRemovals.size) {
                playlist_ended_handler = function () { if (watchCurrent() && document.body.dataset.clipEditing !== 'true' && epoch === watchEpoch && !queueLoading && !playlist_mutating) location.assign(playback_url(next.href,true)); };
                player.on('ended',playlist_ended_handler);
            }
        }
    } catch (error) {
        if (!current()) return;
        queueUnavailable = true; stopQueueAdvancement(); status.textContent = watch_ui.queue_error; retry.hidden = false;
    } finally {
        if (current()) {
            queueLoading = false; queueRead = null; playlist.setAttribute('aria-busy','false'); queueButtons();
            if ((removedNotice || queueEnded) && !queueUnavailable && !uncertainRemovals.size && playlist_ended_handler && player.ended && player.ended()) { queueEnded = false; playlist_ended_handler(); }
        }
    }
}
async function remove_queue_item(row,plid) {
    if (!watchCurrent() || playlist_mutating || queueLoading || queueUnavailable || uncertainRemovals.size || !row.dataset.removeIndex) return;
    var epoch = watchEpoch, occurrence = row.dataset.removeIndex, removedIndex = Number(row.dataset.index), status = document.getElementById('queue-status');
    playlist_mutating = true; pendingOccurrence = occurrence; stopQueueAdvancement(); queueButtons();
    var controller = new AbortController(); queueWrite = controller;
    try {
        var response = await InvidiousUI.request('/playlist_ajax?action=remove_video&redirect=false&playlist_id='+encodeURIComponent(plid)+'&set_video_id='+encodeURIComponent(occurrence),{method:'POST',body:new URLSearchParams({csrf_token:video_data.csrf_token,include_positions:'1'}),signal:controller.signal});
        if (!watchCurrent() || epoch !== watchEpoch) return;
        var positions = queuePositions(response), index = Number(video_data.index);
        if (positions && playingOccurrence && positions[playingOccurrence]) index = positions[playingOccurrence]-1;
        else if (playingOccurrence === occurrence || removedIndex === index) video_data.playlist_current_removed = true;
        else if (removedIndex < index) index--;
        video_data.index = Math.max(0,index); queueURL();
        playlist_mutating = false; pendingOccurrence = null; queueWrite = null;
        await get_playlist(plid,true,removedIndex);
    } catch (error) {
        if (!watchCurrent() || epoch !== watchEpoch) return;
        uncertainRemovals.add(occurrence); status.textContent = watch_ui.queue_uncertain || watch_ui.queue_remove_error;
        var retry = document.getElementById('queue-retry'); retry.textContent = watch_ui.queue_refresh || watch_ui.retry; retry.hidden = false; retry.onclick = function () { get_playlist(plid); };
    } finally {
        if (watchCurrent() && epoch === watchEpoch) { playlist_mutating = false; pendingOccurrence = null; queueWrite = null; queueButtons(); }
    }
}
function suspendWatch(event) {
    if (playlist_mutating && pendingOccurrence) uncertainRemovals.add(pendingOccurrence);
    watchActive = false; watchEpoch++; playlist_request++; if (queueRead) queueRead.abort(); if (queueWrite) queueWrite.abort();
    queueRead = queueWrite = null; queueLoading = false; queueUnavailable = true; playlist_mutating = false; pendingOccurrence = null; stopQueueAdvancement(); queueButtons();
    if (!event || !event.persisted) queueLife.abort();
}
window.addEventListener('pagehide',suspendWatch,{signal:queueLife.signal});
window.addEventListener('browserprofilechange',function () { suspendWatch(); },{signal:queueLife.signal});
window.addEventListener('pageshow',function (event) {
    watchActive = !queueLife.signal.aborted;
    if (event.persisted && watchCurrent() && video_data.plid) {
        get_playlist(video_data.plid);
    }
},{signal:queueLife.signal});
player.on('ended',function () { if (document.body.dataset.clipEditing !== 'true' && video_data.plid && (queueLoading || playlist_mutating || uncertainRemovals.size)) queueEnded = true; });
player.on('dispose',function () { suspendWatch(); });

if (!video_data.clip && video_data.play_next && !video_data.plid) player.on('ended', next_video);

addEventListener('load', function () { if (video_data.plid) get_playlist(video_data.plid); });

document.getElementById('share-video').onclick = function () {
    var url = new URL(video_data.clip && video_data.clip.url ? video_data.clip.url : location.href, location.origin);
    if (!video_data.clip) url.searchParams.set('t', Math.floor(player.currentTime() || 0));
    var status = document.getElementById('share-status');
    function fallback() {
        document.getElementById('share-fallback').hidden = false;
        var input = document.getElementById('share-url');
        input.value = url.href;
        input.focus();
        input.select();
    }
    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(url.href).then(function () {
            status.textContent = watch_ui.copied;
        }, fallback);
    } else fallback();
};

var watchLayout = document.getElementById('watch-layout');
var watchSidebar = document.getElementById('watch-sidebar');
var watchTools = document.getElementById('watch-tools');
var transcript_panel = document.getElementById('transcript-panel');
var transcriptToggle = document.getElementById('transcript-toggle');

function updateWatchSidebar(widthChanged) {
    var visible = watchTools.hidden || !!watchTools.querySelector('.watch-tool:not([hidden])');
    var resized = watchSidebar.hidden === visible;
    watchSidebar.hidden = !visible;
    watchLayout.classList.toggle('watch-no-tools', !visible);
    watchTools.dispatchEvent(new Event('iv:watch-tools-visibility', {bubbles:true}));
    if ((resized || widthChanged) && !(player.isDisposed && player.isDisposed())) player.trigger('playerresize');
}

// Restore the watch sections after the clip session restores the player.
(function () {
    var panel = document.getElementById('tool-clip-editor'), trigger = document.getElementById('create-clip'), scrollPositions = null;
    if (!panel || !trigger) return;
    function open() {
        if (scrollPositions || !watchCurrent()) return false;
        scrollPositions = Array.from(watchTools.querySelectorAll('#transcript-lines, #timestamp-list, #chat-messages, #playlist'), function (list) {
            return [list, list.scrollTop];
        });
        watchTools.hidden = true;
        panel.hidden = false;
        watchLayout.classList.add('watch-clip-open');
        if (transcriptToggle) transcriptToggle.disabled = true;
        trigger.setAttribute('aria-controls',panel.id);
        trigger.setAttribute('aria-expanded','true');
        updateWatchSidebar(true);
        panel.scrollIntoView({block:'nearest'});
        return true;
    }
    function close(focus) {
        if (!scrollPositions) return;
        panel.hidden = true;
        watchTools.hidden = false;
        watchLayout.classList.remove('watch-clip-open');
        if (transcriptToggle) transcriptToggle.disabled = false;
        trigger.setAttribute('aria-expanded','false');
        updateWatchSidebar(true);
        scrollPositions.forEach(function (position) {
            if (position[0].getClientRects().length) position[0].scrollTop = position[1];
        });
        scrollPositions = null;
        if (focus !== false && watchCurrent()) trigger.focus();
    }
    window.InvidiousWatchClipPanel = {open:open,close:close};
})();

// Load utility readers deliberately; loading/cached-page lifetimes stay local.
if (transcript_panel) {
    (function () {
        var life = new AbortController(), owner = null, script = null, loading = false, token = 0;
        var menu = transcriptToggle.closest('details'), heading = document.getElementById('transcript-heading');
        function visible() {
            return watchCurrent() && transcript_panel.getClientRects().length > 0;
        }
        function failed() {
            document.getElementById('transcript-status').textContent = watch_ui.transcript_error;
            var retry = document.getElementById('transcript-retry'); retry.hidden = false; retry.onclick = start;
        }
        function start() {
            if (!visible() || loading || life.signal.aborted) return;
            if (owner) { owner.setVisible(true); return; }
            if (typeof window.InvidiousTranscript === 'function') {
                document.getElementById('transcript-retry').onclick = null;
                owner = window.InvidiousTranscript(transcript_panel,video_data,watch_ui); return;
            }
            loading = true; var issued = ++token, epoch = watchEpoch;
            document.getElementById('transcript-status').textContent = watch_ui.loading;
            document.getElementById('transcript-retry').hidden = true;
            script = document.createElement('script'); script.src = watch_ui.transcript_script;
            script.onload = function () {
                if (issued !== token || life.signal.aborted || !watchCurrent() || epoch !== watchEpoch) return;
                loading = false; script.remove(); script = null;
                if (typeof window.InvidiousTranscript !== 'function') { if (visible()) failed(); return; }
                if (visible()) start();
            };
            script.onerror = function () {
                if (issued !== token || life.signal.aborted || !watchCurrent() || epoch !== watchEpoch) return;
                loading = false; script.remove(); script = null; if (visible()) failed();
            };
            document.head.append(script);
        }
        function setOpen(opening) {
            if (!watchCurrent() || watchTools.hidden) return;
            transcript_panel.hidden = !opening;
            transcriptToggle.setAttribute('aria-expanded', String(opening));
            menu.open = false;
            updateWatchSidebar();
            (opening ? heading : menu.querySelector('summary')).focus();
        }
        transcriptToggle.addEventListener('click', function () {
            setOpen(transcript_panel.hidden);
        }, {signal:life.signal});
        document.getElementById('transcript-close').addEventListener('click', function () {
            setOpen(false);
        }, {signal:life.signal});
        watchTools.addEventListener('iv:watch-tools-visibility',function () {
            if (visible()) start(); else if (owner) owner.setVisible(false);
        },{signal:life.signal});
        window.addEventListener('pagehide',function (event) {
            token++; loading = false;
            if (script) { script.onload = script.onerror = null; script.remove(); script = null; }
            if (!event.persisted) { life.abort(); if (owner) owner.dispose(); }
        },{signal:life.signal});
        window.addEventListener('pageshow',function () { if (visible()) start(); },{signal:life.signal});
        window.addEventListener('browserprofilechange',function () { token++; life.abort(); if (script) script.remove(); if (owner) owner.dispose(); },{signal:life.signal});
    })();
}

(function () {
    var panel = document.getElementById('timestamp-panel');
    if (!panel || !player.invidiousChapters) return;

    var root = player.el(), heading = document.getElementById('timestamp-heading');
    var list = document.getElementById('timestamp-list');
    var toggle = document.getElementById('timestamp-toggle-template').content.firstElementChild.cloneNode(true);
    var sidebarPosition = document.createComment('Timestamps sidebar position');
    panel.before(sidebarPosition);
    var life = new AbortController(), expanded = false;
    var entries, active;

    function syncVisibility() {
        toggle.disabled = watchTools.hidden;
        panel.hidden = !expanded || toggle.disabled;
        toggle.setAttribute('aria-expanded', String(!panel.hidden));
        root.classList.toggle('timestamps-fullscreen-open', panel.parentNode === root && !panel.hidden);
    }
    function setOpen(open, moveFocus) {
        expanded = open;
        syncVisibility();
        updateWatchSidebar();
        if (!moveFocus) return;
        if (open) {
            if (active) {
                var row = active.getBoundingClientRect(), viewport = list.getBoundingClientRect();
                if (row.top < viewport.top || row.bottom > viewport.bottom) list.scrollTop += row.top - viewport.top;
            }
            if (panel.parentNode === root) heading.focus({preventScroll: true});
            else if (matchMedia('(max-width: 959px)').matches) {
                heading.focus({preventScroll: true});
                panel.scrollIntoView({block: 'start'});
            } else heading.focus();
        } else {
            player.userActive(true);
            player.reportUserActivity();
            toggle.focus();
        }
    }
    function placePanel() {
        var fullscreen = document.fullscreenElement || document.webkitFullscreenElement;
        var inPlayer = player.isFullWindow || (fullscreen && fullscreen.contains(root));
        if (!!inPlayer === (panel.parentNode === root)) return;
        var scroll = list.scrollTop;
        var focus = panel.contains(document.activeElement) ? document.activeElement : null;
        if (inPlayer) root.append(panel);
        else sidebarPosition.after(panel);
        syncVisibility();
        updateWatchSidebar();
        list.scrollTop = scroll;
        if (focus && !panel.hidden) focus.focus({preventScroll: true});
    }
    function updateChapters(chapters, index) {
        if (entries !== chapters) {
            entries = chapters;
            active = null;
            var url = new URL(location.href);
            var rows = chapters.map(function (chapter) {
                var row = document.createElement('li');
                var link = document.createElement('a');
                var time = document.createElement('time');
                var title = document.createElement('span');
                url.searchParams.set('t', chapter.start);
                link.href = url.pathname + url.search;
                link.dataset.chapterStart = chapter.start;
                time.dateTime = 'PT' + chapter.start + 'S';
                time.textContent = videojs.formatTime(chapter.start, video_data.length_seconds);
                title.textContent = chapter.title;
                title.dir = 'auto';
                link.append(time, title);
                row.append(link);
                return row;
            });
            list.replaceChildren(...rows);
            if (!chapters.length && expanded) setOpen(false, false);
        }
        var row = list.children[index];
        var current = row ? row.firstElementChild : null;
        if (active === current) return;
        if (active) active.removeAttribute('aria-current');
        if (current) current.setAttribute('aria-current', 'true');
        active = current;
    }

    toggle.addEventListener('click', function () {
        if (watchCurrent() && !toggle.disabled) setOpen(!expanded, true);
    }, {signal: life.signal});
    document.getElementById('timestamp-close').addEventListener('click', function () {
        if (watchCurrent()) setOpen(false, true);
    }, {signal: life.signal});
    list.addEventListener('click', function (event) {
        var link = event.target.closest('a[data-chapter-start]');
        if (!link || event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || !watchCurrent()) return;
        event.preventDefault();
        player.currentTime(Number(link.dataset.chapterStart));
    }, {signal: life.signal});
    panel.addEventListener('keydown', function (event) {
        if (event.key !== 'Escape') event.stopPropagation();
    }, {signal: life.signal});
    watchTools.addEventListener('iv:watch-tools-visibility', syncVisibility, {signal: life.signal});
    document.addEventListener('fullscreenchange', placePanel, {signal: life.signal});
    player.on(['fullscreenchange', 'enterFullWindow', 'exitFullWindow'], placePanel);
    player.on('dispose', function () {
        life.abort();
        player.off(['fullscreenchange', 'enterFullWindow', 'exitFullWindow'], placePanel);
        sidebarPosition.after(panel);
        setOpen(false, false);
    });
    player.invidiousChapters.attachPanel(toggle, heading.textContent.trim(), updateChapters);
    placePanel();
})();

var clipLoop = document.getElementById('clip-loop');
if (clipLoop) clipLoop.addEventListener('change', function () {
    player.loop(clipLoop.checked);
    var listen = document.getElementById('link-iv-listen');
    if (listen) {
        var url = new URL(listen.dataset.baseUrl, location.origin);
        url.searchParams.set('loop', clipLoop.checked ? '1' : '0');
        listen.dataset.baseUrl = url.pathname + url.search;
        listen.href = listen.dataset.baseUrl;
    }
});
