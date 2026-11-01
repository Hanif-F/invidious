'use strict';
var subscribe_data = JSON.parse(document.getElementById('subscribe_data').textContent);
var subscribe_button = document.getElementById('subscribe');
subscribe_button.form.addEventListener('submit', function (event) {
    event.preventDefault();
    var subscribing = subscribe_button.dataset.type === 'subscribe';
    InvidiousUI.action('subscription:' + subscribe_data.ucid, subscribe_button, function () {
        return InvidiousUI.post('/subscription_ajax?action=' + (subscribing ? 'create_subscription_to_channel' : 'remove_subscriptions') +
            '&redirect=false&c=' + encodeURIComponent(subscribe_data.ucid), {});
    }, function () {
        subscribe_button.dataset.type = subscribing ? 'unsubscribe' : 'subscribe';
        subscribe_button.textContent = (subscribing ? subscribe_data.unsubscribe_text : subscribe_data.subscribe_text) + ' | ' + subscribe_data.sub_count_text;
    });
});
