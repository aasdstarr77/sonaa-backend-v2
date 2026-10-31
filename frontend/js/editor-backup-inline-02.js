(function(){
'use strict';
const API='/api/admin/ui-layout/';
const pages={admin:{title:'لوحة الإدارة',url:'/frontend/admin.html'},client:{title:'صفحة العميل',url:'/frontend/client.html'},fanni:{title:'صفحة الفني',url:'/frontend/fanni.html'},password:{title:'الحساب وكلمة المرور',url:'/frontend/password.html'},support:{title:'الدعم',url:'/frontend/support.html'}};
const subPages={
 'client:login':'login','client:register':'register','client:my-orders':'orders','client:new-order':'new','client:complaint-form':'complaint','client:profile':'profile',
 'fanni:login':'login','fanni:register':'register','fanni:my-orders':'myOffers','fanni:profile':'profile','fanni:wallet':'wallet','fanni:notifications':'notifications',
 'admin:dashboard':'dashboard','admin:orders':'orders','admin:technicians':'fannis','admin:clients':'clients','admin:support':'support','admin:password-recovery':'__passwordRecovery',
 'password:profile':'profile','password:change-password':'changePassword','support:my-cases':'main','support:new-case':'new-title'
};
const $=id=>document.getElementById(id);
const frame=$('previewFrame'),pageSelect=$('page');
let layouts={},selectedId='',selected=null,injecting=false;
const status=(s)=>{$('status').textContent=s};
const token=()=>{try{return localStorage.getItem('admin_token_v3')||''}catch(_){return ''}};
const safeId=s=>String(s||'').replace(/[^a-zA-Z0-9_-]/g,'-').slice(0,100);
function stablePath(el){
 if(el.id)return 'id-'+safeId(el.id);
 const parts=[];let n=el;
 while(n&&n.nodeType===1&&n!==n.ownerDocument.body){
  let part=n.tagName.toLowerCase();
  if(n.classList&&n.classList.length)part+='.'+[...n.classList].slice(0,2).map(s=>safeId(s)).join('.');
  const parent=n.parentElement;
  if(parent){const same=[...parent.children].filter(x=>x.tagName===n.tagName);if(same.length>1)part+='-'+(same.indexOf(n)+1)}
  parts.unshift(part);n=parent;
  if(parts.length>8)break;
 }
 return 'auto-'+safeId(parts.join('_')).slice(0,94);
}
function currentLayout(){const p=pageSelect.value;if(!layouts[p])layouts[p]={sectionOrder:[],tabOrder:{},tabGroups:{},sizes:{},elements:{}};return layouts[p]}
function getElementKey(el){return el.getAttribute('data-editor-id')||stablePath(el)}
function readControls(){
 if(!selected)return null;
 let mobile={};
 const raw=$('mobileJson').value.trim();
 if(raw){mobile=JSON.parse(raw);if(!mobile||typeof mobile!=='object'||Array.isArray(mobile))throw Error('تعديلات الهاتف يجب أن تكون كائن JSON');}
 const item={containerId:$('containerId').value.trim(),anchor:$('anchor').value,xPercent:Number($('xPercent').value)||0,yPercent:Number($('yPercent').value)||0,threeD:$('threeD').checked,scale:Number($('scale').value)||1,hidden:$('hidden').checked};
 if($('wPercent').value!=='')item.wPercent=Number($('wPercent').value);
 if($('hPercent').value!=='')item.hPercent=Number($('hPercent').value);
 if(Object.keys(mobile).length)item.mobile=mobile;
 return item;
}
function loadControls(item={}){
 $('containerId').value=item.containerId||'';$('anchor').value=item.anchor||'top-left';
 $('xPercent').value=item.xPercent??0;$('yPercent').value=item.yPercent??0;
 $('wPercent').value=item.wPercent??'';$('hPercent').value=item.hPercent??'';
 $('threeD').checked=item.threeD!==false;$('scale').value=item.scale??1;$('hidden').checked=!!item.hidden;
 $('mobileJson').value=item.mobile?JSON.stringify(item.mobile,null,2):'';
}
function applyItem(el,item){
 if(!el||!item)return;
 el.classList.add('pos-layer','effect-layer');
 el.dataset.editorPosLayer='1';el.dataset.editorEffectLayer='1';
 el.style.setProperty('translate',(Number(item.xPercent)||0)+'% '+(Number(item.yPercent)||0)+'%','important');
 if(Number.isFinite(item.wPercent))el.style.setProperty('width',item.wPercent+'%','important');
 if(Number.isFinite(item.hPercent))el.style.setProperty('height',item.hPercent+'%','important');
 if(item.hidden)el.style.setProperty('display','none','important');
 if(item.threeD===false){el.style.setProperty('box-shadow','none','important');el.style.setProperty('scale','1','important');}
 else {el.style.setProperty('scale',String(item.scale||1),'important');el.style.setProperty('box-shadow','0 7px 16px rgba(10,35,66,.22),inset 0 1px 0 rgba(255,255,255,.65)','important');}
 el.dataset.editorAnchor=item.anchor||'top-left';el.dataset.editorContainer=item.containerId||'';
}
function setupFrame(){
 let doc;try{doc=frame.contentDocument;if(!doc||!doc.body)return}catch(e){status('لا يمكن الوصول إلى الصفحة المعروضة. تأكد أن المحرر والصفحة من نفس النطاق.');return}
 const p=pageSelect.value,layout=layouts[p]||{elements:{}};
 const style=doc.createElement('style');style.dataset.editorInjected='1';style.textContent='[data-editor-id]{cursor:crosshair!important} [data-editor-id].sonaa-editor-selected{outline:3px solid #ff9f1c!important;outline-offset:2px!important} .pos-layer{--editor-position-layer:1} .effect-layer{--editor-effect-layer:1}';doc.head.appendChild(style);
 const all=[...doc.body.querySelectorAll('*')].filter(el=>!['SCRIPT','STYLE','LINK','META','NOSCRIPT','SVG','PATH'].includes(el.tagName));
 all.forEach(el=>{if(!el.hasAttribute('data-editor-id'))el.setAttribute('data-editor-id',stablePath(el));const item=layout.elements?.[el.getAttribute('data-editor-id')];if(item)applyItem(el,item)});
 doc.addEventListener('click',function(ev){
  const el=ev.target.closest('[data-editor-id]');if(!el)return;
  ev.preventDefault();ev.stopPropagation();if(ev.stopImmediatePropagation)ev.stopImmediatePropagation();
  if(selected)selected.classList.remove('sonaa-editor-selected');
  selected=el;selectedId=getElementKey(el);selected.classList.add('sonaa-editor-selected');
  $('element').value=selectedId;
  const saved=currentLayout().elements[selectedId]||{};
  loadControls(saved);
  status('تم تحديد العنصر: '+selectedId+'\\nعدّل الخصائص ثم اضغط «تطبيق على المعاينة».');
 },true);
 status('تم تحميل المعاينة. اضغط على عنصر لتحديده.');
}
async function loadLayout(){
 const p=pageSelect.value;layouts[p]={sectionOrder:[],tabOrder:{},tabGroups:{},sizes:{},elements:{}};
 try{
  const t=token();if(!t){status('المعاينة متاحة، لكن حفظ/تحميل التخطيط يحتاج تسجيل دخول الإدارة (admin_token_v3).');return}
  const res=await fetch(API+encodeURIComponent(p),{headers:{Authorization:'Bearer '+t},cache:'no-store'});
  const data=await res.json().catch(()=>({}));
  if(!res.ok)throw Error(data.message||'تعذر تحميل التخطيط ('+res.status+')');
  layouts[p]=data.layout||layouts[p];
 }catch(e){status('تعذر تحميل التخطيط المحفوظ: '+e.message)}
}
async function loadPage(){
 const p=pageSelect.value;selected=null;selectedId='';$('element').value='';$('previewTitle').textContent=pages[p].title;
 await loadLayout();
 frame.onload=function(){console.log('iframe loaded:',frame.src);setupFrame();};
 frame.onerror=function(){console.error('iframe error:',frame.src);status('تعذر تحميل المعاينة داخل الإطار: '+frame.src);};
 frame.src=pages[p].url;
}
$('subPage').addEventListener('change',function(){
 const val=this.value;if(!val)return;const targetPage=val.split(':')[0];if(pageSelect.value!==targetPage){pageSelect.value=targetPage;loadPage().then(sendSubPage)}else sendSubPage();
});
function sendSubPage(){
 const val=$('subPage').value;if(!val)return;
 const pair=val.split(':');const targetPage=pair[0];if(pageSelect.value!==targetPage){pageSelect.value=targetPage;return loadPage().then(sendSubPage)}
 const section=subPages[val];if(!section)return;
 const send=function(){try{frame.contentWindow.postMessage({action:'openSection',section:section},'*');status('تم إرسال أمر فتح القسم: '+section+' إلى المعاينة.')}catch(e){status('تعذر فتح القسم: '+e.message)}};
 try{if(frame.contentDocument&&frame.contentDocument.readyState==='complete')send();else frame.addEventListener('load',send,{once:true})}catch(e){frame.addEventListener('load',send,{once:true})}
}
$('openSubPage').addEventListener('click',sendSubPage);
$('page').addEventListener('change',loadPage);
$('reload').addEventListener('click',loadPage);
$('apply').addEventListener('click',()=>{
 if(!selected){status('حدد عنصرًا من المعاينة أولًا.');return}
 try{const item=readControls();currentLayout().elements[selectedId]=item;applyItem(selected,item);status('تم تطبيق التعديل على المعاينة فقط. اضغط حفظ التخطيط لحفظه في قاعدة البيانات.')}
 catch(e){status('تعذر تطبيق التعديلات: '+e.message)}
});
$('clear').addEventListener('click',()=>{
 if(!selected)return;
 delete currentLayout().elements[selectedId];
 selected.style.removeProperty('translate');selected.style.removeProperty('width');selected.style.removeProperty('height');selected.style.removeProperty('display');selected.style.removeProperty('box-shadow');selected.style.removeProperty('scale');
 loadControls({});status('تم مسح إعدادات العنصر من المسودة الحالية. لم يتم الحفظ بعد.')
});
$('save').addEventListener('click',async()=>{
 const t=token();if(!t){status('لا يوجد رمز دخول للإدارة. افتح لوحة الإدارة وسجّل الدخول في نفس النطاق ثم أعد المحاولة.');return}
 if(selected){try{currentLayout().elements[selectedId]=readControls()}catch(e){status(e.message);return}}
 const p=pageSelect.value;const btn=$('save');btn.disabled=true;status('جارٍ حفظ التخطيط...');
 try{
  const res=await fetch(API+encodeURIComponent(p),{method:'PUT',headers:{'Content-Type':'application/json','Authorization':'Bearer '+t},body:JSON.stringify({layout:currentLayout()})});
  const data=await res.json().catch(()=>({}));
  if(!res.ok)throw Error(data.message||'فشل الحفظ ('+res.status+')');
  layouts[p]=data.layout||currentLayout();status('تم حفظ تخطيط '+pages[p].title+' بنجاح. عدد العناصر: '+Object.keys(layouts[p].elements||{}).length+'.');
 }catch(e){status('فشل الحفظ: '+e.message)}finally{btn.disabled=false}
});
loadPage();
})();