// Receipts desktop workflow v21
// Consolidates Per Diem and Other receipts on one Receipts page.
// Limits Tours, Cycles, and Receipts to the signed-in/effective user.
// Adds date validation and receipt delete support.
let toursCache = [];
let selectedTour = null;
let receiptsCache = [];
let typesCache = [];
let cyclesCache = [];
let currentScope = 'per_diem';

function esc(v) { return String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function money(v) { return Number(v || 0).toLocaleString(undefined, { style:'currency', currency:'USD' }); }
function dt(v) { if (!v) return ''; try { return new Date(String(v) + 'T00:00:00').toLocaleDateString(); } catch { return String(v); } }
function activeStatus(status) { return ['active','planned'].includes(String(status || '').toLowerCase()); }
function scopeLabel(scope) { return scope === 'per_diem' ? 'Per Diem' : 'Other'; }
function receiptsByScope(scope) { return receiptsCache.filter(r => (r.scope || 'per_diem') === scope); }
function receiptTotal(scope) { return receiptsByScope(scope).reduce((sum, r) => sum + Number(r.amount || 0), 0); }
function receiptCountAndTotal(rows) {
  const list = rows || [];
  return `${list.length} • ${money(list.reduce((sum, r) => sum + Number(r.amount || 0), 0))}`;
}
function hasReceiptFile(r) {
  return !!(
    r.file_path || r.file_name || r.file_bucket || r.receipt_file_path || r.receipt_file_url ||
    r.receipt_url || r.file_url || r.attachment_url || r.attachment_path || r.storage_path ||
    r.filename || r.original_filename
  );
}
function receiptFileLabel(r) {
  const label = r.file_name || r.receipt_filename || r.filename || r.original_filename;
  if (label) return label;
  const path = r.file_path || r.receipt_file_path || r.attachment_path || r.storage_path || r.receipt_file_url || r.receipt_url || r.file_url || r.attachment_url;
  if (!path) return '';
  return String(path).split('?')[0].split('/').filter(Boolean).pop() || 'Receipt attached';
}
function fileSizeLabel(bytes) {
  const size = Number(bytes || 0);
  if (!size) return '';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}
function receiptFileHtml(r, compact = false) {
  if (!hasReceiptFile(r)) return compact ? '<span class="muted">No file</span>' : '<span class="receipt-file-empty">No file attached</span>';
  const size = fileSizeLabel(r.file_size_bytes);
  const label = receiptFileLabel(r) || 'Receipt attached';
  const filePath = r.file_path || r.receipt_file_path || r.attachment_path || r.storage_path || '';
  const fileBucket = r.file_bucket || (window.USAF_CONFIG && window.USAF_CONFIG.STORAGE_BUCKET) || '';
  const directUrl = r.receipt_file_url || r.receipt_url || r.file_url || r.attachment_url || '';
  return `<button type="button" class="receipt-file-pill file-view-btn" data-view-receipt-file="${esc(r.id)}" data-file-path="${esc(filePath)}" data-file-bucket="${esc(fileBucket)}" data-file-url="${esc(directUrl)}" title="Open ${esc(label)}${size ? ' • ' + esc(size) : ''}">📎 <span>${esc(label)}</span>${size ? `<small>${esc(size)}</small>` : ''}</button>`;
}
function cycleLabelForReceipt(r) {
  const c = cyclesCache.find(x => x.id === r.cycle_id);
  return c ? `${dt(c.start_date)} - ${dt(c.end_date)}` : 'No cycle linked';
}
function receiptTypeName(r) {
  return r.USAF_receipt_types?.name || r.type_name || r.receipt_type || '';
}
async function viewReceiptFile(receiptId) {
  const r = receiptsCache.find(x => x.id === receiptId);
  if (!r || !hasReceiptFile(r)) return alert('No receipt file is attached to this receipt.');
  const directUrl = r.receipt_file_url || r.receipt_url || r.file_url || r.attachment_url || '';
  if (directUrl) {
    window.open(directUrl, '_blank', 'noopener');
    return;
  }
  const bucket = r.file_bucket || window.USAF_CONFIG?.STORAGE_BUCKET;
  const path = r.file_path || r.receipt_file_path || r.attachment_path || r.storage_path;
  if (!bucket || !path) return alert('Receipt file information is missing.');
  try {
    const signed = await window.usafSupabase.storage.from(bucket).createSignedUrl(path, 60 * 10);
    if (signed.error) throw signed.error;
    window.open(signed.data.signedUrl, '_blank', 'noopener');
  } catch (err) {
    alert('Unable to open receipt file: ' + (err.message || err));
  }
}
function ensureExistingAttachmentBox() {
  if (document.getElementById('existingReceiptFileBox')) return document.getElementById('existingReceiptFileBox');
  const fileInput = document.getElementById('receipt_file');
  if (!fileInput) return null;
  const box = document.createElement('div');
  box.id = 'existingReceiptFileBox';
  box.className = 'attachment-existing hidden';
  box.innerHTML = '<div><strong>No current file</strong><span>No receipt file is attached.</span></div><div class="attachment-actions"><button type="button" class="btn small secondary" id="viewExistingReceiptFileBtn">View File</button><button type="button" class="btn small danger" id="removeExistingReceiptFileBtn">Remove File</button></div><input type="hidden" id="remove_receipt_file" value="0">';
  fileInput.closest('label')?.insertAdjacentElement('afterend', box);
  return box;
}
function showExistingAttachment(receipt) {
  const box = ensureExistingAttachmentBox();
  if (!box) return;
  const removeFlag = document.getElementById('remove_receipt_file');
  if (removeFlag) removeFlag.value = '0';
  if (!receipt || !hasReceiptFile(receipt)) {
    box.classList.add('hidden');
    return;
  }
  const size = fileSizeLabel(receipt.file_size_bytes);
  const label = receiptFileLabel(receipt) || 'Receipt attached';
  box.classList.remove('hidden');
  box.querySelector('strong').textContent = 'Current receipt file';
  box.querySelector('span').textContent = `${label}${size ? ' • ' + size : ''}`;
  const viewBtn = document.getElementById('viewExistingReceiptFileBtn');
  const removeBtn = document.getElementById('removeExistingReceiptFileBtn');
  if (viewBtn) viewBtn.onclick = () => viewReceiptFile(receipt.id);
  if (removeBtn) removeBtn.onclick = () => {
    if (!confirm('Remove the attached receipt file from this receipt? The receipt record will remain.')) return;
    if (removeFlag) removeFlag.value = '1';
    box.querySelector('strong').textContent = 'Receipt file will be removed';
    box.querySelector('span').textContent = 'Click Update Receipt to save this change.';
    box.classList.add('remove-pending');
  };
}

async function currentUser() {
  if (window.USAFEffectiveUser && typeof window.USAFEffectiveUser.getEffectiveUser === 'function') return window.USAFEffectiveUser.getEffectiveUser();
  return getCurrentUser();
}
function isReadOnlyViewAs() { return !!(window.USAFEffectiveUser && window.USAFEffectiveUser.isViewAsActive && window.USAFEffectiveUser.isViewAsActive()); }


async function logAuditEvent(action, moduleName, entityType, entityId, entityName, severity = 'info', details = {}, oldValues = {}, newValues = {}) {
  try {
    if (!window.usafSupabase || typeof window.usafSupabase.rpc !== 'function') return;
    const { error } = await window.usafSupabase.rpc('log_audit_event', {
      p_action: action,
      p_module: moduleName,
      p_entity_type: entityType,
      p_entity_id: entityId ? String(entityId) : null,
      p_entity_name: entityName || null,
      p_severity: severity,
      p_details: details || {},
      p_old_values: oldValues || {},
      p_new_values: newValues || {}
    });
    if (error) console.warn('Audit log write failed', error);
  } catch (err) {
    console.warn('Audit log write failed', err);
  }
}

function showThemeMessage(title, message, type = 'warning') {
  document.querySelector('.theme-message-backdrop')?.remove();
  const modal = document.createElement('div');
  modal.className = 'modal-backdrop open theme-message-backdrop';
  const icon = type === 'danger' ? '!' : type === 'success' ? '✓' : 'i';
  modal.innerHTML = `<div class="modal-card voucher-ready-modal" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    <div class="modal-body">
      <div class="theme-message-icon ${type}">${icon}</div>
      <h2 class="theme-message-title">${esc(title)}</h2>
      <p class="theme-message-text">${esc(message)}</p>
      <div class="actions" style="justify-content:flex-end;margin-top:16px">
        <button class="btn" type="button" data-close-theme-message>OK</button>
      </div>
    </div>
  </div>`;
  document.body.appendChild(modal);
  modal.querySelector('[data-close-theme-message]')?.addEventListener('click', () => modal.remove());
  modal.addEventListener('click', event => { if (event.target === modal) modal.remove(); });
}

async function initReceipts() {
  await renderLayout('Receipts');
  if (window.USAFEffectiveUser) window.USAFEffectiveUser.initViewAsUi();
  bindEvents();
  await loadTypes();
  await loadTours();
}

function bindEvents() {
  tourStatusFilter.addEventListener('change', renderTourCards);
  closeReceiptModal.addEventListener('click', closeReceiptModalFn);
  cancelReceiptBtn.addEventListener('click', closeReceiptModalFn);
  receiptForm.addEventListener('submit', saveReceipt);
  modePerDiem.addEventListener('click', () => setScope('per_diem'));
  modeOther.addEventListener('click', () => setScope('other'));
}

async function loadTours() {
  const user = await currentUser();
  let result = await window.usafSupabase
    .from('USAF_tour_summary')
    .select('*')
    .eq('user_id', user.id)
    .order('orders_start_date', { ascending:false });
  if (result.error) {
    result = await window.usafSupabase
      .from('USAF_tours')
      .select('*')
      .eq('user_id', user.id)
      .order('orders_start_date', { ascending:false });
  }
  if (result.error) { tourCards.innerHTML = `<div class="empty-state">${esc(result.error.message)}</div>`; return; }
  toursCache = result.data || [];
  renderTourCards();
}

function filteredTours() {
  const filter = tourStatusFilter.value;
  if (filter === 'all') return toursCache;
  if (filter === 'active') return toursCache.filter(t => activeStatus(t.status));
  return toursCache.filter(t => !activeStatus(t.status));
}

async function getReceiptCountsForTour(tourId) {
  const user = await currentUser();
  const { data } = await window.usafSupabase
    .from('USAF_receipts')
    .select('scope,amount,file_path,file_name,file_bucket,file_size_bytes')
    .eq('user_id', user.id)
    .eq('tour_id', tourId);
  const rows = data || [];
  const perDiemRows = rows.filter(r => r.scope === 'per_diem');
  const otherRows = rows.filter(r => r.scope === 'other');
  return {
    perDiem: perDiemRows.length,
    perDiemTotal: perDiemRows.reduce((sum, r) => sum + Number(r.amount || 0), 0),
    other: otherRows.length,
    otherTotal: otherRows.reduce((sum, r) => sum + Number(r.amount || 0), 0),
    all: rows.length,
    total: rows.reduce((sum, r) => sum + Number(r.amount || 0), 0),
    attached: rows.filter(hasReceiptFile).length
  };
}

async function renderTourCards() {
  const tours = filteredTours();
  if (!tours.length) { tourCards.innerHTML = '<div class="empty-state">No Tours match this filter.</div>'; tourReceiptWrap.innerHTML = '<div class="receipts-tour-empty"><div><h2>Select a Tour</h2><p>No Tours match the selected filter.</p></div></div>'; return; }
  const cards = [];
  for (const t of tours) {
    const counts = await getReceiptCountsForTour(t.id);
    cards.push(`<button class="receipt-tour-card ${selectedTour?.id === t.id ? 'active' : ''}" data-id="${esc(t.id)}">
      <div><strong>${esc(t.tour_name || t.location || 'Tour')}</strong><span>${esc(t.location || '')}</span><small>${dt(t.orders_start_date)} - ${dt(t.orders_end_date)}</small></div>
      <div class="receipt-tour-counts receipt-tour-counts-clean">
        <div class="receipt-count-pill"><span>Per Diem</span><strong>${counts.perDiem} • ${money(counts.perDiemTotal)}</strong></div>
        <div class="receipt-count-pill"><span>Other</span><strong>${counts.other} • ${money(counts.otherTotal)}</strong></div>
        <div class="receipt-count-pill"><span>All Receipts</span><strong>${counts.all} • ${money(counts.total)}</strong></div>
        <div class="receipt-count-pill attachment-count"><span>Files</span><strong>📎 ${counts.attached}</strong></div>
      </div>
    </button>`);
  }
  tourCards.innerHTML = cards.join('');
  tourCards.querySelectorAll('[data-id]').forEach(btn => btn.addEventListener('click', () => selectTour(btn.dataset.id)));
}

async function selectTour(id) {
  selectedTour = toursCache.find(t => t.id === id);
  if (!selectedTour) return;
  const user = await currentUser();
  const { data, error } = await window.usafSupabase
    .from('USAF_receipts')
    .select('*, USAF_receipt_types(name)')
    .eq('user_id', user.id)
    .eq('tour_id', id)
    .order('receipt_date', { ascending:false });
  if (error) { tourReceiptWrap.innerHTML = `<div class="empty-state">${esc(error.message)}</div>`; return; }
  receiptsCache = data || [];
  await loadCyclesForTour(id);
  renderReceiptWorkspace();
  await renderTourCards();
}

async function loadCyclesForTour(tourId) {
  const user = await currentUser();
  const { data, error } = await window.usafSupabase
    .from('USAF_cycles')
    .select('*')
    .eq('user_id', user.id)
    .eq('tour_id', tourId)
    .order('start_date', { ascending:false });
  cyclesCache = error ? [] : (data || []);
}

async function loadTypes() {
  const { data, error } = await window.usafSupabase
    .from('USAF_receipt_types')
    .select('*')
    .order('name', { ascending:true });
  typesCache = error ? [] : (data || []);
}

function renderReceiptWorkspace() {
  if (!selectedTour) return;
  tourReceiptWrap.innerHTML = `<div class="card">
    <div class="toolbar"><div><h2>${esc(selectedTour.tour_name || 'Tour Receipts')}</h2><p class="muted">${dt(selectedTour.orders_start_date)} - ${dt(selectedTour.orders_end_date)}</p></div><button class="btn" id="addReceiptBtn" ${isReadOnlyViewAs() ? 'disabled' : ''}>+ Add Receipt</button></div>
    <div class="receipt-tour-summary-strip">  
      <div class="receipt-summary-tile"><span>Per Diem Receipts</span><strong>${receiptsByScope('per_diem').length}</strong><small>${money(receiptTotal('per_diem'))}</small></div>  
      <div class="receipt-summary-tile"><span>Other Receipts</span><strong>${receiptsByScope('other').length}</strong><small>${money(receiptTotal('other'))}</small></div>  
      <div class="receipt-summary-tile"><span>All Receipts</span><strong>${receiptsCache.length}</strong><small>${money(receiptTotal('per_diem') + receiptTotal('other'))}</small></div>  
      <div class="receipt-summary-tile"><span>Files Attached</span><strong>${receiptsCache.filter(hasReceiptFile).length}</strong><small>Receipt attachments</small></div>  
    </div>
    <h3>Per Diem Receipts</h3>${receiptTable('per_diem')}
    <h3>Other Receipts</h3>${receiptTable('other')}
  </div>`;
  document.getElementById('addReceiptBtn')?.addEventListener('click', () => openReceiptModal());
  tourReceiptWrap.querySelectorAll('[data-edit-receipt]').forEach(btn => btn.addEventListener('click', () => openReceiptModal(receiptsCache.find(r => r.id === btn.dataset.editReceipt))));
  tourReceiptWrap.querySelectorAll('[data-delete-receipt]').forEach(btn => btn.addEventListener('click', () => deleteReceipt(btn.dataset.deleteReceipt)));
  tourReceiptWrap.querySelectorAll('[data-view-receipt-file]').forEach(btn => btn.addEventListener('click', () => viewReceiptFile(btn.dataset.viewReceiptFile)));
}

function receiptTable(scope) {
  const rows = receiptsByScope(scope);
  if (!rows.length) return `<div class="empty-state">No ${scopeLabel(scope)} receipts yet.</div>`;
  return `<div class="receipt-card-table compact-receipt-list">${rows.map(r => {
    const attachedClass = hasReceiptFile(r) ? 'has-attachment' : '';
    return `<article class="desktop-receipt-card compact ${attachedClass}">
      <div class="desktop-receipt-left">
        <div class="desktop-receipt-title">
          <strong>${hasReceiptFile(r) ? '📎 ' : ''}${esc(r.customer || receiptTypeName(r) || scopeLabel(scope) + ' Receipt')}</strong>
          <span>${esc(receiptTypeName(r) || 'No type selected')}</span>
        </div>
        <div class="desktop-receipt-meta-line">
          <span><b>Date:</b> ${dt(r.receipt_date) || 'No date'}</span>
          <span><b>Cycle:</b> ${cycleLabelForReceipt(r)}</span>
          <span><b>File:</b> ${receiptFileHtml(r, true)}</span>
          <span><b>Notes:</b> ${esc(r.notes || 'No notes')}</span>
        </div>
      </div>
      <div class="desktop-receipt-right">
        <div class="desktop-receipt-amount">${money(r.amount)}</div>
        <div class="desktop-receipt-actions">
          <button class="btn small secondary" data-edit-receipt="${esc(r.id)}">Edit</button>
          <button class="btn small danger" data-delete-receipt="${esc(r.id)}" ${isReadOnlyViewAs() ? 'disabled' : ''}>Delete</button>
        </div>
      </div>
    </article>`;
  }).join('')}</div>`;
}
function setScope(scope) {
  currentScope = scope;
  receipt_scope.value = scope;
  modePerDiem.classList.toggle('active', scope === 'per_diem');
  modeOther.classList.toggle('active', scope === 'other');
  cycleWrap.style.display = scope === 'per_diem' ? '' : 'none';
  populateReceiptTypes(type_id.value);
}

function populateReceiptTypes(selected='') {
  const scopeTypes = typesCache.filter(t => !t.scope || t.scope === currentScope || t.scope === 'both');
  type_id.innerHTML = '<option value="">Select Type</option>' + scopeTypes.map(t => `<option value="${esc(t.id)}">${esc(t.name)}</option>`).join('');
  type_id.value = selected || '';
}

function populateCycles(selected='') {
  cycle_id.innerHTML = '<option value="">Select Cycle</option>' + cyclesCache.map(c => `<option value="${esc(c.id)}">${dt(c.start_date)} - ${dt(c.end_date)} (${money(c.per_diem_per_day)}/day)</option>`).join('');
  cycle_id.value = selected || '';
}

function openReceiptModal(receipt = null) {
  if (isReadOnlyViewAs()) return showThemeMessage('Read-Only View', 'Read-only while viewing as another user.', 'warning');
  if (!selectedTour) return showThemeMessage('Select a Tour', 'Select a Tour first.', 'warning');
  receiptForm.reset();
  receipt_id_edit.value = receipt?.id || '';
  tour_id.value = selectedTour.id;
  receiptModalTitle.textContent = receipt ? 'Edit Receipt' : 'Add Receipt';
  saveReceiptBtn.textContent = receipt ? 'Update Receipt' : 'Save Receipt';
  receipt_date.min = selectedTour.orders_start_date || '';
  receipt_date.max = selectedTour.orders_end_date || '';
  setScope(receipt?.scope || 'per_diem');
  populateCycles(receipt?.cycle_id || '');
  populateReceiptTypes(receipt?.type_id || '');
  if (receipt) {
    customer.value = receipt.customer || '';
    receipt_date.value = receipt.receipt_date || '';
    amount.value = receipt.amount || '';
    notes.value = receipt.notes || '';
  }
  showExistingAttachment(receipt);
  receiptModal.classList.add('open');
}

function closeReceiptModalFn() { receiptModal.classList.remove('open'); }

function validateReceiptDate() {
  const date = receipt_date.value;
  if (!date) return false;
  if (selectedTour.orders_start_date && date < selectedTour.orders_start_date) { showThemeMessage('Receipt Date Outside Tour', 'Receipt date must be within the selected Tour date range.', 'warning'); return false; }
  if (selectedTour.orders_end_date && date > selectedTour.orders_end_date) { showThemeMessage('Receipt Date Outside Tour', 'Receipt date must be within the selected Tour date range.', 'warning'); return false; }
  if (currentScope === 'per_diem' && cycle_id.value) {
    const c = cyclesCache.find(x => x.id === cycle_id.value);
    if (c && (date < c.start_date || date > c.end_date)) { showThemeMessage('Receipt Date Outside Cycle', 'Per Diem receipt date must be within the selected Cycle date range.', 'warning'); return false; }
  }
  return true;
}

async function uploadFile(userId, file) {
  if (!file) return {};
  const safeName = file.name.replaceAll(' ', '_').replace(/[^a-zA-Z0-9._-]/g, '');
  const path = `${userId}/receipts/${receipt_date.value.slice(0,4)}/${receipt_date.value.slice(5,7)}/${Date.now()}_${safeName}`;
  const { error } = await window.usafSupabase.storage.from(window.USAF_CONFIG.STORAGE_BUCKET).upload(path, file, { upsert:false });
  if (error) throw error;
  return { file_bucket: window.USAF_CONFIG.STORAGE_BUCKET, file_path: path, file_name: file.name, file_mime_type: file.type, file_size_bytes: file.size };
}

async function saveReceipt(e) {
  e.preventDefault();
  if (isReadOnlyViewAs()) return showThemeMessage('Read-Only View', 'Read-only while viewing as another user.', 'warning');
  const user = await currentUser();
  if (!selectedTour) return showThemeMessage('Select a Tour', 'Select a Tour first.', 'warning');
  if (currentScope === 'per_diem' && !cycle_id.value) return showThemeMessage('Cycle Required', 'Select a Cycle for Per Diem receipts.', 'warning');
  if (!type_id.value) return showThemeMessage('Receipt Type Required', 'Select a Receipt Type.', 'warning');
  if (!validateReceiptDate()) return;
  try {
    saveReceiptBtn.disabled = true;
    saveReceiptBtn.textContent = 'Saving...';
    const id = receipt_id_edit.value;
    const originalReceipt = id ? receiptsCache.find(x => x.id === id) : null;
    const removeExistingFile = document.getElementById('remove_receipt_file')?.value === '1';
    const newFile = receipt_file.files[0];
    const fileData = await uploadFile(user.id, newFile);
    const payload = { user_id:user.id, tour_id:selectedTour.id, scope:currentScope, cycle_id: currentScope === 'per_diem' ? cycle_id.value : null, customer:customer.value.trim(), type_id:type_id.value, receipt_date:receipt_date.value, amount:Number(amount.value), notes:notes.value.trim() || null, ...fileData };
    if (removeExistingFile && !newFile) {
      payload.file_bucket = null;
      payload.file_path = null;
      payload.file_name = null;
      payload.file_mime_type = null;
      payload.file_size_bytes = null;
    }
    if ((removeExistingFile || newFile) && originalReceipt?.file_bucket && originalReceipt?.file_path) {
      window.usafSupabase.storage.from(originalReceipt.file_bucket).remove([originalReceipt.file_path]).catch(err => console.warn('Receipt file remove warning', err));
    }
    const result = id ? await window.usafSupabase.from('USAF_receipts').update(payload).eq('id', id).eq('user_id', user.id).select().single() : await window.usafSupabase.from('USAF_receipts').insert(payload).select().single();
    if (result.error) throw result.error;
    if (typeof logAuditEvent === 'function') await logAuditEvent(id ? 'Receipt Updated' : 'Receipt Created', 'Receipts', 'Receipt', result.data?.id || id, payload.customer || scopeLabel(currentScope) + ' Receipt', id ? 'warning' : 'info', { tour_id: selectedTour.id, tour_name: selectedTour.tour_name, scope: currentScope, amount: payload.amount, file_changed: !!(newFile || removeExistingFile) }, originalReceipt || {}, result.data || payload);
    closeReceiptModalFn();
    await selectTour(selectedTour.id);
  } catch (err) { showThemeMessage('Receipt Save Failed', err.message || String(err), 'danger'); }
  finally { saveReceiptBtn.disabled = false; saveReceiptBtn.textContent = receipt_id_edit.value ? 'Update Receipt' : 'Save Receipt'; }
}

async function deleteReceipt(id) {
  if (isReadOnlyViewAs()) return showThemeMessage('Read-Only View', 'Read-only while viewing as another user.', 'warning');
  const user = await currentUser();
  const r = receiptsCache.find(x => x.id === id);
  if (!confirm(`Delete receipt ${r?.customer || ''} ${r?.receipt_date || ''}? This cannot be undone.`)) return;
  const deletedReceipt = r ? { ...r } : {};
  const { error } = await window.usafSupabase.from('USAF_receipts').delete().eq('id', id).eq('user_id', user.id);
  if (error) return showThemeMessage('Receipt Delete Failed', error.message, 'danger');
  if (typeof logAuditEvent === 'function') await logAuditEvent('Receipt Deleted', 'Receipts', 'Receipt', id, r?.customer || r?.type_name || 'Receipt', 'critical', { tour_id: selectedTour?.id, tour_name: selectedTour?.tour_name, amount: r?.amount, receipt_date: r?.receipt_date }, deletedReceipt, {});
  await selectTour(selectedTour.id);
}

initReceipts();
