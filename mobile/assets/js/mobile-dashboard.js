// Mobile Dashboard Daily Summary v132
window.MobileDashboard = (() => {
  const M = window.MobileShell;

  async function count(table, filters) {
    let query = M.supa().from(table).select('id', { count: 'exact', head: true });
    (filters || []).forEach(([column, value]) => { query = query.eq(column, value); });
    const { count: total, error } = await query;
    if (error) { console.warn('Count failed', table, error.message || error); return 0; }
    return total || 0;
  }

  function localIso(date) {
    const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return shifted.toISOString().slice(0, 10);
  }

  function addDays(value, days) {
    const date = new Date(`${value}T00:00:00`);
    date.setDate(date.getDate() + days);
    return localIso(date);
  }

  function inRange(value, start, end) {
    return value >= String(start || '') && value <= String(end || '');
  }

  async function loadTours(userId) {
    let result = await M.supa().from('USAF_tour_summary').select('*').eq('user_id', userId).order('orders_start_date', { ascending: false });
    if (result.error) result = await M.supa().from('USAF_tours').select('*').eq('user_id', userId).order('orders_start_date', { ascending: false });
    if (result.error) throw result.error;
    return (result.data || []).filter(tour => tour.archived !== true && String(tour.archive_status || '').toLowerCase() !== 'archived');
  }

  async function loadDailyRows(tour) {
    const userId = M.getUser().id;
    const [cyclesResult, receiptsResult] = await Promise.all([
      M.supa().from('USAF_cycles').select('*').eq('user_id', userId).eq('tour_id', tour.id).order('start_date'),
      M.supa().from('USAF_receipts').select('receipt_date,amount,scope').eq('user_id', userId).eq('tour_id', tour.id).order('receipt_date')
    ]);
    if (cyclesResult.error) throw cyclesResult.error;
    if (receiptsResult.error) throw receiptsResult.error;

    const today = localIso(new Date());
    const firstDate = inRange(today, tour.orders_start_date, tour.orders_end_date) ? today : (tour.orders_start_date || today);
    const lastDate = tour.orders_end_date || addDays(firstDate, 6);
    const rows = [];

    for (let index = 0; index < 7; index += 1) {
      const date = addDays(firstDate, index);
      if (date > lastDate) break;
      const cycle = (cyclesResult.data || []).find(item => inRange(date, item.start_date, item.end_date));
      const earned = Number(cycle?.per_diem_per_day || 0);
      const spent = (receiptsResult.data || [])
        .filter(receipt => receipt.receipt_date === date && receipt.scope === 'per_diem')
        .reduce((sum, receipt) => sum + Number(receipt.amount || 0), 0);
      rows.push({ date, earned, spent, remaining: earned - spent, isToday: date === today });
    }
    return rows;
  }

  async function renderDailySummary(tours, tourId) {
    const host = document.getElementById('mobileDailySummaryHost');
    const selectedTour = tours.find(tour => tour.id === tourId) || tours[0];
    if (!host) return;
    if (!selectedTour) {
      host.innerHTML = '<div class="empty-card">Create a Tour to view a Daily Summary.</div>';
      return;
    }

    host.innerHTML = '<div class="empty-card">Loading Daily Summary...</div>';
    try {
      const rows = await loadDailyRows(selectedTour);
      const focus = rows.find(row => row.isToday) || rows[0] || { date: '', earned: 0, spent: 0, remaining: 0 };
      host.innerHTML = `
        <section class="mobile-daily-summary">
          <div class="mobile-summary-head">
            <div><span>Daily Summary</span><strong>${M.esc(selectedTour.tour_name || selectedTour.location || 'Selected Tour')}</strong></div>
            <small>${M.dt(focus.date)}</small>
          </div>
          <div class="mobile-summary-totals">
            <div><span>Per Diem</span><strong>${M.money(focus.earned)}</strong></div>
            <div><span>Spent</span><strong class="summary-spent">${M.money(focus.spent)}</strong></div>
            <div><span>Remaining</span><strong class="summary-remaining">${M.money(focus.remaining)}</strong></div>
          </div>
          <div class="mobile-upcoming-list">
            ${rows.map(row => `<div class="mobile-upcoming-row ${row.isToday ? 'today' : ''}">
              <div><strong>${row.isToday ? 'Today' : M.dt(row.date)}</strong><small>${M.money(row.earned)} allowance</small></div>
              <div><span>${M.money(row.spent)} spent</span><b>${M.money(row.remaining)} left</b></div>
            </div>`).join('') || '<div class="empty-card">No Daily Summary days are available.</div>'}
          </div>
        </section>`;
    } catch (error) {
      host.innerHTML = `<div class="notice">Daily Summary failed to load: ${M.esc(error.message || error)}</div>`;
    }
  }

  async function renderHome() {
    const userId = M.getUser().id;
    const [tourCount, receiptCount, voucherCount, ticketCount, tours] = await Promise.all([
      count('USAF_tours', [['user_id', userId]]),
      count('USAF_receipts', [['user_id', userId]]),
      count('USAF_vouchers', [['user_id', userId]]),
      count('USAF_helpdesk_tickets', [['created_by', userId]]),
      loadTours(userId)
    ]);
    const selectedTour = tours.find(tour => ['active', 'planned'].includes(String(tour.status || '').toLowerCase())) || tours[0];
    const adminBlock = M.isAdmin() ? `<div class="section-title">Admin Workflow</div><div class="action-grid"><a class="action-card" href="users.html"><div class="action-icon">👥</div><div><strong>User Management</strong><span>Manage roles and active status.</span></div><div class="action-arrow">›</div></a></div>` : '';

    M.getContent().innerHTML = `
      <section class="welcome-card"><span>Welcome</span><strong>${M.esc(M.displayName())}</strong><small>Role: ${M.esc(M.getRole())}</small></section>
      <section class="mobile-kpi-grid">
        <div class="kpi-card"><span>Tours</span><strong>${tourCount}</strong><small>Your tour records</small></div>
        <div class="kpi-card"><span>Receipts</span><strong>${receiptCount}</strong><small>Uploaded receipts</small></div>
        <div class="kpi-card"><span>Voucher Packages</span><strong>${voucherCount}</strong><small>Created packages</small></div>
        <div class="kpi-card"><span>Help Desk</span><strong>${ticketCount}</strong><small>Your tickets</small></div>
      </section>
      <section class="mobile-tour-selector-card">
        <label>Daily Summary Tour
          <select id="mobileDashboardTourSelect">
            ${tours.map(tour => `<option value="${M.esc(tour.id)}" ${tour.id === selectedTour?.id ? 'selected' : ''}>${M.esc(tour.tour_name || tour.location || 'Tour')}</option>`).join('')}
          </select>
        </label>
      </section>
      <div id="mobileDailySummaryHost"></div>
      <div class="section-title">Main Workflow</div>
      <div class="action-grid">
        <a class="action-card" href="tours.html"><div class="action-icon">✈️</div><div><strong>Tours</strong><span>Create tours, view details, and manage cycles.</span></div><div class="action-arrow">›</div></a>
        <a class="action-card" href="receipts.html"><div class="action-icon">🧾</div><div><strong>Receipts</strong><span>Add and review receipts with attachments.</span></div><div class="action-arrow">›</div></a>
        <a class="action-card" href="vouchers.html"><div class="action-icon">📦</div><div><strong>Voucher Packages</strong><span>Create submission packages from receipts.</span></div><div class="action-arrow">›</div></a>
        <a class="action-card" href="profile.html"><div class="action-icon">👤</div><div><strong>My Profile</strong><span>View and update your account.</span></div><div class="action-arrow">›</div></a>
        <a class="action-card" href="#" data-mobile-helpdesk-open><div class="action-icon">?</div><div><strong>Help Desk</strong><span>Submit questions or issues to Admin.</span></div><div class="action-arrow">›</div></a>
      </div>${adminBlock}`;

    document.getElementById('mobileDashboardTourSelect')?.addEventListener('change', event => renderDailySummary(tours, event.target.value));
    M.getContent().querySelectorAll('[data-mobile-helpdesk-open]').forEach(link => link.addEventListener('click', event => { event.preventDefault(); window.USAFMobileHelpDesk?.open?.(); }));
    await renderDailySummary(tours, selectedTour?.id);
  }

  M.registerPage('index', renderHome);
  return { renderHome };
})();
