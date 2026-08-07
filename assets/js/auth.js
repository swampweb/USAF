async function getSession() {
  const { data, error } = await window.usafSupabase.auth.getSession();
  if (error) throw error;
  return data.session;
}

async function getCurrentUser() {
  const session = await getSession();
  return session?.user || null;
}

async function getCurrentProfile() {
  const user = await getCurrentUser();
  if (!user) return null;

  let { data, error } = await window.usafSupabase
    .from("USAF_profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    console.error("Profile load error", error);
    return null;
  }

  return data;
}

async function requireAuth() {
  const session = await getSession();
  if (!session) {
    window.location.href = "login.html";
    return null;
  }
  return session;
}

async function requireAdmin() {
  await requireAuth();
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "admin") {
    window.location.href = "../dashboard.html";
    return null;
  }
  return profile;
}

async function signOut() {
  await window.usafSupabase.auth.signOut();
  window.location.href = location.pathname.includes('/admin/') ? "../login.html" : "login.html";
}
