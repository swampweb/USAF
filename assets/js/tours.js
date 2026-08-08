// Orders & Travel Tracker Tours Privacy Fix v43
// Tours and cycles are filtered to the logged-in user only.
let selectedTour = null;
let allTours = [];
let currentCycles = [];

function activeStatus(status) {
  return status === 'active' || status === 'planned';
}

function filteredTours() {
  const filter = tourFilter.value;
  if (filter === 'all') return allTours;
  if (filter === 'active') return allTours.filter(t => activeStatus(t.status));
  return allTours.filter(t => !activeStatus(t.status));
}

async function initTours() {
  await renderLayout('Tours');
  bindEvents();
  await loadTours();
}

function bindEvents() {
  tourFilter.addEventListener('change', renderTourCards);
  newTourBtn.addEventListener('click', () => openTourModal());
  closeTourModal.addEventListener('click', closeTourEditor);
  cancelTourBtn.addEventListener('click', closeTourEditor);
  tourForm.addEventListener('submit', saveTour);
  closeCycleModal.addEventListener('click', closeCycleEditor);
  cancelCycleBtn.addEventListener('click', closeCycleEditor);
  cycleForm.addEventListener('submit', saveCycle);
}

async function loadTours() {
  const user = await getCurrentUser();
  if (!user) {
    tourCards.innerHTML = '<div class="empty-state">Unable to verify current user. Please sign out and sign back in.</div>';
    return;
  }

  const { data, error } = await window.usafSupabase
    .from('USAF_tour_summary')
    .select('*')
    .eq('user_id', user.id)
    .order('orders_start_date', { ascending: false });
  if (error) {
    tourCards.innerHTML = `<div class="empty-state">${error.message}</div>`;
    return;
  }
  allTours = data || [];
  renderTourCards();
  if (selectedTour) {
    const refreshed = allTours.find(t => t.id === selectedTour.id);
    if (refreshed) await selectTour(refreshed.id);
  }
}

function renderTourCards() {
  const tours = filteredTours();
  tourCards.innerHTML = tours.map(t => {
    const inactive = !activeStatus(t.status);
    return `<button class="tour-select-card ${selectedTour?.id === t.id ? 'active' : ''} ${inactive ? 'inactive' : ''}" data-id="${t.id}">
      <div><strong>${t.tour_name}</strong><span>${fmtDate(t.orders_start_date)} - ${fmtDate(t.orders_end_date)}</span><span class="status-pill ${inactive ? 'inactive' : ''}">${t.status}</span></div>
      <div class="tour-card-stats"><span>${t.cycle_count || 0} cycles</span><span>${money(t.per_diem_remaining)} left</span></div>
    </button>`;
  }).join('') || '<div class="empty-state">No Tours match this filter.</div>';
  document.querySelectorAll('.tour-select-card').forEach(btn => btn.addEventListener('click', () => selectTour(btn.dataset.id)));
}

async function selectTour(tourId) {
  const user = await getCurrentUser();
  if (!user) return alert('Unable to verify current user. Please sign out and sign back in.');

  const { data, error } = await window.usafSupabase
    .from('USAF_tour_summary')
    .select('*')
    .eq('id', tourId)
    .eq('user_id', user.id)
    .single();
  if (error) return alert(error.message);
  selectedTour = data;
  renderTourCards();
  await loadCycles(tourId);
  renderTourDetail();
}

async function loadCycles(tourId) {
  const { data, error } = await window.usafSupabase
    .from('USAF_cycles')
    .select('*')
    .eq('tour_id', tourId)
    .eq('user_id', user.id)
    .order('start_date');
  if (error) { alert(error.message); currentCycles = []; return; }
  currentCycles = data || [];
}

function renderTourDetail() {
  const t = selectedTour;
  if (!t) return;
  tourDetailWrap.innerHTML = `<div class="tour-detail">
    <div class="tour-detail-hero">
      <div><h2>${t.tour_name}</h2><p>${t.location || 'No location'} | ${fmtDate(t.orders_start_date)} - ${fmtDate(t.orders_end_date)} | ${t.orders_number || 'No orders number'}</p></div>
      <div class="hero-actions"><button class="btn secondary" id="editTourBtn">Edit Tour</button><button class="btn secondary" id="toggleTourBtn">${activeStatus(t.status) ? 'Make Inactive' : 'Make Active'}</button></div>
    </div>
    <div class="tour-metrics">
      <div class="metric-mini"><span>Cycles</span><strong>${t.cycle_count || 0}</strong></div>
      <div class="metric-mini"><span>Total Per Diem</span><strong>${money(t.total_per_diem)}</strong></div>
      <div class="metric-mini"><span>Per Diem Spent</span><strong>${money(t.per_diem_spent)}</strong></div>
      <div class="metric-mini"><span>Remaining</span><strong>${money(t.per_diem_remaining)}</strong></div>
    </div>
    <div class="card" style="box-shadow:none">
      <div class="cycle-toolbar"><div><h2>Cycles Assigned to this Tour</h2><p class="muted">Add or edit cycles for the selected Tour.</p></div><button class="btn" id="addCycleBtn">Add Cycle</button></div>
      <div class="table-wrap"><table><thead><tr><th>Dates</th><th>Days</th><th>Per Day</th><th>Total</th><th>Status</th><th>Actions</th></tr></thead><tbody>${cycleRowsHtml()}</tbody></table></div>
    </div>
  </div>`;
  editTourBtn.addEventListener('click', () => openTourModal(t));
  toggleTourBtn.addEventListener('click', toggleTourActive);
  addCycleBtn.addEventListener('click', () => openCycleModal());
  document.querySelectorAll('[data-edit-cycle]').forEach(btn => btn.addEventListener('click', () => openCycleModal(currentCycles.find(c => c.id === btn.dataset.editCycle))));
  document.querySelectorAll('[data-toggle-cycle]').forEach(btn => btn.addEventListener('click', () => toggleCycleActive(btn.dataset.toggleCycle)));
}

function cycleRowsHtml() {
  if (!currentCycles.length) return '<tr><td colspan="6">No cycles assigned yet.</td></tr>';
  return currentCycles.map(c => {
    const days = ((new Date(c.end_date) - new Date(c.start_date)) / 86400000) + 1;
    const total = days * Number(c.per_diem_per_day || 0);
    return `<tr><td>${fmtDate(c.start_date)} - ${fmtDate(c.end_date)}</td><td>${days}</td><td>${money(c.per_diem_per_day)}</td><td>${money(total)}</td><td><span class="badge">${c.status}</span></td><td class="actions"><button class="btn small secondary" data-edit-cycle="${c.id}">Edit</button><button class="btn small ${c.status === 'cancelled' ? 'secondary' : 'danger'}" data-toggle-cycle="${c.id}">${c.status === 'cancelled' ? 'Activate' : 'Inactive'}</button></td></tr>`;
  }).join('');
}

function openTourModal(tour = null) {
  tourForm.reset();
  tour_id_edit.value = tour?.id || '';
  tourModalTitle.textContent = tour ? 'Edit Tour' : 'Create Tour';
  saveTourBtn.textContent = tour ? 'Update Tour' : 'Save Tour';
  if (tour) {
    tour_name.value = tour.tour_name || '';
    location_name.value = tour.location || '';
    orders_number.value = tour.orders_number || '';
    orders_start_date.value = tour.orders_start_date || '';
    orders_end_date.value = tour.orders_end_date || '';
    status.value = tour.status || 'active';
    notes.value = tour.notes || '';
  }
  tourModal.classList.add('open');
}
function closeTourEditor() { tourModal.classList.remove('open'); }
async function saveTour(e) {
  e.preventDefault();
  const user = await getCurrentUser();
  const payload = { user_id:user.id, tour_name:tour_name.value.trim(), location:location_name.value.trim() || null, orders_number:orders_number.value.trim() || null, orders_start_date:orders_start_date.value, orders_end_date:orders_end_date.value, status:status.value, notes:notes.value.trim() || null };
  const id = tour_id_edit.value;
  const result = id
    ? await window.usafSupabase.from('USAF_tours').update(payload).eq('id', id).eq('user_id', user.id).select().single()
    : await window.usafSupabase.from('USAF_tours').insert(payload).select().single();
  if (result.error) return alert(result.error.message);
  closeTourEditor();
  await loadTours();
  await selectTour(result.data.id);
}
async function toggleTourActive() {
  if (!selectedTour) return;
  const newStatus = activeStatus(selectedTour.status) ? 'cancelled' : 'active';
  const user = await getCurrentUser();
  if (!user) return alert('Unable to verify current user. Please sign out and sign back in.');
  const { error } = await window.usafSupabase
    .from('USAF_tours')
    .update({ status:newStatus })
    .eq('id', selectedTour.id)
    .eq('user_id', user.id);
  if (error) return alert(error.message);
  await loadTours();
}

function openCycleModal(cycle = null) {
  if (!selectedTour) return alert('Select a Tour first.');
  cycleForm.reset();
  selected_tour_id.value = selectedTour.id;
  cycle_id_edit.value = cycle?.id || '';
  cycleModalTitle.textContent = cycle ? 'Edit Cycle' : 'Add Cycle';
  saveCycleBtn.textContent = cycle ? 'Update Cycle' : 'Save Cycle';
  if (cycle) {
    cycle_start_date.value = cycle.start_date || '';
    cycle_end_date.value = cycle.end_date || '';
    cycle_per_diem_per_day.value = cycle.per_diem_per_day || '';
    cycle_status.value = cycle.status || 'active';
    cycle_notes.value = cycle.notes || '';
  }
  cycleModal.classList.add('open');
}
function closeCycleEditor() { cycleModal.classList.remove('open'); }
async function saveCycle(e) {
  e.preventDefault();
  const user = await getCurrentUser();
  const payload = { user_id:user.id, tour_id:selected_tour_id.value, start_date:cycle_start_date.value, end_date:cycle_end_date.value, per_diem_per_day:Number(cycle_per_diem_per_day.value), status:cycle_status.value, notes:cycle_notes.value || null };
  const id = cycle_id_edit.value;
  const result = id
    ? await window.usafSupabase.from('USAF_cycles').update(payload).eq('id', id).eq('user_id', user.id)
    : await window.usafSupabase.from('USAF_cycles').insert(payload);
  if (result.error) return alert(result.error.message);
  closeCycleEditor();
  await selectTour(selectedTour.id);
}
async function toggleCycleActive(id) {
  const cycle = currentCycles.find(c => c.id === id);
  if (!cycle) return;
  const newStatus = cycle.status === 'cancelled' ? 'active' : 'cancelled';
  const user = await getCurrentUser();
  if (!user) return alert('Unable to verify current user. Please sign out and sign back in.');
  const { error } = await window.usafSupabase
    .from('USAF_cycles')
    .update({ status:newStatus })
    .eq('id', id)
    .eq('user_id', user.id);
  if (error) return alert(error.message);
  await selectTour(selectedTour.id);
}

initTours();
