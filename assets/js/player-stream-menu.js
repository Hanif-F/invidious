'use strict';

// Shared DASH stream descriptions and Video.js controls for desktop and mobile.
(function () {
    if (!window.videojs) return;

    var data = JSON.parse(document.getElementById('player_data').textContent);
    var labels = data.stream_labels || {};
    var formats = data.stats_formats || [];
    var qualityStates = new WeakMap();

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

    function videoRepresentations(player) {
        try {
            var tech = player.tech({IWillNotUseThisInPlugins: true});
            var vhs = tech && tech.vhs;
            return vhs && vhs.representations ? vhs.representations() : [];
        } catch (_) {
            return [];
        }
    }

    function codecName(value) {
        var codecs = String(value || '').split(',').map(function (codec) { return codec.trim(); });
        var video = codecs.find(function (codec) {
            return codec && !/^(?:mp4a|aac|ac-3|ec-3|opus|vorbis|flac)(?:\.|$)/i.test(codec);
        });
        if (!video) return '';
        if (/^(?:av01|av1)(?:\.|$)/i.test(video)) return 'AV1';
        if (/^(?:avc1|avc3|h\.?264)(?:\.|$)/i.test(video)) return 'H.264';
        if (/^(?:vp09|vp9)(?:\.|$)/i.test(video)) return 'VP9';
        if (/^(?:vp08|vp8)(?:\.|$)/i.test(video)) return 'VP8';
        if (/^(?:hev1|hvc1|hevc)(?:\.|$)/i.test(video)) return 'HEVC';
        return video;
    }

    function formatCodec(format) {
        var match = String(format.mimeType || '').match(/\bcodecs\s*=\s*(?:"([^"]*)"|'([^']*)'|([^;\s]+))/i);
        return codecName(match && (match[1] || match[2] || match[3]));
    }

    function representationCodec(representation) {
        if (!representation) return '';
        var codecs = representation.codecs;
        var attributes = representation.playlist && representation.playlist.attributes;
        return codecName(typeof codecs === 'string' ? codecs : codecs && codecs.video) ||
            codecName(attributes && attributes.CODECS);
    }

    function formatForLevel(level, representation) {
        var attributes = representation && representation.playlist && representation.playlist.attributes;
        var itag = attributes && attributes.NAME;
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
        var codec = representationCodec(representation);
        return formats.find(function (format) {
            return format.height && Number(format.height) === Number(level.height) &&
                Number(format.bitrate) === Number(level.bitrate) &&
                (!codec || formatCodec(format) === codec);
        }) || {};
    }

    function bitrateOrder(a, b) {
        return b.bitrate - a.bitrate || a.originalIndex - b.originalIndex;
    }

    function retainedQualityEntries(entries) {
        if (entries.length <= 4) return entries;
        var codecs = new Map();
        entries.forEach(function (entry) {
            if (!codecs.has(entry.codec)) codecs.set(entry.codec, []);
            codecs.get(entry.codec).push(entry);
        });
        var kept = [];
        var otherCodecs = Array.from(codecs.keys()).filter(function (codec) {
            return codec !== 'AV1' && codec !== 'H.264';
        }).sort(function (a, b) {
            if (!a) return b ? 1 : 0;
            if (!b) return -1;
            return a.localeCompare(b);
        });
        ['AV1', 'H.264'].concat(otherCodecs).forEach(function (codec) {
            var variants = codecs.get(codec) || [];
            var known = variants.filter(function (entry) { return entry.bitrate > 0; });
            var high = known[0] || variants[0];
            if (!high || kept.length >= 4) return;
            kept.push(high);
            // Choose the first representation at the lowest known bitrate so
            // equal extremes never duplicate a codec/bitrate choice.
            var low = known.find(function (entry) { return entry.bitrate === known[known.length - 1].bitrate; });
            if (low && low.bitrate !== high.bitrate && kept.length < 4) kept.push(low);
        });
        return kept.sort(bitrateOrder);
    }

    function qualityEntries(player) {
        var levels = Array.from(player.qualityLevels ? player.qualityLevels() : []);
        var representations = new Map(videoRepresentations(player).map(function (representation) {
            return [String(representation.id), representation];
        }));
        return levels.map(function (level, originalIndex) {
            var representation = representations.get(String(level.id));
            var format = formatForLevel(level, representation);
            return {
                level: level,
                format: format,
                codec: representationCodec(representation) || formatCodec(format),
                height: number(level.height != null ? level.height : format.height) || 0,
                fps: number(format.fps != null ? format.fps : (level.frameRate || level.fps)) || 0,
                bitrate: number(level.bitrate != null ? level.bitrate : format.bitrate) || 0,
                originalIndex: originalIndex
            };
        });
    }

    function qualityPrimary(entry) {
        var fps = entry.fps ? Math.round(entry.fps) : 0;
        var base = entry.height ? entry.height + 'p' + (fps || '') : '';
        return [base, entry.codec || labels.unknown_codec || 'Unknown codec'].filter(Boolean).join(' · ');
    }

    function selectedQualityText(player) {
        var entries = qualityEntries(player);
        if (!entries.length) return '';
        if (isAutoQuality(player)) return labels.auto || 'Auto';
        var enabled = entries.filter(function (entry) { return entry.level.enabled; });
        if (enabled.length !== 1) return '';
        return [qualityPrimary(enabled[0]), formatBitrate(enabled[0].bitrate)].filter(Boolean).join(' · ');
    }

    function rankedQualityLevels(player) {
        return qualityEntries(player).sort(qualityOrder);
    }

    function qualityOrder(a, b) {
        return b.height - a.height || b.fps - a.fps || bitrateOrder(a, b);
    }

    function qualityState(player) {
        if (!qualityStates.has(player)) qualityStates.set(player, {codec: '', quality: 'auto', mode: 'auto', selected: []});
        return qualityStates.get(player);
    }

    function preferredCodec(value) {
        return value === 'av1' ? 'AV1' : value === 'h264' ? 'H.264' : '';
    }

    function playable(playlist) {
        return !playlist || !playlist.excludeUntil || playlist.excludeUntil <= Date.now();
    }

    function playlistEntries(vhs) {
        var master = vhs && vhs.playlists && vhs.playlists.master;
        return Array.from(master && master.playlists || []).map(function (playlist, originalIndex) {
            var attributes = playlist.attributes || {};
            var format = formats.find(function (format) { return String(format.itag) === String(attributes.NAME) && format.height; }) || {};
            var resolution = attributes.RESOLUTION || {};
            return {playlist: playlist, id: playlist.id, itag: attributes.NAME,
                codec: codecName(attributes.CODECS) || formatCodec(format),
                height: number(resolution.height || format.height) || 0,
                fps: number(format.fps || attributes['FRAME-RATE']) || 0,
                bitrate: number(attributes.BANDWIDTH || format.bitrate) || 0, originalIndex: originalIndex};
        }).filter(function (entry) { return entry.height && playable(entry.playlist); });
    }

    function availableQualityEntries(player) {
        var vhs;
        try { vhs = player.tech({IWillNotUseThisInPlugins: true}).vhs; } catch (_) {}
        var playlists = new Map(playlistEntries(vhs).map(function (entry) { return [String(entry.id), entry.playlist]; }));
        var master = vhs && vhs.playlists && vhs.playlists.master;
        return qualityEntries(player).filter(function (entry) {
            // The manifest includes excluded renditions; the representation API
            // can omit them after a codec incompatibility is detected.
            return !master || !master.playlists || playlists.has(String(entry.level.id));
        });
    }

    function automaticEntries(entries, codec) {
        var preferred = entries.filter(function (entry) { return codec && entry.codec === codec; });
        return preferred.length ? preferred : entries;
    }

    function presetEntry(entries, quality, codec) {
        var ranked = entries.slice().sort(qualityOrder);
        if (!ranked.length) return null;
        var worst = quality === 'worst';
        var target = worst ? ranked[ranked.length - 1] : ranked[0];
        if (quality !== 'best' && !worst) {
            var height = parseInt(quality);
            var below = ranked.find(function (entry) { return entry.height <= height; });
            target = below || ranked[ranked.length - 1];
            worst = !below;
        }
        var preferred = ranked.filter(function (entry) { return entry.height === target.height && codec && entry.codec === codec; });
        return preferred.length ? preferred[worst ? preferred.length - 1 : 0] : target;
    }

    function describeQuality(entry) {
        return {id: entry.level ? entry.level.id : entry.id, itag: entry.format ? entry.format.itag : entry.itag,
            height: entry.height, fps: entry.fps, bitrate: entry.bitrate, codec: entry.codec};
    }

    function matchesQuality(entry, wanted) {
        var actual = describeQuality(entry);
        if (actual.id != null && wanted.id != null && String(actual.id) === String(wanted.id)) return true;
        if (actual.itag != null && wanted.itag != null) return String(actual.itag) === String(wanted.itag);
        return actual.height === wanted.height && actual.fps === wanted.fps && actual.bitrate === wanted.bitrate && actual.codec === wanted.codec;
    }

    function selectedEntries(entries, state) {
        if (state.mode === 'auto') return automaticEntries(entries, state.codec);
        if (state.mode === 'preset') {
            var target = presetEntry(entries, state.quality, state.codec);
            return target ? [target] : [];
        }
        return entries.filter(function (entry) {
            return state.selected.some(function (wanted) { return matchesQuality(entry, wanted); });
        });
    }

    function isAutoQuality(player) {
        var entries = qualityEntries(player);
        var state = qualityStates.get(player);
        if (!state) return entries.length > 0 && entries.every(function (entry) { return entry.level.enabled; });
        if (state.mode !== 'auto') return false;
        if (state.updating) return true;
        var allowed = automaticEntries(availableQualityEntries(player), state.codec);
        return entries.length > 0 && entries.every(function (entry) {
            return entry.level.enabled === allowed.some(function (candidate) { return candidate.level === entry.level; });
        });
    }

    function updateQualitySelection(player) {
        var state = qualityState(player);
        if (state.updating) return false;
        var entries = qualityEntries(player);
        var chosen = selectedEntries(availableQualityEntries(player), state);
        if (!chosen.length) return false;
        state.updating = true;
        try {
            entries.forEach(function (entry) {
                var enabled = chosen.some(function (candidate) { return candidate.level === entry.level; });
                if (entry.level.enabled !== enabled) entry.level.enabled = enabled;
            });
        } finally { state.updating = false; }
        var levels = player.qualityLevels();
        if (levels.trigger) levels.trigger('change');
        return true;
    }

    function selectAutoQuality(player) {
        var state = qualityState(player);
        state.mode = 'auto'; state.selected = [];
        updateQualitySelection(player);
    }

    function selectManualQuality(player, level) {
        var state = qualityState(player);
        var entry = qualityEntries(player).find(function (entry) { return entry.level === level; });
        if (!entry) return;
        state.mode = 'manual'; state.selected = [describeQuality(entry)];
        updateQualitySelection(player);
    }

    function qualitySelection(player) {
        return {auto: isAutoQuality(player), selected: qualityEntries(player).filter(function (entry) { return entry.level.enabled; }).map(describeQuality)};
    }

    function restoreQualitySelection(player, selection) {
        var state = qualityState(player);
        state.mode = selection.auto ? 'auto' : 'manual'; state.selected = selection.selected;
        return updateQualitySelection(player);
    }

    function applyQualityPreference(player, params) {
        var state = qualityState(player);
        var codec = preferredCodec(params.video_codec);
        var quality = params.quality_dash || 'auto';
        if (state.codec !== codec || state.quality !== quality || !state.configured) {
            state.codec = codec; state.quality = quality;
            state.mode = quality === 'auto' ? 'auto' : 'preset'; state.selected = [];
            state.configured = true;
        }
        return updateQualitySelection(player);
    }

    function attachQualitySelector(player) {
        var state = qualityState(player), vhs;
        try { vhs = player.tech({IWillNotUseThisInPlugins: true}).vhs; } catch (_) {}
        if (!vhs || typeof vhs.selectPlaylist !== 'function' || state.vhs === vhs) return;
        state.vhs = vhs;
        function wrap(selector) {
            return function () {
                var entries = playlistEntries(vhs);
                var chosen = selectedEntries(entries, state);
                if (chosen.length) entries.forEach(function (entry) { entry.playlist.disabled = chosen.indexOf(entry) < 0; });
                if (state.mode !== 'auto' && chosen.length) return chosen[0].playlist;
                return selector.apply(vhs, arguments);
            };
        }
        vhs.selectPlaylist = wrap(vhs.selectPlaylist);
        var controller = vhs.masterPlaylistController_;
        if (controller && typeof controller.selectInitialPlaylist === 'function') {
            controller.selectInitialPlaylist = wrap(controller.selectInitialPlaylist);
        }
    }

    function initializeQualitySelection(player, params) {
        function currentParams() { return typeof params === 'function' ? params() : params; }
        applyQualityPreference(player, currentParams());
        function attach() { attachQualitySelector(player); }
        function update() { applyQualityPreference(player, currentParams()); }
        var levels = player.qualityLevels();
        player.on('loadstart', attach);
        player.on('loadedmetadata', update);
        levels.on(['addqualitylevel', 'removequalitylevel'], update);
        player.on('dispose', function () {
            levels.off(['addqualitylevel', 'removequalitylevel'], update);
            qualityStates.delete(player);
        });
        player.ready(attach);
        attach();
    }

    function qualityOptions(player) {
        var entries = qualityEntries(player);
        var levels = entries.map(function (entry) { return entry.level; });
        if (!levels.length) return [];
        var allEnabled = isAutoQuality(player);
        var enabledCount = levels.filter(function (level) { return level.enabled; }).length;
        var options = [{
            primary: labels.auto || 'Auto', secondary: '', selected: allEnabled,
            select: function () { selectAutoQuality(player); }
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
            group.entries.sort(bitrateOrder);
            retainedQualityEntries(group.entries).forEach(function (entry) {
                options.push({
                    primary: qualityPrimary(entry),
                    secondary: secondary({contentLength: entry.format.contentLength, bitrate: entry.bitrate}),
                    selected: !allEnabled && enabledCount === 1 && entry.level.enabled,
                    select: function () { selectManualQuality(player, entry.level); },
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
        selectedQualityText: selectedQualityText,
        initializeQualitySelection: initializeQualitySelection,
        applyQualityPreference: applyQualityPreference,
        attachQualitySelector: attachQualitySelector,
        isAutoQuality: isAutoQuality,
        selectAutoQuality: selectAutoQuality,
        selectManualQuality: selectManualQuality,
        qualitySelection: qualitySelection,
        restoreQualitySelection: restoreQualitySelection,
        rankedQualityLevels: rankedQualityLevels,
        audioOptions: audioOptions,
        selectedText: selectedText,
        formatBytes: formatBytes,
        formatBitrate: formatBitrate
    };
}());
