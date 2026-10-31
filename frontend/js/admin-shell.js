'use strict';

function render(){
  if(!getToken()){renderLogin();return;}
  if(!canReadTab(state.tab)){const first=ADMIN_SECTIONS.flatMap(section=>section.tabs).find(item=>canReadTab(item.id));state.tab=first?.id||'dashboard';}
  const visibleSections=ADMIN_SECTIONS.filter(section=>section.tabs.some(item=>canReadTab(item.id)));
  const isAuth=true;
  const pendingCount=state.fannis.filter(f=>!f.isApproved&&!f.isDisabled&&f.status!=='rejected').length;
  const disabledCount=state.fannis.filter(f=>f.isDisabled).length;

  document.getElementById('app').innerHTML=`
  <header class="sticky top-0 z-40 glass-header text-white shadow-[0_6px_18px_rgba(11,27,58,.20)]"><div class="mx-auto max-w-[800px] px-3 py-1 grid grid-cols-[minmax(0,1fr)_56px_minmax(0,1fr)] items-center gap-1 min-h-[64px]">
      <div class="admin-header-title min-w-0 text-right self-start">
        <h1 class="font-black text-[14px] leading-5"><span class="sonaa-brand-shimmer">صُنّاع</span> | لوحة الإدارة</h1>
        ${isAuth&&currentAdminRoleLabel()?'<div class="mt-0.5 text-[10px] text-blue-100 font-bold"><span>المنصب الإداري:</span><span>'+escHtml(currentAdminRoleLabel())+'</span></div>':''}
        <button type="button" onclick="goBack()" class="mt-1 h-6 px-3 rounded-lg border border-white/20 bg-white/10 text-white text-[11px] font-extrabold">← رجوع</button>
      </div>
      <div class="admin-logo-frame h-[84px] w-[84px] justify-self-center rounded-2xl bg-[#F8FAFC] border-2 border-[#14B8A6] flex items-center justify-center shadow-lg overflow-hidden">
        <img class="sonaa-logo-svg admin-header-logo h-full w-full object-contain" src="/images/LOGO_UPLOAD_HERE/logo.png" alt="شعار صُنّاع" width="120" height="120" decoding="async">
      </div>
      <div class="admin-header-actions grid grid-cols-2 gap-1 shrink-0 items-center justify-self-end w-auto max-w-[210px]">
        ${isAuth?'<a href="/frontend/editor.html" target="_blank" id="visualEditorLink" style="background:#7C3AED;color:#fff;padding:8px 14px;border-radius:8px;text-decoration:none;margin-right:10px;display:inline-block;">🎨 تحرير الواجهة</a>':''}
        
        <a href="password.html?role=admin&amp;mode=account" class="h-8 w-full rounded-lg bg-white/10 hover:bg-white/20 border border-white/15 text-[10px] font-black text-white inline-flex items-center justify-center gap-1 no-underline leading-none"><span aria-hidden="true">👤</span><span>حسابي</span></a>
        
        <a href="/" aria-label="القائمة الرئيسية" title="القائمة الرئيسية" class="h-8 w-full rounded-lg bg-white/10 hover:bg-white/15 text-white text-[10px] font-black inline-flex items-center justify-center text-center leading-none">⌂ القائمة الرئيسية</a>
        ${isAuth?'<button onclick="logout()" class="h-8 w-full rounded-lg bg-white/10 flex items-center justify-center text-[11px]">⎋ خروج</button>':''}
      </div>
    </div>
  </header>
  
  <main class="mx-auto max-w-[800px] px-3 pb-28">
    ${isAuth?`<section class="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2" aria-label="إحصائيات سريعة"><div class="premium-panel p-3"><p class="text-[10px] font-bold text-slate-500">الطلبات</p><p class="text-[19px] font-black text-slate-900">${state.orders.length}</p></div><div class="premium-panel p-3"><p class="text-[10px] font-bold text-slate-500">الفنيون</p><p class="text-[19px] font-black text-slate-900">${state.accountCounts.technicians}</p></div><div class="premium-panel p-3"><p class="text-[10px] font-bold text-slate-500">العملاء</p><p class="text-[19px] font-black text-slate-900">${state.accountCounts.clients}</p></div><div class="premium-panel p-3"><p class="text-[10px] font-bold text-slate-500">الشكاوى الجديدة</p><p class="text-[19px] font-black text-slate-900">${state.complaints.filter(c=>c.status==='جديدة').length}</p></div></section>

`:''}
    
    ${!isAuth?`
      <section class="mt-8 max-w-[420px] mx-auto premium-panel p-6 sm:p-7 animate-fade">
        <div class="flex items-center gap-3.5">
          <div class="h-12 w-12 rounded-[14px] bg-gradient-to-br from-blue-600 to-indigo-700 text-white flex items-center justify-center font-black">🔐</div>
          <div><h2 class="font-black text-[18px]">دخول الأدمن</h2><p class="text-[11px] text-slate-500 font-bold">إدارة مشروع صُنّاع</p></div>
        </div>
        <form onsubmit="event.preventDefault();doLogin();" class="mt-5 space-y-4">
          <label class="block"><span class="block text-[11px] font-black text-slate-700 mb-2">البريد الإلكتروني</span><input type="email" value="${escHtml(state.adminEmail)}" oninput="state.adminEmail=this.value" required placeholder="admin@sonaa.com" class="field"></label>
          <label class="block"><span class="block text-[11px] font-black text-slate-700 mb-2">كلمة المرور</span><input type="password" value="${escHtml(state.adminPass)}" oninput="state.adminPass=this.value" required placeholder="••••••••" class="field"></label>
          <button type="submit" ${state.loading?'disabled':''} class="w-full h-[48px] rounded-full bg-gradient-to-r from-[#0b1b3a] to-[#1e3a8a] text-white text-[13px] font-black shadow-lg">${state.loading?'جاري...':'تسجيل الدخول ✨'}</button>
          ${state.error?`<p class="text-[12px] text-red-700 bg-red-50 border border-red-200 rounded-[14px] p-3.5 font-bold">${escHtml(state.error)}</p>`:''}
        </form>
      </section>
    `:`
      ${state.pageMode==='home'?`<section class="mt-4 premium-panel p-3 space-y-3">
        <div class="flex items-center justify-between px-1">
          <h2 class="text-[12px] font-black text-slate-700">مركز التحكم</h2>
          <span class="text-[10px] text-slate-500">6 أقسام رئيسية</span>
        </div>
        
        <div class="section-nav" aria-label="كل أدوات لوحة الإدارة">
          ${ADMIN_SECTIONS.filter(section=>section.tabs.some(item=>canReadTab(item.id))).map(section=>`
            <section class="section-nav-group">
              <h3 class="section-nav-heading"><span class="section-nav-icon">${section.icon}</span><span>${escHtml(section.label)}</span></h3>
              <div class="section-nav-items">
                ${section.tabs.map(item=>`
                  <div>
                    <button type="button" onclick="setTab('${item.id}')" class="section-nav-btn ${state.tab===item.id?'active':''}">
                      <span class="section-nav-label">${escHtml(item.label)}</span>${renderSectionCount(item)}
                    </button>
                    
                  </div>
                `).join('')}
                ${section.id==='customer-operations'?'<a href="password.html?role=admin&amp;mode=support" class="section-nav-btn inline-flex items-center justify-center gap-2 no-underline"><span aria-hidden="true">🔐</span><span class="section-nav-label">طلبات استعادة كلمة المرور</span><span id="sonaa-recovery-count" class="section-nav-count" aria-label="عدد طلبات استعادة كلمة المرور">!</span></a>':''}
              </div>
            </section>
          `).join('')}
        </div>
      </section>`:''}
      ${state.pageMode==='section'?`<div class="mt-3 premium-panel p-3 flex flex-col gap-2.5">
        <div class="relative">
          <span class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
          <input value="${escHtml(state.search)}" oninput="onSearch(this.value)" placeholder="بحث شامل..." class="field !pr-10">
        </div>
        ${state.tab==='orders'?`
          <select onchange="onFilterOrder(this.value)" class="field"><option value="الكل">كل الحالات</option><option value="قيد المراجعة">قيد المراجعة</option><option value="تم النشر">تم النشر</option><option value="وصلتك عروض">وصلت عروض</option><option value="تم اختيار فني">تم اختيار فني</option><option value="تم الانتهاء">تم الانتهاء</option></select>
        `:state.tab==='fannis'||state.tab==='pending'||state.tab==='disabled'||state.tab==='levels'?`
          <select onchange="onFilter(this.value)" class="field"><option value="الكل">كل الحالات</option><option value="pending">قيد المراجعة</option><option value="approved">معتمد</option><option value="rejected">مرفوض</option><option value="disabled">معطل</option></select>
        `:''}
      </div>`:''}

      ${state.pageMode==='section'&&state.loading?`<div class="mt-4 premium-panel p-10 text-center"><div class="h-10 w-10 rounded-full border-[3px] border-slate-200 border-t-blue-600 animate-spin mx-auto"></div><p class="mt-3 text-[12px] font-black text-slate-500">جاري التحميل...</p></div>`:''}

      ${state.pageMode==='section'?`<div id="admin-tab-content" class="scroll-mt-24">
        ${renderCurrentTab()}
      </div>`:''}
    `}
  </main>
  <div onclick="closeAllMenus()" id="menu-backdrop" class="${Object.keys(state.dropdowns).length?'fixed inset-0 z-30 bg-black/5':''}"></div>
  `;
}

function renderCurrentTab(){
  if(!canReadTab(state.tab))return '<div class="premium-panel mt-4 p-5 text-center text-[12px] font-bold text-slate-600">هذا القسم غير متاح ضمن صلاحيات حسابك.</div>';
  switch(state.tab){
    case 'dashboard': return renderDashboard();
    case 'profileEdits': return renderFanniProfileEdits();
    case 'fannis': case 'pending': case 'disabled': return renderFannis();
    case 'levels': return renderLevels();
    case 'roles': return renderRoles();
    case 'orders': return renderOrders();
    case 'offers': return renderOffers();
    case 'pricing': return renderPricing();
    case 'wallets': return renderWallets();
    case 'topups': return renderTopups();
    case 'complaints': return renderComplaints();
    case 'services': return renderServices();
    case 'regions': return renderRegions();
    case 'notifications': return renderNotifications();
    case 'settings': return renderSettings();
    case 'security': return renderSecurity();
    case 'reports': return renderReports();
    case 'pageVisits': return renderPageVisits();
    case 'support': return renderSupport();
    case 'content': return renderContent();
    case 'clients': return renderClients();
    case 'stats': return renderStats();
    default: return renderFannis();
  }
}

function renderDashboard(){
  return `
  <section class="mt-4 space-y-4">
    <div class="rounded-[20px] bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-900 p-5 text-white shadow-xl">
      <p class="text-[13px] font-black">مركز التحكم الرئيسي</p>
      <p class="text-[11px] text-slate-300 mt-1 font-bold">ملخص الطلبات والفنيين والإيرادات والتنبيهات</p>
      <div class="grid grid-cols-2 gap-3 mt-4">
        <div class="bg-white/10 rounded-[14px] p-3"><p class="text-[22px] font-black">${state.orders.length}</p><p class="text-[10px] font-bold text-slate-300">طلبات اليوم</p></div>
        <div class="bg-white/10 rounded-[14px] p-3"><p class="text-[22px] font-black">${state.accountCounts.technicians}</p><p class="text-[10px] font-bold text-slate-300">إجمالي الفنيين</p></div>
        <div class="bg-white/10 rounded-[14px] p-3"><p class="text-[22px] font-black">${state.accountCounts.clients}</p><p class="text-[10px] font-bold text-slate-300">إجمالي العملاء المسجلين</p></div>
        <div class="bg-white/10 rounded-[14px] p-3"><p class="text-[18px] font-black">${state.topups.filter(t=>t.status==='approved').reduce((s,t)=>s+Number(t.amount||0),0)} ج</p><p class="text-[10px] font-bold text-slate-300">إيرادات الشحن</p></div>
        <div class="bg-white/10 rounded-[14px] p-3"><p class="text-[22px] font-black">${state.complaints.filter(c=>c.status==='جديدة').length}</p><p class="text-[10px] font-bold text-slate-300">شكاوى جديدة</p></div>
      </div>
    </div>
    <div class="grid grid-cols-2 gap-3">
      <div class="premium-panel p-4"><p class="text-[11px] font-black">الطلبات المتأخرة</p><p class="text-[20px] font-black text-amber-600 mt-2">${state.orders.filter(o=>o.status==='قيد المراجعة').length}</p><p class="text-[10px] text-slate-400 font-bold mt-1">تحتاج نشر</p></div>
      <div class="premium-panel p-4"><p class="text-[11px] font-black">المعاملات المعلقة</p><p class="text-[20px] font-black text-blue-600 mt-2">${state.topups.filter(t=>t.status==='pending').length}</p><p class="text-[10px] text-slate-400 font-bold mt-1">شحن بانتظار</p></div>
    </div>
    <div class="premium-panel p-4">
      <h3 class="text-[12px] font-black">آخر العمليات</h3>
      <div class="mt-3 space-y-2">
        ${[...state.orders].slice(0,3).map(o=>`<div class="flex justify-between items-center text-[11px] font-bold border-b border-slate-50 pb-2"><span>${escHtml(o.sn||'SN')} - ${escHtml(o.clientName||'عميل')}</span><span class="text-[10px] text-slate-400">${escHtml(statusLabel(o.status))}</span></div>`).join('')||'<p class="text-[11px] text-slate-400">لا توجد عمليات حديثة</p>'}
      </div>
    </div>
    <div class="premium-panel p-4">
      <h3 class="text-[12px] font-black mb-3">رسوم بيانية (أسبوعي)</h3>
      <div class="h-[90px] flex items-end gap-1.5">
        ${[40,65,35,80,55,70,45].map(h=>`<div style="height:${h}%" class="flex-1 bg-gradient-to-t from-blue-600 to-blue-300 rounded-t-[6px]"></div>`).join('')}
      </div>
      <div class="flex justify-between text-[9px] font-bold text-slate-400 mt-2"><span>السبت</span><span>الجمعة</span></div>
    </div>
  </section>`;
}
