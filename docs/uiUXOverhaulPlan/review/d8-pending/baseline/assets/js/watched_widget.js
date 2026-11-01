'use strict';
function mark_watched(target) { return change_watched(target, true); }
function mark_unwatched(target) { return change_watched(target, false); }
function change_watched(target, watched) {
    var id = target.dataset.id;
    return InvidiousUI.action('watched:' + id, target, function () {
        return InvidiousUI.post('/watch_ajax?action=mark_' + (watched ? 'watched' : 'unwatched') + '&redirect=false&id=' + encodeURIComponent(id), {});
    }, function () {
        InvidiousUI.watched(id, watched);
    });
}
