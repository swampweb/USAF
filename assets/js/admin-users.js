// Orders & Travel Tracker Admin Users v128
// Restores original desktop layout behavior and adds View as User.
let usersCache = [];
let selectedUser = null;

let currentAdminUser = null;

function ensureAdminUserModalStyles() {
  if (document.getElementById('adminUserModalStyles')) return;
  const style = document.createElement('style');
  style.id = 'adminUserModalStyles';
  style.textContent = `
    .admin-user-modal-backdrop{position:fixed;inset:0;background:rgba(15,23,42,.56);display:flex;align-items:center;justify-content:center;z-index:10000;padding:18px;}
    .admin-user-modal{width:min(560px,96vw);background:#fff;border:1px solid #dbe5f0;border-radius:22px;box-shadow:0 30px 90px rgba(15,23,42,.28);overflow:hidden;color:#0f172a;}
    .admin-user-modal-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;padding:18px 22px;background:linear-gradient(135deg,#0a2342,#00308f);color:#fff;}
    .admin-user-modal-head h2{margin:0;font-size:22px;color:#fff;}
    .admin-user-modal-head p{margin:4px 0 0;color:#dbeafe;font-size:13px;line-height:1.4;}
    .admin-user-modal-close{border:0;background:rgba(255,255,255,.14);color:#fff;border-radius:999px;width:34px;height:34px;font-size:20px;font-weight:900;cursor:pointer;}
    .admin-user-modal-body{padding:20px 22px;display:grid;gap:14px;}
    .admin-user-modal-summary{border:1px solid #dbe5f0;background:#f8fafc;border-radius:16px;padding:14px;display:grid;gap:6px;}
    .admin-user-modal-summary div{display:flex;justify-content:space-between;gap:12px;font-size:14px;}
    .admin-user-modal-summary span{color:#64748b;font-weight:800;}
    .admin-user-modal-summary b{text-align:right;overflow-wrap:anywhere;}
    .admin-user-modal-warning{border:1px solid #fecdd3;background:#fff1f3;color:#991b1b;border-radius:16px;padding:12px;font-weight:800;line-height:1.45;}
    .admin-user-modal-success{border:1px solid #bbf7d0;background:#f0fdf4;color:#166534;border-radius:16px;padding:12px;font-weight:800;line-height:1.45;}
    .admin-user-modal-actions{display:flex;justify-content:flex-end;gap:10px;flex-wrap:wrap;padding:0 22px 20px;}
    .admin-user-modal-actions .btn.danger{background:#b42318;color:#fff;border:1px solid #b42318;}

    .admin-user-modal-wide{width:min(760px,96vw);}
    .admin-user-data-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;}
    .admin-user-data-tile{border:1px solid #dbe5f0;background:#f8fafc;border-radius:14px;padding:11px;text-align:center;}
    .admin-user-data-tile span{display:block;color:#64748b;font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:.06em;}
    .admin-user-data-tile strong{display:block;margin-top:4px;color:#00308f;font-size:20px;line-height:1;}
    .admin-user-check-row{display:flex;align-items:flex-start;gap:10px;border:1px solid #fed7aa;background:#fff7ed;color:#92400e;border-radius:14px;padding:12px;font-weight:800;line-height:1.4;}
    .admin-user-check-row input{width:auto;margin-top:3px;}
    .admin-user-modal-note{border:1px solid #bfdbfe;background:#eff6ff;color:#1e3a8a;border-radius:16px;padding:12px;font-weight:800;line-height:1.45;}
    @media(max-width:700px){.admin-user-data-grid{grid-template-columns:repeat(2,minmax(0,1fr));}.admin-user-modal-actions{justify-content:stretch}.admin-user-modal-actions .btn{flex:1 1 100%;}}
  `;
  document.head.appendChild(style);
}

function showAdminUserModal({title, message='', body='', confirmText='Close', cancelText='', danger=false, success=false} = {}) {
  ensureAdminUserModalStyles();
  return new Promise(resolve => {
    document.querySelector('.admin-user-modal-backdrop')?.remove();
    const el = document.createElement('div');
    el.className = 'admin-user-modal-backdrop';
    el.innerHTML = `
      <div class="admin-user-modal" role="dialog" aria-modal="true">
        <div class="admin-user-modal-head">
          <div><h2>${escapeHtml(title || 'Message')}</h2>${message ? `<p>${escapeHtml(message)}</p>` : ''}</div>
          <button class="admin-user-modal-close" type="button" data-close>×</button>
        </div>
        <div class="admin-user-modal-body">
          ${success ? `<div class="admin-user-modal-success">${body}</div>` : body}
        </div>
        <div class="admin-user-modal-actions">
          ${cancelText ? `<button class="btn secondary" type="button" data-cancel>${escapeHtml(cancelText)}</button>` : ''}
          <button class="btn ${danger ? 'danger' : 'primary'}" type="button" data-confirm>${escapeHtml(confirmText)}</button>
        </div>
      </div>`;
    document.body.appendChild(el);
    const close = value => { el.remove(); resolve(value); };
    el.querySelector('[data-close]')?.addEventListener('click', () => close(false));
    el.querySelector('[data-cancel]')?.addEventListener('click', () => close(false));
    el.querySelector('[data-confirm]')?.addEventListener('click', () => close(true));
    el.addEventListener('click', e => { if (e.target === el) close(false); });
  });
}

function userSummaryHtml(user) {
  return `<div class="admin-user-modal-summary">
    <div><span>Display Name</span><b>${escapeHtml(user?.display_name || 'User')}</b></div>
    <div><span>Email</span><b>${escapeHtml(user?.email || '')}</b></div>
    <div><span>Role</span><b>${escapeHtml(user?.role || 'user')}</b></div>
    <div><span>Active</span><b>${user?.is_active !== false ? 'Yes' : 'No'}</b></div>
  </div>`;
}


function adminUserStatTilesHtml(stats) {
  return `<div class="admin-user-data-grid">
    <div class="admin-user-data-tile"><span>Tours</span><strong>${Number(stats.tours || 0)}</strong></div>
    <div class="admin-user-data-tile"><span>Cycles</span><strong>${Number(stats.cycles || 0)}</strong></div>
    <div class="admin-user-data-tile"><span>Receipts</span><strong>${Number(stats.receipts || 0)}</strong></div>
    <div class="admin-user-data-tile"><span>Files</span><strong>${Number(stats.files || 0)}</strong></div>
    <div class="admin-user-data-tile"><span>Vouchers</span><strong>${Number(stats.vouchers || 0)}</strong></div>
    <div class="admin-user-data-tile"><span>Help Desk</span><strong>${Number(stats.helpdesk || 0)}</strong></div>
  </div>`;
}

function userHasStoredRecords(stats) {
  return ['tours','cycles','receipts','files','vouchers','helpdesk'].some(key => Number(stats?.[key] || 0) > 0);
}

async function safeRows(table, select = '*', filters = [], order = null) {
  try {
    let query = window.usafSupabase.from(table).select(select);
    filters.forEach(([column, value]) => { query = query.eq(column, value); });
    if (order) query = query.order(order.column, { ascending: order.ascending !== false });
    const { data, error } = await query;
    if (error) {
      console.warn(`Rows failed for ${table}:`, error.message || error);
      return [];
    }
    return data || [];
  } catch (err) {
    console.warn(`Rows failed for ${table}:`, err.message || err);
    return [];
  }
}

async function getUserDeleteReview(userId) {
  const [tours, cycles, receipts, vouchers, helpdeskTickets] = await Promise.all([
    safeRows('USAF_tours', '*', [['user_id', userId]], { column: 'orders_start_date', ascending: true }),
    safeRows('USAF_cycles', '*', [['user_id', userId]], { column: 'start_date', ascending: true }),
    safeRows('USAF_receipts', '*', [['user_id', userId]], { column: 'receipt_date', ascending: true }),
    safeRows('USAF_vouchers', '*', [['user_id', userId]], { column: 'created_at', ascending: false }),
    safeRows('USAF_helpdesk_tickets', '*', [['created_by', userId]], { column: 'created_at', ascending: false })
  ]);
  const helpdeskIds = helpdeskTickets.map(t => t.id).filter(Boolean);
  let helpdeskMessages = [];
  if (helpdeskIds.length) {
    try {
      const { data, error } = await window.usafSupabase.from('USAF_helpdesk_messages').select('*').in('ticket_id', helpdeskIds).order('created_at', { ascending: true });
      if (!error) helpdeskMessages = data || [];
    } catch (err) {
      console.warn('Help Desk messages lookup failed:', err.message || err);
    }
  }
  const files = receipts.filter(r => r.file_path);
  const stats = {
    tours: tours.length,
    cycles: cycles.length,
    receipts: receipts.length,
    files: files.length,
    vouchers: vouchers.length,
    helpdesk: helpdeskTickets.length,
    storageBytes: receipts.reduce((sum, r) => sum + Number(r.file_size_bytes || 0), 0)
  };
  return { tours, cycles, receipts, vouchers, helpdeskTickets, helpdeskMessages, stats };
}

function loadScriptOnce(src, testFn) {
  return new Promise((resolve, reject) => {
    if (testFn()) return resolve();
    const existing = document.querySelector(`script[data-admin-user-lib="${src}"]`);
    if (existing) {
      existing.addEventListener('load', resolve, { once: true });
      existing.addEventListener('error', reject, { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.defer = true;
    script.dataset.adminUserLib = src;
    script.onload = resolve;
    script.onerror = () => reject(new Error('Could not load archive package helper library.'));
    document.head.appendChild(script);
  });
}

async function ensureUserArchiveLibs() {
  await loadScriptOnce('https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js', () => !!window.JSZip);
  await loadScriptOnce('https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js', () => !!window.jspdf?.jsPDF);
}

function safeArchiveFileName(value) {
  return String(value || 'archive').replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^_+|_+$/g, '');
}

function formatBytes(bytes) {
  const value = Number(bytes || 0);
  if (!value) return '0 B';
  const units = ['B','KB','MB','GB'];
  let size = value;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) { size /= 1024; index += 1; }
  return `${size.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function simpleDate(value) {
  if (!value) return 'Not set';
  try { return new Date(String(value).includes('T') ? value : `${value}T00:00:00`).toLocaleDateString(); }
  catch { return String(value); }
}

function buildUserSummaryPdfBlob(user, review) {
  const jsPDF = window.jspdf.jsPDF;
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  let y = 42;
  const line = (text, size = 10, weight = 'normal') => {
    doc.setFont('helvetica', weight);
    doc.setFontSize(size);
    doc.text(String(text), 42, y, { maxWidth: 530 });
    y += size + 8;
    if (y > 740) { doc.addPage(); y = 42; }
  };
  line('User Archive Summary', 18, 'bold');
  line(`Generated: ${new Date().toLocaleString()}`);
  line(`User: ${user.display_name || 'User'}`, 12, 'bold');
  line(`Email: ${user.email || 'Not set'}`);
  line(`Role: ${user.role || 'user'} | Active: ${user.is_active !== false ? 'Yes' : 'No'}`);
  y += 8;
  line('Record Counts', 13, 'bold');
  line(`Tours: ${review.stats.tours}`);
  line(`Cycles: ${review.stats.cycles}`);
  line(`Receipts: ${review.stats.receipts}`);
  line(`Receipt Files: ${review.stats.files}`);
  line(`Estimated Receipt Storage: ${formatBytes(review.stats.storageBytes)}`);
  line(`Voucher Packages: ${review.stats.vouchers}`);
  line(`Help Desk Tickets: ${review.stats.helpdesk}`);
  y += 8;
  line('Tours', 13, 'bold');
  (review.tours || []).forEach((tour, index) => line(`${index + 1}. ${tour.tour_name || tour.location || 'Tour'} | ${simpleDate(tour.orders_start_date)} - ${simpleDate(tour.orders_end_date)} | ${tour.status || 'active'}`));
  y += 8;
  line('Receipts', 13, 'bold');
  (review.receipts || []).forEach((receipt, index) => line(`${index + 1}. ${receipt.customer || receipt.file_name || 'Receipt'} | ${simpleDate(receipt.receipt_date)} | $${Number(receipt.amount || 0).toFixed(2)} | ${receipt.file_name || 'No file'}`));
  y += 8;
  line('Voucher Packages', 13, 'bold');
  (review.vouchers || []).forEach((voucher, index) => line(`${index + 1}. ${voucher.package_name || voucher.id || 'Voucher Package'} | ${simpleDate(voucher.created_at)} | ${voucher.status || 'created'}`));
  y += 8;
  line('Help Desk Tickets', 13, 'bold');
  (review.helpdeskTickets || []).forEach((ticket, index) => line(`${index + 1}. ${ticket.type || 'ticket'} | ${ticket.status || 'open'} | ${simpleDate(ticket.created_at)} | ${(ticket.description || '').slice(0, 80)}`));
  return doc.output('blob');
}

async function addReceiptAttachmentToZip(zip, receipt, index) {
  const bucket = receipt.file_bucket || window.USAF_CONFIG?.STORAGE_BUCKET || 'usaf-receipts';
  const path = receipt.file_path;
  if (!bucket || !path) return false;
  try {
    const signed = await window.usafSupabase.storage.from(bucket).createSignedUrl(path, 60 * 10);
    if (signed.error) throw signed.error;
    const response = await fetch(signed.data.signedUrl);
    if (!response.ok) throw new Error(`Could not download ${receipt.file_name || path}`);
    const blob = await response.blob();
    const name = safeArchiveFileName(`${String(index + 1).padStart(3, '0')}_${receipt.file_name || path.split('/').pop() || 'receipt'}`);
    zip.file(`Receipts/${name}`, blob);
    return true;
  } catch (err) {
    zip.file(`Receipts/${String(index + 1).padStart(3, '0')}_FILE_NOT_INCLUDED.txt`, `Receipt file could not be included.\nFile: ${receipt.file_name || ''}\nPath: ${path}\nReason: ${err.message || err}`);
    return false;
  }
}

async function createUserArchivePackage(user, review) {
  await ensureUserArchiveLibs();
  const zip = new window.JSZip();
  const packageName = `User_Archive_${safeArchiveFileName(user.display_name || user.email || 'User')}_${new Date().toISOString().slice(0,10)}.zip`;
  zip.file('User_Summary.pdf', buildUserSummaryPdfBlob(user, review));
  zip.file('Archive_Record.json', JSON.stringify({
    generated_at: new Date().toISOString(),
    package_name: packageName,
    user: { id: user.id, display_name: user.display_name, email: user.email, role: user.role, is_active: user.is_active !== false },
    stats: review.stats,
    tours: review.tours,
    cycles: review.cycles,
    receipts: review.receipts,
    vouchers: review.vouchers,
    helpdesk_tickets: review.helpdeskTickets,
    helpdesk_messages: review.helpdeskMessages
  }, null, 2));
  zip.file('Tours/tours.json', JSON.stringify(review.tours || [], null, 2));
  zip.file('Cycles/cycles.json', JSON.stringify(review.cycles || [], null, 2));
  zip.file('Receipts/receipts.json', JSON.stringify(review.receipts || [], null, 2));
  zip.file('Voucher_Packages/vouchers.json', JSON.stringify(review.vouchers || [], null, 2));
  zip.file('Help_Desk/helpdesk.json', JSON.stringify({ tickets: review.helpdeskTickets || [], messages: review.helpdeskMessages || [] }, null, 2));
  let attached = 0;
  for (let i = 0; i < (review.receipts || []).length; i += 1) {
    if (await addReceiptAttachmentToZip(zip, review.receipts[i], i)) attached += 1;
  }
  zip.file('Archive_Verification.txt', `Verify this package before deactivating or deleting the user.\n\nUser: ${user.display_name || user.email}\nGenerated: ${new Date().toLocaleString()}\nReceipt files included: ${attached} of ${(review.receipts || []).filter(r => r.file_path).length}\n`);
  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = packageName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  await logAuditEvent('User Archive Package Created', 'Admin Users', 'User', user.id, user.display_name || user.email, 'critical', { package_name: packageName, stats: review.stats });
  return { packageName, attached };
}

async function deactivateSelectedUserAfterArchive(user, review, packageName) {
  const { error } = await window.usafSupabase.from('USAF_profiles').update({ is_active: false }).eq('id', user.id);
  if (error) throw error;
  await logAuditEvent('User Deactivated After Archive', 'Admin Users', 'User', user.id, user.display_name || user.email, 'critical', { package_name: packageName, stats: review.stats }, user, { ...user, is_active: false });
}

async function purgeUserDataAndProfile(user, review, packageName) {
  const receiptRows = review.receipts || [];
  const voucherIds = (review.vouchers || []).map(v => v.id).filter(Boolean);
  const receiptIds = receiptRows.map(r => r.id).filter(Boolean);
  const ticketIds = (review.helpdeskTickets || []).map(t => t.id).filter(Boolean);
  const cycleIds = (review.cycles || []).map(c => c.id).filter(Boolean);
  const tourIds = (review.tours || []).map(t => t.id).filter(Boolean);
  const byBucket = {};
  receiptRows.forEach(receipt => {
    const bucket = receipt.file_bucket || window.USAF_CONFIG?.STORAGE_BUCKET || 'usaf-receipts';
    if (bucket && receipt.file_path) {
      if (!byBucket[bucket]) byBucket[bucket] = [];
      byBucket[bucket].push(receipt.file_path);
    }
  });
  for (const [bucket, paths] of Object.entries(byBucket)) {
    if (paths.length) await window.usafSupabase.storage.from(bucket).remove(paths);
  }
  if (ticketIds.length) await window.usafSupabase.from('USAF_helpdesk_messages').delete().in('ticket_id', ticketIds);
  if (ticketIds.length) await window.usafSupabase.from('USAF_helpdesk_tickets').delete().in('id', ticketIds);
  if (voucherIds.length) await window.usafSupabase.from('USAF_voucher_items').delete().in('voucher_id', voucherIds);
  if (receiptIds.length) await window.usafSupabase.from('USAF_voucher_items').delete().in('receipt_id', receiptIds);
  if (voucherIds.length) await window.usafSupabase.from('USAF_vouchers').delete().in('id', voucherIds);
  if (receiptIds.length) await window.usafSupabase.from('USAF_receipts').delete().in('id', receiptIds);
  if (cycleIds.length) await window.usafSupabase.from('USAF_cycles').delete().in('id', cycleIds);
  if (tourIds.length) await window.usafSupabase.from('USAF_tours').delete().in('id', tourIds);
  const { error } = await window.usafSupabase.from('USAF_profiles').delete().eq('id', user.id);
  if (error) throw error;
  await logAuditEvent('User Data Purged and Profile Deleted', 'Admin Users', 'User', user.id, user.display_name || user.email, 'critical', { package_name: packageName, stats: review.stats, removed_storage_paths: byBucket }, user, {});
}

function showDeleteReviewModal(user, review) {
  ensureAdminUserModalStyles();
  const hasRecords = userHasStoredRecords(review.stats);
  return new Promise(resolve => {
    document.querySelector('.admin-user-modal-backdrop')?.remove();
    const el = document.createElement('div');
    el.className = 'admin-user-modal-backdrop';
    el.innerHTML = `
      <div class="admin-user-modal admin-user-modal-wide" role="dialog" aria-modal="true">
        <div class="admin-user-modal-head">
          <div><h2>Delete User Review</h2><p>Review application data before removing or deactivating this user.</p></div>
          <button class="admin-user-modal-close" type="button" data-close>×</button>
        </div>
        <div class="admin-user-modal-body">
          ${userSummaryHtml(user)}
          ${adminUserStatTilesHtml(review.stats)}
          ${hasRecords ? `<div class="admin-user-modal-warning">This user has application records. Create and verify a User Archive Package before deactivating, deleting, or purging this account.</div>` : `<div class="admin-user-modal-note">No Tours, Receipts, Voucher Packages, or Help Desk tickets were found for this user. The profile can be removed without creating an archive package.</div>`}
          <div class="admin-user-modal-note">Supabase Authentication accounts are separate. If this user still exists under Supabase Auth, remove that account separately if full login removal is required.</div>
        </div>
        <div class="admin-user-modal-actions">
          <button class="btn secondary" type="button" data-cancel>Cancel</button>
          ${hasRecords ? `<button class="btn primary" type="button" data-create-archive>Create User Archive Package</button>` : `<button class="btn danger" type="button" data-delete-profile>Delete Profile</button>`}
        </div>
      </div>`;
    document.body.appendChild(el);
    const close = value => { el.remove(); resolve(value); };
    el.querySelector('[data-close]')?.addEventListener('click', () => close({ action: 'cancel' }));
    el.querySelector('[data-cancel]')?.addEventListener('click', () => close({ action: 'cancel' }));
    el.querySelector('[data-create-archive]')?.addEventListener('click', () => close({ action: 'archive' }));
    el.querySelector('[data-delete-profile]')?.addEventListener('click', () => close({ action: 'delete_profile_no_records' }));
    el.addEventListener('click', e => { if (e.target === el) close({ action: 'cancel' }); });
  });
}

function showArchiveVerifiedModal(user, review, packageInfo) {
  ensureAdminUserModalStyles();
  return new Promise(resolve => {
    document.querySelector('.admin-user-modal-backdrop')?.remove();
    const el = document.createElement('div');
    el.className = 'admin-user-modal-backdrop';
    el.innerHTML = `
      <div class="admin-user-modal admin-user-modal-wide" role="dialog" aria-modal="true">
        <div class="admin-user-modal-head">
          <div><h2>User Archive Package Created</h2><p>Verify the downloaded ZIP before taking action.</p></div>
          <button class="admin-user-modal-close" type="button" data-close>×</button>
        </div>
        <div class="admin-user-modal-body">
          ${userSummaryHtml(user)}
          ${adminUserStatTilesHtml(review.stats)}
          <div class="admin-user-modal-success">Downloaded package: <strong>${escapeHtml(packageInfo.packageName)}</strong><br>Receipt attachments included: <strong>${packageInfo.attached}</strong></div>
          <label class="admin-user-check-row"><input type="checkbox" id="userArchiveVerifiedCheck"> I verified the downloaded User Archive ZIP opens and contains the User Summary PDF, user data exports, and receipt attachments.</label>
          <div class="admin-user-modal-warning">Recommended action is Deactivate User. Purge and Delete permanently removes the user's application records and receipt files after the archive has been verified.</div>
        </div>
        <div class="admin-user-modal-actions">
          <button class="btn secondary" type="button" data-cancel>Cancel</button>
          <button class="btn primary" type="button" data-deactivate disabled>Deactivate User</button>
          <button class="btn danger" type="button" data-purge disabled>Purge Data and Delete Profile</button>
        </div>
      </div>`;
    document.body.appendChild(el);
    const deactivateBtn = el.querySelector('[data-deactivate]');
    const purgeBtn = el.querySelector('[data-purge]');
    el.querySelector('#userArchiveVerifiedCheck')?.addEventListener('change', event => {
      deactivateBtn.disabled = !event.target.checked;
      purgeBtn.disabled = !event.target.checked;
    });
    const close = value => { el.remove(); resolve(value); };
    el.querySelector('[data-close]')?.addEventListener('click', () => close({ action: 'cancel' }));
    el.querySelector('[data-cancel]')?.addEventListener('click', () => close({ action: 'cancel' }));
    deactivateBtn?.addEventListener('click', () => close({ action: 'deactivate' }));
    purgeBtn?.addEventListener('click', () => close({ action: 'purge_delete' }));
    el.addEventListener('click', e => { if (e.target === el) close({ action: 'cancel' }); });
  });
}

async function logAuditEvent(action, moduleName, entityType, entityId, entityName, severity = 'info', details = {}, oldValues = {}, newValues = {}) {
  try {
    if (!window.usafSupabase) return;
    const rpcPayload = {
      p_action: action,
      p_module: moduleName,
      p_entity_type: entityType,
      p_entity_id: entityId ? String(entityId) : null,
      p_entity_name: entityName || null,
      p_severity: severity,
      p_details: details || {},
      p_old_values: oldValues || {},
      p_new_values: newValues || {}
    };
    if (typeof window.usafSupabase.rpc === 'function') {
      const rpcResult = await window.usafSupabase.rpc('log_audit_event', rpcPayload);
      if (!rpcResult.error) return;
      console.warn('Audit RPC failed. Trying direct audit insert.', rpcResult.error);
    }
    let currentUserId = null;
    let actorProfile = null;
    try {
      if (typeof getCurrentUser === 'function') {
        const currentUser = await getCurrentUser();
        currentUserId = currentUser?.id || null;
      }
    } catch (_) {}
    if (currentUserId) {
      const profileResult = await window.usafSupabase
        .from('USAF_profiles')
        .select('display_name,email,role')
        .eq('id', currentUserId)
        .maybeSingle();
      actorProfile = profileResult.data || null;
    }
    const insertResult = await window.usafSupabase.from('USAF_audit_log').insert({
      actor_user_id: currentUserId,
      actor_display_name: actorProfile?.display_name || null,
      actor_email: actorProfile?.email || null,
      actor_role: actorProfile?.role || null,
      action,
      module: moduleName || 'System',
      entity_type: entityType || null,
      entity_id: entityId ? String(entityId) : null,
      entity_name: entityName || null,
      severity: ['info', 'warning', 'critical'].includes(severity) ? severity : 'info',
      details: details || {},
      old_values: oldValues || {},
      new_values: newValues || {},
      user_agent: navigator.userAgent || null
    });
    if (insertResult.error) console.error('Audit direct insert failed', insertResult.error);
  } catch (err) {
    console.error('Audit log write failed', err);
  }
}


async function initAdminUsers() {
  try {
    currentAdminUser = await requireAdmin();
    await renderLayout('Admin - Users');
    document.body.style.visibility = 'visible';
    userFilter.addEventListener('change', renderUserCards);
    await loadUsers();
  } catch (err) {
    document.body.style.visibility = 'visible';
    console.error(err);
    const app = document.getElementById('app') || document.body;
    app.innerHTML = `<div class="card"><h2>Admin Users failed to load</h2><p class="muted">${escapeHtml(err.message || String(err))}</p></div>`;
  }
}

async function loadUsers() {
  const { data, error } = await window.usafSupabase.from('USAF_profiles').select('*').order('display_name', { ascending: true });
  if (error) { userCards.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`; return; }
  usersCache = data || [];
  renderUserCards();
}

function filteredUsers() {
  const f = userFilter.value;
  if (f === 'active') return usersCache.filter(u => u.is_active !== false);
  if (f === 'inactive') return usersCache.filter(u => u.is_active === false);
  if (f === 'admin') return usersCache.filter(u => u.role === 'admin');
  if (f === 'report') return usersCache.filter(u => u.role === 'report');
  if (f === 'user') return usersCache.filter(u => (u.role || 'user') === 'user');
  return usersCache;
}

function renderUserCards() {
  const rows = filteredUsers();
  userCards.innerHTML = rows.map(u => `<button class="user-select-card ${selectedUser?.id === u.id ? 'active' : ''}" data-id="${escapeAttr(u.id)}"><strong>${escapeHtml(u.display_name || u.email || 'User')}</strong><span class="meta">${escapeHtml(u.email || '')}</span><span class="meta">Role: ${escapeHtml(u.role || 'user')} | Active: ${u.is_active !== false ? 'Yes' : 'No'}</span></button>`).join('') || '<div class="empty-state">No users found.</div>';
  document.querySelectorAll('[data-id]').forEach(btn => btn.addEventListener('click', () => selectUser(btn.dataset.id)));
}

function selectUser(id) {
  selectedUser = usersCache.find(u => u.id === id);
  if (!selectedUser) return;
  renderUserCards();
  userEditor.innerHTML = `<h2>Edit User</h2><p class="muted">Admin can update role and active status here.</p><form id="adminUserForm" class="compact-form" style="margin-top:14px">
    <label class="span-2">Display Name<input id="admin_display_name" required value="${escapeAttr(selectedUser.display_name || '')}"></label>
    <label class="span-2">Email<input id="admin_email" type="email" required value="${escapeAttr(selectedUser.email || '')}"></label>
    <label>Rank<input id="admin_rank" value="${escapeAttr(selectedUser.rank || '')}"></label>
    <label>Unit<input id="admin_unit" value="${escapeAttr(selectedUser.unit || '')}"></label>
    <label class="span-2">Duty Station<input id="admin_duty_station" value="${escapeAttr(selectedUser.duty_station || '')}"></label>
    <label>Role<select id="admin_role"><option value="user">User</option><option value="report">Report</option><option value="admin">Admin</option></select></label>
    <label>Active<select id="admin_is_active"><option value="true">Yes</option><option value="false">No</option></select></label>
    <div class="actions span-2"><button class="btn secondary" type="button" id="viewAsUserBtn">View as User</button><button class="btn primary" type="submit">Save User</button><button class="btn danger" type="button" id="deleteUserBtn">Delete User</button></div>
  </form>`;
  admin_role.value = selectedUser.role || 'user';
  admin_is_active.value = String(selectedUser.is_active !== false);
  adminUserForm.addEventListener('submit', saveSelectedUser);
  document.getElementById('viewAsUserBtn')?.addEventListener('click', viewAsSelectedUser);
  document.getElementById('deleteUserBtn')?.addEventListener('click', deleteSelectedUser);
}

function viewAsSelectedUser() {
  if (!selectedUser) return showAdminUserModal({title:'Select a User', body:'Choose a user from the list before continuing.', confirmText:'Close'});
  if (!window.USAFEffectiveUser) return showAdminUserModal({title:'View as User Not Available', body:'The View as User helper did not load. Refresh the page and try again.', confirmText:'Close'});
  logAuditEvent('View As User Started', 'Admin Users', 'User', selectedUser.id, selectedUser.display_name || selectedUser.email, 'critical', { target_email: selectedUser.email, target_role: selectedUser.role }).finally(() => {
    window.USAFEffectiveUser.setViewAsUser(selectedUser);
    window.location.href = '../index.html?v=80';
  });
}

async function saveSelectedUser(e) {
  e.preventDefault();
  if (!selectedUser) return;
  const payload = {
    display_name: admin_display_name.value.trim(),
    email: admin_email.value.trim(),
    rank: admin_rank.value.trim() || null,
    unit: admin_unit.value.trim() || null,
    duty_station: admin_duty_station.value.trim() || null,
    role: admin_role.value,
    is_active: admin_is_active.value === 'true'
  };
  const oldUser = { ...selectedUser };
  const { error } = await window.usafSupabase.from('USAF_profiles').update(payload).eq('id', selectedUser.id);
  if (error) {
    return showAdminUserModal({
      title: 'User Update Failed',
      message: 'The user profile could not be updated.',
      body: `<div class="admin-user-modal-warning">${escapeHtml(error.message)}</div>`,
      confirmText: 'Close'
    });
  }
  const severity = oldUser.role !== payload.role || oldUser.is_active !== payload.is_active ? 'critical' : 'warning';
  await logAuditEvent('User Profile Updated', 'Admin Users', 'User', selectedUser.id, payload.display_name || payload.email, severity, { role_changed: oldUser.role !== payload.role, active_changed: oldUser.is_active !== payload.is_active }, oldUser, payload);
  await showAdminUserModal({
    title: 'User Updated',
    message: 'The user profile was successfully updated.',
    body: userSummaryHtml({ ...oldUser, ...payload }),
    confirmText: 'Close',
    success: true
  });
  const selectedId = selectedUser.id;
  await loadUsers();
  selectedUser = usersCache.find(u => u.id === selectedId) || selectedUser;
  selectUser(selectedUser.id);
}

async function deleteSelectedUser() {
  if (!selectedUser) {
    return showAdminUserModal({title:'Select a User', body:'Choose a user from the list before deleting.', confirmText:'Close'});
  }
  const currentId = currentAdminUser?.id || null;
  if (currentId && selectedUser.id === currentId) {
    return showAdminUserModal({
      title: 'Cannot Delete Your Own Account',
      body: '<div class="admin-user-modal-warning">You are currently logged in with this account. Admins cannot delete their own active session.</div>',
      confirmText: 'Close'
    });
  }

  const adminUsers = usersCache.filter(u => String(u.role || '').toLowerCase() === 'admin' && u.is_active !== false);
  if (String(selectedUser.role || '').toLowerCase() === 'admin' && adminUsers.length <= 1) {
    return showAdminUserModal({
      title: 'Cannot Delete Last Admin',
      body: '<div class="admin-user-modal-warning">This is the last active Admin account. Create or promote another Admin before deleting this user.</div>',
      confirmText: 'Close'
    });
  }

  const userForAction = { ...selectedUser };
  const review = await getUserDeleteReview(userForAction.id);
  const decision = await showDeleteReviewModal(userForAction, review);
  if (!decision || decision.action === 'cancel') return;

  try {
    if (decision.action === 'delete_profile_no_records') {
      const confirmed = await showAdminUserModal({
        title: 'Delete User Profile?',
        message: 'No application records were found for this user.',
        body: `${userSummaryHtml(userForAction)}<div class="admin-user-modal-warning">This removes the profile record only. Supabase Auth must be cleaned up separately if needed.</div>`,
        confirmText: 'Delete Profile',
        cancelText: 'Cancel',
        danger: true
      });
      if (!confirmed) return;
      const { error } = await window.usafSupabase.from('USAF_profiles').delete().eq('id', userForAction.id);
      if (error) throw error;
      await logAuditEvent('User Profile Deleted', 'Admin Users', 'User', userForAction.id, userForAction.display_name || userForAction.email, 'critical', { no_application_records: true }, userForAction, {});
      await showAdminUserModal({ title: 'User Deleted', message: 'The user profile was removed from the application.', body: userSummaryHtml(userForAction), confirmText: 'Close', success: true });
    }

    if (decision.action === 'archive') {
      const packageInfo = await createUserArchivePackage(userForAction, review);
      const next = await showArchiveVerifiedModal(userForAction, review, packageInfo);
      if (!next || next.action === 'cancel') return;
      if (next.action === 'deactivate') {
        await deactivateSelectedUserAfterArchive(userForAction, review, packageInfo.packageName);
        await showAdminUserModal({
          title: 'User Deactivated',
          message: 'The user archive package was created and the user was deactivated.',
          body: `${userSummaryHtml({ ...userForAction, is_active: false })}<div class="admin-user-modal-success">Archive package verified: ${escapeHtml(packageInfo.packageName)}</div>`,
          confirmText: 'Close',
          success: true
        });
      }
      if (next.action === 'purge_delete') {
        await purgeUserDataAndProfile(userForAction, review, packageInfo.packageName);
        await showAdminUserModal({
          title: 'User Data Purged',
          message: 'The user archive package was created, and the user application records were purged.',
          body: `<div class="admin-user-modal-success">Archive package verified: ${escapeHtml(packageInfo.packageName)}</div><div class="admin-user-modal-warning">If the Supabase Auth account still exists, remove it separately from Supabase Authentication.</div>`,
          confirmText: 'Close',
          success: true
        });
      }
    }
  } catch (err) {
    console.error(err);
    return showAdminUserModal({
      title: 'User Cleanup Failed',
      message: 'The user cleanup action could not be completed.',
      body: `<div class="admin-user-modal-warning">${escapeHtml(err.message || String(err))}</div>`,
      confirmText: 'Close'
    });
  }

  selectedUser = null;
  userEditor.innerHTML = '<div class="empty-state">Select a user to edit profile, role, active status, or delete.</div>';
  await loadUsers();
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>'"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[c]));
}
function escapeAttr(value) { return escapeHtml(value).replace(/`/g, '&#96;'); }

initAdminUsers();
