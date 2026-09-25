// Mobile Receipts - Group Collapse Fix v140
window.MobileReceipts = (() => {
  const M = window.MobileShell;
  let toursCache = [];
  let receiptsCache = [];
  let typesCache = [];
  let cyclesCache = [];
  let selectedTourId = '';
  let currentScope = 'per_diem';

  function selectedTour() { return toursCache.find(t => t.id === selectedTourId); }
  function hasReceiptFile(r) { return Boolean(r.file_path || r.file_url || r.receipt_file_url || r.file_name); }
  function receiptTypeLabel(r) { return r.USAF_receipt_types?.name || r.scope || 'Receipt'; }
  function fileExtension(file) { return String(file?.name || '').split('.').pop().toLowerCase(); }
  function safeHtml(value) { return M.esc(String(value ?? '')); }
  function normalizeUuid(value) {
    const text = String(value ?? '').trim();
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text) ? text : null;
  }
  function receiptTypeUuid(type) {
    return normalizeUuid(type?.id || type?.type_id || type?.receipt_type_id);
  }
  const expandedReceiptIds = new Set();
  const expandedGroups = { per_diem: false, other: false };
  function ensureGroupedReceiptStyles() {
    if (document.getElementById('mobileReceiptGroupedStyles')) return;
    const style = document.createElement('style');
    style.id = 'mobileReceiptGroupedStyles';
    style.textContent = `
      .mobile-receipt-groups{display:grid;gap:12px}.mobile-receipt-group{border:1px solid var(--line);border-radius:20px;background:#fff;overflow:hidden;box-shadow:0 8px 24px rgba(10,35,66,.07)}
      .mobile-receipt-group-toggle{width:100%;border:0;background:linear-gradient(135deg,#f8fbff,#edf4ff);padding:14px;display:grid;grid-template-columns:1fr auto;gap:10px;text-align:left;color:var(--text);cursor:pointer}.mobile-receipt-group-toggle strong{font-size:16px}.mobile-receipt-group-toggle span{display:block;color:var(--muted);font-size:12px;margin-top:3px}.mobile-receipt-group-total{text-align:right}.mobile-receipt-group-total b{display:block;color:var(--primary);font-size:17px}.mobile-receipt-group-total small{color:var(--muted);font-size:11px}
      .mobile-receipt-group-body{display:grid}.mobile-receipt-group-body[hidden]{display:none!important}.mobile-compact-receipt{border-top:1px solid #e8eef6;background:#fff}.mobile-compact-receipt:first-child{border-top:0}.mobile-compact-head{width:100%;border:0;background:#fff;padding:12px 14px;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;text-align:left;color:var(--text);cursor:pointer}.mobile-compact-title{min-width:0;display:grid;gap:3px}.mobile-compact-title strong{font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.mobile-compact-title span{color:var(--muted);font-size:11px}.mobile-compact-amount{text-align:right;display:grid;gap:3px}.mobile-compact-amount b{font-size:15px;color:var(--primary)}.mobile-compact-amount small{color:var(--muted);font-size:11px}
      .mobile-compact-details{padding:0 14px 13px;display:grid;gap:8px}.mobile-compact-details[hidden]{display:none}.mobile-compact-row{display:flex;justify-content:space-between;gap:12px;border-top:1px solid #edf2f7;padding-top:7px;font-size:12px}.mobile-compact-row span{color:var(--muted)}.mobile-compact-row b{text-align:right;max-width:68%;overflow-wrap:anywhere}.mobile-compact-actions{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px;margin-top:2px}.mobile-compact-actions .btn{min-height:38px;padding:8px;border-radius:12px;font-size:12px}.mobile-group-empty{padding:15px;color:var(--muted);text-align:center;font-size:12px}
      @media(max-width:380px){.mobile-compact-actions{grid-template-columns:1fr}.mobile-compact-row{display:grid;gap:3px}.mobile-compact-row b{max-width:100%;text-align:left}}
    `;
    document.head.appendChild(style);
  }

  async function loadTours() {
    const uid = M.getUser().id;
    let result = await M.supa().from('USAF_tour_summary').select('*').eq('user_id', uid).order('orders_start_date', { ascending: false });
    if (result.error) result = await M.supa().from('USAF_tours').select('*').eq('user_id', uid).order('orders_start_date', { ascending: false });
    if (result.error) throw result.error;
    toursCache = (result.data || []).filter(t => t.archived !== true && String(t.archive_status || '').toLowerCase() !== 'archived');
    if (!selectedTourId || !toursCache.some(t => t.id === selectedTourId)) selectedTourId = toursCache[0]?.id || '';
  }

  async function loadTypes() {
    const { data, error } = await M.supa().from('USAF_receipt_types').select('*').order('name');
    if (error) throw error;
    typesCache = data || [];
  }

  async function loadTourData() {
    if (!selectedTourId) { cyclesCache = []; receiptsCache = []; return; }
    const uid = M.getUser().id;
    const [cyclesResult, receiptsResult] = await Promise.all([
      M.supa().from('USAF_cycles').select('*').eq('user_id', uid).eq('tour_id', selectedTourId).order('start_date'),
      M.supa().from('USAF_receipts')
        .select('*,USAF_receipt_types(name),USAF_cycles(id,start_date,end_date),USAF_tours(id,tour_name,location)')
        .eq('user_id', uid).eq('tour_id', selectedTourId).order('receipt_date', { ascending: false })
    ]);
    if (cyclesResult.error) throw cyclesResult.error;
    if (receiptsResult.error) throw receiptsResult.error;
    cyclesCache = cyclesResult.data || [];
    receiptsCache = receiptsResult.data || [];
  }

  function flagValue(type, names) {
    for (const name of names) if (Object.prototype.hasOwnProperty.call(type, name)) return type[name];
    return undefined;
  }
  function trueFlag(value) { return value === true || ['true', 'yes', '1', 'on'].includes(String(value ?? '').toLowerCase()); }
  function typeAvailable(type, scope) {
    const explicit = String(type.scope || type.used_for || type.applies_to || '').toLowerCase().replace(/[_-]+/g, ' ');
    if (explicit) {
      if (['both', 'all', 'per diem + other', 'per diem and other'].includes(explicit)) return true;
      return scope === 'per_diem' ? explicit.includes('per diem') : explicit.includes('other');
    }
    const perNames = ['show_per_diem', 'show_for_per_diem', 'show_for_per_diem_receipts', 'per_diem', 'for_per_diem'];
    const otherNames = ['show_other', 'show_for_other', 'show_for_other_receipts', 'other', 'for_other'];
    const hasFlags = [...perNames, ...otherNames].some(name => Object.prototype.hasOwnProperty.call(type, name));
    if (hasFlags) return scope === 'per_diem' ? trueFlag(flagValue(type, perNames)) : trueFlag(flagValue(type, otherNames));
    const name = String(type.name || '').toLowerCase();
    if (scope === 'per_diem') return ['meal', 'meals', 'grocery', 'groceries'].includes(name);
    return true;
  }

  function typeOptions(selected = '') {
    const selectedUuid = normalizeUuid(selected);
    return '<option value="">Select Type</option>' + typesCache
      .filter(t => String(t.active ?? true) !== 'false' && typeAvailable(t, currentScope) && receiptTypeUuid(t))
      .map(t => {
        const uuid = receiptTypeUuid(t);
        return `<option value="${safeHtml(uuid)}" ${uuid === selectedUuid ? 'selected' : ''}>${safeHtml(t.name)}</option>`;
      }).join('');
  }
  function cycleOptions(selected = '') {
    const selectedUuid = normalizeUuid(selected);
    return '<option value="">Select Cycle</option>' + cyclesCache
      .filter(c => normalizeUuid(c.id))
      .map(c => {
        const uuid = normalizeUuid(c.id);
        return `<option value="${safeHtml(uuid)}" ${uuid === selectedUuid ? 'selected' : ''}>${M.dt(c.start_date)} - ${M.dt(c.end_date)} (${M.money(c.per_diem_per_day)}/day)</option>`;
      }).join('');
  }

  function showThemeMessage(title, message, onClose) {
    document.querySelector('.mobile-receipt-message-backdrop')?.remove();
    const modal = document.createElement('div');
    modal.className = 'mobile-receipt-message-backdrop';
    modal.innerHTML = `<section class="mobile-receipt-message" role="dialog" aria-modal="true"><div class="mobile-receipt-message-icon">!</div><h2>${safeHtml(title)}</h2><p>${safeHtml(message)}</p><button class="btn full" type="button" data-close-message>Return to Receipt</button></section>`;
    document.body.appendChild(modal);
    modal.querySelector('[data-close-message]').addEventListener('click', () => { modal.remove(); if (onClose) onClose(); });
  }

  async function receiptFileUrl(receipt) {
    if (receipt.receipt_file_url || receipt.file_url) return receipt.receipt_file_url || receipt.file_url;
    if (!receipt.file_path) return '';
    const bucket = receipt.file_bucket || window.USAF_CONFIG?.STORAGE_BUCKET || 'usaf-receipts';
    const signed = await M.supa().storage.from(bucket).createSignedUrl(receipt.file_path, 600);
    if (signed.error) throw signed.error;
    return signed.data?.signedUrl || '';
  }

  async function previewReceipt(receiptId) {
    const receipt = receiptsCache.find(r => r.id === receiptId);
    if (!receipt) return;
    try {
      const url = await receiptFileUrl(receipt);
      if (!url) return showThemeMessage('No Receipt File', 'No attachment is available for this receipt.');
      const isImage = String(receipt.file_mime_type || '').startsWith('image/') || /\.(png|jpe?g|webp|gif)(\?|$)/i.test(url);
      document.querySelector('.mobile-receipt-preview-backdrop')?.remove();
      const modal = document.createElement('div');
      modal.className = 'mobile-receipt-preview-backdrop';
      modal.innerHTML = `<section class="mobile-receipt-preview-modal" role="dialog" aria-modal="true">
        <div class="mobile-receipt-preview-head"><div><span>Receipt Preview</span><strong>${safeHtml(receipt.file_name || receipt.customer || 'Receipt')}</strong></div><button type="button" data-close-preview>×</button></div>
        <div class="mobile-receipt-preview-body">${isImage ? `<img src="${safeHtml(url)}" alt="Receipt preview">` : `<iframe src="${safeHtml(url)}" title="Receipt preview"></iframe>`}</div>
        <div class="mobile-receipt-preview-actions"><a class="btn secondary" href="${safeHtml(url)}" target="_blank" rel="noopener">Open Full Size</a><button class="btn" type="button" data-close-preview>Close</button></div>
      </section>`;
      document.body.appendChild(modal);
      modal.querySelectorAll('[data-close-preview]').forEach(button => button.addEventListener('click', () => modal.remove()));
      modal.addEventListener('click', event => { if (event.target === modal) modal.remove(); });
    } catch (error) { showThemeMessage('Preview Failed', error.message || String(error)); }
  }

  function compactReceiptCard(r) {
    const isExpanded = expandedReceiptIds.has(r.id);
    const cycle = r.USAF_cycles ? `${M.dt(r.USAF_cycles.start_date)} - ${M.dt(r.USAF_cycles.end_date)}` : 'No cycle linked';
    const tourName = r.USAF_tours?.tour_name || selectedTour()?.tour_name || 'Tour';
    const fileButton = hasReceiptFile(r) ? `<button class="btn secondary" type="button" data-preview-receipt="${safeHtml(r.id)}">View</button>` : '';
    return `<article class="mobile-compact-receipt">
      <button class="mobile-compact-head" type="button" data-toggle-receipt="${safeHtml(r.id)}" aria-expanded="${isExpanded}">
        <div class="mobile-compact-title"><strong>${safeHtml(r.customer || receiptTypeLabel(r))}</strong><span>${safeHtml(receiptTypeLabel(r))} • ${M.dt(r.receipt_date)}</span></div>
        <div class="mobile-compact-amount"><b>${M.money(r.amount)}</b><small>${isExpanded ? '▲ Hide' : '▼ Details'}</small></div>
      </button>
      <div class="mobile-compact-details" ${isExpanded ? '' : 'hidden'}>
        ${r.scope === 'per_diem' ? `<div class="mobile-compact-row"><span>Cycle</span><b>${cycle}</b></div>` : ''}
        <div class="mobile-compact-row"><span>Tour</span><b title="${safeHtml(tourName)}">${safeHtml(tourName)}</b></div>
        <div class="mobile-compact-row"><span>File</span><b>${r.file_name ? `📎 ${safeHtml(r.file_name)}` : 'No file attached'}</b></div>
        ${r.notes ? `<div class="mobile-compact-row"><span>Notes</span><b>${safeHtml(r.notes)}</b></div>` : ''}
        <div class="mobile-compact-actions">${fileButton}<button class="btn secondary" type="button" data-edit-receipt="${safeHtml(r.id)}">Edit</button><button class="btn danger" type="button" data-delete-receipt="${safeHtml(r.id)}">Delete</button></div>
      </div>
    </article>`;
  }
  function receiptGroupHtml(scope, title, rows) {
    const total = rows.reduce((sum, receipt) => sum + Number(receipt.amount || 0), 0);
    const expanded = expandedGroups[scope];
    return `<section class="mobile-receipt-group">
      <button class="mobile-receipt-group-toggle" type="button" data-toggle-group="${scope}" aria-expanded="${expanded}">
        <div><strong>${title}</strong><span>${rows.length} receipt${rows.length === 1 ? '' : 's'}</span></div>
        <div class="mobile-receipt-group-total"><b>${M.money(total)}</b><small>${expanded ? '▲ Collapse' : '▼ Expand'}</small></div>
      </button>
      <div class="mobile-receipt-group-body" ${expanded ? '' : 'hidden'}>${rows.length ? rows.map(compactReceiptCard).join('') : `<div class="mobile-group-empty">No ${title} receipts for this Tour.</div>`}</div>
    </section>`;
  }
  function groupedReceiptsHtml() {
    const perDiem = receiptsCache.filter(r => String(r.scope || '').toLowerCase() === 'per_diem');
    const other = receiptsCache.filter(r => String(r.scope || '').toLowerCase() !== 'per_diem');
    return `<div class="mobile-receipt-groups">${receiptGroupHtml('per_diem', 'Per Diem', perDiem)}${receiptGroupHtml('other', 'Other', other)}</div>`;
  }
  async function renderReceipts() {
    await Promise.all([loadTours(), loadTypes()]);
    await loadTourData();
    const total = receiptsCache.reduce((sum, r) => sum + Number(r.amount || 0), 0);
    M.getContent().innerHTML = `<section class="mobile-receipt-toolbar-card"><label>Select Tour<select id="mobileReceiptTourSelect">${toursCache.map(t => `<option value="${safeHtml(t.id)}" ${t.id === selectedTourId ? 'selected' : ''}>${safeHtml(t.tour_name || t.location || 'Tour')} (${M.dt(t.orders_start_date)} - ${M.dt(t.orders_end_date)})</option>`).join('')}</select></label><button class="btn full" type="button" id="mobileAddReceiptBtn" ${selectedTourId ? '' : 'disabled'}>+ Add Receipt</button></section>
      <div class="toolbar"><strong>Tour Receipts</strong><span class="badge-pill">${receiptsCache.length} • ${M.money(total)}</span></div><section class="summary-grid compact"><div class="kpi-card"><span>Receipts</span><strong>${receiptsCache.length}</strong><small>Total count</small></div><div class="kpi-card"><span>Total</span><strong>${M.money(total)}</strong><small>Receipt amount</small></div><div class="kpi-card"><span>Files</span><strong>📎 ${receiptsCache.filter(hasReceiptFile).length}</strong><small>Attached</small></div></section><div id="mobileReceiptFormHost"></div>${groupedReceiptsHtml()}`;
    ensureGroupedReceiptStyles();
    M.getContent().querySelectorAll('[data-toggle-group]').forEach(button => button.addEventListener('click', () => {
      const group = button.dataset.toggleGroup;
      const groupSection = button.closest('.mobile-receipt-group');
      const groupBody = groupSection?.querySelector('.mobile-receipt-group-body');
      const summary = button.querySelector('.mobile-receipt-group-total small');
      expandedGroups[group] = !expandedGroups[group];
      button.setAttribute('aria-expanded', String(expandedGroups[group]));
      if (groupBody) groupBody.hidden = !expandedGroups[group];
      if (summary) summary.textContent = expandedGroups[group] ? '▲ Collapse' : '▼ Expand';
    }));
    M.getContent().querySelectorAll('[data-toggle-receipt]').forEach(button => button.addEventListener('click', () => {
      const id = button.dataset.toggleReceipt;
      if (expandedReceiptIds.has(id)) expandedReceiptIds.delete(id); else expandedReceiptIds.add(id);
      renderReceipts();
    }));
    document.getElementById('mobileReceiptTourSelect')?.addEventListener('change', async event => { selectedTourId = event.target.value; expandedReceiptIds.clear(); await renderReceipts(); });
    document.getElementById('mobileAddReceiptBtn')?.addEventListener('click', () => renderReceiptForm());
    M.getContent().querySelectorAll('[data-edit-receipt]').forEach(button => button.addEventListener('click', () => renderReceiptForm(receiptsCache.find(r => r.id === button.dataset.editReceipt))));
    M.getContent().querySelectorAll('[data-delete-receipt]').forEach(button => button.addEventListener('click', () => deleteReceipt(button.dataset.deleteReceipt)));
    M.getContent().querySelectorAll('[data-preview-receipt]').forEach(button => button.addEventListener('click', () => previewReceipt(button.dataset.previewReceipt)));
  }

  function clearRequiredError(input, error) { input.classList.remove('mobile-field-invalid'); error.hidden = true; error.textContent = ''; }
  function showCustomerRequired() {
    const input = document.getElementById('mobileReceiptCustomer');
    const error = document.getElementById('mobileReceiptCustomerError');
    input.classList.add('mobile-field-invalid'); error.hidden = false; error.textContent = 'Customer / Vendor is required. Enter the business or vendor shown on the receipt.';
    showThemeMessage('Customer / Vendor Required', 'Enter the business or vendor shown on the receipt before saving.', () => { input.focus(); input.scrollIntoView({ behavior: 'smooth', block: 'center' }); });
  }
  function showReceiptTypeRequired() {
    const input = document.getElementById('mobileReceiptType');
    input.classList.add('mobile-field-invalid');
    let error = document.getElementById('mobileReceiptTypeError');
    if (!error) {
      error = document.createElement('small');
      error.id = 'mobileReceiptTypeError';
      error.className = 'mobile-field-error';
      input.insertAdjacentElement('afterend', error);
    }
    error.textContent = 'Receipt Type is required. Select a valid type for the selected receipt mode.';
    showThemeMessage('Receipt Type Required', 'Select a Receipt Type before saving the receipt.', () => { input.focus(); input.scrollIntoView({ behavior: 'smooth', block: 'center' }); });
  }

  function renderReceiptForm(receipt = null, scopeOverride = null, draftValues = null) {
    const host = document.getElementById('mobileReceiptFormHost');
    if (!host) return;
    currentScope = scopeOverride || draftValues?.scope || receipt?.scope || currentScope || 'per_diem';
    const formValues = draftValues || receipt || {};
    const tour = selectedTour();
    host.innerHTML = `<section class="form-card mobile-receipt-form-card"><div class="card-title-row"><strong>${receipt?.id ? 'Edit Receipt' : 'Add Receipt'}</strong><button class="back-link" type="button" id="mobileCancelReceiptBtn">Close</button></div><div class="mobile-scope-toggle"><button type="button" class="${currentScope === 'per_diem' ? 'active' : ''}" data-mobile-scope="per_diem">Per Diem</button><button type="button" class="${currentScope === 'other' ? 'active' : ''}" data-mobile-scope="other">Other</button></div>
      <form id="mobileReceiptForm" novalidate><label>Receipt Type<select id="mobileReceiptType" required>${typeOptions(formValues.type_id || '')}</select></label><label id="mobileReceiptCycleWrap" style="display:${currentScope === 'per_diem' ? 'grid' : 'none'}">Cycle<select id="mobileReceiptCycle">${cycleOptions(formValues.cycle_id || '')}</select></label><label>Customer / Vendor <span class="required-indicator">Required</span><input id="mobileReceiptCustomer" value="${safeHtml(formValues.customer || '')}" placeholder="Enter business or vendor" required aria-describedby="mobileReceiptCustomerError"><small id="mobileReceiptCustomerError" class="mobile-field-error" hidden></small></label><div class="form-two"><label>Date<input id="mobileReceiptDate" type="date" min="${safeHtml(tour?.orders_start_date || '')}" max="${safeHtml(tour?.orders_end_date || '')}" value="${safeHtml(formValues.receipt_date || tour?.orders_start_date || '')}" required></label><label>Amount<input id="mobileReceiptAmount" type="number" min="0" step="0.01" value="${safeHtml(formValues.amount || '')}" required></label></div><label>Notes<textarea id="mobileReceiptNotes">${safeHtml(formValues.notes || '')}</textarea></label><label>Attachment<input id="mobileReceiptFile" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.heic"></label>${formValues.file_name ? `<div class="notice">Current file: ${safeHtml(formValues.file_name)}</div>` : ''}<button class="btn full" type="submit" id="mobileSaveReceiptBtn">${receipt?.id ? 'Update Receipt' : 'Save Receipt'}</button></form></section>`;
    host.querySelectorAll('[data-mobile-scope]').forEach(button => button.addEventListener('click', () => {
      const nextScope = button.dataset.mobileScope;
      const draft = {
        scope: nextScope,
        type_id: '',
        cycle_id: nextScope === 'per_diem' ? (document.getElementById('mobileReceiptCycle')?.value || formValues.cycle_id || '') : null,
        customer: document.getElementById('mobileReceiptCustomer')?.value || formValues.customer || '',
        receipt_date: document.getElementById('mobileReceiptDate')?.value || formValues.receipt_date || '',
        amount: document.getElementById('mobileReceiptAmount')?.value || formValues.amount || '',
        notes: document.getElementById('mobileReceiptNotes')?.value || formValues.notes || '',
        file_name: formValues.file_name || ''
      };
      currentScope = nextScope;
      renderReceiptForm(receipt, nextScope, draft);
    }));
    document.getElementById('mobileCancelReceiptBtn').addEventListener('click', () => { host.innerHTML = ''; });
    const input = document.getElementById('mobileReceiptCustomer'); const error = document.getElementById('mobileReceiptCustomerError'); input.addEventListener('input', () => { if (input.value.trim()) clearRequiredError(input, error); });
    document.getElementById('mobileReceiptType').addEventListener('change', event => {
      if (event.target.value && event.target.value !== 'undefined') {
        event.target.classList.remove('mobile-field-invalid');
        const typeError = document.getElementById('mobileReceiptTypeError');
        if (typeError) typeError.remove();
      }
    });
    document.getElementById('mobileReceiptForm').addEventListener('submit', event => saveReceipt(event, receipt));
    host.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function uploadFile(file, date) {
    if (!file) return {};
    const bucket = window.USAF_CONFIG?.STORAGE_BUCKET || 'usaf-receipts';
    const safeName = file.name.replaceAll(' ', '_').replace(/[^a-zA-Z0-9._-]/g, '');
    const path = `${M.getUser().id}/receipts/${date.slice(0,4)}/${date.slice(5,7)}/${Date.now()}_${safeName}`;
    const result = await M.supa().storage.from(bucket).upload(path, file, { upsert: false });
    if (result.error) throw result.error;
    return { file_bucket: bucket, file_path: path, file_name: file.name, file_mime_type: file.type, file_size_bytes: file.size };
  }

  async function saveReceipt(event, existing) {
    event.preventDefault();
    const customer = document.getElementById('mobileReceiptCustomer').value.trim();
    if (!customer) return showCustomerRequired();
    const typeId = normalizeUuid(document.getElementById('mobileReceiptType').value);
    if (!typeId) return showReceiptTypeRequired();
    const userId = normalizeUuid(M.getUser().id);
    const tourId = normalizeUuid(selectedTourId);
    const scope = currentScope;
    const date = document.getElementById('mobileReceiptDate').value;
    const cycleId = scope === 'per_diem' ? normalizeUuid(document.getElementById('mobileReceiptCycle')?.value) : null;
    const receiptId = normalizeUuid(existing?.id);
    if (!userId) return showThemeMessage('User Account Error', 'The signed-in user ID is invalid. Sign out and sign back in before trying again.');
    if (!tourId) return showThemeMessage('Tour Required', 'Select a valid Tour before saving the receipt.');
    if (scope === 'per_diem' && !cycleId) return showThemeMessage('Cycle Required', 'Select a valid Cycle before saving a Per Diem receipt.');
    if (existing?.id && !receiptId) return showThemeMessage('Receipt Record Error', 'The selected receipt record has an invalid ID. Close the form, refresh the page, and select the receipt again.');
    const button = document.getElementById('mobileSaveReceiptBtn');
    try {
      button.disabled = true; button.textContent = 'Saving...';
      const payload = { user_id: userId, tour_id: tourId, cycle_id: cycleId, type_id: typeId, scope, customer, receipt_date: date, amount: Number(document.getElementById('mobileReceiptAmount').value || 0), notes: document.getElementById('mobileReceiptNotes').value.trim() || null, ...await uploadFile(document.getElementById('mobileReceiptFile').files?.[0], date) };
      const result = receiptId ? await M.supa().from('USAF_receipts').update(payload).eq('id', receiptId).eq('user_id', userId).select('id').single() : await M.supa().from('USAF_receipts').insert(payload).select('id').single();
      if (result.error) throw result.error;
      await renderReceipts();
    } catch (error) {
      const message = error.message || String(error);
      if (message.includes('invalid input syntax for type uuid')) {
        showThemeMessage('Receipt Save Failed', 'A linked record contains an invalid ID. Close the receipt form, refresh the page, reselect the Tour and Receipt Type, then try again.');
      } else {
        showThemeMessage('Receipt Save Failed', message);
      }
    }
    finally { if (button) { button.disabled = false; button.textContent = receiptId ? 'Update Receipt' : 'Save Receipt'; } }
  }

  async function deleteReceipt(id) {
    const receipt = receiptsCache.find(r => r.id === id);
    if (!confirm(`Delete receipt "${receipt?.customer || receiptTypeLabel(receipt)}"?`)) return;
    if (receipt?.file_path && receipt?.file_bucket) { const storage = await M.supa().storage.from(receipt.file_bucket).remove([receipt.file_path]); if (storage.error) return showThemeMessage('Receipt File Delete Failed', storage.error.message); }
    const result = await M.supa().from('USAF_receipts').delete().eq('id', id).eq('user_id', M.getUser().id).select('id');
    if (result.error) return showThemeMessage('Receipt Delete Failed', result.error.message);
    if (!(result.data || []).length) return showThemeMessage('Receipt Not Deleted', 'Supabase did not remove the receipt. Check the receipt delete policy.');
    await renderReceipts();
  }

  M.registerPage('receipts', renderReceipts);
  return { renderReceipts, hasReceiptFile, receiptCard: compactReceiptCard };
})();
