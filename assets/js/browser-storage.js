'use strict';

// All application browser storage goes through this module. Profile identifiers
// are supplied by the server and are not credentials or an authorization check.
window.InvidiousStorage = (function () {
    var element = document.getElementById('browser-profile');
    var context = element ? JSON.parse(element.textContent) : {scope: 'guest'};
    var scope = /^(guest|[0-9a-f]{64})$/.test(context.scope) ? context.scope : 'guest';
    var prefix = 'iv:browser:v2:';
    var activeKey = prefix + 'active';
    var purgeKey = prefix + 'purge';
    var stale = false;
    var colors = ['#000', '#FFF', '#F00', '#0F0', '#00F', '#FF0', '#F0F', '#0FF'];
    var categories = ['sponsor', 'selfpromo', 'interaction', 'intro', 'outro', 'preview', 'music_offtopic', 'filler'];
    var modes = ['auto', 'manual', 'marker', 'disabled'];

    function object(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
    function number(value, min, max) { return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max; }
    function cookieEntries() {
        try { return document.cookie.split(';'); } catch (_) { return []; }
    }
    function cookie(name) {
        var entry = cookieEntries().map(function (part) { return part.trim(); })
            .find(function (part) { return part.startsWith(name + '='); });
        if (!entry) return;
        try {
            var raw = entry.slice(name.length + 1);
            return decodeURIComponent(name === 'PREFS' ? raw.replace(/\+/g, ' ') : raw);
        } catch (_) { return; }
    }
    function writeCookie(name, value, clear, domain) {
        try {
            document.cookie = name + '=' + encodeURIComponent(value) + '; Path=/; SameSite=Lax' +
                (location.protocol === 'https:' ? '; Secure' : '') +
                (domain ? '; Domain=' + domain : '') +
                (clear ? '; Max-Age=0' : '; Max-Age=63072000');
            return clear ? cookie(name) === undefined : cookie(name) === value;
        } catch (_) { return false; }
    }
    function backend(session) { try { return session ? window.sessionStorage : window.localStorage; } catch (_) { return; } }
    function rawGet(store, key) { try { return store && store.getItem(key); } catch (_) { return; } }
    function rawRemove(store, key) {
        try { if (store) { store.removeItem(key); return true; } } catch (_) { /* Storage may be denied. */ }
        return false;
    }
    function parse(value) {
        if (typeof value !== 'string') return;
        try { return JSON.parse(value); } catch (_) {
            try { return JSON.parse(decodeURIComponent(value)); } catch (_) { return; }
        }
    }

    function normalize(key, value) {
        if (key === 'invidious_player_volume') return number(value, 0, 1) ? value : undefined;
        if (key === 'dark_mode') return ['', 'light', 'dark'].includes(value) ? value : undefined;
        if (key === 'notification_count') return Number.isSafeInteger(value) && value >= 0 ? value : undefined;
        if (key === 'stream') return object(value) && typeof value.owner === 'string' && value.owner.length <= 100 &&
            number(value.expires, 0, Number.MAX_SAFE_INTEGER) ? {owner: value.owner, expires: value.expires} : undefined;
        if (key.startsWith('continuation_cache_')) return Array.isArray(value) && value.length <= 1000 &&
            value.every(function (token) { return token === null || typeof token === 'string' && token.length <= 16384; }) ? value : undefined;
        if (key.startsWith('chat-timing-v1-')) return /^[A-Za-z0-9_-]{11}$/.test(key.slice(15)) &&
            Number.isInteger(value) && number(value, -3600000, 3600000) ? value : undefined;
        if (!object(value)) return;
        var clean = {};
        if (key === 'save_player_pos') {
            Object.keys(value).slice(-1000).forEach(function (id) {
                if (/^[A-Za-z0-9_-]{11}$/.test(id) && number(value[id], 0, Number.MAX_SAFE_INTEGER)) clean[id] = value[id];
            });
        } else if (key === 'chat-settings-v1') {
            ['chat_show_timestamps', 'chat_hide_user_ids', 'chat_overlay_mode'].forEach(function (name) {
                if (typeof value[name] === 'boolean') clean[name] = value[name];
            });
            var ranges = {chat_font_scale: [25, 300], chat_width_px: [160, 1000], chat_overlay_opacity: [0, 100],
                chat_overlay_x: [0, 1000], chat_overlay_y: [0, 1000], chat_overlay_width: [1, 1000], chat_overlay_height: [1, 1000]};
            Object.keys(ranges).forEach(function (name) {
                if (Number.isInteger(value[name]) && number(value[name], ranges[name][0], ranges[name][1])) clean[name] = value[name];
            });
            ['chat_user_blacklist', 'chat_word_blacklist'].forEach(function (name) {
                if (typeof value[name] === 'string') clean[name] = value[name].slice(0, 1024);
            });
        } else if (key === 'caption_settings') {
            var choices = {color: colors, backgroundColor: colors, windowColor: colors,
                textOpacity: ['0', '0.5', '1'], backgroundOpacity: ['0', '0.5', '1'], windowOpacity: ['0', '0.5', '1'],
                edgeStyle: ['none', 'raised', 'depressed', 'uniform', 'dropshadow'],
                fontFamily: ['proportionalSansSerif', 'monospaceSansSerif', 'proportionalSerif', 'monospaceSerif', 'casual', 'script', 'small-caps'],
                fontPercent: [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 3, 4]};
            Object.keys(choices).forEach(function (name) { if (choices[name].includes(value[name])) clean[name] = value[name]; });
        } else if (key === 'sponsorblock_channel_overrides') {
            Object.keys(value).slice(0, 1000).forEach(function (id) {
                var entry = value[id];
                if (!/^UC[A-Za-z0-9_-]{22}$/.test(id) || !object(entry)) return;
                var enabled = typeof entry.enabled === 'boolean' ? entry.enabled : null;
                var overrides = {};
                if (object(entry.modes)) categories.forEach(function (category) {
                    if (modes.includes(entry.modes[category])) overrides[category] = entry.modes[category];
                });
                if (enabled === null && !Object.keys(overrides).length) return;
                clean[id] = {name: typeof entry.name === 'string' ? entry.name.slice(0, 200) : id, enabled: enabled, modes: overrides};
            });
        } else return;
        return clean;
    }

    function current(issued) {
        if (stale) return false;
        var signals = [cookie('IV_BROWSER_PROFILE'), rawGet(backend(false), activeKey), issued];
        if (signals.some(function (active) {
            return typeof active === 'string' && /^(guest|[0-9a-f]{64})$/.test(active) && active !== scope;
        })) {
            stale = true;
            window.dispatchEvent(new Event('browserprofilechange'));
            setTimeout(function () { location.reload(); }, 0);
            return false;
        }
        return true;
    }

    function storage(session, profile, guard, memory) {
        memory = memory || Object.create(null);
        function key(name) { return prefix + profile + ':' + name; }
        function cookieKey(name) { return 'iv_browser_v2_' + profile + '_' + encodeURIComponent(name); }
        function usable() { return !guard || current(); }
        function remove(name) {
            if (!usable()) return false;
            memory[name] = undefined;
            var removed = rawRemove(backend(session), key(name));
            var cleared = session || writeCookie(cookieKey(name), '', true);
            if (removed && cleared) delete memory[name];
            return removed && cleared;
        }
        return {
            key: key,
            matchesEvent: function (event, name) {
                return usable() && event.storageArea === backend(session) && (event.key === null ||
                    (name ? event.key === key(name) : event.key.startsWith(prefix + profile + ':')));
            },
            get: function (name) {
                if (!usable()) return;
                if (Object.prototype.hasOwnProperty.call(memory, name)) return memory[name];
                var raw = session ? undefined : cookie(cookieKey(name));
                if (raw === undefined || raw === null) raw = rawGet(backend(session), key(name));
                if (raw === undefined || raw === null) return memory[name];
                var value = normalize(name, parse(raw));
                if (value === undefined) remove(name);
                return value;
            },
            set: function (name, value) {
                if (!usable()) return false;
                value = normalize(name, value);
                if (value === undefined) return false;
                memory[name] = value;
                var encoded = JSON.stringify(value);
                var store = backend(session);
                try {
                    if (store) {
                        store.setItem(key(name), encoded);
                        if (!session && !writeCookie(cookieKey(name), '', true)) return false;
                        delete memory[name];
                        return true;
                    }
                } catch (_) { /* Try a small cookie; larger saves remain in page memory. */ }
                if (!session && encodeURIComponent(encoded).length + cookieKey(name).length <= 3800 &&
                    writeCookie(cookieKey(name), encoded, false)) { delete memory[name]; return true; }
                return false;
            },
            remove: remove
        };
    }

    function purge(profile) {
        if (!/^[0-9a-f]{64}$/.test(profile)) return;
        [false, true].forEach(function (session) {
            var store = backend(session);
            try {
                if (store) Object.keys(store).forEach(function (name) {
                    if (name.startsWith(prefix + profile + ':')) rawRemove(store, name);
                });
            } catch (_) { /* Storage may be denied. */ }
        });
        cookieEntries().forEach(function (entry) {
            var name = entry.trim().split('=')[0];
            if (name.startsWith('iv_browser_v2_' + profile + '_')) writeCookie(name, '', true);
        });
    }

    // Legacy persistent values have no trustworthy owner. Only the guest profile
    // may inherit them, even when the upgrade is first loaded by an account.
    var guestMemory = Object.create(null);
    var guest = storage(false, 'guest', false, guestMemory);
    var legacy = {dark_mode: 'dark_mode', invidious_player_volume: 'invidious_player_volume',
        'chat-settings-v1': 'chat-settings-v1', save_player_pos: 'save_player_pos', 'vjs-text-track-settings': 'caption_settings'};
    var oldStore = backend(false);
    var names = Object.keys(legacy);
    try { if (oldStore) names = names.concat(Object.keys(oldStore).filter(function (name) { return name.startsWith('chat-timing-v1-'); })); } catch (_) {}
    cookieEntries().forEach(function (entry) {
        var name = entry.trim().split('=')[0];
        if (name.startsWith('chat-timing-v1-') && !names.includes(name)) names.push(name);
    });
    names.forEach(function (name) {
        var target = legacy[name] || name;
        var raw = rawGet(oldStore, name);
        if (raw === undefined || raw === null) raw = cookie(name);
        var value = normalize(target, name === 'invidious_player_volume' && typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : parse(raw));
        if (guest.get(target) !== undefined || value === undefined || guest.set(target, value)) {
            rawRemove(oldStore, name);
            writeCookie(name, '', true);
            if (context.cookieDomain) writeCookie(name, '', true, context.cookieDomain);
        }
    });
    ['stream', 'notification_count'].forEach(function (name) { rawRemove(oldStore, name); writeCookie(name, '', true); });
    try {
        var oldSession = backend(true);
        if (oldSession) Object.keys(oldSession).forEach(function (name) {
            if (name.startsWith('continuation_cache_')) rawRemove(oldSession, name);
        });
    } catch (_) {}

    var deleted = cookie('IV_BROWSER_PURGE');
    if (deleted) {
        purge(deleted);
        try { if (oldStore) oldStore.setItem(purgeKey, deleted + ':' + Date.now()); } catch (_) {}
        writeCookie('IV_BROWSER_PURGE', '', true, context.cookieDomain);
        writeCookie('IV_BROWSER_PURGE', '', true);
    }
    // A freshly rendered document is authoritative when cookies are disabled.
    var marker = cookie('IV_BROWSER_PROFILE');
    if (!marker || marker === scope) { try { if (oldStore) oldStore.setItem(activeKey, scope); } catch (_) {} }
    else current();
    window.addEventListener('storage', function (event) {
        if (event.key === purgeKey && event.newValue) purge(event.newValue.split(':')[0]);
        if (event.key === activeKey) current();
    });
    ['pageshow', 'focus'].forEach(function (event) { window.addEventListener(event, current); });
    document.addEventListener('visibilitychange', current);

    var local = storage(false, scope, true, scope === 'guest' ? guestMemory : undefined);
    var session = storage(true, scope, true);
    return {
        scope: scope, isCurrent: current,
        checkResponse: function (response) {
            return current(response.headers.get('X-Invidious-Browser-Profile'));
        },
        local: local, session: session,
        normalize: normalize,
        report: function (saved, element) {
            if (!element || !current()) return;
            element.textContent = saved ? '' : (context.saveError || 'Could not save these settings in this browser.');
        },
        guestSpeed: function (speed, allowed) {
            if (scope !== 'guest' || !current() || !number(speed, 0.25, 2)) return false;
            var saved = parse(cookie('PREFS'));
            var preferences = {};
            // The server-rendered Preferences fields define what guests may save.
            if (object(saved) && object(allowed)) Object.keys(allowed).forEach(function (name) {
                if (Object.prototype.hasOwnProperty.call(saved, name) && typeof saved[name] === typeof allowed[name] &&
                    Array.isArray(saved[name]) === Array.isArray(allowed[name])) preferences[name] = saved[name];
            });
            preferences.speed = speed;
            var data = JSON.stringify(preferences);
            if (encodeURIComponent(data).length > 3800) return false;
            // Older players wrote domain cookies even when the server used a
            // host-only cookie. Replace both variants before writing the save.
            writeCookie('PREFS', '', true);
            writeCookie('PREFS', '', true, location.hostname);
            if (context.cookieDomain) writeCookie('PREFS', '', true, context.cookieDomain);
            return writeCookie('PREFS', data, false, context.cookieDomain);
        },
        sponsorblock: function (config, channel, live) {
            if (!config || scope !== 'guest' || !current()) return config;
            var entry = local.get('sponsorblock_channel_overrides');
            entry = entry && entry[channel];
            if (!entry) return config;
            return Object.assign({}, config, {enabled: !live && (entry.enabled === null ? config.enabled : entry.enabled),
                modes: Object.assign({}, config.modes, entry.modes)});
        }
    };
}());
