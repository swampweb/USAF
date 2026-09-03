// Mobile split loader v130
// Keeps mobile page logic split across dedicated files.
// IMPORTANT: do not merge feature logic into this loader.
(() => {
  const rootPrefix = location.pathname.includes('/USAF/') ? '/USAF/' : '/';
  const scripts = [
    rootPrefix + 'assets/js/effective-user.js?v=134',
    'mobile-shell.js?v=134',
    'mobile-dashboard.js?v=134',
    'mobile-cycles.js?v=134',
    'mobile-tours.js?v=134',
    'mobile-receipts.js?v=134',
    'mobile-vouchers.js?v=134',
    'mobile-profile.js?v=134',
    'mobile-helpdesk.js?v=134'
  ];
  const current = document.currentScript;
  const baseUrl = current && current.src ? current.src.substring(0, current.src.lastIndexOf('/') + 1) : './';
  function resolveScript(file) {
    return file.startsWith('/') || file.startsWith('http') ? file : baseUrl + file;
  }
  function loadScript(file) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = resolveScript(file);
      script.defer = true;
      script.onload = resolve;
      script.onerror = () => reject(new Error('Failed to load ' + file));
      document.head.appendChild(script);
    });
  }
  async function boot() {
    try {
      for (const file of scripts) await loadScript(file);
      if (!window.MobileShell || !window.MobileShell.init) throw new Error('Mobile shell did not initialize.');
      await window.MobileShell.init();
      if (window.USAFEffectiveUser) window.USAFEffectiveUser.initViewAsUi();
      if (window.USAFMobileHelpDesk && window.USAFMobileHelpDesk.init) await window.USAFMobileHelpDesk.init();
    } catch (err) {
      console.error(err);
      const content = document.getElementById('mobileContent');
      if (content) content.innerHTML = `<div class="notice"><strong>Mobile page failed to load.</strong><br>${String(err.message || err)}</div>`;
    }
  }
  boot();
})();
