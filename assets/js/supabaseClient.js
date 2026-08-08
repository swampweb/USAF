// Orders & Travel Tracker Supabase Client v39
// Uses the default Supabase auth storage key so login.html and protected pages read the same session.
(function () {
  if (!window.USAF_CONFIG) {
    console.error('Missing assets/js/config.js');
    return;
  }

  if (!window.supabase) {
    console.error('Supabase CDN library did not load.');
    return;
  }

  const { SUPABASE_URL, SUPABASE_ANON_KEY } = window.USAF_CONFIG;

  if (!SUPABASE_URL || SUPABASE_URL.includes('PASTE_') || SUPABASE_URL.includes('your-project')) {
    console.error('Supabase URL is missing or still a placeholder.', SUPABASE_URL);
    return;
  }

  if (SUPABASE_URL.includes('/rest/v1')) {
    console.error('Supabase URL should be project URL only. Remove /rest/v1/.', SUPABASE_URL);
    return;
  }

  if (!SUPABASE_ANON_KEY || SUPABASE_ANON_KEY.includes('PASTE_') || SUPABASE_ANON_KEY === 'eyJ...') {
    console.error('Supabase anon public key is missing or still a placeholder.');
    return;
  }

  window.usafSupabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  });

  console.log('Orders & Travel Tracker Supabase Client v39 loaded');
})();
