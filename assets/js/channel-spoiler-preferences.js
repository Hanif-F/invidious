'use strict';
(function () {
    var root=document.getElementById('channel-spoilers'), node=document.getElementById('masking-editor-config');
    if(!root || !node || root.dataset.editorReady)return;
    var config=JSON.parse(node.textContent), storage=window.InvidiousStorage, ui=window.InvidiousUI, key='channel_spoiler_settings', path='/preferences/spoilers/channels';
    if(!storage || !ui)return;root.dataset.editorReady='true';
    var life=new AbortController(), form=root.querySelector('.spoiler-channel-form'), list=root.querySelector('#spoiler-saved-channels'), status=root.querySelector('#spoiler-save-status'), search=root.querySelector('#spoiler-search');
    var readback=root.querySelector('[data-mask-readback]'), fields=form?Array.from(form.querySelectorAll('input:not([type=hidden])')):[], id=form?form.elements.channel.value:null;
    var saved={}, original='', busy=false, uncertain=config.uncertain===true, failed=config.failed===true, active=true, disposed=false, epoch=0, request=null, outcome=null, warned=false, currentMessage=!!status.textContent.trim();
    function on(target,event,handler){if(target)target.addEventListener(event,handler,{signal:life.signal});}
    function stable(value){if(value && typeof value==='object')return Array.isArray(value)?'['+value.map(stable).join(',')+']':'{'+Object.keys(value).sort().map(function(k){return JSON.stringify(k)+':'+stable(value[k]);}).join(',')+'}';return JSON.stringify(value);}
    function object(value){return !!value && typeof value==='object'&&!Array.isArray(value);}
    function alive(){return active&&!disposed&&root.isConnected&&storage.isCurrent()&&storage.scope===config.profile;}
    function values(entry){return {hide_title:entry&&entry.hide_title?'on':'off',hide_thumbnail:entry&&entry.hide_thumbnail?'on':'off',reveal_after_days:entry&&entry.reveal_after_days!==null?String(entry.reveal_after_days):''};}
    function draft(){var result={};fields.forEach(function(f){result[f.name]=f.type==='checkbox'?(f.checked?'on':'off'):f.value.trim();});return result;}
    function canonicalDraft(data){if(data.hide_title==='off'&&data.hide_thumbnail==='off')return values(null);return Object.assign({},data,{reveal_after_days:data.reveal_after_days?String(Number(data.reveal_after_days)):''});}
    function dirty(){return !!form&&(failed||stable(draft())!==original);}
    function warn(event){event.preventDefault();event.returnValue='';}
    function message(text,error){status.textContent=text||'';status.setAttribute('role',error?'alert':'status');currentMessage=!!text;}
    function update(){
        var changed=dirty(), blocked=busy||uncertain||disposed||config.stale;
        root.querySelectorAll('input,select,button,fieldset').forEach(function(control){control.disabled=disposed||config.stale||busy;});
        if(form){form.querySelector('[value=save]').disabled=blocked||!changed;form.querySelector('[value=reset]').disabled=blocked;form.querySelector('[type=reset]').hidden=!changed&&!uncertain;}
        root.querySelectorAll('[data-mask-reset] button').forEach(function(button){button.disabled=blocked;});
        readback.disabled=disposed||config.stale||busy;
        root.setAttribute('aria-busy',String(busy));
        if(disposed)message(config.words.profile,true);
        else if(busy)message(config.words.saving);
        else if(uncertain&&(!currentMessage||status.textContent===config.words.saving))message(config.words.unconfirmed,true);
        else if(changed&&!currentMessage)message(config.words.unsaved);
        var shouldWarn=(changed||uncertain||busy)&&!disposed;
        if(shouldWarn&&!warned){window.addEventListener('beforeunload',warn);warned=true;}
        if(!shouldWarn&&warned){window.removeEventListener('beforeunload',warn);warned=false;}
    }
    function apply(entry){if(!form)return;var data=values(entry);fields.forEach(function(f){if(f.type==='checkbox')f.checked=data[f.name]==='on';else f.value=data[f.name];f.removeAttribute('aria-invalid');f.setCustomValidity('');});}
    function render(){
        var query=search.value.trim().toLocaleLowerCase(), ids=Object.keys(saved).sort(function(a,b){return saved[a].name.localeCompare(saved[b].name);});
        var fragment=document.createDocumentFragment(), matches=0;
        ids.forEach(function(channelId){var entry=saved[channelId];if(query&&!(entry.name+' '+channelId).toLocaleLowerCase().includes(query))return;matches++;
            var row=document.getElementById('masking-row').content.firstElementChild.cloneNode(true), channel=row.querySelector('[data-mask-channel]'), edit=row.querySelector('[data-mask-edit]'), reset=row.querySelector('form');
            row.dataset.channel=channelId;channel.href='/channel/'+channelId;channel.textContent=entry.name;edit.href=path+'?channel='+encodeURIComponent(channelId);reset.elements.channel.value=channelId;reset.elements.browser_profile.value=config.profile;fragment.append(row);
        });
        if(!matches){var empty=document.createElement('p');empty.setAttribute('role','status');empty.textContent=query?config.words.no_matches:config.words.empty;fragment.append(empty);}
        list.replaceChildren(fragment);update();
    }
    function readServer(data){
        if(object(data)&&typeof data.profile==='string'&&data.profile!==config.profile){dispose();throw new Error(config.words.profile);}
        if(!object(data)||data.profile!==config.profile||!object(data.rules)||typeof data.csrf!=='string'||!data.csrf)throw new Error(config.words.load);
        Object.keys(data.rules).forEach(function(channelId){var entry=data.rules[channelId];if(!/^UC[A-Za-z0-9_-]{22}$/.test(channelId)||!object(entry)||typeof entry.name!=='string'||typeof entry.hide_title!=='boolean'||typeof entry.hide_thumbnail!=='boolean'||!(entry.hide_title||entry.hide_thumbnail)||!(entry.reveal_after_days===null||Number.isInteger(entry.reveal_after_days)&&entry.reveal_after_days>=1&&entry.reveal_after_days<=2147483647))throw new Error(config.words.load);});
        return data;
    }
    function accept(data, submitted){
        var before=form?stable(draft()):'', wasDirty=dirty(), changed=stable(saved)!==stable(data);saved=data;
        if(form){original=stable(values(saved[id]));if(submitted&&submitted.id===id&&before===submitted.draft){apply(saved[id]);failed=false;}else if(!wasDirty&&(!submitted||submitted.id!==id))apply(saved[id]);}
        render();if(changed)ui.invalidate();
    }
    async function write(channelId,action){
        if(!alive()||busy||uncertain||config.stale)return;
        var payload=action==='save'?draft():{}, submitted={id:channelId,action:action,values:action==='reset'?values(null):canonicalDraft(payload),draft:form?stable(draft()):''};
        if(action==='save'){
            var dayField=form.elements.reveal_after_days, raw=payload.reveal_after_days, valid=!raw||/^\d+$/.test(raw)&&Number(raw)>=1&&Number(raw)<=2147483647;
            dayField.setCustomValidity(valid?'':config.words.invalid);dayField.setAttribute('aria-invalid',String(!valid));
            if(!valid||!form.reportValidity()){message(config.words.invalid,true);dayField.focus();return;}
        }
        var token=++epoch, controller=new AbortController(), dispatched=false;request=controller;busy=true;update();
        try{
            var canonical;
            if(config.account){
                var beforeResponse=await ui.request(path+'?format=json',{signal:controller.signal});if(!alive()||token!==epoch)return;var before=readServer(beforeResponse);
                if(action==='save'&&(payload.hide_title==='on'||payload.hide_thumbnail==='on')&&!before.rules[channelId]&&Object.keys(before.rules).length>=1000){var quota=new Error(config.words.limit);quota.userMessage=config.words.limit;throw quota;}
                var body=new URLSearchParams(Object.assign({channel:channelId,action:action,browser_profile:config.profile,csrf_token:before.csrf},payload));
                dispatched=true;uncertain=true;outcome=submitted;ui.invalidate();
                var written=await ui.request(path+'?format=json',{method:'POST',body:body,signal:controller.signal});if(!alive()||token!==epoch)return;canonical=readServer(written).rules;
            }else{
                var latest=storage.local.readStored(key)||{}, merged=Object.assign({},latest);
                if(action==='reset'||payload.hide_title==='off'&&payload.hide_thumbnail==='off')delete merged[channelId];else merged[channelId]={name:latest[channelId]?latest[channelId].name:form.dataset.name,hide_title:payload.hide_title==='on',hide_thumbnail:payload.hide_thumbnail==='on',reveal_after_days:payload.reveal_after_days?Number(payload.reveal_after_days):null};
                if(Object.keys(merged).length>1000){var limit=new Error(config.words.limit);limit.userMessage=config.words.limit;throw limit;}
                merged=storage.normalize(key,merged);
                if(!storage.local.set(key,merged)||stable(storage.local.readStored(key))!==stable(merged))throw new Error(config.words.local);
                canonical=merged;
                // Only confirmed saved rules inform the optional server date-cache marker.
                try{document.cookie='iv_spoilers_guest='+(Object.keys(merged).length?'1; Max-Age=63072000':'; Max-Age=0')+'; Path=/; SameSite=Lax'+(location.protocol==='https:'?'; Secure':'');}catch(_){}
            }
            if(!alive()||token!==epoch)return;
            uncertain=false;outcome=null;accept(canonical,submitted);message(dirty()?config.words.unsaved:config.words.saved);
        }catch(error){
            if(!alive()||token!==epoch||controller.signal.aborted)return;
            if(!dispatched||[400,401,403,404,405,409,413,415,422,429].includes(error.status)){uncertain=false;outcome=null;}
            message(uncertain?config.words.unconfirmed:error.userMessage||(config.account?config.words.error:config.words.local),true);status.focus({preventScroll:true});
        }finally{if(alive()&&token===epoch){request=null;busy=false;update();}}
    }
    async function check(){
        if(!alive()||busy||config.stale)return;var token=++epoch,controller=new AbortController();request=controller;busy=true;update();
        try{
            var response=config.account?await ui.request(path+'?format=json',{signal:controller.signal}):null;if(!alive()||token!==epoch)return;
            var data=config.account?readServer(response).rules:storage.local.readStored(key);if(!data&&!config.account&&!Object.keys(saved).length)data={};if(!data)throw new Error(config.words.load);
            var pending=outcome, match=pending&&(pending.action==='reset'?!data[pending.id]:stable(values(data[pending.id]))===stable(pending.values));
            uncertain=false;outcome=null;accept(data,match?pending:null);if(form&&stable(draft())===original)failed=false;message(match&&!dirty()?config.words.saved:dirty()?config.words.changed:config.words.saved);
        }catch(error){if(alive()&&token===epoch&&!controller.signal.aborted)message(config.words.load,true);}
        finally{if(alive()&&token===epoch){request=null;busy=false;update();}}
    }
    function dispose(){if(disposed)return;epoch++;if(request)request.abort();disposed=true;active=false;busy=false;life.abort();window.removeEventListener('beforeunload',warn);message(config.words.profile,true);update();}
    root.querySelectorAll('.js-only').forEach(function(el){el.hidden=false;});root.querySelector('#spoiler-controls').hidden=false;
    if(config.stale||storage.scope!==config.profile||(form&&form.elements.browser_profile.value!==config.profile)||!storage.isCurrent()){dispose();return;}
    saved=config.account?storage.normalize(key,config.rules):storage.local.readStored(key)||storage.local.get(key)||{};
    var browserNotice=root.querySelector('[data-mask-browser-required]');if(browserNotice)browserNotice.hidden=true;
    if(form){if(!config.account)apply(saved[id]);original=stable(values(saved[id]));}
    on(root,'submit',function(event){var target=event.target;if(target===form){event.preventDefault();write(id,event.submitter&&event.submitter.value==='reset'?'reset':'save');}else if(target.matches('[data-mask-reset]')){event.preventDefault();write(target.elements.channel.value,'reset');}});
    on(form,'input',function(){failed=false;fields.forEach(function(f){f.setCustomValidity('');f.removeAttribute('aria-invalid');});currentMessage=false;message('');update();});on(form,'change',function(){failed=false;currentMessage=false;message('');update();});
    on(form,'reset',function(event){event.preventDefault();if(!alive()||busy)return;apply(saved[id]);failed=false;currentMessage=false;message('');update();});
    on(search,'input',render);on(readback,'click',check);
    on(window,'pagehide',function(event){epoch++;if(request)request.abort();request=null;busy=false;active=false;if(!event.persisted)dispose();});
    on(window,'pageshow',function(){active=!disposed;if(alive())update();else if(!disposed)dispose();});
    on(window,'browserprofilechange',dispose);on(document,'iv:content-added',function(){if(!root.isConnected)dispose();});
    render();var focus=new URL(location.href).searchParams.get('field'),target=focus==='channel'?document.getElementById('channel'):form&&form.elements[focus];if(target&&target.focus)target.focus({preventScroll:true});
})();
