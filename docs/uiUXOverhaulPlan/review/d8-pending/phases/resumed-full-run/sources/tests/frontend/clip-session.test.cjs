'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
function fixture(options={}) {
    const window=new EventTarget(),document=new EventTarget(),events=new Map(),notices=[];
    document.body={dataset:{}};let time=options.time??40,paused=options.paused??false,loop=options.loop??true,duration=options.duration??130,current=true,disposed=false,error;
    window.InvidiousStorage={isCurrent:()=>current};
    const player={
        currentTime(value){if(value!==undefined)time=value;return time;},paused:()=>paused,pause(){paused=true;},play(){paused=false;return Promise.resolve();},
        loop(value){if(value!==undefined)loop=value;return loop;},duration:()=>duration,readyState:()=>1,ready(fn){fn();},isDisposed:()=>disposed,error(value){error=value;},
        on(name,fn){if(!events.has(name))events.set(name,new Set());events.get(name).add(fn);},off(name,fn){events.get(name)?.delete(fn);}
    };
    const originalTime=player.currentTime,context={window,document,AbortController,CustomEvent};vm.createContext(context);
    for(const name of ['clip-player.js','clip-session.js'])vm.runInContext(fs.readFileSync(path.resolve(__dirname,'../../assets/js',name),'utf8'),context);
    function emit(name){for(const fn of Array.from(events.get(name)||[]))fn();}
    const base=options.native?window.InvidiousClipPlayer(player,{startTime:10.25,endTime:15.25}):null;if(base)player.currentTime(12.5);
    const session=window.InvidiousClipSession(player,state=>notices.push({...state}));
    return{window,document,player,session,base,events,notices,originalTime,emit,error:()=>error,
        profile(){current=false;window.dispatchEvent(new Event('browserprofilechange'));},
        pagehide(persisted){const event=new Event('pagehide');Object.defineProperty(event,'persisted',{value:persisted});window.dispatchEvent(event);},
        disposePlayer(){emit('dispose');disposed=true;},setDuration(value){duration=value;}};
}
test('preview and stop preserve the original player state and release temporary bounds',()=>{
    const s=fixture();assert.equal(s.session.begin(),true);assert.equal(s.document.body.dataset.clipEditing,'true');assert.equal(s.player.paused(),true);
    assert.equal(s.session.preview({startTime:10,endTime:15},false),true);assert.equal(s.player.currentTime(),10);assert.equal(s.player.paused(),false);assert.equal(s.player.loop(),false);
    s.player.currentTime(100);assert.ok(s.player.currentTime()<15);s.session.stop();assert.equal(s.player.currentTime(),40);assert.equal(s.player.paused(),true);
    assert.equal(s.player.loop(),true);assert.equal(s.player.currentTime,s.originalTime);s.session.finish();assert.equal(s.player.currentTime(),40);assert.equal(s.player.paused(),false);assert.equal(s.document.body.dataset.clipEditing,undefined);s.session.dispose();
});
test('closing a looped preview restores an originally paused source',()=>{
    const s=fixture({paused:true,loop:false});s.session.begin();s.session.preview({startTime:105,endTime:115},true);assert.equal(s.player.loop(),true);
    s.session.finish();assert.equal(s.player.currentTime(),40);assert.equal(s.player.paused(),true);assert.equal(s.player.loop(),false);s.session.dispose();
});
test('editing a native clip suspends and restores its fractional immutable bounds',()=>{
    const s=fixture({native:true,paused:true});s.session.begin();assert.equal(s.base.isActive(),false);s.session.preview({startTime:30,endTime:35},false);assert.equal(s.player.currentTime(),30);
    s.session.finish();assert.equal(s.player.currentTime(),12.5);assert.equal(s.base.isActive(),true);s.player.currentTime(0);assert.equal(s.player.currentTime(),10.25);s.session.dispose();s.base.dispose();
});
test('invalid or unavailable preview selections leave the source recoverable',()=>{
    const s=fixture({time:2,duration:12,paused:true});s.session.begin();for(const range of [{startTime:0,endTime:4},{startTime:0,endTime:121},{startTime:-1,endTime:5}])assert.equal(s.session.preview(range,false),false);
    assert.equal(s.session.preview({startTime:10,endTime:15},false),false);assert.equal(s.player.currentTime(),2);assert.equal(s.error(),undefined);assert.ok(s.notices.some(x=>x.event==='unavailable'));assert.equal(s.session.isPreviewing(),false);s.session.finish();s.session.dispose();
});
test('source refresh failures stop a running preview without a persistent player error',()=>{
    const s=fixture({paused:true,time:2});s.session.begin();s.session.preview({startTime:10,endTime:15},false);s.setDuration(12);s.emit('loadedmetadata');assert.equal(s.session.isPreviewing(),false);assert.equal(s.player.currentTime(),2);assert.equal(s.error(),undefined);s.session.finish();s.session.dispose();
});
test('profile disposal never restores the earlier personal playhead or resumes playback',()=>{
    const s=fixture();s.session.begin();s.session.preview({startTime:105,endTime:115},false);s.profile();assert.equal(s.player.currentTime(),105);assert.equal(s.player.paused(),true);assert.equal(s.player.currentTime,s.originalTime);assert.equal(s.document.body.dataset.clipEditing,undefined);assert.equal(s.player.invidiousClipSession,undefined);assert.equal(s.session.begin(),false);
});
test('cached-page suspension restores the source once and blocks work until pageshow',()=>{
    const s=fixture();s.session.begin();s.session.preview({startTime:10,endTime:15},false);s.pagehide(true);assert.equal(s.player.currentTime(),40);assert.equal(s.player.paused(),true);assert.equal(s.session.begin(),false);
    s.window.dispatchEvent(new Event('pageshow'));assert.equal(s.session.begin(),true);s.session.finish();s.pagehide(false);assert.equal(s.session.begin(),false);
});
test('repeated previews and disposal release handlers and the singleton session',()=>{
    const s=fixture({paused:true});assert.equal(s.window.InvidiousClipSession(s.player),undefined);
    for(let i=0;i<10;i++){s.session.begin();s.session.preview({startTime:10,endTime:15},false);s.session.finish();assert.equal(s.events.get('timeupdate').size,0);assert.equal(s.events.get('dispose').size,1);}
    s.session.begin();s.session.preview({startTime:10,endTime:15},false);s.disposePlayer();assert.equal(s.events.get('dispose').size,0);assert.equal(s.player.currentTime,s.originalTime);assert.equal(s.document.body.dataset.clipEditing,undefined);assert.equal(s.player.invidiousClipSession,undefined);
});
