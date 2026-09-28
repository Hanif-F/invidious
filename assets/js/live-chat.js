'use strict';

(function () {
    var panel = document.getElementById('chat-panel');
    if (!panel || !window.player || !window.video_data) return;

    var list = document.getElementById('chat-messages');
    var status = document.getElementById('chat-status');
    var retry = document.getElementById('chat-retry');
    var labels = JSON.parse(document.getElementById('watch_ui_data').textContent);
    var queue = [];
    var seen = new Set();
    var removed = new Set();
    var continuation = null;
    var highestOffset = 0;
    var hasMore = true;
    var loading = false;
    var failed = false;
    var generation = 0;
    var controller;
    var nextRequestAt = 0;

    function positionMs() {
        var seconds = Number(player.currentTime());
        return Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds * 1000)) : 0;
    }

    function timestamp(ms) {
        var seconds = Math.floor(ms / 1000);
        return (seconds >= 3600 ? Math.floor(seconds / 3600) + ':' : '') +
            String(Math.floor(seconds / 60) % 60).padStart(2, '0') + ':' +
            String(seconds % 60).padStart(2, '0');
    }

    function append(message) {
        var row = document.createElement('div');
        row.className = 'chat-message';
        row.dataset.messageId = message.id;
        row.dataset.kind = message.kind;
        var time = document.createElement('span');
        time.className = 'chat-time';
        time.textContent = timestamp(message.offsetMs);
        row.appendChild(time);
        if (message.author) {
            var author = document.createElement('strong');
            author.className = 'chat-author';
            author.textContent = message.author;
            row.appendChild(author);
        }
        if (message.amount && message.amount !== message.text) {
            var amount = document.createElement('span');
            amount.className = 'chat-amount';
            amount.textContent = message.amount;
            row.appendChild(amount);
        }
        var text = document.createElement('span');
        text.className = 'chat-text';
        text.textContent = message.text;
        row.appendChild(text);
        list.appendChild(row);
        while (list.children.length > 120) list.firstElementChild.remove();
        list.scrollTop = list.scrollHeight;
    }

    function showDue() {
        var now = positionMs();
        while (queue.length && queue[0].offsetMs <= now + 250) {
            var message = queue.shift();
            if (!removed.has(message.id)) append(message);
        }
        if (!loading && !failed && hasMore && Date.now() >= nextRequestAt &&
            (queue.length === 0 || highestOffset <= now + 15000)) load(false);
        if (!loading && !hasMore && !list.children.length && !queue.length)
            status.textContent = labels.chat_empty;
    }

    function load(initial) {
        if (loading || failed || (!initial && !hasMore)) return;
        loading = true;
        var request = generation;
        var url = new URL('/api/v1/live_chat/' + encodeURIComponent(video_data.id), location.origin);
        url.searchParams.set('offset_ms', String(initial ? positionMs() : highestOffset));
        if (!initial && continuation) url.searchParams.set('continuation', continuation);
        controller = new AbortController();
        list.setAttribute('aria-busy', 'true');
        retry.hidden = true;
        if (initial) status.textContent = labels.chat_loading;

        fetch(url.pathname + url.search, {signal: controller.signal}).then(function (response) {
            if (response.status === 404) {
                var error = new Error('unavailable');
                error.unavailable = true;
                throw error;
            }
            if (!response.ok) throw new Error('request failed');
            return response.json();
        }).then(function (data) {
            if (request !== generation) return;
            if (!data || !Array.isArray(data.messages) || !Array.isArray(data.removedIds))
                throw new Error('invalid chat response');
            (data.removedIds || []).forEach(function (id) {
                removed.add(id);
                Array.from(list.children).forEach(function (row) {
                    if (row.dataset.messageId === id) row.remove();
                });
                queue = queue.filter(function (message) { return message.id !== id; });
            });
            data.messages.forEach(function (message) {
                if (typeof message.id !== 'string' || typeof message.text !== 'string' ||
                    !Number.isFinite(message.offsetMs) || message.offsetMs < 0 ||
                    seen.has(message.id) || removed.has(message.id)) return;
                seen.add(message.id);
                queue.push(message);
                highestOffset = Math.max(highestOffset, message.offsetMs);
            });
            queue.sort(function (a, b) { return a.offsetMs - b.offsetMs; });
            continuation = typeof data.continuation === 'string' && data.continuation ? data.continuation : null;
            hasMore = !!continuation;
            loading = false;
            list.setAttribute('aria-busy', 'false');
            status.textContent = '';
            nextRequestAt = Date.now() + 800;
            showDue();
            if (hasMore && queue.length === 0)
                setTimeout(function () { if (request === generation) showDue(); }, 850);
        }).catch(function (error) {
            if (request !== generation || error.name === 'AbortError') return;
            loading = false;
            failed = true;
            list.setAttribute('aria-busy', 'false');
            status.textContent = error.unavailable ? labels.chat_unavailable : labels.chat_error;
            retry.hidden = !!error.unavailable;
        });
    }

    function reset() {
        generation++;
        if (controller) controller.abort();
        queue = [];
        seen = new Set();
        removed = new Set();
        continuation = null;
        highestOffset = positionMs();
        hasMore = true;
        loading = false;
        failed = false;
        nextRequestAt = 0;
        list.textContent = '';
        status.textContent = labels.chat_loading;
        retry.hidden = true;
        load(true);
    }

    retry.onclick = reset;
    player.on('timeupdate', showDue);
    player.on('seeked', reset);
    player.on('loadedmetadata', reset);
    reset();
}());
