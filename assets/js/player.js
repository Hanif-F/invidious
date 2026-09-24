'use strict';
var player_data = JSON.parse(document.getElementById('player_data').textContent);
var video_data = JSON.parse(document.getElementById('video_data').textContent);
const CONFIG = JSON.parse(document.getElementById('config').textContent);

var options = {
    liveui: true,
    playbackRates: [0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0],
    fontPercent: [0.5, 0.75, 1.25, 1.5, 1.75, 2, 3, 4],
    windowOpacity: ['0', '0.5', '1'],
    textOpacity: ['0.5', '1'],
    persistTextTrackSettings: true,
    controlBar: {
        children: [
            'playToggle',
            'volumePanel',
            'currentTimeDisplay',
            'timeDivider',
            'durationDisplay',
            'progressControl',
            'remainingTimeDisplay',
            'Spacer',
            'captionsButton',
            video_data.params.quality === 'dash' && !video_data.params.listen ? 'richAudioButton' : 'audioTrackButton',
            video_data.params.quality === 'dash' && !video_data.params.listen ? 'richQualityButton' : 'qualitySelector',
            'playbackRateMenuButton',
            'fullscreenToggle'
        ]
    },
    html5: {
        preloadTextTracks: false,
        vhs: {
            overrideNative: true
        }
    }
};

if (player_data.aspect_ratio) {
    options.aspectRatio = player_data.aspect_ratio;
}

var embed_url = new URL(location);
embed_url.searchParams.delete('v');
var short_url = location.origin + '/' + video_data.id + embed_url.search;
embed_url = location.origin + '/embed/' + video_data.id + embed_url.search;

var save_player_pos_key = 'save_player_pos';

videojs.Vhs.xhr.beforeRequest = function(options) {
    // set local if requested not videoplayback
    if (!options.uri.includes('videoplayback')) {
        if (!options.uri.includes('local=true'))
            options.uri += '?local=true';
    }
    return options;
};

// Buffer limits
if (CONFIG.videojs.goal_buffer_length) {
    videojs.Vhs.GOAL_BUFFER_LENGTH = CONFIG.videojs.goal_buffer_length;
}
if (CONFIG.videojs.max_goal_buffer_length) {
    videojs.Vhs.MAX_GOAL_BUFFER_LENGTH = CONFIG.videojs.max_goal_buffer_length;
}

var player = videojs('player', options);
if (video_data.params.controls) player.addClass('vjs-buffer-refreshable');

// Setting a source again disposes Video.js's previous source handler and its
// buffered media. load() alone can keep the old DASH segments around.
var cancelBufferRefreshRestore;
var automaticReloadTimer;
player.refreshBuffer = function () {
    var currentSource = player.currentSource();
    if (!currentSource || !currentSource.src) return;

    clearTimeout(automaticReloadTimer);
    if (cancelBufferRefreshRestore) cancelBufferRefreshRestore();

    var source = currentSource.src;
    var sources = player.currentSources().map(function (entry) {
        return Object.assign({}, entry, {selected: entry.src === source});
    });
    var position = player.currentTime();
    var isLive = !!video_data.live_now || player.duration() === Infinity ||
        (player.liveTracker && player.liveTracker.isLive());
    var wasPlaying = !player.paused() || !!player.error();
    var hadStarted = player.hasStarted();
    var rate = player.playbackRate();
    var volume = player.volume();
    var muted = player.muted();
    var oldLevels = Array.from(player.qualityLevels ? player.qualityLevels() : []);
    var quality = oldLevels.length ? {
        auto: oldLevels.every(function (level) { return level.enabled; }),
        selected: oldLevels.filter(function (level) { return level.enabled; }).map(function (level) {
            return {id: level.id, height: level.height, bitrate: level.bitrate};
        })
    } : null;
    var audio = Array.from(player.audioTracks()).find(function (track) { return track.enabled; });
    var selectedAudio = audio && {id: audio.id, label: audio.label, language: audio.language};
    var caption = Array.from(player.textTracks()).find(function (track) {
        return (track.kind === 'captions' || track.kind === 'subtitles') && track.mode === 'showing';
    });
    var selectedCaption = caption && {id: caption.id, label: caption.label, language: caption.language};
    var levels = player.qualityLevels ? player.qualityLevels() : null;
    var audioTracks = player.audioTracks();
    var textTracks = player.textTracks();
    var metadataLoaded = false;
    var qualityRestored = !quality;
    var audioRestored = !selectedAudio;
    var captionsRestored = !selectedCaption;
    var timeout;

    function matches(track, selected) {
        if (selected.id && track.id) return track.id === selected.id;
        return track.label === selected.label && track.language === selected.language;
    }

    function restoreQuality() {
        if (!quality || !levels || !levels.length) return;
        var available = Array.from(levels);
        if (quality.auto) {
            available.forEach(function (level) { level.enabled = true; });
            qualityRestored = true;
            return;
        }
        var matching = available.filter(function (level) {
            return quality.selected.some(function (wanted) {
                return wanted.id != null && level.id === wanted.id ||
                    level.height === wanted.height && level.bitrate === wanted.bitrate;
            });
        });
        if (!matching.length) return;
        available.forEach(function (level) { level.enabled = matching.includes(level); });
        qualityRestored = true;
    }

    function restoreAudio() {
        if (audioRestored) return;
        var replacement = Array.from(audioTracks).find(function (track) { return matches(track, selectedAudio); });
        if (!replacement) return;
        replacement.enabled = true;
        audioRestored = true;
    }

    function restoreCaptions() {
        if (captionsRestored) return;
        var replacement = Array.from(textTracks).find(function (track) { return matches(track, selectedCaption); });
        if (!replacement) return;
        replacement.mode = 'showing';
        captionsRestored = true;
    }

    function cleanup() {
        player.off('loadedmetadata', onMetadata);
        player.off('error', cleanup);
        player.off('dispose', cleanup);
        if (levels) levels.off('addqualitylevel', onQualityLevel);
        audioTracks.off('addtrack', onAudioTrack);
        textTracks.off('addtrack', onTextTrack);
        clearTimeout(timeout);
        if (cancelBufferRefreshRestore === cleanup) cancelBufferRefreshRestore = null;
    }

    function finish() {
        if (metadataLoaded && qualityRestored && audioRestored && captionsRestored) cleanup();
    }

    function onQualityLevel() { restoreQuality(); finish(); }
    function onAudioTrack() { restoreAudio(); finish(); }
    function onTextTrack() { restoreCaptions(); finish(); }
    function onMetadata() {
        metadataLoaded = true;
        if (hadStarted) player.hasStarted(true);
        var seekable = player.seekable();
        if (isLive && player.liveTracker && seekable.length && Number.isFinite(seekable.end(seekable.length - 1))) {
            player.liveTracker.seekToLiveEdge();
        } else if (!isLive && Number.isFinite(position) && position >= 0) {
            var duration = player.duration();
            player.currentTime(Number.isFinite(duration) ? Math.min(position, Math.max(0, duration - 0.25)) : position);
        }
        player.playbackRate(rate);
        player.volume(volume);
        player.muted(muted);
        restoreQuality();
        restoreAudio();
        restoreCaptions();
        if (!selectedCaption) Array.from(textTracks).forEach(function (track) {
            if (track.kind === 'captions' || track.kind === 'subtitles') track.mode = 'disabled';
        });
        if (!wasPlaying) player.pause();
        finish();
    }

    cancelBufferRefreshRestore = cleanup;
    player.on('loadedmetadata', onMetadata);
    player.on('error', cleanup);
    player.on('dispose', cleanup);
    if (levels) levels.on('addqualitylevel', onQualityLevel);
    audioTracks.on('addtrack', onAudioTrack);
    textTracks.on('addtrack', onTextTrack);
    timeout = setTimeout(cleanup, 15000);

    player.error(null);
    player.src(sources);
    if (wasPlaying) {
        var attempt = player.play();
        if (attempt) attempt.catch(function () {});
    } else {
        // Explicitly start loading when preload="none" and playback is paused.
        player.ready(function () { player.load(); });
    }
};

var refreshButton = new (videojs.getComponent('Button'))(player);
refreshButton.addClass('vjs-refresh-buffer');
refreshButton.controlText(player_data.refresh_buffer);
refreshButton.on('click', player.refreshBuffer);
var controlBar = player.getChild('controlBar');
controlBar.addChild(refreshButton, {}, controlBar.children().indexOf(controlBar.getChild('captionsButton')));

player.on('error', function () {
    if (video_data.params.quality === 'dash') return;

    var localNotDisabled = (
        !player.currentSrc().includes('local=true') && !video_data.local_disabled
    );
    var reloadMakesSense = (
        player.error().code === MediaError.MEDIA_ERR_NETWORK ||
        player.error().code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED
    );

    if (localNotDisabled) {
        // add local=true to all current sources
        player.src(player.currentSources().map(function (source) {
            source.src += '&local=true';
            return source;
        }));
    } else if (reloadMakesSense) {
        automaticReloadTimer = setTimeout(function () {
            automaticReloadTimer = null;
            console.warn('An error occurred in the player, reloading...');

            // After load() all parameters are reset. Save them
            var currentTime = player.currentTime();
            var playbackRate = player.playbackRate();
            var paused = player.paused();

            player.load();

            if (currentTime > 0.5) currentTime -= 0.5;

            player.currentTime(currentTime);
            player.playbackRate(playbackRate);
            if (!paused) player.play();
        }, 5000);
    }
});

if (video_data.params.quality === 'dash') {
    player.reloadSourceOnError({
        errorInterval: 10
    });
}

/**
 * Function for add time argument to url
 *
 * @param {String} url
 * @param {String} [base]
 * @param {'t' | 'start'} param
 * @returns {URL} urlWithTimeArg
 */
function addCurrentTimeToURL(url, base, param = 't') {
    var urlUsed = new URL(url, base);
    urlUsed.searchParams.delete('start');
    var currentTime = Math.ceil(player.currentTime());
    if (currentTime > 0)
        urlUsed.searchParams.set(param, currentTime);
    else if (urlUsed.searchParams.has('t'))
        urlUsed.searchParams.delete('t');
    return urlUsed;
}

/**
 * Global variable to save the last timestamp (in full seconds) at which the external
 * links were updated by the 'timeupdate' callback below.
 *
 * It is initialized to 5s so that the video will always restart from the beginning
 * if the user hasn't really started watching before switching to the other website.
 */
var timeupdate_last_ts = 5;

/**
 * Callback that updates the timestamp on all external links
 */
player.on('timeupdate', function () {
    // Only update once every second
    let current_ts = Math.floor(player.currentTime());
    if (current_ts != timeupdate_last_ts) timeupdate_last_ts = current_ts;
    else return;

    // YouTube links

    if (!video_data.live_now) {
        let elem_yt_watch = document.getElementById('link-yt-watch');
        if (elem_yt_watch) {
            let base_url_yt_watch = elem_yt_watch.getAttribute('data-base-url');
            elem_yt_watch.href = addCurrentTimeToURL(base_url_yt_watch);
        }

        let elem_yt_embed = document.getElementById('link-yt-embed');
        if (elem_yt_embed) {
            let base_url_yt_embed = elem_yt_embed.getAttribute('data-base-url');
            elem_yt_embed.href = addCurrentTimeToURL(base_url_yt_embed, undefined, 'start');
        }
    }

    // Invidious links

    let domain = window.location.origin;

    let elem_iv_embed = document.getElementById('link-iv-embed');
    if (elem_iv_embed) {
        let base_url_iv_embed = elem_iv_embed.getAttribute('data-base-url');
        elem_iv_embed.href = addCurrentTimeToURL(base_url_iv_embed, domain);
    }

    let elem_iv_other = document.getElementById('link-iv-other');
    if (elem_iv_other) {
        let base_url_iv_other = elem_iv_other.getAttribute('data-base-url');
        elem_iv_other.href = addCurrentTimeToURL(base_url_iv_other, domain);
    }

    let elem_iv_listen = document.getElementById('link-iv-listen');
    if (elem_iv_listen) {
        let base_url_iv_listen = elem_iv_listen.getAttribute('data-base-url');
        elem_iv_listen.href = addCurrentTimeToURL(base_url_iv_listen, domain);
    }
});


var shareOptions = {
    socials: ['fbFeed', 'tw', 'reddit', 'email'],

    get url() {
        return addCurrentTimeToURL(short_url);
    },
    title: player_data.title,
    description: player_data.description,
    image: player_data.thumbnail,
    get embedCode() {
        // Single quotes inside here required. HTML inserted as is into value attribute of input
        return "<iframe id='ivplayer' width='640' height='360' src='" +
            addCurrentTimeToURL(embed_url) + "' style='border:none;'></iframe>";
    }
};

if (location.pathname.startsWith('/embed/')) {
    var overlay_content = '<h1><a rel="noopener noreferrer" target="_blank" href="' + location.origin + '/watch?v=' + video_data.id + '">' + player_data.title + '</a></h1>';
    player.overlay({
        overlays: [
            { start: 'loadstart', content: overlay_content, end: 'playing', align: 'top'},
            { start: 'pause',     content: overlay_content, end: 'playing', align: 'top'}
        ]
    });
}

// Use the primary input rather than TouchEvent support (also exposed on desktops).
function isMobile() {
    return window.matchMedia('(pointer: coarse)').matches;
}
// The plugin's override bypasses its UA gate after our primary-pointer check.
if (isMobile()) player.mobileUi({ forceForTesting: true, fullscreen: { enterOnRotate: false, exitOnRotate: false }, touchControls: { seekSeconds: 10 } });

// Enable VR video support
if (!video_data.params.listen && video_data.vr && video_data.params.vr_mode) {
    player.crossOrigin('anonymous');
    switch (video_data.projection_type) {
        case 'EQUIRECTANGULAR':
            player.vr({projection: 'equirectangular'});
        default: // Should only be 'MESH' but we'll use this as a fallback.
            player.vr({projection: 'EAC'});
    }
}

// Add markers
if (video_data.params.video_start > 0 || video_data.params.video_end > 0) {
    var markers = [{ time: video_data.params.video_start, text: 'Start' }];

    if (video_data.params.video_end < 0) {
        markers.push({ time: video_data.length_seconds - 0.5, text: 'End' });
    } else {
        markers.push({ time: video_data.params.video_end, text: 'End' });
    }

    player.markers({
        onMarkerReached: function (marker) {
            if (marker.text === 'End')
                player.loop() ? player.markers.prev('Start') : player.pause();
        },
        markers: markers
    });

    player.currentTime(video_data.params.video_start);
}

// Volume belongs to this browser, never to PREFS or the account.
var volumeStorageKey = 'invidious_player_volume';
var initialVolume = 1;
if (!isMobile()) {
    try {
        var savedVolume = localStorage.getItem(volumeStorageKey);
        var parsedVolume = savedVolume === null || savedVolume.trim() === '' ? NaN : Number(savedVolume);
        if (Number.isFinite(parsedVolume) && parsedVolume >= 0 && parsedVolume <= 1) initialVolume = parsedVolume;
    } catch (error) { /* Playback still works when storage is unavailable. */ }
}
player.volume(initialVolume);
player.playbackRate(video_data.params.speed);

/**
 * Method for getting the contents of a cookie
 *
 * @param {String} name Name of cookie
 * @returns {String|null} cookieValue
 */
function getCookieValue(name) {
    var cookiePrefix = name + '=';
    var matchedCookie = document.cookie.split(';').find(function (item) {return item.includes(cookiePrefix);});
    if (matchedCookie)
        return matchedCookie.replace(cookiePrefix, '');
    return null;
}

/**
 * Method for updating the 'PREFS' cookie (or creating it if missing)
 *
 * @param {number} newSpeed New speed defined (null if unchanged)
 */
function updateCookie(newSpeed) {
    var speedValue = newSpeed !== null ? newSpeed : video_data.params.speed;

    var cookieValue = getCookieValue('PREFS');
    var cookieData;

    if (cookieValue !== null) {
        var cookieJson = JSON.parse(decodeURIComponent(cookieValue));
        delete cookieJson.volume;
        cookieJson.speed = speedValue;
        cookieData = encodeURIComponent(JSON.stringify(cookieJson));
    } else {
        cookieData = encodeURIComponent(JSON.stringify({ 'speed': speedValue }));
    }

    // Set expiration in 2 year
    var date = new Date();
    date.setFullYear(date.getFullYear() + 2);

    var ipRegex = /^((\d+\.){3}\d+|[\dA-Fa-f]*:[\d:A-Fa-f]*:[\d:A-Fa-f]+)$/;
    var domainUsed = location.hostname;

    // Fix for a bug in FF where the leading dot in the FQDN is not ignored
    if (domainUsed.charAt(0) !== '.' && !ipRegex.test(domainUsed) && domainUsed !== 'localhost')
        domainUsed = '.' + location.hostname;

    var secure = location.protocol.startsWith("https") ? " Secure;" : "";

    document.cookie = 'PREFS=' + cookieData + '; SameSite=Lax; path=/; domain=' +
        domainUsed + '; expires=' + date.toGMTString() + ';' + secure;

    video_data.params.speed = speedValue;
}

player.on('ratechange', function () {
    updateCookie(player.playbackRate());
});

var lastPlayerVolume = initialVolume;
player.on('volumechange', function () {
    if (isMobile()) return;
    var volume = player.volume();
    // Muting also emits volumechange; it must not overwrite another tab's level.
    if (volume === lastPlayerVolume) return;
    lastPlayerVolume = volume;
    try { localStorage.setItem(volumeStorageKey, String(volume)); }
    catch (error) { /* Storage may be blocked or full. */ }
});

player.on('waiting', function () {
    if (player.playbackRate() > 1 && player.liveTracker.isLive() && player.liveTracker.atLiveEdge()) {
        console.info('Player has caught up to source, resetting playbackRate');
        player.playbackRate(1);
    }
});

if (video_data.premiere_timestamp && Math.round(new Date() / 1000) < video_data.premiere_timestamp) {
    player.getChild('bigPlayButton').hide();
}

if (video_data.params.save_player_pos) {
    const url = new URL(location);
    const hasTimeParam = url.searchParams.has('t') || url.searchParams.has('start') || url.searchParams.has('time_continue');
    const rememberedTime = video_data.playback_sync ? (video_data.playback_position || 0) : get_video_time();
    let lastUpdated = 0;
    let lastAttemptAt = 0;
    let lastAttemptPosition;
    let acknowledged;
    let inFlight = false;
    let pending = false;
    let started = false;

    if (!hasTimeParam) {
        set_seconds_after_start(rememberedTime >= video_data.length_seconds - 20 ? 0 : rememberedTime);
    }

    // Startup seeks, pauses and source changes must not overwrite account progress.
    player.on('playing', function () { started = true; });

    function currentPosition() {
        const raw = player.currentTime();
        if (!isFinite(raw) || raw < 0) return undefined;
        return player.ended() || raw > video_data.length_seconds - 15 ? null : Math.floor(raw);
    }

    function flushPosition(useBeacon) {
        if (!started) return;
        const position = currentPosition();
        if (position === undefined || (position === acknowledged && !inFlight)) return;
        // Background delivery must still run if a normal request is in flight.
        if (useBeacon) {
            send_playback_position(position === null ? 'clear_progress' : 'set_progress',
                position === null ? undefined : position, true);
            return;
        }
        if (inFlight) { pending = true; return; }
        inFlight = true;
        lastAttemptAt = Date.now();
        lastAttemptPosition = position;
        send_playback_position(position === null ? 'clear_progress' : 'set_progress',
            position === null ? undefined : position, false, function (success) {
                inFlight = false;
                if (success) acknowledged = position;
                const followUp = pending;
                pending = false;
                // Retry failures at the next save opportunity, not in a tight loop.
                if (success && followUp) flushPosition(false);
            });
    }

    player.on('timeupdate', function () {
        if (video_data.playback_sync) {
            if ((currentPosition() === null && lastAttemptPosition !== null) || Date.now() - lastAttemptAt >= 15000) flushPosition(false);
        } else {
            const raw = player.currentTime();
            const time = Math.floor(raw);
            if (raw <= video_data.length_seconds - 15 && lastUpdated !== time) {
                save_video_time(time);
                lastUpdated = time;
            }
        }
    });

    if (video_data.playback_sync) {
        player.on('pause', function () { flushPosition(false); });
        player.on('seeked', function () { flushPosition(false); });
        player.on('ended', function () { flushPosition(false); });
        window.addEventListener('pagehide', function () { flushPosition(true); });
        document.addEventListener('visibilitychange', function () {
            if (document.visibilityState === 'hidden') flushPosition(true);
            else flushPosition(false);
        });
        window.addEventListener('online', function () { flushPosition(false); });
    }
}
else remove_all_video_times();

if (video_data.params.autoplay) {
    var bpb = player.getChild('bigPlayButton');
    bpb.hide();

    player.ready(function () {
        new Promise(function (resolve, reject) {
            setTimeout(function () {resolve(1);}, 1);
        }).then(function (result) {
            var promise = player.play();

            if (promise !== undefined) {
                promise.then(function () {
                }).catch(function (error) {
                    bpb.show();
                });
            }
        });
    });
}

if (!video_data.params.listen && video_data.params.quality === 'dash') {
    if (video_data.params.quality_dash !== 'auto') {
        player.ready(function () {
            player.on('loadedmetadata', function () {
                const qualityLevels = InvidiousStreamMenus.rankedQualityLevels(player);
                if (!qualityLevels.length) return;
                let targetQualityLevel = qualityLevels[0];
                switch (video_data.params.quality_dash) {
                    case 'best':
                        break;
                    case 'worst':
                        targetQualityLevel = qualityLevels[qualityLevels.length - 1];
                        break;
                    default:
                        const targetHeight = parseInt(video_data.params.quality_dash);
                        targetQualityLevel = qualityLevels.find(function (entry) { return entry.height <= targetHeight; }) || qualityLevels[qualityLevels.length - 1];
                }
                qualityLevels.forEach(function (entry) {
                    entry.level.enabled = (entry === targetQualityLevel);
                });
            });
        });
    }
}

player.vttThumbnails({
    src: location.origin + '/api/v1/storyboards/' + video_data.id + '?height=90',
    showTimestamp: true
});

// Enable annotations
if (!video_data.params.listen && video_data.params.annotations) {
    addEventListener('load', function (e) {
        addEventListener('__ar_annotation_click', function (e) {
            const url = e.detail.url,
                  target = e.detail.target,
                  seconds = e.detail.seconds;
            var path = new URL(url);

            if (path.href.startsWith('https://www.youtube.com/watch?') && seconds) {
                path.search += '&t=' + seconds;
            }

            path = path.pathname + path.search;

            if (target === 'current') {
                location.href = path;
            } else if (target === 'new') {
                open(path, '_blank', 'noopener,noreferrer');
            }
        });

        helpers.xhr('GET', '/api/v1/annotations/' + video_data.id, {
            responseType: 'text',
            timeout: 60000
        }, {
            on200: function (response) {
                var video_container = document.getElementById('player');
                videojs.registerPlugin('youtubeAnnotationsPlugin', youtubeAnnotationsPlugin);
                if (player.paused()) {
                    player.one('play', function (event) {
                        player.youtubeAnnotationsPlugin({ annotationXml: response, videoContainer: video_container });
                    });
                } else {
                    player.youtubeAnnotationsPlugin({ annotationXml: response, videoContainer: video_container });
                }
            }
        });

    });
}

function change_volume(delta) {
    if (isMobile()) return;
    const curVolume = player.volume();
    let newVolume = curVolume + delta;
    newVolume = helpers.clamp(newVolume, 0, 1);
    player.volume(newVolume);
}

function toggle_muted() {
    if (isMobile()) return;
    player.muted(!player.muted());
}

function skip_seconds(delta) {
    const duration = player.duration();
    const curTime = player.currentTime();
    let newTime = curTime + delta;
    newTime = helpers.clamp(newTime, 0, duration);
    player.currentTime(newTime);
}

function set_seconds_after_start(delta) {
    const start = video_data.params.video_start;
    player.currentTime(start + delta);
}

function save_video_time(seconds) {
    const all_video_times = get_all_video_times();
    all_video_times[video_data.id] = seconds;
    helpers.storage.set(save_player_pos_key, all_video_times);
}

function playback_position_payload(position) {
    let payload = 'csrf_token=' + encodeURIComponent(video_data.csrf_token || '');
    if (position !== undefined)
        payload += '&position=' + encodeURIComponent(position);
    return payload;
}

function send_playback_position(action, position, useBeacon, done) {
    const url = '/watch_ajax?action=' + action + '&redirect=false&id=' + encodeURIComponent(video_data.id);
    const payload = playback_position_payload(position);

    if (useBeacon && navigator.sendBeacon) {
        const body = new Blob([payload], {type: 'application/x-www-form-urlencoded'});
        try {
            if (navigator.sendBeacon(url, body)) return;
        } catch (_) { /* Fall back when the browser rejects the beacon. */ }
    }
    if (useBeacon && window.fetch) {
        fetch(url, {
            method: 'POST', body: payload, keepalive: true,
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        }).catch(function () {});
    } else {
        helpers.xhr('POST', url, {payload: payload}, {
            on200: function () { if (done) done(true); },
            onNon200: function () { if (done) done(false); },
            onError: function () { if (done) done(false); },
            onTimeout: function () { if (done) done(false); }
        });
    }
}

function save_server_video_time(seconds, useBeacon) {
    send_playback_position('set_progress', seconds, useBeacon);
}

function clear_server_video_time(useBeacon) {
    send_playback_position('clear_progress', undefined, useBeacon);
}

function get_video_time() {
    return get_all_video_times()[video_data.id] || 0;
}

function get_all_video_times() {
    return helpers.storage.get(save_player_pos_key) || {};
}

function remove_all_video_times() {
    helpers.storage.remove(save_player_pos_key);
}

function set_time_percent(percent) {
    const duration = player.duration();
    const newTime = duration * (percent / 100);
    player.currentTime(newTime);
}

function play()  { player.play(); }
function pause() { player.pause(); }
function stop()  { player.pause(); player.currentTime(0); }
function toggle_play() { player.paused() ? play() : pause(); }

const toggle_captions = (function () {
    let toggledTrack = null;

    function bindChange(onOrOff) {
        player.textTracks()[onOrOff]('change', function (e) {
            toggledTrack = null;
        });
    }

    // Wrapper function to ignore our own emitted events and only listen
    // to events emitted by Video.js on click on the captions menu items.
    function setMode(track, mode) {
        bindChange('off');
        track.mode = mode;
        setTimeout(function () {
            bindChange('on');
        }, 0);
    }

    bindChange('on');
    return function () {
        if (toggledTrack !== null) {
            if (toggledTrack.mode !== 'showing') {
                setMode(toggledTrack, 'showing');
            } else {
                setMode(toggledTrack, 'disabled');
            }
            toggledTrack = null;
            return;
        }

        // Used as a fallback if no captions are currently active.
        // TODO: Make this more intelligent by e.g. relying on browser language.
        let fallbackCaptionsTrack = null;

        const tracks = player.textTracks();
        for (let i = 0; i < tracks.length; i++) {
            const track = tracks[i];
            if (track.kind !== 'captions') continue;

            if (fallbackCaptionsTrack === null) {
                fallbackCaptionsTrack = track;
            }
            if (track.mode === 'showing') {
                setMode(track, 'disabled');
                toggledTrack = track;
                return;
            }
        }

        // Fallback if no captions are currently active.
        if (fallbackCaptionsTrack !== null) {
            setMode(fallbackCaptionsTrack, 'showing');
            toggledTrack = fallbackCaptionsTrack;
        }
    };
})();

// For real-time updates to captions (if currently showing)
function update_captions() {
    if (document.body.querySelector('.vjs-text-track-cue')) {
        toggle_captions(); toggle_captions();
    }
}

function toggle_fullscreen() {
    player.isFullscreen() ? player.exitFullscreen() : player.requestFullscreen();
}

function increase_playback_rate(steps) {
    const maxIndex = options.playbackRates.length - 1;
    const curIndex = options.playbackRates.indexOf(player.playbackRate());
    let newIndex = curIndex + steps;
    newIndex = helpers.clamp(newIndex, 0, maxIndex);
    player.playbackRate(options.playbackRates[newIndex]);
}

function increase_caption_size(steps) {
    const maxIndex = options.fontPercent.length - 1;
    const fontPercent = player.textTrackSettings.getValues().fontPercent || 1.25;
    const curIndex = options.fontPercent.indexOf(fontPercent);
    let newIndex = curIndex + steps;
    newIndex = helpers.clamp(newIndex, 0, maxIndex);
    player.textTrackSettings.setValues({ fontPercent: options.fontPercent[newIndex] });
    update_captions();
}

function toggle_caption_window() {
    const numOptions = options.windowOpacity.length;
    const windowOpacity = player.textTrackSettings.getValues().windowOpacity || '0';
    const curIndex = options.windowOpacity.indexOf(windowOpacity);
    const newIndex = (curIndex + 1) % numOptions;
    player.textTrackSettings.setValues({ windowOpacity: options.windowOpacity[newIndex] });
    update_captions();
}

function toggle_caption_opacity() {
    const numOptions = options.textOpacity.length;
    const textOpacity = player.textTrackSettings.getValues().textOpacity || '1';
    const curIndex = options.textOpacity.indexOf(textOpacity);
    const newIndex = (curIndex + 1) % numOptions;
    player.textTrackSettings.setValues({ textOpacity: options.textOpacity[newIndex] });
    update_captions();
}

addEventListener('keydown', function (e) {
    // Keep page-wide playback shortcuts available without stealing keyboard
    // input from forms, links, player buttons, or open menus and dialogs.
    if (e.defaultPrevented || e.isComposing || e.target.isContentEditable ||
        e.target.closest('input, textarea, select, button, a, summary, [role="slider"], [role="menu"], dialog, [contenteditable="true"]') ||
        document.querySelector('dialog[open], .video-context[open], .vjs-menu-button-popup.vjs-menu-button-active')) return;
    let action = null;

    const code = e.keyCode;
    const decoratedKey =
        e.key
        + (e.altKey ? '+alt' : '')
        + (e.ctrlKey ? '+ctrl' : '')
        + (e.metaKey ? '+meta' : '')
        ;
    switch (decoratedKey) {
        case ' ':
        case 'k':
        case 'MediaPlayPause':
            action = toggle_play;
            break;

        case 'MediaPlay':  action = play; break;
        case 'MediaPause': action = pause; break;
        case 'MediaStop':  action = stop; break;

        case 'ArrowUp':
            action = change_volume.bind(this, 0.1);
            break;
        case 'ArrowDown':
            action = change_volume.bind(this, -0.1);
            break;

        case 'm':
            action = toggle_muted;
            break;

        case 'ArrowRight':
        case 'MediaFastForward':
            action = skip_seconds.bind(this, 5 * player.playbackRate());
            break;
        case 'ArrowLeft':
        case 'MediaTrackPrevious':
            action = skip_seconds.bind(this, -5 * player.playbackRate());
            break;
        case 'l':
            action = skip_seconds.bind(this, 10 * player.playbackRate());
            break;
        case 'j':
            action = skip_seconds.bind(this, -10 * player.playbackRate());
            break;

        case '0':
        case '1':
        case '2':
        case '3':
        case '4':
        case '5':
        case '6':
        case '7':
        case '8':
        case '9':
            // Ignore numpad numbers
            if (code > 57) break;

            const percent = (code - 48) * 10;
            action = set_time_percent.bind(this, percent);
            break;

        case 'c': action = toggle_captions; break;
        case 'f': action = toggle_fullscreen; break;

        case 'N':
        case 'MediaTrackNext':
            action = next_video;
            break;
        case 'P':
        case 'MediaTrackPrevious':
            // TODO: Add support to play back previous video.
            break;

        // TODO: More precise step. Now FPS is taken equal to 29.97
        // Common FPS: https://forum.videohelp.com/threads/81868#post323588
        // Possible solution is new HTMLVideoElement.requestVideoFrameCallback() https://wicg.github.io/video-rvfc/
        case ',': action = function () { pause(); skip_seconds(-1/29.97); }; break;
        case '.': action = function () { pause(); skip_seconds( 1/29.97); }; break;

        case '>': action = increase_playback_rate.bind(this, 1); break;
        case '<': action = increase_playback_rate.bind(this, -1); break;

        case '=': action = increase_caption_size.bind(this, 1); break;
        case '-': action = increase_caption_size.bind(this, -1); break;

        case 'w': action = toggle_caption_window; break;
        case 'o': action = toggle_caption_opacity; break;

        default:
            console.info('Unhandled key down event: %s:', decoratedKey, e);
            break;
    }

    if (action) {
        e.preventDefault();
        action();
    }
}, false);

// Add support for controlling the player volume by scrolling over it. Adapted from
// https://github.com/ctd1500/videojs-hotkeys/blob/bb4a158b2e214ccab87c2e7b95f42bc45c6bfd87/videojs.hotkeys.js#L292-L328
(function () {
    const pEl = document.getElementById('player');

    var volumeHover = false;
    var volumeSelector = pEl.querySelector('.vjs-volume-menu-button') || pEl.querySelector('.vjs-volume-panel');
    if (volumeSelector !== null) {
        volumeSelector.onmouseover = function () { volumeHover = true; };
        volumeSelector.onmouseout = function () { volumeHover = false; };
    }

    function mouseScroll(event) {
        // When controls are disabled, hotkeys will be disabled as well
        if (isMobile() || !player.controls() || !volumeHover) return;

        event.preventDefault();
        var wheelMove = event.wheelDelta || -event.detail;
        var volumeSign = Math.sign(wheelMove);

        change_volume(volumeSign * 0.05); // decrease/increase by 5%
    }

    player.on('mousewheel', mouseScroll);
    player.on('DOMMouseScroll', mouseScroll);
}());

// Since videojs-share can sometimes be blocked, we defer it until last
if (player.share) player.share(shareOptions);

// show the preferred caption by default
if (player_data.preferred_caption_found) {
    player.ready(function () {
        if (!video_data.params.listen && video_data.params.quality === 'dash') {
            // play.textTracks()[0] on DASH mode is showing some debug messages
            player.textTracks()[1].mode = 'showing';
        } else {
            player.textTracks()[0].mode = 'showing';
        }
    });
}

// Safari audio double duration fix
if (navigator.vendor === 'Apple Computer, Inc.' && video_data.params.listen) {
    player.on('loadedmetadata', function () {
        player.on('timeupdate', function () {
            if (player.remainingTime() < player.duration() / 2 && player.remainingTime() >= 2) {
                player.currentTime(player.duration() - 1);
            }
        });
    });
}

// Safari screen timeout on looped video playback fix
if (navigator.vendor === 'Apple Computer, Inc.' && !video_data.params.listen && video_data.params.video_loop) {
    player.loop(false);
    player.ready(function () {
        player.on('ended', function () {
            player.currentTime(0);
            player.play();
        });
    });
}

// Watch on Invidious link
if (location.pathname.startsWith('/embed/')) {
    const Button = videojs.getComponent('Button');
    let watch_on_invidious_button = new Button(player);

    // Create hyperlink for current instance
    var redirect_element = document.createElement('a');
    redirect_element.setAttribute('href', location.pathname.replace('/embed/', '/watch?v='));
    redirect_element.appendChild(document.createTextNode('Invidious'));

    watch_on_invidious_button.el().appendChild(redirect_element);
    watch_on_invidious_button.addClass('watch-on-invidious');

    var cb = player.getChild('ControlBar');
    cb.addChild(watch_on_invidious_button);
}

addEventListener('DOMContentLoaded', function () {
    // Save time during redirection on another instance
    const changeInstanceLink = document.querySelector('#watch-on-another-invidious-instance > a');
    if (changeInstanceLink) changeInstanceLink.addEventListener('click', function () {
        changeInstanceLink.href = addCurrentTimeToURL(changeInstanceLink.href);
    });
});
