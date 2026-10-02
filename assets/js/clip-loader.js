'use strict';
(function () {
    var trigger = document.getElementById('create-clip');
    if (!trigger) return;
    var config = JSON.parse(document.getElementById('clip-config').textContent);
    var pending = false, label = trigger.textContent;
    function position() {
        var time = window.player ? Number(player.currentTime()) : 0;
        return Number.isFinite(time) ? Math.max(0, Math.floor(time)) : 0;
    }
    function open(event, requestedTime) {
        if (event && (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey)) return;
        var time = requestedTime === undefined ? position() : requestedTime, fallback = new URL(trigger.href, location.origin);
        fallback.searchParams.set('startTime', time);
        trigger.href = fallback.pathname + fallback.search;
        if (!config.signed_in) {
            if (event) event.preventDefault();
            var returnURL = new URL(location.href);
            returnURL.searchParams.set('create_clip', '1');
            returnURL.searchParams.set('t', time);
            location.href = '/login?referer=' + encodeURIComponent(returnURL.pathname + returnURL.search);
            return;
        }
        if (typeof HTMLDialogElement === 'undefined' || !HTMLDialogElement.prototype.showModal) return;
        if (event) event.preventDefault();
        if (window.InvidiousClipEditor) { window.InvidiousClipEditor.open(time); return; }
        if (pending) return;
        pending = true;
        trigger.setAttribute('aria-busy', 'true'); trigger.textContent = config.loading;
        var style = document.createElement('link'), script = document.createElement('script');
        style.rel = 'stylesheet'; style.href = config.style; script.src = config.script;
        function finished() {
            pending = false; trigger.removeAttribute('aria-busy'); trigger.textContent = label;
        }
        function failed() {
            style.remove(); script.remove(); finished();
            trigger.title = config.error;
            // The timestamp-aware normal form is also the asset-loading fallback.
            location.assign(trigger.href);
        }
        style.onerror = failed; script.onerror = failed;
        style.onload = function () { document.head.appendChild(script); };
        script.onload = function () {
            finished();
            if (window.InvidiousClipEditor) window.InvidiousClipEditor.open(time);
            else failed();
        };
        document.head.appendChild(style);
    }
    trigger.addEventListener('click', open);
    var url = new URL(location.href);
    if (url.searchParams.get('create_clip') === '1' && config.signed_in) {
        url.searchParams.delete('create_clip'); history.replaceState(null, '', url.pathname + url.search + url.hash);
        // Wait for the main player's timestamp restoration before opening.
        function reopen() {
            var requested = Number(url.searchParams.get('t'));
            if (window.player && Number.isFinite(requested) && requested >= 0) player.currentTime(requested);
            open(undefined, Number.isFinite(requested) && requested >= 0 ? requested : undefined);
        }
        if (window.player && typeof player.ready === 'function') player.ready(reopen);
        else reopen();
    }
})();
