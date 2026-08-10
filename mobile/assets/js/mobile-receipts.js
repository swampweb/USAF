// Mobile receipts workflow v18
// Updates only mobile-receipts.js. The mobile.js loader stays as the reference file.
window.MobileReceipts = (() => {
  const M = window.MobileShell;
  let tours = [], selectedTour = null, receipts = [], cycles = [], types = [], scope = 'per_diem';
  const esc = v => M.esc ? M.esc(v ?? '') : String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money = v => M.money ? M.money(v) : '$' + Number(v || 0).toFixed(2);
  const dt = v => M.dt ? M.dt(v) : (v || '');
  const uid = () => M.getUser().id;

  async function loadTours(){
    let r = await M.supa().from('USAF_tour_summary').select('*').eq('user_id', uid()).order('orders_start_date',{ascending:false});
    if (r.error) r = await M.supa().from('USAF_tours').select('*').eq('user_id', uid()).order('orders_start_date',{ascending:false});
    if (r.error) throw r.error;
    tours = r.data || [];
    return tours;
  }
  async function loadTypes(){ const {data}=await M.supa().from('USAF_receipt_types').select('*').order('name',{ascending:true}); types=data||[]; }
  async function loadCycles(tourId){ const {data}=await M.supa().from('USAF_cycles').select('*').eq('user_id',uid()).eq('tour_id',tourId).order('start_date',{ascending:false}); cycles=data||[]; }
  async function loadReceipts(tourId){ const {data,error}=await M.supa().from('USAF_receipts').select('*, USAF_receipt_types(name)').eq('user_id',uid()).eq('tour_id',tourId).order('receipt_date',{ascending:false}); if(error) throw error; receipts=data||[]; }
  function total(s){ return receipts.filter(r=>(r.scope||'per_diem')===s).reduce((a,r)=>a+Number(r.amount||0),0); }

  async function renderReceipts(){
    const content = M.getContent();
    await loadTypes(); await loadTours();
    content.innerHTML = `<h2>Receipts</h2><p class="muted">Select a Tour to add Per Diem or Other receipts.</p>${tours.length ? tours.map(t=>tourCard(t)).join('') : '<div class="notice">No Tours found.</div>'}<div id="receiptDetail"></div><div id="receiptFormWrap"></div>`;
    content.querySelectorAll('[data-r-tour]').forEach(b=>b.onclick=()=>openTour(b.dataset.rTour));
  }

  function tourCard(t){
    return `<button class="card full" data-r-tour="${esc(t.id)}"><strong>${esc(t.tour_name||t.location||'Tour')}</strong><span>${esc(t.location||'')}</span><small>${dt(t.orders_start_date)} - ${dt(t.orders_end_date)}</small></button>`;
  }

  async function openTour(id){
    selectedTour = tours.find(t=>t.id===id);
    await loadCycles(id); await loadReceipts(id);
    const detail = document.getElementById('receiptDetail');
    detail.innerHTML = `<div class="card"><h3>${esc(selectedTour.tour_name||'Tour Receipts')}</h3><p>${dt(selectedTour.orders_start_date)} - ${dt(selectedTour.orders_end_date)}</p><button class="btn full" id="newReceiptBtn">+ Add Receipt</button><div class="summary-grid"><div><b>Per Diem</b><br>${money(total('per_diem'))}</div><div><b>Other</b><br>${money(total('other'))}</div></div><h4>Per Diem</h4>${receiptList('per_diem')}<h4>Other</h4>${receiptList('other')}</div>`;
    document.getElementById('newReceiptBtn').onclick=()=>renderReceiptForm();
    detail.querySelectorAll('[data-edit-r]').forEach(b=>b.onclick=()=>renderReceiptForm(receipts.find(r=>r.id===b.dataset.editR)));
    detail.querySelectorAll('[data-del-r]').forEach(b=>b.onclick=()=>deleteReceipt(b.dataset.delR));
    detail.scrollIntoView({behavior:'smooth',block:'start'});
  }

  function receiptList(s){
    const rows=receipts.filter(r=>(r.scope||'per_diem')===s);
    if(!rows.length) return '<div class="notice">No receipts yet.</div>';
    return rows.map(r=>`<div class="card"><strong>${esc(r.customer||'Receipt')}</strong><span>${dt(r.receipt_date)} - ${money(r.amount)}</span><small>${esc(r.USAF_receipt_types?.name||'')}</small><button class="btn secondary" data-edit-r="${esc(r.id)}">Edit</button><button class="btn danger" data-del-r="${esc(r.id)}">Delete</button></div>`).join('');
  }

  function typeOptions(selected=''){
    return '<option value="">Select Type</option>' + types.filter(t=>!t.scope||t.scope===scope||t.scope==='both').map(t=>`<option value="${esc(t.id)}" ${t.id===selected?'selected':''}>${esc(t.name)}</option>`).join('');
  }
  function cycleOptions(selected=''){
    return '<option value="">Select Cycle</option>' + cycles.map(c=>`<option value="${esc(c.id)}" ${c.id===selected?'selected':''}>${dt(c.start_date)} - ${dt(c.end_date)}</option>`).join('');
  }

  function renderReceiptForm(r=null){
    scope = r?.scope || 'per_diem';
    const wrap=document.getElementById('receiptFormWrap');
    wrap.innerHTML = `<div class="card"><h3>${r?'Edit':'Add'} Receipt</h3><form id="mobileReceiptForm"><label>Receipt Category<select id="mr_scope"><option value="per_diem">Per Diem</option><option value="other">Other</option></select></label><label id="mr_cycle_wrap">Cycle<select id="mr_cycle_id">${cycleOptions(r?.cycle_id||'')}</select></label><label>Customer<input id="mr_customer" required value="${esc(r?.customer||'')}"></label><label>Receipt Type<select id="mr_type_id" required>${typeOptions(r?.type_id||'')}</select></label><label>Date<input id="mr_receipt_date" type="date" required value="${esc(r?.receipt_date||'')}" min="${esc(selectedTour.orders_start_date||'')}" max="${esc(selectedTour.orders_end_date||'')}"></label><label>Amount<input id="mr_amount" type="number" step="0.01" required value="${esc(r?.amount||'')}"></label><label>Notes<textarea id="mr_notes">${esc(r?.notes||'')}</textarea></label><button class="btn full" type="submit">Save Receipt</button><button class="btn secondary full" id="cancelReceipt" type="button">Cancel</button></form></div>`;
    const scopeBox=document.getElementById('mr_scope'); scopeBox.value=scope;
    const refresh=()=>{ scope=scopeBox.value; document.getElementById('mr_cycle_wrap').style.display=scope==='per_diem'?'':'none'; document.getElementById('mr_type_id').innerHTML=typeOptions(document.getElementById('mr_type_id').value); };
    scopeBox.onchange=refresh; refresh();
    document.getElementById('cancelReceipt').onclick=()=>wrap.innerHTML='';
    document.getElementById('mobileReceiptForm').onsubmit=e=>saveReceipt(e,r);
    wrap.scrollIntoView({behavior:'smooth',block:'start'});
  }

  function validateDate(){
    const d=document.getElementById('mr_receipt_date').value;
    if(selectedTour.orders_start_date && d < selectedTour.orders_start_date) return alert('Receipt date must be within the selected Tour date range.'), false;
    if(selectedTour.orders_end_date && d > selectedTour.orders_end_date) return alert('Receipt date must be within the selected Tour date range.'), false;
    if(scope==='per_diem'){
      const c=cycles.find(x=>x.id===document.getElementById('mr_cycle_id').value);
      if(c && (d < c.start_date || d > c.end_date)) return alert('Per Diem receipt date must be within the selected Cycle date range.'), false;
    }
    return true;
  }

  async function saveReceipt(e,r){
    e.preventDefault(); if(!validateDate()) return;
    if(scope==='per_diem' && !document.getElementById('mr_cycle_id').value) return alert('Select a Cycle for Per Diem receipts.');
    const payload={user_id:uid(),tour_id:selectedTour.id,scope,cycle_id:scope==='per_diem'?document.getElementById('mr_cycle_id').value:null,customer:document.getElementById('mr_customer').value.trim(),type_id:document.getElementById('mr_type_id').value,receipt_date:document.getElementById('mr_receipt_date').value,amount:Number(document.getElementById('mr_amount').value),notes:document.getElementById('mr_notes').value.trim()||null};
    const result = r ? await M.supa().from('USAF_receipts').update(payload).eq('id',r.id).eq('user_id',uid()) : await M.supa().from('USAF_receipts').insert(payload);
    if(result.error) return alert('Receipt save failed: '+result.error.message);
    document.getElementById('receiptFormWrap').innerHTML=''; await openTour(selectedTour.id);
  }

  async function deleteReceipt(id){
    const r=receipts.find(x=>x.id===id);
    if(!confirm(`Delete receipt ${r?.customer||''}? This cannot be undone.`)) return;
    const {error}=await M.supa().from('USAF_receipts').delete().eq('id',id).eq('user_id',uid());
    if(error) return alert('Receipt delete failed: '+error.message);
    await openTour(selectedTour.id);
  }

  M.registerPage('receipts', renderReceipts);
  return { renderReceipts };
})();
