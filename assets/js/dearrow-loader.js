'use strict';
(function () {
    var button = document.getElementById('dearrow-open'), node = document.getElementById('dearrow-contribution-config'), dialog = document.getElementById('dearrow-dialog');
    if (!button || !node || !dialog || button.dataset.dearrowLoader) return;
    button.dataset.dearrowLoader = 'true'; dialog.dataset.dearrowActive = 'true';
    var config = JSON.parse(node.textContent), life = new AbortController(), epoch = 0, pending = false, active = true, disposed = false, timer, style, script;
    function alive() { return active && !disposed && button.isConnected && dialog.isConnected && InvidiousStorage.scope === config.profile && InvidiousStorage.isCurrent(); }
    function clean() { clearTimeout(timer); if (style) { style.onload = style.onerror = null; if (style.dataset.dearrowStyleReady !== 'true') style.remove(); } if (script) { script.onload = script.onerror = null; script.remove(); } style = script = null; pending = false; }
    function restore() { button.disabled = disposed; button.removeAttribute('aria-busy'); }
    function cancel() { epoch++; clean(); restore(); }
    function fail(generation) {
        if (!alive() || generation !== epoch) return;
        cancel(); InvidiousUI.notice(InvidiousUI.label('error'), function () { if (alive()) load(); });
    }
    function load() {
        if (!alive() || pending) return;
        if (dialog.dearrowController) { dialog.dearrowController.show(); return; }
        var generation = ++epoch; pending = true; button.disabled = true; button.setAttribute('aria-busy', 'true');
        var stylesheet = document.querySelector('link[data-dearrow-style]') || document.createElement('link'), module = document.createElement('script');
        style = stylesheet; script = module;
        stylesheet.dataset.dearrowStyle = ''; stylesheet.rel = 'stylesheet'; stylesheet.href = config.style;
        module.src = config.script;
        stylesheet.onerror = module.onerror = function () { fail(generation); };
        stylesheet.onload = function () {
            if (!alive() || generation !== epoch) return;
            stylesheet.dataset.dearrowStyleReady = 'true'; document.head.append(module);
        };
        module.onload = function () {
            if (!alive() || generation !== epoch) return;
            if (!dialog.dearrowController) { fail(generation); return; }
            clearTimeout(timer); pending = false; restore();
            // Keep the loaded feature CSS/script; only pending nodes are canceled.
            stylesheet.onload = stylesheet.onerror = null; module.onload = module.onerror = null; style = script = null;
            InvidiousUI.dismissNotice(); dialog.dearrowController.show();
        };
        timer = setTimeout(function () { fail(generation); }, 15000);
        if (stylesheet.dataset.dearrowStyleReady === 'true') document.head.append(module); else document.head.append(stylesheet);
    }
    function dispose() { if (disposed) return; disposed = true; active = false; dialog.dataset.dearrowActive = 'false'; dialog.dataset.dearrowDisposed = 'true'; cancel(); life.abort(); observer.disconnect(); }
    button.addEventListener('click', load, {signal: life.signal});
    window.addEventListener('pagehide', function (event) { active = false; dialog.dataset.dearrowActive = 'false'; if (pending) cancel(); if (!event.persisted) dispose(); }, {signal: life.signal});
    window.addEventListener('pageshow', function () { active = !disposed; dialog.dataset.dearrowActive = String(active); if (!alive()) dispose(); }, {signal: life.signal});
    window.addEventListener('browserprofilechange', dispose, {signal: life.signal});
    var observer = new MutationObserver(function () { if (!button.isConnected || !dialog.isConnected) dispose(); }); observer.observe(document.body, {childList: true, subtree: true});
})();
