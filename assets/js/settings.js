// Orders & Travel Tracker - Admin Settings v113
(function () {
  const TABLE = 'USAF_settings';
  const DEFAULTS = {
    id: true,
    organization_name: 'Orders & Travel Tracker',
    system_tagline: 'Track receipts, cycles, vouchers, and reports.',
    maintenance_mode: false,
    show_app_version: true,
    footer_text: '© 2026 CajunVeteran™',
    show_sidebar_footer: true,
    prevent_overlapping_tours: true,
    require_orders_number: false,
    require_location: false,
    default_tour_status: 'active',
    prevent_overlapping_cycles: true,
    allow_cycle_delete: true,
    block_cycle_delete_with_receipts: true,
    require_cycles_inside_tour_dates: true,
    require_receipt_type: true,
    require_receipt_attachment: false,
    allowed_file_types: 'pdf,jpg,jpeg,png',
    max_upload_mb: 10,
    audit_logging_enabled: true,
    audit_retention_days: 365,
    log_admin_actions: true,
    log_user_actions: true
  };

  const fields = {
    organization_name: 'settingSystemName',
    system_tagline: 'settingSystemTagline',
    maintenance_mode: 'settingMaintenanceMode',
    show_app_version: 'settingShowVersion',
    footer_text: 'settingFooterText',
    show_sidebar_footer: 'settingShowFooter',
    prevent_overlapping_tours: 'settingPreventTourOverlap',
    require_orders_number: 'settingRequireOrdersNumber',
    require_location: 'settingRequireLocation',
    default_tour_status: 'settingDefaultTourStatus',
    prevent_overlapping_cycles: 'settingPreventCycleOverlap',
    allow_cycle_delete: 'settingAllowCycleDelete',
    block_cycle_delete_with_receipts: 'settingBlockCycleDeleteReceipts',
    require_cycles_inside_tour_dates: 'settingCycleInsideTour',
    require_receipt_type: 'settingRequireReceiptType',
    require_receipt_attachment: 'settingRequireReceiptAttachment',
    allowed_file_types: 'settingAllowedFileTypes',
    max_upload_mb: 'settingMaxUploadMb',
    audit_logging_enabled: 'settingAuditEnabled',
    audit_retention_days: 'settingAuditRetention',
    log_admin_actions: 'settingLogAdminActions',
    log_user_actions: 'settingLogUserActions'
  };

  function $(id) { return document.getElementById(id); }
  function boolValue(value) { return String(value) === 'true'; }
  function setMessage(text, type = '') {
    const el = $('settingsMessage');
    if (!el) return;
    el.textContent = text || '';
    el.style.color = type === 'success' ? 'var(--success)' : type === 'warning' ? 'var(--warning)' : 'var(--danger)';
  }

  function setField(key, value) {
    const el = $(fields[key]);
    if (!el) return;
    if (typeof DEFAULTS[key] === 'boolean') el.value = String(value ?? DEFAULTS[key]);
    else el.value = value ?? DEFAULTS[key] ?? '';
  }

  function readField(key) {
    const el = $(fields[key]);
    if (!el) return DEFAULTS[key];
    if (typeof DEFAULTS[key] === 'boolean') return boolValue(el.value);
    if (typeof DEFAULTS[key] === 'number') return Number(el.value || DEFAULTS[key]);
    return el.value;
  }


  function showInfoModal(title, text) {
    document.querySelector('.settings-modal-backdrop')?.remove();
    const modal = document.createElement('div');
    modal.className = 'settings-modal-backdrop';
    modal.innerHTML = `<div class="settings-info-modal" role="dialog" aria-modal="true" aria-label="${title}">
      <div class="settings-info-icon">i</div>
      <h3>${title}</h3>
      <p>${text}</p>
      <div class="settings-info-panel">This setting is saved in the system settings table. Some behavior controls are stored now and will be connected to feature workflows in follow-up updates.</div>
      <div class="actions" style="justify-content:flex-end;margin-top:16px">
        <button class="btn" type="button" data-close-settings-info>OK</button>
      </div>
    </div>`;
    document.body.appendChild(modal);
    modal.querySelector('[data-close-settings-info]')?.addEventListener('click', () => modal.remove());
    modal.addEventListener('click', event => { if (event.target === modal) modal.remove(); });
  }

  function bindInfoButtons() {
    document.querySelectorAll('[data-info-title]').forEach(btn => {
      btn.addEventListener('click', event => {
        event.preventDefault();
        showInfoModal(btn.dataset.infoTitle || 'Setting Information', btn.dataset.infoText || 'This setting controls application behavior.');
      });
    });
  }

  function applySettings(row) {
    const settings = { ...DEFAULTS, ...(row || {}) };
    Object.keys(fields).forEach(key => setField(key, settings[key]));
  }

  function collectSettings() {
    const payload = { id: true };
    Object.keys(fields).forEach(key => payload[key] = readField(key));
    return payload;
  }

  async function loadSettings() {
    setMessage('Loading settings...', 'warning');
    const { data, error } = await window.usafSupabase.from(TABLE).select('*').eq('id', true).maybeSingle();
    if (error) {
      setMessage('Settings failed to load: ' + error.message);
      return;
    }
    applySettings(data || DEFAULTS);
    setMessage('Settings loaded.', 'success');
  }

  async function saveSettings() {
    const payload = collectSettings();
    setMessage('Saving settings...', 'warning');
    const { error } = await window.usafSupabase.from(TABLE).upsert(payload, { onConflict: 'id' });
    if (error) {
      setMessage('Settings failed to save: ' + error.message);
      return;
    }
    setMessage('Settings saved. Refresh open pages to see layout/footer changes.', 'success');
  }

  async function init() {
    await requireAdmin();
    await renderLayout('Admin - Settings');
    bindInfoButtons();
    $('reloadSettingsBtn')?.addEventListener('click', loadSettings);
    $('saveSettingsBtn')?.addEventListener('click', saveSettings);
    await loadSettings();
  }

  init().catch(err => {
    console.error('Settings init failed', err);
    document.body.style.visibility = 'visible';
    setMessage(err.message || String(err));
  });
})();
