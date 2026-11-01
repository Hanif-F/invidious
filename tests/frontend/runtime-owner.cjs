'use strict';
const fs=require('node:fs'),path=require('node:path');
let savedPath,savedTime,owners;
// These are production EnhancementState snapshots captured while rendering the
// exact owner preferences and block context. A missing fixture is unavailable.
function runtimeOwner(html,generated) {
    const filename=path.join(generated,'runtime-owner-states.json');
    if(!fs.existsSync(filename))return null;
    const time=fs.statSync(filename).mtimeMs;
    if(savedPath!==filename||savedTime!==time){owners=JSON.parse(fs.readFileSync(filename,'utf8'));savedPath=filename;savedTime=time;}
    function config(id){const match=html.match(new RegExp('<script id="'+id+'"[^>]*>([\\s\\S]*?)</script>'));return match&&JSON.parse(match[1]);}
    const ui=config('ui-config'),profile=config('browser-profile');
    if(!ui||!profile||!ui.ownerBrowseFingerprint)return null;
    return owners[JSON.stringify([ui.fingerprint,ui.ownerBrowseFingerprint,profile.scope])]||null;
}
module.exports={runtimeOwner};
