'use strict';
var toggle_theme = document.getElementById('toggle_theme');
const STORAGE_KEY_THEME = 'dark_mode';
const THEME_DARK = 'dark';
const THEME_LIGHT = 'light';
var colorMode = '';
var systemColor = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

function setTheme(theme) {
    colorMode = theme === THEME_DARK || theme === THEME_LIGHT ? theme : '';
    document.body.classList.remove('no-theme', 'light-theme', 'dark-theme');
    document.body.classList.add((colorMode || 'no') + '-theme');
    if (!toggle_theme) return;
    toggle_theme.children[0].className = 'icon ' + (colorMode === 'dark' ? 'ion-ios-moon' : colorMode === 'light' ? 'ion-ios-sunny' : 'ion-monitor');
    var label = toggle_theme.getAttribute('data-mode-' + (colorMode || 'system'));
    toggle_theme.title = label;
    toggle_theme.setAttribute('aria-label', label);
    toggle_theme.dataset.mode = colorMode || 'system';
}

if (toggle_theme) {
    toggle_theme.addEventListener('click', function (event) {
        event.preventDefault();
        var next = colorMode === '' ? THEME_LIGHT : colorMode === THEME_LIGHT ? THEME_DARK : '';
        setTheme(next);
        helpers.storage.set(STORAGE_KEY_THEME, next);
        helpers.xhr('GET', '/toggle_theme?redirect=false&mode=' + encodeURIComponent(next), {}, {});
    });
}

// CSS follows the system while no-theme is active; keep the control synchronized.
if (systemColor) {
    var systemChanged = function () { if (colorMode === '') setTheme(''); };
    if (systemColor.addEventListener) systemColor.addEventListener('change', systemChanged);
    else if (systemColor.addListener) systemColor.addListener(systemChanged);
}

addEventListener('storage', function (event) {
    if (event.key === STORAGE_KEY_THEME) {
        var mode = helpers.storage.get(STORAGE_KEY_THEME);
        if (mode === '' || mode === THEME_LIGHT || mode === THEME_DARK) setTheme(mode);
    }
});

addEventListener('DOMContentLoaded', function () {
    var pref = document.getElementById('dark_mode_pref');
    if (!pref) return;
    setTheme(pref.textContent);
    helpers.storage.set(STORAGE_KEY_THEME, colorMode);
});
