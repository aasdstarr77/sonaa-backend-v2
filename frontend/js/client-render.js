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