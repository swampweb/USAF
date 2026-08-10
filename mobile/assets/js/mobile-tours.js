// Mobile tours, create/edit/delete tour, cycle counts, and receipt summary v71
// Updates: cleaned receipt count/price display, Cycle-linked receipt summary, and paperclip indicator for attached receipt files.
window.MobileTours = (() => {
  const M = window.MobileShell;
  let toursCache = [];
  let selectedTour = null;

  function hasReceiptFile(r) {
    return Boolean(
      r.receipt_file_url ||
      r.receipt_url ||
      r.file_url ||
      r.attachment_url ||
      r.upload_url ||
      r.receipt_file_path ||
      r.file_path ||
      r.attachment_path ||
      r.storage_path ||
      r.receipt_filename ||
      r.file_name ||
      r.filename ||
      r.original_filename
    );
  }

  function isPerDiemReceipt(r) {
    const scope = String(r.scope || '').toLowerCase();
    const typeName = String(r.USAF_receipt_types?.name || r.receipt_type || '').toLowerCase();
    return scope.includes('per') || typeName.includes('per diem') || typeName.includes('meal') || typeName.includes('grocery');
  }

  function sumReceipts(rows) {
    return rows.reduce((sum, r) => sum + Number(r.amount || 0), 0);
  }

  function receiptSummaryBlock(receipts) {
    const perDiem = receipts.filter(isPerDiemReceipt);
    const other = receipts.filter(r => !isPerDiemReceipt(r));
    const attachedCount = receipts.filter(hasReceiptFile).length;

    return `
      <section class="mobile-section receipt-summary-card">
        <h2>Receipt Summary</h2>
        <div class="mobile-totals-grid">
          <div><span>Per Diem Receipts</span><strong>${perDiem.length} • ${M.money(sumReceipts(perDiem))}</strong></div>
          <div><span>Other Receipts</span><strong>${other.length} • ${M.money(sumReceipts(other))}</strong></div>
          <div><span>All Receipts</span><strong>${receipts.length} • ${M.money(sumReceipts(receipts))}</strong></div>
          <div><span>Files Attached</span><strong>📎 ${attachedCount}</strong></div>
        </div>
      </section>`;
  }

  function receiptRow(r) {
    const c = r.USAF_cycles;
    const typeName = r.USAF_receipt_types?.name || r.receipt_type || r.scope || 'Receipt';
    const fileIcon = hasReceiptFile(r) ? '<span class="mobile-clip" title="Receipt file attached">📎</span>' : '<span class="mobile-muted">No file</span>';
    return `
      <article class="mobile-card compact-receipt-card">
        <div class="mobile-card-row mobile-card-row-top">
          <div>
            <div class="mobile-card-title">${hasReceiptFile(r) ? '📎 ' : ''}${M.esc(r.customer || typeName)}</div>
            <div class="mobile-card-subtitle">${M.esc(typeName)} • ${M.dt(r.receipt_date)}</div>
          </div>
          <div class="mobile-card-amount">${M.money(r.amount)}</div>
        </div>
        <div class="mobile-card-meta">
          <span>Cycle: ${c ? `${M.dt(c.start_date)} - ${M.dt(c.end_date)}` : 'No cycle linked'}</span>
          <span>${fileIcon}</span>
        </div>
      </article>`;
  }

  async function loadTours(){
    let result = await M.supa()
      .from('USAF_tour_summary')
      .select('*')
      .eq('user_id', M.getUser().id)
      .order('orders_start_date', { ascending:false });

    if (result.error) {
      result = await M.supa()
        .from('USAF_tours')
        .select('*')
        .eq('user_id', M.getUser().id)
        .order('orders_start_date', { ascending:false });
    }
    if (result.error) throw result.error;
    toursCache = result.data || [];
    return toursCache;
  }

  async function loadTourReceipts(tourId) {
    const { data, error } = await M.supa()
      .from('USAF_receipts')
      .select('*,USAF_receipt_types(name),USAF_cycles(id,tour_id,start_date,end_date)')
      .eq('user_id', M.getUser().id)
      .eq('USAF_cycles.tour_id', tourId)
      .order('receipt_date', { ascending:false });

    if (error) {
      console.warn('Receipt summary load failed. Continuing without receipts.', error);
      return [];
    }
    return (data || []).filter(r => r.USAF_cycles?.tour_id === tourId);
  }

  async function renderTours(){
    const tours = await loadTours();
    const content = M.getContent();
    content.innerHTML = `
      <section class="mobile-page-head">
        <h1>My Tours</h1>
        <button type="button" id="newTourBtn" class="mobile-primary">+ Tour</button>
      </section>
      <section id="form"></section>
      <section class="mobile-card-list">
        ${tours.length ? tours.map(t => tourCard(t)).join('') : '<p class="mobile-empty">No tours yet.</p>'}
      </section>`;

    document.getElementById('newTourBtn').onclick = () => renderTourForm();
    content.querySelectorAll('[data-open-tour]').forEach(btn => btn.onclick = () => renderTourDetail(tours.find(t => t.id === btn.dataset.openTour)));
    content.querySelectorAll('[data-edit-tour]').forEach(btn => btn.onclick = () => renderTourForm(tours.find(t => t.id === btn.dataset.editTour)));
    content.querySelectorAll('[data-delete-tour]').forEach(btn => btn.onclick = () => deleteTour(btn.dataset.deleteTour));
  }

  function tourCard(t){
    return `
      <article class="mobile-card tour-card">
        <h2>${M.esc(t.tour_name)}</h2>
        <div class="mobile-card-subtitle">${M.esc(t.location || 'No location')}</div>
        <div class="mobile-card-grid">
          <div><span>Orders</span><strong>${M.dt(t.orders_start_date)} - ${M.dt(t.orders_end_date)}</strong></div>
          <div><span>Cycles</span><strong>${t.cycle_count || 0}</strong></div>
        </div>
        <div class="mobile-actions">
          <button type="button" data-open-tour="${M.esc(t.id)}">View</button>
          <button type="button" data-edit-tour="${M.esc(t.id)}">Edit</button>
          <button type="button" data-delete-tour="${M.esc(t.id)}" class="danger">Delete Tour</button>
        </div>
      </article>`;
  }

  function renderTourForm(t = null){
    const formWrap = document.getElementById('form');
    formWrap.innerHTML = `
      <form id="tourForm" class="mobile-form">
        <h2>${t ? 'Edit' : 'New'} Tour</h2>
        <label>Tour Name<input id="tour_name" value="${M.esc(t?.tour_name || '')}" required></label>
        <label>Location<input id="location" value="${M.esc(t?.location || '')}"></label>
        <label>Orders Number<input id="orders_number" value="${M.esc(t?.orders_number || '')}"></label>
        <label>Start Date<input id="orders_start_date" type="date" value="${M.esc(t?.orders_start_date || '')}" required></label>
        <label>End Date<input id="orders_end_date" type="date" value="${M.esc(t?.orders_end_date || '')}" required></label>
        <label>Status<select id="status"><option value="active">Active</option><option value="planned">Planned</option><option value="completed">Completed</option><option value="inactive">Inactive / Cancelled</option></select></label>
        <label>Notes<textarea id="notes">${M.esc(t?.notes || '')}</textarea></label>
        <div class="mobile-actions"><button type="submit" class="mobile-primary">Save Tour</button><button type="button" id="cancelTourBtn">Cancel</button></div>
      </form>`;
    document.getElementById('status').value = t?.status || 'active';
    document.getElementById('cancelTourBtn').onclick = () => formWrap.innerHTML = '';
    document.getElementById('tourForm').onsubmit = e => saveTour(e, t);
    document.getElementById('tourForm').scrollIntoView({ behavior:'smooth', block:'start' });
  }

  async function saveTour(e, existing){
    e.preventDefault();
    const field = id => document.getElementById(id);
    const tourName = field('tour_name');
    const locationField = field('location');
    const ordersNumber = field('orders_number');
    const startField = field('orders_start_date');
    const endField = field('orders_end_date');
    const statusField = field('status');
    const notesField = field('notes');
    const form = field('tourForm');
    const saveButton = form ? form.querySelector('button[type="submit"]') : null;

    if (!tourName || !startField || !endField || !statusField) {
      alert('Tour form error: required fields were not found. Refresh the mobile page and try again.');
      console.error('Tour form missing required field(s).', { tourName, startField, endField, statusField });
      return;
    }

    const start = startField.value;
    const end = endField.value;
    if (start && end && end < start) return alert('Tour End Date cannot be before Tour Start Date.');

    const payload = {
      user_id: M.getUser().id,
      tour_name: tourName.value.trim(),
      location: locationField?.value.trim() || null,
      orders_number: ordersNumber?.value.trim() || null,
      orders_start_date: start,
      orders_end_date: end,
      status: statusField.value,
      notes: notesField?.value.trim() || null
    };

    if (!payload.tour_name) return alert('Tour Name is required.');
    if (!payload.orders_start_date || !payload.orders_end_date) return alert('Tour Start Date and End Date are required.');

    try {
      if (saveButton) {
        saveButton.disabled = true;
        saveButton.textContent = 'Saving Tour...';
      }
      const query = existing
        ? M.supa().from('USAF_tours').update(payload).eq('id', existing.id).eq('user_id', M.getUser().id).select('id').single()
        : M.supa().from('USAF_tours').insert(payload).select('id').single();
      const result = await query;
      if (result.error) {
        console.error('Tour save failed', result.error, payload);
        alert('Tour save failed: ' + result.error.message);
        return;
      }
      selectedTour = null;
      await renderTours();
      alert('Tour saved.');
    } catch (err) {
      console.error('Tour save crashed', err, payload);
      alert('Tour save crashed: ' + (err?.message || err));
    } finally {
      if (saveButton) {
        saveButton.disabled = false;
        saveButton.textContent = 'Save Tour';
      }
    }
  }

  async function deleteTour(id){
    const t = toursCache.find(x => x.id === id);
    if (!confirm(`Delete Tour "${t?.tour_name || 'selected tour'}"? This cannot be undone.`)) return;
    const { error } = await M.supa().from('USAF_tours').delete().eq('id', id).eq('user_id', M.getUser().id);
    if (error) return alert('Tour delete failed. If this Tour has cycles or receipts, delete or move those records first. Supabase message: ' + error.message);
    selectedTour = null;
    await renderTours();
  }

  async function renderTourDetail(t){
    if (!t) return renderTours();
    selectedTour = t;
    const cycles = await window.MobileCycles.loadCycles(t.id);
    const receipts = await loadTourReceipts(t.id);
    const content = M.getContent();

    content.innerHTML = `
      <button type="button" id="backTours" class="mobile-link-button">‹ Back to tours</button>
      <section class="mobile-page-head tour-detail-head">
        <h1>${M.esc(t.tour_name)}</h1>
        <div class="mobile-card-subtitle">${M.esc(t.location || 'No location')}</div>
      </section>
      <section class="mobile-card tour-detail-card">
        <div class="mobile-card-grid">
          <div><span>Orders</span><strong>${M.dt(t.orders_start_date)} - ${M.dt(t.orders_end_date)}</strong></div>
          <div><span>Status</span><strong>${M.esc(t.status || 'active')}</strong></div>
        </div>
        <div class="mobile-actions"><button type="button" id="editTourBtn">Edit Tour</button><button type="button" id="deleteTourBtn" class="danger">Delete Tour</button></div>
      </section>
      ${receiptSummaryBlock(receipts)}
      <section id="form"></section>
      <section class="mobile-section">
        <div class="mobile-section-head"><h2>Cycles</h2><button type="button" id="addCycleBtn" class="mobile-primary">+ Cycle</button></div>
        <div class="mobile-card-list">${cycles.length ? cycles.map(c => window.MobileCycles.cycleCard(c)).join('') : '<p class="mobile-empty">No cycles yet.</p>'}</div>
      </section>
      <section class="mobile-section">
        <h2>Receipts for this Tour</h2>
        <div class="mobile-card-list">${receipts.length ? receipts.map(receiptRow).join('') : '<p class="mobile-empty">No receipts linked to this tour yet.</p>'}</div>
      </section>`;

    document.getElementById('backTours').onclick = renderTours;
    document.getElementById('editTourBtn').onclick = () => renderTourForm(t);
    document.getElementById('deleteTourBtn').onclick = () => deleteTour(t.id);
    document.getElementById('addCycleBtn').onclick = () => window.MobileCycles.renderCycleForm(t);
    content.querySelectorAll('[data-edit-cycle]').forEach(btn => btn.onclick = () => window.MobileCycles.renderCycleForm(t, cycles.find(c => c.id === btn.dataset.editCycle)));
  }

  M.registerPage('tours', renderTours);
  M.registerPage('cycles', renderTours);
  return { loadTours, renderTours, renderTourDetail };
})();
