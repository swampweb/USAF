let receiptTypesCache = [];

function selectedScopes() {
  const scopes = [];
  if (applies_per_diem.checked) scopes.push('per_diem');
  if (applies_other.checked) scopes.push('other');
  return scopes;
}

function setFormMode(type) {
  if (!type) {
    formTitle.textContent = 'Add Receipt Type';
    type_id_edit.value = '';
    typeForm.reset();
    type_sort_order.value = 100;
    type_is_active.value = 'true';
    applies_per_diem.checked = true;
    applies_other.checked = true;
    cancelEditBtn.style.display = 'none';
    saveBtn.textContent = 'Save Type';
    return;
  }

  formTitle.textContent = 'Edit Receipt Type';
  type_id_edit.value = type.id;
  type_name.value = type.name || '';
  type_sort_order.value = type.sort_order ?? 100;
  type_is_active.value = String(type.is_active !== false);
  const scopes = type.applies_to || [];
  applies_per_diem.checked = scopes.includes('per_diem');
  applies_other.checked = scopes.includes('other');
  cancelEditBtn.style.display = 'inline-flex';
  saveBtn.textContent = 'Update Type';
}

function scopesLabel(type) {
  const scopes = type.applies_to || [];
  if (scopes.includes('per_diem') && scopes.includes('other')) return 'Per Diem + Other';
  if (scopes.includes('per_diem')) return 'Per Diem only';
  if (scopes.includes('other')) return 'Other only';
  return 'Not assigned';
}

async function loadTypes() {
  const { data, error } = await window.usafSupabase
    .from('USAF_receipt_types')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });

  if (error) {
    typeRows.innerHTML = `<tr><td colspan="5">${error.message}</td></tr>`;
    return;
  }

  receiptTypesCache = data || [];
  typeRows.innerHTML = receiptTypesCache.map(t => `
    <tr>
      <td><strong>${t.name}</strong></td>
      <td>${scopesLabel(t)}</td>
      <td>${t.is_active ? '<span class="badge success">Yes</span>' : '<span class="badge warning">No</span>'}</td>
      <td>${t.sort_order ?? ''}</td>
      <td class="actions"><button class="btn small secondary" data-action="edit" data-id="${t.id}">Edit</button><button class="btn small ${t.is_active ? 'danger' : 'secondary'}" data-action="toggle" data-id="${t.id}">${t.is_active ? 'Disable' : 'Enable'}</button></td>
    </tr>`).join('') || '<tr><td colspan="5">No receipt types found.</td></tr>';

  document.querySelectorAll('[data-action="edit"]').forEach(btn => {
    btn.addEventListener('click', () => setFormMode(receiptTypesCache.find(t => t.id === btn.dataset.id)));
  });

  document.querySelectorAll('[data-action="toggle"]').forEach(btn => {
    btn.addEventListener('click', () => toggleActive(btn.dataset.id));
  });
}

async function saveType(e) {
  e.preventDefault();
  const name = type_name.value.trim();
  if (!name) return alert('Receipt Type Name is required.');

  const scopes = selectedScopes();
  if (!scopes.length) return alert('Select at least one use: Per Diem and/or Other receipts.');

  const payload = {
    name,
    sort_order: Number(type_sort_order.value || 100),
    is_active: type_is_active.value === 'true',
    applies_to: scopes
  };

  let result;
  if (type_id_edit.value) {
    result = await window.usafSupabase.from('USAF_receipt_types').update(payload).eq('id', type_id_edit.value);
  } else {
    const user = await getCurrentUser();
    payload.created_by = user.id;
    result = await window.usafSupabase.from('USAF_receipt_types').insert(payload);
  }

  if (result.error) return alert(result.error.message);
  setFormMode(null);
  await loadTypes();
}

async function toggleActive(id) {
  const type = receiptTypesCache.find(t => t.id === id);
  if (!type) return;
  const { error } = await window.usafSupabase
    .from('USAF_receipt_types')
    .update({ is_active: !type.is_active })
    .eq('id', id);
  if (error) return alert(error.message);
  await loadTypes();
}

async function initReceiptTypesAdmin() {
  await requireAdmin();
  await renderLayout('Admin - Receipt Types');
  setFormMode(null);
  await loadTypes();
  typeForm.addEventListener('submit', saveType);
  cancelEditBtn.addEventListener('click', () => setFormMode(null));
}

initReceiptTypesAdmin();
