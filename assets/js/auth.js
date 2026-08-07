// USAF Auth Guard v5
function getLoginPath() { return window.location.pathname.includes('/admin/') ? '../login.html' : 'login.html'; }
function getDashboardPath() { return window.location.pathname.includes('/admin/') ? '../dashboard.html' : 'dashboard.html'; }
function showProtectedPage() { document.body.style.visibility = 'visible'; }
function hideProtectedPage() { document.body.style.visibility = 'hidden'; }
function withAuthTimeout(promise, ms, message) {
  let timeout;
  const timer = new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error(message)), ms); });
  return Promise.race([promise, timer]).finally(() => clearTimeout(timeout));
}
function validateSupabaseReady() {
  if (!window.USAF_CONFIG) throw new Error('Missing assets/js/config.js');
  if (!window.usafSupabase) throw new Error('Supabase client did not load. Check assets/js/supabaseClient.js and config.js');
  const url = window.USAF_CONFIG.SUPABASE_URL || '';
  const key = window.USAF_CONFIG.SUPABASE_ANON_KEY || '';
  if (!url || url.includes('your-project') || url.includes('PASTE_')) throw new Error('Supabase URL is still a placeholder in assets/js/config.js');
  if (url.includes('/rest/v1')) throw new Error('Supabase URL is wrong. Use project URL only, not /rest/v1/.');
  if (!key || key === 'eyJ...' || key.includes('PASTE_')) throw new Error('Supabase anon public key is still a placeholder in assets/js/config.js');
}
async function getSession() {
  validateSupabaseReady();
  const result = await withAuthTimeout(window.usafSupabase.auth.getSession(), 8000, 'Auth session check timed out. Refresh and verify Supabase config.js.');
  if (result.error) throw result.error;
  return result.data.session;
}
async function getCurrentUser() { const session = await getSession(); return session?.user || null; }
async function getCurrentProfile() {
  const user = await getCurrentUser();
  if (!user) return null;
  const { data, error } = await window.usafSupabase.from('USAF_profiles').select('*').eq('id', user.id).maybeSingle();
  if (error) { console.error('Profile load error', error); return null; }
  return data;
}
async function requireAuth() {
  try {
    hideProtectedPage();
    const session = await getSession();
    if (!session) {
      const returnTo = encodeURIComponent(window.location.pathname.split('/').pop() || 'dashboard.html');
      window.location.replace(`${getLoginPath()}?returnTo=${returnTo}`);
      return null;
    }
    return session;
  } catch (err) {
    console.error('Auth guard failed:', err);
    window.location.replace(`${getLoginPath()}?error=${encodeURIComponent(err.message || 'auth_failed')}`);
    return null;
  }
}
async function requireAdmin() {
  const session = await requireAuth();
  if (!session) return null;
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== 'admin') { window.location.replace(getDashboardPath()); return null; }
  return profile;
}
async function signOut() { try { await window.usafSupabase.auth.signOut(); } finally { window.location.replace(getLoginPath()); } }
