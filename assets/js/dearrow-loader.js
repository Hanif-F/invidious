'use strict';
(function () {
    var button = document.getElementById('dearrow-open');
    if (!button) return;
    var config = JSON.parse(document.getElementById('dearrow-contribution-config').textContent);
    var label = button.textContent;
    button.addEventListener('click', load);
    function load() {
        button.disabled = true;
        button.textContent = config.loading;
        var style = document.createElement('link');
        style.rel = 'stylesheet';
        style.href = config.style;
        var script = document.createElement('script');
        script.src = config.script;
        function failed() {
            style.remove();
            script.remove();
            button.disabled = false;
            button.textContent = label;
            button.title = config.error;
        }
        style.onerror = failed;
        script.onerror = failed;
        style.onload = function () { document.head.appendChild(script); };
        script.onload = function () {
            button.removeEventListener('click', load);
            button.disabled = false;
            button.textContent = label;
        };
        document.head.appendChild(style);
    }
})();
