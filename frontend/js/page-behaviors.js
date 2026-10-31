'use strict';

/*
 * Page behaviors extracted from inline HTML scripts.
 * Each feature is loaded at its original position in the document so execution
 * order and the existing classic-script global scope remain unchanged.
 */
(function () {
  const feature = document.currentScript && document.currentScript.dataset.sonaaFeature;

  switch (feature) {
    case 'admin-recovery-count': {
      let busy = false;
      let lastToken = '';

      function token() {
        if (window.IS_EDITOR_PREVIEW) return '';
        try {
          return localStorage.getItem('admin_token_v3') || '';
        } catch (_) {
          return '';
        }
      }

      async function refreshCount() {
        const currentToken = token();
        if (!currentToken || busy) return;
        busy = true;
        try {
          const path = '/api/password-recovery/admin/requests';
          const url = location.hostname.includes('sonaa-backend-v2') && location.hostname.endsWith('vercel.app')
            ? path
            : 'https://sonaa-backend-v2.vercel.app' + path;
          const response = await fetch(url, {
            method: 'GET',
            headers: { Authorization: 'Bearer ' + currentToken, Accept: 'application/json' },
            cache: 'no-store',
            credentials: 'omit'
          });
          if (!response.ok) return;
          const data = await response.json();
          if (!Array.isArray(data.recoveries)) return;
          const badge = document.getElementById('sonaa-recovery-count');
          if (!badge) return;
          const count = data.recoveries.filter(item =>
            ['بانتظار الدعم', 'قيد التحقق', 'جديدة', 'pending'].includes(String(item.status || ''))
          ).length;
          badge.textContent = String(count);
          badge.setAttribute('aria-label', 'عدد طلبات استعادة كلمة المرور: ' + count);
        } catch (_) {
        } finally {
          busy = false;
        }
      }

      function sync() {
        const currentToken = token();
        if (currentToken !== lastToken) {
          lastToken = currentToken;
          if (currentToken) refreshCount();
        }
      }

      sync();
      refreshCount();
      window.addEventListener('storage', sync);
      setInterval(function () {
        sync();
        refreshCount();
      }, 5000);
      break;
    }

    case 'client-global-refresh': {
      window.handleGlobalRefresh = async function handleGlobalRefresh() {
        let button = document.getElementById('global-refresh');
        if (globalRefreshInProgress || (button && button.disabled)) return;
        globalRefreshInProgress = true;
        if (button) {
          button.disabled = true;
          button.classList.add('is-refreshing');
        }
        try {
          if (!state.account) {
            await Promise.allSettled([loadServices(), loadPublicContent()]);
            showToast('تم تحديث البيانات', 'success');
          } else {
            await refreshClientPage();
          }
        } finally {
          globalRefreshInProgress = false;
          button = document.getElementById('global-refresh');
          if (button) {
            button.disabled = false;
            button.classList.remove('is-refreshing');
          }
        }
      };
      break;
    }

    case 'fanni-global-refresh': {
      window.handleGlobalRefresh = async function handleGlobalRefresh() {
        const button = document.getElementById('global-refresh');
        if (globalRefreshInProgress || (button && button.disabled)) return;
        globalRefreshInProgress = true;
        if (button) {
          button.disabled = true;
          button.classList.add('is-refreshing');
        }
        try {
          await refreshTechnicianPage();
        } catch (error) {
          toast('تعذر تحديث البيانات. حاول مرة أخرى.', 'error');
        } finally {
          hideFanniLoading();
          globalRefreshInProgress = false;
          const currentButton = document.getElementById('global-refresh');
          if (currentButton) {
            currentButton.disabled = false;
            currentButton.classList.remove('is-refreshing');
          }
        }
      };
      break;
    }

    case 'sticky-tabs': {
      let observedHeader = null;
      let headerResizeObserver = null;

      function syncStickyTabs() {
        const header = document.querySelector('#app .app-header');
        if (!header) return;
        if (header !== observedHeader) {
          observedHeader = header;
          if (headerResizeObserver) headerResizeObserver.disconnect();
          if ('ResizeObserver' in window) {
            headerResizeObserver = new ResizeObserver(syncStickyTabs);
            headerResizeObserver.observe(header);
          }
        }
        const height = Math.ceil(header.getBoundingClientRect().height);
        if (!height) return;
        document.documentElement.style.setProperty('--sonaa-sticky-header-height', height + 'px');
        document.querySelectorAll('.client-section-tabs,.fanni-dashboard-tabs').forEach(function (tabs) {
          tabs.style.top = height + 'px';
          tabs.style.zIndex = '30';
        });
      }

      const app = document.getElementById('app');
      if (app) new MutationObserver(syncStickyTabs).observe(app, { childList: true, subtree: true });
      window.addEventListener('resize', syncStickyTabs, { passive: true });
      syncStickyTabs();
      break;
    }

    case 'fanni-enter-support': {
      if (window.__sonaaFanniEnterSupport) break;
      window.__sonaaFanniEnterSupport = true;
      document.addEventListener('keydown', function (event) {
        if (event.key !== 'Enter' || event.shiftKey || event.defaultPrevented) return;
        const target = event.target;
        if (!target || target.isContentEditable) return;
        const loginPanel = target.closest('.fanni-login-panel');
        if (loginPanel && target.matches('input:not([type="checkbox"]):not([type="radio"]):not([type="hidden"])')) {
          event.preventDefault();
          const fields = Array.from(loginPanel.querySelectorAll('input:not([type="checkbox"]):not([type="radio"]):not([type="hidden"]):not(:disabled)'))
            .filter(function (element) { return element.getClientRects().length > 0; });
          const index = fields.indexOf(target);
          if (index >= 0 && index < fields.length - 1) {
            fields[index + 1].focus();
            return;
          }
          if (state.tab === 'register') doRegister();
          else doLogin();
          return;
        }
        if (target.id === 'fanniEditPhone') {
          event.preventDefault();
          document.getElementById('fanniEditAreas')?.focus();
          return;
        }
        if (target.id === 'fanniEditAreas') {
          event.preventDefault();
          saveProfileChanges();
          return;
        }
        if (target.id === 'fanniOfferPrice') {
          event.preventDefault();
          document.getElementById('fanniOfferMessage')?.focus();
          return;
        }
        if (target.id === 'fanniOfferMessage') {
          event.preventDefault();
          submitOffer();
        }
      });
      break;
    }

    case 'password-enter-support': {
      document.addEventListener('keydown', function (event) {
        if (event.key !== 'Enter' || event.shiftKey || event.defaultPrevented) return;
        const element = event.target;
        if (!element || element.isContentEditable) return;
        if (element.id === 'messageText') {
          event.preventDefault();
          document.getElementById('sendMessage')?.click();
          return;
        }
        if (element.id === 'adminReply') {
          event.preventDefault();
          document.getElementById('sendAdminReply')?.click();
          return;
        }
        if (element.id === 'recoveryCode') {
          event.preventDefault();
          document.getElementById('verifyCode')?.click();
          return;
        }
        if (element.id === 'newPassword') {
          event.preventDefault();
          document.getElementById('confirmPassword')?.focus();
          return;
        }
        if (element.id === 'confirmPassword') {
          event.preventDefault();
          document.getElementById('resetPassword')?.click();
        }
      });
      break;
    }

    default:
      console.warn('Unknown Sonaa page behavior:', feature);
  }
})();
