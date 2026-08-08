const MobileApp = (() => {
  let client = null;
  let sessionUser = null;
  const page = document.body.dataset.page;
  const content = document.getElementById('mobileContent');

  function getClient() {
    if (client) return client;
    if (!window.supabase || !window.USAF_CONFIG) throw new Error('Supabase or config.js did not load.');
    client = window.supabase.createClient(window.USAF_CONFIG.SUPABASE_URL, window.USAF_CONFIG.SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
    return client;
  }

  async function requireMobileAuth() {
    const supa = getClient();
    const { data } = await supa.auth.getSession();
    if (!data || !data.session) {
      window.location.href = '../login.html?returnTo=mobile/index.html';
      return null;
    }
    sessionUser = data.session.user;
    return sessionUser;
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  }
  function fmtDate(value) { return value ? new Date(value + 'T00:00:00').toLocaleDateString() : 'Not set'; }
  function money(value) { return Number(value || 0).toLocaleString(undefined, { style:'currency', currency:'USD' }); }
  function statusClass(status) { return ['cancelled','closed','inactive'].includes(status) ? 'inactive' : ''; }

  function bindShell() {
    const drawer = document.getElementById('mobileDrawer');
    const backdrop = document.getElementById('drawerBackdrop');
    const open = () => { drawer.classList.add('open'); backdrop.classList.add('open'); drawer.setAttribute('aria-hidden','false'); };
    const close = () => { drawer.classList.remove('open'); backdrop.classList.remove('open'); drawer.setAttribute('aria-hidden','true'); };
    document.getElementById('menuButton')?.addEventListener('click', open);
    document.getElementById('closeMenuButton')?.addEventListener('click', close);
    backdrop?.addEventListener('click', close);
    document.getElementById('refreshButton')?.addEventListener('click', () => route());
    document.getElementById('logoutButton')?.addEventListener('click', async () => {
      await getClient().auth.signOut();
      window.location.href = '../login.html';
    });
  }

  function renderHome() {
    content.innerHTML = `
      <div class="action-grid">
        <a class="action-card" href="tours.html"><div class="action-icon">✈️</div><div><strong>Tours</strong><span>Create and manage travel tours.</span></div><div class="action-arrow">›</div></a>
        <a class="action-card" href="cycles.html"><div class="action-icon">🔄</div><div><strong>Cycles</strong><span>Set date ranges and per diem rates.</span></div><div class="action-arrow">›</div></a>
        <a class="action-card" href="receipts.html"><div class="action-icon">🧾</div><div><strong>Receipts</strong><span>Add receipt details and attachments.</span></div><div class="action-arrow">›</div></a>
        <a class="action-card" href="vouchers.html"><div class="action-icon">📦</div><div><strong>Voucher Packages</strong><span>Prepare package exports for submission.</span></div><div class="action-arrow">›</div></a>
      </div>`;
  }

  async function loadTours() {
    const { data, error } = await getClient().from('USAF_tour_summary').select('*').eq('user_id', sessionUser.id).order('orders_start_date', { ascending: false });
    if (error) throw error;
    return data || [];
  }

  async function renderTours() {
    const tours = await loadTours();
    content.innerHTML = `
      <div class="toolbar"><strong>My Tours</strong><button class="btn" id="newTourBtn">+ Tour</button></div>
      <div id="tourFormWrap"></div>
      <div class="card-list">${tours.length ? tours.map(t => `
        <article class="data-card">
          <div><strong>${escapeHtml(t.tour_name)}</strong><span>${escapeHtml(t.location || 'No location')}</span></div>
          <div class="data-row"><span>Orders</span><b>${fmtDate(t.orders_start_date)} - ${fmtDate(t.orders_end_date)}</b></div>
          <span class="status-pill ${statusClass(t.status)}">${escapeHtml(t.status || 'active')}</span>
          <button class="btn secondary" data-edit-tour="${t.id}">Edit Tour</button>
        </article>`).join('') : '<div class="empty-card">No tours yet. Tap + Tour to create one.</div>'}</div>`;
    document.getElementById('newTourBtn').addEventListener('click', () => renderTourForm());
    document.querySelectorAll('[data-edit-tour]').forEach(btn => btn.addEventListener('click', () => {
      const t = tours.find(x => x.id === btn.dataset.editTour);
      renderTourForm(t);
    }));
  }

  function renderTourForm(t = null) {
    document.getElementById('tourFormWrap').innerHTML = `
      <form class="form-card" id="tourForm">
        <strong>${t ? 'Edit Tour' : 'New Tour'}</strong>
        <div class="form-grid">
          <label>Tour Name<input id="tour_name" required value="${escapeHtml(t?.tour_name || '')}"></label>
          <label>Location<input id="location" value="${escapeHtml(t?.location || '')}"></label>
          <label>Orders Number<input id="orders_number" value="${escapeHtml(t?.orders_number || '')}"></label>
          <label>Start Date<input id="orders_start_date" type="date" required value="${escapeHtml(t?.orders_start_date || '')}"></label>
          <label>End Date<input id="orders_end_date" type="date" required value="${escapeHtml(t?.orders_end_date || '')}"></label>
          <label>Status<select id="status"><option value="active">Active</option><option value="planned">Planned</option><option value="closed">Closed</option><option value="cancelled">Cancelled</option></select></label>
          <label>Notes<textarea id="notes">${escapeHtml(t?.notes || '')}</textarea></label>
        </div>
        <button class="btn full" type="submit">Save Tour</button>
        <button class="btn secondary full" type="button" id="cancelTourForm">Cancel</button>
      </form>`;
    document.getElementById('status').value = t?.status || 'active';
    document.getElementById('cancelTourForm').addEventListener('click', () => document.getElementById('tourFormWrap').innerHTML = '');
    document.getElementById('tourForm').addEventListener('submit', async e => {
      e.preventDefault();
      const payload = {
        user_id: sessionUser.id,
        tour_name: tour_name.value.trim(),
        location: location.value.trim() || null,
        orders_number: orders_number.value.trim() || null,
        orders_start_date: orders_start_date.value,
        orders_end_date: orders_end_date.value,
        status: status.value,
        notes: notes.value.trim() || null
      };
      const result = t
        ? await getClient().from('USAF_tours').update(payload).eq('id', t.id).eq('user_id', sessionUser.id)
        : await getClient().from('USAF_tours').insert(payload);
      if (result.error) return alert(result.error.message);
      await renderTours();
    });
  }

  async function renderCycles() {
    const tours = await loadTours();
    const { data: cycles, error } = await getClient().from('USAF_cycles').select('*').eq('user_id', sessionUser.id).order('start_date', { ascending: false });
    if (error) throw error;
    content.innerHTML = `
      <div class="toolbar"><strong>My Cycles</strong><button class="btn" id="newCycleBtn">+ Cycle</button></div>
      <div id="cycleFormWrap"></div>
      <div class="card-list">${(cycles || []).length ? cycles.map(c => `
        <article class="data-card">
          <div><strong>${fmtDate(c.start_date)} - ${fmtDate(c.end_date)}</strong><span>${money(c.per_diem_per_day)} per day</span></div>
          <span class="status-pill ${statusClass(c.status)}">${escapeHtml(c.status || 'active')}</span>
        </article>`).join('') : '<div class="empty-card">No cycles yet. Tap + Cycle to add one.</div>'}</div>`;
    document.getElementById('newCycleBtn').addEventListener('click', () => renderCycleForm(tours));
  }

  function renderCycleForm(tours) {
    document.getElementById('cycleFormWrap').innerHTML = `
      <form class="form-card" id="cycleForm">
        <strong>New Cycle</strong>
        <label>Tour<select id="tour_id" required>${tours.map(t => `<option value="${t.id}">${escapeHtml(t.tour_name)}</option>`).join('')}</select></label>
        <label>Start Date<input id="start_date" type="date" required></label>
        <label>End Date<input id="end_date" type="date" required></label>
        <label>Per Diem Per Day<input id="per_diem_per_day" type="number" step="0.01" min="0" required></label>
        <label>Status<select id="cycle_status"><option value="active">Active</option><option value="draft">Draft</option><option value="closed">Closed</option><option value="cancelled">Cancelled</option></select></label>
        <label>Notes<textarea id="cycle_notes"></textarea></label>
        <button class="btn full" type="submit">Save Cycle</button>
        <button class="btn secondary full" type="button" id="cancelCycleForm">Cancel</button>
      </form>`;
    document.getElementById('cancelCycleForm').addEventListener('click', () => document.getElementById('cycleFormWrap').innerHTML = '');
    document.getElementById('cycleForm').addEventListener('submit', async e => {
      e.preventDefault();
      const payload = { user_id: sessionUser.id, tour_id: tour_id.value, start_date: start_date.value, end_date: end_date.value, per_diem_per_day: Number(per_diem_per_day.value), status: cycle_status.value, notes: cycle_notes.value || null };
      const { error } = await getClient().from('USAF_cycles').insert(payload);
      if (error) return alert(error.message);
      await renderCycles();
    });
  }

  async function renderReceipts() {
    const tours = await loadTours();
    let rows = [];
    try {
      const result = await getClient().from('USAF_receipts').select('*').eq('user_id', sessionUser.id).order('receipt_date', { ascending: false });
      if (result.error) throw result.error;
      rows = result.data || [];
    } catch (err) {
      content.innerHTML = `<div class="notice">Receipts mobile view is ready, but the receipt query needs one schema check: ${escapeHtml(err.message)}</div>`;
      return;
    }
    content.innerHTML = `
      <div class="toolbar"><strong>My Receipts</strong><button class="btn" id="newReceiptBtn">+ Receipt</button></div>
      <div id="receiptFormWrap"></div>
      <div class="card-list">${rows.length ? rows.map(r => `
        <article class="data-card"><div><strong>${escapeHtml(r.receipt_type || r.type || 'Receipt')}</strong><span>${fmtDate(r.receipt_date || r.date)}</span></div><div class="data-row"><span>Amount</span><b>${money(r.amount)}</b></div></article>`).join('') : '<div class="empty-card">No receipts yet. Tap + Receipt to add one.</div>'}</div>`;
    document.getElementById('newReceiptBtn').addEventListener('click', () => renderReceiptForm(tours));
  }

  function renderReceiptForm(tours) {
    document.getElementById('receiptFormWrap').innerHTML = `
      <form class="form-card" id="receiptForm">
        <strong>New Receipt</strong>
        <label>Tour<select id="receipt_tour_id">${tours.map(t => `<option value="${t.id}">${escapeHtml(t.tour_name)}</option>`).join('')}</select></label>
        <label>Date<input id="receipt_date" type="date" required></label>
        <label>Type<input id="receipt_type" placeholder="Meals, Lodging, Fuel, etc." required></label>
        <label>Amount<input id="amount" type="number" step="0.01" min="0" required></label>
        <label>Description<textarea id="description"></textarea></label>
        <button class="btn full" type="submit">Save Receipt</button>
        <button class="btn secondary full" type="button" id="cancelReceiptForm">Cancel</button>
      </form>`;
    document.getElementById('cancelReceiptForm').addEventListener('click', () => document.getElementById('receiptFormWrap').innerHTML = '');
    document.getElementById('receiptForm').addEventListener('submit', async e => {
      e.preventDefault();
      const payload = { user_id: sessionUser.id, tour_id: receipt_tour_id.value, receipt_date: receipt_date.value, receipt_type: receipt_type.value.trim(), amount: Number(amount.value), description: description.value.trim() || null };
      const { error } = await getClient().from('USAF_receipts').insert(payload);
      if (error) return alert(error.message);
      await renderReceipts();
    });
  }

  async function renderVouchers() {
    content.innerHTML = `
      <div class="action-grid">
        <div class="data-card"><strong>Voucher Packages</strong><span>Mobile package creation shell is ready. The next step is connecting this screen to the existing voucher package workflow once the desktop voucher flow is confirmed stable.</span></div>
        <a class="action-card" href="../voucher-downloads.html"><div class="action-icon">📦</div><div><strong>Open Desktop Voucher Packages</strong><span>Use current voucher package tools.</span></div><div class="action-arrow">›</div></a>
      </div>`;
  }

  async function route() {
    content.innerHTML = '<div class="loading-card">Loading...</div>';
    try {
      await requireMobileAuth();
      if (!sessionUser) return;
      if (page === 'index') return renderHome();
      if (page === 'tours') return renderTours();
      if (page === 'cycles') return renderCycles();
      if (page === 'receipts') return renderReceipts();
      if (page === 'vouchers') return renderVouchers();
    } catch (err) {
      console.error(err);
      content.innerHTML = `<div class="notice">${escapeHtml(err.message || 'Mobile page failed to load.')}</div>`;
    }
  }

  async function init() { bindShell(); await route(); }
  return { init, route };
})();

MobileApp.init();
