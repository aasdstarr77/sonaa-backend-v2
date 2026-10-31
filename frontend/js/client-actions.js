'use strict';

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
