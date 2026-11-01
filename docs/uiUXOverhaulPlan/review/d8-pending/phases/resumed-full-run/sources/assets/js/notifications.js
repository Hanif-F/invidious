'use strict';
var notification_data = JSON.parse(document.getElementById('notification_data').textContent);
var streamOwner = Date.now().toString(36) + Math.random().toString(36).slice(2);
var notifications, delivered = [], leaseTimer, claimTimer, reconnectTimer;
var activeNotificationPage = true, notificationStopped = false, leaseDuration = 45000;
var initialLocalCount = helpers.storage.get('notification_count') || 0;
function ownsStream() {
    if (!activeNotificationPage || notificationStopped || !InvidiousStorage.isCurrent()) return false;
    var lease = helpers.storage.get('stream');
    return lease && lease.owner === streamOwner && lease.expires > Date.now();
}
function closeStream() { if (notifications) notifications.close(); notifications = null; }
function update_notification_count() {
    if (!activeNotificationPage || !InvidiousStorage.isCurrent()) return;
    var notice = document.querySelector('[data-subscription-updates]');
    if (!notice) return;
    var count = helpers.storage.get('notification_count') || 0, text = notice.querySelector('[data-subscription-updates-text]');
    notice.hidden = count === 0;
    text.textContent = text.dataset.countTemplate.replace('{count}',count.toLocaleString());
}
function notificationIcon(record) {
    if (!Array.isArray(record.authorThumbnails)) return;
    for (var thumbnail of record.authorThumbnails) {
        if (!thumbnail || typeof thumbnail.url !== 'string') continue;
        try {
            var url = new URL(thumbnail.url,location.href);
            if (url.origin === location.origin && url.pathname.startsWith('/ggpht/')) return url.pathname + url.search;
            if (['yt3.ggpht.com','yt3.googleusercontent.com'].includes(url.hostname)) return '/ggpht' + url.pathname + url.search;
        } catch (_) { /* Missing optional avatars never prevent an upload notice. */ }
    }
}
function get_subscriptions() {
    if (!ownsStream()) return;
    helpers.xhr('GET','/api/v1/auth/subscriptions',{retries:2,entity_name:'subscriptions'},{on200:create_notification_stream});
}
function create_notification_stream(subscriptions) {
    if (!ownsStream() || !Array.isArray(subscriptions)) return;
    var topics = subscriptions.map(function (item) { return item && item.authorId; }).filter(function (id) { return typeof id === 'string' && /^UC[A-Za-z0-9_-]{22}$/.test(id); });
    closeStream(); clearTimeout(reconnectTimer);
    if (!topics.length) return;
    var stream = notifications = new SSE('/api/v1/auth/notifications',{withCredentials:true,payload:'topics='+topics.join(','),headers:{'Content-Type':'application/x-www-form-urlencoded','X-CSRF-Token':notification_data.csrf_token}});
    var started = Math.floor(Date.now()/1000);
    stream.onmessage = function (event) {
        if (stream !== notifications || !event.id || !ownsStream()) return;
        var record;
        try { record = JSON.parse(event.data); } catch (_) { return; }
        if (!record || typeof record.videoId !== 'string' || !/^[A-Za-z0-9_-]{11}$/.test(record.videoId) || !Number.isFinite(record.published) || record.published < started || delivered.includes(record.videoId)) return;
        delivered.push(record.videoId); if (delivered.length > 1000) delivered.shift();
        helpers.storage.set('notification_count',(helpers.storage.get('notification_count') || 0)+1); update_notification_count();
        if (window.Notification && Notification.permission === 'granted' && topics.includes(record.authorId)) {
            var text = (record.liveNow ? notification_data.live_now_text : notification_data.upload_text) || '';
            var mask = window.InvidiousSpoilers && InvidiousSpoilers.decision(record.authorId,record.published,'title');
            try {
                var message = new Notification(text.replace('`x`',typeof record.author === 'string' ? record.author : ''),{body:mask && mask.hidden ? mask.label : (typeof record.title === 'string' ? record.title : ''),icon:notificationIcon(record)});
                message.onclick = function () { if (InvidiousStorage.isCurrent()) window.open('/watch?v='+encodeURIComponent(record.videoId),'_blank','noopener'); };
            } catch (_) { /* The in-page notice still works when OS delivery is denied. */ }
        }
    };
    stream.addEventListener('error',function () {
        if (stream !== notifications) return;
        closeStream(); clearTimeout(reconnectTimer);
        if (ownsStream()) reconnectTimer = setTimeout(get_subscriptions,1000);
    });
    stream.stream();
}
function start_stream_if_needed() {
    if (!activeNotificationPage || notificationStopped || !InvidiousStorage.isCurrent() || claimTimer) return;
    claimTimer = setTimeout(function () {
        claimTimer = null;
        if (!activeNotificationPage || notificationStopped || !InvidiousStorage.isCurrent()) return;
        var lease = helpers.storage.get('stream');
        if (!lease || lease.expires <= Date.now()) {
            helpers.storage.set('stream',{owner:streamOwner,expires:Date.now()+leaseDuration});
            if (ownsStream()) get_subscriptions();
        }
    },Math.random()*1000+50);
}
function start_notification_timer() {
    if (leaseTimer || notificationStopped) return;
    leaseTimer = setInterval(function () {
        if (!activeNotificationPage || !InvidiousStorage.isCurrent()) { stop_notifications(); return; }
        if (ownsStream()) helpers.storage.set('stream',{owner:streamOwner,expires:Date.now()+leaseDuration});
        else { closeStream(); start_stream_if_needed(); }
    },15000);
}
function stop_notifications() {
    clearTimeout(claimTimer); clearTimeout(reconnectTimer); clearInterval(leaseTimer); claimTimer = reconnectTimer = leaseTimer = null;
    if (ownsStream()) helpers.storage.remove('stream');
    closeStream();
}
addEventListener('storage',function (event) {
    if (helpers.storage.matchesEvent(event,'notification_count')) update_notification_count();
    if (helpers.storage.matchesEvent(event,'stream')) { if (!ownsStream()) closeStream(); start_stream_if_needed(); }
    if (helpers.storage.matchesEvent(event,'subscription_revision') && ownsStream()) get_subscriptions();
});
document.addEventListener('iv:subscriptions-change',function () {
    if (!InvidiousStorage.isCurrent()) return;
    helpers.storage.set('subscription_revision',Math.max(Date.now(),(helpers.storage.get('subscription_revision') || 0)+1));
    if (ownsStream()) get_subscriptions();
});
addEventListener('focus',function () { if (ownsStream()) get_subscriptions(); else start_stream_if_needed(); });
addEventListener('load',function () {
    var initial = Number(notification_data.initial_count);
    if (!Number.isSafeInteger(initial) || initial < 0) initial = 0;
    var current = helpers.storage.get('notification_count') || 0;
    helpers.storage.set('notification_count',notification_data.reset_count ? initial + Math.max(0,current-initialLocalCount) : Math.max(initial,current));
    update_notification_count(); start_notification_timer(); start_stream_if_needed();
});
addEventListener('pageshow',function () { if (!notificationStopped) { activeNotificationPage = true; update_notification_count(); start_notification_timer(); start_stream_if_needed(); } });
addEventListener('pagehide',function () { stop_notifications(); activeNotificationPage = false; });
addEventListener('browserprofilechange',function () { stop_notifications(); notificationStopped = true; });
