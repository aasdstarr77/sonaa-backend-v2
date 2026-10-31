'use strict';

function renderLogin(){
  const app=document.getElementById('app');
  app.innerHTML=`<div class="min-h-screen flex items-center justify-center p-4" style="background:#f1f5fb"><div class="premium-card p-7 w-full max-w-[360px]"><h2 class="font-black text-[16px] text-center mb-4">🔐 دخول الإدارة</h2><input id="login-phone" placeholder="الإيميل أو الهاتف" class="field mb-3" dir="ltr"><input id="login-pass" type="password" placeholder="كلمة المرور" class="field mb-2" dir="ltr"><p class="mb-4 text-left"><a class="text-xs font-bold text-blue-700" href="password.html?role=admin&mode=recovery">نسيت كلمة المرور؟</a></p><button onclick="doLogin()" id="login-btn" class="w-full h-12 rounded-full bg-slate-900 text-white font-black">دخول</button><p id="login-error" class="text-[11px] font-bold text-red-600 mt-3 text-center hidden"></p>${window.IS_EDITOR_PREVIEW?'<p class="mt-3 text-center text-[10px] text-slate-500">معاينة مستقلة — لن يتم تغيير جلسة الإدارة</p>':'<button onclick="localStorage.clear(); location.reload()" class="w-full mt-3 h-10 rounded-full bg-slate-100 text-[11px] font-black">مسح الجلسة</button>'}</div></div>`;
}
async function doLogin(){
  if(window.IS_EDITOR_PREVIEW){const err=document.getElementById('login-error');if(err){err.textContent='تسجيل الدخول غير متاح داخل معاينة المحرر.';err.classList.remove('hidden');}return;}
  const p=(document.getElementById('login-phone')?.value||'').trim();
  const pw=(document.getElementById('login-pass')?.value||'').trim();
  const err=document.getElementById('login-error');
  if(err) err.classList.add('hidden');
  if(!p||!pw){ if(err){err.textContent='اكتب البيانات'; err.classList.remove('hidden');} return; }
  const btn=document.getElementById('login-btn'); if(btn){btn.textContent='جاري...'; btn.disabled=true;}
  try{
    const payload={password:pw}; if(p.includes('@')) payload.email=p; else payload.phone=p;
    const res=await api('/api/admin/login',{method:'POST',body:JSON.stringify(payload)});
    if(res.ok && (res.data.token||res.data.data?.token)){ const adminToken=res.data.token||res.data.data.token; setToken(adminToken); localStorage.setItem('admin_token',adminToken); localStorage.setItem('token',adminToken); localStorage.setItem('auth_token',adminToken); console.log('Admin token saved'); render(); loadAll(); }
    else { if(err){err.textContent=res.data.message||'فشل الدخول'; err.classList.remove('hidden');} if(btn){btn.textContent='دخول'; btn.disabled=false;} }
  }catch(e){ if(err){err.textContent=e.message; err.classList.remove('hidden');} if(btn){btn.textContent='دخول'; btn.disabled=false;} }
}
if(getToken()){ loadAll(); } else { renderLogin(); }

