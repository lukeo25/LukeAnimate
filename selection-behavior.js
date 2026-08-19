/* Luke Animate selection behaviour v1.2 */
(function(){
  'use strict';

  if(window.__lukeAnimateSelectionBehaviorV12) return;
  window.__lukeAnimateSelectionBehaviorV12 = true;

  const API = window.LukeAnimate;
  const overlay = document.getElementById('edit-overlay');
  const stageWrap = document.getElementById('stage-wrap');
  if(!API || !overlay) return;

  let emptyStageClickPending = false;
  let emptyStageStartX = 0;
  let emptyStageStartY = 0;
  let emptyStageAdditive = false;

  function refreshSelectionUI(){
    try{ if(typeof updateSelectedCountUI === 'function') updateSelectedCountUI(); }catch(_e){}
    try{ if(typeof updateInspector === 'function') updateInspector(); }catch(_e){}
    try{ if(typeof updateMediaPanelSelection === 'function') updateMediaPanelSelection(); }catch(_e){}
    try{ if(typeof renderLayerList === 'function') renderLayerList(); }catch(_e){}
    try{ if(typeof renderTransformHandles === 'function') renderTransformHandles(); }catch(_e){}
    try{ if(typeof renderPoints === 'function') renderPoints(); }catch(_e){}
    try{ if(typeof renderOffstageObjectProxies === 'function') renderOffstageObjectProxies(); }catch(_e){}
    try{ if(typeof renderTimeline === 'function') renderTimeline(); }catch(_e){}
    try{ if(typeof API.refreshUI === 'function') API.refreshUI(); }catch(_e){}
  }

  function clearNativeSelection(){
    let cleared = false;

    try{
      if(typeof selectedDrawIndices !== 'undefined' &&
         selectedDrawIndices &&
         typeof selectedDrawIndices.clear === 'function'){
        selectedDrawIndices.clear();
        cleared = true;
      }
    }catch(error){
      console.error('Luke Animate direct selection clear failed:', error);
    }

    /*
      If a nested Group child is being isolated, leave the isolation session
      itself intact. Only clear the visible object selection requested here.
    */
    refreshSelectionUI();
    return cleared;
  }

  window.LukeAnimateSelectionBehavior = {
    clearSelection: clearNativeSelection
  };

  /*
    Locking a layer must deselect immediately. The lock toggles on pointer-down,
    so inspect the resulting button state after that handler has completed.
  */
  document.addEventListener('pointerdown', event=>{
    const target = event.target;
    if(!target || !target.closest) return;
    const button = target.closest('.timeline-layer-lock-button');
    if(!button) return;

    const wasLocked = button.classList.contains('locked');
    if(wasLocked) return;

    queueMicrotask(()=>{
      if(button.classList.contains('locked')) clearNativeSelection();
    });
    setTimeout(()=>{
      if(button.classList.contains('locked')) clearNativeSelection();
    },0);
  }, true);

  /*
    Luke Animate creates a temporary marquee when a mousedown begins on empty
    stage space. A plain click there means deselect. A drag keeps the editor's
    normal marquee-selection behaviour. Shift/Ctrl/Cmd keeps additive selection.
  */
  overlay.addEventListener('mousedown', event=>{
    if(event.button !== 0) return;
    emptyStageClickPending = !!overlay.querySelector('.stage-selection-marquee');
    emptyStageStartX = event.clientX;
    emptyStageStartY = event.clientY;
    emptyStageAdditive = !!(event.shiftKey || event.ctrlKey || event.metaKey);
  }, false);

  window.addEventListener('mouseup', event=>{
    if(!emptyStageClickPending) return;

    const distance = Math.hypot(
      event.clientX - emptyStageStartX,
      event.clientY - emptyStageStartY
    );

    const shouldClear = distance < 5 && !emptyStageAdditive;
    emptyStageClickPending = false;

    if(shouldClear) clearNativeSelection();
  }, false);

  /* Clicking the checkerboard workspace outside the stage also deselects. */
  if(stageWrap){
    stageWrap.addEventListener('mousedown', event=>{
      if(event.button !== 0) return;
      if(event.target !== stageWrap) return;
      if(event.shiftKey || event.ctrlKey || event.metaKey) return;
      clearNativeSelection();
    }, false);
  }

  console.info('Luke Animate selection behaviour v1.2 loaded: native selection clears directly.');
})();
