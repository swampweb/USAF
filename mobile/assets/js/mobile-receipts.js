// Mobile Receipts Tour Selection and CRUD v133
window.MobileReceipts = (() => {
  const M = window.MobileShell;
  let tours = [];
  let receipts = [];
  let receiptTypes = [];
  let cycles = [];
  let selectedTourId = '';

  function hasFile(receipt) {
    return Boolean(receipt.file_path || receipt.file_url || receipt.receipt_file_url || receipt.file_name);
  }

  function typeLabel(receipt) {
    return receipt.USAF_receipt_types?.name || receipt.scope || 'Receipt';
  }

  async function loadData() {
    const userId = M.getUser().id;
    let tourResult = await M.supa().from('USAF_tour_summary').select('*').eq('user_id', userId).order('orders_start_date', { ascending: false });
    if (tourResult.error) tourResult = await M.supa().from('USAF_tours').select('*').eq('user_id', userId).order('orders_start_date', { ascending: false });
    if (tourResult.error) throw tourResult.error;

    tours = (tourResult.data || []).filter(tour => tour.archived !== true && String(tour.archive_status || '').toLowerCase() !== 'archived');
    if (!selectedTourId || !tours.some(tour => tour.id === selectedTourId)) selectedTourId = tours[0]?.id || '';

    const typeResult = await M.supa().from('USAF_receipt_types').select('*').order('name');
    if (typeResult.error) throw typeResult.error;
    receiptTypes = typeResult.data || [];

    if (!selectedTourId) {
      cycles = [];
      receipts = [];
      return;
    }

    const [cycleResult, receiptResult] = await Promise.all([
      M.supa().from('USAF_cycles').select('*').eq('user_id', userId).eq('tour_id', selectedTourId).order('start_date'),
      M.supa().from('USAF_receipts')
        .select('*,USAF_receipt_types(name),USAF_cycles(start_date,end_date),USAF_tours(tour_name,location)')
        .eq('user_id', userId)
        .eq('tour_id', selectedTourId)
        .order('receipt_date', { ascending: false })
    ]);
    if (cycleResult.error) throw cycleResult.error;
    if (receiptResult.error) throw receiptResult.error;
    cycles = cycleResult.data || [];
    receipts = receiptResult.data || [];
  }

  function receiptCard(receipt) {
    const cycleText = receipt.USAF_cycles ? `${M.dt(receipt.USAF_cycles.start_date)} - ${M.dt(receipt.USAF_cycles.end_date)}` : 'No cycle linked';
    return `<article class="data-card receipt-card ${hasFile(receipt) ? 'has-file' : ''}">
      <div class="card-title-row"><strong>${hasFile(receipt) ? '📎 ' : ''}${M.esc(receipt.customer || typeLabel(receipt))}</strong><b>${M.money(receipt.amount)}</b></div>
      <span>${M.esc(typeLabel(receipt))}</span>
      <div class="data-row"><span>Date</span><b>${M.dt(receipt.receipt_date)}</b></div>
      <div class="data-row"><span>Cycle</span><b>${cycleText}</b></div>
      <div class="data-row"><span>File</span><b>${receipt.file_name ? `📎 ${M.esc(receipt.file_name)}` : 'No file attached'}</b></div>
      ${receipt.notes ? `<span class="muted">${M.esc(receipt.notes)}</span>` : ''}
      <div class="mobile-receipt-actions">
        <button class="btn secondary" type="button" data-edit-receipt="${M.esc(receipt.id)}">Edit</button>
        <button class="btn danger" type="button" data-delete-receipt="${M.esc(receipt.id)}">Delete</button>
      </div>
    </article>`;
  }

  async function renderReceipts() {
    await loadData();
    const total = receipts.reduce((sum, receipt) => sum + Number(receipt.amount || 0), 0);
    const files = receipts.filter(hasFile).length;

    M.getContent().innerHTML = `
      <section class="mobile-receipt-toolbar-card">
        <label>Select Tour
          <select id="mobileReceiptTourSelect">
            ${tours.map(tour => `<option value="${M.esc(tour.id)}" ${tour.id === selectedTourId ? 'selected' : ''}>${M.esc(tour.tour_name || tour.location || 'Tour')} (${M.dt(tour.orders_start_date)} - ${M.dt(tour.orders_end_date)})</option>`).join('')}
          </select>
        </label>
        <button class="btn full" type="button" id="mobileAddReceiptBtn" ${selectedTourId ? '' : 'disabled'}>+ Add Receipt</button>
      </section>
      <div class="toolbar"><strong>Tour Receipts</strong><span class="badge-pill">${receipts.length} • ${M.money(total)}</span></div>
      <section class="summary-grid compact">
        <div class="kpi-card"><span>Receipts</span><strong>${receipts.length}</strong><small>Total count</small></div>
        <div class="kpi-card"><span>Total</span><strong>${M.money(total)}</strong><small>Receipt amount</small></div>
        <div class="kpi-card"><span>Files</span><strong>📎 ${files}</strong><small>Attached</small></div>
      </section>
      <div id="mobileReceiptFormHost"></div>
      <div class="card-list">${receipts.length ? receipts.map(receiptCard).join('') : '<div class="empty-card">No receipts for this Tour yet.</div>'}</div>`;

    document.getElementById('mobileReceiptTourSelect')?.addEventListener('change', async event => {
      selectedTourId = event.target.value;
      await renderReceipts();
    });
    document.getElementById('mobileAddReceiptBtn')?.addEventListener('click', () => showReceiptForm());
    M.getContent().querySelectorAll('[data-edit-receipt]').forEach(button => button.addEventListener('click', () => showReceiptForm(receipts.find(receipt => receipt.id === button.dataset.editReceipt))));
    M.getContent().querySelectorAll('[data-delete-receipt]').forEach(button => button.addEventListener('click', () => deleteReceipt(button.dataset.deleteReceipt)));
  }

  function typeOptions(selectedTypeId = '') {
    return '<option value="">Select Type</option>' + receiptTypes.map(type => `<option value="${M.esc(type.id)}" ${String(type.id) === String(selectedTypeId) ? 'selected' : ''}>${M.esc(type.name)}</option>`).join('');
  }

  function cycleOptions(selectedCycleId = '') {
    return '<option value="">Select Cycle</option>' + cycles.map(cycle => `<option value="${M.esc(cycle.id)}" ${String(cycle.id) === String(selectedCycleId) ? 'selected' : ''}>${M.dt(cycle.start_date)} - ${M.dt(cycle.end_date)} (${M.money(cycle.per_diem_per_day)}/day)</option>`).join('');
  }

  function showReceiptForm(receipt = null) {
    const host = document.getElementById('mobileReceiptFormHost');
    const selectedTour = tours.find(tour => tour.id === selectedTourId);
    if (!host) return;

    host.innerHTML = `<section class="form-card mobile-receipt-form-card">
      <div class="card-title-row"><strong>${receipt ? 'Edit Receipt' : 'Add Receipt'}</strong><button class="back-link" type="button" id="mobileCloseReceiptForm">Close</button></div>
      <form id="mobileReceiptForm">
        <label>Scope
          <select id="mobileReceiptScope"><option value="per_diem" ${receipt?.scope !== 'other' ? 'selected' : ''}>Per Diem</option><option value="other" ${receipt?.scope === 'other' ? 'selected' : ''}>Other</option></select>
        </label>
        <label>Receipt Type<select id="mobileReceiptType" required>${typeOptions(receipt?.type_id)}</select></label>
        <label id="mobileReceiptCycleLabel">Cycle<select id="mobileReceiptCycle">${cycleOptions(receipt?.cycle_id)}</select></label>
        <label>Customer / Vendor<input id="mobileReceiptCustomer" value="${M.esc(receipt?.customer || '')}" placeholder="Optional"></label>
        <div class="form-two">
          <label>Date<input id="mobileReceiptDate" type="date" min="${M.esc(selectedTour?.orders_start_date || '')}" max="${M.esc(selectedTour?.orders_end_date || '')}" value="${M.esc(receipt?.receipt_date || selectedTour?.orders_start_date || '')}" required></label>
          <label>Amount<input id="mobileReceiptAmount" type="number" min="0" step="0.01" value="${M.esc(receipt?.amount || '')}" required></label>
        </div>
        <label>Notes<textarea id="mobileReceiptNotes">${M.esc(receipt?.notes || '')}</textarea></label>
        <label>Attachment<input id="mobileReceiptFile" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.heic"></label>
        ${receipt?.file_name ? `<div class="notice">Current file: ${M.esc(receipt.file_name)}</div>` : ''}
        <button class="btn full" type="submit" id="mobileSaveReceiptButton">${receipt ? 'Update Receipt' : 'Save Receipt'}</button>
      </form>
    </section>`;

    const updateCycleVisibility = () => {
      document.getElementById('mobileReceiptCycleLabel').style.display = document.getElementById('mobileReceiptScope').value === 'per_diem' ? 'grid' : 'none';
    };
    document.getElementById('mobileReceiptScope').addEventListener('change', updateCycleVisibility);
    updateCycleVisibility();
    document.getElementById('mobileCloseReceiptForm').addEventListener('click', () => { host.innerHTML = ''; });
    document.getElementById('mobileReceiptForm').addEventListener('submit', event => saveReceipt(event, receipt));
    host.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function uploadFile(file, receiptDate) {
    if (!file) return {};
    const bucket = window.USAF_CONFIG?.STORAGE_BUCKET || 'usaf-receipts';
    const safeName = file.name.replaceAll(' ', '_').replace(/[^a-zA-Z0-9._-]/g, '');
    const path = `${M.getUser().id}/receipts/${receiptDate.slice(0, 4)}/${receiptDate.slice(5, 7)}/${Date.now()}_${safeName}`;
    const result = await M.supa().storage.from(bucket).upload(path, file, { upsert: false });
    if (result.error) throw result.error;
    return { file_bucket: bucket, file_path: path, file_name: file.name, file_mime_type: file.type, file_size_bytes: file.size };
  }

  async function saveReceipt(event, existingReceipt) {
    event.preventDefault();
    const button = document.getElementById('mobileSaveReceiptButton');
    const scope = document.getElementById('mobileReceiptScope').value;
    const receiptDate = document.getElementById('mobileReceiptDate').value;
    const cycleId = document.getElementById('mobileReceiptCycle').value || null;
    if (scope === 'per_diem' && !cycleId) return alert('Select a Cycle for a Per Diem receipt.');

    try {
      button.disabled = true;
      button.textContent = 'Saving...';
      const file = document.getElementById('mobileReceiptFile').files?.[0];
      const payload = {
        user_id: M.getUser().id,
        tour_id: selectedTourId,
        cycle_id: scope === 'per_diem' ? cycleId : null,
        type_id: document.getElementById('mobileReceiptType').value,
        scope,
        customer: document.getElementById('mobileReceiptCustomer').value.trim() || null,
        receipt_date: receiptDate,
        amount: Number(document.getElementById('mobileReceiptAmount').value || 0),
        notes: document.getElementById('mobileReceiptNotes').value.trim() || null,
        ...await uploadFile(file, receiptDate)
      };
      const result = existingReceipt
        ? await M.supa().from('USAF_receipts').update(payload).eq('id', existingReceipt.id).eq('user_id', M.getUser().id).select('id').single()
        : await M.supa().from('USAF_receipts').insert(payload).select('id').single();
      if (result.error) throw result.error;
      await renderReceipts();
    } catch (error) {
      alert(`Receipt save failed: ${error.message || error}`);
    } finally {
      if (button) { button.disabled = false; button.textContent = existingReceipt ? 'Update Receipt' : 'Save Receipt'; }
    }
  }

  async function deleteReceipt(receiptId) {
    const receipt = receipts.find(item => item.id === receiptId);
    if (!confirm(`Delete receipt "${receipt?.customer || typeLabel(receipt)}"?`)) return;
    if (receipt?.file_path && receipt?.file_bucket) {
      const storageResult = await M.supa().storage.from(receipt.file_bucket).remove([receipt.file_path]);
      if (storageResult.error) return alert(`Receipt file delete failed: ${storageResult.error.message}`);
    }
    const result = await M.supa().from('USAF_receipts').delete().eq('id', receiptId).eq('user_id', M.getUser().id).select('id');
    if (result.error) return alert(`Receipt delete failed: ${result.error.message}`);
    if (!(result.data || []).length) return alert('Receipt was not deleted. Check the Supabase receipt delete policy.');
    await renderReceipts();
  }

  M.registerPage('receipts', renderReceipts);
  return { renderReceipts, hasReceiptFile: hasFile, receiptCard };
})();
