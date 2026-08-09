// Mobile voucher logic only v70
window.MobileVouchers = (() => {
  const M = window.MobileShell;

  async function renderVouchers(){
    const { data, error } = await M.supa().from('USAF_vouchers').select('*').eq('user_id', M.getUser().id).order('created_at', { ascending:false });
    if (error) throw error;
    const rows = data || [];
    M.getContent().innerHTML = `<div class="toolbar"><strong>Voucher Packages</strong><button class="btn" id="newVoucherBtn">+ Package</button></div><div id="form"></div>
      <div class="card-list">${rows.length ? rows.map(v => `<article class="data-card"><strong>${M.dt(v.date_from)} - ${M.dt(v.date_to)}</strong><span>${v.receipt_count || 0} receipts | ${M.money(v.total_amount)}</span><span>${M.esc(v.status || 'created')}</span></article>`).join('') : '<div class="empty-card">No voucher packages yet.</div>'}</div>`;
    document.getElementById('newVoucherBtn').onclick = renderVoucherForm;
  }

  function renderVoucherForm(){
    const wrap = document.getElementById('form');
    wrap.innerHTML = `<form class="form-card" id="voucherForm"><strong>New Voucher Package</strong>
      <label>Date From<input id="date_from" type="date" required></label>
      <label>Date To<input id="date_to" type="date" required></label>
      <button class="btn full" type="submit">Create Package Record</button>
      <button class="btn secondary full" type="button" id="cancelVoucherBtn">Cancel</button>
    </form>`;
    document.getElementById('cancelVoucherBtn').onclick = () => wrap.innerHTML = '';
    document.getElementById('voucherForm').onsubmit = saveVoucher;
  }

  async function saveVoucher(e){
    e.preventDefault();
    const dateFrom = document.getElementById('date_from').value;
    const dateTo = document.getElementById('date_to').value;
    if (dateTo < dateFrom) return alert('Date To cannot be before Date From.');
    const { data:rs, error:receiptError } = await M.supa().from('USAF_receipts').select('amount').eq('user_id', M.getUser().id).gte('receipt_date', dateFrom).lte('receipt_date', dateTo);
    if (receiptError) return alert(receiptError.message);
    const receipts = rs || [];
    const payload = { user_id:M.getUser().id, date_from:dateFrom, date_to:dateTo, status:'created', receipt_count:receipts.length, total_amount:receipts.reduce((a,r)=>a+Number(r.amount||0),0) };
    const { error } = await M.supa().from('USAF_vouchers').insert(payload);
    if (error) return alert(error.message);
    await renderVouchers();
  }

  M.registerPage('vouchers', renderVouchers);
  return { renderVouchers };
})();
