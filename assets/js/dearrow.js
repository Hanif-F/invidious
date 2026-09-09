'use strict';

(function () {
    var settings = document.getElementById('dearrow-config');
    if (!settings) return;
    var config = JSON.parse(settings.textContent);
    var requests = new Map();
    var seen = new WeakSet();
    var queue = [];
    var active = 0;

    function pump() {
        while (active < 4 && queue.length) {
            var job = queue.shift();
            active++;
            (function (job) {
                var controller = new AbortController();
                var timer = setTimeout(function () { controller.abort(); }, 10000);
                fetch('/api/v1/dearrow/' + encodeURIComponent(job.id), {signal: controller.signal})
                    .then(function (response) { return response.ok ? response.json() : null; })
                    .then(function (data) {
                        job.resolve(data && typeof data.title === 'string' && data.title.trim() ? data.title : null);
                    }).catch(function () { job.resolve(null); })
                    .finally(function () { clearTimeout(timer); active--; pump(); });
            })(job);
        }
    }

    function request(id) {
        if (!requests.has(id)) {
            requests.set(id, new Promise(function (resolve) { queue.push({id: id, resolve: resolve}); }));
            pump();
        }
        return requests.get(id);
    }

    function originalOnInteraction(element, original, replacement) {
        var trigger = element.closest('a') || element;
        var addedTabIndex = !trigger.hasAttribute('tabindex') && trigger.tagName !== 'A';
        if (addedTabIndex) trigger.tabIndex = 0;
        var hovered = element.matches(':hover');
        var focused = document.activeElement === trigger && trigger.matches(':focus-visible');
        function update() {
            element.textContent = hovered || focused ? original : replacement;
        }
        function enter() { hovered = true; update(); }
        function leave() { hovered = false; update(); }
        function focus() { focused = trigger.matches(':focus-visible'); update(); }
        function blur() { focused = false; update(); }
        element.addEventListener('mouseenter', enter);
        element.addEventListener('mouseleave', leave);
        trigger.addEventListener('focus', focus);
        trigger.addEventListener('blur', blur);
        // Undo can reinsert the same card. Remove listeners before restoring it.
        element.dearrowCleanup = function () {
            element.removeEventListener('mouseenter', enter);
            element.removeEventListener('mouseleave', leave);
            trigger.removeEventListener('focus', focus);
            trigger.removeEventListener('blur', blur);
            if (addedTabIndex) trigger.removeAttribute('tabindex');
        };
        update();
    }

    function replace(element) {
        var id = element.dataset.dearrowId;
        var original = element.textContent;
        request(id).then(function (title) {
            if (!element.isConnected || !title || title === original || element.dataset.dearrowOriginal !== undefined) return;
            element.dataset.dearrowOriginal = original;
            element.textContent = title;
            if (element.hasAttribute('data-dearrow-watch')) document.title = title + ' - Invidious';
            if (config.showOriginal) originalOnInteraction(element, original, title);
        });
    }

    var visible = typeof IntersectionObserver === 'function' ? new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
            if (entry.isIntersecting) { visible.unobserve(entry.target); replace(entry.target); }
        });
    }, {rootMargin: '200px'}) : null;

    function scan(root) {
        var elements = [];
        if (root.nodeType !== 1) return;
        if (root.matches('[data-dearrow-id]')) elements.push(root);
        elements = elements.concat(Array.from(root.querySelectorAll('[data-dearrow-id]')));
        elements.forEach(function (element) {
            if (seen.has(element) || !/^[A-Za-z0-9_-]{11}$/.test(element.dataset.dearrowId)) return;
            seen.add(element);
            if (visible && !element.hasAttribute('data-dearrow-watch')) visible.observe(element);
            else replace(element);
        });
    }

    new MutationObserver(function (records) {
        records.forEach(function (record) {
            record.addedNodes.forEach(scan);
            record.removedNodes.forEach(function (node) {
                if (node.nodeType !== 1 || node.isConnected) return;
                var elements = [node].concat(Array.from(node.querySelectorAll('[data-dearrow-id]')));
                elements.forEach(function (element) {
                    if (visible) visible.unobserve(element);
                    seen.delete(element);
                    if (element.dearrowCleanup) {
                        element.dearrowCleanup();
                        delete element.dearrowCleanup;
                    }
                    if (element.dataset.dearrowOriginal !== undefined) {
                        element.textContent = element.dataset.dearrowOriginal;
                        delete element.dataset.dearrowOriginal;
                    }
                });
            });
        });
    }).observe(document.body, {childList: true, subtree: true});
    scan(document.body);
})();
