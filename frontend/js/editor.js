'use strict';
const adminToken = localStorage.getItem('admin_token_v3') || localStorage.getItem('admin_token') || localStorage.getItem('token') || '';
if (!adminToken) { alert('سجل دخول أدمن أولاً'); location.replace('/frontend/admin.html'); throw new Error('no admin token'); }
const $ = id => document.getElementById(id);
const pageSelect=$('pageSelect'), subPageSelect=$('subPageSelect'), previewFrame=$('previewFrame'), wrapper=$('wrapper'), saveBtn=$('saveBtn'), saveStatus=$('saveStatus'), editorControls=$('editorControls'), selectionNotice=$('selectionNotice');
const pagesMap={client:'client.html',fanni:'fanni.html',admin:'admin.html',password:'password.html',support:'support.html'};
const sectionsMap={'client:login':'login','client:register':'register','client:new-order':'new','client:my-orders':'orders','client:profile':'profile','fanni:login':'login','fanni:available':'available','fanni:my-orders':'myOffers','fanni:wallet':'wallet','admin:dashboard':'dashboard','admin:orders':'orders','admin:settings':'settings'};
let selectedElement=null,selectedKey=null,editMode=false,dirty=false,saving=false,frameReady=false,layoutReady=false,currentPage='client',currentLayout={version:3,elements:{}},editVersion=0,pageLoadSequence=0,originalState=new Map();
const layoutsCache=Object.create(null);
const defaultLayout=()=>({version:3,elements:{}});
const clone=value=>JSON.parse(JSON.stringify(value));
function cacheLayout(page,layout){try{localStorage.setItem('sonaa-ui-layout-cache-v1:'+page,JSON.stringify(layout));}catch(error){console.warn('تعذر تحديث نسخة التخطيط المحلية',error);}}
const hasOwn=(obj,key)=>Object.prototype.hasOwnProperty.call(obj,key);
function setStatus(message,type){saveStatus.textContent=message;saveStatus.className='status '+(type||'');}
function markDirty(){dirty=true;editVersion++;setStatus('⚠️ تعديلات غير محفوظة','dirty');}
function apiHeaders(){return {'Content-Type':'application/json','Authorization':'Bearer '+adminToken};}
async function loadLayout(page,force){
 if(!force&&layoutsCache[page])return clone(layoutsCache[page]);
 const response=await fetch('/api/admin/ui-layout/'+encodeURIComponent(page),{method:'GET',headers:apiHeaders(),cache:'no-store'});
 if(!response.ok)throw new Error('فشل تحميل التخطيط: HTTP '+response.status);
 const result=await response.json(),layout=result.layout||result.data?.layout||(result.elements?result:defaultLayout());
 if(!layout||typeof layout!=='object'||Array.isArray(layout))throw new Error('بيانات التخطيط غير صحيحة');
 if(!layout.elements||typeof layout.elements!=='object'||Array.isArray(layout.elements))layout.elements={};
 layout.version=layout.version||3;layoutsCache[page]=clone(layout);cacheLayout(page,layout);return clone(layout);
}
async function saveLayout(){
 if(saving)return;if(!layoutReady){setStatus('❌ لا يمكن الحفظ قبل تحميل التخطيط','error');return;}if(!dirty){setStatus('لا توجد تعديلات جديدة','saved');return;}
 saving=true;const versionAtSave=editVersion,pageAtSave=currentPage,snapshot=clone(currentLayout);
 saveBtn.disabled=true;saveBtn.textContent='⏳ جاري الحفظ...';
 try{
  const response=await fetch('/api/admin/ui-layout/'+encodeURIComponent(pageAtSave),{method:'PUT',headers:apiHeaders(),body:JSON.stringify({layout:snapshot})});
  const result=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(result.message||'فشل حفظ التخطيط');
  const canonical=result.layout&&typeof result.layout==='object'?result.layout:snapshot;
  layoutsCache[pageAtSave]=clone(canonical);cacheLayout(pageAtSave,canonical);
  if(currentPage===pageAtSave&&editVersion===versionAtSave){currentLayout=clone(canonical);dirty=false;setStatus('✅ تم الحفظ في MongoDB','saved');}
  else setStatus('⚠️ توجد تعديلات أحدث لم تُحفظ','dirty');
 }catch(error){setStatus('❌ '+error.message,'error');alert(error.message);}
 finally{saving=false;saveBtn.disabled=false;saveBtn.textContent='💾 حفظ (Ctrl+S)';}
}
/* يجب أن تطابق الخوارزمية stablePath في ui-layout-loader.js حرفيًا. */
function safeId(value){return String(value||'').replace(/[^a-zA-Z0-9_-]/g,'-').slice(0,100);}
function stablePath(el){
 if(el.id)return 'id-'+safeId(el.id);
 const parts=[];let node=el;
 while(node&&node.nodeType===1&&node!==node.ownerDocument.body){
  let part=node.tagName.toLowerCase();
  if(node.classList&&node.classList.length)part+='.'+Array.from(node.classList).slice(0,2).map(safeId).join('.');
  const parent=node.parentElement;
  if(parent){const same=Array.from(parent.children).filter(child=>child.tagName===node.tagName);if(same.length>1)part+='-'+(same.indexOf(node)+1);}
  parts.unshift(part);node=parent;if(parts.length>8)break;
 }
 return 'auto-'+safeId(parts.join('_')).slice(0,94);
}
function getElementKey(el){
 let key=el.getAttribute('data-sonaa-id')||el.getAttribute('data-editor-id');
 if(!key)key=stablePath(el);
 if(!/^[a-zA-Z0-9_-]{1,100}$/.test(key))return null;
 el.setAttribute('data-sonaa-id',key);
 el.setAttribute('data-editor-id',key);
 return key;
}
function canEditElementText(el){
 if(!el||el.nodeType!==1)return false;
 if(el.matches('input,textarea'))return true;
 if(el.matches('button,a')&&el.querySelector('svg'))return true;
 return el.children.length===0&&!el.matches('html,body,main,header,nav,section,article,form');
}
function getEditableTextNodes(el){
 if(!el||el.matches('input,textarea'))return [];
 return Array.from(el.childNodes).filter(node=>node.nodeType===3&&node.textContent.trim());
}
function captureOriginalState(el){
 if(originalState.has(el))return originalState.get(el);
 const textNodes=getEditableTextNodes(el);
 const state={styleAttribute:el.getAttribute('style'),textNodes:textNodes.slice(),textValues:textNodes.map(n=>n.textContent),createdTextNode:null,createdTextSpan:null,inputValue:el.matches('input,textarea')?el.value:null};
 originalState.set(el,state);return state;
}
function setElementText(el,value){
 const state=captureOriginalState(el);
 if(el.matches('input,textarea')){el.value=value;return;}
 if(!canEditElementText(el))return;
 const nodes=getEditableTextNodes(el);
 if(nodes.length){nodes[0].textContent=value;for(let i=1;i<nodes.length;i++)nodes[i].textContent='';}
 else if(el.matches('button,a')&&el.querySelector('svg')){
  let span=el.querySelector(':scope > [data-sonaa-editor-text="true"]');
  if(!span){span=el.ownerDocument.createElement('span');span.setAttribute('data-sonaa-editor-text','true');el.appendChild(span);state.createdTextSpan=span;}
  span.textContent=value;
 }else{const textNode=el.ownerDocument.createTextNode(value);el.appendChild(textNode);state.createdTextNode=textNode;}
}
function restoreOriginalState(el){
 const state=originalState.get(el);if(!state)return;
 if(state.styleAttribute===null)el.removeAttribute('style');else el.setAttribute('style',state.styleAttribute);
 state.textNodes.forEach((node,index)=>{if(node.parentNode)node.textContent=state.textValues[index];});
 if(state.createdTextNode&&state.createdTextNode.parentNode)state.createdTextNode.remove();
 if(state.createdTextSpan&&state.createdTextSpan.parentNode)state.createdTextSpan.remove();
 if(el.matches('input,textarea'))el.value=state.inputValue??'';
}
function colorToHex(color){
 if(!color)return '#000000';const value=color.trim().toLowerCase();
 if(value==='transparent'||value==='rgba(0, 0, 0, 0)')return '#000000';
 if(/^#[0-9a-f]{6}$/i.test(value))return value;
 if(/^#[0-9a-f]{3}$/i.test(value))return '#'+value.slice(1).split('').map(c=>c+c).join('');
 const match=value.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/);
 if(!match)return '#ffffff';
 return '#'+[match[1],match[2],match[3]].map(n=>Number(n).toString(16).padStart(2,'0')).join('');
}
function applyLayout(){
 if(!frameReady)return;const doc=previewFrame.contentDocument;if(!doc)return;
 Object.entries(currentLayout.elements||{}).forEach(([key,data])=>{
  if(!data||typeof data!=='object')return;
  const el=doc.querySelector('[data-editor-id="'+key.replace(/["\\\\]/g,'\\\\$&')+'"]')||doc.getElementById(key);if(!el)return;
  captureOriginalState(el);
  // Match the live loader: mobile-specific saved values override desktop values in a mobile viewport.
  const mobile=doc.defaultView.matchMedia('(max-width: 767px)').matches;
  const mobileOverride=mobile&&(data.mobile||data.mobileOverride||data.mobileOverrides)||{};
  const cfg=Object.assign({},data,mobileOverride);
  if(hasOwn(cfg,'fontSize'))el.style.fontSize=Number(cfg.fontSize)+'px';
  if(hasOwn(cfg,'fontWeight'))el.style.fontWeight=String(cfg.fontWeight);
  if(hasOwn(cfg,'color'))el.style.color=cfg.color;
  if(hasOwn(cfg,'elementBg'))el.style.backgroundColor=cfg.elementBg;
  if(hasOwn(cfg,'radius'))el.style.borderRadius=Number(cfg.radius)+'px';
  if(hasOwn(cfg,'width'))el.style.width=String(cfg.width);
  if(hasOwn(cfg,'hPercent'))el.style.height=Number(cfg.hPercent)+'%';
  if(hasOwn(cfg,'opacity'))el.style.opacity=String(Math.max(0,Math.min(100,Number(cfg.opacity)))/100);
  if(hasOwn(cfg,'textAlign'))el.style.textAlign=cfg.textAlign;
  if(hasOwn(cfg,'text'))setElementText(el,cfg.text);
  if(Number.isFinite(cfg.translateX)||Number.isFinite(cfg.translateY))el.style.translate=(Number(cfg.translateX)||0)+'px '+(Number(cfg.translateY)||0)+'px';
 });
}
function getSelectedData(){if(!selectedKey)return null;if(!currentLayout.elements[selectedKey])currentLayout.elements[selectedKey]={};return currentLayout.elements[selectedKey];}
function clearSelection(){
 if(selectedElement)selectedElement.classList.remove('sonaa-editor-selected');
 selectedElement=null;selectedKey=null;editorControls.hidden=true;
 selectionNotice.textContent=editMode?'وضع التحرير: اضغط على عنصر':'وضع المعاينة';
}
function selectElement(el){
 if(!el||['HTML','BODY','HEAD','SCRIPT','STYLE','LINK','META','NOSCRIPT'].includes(el.tagName))return;
 clearSelection();const key=getElementKey(el);if(!key)return;
 selectedElement=el;selectedKey=key;const data=getSelectedData();captureOriginalState(el);el.classList.add('sonaa-editor-selected');
 const style=previewFrame.contentWindow.getComputedStyle(el);
 const textControl=$('ctrlText'),canEditText=canEditElementText(el);
 textControl.disabled=!canEditText;
 textControl.placeholder=canEditText?'النص':'لتعديل النص اختر العنصر النصي الداخلي';
 textControl.value=canEditText?(el.matches('input,textarea')?el.value:getEditableTextNodes(el).map(n=>n.textContent).join('')):'';
 $('ctrlFontSize').value=hasOwn(data,'fontSize')?data.fontSize:(parseInt(style.fontSize)||16);
 const selectedWeight=Number(data.fontWeight||style.fontWeight)||400;$('ctrlFontWeight').value=selectedWeight>=800?'900':(selectedWeight>=600?'700':'400');
 $('ctrlColor').value=data.color||colorToHex(style.color);
 $('ctrlBgColor').value=data.elementBg||colorToHex(style.backgroundColor);
 $('ctrlRadius').value=hasOwn(data,'radius')?data.radius:(parseInt(style.borderRadius)||0);
 $('ctrlWidth').value=hasOwn(data,'width')?data.width:((style.width==='auto')?'':style.width);
 $('ctrlHeight').value=hasOwn(data,'hPercent')?data.hPercent:'';
 $('ctrlOpacity').value=hasOwn(data,'opacity')?data.opacity:Math.round(Number(style.opacity)*100);
 $('ctrlAlign').value=data.textAlign||style.textAlign||'right';
 selectionNotice.textContent='محدد: '+el.tagName.toLowerCase();$('elementInfo').textContent=key;editorControls.hidden=false;
}
function updateElement(property,value){
 if(!selectedElement)return;const data=getSelectedData();
 if(property==='text'){if(!canEditElementText(selectedElement))return;setElementText(selectedElement,value);data.text=value;}
 else if(value===''||value===null){selectedElement.style[property]='';delete data[property];}
 else if(property==='fontSize'){selectedElement.style.fontSize=Number(value)+'px';data.fontSize=Number(value);}
 else if(property==='radius'){selectedElement.style.borderRadius=Number(value)+'px';data.radius=Number(value);}
 else if(property==='opacity'){selectedElement.style.opacity=String(Number(value)/100);data.opacity=Number(value);}
 else if(property==='hPercent'){selectedElement.style.height=Number(value)+'%';data.hPercent=Number(value);}
 else if(property==='width'){selectedElement.style.width=value;data.width=value;}
 else if(property==='elementBg'){selectedElement.style.backgroundColor=value;data.elementBg=value;}
 else if(property==='fontWeight'){selectedElement.style.fontWeight=value;data.fontWeight=value;}
 else if(property==='color'){selectedElement.style.color=value;data.color=value;}
 else if(property==='textAlign'){selectedElement.style.textAlign=value;data.textAlign=value;}
 markDirty();
}
const binds={ctrlText:'text',ctrlFontSize:'fontSize',ctrlFontWeight:'fontWeight',ctrlColor:'color',ctrlBgColor:'elementBg',ctrlRadius:'radius',ctrlWidth:'width',ctrlHeight:'hPercent',ctrlOpacity:'opacity',ctrlAlign:'textAlign'};
Object.entries(binds).forEach(([id,property])=>$(id).addEventListener('input',event=>{
 if(!selectedElement)return;let value=event.target.value;
 if(['fontSize','radius','hPercent','opacity'].includes(property)){
  if(value===''){updateElement(property,'');return;}
  const number=Number(value);if(!Number.isFinite(number))return;
  const limits={fontSize:[10,72],radius:[0,50],hPercent:[1,100],opacity:[0,100]}[property];
  if(number<limits[0]||number>limits[1])return;value=number;
 }
 if(property==='width'&&value!==''&&!/^(\d+(?:\.\d{1,2})?)(px|%)$/.test(value.trim()))return;
 updateElement(property,value);
}));
function nudgeElement(dx,dy){
 if(!selectedElement)return;const data=getSelectedData(),x=(Number(data.translateX)||0)+dx,y=(Number(data.translateY)||0)+dy;
 selectedElement.style.translate=x+'px '+y+'px';data.translateX=x;data.translateY=y;markDirty();
}
document.querySelectorAll('.nudge-btn').forEach(btn=>btn.addEventListener('click',()=>nudgeElement(Number(btn.dataset.dx),Number(btn.dataset.dy))));
$('resetElementBtn').addEventListener('click',()=>{
 if(!selectedElement||!confirm('إعادة ضبط العنصر إلى شكله الأصلي؟'))return;
 const el=selectedElement,key=selectedKey;restoreOriginalState(el);delete currentLayout.elements[key];clearSelection();markDirty();
});
$('deselectBtn').addEventListener('click',clearSelection);
function setEditMode(enabled){
 editMode=enabled;clearSelection();$('editModeBtn').classList.toggle('active',enabled);$('previewModeBtn').classList.toggle('active',!enabled);
 if(frameReady&&previewFrame.contentDocument)previewFrame.contentDocument.documentElement.dataset.sonaaEditMode=enabled?'true':'false';
 selectionNotice.textContent=enabled?'وضع التحرير: اضغط على عنصر':'وضع المعاينة';
}
$('editModeBtn').addEventListener('click',()=>setEditMode(true));$('previewModeBtn').addEventListener('click',()=>setEditMode(false));
function installBridge(){
 const doc=previewFrame.contentDocument;if(!doc||!doc.head)return;
 let style=doc.getElementById('sonaa-editor-style');if(style)style.remove();style=doc.createElement('style');style.id='sonaa-editor-style';
 style.textContent='html[data-sonaa-edit-mode="true"] *{cursor:crosshair!important}html[data-sonaa-edit-mode="true"] .sonaa-editor-selected{outline:2px solid #16a34a!important;outline-offset:2px!important}';
 doc.head.appendChild(style);
 // Capture drag gestures inside the preview. Offsets use the same pixel
 // translateX/translateY fields as the existing arrow controls and saved layouts.
 const view=doc.defaultView||previewFrame.contentWindow;
 if(!view.__sonaaEditorDragBridge){
  view.__sonaaEditorDragBridge=true;
  let drag=null;
  const findDraggable=target=>{
   if(!target||!target.closest)return null;
   return target.closest('button,a,[role="button"],[role="tab"],[role="menuitem"],label,[onclick],[data-action]')||target.closest('img,svg')||target;
  };
  view.addEventListener('pointerdown',event=>{
   if(!editMode||event.button!==0)return;
   const target=findDraggable(event.target);
   if(!target||!target.closest||target.closest('script,style,link,meta,noscript'))return;
   event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();
   selectElement(target);
   if(!selectedElement)return;
   const data=getSelectedData();
   drag={pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,
    originX:Number(data.translateX)||0,originY:Number(data.translateY)||0,
    moved:false,element:selectedElement};
   try{target.setPointerCapture(event.pointerId)}catch(_){}
  },true);
  view.addEventListener('pointermove',event=>{
   if(!editMode||!drag||event.pointerId!==drag.pointerId)return;
   const dx=event.clientX-drag.startX,dy=event.clientY-drag.startY;
   if(Math.abs(dx)+Math.abs(dy)<2)return;
   drag.moved=true;
   const x=Math.round(drag.originX+dx),y=Math.round(drag.originY+dy);
   const data=currentLayout.elements[selectedKey];
   if(!data||selectedElement!==drag.element)return;
   selectedElement.style.translate=x+'px '+y+'px';
   data.translateX=x;data.translateY=y;
   selectionNotice.textContent='تحريك العنصر: '+x+'px أفقي، '+y+'px رأسي';
   event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();
  },true);
  const finishDrag=event=>{
   if(!drag||event.pointerId!==drag.pointerId)return;
   const moved=drag.moved;drag=null;
   if(moved)markDirty();
   event.stopPropagation();event.stopImmediatePropagation();
  };
  view.addEventListener('pointerup',finishDrag,true);
  view.addEventListener('pointercancel',finishDrag,true);
 }
 // Capture clicks too, so a click without dragging still selects the element.
 view.addEventListener('click',event=>{
  if(!editMode)return;
  let target=event.target;
  if(!target||!target.closest)return;
  if(target.closest('script,style,link,meta,noscript'))return;
  // Clicking text, an icon, or a nested span inside a control selects the
  // whole actionable control rather than its inner decorative element.
  const interactive=target.closest('button,a,[role="button"],[role="tab"],[role="menuitem"],label,input,select,textarea,[onclick],[data-action]');
  if(interactive)target=interactive;
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  selectElement(target);
 },true);
 doc.addEventListener('submit',event=>{if(editMode){event.preventDefault();event.stopPropagation();}},true);
 doc.documentElement.dataset.sonaaEditMode=editMode?'true':'false';
}
async function switchPage(page,section){
 if(saving){setStatus('انتظر انتهاء الحفظ أولاً','error');pageSelect.value=currentPage;return;}
 if(dirty&&!confirm('في تعديلات غير محفوظة، هل تريد الخروج دون حفظ؟')){pageSelect.value=currentPage;return;}
 dirty=false;editVersion++;clearSelection();currentPage=page;currentLayout=defaultLayout();frameReady=false;layoutReady=false;originalState=new Map();
 const sequence=++pageLoadSequence;setStatus('⏳ جاري تحميل التخطيط...');
 try{
  const layout=await loadLayout(page);if(sequence!==pageLoadSequence)return;currentLayout=clone(layout);layoutReady=true;
  let url='/frontend/'+(pagesMap[page]||'client.html')+'?preview=true&editorPreview=true&t='+Date.now();
  if(section)url+='&section='+encodeURIComponent(section);previewFrame.src=url;
  $('previewTitle').textContent=pageSelect.options[pageSelect.selectedIndex].text;
 }catch(error){
  if(sequence!==pageLoadSequence)return;layoutReady=false;setStatus('❌ '+error.message,'error');
  previewFrame.src='/frontend/'+(pagesMap[page]||'client.html')+'?preview=true&editorPreview=true&t='+Date.now();
 }
}
pageSelect.addEventListener('change',()=>{subPageSelect.value='';switchPage(pageSelect.value,'');});
subPageSelect.addEventListener('change',()=>{
 const value=subPageSelect.value;if(!value){switchPage(pageSelect.value,'');return;}
 const [page,section]=value.split(':');pageSelect.value=page;switchPage(page,sectionsMap[value]||section);
});
async function reloadPreview(){
 if(saving)return;if(dirty&&!confirm('إعادة التحميل ستفقد التعديلات غير المحفوظة. هل تريد المتابعة؟'))return;
 setStatus('⏳ إعادة تحميل المعاينة...');
 try{
  const layout=await loadLayout(currentPage,true);currentLayout=clone(layout);dirty=false;editVersion++;clearSelection();frameReady=false;layoutReady=true;originalState=new Map();
  previewFrame.src='/frontend/'+pagesMap[currentPage]+'?preview=true&editorPreview=true&t='+Date.now();
 }catch(error){setStatus('❌ '+error.message,'error');alert(error.message);}
}
$('reloadPreviewBtn').addEventListener('click',reloadPreview);
let previewDevice='desktop';
function setPreviewDevice(device){
 previewDevice=device==='mobile'?'mobile':'desktop';
 const mobile=previewDevice==='mobile';
 document.querySelectorAll('[data-device]').forEach(item=>item.classList.toggle('active',item.dataset.device===previewDevice));
 wrapper.classList.toggle('mobile-viewport',mobile);
 wrapper.style.width=mobile?'360px':'100%';
 wrapper.style.height=mobile?'min(800px,100%)':'100%';
 wrapper.style.maxWidth='100%';
}
document.querySelectorAll('[data-device]').forEach(btn=>btn.addEventListener('click',()=>setPreviewDevice(btn.dataset.device)));
setPreviewDevice('desktop');
previewFrame.addEventListener('load',()=>{
 try{frameReady=true;originalState=new Map();installBridge();if(layoutReady){applyLayout();setStatus(dirty?'⚠️ تعديلات غير محفوظة':'✅ جاهز',dirty?'dirty':'saved');}}
 catch(error){setStatus('خطأ معاينة: '+error.message,'error');}
});
saveBtn.addEventListener('click',saveLayout);
window.addEventListener('keydown',event=>{
 if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='s'){event.preventDefault();saveLayout();}
 if(event.key==='Escape'&&selectedElement)clearSelection();
});
window.addEventListener('beforeunload',event=>{if(!dirty&&!saving)return;event.preventDefault();event.returnValue='';});
(async function initializeEditor(){pageSelect.value='client';setEditMode(false);await switchPage('client','');})();
