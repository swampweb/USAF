// Mobile cycle logic only v70
window.MobileCycles = (() => {
  const M = window.MobileShell;
  let cyclesCache = [];

  async function loadCycles(tourId = null){
    let q = M.supa().from('USAF_cycles').select('*').eq('user_id', M.getUser().id).order('start_date', { ascending:false });
    if (tourId) q = q.eq('tour_id', tourId);
    const { data, error } = await q;
    if (error) throw error;
    cyclesCache = data || [];
    return cyclesCache;
  }

  function cycleCard(c){
    return `<article class="data-card"><strong>${M.dt(c.start_date)} - ${M.dt(c.end_date)}</strong><span>${M.money(c.per_diem_per_day)} per day | ${M.esc(c.status || 'active')}</span><button class="btn secondary" data-edit-cycle="${c.id}">Edit Cycle</button></article>`;
  }

  function renderCycleForm(t, c = null){
    const wrap = document.getElementById('form');
    wrap.innerHTML = `<form class="form-card" id="cycleForm"><strong>${c ? 'Edit' : 'New'} Cycle</strong>
      <div class="notice">Cycle dates must stay inside this Tour range: ${M.dt(t.orders_start_date)} - ${M.dt(t.orders_end_date)}.</div>
      <label>Start Date<input id="start_date" type="date" required min="${M.esc(t.orders_start_date || '')}" max="${M.esc(t.orders_end_date || '')}" value="${M.esc(c?.start_date || '')}"></label>
      <label>End Date<input id="end_date" type="date" required min="${M.esc(t.orders_start_date || '')}" max="${M.esc(t.orders_end_date || '')}" value="${M.esc(c?.end_date || '')}"></label>
      <label>Per Diem Per Day<input id="per_diem_per_day" type="number" step="0.01" required value="${M.esc(c?.per_diem_per_day || '')}"></label>
      <label>Status<select id="cycle_status"><option value="active">Active</option><option value="draft">Draft</option><option value="closed">Closed</option><option value="cancelled">Inactive / Cancelled</option></select></label>
      <label>Notes<textarea id="cycle_notes">${M.esc(c?.notes || '')}</textarea></label>
      <button class="btn full" type="submit">Save Cycle</button>
      <button class="btn secondary full" type="button" id="cancelCycleBtn">Cancel</button>
    </form>`;
    document.getElementById('cycle_status').value = c?.status || 'active';
    document.getElementById('cancelCycleBtn').onclick = () => wrap.innerHTML = '';
    document.getElementById('cycleForm').onsubmit = e => saveCycle(e, t, c);
    wrap.scrollIntoView({ behavior:'smooth', block:'start' });
  }

  function validateCycleDates(t){
    const startDate = document.getElementById('start_date').value;
    const endDate = document.getElementById('end_date').value;
    if (startDate < t.orders_start_date || startDate > t.orders_end_date || endDate < t.orders_start_date || endDate > t.orders_end_date) {
      alert('Cycle dates must be within the selected Tour date range.');
      return false;
    }
    if (endDate < startDate) { alert('Cycle End Date cannot be before Cycle Start Date.'); return false; }
    return true;
  }

  async function saveCycle(e, t, c){
    e.preventDefault();
    if (!validateCycleDates(t)) return;
    const payload = {
      user_id:M.getUser().id,
      tour_id:t.id,
      start_date:document.getElementById('start_date').value,
      end_date:document.getElementById('end_date').value,
      per_diem_per_day:Number(document.getElementById('per_diem_per_day').value),
      status:document.getElementById('cycle_status').value,
      notes:document.getElementById('cycle_notes').value.trim() || null
    };
    const result = c ? await M.supa().from('USAF_cycles').update(payload).eq('id', c.id).eq('user_id', M.getUser().id) : await M.supa().from('USAF_cycles').insert(payload);
    if (result.error) return alert('Cycle save failed: ' + result.error.message);
    await window.MobileTours.renderTourDetail(t);
  }

  return { loadCycles, cycleCard, renderCycleForm };
})();
