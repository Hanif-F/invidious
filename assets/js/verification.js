'use strict';
(function () {
    var node = document.getElementById('verification-config');
    if (!node || node.dataset.verificationInitialized) return;
    var config = JSON.parse(node.textContent);
    node.dataset.verificationInitialized = 'true';
    var status = document.getElementById('verification-status');
    var retry = document.getElementById('verification-retry');
    var widget, timeout, request;
    var completing = false, active = true, paused = false, needsRetry = false, completed = false, generation = 0;
    var fallback = {
        checking: 'Checking verification…', failed: 'Verification failed. Please retry.',
        unavailable: 'Unable to verify. Please retry.', verified: 'Verified. You can return to the app.',
        disabled_return: 'Verification is disabled. You can return to the app.',
        load_error: 'Verification could not load. Please retry.', expired: 'The challenge expired. Please retry.',
        timeout: 'Verification timed out. Please retry.', complete: 'Please complete verification.',
        paused: 'Verification was paused. Retry to continue.'
    };
    function word(key) { return config.words && config.words[key] || fallback[key]; }
    function feedback(message, failed) {
        status.textContent = message;
        status.setAttribute('role', failed ? 'alert' : 'status');
        status.setAttribute('aria-live', failed ? 'assertive' : 'polite');
    }
    function failure(message) {
        if (!active || paused || completed) return;
        generation++;
        if (request) request.abort();
        completing = false;
        needsRetry = true;
        feedback(message, true);
        retry.hidden = false;
    }
    function complete(token) {
        if (!active || paused || needsRetry || completed || completing) return;
        completing = true;
        retry.hidden = true;
        feedback(word('checking'), false);
        var epoch = ++generation;
        if (request) request.abort();
        request = new AbortController();
        fetch('/api/v1/verification/complete', {
            method: 'POST', credentials: 'same-origin', redirect: 'error', signal: request.signal,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ turnstileToken: token, transport: config.native ? 'native' : 'browser', returnUrl: config.returnUrl })
        }).then(function (response) {
            return response.json().then(function (result) {
                if (!active || paused || epoch !== generation) return;
                if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error();
                if (!response.ok) {
                    var error = new Error(typeof result.message === 'string' ? result.message : word('failed'));
                    error.verificationUserMessage = true;
                    throw error;
                }
                var disabled = result.enabled === false;
                if (!disabled && (!Number.isSafeInteger(result.expiresAt) || result.expiresAt <= 0)) throw new Error();
                if (config.native && !disabled && (typeof result.verificationToken !== 'string' || !result.verificationToken)) throw new Error();
                var returnUrl = result.returnUrl || '/';
                if (!config.native && (typeof returnUrl !== 'string' || !returnUrl.startsWith('/') || returnUrl.startsWith('//') || /[\u0000-\u001f\u007f]/.test(returnUrl) || new URL(returnUrl, location.origin).origin !== location.origin)) throw new Error();
                clearTimeout(timeout);
                completed = true;
                if (config.native) {
                    feedback(word(disabled ? 'disabled_return' : 'verified'), false);
                    // The native bridge listens on window. Never send credentials
                    // to callback URLs, browser storage or postMessage('*').
                    window.dispatchEvent(new CustomEvent('invidious-verification-complete', {
                        detail: { verificationToken: disabled ? null : result.verificationToken, expiresAt: disabled ? null : result.expiresAt, enabled: !disabled }
                    }));
                } else window.location.replace(returnUrl);
            });
        }).catch(function (error) {
            if (!active || paused || epoch !== generation || error && error.name === 'AbortError') return;
            failure(error && error.verificationUserMessage ? error.message : word('unavailable'));
        });
    }
    window.invidiousTurnstileReady = function () {
        if (!active || paused || widget !== undefined) return;
        widget = window.turnstile.render('#turnstile-widget', {
            size: document.getElementById('turnstile-widget').clientWidth < 300 ? 'compact' : 'normal',
            sitekey: config.siteKey, action: 'instance_access', callback: complete,
            'error-callback': function () { failure(word('load_error')); },
            'expired-callback': function () { failure(word('expired')); },
            'timeout-callback': function () { failure(word('timeout')); }
        });
    };
    retry.addEventListener('click', function () {
        if (!active) return;
        if (window.turnstile && widget !== undefined) {
            paused = false;
            needsRetry = false;
            completed = false;
            completing = false;
            retry.hidden = true;
            feedback(word('complete'), false);
            window.turnstile.reset(widget);
        } else window.location.reload();
    });
    window.addEventListener('pagehide', function () {
        active = false;
        paused = true;
        generation++;
        clearTimeout(timeout);
        if (request) request.abort();
    });
    window.addEventListener('pageshow', function (event) {
        if (!event.persisted) return;
        active = true;
        completing = false;
        feedback(word('paused'), false);
        retry.hidden = false;
    });
    if (!config.enabled && config.native) complete('');
    if (config.enabled && !config.ready) retry.hidden = false;
    if (config.enabled && config.ready) {
        timeout = window.setTimeout(function () {
            if (widget === undefined) failure(word('load_error'));
        }, 15000);
    }
})();
