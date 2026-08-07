async function loadDashboard() {
  await renderLayout('Dashboard');
  const user = await getCurrentUser();
  const today = todayISO();

  const { data: cycles } = await window.usafSupabase
    .from('USAF_cycle_summary')
    .select('*')
    .eq('user_id', user.id)
    .lte('start_date', today)
    .gte('end_date', today)
    .limit(1);

  const cycle = cycles?.[0];
  document.getElementById('cycleName').textContent = cycle ? `${fmtDate(cycle.start_date)} - ${fmtDate(cycle.end_date)}` : 'No active cycle';
  document.getElementById('totalPerDiem').textContent = money(cycle?.total_per_diem || 0);
  document.getElementById('totalSpent').textContent = money(cycle?.total_spent || 0);
  document.getElementById('totalRemaining').textContent = money(cycle?.total_remaining || 0);

  if (cycle) {
    await renderCalendar(cycle);
    await renderDailySummary(cycle.id);
    await renderReceipts(cycle.id, today);
  }
}

async function renderDailySummary(cycleId) {
  const { data } = await window.usafSupabase.from('USAF_daily_per_diem_summary').select('*').eq('cycle_id', cycleId).order('receipt_date');
  document.getElementById('dailySummary').innerHTML = (data || []).map(r => `<tr><td>${fmtDate(r.receipt_date)}</td><td>${money(r.per_diem_per_day)}</td><td class="spent">${money(r.spent)}</td><td class="remaining">${money(r.remaining)}</td></tr>`).join('');
}

async function renderReceipts(cycleId, date) {
  const { data } = await window.usafSupabase.from('USAF_receipts').select('*, USAF_receipt_types(name)').eq('cycle_id', cycleId).eq('receipt_date', date).order('created_at');
  document.getElementById('todayReceipts').innerHTML = (data || []).map(r => `<tr><td>${r.customer}</td><td>${r.USAF_receipt_types?.name || ''}</td><td>${fmtDate(r.receipt_date)}</td><td>${money(r.amount)}</td></tr>`).join('') || '<tr><td colspan="4">No receipts for today.</td></tr>';
}

async function renderCalendar(cycle) {
  const start = new Date(cycle.start_date + 'T12:00:00');
  const end = new Date(cycle.end_date + 'T12:00:00');
  const first = new Date(start.getFullYear(), start.getMonth(), 1);
  const startGrid = new Date(first);
  startGrid.setDate(first.getDate() - first.getDay());
  const { data: days } = await window.usafSupabase.from('USAF_daily_per_diem_summary').select('*').eq('cycle_id', cycle.id);
  const dayMap = Object.fromEntries((days || []).map(d => [d.receipt_date, d]));
  const today = todayISO();
  const heads = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => `<div class="cal-head">${d}</div>`).join('');
  let cells = '';
  for (let i=0; i<42; i++) {
    const d = new Date(startGrid);
    d.setDate(startGrid.getDate() + i);
    const iso = d.toISOString().slice(0,10);
    const inCycle = iso >= cycle.start_date && iso <= cycle.end_date;
    const row = dayMap[iso];
    cells += `<div class="cal-day ${inCycle ? 'in-cycle' : ''} ${iso === today ? 'today' : ''} ${inCycle && iso > today ? 'future' : ''}">
      <div class="day-num">${d.getDate()}</div>
      ${row ? `<div class="day-meta"><span class="spent">${money(row.spent)} spent</span><span class="remaining">${money(row.remaining)} left</span></div>` : ''}
    </div>`;
  }
  document.getElementById('calendar').innerHTML = heads + cells;
}

loadDashboard();
