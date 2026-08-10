// Mobile dashboard cards, user display name, user/admin workflow v100
window.MobileDashboard = (() => {
  const M = window.MobileShell;
  async function count(table, filters){
    let q = M.supa().from(table).select('id', { count:'exact', head:true });
    (filters || []).forEach(f => { q = q.eq(f[0], f[1]); });
    const { count, error } = await q;
    if (error) { console.warn('Count failed', table, error.message || error); return 0; }
    return count || 0;
  }
  async function renderHome(){
    const uid = M.getUser().id;
    const [tours, receipts, vouchers, helpTickets] = await Promise.all([
      count('USAF_tours', [['user_id', uid]]),
      count('USAF_receipts', [['user_id', uid]]),
      count('USAF_vouchers', [['user_id', uid]]),
      count('USAF_helpdesk_tickets', [['created_by', uid]])
    ]);
    const adminBlock = M.isAdmin() ? `
      <div class="section-title">Admin Workflow</div>
      <div class="action-grid">
        <a class="action-card" href="users.html"><div class="action-icon">👥</div><div><strong>User Management</strong><span>Manage roles and active status.</span></div><div class="action-arrow">›</div></a>
        <a class="action-card" href="#" data-mobile-helpdesk-open><div class="action-icon">?</div><div><strong>Help Desk</strong><span>Review user questions and issue tickets.</span></div><div class="action-arrow">›</div></a>
      </div>` : '';
    M.getContent().innerHTML = `
      <section class="welcome-card">
        <span>Welcome</span>
        <strong>${M.esc(M.displayName())}</strong>
        <small>Role: ${M.esc(M.getRole())}</small>
      </section>
      <section class="mobile-kpi-grid">
        <div class="kpi-card"><span>Tours</span><strong>${tours}</strong><small>Your tour records</small></div>
        <div class="kpi-card"><span>Receipts</span><strong>${receipts}</strong><small>Uploaded receipts</small></div>
        <div class="kpi-card"><span>Voucher Packages</span><strong>${vouchers}</strong><small>Created packages</small></div>
        <div class="kpi-card"><span>Help Desk</span><strong>${helpTickets}</strong><small>Your tickets</small></div>
      </section>
      <div class="section-title">Main Workflow</div>
      <div class="action-grid">
        <a class="action-card" href="tours.html"><div class="action-icon">✈️</div><div><strong>Tours</strong><span>Create tours, view details, and manage cycles.</span></div><div class="action-arrow">›</div></a>
        <a class="action-card" href="receipts.html"><div class="action-icon">🧾</div><div><strong>Receipts</strong><span>Add and review receipts with attachments.</span></div><div class="action-arrow">›</div></a>
        <a class="action-card" href="vouchers.html"><div class="action-icon">📦</div><div><strong>Voucher Packages</strong><span>Create submission packages from receipts.</span></div><div class="action-arrow">›</div></a>
        <a class="action-card" href="profile.html"><div class="action-icon">👤</div><div><strong>My Profile</strong><span>View and update your account.</span></div><div class="action-arrow">›</div></a>
        <a class="action-card" href="#" data-mobile-helpdesk-open><div class="action-icon">?</div><div><strong>Help Desk</strong><span>Submit questions or issues to Admin.</span></div><div class="action-arrow">›</div></a>
      </div>
      ${adminBlock}
    `;
    M.getContent().querySelectorAll('[data-mobile-helpdesk-open]').forEach(a => a.addEventListener('click', e => { e.preventDefault(); window.USAFMobileHelpDesk?.open?.(); }));
  }
  M.registerPage('index', renderHome);
  return { renderHome };
})();
