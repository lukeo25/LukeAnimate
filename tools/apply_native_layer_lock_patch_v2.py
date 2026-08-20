from pathlib import Path

path = Path('index.html')
text = path.read_text(encoding='utf-8')
MARKER = 'native per-layer locking v186'
if MARKER in text:
    print('Native layer locking already present.')
    raise SystemExit(0)

def rep(old,new,label,required=True):
    global text
    if old in text:
        text = text.replace(old,new,1)
        print('patched',label)
        return True
    if required:
        raise SystemExit(label+' anchor not found')
    print('optional anchor missing',label)
    return False

# Preserve effect-layer lock state in undo/project JSON.
rep("""      layers: layers.map(l=>({
        id: l.id, type: l.type, enabled: l.enabled,
        p: JSON.parse(JSON.stringify(l.p))
      }))""",
"""      layers: layers.map(l=>({
        id: l.id, type: l.type, enabled: l.enabled,
        layerLocked: !!l.layerLocked,
        p: JSON.parse(JSON.stringify(l.p))
      }))""", 'effect snapshot')

rep("""      layers.push({ id:l.id, type:l.type, enabled:l.enabled, p: JSON.parse(JSON.stringify(l.p)), state:{} });""",
"""      layers.push({ id:l.id, type:l.type, enabled:l.enabled, layerLocked:!!l.layerLocked, p: JSON.parse(JSON.stringify(l.p)), state:{} });""", 'effect restore')

# Stage selection skips locked objects so unlocked objects behind remain selectable.
rep("""    for(let i=drawObjects.length-1; i>=0; i--){
      const obj = ensureDrawObjectMetadata(drawObjects[i]);
      if(obj.enabled === false) continue;
      const b = getEffectiveBounds(obj);""",
"""    for(let i=drawObjects.length-1; i>=0; i--){
      const obj = ensureDrawObjectMetadata(drawObjects[i]);
      if(obj.enabled === false || nativeObjectLayerLocked(obj)) continue;
      const b = getEffectiveBounds(obj);""", 'stage hit test')

rep("""        if(object.enabled===false){
          continue;
        }

        if(
          boundsIntersectRect(""",
"""        if(object.enabled===false || nativeObjectLayerLocked(object)){
          continue;
        }

        if(
          boundsIntersectRect(""", 'marquee selection')

# Skip locked objects in a few direct-edit hit tests that do not go through selectDrawObject.
rep("if(obj.type !== 'text' || obj.enabled === false) continue;",
    "if(obj.type !== 'text' || obj.enabled === false || nativeObjectLayerLocked(obj)) continue;",
    'text editing', False)
rep("if(!candidate||candidate.type!=='group'||candidate.enabled===false) continue;",
    "if(!candidate||candidate.type!=='group'||candidate.enabled===false||nativeObjectLayerLocked(candidate)) continue;",
    'group isolation', False)
rep("if(obj.type !== 'clipinstance') continue;",
    "if(obj.type !== 'clipinstance' || nativeObjectLayerLocked(obj)) continue;",
    'clip editing', False)
rep("if(!candidate || candidate.enabled===false || !shapeCanEditPoints(candidate)) continue;",
    "if(!candidate || candidate.enabled===false || nativeObjectLayerLocked(candidate) || !shapeCanEditPoints(candidate)) continue;",
    'bezier editing', False)
rep("""    drawObjects.forEach((rawObject,index)=>{
      if(!rawObject || rawObject.enabled===false) return;
      const object=ensureDrawObjectMetadata(rawObject);""",
"""    drawObjects.forEach((rawObject,index)=>{
      if(!rawObject || rawObject.enabled===false || nativeObjectLayerLocked(rawObject)) return;
      const object=ensureDrawObjectMetadata(rawObject);""", 'offstage proxies', False)

style_anchor = '  /* ---------- v125 Wick-style drawing layers and independent frames ---------- */'
style = '''  /* ---------- native per-layer locking v186 ---------- */
  .native-layer-lock-button{
    flex:0 0 18px;width:18px;min-width:18px;height:18px;padding:0;margin:0 1px;
    border:0;border-radius:3px;background:transparent;color:#687382;
    display:inline-flex;align-items:center;justify-content:center;
    font:400 12px/18px Arial,sans-serif;cursor:pointer;
  }
  .native-layer-lock-button:hover,.native-layer-lock-button:focus-visible{
    background:#e3f7f3;color:var(--accent);outline:none;
  }
  .native-layer-lock-button.locked{background:#fff0c7;color:#9a6508;}
  .layer-row.native-layer-locked{background:rgba(103,114,129,.08);}
  .layer-row.native-layer-locked .layer-name,
  .timeline-track-row.native-layer-locked .timeline-track-name{color:#7a838e;}
  .timeline-track-row.native-layer-locked .timeline-track{opacity:.62;}

''' + style_anchor
rep(style_anchor, style, 'lock css')

module = r'''  // ---------------- native per-layer locking v186 ----------------
  function nativeDrawingLayerForObject(object){
    if(!object || !object.timelineLayerId || typeof wickLayerById!=='function') return null;
    return wickLayerById(object.timelineLayerId) || null;
  }

  function nativeObjectLayerLocked(object){
    if(!object) return false;
    if(object.layerLocked===true) return true;
    const layer=nativeDrawingLayerForObject(object);
    return !!(layer && layer.layerLocked===true);
  }

  function nativeEffectLayerLocked(layer){
    return !!(layer && layer.layerLocked===true);
  }

  function nativeSetDrawingLayerLocked(layer,locked){
    if(!layer) return;
    layer.layerLocked=!!locked;
    (layer.frames||[]).forEach(frame=>{
      if(frame && frame.object) frame.object.layerLocked=!!locked;
    });
    (drawObjects||[]).forEach(object=>{
      if(object && String(object.timelineLayerId||'')===String(layer.id)) object.layerLocked=!!locked;
    });
  }

  function nativeRefreshAfterLock(){
    updateSelectedCountUI();
    updateInspector();
    renderTransformHandles();
    renderPoints();
    renderOffstageObjectProxies();
  }

  function nativePurgeLockedSelection(){
    let changed=false;
    Array.from(selectedDrawIndices||[]).forEach(index=>{
      if(nativeObjectLayerLocked(drawObjects[index])){
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
      const layer=wickLayerById(wickActiveDrawingLayerId);
      if(layer && layer.layerLocked===true){
        wickActiveDrawingLayerId=null;
        wickSelectedDrawingFrameId=null;
        changed=true;
      }
    }
    if(changed) nativeRefreshAfterLock();
    return changed;
  }

  function nativeToggleObjectLayerLock(object){
    if(!object) return false;
    const layer=nativeDrawingLayerForObject(object);
    const next=!(layer ? layer.layerLocked===true : object.layerLocked===true);
    pushUndo();
    if(layer) nativeSetDrawingLayerLocked(layer,next);
    else object.layerLocked=next;
    nativePurgeLockedSelection();
    renderLayerList();
    renderTimeline();
    nativeRefreshAfterLock();
    return next;
  }

  function nativeToggleDrawingLayerLock(layer){
    if(!layer) return false;
    const next=!(layer.layerLocked===true);
    pushUndo();
    nativeSetDrawingLayerLocked(layer,next);
    nativePurgeLockedSelection();
    renderLayerList();
    renderTimeline();
    nativeRefreshAfterLock();
    return next;
  }

  function nativeToggleEffectLayerLock(layer){
    if(!layer) return false;
    pushUndo();
    layer.layerLocked=!(layer.layerLocked===true);
    nativePurgeLockedSelection();
    renderLayerList();
    renderTimeline();
    nativeRefreshAfterLock();
    return !!layer.layerLocked;
  }

  function nativeMakeLockButton(locked,onToggle){
    const button=document.createElement('button');
    button.type='button';
    button.className='native-layer-lock-button'+(locked?' locked':'');
    button.textContent=locked?'🔒':'🔓';
    button.title=locked?'Unlock this layer':'Lock this layer';
    button.setAttribute('aria-label',button.title);
    ['pointerdown','mousedown'].forEach(type=>button.addEventListener(type,event=>{
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    }));
    button.addEventListener('click',event=>{
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
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
    Array.from(list.querySelectorAll('.layer-row.effect-layer')).forEach((row,pos)=>{
      const entry=effectEntries[pos];
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
    const entries=isolated
      ?[{obj:isolated.child,idx:isolated.rootIndex,isolated:true}]
      :drawObjects.map((obj,idx)=>({obj,idx,isolated:false})).reverse();
    Array.from(list.querySelectorAll('.layer-row.object-layer')).forEach((row,pos)=>{
      const entry=entries[pos];
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

    Array.from(tracks.querySelectorAll('.timeline-track-row.fx-timeline-layer')).forEach((row,index)=>{
      const layer=layers[index];
      if(!layer) return;
      const locked=nativeEffectLayerLocked(layer);
      row.classList.toggle('native-layer-locked',locked);
      const name=row.querySelector('.timeline-track-name');
      if(name && !name.querySelector('.native-layer-lock-button')){
        const button=nativeMakeLockButton(locked,()=>nativeToggleEffectLayerLock(layer));
        const del=name.querySelector('.wick-layer-delete-button');
        if(del && del.nextSibling) name.insertBefore(button,del.nextSibling);
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
        const button=nativeMakeLockButton(locked,()=>nativeToggleDrawingLayerLock(layer));
        const del=name.querySelector('.wick-layer-delete-button');
        if(del && del.nextSibling) name.insertBefore(button,del.nextSibling);
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

  const nativeLockDeleteSelectedBase=deleteSelectedDrawObjects;
  deleteSelectedDrawObjects=function(){
    nativePurgeLockedSelection();
    return nativeLockDeleteSelectedBase();
  };

  const nativeLockDeleteEffectBase=deleteLayer;
  deleteLayer=function(index){
    if(nativeEffectLayerLocked(layers[index])) return false;
    return nativeLockDeleteEffectBase(index);
  };

  const nativeLockMoveEffectBase=moveEffectLayerInStack;
  moveEffectLayerInStack=function(index,delta){
    if(nativeEffectLayerLocked(layers[index])) return false;
    return nativeLockMoveEffectBase(index,delta);
  };

  const nativeLockDeleteDrawingBase=wickDeleteDrawingLayer;
  wickDeleteDrawingLayer=function(layer){
    if(layer && layer.layerLocked===true) return false;
    return nativeLockDeleteDrawingBase(layer);
  };

  const nativeLockMoveDrawingBase=wickMoveDrawingLayerInStack;
  wickMoveDrawingLayerInStack=function(layerId,delta){
    const layer=wickLayerById(layerId);
    if(layer && layer.layerLocked===true) return false;
    return nativeLockMoveDrawingBase(layerId,delta);
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

  const nativeLockFrameDragBase=wickBeginFrameBarDrag;
  wickBeginFrameBarDrag=function(event,layer){
    if(layer && layer.layerLocked===true){event.preventDefault();event.stopPropagation();return false;}
    return nativeLockFrameDragBase.apply(this,arguments);
  };

  const nativeLockFadeDragBase=wickBeginFrameFadeDrag;
  wickBeginFrameFadeDrag=function(event,layer){
    if(layer && layer.layerLocked===true){event.preventDefault();event.stopPropagation();return false;}
    return nativeLockFadeDragBase.apply(this,arguments);
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
  }

'''
rep('  // ---------------- init ----------------', module+'  // ---------------- init ----------------', 'native lock module')

path.write_text(text,encoding='utf-8')
print('Native layer lock v2 applied.')
