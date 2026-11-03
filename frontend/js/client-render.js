
'use strict';

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
  <style>
   .account-top-nav{justify-content:center!important;align-items:center!important;flex-wrap:nowrap!important;width:100%!important;margin-inline:auto!important}
   body .support-float{position:fixed!important;left:16px!important;right:auto!important;bottom:85px!important}
   body .global-refresh-float{position:fixed!important;right:16px!important;left:auto!important;bottom:85px!important}


  </style>
  <header class="app-header fanni-app-header sticky top-0 z-40 backdrop-blur-xl">
   <div class="mx-auto w-full max-w-[640px] px-3 sm:px-4 py-2 flex items-center justify-between gap-2">
    <div class="flex items-center gap-2 min-w-0 flex-1">
     <div class="brand-mark h-16 w-16 sm:h-[84px] sm:w-[84px] rounded-xl flex items-center justify-center shrink-0"><img class="sonaa-logo-svg" src="/images/LOGO_UPLOAD_HERE/logo.png" alt="شعار صُنّاع" width="120" height="120" decoding="async" style="width:100%;height:100%;padding:4px;box-sizing:border-box;object-fit:contain"></div>
     <div class="min-w-0"><h1 class="font-extrabold text-[16px] leading-tight truncate"><span class="sonaa-brand-shimmer">${escHtml(state.publicContent?.siteName||'صُنّاع')}</span></h1><p class="client-header-slogan mt-2 text-sm sm:text-base font-black whitespace-nowrap">كل خدمة تبدأ بخطوة</p></div>
    </div>
    <div class="flex flex-col items-end gap-1.5 shrink-0">
     <div class="flex items-center justify-end gap-1">
      <a href="https://aasdstarr77.github.io/sonaa-download/" aria-label="تحميل تطبيق صُنّاع" title="تحميل تطبيق صُنّاع" class="dashboard-download-btn h-9 px-2 sm:px-3 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-800 inline-flex items-center justify-center gap-1.5 text-[10px] sm:text-[11px] font-extrabold whitespace-nowrap"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/></svg><span>تحميل التطبيق</span></a>
      <button type="button" onclick="toggleNotifications()" aria-label="الإشعارات" title="الإشعارات" class="relative h-9 w-9 rounded-xl border border-amber-200 bg-amber-50 text-[18px] text-amber-600 shrink-0">🔔${notificationBadge()}</button>
      <a href="password.html?role=client&mode=account" aria-label="حسابي" title="حسابي" class="h-9 px-2 rounded-xl border border-blue-200 bg-blue-50 text-blue-800 inline-flex items-center justify-center text-[11px] font-extrabold whitespace-nowrap">حسابي</a>
      <button type="button" onclick="logoutClient()" aria-label="خروج" title="خروج" class="h-9 px-2 rounded-xl bg-red-50 border border-red-100 text-red-700 text-[11px] font-extrabold whitespace-nowrap">خروج</button>
     </div>
     <a href="/" aria-label="القائمة الرئيسية" title="القائمة الرئيسية" class="client-home-main-btn h-8 px-3 rounded-lg text-white inline-flex items-center justify-center gap-1 text-[10px] font-extrabold whitespace-nowrap"><span aria-hidden="true">⌂</span><span>القائمة الرئيسية</span></a>
    </div>
   </div>
  ${notificationPanel()}
  </header>
  <a href="support.html?role=client" aria-label="خدمة العملاء" class="support-float"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 13v-2a8 8 0 0 1 16 0v2"/><rect x="3" y="12" width="4" height="7" rx="2"/><rect x="17" y="12" width="4" height="7" rx="2"/><path d="M17 19a5 5 0 0 1-5 2h-1"/></svg></a><button id="global-refresh" type="button" onclick="handleGlobalRefresh()" class="global-refresh global-refresh-float ${globalRefreshInProgress?'is-refreshing':''}"><svg viewBox="0 0 24 24" width="23" height="23" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 7v5h-5"/><path d="M4 17v-5h5"/><path d="M5.6 9A7 7 0 0 1 17 5l3 7M4 12l3 7a7 7 0 0 0 11.4-2"/></svg></button>
  ${renderPublicContent()}
  <main class="mx-auto w-full max-w-[640px] px-3 pb-[160px]">
    <div class="client-section-tabs sticky top-[88px] z-30 mt-3 flex p-1 bg-white rounded-[14px] border gap-1">
      ${CLIENT_TAB_DEFINITIONS.map(t=>`<button type="button" onclick="setTab('${t.id}')" class="flex-1 h-10 rounded-xl text-[12px] font-black ${state.tab===t.id?'tab-active':'tab-idle'}">${t.label}</button>`).join('')}
    </div>
    ${state.tab==='new'?`
      ${!state.sn?`
      <div class="mt-4 space-y-3 animate-fade client-new-order">
        <div class="panel p-4">
          <h3 class="font-black text-[14px]">بيانات الطلب</h3>
          <div class="mt-4 space-y-3">
            <div><label class="text-[11px] font-black mb-1 block">اسم العميل</label><input value="${escAttr(state.clientName)}" oninput="onClientNameInput(this.value)" maxlength="50" placeholder="اكتب اسمك" class="field h-[48px] px-3 text-[13px] font-bold w-full"></div>
            <div><label class="text-[11px] font-black mb-1 block">نوع الخدمة</label><button type="button" onclick="toggleService()" class="field h-[54px] px-3 w-full flex items-center justify-between text-right"><span class="font-black text-[13px]">${cat?escHtml(cat.label):'اختار الخدمة'}</span><span>${state.showService?'▲':'▼'}</span></button>
            ${state.showService?`<div id="servicePanel" class="service-picker-dialog border rounded-xl mt-2 bg-white"><div class="p-2"><input id="svcSearch" value="${escAttr(state.searchService)}" oninput="searchService(this.value)" placeholder="ابحث..." class="field h-9 px-3 text-[12px] w-full"></div><div id="serviceList" class="p-2 grid grid-cols-3 gap-2">${visibleCategories.map(c=>`<button type="button" onclick='toggleCategory(${escAttr(JSON.stringify(c.label))})' class="category-tile ${state.openCategory===c.label?'active':''}"><span>${escHtml(c.emoji)}</span><span class="text-[11px] font-black">${escHtml(c.label)}</span></button>`).join('')}</div>${selectedCategory?`<div class="p-2 border-t"><div class="service-choice-grid">${selectedCategory.services.map(s=>`<button type="button" onclick="selectServiceByIndex(${ALL_SERVICES.indexOf(s)})" class="service-choice ${state.service===s?'selected':''}"><span>${escHtml(s)}</span></button>`).join('')}</div></div>`:''}</div>`:''}
            </div>
            <div><label class="text-[11px] font-black mb-1 block">المنطقة</label><input value="${escAttr(state.area)}" oninput="onAreaInput(this.value)" placeholder="المنطقة" class="field h-[48px] px-3 w-full"></div>
            <div><label class="text-[11px] font-black mb-1 block">العنوان</label><input value="${escAttr(state.address)}" oninput="onAddressInput(this.value)" placeholder="العنوان بالتفصيل" class="field h-[48px] px-3 w-full"></div>
            <div><label class="text-[11px] font-black mb-1 block">رقم التليفون</label><input value="${escAttr(state.phone)}" oninput="onPhoneInput(this.value)" placeholder="010..." class="field h-[48px] px-3 w-full"></div>
            <div><label class="text-[11px] font-black mb-1 block">الميزانية</label><input value="${escAttr(state.budget)}" oninput="onBudgetInput(this.value)" placeholder="اختياري" class="field h-[48px] px-3 w-full"></div>
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
            <button type="button" onclick="createOrder()" ${state.loading?'disabled':''} class="client-submit-order-btn w-full h-[50px] rounded-xl bg-blue-600 text-white font-black">إرسال الطلب</button>
          </div>
        </div>
      </div>`:`<div class="mt-4 panel p-5 text-center"><h3 class="font-black text-[18px]">تم إنشاء طلبك!</h3><p class="mt-2 font-mono font-black text-blue-700 text-[20px]">${escHtml(state.sn)}</p><div class="mt-4 grid grid-cols-2 gap-2"><button onclick="trackNow()" class="h-11 rounded-xl bg-slate-900 text-white font-black">عرض طلباتي</button><button onclick="resetForm()" class="h-11 rounded-xl bg-slate-100 font-black">طلب جديد</button></div></div>`}
    `:''}
    ${state.tab==='orders'?renderOrders():''}
    ${state.tab==='track'?`<div class="mt-4 panel p-4"><h3 class="font-black">تتبع طلبك</h3><div class="mt-3 flex gap-2"><input value="${escAttr(state.trackInput)}" oninput="onTrackInput(this.value)" placeholder="SN..." class="field flex-1 h-11 px-3"><button onclick="doTrack()" class="h-11 px-4 rounded-xl bg-slate-900 text-white font-black">تتبع</button></div>${state.trackError?`<p class="mt-2 text-red-600 text-[12px] font-bold">${escHtml(state.trackError)}</p>`:''}${state.tracked?`<div class="mt-4 p-3 bg-slate-50 rounded-xl"><p class="font-black">${escHtml(state.tracked.sn)}</p><p class="text-[12px] mt-1">${escHtml(state.tracked.status||'')}</p></div>`:''}</div>`:''}
    ${state.tab==='complaint'?`<div class="mt-4 panel p-4"><h3 class="font-black">شكوى</h3><input value="${escAttr(state.complaintSn)}" oninput="onComplaintSn(this.value)" placeholder="كود الطلب" class="field h-11 mt-3 w-full px-3"><textarea oninput="onComplaintText(this.value)" placeholder="التفاصيل" class="field mt-2 min-h-[100px] p-3 w-full">${escHtml(state.complaintText)}</textarea><button onclick="sendComplaint()" class="mt-3 w-full h-11 rounded-xl bg-red-600 text-white font-black">إرسال الشكوى</button></div>`:''}
  </main>
  <nav class="fixed bottom-0 inset-x-0 z-30 border-t bg-white">
    <div class="mx-auto max-w-[640px] h-[68px] grid grid-cols-3">
      ${[{id:'new',label:'طلب'},{id:'track',label:'تتبع'},{id:'complaint',label:'شكوى'}].map(t=>`<button onclick="setTab('${t.id}')" class="flex flex-col items-center justify-center gap-1 ${state.tab===t.id?'text-blue-700 bg-blue-50':'text-slate-500'}"><span class="text-[11px] font-black">${t.label}</span></button>`).join('')}
    </div>
  </nav>`;
}
