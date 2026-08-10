// Mobile profile view and edit v100
window.MobileProfile = (() => {
  const M = window.MobileShell;
  async function loadProfile(){
    const { data, error } = await M.supa().from('USAF_profiles').select('*').eq('id', M.getUser().id).maybeSingle();
    if (error) throw error;
    return data || { id:M.getUser().id, email:M.getUser().email };
  }
  async function renderProfile(){
    const p = await loadProfile();
    M.getContent().innerHTML = `<article class="data-card profile-card"><strong>${M.esc(p.display_name || M.getUser().email)}</strong><span>${M.esc(p.email || M.getUser().email)}</span><div class="data-row"><span>Rank</span><b>${M.esc(p.rank || 'Not set')}</b></div><div class="data-row"><span>Unit</span><b>${M.esc(p.unit || 'Not set')}</b></div><div class="data-row"><span>Duty Station</span><b>${M.esc(p.duty_station || 'Not set')}</b></div><div class="data-row"><span>Role</span><b>${M.esc(p.role || 'user')}</b></div><button class="btn full" id="editProfileBtn">Edit Profile</button></article><div id="profileFormWrap"></div>`;
    document.getElementById('editProfileBtn').onclick = () => renderEditor(p);
  }
  function renderEditor(p){
    const wrap = document.getElementById('profileFormWrap');
    wrap.innerHTML = `<form class="form-card" id="mobileProfileForm"><strong>Edit Profile</strong><label>Display Name<input id="display_name" value="${M.esc(p.display_name || '')}"></label><label>Email<input id="profile_email" type="email" value="${M.esc(p.email || M.getUser().email || '')}"></label><label>Rank<input id="rank" value="${M.esc(p.rank || '')}"></label><label>Unit<input id="unit" value="${M.esc(p.unit || '')}"></label><label>Duty Station<input id="duty_station" value="${M.esc(p.duty_station || '')}"></label><div class="notice">Role and active status are managed by an Admin.</div><button class="btn full" type="submit">Save Profile</button><button class="btn secondary full" type="button" id="closeProfileForm">Cancel</button></form>`;
    document.getElementById('closeProfileForm').onclick = () => wrap.innerHTML = '';
    document.getElementById('mobileProfileForm').onsubmit = saveProfile;
    wrap.scrollIntoView({ behavior:'smooth', block:'start' });
  }
  async function saveProfile(e){
    e.preventDefault();
    const payload = { id:M.getUser().id, display_name:document.getElementById('display_name').value.trim() || null, email:document.getElementById('profile_email').value.trim() || M.getUser().email || null, rank:document.getElementById('rank').value.trim() || null, unit:document.getElementById('unit').value.trim() || null, duty_station:document.getElementById('duty_station').value.trim() || null };
    const { error } = await M.supa().from('USAF_profiles').upsert(payload);
    if (error) return alert('Profile save failed: ' + error.message);
    alert('Profile saved.');
    await renderProfile();
  }
  M.registerPage('profile', renderProfile);
  return { renderProfile };
})();
