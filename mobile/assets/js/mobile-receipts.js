// Mobile Receipts - Tour Selection, CRUD, Validation, Preview v135
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
    return '<option value="">Select Type</option>' + typesCache
      .filter(t => String(t.active ?? true) !== 'false' && typeAvailable(t, currentScope))
      .map(t => `<option value="${safeHtml(t.id)}" ${String(t.id) === String(selected) ? 'selected' : ''}>${safeHtml(t.name)}</option>`).join('');
  }
  function cycleOptions(selected = '') {
    return '<option value="">Select Cycle</option>' + cyclesCache.map(c => `<option value="${safeHtml(c.id)}" ${String(c.id) === String(selected) ? 'selected' : ''}>${M.dt(c.start_date)} - ${M.dt(c.end_date)} (${M.money(c.per_diem_per_day)}/day)</option>`).join('');
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

  function receiptCard(r) {
    const cycle = r.USAF_cycles ? `${M.dt(r.USAF_cycles.start_date)} - ${M.dt(r.USAF_cycles.end_date)}` : 'No cycle linked';
    const file = hasReceiptFile(r) ? `<button class="mobile-file-preview-button" type="button" data-preview-receipt="${safeHtml(r.id)}">📎 ${safeHtml(r.file_name || 'View receipt')}</button>` : '<span>No file attached</span>';
    return `<article class="data-card receipt-card ${hasReceiptFile(r) ? 'has-file' : ''}">
      <div class="card-title-row"><strong>${hasReceiptFile(r) ? '📎 ' : ''}${safeHtml(r.customer || receiptTypeLabel(r))}</strong><b>${M.money(r.amount)}</b></div>
      <span>${safeHtml(receiptTypeLabel(r))}</span><div class="data-row"><span>Date</span><b>${M.dt(r.receipt_date)}</b></div><div class="data-row"><span>Cycle</span><b>${cycle}</b></div><div class="data-row"><span>Tour</span><b>${safeHtml(r.USAF_tours?.tour_name || selectedTour()?.tour_name || 'Tour')}</b></div><div class="data-row"><span>File</span><b>${file}</b></div>${r.notes ? `<span class="muted">${safeHtml(r.notes)}</span>` : ''}
      <div class="mobile-receipt-actions"><button class="btn secondary" type="button" data-edit-receipt="${safeHtml(r.id)}">Edit</button><button class="btn danger" type="button" data-delete-receipt="${safeHtml(r.id)}">Delete</button></div>
    </article>`;
  }

  async function renderReceipts() {
    await Promise.all([loadTours(), loadTypes()]);
    await loadTourData();
    const total = receiptsCache.reduce((sum, r) => sum + Number(r.amount || 0), 0);
    M.getContent().innerHTML = `<section class="mobile-receipt-toolbar-card"><label>Select Tour<select id="mobileReceiptTourSelect">${toursCache.map(t => `<option value="${safeHtml(t.id)}" ${t.id === selectedTourId ? 'selected' : ''}>${safeHtml(t.tour_name || t.location || 'Tour')} (${M.dt(t.orders_start_date)} - ${M.dt(t.orders_end_date)})</option>`).join('')}</select></label><button class="btn full" type="button" id="mobileAddReceiptBtn" ${selectedTourId ? '' : 'disabled'}>+ Add Receipt</button></section>
      <div class="toolbar"><strong>Tour Receipts</strong><span class="badge-pill">${receiptsCache.length} • ${M.money(total)}</span></div><section class="summary-grid compact"><div class="kpi-card"><span>Receipts</span><strong>${receiptsCache.length}</strong><small>Total count</small></div><div class="kpi-card"><span>Total</span><strong>${M.money(total)}</strong><small>Receipt amount</small></div><div class="kpi-card"><span>Files</span><strong>📎 ${receiptsCache.filter(hasReceiptFile).length}</strong><small>Attached</small></div></section><div id="mobileReceiptFormHost"></div><div class="card-list">${receiptsCache.length ? receiptsCache.map(receiptCard).join('') : '<div class="empty-card">No receipts for this Tour yet.</div>'}</div>`;
    document.getElementById('mobileReceiptTourSelect')?.addEventListener('change', async event => { selectedTourId = event.target.value; await renderReceipts(); });
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

  function renderReceiptForm(receipt = null) {
    const host = document.getElementById('mobileReceiptFormHost');
    if (!host) return;
    currentScope = receipt?.scope || 'per_diem';
    const tour = selectedTour();
    host.innerHTML = `<section class="form-card mobile-receipt-form-card"><div class="card-title-row"><strong>${receipt ? 'Edit Receipt' : 'Add Receipt'}</strong><button class="back-link" type="button" id="mobileCancelReceiptBtn">Close</button></div><div class="mobile-scope-toggle"><button type="button" class="${currentScope === 'per_diem' ? 'active' : ''}" data-mobile-scope="per_diem">Per Diem</button><button type="button" class="${currentScope === 'other' ? 'active' : ''}" data-mobile-scope="other">Other</button></div>
      <form id="mobileReceiptForm" novalidate><label>Receipt Type<select id="mobileReceiptType" required>${typeOptions(receipt?.type_id || '')}</select></label><label id="mobileReceiptCycleWrap" style="display:${currentScope === 'per_diem' ? 'grid' : 'none'}">Cycle<select id="mobileReceiptCycle">${cycleOptions(receipt?.cycle_id || '')}</select></label><label>Customer / Vendor <span class="required-indicator">Required</span><input id="mobileReceiptCustomer" value="${safeHtml(receipt?.customer || '')}" placeholder="Enter business or vendor" required aria-describedby="mobileReceiptCustomerError"><small id="mobileReceiptCustomerError" class="mobile-field-error" hidden></small></label><div class="form-two"><label>Date<input id="mobileReceiptDate" type="date" min="${safeHtml(tour?.orders_start_date || '')}" max="${safeHtml(tour?.orders_end_date || '')}" value="${safeHtml(receipt?.receipt_date || tour?.orders_start_date || '')}" required></label><label>Amount<input id="mobileReceiptAmount" type="number" min="0" step="0.01" value="${safeHtml(receipt?.amount || '')}" required></label></div><label>Notes<textarea id="mobileReceiptNotes">${safeHtml(receipt?.notes || '')}</textarea></label><label>Attachment<input id="mobileReceiptFile" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.heic"></label>${receipt?.file_name ? `<div class="notice">Current file: ${safeHtml(receipt.file_name)}</div>` : ''}<button class="btn full" type="submit" id="mobileSaveReceiptBtn">${receipt ? 'Update Receipt' : 'Save Receipt'}</button></form></section>`;
    host.querySelectorAll('[data-mobile-scope]').forEach(button => button.addEventListener('click', () => { currentScope = button.dataset.mobileScope; renderReceiptForm(receipt ? { ...receipt, scope: currentScope, type_id: '' } : null); }));
    document.getElementById('mobileCancelReceiptBtn').addEventListener('click', () => { host.innerHTML = ''; });
    const input = document.getElementById('mobileReceiptCustomer'); const error = document.getElementById('mobileReceiptCustomerError'); input.addEventListener('input', () => { if (input.value.trim()) clearRequiredError(input, error); });
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
    const scope = currentScope; const date = document.getElementById('mobileReceiptDate').value; const cycleId = document.getElementById('mobileReceiptCycle')?.value || null;
    if (scope === 'per_diem' && !cycleId) return showThemeMessage('Cycle Required', 'Select a Cycle before saving a Per Diem receipt.');
    const button = document.getElementById('mobileSaveReceiptBtn');
    try {
      button.disabled = true; button.textContent = 'Saving...';
      const payload = { user_id: M.getUser().id, tour_id: selectedTourId, cycle_id: scope === 'per_diem' ? cycleId : null, type_id: document.getElementById('mobileReceiptType').value, scope, customer, receipt_date: date, amount: Number(document.getElementById('mobileReceiptAmount').value || 0), notes: document.getElementById('mobileReceiptNotes').value.trim() || null, ...await uploadFile(document.getElementById('mobileReceiptFile').files?.[0], date) };
      const result = existing ? await M.supa().from('USAF_receipts').update(payload).eq('id', existing.id).eq('user_id', M.getUser().id).select('id').single() : await M.supa().from('USAF_receipts').insert(payload).select('id').single();
      if (result.error) throw result.error;
      await renderReceipts();
    } catch (error) { showThemeMessage('Receipt Save Failed', error.message || String(error)); }
    finally { if (button) { button.disabled = false; button.textContent = existing ? 'Update Receipt' : 'Save Receipt'; } }
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
  return { renderReceipts, hasReceiptFile, receiptCard };
})();
