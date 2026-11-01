'use strict';
(function () {
    var lifetime = new AbortController(), requests = new Set(), ui = InvidiousUI;
    var alive = true, epoch = 0;
    function current() { return alive && InvidiousStorage.isCurrent(); }
    function on(target,event,callback) { target.addEventListener(event,callback,{signal:lifetime.signal}); }
    async function request(url, options) {
        var controller = new AbortController(); requests.add(controller);
        try { return await ui.request(url,Object.assign({signal:controller.signal},options)); }
        finally { requests.delete(controller); }
    }
    on(window,'pageshow',function () { alive = !lifetime.signal.aborted; });
    document.querySelectorAll('[data-channel-subscription]').forEach(function (form) {
        var button = form.querySelector('button'), pending = false, desired = null, verify = false;
        var status = form.querySelector('[data-subscription-status]');
        async function read() {
            if (!current() || !form.isConnected) return;
            var generation = epoch;
            var data = await request('/api/v1/auth/subscriptions');
            if (!Array.isArray(data) || data.some(function (item) { return !item || typeof item.authorId !== 'string'; })) throw new Error(ui.label('error'));
            if (!current() || !form.isConnected || generation !== epoch) return;
            var subscribed = data.some(function (item) { return item.authorId === form.dataset.channelId; });
            button.dataset.type = subscribed ? 'unsubscribe' : 'subscribe';
            button.textContent = subscribed ? form.dataset.unsubscribe : form.dataset.subscribe;
            button.classList.toggle('button-primary',!subscribed);
            var action = new URL(form.action); action.searchParams.set('action',subscribed ? 'remove_subscriptions' : 'create_subscription_to_channel'); form.action = action.pathname + action.search;
            button.disabled = false; ui.status(status,desired !== null && subscribed !== desired ? ui.label('error') : ui.label('saved')); desired = null; verify = false;
            document.dispatchEvent(new Event('iv:subscriptions-change'));
        }
        on(form,'submit',async function (event) {
            event.preventDefault(); if (pending || !current()) return;
            var generation = epoch;
            pending = true; verify = true; button.disabled = true;
            desired = new URL(form.action).searchParams.get('action') === 'create_subscription_to_channel';
            var url = new URL(form.action); url.searchParams.set('redirect','false');
            try { await request(url.pathname+url.search,{method:'POST',body:new URLSearchParams(new FormData(form))}); }
            catch (_) { /* Verify the current membership after any ambiguous response. */ }
            if (!current() || generation !== epoch) { if (generation === epoch) pending = false; return; }
            try { await read(); }
            catch (_) { if (current() && form.isConnected) ui.status(status,ui.label('error'),async function () { if (pending) return; pending = true; try { await read(); } catch (_) { /* Keep the explicit read retry and disabled mutation. */ } finally { pending = false; } }); }
            finally { if (generation === epoch) pending = false; }
        });
        on(window,'pagehide',function () { if (pending) { verify = true; pending = false; button.disabled = true; } });
        on(window,'pageshow',async function () {
            if (!verify || pending || !current()) return;
            pending = true;
            try { await read(); }
            catch (_) { if (current()) ui.status(status,ui.label('error'),function () { if (pending) return; pending = true; read().catch(function () {}).finally(function () { pending = false; }); }); }
            finally { pending = false; }
        });
    });
    var permission = document.querySelector('[data-browser-notifications]'), status = document.querySelector('[data-notification-status]');
    if (permission && window.Notification && window.isSecureContext) {
        permission.hidden = false;
        function describe() { if (status) status.textContent = permission.dataset[Notification.permission] || ''; permission.disabled = Notification.permission === 'granted'; }
        describe();
        on(window,'pageshow',describe);
        on(permission,'click',async function () {
            if (!current()) return;
            // Keep focus inside the open menu when Firefox blurs a disabled
            // button, so the permission result remains available to its owner.
            var menu = permission.closest('[data-ui-menu]'), summary = menu && menu.querySelector('summary');
            if (summary && menu.open) summary.focus();
            permission.disabled = true;
            try { await Notification.requestPermission(); }
            catch (_) { /* Permission remains visible with its actual browser state. */ }
            if (current()) describe();
        });
    }
    on(window,'browserprofilechange',function () { alive = false; requests.forEach(function (controller) { controller.abort(); }); document.querySelectorAll('[data-channel-subscription] button').forEach(function (button) { button.disabled = true; }); lifetime.abort(); });
    on(window,'pagehide',function (event) { alive = false; epoch++; requests.forEach(function (controller) { controller.abort(); }); if (!event.persisted) lifetime.abort(); });
})();
