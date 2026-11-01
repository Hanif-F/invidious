'use strict';
(function () {
    // Elapsed timestamps have no time-of-day or 24-hour restriction.
    function parse(value) {
        var match = /^(?:(\d+):)?(\d{1,2}):([0-5]\d)$/.exec(value.trim());
        if (!match || Number(match[2]) >= 60) return null;
        var seconds = Number(match[1] || 0) * 3600 + Number(match[2]) * 60 + Number(match[3]);
        return Number.isSafeInteger(seconds) ? seconds : null;
    }
    function format(seconds, hours) {
        seconds = Math.max(0, Math.floor(seconds));
        function pad(number) { return String(number).padStart(2, '0'); }
        var tail = pad(Math.floor(seconds / 60) % 60) + ':' + pad(seconds % 60);
        return hours || seconds >= 3600 ? pad(Math.floor(seconds / 3600)) + ':' + tail : tail;
    }
    function defaultRange(position, duration) {
        position = Number.isFinite(position) ? Math.floor(position) : 0;
        var length = Math.min(30, duration), start = Math.max(0, Math.min(position - 15, duration - length));
        return [start, start + length];
    }
    window.InvidiousClipTime = {parse: parse, format: format, defaultRange: defaultRange};
    var form = document.getElementById('clip-editor');
    if (!form || form.dataset.clipEditor) return;
    var inline = form.dataset.inline === 'true', loader = window.InvidiousClipLoader;
    if (inline && (!loader || !loader.isCurrent() || !window.InvidiousClipSession || !window.InvidiousWatchClipPanel)) return;
    form.dataset.clipEditor = 'true';
    var labels = JSON.parse(document.getElementById('clip-editor-labels').textContent), storage = window.InvidiousStorage, ui = window.InvidiousUI, life = new AbortController();
    var title = document.getElementById('clip-title'), start = document.getElementById('clip-start'), end = document.getElementById('clip-end'), ranges = [document.getElementById('clip-start-range'),document.getElementById('clip-end-range')];
    var previewButton = document.getElementById('clip-preview'), publish = document.getElementById('clip-publish'), publishLabel = publish.textContent, duration = Number(form.dataset.duration), sourceAvailable = form.dataset.sourceAvailable === 'true' && duration >= 5, status = document.getElementById('clip-submit-status');
    var frame = document.getElementById('clip-preview-frame'), placeholder = document.getElementById('clip-preview-placeholder'), result = document.getElementById('clip-result'), boundary = document.getElementById('clip-boundary');
    var lastRange = defaultRange(0,duration), initialized = !inline, opened = false, titleTouched = false, edited = form.dataset.preserveDraft === 'true', busy = false, uncertain = form.dataset.unconfirmed === 'true', published = false, resultSeen = false, activePage = true, disposed = false, warned = false, epoch = 0, operation = null, previewKey = '', framePreview = false;
    var session = inline ? window.InvidiousClipSession(player,sessionChanged) : null;
    if (inline && !session) { delete form.dataset.clipEditor; return; }
    function on(target,name,handler) { if (target) target.addEventListener(name,handler,{signal:life.signal}); }
    function alive() { return activePage && !disposed && form.isConnected && storage.isCurrent(); }
    function previewing() { return inline ? session.isPreviewing() : framePreview; }
    function warn(event) { event.preventDefault(); event.returnValue = ''; }
    function warnDraft() {
        var dirty = !published && (edited || uncertain || busy);
        if (dirty && !warned) { window.addEventListener('beforeunload',warn); warned = true; }
        if (!dirty && warned) { window.removeEventListener('beforeunload',warn); warned = false; }
    }
    function message(text) { status.textContent = text; status.hidden = !text; }
    function sessionChanged(state) {
        if (!alive()) return;
        previewButton.textContent = state.preview ? labels.stop : labels.preview;
        if (state.event === 'unavailable') message(labels.unavailable);
    }
    function stopPreview(resume) {
        if (inline) session.stop({resume:resume!==false});
        else { if (frame.hasAttribute('src')) frame.removeAttribute('src'); frame.hidden = true; placeholder.hidden = false; framePreview = false; }
        previewKey = ''; previewButton.textContent = labels.preview;
    }
    function fieldError(input,text,show) {
        input.setCustomValidity(text); input.setAttribute('aria-invalid',String(!!text));
        var error = document.getElementById(input.id+'-error'); error.textContent = text; error.hidden = !text || show === false;
    }
    function update() {
        var a = parse(start.value), b = parse(end.value), length = b-a;
        var startError = a === null ? labels.time : duration > 0 && a > duration ? labels.bounds : '', endError = b === null ? labels.time : duration > 0 && b > duration ? labels.bounds : '';
        var valid = !startError && !endError && length >= 5 && length <= 120;
        if (!startError && !endError && !valid) endError = labels.range;
        fieldError(start,startError); fieldError(end,endError);
        var count = Array.from(title.value.trim()).length; document.getElementById('clip-title-count').textContent = count+' / 140'; fieldError(title,count<1 || count>140 ? labels.title : '',titleTouched);
        document.getElementById('clip-duration').textContent = valid ? labels.duration.replace('{duration}',format(length)) : labels.range;
        if (valid) lastRange = [a,b];
        [a,b].forEach(function (time,i) { if (ranges[i] && time !== null && time <= duration) { ranges[i].value = time; ranges[i].setAttribute('aria-valuetext',format(time)); } });
        var track = form.querySelector('.clip-timeline'); if (track) { track.style.setProperty('--clip-start',Number(ranges[0].value)/duration*100+'%'); track.style.setProperty('--clip-end',Number(ranges[1].value)/duration*100+'%'); }
        if (previewKey && previewKey !== a+':'+b) stopPreview();
        previewButton.disabled = busy || !valid || !sourceAvailable; publish.disabled = busy || uncertain || !valid || count<1 || count>140;
        document.getElementById('clip-preview-loop').disabled = busy || !sourceAvailable;
        document.getElementById('clip-unconfirmed').hidden = !uncertain; warnDraft(); return valid && count>=1 && count<=140;
    }
    function normalize() { var a=parse(start.value),b=parse(end.value),hours=a>=3600 || b>=3600; if(a!==null)start.value=format(a,hours);if(b!==null)end.value=format(b,hours); }
    function setRange(a,b) { start.value=format(a,a>=3600 || b>=3600);end.value=format(b,a>=3600 || b>=3600);update(); }
    function adjust(name,value,constrain) {
        var a=parse(start.value),b=parse(end.value);if(a===null || b===null || a>duration || b>duration || b-a<5 || b-a>120){a=lastRange[0];b=lastRange[1];}
        value=Math.max(0,Math.min(duration,Math.floor(value)));
        if(name==='start')a=constrain?Math.max(0,Math.min(b-5,Math.max(b-120,value))):value;
        else b=constrain?Math.min(duration,Math.max(a+5,Math.min(a+120,value))):value;
        edited=true;setRange(a,b);
    }
    function lock(value) { busy=value;form.setAttribute('aria-busy',String(value));form.querySelectorAll('input,select,button').forEach(function(input){input.disabled=value;});publish.textContent=value?labels.publishing:publishLabel;update(); }
    form.querySelectorAll('.js-only').forEach(function(node){node.hidden=false;});
    if (!inline && form.dataset.preserveDraft !== 'true') [start,end].forEach(function(input){if(/^\d+(?:\.\d+)?$/.test(input.value) && Number.isSafeInteger(Math.floor(Number(input.value))))input.value=format(Number(input.value));});
    [start,end].forEach(function(input,i){on(input,'input',function(){if(!alive() || busy)return;edited=true;if(!uncertain)message('');update();});on(input,'focus',function(){if(boundary)boundary.value=i===0?'start':'end';});on(input,'blur',function(){if(alive() && !busy){normalize();update();}});});
    on(title,'input',function(){if(!alive() || busy)return;titleTouched=true;edited=true;if(!uncertain)message('');update();});
    ranges.forEach(function(input,i){on(input,'input',function(){if(!alive() || busy)return;if(boundary)boundary.value=i===0?'start':'end';adjust(i===0?'start':'end',Number(input.value),true);});});
    on(document.getElementById('clip-use-time'),'click',function(){if(alive() && opened && !busy)adjust(boundary.value,Number(player.currentTime()),false);});
    on(document.getElementById('clip-preview-loop'),'change',function(event){if(alive() && inline && session.isPreviewing())player.loop(event.target.checked);});
    on(previewButton,'click',function(){
        if(!alive() || busy || previewButton.disabled)return;
        if(previewing()){stopPreview();return;}
        var a=parse(start.value),b=parse(end.value);message('');
        if(inline){if(!opened || !session.preview({startTime:a,endTime:b},document.getElementById('clip-preview-loop').checked))return;}
        else {var url=new URL(form.dataset.preview,location.origin);url.searchParams.set('clip_start',String(a));url.searchParams.set('clip_end',String(b));url.searchParams.set('autoplay','1');url.searchParams.set('loop',document.getElementById('clip-preview-loop').checked?'1':'0');frame.src=url.pathname+url.search;frame.hidden=false;placeholder.hidden=true;framePreview=true;}
        previewKey=a+':'+b;previewButton.textContent=labels.stop;
    });
    function open(time) {
        if(!inline || !alive() || document.hidden)return false;
        if(opened){document.getElementById('clip-heading').focus({preventScroll:true});return true;}
        if(!session.begin())return false;
        if(!InvidiousWatchClipPanel.open()){session.finish({resume:false});return false;}
        opened=true;
        if(!initialized || published && resultSeen){title.value='';titleTouched=false;edited=false;published=false;resultSeen=false;uncertain=false;form.hidden=false;result.hidden=true;message('');var range=defaultRange(Number(time),duration);setRange(range[0],range[1]);initialized=true;}
        update();if(published)resultSeen=true;(published?document.getElementById('clip-result-heading'):busy?document.getElementById('clip-heading'):title).focus({preventScroll:true});return true;
    }
    function close(focus,resume) {
        if(!opened)return;stopPreview(false);session.finish({resume:resume!==false && activePage});opened=false;InvidiousWatchClipPanel.close(focus!==false);update();
    }
    on(document.getElementById('clip-close'),'click',function(){close();});on(document.getElementById('clip-done'),'click',function(){close();});
    if(inline)on(document.getElementById('tool-clip-editor'),'keydown',function(event){event.stopPropagation();if(event.key==='Escape'){event.preventDefault();close();}});
    on(form,'submit',async function(event){
        if(!inline){titleTouched=true;if(uncertain || busy || !update() || !form.reportValidity())event.preventDefault();else{window.removeEventListener('beforeunload',warn);warned=false;}return;}
        event.preventDefault();if(!alive() || !opened || busy || uncertain)return;
        titleTouched=true;if(!update() || !form.reportValidity())return;
        normalize();stopPreview(false);message('');var controller=new AbortController(),token=++epoch,dispatched=false;operation=controller;lock(true);
        var payload={videoId:form.elements.namedItem('videoId').value,title:title.value.trim(),startTime:parse(start.value),endTime:parse(end.value)};
        try {
            var csrf=await ui.request('/api/v1/auth/csrf',{signal:controller.signal});if(!alive() || token!==epoch)return;
            if(!csrf || typeof csrf.csrfToken!=='string' || !csrf.csrfToken)throw new Error(labels.session);
            dispatched=true;uncertain=true;
            var clip=await ui.request('/api/v1/auth/clips',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf.csrfToken},body:JSON.stringify(payload),signal:controller.signal});
            if(!alive() || token!==epoch)return;
            if(!clip || !/^IVCL[a-zA-Z0-9_-]{32}$/.test(clip.clipId || ''))throw new Error(labels.unconfirmed);
            var url=new URL('/clip/'+clip.clipId,location.origin).href;document.getElementById('clip-share-url').value=url;document.getElementById('clip-watch').href=url;document.getElementById('clip-result-title').textContent=typeof clip.clipTitle==='string'?clip.clipTitle:payload.title;
            uncertain=false;published=true;edited=false;form.hidden=true;result.hidden=false;if(opened){resultSeen=true;document.getElementById('clip-result-heading').focus();}
        } catch(error) {
            if(!alive() || token!==epoch || controller.signal.aborted)return;
            if(!dispatched || [400,401,403,404,405,409,413,415,422,429].includes(error.status))uncertain=false;
            message(uncertain?labels.unconfirmed:error.status===401 || error.status===403?labels.session:error.userMessage || labels.error);if(opened)status.focus();
        } finally {if(alive() && token===epoch){operation=null;lock(false);}}
    });
    on(document.getElementById('clip-copy'),'click',async function(){
        if(!alive() || !published)return;var input=document.getElementById('clip-share-url'),text=document.getElementById('clip-copy-status');
        try{await navigator.clipboard.writeText(input.value);if(alive())text.textContent=labels.copied;}catch(_){if(alive()){text.textContent=labels.copy_fallback;input.focus();input.select();}}
    });
    function playerDisposal(){dispose();}
    function dispose(){if(disposed)return;epoch++;if(operation)operation.abort();close(false,false);if(session)session.dispose();disposed=true;activePage=false;life.abort();window.removeEventListener('beforeunload',warn);form.querySelectorAll('input,select,button').forEach(function(node){node.disabled=true;});if(inline)player.off('dispose',playerDisposal);}
    on(window,'pagehide',function(event){epoch++;if(operation)operation.abort();operation=null;close(false,false);activePage=false;busy=false;if(!event.persisted)dispose();});
    on(window,'pageshow',function(){activePage=!disposed;if(alive()){lock(false);if(uncertain)message(labels.unconfirmed);}});
    on(window,'browserprofilechange',dispose);on(document,'iv:content-added',function(){if(!form.isConnected)dispose();});
    if(inline){player.on('dispose',playerDisposal);window.InvidiousClipEditor={open:open,close:close,dispose:dispose};}
    update();
})();
