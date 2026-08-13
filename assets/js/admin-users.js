// Orders & Travel Tracker Admin Users v127
// Restores original desktop layout behavior and adds View as User.
let usersCache = [];
let selectedUser = null;

let currentAdminUser = null;

function ensureAdminUserModalStyles() {
  if (document.getElementById('adminUserModalStyles')) return;
  const style = document.createElement('style');
  style.id = 'adminUserModalStyles';
  style.textContent = `
    .admin-user-modal-backdrop{position:fixed;inset:0;background:rgba(15,23,42,.56);display:flex;align-items:center;justify-content:center;z-index:10000;padding:18px;}
    .admin-user-modal{width:min(560px,96vw);background:#fff;border:1px solid #dbe5f0;border-radius:22px;box-shadow:0 30px 90px rgba(15,23,42,.28);overflow:hidden;color:#0f172a;}
    .admin-user-modal-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;padding:18px 22px;background:linear-gradient(135deg,#0a2342,#00308f);color:#fff;}
    .admin-user-modal-head h2{margin:0;font-size:22px;color:#fff;}
    .admin-user-modal-head p{margin:4px 0 0;color:#dbeafe;font-size:13px;line-height:1.4;}
    .admin-user-modal-close{border:0;background:rgba(255,255,255,.14);color:#fff;border-radius:999px;width:34px;height:34px;font-size:20px;font-weight:900;cursor:pointer;}
    .admin-user-modal-body{padding:20px 22px;display:grid;gap:14px;}
    .admin-user-modal-summary{border:1px solid #dbe5f0;background:#f8fafc;border-radius:16px;padding:14px;display:grid;gap:6px;}
    .admin-user-modal-summary div{display:flex;justify-content:space-between;gap:12px;font-size:14px;}
    .admin-user-modal-summary span{color:#64748b;font-weight:800;}
    .admin-user-modal-summary b{text-align:right;overflow-wrap:anywhere;}
    .admin-user-modal-warning{border:1px solid #fecdd3;background:#fff1f3;color:#991b1b;border-radius:16px;padding:12px;font-weight:800;line-height:1.45;}
    .admin-user-modal-success{border:1px solid #bbf7d0;background:#f0fdf4;color:#166534;border-radius:16px;padding:12px;font-weight:800;line-height:1.45;}
    .admin-user-modal-actions{display:flex;justify-content:flex-end;gap:10px;flex-wrap:wrap;padding:0 22px 20px;}
    .admin-user-modal-actions .btn.danger{background:#b42318;color:#fff;border:1px solid #b42318;}
  `;
  document.head.appendChild(style);
}

function showAdminUserModal({title, message='', body='', confirmText='Close', cancelText='', danger=false, success=false} = {}) {
  ensureAdminUserModalStyles();
  return new Promise(resolve => {
    document.querySelector('.admin-user-modal-backdrop')?.remove();
    const el = document.createElement('div');
    el.className = 'admin-user-modal-backdrop';
    el.innerHTML = `
      <div class="admin-user-modal" role="dialog" aria-modal="true">
        <div class="admin-user-modal-head">
          <div><h2>${escapeHtml(title || 'Message')}</h2>${message ? `<p>${escapeHtml(message)}</p>` : ''}</div>
          <button class="admin-user-modal-close" type="button" data-close>×</button>
        </div>
        <div class="admin-user-modal-body">
          ${success ? `<div class="admin-user-modal-success">${body}</div>` : body}
        </div>
        <div class="admin-user-modal-actions">
          ${cancelText ? `<button class="btn secondary" type="button" data-cancel>${escapeHtml(cancelText)}</button>` : ''}
          <button class="btn ${danger ? 'danger' : 'primary'}" type="button" data-confirm>${escapeHtml(confirmText)}</button>
        </div>
      </div>`;
    document.body.appendChild(el);
    const close = value => { el.remove(); resolve(value); };
    el.querySelector('[data-close]')?.addEventListener('click', () => close(false));
    el.querySelector('[data-cancel]')?.addEventListener('click', () => close(false));
    el.querySelector('[data-confirm]')?.addEventListener('click', () => close(true));
    el.addEventListener('click', e => { if (e.target === el) close(false); });
  });
}

function userSummaryHtml(user) {
  return `<div class="admin-user-modal-summary">
    <div><span>Display Name</span><b>${escapeHtml(user?.display_name || 'User')}</b></div>
    <div><span>Email</span><b>${escapeHtml(user?.email || '')}</b></div>
    <div><span>Role</span><b>${escapeHtml(user?.role || 'user')}</b></div>
    <div><span>Active</span><b>${user?.is_active !== false ? 'Yes' : 'No'}</b></div>
  </div>`;
}

async function logAuditEvent(action, moduleName, entityType, entityId, entityName, severity = 'info', details = {}, oldValues = {}, newValues = {}) {
  try {
    if (!window.usafSupabase) return;
    const rpcPayload = {
      p_action: action,
      p_module: moduleName,
      p_entity_type: entityType,
      p_entity_id: entityId ? String(entityId) : null,
      p_entity_name: entityName || null,
      p_severity: severity,
      p_details: details || {},
      p_old_values: oldValues || {},
      p_new_values: newValues || {}
    };
    if (typeof window.usafSupabase.rpc === 'function') {
      const rpcResult = await window.usafSupabase.rpc('log_audit_event', rpcPayload);
      if (!rpcResult.error) return;
      console.warn('Audit RPC failed. Trying direct audit insert.', rpcResult.error);
    }
    let currentUserId = null;
    let actorProfile = null;
    try {
      if (typeof getCurrentUser === 'function') {
        const currentUser = await getCurrentUser();
        currentUserId = currentUser?.id || null;
      }
    } catch (_) {}
    if (currentUserId) {
      const profileResult = await window.usafSupabase
        .from('USAF_profiles')
        .select('display_name,email,role')
        .eq('id', currentUserId)
        .maybeSingle();
      actorProfile = profileResult.data || null;
    }
    const insertResult = await window.usafSupabase.from('USAF_audit_log').insert({
      actor_user_id: currentUserId,
      actor_display_name: actorProfile?.display_name || null,
      actor_email: actorProfile?.email || null,
      actor_role: actorProfile?.role || null,
      action,
      module: moduleName || 'System',
      entity_type: entityType || null,
      entity_id: entityId ? String(entityId) : null,
      entity_name: entityName || null,
      severity: ['info', 'warning', 'critical'].includes(severity) ? severity : 'info',
      details: details || {},
      old_values: oldValues || {},
      new_values: newValues || {},
      user_agent: navigator.userAgent || null
    });
    if (insertResult.error) console.error('Audit direct insert failed', insertResult.error);
  } catch (err) {
    console.error('Audit log write failed', err);
  }
}


async function initAdminUsers() {
  try {
    currentAdminUser = await requireAdmin();
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
    <div class="actions span-2"><button class="btn secondary" type="button" id="viewAsUserBtn">View as User</button><button class="btn primary" type="submit">Save User</button><button class="btn danger" type="button" id="deleteUserBtn">Delete User</button></div>
  </form>`;
  admin_role.value = selectedUser.role || 'user';
  admin_is_active.value = String(selectedUser.is_active !== false);
  adminUserForm.addEventListener('submit', saveSelectedUser);
  document.getElementById('viewAsUserBtn')?.addEventListener('click', viewAsSelectedUser);
  document.getElementById('deleteUserBtn')?.addEventListener('click', deleteSelectedUser);
}

function viewAsSelectedUser() {
  if (!selectedUser) return showAdminUserModal({title:'Select a User', body:'Choose a user from the list before continuing.', confirmText:'Close'});
  if (!window.USAFEffectiveUser) return showAdminUserModal({title:'View as User Not Available', body:'The View as User helper did not load. Refresh the page and try again.', confirmText:'Close'});
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
  if (error) {
    return showAdminUserModal({
      title: 'User Update Failed',
      message: 'The user profile could not be updated.',
      body: `<div class="admin-user-modal-warning">${escapeHtml(error.message)}</div>`,
      confirmText: 'Close'
    });
  }
  const severity = oldUser.role !== payload.role || oldUser.is_active !== payload.is_active ? 'critical' : 'warning';
  await logAuditEvent('User Profile Updated', 'Admin Users', 'User', selectedUser.id, payload.display_name || payload.email, severity, { role_changed: oldUser.role !== payload.role, active_changed: oldUser.is_active !== payload.is_active }, oldUser, payload);
  await showAdminUserModal({
    title: 'User Updated',
    message: 'The user profile was successfully updated.',
    body: userSummaryHtml({ ...oldUser, ...payload }),
    confirmText: 'Close',
    success: true
  });
  const selectedId = selectedUser.id;
  await loadUsers();
  selectedUser = usersCache.find(u => u.id === selectedId) || selectedUser;
  selectUser(selectedUser.id);
}

async function deleteSelectedUser() {
  if (!selectedUser) {
    return showAdminUserModal({title:'Select a User', body:'Choose a user from the list before deleting.', confirmText:'Close'});
  }
  const currentId = currentAdminUser?.id || null;
  if (currentId && selectedUser.id === currentId) {
    return showAdminUserModal({
      title: 'Cannot Delete Your Own Account',
      body: '<div class="admin-user-modal-warning">You are currently logged in with this account. Admins cannot delete their own active session.</div>',
      confirmText: 'Close'
    });
  }

  const adminUsers = usersCache.filter(u => String(u.role || '').toLowerCase() === 'admin' && u.is_active !== false);
  if (String(selectedUser.role || '').toLowerCase() === 'admin' && adminUsers.length <= 1) {
    return showAdminUserModal({
      title: 'Cannot Delete Last Admin',
      body: '<div class="admin-user-modal-warning">This is the last active Admin account. Create or promote another Admin before deleting this user.</div>',
      confirmText: 'Close'
    });
  }

  const confirmed = await showAdminUserModal({
    title: 'Delete User?',
    message: 'This will remove the user profile from the application.',
    body: `${userSummaryHtml(selectedUser)}<div class="admin-user-modal-warning">This action removes the profile record from Orders & Travel Tracker. If the authentication account still exists in Supabase Auth, the user may need to be removed there separately.</div>`,
    confirmText: 'Delete User',
    cancelText: 'Cancel',
    danger: true
  });
  if (!confirmed) return;

  const oldUser = { ...selectedUser };
  const { error } = await window.usafSupabase.from('USAF_profiles').delete().eq('id', selectedUser.id);
  if (error) {
    return showAdminUserModal({
      title: 'Delete User Failed',
      message: 'The user profile could not be deleted.',
      body: `<div class="admin-user-modal-warning">${escapeHtml(error.message)}</div>`,
      confirmText: 'Close'
    });
  }

  await logAuditEvent('User Deleted', 'Admin Users', 'User', oldUser.id, oldUser.display_name || oldUser.email, 'critical', { deleted_email: oldUser.email, deleted_role: oldUser.role }, oldUser, {});
  await showAdminUserModal({
    title: 'User Deleted',
    message: 'The user profile was removed from the application.',
    body: userSummaryHtml(oldUser),
    confirmText: 'Close',
    success: true
  });

  selectedUser = null;
  userEditor.innerHTML = '<div class="empty-state">Select a user to edit profile, role, active status, or delete.</div>';
  await loadUsers();
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>'"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[c]));
}
function escapeAttr(value) { return escapeHtml(value).replace(/`/g, '&#96;'); }

initAdminUsers();
