'use strict';
(function () {
    var config = document.getElementById('watched-config');
    var sync = config && JSON.parse(config.textContent).sync;
    var positions = {};
    var watched = new Set();
    var ready = !sync;
    var loading = false;
    var confirmed = new Map();
    var refreshAgain = false;

    function render() {
        if (!ready) return;
        var local = sync ? {} : (helpers.storage.get('save_player_pos') || {});
        document.querySelectorAll('.watched-indicator').forEach(function (indicator) {
            var id = indicator.dataset.id;
            var position = (sync ? positions : local)[id];
            var isWatched = confirmed.has(id) ? confirmed.get(id) : sync ? watched.has(id) : indicator.dataset.watched === 'true';
            var total = Number(indicator.dataset.length);
            indicator.hidden = position === undefined && !isWatched;
            if (indicator.hidden) return;
            // Unknown duration cannot provide a meaningful partial percentage.
            if (position !== undefined && (!Number.isFinite(total) || total <= 0)) {
                indicator.hidden = true;
                return;
            }
            var percentage = position === undefined ? 100 : Math.round(position / total * 100);
            indicator.style.width = (percentage > 90 ? 100 : Math.max(5, percentage)) + '%';
        });
    }

    function refresh() {
        if (!sync) { render(); return; }
        if (!window.InvidiousStorage.isCurrent()) return;
        if (loading) { refreshAgain = true; return; }
        loading = true;
        function finished() { loading = false; if (refreshAgain) { refreshAgain = false; refresh(); } }
        helpers.xhr('GET', '/api/v1/auth/playback', {}, {
            on200: function (response) {
                if (!response || !response.positions || !Array.isArray(response.watched)) { finished(); return; }
                positions = response.positions;
                watched = new Set(response.watched);
                confirmed.forEach(function (value, id) { if (watched.has(id) === value) confirmed.delete(id); });
                ready = true;
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
        confirmed.set(event.detail.id, event.detail.watched);
        render();
    });
    window.addEventListener('storage', function (event) { if (!sync && helpers.storage.matchesEvent(event, 'save_player_pos')) render(); });
    refresh();
})();
