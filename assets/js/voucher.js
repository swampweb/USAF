let toursCache = [];
let selectedTour = null;
let availableReceipts = [];
let packagesCache = [];

function activeStatus(status) { return status === 'active' || status === 'planned'; }
function receiptScopeLabel(scope) { return scope === 'per_diem' ? 'Per Diem' : 'Other'; }
function fileIcon(r) { return r && r.file_path ? '📎 ' : ''; }
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

async function getTourAvailableCounts(tourId) {
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
    const counts = await getTourAvailableCounts(t.id);
    cards.push(`<button class="voucher-tour-card ${selectedTour?.id === t.id ? 'active' : ''}" data-id="${t.id}">
      <div><strong>${t.tour_name}</strong><small>${fmtDate(t.orders_start_date)} - ${fmtDate(t.orders_end_date)} | ${t.status}</small></div>
      <div class="voucher-counts"><div class="voucher-count-pill"><span>Available Per Diem</span><strong>${counts.perDiem}</strong></div><div class="voucher-count-pill"><span>Available Other</span><strong>${counts.other}</strong></div><div class="voucher-count-pill"><span>Available Total</span><strong>${counts.total}</strong></div></div>
      <small>Available Amount: ${money(counts.amount)}</small>
    </button>`);
  }
  tourCards.innerHTML = cards.join('');
  document.querySelectorAll('.voucher-tour-card').forEach(btn => btn.addEventListener('click', () => selectTour(btn.dataset.id)));
}

async function selectTour(tourId) {
  const { data, error } = await window.usafSupabase.from('USAF_tour_summary').select('*').eq('id', tourId).single();
  if (error) return alert(error.message);
  selectedTour = data;
  await loadAvailableReceipts();
  await loadPackages();
  renderWorkspace();
  await renderTourCards();
}

async function loadAvailableReceipts() {
  const { data, error } = await window.usafSupabase
    .from('USAF_receipts')
    .select('*, USAF_receipt_types(name)')
    .eq('tour_id', selectedTour.id)
    .eq('is_processed', false)
    .order('receipt_date', { ascending:true });
  if (error) { alert(error.message); availableReceipts = []; return; }
  availableReceipts = data || [];
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
  const per = availableReceipts.filter(r => r.scope === 'per_diem');
  const other = availableReceipts.filter(r => r.scope === 'other');
  voucherWorkspace.innerHTML = `<div class="voucher-detail">
    <div class="voucher-hero"><div><h2>${selectedTour.tour_name}</h2><p>${fmtDate(selectedTour.orders_start_date)} - ${fmtDate(selectedTour.orders_end_date)} | ${selectedTour.location || 'No location'}</p></div></div>
    <div class="tour-metrics"><div class="metric-mini"><span>Available Per Diem</span><strong>${per.length}</strong></div><div class="metric-mini"><span>Available Other</span><strong>${other.length}</strong></div><div class="metric-mini"><span>Available Total</span><strong>${availableReceipts.length}</strong></div><div class="metric-mini"><span>Available Amount</span><strong>${money(sumRows(availableReceipts))}</strong></div></div>
    <div class="voucher-builder">
      <div><h2>Create Voucher Package</h2><p class="muted">Choose a date range to preview available receipts before creating the package.</p></div>
      <div class="voucher-date-row"><label>From<input id="voucherFrom" type="date" value="${selectedTour.orders_start_date || ''}"></label><label>To<input id="voucherTo" type="date" value="${selectedTour.orders_end_date || ''}"></label><button class="btn secondary" id="previewBtn">Preview Receipts</button></div>
      <div id="previewArea">${previewReceiptHtml(availableReceipts)}</div>
    </div>
    <div class="card" style="box-shadow:none"><h2>Voucher Packages</h2><p class="muted">Previously created voucher packages for this Tour. Deleting a package returns included receipts to Available.</p><div class="grid" style="margin-top:12px">${packageHistoryHtml()}</div></div>
  </div>`;
  previewBtn.addEventListener('click', previewByDateRange);
  attachPackageButtons();
}

function previewReceiptHtml(rows) {
  const per = rows.filter(r => r.scope === 'per_diem');
  const other = rows.filter(r => r.scope === 'other');
  if (!rows.length) return '<div class="empty-state">No available receipts found for this Tour/date range.</div>';
  return `<div class="tour-metrics"><div class="metric-mini"><span>Per Diem</span><strong>${per.length}</strong></div><div class="metric-mini"><span>Other</span><strong>${other.length}</strong></div><div class="metric-mini"><span>Total Receipts</span><strong>${rows.length}</strong></div><div class="metric-mini"><span>Total Amount</span><strong>${money(sumRows(rows))}</strong></div></div><div class="voucher-receipt-list" style="margin-top:12px">${rows.map(r => `<div class="voucher-receipt-row"><input type="checkbox" checked data-include-receipt="${r.id}"><div><strong>${fileIcon(r)}${r.customer}</strong><small>${fmtDate(r.receipt_date)} | ${receiptScopeLabel(r.scope)} | ${r.USAF_receipt_types?.name || ''}</small></div><strong>${money(r.amount)}</strong></div>`).join('')}</div><div class="actions" style="margin-top:12px"><button class="btn" id="createPackageBtn">Create Voucher Package</button></div>`;
}

function packageHistoryHtml() {
  if (!packagesCache.length) return '<div class="empty-state">No voucher packages created yet.</div>';
  return packagesCache.map(p => `<div class="voucher-package-card"><div><strong>Package created ${new Date(p.created_at).toLocaleString()}</strong><p class="muted">${fmtDate(p.date_from)} - ${fmtDate(p.date_to)} | ${p.receipt_count} receipts | ${money(p.total_amount)} | ${p.status}</p></div><div class="package-actions"><button class="btn small secondary" data-view-package="${p.id}">View Package</button><button class="btn small success" data-download-package="${p.id}">Download ZIP</button><button class="btn small secondary" data-email-package="${p.id}">Open Email Draft</button><button class="btn small danger" data-delete-package="${p.id}">Delete Package</button></div></div>`).join('');
}

function attachPackageButtons() {
  const createBtn = document.getElementById('createPackageBtn');
  if (createBtn) createBtn.addEventListener('click', createPackage);
  document.querySelectorAll('[data-view-package]').forEach(btn => btn.addEventListener('click', () => viewPackage(btn.dataset.viewPackage)));
  document.querySelectorAll('[data-delete-package]').forEach(btn => btn.addEventListener('click', () => deletePackage(btn.dataset.deletePackage)));
  document.querySelectorAll('[data-download-package]').forEach(btn => btn.addEventListener('click', () => downloadPackageZip(btn.dataset.downloadPackage)));
  document.querySelectorAll('[data-email-package]').forEach(btn => btn.addEventListener('click', () => emailPackage(btn.dataset.emailPackage)));
}

function previewByDateRange() {
  const from = voucherFrom.value;
  const to = voucherTo.value;
  const rows = availableReceipts.filter(r => (!from || r.receipt_date >= from) && (!to || r.receipt_date <= to));
  previewArea.innerHTML = previewReceiptHtml(rows);
  attachPackageButtons();
}

async function createPackage() {
  const checked = Array.from(document.querySelectorAll('[data-include-receipt]:checked')).map(cb => cb.dataset.includeReceipt);
  if (!checked.length) return alert('Select at least one receipt to include.');
  const rows = availableReceipts.filter(r => checked.includes(r.id));
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
  alert('Voucher package created. Included receipts are now assigned to this package and removed from Available.');
  await selectTour(selectedTour.id);
}

async function getPackageItems(packageId) {
  const { data, error } = await window.usafSupabase
    .from('USAF_voucher_items')
    .select('*, USAF_receipts(id,customer,receipt_date,scope,file_name,file_path,amount,USAF_receipt_types(name))')
    .eq('voucher_id', packageId);
  if (error) throw error;
  return data || [];
}

async function viewPackage(packageId) {
  const pkg = packagesCache.find(p => p.id === packageId);
  let rows;
  try { rows = await getPackageItems(packageId); } catch (err) { return alert(err.message); }
  packageModalTitle.textContent = 'Voucher Package Details';
  packageModalBody.innerHTML = `<div class="tour-metrics"><div class="metric-mini"><span>Date Range</span><strong>${fmtDate(pkg.date_from)} - ${fmtDate(pkg.date_to)}</strong></div><div class="metric-mini"><span>Receipts</span><strong>${pkg.receipt_count}</strong></div><div class="metric-mini"><span>Total</span><strong>${money(pkg.total_amount)}</strong></div><div class="metric-mini"><span>Status</span><strong>${pkg.status}</strong></div></div><h3 style="margin-top:18px">Included Receipts</h3><div class="voucher-receipt-list">${rows.map(i => receiptItemHtml(i)).join('') || '<div class="receipt-empty">No receipt items found.</div>'}</div><div class="package-actions" style="margin-top:14px"><button class="btn success" id="modalDownloadPackageBtn">Download ZIP</button><button class="btn secondary" id="modalEmailSummaryBtn">Open Email Draft</button></div><div id="downloadProgress" class="download-progress hidden"></div><div class="package-warning">Removing a receipt from this package returns the receipt to Available. Deleting the package returns all included receipts to Available.</div><div class="summary-note">Open Email Draft opens a draft email with package information. Browser-based email cannot attach the ZIP automatically. Actual email with attachment will need a Supabase Edge Function later.</div>`;
  packageModal.classList.add('open');
  document.querySelectorAll('[data-remove-item]').forEach(btn => btn.addEventListener('click', () => removeReceiptFromPackage(btn.dataset.removeItem, packageId)));
  const modalDownload = document.getElementById('modalDownloadPackageBtn');
  if (modalDownload) modalDownload.addEventListener('click', () => downloadPackageZip(packageId));
  const modalEmail = document.getElementById('modalEmailSummaryBtn');
  if (modalEmail) modalEmail.addEventListener('click', () => emailPackage(packageId));
}

function receiptItemHtml(item) {
  const r = item.USAF_receipts;
  return `<div class="voucher-receipt-row"><span>${r?.file_path ? '📎' : ''}</span><div><strong>${r?.customer || ''}</strong><small>${fmtDate(r?.receipt_date)} | ${receiptScopeLabel(r?.scope)} | ${r?.USAF_receipt_types?.name || ''}</small></div><div class="package-receipt-actions"><strong>${money(item.amount)}</strong><button class="btn small secondary" data-remove-item="${item.id}">Remove</button></div></div>`;
}

async function removeReceiptFromPackage(itemId, packageId) {
  if (!confirm('Remove this receipt from the package and return it to Available?')) return;
  let rows;
  try { rows = await getPackageItems(packageId); } catch (err) { return alert(err.message); }
  const item = rows.find(r => r.id === itemId);
  if (!item) return alert('Package item not found.');
  const receiptId = item.receipt_id;
  const { error: delError } = await window.usafSupabase.from('USAF_voucher_items').delete().eq('id', itemId);
  if (delError) return alert(delError.message);
  const { error: resetError } = await window.usafSupabase.from('USAF_receipts').update({ is_processed:false, processed_at:null, processed_by:null }).eq('id', receiptId);
  if (resetError) return alert(resetError.message);
  await recalcPackage(packageId);
  packageModal.classList.remove('open');
  await selectTour(selectedTour.id);
}

async function recalcPackage(packageId) {
  let rows;
  try { rows = await getPackageItems(packageId); } catch (err) { return alert(err.message); }
  const count = rows.length;
  const total = sumRows(rows.map(r => ({ amount:r.amount })));
  const { error } = await window.usafSupabase.from('USAF_vouchers').update({ receipt_count:count, total_amount:total }).eq('id', packageId);
  if (error) alert(error.message);
}


function showThemedMessage({ title, text, icon = '✅', kind = 'success', details = [], actions = [] }) {
  packageModalTitle.textContent = title;
  const detailHtml = details.length ? `<div class="theme-message-panel ${kind === 'danger' ? 'danger' : ''}">${details.map(d => `<div>${d}</div>`).join('')}</div>` : '';
  const actionHtml = actions.length ? `<div class="actions">${actions.map(a => `<button class="btn ${a.className || ''}" id="${a.id}">${a.label}</button>`).join('')}</div>` : '<div class="actions"><button class="btn secondary" id="themeMessageCloseBtn">Close</button></div>';
  packageModalBody.innerHTML = `<div><div class="theme-message-icon ${kind}">${icon}</div><h2 class="theme-message-title">${title}</h2><p class="theme-message-text">${text}</p>${detailHtml}${actionHtml}</div>`;
  packageModal.classList.add('open');
  const closeBtn = document.getElementById('themeMessageCloseBtn');
  if (closeBtn) closeBtn.addEventListener('click', () => packageModal.classList.remove('open'));
  actions.forEach(a => {
    const btn = document.getElementById(a.id);
    if (btn && a.onClick) btn.addEventListener('click', a.onClick);
  });
}

function showDeletePackageConfirm(packageId, pkg, rowCount) {
  showThemedMessage({
    title: 'Delete Voucher Package?',
    text: 'This will delete the package record and return included receipts back to Available.',
    icon: '🗑️',
    kind: 'danger',
    details: [
      `Date Range: ${fmtDate(pkg.date_from)} - ${fmtDate(pkg.date_to)}`,
      `Receipts Returned: ${rowCount}`,
      `Package Total: ${money(pkg.total_amount)}`
    ],
    actions: [
      { id: 'confirmDeletePackageBtn', label: 'Delete Package', className: 'danger', onClick: () => executeDeletePackage(packageId) },
      { id: 'cancelDeletePackageBtn', label: 'Cancel', className: 'secondary', onClick: () => packageModal.classList.remove('open') }
    ]
  });
}

async function deletePackage(packageId) {
  const pkg = packagesCache.find(p => p.id === packageId);
  if (!pkg) return alert('Package not found.');
  let rows;
  try { rows = await getPackageItems(packageId); } catch (err) { return alert(err.message); }
  showDeletePackageConfirm(packageId, pkg, rows.length);
}

async function executeDeletePackage(packageId) {
  let rows;
  try { rows = await getPackageItems(packageId); } catch (err) { return alert(err.message); }
  const receiptIds = rows.map(r => r.receipt_id).filter(Boolean);
  const { error: itemDeleteError } = await window.usafSupabase.from('USAF_voucher_items').delete().eq('voucher_id', packageId);
  if (itemDeleteError) return alert(itemDeleteError.message);
  if (receiptIds.length) {
    const { error: resetError } = await window.usafSupabase.from('USAF_receipts').update({ is_processed:false, processed_at:null, processed_by:null }).in('id', receiptIds);
    if (resetError) return alert(resetError.message);
  }
  const { error: packageDeleteError } = await window.usafSupabase.from('USAF_vouchers').delete().eq('id', packageId);
  if (packageDeleteError) return alert(packageDeleteError.message);
  await selectTour(selectedTour.id);
  showThemedMessage({
    title: 'Package Deleted',
    text: 'Voucher package deleted successfully. Included receipts are Available again.',
    icon: '✅',
    kind: 'success',
    details: [`Receipts Returned: ${receiptIds.length}`]
  });
}


initVoucherPackages();
