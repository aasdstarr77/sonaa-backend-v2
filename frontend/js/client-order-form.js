/* Extracted page functions; classic-script globals are preserved. */
'use strict';

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
