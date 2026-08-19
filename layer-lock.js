/*
  Luke Animate Layer Locking v2.0
  Adds visible lock controls to the actual timeline layer rows and the All Layers panel.
  Locked layers stay visible, animate normally and remain exportable, but normal layer/timeline/stage editing is blocked.
*/
(function(){
  'use strict';

  if(window.__lukeAnimateLayerLockInstalledV2) return;
  window.__lukeAnimateLayerLockInstalledV2 = true;

  const STYLE_ID = 'luke-animate-layer-lock-style-v2';

  function drawArray(){
    try{ return Array.isArray(drawObjects) ? drawObjects : []; }catch(_e){ return []; }
  }

  function effectArray(){
    try{ return Array.isArray(layers) ? layers : []; }catch(_e){ return []; }
  }

  function drawingLayerArray(){
    try{ return Array.isArray(wickDrawingLayers) ? wickDrawingLayers : []; }catch(_e){ return []; }
  }

  function isolatedInfo(){
    try{ return typeof getIsolatedGroupInfo === 'function' ? getIsolatedGroupInfo() : null; }catch(_e){ return null; }
  }

  function drawingLayerById(id){
    if(id === undefined || id === null) return null;
    const key = String(id);
    return drawingLayerArray().find(layer=>layer && String(layer.id) === key) || null;
  }

  function objectLocked(obj, index){
    if(!obj && Number.isInteger(index)) obj = drawArray()[index];
    if(!obj) return false;
    if(obj.layerLocked === true) return true;
    const layer = drawingLayerById(obj.timelineLayerId);
    return !!(layer && layer.layerLocked === true);
  }

  function effectLocked(index){
    const layer = effectArray()[index];
    return !!(layer && layer.layerLocked === true);
  }

  function drawingLayerLocked(id){
    const layer = drawingLayerById(id);
    return !!(layer && layer.layerLocked === true);
  }

  function armUndo(){
    try{ if(typeof pushUndo === 'function') pushUndo(); }catch(_e){}
  }

  function addStyles(){
    if(document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .timeline-layer-lock-button,
      #layer-list .layer-lock-btn{
        flex:0 0 16px;
        width:16px;
        min-width:16px;
        height:16px;
        padding:0;
        margin:0;
        border:0;
        border-radius:3px;
        background:transparent;
        color:#65707d;
        cursor:pointer;
        font:400 11px/16px Arial,sans-serif;
        display:inline-flex;
        align-items:center;
        justify-content:center;
        vertical-align:middle;
      }
      .timeline-layer-lock-button:hover,
      .timeline-layer-lock-button:focus-visible,
      #layer-list .layer-lock-btn:hover,
      #layer-list .layer-lock-btn:focus-visible{
        color:var(--accent,#0e9c86);
        background:#e4f7f3;
        outline:none;
      }
      .timeline-layer-lock-button.locked,
      #layer-list .layer-lock-btn.locked{
        color:#9a6508;
        background:#fff0c7;
      }
      .timeline-track-row.layer-locked .timeline-track-name,
      #layer-list .layer-row.layer-locked{
        background:#eceff2 !important;
        color:#7a838e !important;
      }
      .timeline-track-row.layer-locked .wick-layer-delete-button,
      #layer-list .layer-row.layer-locked .wick-layer-delete-button,
      #layer-list .layer-row.layer-locked .layer-stack-btn{
        opacity:.25 !important;
        pointer-events:none !important;
      }
      #btn-lock-others,#btn-unlock-all{min-width:0;}
    `;
    document.head.appendChild(style);
  }

  function setButtonState(button, locked){
    button.classList.toggle('locked', !!locked);
    button.textContent = locked ? '🔒' : '🔓';
    button.title = locked ? 'Unlock layer' : 'Lock layer';
    button.setAttribute('aria-label', button.title);
  }

  function ensureLockButton(container, locked, toggle, className){
    if(!container) return null;
    const selector = className === 'timeline-layer-lock-button' ? '.timeline-layer-lock-button' : '.layer-lock-btn';
    let button = container.querySelector(selector);
    if(!button){
      button = document.createElement('button');
      button.type = 'button';
      button.className = className;
      const deleteButton = container.querySelector('.wick-layer-delete-button');
      if(deleteButton){
        deleteButton.insertAdjacentElement('afterend', button);
      }else{
        container.insertBefore(button, container.firstChild);
      }
    }
    setButtonState(button, locked);
    button.onclick = event=>{
      event.preventDefault();
      event.stopImmediatePropagation();
      event.stopPropagation();
      armUndo();
      toggle(!locked);
      clearLockedSelection();
      refreshEditors();
    };
    return button;
  }

  function effectEntriesForRows(){
    return effectArray()
      .map((layer,idx)=>({layer,idx}))
      .filter(({layer})=>layer && layer.type !== 'raster' && layer.type !== 'video')
      .reverse();
  }

  function objectEntriesForRows(){
    const isolated = isolatedInfo();
    if(isolated) return [{obj:isolated.child,idx:isolated.rootIndex,isolated:true}];
    return drawArray().map((obj,idx)=>({obj,idx,isolated:false})).reverse();
  }

  function timelineObjectEntries(){
    const isolated = isolatedInfo();
    if(isolated) return [{obj:isolated.child,idx:isolated.rootIndex,isolated:true}];
    return drawArray().map((obj,idx)=>({obj,idx,isolated:false}));
  }

  function clearLockedSelection(){
    try{
      if(selectedDrawIndices && typeof selectedDrawIndices.forEach === 'function'){
        Array.from(selectedDrawIndices).forEach(index=>{
          if(objectLocked(drawArray()[index], index)) selectedDrawIndices.delete(index);
        });
      }
    }catch(_e){}

    try{
      if(typeof activeIndex === 'number' && activeIndex >= 0 && effectLocked(activeIndex)){
        activeIndex = -1;
      }
    }catch(_e){}

    try{
      if(wickActiveDrawingLayerId && drawingLayerLocked(wickActiveDrawingLayerId)){
        const selected = Array.from(selectedDrawIndices || []);
        const keepId = selected.length ? drawArray()[selected[selected.length - 1]]?.timelineLayerId : null;
        wickActiveDrawingLayerId = keepId && !drawingLayerLocked(keepId) ? keepId : null;
      }
    }catch(_e){}
  }

  function decorateTimelineRows(){
    const tracks = document.getElementById('timeline-tracks');
    if(!tracks) return;

    Array.from(tracks.querySelectorAll('.timeline-track-row.wick-drawing-layer[data-timeline-key]')).forEach(row=>{
      const layer = drawingLayerById(row.dataset.timelineKey);
      if(!layer) return;
      if(typeof layer.layerLocked !== 'boolean') layer.layerLocked = false;
      const locked = layer.layerLocked === true;
      row.classList.toggle('layer-locked', locked);
      const name = row.querySelector('.timeline-track-name');
      ensureLockButton(name, locked, value=>{ layer.layerLocked = !!value; }, 'timeline-layer-lock-button');
    });

    const fxRows = Array.from(tracks.querySelectorAll('.timeline-track-row.fx-timeline-layer'));
    effectArray().forEach((layer,idx)=>{
      const row = fxRows[idx];
      if(!row || !layer) return;
      if(typeof layer.layerLocked !== 'boolean') layer.layerLocked = false;
      const locked = layer.layerLocked === true;
      row.classList.toggle('layer-locked', locked);
      row.dataset.layerLockKind = 'effect';
      row.dataset.layerLockIndex = String(idx);
      const name = row.querySelector('.timeline-track-name');
      ensureLockButton(name, locked, value=>{ layer.layerLocked = !!value; }, 'timeline-layer-lock-button');
    });

    const legacyRows = Array.from(tracks.querySelectorAll('.timeline-track-row[data-timeline-kind="legacy-object-row"]'));
    const entries = timelineObjectEntries();
    legacyRows.forEach((row,pos)=>{
      const entry = entries[pos];
      if(!entry || !entry.obj) return;
      const owner = entry.obj.timelineLayerId ? drawingLayerById(entry.obj.timelineLayerId) : entry.obj;
      if(!owner) return;
      if(typeof owner.layerLocked !== 'boolean') owner.layerLocked = false;
      const locked = owner.layerLocked === true;
      row.classList.toggle('layer-locked', locked);
      row.dataset.layerLockKind = 'draw';
      row.dataset.layerLockIndex = String(entry.idx);
      const name = row.querySelector('.timeline-track-name');
      ensureLockButton(name, locked, value=>{ owner.layerLocked = !!value; }, 'timeline-layer-lock-button');
    });
  }

  function decorateLayerRows(){
    const list = document.getElementById('layer-list');
    if(!list) return;

    const effectRows = Array.from(list.querySelectorAll('.layer-row.effect-layer'));
    const effectEntries = effectEntriesForRows();
    effectRows.forEach((row,pos)=>{
      const entry = effectEntries[pos];
      if(!entry || !entry.layer) return;
      if(typeof entry.layer.layerLocked !== 'boolean') entry.layer.layerLocked = false;
      const locked = entry.layer.layerLocked === true;
      row.classList.toggle('layer-locked', locked);
      const lockContainer = row;
      ensureLockButton(lockContainer, locked, value=>{ entry.layer.layerLocked = !!value; }, 'layer-lock-btn');
    });

    const objectRows = Array.from(list.querySelectorAll('.layer-row.object-layer'));
    const objectEntries = objectEntriesForRows();
    objectRows.forEach((row,pos)=>{
      const entry = objectEntries[pos];
      if(!entry || !entry.obj) return;
      const owner = entry.obj.timelineLayerId ? drawingLayerById(entry.obj.timelineLayerId) : entry.obj;
      if(!owner) return;
      if(typeof owner.layerLocked !== 'boolean') owner.layerLocked = false;
      const locked = owner.layerLocked === true;
      row.classList.toggle('layer-locked', locked);
      ensureLockButton(row, locked, value=>{ owner.layerLocked = !!value; }, 'layer-lock-btn');
    });
  }

  function addBulkButtons(){
    const list = document.getElementById('layer-list');
    if(!list || document.getElementById('btn-lock-others')) return;
    const group = list.closest('.group');
    if(!group) return;

    const row = document.createElement('div');
    row.className = 'btn-row';

    const lockOthers = document.createElement('button');
    lockOthers.type = 'button';
    lockOthers.className = 'btn small';
    lockOthers.id = 'btn-lock-others';
    lockOthers.textContent = 'Lock Others';
    lockOthers.title = 'Lock every layer except the selected layer or layers';

    const unlockAll = document.createElement('button');
    unlockAll.type = 'button';
    unlockAll.className = 'btn small';
    unlockAll.id = 'btn-unlock-all';
    unlockAll.textContent = 'Unlock All';
    unlockAll.title = 'Unlock every layer';

    row.appendChild(lockOthers);
    row.appendChild(unlockAll);
    list.insertAdjacentElement('afterend', row);

    lockOthers.addEventListener('click', ()=>{
      const keepDrawingIds = new Set();
      try{
        Array.from(selectedDrawIndices || []).forEach(index=>{
          const obj = drawArray()[index];
          if(obj && obj.timelineLayerId) keepDrawingIds.add(String(obj.timelineLayerId));
        });
      }catch(_e){}
      try{
        if(wickActiveDrawingLayerId && !drawingLayerLocked(wickActiveDrawingLayerId)){
          keepDrawingIds.add(String(wickActiveDrawingLayerId));
        }
      }catch(_e){}

      let keepEffect = -1;
      try{
        if(keepDrawingIds.size === 0 && typeof activeIndex === 'number' && activeIndex >= 0 && !effectLocked(activeIndex)){
          keepEffect = activeIndex;
        }
      }catch(_e){}

      if(keepDrawingIds.size === 0 && keepEffect < 0){
        try{
          if(typeof warn === 'function') warn('Select the layer or layers you want to keep editable, then choose Lock Others.');
          else alert('Select the layer or layers you want to keep editable, then choose Lock Others.');
        }catch(_e){}
        return;
      }

      armUndo();
      drawingLayerArray().forEach(layer=>{ if(layer) layer.layerLocked = !keepDrawingIds.has(String(layer.id)); });
      effectArray().forEach((layer,index)=>{ if(layer) layer.layerLocked = index !== keepEffect; });
      drawArray().forEach(obj=>{
        if(!obj || obj.timelineLayerId) return;
        obj.layerLocked = keepDrawingIds.size > 0;
      });
      clearLockedSelection();
      refreshEditors();
    });

    unlockAll.addEventListener('click', ()=>{
      armUndo();
      drawingLayerArray().forEach(layer=>{ if(layer) layer.layerLocked = false; });
      effectArray().forEach(layer=>{ if(layer) layer.layerLocked = false; });
      drawArray().forEach(obj=>{ if(obj) obj.layerLocked = false; });
      refreshEditors();
    });
  }

  function refreshEditors(){
    try{ if(typeof renderLayerList === 'function') renderLayerList(); }catch(_e){}
    try{ if(typeof renderTimeline === 'function') renderTimeline(); }catch(_e){}
    try{ if(typeof renderOverlay === 'function') renderOverlay(); }catch(_e){}
    try{ if(typeof renderTransformHandles === 'function') renderTransformHandles(); }catch(_e){}
    try{ if(typeof updateInspector === 'function') updateInspector(); }catch(_e){}
    try{ if(typeof renderOffstageObjectProxies === 'function') renderOffstageObjectProxies(); }catch(_e){}
    decorateLayerRows();
    decorateTimelineRows();
    addBulkButtons();
  }

  function installSelectionGuards(){
    try{
      if(typeof selectDrawObject === 'function' && !selectDrawObject.__layerLockV2Wrapped){
        const original = selectDrawObject;
        const wrapped = function(index){
          const obj = drawArray()[index];
          if(objectLocked(obj,index)) return false;
          return original.apply(this, arguments);
        };
        wrapped.__layerLockV2Wrapped = true;
        selectDrawObject = wrapped;
      }
    }catch(_e){}

    try{
      if(typeof selectEffectLayer === 'function' && !selectEffectLayer.__layerLockV2Wrapped){
        const original = selectEffectLayer;
        const wrapped = function(index){
          if(effectLocked(index)) return false;
          return original.apply(this, arguments);
        };
        wrapped.__layerLockV2Wrapped = true;
        selectEffectLayer = wrapped;
      }
    }catch(_e){}

    try{
      if(typeof renderLayerList === 'function' && !renderLayerList.__layerLockV2Wrapped){
        const original = renderLayerList;
        const wrapped = function(){
          const result = original.apply(this, arguments);
          decorateLayerRows();
          addBulkButtons();
          return result;
        };
        wrapped.__layerLockV2Wrapped = true;
        renderLayerList = wrapped;
      }
    }catch(_e){}

    try{
      if(typeof renderTimeline === 'function' && !renderTimeline.__layerLockV2Wrapped){
        const original = renderTimeline;
        const wrapped = function(){
          const result = original.apply(this, arguments);
          decorateTimelineRows();
          return result;
        };
        wrapped.__layerLockV2Wrapped = true;
        renderTimeline = wrapped;
      }
    }catch(_e){}

    try{
      if(typeof hitTestPenStroke === 'function' && !hitTestPenStroke.__layerLockV2Wrapped){
        const original = hitTestPenStroke;
        const wrapped = function(){
          const hit = original.apply(this, arguments);
          return hit && objectLocked(hit.obj, hit.index) ? null : hit;
        };
        wrapped.__layerLockV2Wrapped = true;
        hitTestPenStroke = wrapped;
      }
    }catch(_e){}

    try{
      if(typeof LukeAnimate !== 'undefined' && LukeAnimate && typeof LukeAnimate.getSelectedDrawObjects === 'function' && !LukeAnimate.getSelectedDrawObjects.__layerLockV2Wrapped){
        const original = LukeAnimate.getSelectedDrawObjects.bind(LukeAnimate);
        const wrapped = function(){
          return (original() || []).filter(obj=>obj && !objectLocked(obj));
        };
        wrapped.__layerLockV2Wrapped = true;
        LukeAnimate.getSelectedDrawObjects = wrapped;
      }
    }catch(_e){}
  }

  function blockLockedRowEvents(){
    ['pointerdown','mousedown','click','dblclick','contextmenu'].forEach(type=>{
      document.addEventListener(type,event=>{
        const target = event.target;
        if(!target || !target.closest) return;
        if(target.closest('.timeline-layer-lock-button,.layer-lock-btn')) return;
        const timelineRow = target.closest('#timeline-tracks .timeline-track-row.layer-locked');
        const panelRow = target.closest('#layer-list .layer-row.layer-locked');
        if(!timelineRow && !panelRow) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        event.stopPropagation();
      }, true);
    });
  }

  function guardStageSelection(){
    const overlay = document.getElementById('edit-overlay');
    if(!overlay) return;
    const clean = ()=>{
      clearLockedSelection();
      try{ if(typeof renderTransformHandles === 'function') renderTransformHandles(); }catch(_e){}
      try{ if(typeof updateSelectedCountUI === 'function') updateSelectedCountUI(); }catch(_e){}
    };
    ['pointerdown','mousedown','pointerup','mouseup','click'].forEach(type=>{
      overlay.addEventListener(type, ()=>{
        queueMicrotask(clean);
        setTimeout(clean,0);
      }, false);
    });
  }

  function installObservers(){
    [document.getElementById('layer-list'), document.getElementById('timeline-tracks')].filter(Boolean).forEach(target=>{
      let pending = false;
      const observer = new MutationObserver(()=>{
        if(pending) return;
        pending = true;
        queueMicrotask(()=>{
          pending = false;
          decorateLayerRows();
          decorateTimelineRows();
          addBulkButtons();
          installSelectionGuards();
          clearLockedSelection();
        });
      });
      observer.observe(target,{childList:true,subtree:true});
    });
  }

  function initialise(){
    addStyles();
    installSelectionGuards();
    decorateLayerRows();
    decorateTimelineRows();
    addBulkButtons();
    blockLockedRowEvents();
    guardStageSelection();
    installObservers();
    clearLockedSelection();
    try{ if(typeof log === 'function') log('Layer locking ready on timeline and layer panel.'); }catch(_e){}
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialise, {once:true});
  else initialise();
})();
