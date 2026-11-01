'use strict';
(function () {
    var trigger = document.getElementById('create-clip'), node = document.getElementById('clip-config');
    if (!trigger || !node || trigger.dataset.clipLoader) return;
    trigger.dataset.clipLoader = 'true';
    var config = JSON.parse(node.textContent), storage = InvidiousStorage, life = new AbortController(), epoch = 0, active = true, disposed = false, pending = false, nodes = new Set();
    var label = trigger.querySelector('[data-clip-label]'), originalLabel = label ? label.textContent : trigger.textContent, status = document.getElementById('clip-load-status');
    function current() { return active && !disposed && trigger.isConnected && storage.isCurrent(); }
    window.InvidiousClipLoader = {isCurrent:current};
    function finish() { pending = false; trigger.removeAttribute('aria-busy'); if (label) label.textContent = originalLabel; if (status) status.textContent = ''; }
    function stop() { epoch++; nodes.forEach(function (node) { node.onload = node.onerror = null; node.remove(); }); nodes.clear(); finish(); }
    function asset(tag,url,token) {
        return new Promise(function (resolve,reject) {
            var element = document.createElement(tag); nodes.add(element);
            if (tag === 'link') { element.rel = 'stylesheet'; element.href = url; } else element.src = url;
            element.onload = function () { nodes.delete(element); if (tag !== 'link') element.remove(); if (!current() || token !== epoch) { element.remove(); return resolve(false); } element.onload = element.onerror = null; resolve(true); };
            element.onerror = function () { nodes.delete(element); element.remove(); if (!current() || token !== epoch) return resolve(false); reject(new Error(config.error)); };
            document.head.appendChild(element);
        });
    }
    async function open(event,requestedTime) {
        var time = requestedTime === undefined ? Number(window.player && player.currentTime()) : Number(requestedTime);
        if (!Number.isFinite(time) || time < 0) time = 0;
        var fallback = new URL(trigger.href,location.origin); fallback.searchParams.set('startTime',String(Math.floor(time))); trigger.href = fallback.pathname+fallback.search;
        if (event && (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey)) return;
        if (!current()) return;
        if (!config.signed_in) {
            if (event) event.preventDefault();
            var back = new URL(location.href); back.searchParams.set('create_clip','1'); back.searchParams.set('t',String(time));
            location.assign('/login?referer='+encodeURIComponent(back.pathname+back.search)); return;
        }
        if (!window.InvidiousWatchClipPanel || !window.InvidiousClipPlayer) return;
        if (event) event.preventDefault();
        if (window.InvidiousClipEditor) { if (!document.hidden && !InvidiousClipEditor.open(time)) location.assign(fallback.pathname+fallback.search); return; }
        if (pending) return;
        pending = true; var token = ++epoch; trigger.setAttribute('aria-busy','true'); if (label) label.textContent = config.loading; if (status) status.textContent = config.loading;
        try {
            if (!document.querySelector('link[data-clip-style]')) {
                var loaded = await asset('link',config.style,token); if (!loaded) return;
                var style = Array.from(document.querySelectorAll('link[rel=stylesheet]')).find(function (node) { return node.href === new URL(config.style,location.href).href; }); if (style) style.dataset.clipStyle = 'true';
            }
            if (!window.InvidiousClipSession && !await asset('script',config.session,token)) return;
            if (!current() || token !== epoch) return;
            if (!await asset('script',config.script,token)) return;
            if (!current() || token !== epoch || document.hidden) return;
            if (!window.InvidiousClipEditor || !InvidiousClipEditor.open(time)) throw new Error(config.error);
        } catch (_) { if (current() && token === epoch && !document.hidden) location.assign(fallback.pathname+fallback.search); }
        finally { if (current() && token === epoch) finish(); }
    }
    trigger.addEventListener('click',open,{signal:life.signal});
    window.addEventListener('pagehide',function (event) { active = false; stop(); if (!event.persisted) { disposed = true; life.abort(); } },{signal:life.signal});
    window.addEventListener('pageshow',function () { active = !disposed; },{signal:life.signal});
    window.addEventListener('browserprofilechange',function () { active = false; disposed = true; stop(); life.abort(); },{signal:life.signal});
    var url = new URL(location.href);
    if (config.signed_in && url.searchParams.get('create_clip') === '1') {
        url.searchParams.delete('create_clip'); history.replaceState(history.state,'',url.pathname+url.search+url.hash);
        var requested = Number(url.searchParams.get('t'));
        function reopen() { open(undefined,Number.isFinite(requested) && requested >= 0 ? requested : undefined); }
        if (document.readyState !== 'complete') window.addEventListener('DOMContentLoaded',reopen,{once:true,signal:life.signal}); else reopen();
    }
})();
