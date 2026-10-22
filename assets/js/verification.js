'use strict';
(function () {
    var config = JSON.parse(document.getElementById('verification-config').textContent);
    var status = document.getElementById('verification-status');
    var retry = document.getElementById('verification-retry');
    var widget;
    var completing = false;
    function failure(message) {
        completing = false;
        status.textContent = message;
        retry.hidden = false;
    }
    function complete(token) {
        if (completing) return;
        completing = true;
        retry.hidden = true;
        status.textContent = 'Checking verification…';
        fetch('/api/v1/verification/complete', {
            method: 'POST', credentials: 'same-origin', redirect: 'error',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ turnstileToken: token, transport: config.native ? 'native' : 'browser', returnUrl: config.returnUrl })
        }).then(function (response) {
            return response.json().then(function (result) {
                if (!response.ok) throw new Error(result.message || 'Verification failed. Please retry.');
                if (config.native) {
                    status.textContent = result.verificationToken ? 'Verified. You can return to the app.' : 'Verification is disabled. You can return to the app.';
                    // An app bridge listens on window. Never use callback URLs or postMessage('*').
                    window.dispatchEvent(new CustomEvent('invidious-verification-complete', {
                        detail: { verificationToken: result.verificationToken || null, expiresAt: result.expiresAt || null, enabled: result.enabled !== false }
                    }));
                } else {
                    window.location.replace(result.returnUrl || '/');
                }
            });
        }).catch(function (error) { failure(error.message || 'Unable to verify. Please retry.'); });
    }
    window.invidiousTurnstileReady = function () {
        widget = window.turnstile.render('#turnstile-widget', {
            sitekey: config.siteKey, action: 'instance_access', callback: complete,
            'error-callback': function () { failure('Verification could not load. Please retry.'); },
            'expired-callback': function () { failure('The challenge expired. Please retry.'); },
            'timeout-callback': function () { failure('Verification timed out. Please retry.'); }
        });
    };
    retry.addEventListener('click', function () {
        if (window.turnstile && widget !== undefined) {
            completing = false;
            retry.hidden = true;
            status.textContent = 'Please complete verification.';
            window.turnstile.reset(widget);
        } else window.location.reload();
    });
    if (!config.enabled && config.native) complete('');
    if (config.enabled && config.ready) {
        window.setTimeout(function () {
            if (widget === undefined) failure('Verification could not load. Please retry.');
        }, 15000);
    }
})();
