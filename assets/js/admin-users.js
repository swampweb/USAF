// Orders & Travel Tracker Admin Users v80
// Restores original desktop layout behavior and adds View as User.
let usersCache = [];
let selectedUser = null;

async function logAuditEvent(action, moduleName, entityType, entityId, entityName, severity = 'info', details = {}, oldValues = {}, newValues = {}) {
  try {
    if (!window.usafSupabase || typeof window.usafSupabase.rpc !== 'function') return;
    const { error } = await window.usafSupabase.rpc('log_audit_event', {
      p_action: action,
      p_module: moduleName,
      p_entity_type: entityType,
      p_entity_id: entityId ? String(entityId) : null,
      p_entity_name: entityName || null,
      p_severity: severity,
      p_details: details || {},
      p_old_values: oldValues || {},
      p_new_values: newValues || {}
    });
    if (error) console.warn('Audit log write failed', error);
  } catch (err) {
    console.warn('Audit log write failed', err);
  }
}


async function initAdminUsers() {
  try {
    await requireAdmin();
    await renderLayout('Admin - Users');
    document.body.style.visibility = 'visible';
    userFilter.addEventListener('change', renderUserCards);
    await loadUsers();
  } catch (err) {
    document.body.style.visibility = 'visible';
    console.error(err);
    const app = document.getElementById('app') || document.body;
    app.innerHTML = `<div class="card"><h2>Admin Users failed to load</h2><p class="muted">${escapeHtml(err.message || String(err))}</p></div>`;
  }
}

async function loadUsers() {
  const { data, error } = await window.usafSupabase.from('USAF_profiles').select('*').order('display_name', { ascending: true });
  if (error) { userCards.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`; return; }
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
  userCards.innerHTML = rows.map(u => `<button class="user-select-card ${selectedUser?.id === u.id ? 'active' : ''}" data-id="${escapeAttr(u.id)}"><strong>${escapeHtml(u.display_name || u.email || 'User')}</strong><span class="meta">${escapeHtml(u.email || '')}</span><span class="meta">Role: ${escapeHtml(u.role || 'user')} | Active: ${u.is_active !== false ? 'Yes' : 'No'}</span></button>`).join('') || '<div class="empty-state">No users found.</div>';
  document.querySelectorAll('[data-id]').forEach(btn => btn.addEventListener('click', () => selectUser(btn.dataset.id)));
}

function selectUser(id) {
  selectedUser = usersCache.find(u => u.id === id);
  if (!selectedUser) return;
  renderUserCards();
  userEditor.innerHTML = `<h2>Edit User</h2><p class="muted">Admin can update role and active status here.</p><form id="adminUserForm" class="compact-form" style="margin-top:14px">
    <label class="span-2">Display Name<input id="admin_display_name" required value="${escapeAttr(selectedUser.display_name || '')}"></label>
    <label class="span-2">Email<input id="admin_email" type="email" required value="${escapeAttr(selectedUser.email || '')}"></label>
    <label>Rank<input id="admin_rank" value="${escapeAttr(selectedUser.rank || '')}"></label>
    <label>Unit<input id="admin_unit" value="${escapeAttr(selectedUser.unit || '')}"></label>
    <label class="span-2">Duty Station<input id="admin_duty_station" value="${escapeAttr(selectedUser.duty_station || '')}"></label>
    <label>Role<select id="admin_role"><option value="user">User</option><option value="report">Report</option><option value="admin">Admin</option></select></label>
    <label>Active<select id="admin_is_active"><option value="true">Yes</option><option value="false">No</option></select></label>
    <div class="actions span-2"><button class="btn secondary" type="button" id="viewAsUserBtn">View as User</button><button class="btn primary" type="submit">Save User</button></div>
  </form>`;
  admin_role.value = selectedUser.role || 'user';
  admin_is_active.value = String(selectedUser.is_active !== false);
  adminUserForm.addEventListener('submit', saveSelectedUser);
  document.getElementById('viewAsUserBtn')?.addEventListener('click', viewAsSelectedUser);
}

function viewAsSelectedUser() {
  if (!selectedUser) return alert('Select a user first.');
  if (!window.USAFEffectiveUser) return alert('View as User helper did not load. Refresh the page with v=80.');
  logAuditEvent('View As User Started', 'Admin Users', 'User', selectedUser.id, selectedUser.display_name || selectedUser.email, 'critical', { target_email: selectedUser.email, target_role: selectedUser.role }).finally(() => {
    window.USAFEffectiveUser.setViewAsUser(selectedUser);
    window.location.href = '../index.html?v=80';
  });
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
  const oldUser = { ...selectedUser };
  const { error } = await window.usafSupabase.from('USAF_profiles').update(payload).eq('id', selectedUser.id);
  if (error) return alert(error.message);
  const severity = oldUser.role !== payload.role || oldUser.is_active !== payload.is_active ? 'critical' : 'warning';
  await logAuditEvent('User Profile Updated', 'Admin Users', 'User', selectedUser.id, payload.display_name || payload.email, severity, { role_changed: oldUser.role !== payload.role, active_changed: oldUser.is_active !== payload.is_active }, oldUser, payload);
  alert('User updated.');
  const selectedId = selectedUser.id;
  await loadUsers();
  selectedUser = usersCache.find(u => u.id === selectedId) || selectedUser;
  selectUser(selectedUser.id);
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>'"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[c]));
}
function escapeAttr(value) { return escapeHtml(value).replace(/`/g, '&#96;'); }

initAdminUsers();
