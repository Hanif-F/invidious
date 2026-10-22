'use strict';
(function () {
    var node = document.getElementById('verification-access');
    if (!node) return;
    var expiry = Number(node.textContent);
    var redirecting = false;
    var checking = false;
    function verify() {
        if (redirecting) return;
        redirecting = true;
        var destination = new URL(window.location.href);
        var player = window.player;
        var video = document.querySelector('video');
        var position = player && typeof player.currentTime === 'function' ? player.currentTime() : video && video.currentTime;
        if (Number.isFinite(position) && position > 0) {
            destination.searchParams.set('t', Math.floor(position));
            if (player) player.pause();
            else if (video) video.pause();
        }
        var target = '/verify?return=' + encodeURIComponent(destination.pathname + destination.search + destination.hash);
        if (window.top !== window) {
            // Cookie restrictions can prevent embedded playback even after top-level verification.
            var message = document.createElement('p');
            message.textContent = 'Verification is required. ';
            var link = document.createElement('a');
            link.href = target;
            link.target = '_blank';
            link.rel = 'noopener';
            link.textContent = 'Open this instance to verify and watch';
            message.appendChild(link);
            document.body.replaceChildren(message);
        } else window.location.assign(target);
    }
    function denied(response) {
        if (response.status === 403 && response.headers.get('X-Invidious-Verification-Required')) verify();
    }
    var originalFetch = window.fetch;
    window.fetch = function () {
        return originalFetch.apply(this, arguments).then(function (response) { denied(response); return response; });
    };
    var originalSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function () {
        this.addEventListener('load', function () {
            if (this.status === 403 && this.getResponseHeader('X-Invidious-Verification-Required')) verify();
        });
        return originalSend.apply(this, arguments);
    };
    function check() {
        if (checking || redirecting) return;
        checking = true;
        originalFetch('/api/v1/verification', { credentials: 'same-origin', cache: 'no-store' })
            .then(function (response) { return response.json(); })
            .then(function (result) {
                if (result.required) verify();
                else expiry = result.expiresAt || 0;
            }).catch(function () { /* A network outage is not proof of an invalid pass. */ })
            .finally(function () { checking = false; });
    }
    // Media element errors do not expose HTTP status; ask the local bootstrap endpoint.
    document.addEventListener('error', function (event) {
        if (event.target && (['VIDEO', 'AUDIO', 'SOURCE', 'IMG'].includes(event.target.tagName))) check();
    }, true);
    document.addEventListener('play', function () {
        if (expiry && Date.now() / 1000 >= expiry) check();
    }, true);
    window.InvidiousVerification = { check: check };
})();
