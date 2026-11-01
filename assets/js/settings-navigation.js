'use strict';
// Search metadata is shared by category fragments and dedicated editor pages.
(function () {
    var node = document.getElementById('settings-navigation-config'), root = document.querySelector('.settings-layout');
    if (!node || !root || root.dataset.settingsNavigation) return;
    root.dataset.settingsNavigation = 'true';
    var config = JSON.parse(node.textContent), life = new AbortController();
    var legacy = document.querySelector('[data-settings-legacy-entry]');
    function legacyDestination() {
        if (!legacy || !legacy.isConnected || !location.hash || location.pathname !== '/preferences' || new URLSearchParams(location.search).has('section')) return;
        var anchor;
        try { anchor = decodeURIComponent(location.hash.slice(1)); } catch (_) { return; }
        var link = document.getElementById(anchor);
        if (!link || link.parentElement !== legacy) return;
        var target = new URL(link.href, location.href);
        if (target.origin === location.origin && target.href !== location.href) location.replace(target.href);
    }
    legacyDestination();
    window.addEventListener('hashchange',legacyDestination,{signal:life.signal});
    var search = root.querySelector('#settings-search'), results = root.querySelector('#settings-search-results'), status = root.querySelector('#settings-search-status');
    search.addEventListener('input',function () {
        var query = search.value.trim().toLocaleLowerCase(); results.replaceChildren(); results.hidden = !query;
        root.querySelector('.settings-nav').hidden = !!query;
        if (!query) { status.textContent = ''; return; }
        var matches = config.search.filter(function (entry) {
            return [entry.category,entry.label,entry.description || '',entry.features || ''].join(' ').toLocaleLowerCase().includes(query);
        });
        matches.forEach(function (entry) {
            var link = document.createElement('a'); link.href = entry.url ? entry.url+(entry.url.includes('?')?'&':'?')+'field='+encodeURIComponent(entry.field) : '/preferences?section='+encodeURIComponent(entry.section)+'&field='+encodeURIComponent(entry.field);
            if (entry.navigation === 'category') { link.dataset.settingsCategory = entry.section; link.dataset.settingsField = entry.field; }
            link.textContent = entry.label+' · '+entry.category; results.append(link);
        });
        status.textContent = matches.length ? '' : InvidiousUI.label('no_matches');
    },{signal:life.signal});
    root.querySelector('[data-settings-search]').hidden = false;
    window.addEventListener('browserprofilechange',function () { life.abort(); },{signal:life.signal});
    window.addEventListener('pagehide',function (event) { if (!event.persisted) life.abort(); },{signal:life.signal});
})();
