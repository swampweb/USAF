let usersCache = [];
let selectedUser = null;

async function initAdminUsers() {
  await requireAdmin();
  await renderLayout('Admin - Users');
  userFilter.addEventListener('change', renderUserCards);
  await loadUsers();
}

async function loadUsers() {
  const { data, error } = await window.usafSupabase.from('USAF_profiles').select('*').order('display_name', { ascending: true });
  if (error) { userCards.innerHTML = `<div class="empty-state">${error.message}</div>`; return; }
  usersCache = data || [];
  renderUserCards();
}

function filteredUsers() {
  const f = userFilter.value;
  if (f === 'active') return usersCache.filter(u => u.is_active !== false);
  if (f === 'inactive') return usersCache.filter(u => u.is_active === false);
  if (f === 'admin') return usersCache.filter(u => u.role === 'admin');
  if (f === 'report') return usersCache.filter(u => u.role === 'report');
  if (f === 'user') return usersCache.filter(u => (u.role || 'user') === 'user');
  return usersCache;
}

function renderUserCards() {
  const rows = filteredUsers();
  userCards.innerHTML = rows.map(u => `<button class="user-select-card ${selectedUser?.id === u.id ? 'active' : ''}" data-id="${u.id}"><strong>${u.display_name || u.email || 'User'}</strong><span class="meta">${u.email || ''}</span><span class="meta">Role: ${u.role || 'user'} | Active: ${u.is_active !== false ? 'Yes' : 'No'}</span></button>`).join('') || '<div class="empty-state">No users found.</div>';
  document.querySelectorAll('[data-id]').forEach(btn => btn.addEventListener('click', () => selectUser(btn.dataset.id)));
}

function selectUser(id) {
  selectedUser = usersCache.find(u => u.id === id);
  if (!selectedUser) return;
  renderUserCards();
  userEditor.innerHTML = `<h2>Edit User</h2><p class="muted">Admin can update role and active status here.</p><form id="adminUserForm" class="compact-form" style="margin-top:14px">
    <label class="span-2">Display Name<input id="admin_display_name" required value="${selectedUser.display_name || ''}"></label>
    <label class="span-2">Email<input id="admin_email" type="email" required value="${selectedUser.email || ''}"></label>
    <label>Rank<input id="admin_rank" value="${selectedUser.rank || ''}"></label>
    <label>Unit<input id="admin_unit" value="${selectedUser.unit || ''}"></label>
    <label class="span-2">Duty Station<input id="admin_duty_station" value="${selectedUser.duty_station || ''}"></label>
    <label>Role<select id="admin_role"><option value="user">User</option><option value="report">Report</option><option value="admin">Admin</option></select></label>
    <label>Active<select id="admin_is_active"><option value="true">Yes</option><option value="false">No</option></select></label>
    <div class="actions span-2"><button class="btn">Save User</button></div>
  </form>`;
  admin_role.value = selectedUser.role || 'user';
  admin_is_active.value = String(selectedUser.is_active !== false);
  adminUserForm.addEventListener('submit', saveSelectedUser);
}

async function saveSelectedUser(e) {
  e.preventDefault();
  if (!selectedUser) return;
  const payload = {
    display_name: admin_display_name.value.trim(),
    email: admin_email.value.trim(),
    rank: admin_rank.value.trim() || null,
    unit: admin_unit.value.trim() || null,
    duty_station: admin_duty_station.value.trim() || null,
    role: admin_role.value,
    is_active: admin_is_active.value === 'true'
  };
  const { error } = await window.usafSupabase.from('USAF_profiles').update(payload).eq('id', selectedUser.id);
  if (error) return alert(error.message);
  alert('User updated.');
  await loadUsers();
  selectedUser = usersCache.find(u => u.id === selectedUser.id) || selectedUser;
  selectUser(selectedUser.id);
}

initAdminUsers();
