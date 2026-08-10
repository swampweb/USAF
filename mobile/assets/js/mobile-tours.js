// Mobile tours, create/edit/delete tour, cycles, and receipt summaries v100
window.MobileTours = (() => {
  const M = window.MobileShell;
  let toursCache = [];
  function hasReceiptFile(r) { return Boolean(r.receipt_file_url || r.receipt_url || r.file_url || r.attachment_url || r.receipt_file_path || r.file_path || r.attachment_path || r.storage_path || r.receipt_filename || r.file_name || r.filename || r.original_filename); }
  function isPerDiemReceipt(r) { const scope = String(r.scope || '').toLowerCase(); const typeName = String(r.USAF_receipt_types?.name || r.receipt_type || '').toLowerCase(); return scope.includes('per') || typeName.includes('per diem') || typeName.includes('meal') || typeName.includes('grocery'); }
  function sumReceipts(rows) { return rows.reduce((sum, r) => sum + Number(r.amount || 0), 0); }
  function activeStatus(status){ return ['active','planned'].includes(String(status || '').toLowerCase()); }
  async function loadTours(){
    let result = await M.supa().from('USAF_tour_summary').select('*').eq('user_id', M.getUser().id).order('orders_start_date', { ascending:false });
    if (result.error) result = await M.supa().from('USAF_tours').select('*').eq('user_id', M.getUser().id).order('orders_start_date', { ascending:false });
    if (result.error) throw result.error;
    toursCache = result.data || [];
    return toursCache;
  }
  async function loadTourReceipts(tourId) {
    const { data, error } = await M.supa().from('USAF_receipts').select('*,USAF_receipt_types(name),USAF_cycles(id,tour_id,start_date,end_date)').eq('user_id', M.getUser().id).eq('tour_id', tourId).order('receipt_date', { ascending:false });
    if (error) { console.warn('Receipt summary load failed.', error.message || error); return []; }
    return data || [];
  }
  function tourCard(t){
    return `<article class="data-card mobile-tour-card">
      <div class="card-title-row"><strong>${M.esc(t.tour_name || 'Tour')}</strong><span class="status-pill ${activeStatus(t.status) ? '' : 'inactive'}">${M.esc(t.status || 'active')}</span></div>
      <div class="data-row"><span>Location</span><b>${M.esc(t.location || 'No location')}</b></div>
      <div class="data-row"><span>Orders</span><b>${M.dt(t.orders_start_date)} - ${M.dt(t.orders_end_date)}</b></div>
      <div class="data-row"><span>Cycles</span><b>${t.cycle_count || 0}</b></div>
      <div class="detail-actions three"><button class="btn full" data-open-tour="${M.esc(t.id)}">View</button><button class="btn secondary full" data-edit-tour="${M.esc(t.id)}">Edit</button><button class="btn danger full" data-delete-tour="${M.esc(t.id)}">Delete</button></div>
    </article>`;
  }
  async function renderTours(){
    const tours = await loadTours();
    M.getContent().innerHTML = `<div class="toolbar"><strong>My Tours</strong><button class="btn" id="newTourBtn">+ Tour</button></div><div id="form"></div><div class="card-list">${tours.length ? tours.map(tourCard).join('') : '<div class="empty-card">No tours yet.</div>'}</div>`;
    document.getElementById('newTourBtn').onclick = () => renderTourForm();
    M.getContent().querySelectorAll('[data-open-tour]').forEach(btn => btn.onclick = () => renderTourDetail(tours.find(t => t.id === btn.dataset.openTour)));
    M.getContent().querySelectorAll('[data-edit-tour]').forEach(btn => btn.onclick = () => renderTourForm(tours.find(t => t.id === btn.dataset.editTour)));
    M.getContent().querySelectorAll('[data-delete-tour]').forEach(btn => btn.onclick = () => deleteTour(btn.dataset.deleteTour));
  }
  function renderTourForm(t = null){
    const formWrap = document.getElementById('form') || M.getContent();
    formWrap.innerHTML = `<form class="form-card" id="tourForm">
      <strong>${t ? 'Edit' : 'New'} Tour</strong>
      <label>Tour Name<input id="tour_name" value="${M.esc(t?.tour_name || '')}" required></label>
      <label>Location<input id="location" value="${M.esc(t?.location || '')}"></label>
      <label>Orders Number<input id="orders_number" value="${M.esc(t?.orders_number || '')}"></label>
      <div class="form-two"><label>Start Date<input id="orders_start_date" type="date" value="${M.esc(t?.orders_start_date || '')}" required></label><label>End Date<input id="orders_end_date" type="date" value="${M.esc(t?.orders_end_date || '')}" required></label></div>
      <label>Status<select id="status"><option value="active">Active</option><option value="planned">Planned</option><option value="completed">Completed</option><option value="cancelled">Inactive / Cancelled</option></select></label>
      <label>Notes<textarea id="notes">${M.esc(t?.notes || '')}</textarea></label>
      <button class="btn full" type="submit">Save Tour</button>
      <button class="btn secondary full" type="button" id="cancelTourBtn">Cancel</button>
    </form>`;
    document.getElementById('status').value = t?.status || 'active';
    document.getElementById('cancelTourBtn').onclick = () => formWrap.innerHTML = '';
    document.getElementById('tourForm').onsubmit = e => saveTour(e, t);
    document.getElementById('tourForm').scrollIntoView({ behavior:'smooth', block:'start' });
  }
  async function saveTour(e, existing){
    e.preventDefault();
    const field = id => document.getElementById(id);
    const start = field('orders_start_date')?.value || '';
    const end = field('orders_end_date')?.value || '';
    if (start && end && end < start) return alert('Tour End Date cannot be before Tour Start Date.');
    const payload = { user_id: M.getUser().id, tour_name: field('tour_name').value.trim(), location: field('location')?.value.trim() || null, orders_number: field('orders_number')?.value.trim() || null, orders_start_date: start, orders_end_date: end, status: field('status').value, notes: field('notes')?.value.trim() || null };
    if (!payload.tour_name) return alert('Tour Name is required.');
    if (!payload.orders_start_date || !payload.orders_end_date) return alert('Tour Start Date and End Date are required.');
    const saveButton = document.querySelector('#tourForm button[type="submit"]');
    try {
      if (saveButton) { saveButton.disabled = true; saveButton.textContent = 'Saving Tour...'; }
      const result = existing ? await M.supa().from('USAF_tours').update(payload).eq('id', existing.id).eq('user_id', M.getUser().id).select('id').single() : await M.supa().from('USAF_tours').insert(payload).select('id').single();
      if (result.error) return alert('Tour save failed: ' + result.error.message);
      await renderTours();
      alert('Tour saved.');
    } catch (err) { alert('Tour save crashed: ' + (err?.message || err)); }
    finally { if (saveButton) { saveButton.disabled = false; saveButton.textContent = 'Save Tour'; } }
  }
  async function deleteTour(id){
    const t = toursCache.find(x => x.id === id);
    if (!confirm(`Delete Tour "${t?.tour_name || 'selected tour'}"? This cannot be undone.`)) return;
    const { error } = await M.supa().from('USAF_tours').delete().eq('id', id).eq('user_id', M.getUser().id);
    if (error) return alert('Tour delete failed. If this Tour has cycles or receipts, delete or move those records first. Supabase message: ' + error.message);
    await renderTours();
  }
  function receiptSummaryBlock(receipts) {
    const perDiem = receipts.filter(isPerDiemReceipt);
    const other = receipts.filter(r => !isPerDiemReceipt(r));
    const attachedCount = receipts.filter(hasReceiptFile).length;
    return `<section class="summary-grid compact"><div class="kpi-card"><span>Per Diem</span><strong>${perDiem.length}</strong><small>${M.money(sumReceipts(perDiem))}</small></div><div class="kpi-card"><span>Other</span><strong>${other.length}</strong><small>${M.money(sumReceipts(other))}</small></div><div class="kpi-card"><span>All Receipts</span><strong>${receipts.length}</strong><small>${M.money(sumReceipts(receipts))}</small></div><div class="kpi-card"><span>Files</span><strong>📎 ${attachedCount}</strong><small>Attached</small></div></section>`;
  }
  function receiptRow(r) {
    const c = r.USAF_cycles;
    const typeName = r.USAF_receipt_types?.name || r.receipt_type || r.scope || 'Receipt';
    const fileIcon = hasReceiptFile(r) ? '📎 Attached' : 'No file';
    return `<article class="data-card small-card"><strong>${hasReceiptFile(r) ? '📎 ' : ''}${M.esc(r.customer || typeName)}</strong><span>${M.esc(typeName)} • ${M.dt(r.receipt_date)} • ${M.money(r.amount)}</span><span>Cycle: ${c ? `${M.dt(c.start_date)} - ${M.dt(c.end_date)}` : 'No cycle linked'} • ${fileIcon}</span></article>`;
  }
  async function renderTourDetail(t){
    if (!t) return renderTours();
    const cycles = await window.MobileCycles.loadCycles(t.id);
    const receipts = await loadTourReceipts(t.id);
    M.getContent().innerHTML = `<button class="back-link" id="backTours">‹ Back to tours</button><section class="data-card detail-panel"><div class="card-title-row"><strong>${M.esc(t.tour_name)}</strong><span class="status-pill ${activeStatus(t.status) ? '' : 'inactive'}">${M.esc(t.status || 'active')}</span></div><span>${M.esc(t.location || 'No location')}</span><div class="data-row"><span>Orders</span><b>${M.dt(t.orders_start_date)} - ${M.dt(t.orders_end_date)}</b></div><div class="detail-actions three"><button class="btn secondary full" id="editTourBtn">Edit</button><button class="btn danger full" id="deleteTourBtn">Delete</button><button class="btn full" id="addCycleBtn">+ Cycle</button></div></section><div id="form"></div><div class="section-title">Receipt Summary</div>${receiptSummaryBlock(receipts)}<div class="section-title">Cycles</div><div class="card-list">${cycles.length ? cycles.map(c => window.MobileCycles.cycleCard(c)).join('') : '<div class="empty-card">No cycles yet.</div>'}</div><div class="section-title">Receipts for this Tour</div><div class="card-list">${receipts.length ? receipts.map(receiptRow).join('') : '<div class="empty-card">No receipts linked to this tour yet.</div>'}</div>`;
    document.getElementById('backTours').onclick = renderTours;
    document.getElementById('editTourBtn').onclick = () => renderTourForm(t);
    document.getElementById('deleteTourBtn').onclick = () => deleteTour(t.id);
    document.getElementById('addCycleBtn').onclick = () => window.MobileCycles.renderCycleForm(t);
    M.getContent().querySelectorAll('[data-edit-cycle]').forEach(btn => btn.onclick = () => window.MobileCycles.renderCycleForm(t, cycles.find(c => c.id === btn.dataset.editCycle)));
  }
  M.registerPage('tours', renderTours);
  M.registerPage('cycles', renderTours);
  return { loadTours, renderTours, renderTourDetail };
})();
