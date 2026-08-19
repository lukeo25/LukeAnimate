/*
  Luke Animate Layer Locking v1.0
  Loaded by luke-tools-launcher.html after Luke Animate has finished loading.
  Locked layers remain visible, animate normally and remain in exports, but are protected from normal selection/editing.
*/
(function(){
  'use strict';

  if(window.__lukeAnimateLayerLockInstalled) return;
  window.__lukeAnimateLayerLockInstalled = true;

  const STYLE_ID = 'luke-animate-layer-lock-style';

  function addStyles(){
    if(document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #layer-list .layer-row.layer-locked{
        background:#eceff2 !important;
        border-color:#c6ccd4 !important;
      }
      #layer-list .layer-row.layer-locked .layer-name{
        color:var(--text-dim,#6b7280) !important;
      }
      #layer-list .layer-lock-btn{
        flex:0 0 25px;
        width:25px;
        min-width:25px;
        height:24px;
        padding:0;
        border:1px solid #c7ccd3;
        border-radius:5px;
        background:#fff;
        color:#65707d;
        cursor:pointer;
        line-height:1;
        font-size:14px;
        display:inline-flex;
        align-items:center;
        justify-content:center;
      }
      #layer-list .layer-lock-btn:hover{
        color:var(--accent,#0e9c86);
        border-color:var(--accent,#0e9c86);
      }
      #layer-list .layer-lock-btn.locked{
        color:#9a6508;
        background:#fff4d8;
        border-color:#d4ad55;
      }
      #layer-list .layer-row.layer-locked .layer-stack-btn,
      #layer-list .layer-row.layer-locked .wick-layer-delete-button{
        opacity:.28 !important;
        pointer-events:none !important;
      }
      #btn-lock-others,#btn-unlock-all{
        min-width:0;
      }
    `;
    document.head.appendChild(style);
  }

  function drawArray(){
    try{ return Array.isArray(drawObjects) ? drawObjects : []; }
    catch(_e){ return []; }
  }

  function effectArray(){
    try{ return Array.isArray(layers) ? layers : []; }
    catch(_e){ return []; }
  }

  function drawLocked(index){
    const obj = drawArray()[index];
    return !!(obj && obj.layerLocked === true);
  }

  function effectLocked(index){
    const layer = effectArray()[index];
    return !!(layer && layer.layerLocked === true);
  }

  function armUndo(){
    try{ if(typeof pushUndo === 'function') pushUndo(); }
    catch(_e){}
  }

  function clearLockedSelection(){
    try{
      if(selectedDrawIndices && typeof selectedDrawIndices.forEach === 'function'){
        Array.from(selectedDrawIndices).forEach(index=>{
          if(drawLocked(index)) selectedDrawIndices.delete(index);
        });
      }
    }catch(_e){}

    try{
      if(typeof activeIndex === 'number' && activeIndex >= 0 && effectLocked(activeIndex)){
        const hasDrawSelection = selectedDrawIndices && selectedDrawIndices.size > 0;
        if(!hasDrawSelection) activeIndex = -1;
      }
    }catch(_e){}
  }

  function refreshEditors(){
    clearLockedSelection();
    try{ if(typeof renderLayerList === 'function') renderLayerList(); }catch(_e){}
    try{ if(typeof renderTimeline === 'function') renderTimeline(); }catch(_e){}
    try{ if(typeof renderOverlay === 'function') renderOverlay(); }catch(_e){}
    try{ if(typeof updateInspector === 'function') updateInspector(); }catch(_e){}
    try{ if(typeof renderOffstageObjectProxies === 'function') renderOffstageObjectProxies(); }catch(_e){}
  }

  function createLockButton(locked, toggle){
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'layer-lock-btn' + (locked ? ' locked' : '');
    button.textContent = locked ? '🔒' : '🔓';
    button.title = locked ? 'Unlock layer' : 'Lock layer';
    button.setAttribute('aria-label', button.title);
    button.addEventListener('click', event=>{
      event.preventDefault();
      event.stopPropagation();
      armUndo();
      toggle(!locked);
      refreshEditors();
    });
    return button;
  }

  function effectEntriesForRows(){
    return effectArray()
      .map((layer,idx)=>({layer,idx}))
      .filter(({layer})=>layer && layer.type !== 'raster' && layer.type !== 'video')
      .reverse();
  }

  function objectEntriesForRows(){
    try{
      const isolated = typeof getIsolatedGroupInfo === 'function' ? getIsolatedGroupInfo() : null;
      if(isolated) return [{obj:isolated.child,idx:isolated.rootIndex,isolated:true}];
    }catch(_e){}
    return drawArray().map((obj,idx)=>({obj,idx,isolated:false})).reverse();
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
      row.dataset.layerLockKind = 'effect';
      row.dataset.layerLockIndex = String(entry.idx);
      const old = row.querySelector('.layer-lock-btn');
      if(old) old.remove();
      row.appendChild(createLockButton(locked, value=>{ entry.layer.layerLocked = !!value; }));
    });

    const objectRows = Array.from(list.querySelectorAll('.layer-row.object-layer'));
    const objectEntries = objectEntriesForRows();
    objectRows.forEach((row,pos)=>{
      const entry = objectEntries[pos];
      if(!entry || !entry.obj) return;
      if(typeof entry.obj.layerLocked !== 'boolean') entry.obj.layerLocked = false;
      const locked = entry.obj.layerLocked === true;
      row.classList.toggle('layer-locked', locked);
      row.dataset.layerLockKind = 'draw';
      row.dataset.layerLockIndex = String(entry.idx);
      const old = row.querySelector('.layer-lock-btn');
      if(old) old.remove();
      row.appendChild(createLockButton(locked, value=>{ entry.obj.layerLocked = !!value; }));
    });
  }

  function addBulkButtons(){
    const list = document.getElementById('layer-list');
    if(!list || document.getElementById('btn-lock-others')) return;
    const group = list.closest('.group');
    if(!group) return;
    const existingRows = group.querySelectorAll(':scope > .btn-row');
    const anchor = existingRows.length ? existingRows[existingRows.length - 1] : list;

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
    anchor.insertAdjacentElement('afterend', row);

    lockOthers.addEventListener('click', ()=>{
      const keepDraw = new Set();
      try{
        Array.from(selectedDrawIndices || []).forEach(index=>{
          if(!drawLocked(index)) keepDraw.add(index);
        });
      }catch(_e){}

      let keepEffect = -1;
      try{
        if(keepDraw.size === 0 && typeof activeIndex === 'number' && activeIndex >= 0 && !effectLocked(activeIndex)){
          keepEffect = activeIndex;
        }
      }catch(_e){}

      if(keepDraw.size === 0 && keepEffect < 0){
        try{
          if(typeof warn === 'function') warn('Select the layer or layers you want to keep editable, then choose Lock Others.');
          else alert('Select the layer or layers you want to keep editable, then choose Lock Others.');
        }catch(_e){}
        return;
      }

      armUndo();
      drawArray().forEach((obj,index)=>{ if(obj) obj.layerLocked = !keepDraw.has(index); });
      effectArray().forEach((layer,index)=>{ if(layer) layer.layerLocked = index !== keepEffect; });
      refreshEditors();
    });

    unlockAll.addEventListener('click', ()=>{
      armUndo();
      drawArray().forEach(obj=>{ if(obj) obj.layerLocked = false; });
      effectArray().forEach(layer=>{ if(layer) layer.layerLocked = false; });
      refreshEditors();
    });
  }

  function installSelectionGuards(){
    try{
      if(typeof selectDrawObject === 'function' && !selectDrawObject.__layerLockWrapped){
        const original = selectDrawObject;
        const wrapped = function(index){
          if(drawLocked(index)) return false;
          return original.apply(this, arguments);
        };
        wrapped.__layerLockWrapped = true;
        selectDrawObject = wrapped;
      }
    }catch(_e){}

    try{
      if(typeof selectEffectLayer === 'function' && !selectEffectLayer.__layerLockWrapped){
        const original = selectEffectLayer;
        const wrapped = function(index){
          if(effectLocked(index)) return false;
          return original.apply(this, arguments);
        };
        wrapped.__layerLockWrapped = true;
        selectEffectLayer = wrapped;
      }
    }catch(_e){}

    try{
      if(typeof renderLayerList === 'function' && !renderLayerList.__layerLockWrapped){
        const original = renderLayerList;
        const wrapped = function(){
          const result = original.apply(this, arguments);
          decorateLayerRows();
          addBulkButtons();
          return result;
        };
        wrapped.__layerLockWrapped = true;
        renderLayerList = wrapped;
      }
    }catch(_e){}

    try{
      if(typeof LukeAnimate !== 'undefined' && LukeAnimate && typeof LukeAnimate.getSelectedDrawObjects === 'function' && !LukeAnimate.getSelectedDrawObjects.__layerLockWrapped){
        const original = LukeAnimate.getSelectedDrawObjects.bind(LukeAnimate);
        const wrapped = function(){
          return (original() || []).filter(obj=>obj && obj.layerLocked !== true);
        };
        wrapped.__layerLockWrapped = true;
        LukeAnimate.getSelectedDrawObjects = wrapped;
      }
    }catch(_e){}
  }

  function blockLockedLayerRowEvents(){
    ['pointerdown','mousedown','click','dblclick','contextmenu'].forEach(type=>{
      document.addEventListener(type,event=>{
        const target = event.target;
        if(!target || !target.closest) return;
        const row = target.closest('#layer-list .layer-row.layer-locked');
        if(!row || target.closest('.layer-lock-btn')) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        event.stopPropagation();
      }, true);
    });
  }

  function guardStageSelections(){
    const overlay = document.getElementById('edit-overlay');
    if(!overlay) return;
    ['pointerdown','mousedown','pointerup','mouseup','click'].forEach(type=>{
      overlay.addEventListener(type, ()=>{
        clearLockedSelection();
        queueMicrotask(clearLockedSelection);
      }, true);
    });
  }

  function installObserver(){
    const list = document.getElementById('layer-list');
    if(!list) return;
    let pending = false;
    const observer = new MutationObserver(()=>{
      if(pending) return;
      pending = true;
      queueMicrotask(()=>{
        pending = false;
        decorateLayerRows();
        addBulkButtons();
        installSelectionGuards();
        clearLockedSelection();
      });
    });
    observer.observe(list,{childList:true,subtree:false});
  }

  function initialise(){
    addStyles();
    installSelectionGuards();
    decorateLayerRows();
    addBulkButtons();
    blockLockedLayerRowEvents();
    guardStageSelections();
    installObserver();
    clearLockedSelection();
    try{ if(typeof log === 'function') log('Layer locking ready.'); }catch(_e){}
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialise, {once:true});
  else initialise();
})();
