'use strict';
(function () {
    // Elapsed timestamps have no time-of-day or 24-hour restriction.
    function parse(value) {
        var match = /^(?:(\d+):)?(\d{1,2}):([0-5]\d)$/.exec(value.trim());
        if (!match || Number(match[2]) >= 60) return null;
        var seconds = Number(match[1] || 0) * 3600 + Number(match[2]) * 60 + Number(match[3]);
        return Number.isSafeInteger(seconds) ? seconds : null;
    }
    function format(seconds, hours) {
        seconds = Math.max(0, Math.floor(seconds));
        function pad(number) { return String(number).padStart(2, '0'); }
        var tail = pad(Math.floor(seconds / 60) % 60) + ':' + pad(seconds % 60);
        return hours || seconds >= 3600 ? pad(Math.floor(seconds / 3600)) + ':' + tail : tail;
    }
    function defaultRange(position, duration) {
        position = Number.isFinite(position) ? Math.floor(position) : 0;
        var length = Math.min(30, duration), start = Math.max(0, Math.min(position - 15, duration - length));
        return [start, start + length];
    }
    window.InvidiousClipTime = {parse: parse, format: format, defaultRange: defaultRange};
    var form = document.getElementById('clip-editor');
    if (!form) return;
    var labels = JSON.parse(document.getElementById('clip-editor-labels').textContent);
    var dialog = document.getElementById('clip-dialog'), trigger = document.getElementById('create-clip');
    var title = document.getElementById('clip-title');
    var start = document.getElementById('clip-start'), end = document.getElementById('clip-end');
    var ranges = [document.getElementById('clip-start-range'), document.getElementById('clip-end-range')];
    var status = document.getElementById('clip-duration'), preview = document.getElementById('clip-preview');
    var publish = document.getElementById('clip-publish'), publishLabel = publish.textContent;
    var frame = document.getElementById('clip-preview-frame'), placeholder = document.getElementById('clip-preview-placeholder');
    var submitStatus = document.getElementById('clip-submit-status'), duration = Number(form.dataset.duration);
    var result = document.getElementById('clip-result');
    var lastRange = defaultRange(0, duration), initialized = !dialog, busy = false, published = false, resultSeen = false, titleTouched = false;
    var openingTime = 0, resume = false, scrollStyle, previewKey = '';
    form.querySelectorAll('.js-only').forEach(function (element) { element.hidden = false; });
    if (!dialog) {
        // Legacy numeric form links remain usable; user-entered timestamps stay intact.
        [start, end].forEach(function (input) {
            if (/^\d+(?:\.\d+)?$/.test(input.value) && Number.isSafeInteger(Math.floor(Number(input.value)))) input.value = format(Number(input.value));
        });
    }
    function stopPreview() {
        if (frame.hasAttribute('src')) frame.removeAttribute('src');
        frame.hidden = true; placeholder.hidden = false; previewKey = '';
    }
    function fieldError(input, message, show) {
        input.setCustomValidity(message);
        input.setAttribute('aria-invalid', String(Boolean(message)));
        var error = document.getElementById(input.id + '-error');
        error.textContent = message; error.hidden = !message || show === false;
    }
    function update() {
        var a = parse(start.value), b = parse(end.value), length = b - a;
        var startError = a === null ? labels.time : a > duration ? labels.bounds : '';
        var endError = b === null ? labels.time : b > duration ? labels.bounds : '';
        var valid = !startError && !endError && length >= 5 && length <= 120;
        if (!startError && !endError && !valid) endError = labels.range;
        fieldError(start, startError); fieldError(end, endError);
        var count = Array.from(title.value.trim()).length;
        document.getElementById('clip-title-count').textContent = count + ' / 140';
        fieldError(title, count < 1 || count > 140 ? labels.title : '', titleTouched);
        status.textContent = valid ? labels.duration.replace('{duration}', format(length)) : labels.range;
        if (valid) lastRange = [a, b];
        [a, b].forEach(function (time, i) {
            if (time !== null && time <= duration) {
                ranges[i].value = time;
                ranges[i].setAttribute('aria-valuetext', format(time));
            }
        });
        var track = form.querySelector('.clip-timeline');
        track.style.setProperty('--clip-start', (Number(ranges[0].value) / duration * 100) + '%');
        track.style.setProperty('--clip-end', (Number(ranges[1].value) / duration * 100) + '%');
        preview.disabled = busy || !valid;
        publish.disabled = busy || !valid || count < 1 || count > 140;
        if (previewKey && previewKey !== a + ':' + b) stopPreview();
        return valid && count >= 1 && count <= 140;
    }
    function normalize() {
        var a = parse(start.value), b = parse(end.value), hours = a >= 3600 || b >= 3600;
        if (a !== null) start.value = format(a, hours);
        if (b !== null) end.value = format(b, hours);
    }
    function setRange(a, b) {
        start.value = format(a, a >= 3600 || b >= 3600);
        end.value = format(b, a >= 3600 || b >= 3600);
        update();
    }
    function adjust(boundary, value, constrain) {
        var a = parse(start.value), b = parse(end.value);
        if (a === null || b === null || a > duration || b > duration || b - a < 5 || b - a > 120) { a = lastRange[0]; b = lastRange[1]; }
        value = Math.max(0, Math.min(duration, Math.floor(value)));
        if (boundary === 'start') a = constrain ? Math.max(0, Math.min(b - 5, Math.max(b - 120, value))) : value;
        else b = constrain ? Math.min(duration, Math.max(a + 5, Math.min(a + 120, value))) : value;
        setRange(a, b);
    }
    [start, end].forEach(function (input) {
        input.addEventListener('input', update);
        input.addEventListener('blur', function () { normalize(); update(); });
    });
    title.addEventListener('input', function () { titleTouched = true; update(); });
    ranges.forEach(function (input, i) {
        input.addEventListener('input', function () { adjust(i === 0 ? 'start' : 'end', Number(input.value), true); });
    });
    form.querySelectorAll('[data-clip-boundary]').forEach(function (button) {
        button.addEventListener('click', function () {
            var boundary = button.dataset.clipBoundary, input = boundary === 'start' ? start : end;
            var current = parse(input.value);
            if (button.dataset.clipStep) {
                adjust(boundary, (current === null ? lastRange[boundary === 'start' ? 0 : 1] : current) + Number(button.dataset.clipStep), true);
            } else {
                var time = openingTime;
                try {
                    var previewPlayer = !frame.hidden && frame.contentWindow.player;
                    if (previewPlayer) time = previewPlayer.currentTime();
                } catch (_) { /* A failed preview still leaves the captured time available. */ }
                adjust(boundary, Number.isFinite(time) ? time : openingTime, false);
            }
        });
        if (!dialog && !button.dataset.clipStep) button.hidden = true;
    });
    preview.addEventListener('click', function () {
        if (preview.disabled) return;
        normalize(); update();
        var url = new URL(form.dataset.preview, location.origin);
        var a = parse(start.value), b = parse(end.value);
        url.searchParams.set('start', a); url.searchParams.set('end', b);
        url.searchParams.set('loop', '1'); url.searchParams.set('autoplay', '1');
        stopPreview(); previewKey = a + ':' + b;
        frame.src = url.pathname + url.search; frame.hidden = false; placeholder.hidden = true;
    });
    if (!dialog) { update(); return; }
    function reset(time) {
        title.value = ''; titleTouched = false; published = false; resultSeen = false;
        result.hidden = true; form.hidden = false; submitStatus.hidden = true;
        document.getElementById('clip-copy-status').textContent = '';
        var range = defaultRange(time, duration); setRange(range[0], range[1]);
    }
    function open(time) {
        if (dialog.open) return;
        openingTime = time;
        if (!initialized || (published && resultSeen && !busy)) { reset(time); initialized = true; }
        resume = Boolean(window.player && typeof player.paused === 'function' && !player.paused());
        if (window.player && typeof player.pause === 'function') player.pause();
        scrollStyle = document.documentElement.style.overflow;
        document.documentElement.style.overflow = 'hidden';
        dialog.showModal();
        if (published) resultSeen = true;
        (published ? document.getElementById('clip-result-heading') : title).focus({preventScroll: true});
    }
    window.InvidiousClipEditor = {open: open};
    function close() { dialog.close(); }
    document.getElementById('clip-close').addEventListener('click', close);
    document.getElementById('clip-done').addEventListener('click', close);
    dialog.addEventListener('close', function () {
        stopPreview(); document.documentElement.style.overflow = scrollStyle;
        trigger.focus();
        if (resume && window.player) {
            var playing = player.play();
            if (playing && typeof playing.catch === 'function') playing.catch(function () {});
        }
        resume = false;
    });
    dialog.addEventListener('keydown', function (event) {
        event.stopPropagation();
        if (event.key !== 'Tab') return;
        var controls = Array.from(dialog.querySelectorAll('button, input, a[href], iframe, [tabindex="0"]')).filter(function (element) {
            return !element.disabled && element.getClientRects().length;
        });
        var index = controls.indexOf(document.activeElement);
        if (index < 0 || (event.shiftKey && index === 0) || (!event.shiftKey && index === controls.length - 1)) {
            event.preventDefault();
            controls[event.shiftKey ? controls.length - 1 : 0].focus();
        }
    });
    function setBusy(value) {
        busy = value; form.setAttribute('aria-busy', String(value));
        form.querySelectorAll('input, button').forEach(function (element) { element.disabled = value; });
        publish.textContent = value ? labels.publishing : publishLabel;
        update();
    }
    async function request(url, options) {
        if (!window.InvidiousStorage.isCurrent()) throw new Error(labels.session);
        var response = await fetch(url, Object.assign({credentials: 'same-origin'}, options));
        if (!window.InvidiousStorage.checkResponse(response)) throw new Error(labels.session);
        var data;
        try { data = await response.json(); } catch (_) { throw new Error(labels.error); }
        if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? labels.session : (data.error || labels.error));
        return data;
    }
    form.addEventListener('submit', async function (event) {
        event.preventDefault();
        if (busy) return;
        titleTouched = true;
        if (!update() || !form.reportValidity()) return;
        normalize(); stopPreview(); submitStatus.hidden = true;
        var payload = {videoId: form.elements.videoId.value, title: title.value.trim(), startTime: parse(start.value), endTime: parse(end.value)};
        setBusy(true);
        try {
            var token = await request('/api/v1/auth/csrf');
            if (!token.csrfToken) throw new Error(labels.session);
            var clip = await request('/api/v1/auth/clips', {
                method: 'POST', headers: {'Content-Type': 'application/json', 'X-CSRF-Token': token.csrfToken}, body: JSON.stringify(payload)
            });
            if (!/^IVCL[a-zA-Z0-9_-]{32}$/.test(clip.clipId || '')) throw new Error(labels.error);
            var url = new URL('/clip/' + clip.clipId, location.origin).href;
            document.getElementById('clip-share-url').value = url;
            document.getElementById('clip-watch').href = url;
            document.getElementById('clip-result-title').textContent = clip.clipTitle || payload.title;
            published = true; form.hidden = true; result.hidden = false;
            if (dialog.open) { resultSeen = true; document.getElementById('clip-result-heading').focus(); }
        } catch (error) {
            submitStatus.textContent = error.message || labels.error; submitStatus.hidden = false;
            if (dialog.open) submitStatus.focus();
        } finally { setBusy(false); }
    });
    document.getElementById('clip-copy').addEventListener('click', async function () {
        var input = document.getElementById('clip-share-url'), message = document.getElementById('clip-copy-status');
        try {
            await navigator.clipboard.writeText(input.value); message.textContent = labels.copied;
        } catch (_) {
            message.textContent = labels.copy_fallback; input.focus(); input.select();
        }
    });
    update();
})();
