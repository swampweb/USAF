// Mobile split loader v84
// Keeps mobile page logic split across dedicated files.
// IMPORTANT: Do not merge feature logic into this loader.
// New mobile features should be added as separate mobile-*.js files and linked below.
(() => {
  const rootPrefix = location.pathname.includes('/USAF/') ? '/USAF/' : '/';
  const scripts = [
    rootPrefix + 'assets/js/effective-user.js?v=79',
    'mobile-shell.js',
    'mobile-dashboard.js',
    'mobile-cycles.js',
    'mobile-tours.js',
    'mobile-receipts.js',
    'mobile-vouchers.js',
    'mobile-profile.js',
    'mobile-helpdesk.js'
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
      if (content) content.innerHTML = `Mobile page failed to load.\n${String(err.message || err)}`;
    }
  }
  boot();
})();
