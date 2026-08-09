// Mobile Tour Save Field Lookup Fix v64
const MobileApp = (() => {
  let client = null;
  let user = null;
  let toursCache = [];
  let cyclesCache = [];
  let selectedTour = null;
  const page = document.body.dataset.page;
  const content = document.getElementById('mobileContent');

  const esc = v => String(v ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const dt = v => v ? new Date(v + 'T00:00:00').toLocaleDateString() : 'Not set';
  const money = v => Number(v || 0).toLocaleString(undefined, { style:'currency', currency:'USD' });

  function supa(){
    if (client) return client;
    if (!window.supabase || !window.USAF_CONFIG) throw new Error('Supabase or config.js did not load.');
    client = window.supabase.createClient(window.USAF_CONFIG.SUPABASE_URL, window.USAF_CONFIG.SUPABASE_ANON_KEY, {
      auth:{ persistSession:true, autoRefreshToken:true, detectSessionInUrl:true }
    });
    return client;
  }

  async function auth(){
    const { data } = await supa().auth.getSession();
    if (!data?.session){ location.href = '../login.html?returnTo=mobile/index.html'; return null; }
    user = data.session.user;
    return user;
  }

  function shell(){
    const d = document.getElementById('mobileDrawer');
    const b = document.getElementById('drawerBackdrop');
    const menu = document.getElementById('menuButton');
    const closeBtn = document.getElementById('closeMenuButton');
    const refresh = document.getElementById('refreshButton');
    const back = document.getElementById('backButton');
    const logout = document.getElementById('logoutButton');
    const open = () => { d?.classList.add('open'); b?.classList.add('open'); };
    const close = () => { d?.classList.remove('open'); b?.classList.remove('open'); };
    if (menu) menu.onclick = open;
    if (closeBtn) closeBtn.onclick = close;
    if (b) b.onclick = close;
    if (refresh) refresh.onclick = route;
    if (back) back.onclick = () => { if (history.length > 1) history.back(); else location.href = 'index.html'; };
    if (logout) logout.onclick = async () => { await supa().auth.signOut(); location.href = '../login.html'; };
  }

  async function loadTours(){
    let result = await supa().from('USAF_tour_summary').select('*').eq('user_id', user.id).order('orders_start_date', { ascending:false });
    if (result.error) result = await supa().from('USAF_tours').select('*').eq('user_id', user.id).order('orders_start_date', { ascending:false });
    if (result.error) throw result.error;
    toursCache = result.data || [];
    return toursCache;
  }

  async function loadCycles(tourId = null){
    let q = supa().from('USAF_cycles').select('*').eq('user_id', user.id).order('start_date', { ascending:false });
    if (tourId) q = q.eq('tour_id', tourId);
    const { data, error } = await q;
    if (error) throw error;
    cyclesCache = data || [];
    return cyclesCache;
  }

  function home(){
    content.innerHTML = `<div class="action-grid">
      <a class="action-card" href="tours.html"><div class="action-icon">✈️</div><div><strong>Tours</strong><span>Manage tours, cycles, and receipts.</span></div><div class="action-arrow">›</div></a>
      <a class="action-card" href="receipts.html"><div class="action-icon">🧾</div><div><strong>Receipts</strong><span>View receipt details.</span></div><div class="action-arrow">›</div></a>
      <a class="action-card" href="vouchers.html"><div class="action-icon">📦</div><div><strong>Voucher Packages</strong><span>Build voucher packages.</span></div><div class="action-arrow">›</div></a>
      <a class="action-card" href="profile.html"><div class="action-icon">👤</div><div><strong>Profile</strong><span>View your account.</span></div><div class="action-arrow">›</div></a>
    </div>`;
  }

  async function renderTours(){
    const tours = await loadTours();
    content.innerHTML = `<div class="toolbar"><strong>My Tours</strong><button class="btn" id="newTourBtn">+ Tour</button></div>
      <div id="form"></div>
      <div class="card-list">${tours.length ? tours.map(t => tourCard(t)).join('') : '<div class="empty-card">No tours yet.</div>'}</div>`;
    document.getElementById('newTourBtn').onclick = () => renderTourForm();
    content.querySelectorAll('[data-open-tour]').forEach(btn => btn.onclick = () => renderTourDetail(tours.find(t => t.id === btn.dataset.openTour)));
    content.querySelectorAll('[data-edit-tour]').forEach(btn => btn.onclick = () => renderTourForm(tours.find(t => t.id === btn.dataset.editTour)));
    content.querySelectorAll('[data-delete-tour]').forEach(btn => btn.onclick = () => deleteTour(btn.dataset.deleteTour));
  }

  function tourCard(t){
    return `<article class="data-card"><strong>${esc(t.tour_name)}</strong><span>${esc(t.location || 'No location')}</span>
      <div class="data-row"><span>Orders</span><b>${dt(t.orders_start_date)} - ${dt(t.orders_end_date)}</b></div>
      <div class="data-row"><span>Cycles</span><b>${t.cycle_count || 0}</b></div>
      <div class="detail-actions"><button class="btn secondary" data-open-tour="${t.id}">View</button><button class="btn secondary" data-edit-tour="${t.id}">Edit</button></div>
      <button class="btn danger full" data-delete-tour="${t.id}">Delete Tour</button>
    </article>`;
  }

  function renderTourForm(t = null){
    const formWrap = document.getElementById('form');
    formWrap.innerHTML = `<form class="form-card" id="tourForm"><strong>${t ? 'Edit' : 'New'} Tour</strong>
      <label>Tour Name<input id="tour_name" required value="${esc(t?.tour_name || '')}"></label>
      <label>Location<input id="location" value="${esc(t?.location || '')}"></label>
      <label>Orders Number<input id="orders_number" value="${esc(t?.orders_number || '')}"></label>
      <label>Start Date<input id="orders_start_date" type="date" required value="${esc(t?.orders_start_date || '')}"></label>
      <label>End Date<input id="orders_end_date" type="date" required value="${esc(t?.orders_end_date || '')}"></label>
      <label>Status<select id="status"><option value="active">Active</option><option value="planned">Planned</option><option value="completed">Completed</option><option value="cancelled">Inactive / Cancelled</option></select></label>
      <label>Notes<textarea id="notes">${esc(t?.notes || '')}</textarea></label>
      <button class="btn full" type="submit">Save Tour</button>
      <button class="btn secondary full" type="button" id="cancelTourBtn">Cancel</button>
    </form>`;
    document.getElementById('status').value = t?.status || 'active';
    document.getElementById('cancelTourBtn').onclick = () => formWrap.innerHTML = '';
    document.getElementById('tourForm').onsubmit = e => saveTour(e, t);
    document.getElementById('tourForm').scrollIntoView({ behavior:'smooth', block:'start' });
  }

  async function saveTour(e, existing){
    e.preventDefault();
    const tourNameEl = document.getElementById('tour_name');
    const locationEl = document.getElementById('location');
    const ordersNumberEl = document.getElementById('orders_number');
    const startEl = document.getElementById('orders_start_date');
    const endEl = document.getElementById('orders_end_date');
    const statusEl = document.getElementById('status');
    const notesEl = document.getElementById('notes');
    const start = startEl?.value || '';
    const end = endEl?.value || '';
    if (start && end && end < start) return alert('Tour End Date cannot be before Tour Start Date.');
    const payload = {
      user_id:user.id,
      tour_name:(tourNameEl?.value || '').trim(),
      location:(locationEl?.value || '').trim() || null,
      orders_number:(ordersNumberEl?.value || '').trim() || null,
      orders_start_date:start,
      orders_end_date:end,
      status:statusEl?.value || 'active',
      notes:(notesEl?.value || '').trim() || null
    };
    if (!payload.tour_name) return alert('Tour Name is required.');
    if (!payload.orders_start_date || !payload.orders_end_date) return alert('Start Date and End Date are required.');
    const result = existing
      ? await supa().from('USAF_tours').update(payload).eq('id', existing.id).eq('user_id', user.id).select().single()
      : await supa().from('USAF_tours').insert(payload).select().single();
    if (result.error) return alert('Tour save failed: ' + result.error.message);
    await renderTours();
  }

  async function deleteTour(id){
    const t = toursCache.find(x => x.id === id);
    if (!confirm(`Delete Tour "${t?.tour_name || 'selected tour'}"? This cannot be undone.`)) return;
    const { error } = await supa().from('USAF_tours').delete().eq('id', id).eq('user_id', user.id);
    if (error) return alert('Tour delete failed. If this Tour has cycles or receipts, delete or move those records first. Supabase message: ' + error.message);
    selectedTour = null;
    await renderTours();
  }

  async function renderTourDetail(t){
    selectedTour = t;
    const cycles = await loadCycles(t.id);
    content.innerHTML = `<button class="back-link" id="backTours">‹ Back to tours</button>
      <article class="data-card"><strong>${esc(t.tour_name)}</strong><span>${esc(t.location || 'No location')}</span>
      <div class="data-row"><span>Orders</span><b>${dt(t.orders_start_date)} - ${dt(t.orders_end_date)}</b></div>
      <div class="data-row"><span>Status</span><b>${esc(t.status || 'active')}</b></div>
      <div class="detail-actions"><button class="btn secondary" id="editTourBtn">Edit Tour</button><button class="btn danger" id="deleteTourBtn">Delete Tour</button></div>
      <button class="btn full" id="addCycleBtn">+ Cycle</button></article>
      <div id="form"></div>
      <div class="section-title">Cycles</div>
      <div class="card-list">${cycles.length ? cycles.map(c => cycleCard(c)).join('') : '<div class="empty-card">No cycles yet.</div>'}</div>`;
    backTours.onclick = renderTours;
    editTourBtn.onclick = () => renderTourForm(t);
    deleteTourBtn.onclick = () => deleteTour(t.id);
    addCycleBtn.onclick = () => renderCycleForm(t);
    content.querySelectorAll('[data-edit-cycle]').forEach(btn => btn.onclick = () => renderCycleForm(t, cycles.find(c => c.id === btn.dataset.editCycle)));
  }

  function cycleCard(c){
    return `<article class="data-card"><strong>${dt(c.start_date)} - ${dt(c.end_date)}</strong><span>${money(c.per_diem_per_day)} per day | ${esc(c.status || 'active')}</span><button class="btn secondary" data-edit-cycle="${c.id}">Edit Cycle</button></article>`;
  }

  function renderCycleForm(t, c = null){
    const wrap = document.getElementById('form');
    wrap.innerHTML = `<form class="form-card" id="cycleForm"><strong>${c ? 'Edit' : 'New'} Cycle</strong>
      <div class="notice">Cycle dates must stay inside this Tour range: ${dt(t.orders_start_date)} - ${dt(t.orders_end_date)}.</div>
      <label>Start Date<input id="start_date" type="date" required min="${esc(t.orders_start_date || '')}" max="${esc(t.orders_end_date || '')}" value="${esc(c?.start_date || '')}"></label>
      <label>End Date<input id="end_date" type="date" required min="${esc(t.orders_start_date || '')}" max="${esc(t.orders_end_date || '')}" value="${esc(c?.end_date || '')}"></label>
      <label>Per Diem Per Day<input id="per_diem_per_day" type="number" step="0.01" required value="${esc(c?.per_diem_per_day || '')}"></label>
      <label>Status<select id="cycle_status"><option value="active">Active</option><option value="draft">Draft</option><option value="closed">Closed</option><option value="cancelled">Inactive / Cancelled</option></select></label>
      <label>Notes<textarea id="cycle_notes">${esc(c?.notes || '')}</textarea></label>
      <button class="btn full" type="submit">Save Cycle</button>
      <button class="btn secondary full" type="button" id="cancelCycleBtn">Cancel</button>
    </form>`;
    cycle_status.value = c?.status || 'active';
    cancelCycleBtn.onclick = () => wrap.innerHTML = '';
    cycleForm.onsubmit = e => saveCycle(e, t, c);
    wrap.scrollIntoView({ behavior:'smooth', block:'start' });
  }

  function validateCycleDates(t){
    if (start_date.value < t.orders_start_date || start_date.value > t.orders_end_date || end_date.value < t.orders_start_date || end_date.value > t.orders_end_date) {
      alert('Cycle dates must be within the selected Tour date range.');
      return false;
    }
    if (end_date.value < start_date.value) { alert('Cycle End Date cannot be before Cycle Start Date.'); return false; }
    return true;
  }

  async function saveCycle(e, t, c){
    e.preventDefault();
    if (!validateCycleDates(t)) return;
    const payload = { user_id:user.id, tour_id:t.id, start_date:start_date.value, end_date:end_date.value, per_diem_per_day:Number(per_diem_per_day.value), status:cycle_status.value, notes:cycle_notes.value.trim() || null };
    const result = c ? await supa().from('USAF_cycles').update(payload).eq('id', c.id).eq('user_id', user.id) : await supa().from('USAF_cycles').insert(payload);
    if (result.error) return alert('Cycle save failed: ' + result.error.message);
    await renderTourDetail(t);
  }

  async function renderReceipts(){
    const { data, error } = await supa().from('USAF_receipts').select('*,USAF_receipt_types(name),USAF_cycles(id,tour_id,start_date,end_date,USAF_tours(id,tour_name,location))').eq('user_id', user.id).order('receipt_date', { ascending:false });
    if (error) throw error;
    const rows = data || [];
    content.innerHTML = `<div class="toolbar"><strong>My Receipts</strong></div><div class="card-list">${rows.length ? rows.map(r => `<article class="data-card"><strong>${esc(r.USAF_receipt_types?.name || r.scope || 'Receipt')} - ${money(r.amount)}</strong><span>${dt(r.receipt_date)} | ${esc(r.USAF_cycles?.USAF_tours?.tour_name || 'No tour linked')}</span></article>`).join('') : '<div class="empty-card">No receipts yet.</div>'}</div>`;
  }


  async function renderProfile(){
    const { data, error } = await supa().from('USAF_profiles').select('*').eq('id', user.id).maybeSingle();
    if (error) throw error;
    const p = data || {};
    content.innerHTML = `<article class="data-card"><strong>${esc(p.display_name || user.email)}</strong><span>${esc(p.email || user.email)}</span>
      <div class="data-row"><span>Rank</span><b>${esc(p.rank || 'Not set')}</b></div>
      <div class="data-row"><span>Unit</span><b>${esc(p.unit || 'Not set')}</b></div>
      <div class="data-row"><span>Duty Station</span><b>${esc(p.duty_station || 'Not set')}</b></div>
      <div class="data-row"><span>Role</span><b>${esc(p.role || 'user')}</b></div>
    </article>`;
  }

  async function renderVouchers(){
    const { data, error } = await supa().from('USAF_vouchers').select('*').eq('user_id', user.id).order('created_at', { ascending:false });
    if (error) throw error;
    const rows = data || [];
    content.innerHTML = `<div class="toolbar"><strong>Voucher Packages</strong><button class="btn" id="newVoucherBtn">+ Package</button></div><div id="form"></div>
      <div class="card-list">${rows.length ? rows.map(v => `<article class="data-card"><strong>${dt(v.date_from)} - ${dt(v.date_to)}</strong><span>${v.receipt_count || 0} receipts | ${money(v.total_amount)}</span><span>${esc(v.status || 'created')}</span></article>`).join('') : '<div class="empty-card">No voucher packages yet.</div>'}</div>`;
    newVoucherBtn.onclick = renderVoucherForm;
  }

  function renderVoucherForm(){
    const wrap = document.getElementById('form');
    wrap.innerHTML = `<form class="form-card" id="voucherForm"><strong>New Voucher Package</strong>
      <label>Date From<input id="date_from" type="date" required></label>
      <label>Date To<input id="date_to" type="date" required></label>
      <button class="btn full" type="submit">Create Package Record</button>
      <button class="btn secondary full" type="button" id="cancelVoucherBtn">Cancel</button>
    </form>`;
    cancelVoucherBtn.onclick = () => wrap.innerHTML = '';
    voucherForm.onsubmit = saveVoucher;
  }

  async function saveVoucher(e){
    e.preventDefault();
    if (date_to.value < date_from.value) return alert('Date To cannot be before Date From.');
    const { data:rs, error:receiptError } = await supa().from('USAF_receipts').select('amount').eq('user_id', user.id).gte('receipt_date', date_from.value).lte('receipt_date', date_to.value);
    if (receiptError) return alert(receiptError.message);
    const receipts = rs || [];
    const payload = { user_id:user.id, date_from:date_from.value, date_to:date_to.value, status:'created', receipt_count:receipts.length, total_amount:receipts.reduce((a,r)=>a+Number(r.amount||0),0) };
    const { error } = await supa().from('USAF_vouchers').insert(payload);
    if (error) return alert(error.message);
    await renderVouchers();
  }

  async function route(){
    content.innerHTML = '<div class="loading-card">Loading...</div>';
    try{
      await auth();
      if (!user) return;
      if (page === 'index') home();
      else if (page === 'tours' || page === 'cycles') await renderTours();
      else if (page === 'receipts') await renderReceipts();
      else if (page === 'vouchers') await renderVouchers();
      else if (page === 'profile') await renderProfile();
      else content.innerHTML = '<div class="notice">This mobile page uses its own page script.</div>';
    } catch(err){
      console.error(err);
      content.innerHTML = `<div class="notice"><strong>Mobile page failed to load.</strong><br>${esc(err.message || err)}</div>`;
    }
  }

  async function init(){ shell(); await route(); }
  return { init, route };
})();
MobileApp.init();
