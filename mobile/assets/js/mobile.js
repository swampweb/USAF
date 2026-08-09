// Mobile split loader v70
(() => {
  const scripts = [
    'mobile-shell.js',
    'mobile-dashboard.js',
    'mobile-cycles.js',
    'mobile-tours.js',
    'mobile-receipts.js',
    'mobile-vouchers.js',
    'mobile-profile.js'
  ];

  const current = document.currentScript;
  const baseUrl = current && current.src ? current.src.substring(0, current.src.lastIndexOf('/') + 1) : './';

  function loadScript(file){
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = baseUrl + file;
      script.defer = true;
      script.onload = resolve;
      script.onerror = () => reject(new Error('Failed to load ' + file));
      document.head.appendChild(script);
    });
  }

  async function boot(){
    try {
      for (const file of scripts) await loadScript(file);
      if (!window.MobileShell || !window.MobileShell.init) throw new Error('Mobile shell did not initialize.');
      await window.MobileShell.init();
    } catch (err) {
      console.error(err);
      const content = document.getElementById('mobileContent');
      if (content) content.innerHTML = `<div class="notice"><strong>Mobile page failed to load.</strong><br>${String(err.message || err)}</div>`;
    }
  }

  boot();
})();
