/*
  Luke Animate Layer Locking v5.1
  Individual per-layer locking only.
  Locking now engages immediately on pointer-down, cancels the current edit
  gesture, clears the locked selection and blocks movement without a delay.
*/
(function(){
  'use strict';

  if(window.__lukeAnimateLayerLockV51) return;
  window.__lukeAnimateLayerLockV51 = true;

  const STORAGE_PREFIX = 'LukeAnimate.LayerLock.v5.';
  const OLD_STORAGE_PREFIX = 'LukeAnimate.LayerLock.v4.';
  const STYLE_ID = 'luke-animate-layer-lock-v51-style';
  const LOCK_SELECTOR = '.timeline-layer-lock-button';
  let decorating = false;
  let cancellingGesture = false;
  let wrappersInstalled = false;
  let immediateBlockedLayerKey = null;

  function safeDrawObjects(){
    try{ return Array.isArray(drawObjects) ? drawObjects : []; }
    catch(_e){ return []; }
  }

  function safeDrawingLayers(){
    try{ return Array.isArray(wickDrawingLayers) ? wickDrawingLayers : []; }
    catch(_e){ return []; }
  }

  function safeEffectLayers(){
    try{ return Array.isArray(layers) ? layers : []; }
    catch(_e){ return []; }
  }

  function storageKey(prefix,key){
    return prefix + location.pathname + '::' + key;
  }

  function readStoredLocked(key){
    try{
      const current=localStorage.getItem(storageKey(STORAGE_PREFIX,key));
      if(current==='1') return true;
      const old=localStorage.getItem(storageKey(OLD_STORAGE_PREFIX,key));
      if(old==='1'){
        localStorage.setItem(storageKey(STORAGE_PREFIX,key),'1');
        return true;
      }
    }catch(_e){}
    return false;
  }

  function writeStoredLocked(key,locked){
    try{
      if(locked) localStorage.setItem(storageKey(STORAGE_PREFIX,key),'1');
      else localStorage.removeItem(storageKey(STORAGE_PREFIX,key));
    }catch(_e){}
  }

  function removeOldBulkControls(){
    document.querySelectorAll('.timeline-lock-bulk-controls,#btn-lock-others,#btn-unlock-all').forEach(el=>{
      const row=el.closest && el.closest('.btn-row');
      if(row && row.children.length<=2) row.remove();
      else el.remove();
    });
  }

  function addStyles(){
    if(document.getElementById(STYLE_ID)) return;
    const style=document.createElement('style');
    style.id=STYLE_ID;
    style.textContent=`
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
        touch-action:none !important;
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
    if(row.dataset.timelineKind==='legacy-object-row') return 'object';
    return 'row';
  }

  function rowKey(row,index){
    if(row.dataset.layerLockKey) return row.dataset.layerLockKey;
    const kind=rowKind(row);
    let stable='';
    if(row.dataset.timelineKey) stable=String(row.dataset.timelineKey);
    else{
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
        row.dataset.timelineKind==='legacy-object-row';
    });
  }

  function drawingLayerById(id){
    if(id===undefined || id===null) return null;
    const key=String(id);
    return safeDrawingLayers().find(layer=>layer && String(layer.id)===key) || null;
  }

  function legacyRowObject(row){
    const rows=eligibleRows().filter(item=>item.dataset.timelineKind==='legacy-object-row');
    const index=rows.indexOf(row);
    return index>=0 ? (safeDrawObjects()[index] || null) : null;
  }

  function effectRowLayer(row){
    const rows=eligibleRows().filter(item=>item.classList.contains('fx-timeline-layer'));
    const index=rows.indexOf(row);
    return index>=0 ? (safeEffectLayers()[index] || null) : null;
  }

  function rowModel(row){
    if(!row) return null;
    if(row.classList.contains('wick-drawing-layer') && row.dataset.timelineKey){
      return drawingLayerById(row.dataset.timelineKey);
    }
    if(row.classList.contains('fx-timeline-layer')) return effectRowLayer(row);
    if(row.dataset.timelineKind==='legacy-object-row') return legacyRowObject(row);
    return null;
  }

  function objectLocked(obj){
    if(!obj) return false;
    if(obj.layerLocked===true) return true;
    if(obj.timelineLayerId){
      const layer=drawingLayerById(obj.timelineLayerId);
      if(layer && layer.layerLocked===true) return true;
    }
    return false;
  }

  function setCanonicalLock(row,locked){
    const model=rowModel(row);
    if(model) model.layerLocked=!!locked;

    if(row.classList.contains('wick-drawing-layer') && row.dataset.timelineKey){
      const id=String(row.dataset.timelineKey);
      const layer=drawingLayerById(id);
      if(layer && Array.isArray(layer.frames)){
        layer.frames.forEach(frame=>{
          if(frame && frame.object) frame.object.layerLocked=!!locked;
        });
      }
      safeDrawObjects().forEach(obj=>{
        if(obj && String(obj.timelineLayerId||'')===id) obj.layerLocked=!!locked;
      });
    }else if(row.dataset.timelineKind==='legacy-object-row'){
      const obj=legacyRowObject(row);
      if(obj) obj.layerLocked=!!locked;
    }
  }

  function canonicalRowLocked(row,key){
    const model=rowModel(row);
    if(model && typeof model.layerLocked==='boolean') return model.layerLocked;
    return readStoredLocked(key);
  }

  function setButtonState(button,locked){
    button.classList.toggle('locked',locked);
    button.textContent=locked?'🔒':'🔓';
    button.title=locked?'Unlock this layer':'Lock this layer';
    button.setAttribute('aria-label',button.title);
  }

  function refreshSelectionUI(){
    try{ if(typeof updateSelectedCountUI==='function') updateSelectedCountUI(); }catch(_e){}
    try{ if(typeof updateInspector==='function') updateInspector(); }catch(_e){}
    try{ if(typeof renderTransformHandles==='function') renderTransformHandles(); }catch(_e){}
    try{ if(typeof renderOffstageObjectProxies==='function') renderOffstageObjectProxies(); }catch(_e){}
    try{ if(typeof renderOverlay==='function') renderOverlay(); }catch(_e){}
  }

  function purgeLockedSelection(){
    let changed=false;
    try{
      if(selectedDrawIndices && typeof selectedDrawIndices.forEach==='function'){
        Array.from(selectedDrawIndices).forEach(index=>{
          const obj=safeDrawObjects()[index];
          if(objectLocked(obj)){
            selectedDrawIndices.delete(index);
            changed=true;
          }
        });
      }
    }catch(_e){}

    try{
      if(typeof activeIndex==='number' && activeIndex>=0){
        const layer=safeEffectLayers()[activeIndex];
        if(layer && layer.layerLocked===true){
          activeIndex=-1;
          changed=true;
        }
      }
    }catch(_e){}

    if(changed) refreshSelectionUI();
    return changed;
  }

  function cancelCurrentEditImmediately(){
    cancellingGesture=true;
    purgeLockedSelection();

    const overlay=document.getElementById('edit-overlay');
    if(overlay){
      try{
        overlay.dispatchEvent(new PointerEvent('pointercancel',{
          bubbles:true,
          cancelable:false,
          pointerId:1,
          pointerType:'mouse'
        }));
      }catch(_e){}
    }

    try{
      document.dispatchEvent(new KeyboardEvent('keydown',{
        key:'Escape',code:'Escape',bubbles:true,cancelable:true
      }));
      document.dispatchEvent(new KeyboardEvent('keyup',{
        key:'Escape',code:'Escape',bubbles:true,cancelable:true
      }));
    }catch(_e){}

    document.querySelectorAll(
      '.xform-handle,.xform-axis-handle,.xform-rotate-handle,.clip-pivot-cross,.shape-point-handle,.bezier-anchor-handle,.bezier-control-handle,.pen-edit-anchor,.pen-edit-control,.pen-edit-bend,.pen-edit-width'
    ).forEach(el=>{
      try{ el.style.pointerEvents='none'; }catch(_e){}
    });

    refreshSelectionUI();
    requestAnimationFrame(()=>{
      purgeLockedSelection();
      refreshSelectionUI();
    });
  }

  function setRowLocked(row,locked){
    const key=row.dataset.layerLockKey;
    if(!key) return;

    if(locked){
      immediateBlockedLayerKey=key;
      cancellingGesture=true;
    }else if(immediateBlockedLayerKey===key){
      immediateBlockedLayerKey=null;
    }

    writeStoredLocked(key,locked);
    setCanonicalLock(row,locked);
    row.classList.toggle('layer-locked',locked);
    const button=row.querySelector(LOCK_SELECTOR);
    if(button) setButtonState(button,locked);

    if(locked) cancelCurrentEditImmediately();
    else{
      cancellingGesture=false;
      refreshSelectionUI();
    }
  }

  function toggleRowFromPointerDown(event,row){
    if(event.button!==undefined && event.button!==0) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    event.stopPropagation();
    setRowLocked(row,!row.classList.contains('layer-locked'));
  }

  function insertLockButton(row,index){
    const name=row.querySelector('.timeline-track-name');
    if(!name) return;
    const key=rowKey(row,index);
    const locked=canonicalRowLocked(row,key);
    setCanonicalLock(row,locked);
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
    button.onpointerdown=event=>toggleRowFromPointerDown(event,row);
    button.onmousedown=event=>{
      event.preventDefault();
      event.stopImmediatePropagation();
      event.stopPropagation();
    };
    button.onclick=event=>{
      event.preventDefault();
      event.stopImmediatePropagation();
      event.stopPropagation();
    };
  }

  function decorateRows(){
    if(decorating) return;
    decorating=true;
    try{
      removeOldBulkControls();
      eligibleRows().forEach((row,index)=>insertLockButton(row,index));
      purgeLockedSelection();
    }finally{
      decorating=false;
    }
  }

  function installCoreSelectionGuards(){
    if(wrappersInstalled) return;
    wrappersInstalled=true;

    try{
      if(typeof selectDrawObject==='function' && !selectDrawObject.__layerLockV51Wrapped){
        const original=selectDrawObject;
        const wrapped=function(index){
          const obj=safeDrawObjects()[index];
          if(objectLocked(obj)){
            purgeLockedSelection();
            return false;
          }
          return original.apply(this,arguments);
        };
        wrapped.__layerLockV51Wrapped=true;
        selectDrawObject=wrapped;
      }
    }catch(_e){}

    try{
      if(typeof selectEffectLayer==='function' && !selectEffectLayer.__layerLockV51Wrapped){
        const original=selectEffectLayer;
        const wrapped=function(index){
          const layer=safeEffectLayers()[index];
          if(layer && layer.layerLocked===true) return false;
          return original.apply(this,arguments);
        };
        wrapped.__layerLockV51Wrapped=true;
        selectEffectLayer=wrapped;
      }
    }catch(_e){}

    try{
      if(typeof LukeAnimate!=='undefined' && LukeAnimate && typeof LukeAnimate.getSelectedDrawObjects==='function' && !LukeAnimate.getSelectedDrawObjects.__layerLockV51Wrapped){
        const original=LukeAnimate.getSelectedDrawObjects.bind(LukeAnimate);
        const wrapped=function(){
          return (original()||[]).filter(obj=>obj && !objectLocked(obj));
        };
        wrapped.__layerLockV51Wrapped=true;
        LukeAnimate.getSelectedDrawObjects=wrapped;
      }
    }catch(_e){}
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

    document.addEventListener('pointerdown',event=>{
      const target=event.target;
      if(!target || !target.closest || target.closest(LOCK_SELECTOR)) return;
      const row=target.closest('#timeline-tracks .timeline-track-row');
      if(row && !row.classList.contains('layer-locked')){
        immediateBlockedLayerKey=null;
        cancellingGesture=false;
      }
    },true);
  }

  function currentActiveLockedRow(){
    return eligibleRows().find(row=>{
      if(!row.classList.contains('layer-locked')) return false;
      const name=row.querySelector('.timeline-track-name');
      return row.classList.contains('active') || !!(name && name.classList.contains('active-layer'));
    }) || null;
  }

  function immediateBlockActive(){
    if(!immediateBlockedLayerKey) return false;
    const row=eligibleRows().find(item=>item.dataset.layerLockKey===immediateBlockedLayerKey);
    return !!(row && row.classList.contains('layer-locked'));
  }

  function editSurfaceTarget(target){
    if(!target || !target.closest) return false;
    return !!target.closest(
      '#edit-overlay,.xform-handle,.xform-axis-handle,.xform-rotate-handle,.clip-pivot-cross,.offstage-object-proxy,.shape-point-handle,.bezier-anchor-handle,.bezier-control-handle,.pen-edit-anchor,.pen-edit-control,.pen-edit-bend,.pen-edit-width'
    );
  }

  function shouldBlockStageEdit(){
    purgeLockedSelection();
    return immediateBlockActive() || !!currentActiveLockedRow();
  }

  function installStageMovementGuard(){
    const blockStart=event=>{
      if(!editSurfaceTarget(event.target)) return;
      if(!shouldBlockStageEdit()) return;
      cancellingGesture=true;
      event.preventDefault();
      event.stopImmediatePropagation();
      event.stopPropagation();
    };

    document.addEventListener('pointerdown',blockStart,true);
    document.addEventListener('mousedown',blockStart,true);

    const afterStart=()=>{
      queueMicrotask(()=>{
        const removed=purgeLockedSelection();
        if(removed) cancellingGesture=true;
      });
      setTimeout(()=>{
        const removed=purgeLockedSelection();
        if(removed) cancellingGesture=true;
      },0);
    };

    const overlay=document.getElementById('edit-overlay');
    if(overlay){
      overlay.addEventListener('pointerdown',afterStart,false);
      overlay.addEventListener('mousedown',afterStart,false);
      overlay.addEventListener('click',afterStart,false);
    }

    document.addEventListener('pointermove',event=>{
      if(!cancellingGesture) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      event.stopPropagation();
    },true);

    document.addEventListener('mousemove',event=>{
      if(!cancellingGesture) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      event.stopPropagation();
    },true);

    const finish=()=>{
      purgeLockedSelection();
      if(!immediateBlockActive() && !currentActiveLockedRow()) cancellingGesture=false;
    };
    document.addEventListener('pointerup',finish,true);
    document.addEventListener('mouseup',finish,true);
    document.addEventListener('pointercancel',finish,true);

    document.addEventListener('keydown',event=>{
      purgeLockedSelection();
      if(!shouldBlockStageEdit()) return;
      const blockedKeys=['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Delete','Backspace'];
      if(blockedKeys.includes(event.key)){
        event.preventDefault();
        event.stopImmediatePropagation();
        event.stopPropagation();
      }
    },true);
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
        installCoreSelectionGuards();
        decorateRows();
      });
    });
    observer.observe(tracks,{
      childList:true,
      subtree:true,
      attributes:true,
      attributeFilter:['class']
    });
  }

  function initialise(){
    addStyles();
    removeOldBulkControls();
    installCoreSelectionGuards();
    decorateRows();
    blockLockedTimelineEvents();
    installStageMovementGuard();
    installObserver();
    setTimeout(()=>{ installCoreSelectionGuards(); decorateRows(); },100);
    setTimeout(()=>{ installCoreSelectionGuards(); decorateRows(); },500);
    console.info('Luke Animate layer locking v5.1 loaded: lock is immediate on pointer-down.');
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',initialise,{once:true});
  else initialise();
})();
