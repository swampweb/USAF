(function () {
  if (!window.USAF_CONFIG) {
    console.error("Missing assets/js/config.js");
    return;
  }

  const { SUPABASE_URL, SUPABASE_ANON_KEY } = window.USAF_CONFIG;

  if (!SUPABASE_URL || SUPABASE_URL.includes("PASTE_") || !SUPABASE_ANON_KEY || SUPABASE_ANON_KEY.includes("PASTE_")) {
    console.warn("Supabase config placeholders still need to be updated in assets/js/config.js");
  }

  window.usafSupabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
})();
