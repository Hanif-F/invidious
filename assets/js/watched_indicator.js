'use strict';
(function () {
    var config = document.getElementById('watched-config');
    var sync = config && JSON.parse(config.textContent).sync;
    var positions = {};
    var watched = new Set();
    var ready = !sync;
    var loading = false;

    function render() {
        if (!ready) return;
        var local = sync ? {} : (helpers.storage.get('save_player_pos') || {});
        document.querySelectorAll('.watched-indicator').forEach(function (indicator) {
            var id = indicator.dataset.id;
            var position = (sync ? positions : local)[id];
            var isWatched = sync ? watched.has(id) : indicator.dataset.watched === 'true';
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
        if (loading) return;
        loading = true;
        function failed() { loading = false; }
        helpers.xhr('GET', '/api/v1/auth/playback', {}, {
            on200: function (response) {
                loading = false;
                if (!response || !response.positions || !Array.isArray(response.watched)) return;
                positions = response.positions;
                watched = new Set(response.watched);
                ready = true;
                render();
            },
            onError: failed, onTimeout: failed, onNon200: failed
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
    window.addEventListener('storage', function () { if (!sync) render(); });
    refresh();
})();
