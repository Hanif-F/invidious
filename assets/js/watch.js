'use strict';

function toggle_parent(target) {
    var body = target.parentNode.parentNode.children[1];
    if (body.style.display === 'none') {
        target.textContent = '[ − ]';
        body.style.display = '';
    } else {
        target.textContent = '[ + ]';
        body.style.display = 'none';
    }
}

function swap_comments(event) {
    var source = event.target.getAttribute('data-comments');

    if (source === 'youtube') {
        get_youtube_comments();
    } else if (source === 'reddit') {
        get_reddit_comments();
    }
}

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
    if (video_data.plid || !video_data.next_video) return;
    location.assign(playback_url('/watch?v=' + encodeURIComponent(video_data.next_video) + '&continue=1', true));
}

function continue_autoplay(event) {
    player.off('ended', next_video);
    if (event.target.checked && !video_data.plid) player.on('ended', next_video);
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

function get_playlist(plid, removedNotice, focusIndex) {
    var playlist = document.getElementById('playlist');
    if (!playlist) return;
    var request = ++playlist_request;
    var status = document.getElementById('queue-status');
    var retry = document.getElementById('queue-retry');
    var navigation = document.getElementById('queue-navigation');
    if (playlist_ended_handler) player.off('ended', playlist_ended_handler);
    playlist_ended_handler = null;
    playlist.textContent = '';
    playlist.setAttribute('aria-busy', 'true');
    status.textContent = watch_ui.loading;
    retry.hidden = true;
    navigation.hidden = true;
    navigation.textContent = '';
    var mix = plid.startsWith('RD');
    var url = new URL('/api/v1/' + (mix ? 'mixes/' : 'playlists/') + encodeURIComponent(plid), location.origin);
    if (video_data.playlist_current_removed) url.searchParams.set('current_removed', '1');
    else url.searchParams.set('continuation', video_data.id);
    if (!mix && video_data.index !== null && video_data.index !== undefined)
        url.searchParams.set('index', video_data.index);
    url.searchParams.set('format', 'html');
    url.searchParams.set('hl', video_data.preferences.locale);
    if (video_data.params.listen) url.searchParams.set('listen', '1');

    function failed() {
        if (request !== playlist_request) return;
        playlist.setAttribute('aria-busy', 'false');
        status.textContent = watch_ui.queue_error;
        retry.hidden = false;
    }
    retry.onclick = function () { get_playlist(plid); };
    helpers.xhr('GET', url.pathname + url.search, {retries: 3, entity_name: 'playlist'}, {
        on200: function (response) {
            if (request !== playlist_request) return;
            if (!response || typeof response.playlistHtml !== 'string') { failed(); return; }
            playlist.innerHTML = response.playlistHtml;
            playlist.setAttribute('aria-busy', 'false');
            var notice = removedNotice ? watch_ui.queue_removed + ' ' : '';
            status.textContent = notice;
            var metadata = playlist.querySelector('.queue-metadata');
            if (metadata) {
                document.getElementById('queue-title').textContent = metadata.dataset.title;
                var count = metadata.dataset.count;
                document.getElementById('queue-count').textContent = count ? count + ' · ' : '';
            }
            var rows = Array.from(playlist.querySelectorAll('.queue-row'));
            var sameVideo = rows.filter(function (row) { return row.dataset.videoId === video_data.id; });
            var currentIndex = response.currentIndex === undefined ? video_data.index : response.currentIndex;
            var current = video_data.playlist_current_removed ? null : sameVideo.find(function (row) { return row.dataset.index === String(currentIndex); });
            if (!video_data.playlist_current_removed && !current && sameVideo.length === 1) current = sameVideo[0];
            if (current) video_data.index = Number(current.dataset.index);
            rows.forEach(function (row) {
                var link = row.querySelector('a');
                link.href = playback_url(link.getAttribute('href'), false);
                if (row.dataset.removeIndex && video_data.csrf_token) {
                    var remove = document.createElement('button');
                    remove.type = 'button';
                    remove.className = 'queue-remove';
                    remove.title = watch_ui.queue_remove;
                    remove.setAttribute('aria-label', watch_ui.queue_remove + ': ' + row.querySelector('.queue-title').textContent);
                    var icon = document.createElement('i');
                    icon.className = 'icon ion-md-trash';
                    icon.setAttribute('aria-hidden', 'true');
                    remove.appendChild(icon);
                    remove.onclick = function () { remove_queue_item(row, plid); };
                    row.appendChild(remove);
                }
            });
            if (current) {
                current.querySelector('a').setAttribute('aria-current', 'true');
                var marker = document.createElement('span');
                marker.className = 'queue-playing';
                marker.textContent = watch_ui.now_playing;
                current.querySelector('.queue-title').appendChild(marker);
                reveal_current_queue_item();
            }
            function add_navigation(href, label, kind) {
                var link = document.createElement('a');
                link.className = 'pure-button';
                link.dataset.direction = kind;
                link.href = href;
                link.textContent = label;
                navigation.appendChild(link);
                navigation.hidden = false;
            }
            if (current || video_data.playlist_current_removed) {
                var previous = rows.filter(function (row) {
                    return Number(row.dataset.index) < Number(video_data.index) && row.dataset.unavailable !== 'true';
                }).pop();
                if (previous) add_navigation(previous.querySelector('a').href, watch_ui.previous, 'previous');
            }
            if (focusIndex !== undefined) {
                var focusRow = rows.find(function (row) { return Number(row.dataset.index) >= focusIndex; }) || rows[rows.length - 1];
                if (focusRow) (focusRow.querySelector('.queue-remove') || focusRow.querySelector('a')).focus({ preventScroll: true });
                else document.getElementById('queue-title').focus({ preventScroll: true });
            }
            if (!rows.length) status.textContent = notice + watch_ui.queue_empty;
            else if (!response.nextVideo) status.textContent = notice + watch_ui.queue_end;
            if (!response.nextVideo) return;
            var next = new URL('/watch', location.origin);
            next.searchParams.set('v', response.nextVideo);
            next.searchParams.set('list', plid);
            if (!mix && response.index !== null && response.index !== undefined)
                next.searchParams.set('index', response.index);
            add_navigation(playback_url(next.href, false), watch_ui.next, 'next');
            playlist_ended_handler = function () { location.assign(playback_url(next.href, true)); };
            player.on('ended', playlist_ended_handler);
            if (removedNotice && player.ended && player.ended()) playlist_ended_handler();
        },
        onNon200: failed,
        onTotalFail: failed
    });
}

// Remove the stable occurrence ID, never the video ID or its displayed position.
// The current video keeps playing even when its own occurrence is removed.
function remove_queue_item(row, plid) {
    if (playlist_mutating || !row.dataset.removeIndex) return;
    playlist_mutating = true;
    var list = document.getElementById('playlist');
    var status = document.getElementById('queue-status');
    var buttons = list.querySelectorAll('.queue-remove');
    buttons.forEach(function (button) { button.disabled = true; });
    var oldHandler = playlist_ended_handler;
    if (oldHandler) player.off('ended', oldHandler);
    var removedIndex = Number(row.dataset.index);
    var url = '/playlist_ajax?action=remove_video&redirect=false&playlist_id=' + encodeURIComponent(plid) +
        '&set_video_id=' + encodeURIComponent(row.dataset.removeIndex);
    function failed() {
        playlist_mutating = false;
        buttons.forEach(function (button) { button.disabled = false; });
        status.textContent = watch_ui.queue_remove_error;
        if (oldHandler) {
            player.on('ended', oldHandler);
            if (player.ended && player.ended()) oldHandler();
        }
    }
    helpers.xhr('POST', url, { payload: new URLSearchParams({ csrf_token: video_data.csrf_token }).toString() }, {
        on200: function () {
            var currentIndex = Number(video_data.index);
            if (removedIndex < currentIndex) currentIndex--;
            else if (removedIndex === currentIndex) video_data.playlist_current_removed = true;
            video_data.index = Math.max(0, currentIndex);
            var currentUrl = new URL(location.href);
            currentUrl.searchParams.set('index', String(video_data.index));
            if (video_data.playlist_current_removed) currentUrl.searchParams.set('playlist_current_removed', '1');
            history.replaceState(null, '', currentUrl.pathname + currentUrl.search + currentUrl.hash);
            playlist_mutating = false;
            get_playlist(plid, true, removedIndex);
        },
        onNon200: failed,
        onError: failed,
        onTimeout: failed
    });
}

var queue_toggle = document.getElementById('queue-toggle');
if (queue_toggle) {
    queue_toggle.onclick = function () {
        var panel = document.getElementById('playlist-panel');
        var expanded = panel.dataset.expanded !== 'true';
        panel.dataset.expanded = expanded;
        queue_toggle.setAttribute('aria-expanded', expanded);
        queue_toggle.textContent = expanded ? watch_ui.hide_queue : watch_ui.show_queue;
        if (expanded) reveal_current_queue_item();
    };
    var queue_viewport_width = window.innerWidth;
    window.addEventListener('resize', function () {
        // Mobile browser chrome changes height during scrolling; preserve the user's place.
        if (window.innerWidth === queue_viewport_width) return;
        queue_viewport_width = window.innerWidth;
        reveal_current_queue_item();
    });
}

function get_reddit_comments() {
    var comments = document.getElementById('comments');

    var fallback = comments.innerHTML;
    comments.innerHTML = spinnerHTML;

    var url = '/api/v1/comments/' + video_data.id +
        '?source=reddit&format=html' +
        '&hl=' + video_data.preferences.locale;

    var onNon200 = function (xhr) { comments.innerHTML = fallback; };
    if (video_data.params.comments[1] === 'youtube')
        onNon200 = function (xhr) {};

    helpers.xhr('GET', url, {retries: 5, entity_name: ''}, {
        on200: function (response) {
            comments.innerHTML = ' \
            <div> \
                <h3> \
                    <a href="javascript:void(0)">[ − ]</a> \
                    {title} \
                </h3> \
                <p> \
                    <b> \
                        <a href="javascript:void(0)" data-comments="youtube"> \
                            {youtubeCommentsText} \
                        </a> \
                    </b> \
                </p> \
                <b> \
                    <a rel="noopener noreferrer" target="_blank" href="https://reddit.com{permalink}">{redditPermalinkText}</a> \
                </b> \
            </div> \
            <div>{contentHtml}</div> \
            <hr>'.supplant({
                title: response.title,
                youtubeCommentsText: video_data.youtube_comments_text,
                redditPermalinkText: video_data.reddit_permalink_text,
                permalink: response.permalink,
                contentHtml: response.contentHtml
            });

            comments.children[0].children[0].children[0].onclick = toggle_comments;
            comments.children[0].children[1].children[0].onclick = swap_comments;
        },
        onNon200: onNon200, // declared above
    });
}

if (video_data.play_next && !video_data.plid) player.on('ended', next_video);

addEventListener('load', function (e) {
    if (video_data.plid)
        get_playlist(video_data.plid);

    if (!video_data.comments_enabled && video_data.params.comments.includes("youtube")) {
        return;
    }

    if (video_data.params.comments[0] === 'youtube') {
        get_youtube_comments();
    } else if (video_data.params.comments[0] === 'reddit') {
        get_reddit_comments();
    } else if (video_data.params.comments[1] === 'youtube') {
        get_youtube_comments();
    } else if (video_data.params.comments[1] === 'reddit') {
        get_reddit_comments();
    }
});

var reddit_link = document.getElementById('try-reddit-comments-link');
if (reddit_link) reddit_link.onclick = swap_comments;

document.getElementById('share-video').onclick = function () {
    var url = new URL(location.href);
    url.searchParams.set('t', Math.floor(player.currentTime() || 0));
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

// Load the transcript implementation only after it is opened.
var transcript_panel = document.getElementById('transcript-panel');
if (transcript_panel) {
    var transcript_loading = false;
    var transcript_initialized = false;
    function load_transcript_script() {
        if (!transcript_panel.open || transcript_loading || transcript_initialized) return;
        transcript_loading = true;
        var script = document.createElement('script');
        script.src = watch_ui.transcript_script;
        script.onload = function () {
            transcript_loading = false;
            transcript_initialized = true;
            window.InvidiousTranscript(transcript_panel, video_data, watch_ui);
        };
        script.onerror = function () {
            transcript_loading = false;
            script.remove();
            document.getElementById('transcript-status').textContent = watch_ui.transcript_error;
            var retry = document.getElementById('transcript-retry');
            retry.hidden = false;
            retry.onclick = load_transcript_script;
        };
        document.head.appendChild(script);
    }
    transcript_panel.addEventListener('toggle', load_transcript_script);
}

// Use only a consecutive, increasing series of description timestamps.
(function () {
    var description = document.getElementById('descriptionWrapper');
    if (!description) return;
    var clone = description.cloneNode(true);
    clone.querySelectorAll('br').forEach(function (br) { br.replaceWith(document.createTextNode('\n')); });
    clone.querySelectorAll('p, div').forEach(function (node) { node.appendChild(document.createTextNode('\n')); });
    var entries = [];
    clone.textContent.split('\n').forEach(function (line) {
        var match = line.trim().match(/^(\d{1,2}:)?(\d{1,2}):(\d{2})\s+[-–—]?\s*(\S.*)$/);
        if (!match) return;
        var seconds = (match[1] ? parseInt(match[1], 10) * 3600 : 0) + Number(match[2]) * 60 + Number(match[3]);
        if (Number(match[3]) >= 60 || (match[1] && Number(match[2]) >= 60)) return;
        if (seconds >= video_data.length_seconds || (entries.length && seconds <= entries[entries.length - 1].seconds)) return;
        entries.push({seconds: seconds, label: line.trim()});
    });
    if (entries.length < 2) return;
    var list = document.getElementById('timestamp-list');
    entries.forEach(function (entry) {
        var item = document.createElement('li');
        var link = document.createElement('a');
        var url = new URL(location.href);
        url.searchParams.set('t', entry.seconds);
        link.href = url.pathname + url.search;
        link.textContent = entry.label;
        link.onclick = function (event) { event.preventDefault(); player.currentTime(entry.seconds); };
        item.appendChild(link);
        list.appendChild(item);
    });
    document.getElementById('timestamp-panel').hidden = false;
})();
