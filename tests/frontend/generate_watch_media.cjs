'use strict';
// Deterministic local media for D5. Real decoding, no upstream requests.
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const directory=path.join(__dirname,'.generated','watch-media');fs.mkdirSync(directory,{recursive:true});
function ffmpeg(args){execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-y',...args],{stdio:'inherit'});}
for(const [name,size,color] of [['small.webm','320x180','0x303a53'],['large.webm','640x360','0x304a43'],['portrait.webm','320x568','0x303a53']])ffmpeg(['-f','lavfi','-i',`color=c=${color}:s=${size}:r=12`,'-t','4','-an','-c:v','libvpx',path.join(directory,name)]);
// D6 needs real media long enough for 5–120-second clip bounds and completion guards.
ffmpeg(['-f','lavfi','-i','color=c=0x304a43:s=640x360:r=12','-t','130','-an','-c:v','libvpx',path.join(directory,'clip.webm')]);
ffmpeg(['-f','lavfi','-i','sine=frequency=330:sample_rate=48000','-t','4','-c:a','aac',path.join(directory,'audio.m4a')]);
ffmpeg(['-f','lavfi','-i','color=c=0x303a53:s=640x360:r=12','-f','lavfi','-i','sine=frequency=330:sample_rate=48000','-t','4',
    '-map','0:v','-map','0:v','-map','1:a','-map','1:a','-map','1:a',
    '-c:v','libx264','-s:v:0','320x180','-b:v:0','180k','-s:v:1','640x360','-b:v:1','350k','-g','12','-keyint_min','12','-sc_threshold','0',
    '-c:a','aac','-b:a','64k','-metadata:s:a:0','language=eng','-metadata:s:a:1','language=ind','-metadata:s:a:2','language=eng',
    '-f','dash','-seg_duration','1','-use_template','1','-use_timeline','1','-adaptation_sets','id=0,streams=v id=1,streams=2 id=2,streams=4 id=3,streams=3',path.join(directory,'manifest.mpd')]);
let manifest=fs.readFileSync(path.join(directory,'manifest.mpd'),'utf8').replace(/(initialization|media)="/g,'$1="/d5-media/').replaceAll('lang="eng"','lang="en"').replaceAll('lang="ind"','lang="id"');
const names=['English original','English Stable Volume','Indonesian'];let audio=0;
manifest=manifest.replace(/(<AdaptationSet[^>]*contentType="audio"[^>]*>)/g,tag=>tag+`\n<Label>${names[audio++]}</Label>`);
fs.writeFileSync(path.join(directory,'manifest.mpd'),manifest);
// S15 exercises real HLS decoding and opaque segment-query preservation too.
const hls=path.join(directory,'hls');fs.mkdirSync(hls,{recursive:true});
ffmpeg(['-f','lavfi','-i','color=c=0x303a53:s=320x180:r=12','-f','lavfi','-i','sine=frequency=330:sample_rate=48000','-t','4',
    '-c:v','libx264','-g','12','-keyint_min','12','-sc_threshold','0','-c:a','aac','-b:a','64k',
    '-f','hls','-hls_time','1','-hls_playlist_type','vod','-hls_segment_filename',path.join(hls,'segment%02d.ts'),path.join(hls,'manifest.m3u8')]);
const hlsSource=fs.readFileSync(path.join(hls,'manifest.m3u8'),'utf8').replace(/^(segment\d+\.ts)$/gm,'/d7-hls/$1?opaque=segment%2Btoken%3D&keep=1');
fs.writeFileSync(path.join(hls,'manifest.m3u8'),hlsSource);
console.log('Generated progressive/clip media, AAC audio, two-quality/three-audio DASH and opaque-query HLS fixtures.');
