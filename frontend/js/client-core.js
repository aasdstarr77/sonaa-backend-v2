
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