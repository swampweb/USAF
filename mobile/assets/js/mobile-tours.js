// Mobile tours, create/edit/delete tour, and cycle counts v70
window.MobileTours = (() => {
  const M = window.MobileShell;
  let toursCache = [];
  let selectedTour = null;

  async function loadTours(){
    let result = await M.supa().from('USAF_tour_summary').select('*').eq('user_id', M.getUser().id).order('orders_start_date', { ascending:false });
    if (result.error) result = await M.supa().from('USAF_tours').select('*').eq('user_id', M.getUser().id).order('orders_start_date', { ascending:false });
    if (result.error) throw result.error;
    toursCache = result.data || [];
    return toursCache;
  }

  async function renderTours(){
    const tours = await loadTours();
    const content = M.getContent();
    content.innerHTML = `<div class="toolbar"><strong>My Tours</strong><button class="btn" id="newTourBtn">+ Tour</button></div>
      <div id="form"></div>
      <div class="card-list">${tours.length ? tours.map(t => tourCard(t)).join('') : '<div class="empty-card">No tours yet.</div>'}</div>`;
    document.getElementById('newTourBtn').onclick = () => renderTourForm();
    content.querySelectorAll('[data-open-tour]').forEach(btn => btn.onclick = () => renderTourDetail(tours.find(t => t.id === btn.dataset.openTour)));
    content.querySelectorAll('[data-edit-tour]').forEach(btn => btn.onclick = () => renderTourForm(tours.find(t => t.id === btn.dataset.editTour)));
    content.querySelectorAll('[data-delete-tour]').forEach(btn => btn.onclick = () => deleteTour(btn.dataset.deleteTour));
  }

  function tourCard(t){
    return `<article class="data-card"><strong>${M.esc(t.tour_name)}</strong><span>${M.esc(t.location || 'No location')}</span>
      <div class="data-row"><span>Orders</span><b>${M.dt(t.orders_start_date)} - ${M.dt(t.orders_end_date)}</b></div>
      <div class="data-row"><span>Cycles</span><b>${t.cycle_count || 0}</b></div>
      <div class="detail-actions"><button class="btn secondary" data-open-tour="${t.id}">View</button><button class="btn secondary" data-edit-tour="${t.id}">Edit</button></div>
      <button class="btn danger full" data-delete-tour="${t.id}">Delete Tour</button>
    </article>`;
  }

  function renderTourForm(t = null){
    const formWrap = document.getElementById('form');
    formWrap.innerHTML = `<form class="form-card" id="tourForm"><strong>${t ? 'Edit' : 'New'} Tour</strong>
      <label>Tour Name<input id="tour_name" required value="${M.esc(t?.tour_name || '')}"></label>
      <label>Location<input id="location" value="${M.esc(t?.location || '')}"></label>
      <label>Orders Number<input id="orders_number" value="${M.esc(t?.orders_number || '')}"></label>
      <label>Start Date<input id="orders_start_date" type="date" required value="${M.esc(t?.orders_start_date || '')}"></label>
      <label>End Date<input id="orders_end_date" type="date" required value="${M.esc(t?.orders_end_date || '')}"></label>
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
    selectedTour = t;
    const cycles = await window.MobileCycles.loadCycles(t.id);
    const content = M.getContent();
    content.innerHTML = `<button class="back-link" id="backTours">‹ Back to tours</button>
      <article class="data-card"><strong>${M.esc(t.tour_name)}</strong><span>${M.esc(t.location || 'No location')}</span>
      <div class="data-row"><span>Orders</span><b>${M.dt(t.orders_start_date)} - ${M.dt(t.orders_end_date)}</b></div>
      <div class="data-row"><span>Status</span><b>${M.esc(t.status || 'active')}</b></div>
      <div class="detail-actions"><button class="btn secondary" id="editTourBtn">Edit Tour</button><button class="btn danger" id="deleteTourBtn">Delete Tour</button></div>
      <button class="btn full" id="addCycleBtn">+ Cycle</button></article>
      <div id="form"></div>
      <div class="section-title">Cycles</div>
      <div class="card-list">${cycles.length ? cycles.map(c => window.MobileCycles.cycleCard(c)).join('') : '<div class="empty-card">No cycles yet.</div>'}</div>`;
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
