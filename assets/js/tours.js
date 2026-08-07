let selectedTour = null;

async function initTours() {
  await renderLayout('Tours');
  await loadTours();
  tourForm.addEventListener('submit', saveTour);
  cycleForm.addEventListener('submit', saveCycleForTour);
  clearTourBtn.addEventListener('click', () => tourForm.reset());
  refreshBtn.addEventListener('click', async () => { await loadTours(); if (selectedTour) await selectTour(selectedTour.id); });
}

async function loadTours() {
  const { data, error } = await window.usafSupabase
    .from('USAF_tour_summary')
    .select('*')
    .order('orders_start_date', { ascending: false });

  if (error) {
    tourCards.innerHTML = `<div class="empty-state">${error.message}</div>`;
    return;
  }

  const tours = data || [];
  tourCards.innerHTML = tours.map(t => `
    <button class="tour-select-card ${selectedTour?.id === t.id ? 'active' : ''}" data-id="${t.id}">
      <div><strong>${t.tour_name}</strong><span>${fmtDate(t.orders_start_date)} - ${fmtDate(t.orders_end_date)}</span></div>
      <div class="tour-card-stats"><span>${t.cycle_count || 0} cycles</span><span>${money(t.per_diem_remaining)} left</span></div>
    </button>`).join('') || '<div class="empty-state">No tours yet. Create your first Tour.</div>';

  document.querySelectorAll('.tour-select-card').forEach(btn => {
    btn.addEventListener('click', () => selectTour(btn.dataset.id));
  });
}

async function selectTour(tourId) {
  const { data, error } = await window.usafSupabase
    .from('USAF_tour_summary')
    .select('*')
    .eq('id', tourId)
    .single();

  if (error) return alert(error.message);
  selectedTour = data;
  selected_tour_id.value = data.id;
  selectedTourTitle.textContent = data.tour_name;
  selectedTourMeta.textContent = `${data.location || 'No location'} | ${fmtDate(data.orders_start_date)} - ${fmtDate(data.orders_end_date)} | Total ${money(data.total_per_diem)} | Remaining ${money(data.per_diem_remaining)}`;
  await loadCyclesForTour(data.id);
  await loadTours();
}

async function loadCyclesForTour(tourId) {
  const { data, error } = await window.usafSupabase
    .from('USAF_cycles')
    .select('*')
    .eq('tour_id', tourId)
    .order('start_date');

  if (error) {
    cycleRows.innerHTML = `<tr><td colspan="5">${error.message}</td></tr>`;
    return;
  }

  cycleRows.innerHTML = (data || []).map(c => {
    const days = ((new Date(c.end_date) - new Date(c.start_date)) / 86400000) + 1;
    const total = days * Number(c.per_diem_per_day || 0);
    return `<tr><td>${fmtDate(c.start_date)} - ${fmtDate(c.end_date)}</td><td>${days}</td><td>${money(c.per_diem_per_day)}</td><td>${money(total)}</td><td><span class="badge">${c.status}</span></td></tr>`;
  }).join('') || '<tr><td colspan="5">No cycles on this Tour yet.</td></tr>';
}

async function saveTour(e) {
  e.preventDefault();
  const user = await getCurrentUser();
  const payload = {
    user_id: user.id,
    tour_name: tour_name.value.trim(),
    location: location_name.value.trim() || null,
    orders_number: orders_number.value.trim() || null,
    orders_start_date: orders_start_date.value,
    orders_end_date: orders_end_date.value,
    status: status.value,
    notes: notes.value.trim() || null
  };
  const { data, error } = await window.usafSupabase.from('USAF_tours').insert(payload).select().single();
  if (error) return alert(error.message);
  e.target.reset();
  await loadTours();
  await selectTour(data.id);
}

async function saveCycleForTour(e) {
  e.preventDefault();
  const user = await getCurrentUser();
  if (!selected_tour_id.value) return alert('Select a Tour first.');

  const payload = {
    user_id: user.id,
    tour_id: selected_tour_id.value,
    start_date: cycle_start_date.value,
    end_date: cycle_end_date.value,
    per_diem_per_day: Number(cycle_per_diem_per_day.value),
    status: cycle_status.value,
    notes: cycle_notes.value || null
  };

  const { error } = await window.usafSupabase.from('USAF_cycles').insert(payload);
  if (error) return alert(error.message);
  cycleForm.reset();
  selected_tour_id.value = selectedTour.id;
  await selectTour(selectedTour.id);
}

initTours();
