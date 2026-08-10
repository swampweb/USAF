// Mobile receipt logic and clean cards v100
window.MobileReceipts = (() => {
  const M = window.MobileShell;
  function hasReceiptFile(r) { return Boolean(r.receipt_file_url || r.receipt_url || r.file_url || r.attachment_url || r.receipt_file_path || r.file_path || r.attachment_path || r.storage_path || r.receipt_filename || r.file_name || r.filename || r.original_filename); }
  function receiptFileLabel(r) { const label = r.receipt_filename || r.file_name || r.filename || r.original_filename; if (label) return M.esc(label); const path = r.receipt_file_path || r.file_path || r.attachment_path || r.storage_path || r.receipt_file_url || r.receipt_url || r.file_url || r.attachment_url; return path ? M.esc(String(path).split('?')[0].split('/').filter(Boolean).pop() || 'Receipt attached') : 'No receipt file attached'; }
  function receiptFileUrl(r) { return r.receipt_file_url || r.receipt_url || r.file_url || r.attachment_url || null; }
  function cycleLabel(r) { const c = r.USAF_cycles; return c ? `${M.dt(c.start_date)} - ${M.dt(c.end_date)}` : 'No cycle linked'; }
  function tourLabel(r) { return r.USAF_tours?.tour_name || r.USAF_cycles?.USAF_tours?.tour_name || 'No tour linked'; }
  function receiptTypeLabel(r) { return r.USAF_receipt_types?.name || r.receipt_type || r.scope || 'Receipt'; }
  function receiptCard(r) {
    const attached = hasReceiptFile(r); const url = receiptFileUrl(r); const fileText = receiptFileLabel(r);
    const fileLine = attached ? (url ? `<a href="${M.esc(url)}" target="_blank" rel="noopener">📎 ${fileText}</a>` : `📎 ${fileText}`) : 'No receipt file attached';
    return `<article class="data-card receipt-card ${attached ? 'has-file' : ''}"><div class="card-title-row"><strong>${attached ? '📎 ' : ''}${M.esc(r.customer || receiptTypeLabel(r))}</strong><b>${M.money(r.amount)}</b></div><span>${M.esc(receiptTypeLabel(r))}</span><div class="data-row"><span>Date</span><b>${M.dt(r.receipt_date)}</b></div><div class="data-row"><span>Cycle</span><b>${cycleLabel(r)}</b></div><div class="data-row"><span>Tour</span><b>${M.esc(tourLabel(r))}</b></div><div class="data-row"><span>File</span><b>${fileLine}</b></div>${r.notes ? `<span class="muted">${M.esc(r.notes)}</span>` : ''}</article>`;
  }
  async function renderReceipts(){
    const { data, error } = await M.supa().from('USAF_receipts').select('*,USAF_receipt_types(name),USAF_tours(id,tour_name,location),USAF_cycles(id,tour_id,start_date,end_date,USAF_tours(id,tour_name,location))').eq('user_id', M.getUser().id).order('receipt_date', { ascending:false });
    if (error) throw error;
    const rows = data || [];
    const total = rows.reduce((sum, r) => sum + Number(r.amount || 0), 0);
    const attachedCount = rows.filter(hasReceiptFile).length;
    M.getContent().innerHTML = `<div class="toolbar"><strong>My Receipts</strong><span class="badge-pill">${rows.length} • ${M.money(total)}</span></div><section class="summary-grid compact"><div class="kpi-card"><span>Receipts</span><strong>${rows.length}</strong><small>Total count</small></div><div class="kpi-card"><span>Total</span><strong>${M.money(total)}</strong><small>Receipt amount</small></div><div class="kpi-card"><span>Files</span><strong>📎 ${attachedCount}</strong><small>Attached</small></div></section><div class="card-list">${rows.length ? rows.map(receiptCard).join('') : '<div class="empty-card">No receipts yet.</div>'}</div>`;
  }
  M.registerPage('receipts', renderReceipts);
  return { renderReceipts, hasReceiptFile, receiptFileLabel, receiptCard };
})();
