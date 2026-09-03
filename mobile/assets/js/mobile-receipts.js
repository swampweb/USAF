// Mobile receipt validation and preview v134
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

  function showReceiptMessage(title, message){
    document.querySelector('.mobile-receipt-message-backdrop')?.remove();
    const modal=document.createElement('div');
    modal.className='mobile-receipt-message-backdrop';
    modal.innerHTML=`<section class="mobile-receipt-message"><div class="mobile-receipt-message-icon">!</div><h2>${M.esc(title)}</h2><p>${M.esc(message)}</p><button class="btn full" type="button" data-close-message>Return to Receipt</button></section>`;
    document.body.appendChild(modal);
    modal.querySelector('[data-close-message]').onclick=()=>modal.remove();
  }
  function requireCustomerVendor(){
    const input=document.getElementById('mobileReceiptCustomer');
    if(!input) return false;
    if(input.value.trim()){ input.classList.remove('mobile-field-invalid'); return true; }
    input.classList.add('mobile-field-invalid');
    let error=document.getElementById('mobileReceiptCustomerError');
    if(!error){ error=document.createElement('small'); error.id='mobileReceiptCustomerError'; error.className='mobile-field-error'; input.insertAdjacentElement('afterend',error); }
    error.textContent='Customer / Vendor is required. Enter the business or vendor shown on the receipt.';
    showReceiptMessage('Customer / Vendor Required','Enter the business or vendor shown on the receipt before saving.');
    input.focus(); input.scrollIntoView({behavior:'smooth',block:'center'});
    input.addEventListener('input',()=>{if(input.value.trim()){input.classList.remove('mobile-field-invalid');error.textContent='';}},{once:true});
    return false;
  }
  async function showReceiptPreview(id){
    const r=rows.find(x=>x.id===id); if(!r) return;
    try{
      let previewUrl=receiptFileUrl(r);
      if(!previewUrl&&r.file_path){const bucket=r.file_bucket||window.USAF_CONFIG?.STORAGE_BUCKET||'usaf-receipts';const signed=await M.supa().storage.from(bucket).createSignedUrl(r.file_path,600);if(signed.error)throw signed.error;previewUrl=signed.data?.signedUrl;}
      if(!previewUrl)return showReceiptMessage('No Receipt File','No attachment is available for this receipt.');
      const modal=document.createElement('div');modal.className='mobile-receipt-modal-backdrop';
      const isImage=String(r.file_mime_type||'').startsWith('image/')||/\.(png|jpe?g|webp)(\?|$)/i.test(previewUrl);
      modal.innerHTML=`<section class="mobile-receipt-modal"><div class="mobile-receipt-modal-head"><strong>Receipt Preview</strong><button data-close-preview></button></div><div class="mobile-receipt-preview-body">${isImage?`<img class="mobile-receipt-preview-image" src="${M.esc(previewUrl)}" alt="Receipt attachment preview">`:`<iframe class="mobile-receipt-preview-frame" src="${M.esc(previewUrl)}"></iframe>`}</div><div class="mobile-receipt-modal-actions"><a class="btn secondary" href="${M.esc(previewUrl)}" target="_blank">Open Full Size</a><button class="btn" data-close-preview>Close</button></div></section>`;
      document.body.appendChild(modal);modal.querySelectorAll('[data-close-preview]').forEach(b=>b.onclick=()=>modal.remove());
    }catch(err){showReceiptMessage('Preview Failed',err.message||String(err));}
  }
  async function renderReceipts(){
    const { data, error } = await M.supa().from('USAF_receipts').select('*,USAF_receipt_types(name),USAF_tours(id,tour_name,location),USAF_cycles(id,tour_id,start_date,end_date,USAF_tours(id,tour_name,location))').eq('user_id', M.getUser().id).order('receipt_date', { ascending:false });
    if (error) throw error;
    const rows = data || [];
    const total = rows.reduce((sum, r) => sum + Number(r.amount || 0), 0);
    const attachedCount = rows.filter(hasReceiptFile).length;
    M.getContent().innerHTML = `<div class="toolbar"><strong>My Receipts</strong><span class="badge-pill">${rows.length} • ${M.money(total)}</span></div><section class="summary-grid compact"><div class="kpi-card"><span>Receipts</span><strong>${rows.length}</strong><small>Total count</small></div><div class="kpi-card"><span>Total</span><strong>${M.money(total)}</strong><small>Receipt amount</small></div><div class="kpi-card"><span>Files</span><strong>📎 ${attachedCount}</strong><small>Attached</small></div></section><div class="card-list">${rows.length ? rows.map(receiptCard).join('') : '<div class="empty-card">No receipts yet.</div>'}</div>`;
    M.getContent().querySelectorAll('[data-preview-receipt]').forEach(button=>button.addEventListener('click',()=>showReceiptPreview(button.dataset.previewReceipt)));
  }
  document.addEventListener('submit',event=>{if(event.target?.id==='mobileReceiptForm'&&!requireCustomerVendor()){event.preventDefault();event.stopImmediatePropagation();}},true);
  M.registerPage('receipts', renderReceipts);
  return { renderReceipts, hasReceiptFile, receiptFileLabel, receiptCard };
})();
