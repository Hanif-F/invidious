'use strict';

// Shared DASH stream descriptions and Video.js controls for desktop and mobile.
(function () {
    if (!window.videojs) return;

    var data = JSON.parse(document.getElementById('player_data').textContent);
    var labels = data.stream_labels || {};
    var formats = data.stats_formats || [];

    function number(value) {
        value = Number(value);
        return Number.isFinite(value) && value >= 0 ? value : null;
    }

    function formatDecimal(value, digits) {
        return value.toFixed(digits).replace(/(\.\d*?[1-9])0+$|\.0+$/, '$1');
    }

    function formatBytes(value) {
        value = number(value);
        if (value === null) return '';
        if (value >= 1e9) return formatDecimal(value / 1e9, 1) + ' GB';
        if (value >= 1e6) return formatDecimal(value / 1e6, 1) + ' MB';
        if (value >= 1e3) return formatDecimal(value / 1e3, 1) + ' kB';
        return Math.round(value) + ' B';
    }

    function formatBitrate(value) {
        value = number(value);
        if (value === null) return '';
        if (value >= 1e6) return formatDecimal(value / 1e6, 2) + ' Mbps';
        if (value >= 1e3) return formatDecimal(value / 1e3, 1) + ' kbps';
        return Math.round(value) + ' bps';
    }

    function secondary(format, fallbackBitrate) {
        var parts = [];
        var size = formatBytes(format && format.contentLength);
        var bitrate = formatBitrate(format && format.bitrate != null ? format.bitrate : fallbackBitrate);
        if (size) parts.push(size);
        if (bitrate) parts.push(bitrate);
        return parts.join(' · ');
    }

    function formatForLevel(level) {
        return formats.find(function (format) {
            return level.id != null && format.itag != null && String(format.itag) === String(level.id);
        }) || {};
    }

    function tierName(index, length) {
        if (length < 2) return '';
        if (index === 0) return labels.high_bitrate || 'High Bitrate';
        if (index === length - 1) return labels.low_bitrate || 'Low Bitrate';
        return labels.medium_bitrate || 'Medium Bitrate';
    }

    function retainedIndexes(length, maximum) {
        if (length <= maximum) return Array.from({length: length}, function (_, index) { return index; });
        if (maximum === 2) return [0, length - 1];
        return [0, Math.floor((length - 1) / 2), length - 1];
    }

    function qualityOptions(player) {
        var levels = Array.from(player.qualityLevels ? player.qualityLevels() : []);
        if (!levels.length) return [];
        var allEnabled = levels.every(function (level) { return level.enabled; });
        var options = [{
            primary: labels.auto || 'Auto', secondary: '', selected: allEnabled,
            select: function () { levels.forEach(function (level) { level.enabled = true; }); }
        }];
        var groups = new Map();
        levels.forEach(function (level, originalIndex) {
            var format = formatForLevel(level);
            var height = number(level.height != null ? level.height : format.height) || 0;
            var fps = number(format.fps != null ? format.fps : (level.frameRate || level.fps)) || 0;
            var shownFps = fps > 30 ? Math.round(fps) : 0;
            var key = height + '/' + shownFps;
            if (!groups.has(key)) groups.set(key, {height: height, fps: shownFps, entries: []});
            groups.get(key).entries.push({level: level, format: format, bitrate: number(level.bitrate != null ? level.bitrate : format.bitrate) || 0, originalIndex: originalIndex});
        });
        Array.from(groups.values()).sort(function (a, b) { return b.height - a.height || b.fps - a.fps; }).forEach(function (group) {
            group.entries.sort(function (a, b) { return b.bitrate - a.bitrate || a.originalIndex - b.originalIndex; });
            retainedIndexes(group.entries.length, 3).forEach(function (index) {
                var entry = group.entries[index];
                var base = group.height ? group.height + 'p' + (group.fps ? group.fps : '') : formatBitrate(entry.bitrate);
                var tier = tierName(index, group.entries.length);
                options.push({
                    primary: base + (tier ? ' ' + tier : ''),
                    secondary: secondary(entry.format, entry.bitrate),
                    selected: !allEnabled && levels.filter(function (level) { return level.enabled; }).length === 1 && entry.level.enabled,
                    select: function () { levels.forEach(function (level) { level.enabled = level === entry.level; }); },
                    level: entry.level
                });
            });
        });
        return options;
    }

    function audioFormat(track) {
        var trackLabel = track.label || '';
        var audioFormats = formats.filter(function (format) { return format.audioTrack && !format.height; });
        var named = audioFormats.filter(function (format) {
            return format.audioTrack.displayName && trackLabel.indexOf(format.audioTrack.displayName) >= 0;
        });
        var bitrateMatch = trackLabel.match(/\[(\d+)k\]/);
        if (bitrateMatch) {
            var stableHint = /(?:stable volume|\bdrc\b)/i.test(trackLabel);
            var exact = named.find(function (format) { return String(format.bitrate) === bitrateMatch[1] && (format.isDrc === true) === stableHint; });
            exact = exact || named.find(function (format) { return String(format.bitrate) === bitrateMatch[1]; });
            if (exact) return exact;
        }
        return named.length === 1 ? named[0] : {};
    }

    function audioInfo(track, originalIndex) {
        var format = audioFormat(track);
        var audioTrack = format.audioTrack || {};
        var name = audioTrack.displayName || track.label || track.language || 'Unknown';
        var stable = format.isDrc === true || /(?:stable volume|\bdrc\b)/i.test(name + ' ' + (track.label || ''));
        var original = audioTrack.audioIsDefault === true || /\boriginal\b/i.test(name);
        if (!format.audioTrack && track.kind === 'main' && !stable) original = true;
        return {
            track: track, format: format, name: name, stable: stable, original: original,
            identity: audioTrack.id || track.language || name,
            bitrate: number(format.bitrate) || 0, originalIndex: originalIndex
        };
    }

    function audioTierOptions(entries, stable) {
        entries.sort(function (a, b) { return b.bitrate - a.bitrate || a.originalIndex - b.originalIndex; });
        var kept = retainedIndexes(entries.length, 2).map(function (index) { return entries[index]; });
        var active = entries.find(function (entry) { return entry.track.enabled; });
        if (active && kept.indexOf(active) < 0) kept.splice(1, 0, active);
        return kept.map(function (entry) {
            var sourceIndex = entries.indexOf(entry);
            var tier = kept.length === 1 ? '' : sourceIndex === 0 ? (labels.high_bitrate || 'High Bitrate') :
                sourceIndex === entries.length - 1 ? (labels.low_bitrate || 'Low Bitrate') : '';
            var qualifiers = [];
            if (!/\boriginal\b/i.test(entry.name)) qualifiers.push(labels.original_audio || 'Original Audio');
            if (stable) qualifiers.push(labels.stable_volume || 'Stable Volume');
            if (tier) qualifiers.push(tier);
            return {
                primary: entry.name + (qualifiers.length ? ' · ' + qualifiers.join(' · ') : ''),
                secondary: secondary(entry.format, entry.bitrate), selected: entry.track.enabled,
                select: function () { entry.track.enabled = true; }, track: entry.track
            };
        });
    }

    function audioOptions(player) {
        var entries = Array.from(player.audioTracks ? player.audioTracks() : []).map(audioInfo);
        if (!entries.length) return [];
        var regular = entries.filter(function (entry) { return entry.original && !entry.stable; });
        var stable = entries.filter(function (entry) { return entry.original && entry.stable; });
        var dubs = entries.filter(function (entry) { return !entry.original; });
        // If old manifests expose no identity metadata, preserve their current order.
        if (!regular.length && !stable.length) return entries.map(function (entry) {
            return {primary: entry.name, secondary: secondary(entry.format, entry.bitrate), selected: entry.track.enabled,
                select: function () { entry.track.enabled = true; }, track: entry.track};
        });
        var options = audioTierOptions(regular, false).concat(audioTierOptions(stable, true));
        if (dubs.length) {
            options.push({divider: true, primary: labels.dubbed_audio || 'Dubbed Audio'});
            var groups = new Map();
            dubs.forEach(function (entry) {
                if (!groups.has(entry.identity)) groups.set(entry.identity, []);
                groups.get(entry.identity).push(entry);
            });
            Array.from(groups.values()).map(function (group) {
                group.sort(function (a, b) { return b.bitrate - a.bitrate || a.originalIndex - b.originalIndex; });
                return group.find(function (entry) { return entry.track.enabled; }) || group[0];
            }).sort(function (a, b) { return a.name.localeCompare(b.name); }).forEach(function (entry) {
                options.push({primary: entry.name, secondary: secondary(entry.format, entry.bitrate), selected: entry.track.enabled,
                    select: function () { entry.track.enabled = true; }, track: entry.track});
            });
        }
        return options;
    }

    function selectedText(options) {
        var selected = options.find(function (option) { return option.selected; });
        return selected ? selected.primary : '';
    }

    var MenuItem = videojs.getComponent('MenuItem');
    var RichStreamMenuItem = videojs.extend(MenuItem, {
        constructor: function (player, options) {
            options.selectable = !options.divider;
            options.multiSelectable = false;
            options.label = options.primary;
            MenuItem.call(this, player, options);
            if (options.divider) this.disable();
        },
        createEl: function () {
            var el = MenuItem.prototype.createEl.call(this);
            var target = el.querySelector('.vjs-menu-item-text') || el;
            target.textContent = '';
            var primary = document.createElement('span'); primary.className = 'stream-option-primary';
            primary.textContent = this.options_.primary; target.appendChild(primary);
            if (this.options_.secondary) {
                var secondaryEl = document.createElement('span'); secondaryEl.className = 'stream-option-secondary';
                secondaryEl.textContent = this.options_.secondary; target.appendChild(secondaryEl);
            }
            if (this.options_.divider) {
                el.classList.add('stream-option-divider'); el.setAttribute('role', 'separator');
            } else {
                el.setAttribute('aria-label', [this.options_.primary, this.options_.secondary].filter(Boolean).join(', '));
            }
            return el;
        },
        handleClick: function (event) {
            if (this.options_.divider) return;
            MenuItem.prototype.handleClick.call(this, event);
            this.options_.select();
        }
    });
    videojs.registerComponent('RichStreamMenuItem', RichStreamMenuItem);

    var MenuButton = videojs.getComponent('MenuButton');
    function registerButton(name, className, controlText, source) {
        var Button = videojs.extend(MenuButton, {
            constructor: function (player, options) {
                MenuButton.call(this, player, options);
                var list = source === qualityOptions ? player.qualityLevels() : player.audioTracks();
                this.streamList_ = list;
                this.streamUpdate_ = videojs.bind(this, this.update);
                list.on(['change', 'addqualitylevel', 'removequalitylevel', 'addtrack', 'removetrack'], this.streamUpdate_);
                this.on('dispose', function () { list.off(['change', 'addqualitylevel', 'removequalitylevel', 'addtrack', 'removetrack'], this.streamUpdate_); });
                this.controlText(controlText);
            },
            buildCSSClass: function () { return className + ' vjs-icon-cog ' + MenuButton.prototype.buildCSSClass.call(this); },
            createItems: function () {
                return source(this.player()).map(function (option) { return new RichStreamMenuItem(this.player(), option); }, this);
            }
        });
        videojs.registerComponent(name, Button);
    }
    registerButton('RichQualityButton', 'vjs-rich-quality', (data.mobile_labels || {}).quality || 'Quality', qualityOptions);
    registerButton('RichAudioButton', 'vjs-rich-audio vjs-icon-audio', (data.mobile_labels || {}).audio || 'Audio', audioOptions);

    window.InvidiousStreamMenus = {
        qualityOptions: qualityOptions,
        audioOptions: audioOptions,
        selectedText: selectedText,
        formatBytes: formatBytes,
        formatBitrate: formatBitrate
    };
}());
