// Orders & Travel Tracker - Tour Archive Manager v120
(function () {
  const contentId = 'archiveManagerContent';
  let currentTab = 'inactive';
  let toursCache = [];
  let profilesCache = [];

  function sb() { return window.usafSupabase; }
  function $(id) { return document.getElementById(id); }
  function esc(v) { return String(v ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c])); }
  function dt(v) { if (!v) return 'Not set'; try { return new Date(String(v) + 'T00:00:00').toLocaleDateString(); } catch { return String(v); } }
  function money(v) { return Number(v || 0).toLocaleString(undefined, { style:'currency', currency:'USD' }); }
  function safeFileName(v) { return String(v || 'archive').replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^_+|_+$/g, ''); }
  function activeStatus(status) { return ['active','planned'].includes(String(status || '').toLowerCase()); }
  function profileName(userId) { const p = profilesCache.find(x => x.id === userId); return p?.display_name || p?.email || 'Unknown User'; }
  function profileEmail(userId) { const p = profilesCache.find(x => x.id === userId); return p?.email || ''; }

  function showMessage(title, message, type = 'info') {
    document.querySelector('.archive-message-backdrop')?.remove();
    const modal = document.createElement('div');
    modal.className = 'archive-message-backdrop';
    modal.innerHTML = `<div class="archive-message-modal" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="archive-message-icon ${type === 'danger' ? 'danger' : ''}">${type === 'danger' ? '!' : 'i'}</div>
      <h2>${esc(title)}</h2>
      <p class="muted">${esc(message)}</p>
      <div class="actions" style="justify-content:flex-end;margin-top:16px">
        <button class="btn" type="button" data-close-archive-message>OK</button>
      </div>
    </div>`;
    document.body.appendChild(modal);
    modal.querySelector('[data-close-archive-message]')?.addEventListener('click', () => modal.remove());
    modal.addEventListener('click', event => { if (event.target === modal) modal.remove(); });
  }

  function confirmModal({ title, message, panelLines = [], confirmText = 'Confirm', danger = false, requireCheck = false }) {
    return new Promise(resolve => {
      document.querySelector('.archive-message-backdrop')?.remove();
      const modal = document.createElement('div');
      modal.className = 'archive-message-backdrop';
      const checkHtml = requireCheck ? `<label style="display:flex;gap:8px;align-items:flex-start;margin-top:12px;font-weight:900"><input type="checkbox" id="archiveVerifyCheck" style="width:auto;min-height:auto;margin-top:3px"> I verified the downloaded archive ZIP contains the Tour Summary PDF and all receipt attachments.</label>` : '';
      modal.innerHTML = `<div class="archive-message-modal" role="dialog" aria-modal="true" aria-label="${esc(title)}">
        <div class="archive-message-icon ${danger ? 'danger' : ''}">${danger ? '!' : 'i'}</div>
        <h2>${esc(title)}</h2>
        <p class="muted">${esc(message)}</p>
        ${panelLines.length ? `<div class="archive-message-panel">${panelLines.map(line => `<div>${line}</div>`).join('')}</div>` : ''}
        ${checkHtml}
        <div class="actions" style="justify-content:flex-end;margin-top:16px">
          <button class="btn secondary" type="button" data-cancel-archive>Cancel</button>
          <button class="btn ${danger ? 'danger' : ''}" type="button" data-confirm-archive ${requireCheck ? 'disabled' : ''}>${esc(confirmText)}</button>
        </div>
      </div>`;
      const close = value => { modal.remove(); resolve(value); };
      document.body.appendChild(modal);
      const confirmBtn = modal.querySelector('[data-confirm-archive]');
      modal.querySelector('#archiveVerifyCheck')?.addEventListener('change', e => { confirmBtn.disabled = !e.target.checked; });
      modal.querySelector('[data-cancel-archive]')?.addEventListener('click', () => close(false));
      confirmBtn?.addEventListener('click', () => close(true));
      modal.addEventListener('click', event => { if (event.target === modal) close(false); });
    });
  }

  function loadScriptOnce(src, testFn) {
    return new Promise((resolve, reject) => {
      if (testFn()) return resolve();
      const found = document.querySelector(`script[data-dynamic-src="${src}"]`);
      if (found) { found.addEventListener('load', resolve); found.addEventListener('error', reject); return; }
      const script = document.createElement('script');
      script.src = src;
      script.defer = true;
      script.dataset.dynamicSrc = src;
      script.onload = resolve;
      script.onerror = () => reject(new Error('Could not load archive package library.'));
      document.head.appendChild(script);
    });
  }

  async function ensureLibs() {
    await loadScriptOnce('https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js', () => !!window.JSZip);
    await loadScriptOnce('https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js', () => !!window.jspdf?.jsPDF);
  }

  async function loadData() {
    const [{ data: profiles, error: profileError }, { data: tours, error: tourError }] = await Promise.all([
      sb().from('USAF_profiles').select('id,display_name,email,role').order('display_name', { ascending:true }),
      sb().from('USAF_tours').select('*').order('orders_start_date', { ascending:false })
    ]);
    if (profileError) throw profileError;
    if (tourError) throw tourError;
    profilesCache = profiles || [];
    toursCache = tours || [];
  }

  function eligibleTours() {
    return toursCache.filter(t => !activeStatus(t.status) && t.archived !== true);
  }

  function archivedTours() {
    return toursCache.filter(t => t.archived === true || ['archived','purged'].includes(String(t.archive_status || '').toLowerCase()));
  }

  function groupByUser(rows) {
    return rows.reduce((acc, tour) => {
      const key = tour.user_id || 'unknown';
      if (!acc[key]) acc[key] = [];
      acc[key].push(tour);
      return acc;
    }, {});
  }

  async function tourStats(tourId) {
    const [{ data: cycles }, { data: receipts }] = await Promise.all([
      sb().from('USAF_cycles').select('id').eq('tour_id', tourId),
      sb().from('USAF_receipts').select('id,file_size_bytes,file_path,file_bucket').eq('tour_id', tourId)
    ]);
    const receiptRows = receipts || [];
    return {
      cycleCount: (cycles || []).length,
      receiptCount: receiptRows.length,
      fileCount: receiptRows.filter(r => r.file_path).length,
      storageBytes: receiptRows.reduce((sum, r) => sum + Number(r.file_size_bytes || 0), 0)
    };
  }

  function render() {
    const root = $(contentId);
    const source = currentTab === 'inactive' ? eligibleTours() : archivedTours();
    if (!source.length) {
      root.innerHTML = `<div class="archive-empty">No ${currentTab === 'inactive' ? 'inactive Tours eligible for archive' : 'archived Tours ready for review or purge'}.</div>`;
      return;
    }
    const grouped = groupByUser(source);
    root.innerHTML = Object.entries(grouped).map(([userId, tours]) => `
      <div class="archive-user-group">
        <div class="archive-user-heading">${esc(profileName(userId))}${profileEmail(userId) ? ` <span class="muted">${esc(profileEmail(userId))}</span>` : ''}</div>
        ${tours.map(tourCardHtml).join('')}
      </div>`).join('');
    root.querySelectorAll('[data-create-archive]').forEach(btn => btn.addEventListener('click', () => createArchivePackage(btn.dataset.createArchive)));
    root.querySelectorAll('[data-confirm-archive]').forEach(btn => btn.addEventListener('click', () => confirmArchive(btn.dataset.confirmArchive)));
    root.querySelectorAll('[data-purge-archive]').forEach(btn => btn.addEventListener('click', () => purgeArchive(btn.dataset.purgeArchive)));
  }

  function tourCardHtml(t) {
    const status = String(t.archive_status || t.status || 'inactive');
    const packageCreated = String(t.archive_status || '').toLowerCase() === 'package_created';
    const archived = t.archived === true || String(t.archive_status || '').toLowerCase() === 'archived';
    const purged = String(t.archive_status || '').toLowerCase() === 'purged';
    const actions = purged
      ? `<span class="archive-pill">Purged</span>`
      : archived
        ? `<button class="btn danger" type="button" data-purge-archive="${esc(t.id)}">Purge Records</button>`
        : packageCreated
          ? `<button class="btn danger" type="button" data-confirm-archive="${esc(t.id)}">Confirm Archive</button><button class="btn secondary" type="button" data-create-archive="${esc(t.id)}">Re-Download ZIP</button>`
          : `<button class="btn" type="button" data-create-archive="${esc(t.id)}">Create Archive Package</button>`;
    return `<article class="archive-card ${archived ? 'archive-danger-zone' : ''}">
      <div>
        <h3>${esc(t.tour_name || t.location || 'Tour')}</h3>
        <div class="meta">
          <span class="archive-pill">${esc(t.location || 'No location')}</span>
          <span class="archive-pill">${dt(t.orders_start_date)} - ${dt(t.orders_end_date)}</span>
          <span class="archive-pill">Status: ${esc(status)}</span>
          ${t.archive_package_name ? `<span class="archive-pill">Package: ${esc(t.archive_package_name)}</span>` : ''}
        </div>
      </div>
      <div class="archive-actions">${actions}</div>
    </article>`;
  }

  async function getTourBundle(tourId) {
    const tour = toursCache.find(t => t.id === tourId) || (await sb().from('USAF_tours').select('*').eq('id', tourId).single()).data;
    if (!tour) throw new Error('Tour not found.');
    const [{ data: cycles, error: cycleError }, { data: receipts, error: receiptError }] = await Promise.all([
      sb().from('USAF_cycles').select('*').eq('tour_id', tourId).order('start_date'),
      sb().from('USAF_receipts').select('*, USAF_receipt_types(name)').eq('tour_id', tourId).order('receipt_date', { ascending:true })
    ]);
    if (cycleError) throw cycleError;
    if (receiptError) throw receiptError;
    return { tour, cycles: cycles || [], receipts: receipts || [], userName: profileName(tour.user_id), userEmail: profileEmail(tour.user_id) };
  }

  function buildSummaryPdfBlob(bundle, stats) {
    const jsPDF = window.jspdf.jsPDF;
    const doc = new jsPDF({ unit:'pt', format:'letter' });
    let y = 42;
    const line = (text, size = 10, weight = 'normal') => {
      doc.setFont('helvetica', weight);
      doc.setFontSize(size);
      doc.text(String(text), 42, y);
      y += size + 8;
      if (y > 740) { doc.addPage(); y = 42; }
    };
    line('Tour Archive Summary', 18, 'bold');
    line(`Generated: ${new Date().toLocaleString()}`);
    line(`User: ${bundle.userName} ${bundle.userEmail ? '(' + bundle.userEmail + ')' : ''}`);
    line(`Tour: ${bundle.tour.tour_name || bundle.tour.location || 'Tour'}`, 12, 'bold');
    line(`Location: ${bundle.tour.location || 'No location'}`);
    line(`Orders Number: ${bundle.tour.orders_number || 'Not set'}`);
    line(`Dates: ${dt(bundle.tour.orders_start_date)} - ${dt(bundle.tour.orders_end_date)}`);
    line(`Cycles: ${stats.cycleCount} | Receipts: ${stats.receiptCount} | Files: ${stats.fileCount}`);
    y += 8;
    line('Cycles', 13, 'bold');
    bundle.cycles.forEach(c => line(`${dt(c.start_date)} - ${dt(c.end_date)} | ${money(c.per_diem_per_day)}/day | ${c.status || 'active'}`));
    y += 8;
    line('Receipts', 13, 'bold');
    bundle.receipts.forEach((r, index) => line(`${index + 1}. ${r.customer || r.USAF_receipt_types?.name || 'Receipt'} | ${dt(r.receipt_date)} | ${money(r.amount)} | ${r.file_name || 'No file'}`));
    return doc.output('blob');
  }

  async function addReceiptFileToZip(zip, receipt, index) {
    const bucket = receipt.file_bucket || window.USAF_CONFIG?.STORAGE_BUCKET;
    const path = receipt.file_path;
    if (!bucket || !path) return false;
    const signed = await sb().storage.from(bucket).createSignedUrl(path, 60 * 10);
    if (signed.error) throw signed.error;
    const response = await fetch(signed.data.signedUrl);
    if (!response.ok) throw new Error(`Could not download receipt file ${receipt.file_name || path}.`);
    const blob = await response.blob();
    const name = safeFileName(`${String(index + 1).padStart(3,'0')}_${receipt.file_name || path.split('/').pop()}`);
    zip.file(`Receipts/${name}`, blob);
    return true;
  }

  async function createArchivePackage(tourId) {
    try {
      await ensureLibs();
      const bundle = await getTourBundle(tourId);
      const stats = await tourStats(tourId);
      const zip = new window.JSZip();
      const packageName = `Archive_${safeFileName(bundle.userName)}_${safeFileName(bundle.tour.tour_name || bundle.tour.location || 'Tour')}_${new Date().toISOString().slice(0,10)}.zip`;
      zip.file('Tour_Summary.pdf', buildSummaryPdfBlob(bundle, stats));
      zip.file('Archive_Record.json', JSON.stringify({ generated_at:new Date().toISOString(), package_name:packageName, tour:bundle.tour, stats }, null, 2));
      let attached = 0;
      for (let i = 0; i < bundle.receipts.length; i++) {
        if (await addReceiptFileToZip(zip, bundle.receipts[i], i)) attached++;
      }
      const blob = await zip.generateAsync({ type:'blob' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = packageName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      await sb().from('USAF_tours').update({ archive_status:'package_created', archive_package_name:packageName }).eq('id', tourId);
      await sb().from('USAF_archive_log').insert({
        tour_id: tourId,
        target_user_id: bundle.tour.user_id,
        tour_name: bundle.tour.tour_name || bundle.tour.location || 'Tour',
        action: 'package_created',
        archive_package_name: packageName,
        receipt_count: bundle.receipts.length,
        file_count: attached,
        storage_size_bytes: stats.storageBytes,
        details: { stats }
      });
      showMessage('Archive Package Created', 'The ZIP package was downloaded. Open the ZIP and verify the summary PDF and receipt attachments before confirming archive.');
      await loadData();
      render();
    } catch (err) {
      console.error(err);
      showMessage('Archive Package Failed', err.message || String(err), 'danger');
    }
  }

  async function confirmArchive(tourId) {
    const bundle = await getTourBundle(tourId);
    const ok = await confirmModal({
      title: 'Confirm Archive',
      message: 'Only confirm after verifying the downloaded archive ZIP contains the Tour Summary PDF and all receipt attachments.',
      panelLines: [`<strong>Tour:</strong> ${esc(bundle.tour.tour_name || bundle.tour.location || 'Tour')}`, `<strong>User:</strong> ${esc(bundle.userName)}`],
      confirmText: 'Confirm Archive',
      danger: true,
      requireCheck: true
    });
    if (!ok) return;
    const user = await getCurrentUser();
    const { error } = await sb().from('USAF_tours').update({ archived:true, archived_at:new Date().toISOString(), archived_by:user.id, archive_status:'archived' }).eq('id', tourId);
    if (error) return showMessage('Confirm Archive Failed', error.message, 'danger');
    await sb().from('USAF_archive_log').insert({ tour_id:tourId, target_user_id:bundle.tour.user_id, tour_name:bundle.tour.tour_name || bundle.tour.location || 'Tour', action:'confirmed_archive', archive_package_name:bundle.tour.archive_package_name || null, confirmed_at:new Date().toISOString(), confirmed_by:user.id });
    showMessage('Tour Archived', 'The Tour is now archived and hidden from normal active workflows. It can now be purged by an Admin if needed.');
    await loadData();
    currentTab = 'archived';
    setTabs();
    render();
  }

  async function purgeArchive(tourId) {
    const bundle = await getTourBundle(tourId);
    const ok = await confirmModal({
      title: 'Purge Archived Tour?',
      message: 'This permanently removes the archived Tour records and receipt files from active storage. Only do this after the archive package has been verified and retained.',
      panelLines: [`<strong>Tour:</strong> ${esc(bundle.tour.tour_name || bundle.tour.location || 'Tour')}`, `<strong>User:</strong> ${esc(bundle.userName)}`, '<strong>Action:</strong> Permanent purge'],
      confirmText: 'Purge Records',
      danger: true,
      requireCheck: true
    });
    if (!ok) return;
    try {
      const user = await getCurrentUser();
      const stats = await tourStats(tourId);
      const byBucket = {};
      bundle.receipts.forEach(r => {
        const bucket = r.file_bucket || window.USAF_CONFIG?.STORAGE_BUCKET;
        if (bucket && r.file_path) {
          if (!byBucket[bucket]) byBucket[bucket] = [];
          byBucket[bucket].push(r.file_path);
        }
      });
      for (const [bucket, paths] of Object.entries(byBucket)) {
        if (paths.length) await sb().storage.from(bucket).remove(paths);
      }
      await sb().from('USAF_receipts').delete().eq('tour_id', tourId);
      await sb().from('USAF_cycles').delete().eq('tour_id', tourId);
      await sb().from('USAF_tours').delete().eq('id', tourId);
      await sb().from('USAF_archive_log').insert({ tour_id:tourId, target_user_id:bundle.tour.user_id, tour_name:bundle.tour.tour_name || bundle.tour.location || 'Tour', action:'purged', archive_package_name:bundle.tour.archive_package_name || null, storage_size_bytes:stats.storageBytes, receipt_count:bundle.receipts.length, file_count:bundle.receipts.filter(r => r.file_path).length, confirmed_at:new Date().toISOString(), confirmed_by:user.id, details:{ purged_storage_paths:byBucket } });
      showMessage('Archived Tour Purged', 'The archived Tour records and receipt storage files were removed. The archive log record remains.');
      await loadData();
      render();
    } catch (err) {
      console.error(err);
      showMessage('Purge Failed', err.message || String(err), 'danger');
    }
  }

  function setTabs() {
    document.querySelectorAll('[data-archive-tab]').forEach(btn => btn.classList.toggle('active', btn.dataset.archiveTab === currentTab));
  }

  async function init() {
    await requireAdmin();
    await renderLayout('Tour Archive Manager');
    document.querySelectorAll('[data-archive-tab]').forEach(btn => btn.addEventListener('click', () => { currentTab = btn.dataset.archiveTab; setTabs(); render(); }));
    $('refreshArchiveBtn')?.addEventListener('click', async () => { await loadData(); render(); });
    $(contentId).innerHTML = '<div class="archive-empty">Loading archive candidates...</div>';
    await loadData();
    render();
  }

  init().catch(err => {
    console.error(err);
    document.body.style.visibility = 'visible';
    const root = $(contentId) || document.body;
    root.innerHTML = `<div class="archive-empty">Tour Archive Manager failed to load: ${esc(err.message || err)}</div>`;
  });
})();
