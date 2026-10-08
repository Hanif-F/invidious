'use strict';
var notification_data = JSON.parse(document.getElementById('notification_data').textContent);

/** A short-lived, profile-scoped lease identifies the streaming tab. */
const STORAGE_KEY_STREAM = 'stream';
/** Number of notifications. May be increased or reset */
const STORAGE_KEY_NOTIF_COUNT = 'notification_count';

var notifications, delivered;
var streamOwner = Date.now().toString(36) + Math.random().toString(36).slice(2);
var leaseDuration = 45000;
function ownsStream() {
    if (!window.InvidiousStorage.isCurrent()) return false;
    var lease = helpers.storage.get(STORAGE_KEY_STREAM);
    return lease && lease.owner === streamOwner && lease.expires > Date.now();
}
function closeStream() {
    if (notifications) notifications.close();
    notifications = null;
}

function get_subscriptions() {
    if (!ownsStream()) return;
    helpers.xhr('GET', '/api/v1/auth/subscriptions', {
        retries: 5,
        entity_name: 'subscriptions'
    }, {
        on200: create_notification_stream
    });
}

function create_notification_stream(subscriptions) {
    if (!ownsStream()) return;
    closeStream();
    // sse.js can't be replaced to EventSource in place as it lack support of payload and headers
    // see https://developer.mozilla.org/en-US/docs/Web/API/EventSource/EventSource
    notifications = new SSE(
        '/api/v1/auth/notifications', {
            withCredentials: true,
            payload: 'topics=' + subscriptions.map(function (subscription) { return subscription.authorId; }).join(','),
            headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-CSRF-Token': notification_data.csrf_token }
        });
    delivered = [];

    var start_time = Math.round(new Date() / 1000);

    notifications.onmessage = function (event) {
        if (!event.id || !ownsStream()) return;

        var notification;
        try { notification = JSON.parse(event.data); } catch (_) { return; }
        console.info('Got notification:', notification);

        // Ignore not actual and delivered notifications
        if (start_time > notification.published || delivered.includes(notification.videoId)) return;

        delivered.push(notification.videoId);

        let notification_count = helpers.storage.get(STORAGE_KEY_NOTIF_COUNT) || 0;
        notification_count++;
        helpers.storage.set(STORAGE_KEY_NOTIF_COUNT, notification_count);

        update_ticker_count();

        // permission for notifications handled on settings page. JS handler is in handlers.js
        if (window.Notification && Notification.permission === 'granted') {
            var notification_text = notification.liveNow ? notification_data.live_now_text : notification_data.upload_text;
            notification_text = notification_text.replace('`x`', notification.author);

            var system_notification = new Notification(notification_text, {
                body: notification.title,
                icon: '/ggpht' + new URL(notification.authorThumbnails[2].url).pathname,
                img: '/ggpht' + new URL(notification.authorThumbnails[4].url).pathname
            });

            system_notification.onclick = function (e) {
                open('/watch?v=' + notification.videoId, '_blank');
            };
        }
    };

    notifications.addEventListener('error', function (e) {
        console.warn('Something went wrong with notifications, trying to reconnect...');
        closeStream();
        if (ownsStream()) setTimeout(get_subscriptions, 1000);
    });

    notifications.stream();
}

function update_ticker_count() {
    var notification_ticker = document.getElementById('notification_ticker');

    const notification_count = helpers.storage.get(STORAGE_KEY_NOTIF_COUNT) || 0;
    if (notification_count > 0) {
        notification_ticker.innerHTML =
            '<span id="notification_count">' + notification_count + '</span> <i class="icon ion-ios-notifications"></i>';
    } else {
        notification_ticker.innerHTML =
            '<i class="icon ion-ios-notifications-outline"></i>';
    }
}

function start_stream_if_needed() {
    if (!window.InvidiousStorage.isCurrent()) return;
    // Give another visible tab a chance to claim the lease first.
    setTimeout(function () {
        if (!window.InvidiousStorage.isCurrent()) return;
        var lease = helpers.storage.get(STORAGE_KEY_STREAM);
        if (!lease || lease.expires <= Date.now()) {
            helpers.storage.set(STORAGE_KEY_STREAM, {owner: streamOwner, expires: Date.now() + leaseDuration});
            if (ownsStream()) get_subscriptions();
        }
    }, Math.random() * 1000 + 50);
}

addEventListener('storage', function (event) {
    if (helpers.storage.matchesEvent(event, STORAGE_KEY_NOTIF_COUNT)) update_ticker_count();
    if (helpers.storage.matchesEvent(event, STORAGE_KEY_STREAM)) {
        if (!ownsStream()) closeStream();
        start_stream_if_needed();
    }
});

var leaseTimer = setInterval(function () {
    if (!window.InvidiousStorage.isCurrent()) { closeStream(); clearInterval(leaseTimer); return; }
    if (ownsStream()) helpers.storage.set(STORAGE_KEY_STREAM, {owner: streamOwner, expires: Date.now() + leaseDuration});
    else { closeStream(); start_stream_if_needed(); }
}, 15000);

addEventListener('load', function () {
    var count = document.getElementById('notification_count');
    helpers.storage.set(STORAGE_KEY_NOTIF_COUNT, count ? parseInt(count.textContent, 10) || 0 : 0);
    start_stream_if_needed();
});
addEventListener('pageshow', start_stream_if_needed);
addEventListener('browserprofilechange', function () { closeStream(); clearInterval(leaseTimer); });
addEventListener('pagehide', function () {
    if (ownsStream()) helpers.storage.remove(STORAGE_KEY_STREAM);
    closeStream();
});
