// Mobile shell, shared state, auth, profile, dynamic menu, routing v100
window.MobileShell = (() => {
  let client = null;
  let user = null;
  let profile = null;
  const routes = {};
  const page = document.body.dataset.page;
  const content = document.getElementById('mobileContent');
  const esc = v => String(v ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const dt = v => v ? new Date(v + 'T00:00:00').toLocaleDateString() : 'Not set';
  const money = v => Number(v || 0).toLocaleString(undefined, { style:'currency', currency:'USD' });
  function supa(){
    if (client) return client;
    if (!window.supabase || !window.USAF_CONFIG) throw new Error('Supabase or config.js did not load.');
    client = window.supabase.createClient(window.USAF_CONFIG.SUPABASE_URL, window.USAF_CONFIG.SUPABASE_ANON_KEY, { auth:{ persistSession:true, autoRefreshToken:true, detectSessionInUrl:true } });
    return client;
  }
  async function auth(){
    const { data } = await supa().auth.getSession();
    if (!data?.session){ location.href = '../login.html?returnTo=mobile/index.html'; return null; }
    user = data.session.user;
    await loadProfile();
    return user;
  }
  async function loadProfile(){
    if (!user?.id) return null;
    const { data, error } = await supa().from('USAF_profiles').select('*').eq('id', user.id).maybeSingle();
    if (error) console.warn('Mobile profile load warning:', error.message || error);
    profile = data || { id:user.id, email:user.email, display_name:user.user_metadata?.display_name || user.email };
    return profile;
  }
  function displayName(){ return profile?.display_name || profile?.email || user?.email || 'User'; }
  function role(){ return String(profile?.role || 'user').toLowerCase(); }
  function isAdmin(){ return role() === 'admin'; }
  function isReport(){ return role() === 'report'; }
  function menuItem(href, label, attrs = ''){ return `<a href="${href}" ${attrs}>${label}</a>`; }
  function renderMenu(){
    const nav = document.getElementById('drawerNav') || document.querySelector('.drawer-nav');
    if (!nav) return;
    const adminLinks = isAdmin() ? `
      <div class="drawer-section-title">Admin</div>
      ${menuItem('users.html','User Management')}
    ` : '';
    nav.innerHTML = `
      ${menuItem('index.html','Dashboard')}
      ${menuItem('tours.html','Tours')}
      ${menuItem('receipts.html','Receipts')}
      ${menuItem('vouchers.html','Voucher Packages')}
      ${menuItem('profile.html','My Profile')}
      ${menuItem('#','Help Desk','data-mobile-helpdesk-open')}
      ${adminLinks}
      <button type="button" id="logoutButton">Logout</button>
    `;
    nav.querySelector('[data-mobile-helpdesk-open]')?.addEventListener('click', e => {
      e.preventDefault();
      if (window.USAFMobileHelpDesk?.open) window.USAFMobileHelpDesk.open();
    });
    nav.querySelector('#logoutButton')?.addEventListener('click', async () => {
      await supa().auth.signOut();
      location.href = '../login.html';
    });
  }
  function bindShell(){
    const d = document.getElementById('mobileDrawer');
    const b = document.getElementById('drawerBackdrop');
    const menu = document.getElementById('menuButton');
    const closeBtn = document.getElementById('closeMenuButton');
    const refresh = document.getElementById('refreshButton');
    const back = document.getElementById('backButton');
    const open = () => { d?.classList.add('open'); b?.classList.add('open'); d?.setAttribute('aria-hidden','false'); };
    const close = () => { d?.classList.remove('open'); b?.classList.remove('open'); d?.setAttribute('aria-hidden','true'); };
    if (menu) menu.onclick = open;
    if (closeBtn) closeBtn.onclick = close;
    if (b) b.onclick = close;
    if (refresh) refresh.onclick = route;
    if (back) back.onclick = () => { if (history.length > 1) history.back(); else location.href = 'index.html'; };
  }
  function registerPage(name, renderer){ routes[name] = renderer; }
  async function route(){
    content.innerHTML = '<div class="loading-card">Loading...</div>';
    try{
      await auth();
      if (!user) return;
      renderMenu();
      const renderer = routes[page];
      if (renderer) await renderer();
      else content.innerHTML = '<div class="empty-card">This mobile page uses its own page script.</div>';
    } catch(err){
      console.error(err);
      content.innerHTML = `<div class="notice"><strong>Mobile page failed to load.</strong><br>${esc(err.message || err)}</div>`;
    }
  }
  async function init(){ bindShell(); await route(); }
  return { init, route, registerPage, supa, getUser: () => user, getProfile: () => profile, getRole: role, isAdmin, isReport, displayName, getPage: () => page, getContent: () => content, esc, dt, money };
})();
