let toursCache = [];
let selectedTour = null;
let openReceipts = [];
let packagesCache = [];

function activeStatus(status) { return status === 'active' || status === 'planned'; }
function receiptScopeLabel(scope) { return scope === 'per_diem' ? 'Per Diem' : 'Other'; }
function fileIcon(r) { return r.file_path ? '📎 ' : ''; }
function sumRows(rows) { return rows.reduce((sum, r) => sum + Number(r.amount || 0), 0); }

async function initVoucherPackages() {
  await renderLayout('Voucher Packages');
  bindVoucherEvents();
  await loadTours();
}

function bindVoucherEvents() {
  tourStatusFilter.addEventListener('change', renderTourCards);
  closePackageModal.addEventListener('click', () => packageModal.classList.remove('open'));
}

async function loadTours() {
  const { data, error } = await window.usafSupabase.from('USAF_tour_summary').select('*').order('orders_start_date', { ascending:false });
  if (error) { tourCards.innerHTML = `<div class="empty-state">${error.message}</div>`; return; }
  toursCache = data || [];
  await renderTourCards();
}

function filteredTours() {
  const filter = tourStatusFilter.value;
  if (filter === 'all') return toursCache;
  if (filter === 'active') return toursCache.filter(t => activeStatus(t.status));
  return toursCache.filter(t => !activeStatus(t.status));
}

async function getTourOpenCounts(tourId) {
  const { data } = await window.usafSupabase.from('USAF_receipts').select('scope,amount,is_processed').eq('tour_id', tourId).eq('is_processed', false);
  const rows = data || [];
  return {
    perDiem: rows.filter(r => r.scope === 'per_diem').length,
    other: rows.filter(r => r.scope === 'other').length,
    total: rows.length,
    amount: sumRows(rows)
  };
}

async function renderTourCards() {
  const tours = filteredTours();
  if (!tours.length) { tourCards.innerHTML = '<div class="empty-state">No Tours match this filter.</div>'; return; }
  const cards = [];
  for (const t of tours) {
    const counts = await getTourOpenCounts(t.id);
    cards.push(`<button class="voucher-tour-card ${selectedTour?.id === t.id ? 'active' : ''}" data-id="${t.id}">
      <div><strong>${t.tour_name}</strong><small>${fmtDate(t.orders_start_date)} - ${fmtDate(t.orders_end_date)} | ${t.status}</small></div>
      <div class="voucher-counts"><div class="voucher-count-pill"><span>Per Diem Open</span><strong>${counts.perDiem}</strong></div><div class="voucher-count-pill"><span>Other Open</span><strong>${counts.other}</strong></div><div class="voucher-count-pill"><span>Open Total</span><strong>${counts.total}</strong></div></div>
      <small>Open Amount: ${money(counts.amount)}</small>
    </button>`);
  }
  tourCards.innerHTML = cards.join('');
  document.querySelectorAll('.voucher-tour-card').forEach(btn => btn.addEventListener('click', () => selectTour(btn.dataset.id)));
}

async function selectTour(tourId) {
  const { data, error } = await window.usafSupabase.from('USAF_tour_summary').select('*').eq('id', tourId).single();
  if (error) return alert(error.message);
  selectedTour = data;
  await loadOpenReceipts();
  await loadPackages();
  renderWorkspace();
  await renderTourCards();
}

async function loadOpenReceipts() {
  const { data, error } = await window.usafSupabase
    .from('USAF_receipts')
    .select('*, USAF_receipt_types(name)')
    .eq('tour_id', selectedTour.id)
    .eq('is_processed', false)
    .order('receipt_date', { ascending:true });
  if (error) { alert(error.message); openReceipts = []; return; }
  openReceipts = data || [];
}

async function loadPackages() {
  const { data, error } = await window.usafSupabase
    .from('USAF_vouchers')
    .select('*')
    .eq('tour_id', selectedTour.id)
    .order('created_at', { ascending:false });
  if (error) { alert(error.message); packagesCache = []; return; }
  packagesCache = data || [];
}

function renderWorkspace() {
  const per = openReceipts.filter(r => r.scope === 'per_diem');
  const other = openReceipts.filter(r => r.scope === 'other');
  voucherWorkspace.innerHTML = `<div class="voucher-detail">
    <div class="voucher-hero"><div><h2>${selectedTour.tour_name}</h2><p>${fmtDate(selectedTour.orders_start_date)} - ${fmtDate(selectedTour.orders_end_date)} | ${selectedTour.location || 'No location'}</p></div></div>
    <div class="tour-metrics"><div class="metric-mini"><span>Open Per Diem</span><strong>${per.length}</strong></div><div class="metric-mini"><span>Open Other</span><strong>${other.length}</strong></div><div class="metric-mini"><span>Open Total</span><strong>${openReceipts.length}</strong></div><div class="metric-mini"><span>Open Amount</span><strong>${money(sumRows(openReceipts))}</strong></div></div>
    <div class="voucher-builder">
      <div><h2>Create Voucher Package</h2><p class="muted">Choose a date range to preview open receipts before creating the package.</p></div>
      <div class="voucher-date-row"><label>From<input id="voucherFrom" type="date" value="${selectedTour.orders_start_date || ''}"></label><label>To<input id="voucherTo" type="date" value="${selectedTour.orders_end_date || ''}"></label><button class="btn secondary" id="previewBtn">Preview Receipts</button></div>
      <div id="previewArea">${previewReceiptHtml(openReceipts)}</div>
    </div>
    <div class="card" style="box-shadow:none"><h2>Voucher Packages</h2><p class="muted">Previously created voucher packages for this Tour.</p><div class="grid" style="margin-top:12px">${packageHistoryHtml()}</div></div>
  </div>`;
  previewBtn.addEventListener('click', previewByDateRange);
  attachPackageButtons();
}

function previewReceiptHtml(rows) {
  const per = rows.filter(r => r.scope === 'per_diem');
  const other = rows.filter(r => r.scope === 'other');
  if (!rows.length) return '<div class="empty-state">No open receipts found for this Tour/date range.</div>';
  return `<div class="tour-metrics"><div class="metric-mini"><span>Per Diem</span><strong>${per.length}</strong></div><div class="metric-mini"><span>Other</span><strong>${other.length}</strong></div><div class="metric-mini"><span>Total Receipts</span><strong>${rows.length}</strong></div><div class="metric-mini"><span>Total Amount</span><strong>${money(sumRows(rows))}</strong></div></div><div class="voucher-receipt-list" style="margin-top:12px">${rows.map(r => `<div class="voucher-receipt-row"><input type="checkbox" checked data-include-receipt="${r.id}"><div><strong>${fileIcon(r)}${r.customer}</strong><small>${fmtDate(r.receipt_date)} | ${receiptScopeLabel(r.scope)} | ${r.USAF_receipt_types?.name || ''}</small></div><strong>${money(r.amount)}</strong></div>`).join('')}</div><div class="actions" style="margin-top:12px"><button class="btn" id="createPackageBtn">Create Voucher Package</button></div>`;
}

function packageHistoryHtml() {
  if (!packagesCache.length) return '<div class="empty-state">No voucher packages created yet.</div>';
  return packagesCache.map(p => `<div class="voucher-package-card"><div><strong>Package created ${new Date(p.created_at).toLocaleString()}</strong><p class="muted">${fmtDate(p.date_from)} - ${fmtDate(p.date_to)} | ${p.receipt_count} receipts | ${money(p.total_amount)} | ${p.status}</p></div><div class="package-actions"><button class="btn small secondary" data-view-package="${p.id}">View Package</button></div></div>`).join('');
}

function attachPackageButtons() {
  const createBtn = document.getElementById('createPackageBtn');
  if (createBtn) createBtn.addEventListener('click', createPackage);
  document.querySelectorAll('[data-view-package]').forEach(btn => btn.addEventListener('click', () => viewPackage(btn.dataset.viewPackage)));
}

function previewByDateRange() {
  const from = voucherFrom.value;
  const to = voucherTo.value;
  const rows = openReceipts.filter(r => (!from || r.receipt_date >= from) && (!to || r.receipt_date <= to));
  previewArea.innerHTML = previewReceiptHtml(rows);
  attachPackageButtons();
}

async function createPackage() {
  const checked = Array.from(document.querySelectorAll('[data-include-receipt]:checked')).map(cb => cb.dataset.includeReceipt);
  if (!checked.length) return alert('Select at least one receipt to include.');
  const rows = openReceipts.filter(r => checked.includes(r.id));
  const user = await getCurrentUser();
  const payload = { user_id:user.id, tour_id:selectedTour.id, date_from:voucherFrom.value, date_to:voucherTo.value, status:'created', receipt_count:rows.length, total_amount:sumRows(rows), created_by:user.id };
  const { data: voucher, error } = await window.usafSupabase.from('USAF_vouchers').insert(payload).select().single();
  if (error) return alert(error.message);
  const items = rows.map(r => ({ voucher_id:voucher.id, receipt_id:r.id, file_path:r.file_path, amount:r.amount }));
  if (items.length) {
    const { error: itemError } = await window.usafSupabase.from('USAF_voucher_items').insert(items);
    if (itemError) return alert(itemError.message);
    const { error: updateError } = await window.usafSupabase.from('USAF_receipts').update({ is_processed:true, processed_at:new Date().toISOString(), processed_by:user.id }).in('id', checked);
    if (updateError) return alert(updateError.message);
  }
  alert('Voucher package created. Included receipts were marked processed.');
  await selectTour(selectedTour.id);
}

async function viewPackage(packageId) {
  const pkg = packagesCache.find(p => p.id === packageId);
  const { data, error } = await window.usafSupabase
    .from('USAF_voucher_items')
    .select('*, USAF_receipts(customer,receipt_date,scope,file_name,file_path,amount,USAF_receipt_types(name))')
    .eq('voucher_id', packageId);
  if (error) return alert(error.message);
  const rows = data || [];
  packageModalTitle.textContent = 'Voucher Package Details';
  packageModalBody.innerHTML = `<div class="tour-metrics"><div class="metric-mini"><span>Date Range</span><strong>${fmtDate(pkg.date_from)} - ${fmtDate(pkg.date_to)}</strong></div><div class="metric-mini"><span>Receipts</span><strong>${pkg.receipt_count}</strong></div><div class="metric-mini"><span>Total</span><strong>${money(pkg.total_amount)}</strong></div><div class="metric-mini"><span>Status</span><strong>${pkg.status}</strong></div></div><h3 style="margin-top:18px">Included Receipts</h3><div class="voucher-receipt-list">${rows.map(i => receiptItemHtml(i)).join('') || '<div class="receipt-empty">No receipt items found.</div>'}</div><div class="delete-warning">Real ZIP download generation will be added next. This view shows what is included in the package.</div>`;
  packageModal.classList.add('open');
}

function receiptItemHtml(item) {
  const r = item.USAF_receipts;
  return `<div class="voucher-receipt-row"><span>${r?.file_path ? '📎' : ''}</span><div><strong>${r?.customer || ''}</strong><small>${fmtDate(r?.receipt_date)} | ${receiptScopeLabel(r?.scope)} | ${r?.USAF_receipt_types?.name || ''}</small></div><strong>${money(item.amount)}</strong></div>`;
}

initVoucherPackages();
