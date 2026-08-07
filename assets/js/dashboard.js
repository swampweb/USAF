async function loadDashboard() {
  await renderLayout('Dashboard');
  const user = await getCurrentUser();
  const today = todayISO();
  await populateTourFilter(user.id, today);
  tourFilter.addEventListener('change', () => loadTourDashboard(tourFilter.value));
  if (tourFilter.value) await loadTourDashboard(tourFilter.value);
}

async function populateTourFilter(userId, today) {
  const { data } = await window.usafSupabase.from('USAF_tour_summary').select('*').eq('user_id', userId).order('orders_start_date', { ascending:false });
  const tours = data || [];
  tourFilter.innerHTML = tours.map(t => `<option value="${t.id}">${t.tour_name} (${fmtDate(t.orders_start_date)} - ${fmtDate(t.orders_end_date)})</option>`).join('');
  const active = tours.find(t => today >= t.orders_start_date && today <= t.orders_end_date) || tours[0];
  if (active) tourFilter.value = active.id;
  if (!active) {
    cycleName.textContent = 'No active tour';
    calendar.innerHTML = '';
    dailySummary.innerHTML = '<tr><td colspan="4">Create a Tour and Cycle first.</td></tr>';
    todayReceipts.innerHTML = '<tr><td colspan="4">No receipts.</td></tr>';
  }
}

async function loadTourDashboard(tourId) {
  const { data: tour } = await window.usafSupabase.from('USAF_tour_summary').select('*').eq('id', tourId).single();
  cycleName.textContent = tour ? tour.tour_name : 'No active tour';
  totalPerDiem.textContent = money(tour?.total_per_diem || 0);
  totalSpent.textContent = money(tour?.per_diem_spent || 0);
  totalRemaining.textContent = money(tour?.per_diem_remaining || 0);
  await renderCalendar(tourId);
  await renderDailySummary(tourId);
  await renderReceipts(tourId, todayISO());
}

async function renderDailySummary(tourId) {
  const { data } = await window.usafSupabase.from('USAF_daily_per_diem_summary').select('*').eq('tour_id', tourId).order('receipt_date');
  dailySummary.innerHTML = (data || []).map(r => `<tr><td>${fmtDate(r.receipt_date)}</td><td>${money(r.per_diem_per_day)}</td><td class="spent">${money(r.spent)}</td><td class="remaining">${money(r.remaining)}</td></tr>`).join('') || '<tr><td colspan="4">No cycle days yet.</td></tr>';
}

async function renderReceipts(tourId, date) {
  const { data } = await window.usafSupabase.from('USAF_receipts').select('*, USAF_receipt_types(name)').eq('tour_id', tourId).eq('scope','per_diem').eq('receipt_date', date).order('created_at');
  todayReceipts.innerHTML = (data || []).map(r => `<tr><td>${r.customer}</td><td>${r.USAF_receipt_types?.name || ''}</td><td>${fmtDate(r.receipt_date)}</td><td>${money(r.amount)}</td></tr>`).join('') || '<tr><td colspan="4">No receipts for today.</td></tr>';
}

async function renderCalendar(tourId) {
  const { data: days } = await window.usafSupabase.from('USAF_daily_per_diem_summary').select('*').eq('tour_id', tourId).order('receipt_date');
  if (!days || !days.length) { calendar.innerHTML = ''; return; }
  const firstDate = days[0].receipt_date;
  const first = new Date(firstDate + 'T12:00:00');
  const startGrid = new Date(first.getFullYear(), first.getMonth(), 1);
  startGrid.setDate(startGrid.getDate() - startGrid.getDay());
  const dayMap = Object.fromEntries(days.map(d => [d.receipt_date, d]));
  const today = todayISO();
  const heads = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => `<div class="cal-head">${d}</div>`).join('');
  let cells = '';
  for (let i=0; i<42; i++) {
    const d = new Date(startGrid);
    d.setDate(startGrid.getDate() + i);
    const iso = d.toISOString().slice(0,10);
    const row = dayMap[iso];
    cells += `<div class="cal-day ${row ? 'in-cycle' : ''} ${iso === today ? 'today' : ''}"><div class="day-num">${d.getDate()}</div>${row ? `<div class="day-meta"><span>Allowance ${money(row.per_diem_per_day)}</span><span class="spent">${money(row.spent)} spent</span><span class="remaining">${money(row.remaining)} left</span></div>` : ''}</div>`;
  }
  calendar.innerHTML = heads + cells;
}
loadDashboard();
