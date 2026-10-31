'use strict';

function errorBox(s){
 return `<p class="text-[12px] font-bold text-red-600 bg-red-50 border border-red-100 rounded-xl p-3 leading-6">${esc(s)}</p>`;
}

function successBox(s){
 return `<p class="text-[12px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-xl p-3">${esc(s)}</p>`;
}

async function doLogin(){
 if(state.loading)return;

 if(!V.phone(state.loginPhone)){state.error='رقم التليفون غير صحيح';render();return}
 if(!V.text(state.loginPass,1,100)){state.error='اكتب كلمة السر';render();return}

 state.loading=true;
 state.error='';
 state.pendingMsg='';
 render();

 try{
  const data=await API.login({
   phone:state.loginPhone.replace(/\D/g,''),
   password:state.loginPass
  });

  const token=extractToken(data);
  const user=extractUser(data);

  if(!token)throw new Error('تعذر إتمام تسجيل الدخول. حاول مرة أخرى.');
  if(!user)throw new Error('تعذر تحميل بيانات الحساب. حدّث الصفحة وحاول مرة أخرى.');

  // A registration URL may keep ?tab=register after switching to login.
  // Once login succeeds, remove that URL-only gate so the dashboard can render.
  forceTechnicianRegistration=false;
  setAuth(token,user);
  currentUser=user;
  state.loading=false;
  state.tab='myOffers';
  state.loginPass='';
  render();

  toast('تم تسجيل الدخول بنجاح');
  await loadProfile();
  await Promise.allSettled([loadOrders(),loadMyOffers(),loadWalletHistory(),loadNotifications()]);
 }catch(e){
  state.loading=false;

  if(/pending|review|مراجعة|انتظار|قيد/i.test(e.message)){
   state.pendingMsg='حسابك قيد مراجعة الإدارة.';
  }

  state.error=e.message;
  render();
 }
}

async function doRegister(){
 if(state.loading)return;

 if(!V.text(state.regName,2,50)){state.error='الاسم لازم يكون حرفين على الأقل';render();return}
 if(!V.phone(state.regPhone)){state.error='رقم التليفون غير صحيح';render();return}
 if(SERVICES_LOADING){state.error='جاري تحميل قائمة التخصصات، انتظر لحظة.';render();return}
 if(SERVICES_ERROR){state.error='تعذر تحميل التخصصات: '+SERVICES_ERROR+' - اضغط إعادة المحاولة.';render();return}
 if(!CATEGORIES.length){state.error='قائمة التخصصات غير متاحة حاليًا.';render();return}
 if(!state.regSpecialties.length){state.error='اختار تخصصًا واحدًا على الأقل';render();return}

 const area=clean(state.regAreaCustom,60).replace(/\s+/g,' ');
 if(area.length<2){state.error='اكتب اسم المنطقة أو الحي من حرفين على الأقل';render();return}
 if(/01[0-9]{9}/.test(area.replace(/\D/g,''))){state.error='ممنوع كتابة رقم تليفون في المنطقة';render();return}
 const areas=[area];
 if(!V.text(state.regPass,6,100)){state.error='كلمة السر لازم تكون 6 أحرف على الأقل';render();return}
 if(state.regPass!==state.regPassConfirm){state.error='تأكيد كلمة السر غير مطابق. اكتب نفس كلمة السر في الخانتين.';render();return}
 if(!state.regGuidelinesAccepted){state.error='لازم تقرأ ميثاق التعامل المهني وتحدد الموافقة قبل إنشاء الحساب.';render();return}

 state.loading=true;
 state.error='';
 render();

 try{
  await API.register({
   name:clean(state.regName,50),
   phone:state.regPhone.replace(/\D/g,''),
   password:state.regPass,
   specialties:[...state.regSpecialties],
   areas
  });

  state.loading=false;
  state.loginPhone=state.regPhone;
  state.regName='';
  state.regPhone='';
  state.regPass='';
  state.regPassConfirm='';
  state.regGuidelinesAccepted=false;
  state.regSpecialties=[];
  state.regAreas=[];
  state.regAreaSearch='';
  state.regAreaCustom='';
  state.tab='login';
  state.pendingMsg='تم إنشاء حساب بنجاح. حسابك قيد مراجعة الإدارة.';
  state.error='';

  render();
  toast('تم التسجيل - الحساب بانتظار مراجعة الإدارة','pending');
 }catch(e){
  state.loading=false;
  state.error=e.message;
  render();
 }
}

function beginEditProfile(){
 const user=currentUser||getUser()||{};
 state.editPhone=String(user.phone||'');
 state.editAreasText=Array.isArray(user.areas)?user.areas.join('، '):'';
 state.editSpecialties=Array.isArray(user.specialties)?[...user.specialties]:[];
 state.editProfileMode=true;state.openSpecialtyCategory='';state.error='';state.success='';render();
}
function cancelEditProfile(){state.editProfileMode=false;state.editSaving=false;state.error='';state.success='';render();}
function toggleEditSpecialtyCategory(label){state.openSpecialtyCategory=state.openSpecialtyCategory===label?'':label;render();}
function toggleEditSpecialty(specialty){
 if(state.editSpecialties.includes(specialty))state.editSpecialties=state.editSpecialties.filter(item=>item!==specialty);
 else if(state.editSpecialties.length<20)state.editSpecialties=[...state.editSpecialties,specialty];
 else return toast('يمكنك اختيار 20 تخصصًا كحد أقصى','error');
 render();
}
async function saveProfileChanges(){
 if(state.editSaving)return;
 const phone=String(state.editPhone||'').replace(/\D/g,'');
 if(!/^01[0-9]{9}$/.test(phone)){state.error='رقم التليفون لازم يكون 11 رقم ويبدأ بـ 01';render();return;}
 if(!Array.isArray(state.editSpecialties)||!state.editSpecialties.length){state.error='اختار تخصصًا واحدًا على الأقل';render();return;}
 const areas=parseAreas(state.editAreasText);
 if(!areas.length){state.error='اكتب منطقة عمل واحدة على الأقل';render();return;}
 state.editSaving=true;state.error='';state.success='';render();
 try{
  const result=await API.updateProfile({phone,specialties:state.editSpecialties,areas});
  const updated=extractUser(result)||result?.data||result?.fanni||null;
  if(!updated||typeof updated!=='object')throw new Error('تم إرسال طلب التعديل، لكن تعذر تحديث البيانات المعروضة. حدّث الصفحة للتأكد.');
  currentUser={...(currentUser||{}),...updated};setAuth(getToken(),currentUser);
  state.editProfileMode=false;state.editSaving=false;state.error='';state.success='';render();
  toast(result.message||'تم إرسال طلب تعديل البيانات للإدارة للمراجعة');
 }catch(e){state.editSaving=false;state.error=e.message||'تعذر تحديث البيانات';render();}
}

async function loadProfile(){
 if(!getToken())return;

 try{
  const data=await API.profile();
  const user=extractUser(data)||data?.data||data;

  if(user&&typeof user==='object'&&!Array.isArray(user)){
   currentUser={...(currentUser||{}),...user};
   setAuth(getToken(),currentUser);

   if(state.walletBalance===0){
    state.walletBalance=user.walletBalance??user.balance??user.wallet??0;
   }

   render();
  }
 }catch(e){
  if(e.status===401){
   clearAuth();
   currentUser=null;
   state.tab='login';
   state.error='انتهت جلسة الدخول. سجل دخولك مرة أخرى.';
   render();
  }else{
   log('profile',e);
  }
 }
}
