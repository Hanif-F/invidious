'use strict';

(function () {
    if (document.documentElement.dataset.handlersInitialized) return;
    document.documentElement.dataset.handlersInitialized = 'true';
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
                e.preventDefault();
                var load_more = t.getAttribute('data-load-more') !== null;
                var load_replies = t.getAttribute('data-load-replies') !== null;
                get_youtube_replies(t, load_more, load_replies);
                break;
            default:
                break;
        }
    });

})();
