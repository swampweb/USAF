async function initCycles() {
  await renderLayout('Cycles');
  await populateTours();
  await loadCycles();
  document.getElementById('cycleForm').addEventListener('submit', saveCycle);
}

async function populateTours() {
  const { data, error } = await window.usafSupabase
    .from('USAF_tours')
    .select('id,tour_name,orders_start_date,orders_end_date,status')
    .neq('status','cancelled')
    .order('orders_start_date', { ascending: false });

  if (error) return alert(error.message);
  tour_id.innerHTML = '<option value="">Select Tour</option>' + (data || []).map(t => `<option value="${t.id}">${t.tour_name} (${fmtDate(t.orders_start_date)} - ${fmtDate(t.orders_end_date)})</option>`).join('');
}

async function loadCycles() {
  const { data, error } = await window.usafSupabase
    .from('USAF_cycles')
    .select('*, USAF_tours(tour_name)')
    .order('start_date', { ascending: false });

  if (error) {
    cycleRows.innerHTML = `<tr><td colspan="6">${error.message}</td></tr>`;
    return;
  }

  cycleRows.innerHTML = (data || []).map(c => `
    <tr>
      <td>${c.USAF_tours?.tour_name || '<span class="badge warning">No Tour</span>'}</td>
      <td>${fmtDate(c.start_date)}</td>
      <td>${fmtDate(c.end_date)}</td>
      <td>${money(c.per_diem_per_day)}</td>
      <td>${money(((new Date(c.end_date) - new Date(c.start_date)) / 86400000 + 1) * Number(c.per_diem_per_day || 0))}</td>
      <td><span class="badge">${c.status}</span></td>
    </tr>`).join('') || '<tr><td colspan="6">No cycles yet.</td></tr>';
}

async function saveCycle(e) {
  e.preventDefault();
  const user = await getCurrentUser();
  if (!tour_id.value) return alert('Select a Tour first.');
  const payload = {
    user_id: user.id,
    tour_id: tour_id.value,
    start_date: start_date.value,
    end_date: end_date.value,
    per_diem_per_day: Number(per_diem_per_day.value),
    status: status.value,
    notes: notes.value
  };
  const { error } = await window.usafSupabase.from('USAF_cycles').insert(payload);
  if (error) return alert(error.message);
  e.target.reset();
  await loadCycles();
}
initCycles();
