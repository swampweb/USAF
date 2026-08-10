// Mobile receipt logic only v71
// Updates: cleaner receipt cards, linked Cycle/Tour display, and attachment paperclip/file info.
window.MobileReceipts = (() => {
  const M = window.MobileShell;

  function hasReceiptFile(r) {
    return Boolean(
      r.receipt_file_url ||
      r.receipt_url ||
      r.file_url ||
      r.attachment_url ||
      r.upload_url ||
      r.receipt_file_path ||
      r.file_path ||
      r.attachment_path ||
      r.storage_path ||
      r.receipt_filename ||
      r.file_name ||
      r.filename ||
      r.original_filename
    );
  }

  function receiptFileLabel(r) {
    const label = r.receipt_filename || r.file_name || r.filename || r.original_filename;
    if (label) return M.esc(label);

    const path = r.receipt_file_path || r.file_path || r.attachment_path || r.storage_path || r.receipt_file_url || r.receipt_url || r.file_url || r.attachment_url || r.upload_url;
    if (!path) return 'No receipt file attached';

    const cleanPath = String(path).split('?')[0];
    const lastPart = cleanPath.split('/').filter(Boolean).pop();
    return M.esc(lastPart || 'Receipt attached');
  }

  function receiptFileUrl(r) {
    return r.receipt_file_url || r.receipt_url || r.file_url || r.attachment_url || r.upload_url || null;
  }

  function cycleLabel(r) {
    const c = r.USAF_cycles;
    if (!c) return 'No cycle linked';
    return `${M.dt(c.start_date)} - ${M.dt(c.end_date)}`;
  }

  function tourLabel(r) {
    return r.USAF_cycles?.USAF_tours?.tour_name || 'No tour linked';
  }

  function receiptTypeLabel(r) {
    return r.USAF_receipt_types?.name || r.receipt_type || r.scope || 'Receipt';
  }

  function receiptCard(r) {
    const attached = hasReceiptFile(r);
    const url = receiptFileUrl(r);
    const fileText = receiptFileLabel(r);
    const fileLine = attached
      ? (url
        ? `<a class="mobile-meta-link" href="${M.esc(url)}" target="_blank" rel="noopener">📎 ${fileText}</a>`
        : `<span class="mobile-meta-pill">📎 ${fileText}</span>`)
      : `<span class="mobile-muted">No receipt file attached</span>`;

    return `
      <article class="mobile-card receipt-card" data-receipt-id="${M.esc(r.id)}">
        <div class="mobile-card-row mobile-card-row-top">
          <div>
            <div class="mobile-card-title">${attached ? '📎 ' : ''}${M.esc(r.customer || receiptTypeLabel(r))}</div>
            <div class="mobile-card-subtitle">${M.esc(receiptTypeLabel(r))}</div>
          </div>
          <div class="mobile-card-amount">${M.money(r.amount)}</div>
        </div>
        <div class="mobile-card-grid">
          <div><span>Date</span><strong>${M.dt(r.receipt_date)}</strong></div>
          <div><span>Cycle</span><strong>${cycleLabel(r)}</strong></div>
          <div><span>Tour</span><strong>${M.esc(tourLabel(r))}</strong></div>
          <div><span>File</span><strong>${fileLine}</strong></div>
        </div>
        ${r.notes ? `<div class="mobile-card-notes"><span>Notes</span>${M.esc(r.notes)}</div>` : ''}
      </article>`;
  }

  async function renderReceipts(){
    const { data, error } = await M.supa()
      .from('USAF_receipts')
      .select('*,USAF_receipt_types(name),USAF_cycles(id,tour_id,start_date,end_date,USAF_tours(id,tour_name,location))')
      .eq('user_id', M.getUser().id)
      .order('receipt_date', { ascending:false });

    if (error) throw error;
    const rows = data || [];
    const total = rows.reduce((sum, r) => sum + Number(r.amount || 0), 0);
    const attachedCount = rows.filter(hasReceiptFile).length;

    M.getContent().innerHTML = `
      <section class="mobile-page-head">
        <h1>My Receipts</h1>
        <div class="mobile-summary-line">
          <span>${rows.length} receipt${rows.length === 1 ? '' : 's'}</span>
          <span>${M.money(total)}</span>
          <span>📎 ${attachedCount} attached</span>
        </div>
      </section>
      <section class="mobile-card-list">
        ${rows.length ? rows.map(receiptCard).join('') : '<p class="mobile-empty">No receipts yet.</p>'}
      </section>`;
  }

  M.registerPage('receipts', renderReceipts);
  return { renderReceipts, hasReceiptFile, receiptFileLabel, receiptCard };
})();
