let selectedTour = null;
let allTours = [];
let currentCycles = [];

async function getToursUser() {
  if (window.USAFEffectiveUser && typeof window.USAFEffectiveUser.getEffectiveUser === 'function') {
    const effectiveUser = await window.USAFEffectiveUser.getEffectiveUser();
    if (effectiveUser && effectiveUser.id) return effectiveUser;
  }
  return await getCurrentUser();
}

function toursReadOnlyView() {
  return !!(window.USAFEffectiveUser && typeof window.USAFEffectiveUser.isViewAsUser === 'function' && window.USAFEffectiveUser.isViewAsUser());
}

function blockReadOnlyView() {
  if (!toursReadOnlyView()) return false;
  alert('Admin View Mode is read-only. Return to Admin View before making changes.');
  return true;
}

async function logAuditEvent(action, moduleName, entityType, entityId, entityName, severity = 'info', details = {}, oldValues = {}, newValues = {}) {
  try {
    if (!window.usafSupabase) return;
    const rpcPayload = {
      p_action: action,
      p_module: moduleName,
      p_entity_type: entityType,
      p_entity_id: entityId ? String(entityId) : null,
      p_entity_name: entityName || null,
      p_severity: severity,
      p_details: details || {},
      p_old_values: oldValues || {},
      p_new_values: newValues || {}
    };
    if (typeof window.usafSupabase.rpc === 'function') {
      const rpcResult = await window.usafSupabase.rpc('log_audit_event', rpcPayload);
      if (!rpcResult.error) return;
      console.warn('Audit RPC failed. Trying direct audit insert.', rpcResult.error);
    }
    let currentUserId = null;
    let actorProfile = null;
    try {
      if (typeof getCurrentUser === 'function') {
        const currentUser = await getCurrentUser();
        currentUserId = currentUser?.id || null;
      }
    } catch (_) {}
    if (currentUserId) {
      const profileResult = await window.usafSupabase
        .from('USAF_profiles')
        .select('display_name,email,role')
        .eq('id', currentUserId)
        .maybeSingle();
      actorProfile = profileResult.data || null;
    }
    const insertResult = await window.usafSupabase.from('USAF_audit_log').insert({
      actor_user_id: currentUserId,
      actor_display_name: actorProfile?.display_name || null,
      actor_email: actorProfile?.email || null,
      actor_role: actorProfile?.role || null,
      action,
      module: moduleName || 'System',
      entity_type: entityType || null,
      entity_id: entityId ? String(entityId) : null,
      entity_name: entityName || null,
      severity: ['info', 'warning', 'critical'].includes(severity) ? severity : 'info',
      details: details || {},
      old_values: oldValues || {},
      new_values: newValues || {},
      user_agent: navigator.userAgent || null
    });
    if (insertResult.error) console.error('Audit direct insert failed', insertResult.error);
  } catch (err) {
    console.error('Audit log write failed', err);
  }
}

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
  newTourBtn.addEventListener('click', () => { if (!blockReadOnlyView()) openTourModal(); });
  if (toursReadOnlyView()) newTourBtn.disabled = true;
  closeTourModal.addEventListener('click', closeTourEditor);
  cancelTourBtn.addEventListener('click', closeTourEditor);
  tourForm.addEventListener('submit', saveTour);
  closeCycleModal.addEventListener('click', closeCycleEditor);
  cancelCycleBtn.addEventListener('click', closeCycleEditor);
  cycleForm.addEventListener('submit', saveCycle);
}

async function loadTours() {
  const toursUser = await getToursUser();
  if (!toursUser || !toursUser.id) {
    tourCards.innerHTML = '<div class="empty-state">Unable to identify the active user.</div>';
    return;
  }
  const { data, error } = await window.usafSupabase
    .from('USAF_tour_summary')
    .select('*')
    .eq('user_id', toursUser.id)
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
    else { selectedTour = null; currentCycles = []; tourDetails.innerHTML = '<div class="empty-state"><h2>Select a Tour</h2><p>Pick an existing Tour from the list, or create a new one. Tour details and cycles will open here.</p></div>'; }
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
  const toursUser = await getToursUser();
  const { data, error } = await window.usafSupabase.from('USAF_tour_summary').select('*').eq('id', tourId).eq('user_id', toursUser.id).single();
  if (error) return alert(error.message);
  selectedTour = data;
  renderTourCards();
  await loadCycles(tourId);
  renderTourDetail();
}

async function loadCycles(tourId) {
  const { data, error } = await window.usafSupabase.from('USAF_cycles').select('*').eq('tour_id', tourId).order('start_date');
  if (error) { alert(error.message); currentCycles = []; return; }
  currentCycles = data || [];
}

function renderTourDetail() {
  const t = selectedTour;
  if (!t) return;
  tourDetailWrap.innerHTML = `<div class="tour-detail">
    <div class="tour-detail-hero">
      <div><h2>${t.tour_name}</h2><p>${t.location || 'No location'} | ${fmtDate(t.orders_start_date)} - ${fmtDate(t.orders_end_date)} | ${t.orders_number || 'No orders number'}</p></div>
      <div class="hero-actions"><button class="btn secondary" id="editTourBtn" ${toursReadOnlyView() ? 'disabled' : ''}>Edit Tour</button><button class="btn secondary" id="toggleTourBtn" ${toursReadOnlyView() ? 'disabled' : ''}>${activeStatus(t.status) ? 'Make Inactive' : 'Make Active'}</button><button class="btn danger" id="deleteTourBtn" ${toursReadOnlyView() ? 'disabled' : ''}>Delete Tour</button></div>
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
  deleteTourBtn.addEventListener('click', deleteTour);
  addCycleBtn.addEventListener('click', () => openCycleModal());
  document.querySelectorAll('[data-edit-cycle]').forEach(btn => btn.addEventListener('click', () => openCycleModal(currentCycles.find(c => c.id === btn.dataset.editCycle))));
  document.querySelectorAll('[data-delete-cycle]').forEach(btn => btn.addEventListener('click', () => deleteCycle(btn.dataset.deleteCycle)));
}

function cycleRowsHtml() {
  if (!currentCycles.length) return '<tr><td colspan="6">No cycles assigned yet.</td></tr>';
  return currentCycles.map(c => {
    const days = ((new Date(c.end_date) - new Date(c.start_date)) / 86400000) + 1;
    const total = days * Number(c.per_diem_per_day || 0);
    return `<tr><td>${fmtDate(c.start_date)} - ${fmtDate(c.end_date)}</td><td>${days}</td><td>${money(c.per_diem_per_day)}</td><td>${money(total)}</td><td><span class="badge">${c.status}</span></td><td class="actions"><button class="btn small secondary" data-edit-cycle="${c.id}">Edit</button><button class="btn small danger" data-delete-cycle="${c.id}">Delete</button></td></tr>`;
  }).join('');
}


function parseLocalDate(value) {
  return new Date(String(value) + 'T00:00:00');
}

function addDays(value, days) {
  const date = parseLocalDate(value);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function modalEscapeHtml(value) {
  return String(value || '').replace(/[&<>\"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '\"':'&quot;', "'":'&#39;' }[c]));
}

function findOverlappingTour(startDate, endDate, currentTourId = '') {
  const start = parseLocalDate(startDate);
  const end = parseLocalDate(endDate);
  return allTours.find(t => {
    if (!t || t.id === currentTourId) return false;
    if (!activeStatus(t.status)) return false;
    const existingStartValue = t.orders_start_date || t.start_date;
    const existingEndValue = t.orders_end_date || t.end_date;
    if (!existingStartValue || !existingEndValue) return false;
    const existingStart = parseLocalDate(existingStartValue);
    const existingEnd = parseLocalDate(existingEndValue);
    return start <= existingEnd && end >= existingStart;
  });
}

function showTourDateConflictMessage(startDate, endDate, conflict) {
  const existingName = conflict?.tour_name || conflict?.location || 'Existing Tour';
  const existingDates = conflict ? `${fmtDate(conflict.orders_start_date)} - ${fmtDate(conflict.orders_end_date)}` : 'an existing Tour';
  const modal = document.createElement('div');
  modal.className = 'modal-backdrop open';
  modal.innerHTML = `<div class="modal-card voucher-ready-modal" role="dialog" aria-modal="true" aria-label="Tour Date Conflict">
    <div class="modal-body">
      <div class="theme-message-icon warning">⚠️</div>
      <h2 class="theme-message-title">Tour Date Conflict</h2>
      <p class="theme-message-text">The selected Tour dates overlap with another Tour already assigned to this account.</p>
      <div class="theme-message-panel">
        <div><strong>Selected Tour Dates:</strong> ${fmtDate(startDate)} - ${fmtDate(endDate)}</div>
        <div><strong>Existing Tour:</strong> ${modalEscapeHtml(existingName)}</div>
        <div><strong>Existing Tour Dates:</strong> ${existingDates}</div>
      </div>
      <p class="theme-message-text">Please choose a date range that does not overlap, or edit the existing Tour if these dates belong with that trip.</p>
      <div class="actions" style="justify-content:flex-end;margin-top:16px">
        <button class="btn" type="button" data-close-tour-conflict>OK</button>
      </div>
    </div>
  </div>`;
  document.body.appendChild(modal);
  modal.querySelector('[data-close-tour-conflict]')?.addEventListener('click', () => modal.remove());
  modal.addEventListener('click', event => { if (event.target === modal) modal.remove(); });
}

function getAvailableCycleRanges(currentCycleId = '') {
  if (!selectedTour?.orders_start_date || !selectedTour?.orders_end_date) return [];
  const ranges = [];
  let cursor = selectedTour.orders_start_date;
  const booked = currentCycles
    .filter(c => c && c.id !== currentCycleId && String(c.status || '').toLowerCase() !== 'cancelled')
    .sort((a, b) => String(a.start_date).localeCompare(String(b.start_date)));
  booked.forEach(cycle => {
    if (cycle.start_date > cursor) ranges.push({ start: cursor, end: addDays(cycle.start_date, -1) });
    if (cycle.end_date >= cursor) cursor = addDays(cycle.end_date, 1);
  });
  if (cursor <= selectedTour.orders_end_date) ranges.push({ start: cursor, end: selectedTour.orders_end_date });
  return ranges.filter(r => r.start <= r.end);
}

function findAvailableCycleRangeForDate(dateValue, currentCycleId = '') {
  return getAvailableCycleRanges(currentCycleId).find(r => dateValue >= r.start && dateValue <= r.end) || null;
}

function buildDateList(startDate, endDate) {
  const dates = [];
  let cursor = startDate;
  while (cursor && endDate && cursor <= endDate) {
    dates.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return dates;
}

function ensureCycleDateSelect(id) {
  const current = document.getElementById(id);
  if (!current || current.tagName === 'SELECT') return current;
  const select = document.createElement('select');
  select.id = current.id;
  select.name = current.name || current.id;
  select.required = current.required;
  select.className = current.className;
  current.replaceWith(select);
  return select;
}

function setSelectOptions(select, dates, selectedValue = '') {
  if (!select) return;
  const uniqueDates = [...new Set(dates.filter(Boolean))].sort();
  select.innerHTML = uniqueDates.map(date => `<option value="${date}">${fmtDate(date)}</option>`).join('');
  if (selectedValue && uniqueDates.includes(selectedValue)) select.value = selectedValue;
  else if (uniqueDates.length) select.value = uniqueDates[0];
}

function setCycleDatePickerLimits(cycle = null) {
  const startSelect = ensureCycleDateSelect('cycle_start_date');
  const endSelect = ensureCycleDateSelect('cycle_end_date');
  const oldHelp = document.getElementById('cycleDateAvailabilityHelp');
  if (oldHelp) oldHelp.remove();

  const currentCycleId = cycle?.id || cycle_id_edit.value || '';
  const ranges = getAvailableCycleRanges(currentCycleId);
  if (!ranges.length) {
    setSelectOptions(startSelect, [], '');
    setSelectOptions(endSelect, [], '');
    return;
  }

  let availableStarts = [];
  ranges.forEach(range => { availableStarts = availableStarts.concat(buildDateList(range.start, range.end)); });
  if (cycle?.start_date && !availableStarts.includes(cycle.start_date)) availableStarts.push(cycle.start_date);
  setSelectOptions(startSelect, availableStarts, cycle?.start_date || startSelect.value);

  const selectedStart = startSelect.value || ranges[0].start;
  const activeRange = findAvailableCycleRangeForDate(selectedStart, currentCycleId) || ranges[0];
  let availableEnds = buildDateList(selectedStart, activeRange.end);
  if (cycle?.end_date && !availableEnds.includes(cycle.end_date)) availableEnds.push(cycle.end_date);
  setSelectOptions(endSelect, availableEnds, cycle?.end_date || endSelect.value);
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
  if (blockReadOnlyView()) return;
  const user = await getCurrentUser();
  const payload = { user_id:user.id, tour_name:tour_name.value.trim(), location:location_name.value.trim() || null, orders_number:orders_number.value.trim() || null, orders_start_date:orders_start_date.value, orders_end_date:orders_end_date.value, status:status.value, notes:notes.value.trim() || null };
  const id = tour_id_edit.value;
  if (payload.orders_end_date < payload.orders_start_date) return alert('Tour End Date cannot be before Tour Start Date.');
  const tourConflict = findOverlappingTour(payload.orders_start_date, payload.orders_end_date, id);
  if (tourConflict) {
    showTourDateConflictMessage(payload.orders_start_date, payload.orders_end_date, tourConflict);
    return;
  }
  const oldTour = id ? (allTours.find(t => t.id === id) || selectedTour || null) : null;
  const result = id ? await window.usafSupabase.from('USAF_tours').update(payload).eq('id', id).select().single() : await window.usafSupabase.from('USAF_tours').insert(payload).select().single();
  if (result.error) {
    if (String(result.error.message || '').toLowerCase().includes('conflicting key value') || String(result.error.message || '').toLowerCase().includes('overlap')) {
      showTourDateConflictMessage(payload.orders_start_date, payload.orders_end_date, null);
      return;
    }
    return alert(result.error.message);
  }
  await logAuditEvent(id ? 'Tour Updated' : 'Tour Created', 'Tours', 'Tour', result.data?.id || id, payload.tour_name, id ? 'warning' : 'info', { location: payload.location, orders_number: payload.orders_number }, oldTour || {}, result.data || payload);
  closeTourEditor();
  await loadTours();
  await selectTour(result.data.id);
}
async function toggleTourActive() {
  if (blockReadOnlyView()) return;
  if (!selectedTour) return;
  const newStatus = activeStatus(selectedTour.status) ? 'cancelled' : 'active';
  const oldTour = { ...selectedTour };
  const { error } = await window.usafSupabase.from('USAF_tours').update({ status:newStatus }).eq('id', selectedTour.id);
  if (error) return alert(error.message);
  await logAuditEvent('Tour Status Changed', 'Tours', 'Tour', selectedTour.id, selectedTour.tour_name, newStatus === 'cancelled' ? 'critical' : 'warning', { old_status: oldTour.status, new_status: newStatus }, oldTour, { ...oldTour, status: newStatus });
  await loadTours();
}

async function deleteTour() {
  if (blockReadOnlyView()) return;
  if (!selectedTour) return;
  if (!confirm(`Delete Tour "${selectedTour.tour_name || 'selected tour'}"? This cannot be undone.`)) return;
  const deletedTour = { ...selectedTour };
  const { error } = await window.usafSupabase.from('USAF_tours').delete().eq('id', selectedTour.id).eq('user_id', selectedTour.user_id || (await getCurrentUser()).id);
  if (error) return alert('Tour delete failed. If this Tour has cycles or receipts, delete or move those records first. Supabase message: ' + error.message);
  await logAuditEvent('Tour Deleted', 'Tours', 'Tour', deletedTour.id, deletedTour.tour_name, 'critical', { reason: 'Deleted from Tours page' }, deletedTour, {});
  selectedTour = null;
  currentCycles = [];
  await loadTours();
  tourDetailWrap.innerHTML = '<div class="tour-detail-empty"><div><h2>Select a Tour</h2><p>Pick an existing Tour from the list, or create a new one. Tour details and cycles will open here.</p></div></div>';
}

function openCycleModal(cycle = null) {
  if (!selectedTour) return alert('Select a Tour first.');
  cycleForm.reset();
  selected_tour_id.value = selectedTour.id;
  cycle_id_edit.value = cycle?.id || '';
  cycleModalTitle.textContent = cycle ? 'Edit Cycle' : 'Add Cycle';
  saveCycleBtn.textContent = cycle ? 'Update Cycle' : 'Save Cycle';
  cycle_start_date.min = selectedTour.orders_start_date || '';
  cycle_start_date.max = selectedTour.orders_end_date || '';
  cycle_end_date.min = selectedTour.orders_start_date || '';
  cycle_end_date.max = selectedTour.orders_end_date || '';
  if (cycle) {
    cycle_start_date.value = cycle.start_date || '';
    cycle_end_date.value = cycle.end_date || '';
    cycle_per_diem_per_day.value = cycle.per_diem_per_day || '';
    cycle_status.value = cycle.status || 'active';
    cycle_notes.value = cycle.notes || '';
  }
  setCycleDatePickerLimits(cycle);
  cycle_start_date.onchange = () => setCycleDatePickerLimits(null);
  cycleModal.classList.add('open');
}
function closeCycleEditor() { cycleModal.classList.remove('open'); }

function showCycleDateConflictMessage(startDate, endDate, conflict) {
  const existingDates = conflict ? `${fmtDate(conflict.start_date)} - ${fmtDate(conflict.end_date)}` : 'an existing cycle';
  const modal = document.createElement('div');
  modal.className = 'modal-backdrop open';
  modal.innerHTML = `<div class="modal-card voucher-ready-modal" role="dialog" aria-modal="true" aria-label="Cycle Date Conflict">
    <div class="modal-body">
      <div class="theme-message-icon warning">⚠️</div>
      <h2 class="theme-message-title">Cycle Date Conflict</h2>
      <p class="theme-message-text">The dates selected for this cycle overlap with another cycle already assigned to this account.</p>
      <div class="theme-message-panel">
        <div><strong>Selected Dates:</strong> ${fmtDate(startDate)} - ${fmtDate(endDate)}</div>
        <div><strong>Existing Cycle:</strong> ${existingDates}</div>
      </div>
      <p class="theme-message-text">Please choose a date range that does not overlap, or edit the existing cycle if these dates should be part of that cycle.</p>
      <div class="actions" style="justify-content:flex-end;margin-top:16px">
        <button class="btn" type="button" data-close-cycle-conflict>OK</button>
      </div>
    </div>
  </div>`;
  document.body.appendChild(modal);
  modal.querySelector('[data-close-cycle-conflict]')?.addEventListener('click', () => modal.remove());
  modal.addEventListener('click', event => { if (event.target === modal) modal.remove(); });
}

function findOverlappingCycle(startDate, endDate, currentCycleId = '') {
  const start = new Date(startDate + 'T00:00:00');
  const end = new Date(endDate + 'T00:00:00');
  return currentCycles.find(c => {
    if (!c || c.id === currentCycleId) return false;
    if (String(c.status || '').toLowerCase() === 'cancelled') return false;
    const existingStart = new Date(c.start_date + 'T00:00:00');
    const existingEnd = new Date(c.end_date + 'T00:00:00');
    return start <= existingEnd && end >= existingStart;
  });
}
async function saveCycle(e) {
  e.preventDefault();
  if (blockReadOnlyView()) return;
  const user = await getCurrentUser();
  if (cycle_start_date.value < selectedTour.orders_start_date || cycle_start_date.value > selectedTour.orders_end_date || cycle_end_date.value < selectedTour.orders_start_date || cycle_end_date.value > selectedTour.orders_end_date) return alert('Cycle dates must be within the selected Tour date range.');
  if (cycle_end_date.value < cycle_start_date.value) return alert('Cycle End Date cannot be before Cycle Start Date.');
  const id = cycle_id_edit.value;
  const conflict = findOverlappingCycle(cycle_start_date.value, cycle_end_date.value, id);
  if (conflict) {
    showCycleDateConflictMessage(cycle_start_date.value, cycle_end_date.value, conflict);
    return;
  }
  const payload = { user_id:user.id, tour_id:selected_tour_id.value, start_date:cycle_start_date.value, end_date:cycle_end_date.value, per_diem_per_day:Number(cycle_per_diem_per_day.value), status:cycle_status.value, notes:cycle_notes.value || null };
  const oldCycle = id ? (currentCycles.find(c => c.id === id) || null) : null;
  const result = id ? await window.usafSupabase.from('USAF_cycles').update(payload).eq('id', id).select().single() : await window.usafSupabase.from('USAF_cycles').insert(payload).select().single();
  if (result.error) {
    if (String(result.error.message || '').includes('USAF_cycles_no_overlap_per_user') || String(result.error.message || '').toLowerCase().includes('conflicting key value')) {
      showCycleDateConflictMessage(cycle_start_date.value, cycle_end_date.value, null);
      return;
    }
    return alert(result.error.message);
  }
  await logAuditEvent(id ? 'Cycle Updated' : 'Cycle Created', 'Tours', 'Cycle', result.data?.id || id, selectedTour?.tour_name || 'Cycle', id ? 'warning' : 'info', { tour_id: selectedTour?.id, tour_name: selectedTour?.tour_name }, oldCycle || {}, result.data || payload);
  closeCycleEditor();
  await selectTour(selectedTour.id);
}
function showCycleDeleteBlockedMessage(cycle, receiptCount) {
  const modal = document.createElement('div');
  modal.className = 'modal-backdrop open';
  modal.innerHTML = `<div class="modal-card voucher-ready-modal" role="dialog" aria-modal="true" aria-label="Cycle Cannot Be Deleted">
    <div class="modal-body">
      <div class="theme-message-icon warning">⚠️</div>
      <h2 class="theme-message-title">Cycle Cannot Be Deleted</h2>
      <p class="theme-message-text">This cycle has receipts assigned to it, so it cannot be deleted yet.</p>
      <div class="theme-message-panel">
        <div><strong>Cycle:</strong> ${fmtDate(cycle.start_date)} - ${fmtDate(cycle.end_date)}</div>
        <div><strong>Assigned Receipts:</strong> ${receiptCount}</div>
      </div>
      <p class="theme-message-text">Move or delete the receipts first, then delete this cycle.</p>
      <div class="actions" style="justify-content:flex-end;margin-top:16px">
        <button class="btn" type="button" data-close-cycle-delete-blocked>OK</button>
      </div>
    </div>
  </div>`;
  document.body.appendChild(modal);
  modal.querySelector('[data-close-cycle-delete-blocked]')?.addEventListener('click', () => modal.remove());
  modal.addEventListener('click', event => { if (event.target === modal) modal.remove(); });
}

function confirmDeleteCycle(cycle) {
  return new Promise(resolve => {
    const modal = document.createElement('div');
    modal.className = 'modal-backdrop open';
    modal.innerHTML = `<div class="modal-card voucher-ready-modal" role="dialog" aria-modal="true" aria-label="Delete Cycle">
      <div class="modal-body">
        <div class="theme-message-icon danger">🗑️</div>
        <h2 class="theme-message-title">Delete Cycle?</h2>
        <p class="theme-message-text">This will permanently delete the selected cycle.</p>
        <div class="theme-message-panel danger">
          <div><strong>Cycle:</strong> ${fmtDate(cycle.start_date)} - ${fmtDate(cycle.end_date)}</div>
          <div><strong>Per Diem / Day:</strong> ${money(cycle.per_diem_per_day)}</div>
        </div>
        <p class="theme-message-text">This action cannot be undone.</p>
        <div class="actions" style="justify-content:flex-end;margin-top:16px">
          <button class="btn secondary" type="button" data-cancel-cycle-delete>Cancel</button>
          <button class="btn danger" type="button" data-confirm-cycle-delete>Delete Cycle</button>
        </div>
      </div>
    </div>`;
    const close = value => { modal.remove(); resolve(value); };
    document.body.appendChild(modal);
    modal.querySelector('[data-cancel-cycle-delete]')?.addEventListener('click', () => close(false));
    modal.querySelector('[data-confirm-cycle-delete]')?.addEventListener('click', () => close(true));
    modal.addEventListener('click', event => { if (event.target === modal) close(false); });
  });
}

async function deleteCycle(id) {
  if (blockReadOnlyView()) return;
  const cycle = currentCycles.find(c => c.id === id);
  if (!cycle) return;
  const user = await getCurrentUser();
  const receiptCheck = await window.usafSupabase
    .from('USAF_receipts')
    .select('id', { count: 'exact', head: true })
    .eq('cycle_id', id)
    .eq('user_id', user.id);
  if (receiptCheck.error) return alert(receiptCheck.error.message);
  if ((receiptCheck.count || 0) > 0) {
    showCycleDeleteBlockedMessage(cycle, receiptCheck.count || 0);
    return;
  }
  const confirmed = await confirmDeleteCycle(cycle);
  if (!confirmed) return;
  const oldCycle = { ...cycle };
  const { error } = await window.usafSupabase.from('USAF_cycles').delete().eq('id', id).eq('user_id', user.id);
  if (error) return alert(error.message);
  await logAuditEvent('Cycle Deleted', 'Tours', 'Cycle', id, selectedTour?.tour_name || 'Cycle', 'critical', { tour_id: selectedTour?.id, tour_name: selectedTour?.tour_name }, oldCycle, {});
  await selectTour(selectedTour.id);
}

initTours();
