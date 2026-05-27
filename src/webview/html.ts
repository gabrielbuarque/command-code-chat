export function bodyHtml(): string {
  return `
  <div class="header">
    <span class="brand">CC</span>
    <span class="status-pill idle" id="status-pill">idle</span>
    <div class="mode-seg" id="mode-seg">
      <button data-mode="plan" class="active">Plan</button>
      <button data-mode="standard">Std</button>
      <button data-mode="auto-accept" class="danger">Auto</button>
    </div>
    <label class="model-wrap" for="model-select">
      <span class="model-label">model</span>
      <select id="model-select"></select>
    </label>
    <span class="workspace-tag" id="workspace-tag"></span>
    <div class="header-acts">
      <button class="ctrl-btn" id="stop-btn" title="Stop" disabled>&#x25A0;</button>
      <button class="ctrl-btn" id="new-chat-btn" title="New Chat">+</button>
      <button class="ctrl-btn" id="settings-btn" title="Settings">&#x2699;</button>
    </div>
  </div>
  <div class="warning-bar" id="auto-accept-warn">Auto-Accept: modifications run without asking.</div>
  <div class="error-card" id="error-card"></div>
  <div class="chip-dock" id="chip-dock"><span class="chip-hint">add context with #file or @source</span></div>
  <div class="queue-dock" id="queue-dock">
    <div class="queue-top"><span>queued</span><button class="ctrl-btn" id="clear-queue-btn" style="font-size:8px;width:auto;padding:0 5px">clear</button></div>
    <div id="queue-list"></div>
  </div>
  <div class="feed" id="feed">
    <div class="empty-wrap" id="empty-state">
      <div class="empty-title">what should Command Code do?</div>
      <div class="empty-sub">describe your task. use # to attach files, @ to add context, / for commands.</div>
      <div class="empty-suggestions">
        <button class="empty-sugg" data-text="review this repository for bugs">review this repository for bugs</button>
        <button class="empty-sugg" data-text="explain the architecture of this project">explain the architecture of this project</button>
        <button class="empty-sugg" data-text="write an implementation plan for the next feature">write an implementation plan for the next feature</button>
      </div>
    </div>
  </div>
  <div class="autocomplete" id="autocomplete"></div>
  <div class="composer">
    <div class="composer-row">
      <textarea id="user-input" rows="2" placeholder="describe your task… (Enter=send, Alt+Enter=queue)"></textarea>
      <div class="composer-btns">
        <button class="send-btn" id="send-btn" title="Send (Enter)">&#x2191;</button>
        <button class="queue-btn" id="queue-btn" title="Queue (Alt+Enter)">&#x21B5;</button>
      </div>
    </div>
    <div class="think-bar" id="think-bar"><div class="think-dot"></div><span>thinking…</span></div>
  </div>`;
}

export function webviewScript(): string {
  return `
var vscode = acquireVsCodeApi();
var feed = id('feed'), userInput = id('user-input'), sendBtn = id('send-btn'),
    stopBtn = id('stop-btn'), newChatBtn = id('new-chat-btn'), settingsBtn = id('settings-btn'),
    errorCard = id('error-card'), thinkBar = id('think-bar'), autoWarn = id('auto-accept-warn'),
    workspaceTag = id('workspace-tag'), statusPill = id('status-pill'),
  modelSelect = id('model-select'),
    chipDock = id('chip-dock'), queueDock = id('queue-dock'), queueList = id('queue-list'),
    autocomplete = id('autocomplete');
var modeSeg = id('mode-seg');
var modeBtns = modeSeg ? modeSeg.querySelectorAll('button') : [];

function id(s) { return document.getElementById(s); }
function esc(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function escAttr(s) { return esc(s).replace(/"/g,'&quot;'); }

/* State */
var isRunning = false, curMsgEl = null, curMode = 'plan',
    msgSeq = 0, errorTimer = null, chips = [], queue = [], userMsgIndexes = [],
  tracks = {}; /* turnId -> { activities, rawTranscript, status, code } */
var shouldAutoScroll = true;
var displayMode = 'pretty'; /* 'pretty' | 'raw' */
var modelOptions = [];

window.onerror = function(msg, src, line) {
  try { showError('Error: ' + msg + (line ? ' (line ' + line + ')' : '')); } catch(e) {}
  return false;
};

feed.addEventListener('scroll', function() {
  shouldAutoScroll = (feed.scrollHeight - feed.scrollTop - feed.clientHeight) < 35;
});

/* Mode */
function setModeUI(m) {
  curMode = m;
  modeBtns.forEach(function(b) { b.classList.toggle('active', b.dataset.mode === m); });
  autoWarn.classList.toggle('show', m === 'auto-accept');
}
modeBtns.forEach(function(b) {
  b.addEventListener('click', function() {
    setModeUI(b.dataset.mode);
    vscode.postMessage({ type: 'setMode', mode: curMode });
  });
});

function setStatus(s) { statusPill.className = 'status-pill ' + s; statusPill.textContent = s; }
function showError(msg) { errorCard.innerHTML = esc(msg); errorCard.classList.add('show'); if(errorTimer){clearTimeout(errorTimer)} errorTimer = setTimeout(function(){errorCard.classList.remove('show')},10000); }
function setWorkspace(root) { workspaceTag.textContent = root ? (root.split('/').pop()||root.split('\\\\').pop()||root) : ''; }

function setModelOptions(options) {
  modelOptions = options || [];
  if (!modelSelect) return;
  var current = modelSelect.value;
  modelSelect.innerHTML = '';
  modelOptions.forEach(function(opt) {
    var o = document.createElement('option');
    o.value = opt.id;
    o.textContent = opt.label;
    o.title = opt.description || opt.label;
    modelSelect.appendChild(o);
  });
  if (current && modelOptions.some(function(opt) { return opt.id === current; })) {
    modelSelect.value = current;
  }
}

function setModelUI(modelId) {
  if (!modelSelect) return;
  if (modelId && modelOptions.some(function(opt) { return opt.id === modelId; })) {
    modelSelect.value = modelId;
    return;
  }
  if (modelId) {
    var existing = Array.from(modelSelect.options).some(function(o) { return o.value === modelId; });
    if (!existing) {
      var opt = document.createElement('option');
      opt.value = modelId;
      opt.textContent = modelId;
      opt.title = modelId;
      modelSelect.appendChild(opt);
    }
    modelSelect.value = modelId;
  }
}

if (modelSelect) {
  modelSelect.addEventListener('change', function() {
    vscode.postMessage({ type: 'setModel', model: modelSelect.value });
  });
}

/* FIX: sendOrQueue now creates user + assistant bubbles immediately */
function sendOrQueue(e) {
  var t = userInput.value.trim(); if(!t)return;
  if(t.startsWith('/')){handleSlash(t);return;}
  if((e&&e.altKey)||(e&&(e.ctrlKey||e.metaKey))||(isRunning&&!(e&&(e.ctrlKey||e.metaKey)))){
    postMsg('queueMessage');
  } else {
    postMsg('sendMessage');
  }
}

function postMsg(ty) {
  var t = userInput.value.trim(); if(!t)return;

  if (ty === 'sendMessage') {
    /* Create user bubble */
    msgSeq++;
    var userEl = mkMsgEl('user', 'You', t, 'm-'+msgSeq);
    userEl.setAttribute('data-user-idx', msgSeq);
    hideEmptyState();

    /* Create assistant bubble immediately */
    msgSeq++;
    var asstEl = mkMsgEl('assistant', 'Command Code', '', 'm-'+msgSeq);
    curMsgEl = asstEl;

    /* Update userMsgIndexes for rerun */
    userMsgIndexes.push(msgSeq - 1);

    /* Set running state now - before we even hear back from extension */
    setRunning(true);
    setStatus('running');
    userInput.value = ''; userInput.style.height = 'auto';
    hideAC();
  } else {
    /* Queue - just send, no bubbles yet */
    userInput.value = ''; userInput.style.height = 'auto';
    hideAC();
  }

  vscode.postMessage({ type: ty, text: t, mode: curMode });
}

function mkMsgEl(role, who, content, id) {
  var w = document.createElement('div');
  w.className = 'msg ' + (role==='assistant'?'asst':role==='system'?'sys':'user');
  w.setAttribute('data-id', id);

  var row = document.createElement('div'); row.className = 'msg-row';
  var g = document.createElement('div'); g.className = 'msg-gutter'; row.appendChild(g);
  var body = document.createElement('div'); body.className = 'msg-body';

  var meta = document.createElement('div'); meta.className = 'msg-meta';
  var whoEl = document.createElement('span'); whoEl.className = 'msg-who'; whoEl.textContent = who; meta.appendChild(whoEl);

  if (role === 'assistant') {
    var acts = document.createElement('div'); acts.className = 'msg-acts';

    /* Pretty / Raw toggle */
    var tgl = document.createElement('button'); tgl.className = 'msg-act'; tgl.textContent = 'Pretty';
    tgl.addEventListener('click', function(e){ e.stopPropagation();
      if (displayMode==='pretty'){displayMode='raw';tgl.textContent='Raw'}else{displayMode='pretty';tgl.textContent='Pretty';}
      refreshTurnBody(w, body);
    }); acts.appendChild(tgl);

    var cb = document.createElement('button'); cb.className = 'msg-act'; cb.textContent = 'Copy';
    cb.addEventListener('click', function(e){ e.stopPropagation();
      var raw = w.getAttribute('data-full-text') || '';
      navigator.clipboard.writeText(raw).then(function(){
        cb.textContent='Copied';cb.classList.add('done');setTimeout(function(){cb.textContent='Copy';cb.classList.remove('done')},1500);
      });
    }); acts.appendChild(cb);
    meta.appendChild(acts);
    w._actions = acts;
  }

  if (role === 'user') {
    var acts2 = document.createElement('div'); acts2.className = 'msg-acts';
    var rr = document.createElement('button'); rr.className = 'msg-act'; rr.textContent = 'Rerun';
    rr.addEventListener('click', function(e){ e.stopPropagation();
      var ui = userMsgIndexes.indexOf(parseInt(w.getAttribute('data-user-idx')||'0'));
      vscode.postMessage({type:'rerunMessage',index:ui>=0?ui:0});
    }); acts2.appendChild(rr);
    meta.appendChild(acts2);
  }

  body.appendChild(meta);
  var cd = document.createElement('div'); cd.className = 'msg-content';
  cd.setAttribute('data-raw', content || '');
  cd.innerHTML = content ? renderText(content) : '';
  body.appendChild(cd);
  w._contentDiv = cd;

  row.appendChild(body); w.appendChild(row);
  feed.appendChild(w);
  if (shouldAutoScroll) feed.scrollTop = feed.scrollHeight;
  return w;
}

function renderText(raw) {
  if (!raw) return '';
  var out = '', parts = raw.split(/(\\x60\\x60\\x60[\\s\\S]*?\\x60\\x60\\x60)/g);
  for (var i=0;i<parts.length;i++) {
    var p = parts[i];
    if (p.startsWith('\\x60\\x60\\x60')) {
      var inner = p.slice(3,-3).trim(), nl = inner.indexOf('\\n'), lang = '', code = inner;
      if (nl>0){lang=inner.slice(0,nl).trim();code=inner.slice(nl+1).trim();}
      out += '<div class="code-header"><span class="code-lang">'+(lang||'code')+'</span><button class="code-copy" data-code="'+escAttr(code)+'">Copy</button></div><pre><code>'+esc(code)+'</code></pre>';
    } else {
      out += esc(p).replace(/\\x60([^\\x60]+)\\x60/g,'<code>$1</code>');
    }
  }
  return out;
}
function wireCodeCopy(root) {
  if (!root) return;
  root.querySelectorAll('.code-copy').forEach(function(b) {
    if (b._w) return; b._w=true;
    b.addEventListener('click',function(e){e.stopPropagation();var c=b.getAttribute('data-code')||'';c=c.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&').replace(/&quot;/g,'"');navigator.clipboard.writeText(c).then(function(){b.textContent='Copied';b.style.opacity='1';setTimeout(function(){b.textContent='Copy';b.style.opacity=''},1500)})});
  });
}

/* Activity stream rendering */

function refreshTurnBody(w, body) {
  var tid = w.getAttribute('data-turn-id');
  if (!tid) return;
  var tr = tracks[tid];
  if (!tr) return;
  var cd = w._contentDiv || body.querySelector('.msg-content');

  if (displayMode === 'raw') {
    var raw = tr.rawTranscript || '(no output)';
    cd.innerHTML = '<pre class="raw-transcript">' + esc(raw) + '</pre>';
    cd.classList.remove('collapsed');
  } else {
    var html = '';
    if (tr.activities && tr.activities.length) {
      html += '<div class="ac-timeline">';
      tr.activities.forEach(function(ev) {
        html += '<div class="ac-ev ac-ev-'+ev.type+'"><span class="ac-ev-type">'+ev.type.toUpperCase()+'</span> <span class="ac-ev-msg">'+esc(ev.message)+'</span></div>';
      });
      html += '</div>';
    }
    if (tr.rawTranscript) {
      html += '<details class="raw-details"><summary>raw transcript</summary><pre class="raw-transcript">'+esc(tr.rawTranscript)+'</pre></details>';
    }
    if (!html) html = '<span class="ac-empty">waiting for output…</span>';
    cd.innerHTML = html;
  }
  wireCodeCopy(cd);
}

function hideEmptyState() {
  var es = id('empty-state'); if (es) es.style.display = 'none';
}

function setRunning(r){
  isRunning=r;sendBtn.disabled=r;stopBtn.disabled=!r;
  stopBtn.classList.toggle('danger',r);
  userInput.disabled=r;thinkBar.classList.toggle('show',r);
  modeBtns.forEach(function(b){b.disabled=r});
  if (modelSelect) modelSelect.disabled = r;
}

/* Chips / Queue / Clear */
function renderChips(){
  chipDock.innerHTML=chips.length===0?'<span class="chip-hint">add context with #file or @source</span>':'';
  chips.forEach(function(c){var el=document.createElement('span');el.className='chip '+c.type;el.title=c.detail||c.label;var lb=document.createElement('span');lb.className='chip-label';lb.textContent=c.label;var rm=document.createElement('button');rm.className='chip-remove';rm.innerHTML='&times;';rm.addEventListener('click',function(){vscode.postMessage({type:'removeChip',id:c.id})});el.appendChild(lb);el.appendChild(rm);chipDock.appendChild(el)});
  if(chips.length>0){var clr=document.createElement('button');clr.className='chip-clear';clr.textContent='clear';clr.addEventListener('click',function(){vscode.postMessage({type:'clearContext'})});chipDock.appendChild(clr)}
}
function renderQueue(){
  queueDock.classList.toggle('show',queue.length>0);queueList.innerHTML='';
  queue.forEach(function(q){var d=document.createElement('div');d.className='queue-item';var t=document.createElement('span');t.className='queue-text';t.textContent=q.text;var r=document.createElement('button');r.className='queue-rm';r.innerHTML='&times;';r.addEventListener('click',function(){vscode.postMessage({type:'removeQueueItem',id:q.id})});d.appendChild(t);d.appendChild(r);queueList.appendChild(d)});
  setStatus(queue.length>0&&!isRunning?'queued':(isRunning?'running':'idle'));
}
function clearFeed(){
  feed.innerHTML='<div class="empty-wrap" id="empty-state"><div class="empty-title">what should Command Code do?</div><div class="empty-sub">describe your task. use # to attach files, @ to add context, / for commands.</div><div class="empty-suggestions"><button class="empty-sugg" data-text="review this repository for bugs">review this repository for bugs</button><button class="empty-sugg" data-text="explain the architecture of this project">explain the architecture of this project</button><button class="empty-sugg" data-text="write an implementation plan for the next feature">write an implementation plan for the next feature</button></div></div>';
  document.querySelectorAll('.empty-sugg').forEach(function(b){b.addEventListener('click',function(){userInput.value=b.getAttribute('data-text')||'';userInput.focus()})});
  curMsgEl=null;msgSeq=0;userMsgIndexes=[];tracks={};
}

/* Event listeners */
sendBtn.addEventListener('click',function(){sendOrQueue(null)});
id('queue-btn').addEventListener('click',function(){postMsg('queueMessage')});
stopBtn.addEventListener('click',function(){vscode.postMessage({type:'stop'})});
newChatBtn.addEventListener('click',function(){vscode.postMessage({type:'newChat'})});
settingsBtn.addEventListener('click',function(){vscode.postMessage({type:'openSettings'})});
id('clear-queue-btn').addEventListener('click',function(){vscode.postMessage({type:'clearQueue'})});
userInput.addEventListener('keydown',function(e){
  if(autocomplete.classList.contains('show')){
    if(e.key==='Escape'){hideAC();e.preventDefault();return}
    if(e.key==='ArrowDown'){acMove(1);e.preventDefault();return}
    if(e.key==='ArrowUp'){acMove(-1);e.preventDefault();return}
    if(e.key==='Enter'||e.key==='Tab'){acSelect();e.preventDefault();return}
  }
  if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendOrQueue(e);return}
  if(e.key==='Escape'){userInput.blur();return}
  if((e.ctrlKey||e.metaKey)&&e.shiftKey&&e.key==='Backspace'){e.preventDefault();vscode.postMessage({type:'stop'});return}
  if((e.ctrlKey||e.metaKey)&&e.key==='n'&&!e.shiftKey){e.preventDefault();vscode.postMessage({type:'newChat'});return}
});
userInput.addEventListener('input',function(){userInput.style.height='auto';userInput.style.height=Math.min(userInput.scrollHeight,120)+'px';checkAC()});
document.querySelectorAll('.empty-sugg').forEach(function(b){b.addEventListener('click',function(){userInput.value=b.getAttribute('data-text')||'';userInput.focus();userInput.style.height='auto';userInput.style.height=Math.min(userInput.scrollHeight,120)+'px'})});

/* Autocomplete */
var acItems=[],acIdx=-1;
var SLASH=[{n:'help',d:'Show commands'},{n:'new',d:'New chat'},{n:'clear',d:'Clear messages'},{n:'stop',d:'Stop'},{n:'queue',d:'Queue message'},{n:'mode plan',d:'Plan mode'},{n:'mode standard',d:'Standard mode'},{n:'mode auto',d:'Auto-Accept'},{n:'model',d:'Select model'},{n:'status',d:'Show status'},{n:'retry',d:'Retry last message'},{n:'diagnose',d:'Run diagnostics'},{n:'context',d:'List chips'},{n:'clear-context',d:'Remove chips'},{n:'file',d:'Add file'},{n:'folder',d:'Add folder'},{n:'selection',d:'Add selection'},{n:'open-settings',d:'Settings'}];
var AT=[{n:'workspace',d:'Workspace'},{n:'current-file',d:'Active file'},{n:'selection',d:'Selection'},{n:'open-tabs',d:'Tabs'},{n:'problems',d:'Diagnostics'},{n:'git',d:'Git'}];
function checkAC(){var val=userInput.value,pos=userInput.selectionStart,before=val.substring(0,pos),ll=before.split('\\n').pop()||'';if(ll.startsWith('/')){var q=ll.slice(1);acItems=SLASH.filter(function(c){return c.n.startsWith(q)});if(acItems.length){showAC(acItems.map(function(c){return{l:'/'+c.n,d:c.d}}));return}}if(ll.startsWith('@')){var q2=ll.slice(1);acItems=AT.filter(function(c){return c.n.startsWith(q2)});if(acItems.length){showAC(acItems.map(function(c){return{l:'@'+c.n,d:c.d}}));return}}if(ll.startsWith('#')){vscode.postMessage({type:'requestFileList',query:ll.slice(1)});return}hideAC();}
function showAC(items){acIdx=-1;autocomplete.innerHTML='';items.forEach(function(it,i){var d=document.createElement('div');d.className='ac-item';d.innerHTML='<span class="ac-prefix">'+esc(it.l.charAt(0))+'</span><span class="ac-name">'+esc(it.l.slice(1))+'</span><span class="ac-desc">'+esc(it.d)+'</span>';d.addEventListener('click',function(){applyAC(it.l)});autocomplete.appendChild(d)});autocomplete.classList.add('show')}
function acMove(dir){if(!acItems.length)return;var els=autocomplete.querySelectorAll('.ac-item');if(acIdx>=0)els[acIdx].classList.remove('sel');acIdx=(acIdx+dir+els.length)%els.length;els[acIdx].classList.add('sel')}
function acSelect(){if(acIdx>=0&&acIdx<acItems.length)applyAC((acItems[acIdx].n.match(/^\\//)?'/':'')+acItems[acIdx].n)}
function applyAC(v){var pos=userInput.selectionStart,before=userInput.value.substring(0,pos),after=userInput.value.substring(pos),ll=before.split('\\n').pop()||'';userInput.value=before.substring(0,before.length-ll.length)+v+' '+after;var np=before.length-ll.length+v.length+1;userInput.setSelectionRange(np,np);userInput.focus();hideAC();userInput.style.height='auto';userInput.style.height=Math.min(userInput.scrollHeight,120)+'px'}
function hideAC(){autocomplete.classList.remove('show');acItems=[];acIdx=-1}
function fillFileAC(files){if(!userInput.value.match(/#/))return;var items=(files||[]).slice(0,20).map(function(f){return{l:'#'+f,d:f}});if(items.length){acItems=items.map(function(i){return{n:i.l.slice(1),d:i.d}});showAC(items)}}

function handleSlash(raw){var sp=raw.indexOf(' '),cmd=sp===-1?raw.slice(1):raw.slice(1,sp),args=sp===-1?undefined:raw.slice(sp+1);if(cmd==='mode'&&args){setModeUI(args==='auto'?'auto-accept':args);vscode.postMessage({type:'setMode',mode:curMode});}else vscode.postMessage({type:'executeSlash',cmd:cmd,args:args});userInput.value='';userInput.style.height='auto';hideAC();}

/* PostMessage handler */
window.addEventListener('message',function(ev){var m=ev.data;
switch(m.type){
case'initState':setModeUI(m.mode);setWorkspace(m.root);setModelOptions(m.models||[]);setModelUI(m.model);chips=m.chips||[];renderChips();queue=m.queue||[];renderQueue();if(m.messages&&m.messages.length){hideEmptyState();for(var i=0;i<m.messages.length;i++)addMsg(m.messages[i]);}break;
case'initMode':setModeUI(m.mode);break;
case'initModel':setModelUI(m.model);break;
case'workspaceInfo':setWorkspace(m.root);break;
case'chipsUpdate':chips=m.chips;renderChips();break;
case'queueUpdate':queue=m.queue;renderQueue();break;

/* New turn lifecycle */
case'turnStart':
  hideEmptyState();
  setRunning(true);
  tracks[m.turnId] = { activities: [], rawTranscript: '', status: 'running', code: null };
  if (curMsgEl) curMsgEl.setAttribute('data-turn-id', m.turnId);
  break;

case'rawChunk':
  if (!tracks[m.turnId]) tracks[m.turnId] = { activities: [], rawTranscript: '', status: 'running', code: null };
  tracks[m.turnId].rawTranscript = (tracks[m.turnId].rawTranscript || '') + m.text;
  refreshTurnById(m.turnId);
  break;

case'activityEvents':
  if (!tracks[m.turnId]) tracks[m.turnId] = { activities: [], rawTranscript: '', status: 'running', code: null };
  tracks[m.turnId].activities = (tracks[m.turnId].activities || []).concat(m.events || []);
  refreshTurnById(m.turnId);
  break;

case'turnComplete':
  if (!tracks[m.turnId]) tracks[m.turnId] = { activities: [], rawTranscript: '', status: 'running', code: null };
  tracks[m.turnId].status = m.status;
  tracks[m.turnId].code = m.exitCode;
  if (m.error && !tracks[m.turnId].rawTranscript) tracks[m.turnId].rawTranscript = '[Erro] ' + m.error;
  setRunning(false);
  setStatus(m.status === 'failed' ? 'error' : (queue.length > 0 ? 'queued' : 'idle'));
  refreshTurnById(m.turnId);
  break;

case'queuePopped':
  msgSeq++; var ue=mkMsgEl('user','You',m.text,'m-'+msgSeq); userMsgIndexes.push(msgSeq);
  hideEmptyState(); setModeUI(m.mode);
  msgSeq++; var ae=mkMsgEl('assistant','Command Code','','m-'+msgSeq); curMsgEl=ae;
  setRunning(true); setStatus('running');
  break;

case'responseComplete': setRunning(false); setStatus('idle'); break;
case'responseError': setRunning(false); if(m.error)showError(m.error);break;
case'systemMessage': msgSeq++;mkMsgEl('system','System',m.text,'m-'+msgSeq);feed.scrollTop=feed.scrollHeight;break;
case'clearChat': clearFeed();break;
case'cliMissing': showError('CLI not found. Install: npm i -g command-code');setRunning(false);break;
case'fileList': fillFileAC(m.files);break;
}
});

/* Helper: refresh turn body by turn ID */
function refreshTurnById(tid) {
  var el = feed.querySelector('[data-turn-id="'+tid+'"]');
  if (!el) return;
  var tr = tracks[tid];
  if (!tr) return;
  var body = el.querySelector('.msg-body') || el;
  var cd = el._contentDiv || body.querySelector('.msg-content');
  if (!cd) return;

  if (displayMode === 'raw') {
    cd.innerHTML = '<pre class="raw-transcript">' + esc(tr.rawTranscript || '(no output)') + '</pre>';
  } else {
    var html = '';
    if (tr.activities && tr.activities.length) {
      html += '<div class="ac-timeline">';
      tr.activities.forEach(function(ev) {
        html += '<div class="ac-ev ac-ev-'+ev.type+'"><span class="ac-ev-type">'+ev.type.toUpperCase()+'</span> <span class="ac-ev-msg">'+esc(ev.message)+'</span></div>';
      });
      html += '</div>';
    }
    if (tr.rawTranscript) {
      html += '<details class="raw-details"><summary>raw transcript ('+(tr.rawTranscript.length)+' chars)</summary><pre class="raw-transcript">'+esc(tr.rawTranscript)+'</pre></details>';
    }
    if (!html) html = '<span class="ac-empty">waiting for output…</span>';
    cd.innerHTML = html;
  }
  wireCodeCopy(cd);
  if (shouldAutoScroll) feed.scrollTop = feed.scrollHeight;
}

/* Restore: addMsg for persisted messages (backward compat) */
function addMsg(msg) {
  msgSeq++;
  var role = msg.role || 'user';
  var content = msg.content || '';
  var who = role==='system'?'System':(role==='user'?'You':'Command Code');
  var el = mkMsgEl(role, who, content, 'm-'+msgSeq);
  if (msg.id) el.setAttribute('data-turn-id', msg.id);
  if (msg.activities) tracks[msg.id] = { activities: msg.activities, rawTranscript: msg.rawTranscript||'', status: msg.status||'completed', code: msg.exitCode };
  if (msg.rawTranscript) {
    tracks[msg.id] = tracks[msg.id] || { activities:[], rawTranscript: msg.rawTranscript, status: msg.status||'completed', code: msg.exitCode };
    refreshTurnById(msg.id);
  }
  return el;
}

/* Signal extension that webview is ready to receive messages */
vscode.postMessage({ type: 'ready' });
`;
}
