'use strict';
(function () {
    var settings = document.getElementById('channel-spoiler-config');
    if (!settings || !window.InvidiousStorage) return;
    var config = JSON.parse(settings.textContent);
    if (window.InvidiousStorage.scope === 'guest') config.now = Math.floor(Date.now() / 1000);
    var rules = window.InvidiousStorage.scope === 'guest'
        ? window.InvidiousStorage.local.get('channel_spoiler_settings') || {} : config.rules;
    // Keep cross-tab activation working even when this page has no rules.
    if (window.InvidiousStorage.scope === 'guest') window.addEventListener('storage', function (event) {
        if (window.InvidiousStorage.local.matchesEvent(event, 'channel_spoiler_settings')) location.reload();
    });
    if (!Object.keys(rules).length) return;
    var titles = new WeakSet();
    var thumbnails = new WeakSet();
    var requestTitle;
    var mainDisplay;
    var pageTitle = config.page && decision(config.page.channel, config.page.published, 'title');
    var pageImage = config.page && decision(config.page.channel, config.page.published, 'thumbnail');

    function text(element, value) {
        if (element.textContent !== value) element.textContent = value;
    }
    function attribute(element, name, value) {
        if (element.getAttribute(name) !== value) element.setAttribute(name, value);
    }

    function decision(channel, published, kind) {
        var rule = rules[channel];
        var known = Number.isFinite(published) && published >= 1104537600;
        var hidden = !!rule && !!rule['hide_' + kind] && (rule.reveal_after_days === null || rule.reveal_after_days === undefined ||
            !known || config.now < published + rule.reveal_after_days * 86400);
        return {hidden: hidden, label: config.labels[kind + '_hidden' + (known ? '' : '_unknown')]};
    }
    function state(element, kind) {
        var value = element.dataset.spoilerPublished;
        return decision(element.dataset.spoilerChannel, value ? Number(value) : NaN, kind);
    }
    function updateMain(text) {
        mainDisplay = text;
        if (document.title !== text + ' - Invidious') document.title = text + ' - Invidious';
        if (window.player_data) window.player_data.title = text;
        if (window.shareOptions) window.shareOptions.title = text;
        document.querySelectorAll('.vjs-overlay [data-spoiler-title]').forEach(function (element) {
            if (element.textContent !== text) element.textContent = text;
        });
    }
    function title(element) {
        if (titles.has(element)) return;
        var result = state(element, 'title');
        attribute(element, 'data-spoiler-hidden', String(result.hidden));
        if (!result.hidden) { titles.add(element); return; }
        if (element.dearrowCleanup) element.dearrowCleanup();
        text(element, result.label);
        var original = element.dataset.spoilerOriginal;
        var row = element.closest('[data-dearrow-row]');
        if (!row) return;
        var button = document.createElement('button');
        button.type = 'button'; button.className = 'dearrow-reveal spoiler-title-reveal';
        button.setAttribute('aria-label', config.labels.reveal_title);
        var entry = {index: 0, replacement: null, loading: false};
        titles.add(element);
        row.classList.add('dearrow-title-row');
        row.appendChild(button);
        if (element.hasAttribute('data-dearrow-watch')) updateMain(result.label);
        function show(index) {
            entry.index = index;
            var text = index === 0 ? result.label : index === 1 && entry.replacement ? entry.replacement : original;
            if (element.textContent !== text) element.textContent = text;
            button.setAttribute('aria-label', index === 0 ? config.labels.reveal_title :
                index === 1 && entry.replacement ? config.labels.next_original : config.labels.hide_title);
            button.setAttribute('aria-pressed', String(index !== 0));
            if (element.hasAttribute('data-dearrow-watch')) updateMain(text);
        }
        button.addEventListener('click', function () {
            if (!window.InvidiousStorage.isCurrent() || entry.loading) return;
            if (entry.index !== 0) { show(entry.index === 1 && entry.replacement ? 2 : 0); return; }
            if (!config.dearrow || !requestTitle || !element.dataset.dearrowId) { show(2); return; }
            entry.loading = true; button.disabled = true; button.setAttribute('aria-label', config.labels.loading);
            requestTitle(element.dataset.dearrowId).then(function (replacement) {
                if (!window.InvidiousStorage.isCurrent()) return;
                entry.replacement = replacement && replacement !== original ? replacement : null;
                show(entry.replacement ? 1 : 2);
            }).finally(function () { entry.loading = false; button.disabled = false; });
        });
    }
    function thumbnail(element) {
        if (thumbnails.has(element)) return;
        thumbnails.add(element);
        var result = state(element, 'thumbnail');
        attribute(element, 'data-spoiler-hidden', String(result.hidden));
        if (!result.hidden) return;
        var placeholder = element.firstElementChild;
        if (!placeholder || !placeholder.classList.contains('spoiler-placeholder')) {
            placeholder = document.createElement('span');
            placeholder.className = 'spoiler-placeholder';
            placeholder.textContent = result.label;
            element.replaceChildren(placeholder);
        } else text(placeholder, result.label);
        var link = element.closest('a');
        if (link) { link.setAttribute('aria-label', config.labels.reveal_thumbnail); link.tabIndex = 0; }
        else { element.tabIndex = 0; element.setAttribute('role', 'button'); }
        element.setAttribute('aria-label', config.labels.reveal_thumbnail);
        function reveal(event) {
            if (element.dataset.spoilerHidden !== 'true' || !window.InvidiousStorage.isCurrent()) return;
            if (link && event.type === 'click' && event.target !== element && !element.contains(event.target) && event.detail !== 0) return;
            event.preventDefault(); event.stopImmediatePropagation();
            var img = document.createElement('img');
            img.src = element.dataset.spoilerOriginal; img.alt = ''; img.className = 'thumbnail';
            element.replaceChildren(img); element.dataset.spoilerHidden = 'false';
            element.removeAttribute('aria-label');
            if (link) link.removeAttribute('aria-label');
        }
        (link || element).addEventListener('click', reveal, true);
        (link || element).addEventListener('keydown', function (event) {
            if ((!link || event.target === link) && (event.key === 'Enter' || event.key === ' ')) reveal(event);
        });
    }
    function scan(root) {
        if (root.nodeType !== 1) return;
        if (config.page) {
            var display = (mainDisplay || pageTitle.label) + ' - Invidious';
            if (root.tagName === 'TITLE' && pageTitle.hidden && root.textContent !== display) root.textContent = display;
            if (root.tagName === 'META') {
                var name = root.getAttribute('property') || root.getAttribute('name');
                if (pageTitle.hidden && ['og:title', 'twitter:title'].includes(name)) attribute(root, 'content', pageTitle.label);
                if (pageImage.hidden && ['thumbnail', 'og:image', 'twitter:image'].includes(name)) attribute(root, 'content', '');
            }
        }
        function visit(element) {
            if (element.hasAttribute('data-spoiler-title')) title(element);
            if (element.hasAttribute('data-spoiler-thumbnail')) thumbnail(element);
        }
        visit(root);
        if (root.childElementCount) root.querySelectorAll('[data-spoiler-title], [data-spoiler-thumbnail]').forEach(visit);
    }
    // Runs in the head, so guest rules also apply before the first paint and
    // before scripts initialize the player. Mutations cover continuation queues.
    new MutationObserver(function (records) {
        var roots = new Set();
        records.forEach(function (record) {
            if (record.target.nodeType === 1 && record.target.tagName === 'TITLE') roots.add(record.target);
            record.addedNodes.forEach(function (node) { if (node.nodeType === 1 && node.isConnected) roots.add(node); });
        });
        roots.forEach(function (root) {
            for (var parent = root.parentElement; parent; parent = parent.parentElement) {
                if (roots.has(parent)) return;
            }
            scan(root);
        });
    }).observe(document.documentElement, {childList: true, subtree: true});
    window.InvidiousSpoilers = {
        decision: decision,
        scan: scan,
        bindDeArrow: function (request) { requestTitle = request; },
        player: function (data, channel, published) {
            var titleState = decision(channel, published, 'title');
            var imageState = decision(channel, published, 'thumbnail');
            if (titleState.hidden) { data.title = titleState.label; document.title = data.title + ' - Invidious'; }
            if (imageState.hidden) data.thumbnail = '';
            data.spoiler_thumbnail_hidden = imageState.hidden;
            return data;
        }
    };
    scan(document.documentElement);
    document.querySelectorAll('title, meta').forEach(scan);
}());
