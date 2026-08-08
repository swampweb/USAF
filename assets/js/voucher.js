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
  document.addEventListener('click', (e) => {
    const createBtn = e.target.closest('#createPackageBtn');
    if (createBtn) {
      e.preventDefault();
      createPackage().catch(err => showVoucherError('Package Creation Failed', err.message || String(err)));
    }
  });
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
  if (error) return showVoucherError('Operation Failed', error.message);
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
  if (error) { showVoucherError('Receipt Load Failed', error.message); availableReceipts = []; return; }
  availableReceipts = data || [];
}

async function loadPackages() {
  const direct = await window.usafSupabase
    .from('USAF_vouchers')
    .select('*')
    .eq('tour_id', selectedTour.id)
    .order('created_at', { ascending:false });
  if (direct.error) { showVoucherError('Package Load Failed', direct.error.message); packagesCache = []; return; }

  const byItem = await window.usafSupabase
    .from('USAF_voucher_items')
    .select('voucher_id, USAF_receipts!inner(tour_id)')
    .eq('USAF_receipts.tour_id', selectedTour.id);

  const directRows = direct.data || [];
  const directIds = new Set(directRows.map(p => p.id));
  const missingIds = [...new Set((byItem.data || []).map(i => i.voucher_id).filter(id => id && !directIds.has(id)))];
  let linkedRows = [];
  if (missingIds.length) {
    const linked = await window.usafSupabase
      .from('USAF_vouchers')
      .select('*')
      .in('id', missingIds)
      .order('created_at', { ascending:false });
    if (!linked.error) linkedRows = linked.data || [];
  }
  packagesCache = [...directRows, ...linkedRows].sort((a,b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
}

function renderWorkspace() {
  const per = availableReceipts.filter(r => r.scope === 'per_diem');
  const other = availableReceipts.filter(r => r.scope === 'other');
  voucherWorkspace.innerHTML = `<div class="voucher-detail">
    <div class="voucher-hero"><div><h2>${selectedTour.tour_name}</h2><p>${fmtDate(selectedTour.orders_start_date)} - ${fmtDate(selectedTour.orders_end_date)} | ${selectedTour.location || 'No location'}</p></div></div>
    <div class="tour-metrics"><div class="metric-mini"><span>Available Per Diem</span><strong>${per.length}</strong></div><div class="metric-mini"><span>Available Other</span><strong>${other.length}</strong></div><div class="metric-mini"><span>Available Total</span><strong>${availableReceipts.length}</strong></div><div class="metric-mini"><span>Available Amount</span><strong>${money(sumRows(availableReceipts))}</strong></div></div>
    <div class="voucher-builder">
      <div><h2>Create Voucher Package</h2><p class="muted">Choose a date range to preview available receipts before creating the package.</p></div>
      <div class="voucher-date-row"><label>From<input id="voucherFrom" type="date" value="${selectedTour.orders_start_date || ''}"></label><label>To<input id="voucherTo" type="date" value="${selectedTour.orders_end_date || ''}"></label><button class="btn secondary" type="button" id="previewBtn">Preview Receipts</button></div>
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
  return `<div class="tour-metrics"><div class="metric-mini"><span>Per Diem</span><strong>${per.length}</strong></div><div class="metric-mini"><span>Other</span><strong>${other.length}</strong></div><div class="metric-mini"><span>Total Receipts</span><strong>${rows.length}</strong></div><div class="metric-mini"><span>Total Amount</span><strong>${money(sumRows(rows))}</strong></div></div><div class="voucher-receipt-list" style="margin-top:12px">${rows.map(r => `<div class="voucher-receipt-row"><input type="checkbox" checked data-include-receipt="${r.id}"><div><strong>${fileIcon(r)}${r.customer}</strong><small>${fmtDate(r.receipt_date)} | ${receiptScopeLabel(r.scope)} | ${r.USAF_receipt_types?.name || ''}</small></div><strong>${money(r.amount)}</strong></div>`).join('')}</div><div class="actions" style="margin-top:12px"><button class="btn" type="button" id="createPackageBtn" data-action="create-package">Create Voucher Package</button></div>`;
}

function packageHistoryHtml() {
  if (!packagesCache.length) return '<div class="empty-state">No voucher packages created yet.</div>';
  return packagesCache.map(p => `<div class="voucher-package-card"><div><strong>Package created ${new Date(p.created_at).toLocaleString()}</strong><p class="muted">${fmtDate(p.date_from)} - ${fmtDate(p.date_to)} | ${p.receipt_count} receipts | ${money(p.total_amount)} | ${p.status}</p></div><div class="package-actions"><button class="btn small secondary" data-view-package="${p.id}">View Package</button><button class="btn small success" data-download-package="${p.id}">Download ZIP</button><button class="btn small secondary" data-email-package="${p.id}">Open Email Draft</button><button class="btn small danger" data-delete-package="${p.id}">Delete Package</button></div></div>`).join('');
}

function attachPackageButtons() {
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


function showCreatePackageConfirm(rows) {
  const total = sumRows(rows);
  showThemedMessage({
    title: 'Create Voucher Package?',
    text: 'The selected receipts will be assigned to a new voucher package and removed from Available.',
    icon: '📦',
    kind: 'warning',
    details: [
      `Date Range: ${fmtDate(voucherFrom.value)} - ${fmtDate(voucherTo.value)}`,
      `Receipts Selected: ${rows.length}`,
      `Total Amount: ${money(total)}`
    ],
    actions: [
      { id: 'confirmCreatePackageBtn', label: 'Create Package', className: '', onClick: () => executeCreatePackage(rows) },
      { id: 'cancelCreatePackageBtn', label: 'Cancel', className: 'secondary', onClick: () => packageModal.classList.remove('open') }
    ]
  });
}

async function createPackage() {
  const checked = Array.from(document.querySelectorAll('[data-include-receipt]:checked')).map(cb => cb.dataset.includeReceipt);
  if (!checked.length) return showVoucherError('No Receipts Selected', 'Select at least one receipt to include in the voucher package.');
  const rows = availableReceipts.filter(r => checked.includes(r.id));
  showCreatePackageConfirm(rows);
}

async function executeCreatePackage(rows) {
  const user = await getCurrentUser();
  const payload = { user_id:user.id, tour_id:selectedTour.id, date_from:voucherFrom.value, date_to:voucherTo.value, status:'created', receipt_count:rows.length, total_amount:sumRows(rows), created_by:user.id };
  const { data: voucher, error } = await window.usafSupabase.from('USAF_vouchers').insert(payload).select().single();
  if (error) return showVoucherError('Package Creation Failed', error.message);
  const items = rows.map(r => ({ voucher_id:voucher.id, receipt_id:r.id, file_path:r.file_path, amount:r.amount }));
  if (items.length) {
    const { error: itemError } = await window.usafSupabase.from('USAF_voucher_items').insert(items);
    if (itemError) return showVoucherError('Package Item Error', itemError.message);
    const { error: updateError } = await window.usafSupabase.from('USAF_receipts').update({ is_processed:true, processed_at:new Date().toISOString(), processed_by:user.id }).in('id', rows.map(r => r.id));
    if (updateError) return showVoucherError('Receipt Update Failed', updateError.message);
  }
  await selectTour(selectedTour.id);
  showThemedMessage({
    title: 'Voucher Package Created',
    text: 'Voucher package created successfully. Selected receipts are now assigned to this package and removed from Available.',
    icon: '✅',
    kind: 'success',
    details: [`Receipts Assigned: ${rows.length}`, `Total Amount: ${money(sumRows(rows))}`],
    actions: [
      { id: 'viewCreatedPackageBtn', label: 'View Package', className: '', onClick: () => viewPackage(voucher.id) },
      { id: 'closeCreatedPackageBtn', label: 'Close', className: 'secondary', onClick: () => packageModal.classList.remove('open') }
    ]
  });
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
  try { rows = await getPackageItems(packageId); } catch (err) { return showVoucherError('Package Load Failed', err.message); }
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
  let rows;
  try { rows = await getPackageItems(packageId); } catch (err) { return showVoucherError('Remove Failed', err.message); }
  const item = rows.find(r => r.id === itemId);
  if (!item) return showVoucherError('Receipt Not Found', 'Package item was not found.');
  showRemoveReceiptConfirm(itemId, packageId, item);
}

async function executeRemoveReceiptFromPackage(itemId, packageId) {
  let rows;
  try { rows = await getPackageItems(packageId); } catch (err) { return showVoucherError('Remove Failed', err.message); }
  const item = rows.find(r => r.id === itemId);
  if (!item) return showVoucherError('Receipt Not Found', 'Package item was not found.');
  const receiptId = item.receipt_id;
  const { error: delError } = await window.usafSupabase.from('USAF_voucher_items').delete().eq('id', itemId);
  if (delError) return showVoucherError('Remove Failed', delError.message);
  const { error: resetError } = await window.usafSupabase.from('USAF_receipts').update({ is_processed:false, processed_at:null, processed_by:null }).eq('id', receiptId);
  if (resetError) return showVoucherError('Receipt Update Failed', resetError.message);
  await recalcPackage(packageId);
  await selectTour(selectedTour.id);
  showThemedMessage({ title: 'Receipt Returned', text: 'The receipt was removed from the package and is now Available again.', icon: '✅', kind: 'success' });
}

async function recalcPackage(packageId) {
  let rows;
  try { rows = await getPackageItems(packageId); } catch (err) { return showVoucherError('Recalculate Failed', err.message); }
  const count = rows.length;
  const total = sumRows(rows.map(r => ({ amount:r.amount })));
  const { error } = await window.usafSupabase.from('USAF_vouchers').update({ receipt_count:count, total_amount:total }).eq('id', packageId);
  if (error) showVoucherError('Recalculate Failed', error.message);
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
  if (!pkg) return showVoucherError('Package Not Found', 'The selected voucher package could not be found.');
  let rows;
  try { rows = await getPackageItems(packageId); } catch (err) { return showVoucherError('Delete Failed', err.message); }
  showDeletePackageConfirm(packageId, pkg, rows.length);
}

async function executeDeletePackage(packageId) {
  let rows;
  try { rows = await getPackageItems(packageId); } catch (err) { return showVoucherError('Delete Failed', err.message); }
  const receiptIds = rows.map(r => r.receipt_id).filter(Boolean);
  const { error: itemDeleteError } = await window.usafSupabase.from('USAF_voucher_items').delete().eq('voucher_id', packageId);
  if (itemDeleteError) return showVoucherError('Delete Failed', itemDeleteError.message);
  if (receiptIds.length) {
    const { error: resetError } = await window.usafSupabase.from('USAF_receipts').update({ is_processed:false, processed_at:null, processed_by:null }).in('id', receiptIds);
    if (resetError) return showVoucherError('Receipt Update Failed', resetError.message);
  }
  const { error: packageDeleteError } = await window.usafSupabase.from('USAF_vouchers').delete().eq('id', packageId);
  if (packageDeleteError) return showVoucherError('Delete Failed', packageDeleteError.message);
  await selectTour(selectedTour.id);
  showThemedMessage({ title: 'Package Deleted', text: 'Voucher package deleted successfully. Included receipts are Available again.', icon: '✅', kind: 'success', details: [`Receipts Returned: ${receiptIds.length}`] });
}


function safeFileName(value) {
  return String(value || 'file').replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^_+|_+$/g, '');
}

function packageBaseName(pkg) {
  const tourName = safeFileName(selectedTour?.tour_name || 'Tour');
  return `${tourName}_${pkg.date_from}_to_${pkg.date_to}_Voucher_Package`;
}

function buildPackageSummary(pkg, rows) {
  const divider = '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
  const shortDivider = '──────────────────────────────────────';
  const per = rows.filter(item => item.USAF_receipts?.scope === 'per_diem');
  const other = rows.filter(item => item.USAF_receipts?.scope === 'other');
  const total = sumRows(rows.map(r => ({ amount: r.amount })));
  const fileName = packageBaseName(pkg) + '.zip';

  const lines = [];
  lines.push('USAF VOUCHER PACKAGE');
  lines.push(divider);
  lines.push('');
  lines.push('TOUR INFORMATION');
  lines.push(shortDivider);
  lines.push(`Tour:           ${selectedTour?.tour_name || ''}`);
  lines.push(`Date Range:     ${fmtDate(pkg.date_from)} - ${fmtDate(pkg.date_to)}`);
  lines.push(`Created:        ${new Date(pkg.created_at).toLocaleString()}`);
  lines.push(`Status:         ${pkg.status || ''}`);
  lines.push('');
  lines.push('PACKAGE SUMMARY');
  lines.push(shortDivider);
  lines.push(`Per Diem:       ${per.length} receipt${per.length === 1 ? '' : 's'}`);
  lines.push(`Other:          ${other.length} receipt${other.length === 1 ? '' : 's'}`);
  lines.push(`Total Receipts: ${rows.length}`);
  lines.push(`Total Amount:   ${money(total)}`);
  lines.push('');
  lines.push('ACTION REQUIRED');
  lines.push(shortDivider);
  lines.push('1. Attach the downloaded ZIP package before sending.');
  lines.push('2. Verify Voucher_Summary.pdf is included in the ZIP.');
  lines.push('3. Confirm all receipt attachments are included.');
  lines.push('');
  lines.push('DOWNLOADED PACKAGE');
  lines.push(shortDivider);
  lines.push(fileName);
  lines.push('');
  lines.push('INCLUDED RECEIPTS');
  lines.push(shortDivider);
  if (!rows.length) {
    lines.push('No receipts were included in this package.');
  } else {
    rows.forEach((item, index) => {
      const r = item.USAF_receipts || {};
      const typeName = r.USAF_receipt_types?.name || '';
      lines.push(`${index + 1}. ${r.customer || 'Receipt'}`);
      lines.push(`   Date:       ${fmtDate(r.receipt_date)}`);
      lines.push(`   Category:   ${receiptScopeLabel(r.scope)}`);
      lines.push(`   Type:       ${typeName}`);
      lines.push(`   Amount:     ${money(item.amount)}`);
      lines.push(`   Attachment: ${r.file_name || 'No attachment uploaded'}`);
      lines.push('');
    });
  }
  lines.push(divider);
  lines.push('Generated by USAF Travel Tracker');
  return lines.join('\n');
}


async function buildPackageSummaryPdf(pkg, rows) {
  if (!window.jspdf || !window.jspdf.jsPDF) {
    throw new Error('PDF library did not load. Refresh the page and try again.');
  }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const margin = 42;
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = 48;

  doc.setFillColor(0, 48, 143);
  doc.rect(0, 0, pageWidth, 78, 'F');
  doc.setTextColor(255,255,255);
  doc.setFontSize(18);
  doc.setFont(undefined, 'bold');
  doc.text('USAF Voucher Package Summary', margin, 38);
  doc.setFontSize(10);
  doc.setFont(undefined, 'normal');
  doc.text('Generated by USAF Travel Tracker', margin, 58);

  y = 108;
  doc.setTextColor(18, 32, 51);
  doc.setFontSize(11);
  function field(label, value) {
    doc.setFont(undefined, 'bold');
    doc.text(label, margin, y);
    doc.setFont(undefined, 'normal');
    doc.text(String(value || ''), margin + 120, y);
    y += 18;
  }

  field('Tour', selectedTour?.tour_name || '');
  field('Date Range', `${fmtDate(pkg.date_from)} to ${fmtDate(pkg.date_to)}`);
  field('Created', new Date(pkg.created_at).toLocaleString());
  field('Status', pkg.status || '');

  const per = rows.filter(item => item.USAF_receipts?.scope === 'per_diem');
  const other = rows.filter(item => item.USAF_receipts?.scope === 'other');
  y += 18;
  doc.setFont(undefined, 'bold');
  doc.setFontSize(13);
  doc.text('Package Summary', margin, y);
  y += 22;
  doc.setFontSize(10);
  doc.setFont(undefined, 'normal');
  doc.text(`Per Diem Receipts: ${per.length}`, margin, y);
  doc.text(`Other Receipts: ${other.length}`, margin + 170, y);
  doc.text(`Total Receipts: ${rows.length}`, margin + 340, y);
  y += 18;
  doc.setFont(undefined, 'bold');
  doc.text(`Total Amount: ${money(sumRows(rows.map(r => ({ amount: r.amount }))))}`, margin, y);

  y += 34;
  doc.setFontSize(13);
  doc.text('Receipt Breakdown', margin, y);
  y += 18;

  const headers = ['Date', 'Category', 'Customer', 'Type', 'Amount', 'Attachment'];
  const widths = [70, 78, 140, 100, 70, 86];
  doc.setFillColor(248, 250, 252);
  doc.rect(margin, y, widths.reduce((a,b)=>a+b,0), 22, 'F');
  doc.setFontSize(8);
  doc.setFont(undefined, 'bold');
  let x = margin;
  headers.forEach((h, i) => { doc.text(h, x + 4, y + 14); x += widths[i]; });
  y += 22;
  doc.setFont(undefined, 'normal');

  rows.forEach((item) => {
    if (y > 720) { doc.addPage(); y = 48; }
    const r = item.USAF_receipts || {};
    const vals = [fmtDate(r.receipt_date), receiptScopeLabel(r.scope), r.customer || '', r.USAF_receipt_types?.name || '', money(item.amount), r.file_name ? 'Yes' : 'No'];
    x = margin;
    vals.forEach((v, i) => {
      const text = String(v).length > 24 ? String(v).slice(0, 23) + '...' : String(v);
      doc.text(text, x + 4, y + 14);
      x += widths[i];
    });
    doc.setDrawColor(238, 242, 247);
    doc.line(margin, y + 20, margin + widths.reduce((a,b)=>a+b,0), y + 20);
    y += 22;
  });

  y += 24;
  if (y > 720) { doc.addPage(); y = 48; }
  doc.setFontSize(9);
  doc.setTextColor(102,112,133);
  doc.text('Verify all supporting documents before DTS upload. Attach this ZIP to email if sending package support.', margin, y);
  return doc.output('blob');
}

function showDownloadReadyModal(packageId, zipName) {
  packageModalTitle.textContent = 'Package Downloaded';
  packageModalBody.innerHTML = `<div class="voucher-ready-modal"><div class="voucher-ready-icon">📦</div><h2 class="voucher-ready-title">Voucher Package Downloaded</h2><p class="voucher-ready-text">Your voucher package ZIP has downloaded successfully. The email draft has been formatted for review. Attach the downloaded ZIP before sending.</p><div class="voucher-ready-steps"><div>1. Click Open Email Draft if you want to send this packet.</div><div>2. Attach the downloaded ZIP file before sending.</div><div>3. Upload the ZIP contents or receipt files to DTS as needed.</div></div><p class="voucher-ready-text"><strong>Downloaded file:</strong> ${zipName}</p><div class="actions"><button class="btn" id="readyEmailBtn">Open Email Draft</button><button class="btn secondary" id="readyCloseBtn">Close</button></div></div>`;
  packageModal.classList.add('open');
  document.getElementById('readyEmailBtn').addEventListener('click', () => emailPackage(packageId));
  document.getElementById('readyCloseBtn').addEventListener('click', () => packageModal.classList.remove('open'));
}

function buildPackageCsv(rows) {
  const header = ['Customer','Date','Scope','Type','Amount','File Name'].join(',');
  const body = rows.map(item => {
    const r = item.USAF_receipts || {};
    const columns = [r.customer || '', fmtDate(r.receipt_date), receiptScopeLabel(r.scope), r.USAF_receipt_types?.name || '', Number(item.amount || 0).toFixed(2), r.file_name || ''];
    return columns.map(v => `"${String(v).replaceAll('"','""')}"`).join(',');
  });
  return [header, ...body].join('\n');
}

function setDownloadProgress(text) {
  const box = document.getElementById('downloadProgress');
  if (!box) return;
  box.classList.remove('hidden');
  box.textContent = text;
}

async function downloadPackageZip(packageId) {
  if (!window.JSZip) return showVoucherError('Download Failed', 'ZIP library did not load. Refresh the page and try again.');
  const pkg = packagesCache.find(p => p.id === packageId);
  if (!pkg) return showVoucherError('Package Not Found', 'The selected voucher package could not be found.');
  let rows;
  try { rows = await getPackageItems(packageId); } catch (err) { return showVoucherError('Package Load Failed', err.message); }
  if (!rows.length) return showVoucherError('No Receipt Items', 'This package has no receipt items.');

  const zip = new JSZip();
  const baseName = packageBaseName(pkg);
  zip.file('Voucher_Summary.pdf', await buildPackageSummaryPdf(pkg, rows));
  zip.file('Voucher_Receipts.csv', buildPackageCsv(rows));
  const receiptFolder = zip.folder('Receipts');
  const bucket = window.USAF_CONFIG.STORAGE_BUCKET || 'usaf-receipts';

  for (let i = 0; i < rows.length; i++) {
    const item = rows[i];
    const r = item.USAF_receipts || {};
    setDownloadProgress(`Adding receipt ${i + 1} of ${rows.length}...`);
    if (!r.file_path) {
      receiptFolder.file(`${String(i + 1).padStart(3,'0')}_${safeFileName(r.customer || 'No_Attachment')}.txt`, 'No attachment was uploaded for this receipt.');
      continue;
    }
    const signed = await window.usafSupabase.storage.from(bucket).createSignedUrl(r.file_path, 300);
    if (signed.error) {
      receiptFolder.file(`${String(i + 1).padStart(3,'0')}_${safeFileName(r.customer || 'Attachment_Error')}.txt`, 'Could not create signed URL: ' + signed.error.message);
      continue;
    }
    const response = await fetch(signed.data.signedUrl);
    if (!response.ok) {
      receiptFolder.file(`${String(i + 1).padStart(3,'0')}_${safeFileName(r.customer || 'Download_Error')}.txt`, 'Could not download attached receipt file.');
      continue;
    }
    const blob = await response.blob();
    const fileName = `${String(i + 1).padStart(3,'0')}_${safeFileName(r.customer || 'Receipt')}_${safeFileName(r.file_name || 'attachment')}`;
    receiptFolder.file(fileName, blob);
  }

  setDownloadProgress('Building ZIP package...');
  const content = await zip.generateAsync({ type: 'blob' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(content);
  link.download = `${baseName}.zip`;
  document.body.appendChild(link);
  link.click();
  URL.revokeObjectURL(link.href);
  link.remove();
  setDownloadProgress('ZIP package downloaded. Next step: click Open Email Draft and attach the downloaded ZIP before sending.');
  showDownloadReadyModal(packageId, `${baseName}.zip`);
}

async function emailPackage(packageId) {
  const pkg = packagesCache.find(p => p.id === packageId);
  if (!pkg) return showThemedMessage({ title: 'Package Not Found', text: 'The selected voucher package could not be found.', icon: '⚠️', kind: 'danger' });
  let rows;
  try {
    rows = await getPackageItems(packageId);
  } catch (err) {
    return showThemedMessage({ title: 'Email Draft Failed', text: err.message || 'Could not build the email draft.', icon: '⚠️', kind: 'danger' });
  }
  const subject = encodeURIComponent('USAF Voucher Package - ' + (selectedTour?.tour_name || 'Tour'));
  const summary = buildPackageSummary(pkg, rows);
  const note = 'IMPORTANT: The voucher ZIP package was downloaded separately. Attach the downloaded ZIP file to this email before sending.';
  const body = encodeURIComponent(summary + '\n\n' + note);
  window.location.href = `mailto:?subject=${subject}&body=${body}`;
}


window.createPackage = createPackage;
initVoucherPackages();
