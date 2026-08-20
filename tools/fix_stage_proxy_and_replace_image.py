from pathlib import Path

path=Path('index.html')
text=path.read_text(encoding='utf-8')
MARK='stage image replacement v187'
if MARK in text:
    print('stage patch already present')
    raise SystemExit(0)

def rep(old,new,label):
    global text
    if old not in text:
        raise SystemExit(label+' anchor not found')
    text=text.replace(old,new,1)
    print('patched',label)

rep("""    offstageProxyLayer.style.left=wrapRect.left+'px';
    offstageProxyLayer.style.top=wrapRect.top+'px';
    offstageProxyLayer.style.width=wrapRect.width+'px';
    offstageProxyLayer.style.height=wrapRect.height+'px';""",
"""    const stageWrap=document.getElementById('stage-wrap');
    const viewportWidth=stageWrap?Math.max(0,stageWrap.clientWidth):wrapRect.width;
    const viewportHeight=stageWrap?Math.max(0,stageWrap.clientHeight):wrapRect.height;
    offstageProxyLayer.style.left=wrapRect.left+'px';
    offstageProxyLayer.style.top=wrapRect.top+'px';
    offstageProxyLayer.style.width=viewportWidth+'px';
    offstageProxyLayer.style.height=viewportHeight+'px';""",
    'proxy viewport sizing')

anchor="""  // ---------------- init ----------------"""
module=r'''  // ---------------- stage image replacement v187 ----------------
  let stageImageContextMenu=null;
  let stageImageReplaceInput=null;

  function closeStageImageContextMenu(){
    if(stageImageContextMenu){
      stageImageContextMenu.remove();
      stageImageContextMenu=null;
    }
  }

  function ensureStageImageReplaceInput(){
    if(stageImageReplaceInput) return stageImageReplaceInput;
    const input=document.createElement('input');
    input.type='file';
    input.accept='image/*,.svg,.avif,.webp,.gif,.png,.jpg,.jpeg,.bmp';
    input.style.display='none';
    document.body.appendChild(input);
    stageImageReplaceInput=input;
    return input;
  }

  async function replaceStageImageSource(object,file){
    if(!object || object.type!=='image' || !file) return false;
    if(typeof nativeObjectLayerLocked==='function' && nativeObjectLayerLocked(object)) return false;
    const source=await readFileAsDataURL(file);
    const metadata=await inspectImageSource(source);
    pushUndo();
    object.src=source;
    object.dataUrl=source;
    object.sourceName=String(file.name||object.sourceName||object.name||'Image');
    object.mimeType=String(file.type||object.mimeType||'image/*');
    object.naturalWidth=Math.max(1,Number(metadata.width)||1);
    object.naturalHeight=Math.max(1,Number(metadata.height)||1);
    drawImageCache.delete(source);
    ensureDrawObjectMetadata(object);
    updateInspector();
    updateMediaPanelSelection();
    renderLayerList();
    renderTimeline();
    renderTransformHandles();
    renderOffstageObjectProxies();
    return true;
  }

  function stageImageAtClientPoint(clientX,clientY){
    if(!isWithinCanvas(clientX,clientY)) return null;
    const c=canvasCoords(clientX,clientY);
    for(let index=drawObjects.length-1;index>=0;index--){
      const object=drawObjects[index];
      if(!object || object.type!=='image' || object.enabled===false) continue;
      if(typeof nativeObjectLayerLocked==='function' && nativeObjectLayerLocked(object)) continue;
      if(pointInBounds(c.x,c.y,getEffectiveBounds(object),6)) return {object,index};
    }
    return null;
  }

  function openStageImageContextMenu(event,hit){
    closeStageImageContextMenu();
    if(!hit || !hit.object) return;
    selectDrawObject(hit.index,false,true);
    const menu=document.createElement('div');
    menu.className='keyframe-context-menu';
    menu.style.position='fixed';
    menu.style.left=Math.max(8,Math.min(window.innerWidth-190,event.clientX))+'px';
    menu.style.top=Math.max(8,Math.min(window.innerHeight-80,event.clientY))+'px';
    menu.style.zIndex='25000';
    menu.style.minWidth='170px';
    const button=document.createElement('button');
    button.type='button';
    button.textContent='Replace Image…';
    button.style.width='100%';
    button.style.textAlign='left';
    button.addEventListener('click',()=>{
      closeStageImageContextMenu();
      const input=ensureStageImageReplaceInput();
      input.value='';
      input.onchange=async()=>{
        const file=input.files&&input.files[0];
        if(!file) return;
        try{
          await replaceStageImageSource(hit.object,file);
        }catch(error){
          console.error('Replace Image failed',error);
          alert(error&&error.message?error.message:'Could not replace image.');
        }
      };
      input.click();
    });
    menu.appendChild(button);
    document.body.appendChild(menu);
    stageImageContextMenu=menu;
  }

  overlay.addEventListener('contextmenu',event=>{
    if(stageTool!=='none' || exportPlayback.active) return;
    const hit=stageImageAtClientPoint(event.clientX,event.clientY);
    if(!hit) return;
    event.preventDefault();
    event.stopPropagation();
    openStageImageContextMenu(event,hit);
  });

  window.addEventListener('mousedown',event=>{
    if(stageImageContextMenu && !stageImageContextMenu.contains(event.target)) closeStageImageContextMenu();
  },true);
  window.addEventListener('blur',closeStageImageContextMenu);
  window.addEventListener('resize',closeStageImageContextMenu,{passive:true});

'''
rep(anchor,module+anchor,'image replacement module')
path.write_text(text,encoding='utf-8')
print('stage proxy + image replacement patch applied')
