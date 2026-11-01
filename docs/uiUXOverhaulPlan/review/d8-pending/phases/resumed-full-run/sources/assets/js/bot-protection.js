'use strict';
(function () {
    var node = document.getElementById('verification-access');
    if (!node || node.dataset.verificationInitialized) return;
    node.dataset.verificationInitialized = 'true';
    var expiry = Number(node.textContent), loginRequired = node.dataset.loginRequired === 'true';
    var redirecting = false, checking = false, active = true, disposed = false, generation = 0, pending, lastPosition;
    var life = new AbortController(), originalFetch = window.fetch, originalSend = XMLHttpRequest.prototype.send;
    function current() { return active && !disposed && !redirecting; }
    function cancel() { generation++; if (pending) pending.abort(); pending = null; checking = false; }
    function dispose() {
        if (disposed) return;
        disposed = true; active = false; cancel(); life.abort();
        if (window.fetch === wrappedFetch) window.fetch = originalFetch;
        if (XMLHttpRequest.prototype.send === wrappedSend) XMLHttpRequest.prototype.send = originalSend;
    }
    function recover(kind) {
        if (!current()) return;
        redirecting = true; cancel();
        var destination = new URL(window.location.href), player = window.player, video = document.querySelector('video');
        if (player && typeof player.isDisposed === 'function' && player.isDisposed()) player = null;
        var position = player && typeof player.currentTime === 'function' ? player.currentTime() : video && video.currentTime;
        if ((!Number.isFinite(position) || position <= 0) && Number.isFinite(lastPosition)) position = lastPosition;
        if (Number.isFinite(position) && position > 0) destination.searchParams.set('t',Math.floor(position));
        if (player && typeof player.pause === 'function') player.pause();
        else if (video) video.pause();
        var embedded = window.top !== window;
        if (kind === 'login' && embedded) {
            var match = destination.pathname.match(/^\/embed\/([A-Za-z0-9_-]{11})$/);
            if (match) { destination.pathname = '/watch'; destination.searchParams.set('v',match[1]); }
        }
        var target = (kind === 'login' ? '/login?referer=' : '/verify?return=')+encodeURIComponent(destination.pathname+destination.search+destination.hash);
        if (embedded) {
            // Consumers retire before media, preventing a late source/queue result
            // from restarting detached playback or issuing a previous-profile write.
            ['InvidiousEmbed','InvidiousEnhancements','InvidiousDeArrow','InvidiousSpoilers','InvidiousSponsorBlock'].forEach(function (name) {
                var owner = window[name]; if (owner && typeof owner.dispose === 'function') owner.dispose();
            });
            if (player && typeof player.dispose === 'function' && (typeof player.isDisposed !== 'function' || !player.isDisposed())) player.dispose();
            var headingText = kind === 'login' ? node.dataset.loginHeading || 'Sign in to watch' : node.dataset.requiredLabel || 'Verification required';
            document.title = headingText+' - Invidious';
            document.querySelectorAll('meta[name=thumbnail],meta[name=description],meta[property^="og:"],meta[name^="twitter:"]').forEach(function (meta) { meta.remove(); });
            var panel = document.createElement('main'); panel.className = 'standalone-content status-panel';
            var heading = document.createElement('h1'); heading.dir = 'auto'; heading.textContent = headingText;
            var message = document.createElement('p'); message.dir = 'auto';
            message.textContent = kind === 'login' ? node.dataset.loginMessage || 'Open this instance in a new window to sign in and watch.' : node.dataset.playbackLabel || 'Verification is required to play this video.';
            var toolbar = document.createElement('nav'); toolbar.className = 'toolbar';
            var link = document.createElement('a'); link.href = target; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.className = 'button button-primary';
            link.textContent = kind === 'login' ? node.dataset.loginAction || 'Open this instance to sign in and watch' : node.dataset.openLabel || 'Open this instance to verify and watch';
            toolbar.append(link); panel.append(heading,message,toolbar);
            document.body.dataset.embedState = 'blocked'; document.body.replaceChildren(panel); dispose();
        } else window.location.assign(target);
    }
    function denied(response) {
        if (!current()) return;
        if (loginRequired && response.status === 401 && response.headers.get('X-Invidious-Login-Required') === '1') recover('login');
        else if (response.status === 403 && response.headers.get('X-Invidious-Verification-Required')) recover('verification');
    }
    function wrappedFetch() {
        var attempt = generation;
        return originalFetch.apply(this,arguments).then(function (response) { if (attempt === generation) denied(response); return response; });
    }
    function wrappedSend() {
        var attempt = generation;
        this.addEventListener('load',function () {
            if (attempt === generation) denied({status:this.status,headers:{get:this.getResponseHeader.bind(this)}});
        },{once:true});
        return originalSend.apply(this,arguments);
    }
    window.fetch = wrappedFetch; XMLHttpRequest.prototype.send = wrappedSend;
    function check() {
        if (checking || !current()) return;
        checking = true;
        var attempt = generation, request = pending = new AbortController();
        function owned() { return current() && attempt === generation && !request.signal.aborted; }
        // HEAD on the existing local health route checks only the instance gate;
        // it cannot fetch video metadata, contact a provider, or replay a write.
        var access = loginRequired ? originalFetch('/api/v1/stats',{method:'HEAD',credentials:'same-origin',cache:'no-store',signal:request.signal}).then(function (response) { if (owned()) denied(response); }) : Promise.resolve();
        access.then(function () {
            if (!owned()) return;
            return originalFetch('/api/v1/verification',{credentials:'same-origin',cache:'no-store',signal:request.signal}).then(function (response) { return response.json(); }).then(function (result) {
                if (!owned()) return;
                if (!result || typeof result.required !== 'boolean') throw new Error();
                if (result.required) recover('verification');
                else expiry = result.expiresAt || 0;
            });
        }).catch(function () { /* An outage is not proof of an invalid session/pass. */ }).finally(function () {
            if (pending === request) { pending = null; checking = false; }
        });
    }
    document.addEventListener('error',function (event) {
        if (event.target && ['VIDEO','AUDIO','SOURCE','IMG'].includes(event.target.tagName)) check();
    },{capture:true,signal:life.signal});
    document.addEventListener('play',function () { if (loginRequired || expiry && Date.now()/1000 >= expiry) check(); },{capture:true,signal:life.signal});
    function rememberPosition(event) {
        if (current() && event.target && ['VIDEO','AUDIO'].includes(event.target.tagName) && Number.isFinite(event.target.currentTime) && event.target.currentTime > 0) lastPosition = event.target.currentTime;
    }
    ['timeupdate','seeking','seeked','pause'].forEach(function (event) { document.addEventListener(event,rememberPosition,{capture:true,signal:life.signal}); });
    window.addEventListener('pagehide',function (event) { active = false; cancel(); if (!event.persisted) dispose(); },{signal:life.signal});
    window.addEventListener('pageshow',function () { if (!disposed) active = true; },{signal:life.signal});
    window.addEventListener('browserprofilechange',dispose,{signal:life.signal});
    window.InvidiousVerification = {check:check,dispose:dispose};
})();
