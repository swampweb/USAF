// Orders & Travel Tracker v75
// Admin/Report View as User helper. This does not replace the login session.
(function () {
  const KEY = 'USAF_VIEW_AS_USER_V1';

  function getStored() {
    try { return JSON.parse(sessionStorage.getItem(KEY) || 'null'); }
    catch (_) { return null; }
  }

  function setViewAsUser(user) {
    if (!user || !user.id) return;
    sessionStorage.setItem(KEY, JSON.stringify({
      id: user.id,
      email: user.email || '',
      display_name: user.display_name || user.email || 'Selected user',
      started_at: new Date().toISOString()
    }));
  }

  function clearViewAsUser() {
    sessionStorage.removeItem(KEY);
  }

  function getViewAsUser() {
    return getStored();
  }

  function isViewAsActive() {
    const v = getStored();
    return !!(v && v.id);
  }

  async function isCurrentUserAdminOrReport() {
    try {
      if (typeof getCurrentProfile === 'function') {
        const p = await getCurrentProfile();
        const role = String((p && p.role) || '').toLowerCase();
        return role === 'admin' || role === 'report';
      }
      return false;
    } catch (_) {
      return false;
    }
  }

  async function getEffectiveUser() {
    const current = typeof getCurrentUser === 'function' ? await getCurrentUser() : null;
    const viewAs = getStored();
    if (!viewAs || !viewAs.id) return current;

    const allowed = await isCurrentUserAdminOrReport();
    if (!allowed) {
      clearViewAsUser();
      return current;
    }

    return {
      ...(current || {}),
      id: viewAs.id,
      email: viewAs.email || current?.email || ''
    };
  }

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>'"]/g, c => ({
      '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;'
    }[c]));
  }

  function addBanner() {
    const viewAs = getStored();
    if (!viewAs || !viewAs.id) return;
    if (document.getElementById('viewAsUserBanner')) return;

    const banner = document.createElement('div');
    banner.id = 'viewAsUserBanner';
    banner.style.cssText = 'position:sticky;top:0;z-index:9999;background:#0f1f3d;color:#fff;padding:10px 14px;border-bottom:3px solid #f59e0b;display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap;font-weight:800;';
    banner.innerHTML = '<div>Admin View Mode: Viewing as ' + escapeHtml(viewAs.display_name || viewAs.email || 'Selected user') + ' | Read-only</div><button id="returnAdminViewBtn" type="button" style="background:#f59e0b;color:#111827;border:0;border-radius:8px;padding:8px 12px;font-weight:900;cursor:pointer;">Return to Admin View</button>';
    document.body.prepend(banner);

    const btn = document.getElementById('returnAdminViewBtn');
    if (btn) btn.addEventListener('click', () => {
      clearViewAsUser();
      location.href = location.pathname.includes('/mobile/') ? '../admin/users.html?v=75' : 'admin/users.html?v=75';
    });
  }

  function enforceReadOnly(root=document) {
    if (!isViewAsActive()) return;
    root.querySelectorAll('button, input[type="submit"]').forEach(btn => {
      if (btn.id === 'returnAdminViewBtn') return;
      const label = String(btn.textContent || btn.value || btn.id || '').toLowerCase();
      const id = String(btn.id || '').toLowerCase();
      if (/save|delete|add|new|create|upload|remove|submit/.test(label + ' ' + id)) {
        btn.disabled = true;
        btn.title = 'Read-only while viewing as another user';
        btn.style.opacity = '0.5';
        btn.style.cursor = 'not-allowed';
      }
    });
    root.querySelectorAll('input, select, textarea').forEach(el => {
      if (el.closest('#viewAsUserBanner')) return;
      el.disabled = true;
    });
  }

  function initViewAsUi() {
    addBanner();
    enforceReadOnly();
    if (isViewAsActive() && !window.__USAF_VIEW_AS_OBSERVER__) {
      window.__USAF_VIEW_AS_OBSERVER__ = new MutationObserver(() => enforceReadOnly());
      window.__USAF_VIEW_AS_OBSERVER__.observe(document.documentElement, { childList:true, subtree:true });
    }
  }

  window.USAFEffectiveUser = {
    setViewAsUser,
    clearViewAsUser,
    getViewAsUser,
    isViewAsActive,
    getEffectiveUser,
    initViewAsUi,
    enforceReadOnly
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initViewAsUi);
  else initViewAsUi();
})();
