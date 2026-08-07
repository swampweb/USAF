const PAGE_SCOPE = window.PAGE_SCOPE || 'per_diem';

async function initReceipts() {
  await renderLayout(PAGE_SCOPE === 'per_diem' ? 'Per Diem Receipts' : 'Other Receipts');
  await populateTours();
  await populateTypes();
  await loadReceipts();
  document.getElementById('tour_id').addEventListener('change', populateCyclesForTour);
  document.getElementById('receiptForm').addEventListener('submit', saveReceipt);
  if (PAGE_SCOPE === 'other') document.getElementById('cycleWrap').style.display = 'none';
}

async function populateTours() {
  const { data, error } = await window.usafSupabase.from('USAF_tours').select('id,tour_name,orders_start_date,orders_end_date,status').neq('status','cancelled').order('orders_start_date', { ascending:false });
  if (error) return alert(error.message);
  tour_id.innerHTML = '<option value="">Select Tour</option>' + (data || []).map(t => `<option value="${t.id}">${t.tour_name} (${fmtDate(t.orders_start_date)} - ${fmtDate(t.orders_end_date)})</option>`).join('');
}

async function populateCyclesForTour() {
  if (PAGE_SCOPE === 'other') return;
  if (!tour_id.value) { cycle_id.innerHTML = '<option value="">Select Tour first</option>'; return; }
  const { data, error } = await window.usafSupabase.from('USAF_cycles').select('*').eq('tour_id', tour_id.value).neq('status','cancelled').order('start_date');
  if (error) return alert(error.message);
  cycle_id.innerHTML = '<option value="">Select Cycle</option>' + (data || []).map(c => `<option value="${c.id}">${fmtDate(c.start_date)} - ${fmtDate(c.end_date)} (${money(c.per_diem_per_day)}/day)</option>`).join('');
}

async function populateTypes() {
  const { data } = await window.usafSupabase.from('USAF_receipt_types').select('*').eq('is_active', true).order('sort_order');
  type_id.innerHTML = (data || []).map(t => `<option value="${t.id}">${t.name}</option>`).join('');
}

async function loadReceipts() {
  const { data, error } = await window.usafSupabase.from('USAF_receipts').select('*, USAF_receipt_types(name), USAF_tours(tour_name)').eq('scope', PAGE_SCOPE).order('receipt_date', { ascending:false });
  if (error) { receiptRows.innerHTML = `<tr><td colspan="7">${error.message}</td></tr>`; return; }
  receiptRows.innerHTML = (data || []).map(r => `<tr><td>${r.USAF_tours?.tour_name || ''}</td><td>${fmtDate(r.receipt_date)}</td><td>${r.customer}</td><td>${r.USAF_receipt_types?.name || ''}</td><td>${money(r.amount)}</td><td>${r.file_name || ''}</td><td>${r.is_processed ? '<span class="badge success">Processed</span>' : '<span class="badge warning">Open</span>'}</td></tr>`).join('') || '<tr><td colspan="7">No receipts yet.</td></tr>';
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
  const user = await getCurrentUser();
  if (!tour_id.value) return alert('Select a Tour first.');
  if (PAGE_SCOPE === 'per_diem' && !cycle_id.value) return alert('Select a Cycle for Per Diem receipts.');
  try {
    const fileData = await uploadFile(user.id, receipt_file.files[0]);
    const payload = { user_id:user.id, tour_id:tour_id.value, scope:PAGE_SCOPE, cycle_id: PAGE_SCOPE === 'per_diem' ? cycle_id.value : null, customer:customer.value, type_id:type_id.value || null, receipt_date:receipt_date.value, amount:Number(amount.value), notes:notes.value, ...fileData };
    const { error } = await window.usafSupabase.from('USAF_receipts').insert(payload);
    if (error) throw error;
    e.target.reset();
    cycle_id.innerHTML = '<option value="">Select Tour first</option>';
    await loadReceipts();
  } catch(err) { alert(err.message); }
}
initReceipts();
