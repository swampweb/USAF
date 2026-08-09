// Mobile dashboard cards and home icons v70
window.MobileDashboard = (() => {
  const M = window.MobileShell;

  function renderHome(){
    M.getContent().innerHTML = `<div class="action-grid">
      <a class="action-card" href="tours.html"><div class="action-icon">&#9992;&#65039;</div><div><strong>Tours</strong><span>Create and manage travel tours.</span></div><div class="action-arrow">›</div></a>
      <a class="action-card" href="cycles.html"><div class="action-icon">&#128260;</div><div><strong>Cycles</strong><span>Set date ranges and per diem rates.</span></div><div class="action-arrow">›</div></a>
      <a class="action-card" href="receipts.html"><div class="action-icon">&#129534;</div><div><strong>Receipts</strong><span>Add receipt details and attachments.</span></div><div class="action-arrow">›</div></a>
      <a class="action-card" href="vouchers.html"><div class="action-icon">&#128230;</div><div><strong>Voucher Packages</strong><span>Prepare package exports for submission.</span></div><div class="action-arrow">›</div></a>
      <a class="action-card" href="profile.html"><div class="action-icon">&#128100;</div><div><strong>Profile</strong><span>View your account.</span></div><div class="action-arrow">›</div></a>
    </div>`;
  }

  M.registerPage('index', renderHome);
  return { renderHome };
})();
