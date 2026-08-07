async function initTours() {
  await renderLayout('Tours');
  await loadTours();
  document.getElementById('tourForm').addEventListener('submit', saveTour);
}

async function loadTours() {
  const { data, error } = await window.usafSupabase
    .from('USAF_tour_summary')
    .select('*')
    .order('orders_start_date', { ascending: false });

  if (error) {
    document.getElementById('tourRows').innerHTML = `<tr><td colspan="8">${error.message}</td></tr>`;
    return;
  }

  document.getElementById('tourRows').innerHTML = (data || []).map(t => `
    <tr>
      <td><strong>${t.tour_name}</strong><br><span class="muted">${t.location || ''}</span></td>
      <td>${t.orders_number || ''}</td>
      <td>${fmtDate(t.orders_start_date)} - ${fmtDate(t.orders_end_date)}</td>
      <td><span class="badge">${t.status}</span></td>
      <td>${t.cycle_count || 0}</td>
      <td>${money(t.total_per_diem)}</td>
      <td class="spent">${money(t.per_diem_spent)}</td>
      <td class="remaining">${money(t.per_diem_remaining)}</td>
    </tr>`).join('') || '<tr><td colspan="8">No tours yet. Create your first Tour.</td></tr>';
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

  const { error } = await window.usafSupabase.from('USAF_tours').insert(payload);
  if (error) return alert(error.message);
  e.target.reset();
  await loadTours();
}

initTours();
