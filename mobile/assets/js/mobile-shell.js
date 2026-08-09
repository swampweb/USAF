// Mobile shell, shared state, auth, navigation, routing v70
window.MobileShell = (() => {
  let client = null;
  let user = null;
  const routes = {};
  const page = document.body.dataset.page;
  const content = document.getElementById('mobileContent');

  const esc = v => String(v ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const dt = v => v ? new Date(v + 'T00:00:00').toLocaleDateString() : 'Not set';
  const money = v => Number(v || 0).toLocaleString(undefined, { style:'currency', currency:'USD' });

  function supa(){
    if (client) return client;
    if (!window.supabase || !window.USAF_CONFIG) throw new Error('Supabase or config.js did not load.');
    client = window.supabase.createClient(window.USAF_CONFIG.SUPABASE_URL, window.USAF_CONFIG.SUPABASE_ANON_KEY, {
      auth:{ persistSession:true, autoRefreshToken:true, detectSessionInUrl:true }
    });
    return client;
  }

  async function auth(){
    const { data } = await supa().auth.getSession();
    if (!data?.session){ location.href = '../login.html?returnTo=mobile/index.html'; return null; }
    user = data.session.user;
    return user;
  }

  function bindShell(){
    const d = document.getElementById('mobileDrawer');
    const b = document.getElementById('drawerBackdrop');
    const menu = document.getElementById('menuButton');
    const closeBtn = document.getElementById('closeMenuButton');
    const refresh = document.getElementById('refreshButton');
    const back = document.getElementById('backButton');
    const logout = document.getElementById('logoutButton');
    const open = () => { d?.classList.add('open'); b?.classList.add('open'); };
    const close = () => { d?.classList.remove('open'); b?.classList.remove('open'); };
    if (menu) menu.onclick = open;
    if (closeBtn) closeBtn.onclick = close;
    if (b) b.onclick = close;
    if (refresh) refresh.onclick = route;
    if (back) back.onclick = () => { if (history.length > 1) history.back(); else location.href = 'index.html'; };
    if (logout) logout.onclick = async () => { await supa().auth.signOut(); location.href = '../login.html'; };
  }

  function registerPage(name, renderer){
    routes[name] = renderer;
  }

  async function route(){
    content.innerHTML = '<div class="loading-card">Loading...</div>';
    try{
      await auth();
      if (!user) return;
      const renderer = routes[page];
      if (renderer) await renderer();
      else content.innerHTML = '<div class="notice">This mobile page uses its own page script.</div>';
    } catch(err){
      console.error(err);
      content.innerHTML = `<div class="notice"><strong>Mobile page failed to load.</strong><br>${esc(err.message || err)}</div>`;
    }
  }

  async function init(){
    bindShell();
    await route();
  }

  return {
    init,
    route,
    registerPage,
    supa,
    getUser: () => user,
    getPage: () => page,
    getContent: () => content,
    esc,
    dt,
    money
  };
})();
