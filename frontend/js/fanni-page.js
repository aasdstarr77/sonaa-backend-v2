
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




// أيقونات متنوعة ومخصصة حسب نوع الخدمة لتقليل تكرار الرموز.















































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




let dashboardSpecialtiesCollapsed=true;


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




























const TECHNICIAN_TAB_DEFINITIONS=[{id:'available',label:'طلبات متاحة'},{id:'myOffers',label:'طلبات جارية'},{id:'completed',label:'المهام المكتملة'},{id:'wallet',label:'محفظتي'}];

















 








const dismissedFanniRatings=new Set();



















document.addEventListener('click',e=>{const item=e.target.closest('[data-fanni-notification-id]');if(item)openNotification(item.getAttribute('data-fanni-notification-id'));});
document.addEventListener('click',function(e){const button=e.target.closest('[data-fanni-tab]');if(!button)return;const tab=button.getAttribute('data-fanni-tab');if(tab==='profile'){e.preventDefault();location.href='password.html?role=fanni&mode=account';}});










































 






 















let fanniLoadingSafetyTimer=null;









let globalRefreshInProgress=false;
let fanniChatPollInFlight=false,fanniLiveRenderPending=false;






let fanniMessagesPollInFlight=false;


setInterval(refreshFanniChatsSilently,3000);
setInterval(refreshFanniChatMessagesSilently,2000);


start();
