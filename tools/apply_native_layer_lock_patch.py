from pathlib import Path

path = Path('index.html')
text = path.read_text(encoding='utf-8')

MARKER = 'native per-layer locking v186'
if MARKER in text:
    print('Native layer locking already applied.')
    raise SystemExit(0)

# Persist effect-layer lock state in the existing undo/project snapshot.
old = """      layers: layers.map(l=>({
        id: l.id, type: l.type, enabled: l.enabled,
        p: JSON.parse(JSON.stringify(l.p))
      }))"""
new = """      layers: layers.map(l=>({
        id: l.id, type: l.type, enabled: l.enabled,
        layerLocked: !!l.layerLocked,
        p: JSON.parse(JSON.stringify(l.p))
      }))"""
if old not in text:
    raise SystemExit('Effect snapshot anchor not found')
text = text.replace(old, new, 1)

old = """      layers.push({ id:l.id, type:l.type, enabled:l.enabled, p: JSON.parse(JSON.stringify(l.p)), state:{} });"""
new = """      layers.push({ id:l.id, type:l.type, enabled:l.enabled, layerLocked:!!l.layerLocked, p: JSON.parse(JSON.stringify(l.p)), state:{} });"""
if old not in text:
    raise SystemExit('Effect restore anchor not found')
text = text.replace(old, new, 1)

# Locked objects must be skipped by direct stage hit testing so objects behind them remain selectable.
old = """    for(let i=drawObjects.length-1; i>=0; i--){
      const obj = ensureDrawObjectMetadata(drawObjects[i]);
      if(obj.enabled === false) continue;
      const b = getEffectiveBounds(obj);"""
new = """    for(let i=drawObjects.length-1; i>=0; i--){
      const obj = ensureDrawObjectMetadata(drawObjects[i]);
      if(obj.enabled === false || nativeObjectLayerLocked(obj)) continue;
      const b = getEffectiveBounds(obj);"""
if old not in text:
    raise SystemExit('Stage object hit-test anchor not found')
text = text.replace(old, new, 1)

# Marquee selection ignores locked objects.
old = """        if(object.enabled===false){
          continue;
        }

        if(
          boundsIntersectRect("""
new = """        if(object.enabled===false || nativeObjectLayerLocked(object)){
          continue;
        }

        if(
          boundsIntersectRect("""
if old not in text:
    raise SystemExit('Marquee selection anchor not found')
text = text.replace(old, new, 1)

# Double-click text editing ignores locked text.
old = """      const obj = ensureDrawObjectMetadata(drawObjects[i]);
      if(obj.type !== 'text' || obj.enabled === false) continue;
      if(pointInBounds(clickPos.x, clickPos.y, getEffectiveBounds(obj), 6)){"""
new = """      const obj = ensureDrawObjectMetadata(drawObjects[i]);
      if(obj.type !== 'text' || obj.enabled === false || nativeObjectLayerLocked(obj)) continue;
      if(pointInBounds(clickPos.x, clickPos.y, getEffectiveBounds(obj), 6)){"""
if old not in text:
    raise SystemExit('Text double-click anchor not found')
text = text.replace(old, new, 1)

# Group child isolation ignores locked groups.
old = """      const candidate=drawObjects[i];
      if(!candidate||candidate.type!=='group'||candidate.enabled===false) continue;"""
new = """      const candidate=drawObjects[i];
      if(!candidate||candidate.type!=='group'||candidate.enabled===false||nativeObjectLayerLocked(candidate)) continue;"""
if old not in text:
    raise SystemExit('Group double-click anchor not found')
text = text.replace(old, new, 1)

# Clip double-click editing ignores locked clip instances.
old = """    for(let i=drawObjects.length-1;i>=0;i--){
      const obj = drawObjects[i];
      if(obj.type !== 'clipinstance') continue;
      const b = getEffectiveBounds(obj);"""
new = """    for(let i=drawObjects.length-1;i>=0;i--){
      const obj = drawObjects[i];
      if(obj.type !== 'clipinstance' || nativeObjectLayerLocked(obj)) continue;
      const b = getEffectiveBounds(obj);"""
if old not in text:
    raise SystemExit('Clip double-click anchor not found')
text = text.replace(old, new, 1)

# Bezier stage selection ignores locked vectors.
old = """          if(!candidate || candidate.enabled===false || !shapeCanEditPoints(candidate)) continue;"""
new = """          if(!candidate || candidate.enabled===false || nativeObjectLayerLocked(candidate) || !shapeCanEditPoints(candidate)) continue;"""
if old not in text:
    raise SystemExit('Bezier hit-test anchor not found')
text = text.replace(old, new, 1)

# Off-stage proxies do not expose locked objects for editing.
old = """    drawObjects.forEach((rawObject,index)=>{
      if(!rawObject || rawObject.enabled===false) return;
      const object=ensureDrawObjectMetadata(rawObject);"""
new = """    drawObjects.forEach((rawObject,index)=>{
      if(!rawObject || rawObject.enabled===false || nativeObjectLayerLocked(rawObject)) return;
      const object=ensureDrawObjectMetadata(rawObject);"""
if old not in text:
    raise SystemExit('Off-stage proxy anchor not found')
text = text.replace(old, new, 1)

# Add compact native lock styling beside the existing Wick timeline styles.
style_anchor = """  /* ---------- v125 Wick-style drawing layers and independent frames ---------- */"""
style = """  /* ---------- native per-layer locking v186 ---------- */
  .native-layer-lock-button{
    flex:0 0 20px;
    width:20px;
    min-width:20px;
    height:20px;
    padding:0;
    border:0;
    border-radius:4px;
    background:transparent;
    color:#667281;
    display:inline-flex;
    align-items:center;
    justify-content:center;
    font:400 13px/20px Arial,sans-serif;
    cursor:pointer;
  }
  .native-layer-lock-button:hover,
  .native-layer-lock-button:focus-visible{
    background:#e3f7f3;
    color:var(--accent);
    outline:none;
  }
  .native-layer-lock-button.locked{
    background:#fff0c7;
    color:#9a6508;
  }
  .layer-row.native-layer-locked{
    background:rgba(103,114,129,.08);
  }
  .layer-row.native-layer-locked .layer-name,
  .timeline-track-row.native-layer-locked .timeline-track-name{
    color:#7a838e;
  }
  .timeline-track-row.native-layer-locked .timeline-track{
    opacity:.62;
  }
  .timeline-track-row.native-layer-locked .wick-layer-delete-button,
  .timeline-track-row.native-layer-locked .timeline-key-dot,
  .timeline-track-row.native-layer-locked .wick-layer-frame,
  .timeline-track-row.native-layer-locked .timeline-bar{
    cursor:default !important;
  }

""" + style_anchor
if style_anchor not in text:
    raise SystemExit('Lock CSS anchor not found')
text = text.replace(style_anchor, style, 1)

# Native lock module is installed after all Wick/Clip wrappers have been defined,
# immediately before normal app initialisation. This avoids document-wide event hooks.
init_anchor = """  // ---------------- init ----------------"""
module = r'''  // ---------------- native per-layer locking v186 ----------------
  function nativeDrawingLayerForObject(object){
    if(!object || !object.timelineLayerId || typeof wickLayerById!=='function') return null;
    return wickLayerById(object.timelineLayerId) || null;
  }

  function nativeObjectLayerLocked(object){
    if(!object) return false;
    if(object.layerLocked===true) return true;
    const drawingLayer=nativeDrawingLayerForObject(object);
    return !!(drawingLayer && drawingLayer.layerLocked===true);
  }

  function nativeEffectLayerLocked(layer){
    return !!(layer && layer.layerLocked===true);
  }

  function nativeSyncDrawingLayerLock(layer,locked){
    if(!layer) return;
    layer.layerLocked=!!locked;
    (layer.frames||[]).forEach(frame=>{
      if(frame && frame.object) frame.object.layerLocked=!!locked;
    });
    (drawObjects||[]).forEach(object=>{
      if(object && String(object.timelineLayerId||'')===String(layer.id)){
        object.layerLocked=!!locked;
      }
    });
  }

  function nativePurgeLockedSelection(){
    let changed=false;
    Array.from(selectedDrawIndices||[]).forEach(index=>{
      const object=drawObjects[index];
      if(nativeObjectLayerLocked(object)){
        selectedDrawIndices.delete(index);
        changed=true;
      }
    });

    const isolated=getIsolatedGroupInfo();
    if(isolated && nativeObjectLayerLocked(isolated.child)){
      isolatedGroupEdit=null;
      selectedDrawIndices.clear();
      changed=true;
    }

    if(activeIndex>=0 && nativeEffectLayerLocked(layers[activeIndex])){
      activeIndex=-1;
      points=[];
      closed=false;
      rebuildPath();
      changed=true;
    }

    if(wickActiveDrawingLayerId){
      const activeDrawingLayer=wickLayerById(wickActiveDrawingLayerId);
      if(activeDrawingLayer && activeDrawingLayer.layerLocked===true){
        wickActiveDrawingLayerId=null;
        wickSelectedDrawingFrameId=null;
        changed=true;
      }
    }

    if(changed){
      updateSelectedCountUI();
      updateInspector();
      renderTransformHandles();
      renderPoints();
    }
    return changed;
  }

  function nativeToggleObjectLayerLock(object){
    if(!object) return false;
    const drawingLayer=nativeDrawingLayerForObject(object);
    const next=!(drawingLayer ? drawingLayer.layerLocked===true : object.layerLocked===true);
    pushUndo();
    if(drawingLayer) nativeSyncDrawingLayerLock(drawingLayer,next);
    else object.layerLocked=next;
    nativePurgeLockedSelection();
    renderLayerList();
    renderTimeline();
    renderOffstageObjectProxies();
    return next;
  }

  function nativeToggleEffectLayerLock(layer){
    if(!layer) return false;
    pushUndo();
    layer.layerLocked=!layer.layerLocked;
    nativePurgeLockedSelection();
    renderLayerList();
    renderTimeline();
    return !!layer.layerLocked;
  }

  function nativeMakeLockButton(locked,onToggle){
    const button=document.createElement('button');
    button.type='button';
    button.className='native-layer-lock-button'+(locked?' locked':'');
    button.textContent=locked?'🔒':'🔓';
    button.title=locked?'Unlock this layer':'Lock this layer';
    button.setAttribute('aria-label',button.title);
    const stop=event=>{
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    };
    button.addEventListener('pointerdown',stop);
    button.addEventListener('mousedown',stop);
    button.addEventListener('click',event=>{
      stop(event);
      onToggle();
    });
    return button;
  }

  function nativeGuardLockedRow(row,isLocked,allowVisibility){
    if(!row || row.dataset.nativeLockGuard==='1') return;
    row.dataset.nativeLockGuard='1';
    const guard=event=>{
      if(!isLocked()) return;
      const target=event.target;
      if(target && target.closest && target.closest('.native-layer-lock-button')) return;
      if(allowVisibility && target && target.closest){
        const button=target.closest('.layer-btn');
        if(button && !button.classList.contains('del')) return;
      }
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    };
    ['pointerdown','mousedown','click','dblclick','contextmenu'].forEach(type=>row.addEventListener(type,guard,true));
  }

  function nativeDecorateLayerListLocks(){
    const list=document.getElementById('layer-list');
    if(!list) return;

    const effectEntries=layers.map((layer,idx)=>({layer,idx})).reverse();
    Array.from(list.querySelectorAll('.layer-row.effect-layer')).forEach((row,position)=>{
      const entry=effectEntries[position];
      if(!entry) return;
      const layer=entry.layer;
      const locked=nativeEffectLayerLocked(layer);
      row.classList.toggle('native-layer-locked',locked);
      if(!row.querySelector('.native-layer-lock-button')){
        const button=nativeMakeLockButton(locked,()=>nativeToggleEffectLayerLock(layer));
        const stack=row.querySelector('.layer-stack-controls');
        row.insertBefore(button,stack||row.lastChild);
      }
      nativeGuardLockedRow(row,()=>nativeEffectLayerLocked(layer),true);
    });

    const isolated=getIsolatedGroupInfo();
    const objectEntries=isolated
      ?[{obj:isolated.child,idx:isolated.rootIndex,isolated:true}]
      :drawObjects.map((obj,idx)=>({obj,idx,isolated:false})).reverse();
    Array.from(list.querySelectorAll('.layer-row.object-layer')).forEach((row,position)=>{
      const entry=objectEntries[position];
      if(!entry || !entry.obj) return;
      const object=entry.obj;
      const locked=nativeObjectLayerLocked(object);
      row.classList.toggle('native-layer-locked',locked);
      if(!row.querySelector('.native-layer-lock-button')){
        const button=nativeMakeLockButton(locked,()=>nativeToggleObjectLayerLock(object));
        const stack=row.querySelector('.layer-stack-controls');
        row.insertBefore(button,stack||row.lastChild);
      }
      nativeGuardLockedRow(row,()=>nativeObjectLayerLocked(object),true);
    });
  }

  function nativeDecorateTimelineLocks(){
    const tracks=document.getElementById('timeline-tracks');
    if(!tracks) return;

    const effectRows=Array.from(tracks.querySelectorAll('.timeline-track-row.fx-timeline-layer'));
    effectRows.forEach((row,index)=>{
      const layer=layers[index];
      if(!layer) return;
      const locked=nativeEffectLayerLocked(layer);
      row.classList.toggle('native-layer-locked',locked);
      const name=row.querySelector('.timeline-track-name');
      if(name && !name.querySelector('.native-layer-lock-button')){
        const button=nativeMakeLockButton(locked,()=>nativeToggleEffectLayerLock(layer));
        const deleteButton=name.querySelector('.wick-layer-delete-button');
        if(deleteButton && deleteButton.nextSibling) name.insertBefore(button,deleteButton.nextSibling);
        else name.insertBefore(button,name.firstChild);
      }
      nativeGuardLockedRow(row,()=>nativeEffectLayerLocked(layer),false);
    });

    Array.from(tracks.querySelectorAll('.timeline-track-row.wick-drawing-layer')).forEach(row=>{
      const layer=wickLayerById(row.dataset.timelineKey);
      if(!layer) return;
      const locked=layer.layerLocked===true;
      row.classList.toggle('native-layer-locked',locked);
      const name=row.querySelector('.timeline-track-name');
      if(name && !name.querySelector('.native-layer-lock-button')){
        const button=nativeMakeLockButton(locked,()=>{
          const frame=wickFrameAt(layer,wickCurrentFrameIndex());
          if(frame && frame.object) nativeToggleObjectLayerLock(frame.object);
          else{
            pushUndo();
            nativeSyncDrawingLayerLock(layer,!layer.layerLocked);
            nativePurgeLockedSelection();
            renderLayerList();
            renderTimeline();
          }
        });
        const deleteButton=name.querySelector('.wick-layer-delete-button');
        if(deleteButton && deleteButton.nextSibling) name.insertBefore(button,deleteButton.nextSibling);
        else name.insertBefore(button,name.firstChild);
      }
      nativeGuardLockedRow(row,()=>layer.layerLocked===true,false);
    });
  }

  const nativeLockRenderLayerListBase=renderLayerList;
  renderLayerList=function(){
    const result=nativeLockRenderLayerListBase();
    nativeDecorateLayerListLocks();
    return result;
  };

  const nativeLockRenderTimelineBase=renderTimeline;
  renderTimeline=function(){
    const result=nativeLockRenderTimelineBase();
    nativeDecorateTimelineLocks();
    return result;
  };

  const nativeLockSelectDrawObjectBase=selectDrawObject;
  selectDrawObject=function(index,additive,openOwnerPanel){
    const isolated=getIsolatedGroupInfo();
    const object=isolated&&isolated.rootIndex===index?isolated.child:drawObjects[index];
    if(nativeObjectLayerLocked(object)) return false;
    return nativeLockSelectDrawObjectBase(index,additive,openOwnerPanel);
  };

  const nativeLockSelectEffectLayerBase=selectEffectLayer;
  selectEffectLayer=function(index,openOwnerPanel){
    if(nativeEffectLayerLocked(layers[index])) return false;
    return nativeLockSelectEffectLayerBase(index,openOwnerPanel);
  };

  const nativeLockStartObjectStageDragBase=startObjectStageDrag;
  startObjectStageDrag=function(index,startCanvas){
    const isolated=getIsolatedGroupInfo();
    const object=isolated&&isolated.rootIndex===index?isolated.child:drawObjects[index];
    if(nativeObjectLayerLocked(object)) return false;
    return nativeLockStartObjectStageDragBase(index,startCanvas);
  };

  const nativeLockDeleteDrawObjectBase=deleteDrawObject;
  deleteDrawObject=function(index){
    if(nativeObjectLayerLocked(drawObjects[index])) return false;
    return nativeLockDeleteDrawObjectBase(index);
  };

  const nativeLockDeleteSelectedDrawObjectsBase=deleteSelectedDrawObjects;
  deleteSelectedDrawObjects=function(){
    nativePurgeLockedSelection();
    return nativeLockDeleteSelectedDrawObjectsBase();
  };

  const nativeLockDeleteEffectLayerBase=deleteLayer;
  deleteLayer=function(index){
    if(nativeEffectLayerLocked(layers[index])) return false;
    return nativeLockDeleteEffectLayerBase(index);
  };

  const nativeLockMoveEffectLayerBase=moveEffectLayerInStack;
  moveEffectLayerInStack=function(index,delta){
    if(nativeEffectLayerLocked(layers[index])) return false;
    return nativeLockMoveEffectLayerBase(index,delta);
  };

  const nativeLockDeleteDrawingLayerBase=wickDeleteDrawingLayer;
  wickDeleteDrawingLayer=function(layer){
    if(layer && layer.layerLocked===true) return false;
    return nativeLockDeleteDrawingLayerBase(layer);
  };

  const nativeLockMoveDrawingLayerBase=wickMoveDrawingLayerInStack;
  wickMoveDrawingLayerInStack=function(layerId,delta){
    const layer=wickLayerById(layerId);
    if(layer && layer.layerLocked===true) return false;
    return nativeLockMoveDrawingLayerBase(layerId,delta);
  };

  const nativeLockInsertFrameBase=insertIndependentSceneFrame;
  insertIndependentSceneFrame=function(mode,requestedFrame){
    const selectedIds=typeof wickSelectedLayerIds==='function'?wickSelectedLayerIds():[];
    const layer=selectedIds.length?wickLayerById(selectedIds[selectedIds.length-1]):wickLayerById(wickActiveDrawingLayerId);
    if(layer && layer.layerLocked===true) return false;
    return nativeLockInsertFrameBase(mode,requestedFrame);
  };

  const nativeLockClearFramesBase=wickClearDrawingFrames;
  wickClearDrawingFrames=function(targets,recordHistory){
    const unlocked=(targets||[]).filter(item=>item&&item.layer&&item.layer.layerLocked!==true);
    if(!unlocked.length) return false;
    return nativeLockClearFramesBase(unlocked,recordHistory);
  };

  const nativeLockDeleteFramesBase=wickDeleteDrawingFrames;
  wickDeleteDrawingFrames=function(targets,recordHistory){
    const unlocked=(targets||[]).filter(item=>item&&item.layer&&item.layer.layerLocked!==true);
    if(!unlocked.length) return false;
    return nativeLockDeleteFramesBase(unlocked,recordHistory);
  };

  const nativeLockFrameBarDragBase=wickBeginFrameBarDrag;
  wickBeginFrameBarDrag=function(event,layer){
    if(layer && layer.layerLocked===true){
      event.preventDefault();
      event.stopPropagation();
      return false;
    }
    return nativeLockFrameBarDragBase.apply(this,arguments);
  };

  const nativeLockFrameFadeDragBase=wickBeginFrameFadeDrag;
  wickBeginFrameFadeDrag=function(event,layer){
    if(layer && layer.layerLocked===true){
      event.preventDefault();
      event.stopPropagation();
      return false;
    }
    return nativeLockFrameFadeDragBase.apply(this,arguments);
  };

  const nativeLockAddObjectKeyBase=addObjectKeyAtTime;
  addObjectKeyAtTime=function(object){
    if(nativeObjectLayerLocked(object)) return false;
    return nativeLockAddObjectKeyBase.apply(this,arguments);
  };

  const nativeLockRestoreStateBase=restoreState;
  restoreState=function(snapshot){
    const result=nativeLockRestoreStateBase(snapshot);
    nativePurgeLockedSelection();
    return result;
  };

  if(typeof LukeAnimatePluginAPI==='object' && LukeAnimatePluginAPI){
    const nativeLockApiSelectBase=LukeAnimatePluginAPI.selectDrawObject;
    LukeAnimatePluginAPI.selectDrawObject=function(object){
      if(nativeObjectLayerLocked(object)) return false;
      return nativeLockApiSelectBase.call(this,object);
    };
    if(typeof LukeAnimatePluginAPI.getSelectedDrawObjects==='function'){
      const nativeLockApiSelectedBase=LukeAnimatePluginAPI.getSelectedDrawObjects;
      LukeAnimatePluginAPI.getSelectedDrawObjects=function(){
        return (nativeLockApiSelectedBase.call(this)||[]).filter(object=>!nativeObjectLayerLocked(object));
      };
    }
  }

'''
if init_anchor not in text:
    raise SystemExit('App init anchor not found')
text = text.replace(init_anchor, module + init_anchor, 1)

path.write_text(text, encoding='utf-8')
print('Safe native layer locking patch applied.')
