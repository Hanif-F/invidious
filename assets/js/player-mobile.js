'use strict';

// Shared by watch and embed players. Vendor components retain ownership of playback.
(function () {
    if (!window.player || typeof player.ready !== 'function' || !isMobile()) return;
    player.ready(function () {
        var overlay = player.getChild('TouchOverlay');
        if (!overlay) return;
        var root = player.el(), labels = player_data.mobile_labels;
        root.classList.add('invidious-mobile');
        var bar = player.getChild('controlBar');
        var Button = videojs.getComponent('Button');
        var gear = new Button(player);
        gear.addClass('vjs-mobile-settings');
        gear.controlText(labels.settings);
        gear.el().setAttribute('aria-haspopup', 'dialog');
        bar.addChild(gear);
        var panel = document.createElement('dialog');
        panel.className = 'mobile-player-settings';
        panel.setAttribute('aria-label', labels.settings);
        var header = document.createElement('header'), content = document.createElement('div');
        var heading = document.createElement('h2');
        function button(text, action, parent) {
            var el = document.createElement('button');
            el.type = 'button'; el.textContent = text; el.addEventListener('click', action);
            (parent || content).appendChild(el); return el;
        }
        var back = button(labels.back, overview, header);
        header.appendChild(heading);
        button(labels.close, function () { panel.close(); }, header);
        panel.append(header, content); root.appendChild(panel);
        var scrollStyle, borrowed, disposed = false;
        function release() {
            if (!borrowed) return;
            var previous = borrowed; borrowed = null;
            previous.parent.appendChild(previous.el);
            previous.component.close();
            if (previous.temporary) { player.removeChild(previous.component); previous.component.dispose(); }
        }
        function mount(component, temporary) {
            var el = component.el();
            borrowed = {component: component, el: el, parent: el.parentNode, temporary: temporary};
            component.options_.pauseOnOpen = false;
            component.options_.temporary = false;
            content.appendChild(el); component.open();
            component.one('modalclose', function () { if (borrowed && borrowed.component === component) overview(); });
        }
        function view(title) {
            release(); heading.textContent = title; content.replaceChildren();
            back.hidden = title === labels.settings;
        }
        function choices(title, items) {
            view(title);
            items.forEach(function (item) {
                var el = button(item.label, function () { item.select(); overview(); });
                el.setAttribute('aria-pressed', String(!!item.selected));
            });
            content.querySelector('button').focus();
        }
        function row(title, value, action) { button(title + (value ? ' · ' + value : ''), action); }
        function componentChoices(name, title) {
            var component = bar.getChild(name);
            if (!component || !component.items || !component.items.length) return;
            var items = component.items;
            row(title, items.filter(function (item) { return item.selected(); }).map(function (item) { return item.options_.label; }).join(', ') || (name === 'qualitySelector' ? player.currentSource().label : ''), function () {
                choices(title, items.map(function (item) {
                    return {label: item.options_.label, selected: item.selected(), select: function () {
                        if (name === 'qualitySelector' && item.source.src === player.currentSource().src) return;
                        var wasPaused = player.paused();
                        if (name === 'qualitySelector' && player.hasStarted()) {
                            player.one('loadeddata', function () { player.hasStarted(true); player.userActive(true); });
                        }
                        item.handleClick();
                        // With preload=none, a paused Firefox source switch needs an
                        // explicit load before the vendor's safe-seek can restore time.
                        if (name === 'qualitySelector' && wasPaused) player.ready(function () { player.load(); });
                    }};
                }));
            });
        }
        function qualityLabel(level) { return level.height ? level.height + 'p' : Math.round(level.bitrate / 1000) + ' kbps'; }
        function overview() {
            view(labels.settings);
            if (video_data.params.quality === 'dash' && !video_data.params.listen) {
                var levels = Array.from(player.qualityLevels());
                if (levels.length) {
                    var enabled = levels.filter(function (level) { return level.enabled; });
                    row(labels.quality, enabled.length === levels.length ? gear.localize('Auto') : enabled.map(function (level) { return qualityLabel(level); }).join(', '), function () {
                        choices(labels.quality, [{label: gear.localize('Auto'), selected: enabled.length === levels.length, select: function () { levels.forEach(function (level) { level.enabled = true; }); }}].concat(levels.map(function (level) {
                            return {label: qualityLabel(level), selected: enabled.length === 1 && level.enabled, select: function () { levels.forEach(function (other) { other.enabled = other === level; }); }};
                        })));
                    });
                }
            } else componentChoices('qualitySelector', labels.quality);
            componentChoices('audioTrackButton', labels.audio);
            var tracks = Array.from(player.textTracks()).filter(function (track) { return track.kind === 'captions' || track.kind === 'subtitles'; });
            if (tracks.length) {
                var selected = tracks.find(function (track) { return track.mode === 'showing'; });
                row(labels.captions, selected ? selected.label : labels.off, function () {
                    choices(labels.captions, [null].concat(tracks).map(function (track) {
                        return {label: track ? track.label : labels.off, selected: track === (selected || null), select: function () { tracks.forEach(function (other) { other.mode = track === other ? 'showing' : 'disabled'; }); }};
                    }));
                    button(labels.appearance, function () {
                        view(labels.appearance);
                        var settings = player.getChild('textTrackSettings');
                        if (!settings) return;
                        mount(settings, false);
                    });
                });
            }
            row(labels.speed, player.playbackRate() + 'x', function () {
                choices(labels.speed, player.options_.playbackRates.map(function (rate) { return {label: rate + 'x', selected: rate === player.playbackRate(), select: function () { player.playbackRate(rate); }}; }));
            });
            row(labels.volume, Math.round(player.muted() ? 0 : player.volume() * 100) + '%', function () {
                view(labels.volume);
                var slider = document.createElement('input'); slider.type = 'range'; slider.min = 0; slider.max = 100;
                slider.value = player.muted() ? 0 : player.volume() * 100; slider.setAttribute('aria-label', labels.volume);
                slider.addEventListener('input', function () { player.muted(false); player.volume(Number(slider.value) / 100); });
                content.appendChild(slider); slider.focus();
            });
            if (player.statsForNerds) row(player_data.stats_labels.title, '', function () {
                panel.close(); player.statsForNerds.toggle(gear.el());
            });
            var sharing = player.getChild('ShareOverlay');
            if (sharing) row(labels.share, '', function () {
                view(labels.share); sharing._createModal(); mount(sharing.modal, true);
            });
            if (panel.open) content.querySelector('button').focus();
        }
        gear.handleClick = function () {
            cancel(true); overview(); scrollStyle = document.documentElement.style.overflow;
            document.documentElement.style.overflow = 'hidden'; root.classList.add('mobile-settings-open'); panel.showModal();
        };
        panel.addEventListener('close', function () {
            release(); document.documentElement.style.overflow = scrollStyle;
            root.classList.remove('mobile-settings-open');
            if (!disposed) { gear.el().focus(); player.reportUserActivity(); }
        });
        // Nested vendor dialogs must not trap focus away from our Back/Close buttons.
        panel.addEventListener('keydown', function (event) {
            if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); panel.close(); }
            if (event.key !== 'Tab') return;
            var controls = Array.from(panel.querySelectorAll('button, input, select, textarea, a[href], [tabindex="0"]')).filter(function (el) { return !el.disabled && el.getClientRects().length; });
            if (!controls.length) return;
            var index = controls.indexOf(document.activeElement);
            event.preventDefault(); event.stopPropagation();
            controls[(index + (event.shiftKey ? -1 : 1) + controls.length) % controls.length].focus();
        }, true);
        ['keydown', 'touchstart', 'touchmove', 'touchend', 'click'].forEach(function (type) {
            panel.addEventListener(type, function (event) { event.stopPropagation(); });
        });
        function refresh() {
            if (panel.open && !borrowed && heading.textContent !== labels.volume) {
                var index = Array.from(content.children).indexOf(document.activeElement);
                overview();
                if (content.children[index]) content.children[index].focus();
            }
        }
        player.on(['loadedmetadata', 'playerSourcesChanged', 'ratechange', 'volumechange'], refresh);
        var lists = [player.audioTracks(), player.textTracks()];
        if (typeof player.qualityLevels === 'function') lists.push(player.qualityLevels());
        lists.forEach(function (list) { list.on(['change', 'addtrack', 'removetrack', 'addqualitylevel', 'removequalitylevel'], refresh); });

        // Accumulate intent before touching the media timeline; there is one final seek.
        overlay.disable();
        function syncControls() { overlay.toggleClass('show-play-toggle', player.userActive()); }
        player.on(['useractive', 'userinactive', 'playing'], syncControls);
        player.on('pause', function () { player.userActive(true); player.reportUserActivity(); });
        syncControls();
        var surface = overlay.el(), first, singleTimer, commitTimer, pending, start;
        var feedback = document.createElement('div'); feedback.className = 'mobile-seek-feedback';
        feedback.setAttribute('role', 'status'); root.appendChild(feedback);
        function resume(wasPlaying) {
            if (wasPlaying) { var promise = player.play(); if (promise) promise.catch(function () {}); }
        }
        function cancel(restore) {
            clearTimeout(singleTimer); clearTimeout(commitTimer); first = null;
            var previous = pending; pending = null; feedback.textContent = '';
            if (restore && previous) resume(previous.playing);
        }
        function bounds() {
            var ranges = player.seekable(), position = pending ? pending.origin : player.currentTime();
            for (var i = 0; i < ranges.length; i++) {
                if (position >= ranges.start(i) && position <= ranges.end(i)) {
                    return [Math.max(ranges.start(i), video_data.params.video_start || 0), Math.min(ranges.end(i), video_data.params.video_end > 0 ? video_data.params.video_end : Infinity)];
                }
            }
            return null;
        }
        function target() {
            var range = bounds();
            return range && range[1] >= range[0] ? Math.max(range[0], Math.min(range[1], pending.origin + pending.delta)) : null;
        }
        function queue(direction) {
            if (!pending) {
                if (!bounds()) return;
                pending = {origin: player.currentTime(), delta: 0, playing: !player.paused()}; player.pause();
            }
            pending.delta += direction * 10;
            var destination = target();
            if (destination === null) { cancel(true); return; }
            var delta = Math.round((destination - pending.origin) * 10) / 10;
            feedback.textContent = (delta < 0 ? '−' : '+') + Math.abs(delta) + ' s';
            feedback.dataset.direction = direction < 0 ? 'left' : 'right';
            clearTimeout(commitTimer);
            commitTimer = setTimeout(function () {
                var destination = target(), previous = pending; cancel(false);
                if (destination !== null && destination !== previous.origin) player.currentTime(destination);
                resume(previous.playing);
            }, 500);
        }
        function touchStart(event) {
            start = event.touches.length === 1 ? {x: event.touches[0].clientX, y: event.touches[0].clientY, active: player.userActive()} : null;
        }
        function touchMove(event) {
            if (!start || event.touches.length !== 1 || Math.hypot(event.touches[0].clientX - start.x, event.touches[0].clientY - start.y) > 12) start = null;
        }
        function touchEnd(event) {
            if (event.target !== surface || !start || event.changedTouches.length !== 1 || panel.open) return;
            event.preventDefault();
            var rect = surface.getBoundingClientRect(), x = event.changedTouches[0].clientX - rect.left;
            var direction = x < rect.width / 3 ? -1 : x > rect.width * 2 / 3 ? 1 : 0;
            if (pending) {
                if (direction) queue(direction);
                else cancel(true);
                return;
            }
            if (first && direction && first.direction === direction) {
                clearTimeout(singleTimer); first = null; queue(direction); return;
            }
            clearTimeout(singleTimer);
            first = {direction: direction, active: start.active};
            singleTimer = setTimeout(function () {
                var active = !first.active; first = null; player.userActive(active);
                overlay.toggleClass('show-play-toggle', active); if (active) player.reportUserActivity();
            }, 300);
        }
        function otherControl(event) {
            if (event.target !== surface && !panel.contains(event.target)) cancel(!event.target.closest('.vjs-play-control'));
        }
        function externalSeek() { cancel(false); }
        function leaving() { cancel(false); }
        surface.addEventListener('touchstart', touchStart, {passive: true, capture: true});
        surface.addEventListener('touchmove', touchMove, {passive: true});
        surface.addEventListener('touchend', touchEnd, {passive: false});
        surface.addEventListener('touchcancel', leaving);
        root.addEventListener('pointerdown', otherControl, true);
        player.on(['loadstart', 'seeking', 'play'], externalSeek);
        window.addEventListener('pagehide', leaving);
        player.on('dispose', function () {
            disposed = true;
            cancel(false); if (panel.open) { release(); panel.close(); document.documentElement.style.overflow = scrollStyle; }
            lists.forEach(function (list) { list.off(['change', 'addtrack', 'removetrack', 'addqualitylevel', 'removequalitylevel'], refresh); });
            window.removeEventListener('pagehide', leaving);
            root.removeEventListener('pointerdown', otherControl, true);
            surface.removeEventListener('touchstart', touchStart, true);
            surface.removeEventListener('touchmove', touchMove);
            surface.removeEventListener('touchend', touchEnd);
            surface.removeEventListener('touchcancel', leaving);
        });
    });
}());
