'use strict';
function add_playlist_video(target) {
    var select = target.form.querySelector('select[name=playlist_id]');
    if (!select || !select.value) return;
    var option = select.options[select.selectedIndex];
    return save_playlist_item(target, option.dataset.plid || select.value, function () {
        if (!option.textContent.startsWith('✓ ')) option.textContent = '✓ ' + option.textContent;
        var status = document.getElementById('playlist-save-status');
        if (status) status.textContent = status.dataset.saved;
    });
}
function save_playlist_item(target, playlist, done) {
    return InvidiousUI.action('add:' + playlist + ':' + target.dataset.id, target, function () {
        return InvidiousUI.post('/playlist_ajax?action=add_video&redirect=false&video_id=' + encodeURIComponent(target.dataset.id) + '&playlist_id=' + encodeURIComponent(playlist), {});
    }, done);
}
function add_playlist_item(target) {
    return save_playlist_item(target, target.dataset.plid, function () { target.closest('.media-item').remove(); });
}
function remove_playlist_item(target) {
    return InvidiousUI.action('remove:' + target.dataset.plid + ':' + target.dataset.index, target, function () {
        return InvidiousUI.post('/playlist_ajax?action=remove_video&redirect=false&set_video_id=' + encodeURIComponent(target.dataset.index) + '&playlist_id=' + encodeURIComponent(target.dataset.plid), {});
    }, function () { InvidiousUI.removeRows([target.closest('.media-item')]); });
}
