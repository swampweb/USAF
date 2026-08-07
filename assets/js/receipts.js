
let toursCache = [];
let selectedTour = null;
let receiptsCache = [];
let typesCache = [];
let cyclesCache = [];
let currentScope = 'per_diem';
let selectedCycle = null;

function activeStatus(status) { return status === 'active' || status === 'planned'; }
function scopeLabel(scope) { return scope === 'per_diem' ? 'Per Diem' : 'Other'; }
function receiptsByScope(scope) { return receiptsCache.filter(r => r.scope === scope); }
function receiptTotal(scope) { return receiptsByScope(scope).reduce((sum, r) => sum + Number(r.amount || 0), 0); }
function daysBetween(start, end) { return ((new Date(end) - new Date(start)) / 86400000) + 1; }
function parseCurrency(value) { return Number(String(value || '').replace(/[^0-9.-]/g, '')) || 0; }
function formatCurrencyInput(value) { const n = parseCurrency(value); return n ? n.toFixed(2) : ''; }

function hasAttachment(r) {
  return !!(r && (r.file_path || r.file_name));
}

function attachmentIcon(r) {
  return hasAttachment(r) ? '<span class="attachment-pill" title="Receipt file attached">📎</span>' : '';
}

async function openAttachmentForReceipt(receiptId) {
  const receipt = receiptsCache.find(r => r.id === receiptId);
  if (!receipt || !receipt.file_path) {
    alert('No receipt file is attached to this record.');
    return;
  }
  const bucket = receipt.file_bucket || window.USAF_CONFIG.STORAGE_BUCKET || 'usaf-receipts';
  const { data, error } = await window.usafSupabase.storage.from(bucket).createSignedUrl(receipt.file_path, 300);
  if (error) {
    alert(error.message);
    return;
  }
  window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
}

function attachmentPanelHtml(receipt) {
  if (!receipt || !hasAttachment(receipt)) return '';
  return `<div><strong>📎 Attached File</strong><span>${receipt.file_name || receipt.file_path}</span></div><div class="attachment-actions"><button class="file-link-btn" type="button" id="viewAttachedFileBtn">View File</button><button class="btn small secondary" type="button" id="replaceFileNoteBtn">Replace by choosing a new file before saving</button></div>`;
}


async function initReceipts() {
  await renderLayout('Receipts');
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
  amount.addEventListener('blur', () => { amount.value = formatCurrencyInput(amount.value); });
  amount.addEventListener('input', () => { amount.value = amount.value.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1'); });
}

async function loadTours() {
  const { data, error } = await window.usafSupabase.from('USAF_tour_summary').select('*').order('orders_start_date', { ascending:false });
  if (error) { tourCards.innerHTML = `<div class="empty-state">${error.message}</div>`; return; }
  toursCache = data || [];
  renderTourCards();
}

function filteredTours() {
  const filter = tourStatusFilter.value;
  if (filter === 'all') return toursCache;
  if (filter === 'active') return toursCache.filter(t => activeStatus(t.status));
  return toursCache.filter(t => !activeStatus(t.status));
}

async function getReceiptCountsForTour(tourId) {
  const { data } = await window.usafSupabase.from('USAF_receipts').select('scope,amount').eq('tour_id', tourId);
  const rows = data || [];
  return { perDiem: rows.filter(r => r.scope === 'per_diem').length, other: rows.filter(r => r.scope === 'other').length, perDiemAmount: rows.filter(r => r.scope === 'per_diem').reduce((sum, r) => sum + Number(r.amount || 0), 0), otherAmount: rows.filter(r => r.scope === 'other').reduce((sum, r) => sum + Number(r.amount || 0), 0) };
}

async function renderTourCards() {
  const tours = filteredTours();
  if (!tours.length) { tourCards.innerHTML = '<div class="empty-state">No Tours match this filter.</div>'; return; }
  const cards = [];
  for (const t of tours) {
    const counts = await getReceiptCountsForTour(t.id);
    cards.push(`<button class="receipt-tour-card ${selectedTour?.id === t.id ? 'active' : ''}" data-id="${t.id}"><div><strong>${t.tour_name}</strong><small>${fmtDate(t.orders_start_date)} - ${fmtDate(t.orders_end_date)} | ${t.status}</small></div><div class="receipt-tour-counts two-counts"><div class="receipt-count-pill"><span>Per Diem</span><strong>${counts.perDiem}</strong></div><div class="receipt-count-pill"><span>Other</span><strong>${counts.other}</strong></div></div><small>Per Diem: ${money(counts.perDiemAmount)} | Other: ${money(counts.otherAmount)}</small></button>`);
  }
  tourCards.innerHTML = cards.join('');
  document.querySelectorAll('.receipt-tour-card').forEach(btn => btn.addEventListener('click', () => selectTour(btn.dataset.id)));
}

async function selectTour(tourId) {
  const { data, error } = await window.usafSupabase.from('USAF_tour_summary').select('*').eq('id', tourId).single();
  if (error) return alert(error.message);
  selectedTour = data;
  await loadTourReceipts(tourId);
  await loadCycles(tourId);
  renderTourReceiptWorkspace();
  await renderTourCards();
}

async function loadTourReceipts(tourId) {
  const { data, error } = await window.usafSupabase.from('USAF_receipts').select('*, USAF_receipt_types(name), USAF_cycles(start_date,end_date)').eq('tour_id', tourId).order('receipt_date', { ascending:false });
  if (error) { alert(error.message); receiptsCache = []; return; }
  receiptsCache = data || [];
}

async function loadTypes() {
  const { data, error } = await window.usafSupabase.from('USAF_receipt_types').select('*').eq('is_active', true).order('sort_order').order('name');
  if (error) return alert(error.message);
  typesCache = data || [];
}

async function loadCycles(tourId) {
  const { data, error } = await window.usafSupabase.from('USAF_cycles').select('*').eq('tour_id', tourId).neq('status','cancelled').order('start_date');
  if (error) { alert(error.message); cyclesCache = []; return; }
  cyclesCache = data || [];
}

function renderTourReceiptWorkspace() {
  const t = selectedTour;
  const perCount = receiptsByScope('per_diem').length;
  const otherCount = receiptsByScope('other').length;
  tourReceiptWrap.innerHTML = `<div class="selected-tour-receipts"><div class="receipt-tour-hero"><div><h2>${t.tour_name}</h2><p>${fmtDate(t.orders_start_date)} - ${fmtDate(t.orders_end_date)} | ${t.location || 'No location'}</p></div><div class="hero-actions"><button class="btn secondary" id="addReceiptBtn">Add Receipt</button></div></div><div class="tour-metrics"><div class="metric-mini"><span>Per Diem Receipts</span><strong>${perCount}</strong></div><div class="metric-mini"><span>Other Receipts</span><strong>${otherCount}</strong></div><div class="metric-mini"><span>Per Diem Total</span><strong>${money(receiptTotal('per_diem'))}</strong></div><div class="metric-mini"><span>Other Total</span><strong>${money(receiptTotal('other'))}</strong></div></div><div class="receipt-section-grid">${receiptSectionHtml('per_diem', 'Per Diem Receipts')}${receiptSectionHtml('other', 'Other Receipts')}</div></div>`;
  addReceiptBtn.addEventListener('click', () => openReceiptModal());
  document.querySelectorAll('[data-edit-receipt]').forEach(btn => btn.addEventListener('click', () => openReceiptModal(receiptsCache.find(r => r.id === btn.dataset.editReceipt))));
  document.querySelectorAll('[data-delete-receipt]').forEach(btn => btn.addEventListener('click', () => deleteReceipt(btn.dataset.deleteReceipt)));
  
}

function receiptSectionHtml(scope, title) {
  const rows = receiptsByScope(scope);
  const body = rows.map(r => `<div class="receipt-row ${hasAttachment(r) ? 'has-attachment' : ''}"><div><strong>${attachmentIcon(r)} ${r.customer}</strong><small>${fmtDate(r.receipt_date)} | ${r.USAF_receipt_types?.name || ''} ${r.USAF_cycles ? '| ' + fmtDate(r.USAF_cycles.start_date) + ' - ' + fmtDate(r.USAF_cycles.end_date) : ''}</small></div><div class="receipt-row-actions receipt-actions-expanded"><strong>${money(r.amount)}</strong><button class="btn small secondary" data-edit-receipt="${r.id}">Edit</button><button class="btn small danger" data-delete-receipt="${r.id}">Delete</button></div></div>`).join('') || '<div class="receipt-empty">No receipts in this category yet.</div>';
  return `<div class="receipt-section"><div class="receipt-section-head"><h3>${title}</h3><span class="badge">${rows.length}</span></div><div class="receipt-row-list">${body}</div></div>`;
}

function setScope(scope) {
  currentScope = scope;
  receipt_scope.value = scope;
  modePerDiem.classList.toggle('active', scope === 'per_diem');
  modeOther.classList.toggle('active', scope === 'other');
  cycleWrap.classList.toggle('hidden', scope !== 'per_diem');
  if (scope !== 'per_diem') {
    selectedCycle = null;
    cycle_id.value = '';
    receipt_date.min = selectedTour?.orders_start_date || '';
    receipt_date.max = selectedTour?.orders_end_date || '';
    dateRangeHelp.textContent = selectedTour ? `Date allowed within Tour: ${fmtDate(selectedTour.orders_start_date)} - ${fmtDate(selectedTour.orders_end_date)}` : '';
  }
  populateReceiptTypes();
  renderCycleCards();
}

function populateReceiptTypes(selectedTypeId = '') {
  const valid = typesCache.filter(t => (t.applies_to || []).includes(currentScope));
  type_id.innerHTML = valid.map(t => `<option value="${t.id}">${t.name}</option>`).join('') || '<option value="">No active types for this category</option>';
  if (selectedTypeId) type_id.value = selectedTypeId;
}

function renderCycleCards(selectedCycleId = '') {
  if (currentScope !== 'per_diem') return;
  if (!cyclesCache.length) {
    cycleCards.innerHTML = '<div class="empty-state">No active cycles are assigned to this Tour. Add a cycle on the Tours page first.</div>';
    cycleDateHelp.textContent = '';
    return;
  }
  if (selectedCycleId) selectedCycle = cyclesCache.find(c => c.id === selectedCycleId) || null;
  cycleCards.innerHTML = cyclesCache.map(c => {
    const days = daysBetween(c.start_date, c.end_date);
    const total = days * Number(c.per_diem_per_day || 0);
    return `<button type="button" class="cycle-pick-card ${selectedCycle?.id === c.id ? 'active' : ''}" data-cycle-id="${c.id}"><strong>${fmtDate(c.start_date)} - ${fmtDate(c.end_date)}</strong><span>${days} days | ${money(c.per_diem_per_day)}/day</span><span class="cycle-total">Total ${money(total)}</span></button>`;
  }).join('');
  document.querySelectorAll('[data-cycle-id]').forEach(btn => btn.addEventListener('click', () => chooseCycle(btn.dataset.cycleId)));
  if (selectedCycle) applyCycleDateLimits();
}

function chooseCycle(cycleId) {
  selectedCycle = cyclesCache.find(c => c.id === cycleId) || null;
  cycle_id.value = selectedCycle?.id || '';
  applyCycleDateLimits();
  renderCycleCards();
}

function applyCycleDateLimits() {
  if (!selectedCycle) return;
  receipt_date.min = selectedCycle.start_date;
  receipt_date.max = selectedCycle.end_date;
  dateRangeHelp.textContent = `Date must be within selected Cycle: ${fmtDate(selectedCycle.start_date)} - ${fmtDate(selectedCycle.end_date)}`;
  cycleDateHelp.textContent = `Selected Cycle limits receipt date to ${fmtDate(selectedCycle.start_date)} - ${fmtDate(selectedCycle.end_date)}.`;
  if (receipt_date.value && (receipt_date.value < selectedCycle.start_date || receipt_date.value > selectedCycle.end_date)) receipt_date.value = '';
}

function openReceiptModal(receipt = null) {
  if (!selectedTour) return alert('Select a Tour first.');
  receiptForm.reset();
  selectedCycle = null;
  receipt_id_edit.value = receipt?.id || '';
  tour_id.value = selectedTour.id;
  receiptModalTitle.textContent = receipt ? 'Edit Receipt' : 'Add Receipt';
  saveReceiptBtn.textContent = receipt ? 'Update Receipt' : 'Save Receipt';
  setScope(receipt?.scope || 'per_diem');
  if (receipt) {
    customer.value = receipt.customer || '';
    receipt_date.value = receipt.receipt_date || '';
    amount.value = Number(receipt.amount || 0).toFixed(2);
    notes.value = receipt.notes || '';
    populateReceiptTypes(receipt.type_id || '');
    renderCycleCards(receipt.cycle_id || '');
  } else {
    amount.value = '';
    receipt_date.min = selectedTour.orders_start_date || '';
    receipt_date.max = selectedTour.orders_end_date || '';
  }
  if (receipt && hasAttachment(receipt)) {
    existingAttachment.classList.remove('hidden');
    existingAttachment.innerHTML = attachmentPanelHtml(receipt);
    const viewBtn = document.getElementById('viewAttachedFileBtn');
    if (viewBtn) viewBtn.addEventListener('click', () => openAttachmentForReceipt(receipt.id));
  } else {
    existingAttachment.classList.add('hidden');
    existingAttachment.innerHTML = '';
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
  if (!selectedTour) return alert('Select a Tour first.');
  if (currentScope === 'per_diem' && !cycle_id.value) return alert('Choose a Cycle for Per Diem receipts.');
  if (!type_id.value) return alert('Select a Receipt Type.');
  const amountValue = parseCurrency(amount.value);
  if (amountValue <= 0) return alert('Enter a valid receipt amount.');
  if (currentScope === 'per_diem' && selectedCycle && (receipt_date.value < selectedCycle.start_date || receipt_date.value > selectedCycle.end_date)) return alert('Receipt date must be within the selected Cycle date range.');
  try {
    const fileData = await uploadFile(user.id, receipt_file.files[0]);
    const payload = { user_id:user.id, tour_id:selectedTour.id, scope:currentScope, cycle_id: currentScope === 'per_diem' ? cycle_id.value : null, customer:customer.value.trim(), type_id:type_id.value, receipt_date:receipt_date.value, amount:amountValue, notes:notes.value.trim() || null, ...fileData };
    const id = receipt_id_edit.value;
    const result = id ? await window.usafSupabase.from('USAF_receipts').update(payload).eq('id', id) : await window.usafSupabase.from('USAF_receipts').insert(payload);
    if (result.error) throw result.error;
    closeReceiptModalFn();
    await selectTour(selectedTour.id);
  } catch (err) { alert(err.message); }
}

async function deleteReceipt(id) {
  const receipt = receiptsCache.find(r => r.id === id);
  if (!receipt) return;
  const details = `${receipt.customer} - ${money(receipt.amount)} - ${fmtDate(receipt.receipt_date)}`;
  const ok = confirm(`Delete this receipt?\n\n${details}\n\nThis will remove the receipt record. The uploaded file may remain in storage until storage cleanup is added.`);
  if (!ok) return;
  const { error } = await window.usafSupabase.from('USAF_receipts').delete().eq('id', id);
  if (error) return alert(error.message);
  await selectTour(selectedTour.id);
}

initReceipts();
