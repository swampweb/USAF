// Mobile receipt logic only v70
window.MobileReceipts = (() => {
  const M = window.MobileShell;

  async function renderReceipts(){
    const { data, error } = await M.supa().from('USAF_receipts').select('*,USAF_receipt_types(name),USAF_cycles(id,tour_id,start_date,end_date,USAF_tours(id,tour_name,location))').eq('user_id', M.getUser().id).order('receipt_date', { ascending:false });
    if (error) throw error;
    const rows = data || [];
    M.getContent().innerHTML = `<div class="toolbar"><strong>My Receipts</strong></div><div class="card-list">${rows.length ? rows.map(r => `<article class="data-card"><strong>${M.esc(r.USAF_receipt_types?.name || r.scope || 'Receipt')} - ${M.money(r.amount)}</strong><span>${M.dt(r.receipt_date)} | ${M.esc(r.USAF_cycles?.USAF_tours?.tour_name || 'No tour linked')}</span></article>`).join('') : '<div class="empty-card">No receipts yet.</div>'}</div>`;
  }

  M.registerPage('receipts', renderReceipts);
  return { renderReceipts };
})();
