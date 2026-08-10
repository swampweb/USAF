// Receipts desktop workflow v18
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

async function currentUser() {
  if (window.USAFEffectiveUser && typeof window.USAFEffectiveUser.getEffectiveUser === 'function') return window.USAFEffectiveUser.getEffectiveUser();
  return getCurrentUser();
}
function isReadOnlyViewAs() { return !!(window.USAFEffectiveUser && window.USAFEffectiveUser.isViewAsActive && window.USAFEffectiveUser.isViewAsActive()); }

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
    .select('scope,amount')
    .eq('user_id', user.id)
    .eq('tour_id', tourId);
  const rows = data || [];
  return {
    perDiem: rows.filter(r => r.scope === 'per_diem').length,
    other: rows.filter(r => r.scope === 'other').length,
    total: rows.reduce((sum, r) => sum + Number(r.amount || 0), 0)
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
      <div class="receipt-tour-counts">
        <div class="receipt-count-pill"><span>Per Diem</span><strong>${counts.perDiem}</strong></div>
        <div class="receipt-count-pill"><span>Other</span><strong>${counts.other}</strong></div>
        <div class="receipt-count-pill"><span>Total</span><strong>${money(counts.total)}</strong></div>
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
    <div class="summary-grid">
      <div class="summary-card"><span>Per Diem Receipts</span><strong>${receiptsByScope('per_diem').length}</strong><small>${money(receiptTotal('per_diem'))}</small></div>
      <div class="summary-card"><span>Other Receipts</span><strong>${receiptsByScope('other').length}</strong><small>${money(receiptTotal('other'))}</small></div>
      <div class="summary-card"><span>All Receipts</span><strong>${receiptsCache.length}</strong><small>${money(receiptTotal('per_diem') + receiptTotal('other'))}</small></div>
    </div>
    <h3>Per Diem Receipts</h3>${receiptTable('per_diem')}
    <h3>Other Receipts</h3>${receiptTable('other')}
  </div>`;
  document.getElementById('addReceiptBtn')?.addEventListener('click', () => openReceiptModal());
  tourReceiptWrap.querySelectorAll('[data-edit-receipt]').forEach(btn => btn.addEventListener('click', () => openReceiptModal(receiptsCache.find(r => r.id === btn.dataset.editReceipt))));
  tourReceiptWrap.querySelectorAll('[data-delete-receipt]').forEach(btn => btn.addEventListener('click', () => deleteReceipt(btn.dataset.deleteReceipt)));
}

function receiptTable(scope) {
  const rows = receiptsByScope(scope);
  if (!rows.length) return `<div class="empty-state">No ${scopeLabel(scope)} receipts yet.</div>`;
  return `<div class="table-wrap"><table><thead><tr><th>Date</th><th>Customer</th><th>Type</th><th>Cycle</th><th>Amount</th><th>Notes</th><th>Actions</th></tr></thead><tbody>${rows.map(r => {
    const c = cyclesCache.find(x => x.id === r.cycle_id);
    return `<tr><td>${dt(r.receipt_date)}</td><td>${esc(r.customer || '')}</td><td>${esc(r.USAF_receipt_types?.name || r.type_name || '')}</td><td>${c ? `${dt(c.start_date)} - ${dt(c.end_date)}` : ''}</td><td>${money(r.amount)}</td><td>${esc(r.notes || '')}</td><td><button class="btn small secondary" data-edit-receipt="${esc(r.id)}">Edit</button> <button class="btn small danger" data-delete-receipt="${esc(r.id)}" ${isReadOnlyViewAs() ? 'disabled' : ''}>Delete</button></td></tr>`;
  }).join('')}</tbody></table></div>`;
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
  if (isReadOnlyViewAs()) return alert('Read-only while viewing as another user.');
  if (!selectedTour) return alert('Select a Tour first.');
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
  receiptModal.classList.add('open');
}

function closeReceiptModalFn() { receiptModal.classList.remove('open'); }

function validateReceiptDate() {
  const date = receipt_date.value;
  if (!date) return false;
  if (selectedTour.orders_start_date && date < selectedTour.orders_start_date) { alert('Receipt date must be within the selected Tour date range.'); return false; }
  if (selectedTour.orders_end_date && date > selectedTour.orders_end_date) { alert('Receipt date must be within the selected Tour date range.'); return false; }
  if (currentScope === 'per_diem' && cycle_id.value) {
    const c = cyclesCache.find(x => x.id === cycle_id.value);
    if (c && (date < c.start_date || date > c.end_date)) { alert('Per Diem receipt date must be within the selected Cycle date range.'); return false; }
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
  if (isReadOnlyViewAs()) return alert('Read-only while viewing as another user.');
  const user = await currentUser();
  if (!selectedTour) return alert('Select a Tour first.');
  if (currentScope === 'per_diem' && !cycle_id.value) return alert('Select a Cycle for Per Diem receipts.');
  if (!type_id.value) return alert('Select a Receipt Type.');
  if (!validateReceiptDate()) return;
  try {
    saveReceiptBtn.disabled = true;
    saveReceiptBtn.textContent = 'Saving...';
    const fileData = await uploadFile(user.id, receipt_file.files[0]);
    const payload = { user_id:user.id, tour_id:selectedTour.id, scope:currentScope, cycle_id: currentScope === 'per_diem' ? cycle_id.value : null, customer:customer.value.trim(), type_id:type_id.value, receipt_date:receipt_date.value, amount:Number(amount.value), notes:notes.value.trim() || null, ...fileData };
    const id = receipt_id_edit.value;
    const result = id ? await window.usafSupabase.from('USAF_receipts').update(payload).eq('id', id).eq('user_id', user.id) : await window.usafSupabase.from('USAF_receipts').insert(payload);
    if (result.error) throw result.error;
    closeReceiptModalFn();
    await selectTour(selectedTour.id);
  } catch (err) { alert(err.message || err); }
  finally { saveReceiptBtn.disabled = false; saveReceiptBtn.textContent = receipt_id_edit.value ? 'Update Receipt' : 'Save Receipt'; }
}

async function deleteReceipt(id) {
  if (isReadOnlyViewAs()) return alert('Read-only while viewing as another user.');
  const user = await currentUser();
  const r = receiptsCache.find(x => x.id === id);
  if (!confirm(`Delete receipt ${r?.customer || ''} ${r?.receipt_date || ''}? This cannot be undone.`)) return;
  const { error } = await window.usafSupabase.from('USAF_receipts').delete().eq('id', id).eq('user_id', user.id);
  if (error) return alert('Receipt delete failed: ' + error.message);
  await selectTour(selectedTour.id);
}

initReceipts();
