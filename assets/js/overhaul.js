'use strict';
// Shared browser primitives with bounded page and appended-region lifetimes.
(function () {
    if (!document.body.hasAttribute('data-overhaul') || document.body.dataset.uiInitialized) return;
    document.body.dataset.uiInitialized = 'true';
    var ui = window.InvidiousUI, storage = window.InvidiousStorage;
    var lifetime = new AbortController();
    var seenMenus = new WeakSet(), seenDialogs = new WeakSet(), seenDialogPanels = new WeakSet();
    var owners = new Set(), dialogReturns = new WeakMap();
    var menus = new Set(), disposeReorder = function () {};
    function on(element, type, listener, options) {
        element.addEventListener(type, listener, Object.assign({signal:lifetime.signal}, options));
    }
    function candidates(root, selector) {
        var nodes = Array.from(root.querySelectorAll(selector));
        if (root.matches && root.matches(selector)) nodes.unshift(root);
        return nodes;
    }
    var words = JSON.parse(document.getElementById('overhaul-config').textContent);
    var phone = ui.phoneViewport, phoneOpen = false;
    var watch = document.body.dataset.page === 'watch';
    var toggle = document.getElementById('sidebar-toggle');
    var sidebar = document.getElementById('app-sidebar');
    var disclosure = document.getElementById('app-navigation');
    var headerTop = document.querySelector('.app-header-top');
    var scrim = document.querySelector('.nav-scrim');
    var collapsed = watch || storage.local.get('navigation_collapsed') === true;
    var navigationBackground = new Map(), lockedScroll;
    function drawerOpen() { return phone.matches ? phoneOpen : watch && !collapsed; }
    function measureHeader() {
        if (!phone.matches) {
            document.documentElement.style.removeProperty('--measured-header');
            return;
        }
        document.documentElement.style.setProperty('--measured-header', headerTop.offsetHeight + 'px');
        if (phoneOpen) document.body.style.setProperty('--drawer-top', Math.max(0, headerTop.getBoundingClientRect().bottom) + 'px');
    }
    function navigation() {
        var drawer = drawerOpen();
        document.body.dataset.navCollapsed = String(!phone.matches && collapsed);
        document.body.dataset.navDrawer = String(drawer);
        disclosure.open = !phone.matches || drawer;
        scrim.hidden = !drawer;
        toggle.setAttribute('aria-expanded', String(phone.matches ? drawer : !collapsed));
        if (drawer) {
            document.querySelectorAll('.skip-link, .brand, .header-search, .header-actions, .app-main, .app-footer, .ui-notice').forEach(function (element) {
                if (!navigationBackground.has(element)) navigationBackground.set(element, element.inert);
                element.inert = true;
            });
        } else {
            navigationBackground.forEach(function (inert, element) { element.inert = inert; });
            navigationBackground.clear();
        }
        var shouldLock = phone.matches && drawer;
        if (!shouldLock && lockedScroll) {
            document.documentElement.removeAttribute('data-phone-scroll-lock');
            window.scrollTo(lockedScroll.x, lockedScroll.y);
            lockedScroll = null;
        }
        measureHeader();
    }
    function closeNavigation(focus) {
        if (!drawerOpen()) return;
        if (phone.matches) phoneOpen = false;
        else collapsed = true;
        navigation();
        if (focus) toggle.focus({preventScroll:true});
    }
    function resetNavigation() {
        var wasOpen = document.body.dataset.navDrawer === 'true';
        var focus = wasOpen || sidebar.contains(document.activeElement) || scrim === document.activeElement;
        phoneOpen = false;
        collapsed = watch || storage.local.get('navigation_collapsed') === true;
        navigation();
        if (focus && (wasOpen || phone.matches || watch)) toggle.focus({preventScroll:true});
    }
    on(toggle, 'click', function () {
        if (drawerOpen()) { closeNavigation(true); return; }
        if (phone.matches) {
            phoneOpen = true;
            lockedScroll = {x: window.scrollX, y: window.scrollY};
            document.documentElement.setAttribute('data-phone-scroll-lock', '');
        } else collapsed = !collapsed;
        navigation();
        if (drawerOpen()) {
            if (phone.matches) sidebar.scrollTop = 0;
            var first = sidebar.querySelector('a[href]');
            if (first) first.focus({preventScroll:true});
        }
        if (!phone.matches && !watch && !storage.local.set('navigation_collapsed', collapsed)) ui.notice(ui.label('page_only'));
    });
    on(scrim, 'click', function () { closeNavigation(true); });
    on(phone, 'change', resetNavigation);
    on(window, 'browserprofilechange', function () { closeNavigation(true); });
    on(window, 'storage', function (event) {
        if (event.key !== null && event.key !== storage.local.key('navigation_collapsed')) return;
        if (!watch && !phone.matches && storage.isCurrent()) {
            collapsed = storage.local.get('navigation_collapsed') === true;
            navigation();
        }
    });
    on(window, 'pageshow', function (event) { if (event.persisted) resetNavigation(); });
    var headerResize = new ResizeObserver(measureHeader);
    headerResize.observe(headerTop);
    navigation();
    document.body.dataset.navReady = 'true';
    toggle.hidden = false;
    function closeMenu(menu, restore) {
        menu.open = false;
        if (restore) menu.querySelector('summary').focus();
    }
    function positionMenu(menu) {
        if (!menu.open || !menu.isConnected) return;
        var panel = menu.querySelector('.menu-content'), summary = menu.querySelector('summary');
        if (!panel || !summary) return;
        var anchor = summary.getBoundingClientRect();
        var bounds = ui.visibleBounds(), gap = 8;
        var visibleTop = bounds.top;
        if (!menu.closest('.app-header-top') && getComputedStyle(headerTop).position === 'sticky') {
            visibleTop = Math.max(visibleTop, headerTop.getBoundingClientRect().bottom);
        }
        var scroller = menu.parentElement.closest('.app-sidebar, .channel-core-tabs');
        var clip = scroller ? scroller.getBoundingClientRect() : bounds;
        if (anchor.bottom <= Math.max(visibleTop, clip.top) || anchor.top >= Math.min(bounds.bottom, clip.bottom)
            || anchor.right <= Math.max(bounds.left, clip.left) || anchor.left >= Math.min(bounds.right, clip.right)) {
            var restore = panel.contains(document.activeElement);
            closeMenu(menu, false);
            if (restore) summary.focus({preventScroll:true});
            return;
        }
        var width = Math.max(0, bounds.right - bounds.left - 2 * gap);
        var height = Math.max(0, bounds.bottom - bounds.top - 2 * gap);
        panel.style.position = 'fixed';
        panel.style.inset = 'auto';
        panel.style.width = 'max-content';
        panel.style.minWidth = Math.min(240, width) + 'px';
        panel.style.maxWidth = Math.min(360, width) + 'px';
        panel.style.maxHeight = height + 'px';
        var rect = panel.getBoundingClientRect(), rtl = getComputedStyle(menu).direction === 'rtl';
        var left = rtl ? anchor.left : anchor.right - rect.width;
        var below = bounds.bottom - anchor.bottom - gap, above = anchor.top - visibleTop - gap;
        var drop = below >= rect.height || below >= above;
        // Leave the anchor visible when there is useful room on either side.
        var available = Math.max(below, above) - 4;
        if (available >= 88) panel.style.maxHeight = Math.min(height, available) + 'px';
        var panelHeight = panel.getBoundingClientRect().height;
        var top = drop ? anchor.bottom + 4 : anchor.top - panelHeight - 4;
        panel.style.left = Math.max(bounds.left + gap, Math.min(left, bounds.right - rect.width - gap)) + 'px';
        panel.style.top = Math.max(bounds.top + gap, Math.min(top, bounds.bottom - panelHeight - gap)) + 'px';
    }
    function positionMenus() { menus.forEach(positionMenu); }
    on(window, 'resize', positionMenus);
    on(document, 'scroll', positionMenus, {capture:true});
    if (window.visualViewport) {
        on(window.visualViewport, 'resize', positionMenus);
        on(window.visualViewport, 'scroll', positionMenus);
    }
    var menuResize = new ResizeObserver(function (entries) {
        entries.forEach(function (entry) {
            var menu = entry.target.closest('[data-ui-menu]');
            if (menu && menus.has(menu)) positionMenu(menu);
        });
    });
    function own(root, seen) {
        var controller = new AbortController();
        owners.add({root:root, seen:seen, controller:controller});
        return {signal:controller.signal};
    }
    function sweep() {
        owners.forEach(function (entry) {
            if (entry.root.isConnected) return;
            entry.controller.abort(); entry.seen.delete(entry.root);
            if (menus.has(entry.root)) {
                var panel = entry.root.querySelector('.menu-content');
                if (panel) menuResize.unobserve(panel);
            }
            menus.delete(entry.root); dialogReturns.delete(entry.root); owners.delete(entry);
        });
    }
    function initMenus(root) {
        candidates(root, '[data-ui-menu]').forEach(function (menu) {
            if (seenMenus.has(menu)) return;
            var summary = menu.querySelector('summary');
            if (!summary) return;
            seenMenus.add(menu); menus.add(menu);
            var panel = menu.querySelector('.menu-content');
            if (panel) menuResize.observe(panel);
            var options = own(menu, seenMenus);
            function listen(type, listener) { on(menu, type, listener, options); }
            summary.setAttribute('aria-expanded', String(menu.open));
            if (menu.open) { positionMenu(menu); menus.forEach(function (other) { if (other !== menu && other.open) closeMenu(other, false); }); }
            listen('toggle', function () {
                summary.setAttribute('aria-expanded', String(menu.open));
                if (menu.open) { positionMenu(menu); menus.forEach(function (other) { if (other !== menu && other.open) closeMenu(other, false); }); }
            });
            listen('keydown', function (event) {
                if (event.key === 'Escape' && menu.open) { event.preventDefault(); event.stopPropagation(); closeMenu(menu, true); }
                else if (['ArrowDown','ArrowUp','Home','End'].includes(event.key)) {
                    if (event.target.closest('input, textarea, select, [contenteditable]')) return;
                    event.preventDefault(); menu.open = true; positionMenu(menu);
                    var items = Array.from(menu.querySelectorAll('.menu-content a, .menu-content button:not(:disabled)')).filter(function (item) { return item.getClientRects().length; });
                    if (!items.length) return;
                    var index = items.indexOf(document.activeElement);
                    index = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : event.key === 'ArrowUp' ? (index <= 0 ? items.length - 1 : index - 1) : (index + 1) % items.length;
                    items[index].focus();
                }
            });
            listen('click', function (event) { if (event.target.closest('a[href]')) closeMenu(menu, false); });
            listen('focusout', function (event) {
                if (event.relatedTarget && menu.contains(event.relatedTarget)) return;
                setTimeout(function () { if (!options.signal.aborted && menu.isConnected && menu.open && !menu.contains(document.activeElement)) closeMenu(menu, false); }, 0);
            });
        });
    }
    on(document, 'click', function (event) {
        sweep();
        menus.forEach(function (menu) { if (menu.open && !menu.contains(event.target)) closeMenu(menu, false); });
        if (drawerOpen() && sidebar.contains(event.target) && event.target.closest('a[href]')) closeNavigation(false);
        else if (drawerOpen() && !sidebar.contains(event.target) && !toggle.contains(event.target)) closeNavigation(true);
    });
    var help = document.getElementById('shortcut-help');
    function initDialogPanel(dialog) {
        if (seenDialogPanels.has(dialog)) return;
        seenDialogPanels.add(dialog);
        on(dialog, 'close', function () {
            var returnTo = dialogReturns.get(dialog); dialogReturns.delete(dialog);
            if (returnTo && returnTo.isConnected) returnTo.focus();
        }, own(dialog, seenDialogPanels));
    }
    function openDialog(dialog) {
        if (!dialog || dialog.open || document.querySelector('dialog:modal')) return;
        initDialogPanel(dialog);
        menus.forEach(function (menu) { if (menu.open) closeMenu(menu, true); });
        dialogReturns.set(dialog, document.activeElement); ui.showModal(dialog);
    }
    function openHelp() { openDialog(help); }
    function initDialogs(root) {
        candidates(root, '[data-open-dialog]').forEach(function (trigger) {
            if (seenDialogs.has(trigger)) return;
            var dialog = document.getElementById(trigger.dataset.openDialog);
            if (!dialog) return;
            seenDialogs.add(trigger); initDialogPanel(dialog);
            on(trigger, 'click', function () { openDialog(dialog); }, own(trigger, seenDialogs));
        });
    }
    var helpTrigger = document.querySelector('[data-shortcut-help]');
    on(helpTrigger, 'click', openHelp);
    helpTrigger.hidden = false;
    on(document.querySelector('[data-ui-dismiss]'), 'click', ui.dismissNotice);
    on(document, 'keydown', function (event) {
        if (event.defaultPrevented || event.isComposing || event.ctrlKey || event.altKey || event.metaKey) return;
        if (event.key === 'Tab' && drawerOpen() && !document.querySelector('dialog[open]')) {
            var controls = [toggle].concat(Array.from(sidebar.querySelectorAll('a[href], button:not(:disabled)')).filter(function (element) { return element.getClientRects().length; }));
            var index = controls.indexOf(document.activeElement);
            var direction = event.shiftKey ? -1 : 1;
            var nextIndex = index < 0 ? (event.shiftKey ? controls.length - 1 : 0) : (index + direction + controls.length) % controls.length;
            var next = controls[nextIndex];
            event.preventDefault();
            next.focus({preventScroll:true});
            if (next !== toggle) next.scrollIntoView({block:'nearest',inline:'nearest'});
            return;
        }
        if (event.key === 'Escape') { if (!document.querySelector('dialog[open]')) closeNavigation(true); return; }
        if (event.target.closest('input,textarea,select,button,a,summary,[contenteditable],dialog')) return;
        if (event.key === '?') { event.preventDefault(); openHelp(); }
        else if (event.key === '/') {
            var search = document.getElementById('searchbox');
            if (search && !drawerOpen()) { event.preventDefault(); search.focus(); }
        }
    });
    var channelTabs = document.querySelector('.channel-core-tabs');
    function revealTab(tab) {
        if (!phone.matches || !tab) return;
        var rect = tab.getBoundingClientRect(), strip = channelTabs.getBoundingClientRect();
        if (rect.left < strip.left) channelTabs.scrollLeft += rect.left - strip.left - 4;
        else if (rect.right > strip.right) channelTabs.scrollLeft += rect.right - strip.right + 4;
    }
    if (channelTabs) {
        function revealSelectedTab() { revealTab(channelTabs.querySelector('[aria-current="page"]')); }
        on(channelTabs, 'focusin', function (event) { revealTab(event.target); });
        on(phone, 'change', revealSelectedTab);
        revealSelectedTab();
    }
    function init(root) { sweep(); initMenus(root); initDialogs(root); }
    on(document, 'iv:content-added', function (event) {
        var root = event.detail && (event.detail.root || event.detail.container || event.detail);
        init(root && root.querySelectorAll ? root : document);
    });
    on(document,'iv:library-change',sweep);
    init(document);
    var list = document.querySelector('.media-rows[data-playlist-id]');
    if (list && list.querySelector('.playlist-grip')) {
        var source, target, placement, grabbed = false, pending = false, stale = false, scrollFrame;
        var status = document.querySelector('[data-order-status]');
        var collection = list.closest('[data-collection]'), request, activePage = true, reorderEpoch = 0;
        var offset = Number(list.dataset.orderOffset) || 0;
        function alive() { return activePage && !lifetime.signal.aborted && list.isConnected && storage.isCurrent(); }
        function collectionBusy() { return collection && (collection.dataset.selecting === 'true' || collection.dataset.collectionBusy === 'true'); }
        function signalPending(value) { document.dispatchEvent(new CustomEvent('iv:order-pending',{detail:{list:list,pending:value}})); }
        function invalidate() { stale = true; list.setAttribute('aria-invalid','true'); updateMoves(); }
        function blocked() { return pending || stale || list.getAttribute('aria-invalid') === 'true' || !alive() || collectionBusy(); }
        function reorderControl(row) { return row.querySelector(phone.matches ? '.video-context > summary' : '.playlist-grip'); }
        function updateMoves() {
            var items = rows(), disabled = blocked();
            items.forEach(function (row, index) {
                row.querySelector('.playlist-grip').disabled = disabled;
                row.querySelector('.playlist-move-actions').hidden = false;
                row.querySelector('[data-playlist-move=up]').disabled = disabled || index === 0;
                row.querySelector('[data-playlist-move=down]').disabled = disabled || index === items.length - 1;
            });
        }
        list.dataset.reorderReady = 'true';
        var phoneHelp = document.querySelector('.order-help-phone');
        if (phoneHelp) phoneHelp.hidden = false;
        function rows() { return Array.from(list.querySelectorAll('[data-occurrence]')).filter(function (row) { return row.querySelector('.playlist-grip'); }); }
        function announce(text) { status.textContent = text; }
        function clearIndicators() { rows().forEach(function (row) { delete row.dataset.drop; row.classList.remove('is-dragging'); row.querySelector('.playlist-grip').setAttribute('aria-pressed', 'false'); }); }
        function cancel(text) {
            var capture = pointer; pointer = null;
            if (capture && capture.handle.hasPointerCapture(capture.id)) capture.handle.releasePointerCapture(capture.id);
            clearIndicators(); cancelAnimationFrame(scrollFrame); scrollFrame = null;
            if (source) reorderControl(source).focus();
            source = target = null; grabbed = false;
            if (text) announce(text);
        }
        function indicate(anchor, where) {
            rows().forEach(function (row) { delete row.dataset.drop; });
            target = anchor; placement = where;
            if (anchor && anchor !== source) anchor.dataset.drop = where;
        }
        async function commit() {
            if (!source || !target || source === target || blocked()) { cancel(); return; }
            var row = source, anchor = target, where = placement, generation = reorderEpoch;
            var recovery;
            clearIndicators(); cancelAnimationFrame(scrollFrame); pending = true; grabbed = false; signalPending(true);
            updateMoves();
            try {
                request = new AbortController();
                var saved = await ui.request('/playlist_ajax?action=move_video_before&redirect=false&playlist_id=' + encodeURIComponent(list.dataset.playlistId), {method:'POST',body:new URLSearchParams({csrf_token:ui.config.csrf,source:row.dataset.occurrence,anchor:anchor.dataset.occurrence,placement:where,include_positions:'1'}),signal:request.signal});
                if (!alive() || generation !== reorderEpoch) return;
                var positions = ui.playlistOrder(list,saved);
                announce(words.order_saved + ' ' + row.querySelector('.media-title').textContent.trim() + '. ' + words.order_position.replace('{position}',positions[row.dataset.occurrence]).replace('{count}',saved.total));
            } catch (error) {
                invalidate();
                if (!alive() || generation !== reorderEpoch) return;
                var message = error.status === 409 ? words.order_stale : words.order_failed;
                announce(message);
                var notice = ui.notice(message, function () { location.reload(); });
                recovery = notice && notice.querySelector('.ui-retry');
            } finally {
                pending = false; request = null; source = target = null; signalPending(false);
                if (!alive() || generation !== reorderEpoch) return;
                updateMoves();
                if (stale) (recovery || document.getElementById('main-content')).focus({preventScroll:true}); else reorderControl(row).focus();
            }
        }
        on(list, 'click', function (event) {
            var move = event.target.closest('[data-playlist-move]');
            if (!move || !phone.matches || move.disabled || blocked()) return;
            var row = move.closest('[data-occurrence]'), items = rows(), index = items.indexOf(row);
            var up = move.dataset.playlistMove === 'up', neighbor = items[index + (up ? -1 : 1)];
            if (!neighbor) return;
            closeMenu(move.closest('[data-ui-menu]'), true);
            source = row; target = neighbor; placement = up ? 'before' : 'after';
            commit();
        });
        on(phone, 'change', function () { if (!pending && (source || pointer)) cancel(words.order_cancelled); updateMoves(); });
        on(list, 'keydown', function (event) {
            var handle = event.target.closest('.playlist-grip');
            if (!handle || handle.disabled || phone.matches || blocked()) return;
            if (![' ', 'Enter', 'ArrowUp', 'ArrowDown', 'Escape'].includes(event.key)) return;
            event.stopPropagation(); event.preventDefault();
            if (event.key === 'Escape') { cancel(words.order_cancelled); return; }
            if (event.key === ' ' || event.key === 'Enter') {
                if (grabbed) { commit(); return; }
                source = handle.closest('[data-occurrence]'); grabbed = true; target = source;
                handle.setAttribute('aria-pressed', 'true'); announce(source.querySelector('.media-title').textContent.trim() + '. ' + words.order_picked); return;
            }
            if (!grabbed) return;
            var items = rows(), sourceIndex = items.indexOf(source);
            var index = items.indexOf(target);
            index = Math.max(0, Math.min(items.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)));
            var anchor = items[index];
            indicate(anchor, index < sourceIndex ? 'before' : 'after');
            anchor.scrollIntoView({block:'nearest'});
            announce(source.querySelector('.media-title').textContent.trim() + '. ' + words.order_position.replace('{position}',index + 1).replace('{count}',items.length));
        });
        var pointer;
        function pointerTarget() {
            var element = document.elementFromPoint(pointer.x, pointer.y);
            var anchor = element && element.closest('[data-occurrence]');
            if (!anchor || !list.contains(anchor)) return;
            var rect = anchor.getBoundingClientRect();
            indicate(anchor, pointer.y < rect.top + rect.height / 2 ? 'before' : 'after');
        }
        function autoscroll() {
            if (!pointer || !source || grabbed) return;
            var step = pointer.y < 140 ? -12 : pointer.y > innerHeight - 100 ? 12 : 0;
            if (step) { window.scrollBy(0, step); pointerTarget(); }
            scrollFrame = requestAnimationFrame(autoscroll);
        }
        on(list, 'pointerdown', function (event) {
            var handle = event.target.closest('.playlist-grip');
            if (!handle || handle.disabled || event.button !== 0 || !event.isPrimary || phone.matches || blocked()) return;
            if (grabbed) cancel(words.order_cancelled);
            handle.focus({preventScroll:true});
            handle.setPointerCapture(event.pointerId);
            pointer = {id:event.pointerId, handle:handle, startX:event.clientX, startY:event.clientY, x:event.clientX, y:event.clientY};
        });
        on(list, 'pointermove', function (event) {
            if (!pointer || pointer.id !== event.pointerId || pending || phone.matches) return;
            pointer.x = event.clientX; pointer.y = event.clientY;
            if (!source && Math.hypot(pointer.x-pointer.startX,pointer.y-pointer.startY) >= 5) {
                source = pointer.handle.closest('[data-occurrence]');
                source.classList.add('is-dragging');
                pointer.handle.setAttribute('aria-pressed','true');
                announce(source.querySelector('.media-title').textContent.trim() + '. ' + words.order_picked);
                scrollFrame = requestAnimationFrame(autoscroll);
            }
            if (source) { event.preventDefault(); pointerTarget(); }
        });
        on(list, 'pointerup', function (event) {
            if (!pointer || pointer.id !== event.pointerId) return;
            var handle = pointer.handle; pointer = null;
            if (source && !phone.matches) commit();
            else if (source) cancel(words.order_cancelled);
            if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
        });
        on(list, 'pointercancel', function () { if (pointer) { pointer = null; cancel(words.order_cancelled); } });
        on(list, 'lostpointercapture', function () { if (pointer && !pending) { pointer = null; cancel(words.order_cancelled); } });
        on(window, 'blur', function () { if (source && !pending) cancel(words.order_cancelled); });
        if (collection) on(collection,'iv:collection-busy',function () { if (source && !pending) cancel(words.order_cancelled); });
        on(document,'iv:content-added',function () { if (!list.isConnected) disposeReorder(); else updateMoves(); });
        on(document,'iv:library-change',updateMoves);
        if (collection) {
            var collectionState = new MutationObserver(updateMoves);
            collectionState.observe(collection, {attributes:true, attributeFilter:['data-selecting','data-collection-busy']});
            collectionState.observe(list, {attributes:true, attributeFilter:['aria-invalid']});
            on(window,'pagehide',function (event) { if (!event.persisted) collectionState.disconnect(); });
        }
        updateMoves();
        on(window,'browserprofilechange',function () { activePage = false; invalidate(); disposeReorder(); });
        on(window,'pageshow',function () {
            activePage = true; updateMoves();
            if (stale && alive()) { announce(words.order_failed); ui.notice(words.order_failed,function () { location.reload(); }); }
        });
        disposeReorder = function () {
            activePage = false; reorderEpoch++;
            if (pending) { invalidate(); if (request) request.abort(); pending = false; signalPending(false); }
            cancelAnimationFrame(scrollFrame); scrollFrame = null;
            pointer = null;
            if (!pending && source) cancel();
        };

    }
    on(window, 'pagehide', function (event) {
        closeNavigation(false);
        disposeReorder();
        if (!event.persisted) { lifetime.abort(); menuResize.disconnect(); headerResize.disconnect(); owners.forEach(function (entry) { entry.controller.abort(); }); owners.clear(); menus.clear(); }
    });
})();
