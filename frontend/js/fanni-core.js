
'use strict';

const BASE_URL='https://sonaa-backend-v2.vercel.app';
const TOKEN_KEY='fanni_token_v4';
const USER_KEY='fanni_user_v4';
const IS_DEV=['localhost','127.0.0.1'].includes(location.hostname);
const log=(...a)=>{if(IS_DEV)console.log(...a)};

// === تم التوحيد مع /api/services - المصدر الرسمي الوحيد ===
let CATEGORIES=[];
let ALL_SERVICES=[];
let AREA_OPTIONS=[];
const ALL_AREAS_LABEL='جميع المناطق';
let SERVICES_LOADING=true;
let SERVICES_ERROR='';

const V={
 phone:v=>/^01[0-25]\d{8}$/.test(String(v||'').replace(/\D/g,'')),
 text:(v,min,max)=>{const s=String(v??'').trim();return s.length>=min&&s.length<=max},
 sn:v=>/^SN\d{6}$/i.test(String(v||'').trim()),
 money:(v,min=10,max=10000)=>Number.isInteger(Number(v))&&Number(v)>=min&&Number(v)<=max
};

function esc(s){
 return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

// أيقونات متنوعة ومخصصة حسب نوع الخدمة لتقليل تكرار الرموز.
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

const apiGet=path=>api(path,{method:'GET'});
const apiPost=(path,body)=>api(path,{method:'POST',body:JSON.stringify(body)});

const API={
 register:p=>apiPost('/api/fanni/register',p),
 login:p=>api('/api/fanni/login',{method:'POST',body:JSON.stringify(p),timeoutMs:15000}),
 profile:()=>apiGet('/api/fanni/me'),
 updateProfile:p=>api('/api/fanni/me',{method:'PATCH',body:JSON.stringify(p)}),
 available:()=>apiGet('/api/orders/available'),
 myOffers:()=>apiGet('/api/orders/my-offers'),
 complete:sn=>apiPost('/api/orders/'+encodeURIComponent(sn)+'/complete',{}),
 rateOrder:(sn,p)=>apiPost('/api/orders/'+encodeURIComponent(sn)+'/rating',p),
 acceptGuidelines:()=>apiPost('/api/fanni/guidelines/accept',{accepted:true,version:'2026-10-20-v1'}),
 chat:sn=>apiGet('/api/orders/'+encodeURIComponent(sn)+'/chat'),
 sendChat:(sn,text,offerId)=>apiPost('/api/orders/'+encodeURIComponent(sn)+'/chat',{text,...(offerId?{offerId}:{})}),
 requestPriceChange:(sn,newPrice,reason)=>apiPost('/api/orders/'+encodeURIComponent(sn)+'/price-change',{newPrice,reason}),
 offer:(sn,p)=>apiPost('/api/fanni/orders/'+encodeURIComponent(sn)+'/offer',p),
 topup:p=>apiPost('/api/fanni/wallet/topup',p),
 walletHistory:()=>apiGet('/api/fanni/wallet/history'),
 notifications:()=>apiGet('/api/notifications/fanni'),
 readNotification:id=>api('/api/notifications/fanni/'+encodeURIComponent(id)+'/read',{method:'PATCH'}),
 readAllNotifications:()=>api('/api/notifications/fanni/read-all',{method:'PATCH'}),
 areas:()=>apiGet('/api/areas'),
 walletSettings:()=>apiGet('/api/wallet-settings')
};

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

let dashboardSpecialtiesCollapsed=true;
function toggleDashboardSpecialties(){dashboardSpecialtiesCollapsed=!dashboardSpecialtiesCollapsed;render();}
let forceTechnicianRegistration=(new URLSearchParams(window.location.search).get('tab')||'').replace(/[\u200B-\u200D\u2060\uFEFF]/g,'').trim()==='register';
let state={
 tab:forceTechnicianRegistration?'register':'login',
 loginPhone:'',loginPass:'',loginSubmitAllowed:false,
 regName:'',regPhone:'',regPass:'',regPassConfirm:'',regGuidelinesAccepted:false,
 regSpecialties:[],regAreas:[],regAreaSearch:'',regAreaCustom:'',openSpecialtyCategory:'',
 editProfileMode:false,editPhone:'',editAreasText:'',editSpecialties:[],editSaving:false,
 loading:false,checkingSession:false,
 
 orders:[],filteredOrders:[],search:'',filterSkill:'الكل',
 myOffers:[],completedOffers:[],offerModal:null,offerPrice:'',offerMessage:'',
 offerError:'',offerSubmitting:false,
 walletFromPhone:'',walletAmount:'',walletRef:'',walletMethod:'vodafone_cash',
 walletPhone1:'',walletPhone2:'',
 walletLoading:false,walletHistory:[],walletBalance:0,
 error:'',success:'',pendingMsg:''
};

let currentUser=getUser();

function isApproved(){
 return String(currentUser?.status||'').trim()==='معتمد';
}

function isPending(){
 const status=String(currentUser?.status||'').trim().toLowerCase();
 return ['قيد المراجعة','قيد المراجعه','pending','under_review','معلق'].includes(status);
}

function extractList(data,keys){
 if(Array.isArray(data))return data;
 for(const key of keys){
  if(Array.isArray(data?.[key]))return data[key];
 }
 if(Array.isArray(data?.data))return data.data;
 if(Array.isArray(data?.data?.[keys[0]]))return data.data[keys[0]];
 return [];
}

function extractUser(data){
 return data?.user||data?.fanni||data?.data?.user||data?.data?.fanni||null;
}

function extractToken(data){
 return data?.token||data?.accessToken||data?.data?.token||data?.data?.accessToken||'';
}

function goClient(){
 location.href=location.origin+'/';
}

function goBack(){
 if(currentUser||getToken()){showLogoutConfirmation('back');return;}
 if(window.history.length>1){window.history.back();return;}
 window.location.href='/';
}
function showLogoutConfirmation(action='logout'){
 if(document.getElementById('logoutConfirmOverlay'))return;
 const overlay=document.createElement('div');
 overlay.id='logoutConfirmOverlay';
 overlay.className='logout-confirm-overlay';
 overlay.setAttribute('role','dialog');
 overlay.setAttribute('aria-modal','true');
 overlay.setAttribute('aria-labelledby','logoutConfirmTitle');
 overlay.innerHTML='<div class="logout-confirm-card"><div class="logout-confirm-icon" aria-hidden="true">↪</div><h2 id="logoutConfirmTitle" class="text-xl font-black text-slate-900">تأكيد تسجيل الخروج</h2><p class="mt-3 text-sm leading-6 font-bold text-slate-600">متأكد إنك عايز تسجّل خروج من حسابك؟</p><div class="mt-6 grid grid-cols-2 gap-3"><button type="button" class="logout-confirm-btn logout-confirm-cancel" data-logout-action="cancel">لا، خليك معايا</button><button type="button" class="logout-confirm-btn logout-confirm-yes" data-logout-action="confirm">أيوه، خروج</button></div></div>';
 document.body.appendChild(overlay);
 overlay.addEventListener('click',function(e){
  if(e.target===overlay||e.target.closest('[data-logout-action="cancel"]')){overlay.remove();return;}
  if(e.target.closest('[data-logout-action="confirm"]')){
   overlay.remove();
   performFanniLogout();
   if(action==='back'){
    if(window.history.length>1)window.history.back();
    else window.location.href='/';
   }
  }
 });
 overlay.querySelector('[data-logout-action="cancel"]').focus();
}
function logout(){showLogoutConfirmation();}
function performFanniLogout(){
 clearAuth();
 currentUser=null;
 Object.assign(state,{
  tab:'login',orders:[],filteredOrders:[],myOffers:[],
  walletHistory:[],walletBalance:0,error:'',success:'',
  pendingMsg:'',offerModal:null,loading:false
 });
 render();
 toast('تم تسجيل الخروج');
}

const TECHNICIAN_TAB_DEFINITIONS=[{id:'available',label:'طلبات متاحة'},{id:'myOffers',label:'طلبات جارية'},{id:'completed',label:'المهام المكتملة'},{id:'wallet',label:'محفظتي'}];
function setTab(tab){
 state.tab=tab;
 state.error='';
 state.success='';
 state.pendingMsg='';
 render();

 if(tab==='available')loadOrders();
if(tab==='myOffers'||tab==='completed')loadMyOffers();
 if(tab==='wallet'){loadWalletHistory();loadWalletTransferNumbers();}
 if(tab==='profile')loadProfile();
}

function toggleSpecialtyCategory(label){
 state.openSpecialtyCategory=state.openSpecialtyCategory===label?'':label;
 render();
}

function toggleSpecialty(s){
 if(state.regSpecialties.includes(s)){
  state.regSpecialties=state.regSpecialties.filter(x=>x!==s);
 }else if(state.regSpecialties.length<20){
  state.regSpecialties.push(s);
 }else{
  toast('يمكنك اختيار 20 تخصصًا كحد أقصى','error');
 }

 render();
}

function fanniCanHandleServiceFrontend(specialties, serviceName) {
 if (!Array.isArray(specialties) || !serviceName) return false;

 const normalize = value => String(value || '')
  .trim()
  .replace(/\s+/g, ' ');

 const service = normalize(serviceName);
 const selected = specialties.map(normalize).filter(Boolean);

 if (selected.includes(service)) return true;

 const category = CATEGORIES.find(cat =>
  Array.isArray(cat.services) &&
  cat.services.some(item => normalize(item) === service)
 );

 if (!category) return false;

 return selected.includes(normalize(category.label));
}

function hasSubmittedOffer(sn){
 const target=String(sn||'').trim().toUpperCase();
 if(!target)return false;

 return [...state.myOffers,...state.completedOffers].some(offer=>{
  const offerSn=String(offer?.orderSn||offer?.sn||offer?.order?.sn||'').trim().toUpperCase();
  return offerSn===target;
 });
}

function applyFilter() {
 const specialties = Array.isArray(currentUser?.specialties)
  ? currentUser.specialties
  : [];

 const acceptedSn = new Set(
  state.myOffers
   .filter(o => o?.accepted === true)
   .map(o => String(o.orderSn || o.sn || o.order?.sn || '').trim().toUpperCase())
   .filter(Boolean)
 );

 let list = [...state.orders].filter(o => {
  const sn = String(o.sn || o.orderSn || o.order?.sn || '')
   .trim()
   .toUpperCase();

  return !sn || !acceptedSn.has(sn);
 });

 if (specialties.length) {
  list = list.filter(o => {
   const service = o.service || o.specialty || o.order?.service || '';
   return fanniCanHandleServiceFrontend(specialties, service);
  });
 } else {
  list = [];
 }

 if (state.filterSkill !== 'الكل') {
  list = list.filter(o =>
   String(o.service || o.specialty || o.order?.service || '') === state.filterSkill
  );
 }

 if (state.search) {
  const q = state.search.toLowerCase();

  list = list.filter(o =>
   [o.sn, o.area, o.service, o.specialty, o.order?.service]
    .some(x => String(x || '').toLowerCase().includes(q))
  );
 }

 state.filteredOrders = list;
}
 
function onSearch(v){
 state.search=clean(v,50);
 applyFilter();
 render();
}

function onFilterSkill(v){
 state.filterSkill=v;
 applyFilter();
 render();
}

function isRatingSkipped(role,sn){try{return localStorage.getItem('sonaa_rating_skipped_'+role+'_'+String(sn||'').toUpperCase())==='1';}catch{return false;}}
const dismissedFanniRatings=new Set();
function dismissRatingPrompt(sn){const code=String(sn||'').toUpperCase();dismissedFanniRatings.add(code);try{localStorage.setItem('sonaa_rating_skipped_fanni_'+code,'1');}catch{}render();toast('تم تخطي تقييم العميل لهذا الطلب.','success');}
function focusRatingPrompt(sn){const target=document.getElementById('fanni-rating-'+String(sn||'').toUpperCase());if(target)target.scrollIntoView({behavior:'smooth',block:'center'});}
function renderAcceptedClient(o){
 if(o?.accepted!==true){
  return '<div class="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-[11px] text-slate-600">بيانات العميل مخفية لحين قبول العميل للعرض.</div>';
 }

 const client=o?.client;

 if(!client||typeof client!=='object'){
  return '<div class="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] leading-6 text-amber-800">تم قبول العرض، لكن تعذر عرض بيانات العميل حاليًا. حدّث العروض وحاول مرة أخرى.</div>';
 }

 return `<section class="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 space-y-3">
  <div class="flex items-center gap-2">
   <span class="text-xl">🔓</span>
   <div><h4 class="text-[13px] font-extrabold text-emerald-900">بيانات العميل — تم قبول عرضك</h4><p class="text-[10px] text-emerald-800 mt-1">استخدم البيانات للتواصل بشأن تنفيذ الخدمة.</p></div>
  </div>
  <div class="rounded-xl bg-white border border-emerald-100 p-3"><div class="text-[10px] text-slate-500 mb-1">اسم العميل</div><b class="text-[12px]">${esc(client.name||'غير متاح')}</b></div>
  <div class="rounded-xl bg-white border border-emerald-100 p-3"><div class="text-[10px] text-slate-500 mb-1">سجل العميل</div><div class="mt-1 flex flex-wrap gap-2"><span class="rounded-full bg-amber-50 border border-amber-200 px-2 py-1 text-[10px] font-extrabold text-amber-800">★ ${Number(client.ratingAverage||0).toFixed(1)} (${Number(client.ratingCount||0)} تقييم)</span><span class="rounded-full bg-emerald-50 border border-emerald-200 px-2 py-1 text-[10px] font-extrabold text-emerald-800">✓ ${Number(client.completedJobs||0)} عمل مكتمل</span></div></div>
  <div class="rounded-xl bg-white border border-emerald-100 p-3">
   <div class="text-[10px] text-slate-500 mb-1">رقم العميل</div>
   <b class="text-[13px]" dir="ltr">${esc(client.phone||'غير متاح')}</b>
   ${client.phone?`<a class="inline-block mr-2 mt-2 rounded-lg bg-emerald-600 px-3 py-2 text-[11px] font-extrabold text-white" href="tel:${encodeURIComponent(String(client.phone))}">اتصال بالعميل</a>`:''}
  </div>
  <div class="rounded-xl bg-white border border-emerald-100 p-3"><div class="text-[10px] text-slate-500 mb-1">منطقة الخدمة</div><b class="text-[12px]">${esc(client.area||'غير متاحة')}</b></div>
  <div class="rounded-xl bg-white border border-emerald-100 p-3"><div class="text-[10px] text-slate-500 mb-1">العنوان التفصيلي</div><b class="text-[12px] leading-6 break-words">${esc(client.address||'غير متاح')}</b></div>
  ${client.description?`<div class="rounded-xl bg-white border border-emerald-100 p-3"><div class="text-[10px] text-slate-500 mb-1">وصف الطلب</div><p class="text-[12px] leading-6 break-words">${esc(client.description)}</p></div>`:''}
  ${o.hasVoiceRecording?`<div class="rounded-xl border border-teal-200 bg-white p-3"><div class="mb-2 text-[12px] font-extrabold text-teal-900">🎙️ تسجيل صوتي من العميل</div><p class="mb-3 text-[11px] leading-5 text-slate-600">استمع لشرح العميل للمشكلة قبل تنفيذ الخدمة.</p><button type="button" onclick="playOrderVoice('${esc(o.orderSn||'')}',this)" class="w-full rounded-xl bg-teal-700 px-4 py-3 text-[12px] font-extrabold text-white">▶️ تشغيل تسجيل العميل</button></div>`:''}
  ${String(client.budget??'').trim()?`<div class="rounded-xl bg-white border border-emerald-100 p-3"><div class="text-[10px] text-slate-500 mb-1">ميزانية العميل</div><b class="text-[12px]">${esc(client.budget)} جنيه</b></div>`:''}
 </section>`;
}

async function loadNotifications(){if(!getToken())return;try{const data=await API.notifications();state.notifications=Array.isArray(data.notifications)?data.notifications:[];state.notificationsUnread=Number(data.unreadCount||0);var badge=document.getElementById('notificationBadge');if(badge)badge.textContent=state.notificationsUnread?(state.notificationsUnread>99?'99+':String(state.notificationsUnread)):'';if(state.notificationsOpen)render();}catch(e){log('تعذر تحميل الإشعارات',e.message);}}
async function toggleNotifications(){state.notificationsOpen=!state.notificationsOpen;if(state.notificationsOpen)await loadNotifications();render();}
async function openNotification(id){const selected=state.notifications.find(n=>n.id===id);try{if(selected&&!selected.read)await API.readNotification(id);}catch(e){}state.notifications=state.notifications.map(n=>n.id===id?Object.assign({},n,{read:true}):n);if(selected&&!selected.read)state.notificationsUnread=Math.max(0,state.notificationsUnread-1);state.notificationsOpen=false;if(selected&&['topup_approved','topup_rejected'].includes(selected.type))state.tab='wallet';else if(selected&&selected.type==='offer_accepted')state.tab='myOffers';else if(selected&&selected.type==='new_opportunity')state.tab='available';render();if(state.tab==='wallet')loadWalletHistory();else if(state.tab==='myOffers')loadMyOffers();else if(state.tab==='available')loadOrders();}
async function markAllNotificationsRead(){try{await API.readAllNotifications();state.notifications=state.notifications.map(n=>Object.assign({},n,{read:true}));state.notificationsUnread=0;render();}catch(e){toast(e.message||'تعذر تحديث الإشعارات','error');}}
function notificationBadge(){return '<span id="notificationBadge" class="absolute -right-1 -top-1 min-w-[17px] rounded-full bg-red-600 px-1 text-[9px] font-black text-white">'+(state.notificationsUnread?(state.notificationsUnread>99?'99+':state.notificationsUnread):'')+'</span>';}
function notificationPanel(){if(!state.notificationsOpen)return '';var html='<div class="fixed inset-0 z-[99]" onclick="state.notificationsOpen=false;render()"></div><div class="fixed left-3 right-3 top-[70px] z-[100] mx-auto max-w-[420px] overflow-hidden rounded-2xl border border-amber-200 bg-white text-slate-800 shadow-2xl"><div class="flex items-center justify-between gap-2 border-b p-3"><b class="text-[15px] font-extrabold">الإشعارات</b><div class="flex items-center gap-3"><button onclick="markAllNotificationsRead()" class="text-[12px] font-extrabold text-blue-700">تعليم الكل كمقروء</button><button type="button" aria-label="إغلاق الإشعارات" title="إغلاق" onclick="state.notificationsOpen=false;render()" class="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-2xl font-bold leading-none text-slate-700 hover:bg-slate-200">×</button></div></div><div class="max-h-[60vh] overflow-y-auto">';if(!state.notifications.length)html+='<p class="p-6 text-center text-[12px] text-slate-500">مفيش إشعارات لحد دلوقتي.</p>';state.notifications.forEach(n=>{html+='<button type="button" data-fanni-notification-id="'+esc(n.id)+'" class="block w-full border-b p-3 text-right '+(n.read?'bg-white':'bg-amber-50')+'"><b class="block text-[16px] font-bold text-slate-900">'+esc(n.title)+'</b><span class="mt-1 block text-[15px] font-semibold leading-7 text-slate-800">'+esc(n.message)+'</span><small class="mt-2 block text-[11px] font-medium text-slate-500">'+(n.createdAt?new Date(n.createdAt).toLocaleString('ar-EG'):'')+'</small></button>';});return html+'</div></div>';}
document.addEventListener('click',e=>{const item=e.target.closest('[data-fanni-notification-id]');if(item)openNotification(item.getAttribute('data-fanni-notification-id'));});
document.addEventListener('click',function(e){const button=e.target.closest('[data-fanni-tab]');if(!button)return;const tab=button.getAttribute('data-fanni-tab');if(tab==='profile'){e.preventDefault();location.href='password.html?role=fanni&mode=account';}});
async function acceptTechnicianGuidelines(){try{const result=await API.acceptGuidelines();if(currentUser){currentUser.technicianGuidelinesAcceptedAt=result.acceptedAt||new Date().toISOString();currentUser.technicianGuidelinesVersion=result.version||'2026-10-20-v1';}toast(result.message||'تم تسجيل الموافقة.');render();}catch(e){toast(e.message||'تعذر تسجيل الموافقة.','error');}}
async function sendFanniQuickReply(sn,offerId,reply){try{await API.sendChat(sn,reply,offerId);await refreshFanniChatsSilently();toast('تم إرسال الرد.');}catch(e){toast(e.message||'تعذر إرسال الرد.','error');}}
async function sendFanniChat(sn,offerId){const el=document.getElementById('fanni-chat-'+sn);const text=String(el?.value||'').trim();if(!text)return toast('اكتب الرسالة أولًا.','error');try{await API.sendChat(sn,text,offerId);if(el)el.value='';await refreshFanniChatsSilently();toast('تم إرسال الرسالة.');}catch(e){toast(e.message||'تعذر إرسال الرسالة.','error');}}
async function requestFanniPriceChange(sn){const price=Number(document.getElementById('price-change-'+sn)?.value);const reason=String(document.getElementById('price-reason-'+sn)?.value||'').trim();const offer=[...state.myOffers,...state.completedOffers].find(o=>String(o.orderSn||o.sn||o.order?.sn||'').toUpperCase()===String(sn||'').toUpperCase());const currentPrice=Number(offer?.client?.acceptedOfferPrice??offer?.acceptedOfferPrice??offer?.priceNum??offer?.price);if(!Number.isFinite(currentPrice))return toast('تعذر تحديد السعر الحالي؛ حدّث البيانات وحاول مرة أخرى.','error');if(!Number.isFinite(price)||price<=currentPrice||price<=0)return toast('السعر الجديد لازم يكون أعلى من السعر الحالي ('+currentPrice+' جنيه).','error');if(reason.length<5)return toast('اكتب سببًا واضحًا للتعديل.','error');try{const r=await API.requestPriceChange(sn,price,reason);toast(r.message||'تم إرسال طلب تعديل السعر.');await loadMyOffers();}catch(e){toast(e.message||'تعذر طلب تعديل السعر.','error');}}