'use strict';

(function () {
    var settings = document.getElementById('dearrow-config');
    if (!settings) return;
    var config = JSON.parse(settings.textContent);
    var requests = new Map();
    var seen = new WeakSet();
    var queue = [];
    var active = 0;
    var tooltipId = 0;

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

    function originalTooltip(element, original) {
        var trigger = element.closest('a') || element;
        var addedTabIndex = !trigger.hasAttribute('tabindex') && trigger.tagName !== 'A';
        if (addedTabIndex) trigger.tabIndex = 0;
        var tip = document.createElement('span');
        tip.id = 'dearrow-original-' + (++tooltipId);
        tip.className = 'dearrow-tooltip';
        tip.dir = 'auto';
        tip.setAttribute('role', 'tooltip');
        tip.textContent = config.originalLabel + ' ' + original;
        tip.hidden = true;
        document.body.appendChild(tip);
        var describedBy = trigger.getAttribute('aria-describedby');
        trigger.setAttribute('aria-describedby', (describedBy ? describedBy + ' ' : '') + tip.id);
        var hovered = trigger.matches(':hover');
        var focused = document.activeElement === trigger;
        var hideTimer;
        function update() {
            tip.hidden = !(hovered || focused);
            if (tip.hidden) return;
            var rect = trigger.getBoundingClientRect();
            tip.style.left = Math.max(8, Math.min(rect.left, window.innerWidth - tip.offsetWidth - 8)) + 'px';
            tip.style.top = Math.max(8, Math.min(rect.bottom + 4, window.innerHeight - tip.offsetHeight - 8)) + 'px';
        }
        function enter() { clearTimeout(hideTimer); hovered = true; update(); }
        function leave() {
            // Allow the pointer to cross the small gap to the tooltip itself.
            hideTimer = setTimeout(function () { hovered = false; update(); }, 100);
        }
        trigger.addEventListener('mouseenter', enter);
        trigger.addEventListener('mouseleave', leave);
        tip.addEventListener('mouseenter', enter);
        tip.addEventListener('mouseleave', leave);
        function focus() { focused = true; update(); }
        function blur() { focused = false; update(); }
        function keydown(event) {
            if (event.key === 'Escape') { hovered = false; focused = false; update(); }
        }
        trigger.addEventListener('focus', focus);
        trigger.addEventListener('blur', blur);
        trigger.addEventListener('keydown', keydown);
        // Undo can reinsert the same card. Restore its accessibility state on removal.
        element.dearrowCleanup = function () {
            clearTimeout(hideTimer);
            trigger.removeEventListener('mouseenter', enter);
            trigger.removeEventListener('mouseleave', leave);
            trigger.removeEventListener('focus', focus);
            trigger.removeEventListener('blur', blur);
            trigger.removeEventListener('keydown', keydown);
            if (describedBy) trigger.setAttribute('aria-describedby', describedBy);
            else trigger.removeAttribute('aria-describedby');
            if (addedTabIndex) trigger.removeAttribute('tabindex');
            tip.remove();
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
            if (config.showOriginal) originalTooltip(element, original);
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
