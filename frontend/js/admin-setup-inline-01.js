'use strict';

    const form = document.getElementById('setupForm');
    const button = document.getElementById('submitButton');
    const result = document.getElementById('result');

    form.addEventListener('submit', async function (event) {
      event.preventDefault();

      const secret = document.getElementById('secret').value;

      if (secret.length < 32) {
        result.textContent = 'المفتاح يجب أن يكون 32 حرفًا على الأقل.';
        return;
      }

      button.disabled = true;
      result.textContent = 'جارٍ إرسال الطلب...';

      try {
        const response = await fetch('/api/admin/bootstrap', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ secret })
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          result.textContent = data.message || 'تعذر إنشاء الحساب.';
          return;
        }

        result.textContent =
          (data.message || 'تم إنشاء الحساب.') +
          ' رقم الإدارة: ' + (data.user?.phone || '');

        form.reset();
      } catch (error) {
        result.textContent =
          'تعذر الاتصال بالخادم. تأكد من حالة الموقع وحاول مرة أخرى.';
      } finally {
        button.disabled = false;
      }
    });