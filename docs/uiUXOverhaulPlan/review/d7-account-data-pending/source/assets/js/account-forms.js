'use strict';
// Ordinary form navigation owns security writes. Never fetch, persist or replay
// credentials here, and keep successful controls (including the submitter) intact.
(function () {
    if (document.documentElement.dataset.accountForms) return;
    document.documentElement.dataset.accountForms = 'true';
    var forms = Array.from(document.querySelectorAll('form[data-account-form]'));
    function reset() {
        forms.forEach(function (form) {
            delete form.dataset.submitting;
            form.removeAttribute('aria-busy');
            form.querySelectorAll('[type=submit]').forEach(function (button) { button.removeAttribute('aria-disabled'); });
        });
    }
    forms.forEach(function (form) {
        form.addEventListener('submit', function (event) {
            if (form.dataset.submitting === 'true') { event.preventDefault(); return; }
            if (event.defaultPrevented) return;
            form.dataset.submitting = 'true';
            form.setAttribute('aria-busy', 'true');
            form.querySelectorAll('[type=submit]').forEach(function (button) { button.setAttribute('aria-disabled', 'true'); });
        });
    });
    window.addEventListener('pageshow', reset);
    reset();
}());
