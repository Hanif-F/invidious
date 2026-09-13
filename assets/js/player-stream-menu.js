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

    function positiveNumber(value) {
        value = number(value);
        return value !== null && value > 0 ? value : null;
    }

    function formatDecimal(value, digits) {
        return value.toFixed(digits).replace(/(\.\d*?[1-9])0+$|\.0+$/, '$1');
    }

    function formatBytes(value) {
        value = positiveNumber(value);
        if (value === null) return '';
        if (value >= 1e9) return formatDecimal(value / 1e9, 1) + ' GB';
        if (value >= 1e6) return formatDecimal(value / 1e6, 1) + ' MB';
        if (value >= 1e3) return formatDecimal(value / 1e3, 1) + ' kB';
        return Math.round(value) + ' B';
    }

    function formatBitrate(value) {
        value = positiveNumber(value);
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

    function representationItag(player, level) {
        try {
            var tech = player.tech({IWillNotUseThisInPlugins: true});
            var vhs = tech && tech.vhs;
            var representation = vhs && vhs.representations && vhs.representations().find(function (entry) {
                return String(entry.id) === String(level.id);
            });
            return representation && representation.playlist && representation.playlist.attributes && representation.playlist.attributes.NAME;
        } catch (_) {
            return null;
        }
    }

    function formatForLevel(player, level) {
        var itag = representationItag(player, level);
        var exact = formats.find(function (format) {
            return itag != null && format.itag != null && String(format.itag) === String(itag) && format.height;
        });
        if (exact) return exact;
        // QualityLevel IDs are VHS playlist IDs in production, but tests and
        // non-VHS integrations may expose the representation ID directly.
        exact = formats.find(function (format) {
            return level.id != null && format.itag != null && String(format.itag) === String(level.id) && format.height;
        });
        if (exact) return exact;
        return formats.find(function (format) {
            return format.height && Number(format.height) === Number(level.height) &&
                Number(format.bitrate) === Number(level.bitrate);
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

    function qualityEntries(player) {
        var levels = Array.from(player.qualityLevels ? player.qualityLevels() : []);
        return levels.map(function (level, originalIndex) {
            var format = formatForLevel(player, level);
            return {
                level: level,
                format: format,
                height: number(level.height != null ? level.height : format.height) || 0,
                fps: number(format.fps != null ? format.fps : (level.frameRate || level.fps)) || 0,
                bitrate: number(level.bitrate != null ? level.bitrate : format.bitrate) || 0,
                originalIndex: originalIndex
            };
        });
    }

    function rankedQualityLevels(player) {
        return qualityEntries(player).sort(function (a, b) {
            return b.height - a.height || b.fps - a.fps || b.bitrate - a.bitrate || a.originalIndex - b.originalIndex;
        });
    }

    function qualityOptions(player) {
        var entries = qualityEntries(player);
        var levels = entries.map(function (entry) { return entry.level; });
        if (!levels.length) return [];
        var allEnabled = levels.every(function (level) { return level.enabled; });
        var options = [{
            primary: labels.auto || 'Auto', secondary: '', selected: allEnabled,
            select: function () { levels.forEach(function (level) { level.enabled = true; }); }
        }];
        var groups = new Map();
        entries.forEach(function (entry) {
            var shownFps = entry.fps ? Math.round(entry.fps) : 0;
            var height = entry.height;
            var key = height + '/' + shownFps;
            if (!groups.has(key)) groups.set(key, {height: height, fps: shownFps, entries: []});
            groups.get(key).entries.push(entry);
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

    function audioRepresentationItags(player, track) {
        var itags = [];
        try {
            var tech = player.tech({IWillNotUseThisInPlugins: true});
            var vhs = tech && tech.vhs;
            var master = vhs && vhs.playlists && vhs.playlists.master;
            master = master || (vhs && vhs.masterPlaylistController_ &&
                vhs.masterPlaylistController_.masterPlaylistLoader_ &&
                vhs.masterPlaylistController_.masterPlaylistLoader_.master);
            var groups = master && master.mediaGroups && master.mediaGroups.AUDIO;
            Object.keys(groups || {}).forEach(function (groupId) {
                var group = groups[groupId];
                var properties = group && (group[track.label] || group[track.id]);
                if (!properties) return;
                (properties.playlists || [properties]).forEach(function (playlist) {
                    var name = playlist && playlist.attributes && playlist.attributes.NAME;
                    if (name != null && itags.indexOf(String(name)) < 0) itags.push(String(name));
                });
            });
        } catch (_) {}
        return itags;
    }

    function normalizedAudioName(value) {
        return String(value || '')
            .replace(/\[\s*\d+(?:\.\d+)?k\s*\]/ig, ' ')
            .replace(/(?:stable volume|\bdrc\b)/ig, ' ')
            .replace(/\boriginal audio\b|\boriginal\b/ig, ' ')
            .replace(/[·|]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .toLocaleLowerCase();
    }

    function formatIsStable(format) {
        return format.isDrc === true || /(?:stable volume|\bdrc\b)/i.test(
            ((format.audioTrack && format.audioTrack.displayName) || '') + ' ' + (format.itag || '')
        );
    }

    function audioFormat(player, track) {
        var trackLabel = track.label || '';
        var audioFormats = formats.filter(function (format) { return format.audioTrack && !format.height; });
        var representationItags = audioRepresentationItags(player, track);
        var exact = audioFormats.find(function (format) {
            return format.itag != null && (representationItags.indexOf(String(format.itag)) >= 0 ||
                String(format.itag) === String(track.id));
        });
        if (exact) return exact;

        var stableHint = /(?:stable volume|\bdrc\b)/i.test(trackLabel);
        var candidates = audioFormats.filter(function (format) { return formatIsStable(format) === stableHint; });
        var bitrateMatch = trackLabel.match(/\[(\d+)k\]/);
        if (bitrateMatch) {
            exact = candidates.find(function (format) {
                var bitrate = positiveNumber(format.bitrate);
                return bitrate !== null && (bitrate === Number(bitrateMatch[1]) ||
                    Math.round(bitrate / 1000) === Number(bitrateMatch[1]));
            });
            if (exact) return exact;
        }

        var trackName = normalizedAudioName(trackLabel);
        var named = candidates.filter(function (format) {
            var formatName = normalizedAudioName(format.audioTrack.displayName);
            return trackName && formatName && (trackName === formatName ||
                trackName.indexOf(formatName) >= 0 || formatName.indexOf(trackName) >= 0);
        });
        if (named.length === 1) return named[0];

        var language = String(track.language || '').toLocaleLowerCase();
        var byLanguage = candidates.filter(function (format) {
            var identity = String(format.audioTrack.id || '').toLocaleLowerCase();
            return language && (identity === language || identity.indexOf(language + '.') === 0 ||
                identity.indexOf(language + '-') === 0);
        });
        return byLanguage.length === 1 ? byLanguage[0] : {};
    }

    function audioInfo(player, track, originalIndex) {
        var format = audioFormat(player, track);
        var audioTrack = format.audioTrack || {};
        var name = audioTrack.displayName || track.label || track.language || 'Unknown';
        var stable = formatIsStable(format) || /(?:stable volume|\bdrc\b)/i.test(name + ' ' + (track.label || ''));
        var original = audioTrack.audioIsDefault === true || /\boriginal\b/i.test(name);
        if (!format.audioTrack && track.kind === 'main') original = true;
        return {
            track: track, format: format, name: name, stable: stable, original: original,
            identity: audioTrack.id || track.language || name,
            bitrate: positiveNumber(format.bitrate) || 0, originalIndex: originalIndex
        };
    }

    function stripAudioQualifiers(value, stable) {
        value = String(value || '').replace(/\[\s*\d+(?:\.\d+)?k\s*\]/ig, ' ');
        if (stable) {
            var stableLabel = labels.stable_volume || 'Stable Volume';
            value = value.replace(new RegExp(stableLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'ig'), ' ')
                .replace(/\bstable volume\b|\bdrc\b/ig, ' ');
        }
        return value.replace(/\s*[·|]+\s*/g, ' ').replace(/\s+/g, ' ').trim();
    }

    function includesAudioQualifier(value, qualifier) {
        return String(value || '').toLocaleLowerCase().indexOf(String(qualifier || '').toLocaleLowerCase()) >= 0;
    }

    function audioPrimary(entry, stable, tier) {
        var originalLabel = labels.original_audio || 'Original Audio';
        var stableLabel = labels.stable_volume || 'Stable Volume';
        var base = stripAudioQualifiers(entry.name, stable);
        var parts = [];
        if (base) parts.push(base);
        if (entry.original && !/\boriginal\b/i.test(base) && !includesAudioQualifier(base, originalLabel)) {
            parts.push(originalLabel);
        }
        if (stable && !includesAudioQualifier(base, stableLabel)) parts.push(stableLabel);
        if (tier) parts.push(tier);
        return parts.filter(function (part, index, all) {
            var normalized = String(part).trim().toLocaleLowerCase();
            return normalized && all.findIndex(function (candidate) {
                return String(candidate).trim().toLocaleLowerCase() === normalized;
            }) === index;
        }).join(' · ');
    }

    function audioOption(entry, stable, tier) {
        return {
            primary: audioPrimary(entry, stable, tier),
            secondary: secondary(entry.format, entry.bitrate), selected: entry.track.enabled,
            select: function () { entry.track.enabled = true; }, track: entry.track
        };
    }

    function audioTierOptions(entries, stable) {
        entries.sort(function (a, b) { return b.bitrate - a.bitrate || a.originalIndex - b.originalIndex; });
        if (!entries.length) return [];
        var active = entries.find(function (entry) { return entry.track.enabled; });
        var known = entries.filter(function (entry) { return entry.bitrate > 0; });
        var distinctBitrates = Array.from(new Set(known.map(function (entry) { return entry.bitrate; })));
        if (distinctBitrates.length < 2) {
            return [audioOption(active || known[0] || entries[0], stable, '')];
        }

        var high = known[0];
        var low = known.slice().reverse().find(function (entry) { return entry.bitrate < high.bitrate; });
        var kept = [high, low];
        if (active && kept.indexOf(active) < 0) kept.splice(1, 0, active);
        return kept.map(function (entry) {
            var tier = entry === high ? (labels.high_bitrate || 'High Bitrate') :
                entry === low ? (labels.low_bitrate || 'Low Bitrate') : '';
            return audioOption(entry, stable, tier);
        });
    }

    function audioOptions(player) {
        var entries = Array.from(player.audioTracks ? player.audioTracks() : []).map(function (track, index) {
            return audioInfo(player, track, index);
        });
        if (!entries.length) return [];
        var originals = entries.filter(function (entry) { return entry.original; });
        entries.forEach(function (entry) {
            if (!entry.stable || entry.original) return;
            entry.original = originals.some(function (original) {
                return entry.identity === original.identity ||
                    (entry.track.language && entry.track.language === original.track.language);
            });
        });
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
    function registerButton(name, className, iconClass, controlText, source) {
        var Button = videojs.extend(MenuButton, {
            constructor: function (player, options) {
                MenuButton.call(this, player, options);
                className.split(/\s+/).forEach(function (name) { if (name) this.addClass(name); }, this);
                this.el().querySelector('.vjs-icon-placeholder').classList.add(iconClass);
                var list = source === qualityOptions ? player.qualityLevels() : player.audioTracks();
                this.streamList_ = list;
                this.streamUpdate_ = videojs.bind(this, this.update);
                list.on(['change', 'addqualitylevel', 'removequalitylevel', 'addtrack', 'removetrack'], this.streamUpdate_);
                this.on('dispose', function () { list.off(['change', 'addqualitylevel', 'removequalitylevel', 'addtrack', 'removetrack'], this.streamUpdate_); });
                this.controlText(controlText);
            },
            createItems: function () {
                return source(this.player()).map(function (option) { return new RichStreamMenuItem(this.player(), option); }, this);
            }
        });
        videojs.registerComponent(name, Button);
    }
    registerButton('RichQualityButton', 'vjs-rich-quality', 'vjs-icon-cog', (data.mobile_labels || {}).quality || 'Quality', qualityOptions);
    registerButton('RichAudioButton', 'vjs-rich-audio', 'vjs-icon-audio', (data.mobile_labels || {}).audio || 'Audio', audioOptions);

    window.InvidiousStreamMenus = {
        qualityOptions: qualityOptions,
        rankedQualityLevels: rankedQualityLevels,
        audioOptions: audioOptions,
        selectedText: selectedText,
        formatBytes: formatBytes,
        formatBitrate: formatBitrate
    };
}());
