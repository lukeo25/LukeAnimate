/*
  Luke Animate Layer Locking v3.0
  DOM-driven layer locking so the control is visible even when Luke Animate's
  internal editor variables are scoped inside the main application script.
*/
(function(){
  'use strict';

  if(window.__lukeAnimateLayerLockV3) return;
  window.__lukeAnimateLayerLockV3 = true;

  const STORAGE_PREFIX = 'LukeAnimate.LayerLock.v3.';
  const STYLE_ID = 'luke-animate-layer-lock-v3-style';
  const LOCK_SELECTOR = '.timeline-layer-lock-button';
  let lastUnlockedKey = null;
  let restoringSelection = false;
  let decorating = false;
  let stageGestureBlocked = false;

  function storageKey(key){
    return STORAGE_PREFIX + location.pathname + '::' + key;
  }

  function readLocked(key){
    try{ return localStorage.getItem(storageKey(key)) === '1'; }
    catch(_e){ return false; }
  }

  function writeLocked(key, locked){
    try{
      if(locked) localStorage.setItem(storageKey(key),'1');
      else localStorage.removeItem(storageKey(key));
    }catch(_e){}
  }

  function addStyles(){
    if(document.getElementById(STYLE_ID)) return;
    const style=document.createElement('style');
    style.id=STYLE_ID;
    style.textContent=`
      .timeline-track-name{
        min-width:76px;
      }
      .timeline-layer-lock-button{
        flex:0 0 17px !important;
        width:17px !important;
        min-width:17px !important;
        height:17px !important;
        padding:0 !important;
        margin:0 1px 0 0 !important;
        border:0 !important;
        border-radius:3px !important;
        background:transparent !important;
        color:#65707d !important;
        cursor:pointer !important;
        font:400 12px/17px Arial,sans-serif !important;
        display:inline-flex !important;
        align-items:center !important;
        justify-content:center !important;
        vertical-align:middle !important;
      }
      .timeline-layer-lock-button:hover,
      .timeline-layer-lock-button:focus-visible{
        color:var(--accent,#0e9c86) !important;
        background:#e3f7f3 !important;
        outline:none !important;
      }
      .timeline-layer-lock-button.locked{
        color:#9a6508 !important;
        background:#fff0c7 !important;
      }
      .timeline-track-row.layer-locked .timeline-track-name{
        background:#eceff2 !important;
        color:#7a838e !important;
      }
      .timeline-track-row.layer-locked .wick-layer-delete-button{
        opacity:.25 !important;
        pointer-events:none !important;
      }
      .timeline-track-row.layer-locked .timeline-track{
        opacity:.72;
      }
      .timeline-lock-bulk-controls{
        display:flex;
        gap:5px;
        align-items:center;
        margin:2px 0 5px 0;
        padding-left:0;
      }
      .timeline-lock-bulk-controls button{
        height:22px;
        padding:2px 7px;
        border:1px solid #c7ccd3;
        border-radius:5px;
        background:#fff;
        color:#586575;
        font:600 10px/1 Arial,sans-serif;
        cursor:pointer;
      }
      .timeline-lock-bulk-controls button:hover{
        color:var(--accent,#0e9c86);
        border-color:var(--accent,#0e9c86);
      }
    `;
    document.head.appendChild(style);
  }

  function cleanName(text){
    return String(text||'')
      .replace(/[🔒🔓×]/g,'')
      .replace(/\s+/g,' ')
      .trim()
      .slice(0,120);
  }

  function rowKind(row){
    if(row.classList.contains('wick-drawing-layer')) return 'wick';
    if(row.classList.contains('fx-timeline-layer')) return 'fx';
    if(row.dataset.timelineKind === 'legacy-object-row') return 'object';
    if(row.classList.contains('native-clip-part-row')) return 'clip-part';
    return 'row';
  }

  function rowKey(row,index){
    if(row.dataset.layerLockKey) return row.dataset.layerLockKey;
    const kind=rowKind(row);
    let stable='';
    if(row.dataset.timelineKey) stable=String(row.dataset.timelineKey);
    else if(row.dataset.nativeClipPartKey) stable=String(row.dataset.nativeClipPartKey);
    else if(row.dataset.demBonesRigId || row.dataset.demBonesBoneId){
      stable=String(row.dataset.demBonesRigId||'')+':'+String(row.dataset.demBonesBoneId||'');
    }else{
      const name=row.querySelector('.timeline-track-name');
      stable=cleanName(name ? name.textContent : '') || String(index);
    }
    const key=kind+':'+stable;
    row.dataset.layerLockKey=key;
    return key;
  }

  function eligibleRows(){
    const tracks=document.getElementById('timeline-tracks');
    if(!tracks) return [];
    return Array.from(tracks.querySelectorAll('.timeline-track-row')).filter(row=>{
      if(row.classList.contains('dembones-bone-timeline-row')) return false;
      if(row.classList.contains('native-clip-part-row')) return false;
      return row.classList.contains('wick-drawing-layer') ||
        row.classList.contains('fx-timeline-layer') ||
        row.dataset.timelineKind === 'legacy-object-row';
    });
  }

  function setButtonState(button,locked){
    button.classList.toggle('locked',locked);
    button.textContent=locked?'🔒':'🔓';
    button.title=locked?'Unlock this layer':'Lock this layer';
    button.setAttribute('aria-label',button.title);
  }

  function setRowLocked(row,locked){
    const key=row.dataset.layerLockKey;
    if(!key) return;
    writeLocked(key,locked);
    row.classList.toggle('layer-locked',locked);
    const button=row.querySelector(LOCK_SELECTOR);
    if(button) setButtonState(button,locked);
    if(locked && isRowActive(row)) restoreUnlockedSelection(row);
  }

  function insertLockButton(row,index){
    const name=row.querySelector('.timeline-track-name');
    if(!name) return;
    const key=rowKey(row,index);
    const locked=readLocked(key);
    row.classList.toggle('layer-locked',locked);

    let button=name.querySelector(LOCK_SELECTOR);
    if(!button){
      button=document.createElement('button');
      button.type='button';
      button.className='timeline-layer-lock-button';
      const del=name.querySelector('.wick-layer-delete-button');
      if(del) del.insertAdjacentElement('afterend',button);
      else name.insertBefore(button,name.firstChild);
    }
    setButtonState(button,locked);
    button.onclick=event=>{
      event.preventDefault();
      event.stopImmediatePropagation();
      event.stopPropagation();
      setRowLocked(row,!row.classList.contains('layer-locked'));
    };
  }

  function decorateRows(){
    if(decorating) return;
    decorating=true;
    try{
      eligibleRows().forEach((row,index)=>insertLockButton(row,index));
      updateLastUnlockedKey();
      addBulkControls();
    }finally{
      decorating=false;
    }
  }

  function isRowActive(row){
    const name=row.querySelector('.timeline-track-name');
    return !!(
      row.classList.contains('active') ||
      (name && name.classList.contains('active-layer'))
    );
  }

  function currentActiveRow(){
    const rows=eligibleRows();
    return rows.find(isRowActive) || null;
  }

  function updateLastUnlockedKey(){
    const active=currentActiveRow();
    if(active && !active.classList.contains('layer-locked')){
      lastUnlockedKey=active.dataset.layerLockKey || null;
    }
  }

  function selectableTarget(row){
    const name=row.querySelector('.timeline-track-name');
    if(!name) return row;
    return name.querySelector('.wick-layer-name-text') || name;
  }

  function clickRow(row){
    if(!row || row.classList.contains('layer-locked')) return false;
    const target=selectableTarget(row);
    if(!target) return false;
    restoringSelection=true;
    try{
      target.dispatchEvent(new MouseEvent('click',{
        bubbles:true,
        cancelable:true,
        view:window,
        button:0
      }));
      lastUnlockedKey=row.dataset.layerLockKey || lastUnlockedKey;
      return true;
    }finally{
      setTimeout(()=>{restoringSelection=false;},0);
    }
  }

  function restoreUnlockedSelection(excludeRow){
    if(restoringSelection) return;
    const rows=eligibleRows();
    let target=null;
    if(lastUnlockedKey){
      target=rows.find(row=>row!==excludeRow && row.dataset.layerLockKey===lastUnlockedKey && !row.classList.contains('layer-locked')) || null;
    }
    if(!target){
      target=rows.find(row=>row!==excludeRow && !row.classList.contains('layer-locked')) || null;
    }
    if(target){
      clickRow(target);
      return;
    }
    try{
      document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',code:'Escape',bubbles:true,cancelable:true}));
      document.dispatchEvent(new KeyboardEvent('keyup',{key:'Escape',code:'Escape',bubbles:true,cancelable:true}));
    }catch(_e){}
  }

  function enforceLockedSelection(){
    if(restoringSelection) return false;
    const active=currentActiveRow();
    if(active && active.classList.contains('layer-locked')){
      restoreUnlockedSelection(active);
      return true;
    }
    updateLastUnlockedKey();
    return false;
  }

  function addBulkControls(){
    if(document.querySelector('.timeline-lock-bulk-controls')) return;
    const wrap=document.getElementById('timeline-wrap');
    const tracks=document.getElementById('timeline-tracks');
    if(!wrap || !tracks) return;

    const controls=document.createElement('div');
    controls.className='timeline-lock-bulk-controls';

    const lockOthers=document.createElement('button');
    lockOthers.type='button';
    lockOthers.textContent='🔒 Lock Others';
    lockOthers.title='Keep the current layer editable and lock the other layers';

    const unlockAll=document.createElement('button');
    unlockAll.type='button';
    unlockAll.textContent='🔓 Unlock All';
    unlockAll.title='Unlock all timeline layers';

    controls.appendChild(lockOthers);
    controls.appendChild(unlockAll);
    tracks.parentNode.insertBefore(controls,tracks);

    lockOthers.addEventListener('click',()=>{
      decorateRows();
      const rows=eligibleRows();
      const active=currentActiveRow() || rows.find(row=>!row.classList.contains('layer-locked')) || null;
      if(!active) return;
      rows.forEach(row=>setRowLocked(row,row!==active));
      lastUnlockedKey=active.dataset.layerLockKey || null;
    });

    unlockAll.addEventListener('click',()=>{
      decorateRows();
      eligibleRows().forEach(row=>setRowLocked(row,false));
      updateLastUnlockedKey();
    });
  }

  function blockLockedTimelineEvents(){
    ['pointerdown','mousedown','click','dblclick','contextmenu'].forEach(type=>{
      document.addEventListener(type,event=>{
        const target=event.target;
        if(!target || !target.closest) return;
        if(target.closest(LOCK_SELECTOR)) return;
        const row=target.closest('#timeline-tracks .timeline-track-row.layer-locked');
        if(!row) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        event.stopPropagation();
      },true);
    });
  }

  function installStageGuard(){
    const overlay=document.getElementById('edit-overlay');
    if(!overlay) return;

    const afterStageInput=event=>{
      if(restoringSelection) return;
      const run=()=>{
        const blocked=enforceLockedSelection();
        if(blocked){
          stageGestureBlocked=true;
          try{
            overlay.dispatchEvent(new PointerEvent('pointercancel',{
              bubbles:true,
              cancelable:false,
              pointerId:event.pointerId||1,
              pointerType:event.pointerType||'mouse'
            }));
          }catch(_e){}
        }
      };
      queueMicrotask(run);
      setTimeout(run,0);
    };

    overlay.addEventListener('pointerdown',afterStageInput,false);
    overlay.addEventListener('mousedown',afterStageInput,false);
    overlay.addEventListener('click',afterStageInput,false);

    document.addEventListener('pointermove',event=>{
      if(!stageGestureBlocked) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      event.stopPropagation();
    },true);

    const endGesture=()=>{ stageGestureBlocked=false; enforceLockedSelection(); };
    document.addEventListener('pointerup',endGesture,true);
    document.addEventListener('mouseup',endGesture,true);
    document.addEventListener('pointercancel',endGesture,true);
  }

  function installObserver(){
    const tracks=document.getElementById('timeline-tracks');
    if(!tracks) return;
    let scheduled=false;
    const observer=new MutationObserver(()=>{
      if(decorating || scheduled) return;
      scheduled=true;
      requestAnimationFrame(()=>{
        scheduled=false;
        decorateRows();
        enforceLockedSelection();
      });
    });
    observer.observe(tracks,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
  }

  function initialise(){
    addStyles();
    decorateRows();
    blockLockedTimelineEvents();
    installStageGuard();
    installObserver();
    setTimeout(decorateRows,100);
    setTimeout(decorateRows,500);
    console.info('Luke Animate layer locking v3 loaded.');
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',initialise,{once:true});
  else initialise();
})();
