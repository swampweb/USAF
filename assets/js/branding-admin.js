const BRANDING_BUCKET = 'usaf-branding';
let currentSettings = null;

const IMAGE_FIELDS = [
  { key:'site_logo_path', label:'Site Logo', recommended:'Recommended 1024 x 1024 PNG with transparent background. Minimum 512 x 512.', folder:'logos' },
  { key:'login_logo_path', label:'Login Logo', recommended:'Recommended 680 x 420 PNG with transparent background. Minimum 420 px wide.', folder:'login' },
  { key:'dashboard_banner_path', label:'Dashboard Banner', recommended:'Recommended 1920 x 480 JPG or WebP. Keep important content centered.', folder:'banners' },
  { key:'login_background_path', label:'Login Background', recommended:'Recommended 1920 x 1080 JPG or WebP. Dark or muted images work best.', folder:'backgrounds' }
];

function cacheBust(url) {
  if (!url) return '';
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}v=${Date.now()}`;
}

function validHex(value, fallback) {
  if (/^#[0-9a-fA-F]{6}$/.test(value || '')) return value.toUpperCase();
  return fallback;
}

async function initBrandingAdmin(){
  await requireAdmin();
  await renderLayout('Admin - Branding');
  brandingForm.addEventListener('submit', saveBranding);
  await loadBranding();
}

async function loadBranding(){
  const {data,error}=await window.usafSupabase.from('USAF_settings').select('*').eq('id',true).maybeSingle();
  if(error)return alert(error.message);
  currentSettings=data||{};

  organization_name.value=currentSettings.organization_name||'Orders & Travel Tracker';
  primary_color.value=validHex(currentSettings.primary_color,'#00308F');
  secondary_color.value=validHex(currentSettings.secondary_color,'#0A2342');
  accent_color.value=validHex(currentSettings.accent_color,'#C0C0C0');

  renderColorPickers();
  renderImageUploads();
}

function renderColorPickers(){
  const colorFields = [
    {id:'primary_color', label:'Primary Color'},
    {id:'secondary_color', label:'Secondary Color'},
    {id:'accent_color', label:'Accent Color'}
  ];
  colorFields.forEach(field => {
    const input = document.getElementById(field.id);
    if (!input || input.closest('.color-picker-card')) return;
    const label = input.closest('label');
    if (!label) return;
    label.classList.add('color-picker-card');
    const title = document.createElement('span');
    title.className = 'color-picker-title';
    title.textContent = field.label;
    const row = document.createElement('div');
    row.className = 'color-picker-row';
    const swatch = document.createElement('span');
    swatch.className = 'color-dot';
    const hex = document.createElement('span');
    hex.className = 'color-hex';
    row.appendChild(input);
    row.appendChild(swatch);
    row.appendChild(hex);
    label.textContent = '';
    label.appendChild(title);
    label.appendChild(row);
  });
  updateColorPreviews();
  ['primary_color','secondary_color','accent_color'].forEach(id => {
    const input = document.getElementById(id);
    if (input && !input.dataset.previewBound) {
      input.dataset.previewBound = 'true';
      input.addEventListener('input', updateColorPreviews);
      input.addEventListener('change', updateColorPreviews);
    }
  });
}

function updateColorPreviews(){
  ['primary_color','secondary_color','accent_color'].forEach(id => {
    const input = document.getElementById(id);
    if (!input) return;
    const row = input.closest('.color-picker-row');
    if (!row) return;
    const hex = row.querySelector('.color-hex');
    const dot = row.querySelector('.color-dot');
    const value = validHex(input.value, '#000000');
    if (hex) hex.textContent = value;
    if (dot) dot.style.background = value;
  });
}

function imagePreview(path){
  return path
    ? `<div class="branding-preview"><img src="${cacheBust(path)}" alt="Branding preview"></div>`
    : '<div class="branding-preview empty">No image set</div>';
}

function renderImageUploads(){
  imageUploadList.innerHTML=IMAGE_FIELDS.map(f=>`
    <div class="branding-upload-card">
      <div class="branding-upload-head">
        <strong>${f.label}</strong>
        <small>${f.recommended}</small>
      </div>
      ${imagePreview(currentSettings[f.key])}
      <div class="branding-actions">
        <input id="${f.key}_file" type="file" accept="image/png,image/jpeg,image/webp,image/x-icon,image/vnd.microsoft.icon">
        <button type="button" class="btn small" data-upload="${f.key}">Upload</button>
        <button type="button" class="btn small secondary" data-clear="${f.key}">Clear</button>
      </div>
      <div class="branding-path">${currentSettings[f.key]||'No path saved'}</div>
    </div>`).join('');
  document.querySelectorAll('[data-upload]').forEach(btn=>btn.addEventListener('click',()=>uploadImage(btn.dataset.upload)));
  document.querySelectorAll('[data-clear]').forEach(btn=>btn.addEventListener('click',()=>clearImage(btn.dataset.clear)));
}

async function saveBranding(e){
  e.preventDefault();
  updateColorPreviews();
  const payload={
    id:true,
    organization_name:organization_name.value.trim()||'Orders & Travel Tracker',
    primary_color:primary_color.value,
    secondary_color:secondary_color.value,
    accent_color:accent_color.value
  };
  const {error}=await window.usafSupabase.from('USAF_settings').upsert(payload);
  if(error)return alert(error.message);
  alert('Branding saved. Colors and name will update after the page reloads.');
  await loadBranding();
}

async function uploadImage(key){
  const config=IMAGE_FIELDS.find(f=>f.key===key);
  const input=document.getElementById(`${key}_file`);
  const file=input.files&&input.files[0];
  if(!file)return alert('Choose an image file first.');
  const extension=(file.name.split('.').pop()||'png').toLowerCase();
  const safeName=`${config.folder}/${key}_${Date.now()}.${extension}`;
  const {error:uploadError}=await window.usafSupabase.storage.from(BRANDING_BUCKET).upload(safeName,file,{upsert:true,contentType:file.type||'image/png'});
  if(uploadError)return alert(uploadError.message+'\n\nIf this is the first time using Branding uploads, run sql/usaf_branding_storage_v32.sql in Supabase first.');
  const {data}=window.usafSupabase.storage.from(BRANDING_BUCKET).getPublicUrl(safeName);
  const {error:updateError}=await window.usafSupabase.from('USAF_settings').upsert({id:true,[key]:data.publicUrl});
  if(updateError)return alert(updateError.message);
  alert(`${config.label} uploaded and saved. Refresh the site pages to see the update.`);
  await loadBranding();
}

async function clearImage(key){
  const {error}=await window.usafSupabase.from('USAF_settings').upsert({id:true,[key]:null});
  if(error)return alert(error.message);
  await loadBranding();
}

initBrandingAdmin();
