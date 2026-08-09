// Mobile profile display and admin visibility v70
window.MobileProfile = (() => {
  const M = window.MobileShell;

  async function renderProfile(){
    const { data, error } = await M.supa().from('USAF_profiles').select('*').eq('id', M.getUser().id).maybeSingle();
    if (error) throw error;
    const p = data || {};
    M.getContent().innerHTML = `<article class="data-card"><strong>${M.esc(p.display_name || M.getUser().email)}</strong><span>${M.esc(p.email || M.getUser().email)}</span>
      <div class="data-row"><span>Rank</span><b>${M.esc(p.rank || 'Not set')}</b></div>
      <div class="data-row"><span>Unit</span><b>${M.esc(p.unit || 'Not set')}</b></div>
      <div class="data-row"><span>Duty Station</span><b>${M.esc(p.duty_station || 'Not set')}</b></div>
      <div class="data-row"><span>Role</span><b>${M.esc(p.role || 'user')}</b></div>
    </article>`;
  }

  M.registerPage('profile', renderProfile);
  return { renderProfile };
})();
