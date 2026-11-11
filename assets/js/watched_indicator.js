'use strict';
(function () {
    var configNode = document.getElementById('watched-config');
    var config = configNode ? JSON.parse(configNode.textContent) : {};
    var sync = config.sync;
    var account = config.account || sync;
    var positions = {};
    var completed = new Set();
    var loading = false;
    var confirmed = new Map();
    var changeSequence = 0;
    var refreshAgain = false;

    function render() {
        var saved = sync ? positions : (helpers.storage.get('save_player_pos') || {});
        var guestCompleted = account ? {} : (helpers.storage.get('completed_videos') || {});
        document.querySelectorAll('.watched-indicator').forEach(function (indicator) {
            var id = indicator.dataset.id;
            var position = saved[id];
            var change = confirmed.get(id);
            var isCompleted = change ? change.completed : completed.has(id) || guestCompleted[id] === true;
            var total = Number(indicator.dataset.length);
            var hasProgress = Number.isFinite(position) && position > 0 && Number.isFinite(total) && total > 0;
            indicator.hidden = !hasProgress && !isCompleted;
            if (indicator.hidden) return;
            var percentage = hasProgress ? Math.round(position / total * 100) : 100;
            indicator.style.width = (percentage > 90 ? 100 : Math.max(5, percentage)) + '%';
        });
    }

    function refresh() {
        render();
        if (!account) return;
        if (!window.InvidiousStorage.isCurrent()) return;
        if (loading) { refreshAgain = true; return; }
        loading = true;
        var requestedAfter = changeSequence;
        function finished() { loading = false; if (refreshAgain) { refreshAgain = false; refresh(); } }
        helpers.xhr('GET', '/api/v1/auth/playback', {}, {
            on200: function (response) {
                if (!response || !response.positions) { finished(); return; }
                positions = response.positions;
                if (Array.isArray(response.completed)) {
                    completed = new Set(response.completed);
                    // A snapshot requested before a manual action may still be in flight.
                    confirmed.forEach(function (change, id) {
                        if (change.sequence <= requestedAfter) confirmed.delete(id);
                    });
                }
                render();
                finished();
            },
            onError: finished, onTimeout: finished, onNon200: finished
        });
    }

    // Queue fragments arrive after the initial page and can contain duplicate IDs.
    new MutationObserver(function (records) {
        var addedIndicators = records.some(function (record) {
            return Array.from(record.addedNodes).some(function (node) {
                return node.nodeType === 1 && (node.matches('.watched-indicator') || node.querySelector('.watched-indicator'));
            });
        });
        if (addedIndicators) render();
    }).observe(document.body, {childList: true, subtree: true});
    document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'visible') refresh();
    });
    window.addEventListener('pageshow', function (event) { if (event.persisted) refresh(); });
    document.addEventListener('iv:library-change', refresh);
    document.addEventListener('iv:watched-change', function (event) {
        confirmed.set(event.detail.id, {completed: event.detail.watched, sequence: ++changeSequence});
        render();
    });
    window.addEventListener('storage', function (event) {
        if ((!sync && helpers.storage.matchesEvent(event, 'save_player_pos')) ||
            (!account && helpers.storage.matchesEvent(event, 'completed_videos'))) render();
    });
    refresh();
})();
