/* Luke Animate selection behaviour v1.1 */
(function(){
  'use strict';

  if(window.__lukeAnimateSelectionBehaviorV11) return;
  window.__lukeAnimateSelectionBehaviorV11 = true;

  const API = window.LukeAnimate;
  const overlay = document.getElementById('edit-overlay');
  const stageWrap = document.getElementById('stage-wrap');
  if(!API || !overlay) return;

  let forcingClear = false;
  let emptyStageClickPending = false;
  let emptyStageStartX = 0;
  let emptyStageStartY = 0;
  let emptyStageAdditive = false;

  function currentSelection(){
    try{
      return typeof API.getSelectedDrawObjects === 'function'
        ? (API.getSelectedDrawObjects() || []).filter(Boolean)
        : [];
    }catch(_e){
      return [];
    }
  }

  function allDrawObjects(){
    try{
      return typeof API.getDrawObjects === 'function'
        ? (API.getDrawObjects() || []).filter(Boolean)
        : [];
    }catch(_e){
      return [];
    }
  }

  function refresh(){
    try{ if(typeof API.refreshUI === 'function') API.refreshUI(); }catch(_e){}
  }

  function forceClearSelection(){
    if(forcingClear) return false;
    if(!currentSelection().length){
      refresh();
      return true;
    }

    forcingClear = true;
    const objects = allDrawObjects();
    const saved = objects.map(obj=>({
      obj,
      hadEnabled:Object.prototype.hasOwnProperty.call(obj,'enabled'),
      enabled:obj.enabled
    }));

    try{
      /*
        Luke Animate already clears selection on a native empty-stage click.
        Temporarily make every drawing object non-hittable, then send that
        exact native gesture through the editor. The objects are restored
        synchronously before the browser can paint a frame.
      */
      saved.forEach(entry=>{ entry.obj.enabled = false; });

      const rect = overlay.getBoundingClientRect();
      const clientX = rect.left + Math.max(2, Math.min(rect.width - 2, 8));
      const clientY = rect.top + Math.max(2, Math.min(rect.height - 2, 8));

      overlay.dispatchEvent(new MouseEvent('mousedown',{
        bubbles:true,
        cancelable:true,
        view:window,
        clientX,
        clientY,
        button:0,
        buttons:1
      }));

      window.dispatchEvent(new MouseEvent('mouseup',{
        bubbles:true,
        cancelable:true,
        view:window,
        clientX,
        clientY,
        button:0,
        buttons:0
      }));
    }finally{
      saved.forEach(entry=>{
        if(entry.hadEnabled) entry.obj.enabled = entry.enabled;
        else delete entry.obj.enabled;
      });
      forcingClear = false;
      refresh();
    }

    return currentSelection().length === 0;
  }

  window.LukeAnimateSelectionBehavior = {
    clearSelection: forceClearSelection
  };

  /*
    A lock button currently toggles on pointer-down. Watch that gesture in the
    capture phase, then clear selection after the lock handler has changed the
    row to its locked state. Unlocking does not alter selection.
  */
  document.addEventListener('pointerdown',event=>{
    if(forcingClear) return;
    const target=event.target;
    if(!target || !target.closest) return;
    const button=target.closest('.timeline-layer-lock-button');
    if(!button) return;

    const wasLocked=button.classList.contains('locked');
    if(wasLocked) return;

    setTimeout(()=>{
      if(button.classList.contains('locked')){
        forceClearSelection();
      }
    },0);
  },true);

  /*
    The editor creates .stage-selection-marquee synchronously only when the
    mousedown landed on empty stage space. Record that fact after Luke Animate's
    own mousedown handler has run. A plain empty click then forces deselection;
    a real marquee drag keeps its normal selection behaviour.
  */
  overlay.addEventListener('mousedown', event=>{
    if(forcingClear || event.button !== 0) return;
    emptyStageClickPending = !!overlay.querySelector('.stage-selection-marquee');
    emptyStageStartX = event.clientX;
    emptyStageStartY = event.clientY;
    emptyStageAdditive = !!(event.shiftKey || event.ctrlKey || event.metaKey);
  }, false);

  window.addEventListener('mouseup', event=>{
    if(forcingClear || !emptyStageClickPending) return;
    const distance = Math.hypot(
      event.clientX - emptyStageStartX,
      event.clientY - emptyStageStartY
    );
    const shouldClear = distance < 5 && !emptyStageAdditive;
    emptyStageClickPending = false;
    if(shouldClear) setTimeout(forceClearSelection,0);
  }, false);

  /* Clicking the checkerboard workspace outside the stage also deselects. */
  if(stageWrap){
    stageWrap.addEventListener('mousedown',event=>{
      if(forcingClear || event.button !== 0) return;
      if(event.target !== stageWrap) return;
      if(event.shiftKey || event.ctrlKey || event.metaKey) return;
      forceClearSelection();
    },false);
  }

  console.info('Luke Animate selection behaviour v1.1 loaded: locking deselects immediately.');
})();
