// Orders & Travel Tracker Admin Users v76
// Adds Report role UI and View as User button.
let usersCache = [];
let selectedUser = null;

async function initAdminUsers() {
  await requireAdmin();
  await renderLayout('Admin - Users');

  const filter = document.getElementById('userFilter');
  if (filter) filter.addEventListener('change', renderUserCards);

  await loadUsers();

  if (window.USAFEffectiveUser) window.USAFEffectiveUser.initViewAsUi();
}

async function loadUsers() {
  const cards = document.getElementById('userCards');
  const { data, error } = await window.usafSupabase
    .from('USAF_profiles')
    .select('*')
    .order('display_name', { ascending: true });

  if (error) {
    if (cards) cards.innerHTML = `<div class="empty-state">${error.message}</div>`;
    return;
  }

  usersCache = data || [];
  renderUserCards();
}

function filteredUsers() {
  const filter = document.getElementById('userFilter');
  const f = filter ? filter.value : 'all';

  if (f === 'active') return usersCache.filter(u => u.is_active !== false);
  if (f === 'inactive') return usersCache.filter(u => u.is_active === false);
  if (f === 'admin') return usersCache.filter(u => (u.role || '').toLowerCase() === 'admin');
  if (f === 'report') return usersCache.filter(u => (u.role || '').toLowerCase() === 'report');
  if (f === 'user') return usersCache.filter(u => (u.role || 'user').toLowerCase() === 'user');

  return usersCache;
}

function renderUserCards() {
  const cards = document.getElementById('userCards');
  if (!cards) return;

  const rows = filteredUsers();
  cards.innerHTML = rows.map(u => {
    const name = escapeHtml(u.display_name || u.email || 'User');
    const email = escapeHtml(u.email || '');
    const role = escapeHtml(u.role || 'user');
    const active = u.is_active !== false ? 'Yes' : 'No';
    const isActive = selectedUser && selectedUser.id === u.id ? 'active' : '';

    return `<button class="user-select-card ${isActive}" data-id="${u.id}">
      <strong>${name}</strong>
      <span class="meta">${email}</span>
      <span class="meta">Role: ${role} | Active: ${active}</span>
    </button>`;
  }).join('') || '<div class="empty-state">No users found.</div>';

  document.querySelectorAll('.user-select-card[data-id]').forEach(btn => {
    btn.addEventListener('click', () => selectUser(btn.dataset.id));
  });
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

  const form = document.getElementById('adminUserForm');
  if (form) form.addEventListener('submit', saveSelectedUser);

  const viewBtn = document.getElementById('viewAsUserBtn');
  if (viewBtn) viewBtn.addEventListener('click', startViewAsSelectedUser);
}

function startViewAsSelectedUser() {
  if (!selectedUser) return alert('Select a user first.');
  if (!window.USAFEffectiveUser) return alert('View as User helper did not load. Refresh the page with v=76.');

  window.USAFEffectiveUser.setViewAsUser(selectedUser);
  window.location.href = '../index.html?v=76';
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

  const { error } = await window.usafSupabase
    .from('USAF_profiles')
    .update(payload)
    .eq('id', selectedUser.id);

  if (error) return alert(error.message);

  alert('User updated.');
  const selectedId = selectedUser.id;
  await loadUsers();
  selectedUser = usersCache.find(u => u.id === selectedId) || selectedUser;
  selectUser(selectedUser.id);
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>'"]/g, c => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;'
  }[c]));
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, '&#96;');
}

initAdminUsers();
