// Orders & Travel Tracker Admin Users v79
// Standalone admin user management. Avoids layout/render hidden-page failures.
let usersCache = [];
let selectedUser = null;
let currentAdminProfile = null;

function showMessage(targetId, message) {
  const el = document.getElementById(targetId);
  if (el) el.innerHTML = `<div class="empty-state">${escapeHtml(message)}</div>`;
}

function showFatal(message) {
  document.body.style.visibility = 'visible';
  showMessage('userCards', message);
  const editor = document.getElementById('userEditor');
  if (editor) editor.innerHTML = `<h2>Admin Users Error</h2><div class="empty-state">${escapeHtml(message)}</div>`;
  console.error(message);
}

async function getSessionUser() {
  if (typeof getCurrentUser === 'function') return await getCurrentUser();
  const { data, error } = await window.usafSupabase.auth.getUser();
  if (error) throw error;
  return data.user;
}

async function loadCurrentAdminProfile() {
  const user = await getSessionUser();
  if (!user?.id) throw new Error('No active login session found.');
  const { data, error } = await window.usafSupabase.from('USAF_profiles').select('*').eq('id', user.id).maybeSingle();
  if (error) throw error;
  currentAdminProfile = data || null;
  const role = String(currentAdminProfile?.role || '').toLowerCase();
  if (role !== 'admin') throw new Error('Admin access is required for User Management.');
}

async function initAdminUsers() {
  try {
    document.body.style.visibility = 'visible';
    if (!window.usafSupabase) throw new Error('Supabase client did not load.');
    await loadCurrentAdminProfile();
    const filter = document.getElementById('userFilter');
    if (filter) filter.addEventListener('change', renderUserCards);
    await loadUsers();
    if (window.USAFEffectiveUser) window.USAFEffectiveUser.initViewAsUi();
  } catch (err) {
    showFatal(err && err.message ? err.message : String(err));
  }
}

async function loadUsers() {
  showMessage('userCards', 'Loading users...');
  const { data, error } = await window.usafSupabase
    .from('USAF_profiles')
    .select('*')
    .order('display_name', { ascending: true });
  if (error) throw error;
  usersCache = data || [];
  renderUserCards();
}

function filteredUsers() {
  const f = document.getElementById('userFilter')?.value || 'all';
  if (f === 'active') return usersCache.filter(u => u.is_active !== false);
  if (f === 'inactive') return usersCache.filter(u => u.is_active === false);
  if (f === 'admin') return usersCache.filter(u => String(u.role || '').toLowerCase() === 'admin');
  if (f === 'report') return usersCache.filter(u => String(u.role || '').toLowerCase() === 'report');
  if (f === 'user') return usersCache.filter(u => String(u.role || 'user').toLowerCase() === 'user');
  return usersCache;
}

function renderUserCards() {
  const cards = document.getElementById('userCards');
  if (!cards) return;
  const rows = filteredUsers();
  cards.innerHTML = rows.map(u => {
    const active = selectedUser && selectedUser.id === u.id ? 'active' : '';
    return `<button class="user-select-card ${active}" data-id="${escapeAttr(u.id)}">
      <strong>${escapeHtml(u.display_name || u.email || 'User')}</strong>
      <span class="meta">${escapeHtml(u.email || '')}</span>
      <span class="meta">Role: ${escapeHtml(u.role || 'user')} | Active: ${u.is_active !== false ? 'Yes' : 'No'}</span>
    </button>`;
  }).join('') || '<div class="empty-state">No users found.</div>';
  document.querySelectorAll('.user-select-card[data-id]').forEach(btn => btn.addEventListener('click', () => selectUser(btn.dataset.id)));
}

function selectUser(id) {
  selectedUser = usersCache.find(u => u.id === id);
  if (!selectedUser) return;
  renderUserCards();
  const editor = document.getElementById('userEditor');
  if (!editor) return;
  editor.innerHTML = `<h2>Edit User</h2>
    <p class="muted">Admin can update role and active status here. View as User opens the selected user's records in read-only mode.</p>
    <form id="adminUserForm" class="compact-form" style="margin-top:14px">
      <label class="span-2">Display Name<input id="admin_display_name" required value="${escapeAttr(selectedUser.display_name || '')}"></label>
      <label class="span-2">Email<input id="admin_email" type="email" required value="${escapeAttr(selectedUser.email || '')}"></label>
      <label>Rank<input id="admin_rank" value="${escapeAttr(selectedUser.rank || '')}"></label>
      <label>Unit<input id="admin_unit" value="${escapeAttr(selectedUser.unit || '')}"></label>
      <label class="span-2">Duty Station<input id="admin_duty_station" value="${escapeAttr(selectedUser.duty_station || '')}"></label>
      <label>Role<select id="admin_role"><option value="user">User</option><option value="report">Report</option><option value="admin">Admin</option></select></label>
      <label>Active<select id="admin_is_active"><option value="true">Yes</option><option value="false">No</option></select></label>
      <div class="actions span-2">
        <button class="btn secondary" type="button" id="viewAsUserBtn">View as User</button>
        <button class="btn primary" type="submit">Save User</button>
      </div>
    </form>`;
  document.getElementById('admin_role').value = selectedUser.role || 'user';
  document.getElementById('admin_is_active').value = String(selectedUser.is_active !== false);
  document.getElementById('adminUserForm')?.addEventListener('submit', saveSelectedUser);
  document.getElementById('viewAsUserBtn')?.addEventListener('click', startViewAsSelectedUser);
}

function startViewAsSelectedUser() {
  if (!selectedUser) return alert('Select a user first.');
  if (!window.USAFEffectiveUser) return alert('View as User helper did not load.');
  window.USAFEffectiveUser.setViewAsUser(selectedUser);
  window.location.href = '../index.html?v=79';
}

async function saveSelectedUser(e) {
  e.preventDefault();
  if (!selectedUser) return;
  const payload = {
    display_name: document.getElementById('admin_display_name').value.trim(),
    email: document.getElementById('admin_email').value.trim(),
    rank: document.getElementById('admin_rank').value.trim() || null,
    unit: document.getElementById('admin_unit').value.trim() || null,
    duty_station: document.getElementById('admin_duty_station').value.trim() || null,
    role: document.getElementById('admin_role').value,
    is_active: document.getElementById('admin_is_active').value === 'true'
  };
  const { error } = await window.usafSupabase.from('USAF_profiles').update(payload).eq('id', selectedUser.id);
  if (error) return alert(error.message);
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

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initAdminUsers);
else initAdminUsers();
