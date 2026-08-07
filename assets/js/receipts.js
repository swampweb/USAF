let selectedReceipt = null;
let receiptsCache = [];
let toursCache = [];
let typesCache = [];
let cyclesCache = [];
let currentScope = 'per_diem';

function scopeLabel(scope) { return scope === 'per_diem' ? 'Per Diem' : 'Other'; }
function isProcessed(r) { return r.is_processed === true; }

async function initReceipts() {
  await renderLayout('Receipts');
  bindReceiptEvents();
  await loadTours();
  await loadTypes();
  await loadReceipts();
}

function bindReceiptEvents() {
  receiptFilter.addEventListener('change', renderReceiptCards);
  tourFilter.addEventListener('change', renderReceiptCards);
  newReceiptBtn.addEventListener('click', () => openReceiptModal());
  closeReceiptModal.addEventListener('click', closeReceiptModalFn);
  cancelReceiptBtn.addEventListener('click', closeReceiptModalFn);
  receiptForm.addEventListener('submit', saveReceipt);
  modePerDiem.addEventListener('click', () => setScope('per_diem'));
  modeOther.addEventListener('click', () => setScope('other'));
  tour_id.addEventListener('change', async () => { await populateCyclesForTour(); });
}

async function loadTours() {
  const { data, error } = await window.usafSupabase.from('USAF_tours').select('id,tour_name,orders_start_date,orders_end_date,status').order('orders_start_date', { ascending:false });
  if (error) return alert(error.message);
  toursCache = data || [];
  const options = toursCache.map(t => `<option value="${t.id}">${t.tour_name} (${fmtDate(t.orders_start_date)} - ${fmtDate(t.orders_end_date)})</option>`).join('');
  tourFilter.innerHTML = '<option value="all">All Tours</option>' + options;
  tour_id.innerHTML = '<option value="">Select Tour</option>' + options;
}

async function loadTypes() {
  const { data, error } = await window.usafSupabase.from('USAF_receipt_types').select('*').eq('is_active', true).order('sort_order').order('name');
  if (error) return alert(error.message);
  typesCache = data || [];
  populateReceiptTypes();
}

function populateReceiptTypes() {
  const valid = typesCache.filter(t => (t.applies_to || []).includes(currentScope));
  type_id.innerHTML = valid.map(t => `<option value="${t.id}">${t.name}</option>`).join('') || '<option value="">No active types for this category</option>';
}

async function populateCyclesForTour(selectedCycleId = '') {
  if (currentScope !== 'per_diem') return;
  if (!tour_id.value) { cycle_id.innerHTML = '<option value="">Select Tour first</option>'; return; }
  const { data, error } = await window.usafSupabase.from('USAF_cycles').select('*').eq('tour_id', tour_id.value).neq('status','cancelled').order('start_date');
  if (error) return alert(error.message);
  cyclesCache = data || [];
  cycle_id.innerHTML = '<option value="">Select Cycle</option>' + cyclesCache.map(c => `<option value="${c.id}">${fmtDate(c.start_date)} - ${fmtDate(c.end_date)} (${money(c.per_diem_per_day)}/day)</option>`).join('');
  if (selectedCycleId) cycle_id.value = selectedCycleId;
}

async function loadReceipts() {
  const { data, error } = await window.usafSupabase
    .from('USAF_receipts')
    .select('*, USAF_receipt_types(name), USAF_tours(tour_name), USAF_cycles(start_date,end_date)')
    .order('receipt_date', { ascending:false });
  if (error) {
    receiptCards.innerHTML = `<div class="empty-state">${error.message}</div>`;
    return;
  }
  receiptsCache = data || [];
  renderReceiptCards();
  if (selectedReceipt) {
    const fresh = receiptsCache.find(r => r.id === selectedReceipt.id);
    if (fresh) selectReceipt(fresh.id); else selectedReceipt = null;
  }
}

function filteredReceipts() {
  let rows = receiptsCache.slice();
  const f = receiptFilter.value;
  const tour = tourFilter.value;
  if (f === 'unprocessed') rows = rows.filter(r => !isProcessed(r));
  if (f === 'processed') rows = rows.filter(r => isProcessed(r));
  if (f === 'per_diem') rows = rows.filter(r => r.scope === 'per_diem');
  if (f === 'other') rows = rows.filter(r => r.scope === 'other');
  if (tour && tour !== 'all') rows = rows.filter(r => r.tour_id === tour);
  return rows;
}

function renderReceiptCards() {
  const rows = filteredReceipts();
  receiptCards.innerHTML = rows.map(r => `
    <button class="receipt-select-card ${selectedReceipt?.id === r.id ? 'active' : ''}" data-id="${r.id}">
      <div class="receipt-card-top"><strong>${r.customer}</strong><strong>${money(r.amount)}</strong></div>
      <div class="receipt-card-meta"><span class="badge">${scopeLabel(r.scope)}</span><span>${fmtDate(r.receipt_date)}</span><span>${r.USAF_receipt_types?.name || ''}</span></div>
      <div class="receipt-card-meta"><span>${r.USAF_tours?.tour_name || 'No Tour'}</span><span>${r.is_processed ? 'Processed' : 'Open'}</span></div>
    </button>`).join('') || '<div class="empty-state">No receipts match this filter.</div>';
  document.querySelectorAll('.receipt-select-card').forEach(btn => btn.addEventListener('click', () => selectReceipt(btn.dataset.id)));
}

function selectReceipt(id) {
  selectedReceipt = receiptsCache.find(r => r.id === id);
  if (!selectedReceipt) return;
  renderReceiptCards();
  const r = selectedReceipt;
  receiptDetailWrap.innerHTML = `<div class="receipt-detail">
    <div class="tour-detail-hero"><div><h2>${r.customer}</h2><p>${scopeLabel(r.scope)} | ${fmtDate(r.receipt_date)} | ${r.USAF_tours?.tour_name || 'No Tour'}</p></div><div class="hero-actions"><button class="btn secondary" id="editReceiptBtn">Edit Receipt</button><button class="btn secondary" id="toggleProcessedBtn">${r.is_processed ? 'Mark Open' : 'Mark Processed'}</button></div></div>
    <div class="tour-metrics"><div class="metric-mini"><span>Amount</span><strong>${money(r.amount)}</strong></div><div class="metric-mini"><span>Category</span><strong>${scopeLabel(r.scope)}</strong></div><div class="metric-mini"><span>Type</span><strong>${r.USAF_receipt_types?.name || ''}</strong></div><div class="metric-mini"><span>Status</span><strong>${r.is_processed ? 'Processed' : 'Open'}</strong></div></div>
    <div class="card" style="box-shadow:none"><h2>Receipt Details</h2><p><strong>Tour:</strong> ${r.USAF_tours?.tour_name || ''}</p><p><strong>Cycle:</strong> ${r.USAF_cycles ? `${fmtDate(r.USAF_cycles.start_date)} - ${fmtDate(r.USAF_cycles.end_date)}` : 'Not required'}</p><p><strong>File:</strong> ${r.file_name || 'No file uploaded'}</p><p><strong>Notes:</strong> ${r.notes || ''}</p></div>
  </div>`;
  editReceiptBtn.addEventListener('click', () => openReceiptModal(r));
  toggleProcessedBtn.addEventListener('click', toggleProcessed);
}

function setScope(scope) {
  currentScope = scope;
  receipt_scope.value = scope;
  modePerDiem.classList.toggle('active', scope === 'per_diem');
  modeOther.classList.toggle('active', scope === 'other');
  cycleWrap.classList.toggle('hidden', scope !== 'per_diem');
  if (scope !== 'per_diem') cycle_id.value = '';
  populateReceiptTypes();
  populateCyclesForTour();
}

async function openReceiptModal(receipt = null) {
  receiptForm.reset();
  receipt_id_edit.value = receipt?.id || '';
  receiptModalTitle.textContent = receipt ? 'Edit Receipt' : 'Add Receipt';
  saveReceiptBtn.textContent = receipt ? 'Update Receipt' : 'Save Receipt';
  setScope(receipt?.scope || 'per_diem');
  if (receipt) {
    tour_id.value = receipt.tour_id || '';
    customer.value = receipt.customer || '';
    receipt_date.value = receipt.receipt_date || '';
    amount.value = receipt.amount || '';
    notes.value = receipt.notes || '';
    await populateCyclesForTour(receipt.cycle_id || '');
    type_id.value = receipt.type_id || '';
  }
  receiptModal.classList.add('open');
}

function closeReceiptModalFn() { receiptModal.classList.remove('open'); }

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
  const user = await getCurrentUser();
  if (!tour_id.value) return alert('Select a Tour first.');
  if (currentScope === 'per_diem' && !cycle_id.value) return alert('Select a Cycle for Per Diem receipts.');
  if (!type_id.value) return alert('Select a Receipt Type.');
  try {
    const fileData = await uploadFile(user.id, receipt_file.files[0]);
    const payload = { user_id:user.id, tour_id:tour_id.value, scope:currentScope, cycle_id: currentScope === 'per_diem' ? cycle_id.value : null, customer:customer.value.trim(), type_id:type_id.value, receipt_date:receipt_date.value, amount:Number(amount.value), notes:notes.value.trim() || null, ...fileData };
    const id = receipt_id_edit.value;
    const result = id ? await window.usafSupabase.from('USAF_receipts').update(payload).eq('id', id) : await window.usafSupabase.from('USAF_receipts').insert(payload);
    if (result.error) throw result.error;
    closeReceiptModalFn();
    await loadReceipts();
  } catch(err) { alert(err.message); }
}

async function toggleProcessed() {
  if (!selectedReceipt) return;
  const user = await getCurrentUser();
  const processed = !selectedReceipt.is_processed;
  const payload = { is_processed: processed, processed_at: processed ? new Date().toISOString() : null, processed_by: processed ? user.id : null };
  const { error } = await window.usafSupabase.from('USAF_receipts').update(payload).eq('id', selectedReceipt.id);
  if (error) return alert(error.message);
  await loadReceipts();
}

initReceipts();
