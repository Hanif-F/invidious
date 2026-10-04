'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../../assets/js/player-stream-menu.js'), 'utf8');

function menusFor(formats, labels = {}) {
    // Only component registration is stubbed; grouping and selection run from
    // the production script. Browser tests exercise the actual Video.js UI.
    const videojs = {getComponent: () => function () {}, extend: () => function () {}, registerComponent: () => {}};
    const window = {videojs};
    vm.runInNewContext(source, {window, videojs, document: {getElementById: () => ({
        textContent: JSON.stringify({stats_formats: formats, stream_labels: labels})
    })}});
    return window.InvidiousStreamMenus;
}

function stream(itag, codec, bitrate, height = 1080, fps = 30) {
    return {itag, height, fps, bitrate, mimeType: codec ? `video/mp4; codecs="${codec}"` : 'video/mp4'};
}

function playerFor(formats) {
    const levels = formats.map(format => ({id: format.itag, height: format.height, fps: format.fps, bitrate: format.bitrate, enabled: true}));
    return {qualityLevels: () => levels};
}

function manualIds(menus, player) {
    return Array.from(menus.qualityOptions(player).slice(1), option => option.level.id);
}

test('codec quality menus keep every stream in groups of one through four', () => {
    const formats = [stream('a', 'av01.0.08M.08', 1000000), stream('b', 'avc1.640028', 4000000),
        stream('c', 'vp09.00.31.08', 2000000), stream('d', 'av01.0.08M.10', 3000000)];
    for (let count = 1; count <= 4; count++) {
        const available = formats.slice(0, count);
        const menus = menusFor(available);
        assert.deepEqual(manualIds(menus, playerFor(available)), available.slice().sort((a, b) => b.bitrate - a.bitrate).map(format => format.itag));
    }
    const duplicates = Array.from({length: 4}, (_, i) => stream(String(i), 'av01', 1000000));
    assert.deepEqual(manualIds(menusFor(duplicates), playerFor(duplicates)), ['0', '1', '2', '3']);
});

test('codec quality menus retain both codec extremes when all AV1 bitrates are below H.264', () => {
    const formats = [stream('av-middle', 'av01.0.08M.08', 2000000), stream('h-low', 'avc1.640028', 6000000),
        stream('av-low', 'av01.0.08M.08', 1000000), stream('h-high', 'avc3.640028', 8000000),
        stream('av-high', 'av01.0.08M.10', 3000000), stream('h-middle', 'avc1.640028', 7000000)];
    const menus = menusFor(formats);
    const player = playerFor(formats);
    assert.deepEqual(manualIds(menus, player), ['h-high', 'h-low', 'av-high', 'av-low']);
    assert.equal(player.qualityLevels().every(level => level.enabled), true);
    assert.equal(menus.selectedQualityText(player), 'Auto');
    const avLow = menus.qualityOptions(player).find(option => option.level && option.level.id === 'av-low');
    avLow.select();
    assert.deepEqual(player.qualityLevels().filter(level => level.enabled).map(level => level.id), ['av-low']);
    assert.equal(menus.selectedQualityText(player), '1080p30 · AV1 · 1 Mbps');
    menus.qualityOptions(player)[0].select();
    assert.equal(player.qualityLevels().every(level => level.enabled), true);
});

test('codec quality menus fill spare slots alphabetically with other codec extremes, unknown last', () => {
    const formats = [stream('unknown-high', null, 9000000), stream('av', 'av01', 4000000),
        stream('h', 'avc1', 3000000), stream('vp-high', 'vp09', 2500000), stream('vp-middle', 'vp9', 1500000),
        stream('vp-low', 'vp09', 1000000), stream('hevc-high', 'hvc1.1.6.L93', 2000000),
        stream('hevc-low', 'hev1.1.6.L93', 500000)];
    assert.deepEqual(manualIds(menusFor(formats), playerFor(formats)), ['av', 'h', 'hevc-high', 'hevc-low']);
    const withoutHevc = formats.slice(0, 6);
    assert.deepEqual(manualIds(menusFor(withoutHevc), playerFor(withoutHevc)), ['av', 'h', 'vp-high', 'vp-low']);
    const oneSpareSlot = withoutHevc.concat(stream('av-low', 'av01', 750000));
    assert.deepEqual(manualIds(menusFor(oneSpareSlot), playerFor(oneSpareSlot)), ['av', 'h', 'vp-high', 'av-low']);
    const noPreferredCodec = formats.filter(format => format.itag !== 'av' && format.itag !== 'h');
    assert.deepEqual(manualIds(menusFor(noPreferredCodec), playerFor(noPreferredCodec)), ['vp-high', 'hevc-high', 'vp-low', 'hevc-low']);
});

test('codec quality menus deduplicate equal extremes and preserve original order for ties', () => {
    const formats = [stream('low-first', 'av01', 1000000), stream('high-first', 'av01', 3000000),
        stream('high-second', 'av01', 3000000), stream('middle', 'av01', 2000000), stream('low-second', 'av01', 1000000)];
    assert.deepEqual(manualIds(menusFor(formats), playerFor(formats)), ['high-first', 'low-first']);
    const equal = formats.map(format => ({...format, bitrate: 1000000}));
    assert.deepEqual(manualIds(menusFor(equal), playerFor(equal)), ['low-first']);
});

test('codec quality menus exclude missing bitrates from known extremes and retain an unknown family representative', () => {
    const formats = [stream('av-missing', 'av01', null), stream('av-high', 'av01', 8000000),
        stream('av-low', 'av01', 2000000), stream('h-missing-first', 'avc1', undefined), stream('h-zero', 'avc1', 0),
        stream('h-invalid', 'avc1', -1)];
    assert.deepEqual(manualIds(menusFor(formats), playerFor(formats)), ['av-high', 'av-low', 'h-missing-first']);
    const unknown = Array.from({length: 5}, (_, i) => stream(`missing-${i}`, null, null));
    assert.deepEqual(manualIds(menusFor(unknown), playerFor(unknown)), ['missing-0']);
    const known = [stream('missing', null, null), stream('high', null, 8000000), stream('middle', null, 5000000),
        stream('low', null, 1000000), stream('invalid', null, 'unknown')];
    assert.deepEqual(manualIds(menusFor(known), playerFor(known)), ['high', 'low']);
});

test('codec quality menus use representation metadata before MIME metadata and localize missing codecs', () => {
    const formats = [stream('mime-av1', 'av01.0.08M.08', 1000000), stream('mime-h264', 'avc1.640028', 2000000),
        stream('mime-vp9', 'vp09.00.31.08', 3000000), stream('missing', null, 4000000), stream('other', 'custom.1', 5000000)];
    formats[1].mimeType = "video/mp4; codecs='avc3.640028'";
    formats[2].mimeType = 'video/webm; codecs=vp9';
    const player = playerFor(formats);
    // Separate FPS groups keep these metadata examples independent of pruning.
    formats.forEach((format, i) => { format.fps = 30 + i; player.qualityLevels()[i].fps = format.fps; });
    const names = Array.from(menusFor(formats).qualityOptions(player).slice(1), option => option.primary);
    assert.deepEqual(names, ['1080p34 · custom.1', '1080p33 · Unknown codec', '1080p32 · VP9', '1080p31 · H.264', '1080p30 · AV1']);
    const representations = [
        {id:'playlist-a', codecs:{video:'avc1.640028'}, playlist:{attributes:{NAME:'mime-av1', CODECS:'av01'}}},
        {id:'playlist-b', playlist:{attributes:{NAME:'mime-h264', CODECS:'mp4a.40.2, vp09.00.31.08'}}},
        {id:'playlist-c', codecs:{video:null}, playlist:{attributes:{NAME:'mime-vp9', CODECS:'mp4a.40.2'}}}
    ];
    player.qualityLevels().slice(0, 3).forEach((level, i) => { level.id = representations[i].id; });
    player.tech = () => ({vhs:{representations: () => representations}});
    const menus = menusFor(formats);
    assert.deepEqual(Array.from(menus.qualityOptions(player).slice(1), option => option.primary), [
        '1080p34 · custom.1', '1080p33 · Unknown codec', '1080p32 · VP9', '1080p31 · VP9', '1080p30 · H.264'
    ]);
    const locale = JSON.parse(fs.readFileSync(path.join(__dirname, '../../locales/id.json'), 'utf8'));
    assert.equal(menusFor([formats[3]], {unknown_codec: locale.player_stream_unknown_codec}).qualityOptions(playerFor([formats[3]]))[1].primary,
        '1080p33 · Codec tidak diketahui');
    player.tech = () => { throw new Error('No VHS integration'); };
    assert.match(menus.qualityOptions(player).find(option => option.level && option.level.id === 'missing').primary, /Unknown codec$/);
});

test('codec quality menus keep resolution and rounded FPS groups separate', () => {
    const formats = [stream('720-30', 'avc1', 9000000, 720, 30), stream('1080-30', 'av01', 1000000, 1080, 29.97),
        stream('720-60', 'avc1', 3000000, 720, 60), stream('1080-60', 'av01', 2000000, 1080, 59.94)];
    const menus = menusFor(formats);
    const player = playerFor(formats);
    assert.deepEqual(manualIds(menus, player), ['1080-60', '1080-30', '720-60', '720-30']);
    assert.deepEqual(Array.from(menus.qualityOptions(player).slice(1), option => option.primary), [
        '1080p60 · AV1', '1080p30 · AV1', '720p60 · H.264', '720p30 · H.264'
    ]);
});

test('codec quality menus describe a filtered manual selection without adding a fifth choice', () => {
    const formats = [stream('av-high', 'av01', 3000000), stream('av-middle', 'av01', 2000000), stream('av-low', 'av01', 1000000),
        stream('h-high', 'avc1', 8000000), stream('h-low', 'avc1', 6000000)];
    const menus = menusFor(formats);
    const player = playerFor(formats);
    player.qualityLevels().forEach(level => { level.enabled = level.id === 'av-middle'; });
    assert.equal(menus.selectedQualityText(player), '1080p30 · AV1 · 2 Mbps');
    assert.equal(manualIds(menus, player).length, 4);
    assert.equal(menus.qualityOptions(player).some(option => option.selected), false);
    assert.deepEqual(player.qualityLevels().filter(level => level.enabled).map(level => level.id), ['av-middle']);
    assert.deepEqual(Array.from(menus.rankedQualityLevels(player), entry => entry.level.id), ['h-high', 'h-low', 'av-high', 'av-middle', 'av-low']);
    assert.equal(menus.selectedQualityText({qualityLevels: () => []}), '');
});

test('codec preference keeps Auto selected for one or many preferred renditions and allows manual overrides', () => {
    const formats = [stream('av-low', 'av01', 1000000, 720), stream('av-high', 'av01', 3000000), stream('h', 'avc1', 5000000)];
    const menus = menusFor(formats), player = playerFor(formats);
    menus.applyQualityPreference(player, {video_codec:'av1', quality_dash:'auto'});
    assert.deepEqual(player.qualityLevels().map(level => level.enabled), [true,true,false]);
    assert.equal(menus.qualityOptions(player)[0].selected, true);
    assert.equal(menus.selectedQualityText(player), 'Auto');
    menus.selectManualQuality(player, player.qualityLevels()[2]);
    menus.applyQualityPreference(player, {video_codec:'av1', quality_dash:'auto'});
    assert.deepEqual(player.qualityLevels().map(level => level.enabled), [false,false,true]);
    assert.equal(menus.selectedQualityText(player), '1080p30 · H.264 · 5 Mbps');
    menus.qualityOptions(player)[0].select();
    assert.deepEqual(player.qualityLevels().map(level => level.enabled), [true,true,false]);
    menus.applyQualityPreference(player, {video_codec:'h264', quality_dash:'auto'});
    assert.deepEqual(player.qualityLevels().map(level => level.enabled), [false,false,true]);
    assert.equal(menus.qualityOptions(player)[0].selected, true);
    menus.selectManualQuality(player, player.qualityLevels()[2]);
    assert.equal(menus.isAutoQuality(player), false);
});

test('codec preference preserves preset resolution before codec and retains highest/lowest FPS and bitrate ranking', () => {
    const formats = [stream('h-4k', 'avc1', 8000000, 2160, 60), stream('av-1080-high', 'av01', 3000000, 1080, 60),
        stream('av-1080-low', 'av01', 1000000, 1080, 30), stream('h-1080', 'avc1', 6000000, 1080, 60),
        stream('h-720', 'avc1', 2000000, 720, 30), stream('av-480-high', 'av01', 700000, 480, 60),
        stream('av-480-low', 'av01', 400000, 480, 30)];
    const menus = menusFor(formats), player = playerFor(formats);
    for (const [quality, codec, expected] of [['1080p','av1','av-1080-high'], ['720p','av1','h-720'],
        ['best','av1','h-4k'], ['worst','av1','av-480-low'], ['1080p','h264','h-1080'],
        ['1080p','auto','h-1080'], ['144p','av1','av-480-low']]) {
        menus.applyQualityPreference(player, {quality_dash:quality, video_codec:codec});
        assert.deepEqual(player.qualityLevels().filter(level => level.enabled).map(level => level.id), [expected]);
        assert.equal(menus.isAutoQuality(player), false);
    }
});

function attachVhs(player, formats) {
    const playlists = formats.map(format => ({id:format.itag, attributes:{NAME:format.itag, CODECS:format.mimeType.match(/"([^"]+)"/)?.[1],
        RESOLUTION:{height:format.height}, BANDWIDTH:format.bitrate}}));
    const calls = [];
    const vhs = {playlists:{master:{playlists}}, representations: () => playlists.filter(playlist => playlist.excludeUntil !== Infinity)
        .map(playlist => ({id:playlist.id, playlist})), selectPlaylist() {
        const eligible = this.playlists.master.playlists.filter(playlist => !playlist.disabled && (!playlist.excludeUntil || playlist.excludeUntil <= Date.now()));
        calls.push(eligible.map(playlist => playlist.id));
        // Stand in for the bandwidth selector choosing the lower rendition.
        return eligible[eligible.length - 1];
    }};
    player.tech = () => ({vhs});
    return {vhs, playlists, calls};
}

test('codec preference filters the first VHS selector call and delegates adaptive bandwidth selection', () => {
    const formats = [stream('h-high', 'avc1', 6000000), stream('av-high', 'av01', 3000000), stream('av-low', 'av01', 1000000, 720)];
    const menus = menusFor(formats), player = {qualityLevels: () => []};
    const {vhs, calls} = attachVhs(player, formats);
    menus.applyQualityPreference(player, {quality_dash:'auto', video_codec:'av1'});
    menus.attachQualitySelector(player);
    assert.equal(vhs.selectPlaylist().id, 'av-low');
    assert.deepEqual(calls, [['av-high','av-low']]);
    const wrapped = vhs.selectPlaylist;
    menus.attachQualitySelector(player);
    assert.equal(vhs.selectPlaylist, wrapped);
    menus.applyQualityPreference(player, {quality_dash:'best', video_codec:'av1'});
    assert.equal(vhs.selectPlaylist().id, 'av-high');
    assert.equal(calls.length, 1);
    const replacement = attachVhs(player, formats);
    menus.attachQualitySelector(player);
    assert.equal(replacement.vhs.selectPlaylist().id, 'av-high');
});

test('codec preference falls back when missing, unsupported or temporarily excluded', () => {
    const formats = [stream('h', 'avc1', 6000000), stream('av', 'av01', 3000000)];
    const menus = menusFor(formats), player = playerFor(formats);
    const {vhs, playlists} = attachVhs(player, formats);
    menus.applyQualityPreference(player, {quality_dash:'auto', video_codec:'av1'});
    menus.attachQualitySelector(player);
    playlists[1].excludeUntil = Infinity;
    menus.applyQualityPreference(player, {quality_dash:'auto', video_codec:'av1'});
    assert.equal(vhs.selectPlaylist().id, 'h');
    assert.deepEqual(player.qualityLevels().map(level => level.enabled), [true,false]);
    assert.equal(menus.isAutoQuality(player), true);
    playlists[1].excludeUntil = Date.now() + 60000;
    assert.equal(vhs.selectPlaylist().id, 'h');
    playlists[1].excludeUntil = 0;
    menus.applyQualityPreference(player, {quality_dash:'auto', video_codec:'av1'});
    assert.equal(vhs.selectPlaylist().id, 'av');
    const onlyH264 = playerFor([formats[0]]);
    menus.applyQualityPreference(onlyH264, {quality_dash:'auto', video_codec:'av1'});
    assert.equal(menus.isAutoQuality(onlyH264), true);
    assert.equal(onlyH264.qualityLevels()[0].enabled, true);
});

test('codec preference restores Auto or an exact manual codec when levels are recreated', () => {
    const formats = [stream('av', 'av01', 2000000), stream('h', 'avc1', 2000000)];
    const menus = menusFor(formats), player = playerFor(formats);
    menus.applyQualityPreference(player, {quality_dash:'auto', video_codec:'av1'});
    const auto = menus.qualitySelection(player);
    menus.selectManualQuality(player, player.qualityLevels()[1]);
    const manual = menus.qualitySelection(player);
    player.qualityLevels().splice(0, 2, ...formats.map(format => ({id:`new-${format.itag}`, height:format.height, fps:format.fps, bitrate:format.bitrate, enabled:true})));
    const {vhs} = attachVhs(player, formats);
    vhs.representations = () => formats.map(format => ({id:`new-${format.itag}`, playlist:{attributes:{NAME:format.itag}}}));
    delete vhs.playlists;
    assert.equal(menus.restoreQualitySelection(player, manual), true);
    assert.deepEqual(player.qualityLevels().map(level => level.enabled), [false,true]);
    assert.equal(menus.selectedQualityText(player), '1080p30 · H.264 · 2 Mbps');
    assert.equal(menus.restoreQualitySelection(player, auto), true);
    assert.deepEqual(player.qualityLevels().map(level => level.enabled), [true,false]);
    assert.equal(menus.selectedQualityText(player), 'Auto');
});

test('codec preference applies to newly discovered levels without losing Auto or a manual override', () => {
    const formats = [stream('h', 'avc1', 6000000), stream('av', 'av01', 3000000), stream('av-low', 'av01', 1000000, 720)];
    const menus = menusFor(formats), player = playerFor(formats);
    const discovered = player.qualityLevels().splice(0);
    let update;
    player.qualityLevels().on = (_events, handler) => { update = handler; };
    player.qualityLevels().off = () => {};
    player.on = () => {};
    player.ready = handler => handler();
    const {vhs} = attachVhs(player, formats);
    vhs.masterPlaylistController_ = {selectInitialPlaylist:vhs.selectPlaylist};
    menus.initializeQualitySelection(player, {quality_dash:'auto', video_codec:'av1'});
    assert.equal(vhs.masterPlaylistController_.selectInitialPlaylist().id, 'av-low');
    player.qualityLevels().push(discovered[0]); update();
    assert.equal(menus.isAutoQuality(player), true);
    player.qualityLevels().push(discovered[1]); update();
    assert.deepEqual(player.qualityLevels().map(level => level.enabled), [false,true]);
    assert.equal(menus.isAutoQuality(player), true);
    menus.selectManualQuality(player, discovered[0]);
    player.qualityLevels().push(discovered[2]); update();
    assert.deepEqual(player.qualityLevels().map(level => level.enabled), [true,false,false]);
    menus.selectAutoQuality(player);
    assert.deepEqual(player.qualityLevels().map(level => level.enabled), [false,true,true]);
    assert.equal(menus.selectedQualityText(player), 'Auto');
});
