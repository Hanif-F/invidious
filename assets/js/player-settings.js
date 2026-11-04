'use strict';

// Desktop chrome consumes the existing stream-selection and Video.js controls.
(function () {
    var data = window.player_data;
    if (!data || !window.player || typeof player.getChild !== 'function' || player.invidiousSettingsStarted) return;
    player.invidiousSettingsStarted = true;
    function icon(name) {
        var svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
        svg.setAttribute('class','ui-icon'); svg.setAttribute('viewBox','0 0 24 24'); svg.setAttribute('aria-hidden','true'); svg.setAttribute('focusable','false');
        svg.setAttribute('fill','none'); svg.setAttribute('stroke','currentColor'); svg.setAttribute('stroke-width','2'); svg.setAttribute('stroke-linecap','round'); svg.setAttribute('stroke-linejoin','round');
        var use = document.createElementNS(svg.namespaceURI,'use'); use.setAttribute('href',(data.icon_sprite || '/icons/lucide.svg')+'#'+name); svg.append(use); return svg;
    }
    window.InvidiousPlayerInterface = {icon:icon};
    if (typeof isMobile === 'function' && isMobile()) return;
    player.ready(function () {
        if (video_data.params.controls === false) return;
        var root = player.el(), bar = player.getChild('controlBar'), labels = data.mobile_labels, words = data.interface_labels || {};
        var PiP = videojs.getComponent('PictureInPictureToggle');
        if (PiP && document.pictureInPictureEnabled && !video_data.params.listen && !bar.getChild('pictureInPictureToggle')) bar.addChild(new PiP(player),{},bar.children().indexOf(bar.getChild('fullscreenToggle')));
        var storage = window.InvidiousStorage, life = new AbortController(), active = true, disposed = false, route = 'main', queued = null;
        if (player.invidiousDockEnabled === undefined) player.invidiousDockEnabled = storage.local.get('player_dock_enabled') === true;
        var gear = new (videojs.getComponent('Button'))(player);
        gear.addClass('vjs-desktop-settings'); gear.controlText(labels.settings); gear.el().setAttribute('aria-haspopup','dialog'); gear.el().setAttribute('aria-expanded','false');
        gear.el().querySelector('.vjs-icon-placeholder').replaceChildren(icon('settings'));
        bar.addChild(gear,{},bar.children().indexOf(bar.getChild('fullscreenToggle')));
        var panel = document.createElement('dialog'); panel.className = 'player-settings-panel'; panel.id = player.id()+'-settings'; panel.setAttribute('aria-label',labels.settings);
        gear.el().setAttribute('aria-controls',panel.id);
        var header = document.createElement('header'), heading = document.createElement('h2'), content = document.createElement('div'), status = document.createElement('p');
        content.className = 'player-settings-content'; status.className = 'player-settings-status'; status.setAttribute('role','status');
        function on(target,event,callback,options) { target.addEventListener(event,callback,Object.assign({signal:life.signal},options)); }
        function current() { return active && !disposed && storage.isCurrent() && !player.isDisposed(); }
        function controlIcon(component,symbol) {
            if (!component) return;
            var placeholder = component.el().querySelector('.vjs-icon-placeholder');
            if (!placeholder) return;
            component.addClass('owned-control-icon'); placeholder.replaceChildren(icon(symbol));
        }
        function playbackIcons() {
            if (!current()) return;
            controlIcon(bar.getChild('playToggle'),player.paused() ? 'play' : 'pause');
            var volume = bar.getChild('volumePanel');
            controlIcon(volume && volume.getChild('muteToggle'),player.muted() || player.volume() === 0 ? 'volume-x' : 'volume-2');
        }
        controlIcon(bar.getChild('fullscreenToggle'),'maximize');
        controlIcon(player.getChild('bigPlayButton'),'play');
        var posterReveal = root.querySelector('.spoiler-poster-reveal');
        if (posterReveal && document.body.hasAttribute('data-overhaul')) posterReveal.prepend(icon('eye'));
        // A dynamically created component has no registered child name.
        bar.children().forEach(function (component) { if (component.hasClass('vjs-picture-in-picture-control')) controlIcon(component,'picture-in-picture-2'); });
        player.on(['play','pause','volumechange'],playbackIcons); playbackIcons();
        function word(key,fallback) { return words[key] || fallback || key; }
        function button(text,action,parent) {
            var el = document.createElement('button'); el.type = 'button'; el.textContent = text; el.addEventListener('click',action); (parent || content).append(el); return el;
        }
        var back = button('',function () { render(route === 'appearance' ? 'captions' : 'main',true); },header);
        back.append(icon('arrow-left')); back.setAttribute('aria-label',labels.back); back.title = labels.back;
        header.append(heading);
        var close = button('',function () { hide(true); },header); close.append(icon('x')); close.setAttribute('aria-label',labels.close); close.title = labels.close;
        panel.append(header,content,status); root.append(panel);
        var borrowed = null, errors = new WeakSet(), delayedTracks = new WeakSet(), emptyTracks = new WeakSet(), trackOwners = new Map();
        function release() {
            if (!borrowed) return;
            var previous = borrowed; borrowed = null;
            previous.parent.append(previous.el); previous.component.close();
        }
        function hiddenControls() {
            ['qualitySelector','audioTrackButton','playbackRateMenuButton'].forEach(function (name) {
                var component = bar.getChild(name); if (component) component.el().classList.add('player-secondary-control');
            });
            bar.children().forEach(function (component) { if (component.hasClass('vjs-refresh-buffer') || component.hasClass('vjs-stats-control')) component.el().classList.add('player-secondary-control'); });
        }
        function selectedText(options) { return options.filter(function (item) { return item.selected && !item.divider; }).map(function (item) { return item.primary || item.label; }).join(', '); }
        function row(key,title,value,symbol,action,disabled,submenu) {
            var el = button('',action); el.dataset.setting = key; el.setAttribute('role','menuitem'); el.disabled = !!disabled;
            el.append(icon(symbol)); var name = document.createElement('span'); name.className = 'player-setting-name'; name.dir = 'auto'; name.textContent = title; el.append(name);
            if (value) { var detail = document.createElement('span'); detail.className = 'player-setting-value'; detail.dir = 'auto'; detail.textContent = value; el.append(detail); }
            if (submenu) el.append(icon('chevron-right'));
            el.setAttribute('aria-label',title+(value ? ', '+value : '')); return el;
        }
        function choices(title,items) {
            heading.textContent = title;
            items.forEach(function (item,index) {
                if (item.divider) { var divider = document.createElement('div'); divider.className = 'stream-option-divider'; divider.setAttribute('role','separator'); divider.textContent = item.primary; content.append(divider); return; }
                var el = button('',function () {
                    if (!current()) return;
                    try { item.select(); render('main',true); } catch (_) { status.textContent = word('failed',data.stats_labels.unavailable); }
                });
                el.dataset.choice = String(index); el.setAttribute('role','menuitemradio'); el.setAttribute('aria-checked',String(!!item.selected)); el.disabled = !!item.disabled;
                el.append(icon(item.selected ? 'check' : 'play')); if (!item.selected) el.firstElementChild.classList.add('player-empty-check');
                var text = document.createElement('span'), primary = document.createElement('span'); primary.className = 'stream-option-primary'; primary.textContent = item.primary || item.label; text.append(primary);
                if (item.secondary) { var detail = document.createElement('span'); detail.className = 'stream-option-secondary'; detail.textContent = item.secondary; text.append(detail); }
                el.append(text); el.setAttribute('aria-label',[item.primary || item.label,item.secondary].filter(Boolean).join(', '));
            });
        }
        function fallbackOptions(name) {
            var component = bar.getChild(name);
            return component && component.items ? component.items.map(function (item) {
                var description = name === 'qualitySelector' ? InvidiousStreamMenus.sourceDescription(item.source) : {};
                return {label:item.options_.label,primary:description.primary,secondary:description.secondary,selected:name === 'qualitySelector' ? item.source.src === player.currentSource().src : item.selected(),select:function () {
                    if (name === 'qualitySelector') InvidiousStreamMenus.selectFallbackSource(player,item);
                    else item.handleClick();
                }};
            }) : [];
        }
        function quality() { return video_data.params.quality === 'dash' && !video_data.params.listen ? InvidiousStreamMenus.qualityOptions(player) : fallbackOptions('qualitySelector'); }
        function audio() { return video_data.params.quality === 'dash' && !video_data.params.listen ? InvidiousStreamMenus.audioOptions(player) : fallbackOptions('audioTrackButton'); }
        function captionTrack(track) { return track && (track.kind === 'captions' || track.kind === 'subtitles'); }
        function tracks() { return Array.from(player.textTracks()).filter(captionTrack); }
        function remoteTracks() { return Array.from(player.remoteTextTrackEls ? player.remoteTextTrackEls() : []).filter(function (el) { return captionTrack(el.track); }); }
        function trackError(track) { return errors.has(track) || remoteTracks().some(function (el) { return el.track === track && el.readyState === 3; }); }
        function trackUnresolved(track) { return trackError(track) || delayedTracks.has(track) || emptyTracks.has(track); }
        function retryTrack(el) {
            if (!current() || !el || !el.track || !el.src) return;
            var original = el.track, mode = original.mode;
            var replacement = player.addRemoteTextTrack({src:el.src,kind:original.kind,label:original.label,language:original.language,id:original.id},false);
            if (!replacement || !replacement.track) return;
            replacement.track.mode = mode === 'disabled' ? 'hidden' : mode;
            replacement.one('load',function () { if (current() && mode === 'disabled' && replacement.track.mode === 'hidden') replacement.track.mode = 'disabled'; });
            player.removeRemoteTextTrack(original); observeTracks(); refresh();
        }
        function observeTracks() {
            remoteTracks().forEach(function (el) {
                var owner = trackOwners.get(el);
                if (!owner) {
                    owner = {timer:null};
                    owner.failed = function () { clearTimeout(owner.timer); owner.timer = null; if (el.track) errors.add(el.track); refresh(); };
                    owner.loaded = function () {
                        clearTimeout(owner.timer); owner.timer = null;
                        if (el.track) { errors.delete(el.track); delayedTracks.delete(el.track); if (!el.track.cues || !el.track.cues.length) emptyTracks.add(el.track); else emptyTracks.delete(el.track); }
                        refresh();
                    };
                    el.on('error',owner.failed); el.on('load',owner.loaded); trackOwners.set(el,owner);
                }
                if (!el.track || el.track.mode === 'disabled' || el.readyState === 2) {
                    if (el.track && el.readyState === 2 && (!el.track.cues || !el.track.cues.length)) emptyTracks.add(el.track);
                    clearTimeout(owner.timer); owner.timer = null; return;
                }
                // Video.js 7's emulated track loader logs network errors without
                // emitting error or changing readyState. A deadline is an honest
                // unresolved state, not proof of a failed or empty caption file.
                if (current() && owner.timer === null && !trackUnresolved(el.track)) owner.timer = setTimeout(function () {
                    owner.timer = null;
                    if (current() && remoteTracks().includes(el) && el.track.mode !== 'disabled' && el.readyState !== 2) { delayedTracks.add(el.track); refresh(); }
                },8000);
            });
            trackOwners.forEach(function (owner,el) { if (remoteTracks().includes(el)) return; clearTimeout(owner.timer); el.off('error',owner.failed); el.off('load',owner.loaded); trackOwners.delete(el); });
        }
        function captionView() {
            var list = tracks(), selected = list.find(function (track) { return track.mode === 'showing'; });
            row('appearance',labels.appearance,'','captions',function () { render('appearance',true); },false,true);
            remoteTracks().filter(function (el) { return trackUnresolved(el.track); }).forEach(function (el) {
                row('retry-caption:'+String(el.track.id || el.track.language+' '+el.track.label),word('caption_retry',labels.back)+' · '+el.track.label,'','rotate-cw',function () { retryTrack(el); });
            });
            choices(labels.captions,[null].concat(list).map(function (track) {
                var message = track && (trackError(track) ? word('caption_error',data.stats_labels.unavailable) : emptyTracks.has(track) ? word('caption_empty','No caption lines were loaded. Try again.') : delayedTracks.has(track) ? word('caption_waiting','Captions are taking longer to load. Try again.') : '');
                return {label:track ? track.label : labels.off,selected:track === (selected || null),secondary:message || '',select:function () { list.forEach(function (other) { other.mode = track === other ? 'showing' : 'disabled'; }); observeTracks(); }};
            }));
        }
        function appearance() {
            heading.textContent = labels.appearance; content.removeAttribute('role');
            var component = player.getChild('textTrackSettings');
            if (!component) { status.textContent = data.stats_labels.unavailable; return; }
            var el = component.el(); borrowed = {component:component,el:el,parent:el.parentNode};
            component.options_.pauseOnOpen = false; component.options_.temporary = false;
            content.append(el); component.open();
            component.one('modalclose',function () { if (borrowed && borrowed.component === component && current()) render('captions',true); });
        }
        function advanced() {
            heading.textContent = word('advanced',labels.settings);
            if (document.querySelector('.watch-player')) {
                var enabled = player.invidiousDockEnabled;
                var toggle = row('dock',word('dock',labels.settings),enabled ? word('on','On') : labels.off,'picture-in-picture-2',function () {
                    if (!current()) return;
                    player.invidiousDockEnabled = !player.invidiousDockEnabled;
                    var saved = storage.local.set('player_dock_enabled',player.invidiousDockEnabled);
                    player.trigger('dockpreferencechange'); render('advanced',true);
                    if (!saved) status.textContent = window.InvidiousUI ? InvidiousUI.label('page_only') : word('page_only','Saved for this page only.');
                });
                toggle.setAttribute('role','menuitemcheckbox'); toggle.setAttribute('aria-checked',String(enabled));
            }
            row('annotations',video_data.params.annotations ? data.hide_annotations : data.show_annotations,'',video_data.params.annotations ? 'eye-off' : 'eye',function () {
                if (!current()) return;
                var url = new URL(location.href);
                url.searchParams.set('iv_load_policy',video_data.params.annotations ? '3' : '1');
                location.assign(url.href);
            });
            row('refresh',data.refresh_buffer,'','rotate-cw',function () { hide(true); player.refreshBuffer(); });
            if (player.statsForNerds) row('diagnostics',data.stats_labels.title,'','info',function () { hide(false); player.statsForNerds.toggle(gear.el()); });
        }
        function render(next,focus) {
            if (!current()) return;
            release(); observeTracks(); route = next; panel.dataset.view = next; content.replaceChildren(); content.setAttribute('role','menu'); status.textContent = ''; back.hidden = next === 'main';
            if (next === 'main') {
                heading.textContent = labels.settings;
                var q = quality(), a = audio(), caption = tracks().find(function (track) { return track.mode === 'showing'; });
                row('quality',word('quality_codec',labels.quality),selectedText(q) || player.currentSource().label || data.stats_labels.unavailable,'settings',function () { render('quality',true); },!q.length,true);
                row('audio',labels.audio,selectedText(a) || data.stats_labels.unavailable,'languages',function () { render('audio',true); },!a.some(function (item) { return !item.divider; }),true);
                row('captions',labels.captions,caption ? caption.label : labels.off,'captions',function () { render('captions',true); },!tracks().length,true);
                row('speed',labels.speed,player.playbackRate()+'×','gauge',function () { render('speed',true); },false,true);
                row('advanced',word('advanced',labels.settings),'','info',function () { render('advanced',true); },false,true);
            } else if (next === 'quality') choices(word('quality_codec',labels.quality),quality());
            else if (next === 'audio') choices(labels.audio,audio());
            else if (next === 'captions') captionView();
            else if (next === 'speed') {
                var rates = player.options_.playbackRates.slice(); if (!rates.includes(player.playbackRate())) rates.push(player.playbackRate()); rates.sort(function (a,b) { return a-b; });
                choices(labels.speed,rates.map(function (rate) { return {label:rate+'×',selected:rate === player.playbackRate(),select:function () { player.playbackRate(rate); }}; }));
            } else if (next === 'appearance') appearance();
            else if (next === 'advanced') advanced();
            if (focus && panel.open && next !== 'appearance') { var first = content.querySelector('button:not(:disabled),a[href]'); (first || back).focus(); }
        }
        function hide(restore) {
            if (!panel.open) return;
            release(); panel.close(); root.classList.remove('player-settings-open'); gear.el().setAttribute('aria-expanded','false');
            if (restore && current()) gear.el().focus({preventScroll:true});
            if (current()) { player.userActive(true); player.reportUserActivity(); }
        }
        gear.on('click',function () {
            if (!current()) return;
            if (panel.open) { hide(true); return; }
            hiddenControls(); observeTracks(); render('main',false); panel.show(); root.classList.add('player-settings-open'); gear.el().setAttribute('aria-expanded','true');
            player.userActive(true); player.reportUserActivity(); var first = content.querySelector('button:not(:disabled)'); if (first) first.focus();
        });
        on(panel,'cancel',function (event) { event.preventDefault(); hide(true); });
        on(panel,'keydown',function (event) {
            if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); hide(true); return; }
            if (event.key !== 'Tab' && event.target.closest('input,select,textarea')) return;
            var controls = Array.from(panel.querySelectorAll('button,a[href],input,select,textarea,[tabindex="0"]')).filter(function (el) { return !el.disabled && el.getClientRects().length; });
            var index = controls.indexOf(document.activeElement);
            if (event.key === 'Tab' || ['ArrowUp','ArrowDown','Home','End'].includes(event.key)) {
                event.preventDefault(); event.stopPropagation(); if (!controls.length) return;
                var next = event.key === 'Home' ? 0 : event.key === 'End' ? controls.length-1 : (index+(event.key === 'ArrowUp' || event.key === 'Tab' && event.shiftKey ? -1 : 1)+controls.length)%controls.length;
                controls[next].focus();
            }
        },{capture:true});
        on(panel,'click',function (event) { event.stopPropagation(); });
        on(document,'click',function (event) {
            if (!panel.open || panel.contains(event.target) || gear.el().contains(event.target)) return;
            var surface = root.contains(event.target) && event.target.closest('.vjs-tech,.vjs-poster');
            hide(false); if (surface) { event.preventDefault(); event.stopPropagation(); }
        },{capture:true});
        function refresh() {
            if (!current() || !panel.open || borrowed || queued !== null) return;
            queued = requestAnimationFrame(function () {
                queued = null; if (!current() || !panel.open || borrowed) return;
                var focused = document.activeElement, wasContent = content.contains(focused), key = focused.dataset.setting, choice = focused.dataset.choice;
                render(route,false);
                var next = Array.from(content.querySelectorAll('button,a')).find(function (el) { return key !== undefined ? el.dataset.setting === key : choice !== undefined && el.dataset.choice === choice; });
                if (wasContent) (next || back).focus({preventScroll:true});
            });
        }
        var lists = [player.audioTracks(),player.textTracks()]; if (player.qualityLevels) lists.push(player.qualityLevels());
        function tracksChanged() { observeTracks(); refresh(); }
        lists.forEach(function (list) { list.on(['change','addtrack','removetrack','addqualitylevel','removequalitylevel'],tracksChanged); });
        player.on(['loadedmetadata','playerSourcesChanged','ratechange','sponsorblockstatechange','dearrowstatechange'],refresh);
        function contextChanged() { hide(false); }
        player.on(['fullscreenchange','dockchange'],contextChanged);
        on(window,'browserprofilechange',function () { hide(false); active = false; gear.disable(); trackOwners.forEach(function (owner) { clearTimeout(owner.timer); owner.timer = null; }); });
        on(window,'pagehide',function (event) { hide(false); active = false; trackOwners.forEach(function (owner) { clearTimeout(owner.timer); owner.timer = null; }); if (!event.persisted) cleanup(); });
        on(window,'pageshow',function () { active = !disposed; observeTracks(); });
        function cleanup() {
            hide(false); release(); disposed = true; life.abort(); cancelAnimationFrame(queued); panel.remove();
            lists.forEach(function (list) { list.off(['change','addtrack','removetrack','addqualitylevel','removequalitylevel'],tracksChanged); });
            player.off(['loadedmetadata','playerSourcesChanged','ratechange','sponsorblockstatechange','dearrowstatechange'],refresh); player.off(['fullscreenchange','dockchange'],contextChanged);
            player.off(['play','pause','volumechange'],playbackIcons);
            trackOwners.forEach(function (owner,el) { clearTimeout(owner.timer); el.off('error',owner.failed); el.off('load',owner.loaded); }); trackOwners.clear();
        }
        player.on('dispose',cleanup); root.classList.add('invidious-desktop'); hiddenControls();
    });
})();
