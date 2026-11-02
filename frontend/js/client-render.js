
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
  <header class="app-header sticky top-0 z-40 backdrop-blur-xl bg-white/95">
    <div class="mx-auto w-full max-w-[640px] px-3 py-2.5 flex items-center justify-between gap-2">
      <div class="flex items-center gap-2.5 min-w-0">
        <div class="brand-mark h-12 w-12 rounded-xl flex items-center justify-center shrink-0 bg-white border border-slate-100 shadow-sm"><img class="sonaa-logo-svg w-10 h-10" src="/images/LOGO_UPLOAD_HERE/logo.png" alt="صُنّاع"></div>
        <div class="min-w-0">
          <h1 class="font-black text-[14px] leading-tight truncate">${escHtml(state.publicContent?.siteName||'صُنّاع')}</h1>
          <p class="text-[11px] font-bold text-slate-500">كل خدمة تبدأ بخطوة</p>
        </div>
      </div>
      <div class="flex items-center gap-1.5 shrink-0">
        <a href="https://aasdstarr77.github.io/sonaa-download/" class="h-9 px-3 rounded-xl bg-blue-600 text-white text-[11px] font-black inline-flex items-center justify-center gap-1">تحميل</a>
        <button type="button" onclick="toggleNotifications()" class="relative h-9 w-9 rounded-xl border bg-white flex items-center justify-center text-[16px]">🔔${notificationBadge()}</button>
        <a href="/" class="h-9 w-9 rounded-xl bg-slate-50 border flex items-center justify-center text-[16px]">⌂</a>
      </div>
    </div>
    <div class="mx-auto w-full max-w-[640px] px-3 pb-2.5 flex gap-2">
      <a href="password.html?role=client&mode=account" class="flex-1 h-9 rounded-xl bg-blue-50 border border-blue-100 text-blue-800 flex items-center justify-center text-[11px] font-black">حسابي</a>
      <button type="button" onclick="logoutClient()" class="flex-1 h-9 rounded-xl bg-red-50 border border-red-100 text-red-700 text-[11px] font-black">خروج</button>
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
            <div><label class="text-[11px] font-black mb-1 block">وصف المشكلة</label><textarea oninput="onDescInput(this.value)" placeholder="اكتب التفاصيل..." class="field min-h-[100px] p-3 w-full">${escHtml(state.desc)}</textarea></div>
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
