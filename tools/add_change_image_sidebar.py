from pathlib import Path

path=Path('index.html')
text=path.read_text(encoding='utf-8')
marker='animate sidebar image replacement v188'
if marker in text:
    print('Sidebar Change Image already present.')
    raise SystemExit(0)

old_html='''          <button class="btn small danger" id="btn-media-delete-layer" style="width:100%;margin-top:6px;">Delete Media Layer</button>'''
new_html='''          <button class="btn small" id="btn-media-change-image" style="width:100%;margin-top:6px;">Change Image…</button>\n          <button class="btn small danger" id="btn-media-delete-layer" style="width:100%;margin-top:6px;">Delete Media Layer</button>'''
if old_html not in text:
    raise SystemExit('Selected media button anchor not found')
text=text.replace(old_html,new_html,1)

old_update='''    document.getElementById('selected-media-name').textContent = objectLayerName(obj);'''
new_update='''    document.getElementById('selected-media-name').textContent = objectLayerName(obj);\n    const changeImageButton=document.getElementById('btn-media-change-image');\n    if(changeImageButton){\n      const canChange=obj.type==='image' && !(typeof nativeObjectLayerLocked==='function' && nativeObjectLayerLocked(obj));\n      changeImageButton.style.display=obj.type==='image'?'block':'none';\n      changeImageButton.disabled=!canChange;\n      changeImageButton.title=canChange?'Replace the selected image while preserving its transform, timing, layer and keys':'Unlock this image layer before replacing it';\n    }'''
if old_update not in text:
    raise SystemExit('updateMediaPanelSelection anchor not found')
text=text.replace(old_update,new_update,1)

old_listener='''    document.getElementById('btn-media-fit-stage').addEventListener('click',()=>{'''
new_listener='''    // ---------------- animate sidebar image replacement v188 ----------------\n    document.getElementById('btn-media-change-image').addEventListener('click',()=>{\n      const obj=selectedMediaObject();\n      if(!obj || obj.type!=='image') return;\n      if(typeof nativeObjectLayerLocked==='function' && nativeObjectLayerLocked(obj)) return;\n      const input=ensureStageImageReplaceInput();\n      input.value='';\n      input.onchange=async()=>{\n        const file=input.files&&input.files[0];\n        if(!file) return;\n        try{\n          await replaceStageImageSource(obj,file);\n        }catch(error){\n          console.error('Change Image failed',error);\n          alert(error&&error.message?error.message:'Could not replace image.');\n        }\n      };\n      input.click();\n    });\n\n    document.getElementById('btn-media-fit-stage').addEventListener('click',()=>{'''
if old_listener not in text:
    raise SystemExit('media listener anchor not found')
text=text.replace(old_listener,new_listener,1)

path.write_text(text,encoding='utf-8')
print('Animate sidebar Change Image patch applied.')
