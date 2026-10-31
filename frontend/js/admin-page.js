
'use strict';
const BASE_URL='https://sonaa-backend-v2.vercel.app';
const TOKEN_KEY='admin_token_v3';





































const ADMIN_SECTIONS = [
 {id:'dashboard',label:'الرئيسية',icon:'🏠',tabs:[{id:'dashboard',label:'ملخص الإدارة',count:()=>getAdminSectionCountById('dashboard')},{id:'stats',label:'الإحصائيات'}]},
 {id:'clients',label:'إدارة العملاء',icon:'👥',tabs:[{id:'clients',label:'كل العملاء'},{id:'orders',label:'طلبات العملاء',count:()=>getPendingOrderCount()}]},
 {id:'technicians',label:'إدارة الفنيين',icon:'👷',tabs:[{id:'fannis',label:'كل الفنيين'},{id:'pending',label:'انتظار الاعتماد',count:()=>getPendingTechnicianCount()},{id:'profileEdits',label:'طلبات تعديل البيانات',count:()=>state.pendingProfileEdits.length},{id:'disabled',label:'الفنيون الموقوفون'},{id:'levels',label:'المستويات والشارات'},{id:'offers',label:'عروض الفنيين'},{id:'wallets',label:'محافظ الفنيين'},{id:'topups',label:'طلبات شحن المحافظ',count:()=>getPendingTopupCount()}]},
 {id:'service-management',label:'إدارة الخدمات والمناطق',icon:'🧰',tabs:[{id:'services',label:'المهن والخدمات'},{id:'regions',label:'مناطق الخدمة'}]},
 {id:'customer-operations',label:'خدمة العملاء والتواصل',icon:'💬',tabs:[{id:'complaints',label:'الشكاوى',count:()=>getPendingComplaintCount()},{id:'support',label:'الدعم والمخالفات',count:()=>getPendingRecoveryCount()},{id:'notifications',label:'الإشعارات'},{id:'content',label:'الإعلانات والأسئلة الشائعة'}]},
 {id:'platform-admin',label:'إعدادات وإدارة المنصة',icon:'⚙️',tabs:[{id:'pricing',label:'الأسعار والعمولات'},{id:'reports',label:'التقارير'},{id:'pageVisits',label:'سجل زيارات الموقع'},{id:'security',label:'سجل التدقيق والأمان'},{id:'settings',label:'إعدادات المنصة'},{id:'roles',label:'صلاحيات المشرفين'}]}
];



































let state={
  tab:'dashboard',pageMode:'home',clientStatusFilter:'all',
  adminEmail:'',adminPass:'',currentAdminRoleLabel:'',currentAdminPermissions:{},loading:false,loadingOrders:false,publishingOrders:[],deletingItems:[],
  dropdowns:{}, pendingActions:{},
  fannis:[],filtered:[],pendingProfileEdits:[],topups:[],filteredTopups:[],orders:[],filteredOrders:[],complaints:[],filteredComplaints:[],recoveryRequests:[],loadingComplaints:false,
  services:[],filteredServices:[],servicesLoading:false,servicesError:'',openServices:{},
  clients:[],filteredClients:[],clientsLoading:false,accountCounts:{technicians:0,verifiedTechnicians:0,clients:0},
  adminUsers:[],adminUsersLoading:false,
  
  auditLogs:[],auditDate:'',regions:[],regionsLoading:false,regionsError:'',notifications:[],walletTransactions:[],walletSelectedFanniId:'',walletLoading:false,settings:{siteName:'صُنّاع',maintenance:false},
  reports:{},pricing:null,pricingHistory:[],offerFilter:'all',clientSearch:'',content:{announcement:'',faqs:[]},supportQuery:'',supportResults:{orders:[],complaints:[]},supportViolations:[],notificationHistory:[],notificationHistoryLoading:false,
  search:'',filter:'الكل',filterTopup:'الكل',filterOrder:'الكل',filterComplaint:'الكل',filterClient:'الكل',selectedOrderSNs:[],
  errors:{fannis:'',topups:'',orders:'',complaints:'',services:'',clients:''}, error:''
};










// --- Smart Dropdown System ---


























const ADMIN_PERMISSION_SECTIONS=[
  ['dashboard','الرئيسية والتقارير'],
  ['fannis','الفنيون'],
  ['orders','الطلبات'],
  ['publishOrders','نشر طلبات العملاء للفنيين'],
  ['voiceReview','التسجيلات الصوتية ومراجعتها'],
  ['passwordRecovery','طلبات استعادة كلمة المرور'],
  ['complaints','الشكاوى'],
  ['services','الخدمات والمهن'],
  ['clients','العملاء'],
  ['topups','طلبات الشحن'],
  ['wallet','المحافظ والأرصدة'],
  ['pricing','التسعير'],
  ['settings','إعدادات النظام'],
  ['content','محتوى الموقع'],
  ['support','الدعم والمراجعة'],
  ['regions','المناطق'],
  ['offers','العروض'],
  ['notifications','الإشعارات'],
  ['clientsData','بيانات حسابات العملاء']
];








// تشغيل ومراجعة تسجيلات الطلبات داخل نفس نطاق لوحة الإدارة.
state.voiceReviewAudioUrls = state.voiceReviewAudioUrls || {};
state.voiceReviewAudioPlayed = state.voiceReviewAudioPlayed || {};
state.voiceReviewAudioLoading = state.voiceReviewAudioLoading || {};
window.adminLoadVoice = async function(sn){
  if(!canReadVoiceReview()) return showToast('ليس لديك صلاحية قراءة التسجيلات الصوتية','error');
  sn=String(sn||'').trim().toUpperCase();
  if(!sn) return;
  state.voiceReviewAudioLoading[sn]=true; render();
  try{
    const token=getToken();
    const response=await fetch(buildUrl('/api/orders/'+encodeURIComponent(sn)+'/voice'),{headers:token?{Authorization:'Bearer '+token}:{},mode:'cors',credentials:'omit'});
    if(!response.ok){let msg='تعذر تحميل التسجيل الصوتي';try{const data=await response.json();msg=data.message||msg}catch(_){}throw new Error(msg)}
    const blob=await response.blob();
    if(!blob.type.startsWith('audio/')) throw new Error('استجابة التسجيل ليست ملفًا صوتيًا صالحًا');
    state.voiceReviewAudioUrls[sn]=URL.createObjectURL(blob);
    state.voiceReviewAudioPlayed[sn]=false;
  }catch(e){showToast(e.message||'تعذر تحميل التسجيل الصوتي','error')}
  finally{state.voiceReviewAudioLoading[sn]=false;render()}
};
window.adminVoicePlaybackEnded=function(sn){
  sn=String(sn||'').trim().toUpperCase();
  state.voiceReviewAudioPlayed[sn]=true;render();
};
window.adminMarkVoiceReviewed=async function(sn){
  if(!canWriteVoiceReview()) return showToast('ليس لديك صلاحية تأكيد مراجعة التسجيلات الصوتية','error');
  sn=String(sn||'').trim().toUpperCase();
  if(!state.voiceReviewAudioPlayed[sn]) return showToast('شغّل التسجيل حتى نهايته أولًا.','error');
  try{
    const result=await tryApi(['/api/orders/admin/'+encodeURIComponent(sn)+'/voice-reviewed'],{method:'POST',body:JSON.stringify({})});
    showToast(result.message||'تم تأكيد مراجعة التسجيل');await loadOrders();
  }catch(e){showToast(e.message||'تعذر حفظ مراجعة التسجيل','error')}
};
























































let pageVisitsData={summary:[],recent:[],total:0,filter:''};
















// --- Existing logic preserved ---





 
 
 

const bulkSelectionKeys={fannis:'selectedBulkFanniIds',topups:'selectedBulkTopupIds',clients:'selectedBulkClientPhones',complaints:'selectedBulkComplaintIds',offers:'selectedBulkOfferKeys'};










































































// --- إدارة الفنيين: المستويات والشارات والملاحظات وحدود الاستقبال ---

















































































































if(getToken()){ loadAll(); } else { renderLogin(); }

