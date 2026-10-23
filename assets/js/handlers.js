'use strict';

(function () {
    var video_player = document.getElementById('player_html5_api');
    if (video_player) {
        video_player.onmouseenter = function () { video_player['data-title'] = video_player['title']; video_player['title'] = ''; };
        video_player.onmouseleave = function () { video_player['title'] = video_player['data-title']; video_player['data-title'] = ''; };
        video_player.oncontextmenu = function () { video_player['title'] = video_player['data-title']; };
    }

    // For dynamically inserted elements
    addEventListener('click', function (e) {
        if (!e || !e.target) return;

        var t = e.target.closest('[data-onclick]');
        if (!t) return;
        var handler_name = t.getAttribute('data-onclick');

        switch (handler_name) {
            case 'jump_to_time':
                e.preventDefault();
                var time = t.getAttribute('data-jump-time');
                player.currentTime(time);
                break;
            case 'get_youtube_replies':
                var load_more = t.getAttribute('data-load-more') !== null;
                var load_replies = t.getAttribute('data-load-replies') !== null;
                get_youtube_replies(t, load_more, load_replies);
                break;
            case 'toggle_parent':
                e.preventDefault();
                toggle_parent(t);
                break;
            default:
                break;
        }
    });

    document.querySelectorAll('[data-mouse="switch_classes"]').forEach(function (el) {
        var classes = el.getAttribute('data-switch-classes').split(',');
        var classOnEnter = classes[0];
        var classOnLeave = classes[1];
        function toggle_classes(toAdd, toRemove) {
            el.classList.add(toAdd);
            el.classList.remove(toRemove);
        }
        el.onmouseenter = function () { toggle_classes(classOnEnter, classOnLeave); };
        el.onmouseleave = function () { toggle_classes(classOnLeave, classOnEnter); };
    });

    var actions = {
        mark_watched: function (target) { return mark_watched(target); },
        mark_unwatched: function (target) { return mark_unwatched(target); },
        add_playlist_video: function (target) { return add_playlist_video(target); },
        add_playlist_item: function (target) { return add_playlist_item(target); },
        remove_playlist_item: function (target) { return remove_playlist_item(target); },
        revoke_token: revoke_token,
        remove_subscription: remove_subscription
    };
    document.addEventListener('submit', function (event) {
        var form = event.target;
        var target = event.submitter || form.querySelector('[data-onclick]');
        var action = target && actions[target.dataset.onclick];
        if (!action) return;
        event.preventDefault();
        action(target);
    });
    document.addEventListener('click', function (event) {
        var target = event.target.closest('[data-onclick]');
        if (!target) return;
        if (target.dataset.onclick === 'notification_requestPermission') Notification.requestPermission();
        else if (actions[target.dataset.onclick] && (!target.form || target.type === 'button')) {
            event.preventDefault(); actions[target.dataset.onclick](target);
        }
    });
    function revoke_token(target) {
        var row = target.closest('.token-row') || target.parentNode.parentNode.parentNode.parentNode.parentNode;
        return InvidiousUI.action('token:' + target.dataset.session, target, function () {
            return InvidiousUI.post('/token_ajax?action=revoke_token&redirect=false&session=' + encodeURIComponent(target.dataset.session), {});
        }, function () { InvidiousUI.removeRows([row]); });
    }
    function remove_subscription(target) {
        var row = target.closest('.subscription-row');
        return InvidiousUI.action('subscription:' + target.dataset.ucid, target, function () {
            return InvidiousUI.post('/subscription_ajax?action=remove_subscriptions&redirect=false&c=' + encodeURIComponent(target.dataset.ucid), {});
        }, function () { if (row) InvidiousUI.removeRows([row]); });
    }

    // Handle keypresses
    addEventListener('keydown', function (event) {
        // Ignore modifier keys
        if (event.defaultPrevented || event.isComposing || event.ctrlKey || event.metaKey || event.altKey ||
            event.target.closest('input, textarea, select, button, a, summary, [contenteditable], dialog') ||
            document.querySelector('dialog[open], .video-context[open]')) return;

        // Ignore shortcuts if any text input is focused
        let focused_tag = document.activeElement.tagName.toLowerCase();
        const allowed = /^(button|checkbox|file|radio|submit)$/;

        if (focused_tag === 'textarea') return;
        if (focused_tag === 'input') {
            let focused_type = document.activeElement.type.toLowerCase();
            if (!allowed.test(focused_type)) return;
        }

        // Focus search bar on '/'
        if (event.key === '/') {
            var searchbox = document.getElementById('searchbox');
            if (!searchbox) return;
            searchbox.focus();
            event.preventDefault();
        }
    });
})();
