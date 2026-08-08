function showProfileMessage(title, text, icon = '✅', kind = 'success') {
  alert(`${title}

${text}`);
}

async function initProfile() {
  await renderLayout('Profile');
  await loadProfile();
  profileForm.addEventListener('submit', saveProfile);
  passwordForm.addEventListener('submit', updatePassword);
}

async function loadProfile() {
  const user = await getCurrentUser();
  const { data, error } = await window.usafSupabase.from('USAF_profiles').select('*').eq('id', user.id).maybeSingle();
  if (error) return alert(error.message);
  const profile = data || {};
  display_name.value = profile.display_name || user.user_metadata?.display_name || user.email || '';
  email.value = profile.email || user.email || '';
  rank.value = profile.rank || '';
  unit.value = profile.unit || '';
  duty_station.value = profile.duty_station || '';
  roleStatusNote.textContent = `Role: ${profile.role || 'user'} | Active: ${profile.is_active !== false ? 'Yes' : 'No'} | Managed by Admin`;
}

async function saveProfile(e) {
  e.preventDefault();
  const user = await getCurrentUser();
  const newEmail = email.value.trim();
  const payload = {
    id: user.id,
    display_name: display_name.value.trim(),
    email: newEmail,
    rank: rank.value.trim() || null,
    unit: unit.value.trim() || null,
    duty_station: duty_station.value.trim() || null
  };
  const { error } = await window.usafSupabase.from('USAF_profiles').upsert(payload);
  if (error) return alert(error.message);
  if (newEmail && newEmail !== user.email) {
    const { error: emailError } = await window.usafSupabase.auth.updateUser({ email: newEmail });
    if (emailError) return alert(`Profile saved, but login email update failed: ${emailError.message}`);
    alert('Profile saved. Check the new email address for confirmation if Supabase email confirmation is enabled.');
  } else {
    alert('Profile saved.');
  }
}

async function updatePassword(e) {
  e.preventDefault();
  if (new_password.value !== confirm_password.value) return alert('Passwords do not match.');
  const { error } = await window.usafSupabase.auth.updateUser({ password: new_password.value });
  if (error) return alert(error.message);
  passwordForm.reset();
  alert('Password updated.');
}

initProfile();
