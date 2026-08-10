let dashboardDaysCache = [];
let dashboardCurrentTour = null;
let dashboardMonthOffset = 0;
let dashboardSelectedDate = todayISO();

async function loadDashboard() {
  await renderLayout('Dashboard');
  const user = await getDashboardUser();
  const today = todayISO();
  bindDashboardUi();
  await populateTourFilter(user.id, today);
  tourFilter.addEventListener('change', () => loadTourDashboard(tourFilter.value));
  if (tourFilter.value) await loadTourDashboard(tourFilter.value);
}

async function getDashboardUser() {
  if (window.USAFEffectiveUser && typeof window.USAFEffectiveUser.getEffectiveUser === 'function') {
    const effectiveUser = await window.USAFEffectiveUser.getEffectiveUser();
    if (effectiveUser && effectiveUser.id) return effectiveUser;
  }
  return await getCurrentUser();
}

function bindDashboardUi() {
  document.getElementById('dashboardTodayBtn')?.addEventListener('click', () => {
    dashboardMonthOffset = 0;
    dashboardSelectedDate = todayISO();
    renderCalendarFromCache();
  });
  document.getElementById('calendarPrevBtn')?.addEventListener('click', () => {
    dashboardMonthOffset -= 1;
    renderCalendarFromCache();
  });
  document.getElementById('calendarNextBtn')?.addEventListener('click', () => {
    dashboardMonthOffset += 1;
    renderCalendarFromCache();
  });
  document.getElementById('downloadDashboardCsvBtn')?.addEventListener('click', downloadDashboardCsv);
  document.getElementById('viewFullSummaryBtn')?.addEventListener('click', () => {
    document.querySelector('.dashboard-table')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
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
    updateBudgetBar(0, 0, 0);
  }
}

async function loadTourDashboard(tourId) {
  const { data: tour } = await window.usafSupabase.from('USAF_tour_summary').select('*').eq('id', tourId).single();
  dashboardCurrentTour = tour || null;
  dashboardMonthOffset = 0;
  cycleName.textContent = tour ? tour.tour_name : 'No active tour';
  totalPerDiem.textContent = money(tour?.total_per_diem || 0);
  totalSpent.textContent = money(tour?.per_diem_spent || 0);
  totalRemaining.textContent = money(tour?.per_diem_remaining || 0);
  updateBudgetBar(tour?.total_per_diem || 0, tour?.per_diem_spent || 0, tour?.per_diem_remaining || 0);
  await renderCalendar(tourId);
  await renderDailySummary(tourId);
  await renderReceipts(tourId, todayISO());
}

async function renderDailySummary(tourId) {
  const { data } = await window.usafSupabase.from('USAF_daily_per_diem_summary').select('*').eq('tour_id', tourId).order('receipt_date');
  const rows = data || [];
  dashboardDaysCache = rows;
  dailySummary.innerHTML = rows.map(r => `<tr><td>${fmtDate(r.receipt_date)}</td><td>${money(r.per_diem_per_day)}</td><td class="spent">${money(r.spent)}</td><td class="remaining">${money(r.remaining)}</td></tr>`).join('') || '<tr><td colspan="4">No cycle days yet.</td></tr>';
}

async function renderReceipts(tourId, date) {
  const { data } = await window.usafSupabase.from('USAF_receipts').select('*, USAF_receipt_types(name)').eq('tour_id', tourId).eq('scope','per_diem').eq('receipt_date', date).order('created_at');
  if (window.todayReceipts) {
    todayReceipts.innerHTML = (data || []).map(r => `<tr><td>${r.customer || ''}</td><td>${r.USAF_receipt_types?.name || ''}</td><td>${fmtDate(r.receipt_date)}</td><td>${money(r.amount)}</td></tr>`).join('') || '<tr><td colspan="4">No receipts for today.</td></tr>';
  }
}

async function renderCalendar(tourId) {
  const { data: days } = await window.usafSupabase.from('USAF_daily_per_diem_summary').select('*').eq('tour_id', tourId).order('receipt_date');
  dashboardDaysCache = days || [];
  renderCalendarFromCache();
}

function renderCalendarFromCache() {
  const days = dashboardDaysCache || [];
  if (!days.length) { calendar.innerHTML = ''; return; }
  const firstDate = days[0].receipt_date;
  const first = new Date(firstDate + 'T12:00:00');
  const monthBase = new Date(first.getFullYear(), first.getMonth() + dashboardMonthOffset, 1);
  const startGrid = new Date(monthBase.getFullYear(), monthBase.getMonth(), 1);
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
    const muted = d.getMonth() !== monthBase.getMonth() ? 'muted-day' : '';
    const selected = iso === dashboardSelectedDate ? 'selected-day' : '';
    cells += `<button type="button" class="cal-day ${muted} ${row ? 'in-cycle' : ''} ${iso === today ? 'today' : ''} ${selected}" data-date="${iso}"><span class="day-num">${d.getDate()}</span>${row ? `<span class="day-meta"><span>Allowance ${money(row.per_diem_per_day)}</span><span class="spent">${money(row.spent)} spent</span><span class="remaining">${money(row.remaining)} left</span></span>` : ''}</button>`;
  }
  calendar.innerHTML = heads + cells;
  calendar.querySelectorAll('[data-date]').forEach(btn => btn.addEventListener('click', () => {
    dashboardSelectedDate = btn.dataset.date;
    renderCalendarFromCache();
  }));
}

function updateBudgetBar(earned, spent, remaining) {
  const percent = Number(earned || 0) > 0 ? Math.max(0, Math.min(100, Math.round((Number(remaining || 0) / Number(earned || 0)) * 100))) : 0;
  const ring = document.getElementById('budgetRing');
  if (ring) ring.style.setProperty('--budget-percent', percent);
  const setText = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value; };
  setText('budgetPercent', `${percent}%`);
  setText('budgetRemaining', money(remaining));
  setText('budgetEarnedNote', `of ${money(earned)} earned`);
  setText('budgetEarned', money(earned));
  setText('budgetSpent', money(spent));
  setText('budgetRemaining2', money(remaining));
}

function downloadDashboardCsv() {
  const rows = dashboardDaysCache || [];
  if (!rows.length) return alert('No daily summary data to download.');
  const csv = ['Date,Per Diem,Spent,Remaining'].concat(rows.map(r => [fmtDate(r.receipt_date), Number(r.per_diem_per_day || 0).toFixed(2), Number(r.spent || 0).toFixed(2), Number(r.remaining || 0).toFixed(2)].map(v => `"${String(v).replaceAll('"','""')}"`).join(','))).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const name = (dashboardCurrentTour?.tour_name || 'dashboard').replace(/[^a-z0-9_-]+/gi, '_');
  link.href = URL.createObjectURL(blob);
  link.download = `${name}_daily_summary.csv`;
  document.body.appendChild(link);
  link.click();
  URL.revokeObjectURL(link.href);
  link.remove();
}

loadDashboard();
