'use strict';
var playlist_data = JSON.parse(document.getElementById('playlist_data').textContent);
var payload = 'csrf_token=' + playlist_data.csrf_token;

function add_playlist_video(target) {
    var select = target.form.querySelector('select[name=playlist_id]');
    if (!select || target.disabled) return;
    target.disabled = true;
    var option = select.children[select.selectedIndex];

    var url = '/playlist_ajax?action=add_video&redirect=false' +
        '&video_id=' + target.getAttribute('data-id') +
        '&playlist_id=' + option.getAttribute('data-plid');

    helpers.xhr('POST', url, {payload: payload}, {
        on200: function (response) {
            target.disabled = false;
            if (!option.textContent.startsWith('✓ ')) option.textContent = '✓ ' + option.textContent;
            var status = document.getElementById('playlist-save-status');
            if (status) status.textContent = status.dataset.saved;
        },
        onNon200: failed, onError: failed, onTimeout: failed
    });
    function failed() {
        target.disabled = false;
        var status = document.getElementById('playlist-save-status');
        if (status) status.textContent = status.dataset.error;
    }
}

function add_playlist_item(target) {
    var tile = target.parentNode.parentNode.parentNode.parentNode.parentNode;
    tile.style.display = 'none';

    var url = '/playlist_ajax?action=add_video&redirect=false' +
        '&video_id=' + target.getAttribute('data-id') +
        '&playlist_id=' + target.getAttribute('data-plid');

    helpers.xhr('POST', url, {payload: payload}, {
        onNon200: function (xhr) {
            tile.style.display = '';
        }
    });
}

function remove_playlist_item(target) {
    var tile = target.parentNode.parentNode.parentNode.parentNode.parentNode;
    tile.style.display = 'none';

    var url = '/playlist_ajax?action=remove_video&redirect=false' +
        '&set_video_id=' + target.getAttribute('data-index') +
        '&playlist_id=' + target.getAttribute('data-plid');

    helpers.xhr('POST', url, {payload: payload}, {
        onNon200: function (xhr) {
            tile.style.display = '';
        }
    });
}
