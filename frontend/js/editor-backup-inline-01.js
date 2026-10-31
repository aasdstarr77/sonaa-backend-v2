(async function checkAdmin() {
  const possibleKeys = [
    'admin_token_v3', 'adminToken', 'sonaa_admin_token', 'token',
    'admin_token', 'sonaaAdminToken', 'authToken', 'accessToken', 'sonaa_token'
  ];
  let token = null;
  for (const key of possibleKeys) {
    try {
      const value = localStorage.getItem(key) || sessionStorage.getItem(key);
      if (value) {
        token = value;
        console.info('Admin editor: found session token key:', key);
        break;
      }
    } catch (_) {}
  }
  // URL tokens are intentionally not accepted: query strings can leak credentials
  // into browser history, logs, and referrer headers.
  console.info('Admin editor token:', token ? 'exists' : 'NOT FOUND');
  if (!token) {
    alert('يجب تسجيل الدخول كأدمن أولاً - لم يتم العثور على التوكن. افتح Console للتحقق من مفتاح الجلسة.');
    window.location.href = '/frontend/admin.html';
    return;
  }
  try {
    const res = await fetch('/api/admin/me', {
      headers: { 'Authorization': 'Bearer ' + token },
      cache: 'no-store'
    });
    if (!res.ok) throw new Error('not admin');
    const data = await res.json();
    if (!data.isAdmin && data.role !== 'admin' && !data.admin) throw new Error('not admin');
  } catch (_) {
    alert('غير مصرح لك - تعذر التحقق من جلسة الأدمن. سجّل الدخول مجددًا إذا استمرت المشكلة.');
    window.location.href = '/frontend/admin.html';
  }
})();