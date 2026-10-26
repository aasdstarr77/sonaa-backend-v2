(function () {
  if (typeof renderOrders !== 'function' || typeof state !== 'object') return;
  state.voiceAudioUrls = state.voiceAudioUrls || {};
  state.voiceAudioPlayed = state.voiceAudioPlayed || {};
  state.voiceAudioLoading = state.voiceAudioLoading || {};
  state.voiceReviewLoading = state.voiceReviewLoading || {};

  const originalRenderOrders = renderOrders;
  renderOrders = function () {
    let html = originalRenderOrders();
    (state.filteredOrders || []).forEach(function (order) {
      const sn = String(order.sn || '').trim().toUpperCase();
      if (!order.hasVoiceRecording || !/^SN\d{6}$/.test(sn)) return;
      const description = '<div class="mt-3 rounded-[14px] bg-slate-50 border p-3"><p class="text-[10px] font-black text-slate-400">وصف الطلب</p><p class="text-[11px] font-bold mt-2 leading-6 whitespace-pre-wrap">' + escHtml(order.description || 'لا يوجد وصف') + '</p></div>';
      const panel = '<div class="mt-3 rounded-[14px] border ' + (order.voiceReviewedAt ? 'border-emerald-200 bg-emerald-50' : 'border-amber-300 bg-amber-50') + ' p-3 space-y-2">' +
        '<div class="flex items-center justify-between gap-2"><p class="text-[12px] font-black">🎙️ التسجيل الصوتي للطلب</p><span class="text-[10px] font-black ' + (order.voiceReviewedAt ? 'text-emerald-700' : 'text-amber-800') + '">' + (order.voiceReviewedAt ? 'تمت المراجعة' : 'مطلوب الاستماع قبل النشر') + '</span></div>' +
        '<p class="text-[10px] leading-5 text-slate-600">استمع للتسجيل كاملًا للتأكد من عدم ذكر رقم هاتف أو عنوان تفصيلي أو بيانات تواصل قبل نشر الطلب.</p>' +
        (state.voiceAudioUrls[sn]
          ? '<audio controls preload="metadata" playsinline src="' + escHtml(state.voiceAudioUrls[sn]) + '" class="w-full" style="min-height:44px" onended="setVoiceAudioPlayed(\'' + sn + '\',true)" onerror="showToast(\'تعذر تشغيل التسجيل؛ أعد تحميله.\',\'error\')"></audio>' +
            (!order.voiceReviewedAt && state.voiceAudioPlayed[sn] ? '<button onclick="markOrderVoiceReviewed(\'' + sn + '\')" ' + (state.voiceReviewLoading[sn] ? 'disabled' : '') + ' class="pill-btn primary-pill w-full">✓ تأكيد الاستماع ومراجعة التسجيل</button>' : '')
          : '<button onclick="loadOrderVoice(\'' + sn + '\')" ' + (state.voiceAudioLoading[sn] ? 'disabled' : '') + ' class="pill-btn primary-pill w-full">' + (state.voiceAudioLoading[sn] ? 'جارٍ تحميل التسجيل…' : '▶ تحميل التسجيل والاستماع') + '</button>') +
        (order.voiceReviewedAt ? '<p class="text-[10px] text-emerald-800 font-bold">تم تأكيد المراجعة' + (order.voiceReviewedBy ? ' بواسطة ' + escHtml(order.voiceReviewedBy) : '') + ' • ' + escHtml(new Date(order.voiceReviewedAt).toLocaleString('ar-EG-u-ca-gregory', { calendar: 'gregory', timeZone: 'Africa/Cairo' })) + '</p>' : '') +
        '</div>';
      html = html.replace(description, description + panel);
    });
    return html;
  };

  async function loadOrderVoice(sn) {
    sn = String(sn || '').trim().toUpperCase();
    if (!/^SN\d{6}$/.test(sn)) return;
    state.voiceAudioLoading[sn] = true;
    render();
    try {
      const headers = {};
      const token = getToken();
      if (token) headers.Authorization = 'Bearer ' + token;
      const response = await fetch(buildUrl('/api/orders/' + encodeURIComponent(sn) + '/voice'), { headers, mode: 'cors', credentials: 'omit' });
      if (!response.ok) {
        let message = 'تعذر تحميل التسجيل الصوتي';
        try { const data = await response.json(); message = data.message || message; } catch (_) {}
        throw new Error(message);
      }
      const blob = await response.blob();
      if (!blob.type.startsWith('audio/')) throw new Error('استجابة التسجيل ليست ملفًا صوتيًا صالحًا');
      state.voiceAudioUrls[sn] = URL.createObjectURL(blob);
      state.voiceAudioPlayed[sn] = false;
    } catch (error) {
      showToast(error.message || 'تعذر تحميل التسجيل الصوتي', 'error');
    } finally {
      state.voiceAudioLoading[sn] = false;
      render();
    }
  }

  function setVoiceAudioPlayed(sn, played) {
    sn = String(sn || '').trim().toUpperCase();
    if (!/^SN\d{6}$/.test(sn)) return;
    state.voiceAudioPlayed[sn] = Boolean(played);
    render();
  }

  async function markOrderVoiceReviewed(sn) {
    sn = String(sn || '').trim().toUpperCase();
    if (!/^SN\d{6}$/.test(sn)) return;
    if (!state.voiceAudioPlayed[sn]) return showToast('شغّل التسجيل حتى نهايته أولًا.', 'error');
    if (state.voiceReviewLoading[sn]) return;
    state.voiceReviewLoading[sn] = true;
    render();
    try {
      const result = await tryApi(['/api/orders/admin/' + encodeURIComponent(sn) + '/voice-reviewed'], { method: 'POST', body: JSON.stringify({}) });
      showToast(result.message || 'تم تأكيد مراجعة التسجيل');
      await loadOrders();
    } catch (error) {
      showToast(error.message || 'تعذر حفظ مراجعة التسجيل', 'error');
    } finally {
      state.voiceReviewLoading[sn] = false;
      if (state.tab === 'orders') render();
    }
  }

  const originalPublishOrder = publishOrder;
  publishOrder = async function (sn) {
    const order = state.orders.find(item => String(item.sn || '').toUpperCase() === String(sn || '').toUpperCase());
    if (order && order.hasVoiceRecording && !order.voiceReviewedAt) {
      showToast('لازم تسمع التسجيل الصوتي كاملًا وتؤكد مراجعته قبل نشر الطلب.', 'error');
      return;
    }
    return originalPublishOrder(sn);
  };

  window.loadOrderVoice = loadOrderVoice;
  window.setVoiceAudioPlayed = setVoiceAudioPlayed;
  window.markOrderVoiceReviewed = markOrderVoiceReviewed;
})();