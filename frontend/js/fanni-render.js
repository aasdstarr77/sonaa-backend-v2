'use strict';

function render(){
  if(window.IS_EDITOR_PREVIEW&&window.PREVIEW_REQUESTED_TAB){state.tab=window.PREVIEW_REQUESTED_TAB;}
  const user=currentUser||getUser()||(window.IS_EDITOR_PREVIEW&&window.PREVIEW_REQUESTED_TAB&&!['login','register'].includes(window.PREVIEW_REQUESTED_TAB)?{name:'معاينة المحرر',status:'approved',technicianGuidelinesAcceptedAt:'preview',technicianGuidelinesVersion:'2026-10-20-v1',specialties:[],areas:[],walletBalance:0}:null);
  const previewTab=window.IS_EDITOR_PREVIEW?window.PREVIEW_REQUESTED_TAB:'';
  const authenticated=(!!previewTab&&!['login','register'].includes(previewTab))||(!!getToken()&&!forceTechnicianRegistration);
 document.title=authenticated?'لوحة الفني | صُنّاع':(state.tab==='register'?'تسجيل فني جديد | صُنّاع':'تسجيل دخول الفني | صُنّاع');
 const specialties=Array.isArray(user?.specialties)?user.specialties:[];
 const areas=Array.isArray(user?.areas)?user.areas:[];
 const balance=state.walletBalance||user?.walletBalance||user?.balance||user?.wallet||0;
 const approved=isApproved();
 const status=user?.status||'غير محدد';
 const guidelinesAccepted=Boolean(user?.technicianGuidelinesAcceptedAt&&user?.technicianGuidelinesVersion==='2026-10-20-v1');
 if(authenticated && approved && !guidelinesAccepted){document.getElementById('app').innerHTML='<main class="mx-auto max-w-[680px] p-4"><section class="panel p-5 space-y-3"><h1 class="text-xl font-black">أهلًا بيك في صُنّاع – ميثاق التعامل المهني مع العملاء</h1><p class="text-sm leading-7">اقرأ التعليمات التالية ووافق عليها قبل استخدام لوحة الفني.</p><div class="max-h-[55vh] overflow-y-auto rounded-xl border p-4 text-sm leading-7"><p>١. التزم بسعر العرض الذي وافق عليه العميل. أي زيادة تحتاج موافقة صريحة مسجلة داخل المنصة قبل التنفيذ.</p><p>٢. تعامل باحترام وصدق، دون ضغط أو تهديد أو تضليل.</p><p>٣. قبل قبول العرض، الردود المسموحة «نعم»، «لا»، «حسب الاتفاق». ممنوع تبادل بيانات الاتصال أو التحايل على المنصة قبل القبول.</p><p>٤. لا تضغط إنهاء المهمة إلا بعد إنجازها فعلًا.</p><p>٥. احمِ بيانات العميل ولا تستخدمها خارج الطلب.</p><p>٦. يحق للطرفين التقييم بعد الإكمال؛ ممنوع الإكراه على تقييم إيجابي أو التلاعب بالتقييمات.</p><p>٧. المخالفات قد تؤدي إلى مراجعة الطلب أو تعليق الحساب أو إيقافه.</p><p class="font-extrabold">بالضغط على الموافقة، تؤكد أنك قرأت التعليمات وفهمتها وتتعهد بالالتزام بها أثناء استخدام منصة صُنّاع.</p></div><label class="flex gap-2 items-start text-sm font-bold"><input id="guidelinesAcceptedCheck" type="checkbox" class="mt-1"> قرأت التعليمات وأوافق على الالتزام بها.</label><button type="button" onclick="if(!document.getElementById(\'guidelinesAcceptedCheck\')?.checked){toast(\'لازم تحدد الموافقة أولًا.\',\'error\');return;}acceptTechnicianGuidelines()" class="primary-btn w-full h-12 rounded-xl font-extrabold">موافق ثم تأكيد</button></section></main>';return;}

 document.getElementById('app').innerHTML=`
 <header class="app-header fanni-app-header sticky top-0 z-40 backdrop-blur-xl">
  <div class="mx-auto w-full max-w-[640px] px-3 sm:px-4 py-2 flex items-center justify-between gap-2">
   <div class="flex items-center gap-2 min-w-0 flex-1">
    <div class="brand-mark h-16 w-16 sm:h-[84px] sm:w-[84px] rounded-xl flex items-center justify-center shrink-0"><img class="sonaa-logo-svg" src="/images/LOGO_UPLOAD_HERE/logo.png" alt="شعار صُنّاع" width="120" height="120" decoding="async"></div>
    <div class="min-w-0"><h1 class="font-extrabold text-[16px] leading-tight truncate"><span class="sonaa-brand-shimmer">${esc(state.publicContent?.siteName||'صُنّاع')}</span></h1><p class="client-header-slogan mt-2 text-sm sm:text-base font-black whitespace-nowrap">كل خدمة تبدأ بخطوة</p></div>
   </div>
   <div class="flex flex-col items-end gap-1.5 shrink-0">
    <div class="flex items-center justify-end gap-1">
     <a href="https://aasdstarr77.github.io/sonaa-download/" aria-label="تحميل تطبيق صُنّاع" title="تحميل تطبيق صُنّاع" class="dashboard-download-btn h-9 px-2 sm:px-3 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-800 inline-flex items-center justify-center gap-1.5 text-[10px] sm:text-[11px] font-extrabold whitespace-nowrap"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/></svg><span>تحميل التطبيق</span></a>
     <button type="button" onclick="toggleNotifications()" aria-label="الإشعارات" title="الإشعارات" class="relative h-9 w-9 rounded-xl border border-amber-200 bg-amber-50 text-[18px] text-amber-600 shrink-0">🔔${notificationBadge()}</button>
     ${authenticated?'<button type="button" onclick="location.href=\'password.html?role=fanni&mode=account\'" aria-label="حسابي" class="h-9 px-2 rounded-xl border border-blue-200 bg-blue-50 text-blue-800 inline-flex items-center justify-center text-[11px] font-extrabold whitespace-nowrap">حسابي</button><button type="button" onclick="logout()" aria-label="خروج" class="h-9 px-2 rounded-xl bg-slate-100 text-slate-700 text-[11px] font-extrabold whitespace-nowrap">خروج</button>':''}
    </div>
    <a href="/" aria-label="القائمة الرئيسية" title="القائمة الرئيسية" class="client-home-main-btn h-8 px-3 rounded-lg text-white inline-flex items-center justify-center gap-1 text-[10px] font-extrabold whitespace-nowrap"><span aria-hidden="true">⌂</span><span>القائمة الرئيسية</span></a>
   </div>
  </div>
  ${notificationPanel()}
 </header>

 <main class="mx-auto max-w-[680px] px-3 pb-[160px]">
 ${!authenticated?`
  <section class="account-gate fanni-login-gate mt-5 px-4 py-6 flex flex-col items-center">
   <div class="w-full max-w-[440px]">
    <nav dir="rtl" class="account-top-nav mb-5 flex items-center justify-start gap-2"><a href="/" aria-label="القائمة الرئيسية" title="القائمة الرئيسية" class="account-nav-btn account-home-btn h-10 px-4 rounded-xl inline-flex items-center justify-center text-xs font-black">⌂ القائمة الرئيسية</a><a href="https://aasdstarr77.github.io/sonaa-download/" aria-label="تحميل تطبيق صُنّاع" title="تحميل تطبيق صُنّاع" class="account-nav-btn account-download-btn h-10 px-4 rounded-xl inline-flex items-center justify-center text-xs font-black">⬇ تحميل التطبيق</a><button type="button" onclick="goBack()" class="account-nav-btn h-10 px-3 rounded-xl border border-slate-200 bg-white text-slate-700 text-xs font-extrabold">← رجوع</button></nav>
    <div class="text-center mb-6">
     <div class="account-brand fanni-login-brand brand-mark mx-auto flex items-center justify-center"><img class="sonaa-logo-svg" src="/images/LOGO_UPLOAD_HERE/logo.png" alt="شعار صُنّاع" width="144" height="144" decoding="async"></div>
     <h1 class="mt-4 text-2xl font-black">${state.tab==='register'?'تسجيل فني جديد':'تسجيل دخول الفني'}</h1>
     <p class="account-slogan mt-1 text-sm">صُنّاع كل خدمة تبدأ بخطوة</p>
    </div>
    <section class="fanni-login-panel account-panel mt-4 panel p-5 animate-fade">
     <div class="account-tabs fanni-login-tabs grid grid-cols-1 gap-2">
       <button type="button" onclick="setTab(state.tab==='register'?'login':'register')" class="account-switch-link" aria-label="${state.tab==='register'?'تسجيل الدخول':'تسجيل فني جديد'}"><span>${state.tab==='register'?'لتسجيل الدخول':'لتسجيل فني جديد'}</span><small>اضغط هنا</small></button>
      </div>
  ${state.tab==='register'?`
   <div class="space-y-4">
    <div><label class="field-label">الاسم بالكامل *</label><input id="fanniRegName" class="field" autocomplete="name" enterkeyhint="next" value="${esc(state.regName)}" oninput="state.regName=this.value.slice(0,50)" placeholder="الاسم بالكامل"></div>
    <div><label class="field-label">رقم التليفون *</label><input id="fanniRegPhone" class="field" inputmode="numeric" autocomplete="tel" enterkeyhint="next" value="${esc(state.regPhone)}" oninput="state.regPhone=this.value.replace(/\\D/g,'').slice(0,11)" placeholder="01xxxxxxxxx"></div>

    <div class="rounded-2xl border p-3">
     <div class="font-extrabold text-[12px] mb-3">التخصصات * ${SERVICES_LOADING?'<span class="text-blue-600">(جاري التحميل...)</span>':SERVICES_ERROR?'<span class="text-red-600">(فشل التحميل)</span>':''}</div>
     ${SERVICES_LOADING?`
       <div class="py-6 text-center"><div class="inline-block h-6 w-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div><p class="mt-2 text-[11px] font-bold text-slate-600">جاري تحميل التخصصات...</p></div>
     `:SERVICES_ERROR?`
       <div class="rounded-xl bg-red-50 border border-red-200 p-3 text-center"><p class="text-[11px] font-bold text-red-700">${esc(SERVICES_ERROR)}</p><button onclick="loadServices()" class="mt-2 secondary-btn px-4 py-2 text-[11px]">إعادة المحاولة</button><p class="mt-2 text-[10px] text-slate-500">إذا لم تظهر التخصصات، اضغط على إعادة المحاولة.</p></div>
     `:CATEGORIES.map((cat,index)=>{
      const selectedCount=cat.services.filter(s=>state.regSpecialties.includes(s)).length;
      const categoryId='specialty-category-'+index;
      const isOpen=state.openSpecialtyCategory===cat.label;
      return `<section class="mb-3 overflow-hidden rounded-xl border border-slate-200 bg-white">
       <button type="button" onclick="toggleSpecialtyCategory(this.dataset.category)" data-category="${esc(cat.label)}" aria-expanded="${isOpen}" aria-controls="${categoryId}" class="flex w-full items-center justify-between gap-3 bg-slate-50 p-3 text-right">
        <span class="min-w-0"><span class="block text-[12px] font-extrabold text-slate-800">${esc(cat.emoji)} ${esc(cat.label)}</span><span class="mt-1 block text-[10px] font-bold text-slate-500">${selectedCount?'تم اختيار '+selectedCount+' خدمة':'اضغط لعرض الخدمات'}</span></span>
        <span class="flex shrink-0 items-center gap-2"><span class="rounded-full bg-blue-100 px-2 py-1 text-[10px] font-extrabold text-blue-800">${selectedCount}</span><span class="text-slate-500">${isOpen?'−':'+'}</span></span>
       </button>
       ${isOpen?`<div id="${categoryId}" class="grid grid-cols-3 gap-2 border-t border-slate-100 p-3 max-[380px]:grid-cols-2">${cat.services.map(s=>`<label class="service-chip ${state.regSpecialties.includes(s)?'selected':''}"><input type="checkbox" data-specialty="${esc(s)}" ${state.regSpecialties.includes(s)?'checked':''} onchange="toggleSpecialty(this.dataset.specialty)"><span class="service-icon" aria-hidden="true">${serviceIconFor(s)}</span><span>${esc(s)}</span></label>`).join('')}</div>`:''}
      </section>`;
     }).join('')}
    </div>

    <div>
      <label class="field-label">منطقة العمل أو الحي اللي حابب تشتغل فيه *</label>
      <input id="fanniRegArea" class="field" required minlength="2" autocomplete="address-level2" enterkeyhint="next" maxlength="60" value="${esc(state.regAreaCustom)}" oninput="state.regAreaCustom=this.value.slice(0,60)" placeholder="مثال: شبرا، المعادي، فيصل...">
      <p class="mt-1 text-[10px] text-slate-500">اكتب اسم المنطقة أو الحي. مش لازم تختار من قائمة.</p>
     </div>
    <div><label class="field-label">كلمة السر *</label><input id="fanniRegPassword" type="password" class="field" autocomplete="new-password" enterkeyhint="next" value="${esc(state.regPass)}" oninput="state.regPass=this.value.slice(0,100)" placeholder="6 أحرف على الأقل"></div>
    <div><label class="field-label">تأكيد كلمة السر *</label><input id="fanniRegPasswordConfirm" type="password" class="field" autocomplete="new-password" enterkeyhint="go" value="${esc(state.regPassConfirm)}" oninput="state.regPassConfirm=this.value.slice(0,100)" placeholder="اكتب كلمة السر مرة تانية"><p class="text-[10px] text-slate-500 mt-1">لازم تكون مطابقة لكلمة السر الأولى.</p></div>

    <section class="rounded-2xl border border-amber-200 bg-amber-50 p-3 space-y-3">
     <h2 class="font-extrabold text-sm text-slate-900">ميثاق التعامل المهني مع العملاء</h2>
     <p class="text-xs leading-6 text-slate-700">اقرأ الميثاق التالي قبل إنشاء حسابك. الموافقة مطلوبة لإتمام التسجيل.</p>
     <div class="max-h-52 overflow-y-auto rounded-xl border border-amber-200 bg-white p-3 text-xs leading-6 space-y-2">
      <p>١. التزم بسعر العرض الذي وافق عليه العميل. أي زيادة تحتاج موافقة صريحة مسجلة داخل المنصة قبل التنفيذ.</p>
      <p>٢. تعامل باحترام وصدق، دون ضغط أو تهديد أو تضليل.</p>
      <p>٣. قبل قبول العرض، الردود المسموحة «نعم»، «لا»، «حسب الاتفاق». ممنوع تبادل بيانات الاتصال أو التحايل على المنصة قبل القبول.</p>
      <p>٤. لا تضغط إنهاء المهمة إلا بعد إنجازها فعلًا.</p>
      <p>٥. احمِ بيانات العميل ولا تستخدمها خارج الطلب.</p>
      <p>٦. يحق للطرفين التقييم بعد الإكمال؛ ممنوع الإكراه على تقييم إيجابي أو التلاعب بالتقييمات.</p>
      <p>٧. المخالفات قد تؤدي إلى مراجعة الطلب أو تعليق الحساب أو إيقافه.</p>
     </div>
     <label class="flex items-start gap-2 text-xs font-bold leading-6 text-slate-800"><input type="checkbox" class="mt-1 shrink-0" ${state.regGuidelinesAccepted?'checked':''} onchange="state.regGuidelinesAccepted=this.checked"> قرأت ميثاق التعامل المهني وفهمته وأوافق على الالتزام به.</label>
    </section>
    <button onclick="doRegister()" ${state.loading||SERVICES_LOADING?'disabled':''} class="primary-btn w-full h-12">${state.loading?'جاري إنشاء الحساب...':SERVICES_LOADING?'جاري تحميل التخصصات...':'إنشاء حساب فني'}</button>
    ${state.error?errorBox(state.error):''}
   </div>`:`
   <div class="space-y-4">
    <div><label class="field-label">رقم التليفون</label><input id="fanniLoginPhone" class="field" type="tel" inputmode="numeric" enterkeyhint="next" onkeydown="if(event.key==='Enter'){event.preventDefault();document.getElementById('fanniLoginPassword')?.focus()}" autocomplete="tel" value="${esc(state.loginPhone)}" oninput="state.loginPhone=this.value.replace(/\\D/g,'').slice(0,11)" placeholder="01xxxxxxxxx"></div>
    <div><label class="field-label">كلمة السر</label><input id="fanniLoginPassword" type="password" class="field" enterkeyhint="go" onkeydown="if(event.key==='Enter'){event.preventDefault();doLogin()}" autocomplete="current-password" value="${esc(state.loginPass)}" oninput="state.loginPass=this.value" placeholder="اكتب كلمة السر"></div>
     <p class="text-left -mt-2 mb-2"><a class="text-xs font-bold text-blue-700" href="password.html?role=fanni&mode=recovery">نسيت كلمة المرور؟</a></p>
    <button type="button" onclick="doLogin()" ${state.loading?'disabled':''} class="primary-btn w-full h-12">${state.loading?'جاري تسجيل الدخول...':'دخول إلى حسابي'}</button>
    ${state.pendingMsg?`<div class="rounded-xl bg-amber-50 border border-amber-200 p-3 text-center text-[12px] font-bold text-amber-800">${esc(state.pendingMsg)}</div>`:''}
    ${state.error?errorBox(state.error):''}
    ${state.tab==='login'?'<p class="mt-4 text-center text-[10px] leading-5 text-slate-500">كلمة السر لا تشارك مع أي شخص.</p>':''}
   </div>`}
  </section>
   </div>
  </section>
 `:`
  <section class="fanni-summary-card mt-4 rounded-2xl p-3 sm:p-4">
   <div class="fanni-summary-top flex items-center justify-between gap-3">
    <div class="min-w-0"><p class="fanni-summary-eyebrow text-[11px] font-bold">أهلاً بيك في صُنّاع</p><h2 class="mt-1 text-[17px] font-extrabold truncate">${esc(user?.name||'فني')}</h2></div>
    <div class="fanni-summary-balance shrink-0 rounded-xl px-3 py-2 text-center"><div class="text-[10px] font-bold">رصيد المحفظة</div><div class="text-[20px] font-black leading-tight">${esc(balance)} <span class="text-[11px]">جنيه</span></div></div>
   </div>
   <details class="fanni-summary-details mt-3">
    <summary class="fanni-details-toggle flex items-center justify-center gap-2 w-full rounded-xl px-3 py-2.5 text-[12px] font-extrabold"><span>تفاصيل</span><svg viewBox="0 0 24 24" class="h-4 w-4 transition-transform" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></summary>
    <div class="fanni-details-content mt-3 space-y-3">
     <div class="fanni-detail-line flex items-center justify-between gap-2 rounded-xl px-3 py-2.5"><span class="text-[11px] font-bold">حالة الاعتماد</span><b class="text-[11px]">${esc(status)}</b></div>
     <div class="fanni-detail-line flex items-center justify-between gap-2 rounded-xl px-3 py-2.5"><span class="text-[11px] font-bold">المستوى المهني</span><b class="text-[11px]">${esc(user?.level||'مبتدئ')}</b></div>
     ${!approved?'<div class="fanni-approval-note rounded-xl px-3 py-2.5 text-[11px] leading-6">حسابك لم يُعتمد بعد. يمكنك مراجعة بياناتك، لكن إرسال العروض وشحن المحفظة متاحان بعد اعتماد الإدارة.</div>':''}
     <div class="fanni-detail-line rounded-xl px-3 py-2.5"><div class="flex items-center justify-between gap-2"><b class="text-[11px]">تخصصاتك</b><span class="text-[10px]">${specialties.length} تخصص</span></div><div class="mt-2 flex flex-wrap gap-1.5">${specialties.map(s=>'<span class="fanni-detail-chip rounded-full px-2.5 py-1 text-[10px]">'+esc(s)+'</span>').join('')||'<span class="text-[10px]">لا توجد تخصصات مسجلة حاليًا.</span>'}</div></div>
     <div class="fanni-detail-line rounded-xl px-3 py-2.5"><b class="text-[11px]">مناطق العمل</b><p class="mt-1 text-[11px] leading-5">${esc(areas.join('، ')||'غير محددة')}</p></div>
     <button type="button" onclick="setTab('wallet')" class="fanni-wallet-shortcut w-full rounded-xl px-3 py-2.5 text-[11px] font-extrabold">فتح المحفظة</button>
    </div>
   </details>
  </section>

   <section class="fanni-dashboard-tabs mt-4"><div class="grid grid-cols-4 gap-1.5">${TECHNICIAN_TAB_DEFINITIONS.map(t=>{const info={available:['📋','طلبات متاحه',state.filteredOrders.length],myOffers:['💼','طلبات جاريه',state.myOffers.length],completed:['🏁','المهام المكتملة',state.completedOffers.length],wallet:['💳','محفظتي','']}[t.id];return `<button type="button" onclick="setTab('${t.id}')" class="min-w-0 rounded-xl border p-1.5 flex flex-col items-center justify-center gap-1 min-h-[64px] ${state.tab===t.id?'bg-blue-50 border-blue-300 text-blue-800':'bg-white border-slate-200 text-slate-600'}"><span class="text-base leading-none">${info[0]}</span><span class="text-[9px] leading-tight font-extrabold text-center">${info[1]}</span>${info[2]!==''?`<span class="text-[8px] leading-none rounded-full bg-white border px-1.5 py-0.5">${info[2]}</span>`:''}</button>`}).join('')}</div></section>

  ${state.tab==='available'?`
   <section class="mt-4 space-y-3">
    <div class="flex justify-between items-center px-1"><h3 class="section-title">الطلبات المتاحة</h3></div>

    <div class="panel p-3 space-y-2">
      <input class="field" value="${esc(state.search)}" oninput="onSearch(this.value)" placeholder="ابحث بكود الطلب أو المنطقة">
      <select class="field" onchange="onFilterSkill(this.value)">
        <option>الكل</option>
        ${SERVICES_LOADING?`<option disabled>جاري تحميل الخدمات...</option>`:
          SERVICES_ERROR?`<option disabled>تعذر تحميل الخدمات</option>`:
          ALL_SERVICES.map(s=>`<option ${state.filterSkill===s?'selected':''}>${esc(s)}</option>`).join('')}
      </select>
      ${SERVICES_ERROR?`<div class="rounded-xl bg-red-50 border border-red-200 p-2 flex justify-between items-center"><span class="text-[11px] text-red-700 font-bold">${esc(SERVICES_ERROR)}</span><button onclick="loadServices()" class="secondary-btn px-3 py-1 text-[10px]">إعادة المحاولة</button></div>`:''}
    </div>

    ${state.loading?'<div class="panel p-6 text-center text-[12px]">جاري تحميل الطلبات...</div>':''}
    ${!state.loading&&!state.filteredOrders.length?'<div class="panel p-8 text-center"><div class="text-2xl">📋</div><p class="text-[13px] font-extrabold mt-3">لا توجد طلبات متاحة حاليًا</p><p class="text-[11px] text-slate-500 mt-1">قد تكون القائمة فارغة أو لا يملك الحساب صلاحية عرض الطلبات.</p></div>':''}

    ${state.filteredOrders.map(o=>{
      const sn=o.sn||o.orderSn||'';
      return `<article class="panel p-4 space-y-3">
       <div class="flex justify-between items-start gap-3">
        <div class="min-w-0"><span class="font-black text-[11px] bg-[#0b1b3a] text-white px-2.5 py-1 rounded-lg">${esc(sn||'بدون كود')}</span><span class="text-[10px] px-2.5 py-1 rounded-full bg-blue-50 border text-blue-700 font-extrabold">${esc(o.service||o.specialty||'')}</span></div>
        <span class="text-[10px] rounded-full bg-emerald-50 px-2 py-1">${esc(o.status||'جديد')}</span>
       </div>

       <div class="rounded-xl border border-slate-100 bg-slate-50 p-3">
        <div class="text-[10px] font-extrabold text-slate-500 mb-1">منطقة الخدمة</div>
        <p class="text-[12px] font-bold text-slate-800">📍 ${esc(o.area||'غير محددة')}</p>
        <p class="text-[10px] text-slate-500 mt-2">بيانات التواصل والعنوان التفصيلي غير متاحة قبل قبول العميل للعرض.</p>
       </div>
       <div class="rounded-xl border border-amber-100 bg-amber-50 p-3"><div class="text-[10px] font-extrabold text-amber-900 mb-2">تقييم العميل وسجل أعماله</div><div class="flex flex-wrap gap-2 text-[10px] font-extrabold"><span class="rounded-full border border-amber-200 bg-white px-2 py-1 text-amber-800">★ ${Number(o.clientRatingAverage||0).toFixed(1)} (${Number(o.clientRatingCount||0)} تقييم)</span><span class="rounded-full border border-emerald-200 bg-white px-2 py-1 text-emerald-800">✓ ${Number(o.clientCompletedJobs||0)} عمل مكتمل</span></div></div>

       ${String(o.budget??'').trim()?`<div class="text-[11px] font-extrabold text-emerald-800 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2 break-words">💰 ميزانية العميل: ${esc(String(o.budget).slice(0,50))}</div>`:''}

       <div class="rounded-xl border border-slate-100 p-3">
        <div class="text-[10px] font-extrabold text-slate-500 mb-1">وصف الطلب</div>
        <p class="text-[12px] bg-slate-50 rounded-xl leading-6 break-words">${esc(String(o.description||o.desc||'بدون وصف').slice(0,180))}</p>${o.hasVoiceRecording?`<button type="button" onclick="playOrderVoice('${esc(sn)}',this)" class="mt-2 rounded-xl bg-blue-700 px-3 py-2 text-[11px] text-white">🎙️ تشغيل التسجيل الصوتي</button>`:''}
       </div>

       ${hasSubmittedOffer(sn)
        ? '<div class="w-full rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-center text-[12px] font-extrabold text-amber-800">✓ تم تقديم عرضك على هذا الطلب — في انتظار رد العميل</div>'
        : `<button data-sn="${esc(sn)}" onclick="openOffer(this.dataset.sn)" ${!approved?'disabled':''} class="primary-btn w-full h-11 text-[12px]">${approved?'تقديم عرض لهذا الطلب':'العروض بعد اعتماد الحساب'}</button>`}
      </article>`;
    }).join('')}
   </section>`:''}

  ${state.tab==='myOffers'?`
   <section class="mt-4 space-y-3">
    <div class="flex justify-between items-center"><h3 class="section-title">عروضي</h3></div>

    ${!state.myOffers.length?'<div class="panel p-8 text-center"><div class="text-2xl">💼</div><p class="text-[13px] font-extrabold mt-3">لا توجد عروض لعرضها</p><p class="text-[11px] text-slate-500 mt-1">العروض التي ترسلها ستظهر هنا، وبيانات العميل تظهر فقط بعد قبوله لعرضك.</p></div>':state.myOffers.map(o=>`<article class="panel p-4 space-y-3">
     <div class="flex justify-between gap-3">
      <div><div class="text-[10px] text-slate-500">كود الطلب</div><b class="font-mono text-[12px]">${esc(o.orderSn||o.sn||o.order?.sn||'')}</b></div>
      <div><div class="text-[10px] text-slate-500">سعر عرضك</div><b class="text-blue-700">${esc(o.price??o.priceNum??'غير متاح')} جنيه</b></div>
     </div>

     <div class="flex flex-wrap items-center gap-2">
      <span class="text-[10px] rounded-full px-3 py-1 font-extrabold ${o?.accepted===true?'bg-emerald-50 text-emerald-800 border border-emerald-100':'bg-amber-50 text-amber-800 border border-amber-100'}">${o?.accepted===true?'تم قبول عرضك':'بانتظار قرار العميل'}</span>
      <span class="text-[10px] rounded-full bg-slate-100 text-slate-700 px-3 py-1">${esc(o.orderStatus||o.status||'حالة غير محددة')}</span>
      ${o.service?`<span class="text-[10px] rounded-full bg-blue-50 text-blue-800 px-3 py-1">${esc(o.service)}</span>`:''}
     </div>

     ${o.message?`<div class="rounded-xl border border-slate-100 bg-slate-50 p-3"><div class="text-[10px] text-slate-500 font-extrabold mb-1">رسالة العرض</div><p class="text-[12px] leading-6 break-words">${esc(o.message)}</p></div>`:''}

     ${renderAcceptedClient(o)}
     ${o?.accepted===true ? `<button type="button" onclick="document.getElementById('fanni-accepted-chat-${esc(o.orderSn||o.sn||o.order?.sn||'')}')?.scrollIntoView({behavior:'smooth',block:'center'})" class="w-full h-10 rounded-xl primary-btn text-[11px] font-extrabold">الدخول إلى المحادثة</button>` : ''}
     ${o?.accepted===true ? '<div class="rounded-xl border border-slate-200 p-3 space-y-2"><p class="text-[12px] font-extrabold">محادثة الطلب</p>'+'<div id="fanni-accepted-chat-'+esc(o.orderSn||o.sn||o.order?.sn||'')+'">'+(Array.isArray(o.chatMessages)?o.chatMessages.map(m=>'<div class="rounded-lg p-2 '+(m.senderRole==='fanni'?'bg-blue-50':'bg-emerald-50')+'"><p class="text-[10px] font-bold">'+(m.senderRole==='fanni'?'أنت':'العميل')+'</p><p class="text-[12px] whitespace-pre-wrap break-words">'+esc(m.text||'')+'</p></div>').join(''):'')+'</div>'+'<textarea id="fanni-chat-'+esc(o.orderSn)+'" data-sn="'+esc(o.orderSn)+'" data-offer-id="'+esc(o._id||'')+'" maxlength="1000" onkeydown="if(event.keyCode===13&&!event.shiftKey){event.preventDefault();sendFanniChat(this.dataset.sn,this.dataset.offerId)}" class="field min-h-[70px]" placeholder="اكتب ردك للعميل"></textarea><button type="button" onclick="sendFanniChat(\''+esc(o.orderSn)+'\',\''+esc(o._id||'')+'\')" class="primary-btn w-full h-10 text-[12px]">إرسال الرسالة</button><p class="text-[10px] text-slate-500">طلب زيادة السعر: اكتب السعر الإجمالي الجديد وسبب الزيادة. لن يتغير السعر إلا بعد موافقة العميل داخل المنصة.</p><input id="price-change-'+esc(o.orderSn)+'" type="number" min="1" step="1" class="field" placeholder="السعر الجديد عند وجود شغل إضافي"><input id="price-reason-'+esc(o.orderSn)+'" maxlength="500" class="field" placeholder="سبب تعديل السعر"><button type="button" onclick="requestFanniPriceChange(\''+esc(o.orderSn)+'\')" class="secondary-btn w-full h-10 text-[12px]">إرسال طلب زيادة السعر للعميل</button></div>' : '<div class="rounded-xl border border-slate-200 p-3 space-y-2"><p class="text-[12px] font-extrabold">استفسارات العميل قبل قبول العرض</p>'+'<div id="fanni-prechat-chat-'+esc(o.orderSn||o.sn||o.order?.sn||'')+'-'+esc(o._id||'')+'">'+(Array.isArray(o.chatMessages)?o.chatMessages.map(m=>'<div class="rounded-lg p-2 '+(m.senderRole==='fanni'?'bg-blue-50':'bg-emerald-50')+'"><p class="text-[10px] font-bold">'+(m.senderRole==='fanni'?'أنت':'العميل')+'</p><p class="text-[12px]">'+esc(m.text||'')+'</p></div>').join(''):'')+'</div>'+'<div class="grid grid-cols-3 gap-2"><button type="button" onclick="sendFanniQuickReply(\''+esc(o.orderSn)+'\',\''+esc(o._id||'')+'\',\'نعم\')" class="secondary-btn text-xs">نعم</button><button type="button" onclick="sendFanniQuickReply(\''+esc(o.orderSn)+'\',\''+esc(o._id||'')+'\',\'لا\')" class="secondary-btn text-xs">لا</button><button type="button" onclick="sendFanniQuickReply(\''+esc(o.orderSn)+'\',\''+esc(o._id||'')+'\',\'حسب الاتفاق\')" class="secondary-btn text-xs">حسب الاتفاق</button></div></div>'}
     ${o?.accepted===true && o.orderStatus==='تم اختيار فني' ? `<button data-sn="${esc(o.orderSn||o.sn||o.order?.sn||'')}" onclick="completeOrder(this.dataset.sn)" class="primary-btn w-full h-11 text-[12px]">إنهاء المهمة</button>` : ''}
    </article>`).join('')}
   </section>`:''}
     ${state.tab==='completed'?`
   <section class="mt-4 space-y-3">
    <div class="flex justify-between items-center">
     <h3 class="section-title">المهام المكتملة</h3>
     
    </div>

    ${!state.completedOffers.length?'<div class="panel p-8 text-center"><div class="text-2xl">🏁</div><p class="text-[13px] font-extrabold mt-3">لا توجد مهام مكتملة</p><p class="text-[11px] text-slate-500 mt-1">المهام التي تنهيها ستظهر هنا.</p></div>':state.completedOffers.map(o=>`<article class="panel p-4 space-y-3">
     <div class="flex justify-between gap-3">
      <div>
       <div class="text-[10px] text-slate-500">كود الطلب</div>
       <b class="font-mono text-[12px]">${esc(o.orderSn||o.sn||o.order?.sn||'')}</b>
      </div>
      <div>
       <div class="text-[10px] text-slate-500">سعر عرضك</div>
       <b class="text-blue-700">${esc(o.price??o.priceNum??'غير متاح')} جنيه</b>
      </div>
     </div>

     <div class="flex flex-wrap items-center gap-2">
      <span class="text-[10px] rounded-full px-3 py-1 font-extrabold bg-emerald-50 text-emerald-800 border border-emerald-100">تم إنهاء المهمة</span>
      ${o.service?`<span class="text-[10px] rounded-full bg-blue-50 text-blue-800 px-3 py-1">${esc(o.service)}</span>`:''}
     </div>

     ${renderAcceptedClient(o)}
     ${o.myRating ? '<div class="rounded-xl border border-emerald-200 bg-emerald-50 p-3"><p class="text-[12px] font-extrabold text-emerald-800">تقييمك للعميل: '+('★'.repeat(Number(o.myRating.stars)||0))+' ('+(Number(o.myRating.stars)||0)+'/5)</p>'+(o.myRating.comment?'<p class="mt-1 text-[12px]">'+esc(o.myRating.comment)+'</p>':'')+'</div>' : !dismissedFanniRatings.has(String(o.orderSn||o.sn||o.order?.sn||'').toUpperCase()) && !isRatingSkipped('fanni',o.orderSn||o.sn||o.order?.sn) ? '<div id="fanni-rating-'+esc(o.orderSn||o.sn||o.order?.sn||'')+'" class="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-2"><h4 class="text-[13px] font-extrabold text-amber-900">قيّم العميل</h4><p class="text-[11px] text-amber-800">التقييم يظهر لك وللعميل. التعليق اختياري.</p><label class="field-label">عدد النجوم</label><select id="rating-stars-'+esc(o.orderSn)+'" class="field" onchange="toggleFanniRatingBlock(\''+esc(o.orderSn)+'\')"><option value="5">★★★★★ — 5 نجوم</option><option value="4">★★★★ — 4 نجوم</option><option value="3">★★★ — 3 نجوم</option><option value="2">★★ — نجمتان</option><option value="1">★ — نجمة واحدة</option></select><label class="field-label">تعليق (اختياري)</label><textarea id="rating-comment-'+esc(o.orderSn)+'" maxlength="500" class="field min-h-[72px]" placeholder="ملاحظاتك عن التعامل مع العميل"></textarea><label id="rating-block-wrap-'+esc(o.orderSn)+'" style="display:none" class="flex items-start gap-2 text-[12px] font-bold text-red-800"><input id="rating-block-'+esc(o.orderSn)+'" type="checkbox" class="mt-1"> عدم استقبال طلبات مستقبلية من هذا العميل</label><button type="button" onclick="submitFanniRating(\''+esc(o.orderSn)+'\')" class="primary-btn w-full h-11 text-[12px]">إرسال التقييم</button><button type="button" onclick="dismissRatingPrompt(\''+esc(o.orderSn)+'\')" class="w-full h-10 rounded-xl border border-amber-300 bg-white text-amber-900 font-extrabold text-[12px]">تخطي التقييم</button></div>' : ''}
     ${Array.isArray(o.ratings)&&o.ratings.length ? '<div class="rounded-xl border border-slate-200 p-3"><p class="text-[12px] font-extrabold">التقييمات المتبادلة</p>'+o.ratings.map(r=>'<div class="mt-2 border-t border-slate-100 pt-2"><p class="text-[12px] font-bold">'+(r.reviewerRole==='client'?'تقييم العميل لك':'تقييمك للعميل')+' — '+('★'.repeat(Number(r.stars)||0))+' ('+(Number(r.stars)||0)+'/5)</p>'+(r.comment?'<p class="text-[12px] mt-1">'+esc(r.comment)+'</p>':'')+'</div>').join('')+'</div>' : ''}
    </article>`).join('')}
   </section>`:''}

  ${state.tab==='wallet'?`
   <section class="mt-4 space-y-4">
    <div class="panel p-4">
     <div class="flex justify-between items-center"><div><h3 class="section-title">محفظتي</h3><p class="text-[10px] text-slate-500 mt-1">طلب شحن الرصيد ومتابعة الطلبات</p></div><b class="text-blue-800">${esc(balance)} ج</b></div>

     <div class="mt-4 rounded-2xl bg-blue-50 border border-blue-100 p-4 space-y-4">
      <p class="text-[11px] font-extrabold text-blue-900">أرقام التحويل المعتمدة</p>
      ${[1,2].map(index=>{const number=String(state['walletPhone'+index]||'').trim();const available=/^01[0-9]{9}$/.test(number);return '<div class="rounded-xl border border-blue-100 bg-white p-3"><p class="text-[11px] font-bold text-slate-600">رقم المحفظة '+(index===1?'الأول':'الثاني')+'</p><div class="mt-2 flex flex-wrap items-center gap-3"><p id="wallet-transfer-number-'+index+'" class="text-[17px] font-black text-blue-800 font-mono" dir="ltr">'+(available?esc(number):'غير متاح')+'</p>'+(available?'<button type="button" onclick="copyWalletNumber('+index+')" class="secondary-btn px-4 py-2 text-[11px]" aria-label="نسخ رقم المحفظة '+index+'">📋 نسخ الرقم</button>':'')+'</div></div>';}).join('')}
      <p class="text-[10px] text-blue-800/80 leading-5">راجع الرقم وبيانات التحويل قبل إرسال أي مبلغ. طلب الشحن يحتاج مراجعة الإدارة.</p>
     </div>

     ${!approved?'<div class="mt-3 rounded-xl bg-amber-50 border border-amber-200 p-3 text-[11px] text-amber-800">لا يمكن تقديم طلب شحن قبل اعتماد حسابك.</div>':''}

     <div class="mt-4 space-y-3">
      <div><label class="field-label">رقم الهاتف المحوّل منه *</label><input class="field" inputmode="numeric" value="${esc(state.walletFromPhone)}" oninput="state.walletFromPhone=this.value.replace(/\\D/g,'').slice(0,11)" placeholder="01xxxxxxxxx"></div>

      <div><label class="field-label">المبلغ بالجنيه *</label><input class="field" type="number" min="10" max="10000" step="1" value="${esc(state.walletAmount)}" oninput="state.walletAmount=this.value.slice(0,5)" placeholder="100"></div>

      <div><label class="field-label">نوع المحفظة المحوَّل منها</label><select class="field" onchange="state.walletMethod=this.value"><option value="vodafone_cash" ${state.walletMethod==='vodafone_cash'?'selected':''}>فودافون كاش</option><option value="orange_cash" ${state.walletMethod==='orange_cash'?'selected':''}>أورنج كاش</option><option value="etisalat_cash" ${state.walletMethod==='etisalat_cash'?'selected':''}>اتصالات كاش</option><option value="we_cash" ${state.walletMethod==='we_cash'?'selected':''}>WE Pay</option></select><p class="text-[11px] font-bold text-red-600 mt-2">⚠️ الشحن للمحفظة فقط. لا نقبل التحويلات عبر إنستاباي (InstaPay).</p></div>

      <div><label class="field-label">الكود المرجعي للتحويل (اختياري)</label><input class="field" value="${esc(state.walletRef)}" oninput="state.walletRef=this.value.slice(0,50)" maxlength="50" placeholder="اكتب الكود إن وجد"></div>

      <button onclick="submitWallet()" ${state.walletLoading||!approved?'disabled':''} class="primary-btn w-full h-12">${state.walletLoading?'جاري إرسال الطلب...':'إرسال طلب الشحن للإدارة'}</button>

      ${state.success?successBox(state.success):''}
      ${state.error?errorBox(state.error):''}
     </div>
    </div>

    <div class="panel p-4">
     <div class="flex justify-between items-center"><div><h4 class="text-[13px] font-extrabold">سجل الشحن</h4><p class="text-[10px] text-slate-500 mt-1">حالة طلبات الشحن السابقة</p></div></div>

     <div class="mt-3 space-y-2">
      ${!state.walletHistory.length?'<div class="rounded-xl bg-slate-50 p-5 text-center text-[11px] text-slate-500">لا توجد طلبات شحن سابقة.</div>':state.walletHistory.map(h=>`<div class="rounded-xl border bg-slate-50 p-3">
       <div class="flex justify-between gap-2"><b class="text-[12px]">${esc(h.amount??'')} جنيه</b><span class="text-[10px] text-slate-500">${esc(h.senderNumber||h.fromPhone||h.phone||'')}</span></div>
       <p class="text-[10px] text-slate-500 mt-2">الكود: ${esc(h.referenceNumber||h.reference||h.referenceCode||'بدون')}</p>
       <p class="text-[10px] mt-1 text-blue-700 font-bold">الحالة: ${esc(h.status||'قيد المراجعة')}</p>
       ${h.createdAt?`<p class="text-[10px] text-slate-400 mt-1">${esc(new Date(h.createdAt).toLocaleString('ar-EG'))}</p>`:''}
      </div>`).join('')}
     </div>
    </div>
   </section>`:''}

  ${state.tab==='profile'?`
   <section class="mt-4 panel p-4">
    <div class="flex items-center gap-3 pb-4 border-b"><div class="text-2xl">👤</div><div><h3 class="section-title">بيانات حسابي</h3><p class="text-[10px] text-slate-500 mt-1">راجع بياناتك وعدّل رقم التليفون والتخصصات ومناطق العمل</p></div></div>
    ${state.editProfileMode?`
     <div class="mt-4 space-y-4">
      <div><label class="field-label">رقم التليفون *</label><input id="fanniEditPhone" class="field" inputmode="numeric" autocomplete="tel" maxlength="11" enterkeyhint="next" value="${esc(state.editPhone)}" oninput="state.editPhone=this.value.replace(/\\D/g,'').slice(0,11)" placeholder="01xxxxxxxxx"><p class="text-[10px] text-slate-500 mt-1">رقم مصري من 11 رقمًا وغير مسجل لحساب آخر.</p></div>
      <div><label class="field-label">مناطق العمل *</label><textarea id="fanniEditAreas" class="field min-h-[90px]" maxlength="1800" enterkeyhint="go" oninput="state.editAreasText=this.value.slice(0,1800)" placeholder="اكتب المناطق أو الأحياء وافصل بينها بفاصلة، مثال: شبرا، المعادي، فيصل">${esc(state.editAreasText)}</textarea><p class="text-[10px] text-slate-500 mt-1">اكتب كل المناطق اللي تقدر تشتغل فيها، وافصل بينها بفاصلة.</p></div>
      <div class="rounded-2xl border p-3">
       <div class="font-extrabold text-[12px] mb-3">التخصصات * <span class="text-slate-500">(${state.editSpecialties.length} مختار)</span></div>
       ${SERVICES_LOADING?`<p class="py-4 text-center text-[11px]">جاري تحميل التخصصات...</p>`:SERVICES_ERROR?`<div class="rounded-xl bg-red-50 border border-red-200 p-3 text-[11px] text-red-700">${esc(SERVICES_ERROR)} <button type="button" onclick="loadServices()" class="secondary-btn px-3 py-1">إعادة المحاولة</button></div>`:CATEGORIES.map((cat,index)=>{
        const selectedCount=cat.services.filter(s=>state.editSpecialties.includes(s)).length;
        const categoryId='edit-specialty-category-'+index;
        const isOpen=state.openSpecialtyCategory===cat.label;
        return `<section class="mb-2 overflow-hidden rounded-xl border border-slate-200 bg-white">
         <button type="button" onclick="toggleEditSpecialtyCategory(this.dataset.category)" data-category="${esc(cat.label)}" aria-expanded="${isOpen}" aria-controls="${categoryId}" class="flex w-full items-center justify-between gap-3 bg-slate-50 p-3 text-right">
          <span><span class="block text-[12px] font-extrabold">${esc(cat.emoji)} ${esc(cat.label)}</span><span class="mt-1 block text-[10px] text-slate-500">${selectedCount?'تم اختيار '+selectedCount+' خدمة':'اضغط لعرض الخدمات'}</span></span><span class="text-blue-700 font-black">${isOpen?'−':'+'}</span>
         </button>
         ${isOpen?`<div id="${categoryId}" class="grid grid-cols-2 sm:grid-cols-3 gap-2 border-t p-3">${cat.services.map(s=>`<label class="service-chip ${state.editSpecialties.includes(s)?'selected':''}"><input type="checkbox" data-specialty="${esc(s)}" ${state.editSpecialties.includes(s)?'checked':''} onchange="toggleEditSpecialty(this.dataset.specialty)"><span class="service-icon" aria-hidden="true">${serviceIconFor(s)}</span><span>${esc(s)}</span></label>`).join('')}</div>`:''}
        </section>`;
       }).join('')}
      </div>
      ${state.error?errorBox(state.error):''}
      <div class="grid grid-cols-2 gap-2"><button type="button" onclick="cancelEditProfile()" class="secondary-btn h-11" ${state.editSaving?'disabled':''}>إلغاء</button><button type="button" onclick="saveProfileChanges()" class="primary-btn h-11" ${state.editSaving?'disabled':''}>${state.editSaving?'جاري الحفظ...':'حفظ التعديلات'}</button></div>
     </div>
    `:`
     <div class="mt-4 space-y-4 text-[12px]"><div class="rounded-2xl border border-blue-100 bg-blue-50/60 p-3"><div class="mb-2 font-extrabold text-blue-900">بيانات الحساب</div>${[['الاسم',user?.name],['رقم الهاتف',user?.phone],['حالة الحساب',user?.status],['رصيد المحفظة',balance+' جنيه']].map(x=>`<div class="rounded-xl bg-white border p-3 mb-2"><div class="text-[10px] text-slate-500 mb-1">${x[0]}</div><b>${esc(x[1]||'غير متاح')}</b></div>`).join('')}</div><div class="rounded-2xl border border-slate-200 bg-slate-50 p-3"><div class="mb-2 font-extrabold text-slate-800">بيانات العمل</div>${[['التخصصات',specialties.join('، ')],['مناطق العمل',areas.join('، ') ]].map(x=>`<div class="rounded-xl bg-white border p-3 mb-2"><div class="text-[10px] text-slate-500 mb-1">${x[0]}</div><b>${esc(x[1]||'غير متاح')}</b></div>`).join('')}</div></div>
     <button type="button" onclick="beginEditProfile()" class="mt-4 w-full h-11 rounded-xl bg-blue-50 border border-blue-200 text-blue-800 font-extrabold text-[12px]">✏️ تعديل البيانات</button>
     <div class="mt-4 rounded-xl border border-emerald-100 bg-emerald-50/60 p-3">
      <div class="font-extrabold text-[12px] text-emerald-900">شاراتي</div>
      <div class="mt-2 flex flex-wrap gap-1.5">${(Array.isArray(user?.badges)?user.badges:[]).map(b=>({trusted:'✓ فني موثوق',top_rated:'★ الأعلى تقييمًا',verified:'✓ تم التحقق',fast_response:'⚡ سريع الاستجابة',premium:'◆ فني مميز',gold:'★ الشارة الذهبية'}[b]||'')).filter(Boolean).map(label=>`<span class="rounded-full border border-emerald-200 bg-white px-2.5 py-1 text-[10px] font-extrabold text-emerald-800">${esc(label)}</span>`).join('')||'<span class="text-[11px] text-slate-500">لا توجد شارات ممنوحة حاليًا</span>'}</div>
     </div>
     <button onclick="logout()" class="fanni-profile-logout mt-4 w-full h-11 rounded-xl font-extrabold text-[12px]">تسجيل الخروج</button>
    `}
   </section>`:''}
 `}
 
 ${state.offerModal?`
 <div class="fixed inset-0 z-50 bg-[#07152e]/55 backdrop-blur-sm flex items-end sm:items-center justify-center p-3">
  <div class="w-full max-w-[480px] bg-white rounded-[22px] p-5 shadow-2xl">
   <div class="flex justify-between items-center pb-3 border-b"><div><h3 class="font-extrabold text-[15px]">تقديم عرض</h3><p class="text-[10px] text-slate-500 mt-1">كود الطلب: ${esc(state.offerModal.sn)}</p></div><button onclick="closeOffer()" class="h-9 w-9 rounded-xl bg-slate-100">✕</button></div>

   <div class="mt-4 space-y-4">
    <div><label class="field-label">السعر بالجنيه *</label><input id="fanniOfferPrice" class="field" type="number" min="10" max="1000000" step="1" enterkeyhint="next" value="${esc(state.offerPrice)}" oninput="state.offerPrice=this.value.slice(0,7)" placeholder="150"></div>

    <div><label class="field-label">رسالتك للعميل *</label><textarea id="fanniOfferMessage" class="field min-h-[100px]" enterkeyhint="go" oninput="state.offerMessage=this.value.slice(0,500)" placeholder="اكتب تفاصيل العرض والوقت المتوقع للوصول">${esc(state.offerMessage)}</textarea><p class="text-[10px] text-slate-500 mt-1">من 5 إلى 500 حرف.</p></div>

    ${state.offerError?errorBox(state.offerError):''}

    <button onclick="submitOffer()" ${state.offerSubmitting||!approved?'disabled':''} class="primary-btn w-full h-12">${state.offerSubmitting?'جاري إرسال العرض...':'إرسال العرض للعميل'}</button>

    ${!approved?'<p class="text-[11px] text-amber-700">لا يمكن إرسال عرض قبل اعتماد الحساب.</p>':''}
   </div>
  </div>
 </div>`:''}
 </main>

 <nav class="fixed bottom-0 inset-x-0 z-30 border-t bg-white/95 backdrop-blur-xl safe-bottom">
   <div class="mx-auto max-w-[680px] px-1 h-[70px] grid grid-cols-4 gap-0.5">
    ${authenticated?[['available','📋','الطلبات'],['myOffers','💼','عروضي'],['wallet','💳','المحفظة']].map(t=>`<button onclick="setTab('${t[0]}')" class="rounded-xl flex flex-col items-center justify-center gap-1 ${state.tab===t[0]?'bg-blue-50 text-blue-800':'text-slate-500'}"><span>${t[1]}</span><span class="text-[9px] font-extrabold">${t[2]}</span></button>`).join(''):`<button onclick="setTab('login')">🔑<span class="block text-[10px]">دخول</span></button><button onclick="setTab('register')">📝<span class="block text-[10px]">تسجيل</span></button><button onclick="goClient()">👥<span class="block text-[10px]">عميل</span></button><button onclick="setTab('register')">🧑‍🔧<span class="block text-[10px]">فني</span></button>`}
       
   </div>
  </nav>
  ${`<a href="support.html?role=fanni" aria-label="خدمة العملاء" title="خدمة العملاء" class="support-float ${authenticated?'':'prelogin-floating'}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 13v-2a8 8 0 0 1 16 0v2"/><rect x="3" y="12" width="4" height="7" rx="2"/><rect x="17" y="12" width="4" height="7" rx="2"/><path d="M17 19a5 5 0 0 1-5 2h-1"/></svg></a>`:''}
  <button id="global-refresh" type="button" onclick="handleGlobalRefresh()" aria-label="تحديث البيانات" title="تحديث البيانات" class="global-refresh global-refresh-float ${authenticated?'':'prelogin-floating'} ${globalRefreshInProgress?'is-refreshing':''}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 7v5h-5"/><path d="M4 17v-5h5"/><path d="M5.6 9A7 7 0 0 1 17 5l3 7M4 12l3 7a7 7 0 0 0 11.4-2"/></svg></button>`;
 
}
