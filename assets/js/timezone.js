"use strict";
(function () {
    try {
        var data = JSON.parse(document.getElementById('timezone_data').textContent);
        var zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        if (!zone || !data.csrf_token) return;
        helpers.xhr('POST', '/preferences/timezone', {
            payload: 'csrf_token=' + encodeURIComponent(data.csrf_token) + '&timezone=' + encodeURIComponent(zone)
        }, {});
    } catch (error) { /* UTC remains the fallback until detection succeeds. */ }
}());
