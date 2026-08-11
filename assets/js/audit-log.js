// Orders & Travel Tracker - Audit Log Dashboard v103
(function () {
  const TABLE = 'USAF_audit_log';
  let rawEvents = [];
  let filteredEvents = [];
  let selectedEventId = null;

  function $(id) { return document.getElementById(id); }
  function esc(value) {
    return String(value ?? '').replace(/[&<>'"]/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[ch]));
  }
  function safeJson(value) {
    if (!value) return {};
    if (typeof value === 'object') return value;
    try { return JSON.parse(value); } catch (_) { return { value }; }
  }
  function eventId(row, index) { return row.id || row.created_at || `row-${index}`; }
  function asDate(row) { return row.created_at || row.date || row.timestamp || row.createdAt || null; }
  function displayDate(row) {
    const date = asDate(row);
    if (!date) return '';
    const parsed = new Date(date);
    if (Number.isNaN(parsed.getTime())) return esc(date);
    return parsed.toLocaleString();
  }
  function normalizeSeverity(row) {
    const value = String(row.severity || row.level || '').toLowerCase();
    if (['critical', 'high', 'danger'].includes(value)) return 'critical';
    if (['warning', 'warn', 'medium'].includes(value)) return 'warning';
    if (value) return value;
    const action = String(row.action || '').toLowerCase();
    if (action.includes('delete') || action.includes('deactivate') || action.includes('role changed') || action.includes('view as user')) return 'critical';
    if (action.includes('update') || action.includes('edit') || action.includes('download')) return 'warning';
    return 'info';
  }
  function displayUser(row) {
    return row.actor_display_name || row.display_name || row.actor_email || row.email || row.user_email || row.user_id || row.actor_user_id || 'System';
  }
  function displayRole(row) { return row.actor_role || row.role || row.user_role || 'user'; }
  function displayAction(row) { return row.action || row.event_type || 'Activity'; }
  function displayModule(row) { return row.module || row.entity_type || row.area || 'System'; }
  function displayEntity(row) { return row.entity_name || row.entity_id || row.record_id || row.entity || 'N/A'; }
  function detailText(row) {
    const details = safeJson(row.details || row.metadata || row.detail);
    if (typeof details.value === 'string') return details.value;
    return Object.keys(details).length ? JSON.stringify(details) : '';
  }
  function isToday(row) {
    const date = asDate(row);
    if (!date) return false;
    const d = new Date(date);
    if (Number.isNaN(d.getTime())) return false;
    const now = new Date();
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  }
  function fillSelect(id, values, defaultLabel) {
    const select = $(id);
    if (!select) return;
    const current = select.value;
    select.innerHTML = `<option value="">${defaultLabel}</option>` + values.map(v => `<option value="${esc(v)}">${esc(v)}</option>`).join('');
    if ([...select.options].some(o => o.value === current)) select.value = current;
  }
  function applyFilters() {
    const from = $('auditDateFrom')?.value || '';
    const to = $('auditDateTo')?.value || '';
    const user = $('auditUserFilter')?.value || '';
    const module = $('auditModuleFilter')?.value || '';
    const severity = $('auditSeverityFilter')?.value || '';
    const search = ($('auditSearch')?.value || '').toLowerCase().trim();

    filteredEvents = rawEvents.filter(row => {
      const date = asDate(row);
      const day = date ? new Date(date) : null;
      if (from && day && day < new Date(from + 'T00:00:00')) return false;
      if (to && day && day > new Date(to + 'T23:59:59')) return false;
      if (user && displayUser(row) !== user) return false;
      if (module && displayModule(row) !== module) return false;
      if (severity && normalizeSeverity(row) !== severity) return false;
      if (search) {
        const haystack = [displayUser(row), displayRole(row), displayAction(row), displayModule(row), displayEntity(row), normalizeSeverity(row), detailText(row)].join(' ').toLowerCase();
        if (!haystack.includes(search)) return false;
      }
      return true;
    });
    renderTable();
    updateSummary();
  }
  function updateSummary() {
    $('auditTotalCount').textContent = String(rawEvents.length);
    $('auditTodayCount').textContent = String(rawEvents.filter(isToday).length);
    $('auditCriticalCount').textContent = String(rawEvents.filter(r => normalizeSeverity(r) === 'critical').length);
    $('auditAdminCount').textContent = String(rawEvents.filter(r => String(displayRole(r)).toLowerCase() === 'admin').length);
    const summary = $('auditResultSummary');
    if (summary) summary.textContent = `${filteredEvents.length} of ${rawEvents.length} records shown`;
  }
  function renderTable() {
    const tbody = $('auditRows');
    if (!tbody) return;
    if (!filteredEvents.length) {
      tbody.innerHTML = '<tr><td colspan="7">No audit records found for the selected filters.</td></tr>';
      renderDetail(null);
      return;
    }
    tbody.innerHTML = filteredEvents.map((row, index) => {
      const id = eventId(row, index);
      const sev = normalizeSeverity(row);
      return `<tr class="audit-row ${selectedEventId === id ? 'active' : ''}" data-audit-index="${index}">
        <td><strong>${esc(displayDate(row))}</strong></td>
        <td>${esc(displayUser(row))}</td>
        <td><span class="audit-role-pill">${esc(displayRole(row))}</span></td>
        <td>${esc(displayAction(row))}</td>
        <td>${esc(displayModule(row))}</td>
        <td>${esc(displayEntity(row))}</td>
        <td><span class="audit-severity ${sev}">${esc(sev)}</span></td>
      </tr>`;
    }).join('');
    tbody.querySelectorAll('[data-audit-index]').forEach(rowEl => {
      rowEl.addEventListener('click', () => {
        const row = filteredEvents[Number(rowEl.dataset.auditIndex)];
        selectedEventId = eventId(row, Number(rowEl.dataset.auditIndex));
        renderTable();
        renderDetail(row);
      });
    });
    if (!selectedEventId) renderDetail(filteredEvents[0]);
  }
  function renderJsonBlock(title, data) {
    const obj = safeJson(data);
    if (!obj || !Object.keys(obj).length) return '';
    return `<div class="audit-json-block"><span>${esc(title)}</span><pre>${esc(JSON.stringify(obj, null, 2))}</pre></div>`;
  }
  function renderDetail(row) {
    const panel = $('auditDetailPanel');
    if (!panel) return;
    if (!row) {
      panel.innerHTML = `<div class="audit-detail-empty"><div class="audit-detail-icon">🛡️</div><h3>Event Details</h3><p>Select an audit record to review before/after values, related record information, and technical metadata.</p></div>`;
      return;
    }
    selectedEventId = selectedEventId || eventId(row, 0);
    const sev = normalizeSeverity(row);
    panel.innerHTML = `<div class="audit-detail-head">
        <div><span class="audit-eyebrow">Selected Event</span><h3>${esc(displayAction(row))}</h3></div>
        <span class="audit-severity ${sev}">${esc(sev)}</span>
      </div>
      <div class="audit-detail-list">
        <div><span>Date / Time</span><strong>${esc(displayDate(row))}</strong></div>
        <div><span>Actor</span><strong>${esc(displayUser(row))}</strong></div>
        <div><span>Role</span><strong>${esc(displayRole(row))}</strong></div>
        <div><span>Module</span><strong>${esc(displayModule(row))}</strong></div>
        <div><span>Entity</span><strong>${esc(displayEntity(row))}</strong></div>
        <div><span>Record ID</span><strong>${esc(row.entity_id || row.record_id || row.id || 'N/A')}</strong></div>
      </div>
      ${renderJsonBlock('Details', row.details || row.metadata || row.detail)}
      ${renderJsonBlock('Before', row.old_values || row.before_values || row.before)}
      ${renderJsonBlock('After', row.new_values || row.after_values || row.after)}
      <div class="audit-tech-meta">
        <span>IP / Device</span>
        <p>${esc(row.ip_address || 'Not captured')} ${row.user_agent ? ' · ' + esc(row.user_agent) : ''}</p>
      </div>`;
  }
  async function loadAuditLog() {
    const tbody = $('auditRows');
    if (tbody) tbody.innerHTML = '<tr><td colspan="7">Loading audit records...</td></tr>';
    const { data, error } = await window.usafSupabase.from(TABLE).select('*').order('created_at', { ascending: false }).limit(500);
    if (error) {
      console.error('Audit log load failed', error);
      if (tbody) tbody.innerHTML = `<tr><td colspan="7">Audit log failed to load: ${esc(error.message)}</td></tr>`;
      return;
    }
    rawEvents = data || [];
    fillSelect('auditUserFilter', [...new Set(rawEvents.map(displayUser).filter(Boolean))].sort(), 'All users');
    fillSelect('auditModuleFilter', [...new Set(rawEvents.map(displayModule).filter(Boolean))].sort(), 'All modules');
    applyFilters();
  }
  function exportCsv() {
    const rows = filteredEvents.map(row => [displayDate(row), displayUser(row), displayRole(row), displayAction(row), displayModule(row), displayEntity(row), normalizeSeverity(row), detailText(row)]);
    const csvRows = [['Date / Time', 'Actor', 'Role', 'Action', 'Module', 'Entity', 'Severity', 'Details'], ...rows];
    const csv = csvRows.map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-log-${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }
  async function init() {
    await requireAdmin();
    await renderLayout('Admin - Audit Log');
    ['auditDateFrom','auditDateTo','auditUserFilter','auditModuleFilter','auditSeverityFilter','auditSearch'].forEach(id => $(id)?.addEventListener('input', applyFilters));
    $('refreshAuditBtn')?.addEventListener('click', loadAuditLog);
    $('exportAuditBtn')?.addEventListener('click', exportCsv);
    await loadAuditLog();
  }
  init().catch(err => {
    console.error('Audit log init failed', err);
    const tbody = $('auditRows');
    if (tbody) tbody.innerHTML = `<tr><td colspan="7">Audit log failed to initialize: ${esc(err.message || err)}</td></tr>`;
  });
})();
