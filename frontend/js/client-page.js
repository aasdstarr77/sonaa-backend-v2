
'use strict';
let globalRefreshInProgress=false;
const IS_DEV=location.hostname==='localhost'||location.hostname==='127.0.0.1';
const log=(...args)=>{if(IS_DEV)console.log(...args)};
function escHtml(value){
  if(value==null)return '';
  return String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function escAttr(value){return escHtml(value).replace(/`/g,'&#96;')}

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

function sanitizeInput(value,max=500){
  return String(value||'').trim().slice(0,max)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g,'');
}
function normalizeDigits(value){
  return String(value??'').replace(/[٠-٩۰-۹]/g,d=>{
    const code=d.charCodeAt(0);
    return String(code>=0x0660&&code<=0x0669?code-0x0660:code-0x06F0);
  });
}
function containsPhoneNumber(value){
  const text=normalizeDigits(value);
  const chunks=text.match(/\d(?:\D{0,6}\d){9,14}/g)||[];
  for(const chunk of chunks){
    const digits=chunk.replace(/\D/g,'');
    for(let i=0;i<=digits.length-11;i++){
      if(/^01[0125]\d{8}$/.test(digits.slice(i,i+11)))return true;
    }
    if(/^201[0125]\d{8}$/.test(digits))return true;
    if(/^00201[0125]\d{8}$/.test(digits))return true;
  }
  return false;
}
function maskPhoneNumbers(value){
  const text=String(value??'');
  const chunks=text.match(/\d(?:\D{0,6}\d){9,14}/g)||[];
  let result=text;
  for(const chunk of chunks){
    const digits=normalizeDigits(chunk).replace(/\D/g,'');
    let shouldMask=false;
    for(let i=0;i<=digits.length-11;i++){
      if(/^01[0125]\d{8}$/.test(digits.slice(i,i+11))){
        shouldMask=true;
        break;
      }
    }
    if(/^201[0125]\d{8}$/.test(digits)||/^00201[0125]\d{8}$/.test(digits)){
      shouldMask=true;
    }
    if(shouldMask)result=result.replace(chunk,'[رقم تواصل مخفي]');
  }
  return result;
}
function validateNoPhoneInCustomerFields(payload){
  const fields=[
    ['اسم العميل',payload.clientName],
    ['المنطقة',payload.area],
    ['العنوان التفصيلي',payload.address],
    ['وصف المشكلة',payload.description],
    ['الميزانية',payload.budget],
    ['تفاصيل الشكوى',payload.complaintText],
    ['رسالة إضافية',payload.message]
  ];
  for(const [label,value] of fields){
    if(value!=null&&String(value).trim()&&containsPhoneNumber(value)){
      throw new Error('ممنوع كتابة أرقام التليفونات داخل خانة '+label+'؛ استخدم خانة رقم التليفون المخصصة.');
    }
  }
  return true;
}
let AREA_OPTIONS=[];
const VALIDATORS={
  phone:value=>/^01[0125]\d{8}$/.test(normalizeDigits(String(value||'')).replace(/\D/g,'')),
  name:value=>String(value||'').trim().length>=2&&String(value||'').trim().length<=50,
  text:(value,min,max)=>String(value||'').trim().length>=min&&String(value||'').trim().length<=max,
  sn:value=>/^SN\d{6}$/i.test(String(value||'').trim())
};
let CATEGORIES=[];
let ALL_SERVICES=[];
const API={
  tokenKey(sn){return 'sonaa_client_token_'+String(sn||'').toUpperCase()},
  saveClientToken(sn,token){
    if(!VALIDATORS.sn(sn)||typeof token!=='string'||!token)return false;
    try{localStorage.setItem(this.tokenKey(sn),token);return true;}catch(error){log('تعذر حفظ بيانات المتابعة:',error);return false;}
  },
  getClientToken(sn){
    if(!VALIDATORS.sn(sn))return '';
    try{return localStorage.getItem(this.tokenKey(sn))||'';}catch(error){log('تعذر قراءة بيانات المتابعة:',error);return '';}
  },
  async request(url,options={}){
    let response;
    try{
      response=await fetch(url,{...options,credentials:'same-origin',headers:{...(options.headers||{})}});
    }catch(error){
      log('تعذر إتمام الطلب:',error);
      throw new Error('تعذر الاتصال. تأكد من اتصال الإنترنت وحاول مرة أخرى.');
    }
    const raw=await response.text();
    let data={};
    try{data=raw?JSON.parse(raw):{};}catch{data={};}
    log('استجابة الطلب:',response.status,data);
    if(!response.ok){
      const serverMessage=response.status===404||response.status>=500?'تعذر تنفيذ طلبك حاليًا. حاول مرة أخرى.':(typeof data.message==='string'&&data.message.trim()?data.message.trim():'');
      const error=new Error(serverMessage||(response.status===404?'لم نتمكن من العثور على البيانات المطلوبة.':'حصلت مشكلة أثناء تنفيذ الطلب. حاول مرة أخرى.'));
      error.status=response.status;
      error.details=Array.isArray(data.details)?data.details:[];
      throw error;
    }
    return data;
  },
  async registerClient(payload){return this.request('/api/client/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});},
  async loginClient(payload){return this.request('/api/client/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});},
  async getClientMe(token){return this.request('/api/client/me',{method:'GET',headers:{Authorization:'Bearer '+token}});},
  async getMyOrders(){return this.request('/api/client/orders',{method:'GET',headers:{Authorization:'Bearer '+state.accountToken}});},
  async getNotifications(){return this.request('/api/notifications/client',{method:'GET',headers:{Authorization:'Bearer '+state.accountToken}});},
  async readNotification(id){return this.request('/api/notifications/client/'+encodeURIComponent(id)+'/read',{method:'PATCH',headers:{Authorization:'Bearer '+state.accountToken}});},
  async readAllNotifications(){return this.request('/api/notifications/client/read-all',{method:'PATCH',headers:{Authorization:'Bearer '+state.accountToken}});},
  async claimOldOrder(sn){
    const oldToken=this.getClientToken(sn);
    if(!oldToken)throw new Error('لم نعثر على رمز الملكية القديم لهذا الطلب على هذا الجهاز. لو فقدته، تواصل مع الإدارة.');
    return this.request('/api/client/orders/claim',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+state.accountToken},body:JSON.stringify({sn,clientToken:oldToken})});
  },
  async getAreas(){
    const data=await this.request('/api/areas',{method:'GET'});
    return Array.isArray(data?.areas)?data.areas:[];
  },
  async getServices(){
    const data=await this.request('/api/services',{method:'GET'});
    if(!data||typeof data!=='object')throw new Error('استجابة الخدمات غير سليمة.');
    const categories=Array.isArray(data.categories)?data.categories:[];
    const services=Array.isArray(data.services)?data.services:[];
    if(!categories.length||!services.length)throw new Error('قائمة الخدمات غير متاحة حاليًا. حاول مرة أخرى بعد قليل.');
    for(const cat of categories){
      if(!cat||typeof cat.label!=='string'||!Array.isArray(cat.services))throw new Error('بيانات الأقسام غير سليمة.');
    }
    return data;
  },
  async createOrder(payload){
    if(state.servicesLoading){throw new Error('جاري تحميل قائمة الخدمات، انتظر لحظة وحاول مرة أخرى.');}
    if(state.servicesError){throw new Error('تعذر تحميل قائمة الخدمات. حدّث الصفحة أو حاول مرة أخرى: '+state.servicesError);}
    if(!ALL_SERVICES.length){throw new Error('قائمة الخدمات غير متاحة حاليًا. حدّث الصفحة وحاول مرة أخرى.');}
    if(!VALIDATORS.name(payload.clientName))throw new Error('اكتب اسمك بشكل صحيح، من حرفين إلى 50 حرفًا.');
    if(!payload.service||!ALL_SERVICES.includes(payload.service))throw new Error('اختار الخدمة المطلوبة من القائمة الرسمية.');
    if(!VALIDATORS.text(payload.area,2,100))throw new Error('اكتب المنطقة أو الحي من حرفين على الأقل.');
    if(!VALIDATORS.text(payload.address,5,250))throw new Error('اكتب العنوان التفصيلي بشكل صحيح.');
    if(!VALIDATORS.phone(payload.phone))throw new Error('رقم التليفون غير صحيح؛ لازم يكون 11 رقم ويبدأ بـ 01.');
    const description=String(payload.description||'').trim(),voiceRecordingData=String(payload.voiceRecordingData||'');if(description.length<10&&!voiceRecordingData)throw new Error('اكتب وصف المشكلة أو سجّل فويس يوضح المشكلة قبل إرسال الطلب.');
    validateNoPhoneInCustomerFields({...payload,description});
    const data=await this.request('/api/orders',{
      method:'POST',
      headers:{'Content-Type':'application/json',Authorization:'Bearer '+state.accountToken},
      body:JSON.stringify({
        clientName:sanitizeInput(payload.clientName,50),
        service:sanitizeInput(payload.service,100),
        area:sanitizeInput(payload.area,100),
        address:sanitizeInput(payload.address,250),
        phone:normalizeDigits(String(payload.phone)).replace(/\D/g,''),
        description:sanitizeInput(payload.description||'',1000),
        ...(voiceRecordingData?{voiceRecordingData}:{}),
        budget:sanitizeInput(payload.budget||'',50)
      })
    });
    const order=data.order||data.data||{};
    const sn=String(data.sn||order.sn||'').toUpperCase();
    const token=data.clientToken||order.clientToken||'';
    if(!VALIDATORS.sn(sn))throw new Error('تعذر إنشاء الطلب بشكل صحيح. حاول مرة أخرى، وإذا تكررت المشكلة تواصل مع خدمة العملاء.');
    if(token)this.saveClientToken(sn,token);
    return {...data,sn,clientToken:token};
  },
  async getOrder(sn){
    const cleanSN=sanitizeInput(sn,20).toUpperCase();
    if(!VALIDATORS.sn(cleanSN))throw new Error('كود التتبع غير صحيح. راجع الكود وحاول مرة أخرى.');
    const token=this.getClientToken(cleanSN)||state.accountToken;
    const headers={};
    if(token)headers.Authorization='Bearer '+token;
    const data=await this.request('/api/orders/'+encodeURIComponent(cleanSN),{method:'GET',headers});
    return data.order||data.data||data;
  },
  async acceptOffer(sn,offerId){
    const cleanSN=sanitizeInput(sn,20).toUpperCase();
    if(!VALIDATORS.sn(cleanSN))throw new Error('كود الطلب غير صحيح.');
    if(!offerId)throw new Error('تعذر تحديد العرض المطلوب.');
    const token=this.getClientToken(cleanSN)||state.accountToken;
    if(!token)throw new Error('لم نتمكن من تأكيد ملكية الطلب على هذا الجهاز. استخدم الجهاز الذي أنشأت الطلب منه، أو الجهاز الذي حُفظت عليه بيانات المتابعة.');
    return this.request('/api/orders/'+encodeURIComponent(cleanSN)+'/accept',{
      method:'POST',
      headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},
      body:JSON.stringify({offerId,clientToken:token})
    });
  },
  async cancelOrder(sn){
    const cleanSN=sanitizeInput(sn,20).toUpperCase();
    if(!VALIDATORS.sn(cleanSN))throw new Error('كود الطلب غير صحيح.');
    const token=this.getClientToken(cleanSN)||state.accountToken;
    if(!token)throw new Error('سجّل الدخول أو افتح الطلب من الجهاز الذي حُفظت عليه بيانات المتابعة.');
    return this.request('/api/orders/'+encodeURIComponent(cleanSN)+'/cancel',{
      method:'POST',
      headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},
      body:JSON.stringify({clientToken:token})
    });
  },
  async chat(sn){const token=this.getClientToken(sn)||state.accountToken;if(!token)throw new Error('سجّل الدخول لمتابعة المحادثة.');return this.request('/api/orders/'+encodeURIComponent(sn)+'/chat',{method:'GET',headers:{Authorization:'Bearer '+token}});},
  async sendChat(sn,text,offerId){const token=this.getClientToken(sn)||state.accountToken;if(!token)throw new Error('سجّل الدخول لمتابعة المحادثة.');return this.request('/api/orders/'+encodeURIComponent(sn)+'/chat',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({text,...(offerId?{offerId}:{})})});},
  async decidePrice(sn,id,approved){const token=this.getClientToken(sn)||state.accountToken;if(!token)throw new Error('سجّل الدخول لمتابعة الطلب.');return this.request('/api/orders/'+encodeURIComponent(sn)+'/price-change/'+encodeURIComponent(id)+'/decision',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({approved})});},
  async rateOrder(sn,payload){
    const cleanSN=sanitizeInput(sn,20).toUpperCase();
    if(!VALIDATORS.sn(cleanSN))throw new Error('كود الطلب غير صحيح.');
    const token=this.getClientToken(cleanSN)||state.accountToken;
    if(!token)throw new Error('لازم تسجّل الدخول بحسابك لمتابعة الطلب حتى نتحقق من ملكيتك.');
    return this.request('/api/orders/'+encodeURIComponent(cleanSN)+'/rating',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({...payload,clientToken:token})});
  },
  async sendComplaint(payload){
    const sn=sanitizeInput(payload?.sn,20).toUpperCase();
    const clientName=sanitizeInput(payload?.clientName,50);
    const text=sanitizeInput(payload?.text,1000);
    if(!VALIDATORS.sn(sn)){throw new Error('كود الطلب غير صحيح.');}
    if(!VALIDATORS.name(clientName)){throw new Error('اكتب اسم العميل المسجل مع الطلب، من حرفين إلى 50 حرفًا.');}
    if(containsPhoneNumber(clientName)){throw new Error('ممنوع كتابة رقم تليفون داخل اسم العميل.');}
    if(!VALIDATORS.text(text,10,1000)){throw new Error('اكتب تفاصيل الشكوى في 10 حروف على الأقل.');}
    if(containsPhoneNumber(text)){throw new Error('ممنوع كتابة رقم تليفون داخل تفاصيل الشكوى.');}
    return this.request('/api/complaints',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sn,clientName,text})});
  },
  async trackComplaints(payload){
    const sn=sanitizeInput(payload?.sn,20).toUpperCase();
    const clientName=sanitizeInput(payload?.clientName,50);
    if(!sn||!clientName){throw new Error('EMPTY_FIELDS');}
    if(!VALIDATORS.sn(sn)){throw new Error('INVALID_SN');}
    if(!VALIDATORS.name(clientName)){throw new Error('INVALID_NAME');}
    const url='/api/complaints/track?sn='+encodeURIComponent(sn)+'&clientName='+encodeURIComponent(clientName);
    return this.request(url,{method:'GET'});
  }
};
const forceClientRegistration=(new URLSearchParams(window.location.search).get('tab')||'').replace(/[\u200B-\u200D\u2060\uFEFF]/g,'').trim().toLowerCase()==='register';
let state={
  account:null,accountInitializing:false,accountToken:(()=>{if(window.IS_EDITOR_PREVIEW)return '';try{return localStorage.getItem('sonaa_client_account_token')||'';}catch{return '';}})(),accountAuthMode:forceClientRegistration?'register':'login',accountLoading:false,accountError:'',myOrders:[],accountOrdersLoading:false,accountOrdersTab:'current',notifications:[],notificationsUnread:0,notificationsOpen:false,
  tab:'orders',service:'',clientName:'',area:'',address:'',phone:'',budget:'',desc:'',voiceBlob:null,voiceUrl:'',voiceRecordingData:'',voiceRecorder:null,voiceChunks:[],voiceRecording:false,loading:false,sn:null,
  trackInput:'',tracked:null,trackError:'',trackLoading:false,acceptingOffer:'',
  ratingStars:5,ratingComment:'',ratingSubmitting:false,
  complaintSn:'',complaintName:'',complaintText:'',complaintLoading:false,
  complaintTrackSn:'',complaintTrackName:'',complaintTrackLoading:false,complaintTrackError:'',complaintTrackResults:null,
  showService:false,openCategory:'',searchService:'',
  servicesLoading:true,servicesError:'',servicesLoaded:false,publicContent:{siteName:'صُنّاع',maintenance:false,maintenanceMessage:'',announcement:'',faqs:[]},
  
};
const CLIENT_TAB_DEFINITIONS=[{id:'new',label:'طلب جديد'},{id:'orders',label:'طلباتي'},{id:'complaint',label:'شكوى'}];
if(window.IS_EDITOR_PREVIEW){
  const previewTab=window.PREVIEW_REQUESTED_TAB||'login';
  if(previewTab==='register'){
    state.accountAuthMode='register';
  }else if(previewTab==='login'){
    state.accountAuthMode='login';
  }else{
    state.tab=previewTab;
    state.account={name:'معاينة المحرر',phone:''};
    state.clientName='معاينة المحرر';
  }
}
function getCat(service){return CATEGORIES.find(c=>c.services.includes(service))||null;}
function captureScrollPosition(){
  const list=document.getElementById('serviceList');
  return {pageY:window.scrollY||window.pageYOffset||0,listTop:list?list.scrollTop:0};
}
function restoreScrollPosition(position){
  if(!position)return;
  const list=document.getElementById('serviceList');
  if(list)list.scrollTop=position.listTop;
  window.scrollTo({top:position.pageY,left:0,behavior:'instant'});
}
function ratingSkipKey(role,sn){return 'sonaa_rating_skipped_'+role+'_'+String(sn||'').toUpperCase();}
function isRatingSkipped(role,sn){try{return localStorage.getItem(ratingSkipKey(role,sn))==='1';}catch{return false;}}
function skipClientRating(sn){try{localStorage.setItem(ratingSkipKey('client',sn),'1');}catch{}render();showToast('تم تخطي التقييم لهذا الطلب.','success');}
function focusClientPostAction(){if(!state.tracked)return;const sn=String(state.tracked.sn||'').toUpperCase();if(state.tracked.status==='تم الانتهاء'&&state.tracked.canRate&&!isRatingSkipped('client',sn)){document.getElementById('client-rating-'+sn)?.scrollIntoView({behavior:'smooth',block:'center'});return;}if(state.tracked.status==='تم اختيار فني'){document.getElementById('client-accepted-chat-'+sn)?.scrollIntoView({behavior:'smooth',block:'center'});}}
function showToast(message,type='error'){
  const el=document.getElementById('toast');
  if(!el)return;
  const color=type==='success'?'bg-emerald-600':'bg-[#0b1b3a]';
  el.innerHTML=`<div class="pointer-events-auto mx-auto max-w-[480px] rounded-[14px] ${color} text-white text-[13px] font-bold px-4 py-3 shadow-2xl flex justify-between items-center gap-3">
    <span class="leading-6">${escHtml(message)}</span>
    <button onclick="this.parentElement.remove()" class="shrink-0 h-7 px-3 rounded-full bg-white/20">إغلاق</button>
  </div>`;
  setTimeout(()=>{if(el)el.innerHTML='';},4500);
}
function goBack(){if(window.history.length>1){window.history.back();return;}window.location.href='/';}
function showLogoutConfirmation(){if(document.getElementById('logoutConfirmOverlay'))return;const overlay=document.createElement('div');overlay.id='logoutConfirmOverlay';overlay.className='logout-confirm-overlay';overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-labelledby','logoutConfirmTitle');overlay.innerHTML='<div class="logout-confirm-card"><div class="logout-confirm-icon" aria-hidden="true">↪</div><h2 id="logoutConfirmTitle" class="text-xl font-black text-slate-900">تأكيد تسجيل الخروج</h2><p class="mt-3 text-sm leading-6 font-bold text-slate-600">متأكد إنك عايز تسجّل خروج من حسابك؟</p><div class="mt-6 grid grid-cols-2 gap-3"><button type="button" class="logout-confirm-btn logout-confirm-cancel" data-logout-action="cancel">لا، خليك معايا</button><button type="button" class="logout-confirm-btn logout-confirm-yes" data-logout-action="confirm">أيوه، خروج</button></div></div>';document.body.appendChild(overlay);overlay.addEventListener('click',function(e){if(e.target===overlay||e.target.closest('[data-logout-action="cancel"]')){overlay.remove();return;}if(e.target.closest('[data-logout-action="confirm"]')){overlay.remove();performClientLogout();}});overlay.querySelector('[data-logout-action="cancel"]').focus();}
function performClientLogout(){try{localStorage.removeItem('sonaa_client_account_token');}catch(e){}state.accountToken='';state.account=null;state.notifications=[];state.notificationsUnread=0;state.notificationsOpen=false;state.myOrders=[];state.tracked=null;state.tab='new';state.accountError='';render();}
function logoutClient(){showLogoutConfirmation();}
function renderAccountGate(){
  var reg=state.accountAuthMode==='register';
  document.title=reg?'تسجيل عميل جديد | صُنّاع':'تسجيل دخول العميل | صُنّاع';
  var h='<main class="account-gate min-h-screen px-4 py-8 flex items-center justify-center"><div class="w-full max-w-[440px]"><nav dir="rtl" class="account-top-nav mb-5 flex items-center justify-start gap-2"><a href="/" aria-label="القائمة الرئيسية" title="القائمة الرئيسية" class="account-nav-btn account-home-btn h-10 px-4 rounded-xl inline-flex items-center justify-center text-xs font-black">⌂ القائمة الرئيسية</a><a href="https://aasdstarr77.github.io/sonaa-download/" aria-label="تحميل تطبيق صُنّاع" title="تحميل تطبيق صُنّاع" class="account-nav-btn account-download-btn h-10 px-4 rounded-xl inline-flex items-center justify-center text-xs font-black">⬇ تحميل التطبيق</a><button type="button" onclick="goBack()" class="account-nav-btn h-10 px-3 rounded-xl border border-slate-200 bg-white text-slate-700 text-xs font-extrabold">← رجوع</button></nav><div class="text-center mb-6"><div class="account-brand brand-mark mx-auto h-24 w-24 rounded-2xl flex items-center justify-center"><img class="sonaa-logo-svg" src="/images/LOGO_UPLOAD_HERE/logo.png" alt="شعار صُنّاع" width="144" height="144" decoding="async"></div><h1 class="mt-4 text-2xl font-black">'+(reg?'تسجيل عميل جديد':'تسجيل دخول العميل')+'</h1><p class="account-slogan mt-1 text-sm">صُنّاع كل خدمة تبدأ بخطوة</p><p class="mt-2 text-sm leading-6 text-slate-600">'+(reg?'أنشئ حساب عميل جديد علشان تطلب الخدمات وتتابع طلباتك.':'سجّل دخولك علشان تطلب خدمة وتتابع طلباتك من حسابك.')+'</p></div><div class="panel account-panel p-5"><div class="account-tabs grid grid-cols-1 gap-2"><button type="button" onclick="setAccountAuthMode(this.dataset.next)" data-next="'+(reg?'login':'register')+'" class="account-switch-link"  aria-label="'+(reg?'تسجيل الدخول':'تسجيل عميل جديد')+'"><span>'+(reg?'لتسجيل الدخول':'لتسجيل عميل جديد')+'</span><small>اضغط هنا</small></button></div><form class="mt-5 space-y-4" onkeydown="if(state.accountAuthMode===\'login\'&&event.key===\'Enter\'){event.preventDefault();if(event.target&&event.target.id===\'accountPassword\'){window.__sonaaClientLoginIntent=true;submitClientAccount(event);}else{document.getElementById(\'accountPassword\').focus();}}" onsubmit="if(state.accountAuthMode===\'login\'&&!window.__sonaaClientLoginIntent){event.preventDefault();return false;}window.__sonaaClientLoginIntent=false;submitClientAccount(event)">';
  if(reg)h+='<div><label class="block mb-1.5 text-xs font-extrabold">الاسم بالكامل</label><input id="accountName" required minlength="2" maxlength="50" autocomplete="name" class="field h-12 px-3 text-sm" placeholder="اكتب اسمك"></div>';
  h+='<div><label class="block mb-1.5 text-xs font-extrabold">رقم الموبايل</label><input id="accountPhone" required type="tel" inputmode="tel" autocomplete="tel" maxlength="20" class="field h-12 px-3 text-sm" placeholder="01012345678" dir="ltr"></div><div><label class="block mb-1.5 text-xs font-extrabold">كلمة السر</label><input id="accountPassword" required type="password" minlength="'+(reg?8:1)+'" maxlength="128" autocomplete="'+(reg?'new-password':'current-password')+'" class="field h-12 px-3 text-sm" placeholder="'+(reg?'8 أحرف على الأقل':'اكتب كلمة السر')+'"></div>';
  if(!reg)h+='<p class="mt-2 text-left"><a class="text-xs font-bold text-blue-700" href="password.html?role=client&mode=recovery">نسيت كلمة المرور؟</a></p>';if(reg)h+='<div><label class="block mb-1.5 text-xs font-extrabold">تأكيد كلمة السر</label><input id="accountConfirmPassword" required type="password" minlength="8" maxlength="128" autocomplete="new-password" class="field h-12 px-3 text-sm" placeholder="أعد كتابة كلمة السر"></div>';
  if(state.accountError)h+='<p class="rounded-xl bg-red-50 border border-red-200 p-3 text-xs leading-6 font-bold text-red-700">'+escHtml(state.accountError)+'</p>';
  h+='<button type="submit" '+(state.accountLoading?'disabled':'')+' onclick="window.__sonaaClientLoginIntent=true" class="account-submit w-full h-12 rounded-xl blue-btn font-extrabold text-sm">'+(state.accountLoading?'جاري التنفيذ...':reg?'إنشاء حساب العميل':'دخول إلى حسابي')+'</button></form><p class="mt-4 text-center text-[10px] leading-5 text-slate-500">كلمة السر لا تُشارك مع أي شخص.</p></div></div></main>';
  document.getElementById('app').innerHTML=h+renderPublicContent()+`<a href="support.html?role=client" aria-label="خدمة العملاء" title="خدمة العملاء" class="support-float prelogin-floating"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 13v-2a8 8 0 0 1 16 0v2"/><rect x="3" y="12" width="4" height="7" rx="2"/><rect x="17" y="12" width="4" height="7" rx="2"/><path d="M17 19a5 5 0 0 1-5 2h-1"/></svg></a><button id="global-refresh" type="button" onclick="handleGlobalRefresh()" aria-label="تحديث البيانات" title="تحديث البيانات" class="global-refresh global-refresh-float prelogin-floating ${globalRefreshInProgress?'is-refreshing':''}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 7v5h-5"/><path d="M4 17v-5h5"/><path d="M5.6 9A7 7 0 0 1 17 5l3 7M4 12l3 7a7 7 0 0 0 11.4-2"/></svg></button>`;
}
function renderPublicContent(){
  const c=state.publicContent||{announcement:'',faqs:[]};
  const faqs=Array.isArray(c.faqs)?c.faqs:[];
  if(!c.maintenance&&!String(c.announcement||'').trim()&&!faqs.length)return '';
  return '<section class="mx-auto mt-3 w-full max-w-[640px] px-3 sm:px-4 space-y-2">'+
    (c.maintenance?'<div class="panel border-amber-300 bg-amber-50 p-3 text-[12px] font-extrabold leading-6 text-amber-900">النظام في وضع الصيانة: '+escHtml(c.maintenanceMessage||'الخدمة متوقفة مؤقتًا. حاول لاحقًا.')+'</div>':'')+
    (String(c.announcement||'').trim()?'<div class="panel border-blue-200 bg-blue-50 p-3 text-[12px] font-bold leading-6">'+escHtml(c.announcement)+'</div>':'')+
    (faqs.length?'<details class="panel p-3"><summary class="cursor-pointer text-[12px] font-extrabold">الأسئلة الشائعة</summary><div class="mt-3 space-y-3">'+faqs.map(f=>'<div class="border-t pt-2"><p class="text-[11px] font-extrabold">'+escHtml(f.question)+'</p><p class="mt-1 text-[11px] leading-5 text-slate-600">'+escHtml(f.answer)+'</p></div>').join('')+'</div></details>':'')+
    '</section>';
}
async function loadPublicContent(){
  try{const data=await API.request('/api/content',{method:'GET'});state.publicContent={siteName:String(data.siteName||'صُنّاع'),maintenance:!!data.maintenance,maintenanceMessage:String(data.maintenanceMessage||''),announcement:String(data.announcement||''),faqs:Array.isArray(data.faqs)?data.faqs:[]};document.title=state.account?'صُنّاع - طلباتي':(state.accountAuthMode==='register'?'تسجيل عميل جديد | صُنّاع':'تسجيل دخول العميل | صُنّاع');render();}catch(error){log('تعذر تحميل محتوى الواجهة:',error);}
}
function setAccountAuthMode(mode){state.accountAuthMode=mode==='register'?'register':'login';state.accountError='';render();}
async function submitClientAccount(e){
  e.preventDefault();if(state.accountLoading)return;
  var reg=state.accountAuthMode==='register',name=String(document.getElementById('accountName')?.value||'').trim();
  var phone=normalizeDigits(String(document.getElementById('accountPhone')?.value||'')).replace(/\D/g,'');
  var password=String(document.getElementById('accountPassword')?.value||''),confirmPassword=String(document.getElementById('accountConfirmPassword')?.value||'');
  if(!VALIDATORS.phone(phone)){state.accountError='رقم الموبايل غير صحيح؛ اكتب 11 رقمًا يبدأ بـ 01.';render();return;}
  if(reg&&(!VALIDATORS.name(name)||containsPhoneNumber(name))){state.accountError='اكتب اسمك بشكل صحيح من غير أرقام موبايلات.';render();return;}
  if(reg&&password.length<8){state.accountError='كلمة السر لازم تكون 8 أحرف على الأقل.';render();return;}
  if(reg&&password!==confirmPassword){state.accountError='كلمة السر وتأكيدها مش متطابقين.';render();return;}
  state.accountLoading=true;state.accountError='';render();
  try{
    var d=reg?await API.registerClient({name:name,phone:phone,password:password,confirmPassword:confirmPassword}):await API.loginClient({phone:phone,password:password});
    if(!d.token||!d.client)throw new Error('تعذر إتمام تسجيل الدخول. تحقق من بياناتك وحاول مرة أخرى.');
    state.accountToken=window.IS_EDITOR_PREVIEW?'':d.token;state.account=window.IS_EDITOR_PREVIEW?null:d.client;if(!window.IS_EDITOR_PREVIEW){try{localStorage.setItem('sonaa_client_account_token',d.token);}catch(e){}}
    state.clientName=d.client.name||name;state.phone=d.client.phone||phone;state.tab='orders';state.accountError='';showToast(d.message||'تم تسجيل الدخول بنجاح','success');await loadMyOrders(false);await loadNotifications();
  }catch(error){state.accountError=error.message||'تعذر إتمام العملية.';}
  finally{state.accountLoading=false;render();}
}
async function initializeClientAccount(){
  if(!state.accountToken){render();return;}
  /* Keep the login form hidden while a saved session is being verified. */
  state.accountInitializing=true;
  render();
  try{
    var d=await API.getClientMe(state.accountToken);
    state.account=d.client||null;
    if(state.account){
      state.clientName=state.account.name||'';
      state.phone=state.account.phone||'';
      state.tab='orders';
      await Promise.allSettled([loadMyOrders(false),loadNotifications()]);
    }else{
      state.accountToken='';
      try{localStorage.removeItem('sonaa_client_account_token');}catch(e){}
    }
  }catch(error){
    state.accountToken='';
    state.account=null;
    try{localStorage.removeItem('sonaa_client_account_token');}catch(e){}
  }finally{
    state.accountInitializing=false;
    render();
  }
}

async function loadMyOrders(showLoading=true){
  if(!state.accountToken||!state.account)return;
  if(showLoading){state.accountOrdersLoading=true;render();}
  try{var d=await API.getMyOrders();state.myOrders=Array.isArray(d.orders)?d.orders:[];}
  catch(error){showToast(error.message||'تعذر تحميل طلباتك.');}
  finally{state.accountOrdersLoading=false;if(showLoading)render();}
}
async function openAccountOrder(sn,jumpToChat=false){
  state.trackInput=sn;state.trackLoading=true;state.trackError='';state.tracked=null;state.tab='track';render();
  try{state.tracked=await API.getOrder(sn);}catch(error){state.trackError=error.message||'تعذر تحميل تفاصيل الطلب.';}
  finally{state.trackLoading=false;render();if(jumpToChat){const chat=document.getElementById('client-accepted-chat-'+String(sn).replace(/[^a-zA-Z0-9_-]/g,''));if(chat)chat.scrollIntoView({behavior:'smooth',block:'center'});else showToast('المحادثة تظهر بعد قبول العرض.');}}
}
function renderOrders(){
  var h='<div class="client-orders-content mt-4 space-y-3"><div class="client-orders-summary panel p-4 flex items-center justify-between gap-3"><div><h3 class="font-extrabold text-[15px]">طلباتي</h3><p class="mt-1 text-[11px] text-slate-500">تابع كل طلباتك من هنا.</p></div></div>';
  const closedStatuses=['تم الانتهاء','منتهي','ملغي','مؤرشف','منتهي - اعتذار'];
  const currentOrders=state.myOrders.filter(o=>!closedStatuses.includes(String(o.status||'')));
  const previousOrders=state.myOrders.filter(o=>closedStatuses.includes(String(o.status||'')));
  const visibleOrders=state.accountOrdersTab==='previous'?previousOrders:currentOrders;
  h+='<div class="client-orders-status-tabs grid grid-cols-2 gap-2 p-1 rounded-xl"><button type="button" onclick="state.accountOrdersTab=\'current\';render()" class="client-orders-status-tab h-10 rounded-lg text-xs font-extrabold '+(state.accountOrdersTab==='current'?'tab-active':'tab-idle')+'">طلبات جارية ('+currentOrders.length+')</button><button type="button" onclick="state.accountOrdersTab=\'previous\';render()" class="client-orders-status-tab h-10 rounded-lg text-xs font-extrabold '+(state.accountOrdersTab==='previous'?'tab-active':'tab-idle')+'">طلبات سابقة ('+previousOrders.length+')</button></div>';
  if(state.accountOrdersLoading)return h+'<div class="panel p-8 text-center text-sm font-bold text-slate-500">جاري تحميل طلباتك...</div></div>';
  if(!visibleOrders.length)return h+'<div class="panel p-8 text-center"><div class="text-3xl">📝</div><p class="mt-3 font-extrabold text-sm">'+(state.accountOrdersTab==='previous'?'لا توجد طلبات سابقة.':'لا توجد طلبات جارية.')+'</p><button type="button" onclick="setTab(\'new\')" class="mt-4 h-11 px-5 rounded-xl blue-btn text-xs font-extrabold">إنشاء طلب جديد</button></div></div>';
  h+='<div class="space-y-3">';
  visibleOrders.forEach(function(o){
    h+='<div class="panel p-4"><div class="flex items-start justify-between gap-3"><div class="min-w-0"><p class="text-[10px] text-slate-500">رقم الطلب</p><h4 class="mt-1 font-extrabold text-sm">'+escHtml(o.sn||'طلب')+'</h4><p class="mt-2 text-sm font-extrabold">'+escHtml(o.service||'')+'</p><p class="mt-1 text-[11px] text-slate-500">'+escHtml(o.area||'')+'</p></div><span class="shrink-0 rounded-full bg-blue-50 border border-blue-100 px-3 py-1.5 text-[10px] font-extrabold text-blue-800">'+escHtml(o.status||'قيد المراجعة')+'</span></div><p class="mt-3 text-xs leading-6 text-slate-600">'+escHtml(maskPhoneNumbers(o.description||''))+'</p>';
    const pendingPriceRequests=(o.priceChangeRequests||[]).filter(r=>r.status==='قيد الموافقة');
    if(o.status==='تم اختيار فني'&&pendingPriceRequests.length){h+=pendingPriceRequests.map(r=>'<div class="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3"><p class="text-xs font-extrabold text-amber-900">طلب زيادة السعر إلى '+escHtml(String(r.newPrice))+' جنيه</p><p class="mt-1 text-[11px] leading-5 text-amber-900">'+escHtml(r.reason||'')+'</p><div class="mt-2 flex gap-2"><button type="button" onclick="decideClientPrice(\''+escAttr(o.sn)+'\',\''+escAttr(r._id)+'\',true)" class="flex-1 rounded-lg bg-emerald-600 p-2 text-white text-xs font-bold">موافقة</button><button type="button" onclick="decideClientPrice(\''+escAttr(o.sn)+'\',\''+escAttr(r._id)+'\',false)" class="flex-1 rounded-lg bg-red-600 p-2 text-white text-xs font-bold">رفض</button></div></div>').join('');}
    if(Array.isArray(o.offers)&&o.offers.length){h+='<p class="mt-3 text-xs font-extrabold">عروض الفنيين ('+o.offers.length+')</p>';o.offers.forEach(function(v){h+='<div class="mt-2 rounded-xl bg-slate-50 border border-slate-100 p-3"><div class="flex justify-between gap-2"><span class="text-xs font-extrabold">'+escHtml(v.fanniName||'فني')+'</span><span class="text-sm font-black text-blue-700">'+escHtml(v.price==null?'':String(v.price))+' جنيه</span></div><div class="mt-2 flex flex-wrap gap-2 text-[10px] font-extrabold"><span class="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-amber-800">★ '+Number(v.fanniRatingAverage||0).toFixed(1)+' ('+Number(v.fanniRatingCount||0)+' تقييم)</span><span class="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-emerald-800">✓ '+Number(v.fanniCompletedJobs||0)+' عمل مكتمل</span></div><p class="mt-1 text-[11px] leading-5 text-slate-600">'+escHtml(maskPhoneNumbers(v.message||''))+'</p>';if(o.status==='تم اختيار فني')h+='<p class="mt-2 text-[11px] font-extrabold text-emerald-700">تم اختيار فني</p>';else if(!['تم الانتهاء','منتهي','اعتذار','منتهي - اعتذار','ملغي','مؤرشف'].includes(o.status))h+='<button type="button" onclick="acceptAccountOffer(\''+escAttr(o.sn)+'\',\''+escAttr(String(v._id||''))+'\')" class="mt-2 w-full h-10 rounded-lg blue-btn text-xs font-extrabold">قبول العرض</button>';h+='</div>';});}
    else h+='<p class="mt-3 text-[11px] text-slate-500">لا توجد عروض حتى الآن.</p>';
    h+='<button type="button" onclick="openAccountOrder(\''+escAttr(o.sn)+'\')" class="mt-3 w-full h-10 rounded-xl bg-slate-100 text-slate-800 text-xs font-extrabold">تفاصيل الطلب</button>';
    if(o.status==='تم اختيار فني')h+='<button type="button" onclick="openAccountOrder(\''+escAttr(o.sn)+'\',true)" class="mt-2 w-full h-10 rounded-xl blue-btn text-xs font-extrabold">الدخول إلى المحادثة</button>';
    if(!['تم اختيار فني','تم الانتهاء','ملغي','مؤرشف','منتهي','منتهي - اعتذار'].includes(String(o.status||'')))h+='<button type="button" onclick="cancelAccountOrder(\''+escAttr(o.sn)+'\')" class="mt-2 w-full h-10 rounded-xl border border-red-200 bg-red-50 text-red-700 text-xs font-extrabold">إلغاء الطلب</button>';
    h+='</div>';
  });
  return h+'</div></div>';
}

async function acceptAccountOffer(sn,id){if(!confirm('تأكيد قبول هذا العرض؟'))return;try{await API.acceptOffer(sn,id);showToast('تم قبول العرض بنجاح','success');await loadMyOrders(false);render();}catch(error){showToast(error.message||'تعذر قبول العرض.');}}
async function cancelAccountOrder(sn){
  const cleanSN=String(sn||'').trim().toUpperCase();
  if(!VALIDATORS.sn(cleanSN)){showToast('كود الطلب غير صحيح.');return;}
  if(!confirm('هل تريد إلغاء الطلب '+cleanSN+'؟ لن يمكن التراجع عن الإلغاء.'))return;
  try{
    const result=await API.cancelOrder(cleanSN);
    showToast(result.message||'تم إلغاء الطلب بنجاح.','success');
    await loadMyOrders(false);
    if(state.trackInput===cleanSN){state.tracked=null;state.trackError='';}
    render();
  }catch(error){showToast(error.message||'تعذر إلغاء الطلب.');}
}


async function loadNotifications(){
 if(!state.accountToken||!state.account)return;
 try{const data=await API.getNotifications();state.notifications=Array.isArray(data.notifications)?data.notifications:[];state.notificationsUnread=Number(data.unreadCount||0);var badge=document.getElementById('notificationBadge');if(badge)badge.textContent=state.notificationsUnread?(state.notificationsUnread>99?'99+':String(state.notificationsUnread)):'';if(state.notificationsOpen)render();}
 catch(error){log('تعذر تحميل الإشعارات:',error.message);}
}
async function toggleNotifications(){state.notificationsOpen=!state.notificationsOpen;if(state.notificationsOpen)await loadNotifications();render();}
async function openNotification(id){var previous=state.notifications.find(function(n){return n.id===id;});try{if(previous&&!previous.read)await API.readNotification(id);}catch(error){}state.notifications=state.notifications.map(function(n){return n.id===id?Object.assign({},n,{read:true}):n;});if(previous&&!previous.read)state.notificationsUnread=Math.max(0,state.notificationsUnread-1);state.notificationsOpen=false;if(previous&&previous.link&&previous.link.indexOf('tab=orders')>=0){state.tab='orders';await loadMyOrders(false);}else if(previous&&previous.link&&previous.link.indexOf('tab=complaint')>=0){state.tab='complaint';}render();}
async function markAllNotificationsRead(){try{await API.readAllNotifications();state.notifications=state.notifications.map(function(n){return Object.assign({},n,{read:true});});state.notificationsUnread=0;render();}catch(error){showToast(error.message||'تعذر تحديث الإشعارات.');}}
function notificationBadge(){return '<span id="notificationBadge" class="absolute -right-1 -top-1 min-w-[17px] rounded-full bg-red-600 px-1 text-[9px] font-black text-white">'+(state.notificationsUnread?(state.notificationsUnread>99?'99+':state.notificationsUnread):'')+'</span>';}
function notificationPanel(){
 if(!state.notificationsOpen)return '';
 var html='<div class="fixed inset-0 z-[99]" onclick="state.notificationsOpen=false;render()"></div><div class="fixed left-3 right-3 top-[70px] z-[100] mx-auto max-w-[420px] overflow-hidden rounded-2xl border border-amber-200 bg-white text-slate-800 shadow-2xl"><div class="flex items-center justify-between gap-2 border-b p-3"><b class="text-[15px] font-extrabold">الإشعارات</b><div class="flex items-center gap-3"><button onclick="markAllNotificationsRead()" class="text-[12px] font-extrabold text-blue-700">تعليم الكل كمقروء</button><button type="button" aria-label="إغلاق الإشعارات" title="إغلاق" onclick="state.notificationsOpen=false;render()" class="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-2xl font-bold leading-none text-slate-700 hover:bg-slate-200">×</button></div></div><div class="max-h-[60vh] overflow-y-auto">';
 if(!state.notifications.length)html+='<p class="p-6 text-center text-[12px] text-slate-500">مفيش إشعارات لحد دلوقتي.</p>';
 state.notifications.forEach(function(n){html+='<button type="button" data-notification-id="'+escAttr(n.id)+'" class="notification-item block w-full border-b p-3 text-right '+(n.read?'bg-white':'bg-amber-50')+'"><b class="block text-[16px] font-bold text-slate-900">'+escHtml(n.title)+'</b><span class="mt-1 block text-[15px] font-semibold leading-7 text-slate-800">'+escHtml(n.message)+'</span><small class="mt-2 block text-[11px] font-medium text-slate-500">'+(n.createdAt?new Date(n.createdAt).toLocaleString('ar-EG'):'')+'</small></button>';});
 return html+'</div></div>';
}
document.addEventListener('click',function(event){var item=event.target.closest('[data-notification-id]');if(item)openNotification(item.getAttribute('data-notification-id'));});
document.addEventListener('focusout',function(){if(!clientLiveRenderPending||!state.account||!['orders','track'].includes(state.tab))return;setTimeout(function(){if(clientLiveRenderPending&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName)){clientLiveRenderPending=false;const scrollY=window.scrollY||window.pageYOffset||0;render();window.scrollTo({top:scrollY,left:0,behavior:'instant'});focusClientPostAction();}},0);});
function render(){
  if(!window.IS_EDITOR_PREVIEW&&forceClientRegistration&&!state.account){renderAccountGate();return;}
  if(!window.IS_EDITOR_PREVIEW&&state.accountInitializing&&!state.accountToken){renderAccountGate();return;}
  if(!state.account){
    if(state.accountToken&&state.accountInitializing){
      document.getElementById('app').innerHTML='<main class="account-gate min-h-screen px-4 py-8 flex items-center justify-center"><div class="w-full max-w-[440px] text-center"><div class="account-brand mx-auto mb-5 flex items-center justify-center"><img src="/images/LOGO_UPLOAD_HERE/logo.png" alt="صُنّاع" class="sonaa-logo-svg account-loading-logo"></div><h1 class="text-2xl font-black">صُنّاع</h1><p class="account-slogan mt-1 text-base font-extrabold">كل خدمة تبدأ بخطوة</p><div class="mt-7 inline-flex items-center gap-3 rounded-2xl border border-blue-200 bg-white/90 px-5 py-4 font-extrabold text-blue-900 shadow-xl"><span class="inline-block h-5 w-5 animate-spin rounded-full border-2 border-blue-600 border-t-transparent"></span>جاري تحميل البيانات...</div></div></main>';
      return;
    }
    renderAccountGate();return;
  }
  const cat=getCat(state.service);
  const query=state.searchService.trim().toLowerCase();
  const matching=CATEGORIES.map(c=>({
    ...c,
    services:c.services.filter(s=>!query||s.toLowerCase().includes(query)||c.label.toLowerCase().includes(query))
  })).filter(c=>c.services.length);
  const visibleCategories=query?matching:CATEGORIES;
  const selectedCategory=visibleCategories.find(c=>c.label===state.openCategory);
  document.getElementById('app').innerHTML=`
  <header class="app-header sticky top-0 z-40 backdrop-blur-xl">
    <div class="mx-auto w-full max-w-[640px] px-3 sm:px-4 py-2 flex items-center justify-between gap-2">
      <div class="flex items-center gap-2 min-w-0 flex-1">
        <div class="brand-mark h-16 w-16 sm:h-[84px] sm:w-[84px] rounded-xl flex items-center justify-center shrink-0"><img class="sonaa-logo-svg" src="/images/LOGO_UPLOAD_HERE/logo.png" alt="شعار صُنّاع" width="120" height="120" decoding="async"></div>
        <div class="min-w-0">
          <h1 class="font-extrabold text-[16px] leading-tight truncate">${escHtml(state.publicContent?.siteName||'صُنّاع')}</h1>
          <p class="client-header-slogan mt-2 text-sm sm:text-base font-black whitespace-nowrap">كل خدمة تبدأ بخطوة</p>
        </div>
      </div>
      <div class="flex flex-col items-end gap-1.5 shrink-0">
        <div class="flex items-center justify-end gap-1">
          <a href="https://aasdstarr77.github.io/sonaa-download/" aria-label="تحميل تطبيق صُنّاع" title="تحميل تطبيق صُنّاع" class="dashboard-download-btn h-9 px-2 sm:px-3 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-800 inline-flex items-center justify-center gap-1.5 text-[10px] sm:text-[11px] font-extrabold whitespace-nowrap"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/></svg><span>تحميل التطبيق</span></a>
          <button type="button" onclick="toggleNotifications()" aria-label="الإشعارات" class="relative h-9 w-9 rounded-xl border border-amber-200 bg-amber-50 text-[18px] text-amber-600 shrink-0">🔔${notificationBadge()}</button>
          <a href="password.html?role=client&mode=account" class="h-9 px-2 rounded-xl border border-blue-200 bg-blue-50 text-blue-800 inline-flex items-center justify-center text-[11px] font-extrabold whitespace-nowrap">حسابي</a>
          <button type="button" onclick="logoutClient()" class="h-9 px-2 rounded-xl bg-slate-100 text-slate-700 text-[11px] font-extrabold whitespace-nowrap">خروج</button>
        </div>
        <a href="/" aria-label="القائمة الرئيسية" title="القائمة الرئيسية" class="client-home-main-btn h-8 px-3 rounded-lg text-white inline-flex items-center justify-center gap-1 text-[10px] font-extrabold whitespace-nowrap"><span aria-hidden="true">⌂</span><span>القائمة الرئيسية</span></a>
      </div>

    </div>
  ${notificationPanel()}
  </header>
  <a href="support.html?role=client" aria-label="خدمة العملاء" title="خدمة العملاء" class="support-float"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 13v-2a8 8 0 0 1 16 0v2"/><rect x="3" y="12" width="4" height="7" rx="2"/><rect x="17" y="12" width="4" height="7" rx="2"/><path d="M17 19a5 5 0 0 1-5 2h-1"/></svg></a><button id="global-refresh" type="button" onclick="handleGlobalRefresh()" aria-label="تحديث البيانات" title="تحديث البيانات" class="global-refresh global-refresh-float ${globalRefreshInProgress?'is-refreshing':''}"><svg viewBox="0 0 24 24" width="23" height="23" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 7v5h-5"/><path d="M4 17v-5h5"/><path d="M5.6 9A7 7 0 0 1 17 5l3 7M4 12l3 7a7 7 0 0 0 11.4-2"/></svg></button>
  ${renderPublicContent()}
  <main class="mx-auto w-full max-w-[640px] px-3 sm:px-4 pb-[160px] safe-bottom">
    <div class="client-section-tabs sticky top-0 z-40 mt-0 flex p-1 bg-white/95 rounded-[15px] shadow-sm border border-slate-200 gap-1 backdrop-blur-xl">
      ${CLIENT_TAB_DEFINITIONS.map(t=>`
         <button type="button" onclick="setTab('${t.id}')" class="flex-1 h-11 rounded-xl text-[12px] font-extrabold transition-colors ${state.tab===t.id?'tab-active':'tab-idle'}">${t.label}</button>
      `).join('')}
    </div>
    ${state.tab==='new'?`
      ${!state.sn?`
      <div class="mt-4 space-y-3 animate-fade client-new-order">
        <div class="panel p-4 sm:p-5">
          <div class="flex items-center gap-3">
            <div class="h-10 w-10 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center text-xl">📝</div>
            <div>
              <h3 class="font-extrabold text-[15px]">بيانات الطلب</h3>
              <p class="text-[11px] text-slate-500 mt-0.5">اختار الخدمة واكتب تفاصيلها</p>
            </div>
          </div>
          <div class="mt-5 space-y-4">
            <div>
              <label for="clientNameInput" class="text-[12px] font-extrabold mb-1.5 block">👤 اسم العميل</label>
              <input id="clientNameInput" value="${escAttr(state.clientName)}" oninput="onClientNameInput(this.value)" maxlength="50" placeholder="اكتب اسمك بالكامل" class="field h-[50px] px-4 text-[13px] font-bold" autocomplete="name">
              <p class="mt-1 text-[10px] text-slate-400">من حرفين إلى 50 حرفًا. ممنوع كتابة رقم تليفون في هذه الخانة.</p>
            </div>
            <div>
              <label class="text-[12px] font-extrabold mb-1.5 block">نوع الخدمة ${state.servicesLoading?'<span class="text-blue-600 font-bold">(جاري التحميل...)</span>':state.servicesError?'<span class="text-red-600">(فشل التحميل)</span>':''}</label>
              <button type="button" onclick="toggleService()" aria-expanded="${state.showService?'true':'false'}" ${state.servicesLoading?'disabled':''} class="field h-[60px] px-3.5 text-right flex items-center justify-between ${state.servicesLoading?'opacity-70':''}">
                <span class="flex items-center gap-2.5 min-w-0">
                  <span class="h-10 w-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0 text-xl">${cat?escHtml(cat.emoji):'🛠️'}</span>
                  <span class="min-w-0">
                    <span class="block text-[13px] font-extrabold truncate">${state.servicesLoading?'جاري تحميل الخدمات...':state.servicesError?'تعذر تحميل الخدمات':cat?escHtml(state.service):'اختار الخدمة'}</span>
                    <span class="block text-[10px] text-slate-500 mt-0.5">${state.servicesLoading?'انتظر لحظة':state.servicesError?'اضغط لإعادة المحاولة':cat?escHtml(cat.label):'اضغط هنا لعرض الأقسام والخدمات'}</span>
                  </span>
                </span>
                <span class="text-slate-500 text-[12px]">${state.showService?'▲':'▼'}</span>
              </button>
              ${state.showService?`
              <div id="servicePanel" class="service-picker-dialog border border-slate-200">
                ${state.servicesLoading?`
                  <div class="p-6 text-center">
                    <div class="inline-block h-6 w-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                    <p class="mt-2 text-[12px] font-bold text-slate-600">جاري تحميل الخدمات...</p>
                  </div>
                `:state.servicesError?`
                  <div class="p-4 text-center">
                    <p class="text-[12px] font-bold text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">${escHtml(state.servicesError)}</p>
                    <button type="button" onclick="loadServices()" class="mt-3 h-10 px-4 rounded-xl blue-btn text-[12px] font-extrabold">إعادة المحاولة</button>
                    <p class="mt-2 text-[10px] text-slate-500">إذا لم تظهر الخدمات، اضغط على إعادة المحاولة.</p>
                  </div>
                `:`
                <div class="p-2 bg-slate-50 border-b border-slate-100 service-search-intro">
                  <input id="svcSearch" value="${escAttr(state.searchService)}" oninput="searchService(this.value)" placeholder="ابحث عن خدمة أو قسم..." class="field h-10 px-3 text-[12px] font-bold">
                  <p class="text-[12px] text-slate-700 font-bold mt-2 px-1 leading-6">اختار القسم اللي يناسبك، وبعدها افتحه واختار خدمة واحدة من جواه.</p>
                </div>
                <div id="serviceList" class="max-h-[390px] overflow-y-auto overscroll-contain p-2">
                  <div class="category-tile-grid">
                    ${visibleCategories.map(c=>`
                      <button type="button" onclick='toggleCategory(${escAttr(JSON.stringify(c.label))})' aria-expanded="${state.openCategory===c.label?'true':'false'}" aria-pressed="${state.openCategory===c.label?'true':'false'}" class="category-tile ${state.openCategory===c.label?'active':''}">
                        <span class="category-tile-icon" aria-hidden="true">${escHtml(c.emoji)}</span>
                        <span class="category-tile-label">${escHtml(c.label)}</span>
                        <span class="category-tile-count">${c.services.length} خدمة</span>
                      </button>
                    `).join('')||'<p class="p-4 text-[12px] text-slate-500 text-center">مفيش نتائج مطابقة.</p>'}
                  </div>
                  ${selectedCategory?`
                    <section id="selectedCategoryDetails" class="category-details mt-3 border border-slate-200 rounded-2xl overflow-hidden">
                      <div class="flex items-center gap-2 px-3 py-3 bg-slate-50 border-b border-slate-100">
                        <span class="text-xl" aria-hidden="true">${escHtml(selectedCategory.emoji)}</span>
                        <div class="min-w-0 flex-1">
                          <h3 class="font-extrabold text-[13px] text-slate-900">${escHtml(selectedCategory.label)}</h3>
                          <p class="text-[11px] text-slate-500 font-bold mt-0.5">اختار الخدمة التفصيلية</p>
                        </div>
                        <button type="button" onclick="toggleCategory('')" class="text-[11px] font-extrabold text-blue-700 px-2 py-1" aria-label="الرجوع للمهن الرئيسية">رجوع</button>
                      </div>
                      <div class="service-choice-grid">
                        ${selectedCategory.services.map(s=>`
                          <button type="button" onclick="selectServiceByIndex(${ALL_SERVICES.indexOf(s)})" class="service-choice ${state.service===s?'selected':'hover:bg-blue-50'}">
                            <span class="service-icon" aria-hidden="true">${serviceIconFor(s)}</span>
                            <span>${escHtml(s)}</span>
                          </button>
                        `).join('')}
                      </div>
                    </section>`:''}
                </div>`}
              </div>`:''}
              <p class="mt-1 text-[11px] text-slate-600 font-semibold">${state.servicesError?'تعذر تحميل الخدمات - اضغط لإعادة المحاولة':'لازم تختار الخدمة قبل إرسال الطلب.'}</p>
            </div>

            <div>
              <label for="areaInput" class="text-[12px] font-extrabold mb-1.5 block">المنطقة أو الحي *</label>
              <input id="areaInput" type="text" value="${escAttr(state.area)}" oninput="onAreaInput(this.value)" onkeydown="if(event.key==='Enter'){event.preventDefault();document.getElementById('addrInput')?.focus()}" maxlength="100" class="field h-[50px] px-4 text-[13px] font-bold" autocomplete="address-level2" placeholder="اكتب اسم المنطقة أو الحي">
              <p class="mt-1 text-[10px] text-slate-500">اكتب اسم المنطقة أو الحي، واكتب الشارع ورقم العمارة في العنوان التفصيلي.</p>
            </div>
            <div>
              <label for="addrInput" class="text-[12px] font-extrabold mb-1.5 flex justify-between gap-2">
                <span>🏠 العنوان بالتفصيل</span>
                <span id="addrCounter" class="text-[10px] text-slate-400">${state.address.length}/250</span>
              </label>
              <input id="addrInput" value="${escAttr(state.address)}" oninput="onAddressInput(this.value)" onkeydown="if(event.key==='Enter'){event.preventDefault();document.getElementById('phoneInput')?.focus()}" maxlength="250" placeholder="اسم الشارع، رقم العمارة، الدور أو علامة مميزة..." class="field h-[50px] px-4 text-[13px] font-bold" autocomplete="street-address">
              <p class="mt-1 text-[10px] text-slate-500">اكتب عنوان المكان فقط، من غير أرقام تليفونات.</p>
            </div>
            <div>
              <label for="phoneInput" class="text-[12px] font-extrabold mb-1.5 flex justify-between gap-2">
                <span>📞 رقم تليفونك</span>
                <span id="phoneStatus" class="text-[10px] font-bold ${VALIDATORS.phone(state.phone)?'text-emerald-600':'text-slate-400'}">${VALIDATORS.phone(state.phone)?'✓ صحيح':'11 رقم يبدأ بـ 01'}</span>
              </label>
              <input id="phoneInput" value="${escAttr(state.phone)}" oninput="onPhoneInput(this.value)" onkeydown="if(event.key==='Enter'){event.preventDefault();document.getElementById('budgetInput')?.focus()}" inputmode="numeric" type="tel" maxlength="11" placeholder="01012345678" class="field h-[50px] px-4 text-[15px] font-bold tracking-widest" dir="ltr" autocomplete="tel">
              <p class="mt-1 text-[10px] text-slate-500">دي الخانة الوحيدة المخصصة لرقم تليفونك.</p>
            </div>
            <div>
              <label for="budgetInput" class="text-[12px] font-extrabold mb-1.5 block">💰 الميزانية المتوقعة (اختياري)</label>
              <input id="budgetInput" value="${escAttr(state.budget)}" oninput="onBudgetInput(this.value)" onkeydown="if(event.key==='Enter'){event.preventDefault();document.getElementById('descInput')?.focus()}" maxlength="50" placeholder="مثال: من 300 إلى 500 جنيه" class="field h-[50px] px-4 text-[13px] font-bold">
              <p class="mt-1 text-[10px] text-slate-500">اكتب ميزانيتك التقريبية أو اترك الخانة فارغة، من غير أرقام تليفونات.</p>
            </div>
            <div>
              <div class="mb-3 rounded-2xl border-2 border-blue-200 bg-gradient-to-l from-blue-50 to-white p-3 space-y-2">
                <div class="text-[13px] font-black text-slate-900">📝 وضّح المشكلة بالطريقة اللي تريحك</div>
                <p class="text-[11px] leading-5 text-slate-600">اكتب وصف المشكلة أو سجّلها بصوتك، وممكن تستخدم الطريقتين مع بعض.</p>
                <div class="rounded-xl border border-blue-100 bg-white p-2 space-y-1.5">
                  <div class="text-[12px] font-extrabold text-slate-800">🎙️ سجّل المشكلة بصوتك</div>
                  <div role="alert" style="display:block!important;visibility:visible!important;opacity:1!important;background:#fef3c7;border:1px solid #f59e0b;border-radius:10px;padding:6px 8px;margin:4px 0;color:#78350f;font-size:11px;font-weight:800;line-height:1.8;text-align:right"><span aria-hidden="true" style="font-size:17px;margin-left:6px">⚠️</span><span>تنبيه مهم: ممنوع ذكر رقم التليفون أو العنوان التفصيلي في التسجيل الصوتي.</span></div>
                   <p class="text-[11px] leading-5 text-slate-600">${state.voiceRecording?'🔴 التسجيل شغّال دلوقتي...':state.voiceBlob?'✅ التسجيل جاهز، تقدر تسمعه قبل الإرسال.':'اضغط على الزر واشرح المشكلة للفني بصوتك (حتى 30 ثانية).'}</p>
                  ${state.voiceRecording?'<div class="rounded-lg bg-red-50 border border-red-200 px-2 py-1.5 text-center"><span class="text-red-700 font-black">🔴 جاري التسجيل</span><div id="voiceRecordingTimer" dir="ltr" class="text-lg font-black text-red-700">00:00 / 00:30</div></div><button type="button" onclick="stopVoiceRecording()" class="w-full rounded-xl bg-red-600 px-3 py-2.5 text-[12px] font-extrabold text-white">⏹ إيقاف التسجيل</button>':'<button type="button" onclick="startVoiceRecording()" class="w-full rounded-xl bg-teal-700 px-3 py-2.5 text-[12px] font-extrabold text-white">🎙️ ابدأ التسجيل الصوتي</button>'}
                  ${state.voiceBlob?'<button type="button" onclick="clearVoiceRecording()" class="w-full rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[11px] font-extrabold text-red-700">حذف التسجيل وإعادة المحاولة</button>':''}
                  ${state.voiceUrl?`<div class="mt-2 rounded-xl border border-teal-200 bg-teal-50 p-3"><div class="mb-2 text-[12px] font-extrabold text-teal-900">▶️ استمع للتسجيل قبل الإرسال</div><audio controls playsinline preload="metadata" src="${escAttr(state.voiceUrl)}" class="mt-1 w-full" style="min-height:44px" onerror="showToast('تعذر تشغيل التسجيل على هذا المتصفح؛ أعد التسجيل من فضلك.')"></audio></div>`:''}
                </div>
                <div class="flex items-center gap-3 text-[11px] font-extrabold text-slate-400"><span class="h-px flex-1 bg-slate-200"></span><span>أو اكتب وصف المشكلة</span><span class="h-px flex-1 bg-slate-200"></span></div>
                <label for="descInput" class="text-[12px] font-extrabold flex justify-between gap-2">
                  <span>✍️ وصف المشكلة وتفاصيل الشغل</span>
                  <span id="descCounter" class="text-[10px] text-slate-400">${state.desc.length}/1000</span>
                </label>
                <textarea id="descInput" oninput="onDescInput(this.value)" onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();createOrder()}" maxlength="1000" placeholder="اكتب هنا تفاصيل المشكلة أو الشغل المطلوب..." class="field min-h-[112px] p-3.5 text-[13px] font-semibold resize-none leading-6">${escHtml(state.desc)}</textarea>
                <p class="text-[10px] leading-5 text-slate-500">ممكن تكتب وتسجّل مع بعض. ما تكتبش رقم تليفونك هنا؛ رقمك موجود في الخانة المخصصة.</p>
              </div>
            </div>
            ${!state.service?`
            <div class="rounded-2xl border-2 border-amber-300 bg-amber-50 p-4 text-center shadow-sm" role="status" aria-live="polite">
              <div class="text-2xl mb-1" aria-hidden="true">👆</div>
              <p class="text-[13px] font-extrabold text-amber-950 leading-6">لسه ما اخترتش الخدمة المطلوبة!</p>
              <p class="mt-1 text-[12px] font-semibold text-amber-900 leading-6">اختار قسم الخدمة من الأيقونات اللي فوق، علشان تظهر لك الخدمات التفصيلية وتقدر تحدد الخدمة المناسبة لطلبك.</p>
              <button type="button" onclick="toggleService()" class="mt-3 h-10 px-5 rounded-xl bg-amber-600 text-white text-[12px] font-extrabold shadow-md">اختيار الخدمة المطلوبة</button>
            </div>` : ''}
            <button type="button" onclick="createOrder()" ${state.loading||state.servicesLoading?'disabled':''} class="client-submit-order-btn w-full h-[52px] rounded-xl blue-btn font-extrabold text-[14px] flex items-center justify-center gap-2">
              ${state.loading?'جاري الإرسال...':state.servicesLoading?'جاري تحميل الخدمات...':'إرسال الطلب'}
            </button>
            <p class="text-[10px] text-center text-slate-400 leading-5">تُستخدم بياناتك للتواصل معك بخصوص الطلب.</p>
          </div>
        </div>
      </div>`
      :`
      <div class="mt-4 panel p-5 sm:p-7 text-center animate-fade">
        <div class="mx-auto h-16 w-16 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-[28px] text-emerald-600">✓</div>
        <h3 class="mt-4 text-[19px] font-extrabold">تم إنشاء طلبك بنجاح!</h3>
        <p class="mt-1 text-[12px] text-slate-500">تقدر تتابع طلبك من حسابك في قسم «طلباتي» من غير ما تدخل الرقم كل مرة</p>
        <div class="mt-5 rounded-[16px] bg-gradient-to-l from-[#0b1b3a] to-[#173c6c] p-4 flex items-center justify-between gap-3">
          <div class="text-right min-w-0">
            <p class="text-[11px] text-blue-100">رقم الطلب</p>
            <p class="mt-1 text-[22px] font-black text-white tracking-wider select-all break-all">${escHtml(state.sn)}</p>
          </div>
          <button type="button" onclick="copySn()" class="shrink-0 h-10 px-4 rounded-xl bg-white text-[#0b1b3a] font-extrabold text-[12px]">نسخ الكود</button>
        </div>
        <div class="mt-4 rounded-xl bg-blue-50 border border-blue-100 p-3 text-[11px] text-blue-900 font-bold leading-6">متابعة الطلبات وقبول العروض متاحان من حسابك في قسم «طلباتي».</div>
        <div class="mt-5 grid grid-cols-2 gap-2">
          <button type="button" onclick="trackNow()" class="h-[46px] rounded-xl primary-btn font-extrabold text-[12px]">عرض طلباتي</button>
          <button type="button" onclick="resetForm()" class="h-[46px] rounded-xl bg-slate-100 text-slate-700 font-extrabold text-[12px]">طلب جديد</button>
        </div>
      </div>`}
    `:''}
    ${state.tab==='orders'?renderOrders():''}
    ${state.tab==='track'?`
    <div class="mt-4 space-y-3 animate-fade">
      <div class="panel p-4 sm:p-5">
        <div class="flex items-center gap-3">
          <div class="h-10 w-10 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center text-lg">🔎</div>
          <div>
            <h3 class="font-extrabold text-[14px]">تتبع طلبك</h3>
            <p class="text-[11px] text-slate-500 mt-0.5">اكتب كود التتبع اللي استلمته</p>
          </div>
        </div>
        <div class="mt-4 flex gap-2">
          <input value="${escAttr(state.trackInput)}" oninput="onTrackInput(this.value)" onkeydown="if(event.key==='Enter')doTrack()" placeholder="مثال: SN123456" maxlength="20" class="field flex-1 min-w-0 h-[48px] px-3 text-[14px] font-black uppercase" dir="ltr">
          <button type="button" onclick="doTrack()" ${state.trackLoading?'disabled':''} class="h-[48px] px-5 rounded-xl primary-btn font-extrabold text-[12px]">${state.trackLoading?'...':'تتبع'}</button>
        </div>
        ${state.trackError?`<p class="mt-3 text-[12px] font-bold text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">${escHtml(state.trackError)}</p>`:''}
      </div>
      ${state.tracked?`
      <div class="panel p-4 sm:p-5">
        <div class="flex justify-between items-start gap-3">
          <div>
            <p class="text-[10px] text-slate-500 font-bold">رقم الطلب</p>
            <h4 class="font-extrabold text-[14px] mt-1">${escHtml(state.tracked.sn||'طلب')}</h4>
          </div>
          <span class="text-[10px] font-extrabold px-3 py-1.5 rounded-full bg-blue-50 border border-blue-100 text-blue-800">${escHtml(state.tracked.status||'قيد المراجعة')}</span>
        </div>
        <div class="mt-4 soft-card rounded-xl p-3">
          <p class="text-[10px] text-slate-500 font-bold">الخدمة المطلوبة</p>
          <p class="font-extrabold mt-1 leading-5">${escHtml(state.tracked.service||'-')}</p>
        </div>
        <div class="mt-3 soft-card rounded-xl p-3">
          <p class="text-[10px] text-slate-500 font-bold">تفاصيل الشغل</p>
          <p class="mt-1 text-[13px] font-semibold leading-6 whitespace-pre-wrap break-words">${escHtml(maskPhoneNumbers(state.tracked.description||state.tracked.details||'لا توجد تفاصيل مسجلة.'))}</p>
        </div>
        ${['تم اختيار فني','تم الانتهاء'].includes(state.tracked.status)?`
          <div class="mt-3 rounded-xl bg-emerald-50 border border-emerald-200 p-4">
            <p class="font-extrabold text-[13px] text-emerald-800">${state.tracked.status==='تم الانتهاء'?'تم إنهاء المهمة':'تم قبول العرض وتعيين الفني لطلبك'}</p>
            ${state.tracked.acceptedOfferPrice!=null?`<p class="mt-2 text-[12px] text-emerald-800">سعر التنفيذ المتفق عليه: <strong>${escHtml(String(state.tracked.acceptedOfferPrice))} جنيه</strong></p>`:''}
            ${state.tracked.status==='تم اختيار فني' && state.tracked.assignedFanniName?`<p class="mt-2 text-[12px] text-emerald-800">اسم الفني: <strong>${escHtml(state.tracked.assignedFanniName)}</strong></p>`:''}
            ${state.tracked.status==='تم اختيار فني' && state.tracked.assignedFanniPhone?`
              <p class="mt-2 text-[12px] text-emerald-800">رقم تليفون الفني:</p>
              <a href="tel:${escAttr(String(state.tracked.assignedFanniPhone).replace(/[^0-9+]/g,''))}" class="mt-2 flex items-center justify-center gap-2 rounded-xl bg-emerald-600 text-white font-extrabold p-3" dir="ltr">
                📞 ${escHtml(state.tracked.assignedFanniPhone)}
              </a>
            `:`
              ${state.tracked.status==='تم اختيار فني'?'<p class="mt-2 text-[12px] leading-6 text-emerald-800">تم اختيار الفني، وبيانات التواصل غير متاحة حاليًا. يمكنك متابعة حالة الطلب من هنا.</p>':''}
            `}
          </div>
        `:''}
        ${state.tracked.status!=='تم الانتهاء'?`
        <div class="mt-5">
          <h4 class="font-extrabold text-[14px]">عروض الفنيين (${Array.isArray(state.tracked.offers)?state.tracked.offers.length:0})</h4>
          ${(state.tracked.offers||[]).length===0
            ?'<p class="mt-3 text-[12px] text-slate-500 bg-slate-50 border border-slate-100 rounded-xl p-4 text-center leading-6">لسه مفيش عروض على طلبك.<br><span class="text-[11px]">راجع الطلب لاحقًا لمتابعة العروض الجديدة.</span></p>'
            :(state.tracked.offers||[]).map(offer=>{
              const offerId=String(offer._id||'');
              const orderSN=String(state.tracked.sn||'');
              return `<div class="mt-3 rounded-[14px] border border-slate-200 p-4">
                <div class="flex justify-between items-center gap-2">
                  <span class="font-extrabold text-[13px]">${escHtml(offer.fanniName||'فني')}</span>
                  <span class="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-extrabold text-amber-800">${escHtml(offer.fanniLevel||'المستوى غير متاح')}</span>
                  <span class="font-black text-[15px] text-blue-700">${escHtml(offer.price==null?'':String(offer.price))} جنيه</span>
                </div>
                <div class="mt-2 flex flex-wrap gap-2 text-[10px] font-extrabold"><span class="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-amber-800">★ ${Number(offer.fanniRatingAverage||0).toFixed(1)} (${Number(offer.fanniRatingCount||0)} تقييم)</span><span class="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-emerald-800">✓ ${Number(offer.fanniCompletedJobs||0)} عمل مكتمل</span></div>
                ${(Array.isArray(offer.fanniBadges)?offer.fanniBadges:[]).length?'<div class="mt-2 flex flex-wrap gap-1.5">'+(offer.fanniBadges||[]).map(b=>({trusted:'✓ فني موثوق',top_rated:'★ الأعلى تقييمًا',verified:'✓ تم التحقق',fast_response:'⚡ سريع الاستجابة',premium:'◆ فني مميز',gold:'★ الشارة الذهبية'}[b]||'')).filter(Boolean).map(label=>'<span class="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-extrabold text-emerald-800">'+escHtml(label)+'</span>').join('')+'</div>':''}
                <p class="mt-2 text-[12px] bg-slate-50 border border-slate-100 rounded-xl p-2.5 leading-6 break-words whitespace-pre-wrap">${escHtml(maskPhoneNumbers(offer.message||'بدون رسالة'))}</p>
                
${!state.tracked.acceptedOfferId && !['تم اختيار فني','تم الانتهاء','منتهي','اعتذار','منتهي - اعتذار','ملغي','مؤرشف'].includes(state.tracked.status)?`<div class="mt-3 rounded-xl border border-sky-100 bg-sky-50 p-3"><p class="text-[11px] font-extrabold text-sky-900">محادثة مصغّرة مع هذا الفني</p><p class="mt-1 text-[10px] text-sky-800">اختار استفسارك؛ الفني يرد بزرار من غير تبادل أرقام تليفونات.</p>${'<div id="client-prechat-'+escAttr(orderSN)+'-'+escAttr(offerId)+'">'+((state.tracked.chatMessages||[]).filter(m=>String(m.targetOfferId||'')===offerId).map(m=>'<div class="mt-2 rounded-lg p-2 '+(m.senderRole==='client'?'bg-white':'bg-emerald-50')+'"><p class="text-[10px] font-bold">'+(m.senderRole==='client'?'أنت':'الفني')+'</p><p class="text-[12px]">'+escHtml(m.text||'')+'</p></div>').join(''))+'</div>'}<div class="mt-2 grid grid-cols-1 gap-2"><button type="button" onclick="sendClientOfferQuestion('${escAttr(orderSN)}','${escAttr(offerId)}','هل السعر شامل؟')" class="h-9 rounded-lg border border-sky-200 bg-white text-[11px] font-extrabold">هل السعر شامل؟</button><button type="button" onclick="sendClientOfferQuestion('${escAttr(orderSN)}','${escAttr(offerId)}','متى تقدر تيجي؟')" class="h-9 rounded-lg border border-sky-200 bg-white text-[11px] font-extrabold">متى تقدر تيجي؟</button><button type="button" onclick="sendClientOfferQuestion('${escAttr(orderSN)}','${escAttr(offerId)}','هل في تكلفة إضافية؟')" class="h-9 rounded-lg border border-sky-200 bg-white text-[11px] font-extrabold">هل في تكلفة إضافية؟</button></div></div>`:''}
${state.tracked.acceptedOfferId && String(state.tracked.acceptedOfferId)===offerId
  ?'<div class="mt-3 rounded-xl bg-emerald-50 text-emerald-800 p-3 text-[12px] font-extrabold text-center">تم قبول العرض</div>'
  :state.tracked.acceptedOfferId || ['تم اختيار فني','تم الانتهاء','منتهي','ملغي','مؤرشف'].includes(state.tracked.status)
    ?'<div class="mt-3 rounded-xl bg-slate-50 text-slate-700 p-3 text-[12px] font-extrabold text-center">'+escHtml(offer.offerStatus||'تم رفض العرض')+'</div>'
    :`<button type="button" onclick="acceptOffer('${escAttr(orderSN)}','${escAttr(offerId)}')" ${state.acceptingOffer===offerId?'disabled':''} class="mt-3 w-full h-11 rounded-xl blue-btn font-extrabold text-[12px]">${state.acceptingOffer===offerId?'جاري قبول العرض...':'قبول العرض'}</button>`}

              </div>`;
            }).join('')}
        </div>
        `:''}
        <div class="mt-4 rounded-xl border border-slate-200 p-4"><h4 class="font-extrabold text-[13px]">${state.tracked.status==='تم الانتهاء'?'سجل المحادثة':'محادثة الطلب'}</h4><p class="mt-1 text-[10px] text-slate-500">${state.tracked.status==='تم الانتهاء'?'المهمة مكتملة؛ يمكنك مراجعة سجل المحادثة والتقييم فقط.':'بعد قبول العرض تتحول المحادثة إلى محادثة كاملة مع الفني الذي اخترته.'}</p>${['تم اختيار فني','تم الانتهاء'].includes(state.tracked.status)&&Array.isArray(state.tracked.chatMessages)?'<div id="client-accepted-chat-'+escAttr(state.tracked.sn)+'">'+state.tracked.chatMessages.filter(m=>!m.targetOfferId||String(m.targetOfferId)===String(state.tracked.acceptedOfferId||'')).map(m=>'<div class="mt-2 rounded-lg p-2 '+(m.senderRole==='client'?'bg-blue-50':'bg-emerald-50')+'"><p class="text-[10px] font-bold">'+(m.senderRole==='client'?'أنت':'الفني')+'</p><p class="text-[12px] whitespace-pre-wrap break-words">'+escHtml(m.text||'')+'</p></div>').join('')+'</div>':''}${state.tracked.status==='تم اختيار فني'?(state.tracked.priceChangeRequests||[]).filter(r=>r.status==='قيد الموافقة').map(r=>'<div class="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3"><p class="text-[12px] font-extrabold">طلب تعديل السعر إلى '+escHtml(String(r.newPrice))+' جنيه</p><p class="mt-1 text-[11px]">'+escHtml(r.reason||'')+'</p><div class="mt-2 flex gap-2"><button type="button" onclick="decideClientPrice(\''+escAttr(state.tracked.sn)+'\',\''+escAttr(r._id)+'\',true)" class="flex-1 rounded-lg bg-emerald-600 p-2 text-white text-xs font-bold">موافقة</button><button type="button" onclick="decideClientPrice(\''+escAttr(state.tracked.sn)+'\',\''+escAttr(r._id)+'\',false)" class="flex-1 rounded-lg bg-red-600 p-2 text-white text-xs font-bold">رفض</button></div></div>').join('')+'<textarea id="clientChatText" data-sn="'+escAttr(state.tracked.sn)+'" maxlength="1000" onkeydown="if(event.keyCode===13&&!event.shiftKey){event.preventDefault();sendClientChat(this.dataset.sn)}" class="field mt-3 min-h-[72px]" placeholder="اكتب رسالتك للفني الذي اخترته..."></textarea><button type="button" onclick="sendClientChat(\''+escAttr(state.tracked.sn)+'\')" class="mt-2 w-full h-10 rounded-xl blue-btn font-extrabold text-[12px]">إرسال الرسالة</button>':''}</div>
        ${state.tracked.status==='تم الانتهاء' && state.tracked.canRate && !isRatingSkipped('client',state.tracked.sn) ? '<div id="client-rating-'+escAttr(state.tracked.sn)+'" class="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4"><h4 class="font-extrabold text-[14px] text-amber-900">قيّم الفني بعد انتهاء المهمة</h4><p class="mt-1 text-[11px] text-amber-800">تقييمك يظهر لك وللفني، والتعليق اختياري.</p><label class="block mt-3 text-[12px] font-extrabold">عدد النجوم</label><select class="field mt-1" onchange="state.ratingStars=Number(this.value);render()">'+[5,4,3,2,1].map(n=>'<option value="'+n+'" '+(state.ratingStars===n?'selected':'')+'>'+('★'.repeat(n))+' — '+n+' نجوم</option>').join('')+'</select><label class="block mt-3 text-[12px] font-extrabold">تعليق (اختياري)</label><textarea id="clientRatingComment" class="field mt-1 min-h-[80px]" maxlength="500" placeholder="اكتب ملاحظتك عن التعامل..." oninput="state.ratingComment=this.value">'+escHtml(state.ratingComment)+'</textarea>'+(state.ratingStars===1?'<label class="mt-3 flex items-start gap-2 text-[12px] font-bold text-red-800"><input id="clientRatingBlock" type="checkbox" class="mt-1"> عدم عرض طلباتي المستقبلية على هذا الفني</label>':'')+'<button type="button" onclick="submitClientRating(\''+escAttr(state.tracked.sn)+'\')" '+(state.ratingSubmitting?'disabled':'')+' class="mt-3 w-full h-11 rounded-xl bg-amber-500 text-white font-extrabold text-[12px]">'+(state.ratingSubmitting?'جاري حفظ التقييم...':'إرسال التقييم')+'</button><button type="button" onclick="skipClientRating(\''+escAttr(state.tracked.sn)+'\')" class="mt-2 w-full h-10 rounded-xl border border-amber-300 bg-white text-amber-900 font-extrabold text-[12px]">تخطي التقييم</button></div>' : ''}
        ${Array.isArray(state.tracked.ratings)&&state.tracked.ratings.length ? '<div class="mt-4 rounded-xl border border-slate-200 p-4"><h4 class="font-extrabold text-[13px]">التقييمات المتبادلة</h4>'+state.tracked.ratings.map(r=>'<div class="mt-3 border-t border-slate-100 pt-3"><p class="text-[12px] font-extrabold">'+(r.reviewerRole==='client'?'تقييم العميل للفني':'تقييم الفني للعميل')+' — '+('★'.repeat(Math.max(0,Math.min(5,Number(r.stars)||0))))+' '+(Number(r.stars)||0)+'/5</p>'+(r.comment?'<p class="mt-1 text-[12px] leading-5 text-slate-600">'+escHtml(r.comment)+'</p>':'')+'</div>').join('')+'</div>' : ''}
      </div>`:''}
    </div>`:''}
    ${state.tab==='complaint'?`
    <div class="mt-4 animate-fade">
      <div class="panel p-4 sm:p-5">
        <div class="flex items-center gap-3">
          <div class="h-10 w-10 rounded-xl bg-red-50 text-red-600 flex items-center justify-center text-lg">⚠️</div>
          <div>
            <h3 class="font-extrabold text-[15px]">تقديم شكوى</h3>
            <p class="text-[11px] text-slate-500 mt-0.5">ابعت شكواك للإدارة باستخدام كود الطلب والاسم المسجل</p>
          </div>
        </div>
        <div class="mt-4 space-y-3">
          <div>
            <label for="complaintNameInput" class="text-[12px] font-extrabold mb-1.5 block">👤 اسم العميل المسجل مع الطلب</label>
            <input id="complaintNameInput" value="${escAttr(state.complaintName)}" oninput="onComplaintName(this.value)" placeholder="اكتب نفس الاسم اللي سجلت بيه الطلب" maxlength="50" autocomplete="name" class="field h-[48px] px-4 text-[13px] font-bold">
            <p class="mt-1 text-[10px] text-slate-500">لازم الاسم يكون مطابقًا للاسم اللي كتبته وقت إنشاء الطلب.</p>
          </div>
          <div>
            <label for="complaintSnInput" class="text-[12px] font-extrabold mb-1.5 block">كود الطلب</label>
            <input id="complaintSnInput" value="${escAttr(state.complaintSn)}" oninput="onComplaintSn(this.value)" placeholder="كود الطلب SN123456" maxlength="20" class="field h-[48px] px-4 text-[14px] font-black uppercase" dir="ltr">
          </div>
          <div>
            <label for="complaintTextInput" class="text-[12px] font-extrabold mb-1.5 block">تفاصيل الشكوى</label>
            <textarea id="complaintTextInput" oninput="onComplaintText(this.value)" onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();sendComplaint()}" maxlength="1000" placeholder="احكي اللي حصل بالتفصيل..." class="field min-h-[120px] p-4 text-[13px] font-semibold resize-none leading-6">${escHtml(state.complaintText)}</textarea>
          </div>
          <div class="flex justify-between text-[10px] text-slate-400 font-bold">
            <span id="complaintTextCounter">${state.complaintText.length}/1000</span>
            <span id="complaintTextStatus">${VALIDATORS.text(state.complaintText,10,1000)?'✓ تفاصيل الشكوى مكتملة':''}</span>
          </div>
          <p class="text-[10px] text-slate-500">ما تكتبش رقم تليفون داخل الاسم أو الشكوى؛ استخدم بيانات الطلب للتواصل.</p>
          <button type="button" onclick="sendComplaint()" ${state.complaintLoading?'disabled':''} class="client-complaint-submit-btn w-full h-[48px] rounded-xl font-extrabold text-[13px]">
            ${state.complaintLoading?'جاري إرسال الشكوى...':'إرسال الشكوى'}
          </button>
        </div>
      </div>
      <!-- قسم متابعة الشكاوى - إضافة جديدة -->
      <div class="panel p-4 sm:p-5 mt-4">
        <div class="flex items-center gap-3">
          <div class="h-10 w-10 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center text-lg">🔍</div>
          <div>
            <h3 class="font-extrabold text-[15px]">متابعة الشكاوى</h3>
            <p class="text-[11px] text-slate-500 mt-0.5">تابع حالة شكواك ورد الإدارة عليها</p>
          </div>
        </div>
        <div class="mt-4 space-y-3">
          <div>
            <label for="complaintTrackSnInput" class="text-[12px] font-extrabold mb-1.5 block">كود الطلب</label>
            <input id="complaintTrackSnInput" value="${escAttr(state.complaintTrackSn)}" oninput="onComplaintTrackSn(this.value)" placeholder="مثال: SN123456" maxlength="20" class="field h-[48px] px-4 text-[14px] font-black uppercase" dir="ltr">
          </div>
          <div>
            <label for="complaintTrackNameInput" class="text-[12px] font-extrabold mb-1.5 block">اسم العميل</label>
            <input id="complaintTrackNameInput" value="${escAttr(state.complaintTrackName)}" oninput="onComplaintTrackName(this.value)" placeholder="الاسم المسجل عند إنشاء الطلب" maxlength="50" class="field h-[48px] px-4 text-[13px] font-bold">
          </div>
          <button type="button" onclick="trackComplaints()" ${state.complaintTrackLoading?`disabled`:``} class="client-complaint-track-btn w-full h-[48px] rounded-xl font-extrabold text-[13px]">
            ${state.complaintTrackLoading?`جاري تحميل الشكاوى...`:`متابعة الشكوى`}
          </button>
          ${state.complaintTrackError?`<p class="text-[12px] font-bold text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">${escHtml(state.complaintTrackError)}</p>`:``}
          ${Array.isArray(state.complaintTrackResults)?`
            <div class="space-y-3 mt-2">
              ${state.complaintTrackResults.length===0?`<p class="text-[12px] text-slate-500 bg-slate-50 border border-slate-100 rounded-xl p-4 text-center">لا توجد شكوى مرتبطة بهذا الطلب.</p>`:``}
              ${state.complaintTrackResults.map(c=>{
                const created=c.createdAt?new Date(c.createdAt).toLocaleString('ar-EG'):'غير محدد';
                const status=String(c.status||'جديدة');
                const sn=String(c.sn||state.complaintTrackSn||'');
                const hasResponse=typeof c.adminResponse==='string'&&c.adminResponse.trim().length>0;
                return `<div class="rounded-[14px] border border-slate-200 p-4 bg-white">
                  <div class="flex justify-between items-start gap-2">
                    <div>
                      <p class="text-[10px] text-slate-500 font-bold">كود الطلب</p>
                      <p class="font-mono font-black text-[13px] text-blue-800 mt-1">${escHtml(sn)}</p>
                      <p class="text-[10px] text-slate-400 mt-1">${escHtml(created)}</p>
                    </div>
                    <span class="shrink-0 text-[10px] font-extrabold px-3 py-1.5 rounded-full bg-blue-50 border border-blue-100 text-blue-800">${escHtml(status)}</span>
                  </div>
                  <div class="mt-3 rounded-xl bg-slate-50 border border-slate-100 p-3">
                    <p class="text-[10px] text-slate-500 font-bold">رد الإدارة</p>
                    <p class="mt-1 text-[13px] leading-6 whitespace-pre-wrap break-words font-semibold ${hasResponse?`text-slate-800`:`text-slate-400`}">${hasResponse?escHtml(c.adminResponse):`لم ترد الإدارة بعد.`}</p>
                  </div>
                </div>`;
              }).join(``)}
            </div>
          `:``}
        </div>
      </div>
    </div>`:''}
  </main>
  <nav class="fixed bottom-0 inset-x-0 z-30 border-t border-slate-200 bg-white/95 backdrop-blur-xl safe-bottom">
    <div class="mx-auto max-w-[640px] px-1 h-[72px] grid grid-cols-4 gap-0.5">
      ${[{id:'new',icon:'＋',label:'طلب'},{id:'track',icon:'◉',label:'تتبع'},{id:'complaint',icon:'⚠',label:'شكوى'}].map(t=>`
        <button type="button" onclick="setTab('${t.id}')" class="rounded-xl flex flex-col items-center justify-center gap-1 ${state.tab===t.id?'bg-blue-50 text-blue-800':'text-slate-500'}">
          <span class="text-[17px] font-black">${t.icon}</span>
          <span class="text-[10px] font-extrabold">${t.label}</span>
          ${state.tab===t.id?'<span class="w-5 h-0.5 rounded-full bg-blue-700"></span>':''}
        </button>`).join('')}
      
      
    </div>
  </nav>`;
}
function setTab(tab){state.tab=tab;render();}
function toggleService(){
  if(state.servicesLoading){if(state.servicesError)loadServices();return;}
  if(state.servicesError){loadServices();return;}
  state.showService=!state.showService;
  if(state.showService){state.searchService='';state.openCategory=getCat(state.service)?.label||'';}
  render();
}
function handleOutsideServiceClick(event){
  if(!state.showService)return;
  const target=event.target;
  if(!(target instanceof Element))return;
  if(target.closest('button[onclick="toggleService()"]'))return;
  if(target.closest('#servicePanel'))return;
  const pageY=window.scrollY||window.pageYOffset||0;
  state.showService=false;state.openCategory='';state.searchService='';
  render();
  window.scrollTo({top:pageY,left:0,behavior:'instant'});
}
function toggleCategory(label){
  const opening=Boolean(label)&&state.openCategory!==label;
  state.openCategory=opening?label:'';
  render();
  if(!opening)return;
  requestAnimationFrame(()=>{
    const panel=document.getElementById('servicePanel');
    const list=document.getElementById('serviceList');
    const details=document.getElementById('selectedCategoryDetails');
    if(!panel||!list||!details)return;
    // Show the first row of detailed choices, not the bottom of the page.
    panel.scrollTop=0;
    list.scrollTop=0;
    const firstChoice=details.querySelector('.service-choice');
    if(firstChoice){
      const listRect=list.getBoundingClientRect();
      const choiceRect=firstChoice.getBoundingClientRect();
      list.scrollTo({top:Math.max(0,list.scrollTop+choiceRect.top-listRect.top-8),behavior:'smooth'});
    }
  });
}
function searchService(value){
  const input=document.getElementById('svcSearch');
  const pos=input?input.selectionStart:null;
  const position=captureScrollPosition();
  state.searchService=sanitizeInput(value,80);
  render();
  const nextInput=document.getElementById('svcSearch');
  const nextList=document.getElementById('serviceList');
  if(nextInput){
    try{nextInput.focus({preventScroll:true});}catch(error){nextInput.focus();}
    if(pos!==null){
      try{const cursor=Math.min(pos,nextInput.value.length);nextInput.setSelectionRange(cursor,cursor);}catch(error){}
    }
  }
  if(nextList)nextList.scrollTop=position.listTop;
  window.scrollTo({top:position.pageY,left:0,behavior:'instant'});
}
function selectService(serviceName){
  const clean=String(serviceName||'').trim();
  if(!clean||!ALL_SERVICES.includes(clean)){showToast('الخدمة غير موجودة في القائمة الرسمية.');return;}
  state.service=clean;state.showService=false;state.searchService='';state.openCategory='';render();
  requestAnimationFrame(()=>{
    const pickerButton=document.querySelector('button[onclick="toggleService()"]');
    if(pickerButton){
      const rect=pickerButton.getBoundingClientRect();
      const desiredTop=window.scrollY+rect.top-(window.innerHeight*0.32);
      window.scrollTo({top:Math.max(0,desiredTop),left:0,behavior:'smooth'});
      setTimeout(()=>{try{pickerButton.focus({preventScroll:true});}catch(error){}},180);
    }
  });
}
function selectServiceByIndex(index){
  const service=ALL_SERVICES[index];
  if(!service)return selectService(service);
  return selectService(service);
}
function rejectPhoneInField(value,label){
  if(!containsPhoneNumber(value))return false;
  showToast('ممنوع كتابة رقم تليفون داخل خانة '+label+'؛ استخدم خانة رقم التليفون المخصصة.');
  return true;
}
function onClientNameInput(value){
  const clean=sanitizeInput(value,50);
  if(rejectPhoneInField(clean,'اسم العميل')){state.clientName='';const input=document.getElementById('clientNameInput');if(input)input.value='';return;}
  state.clientName=clean;
}
function onAreaInput(value){
  const area=sanitizeInput(value,100);
  if(rejectPhoneInField(area,'المنطقة')){state.area='';const input=document.getElementById('areaInput');if(input)input.value='';return;}
  state.area=area;
}
function onAddressInput(value){
  const clean=sanitizeInput(value,250);
  if(rejectPhoneInField(clean,'العنوان التفصيلي')){state.address='';const input=document.getElementById('addrInput');if(input)input.value='';const counter=document.getElementById('addrCounter');if(counter)counter.textContent='0/250';return;}
  state.address=clean;
  const el=document.getElementById('addrCounter');if(el)el.textContent=state.address.length+'/250';
}
function onPhoneInput(value){
  state.phone=normalizeDigits(String(value)).replace(/\D/g,'').slice(0,11);
  const input=document.getElementById('phoneInput');if(input&&input.value!==state.phone)input.value=state.phone;
  const status=document.getElementById('phoneStatus');
  if(status){const valid=VALIDATORS.phone(state.phone);status.textContent=valid?'✓ صحيح':'11 رقم يبدأ بـ 01';status.className='text-[10px] font-bold '+(valid?'text-emerald-600':'text-slate-400');}
}
function onBudgetInput(value){
  const clean=sanitizeInput(value,50);
  if(rejectPhoneInField(clean,'الميزانية')){state.budget='';const input=document.getElementById('budgetInput');if(input)input.value='';return;}
  state.budget=clean;
}
function onDescInput(value){
  const clean=sanitizeInput(value,1000);
  if(rejectPhoneInField(clean,'وصف المشكلة')){state.desc='';const input=document.getElementById('descInput');if(input)input.value='';const counter=document.getElementById('descCounter');if(counter)counter.textContent='0/1000';return;}
  state.desc=clean;
  const el=document.getElementById('descCounter');if(el)el.textContent=state.desc.length+'/1000';
}
function onTrackInput(value){state.trackInput=sanitizeInput(value,20).toUpperCase();}
function onComplaintName(value){
  const clean=sanitizeInput(value,50);
  if(rejectPhoneInField(clean,'اسم العميل')){state.complaintName='';const input=document.getElementById('complaintNameInput');if(input)input.value='';return;}
  state.complaintName=clean;
}
function onComplaintSn(value){state.complaintSn=sanitizeInput(value,20).toUpperCase();}
function onComplaintTrackSn(value){state.complaintTrackSn=sanitizeInput(value,20).toUpperCase();}
function onComplaintTrackName(value){
  const clean=sanitizeInput(value,50);
  if(containsPhoneNumber(clean)){showToast('ممنوع كتابة رقم تليفون داخل اسم العميل.');state.complaintTrackName='';const input=document.getElementById('complaintTrackNameInput');if(input)input.value='';return;}
  state.complaintTrackName=clean;
}
async function trackComplaints(){
  if(state.complaintTrackLoading)return;
  const sn=String(state.complaintTrackSn||'').trim().toUpperCase();
  const name=String(state.complaintTrackName||'').trim();
  if(!sn||!name){state.complaintTrackError='من فضلك اكتب كود الطلب واسم العميل.';state.complaintTrackResults=null;render();return;}
  if(!VALIDATORS.sn(sn)){state.complaintTrackError='كود الطلب غير صحيح. تأكد أن الكود يبدأ بـ SN ويتكون من 6 أرقام.';state.complaintTrackResults=null;render();return;}
  if(!VALIDATORS.name(name)){state.complaintTrackError='اكتب اسم العميل بشكل صحيح.';state.complaintTrackResults=null;render();return;}
  state.complaintTrackLoading=true;state.complaintTrackError='';state.complaintTrackResults=null;render();
  try{
    const data=await API.trackComplaints({sn:sn,clientName:name});
    const list=Array.isArray(data.complaints)?data.complaints:Array.isArray(data.items)?data.items:Array.isArray(data.data)?data.data:[STRIPPED]
    if(!list.length){state.complaintTrackError='';state.complaintTrackResults=[];}
    else{state.complaintTrackResults=list;state.complaintTrackError='';}
  }catch(error){
    const msg=String(error.message||'');
    if(msg==='EMPTY_FIELDS'){state.complaintTrackError='من فضلك اكتب كود الطلب واسم العميل.';}
    else if(msg==='INVALID_SN'){state.complaintTrackError='كود الطلب غير صحيح. تأكد أن الكود يبدأ بـ SN ويتكون من 6 أرقام.';}
    else if(error.status===404){state.complaintTrackError='لا توجد شكوى مرتبطة بهذا الطلب.';state.complaintTrackResults=null;state.complaintTrackLoading=false;render();return;}
    else if(error.status===403||(error.status===400&&/اسم/i.test(msg))){state.complaintTrackError='الاسم غير مطابق للاسم المسجل مع هذا الطلب';}
    else if(error.status===400){state.complaintTrackError='البيانات غير صحيحة. تأكد من كود الطلب والاسم.';}
    else{state.complaintTrackError='تعذر الاتصال. تأكد من الإنترنت وحاول مرة أخرى.';}
    state.complaintTrackResults=null;
  }finally{state.complaintTrackLoading=false;render();}
}
function onComplaintText(value){
  const clean=sanitizeInput(value,1000);
  if(rejectPhoneInField(clean,'تفاصيل الشكوى')){
    state.complaintText='';
    const input=document.getElementById('complaintTextInput');
    if(input)input.value='';
    const counter=document.getElementById('complaintTextCounter');
    if(counter)counter.textContent='0/1000';
    const status=document.getElementById('complaintTextStatus');
    if(status)status.textContent='';
    return;
  }
  state.complaintText=clean;
  const counter=document.getElementById('complaintTextCounter');
  if(counter)counter.textContent=state.complaintText.length+'/1000';
  const status=document.getElementById('complaintTextStatus');
  if(status)status.textContent=VALIDATORS.text(state.complaintText,10,1000)?'✓ تفاصيل الشكوى مكتملة':'';
}
function resetForm(){
  state.sn=null;state.clientName='';state.area='';state.address='';state.phone='';state.budget='';state.desc='';state.service='';state.showService=false;state.openCategory='';state.searchService='';state.tab='new';state.loading=false;render();
}
function trackNow(){state.tab='orders';loadMyOrders();}
function copySn(){
  if(!state.sn)return;
  if(navigator.clipboard&&navigator.clipboard.writeText){
    navigator.clipboard.writeText(state.sn).then(()=>showToast('تم نسخ الكود: '+state.sn,'success')).catch(()=>showToast('تعذر النسخ التلقائي. الكود: '+state.sn));
  }else{showToast('انسخ الكود يدويًا: '+state.sn,'success');}
}
async function loadServices(){
  if(state.servicesLoading&&state.servicesLoaded)return;
  state.servicesLoading=true;state.servicesError='';render();
  try{
    const data=await API.getServices();
    CATEGORIES=data.categories;ALL_SERVICES=data.services;
    const flat=[...new Set(CATEGORIES.flatMap(c=>c.services))];
    if(flat.length!==ALL_SERVICES.length){ALL_SERVICES=[...new Set(ALL_SERVICES)];}
    state.servicesLoading=false;state.servicesError='';state.servicesLoaded=true;
    if(state.service&&!ALL_SERVICES.includes(state.service)){state.service='';}
    render();
    log('تم تحميل الخدمات من API:',CATEGORIES.length+' قسم, '+ALL_SERVICES.length+' خدمة');
  }catch(error){
    state.servicesLoading=false;state.servicesError=error.message||'تعذر تحميل الخدمات';state.servicesLoaded=false;CATEGORIES=[];ALL_SERVICES=[];
    render();showToast(state.servicesError);log('فشل تحميل الخدمات:',error);
  }
}
let voiceStream=null,voiceRecordingTimer=null,voiceRecordingStartedAt=0;
function formatVoiceTime(seconds){const value=Math.max(0,Math.min(30,Math.floor(seconds)));return String(Math.floor(value/60)).padStart(2,'0')+':'+String(value%60).padStart(2,'0')}
function stopVoiceTimer(){if(voiceRecordingTimer!==null){clearInterval(voiceRecordingTimer);voiceRecordingTimer=null}}
function updateVoiceTimer(){const elapsed=Math.floor((Date.now()-voiceRecordingStartedAt)/1000);const timer=document.getElementById('voiceRecordingTimer');if(timer)timer.textContent=formatVoiceTime(elapsed)+' / 00:30';if(elapsed>=30)stopVoiceRecording()}
async function startVoiceRecording(){if(state.voiceRecording)return;if(!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==='undefined')return showToast('تسجيل الصوت غير مدعوم؛ اكتب وصف المشكلة.');try{voiceStream=await navigator.mediaDevices.getUserMedia({audio:true});const mimeType=['audio/webm;codecs=opus','audio/webm','audio/mp4'].find(type=>MediaRecorder.isTypeSupported?.(type));const recorder=new MediaRecorder(voiceStream,mimeType?{mimeType}:undefined);state.voiceChunks=[];state.voiceRecording=true;state.voiceBlob=null;state.voiceRecordingData='';if(state.voiceUrl.startsWith('blob:'))URL.revokeObjectURL(state.voiceUrl);state.voiceUrl='';state.voiceRecorder=recorder;voiceRecordingStartedAt=Date.now();render();updateVoiceTimer();stopVoiceTimer();voiceRecordingTimer=setInterval(updateVoiceTimer,250);recorder.ondataavailable=e=>{if(e.data?.size)state.voiceChunks.push(e.data)};recorder.onerror=()=>{stopVoiceTimer();showToast('حصلت مشكلة أثناء التسجيل؛ حاول مرة أخرى.');stopVoiceRecording()};recorder.onstop=async()=>{stopVoiceTimer();try{const type=recorder.mimeType||state.voiceChunks.find(chunk=>chunk.type)?.type||'audio/webm';const blob=new Blob(state.voiceChunks,{type});if(!blob.size||blob.size>360000)throw Error('التسجيل فارغ أو حجمه كبير؛ سجّل فويس أقصر.');state.voiceBlob=blob;state.voiceRecordingData=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=reject;reader.readAsDataURL(blob)});state.voiceUrl=state.voiceRecordingData}catch(e){state.voiceBlob=null;state.voiceRecordingData='';showToast(e.message||'تعذر تجهيز التسجيل؛ حاول مرة أخرى.')}finally{state.voiceRecording=false;state.voiceRecorder=null;voiceStream?.getTracks().forEach(t=>t.stop());voiceStream=null;state.voiceChunks=[];render()}};recorder.start(250)}catch(e){stopVoiceTimer();voiceStream?.getTracks().forEach(t=>t.stop());voiceStream=null;state.voiceRecording=false;state.voiceRecorder=null;showToast('اسمح باستخدام الميكروفون أو اكتب وصف المشكلة.');render()}}
function stopVoiceRecording(){stopVoiceTimer();if(state.voiceRecorder&&state.voiceRecorder.state!=='inactive')state.voiceRecorder.stop()}
function clearVoiceRecording(){if(state.voiceRecording)stopVoiceRecording();stopVoiceTimer();if(state.voiceUrl.startsWith('blob:'))URL.revokeObjectURL(state.voiceUrl);state.voiceBlob=null;state.voiceUrl='';state.voiceRecordingData='';state.voiceChunks=[];render()}
async function createOrder(){
  if(!state.account||!state.accountToken){showToast('سجّل دخولك بحساب العميل قبل إرسال الطلب.');render();return;}
  if(state.loading)return;
  if(state.servicesLoading){showToast('جاري تحميل قائمة الخدمات، انتظر لحظة.');return;}
  if(state.servicesError||!ALL_SERVICES.length){showToast('قائمة الخدمات غير متاحة حاليًا. اضغط على زر إعادة المحاولة في قائمة الخدمات.');state.showService=true;render();return;}
  if(!VALIDATORS.name(state.clientName)){showToast('اكتب اسمك بشكل صحيح، من حرفين إلى 50 حرفًا.');document.getElementById('clientNameInput')?.focus();return;}
  if(containsPhoneNumber(state.clientName)){showToast('ممنوع كتابة رقم تليفون داخل اسم العميل.');document.getElementById('clientNameInput')?.focus();return;}
  if(!state.service||!ALL_SERVICES.includes(state.service)){showToast('اختار الخدمة المطلوبة من القائمة الرسمية.');state.showService=true;render();return;}
  if(!VALIDATORS.text(state.area,2,100)){showToast('اكتب المنطقة أو الحي من حرفين على الأقل.');document.getElementById('areaInput')?.focus();return;}
  if(!VALIDATORS.text(state.address,5,250)){showToast('اكتب العنوان بالتفصيل، من فضلك.');document.getElementById('addrInput')?.focus();return;}
  if(!state.phone){showToast('اكتب رقم تليفونك.');document.getElementById('phoneInput')?.focus();return;}
  if(!VALIDATORS.phone(state.phone)){showToast('رقم التليفون غير صحيح؛ لازم يكون 11 رقم ويبدأ بـ 01.');document.getElementById('phoneInput')?.focus();return;}
  if(String(state.desc||'').trim().length<10&&!state.voiceRecordingData){showToast('اكتب وصف المشكلة أو سجّل فويس قبل إرسال الطلب.');document.getElementById('descInput')?.focus();return;}if(state.voiceRecording){showToast('استنى لحد ما التسجيل يخلص.');return;}
  try{
    validateNoPhoneInCustomerFields({clientName:state.clientName,area:state.area,address:state.address,description:state.desc,budget:state.budget,complaintText:state.complaintText});
  }catch(error){showToast(error.message);return;}
  state.loading=true;render();
  try{
    const data=await API.createOrder({clientName:state.clientName,service:state.service,area:state.area,address:state.address,phone:state.phone,budget:state.budget,description:state.desc,voiceRecordingData:state.voiceRecordingData});
    state.sn=data.sn;state.loading=false;showToast('تم إنشاء الطلب: '+state.sn,'success');render();
  }catch(error){state.loading=false;showToast(error.message||'تعذر إنشاء الطلب حاليًا.');render();}
}
async function sendClientChat(sn){const el=document.getElementById('clientChatText');const text=String(el?.value||'').trim();if(!text)return showToast('اكتب الرسالة أولًا.');if(state.tracked?.status==='تم الانتهاء')return showToast('المهمة مكتملة؛ المحادثة للقراءة فقط.');try{await API.sendChat(sn,text,state.tracked?.acceptedOfferId||undefined);if(el)el.value='';state.trackInput=sn;await refreshTrackedSilently();showToast('تم إرسال الرسالة.','success');}catch(e){showToast(e.message||'تعذر إرسال الرسالة.');}}
async function sendClientOfferQuestion(sn,offerId,question){if(state.tracked?.status==='تم الانتهاء')return showToast('المهمة مكتملة؛ لا يمكن إرسال رسائل جديدة.');try{await API.sendChat(sn,question,offerId);state.trackInput=sn;await refreshTrackedSilently();showToast('تم إرسال استفسارك للفني.','success');}catch(e){showToast(e.message||'تعذر إرسال الاستفسار.');}}
function renderClientChatMessages(messages,mode){return (Array.isArray(messages)?messages:[]).map(function(m){const isClient=m.senderRole==='client';const color=mode==='accepted'?(isClient?'bg-blue-50':'bg-emerald-50'):(isClient?'bg-white':'bg-emerald-50');return '<div class="mt-2 rounded-lg p-2 '+color+'"><p class="text-[10px] font-bold">'+(isClient?'أنت':'الفني')+'</p><p class="text-[12px] '+(mode==='accepted'?'whitespace-pre-wrap break-words':'')+'">'+escHtml(m.text||'')+'</p></div>';}).join('');}
let clientChatPollInFlight=false,clientLiveRenderPending=false;
function updateClientChatDom(messages){if(!state.tracked)return;const sn=String(state.tracked.sn||state.trackInput||'').toUpperCase();const all=Array.isArray(messages)?messages:[];(state.tracked.offers||[]).forEach(function(offer){const offerId=String(offer._id||'');const box=document.getElementById('client-prechat-'+sn+'-'+offerId);if(box)box.innerHTML=renderClientChatMessages(all.filter(function(m){return String(m.targetOfferId||'')===offerId;}),'pre');});const accepted=document.getElementById('client-accepted-chat-'+sn);if(accepted)accepted.innerHTML=renderClientChatMessages(all,'accepted');}
async function decideClientPrice(sn,id,approved){try{await API.decidePrice(sn,id,approved);if(state.trackInput===sn&&state.tracked){await doTrack();}if(state.accountToken&&state.account)await loadMyOrders(false);render();showToast(approved?'تمت الموافقة على السعر الجديد.':'تم رفض تعديل السعر.','success');}catch(e){showToast(e.message||'تعذر تسجيل القرار.');}}
async function submitClientRating(sn){
  if(state.ratingSubmitting)return;
  const stars=Number(state.ratingStars);
  if(!Number.isInteger(stars)||stars<1||stars>5){showToast('اختار عدد النجوم.');return;}
  const blockFuture=stars===1&&Boolean(document.getElementById('clientRatingBlock')?.checked);
  const comment=String(state.ratingComment||'').trim().slice(0,500);
  state.ratingSubmitting=true;render();
  try{
    await API.rateOrder(sn,{stars,comment,blockFuture});
    state.ratingComment='';showToast('تم حفظ تقييمك بنجاح','success');state.trackInput=sn;await doTrack();
  }catch(error){showToast(error.message||'تعذر حفظ التقييم.');}
  finally{state.ratingSubmitting=false;render();}
}
async function refreshClientPage(){try{if(state.trackInput){const order=await API.getOrder(state.trackInput);state.tracked=order;render();}if(state.accountToken&&state.account)await Promise.allSettled([loadMyOrders(),loadNotifications()]);showToast('تم تحديث بيانات العميل.','success');}catch(error){showToast(error.message||'تعذر تحديث بيانات العميل.');}}
async function refreshTrackedSilently(){
 const input=String(state.trackInput||'').trim().toUpperCase();
 if(!VALIDATORS.sn(input)||clientChatPollInFlight||document.hidden)return;
 clientChatPollInFlight=true;
 try{
  const next=await API.getOrder(input);
  if(!state.tracked||String(state.tracked.sn||'').toUpperCase()!==input)return;
  const previous=state.tracked;
  const signature=o=>JSON.stringify({status:o?.status,acceptedOfferId:String(o?.acceptedOfferId||''),offers:(o?.offers||[]).map(x=>({id:String(x._id||''),status:x.offerStatus||x.status||'',accepted:!!x.accepted,price:x.priceNum??x.price??null})),priceChangeRequests:(o?.priceChangeRequests||[]).map(r=>({id:String(r._id||''),status:r.status||'',newPrice:r.newPrice??null,requestedAt:r.requestedAt||''})),canRate:o?.canRate,myRating:o?.myRating?String(o.myRating._id||o.myRating.createdAt||''):null});
  const orderChanged=signature(previous)!==signature(next);
  const messages=Array.isArray(next.chatMessages)?next.chatMessages:[];
  state.tracked=Object.assign({},next,{chatMessages:messages});
  if(Array.isArray(next.priceChangeRequests))state.tracked.priceChangeRequests=next.priceChangeRequests;
  updateClientChatDom(messages);
  if(orderChanged&&state.tab==='track'){
   if(!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName)){
    const scrollY=window.scrollY||window.pageYOffset||0;render();window.scrollTo({top:scrollY,left:0,behavior:'instant'});focusClientPostAction();clientLiveRenderPending=false;
   }else clientLiveRenderPending=true;
  }
 }catch(_){/* Keep the last successful order and conversation visible during temporary network failures. */}
 finally{clientChatPollInFlight=false;}
}
let clientMessagesPollInFlight=false;
async function refreshTrackedChatSilently(){
 const input=String(state.trackInput||'').trim().toUpperCase();
 if(!VALIDATORS.sn(input)||!state.tracked||document.hidden||clientMessagesPollInFlight)return;
 clientMessagesPollInFlight=true;
 try{
  const data=await API.chat(input);
  if(!state.tracked||String(state.tracked.sn||'').toUpperCase()!==input)return;
  const previousRequests=JSON.stringify((state.tracked.priceChangeRequests||[]).map(r=>({id:String(r._id||''),status:r.status||'',newPrice:r.newPrice??null,requestedAt:r.requestedAt||''})));
  const nextRequests=Array.isArray(data.priceChangeRequests)?data.priceChangeRequests:state.tracked.priceChangeRequests||[];
  const nextMessages=Array.isArray(data.messages)?data.messages:[];
  state.tracked.chatMessages=nextMessages;
  state.tracked.priceChangeRequests=nextRequests;
  updateClientChatDom(nextMessages);
  const nextRequestSignature=JSON.stringify(nextRequests.map(r=>({id:String(r._id||''),status:r.status||'',newPrice:r.newPrice??null,requestedAt:r.requestedAt||''})));
  if(previousRequests!==nextRequestSignature&&['track','orders'].includes(state.tab)){
   if(!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName)){
    const scrollY=window.scrollY||window.pageYOffset||0;render();window.scrollTo({top:scrollY,left:0,behavior:'instant'});focusClientPostAction();
   }else clientLiveRenderPending=true;
  }
 }catch(_){/* Keep the last successful conversation visible during temporary network failures. */}
 finally{clientMessagesPollInFlight=false;}
}
async function doTrack(){
  if(state.trackLoading)return;
  const input=state.trackInput.trim().toUpperCase();
  if(!input){state.trackError='اكتب كود التتبع.';render();return;}
  if(!VALIDATORS.sn(input)){state.trackError='كود التتبع غير صحيح. راجع الكود وحاول مرة أخرى.';render();return;}
  state.trackLoading=true;state.trackError='';state.tracked=null;render();
  try{const order=await API.getOrder(input);state.tracked=order;}catch(error){state.trackError=error.message||'تعذر عرض الطلب حاليًا. حاول مرة أخرى.';}finally{state.trackLoading=false;render();focusClientPostAction();}
}
async function acceptOffer(sn,offerId){
  if(!confirm('تأكيد قبول هذا العرض؟'))return;
  if(state.acceptingOffer)return;
  state.acceptingOffer=offerId;render();
  try{await API.acceptOffer(sn,offerId);showToast('تم قبول العرض بنجاح','success');state.trackInput=sn;await doTrack();focusClientPostAction();}catch(error){showToast(error.message||'تعذر قبول العرض حاليًا.');}finally{state.acceptingOffer='';render();focusClientPostAction();}
}
async function sendComplaint(){
  if(state.complaintLoading)return;
  if(!VALIDATORS.name(state.complaintName)){showToast('اكتب اسم العميل المسجل مع الطلب بشكل صحيح.');document.getElementById('complaintNameInput')?.focus();return;}
  if(!VALIDATORS.sn(state.complaintSn)){showToast('اكتب كود الطلب بشكل صحيح.');document.getElementById('complaintSnInput')?.focus();return;}
  if(!VALIDATORS.text(state.complaintText,10,1000)){showToast('اكتب تفاصيل الشكوى في 10 حروف على الأقل.');document.getElementById('complaintTextInput')?.focus();return;}
  state.complaintLoading=true;render();
  try{
    await API.sendComplaint({sn:state.complaintSn,clientName:state.complaintName,text:state.complaintText});
    showToast('تم إرسال الشكوى بنجاح، وستتم مراجعتها من الإدارة.','success');
    state.complaintSn='';state.complaintName='';state.complaintText='';
  }catch(error){showToast(error.message||'تعذر إرسال الشكوى حاليًا.');}finally{state.complaintLoading=false;render();}
}
document.addEventListener('DOMContentLoaded',()=>{
  loadServices();loadPublicContent();initializeClientAccount();render();
  // The editor preview bypasses the shared layout loader's splash timer.
  // Release the static customer splash after the first preview render.
  if(window.IS_EDITOR_PREVIEW){
    const previewSplash=document.getElementById('clientLoadingOverlay');
    requestAnimationFrame(()=>requestAnimationFrame(()=>previewSplash?.classList.add('is-hidden')));
  }
  document.addEventListener('click',handleOutsideServiceClick);
  let clientLivePollInFlight=false,clientNotificationPollInFlight=false;
  setInterval(async function(){
    if(document.hidden||clientLivePollInFlight)return;
    if(state.accountToken&&state.account&&!clientNotificationPollInFlight){
      clientNotificationPollInFlight=true;
      loadNotifications().catch(()=>{}).finally(()=>{clientNotificationPollInFlight=false;});
    }
    if(!state.accountToken||!state.account)return;
    clientLivePollInFlight=true;
    try{
      const before=JSON.stringify((state.myOrders||[]).map(o=>({id:String(o._id||''),status:o.status,acceptedOfferId:String(o.acceptedOfferId||''),updatedAt:o.updatedAt||'',offers:(o.offers||[]).map(x=>({id:String(x._id||''),price:x.priceNum??x.price??null,status:x.offerStatus||''})),priceChangeRequests:(o.priceChangeRequests||[]).map(r=>({id:String(r._id||''),status:r.status||'',newPrice:r.newPrice??null,requestedAt:r.requestedAt||''}))})));
      const data=await API.getMyOrders();state.myOrders=Array.isArray(data.orders)?data.orders:[];
      const after=JSON.stringify(state.myOrders.map(o=>({id:String(o._id||''),status:o.status,acceptedOfferId:String(o.acceptedOfferId||''),updatedAt:o.updatedAt||'',offers:(o.offers||[]).map(x=>({id:String(x._id||''),price:x.priceNum??x.price??null,status:x.offerStatus||''})),priceChangeRequests:(o.priceChangeRequests||[]).map(r=>({id:String(r._id||''),status:r.status||'',newPrice:r.newPrice??null,requestedAt:r.requestedAt||''}))})));
      if(before!==after&&state.tab==='orders')clientLiveRenderPending=true;
      if(clientLiveRenderPending&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName)){
        clientLiveRenderPending=false;const scrollY=window.scrollY||window.pageYOffset||0;render();window.scrollTo({top:scrollY,left:0,behavior:'instant'});focusClientPostAction();
      }
    }catch(_){/* Keep the last successful orders during temporary network failures. */}
    finally{clientLivePollInFlight=false;}
  },3000);
  setInterval(async function(){
    if(document.hidden||!state.tracked||!state.trackInput)return;
    await refreshTrackedSilently();
  },3000);
  setInterval(refreshTrackedChatSilently,2000);
});
render();
