'use strict';
var watched_data = JSON.parse(document.getElementById('watched_data').textContent);
var payload = 'csrf_token=' + watched_data.csrf_token;

function mark_watched(target) {
    var tile = target.closest('.media-item') || target.parentNode.parentNode.parentNode.parentNode.parentNode;
    tile.style.display = 'none';

    var url = '/watch_ajax?action=mark_watched&redirect=false' +
        '&id=' + target.getAttribute('data-id');

    helpers.xhr('POST', url, {payload: payload}, {
        onNon200: function (xhr) {
            tile.style.display = '';
        }
    });
}

function mark_unwatched(target) {
    var tile = target.closest('.media-item') || target.parentNode.parentNode.parentNode.parentNode.parentNode;
    tile.style.display = 'none';
    var group = tile.closest('.history-group');
    if (group && !Array.prototype.some.call(group.querySelectorAll('.media-item'), function (item) { return item.style.display !== 'none'; })) {
        group.style.display = 'none';
    }
    var count = document.getElementById('count');
    count.textContent--;

    var url = '/watch_ajax?action=mark_unwatched&redirect=false' +
        '&id=' + target.getAttribute('data-id');

    var restored = false;
    function restore() {
        if (restored) return;
        restored = true;
        count.textContent++;
        tile.style.display = '';
        if (group) group.style.display = '';
    }
    helpers.xhr('POST', url, {payload: payload}, {
        onNon200: restore,
        onError: restore,
        onTimeout: restore
    });
}
