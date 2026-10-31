/* Extracted page functions; classic-script globals are preserved. */
'use strict';

function esc(s){
 return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function serviceIconFor(name){
  const s=String(name||'');
  const rules=[
    [/كاميرات|مراقبة/,'📹'],
    [/دش|رسيفر|استقبال|شاشة تلفزيون|شاشات/,'📡'],
    [/تنظيف سجاد|موكيت|كنب|انتريهات|مراتب/,'🧽'],
    [/مكافحة حشرات/,'🪲'],
    [/تنظيف خزانات|خزانات مياه/,'🛢️'],
    [/تنظيف زجاج|واجهات زجاج|زجاج/,'🪟'],
    [/تنظيف|تطهير/,'🧹'],
    [/كهربائي سيارات/,'🚗'],
    [/كهرباء|كهربائي|قواطع|مفاتيح|برايز|إضاءة|نجف|لوحة الكهرباء/,'⚡'],
    [/مراوح|مروحة/,'🌀'],
    [/تسريب|مياه|سباك|صرف صحي|سيفون|خلاطات|حوض|حمامات|مواسير|قاعدة حمام/,'🚿'],
    [/تكييف|فريون|تبريد/,'❄️'],
    [/ثلاجات|فريزر|مبرد مياه/,'🧊'],
    [/غسالات|أطباق/,'🧺'],
    [/بوتاجاز|أفران|ميكروويف|غاز/,'🔥'],
    [/سخانات/,'♨️'],
    [/نجار|أثاث|موبيليا|دواليب|أبواب|شبابيك|مفصلات/,'🪚'],
    [/أقفال|كالون|قفل/,'🔐'],
    [/نقاش|دهانات|طلاء/,'🖌️'],
    [/ديكور|ورق حائط|جبس بورد/,'🎨'],
    [/شروخ|ترميم|محارة|بياض/,'🧱'],
    [/ألوميتال/,'🪟'],
    [/سيراميك|رخام|بناء|أرضيات|عزل|حجر|وزر|تشطيب|طوب/,'🧱'],
    [/كمبيوتر|لابتوب|طابعات/,'💻'],
    [/راوتر|إنترنت|شبكات/,'📶'],
    [/موبايلات/,'📱'],
    [/نقل أثاث|نقل أجهزة|نقل/,'🚚'],
    [/ستائر/,'🪟'],
    [/تركيب رفوف|تركيب مرايات/,'🪛'],
    [/لحام|معدن/,'🛠️'],
    [/مضخات|مواتير/,'⚙️'],
    [/تركيب|فك|تثبيت|صيانة|إصلاح|تصليح/,'🔧']
  ];
  for(const [pattern,icon] of rules) if(pattern.test(s)) return icon;
  const variety=['🔩','🪜','🧲','🪠','🧯','🏠','📐','🧰','🪛','🧱','⚙️','🔨'];
  let hash=0;
  for(let i=0;i<s.length;i++) hash=(hash*31+s.charCodeAt(i))>>>0;
  return variety[hash%variety.length];
}

function clean(s,max=1000){
 return String(s??'').trim().slice(0,max).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g,'');
}

function getToken(){
 if(window.IS_EDITOR_PREVIEW)return '';
 try{return localStorage.getItem(TOKEN_KEY)||''}catch{return ''}
}

async function playOrderVoice(sn,button){let audio=button?.parentElement?.querySelector('audio[data-order-voice]');if(!audio){audio=document.createElement('audio');audio.controls=true;audio.preload='none';audio.dataset.orderVoice='1';audio.className='mt-2 w-full';button?.parentElement?.appendChild(audio)}if(!audio.src){try{button.disabled=true;const response=await fetch('/api/orders/'+encodeURIComponent(sn)+'/voice',{headers:{Authorization:'Bearer '+getToken()}});if(!response.ok)throw Error('تعذر تحميل التسجيل الصوتي.');audio.src=URL.createObjectURL(await response.blob())}catch(e){toast(e.message,'error');return}finally{button.disabled=false}}try{await audio.play()}catch(e){audio.controls=true}}

function getUser(){
 if(window.IS_EDITOR_PREVIEW)return null;
 try{return JSON.parse(localStorage.getItem(USER_KEY)||'null')}catch{return null}
}

function setAuth(token,user){
 if(window.IS_EDITOR_PREVIEW)return;
 try{
  if(token)localStorage.setItem(TOKEN_KEY,token);
  if(user)localStorage.setItem(USER_KEY,JSON.stringify(user));
 }catch(e){
  log('تعذر حفظ بيانات الجلسة',e);
 }
}

function clearAuth(){
 try{
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
 }catch(e){
  log('تعذر مسح بيانات الجلسة',e);
 }
}

function buildUrl(path){
 if(['localhost','127.0.0.1'].includes(location.hostname))return path;
 if(location.hostname.endsWith('vercel.app')&&location.hostname.includes('sonaa'))return path;
 return BASE_URL+path;
}

function toast(message,type='success'){
 const el=document.getElementById('toast');
 const bg=type==='success'?'bg-emerald-600':type==='pending'?'bg-amber-600':'bg-[#0b1b3a]';
 el.innerHTML=`<div class="pointer-events-auto mx-auto max-w-[640px] rounded-[14px] ${bg} text-white text-[13px] font-bold px-4 py-3 shadow-2xl flex justify-between gap-3"><span class="leading-6">${esc(message)}</span><button onclick="this.parentElement.remove()" class="shrink-0 h-7 px-3 rounded-full bg-white/20">إغلاق</button></div>`;
 setTimeout(()=>{if(el.firstElementChild)el.innerHTML=''},4000);
}

async function copyWalletNumber(index){
 const walletNumber=String(document.getElementById('wallet-transfer-number-'+index)?.textContent||'').trim();
 if(!/^01[0-9]{9}$/.test(walletNumber))return toast('رقم المحفظة غير متاح حاليًا.','error');
 try{
  if(navigator.clipboard&&window.isSecureContext){await navigator.clipboard.writeText(walletNumber);}
  else{
   const input=document.createElement('textarea');input.value=walletNumber;input.readOnly=true;input.style.position='fixed';input.style.left='-9999px';input.style.top='0';input.setAttribute('aria-hidden','true');document.body.appendChild(input);
   input.focus();input.select();input.setSelectionRange(0,input.value.length);
   let copied=false;try{copied=document.execCommand('copy');}finally{input.remove();}
   if(!copied)throw new Error('تعذر نسخ الرقم تلقائيًا');
  }
  toast('تم نسخ رقم المحفظة');
 }catch(error){toast('تعذر النسخ تلقائيًا. اضغط مطولًا على الرقم لنسخه.','error');}
}

async function loadWalletTransferNumbers(){
 try{const data=await apiGet('/api/wallet-settings');state.walletPhone1=String(data.walletPhone1||'').trim();state.walletPhone2=String(data.walletPhone2||'').trim();}
 catch(error){log('تعذر تحميل أرقام التحويل',error.message);state.walletPhone1='';state.walletPhone2='';}
 if(state.tab==='wallet')render();
}

function onRegAreaSearch(value){
 state.regAreaSearch=String(value||'').slice(0,60);
 const cursor=state.regAreaSearch.length;
 render();
 const input=document.getElementById('regAreaSearchInput');
 if(input){input.focus();try{input.setSelectionRange(cursor,cursor);}catch(_){}}
}

function toggleRegArea(area){
 const value=clean(area,60);if(!value)return;
 if(value===ALL_AREAS_LABEL){state.regAreas=state.regAreas.includes(ALL_AREAS_LABEL)?[]:[ALL_AREAS_LABEL];state.error='';render();return;}
 if(state.regAreas.includes(ALL_AREAS_LABEL))state.regAreas=[];
 if(state.regAreas.includes(value))state.regAreas=state.regAreas.filter(item=>item!==value);
 else if(state.regAreas.length>=30){state.error='تقدر تختار لحد 30 منطقة فقط.';render();return;}
 else state.regAreas=[...state.regAreas,value];
 state.error='';render();
}

function addCustomRegArea(){
 const area=clean(state.regAreaCustom,60).replace(/\s+/g,' ');
 if(area.length<2){state.error='اكتب اسم منطقة صحيح من حرفين على الأقل.';render();return;}
 if(/01[0-9]{9}/.test(area.replace(/\D/g,''))){state.error='ممنوع كتابة رقم تليفون في اسم المنطقة.';render();return;}
 const key=area.normalize('NFC').trim().toLowerCase();
 const existing=AREA_OPTIONS.find(item=>item.normalize('NFC').trim().toLowerCase()===key)||area;
 if(state.regAreas.includes(existing)){state.error='المنطقة دي مختارة بالفعل.';render();return;}
 if(state.regAreas.includes(ALL_AREAS_LABEL))state.regAreas=[];
 if(state.regAreas.length>=30){state.error='تقدر تختار لحد 30 منطقة فقط.';render();return;}
 if(!AREA_OPTIONS.includes(existing))AREA_OPTIONS=[...AREA_OPTIONS,existing].sort((a,b)=>a.localeCompare(b,'ar'));
 state.regAreas=[...state.regAreas,existing];state.regAreaCustom='';state.regAreaSearch='';state.error='';render();
}

async function loadAreas(){
 try{const data=await API.areas();AREA_OPTIONS=Array.isArray(data?.areas)?data.areas:[];}
 catch(e){log('تعذر تحميل المناطق',e);AREA_OPTIONS=[];}
 render();
}

function parseAreas(value){
 return [...new Set(String(value||'').split(/[,،;\n\r]+/).map(x=>clean(x,60)).filter(x=>x.length>=2))].slice(0,30);
}

async function api(path,options={}){
 const headers={'Content-Type':'application/json',...(options.headers||{})};
 const token=getToken();
 if(token)headers.Authorization='Bearer '+token;

 let response;
 const timeoutMs=Number(options.timeoutMs)||0;
 const fetchOptions={...options};
 delete fetchOptions.timeoutMs;
 const controller=timeoutMs&&typeof AbortController!=='undefined'?new AbortController():null;
 let timeoutId=null;
 if(controller)timeoutId=setTimeout(()=>controller.abort(),timeoutMs);

 try{
  response=await fetch(buildUrl(path),{...fetchOptions,...(controller?{signal:controller.signal}:{}),headers,credentials:'omit',mode:'cors'});
 }catch(e){
  if(controller&&controller.signal.aborted)throw new Error('استغرق الاتصال وقتًا أطول من المعتاد. حاول مرة أخرى بعد قليل.');
  throw new Error('تعذر الاتصال. تحقق من الإنترنت وحاول مرة أخرى.');
 }finally{
  if(timeoutId!==null)clearTimeout(timeoutId);
 }

 const raw=await response.text();
 let data={};

 try{data=raw?JSON.parse(raw):{}}catch{data={message:'تعذر قراءة البيانات. حاول مرة أخرى.'};}

 if(!response.ok){
  const message=response.status===404||response.status>=500?'تعذر تنفيذ طلبك حاليًا. حاول مرة أخرى.':(data.message||data.error||(
   response.status===404?'الخدمة المطلوبة غير متاحة حاليًا.':
   response.status===401?'انتهت الجلسة أو بيانات الدخول غير صحيحة':
   response.status===403?'الحساب غير مصرح له بتنفيذ العملية':
   response.status===429?'محاولات كثيرة. انتظر قليلًا ثم حاول مجددًا':
   `حدثت مشكلة أثناء تنفيذ الطلب. حاول مرة أخرى.`
  ));

  const error=new Error(message);
  error.status=response.status;
  error.data=data;
  log('API error',path,response.status,data);
  throw error;
 }

 log('API success',path,response.status,data);
 return data;
}

async function loadServices(){
 SERVICES_LOADING=true;
 SERVICES_ERROR='';
 if(CATEGORIES.length||ALL_SERVICES.length||SERVICES_ERROR)render();
 try{
  const data=await apiGet('/api/services');
  const cats=Array.isArray(data.categories)?data.categories:[];
  const srvs=Array.isArray(data.services)?data.services:[];
  if(!cats.length||!srvs.length)throw new Error('قائمة الخدمات غير متاحة حاليًا. حاول مرة أخرى بعد قليل.');
  for(const c of cats){
    if(!c||typeof c.label!=='string'||!Array.isArray(c.services))throw new Error('بيانات الأقسام غير سليمة.');
  }
  CATEGORIES=cats;
  ALL_SERVICES=[...new Set(srvs)];
  SERVICES_LOADING=false;
  SERVICES_ERROR='';
  log('تم تحميل الخدمات للفني:',CATEGORIES.length+' قسم, '+ALL_SERVICES.length+' خدمة');
 }catch(e){
  SERVICES_LOADING=false;
  SERVICES_ERROR=e.message||'تعذر تحميل قائمة الخدمات';
  CATEGORIES=[];
  ALL_SERVICES=[];
  log('فشل تحميل الخدمات للفني',e);
  toast(SERVICES_ERROR,'error');
 }
 render();
}
