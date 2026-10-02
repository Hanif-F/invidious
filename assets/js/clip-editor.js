'use strict';
(function () {
    var form = document.getElementById('clip-editor');
    if (!form) return;
    var start = document.getElementById('clip-start'), end = document.getElementById('clip-end');
    var startRange = document.getElementById('clip-start-range'), endRange = document.getElementById('clip-end-range');
    var status = document.getElementById('clip-duration'), preview = document.getElementById('clip-preview');
    var frame = document.getElementById('clip-preview-frame'), duration = Number(form.dataset.duration);
    form.querySelector('.clip-range').hidden = false;
    preview.hidden = false;
    function update() {
        var a = Number(start.value), b = Number(end.value), length = b - a;
        var valid = start.value !== '' && end.value !== '' && Number.isFinite(a) && Number.isFinite(b) && a >= 0 && b <= duration && length >= 5 && length <= 120;
        end.setCustomValidity(valid ? '' : status.dataset.error);
        startRange.value = start.value; endRange.value = end.value;
        status.textContent = valid ? length.toFixed(3).replace(/\.?0+$/, '') + ' s' : status.dataset.error;
        preview.disabled = !valid;
    }
    [start, end].forEach(function (input) { input.addEventListener('input', update); });
    [[startRange, start, end], [endRange, end, start]].forEach(function (pair, i) {
        pair[0].addEventListener('input', function () {
            var value = Number(pair[0].value), other = Number(pair[2].value);
            // Dragging a handle keeps a valid range; numeric fields remain fully editable.
            value = i === 0 ? Math.max(0, Math.min(other - 5, Math.max(other - 120, value))) : Math.min(duration, Math.max(other + 5, Math.min(other + 120, value)));
            pair[1].value = String(value); update();
        });
    });
    preview.onclick = function () {
        if (!form.reportValidity()) return;
        var url = new URL(form.dataset.preview, location.origin);
        url.searchParams.set('start', start.value); url.searchParams.set('end', end.value);
        url.searchParams.set('loop', '1'); url.searchParams.set('autoplay', '1');
        frame.src = url.pathname + url.search; frame.hidden = false;
    };
    update();
}());
