
(function ensureAppIcons(){
  const links = [
    ['icon','/USAF/favicon.ico'],
    ['shortcut icon','/USAF/favicon.ico'],
    ['apple-touch-icon','/USAF/assets/img/orders-travel-tracker-icon.png'],
    ['manifest','/USAF/site.webmanifest']
  ];
  links.forEach(([rel,href])=>{
    if(!document.querySelector(`link[rel="${rel}"]`)){
      const l=document.createElement('link'); l.rel=rel; l.href=href; document.head.appendChild(l);
    }
  });
})();
const ADMIN_LINKS = [
  { label: "Users", href: "admin/users.html", icon: "users" },
  { label: "Receipt Types", href: "admin/receipt-types.html", icon: "tags" },
  { label: "Help Desk", href: "admin/help-desk.html", icon: "help", badge: "admin" },
  { label: "Branding", href: "admin/branding.html", icon: "palette" },
  { label: "Settings", href: "admin/settings.html", icon: "settings" },
  { label: "Audit Log", href: "admin/audit-log.html", icon: "shield" },
  { label: "Archive Manager", href: "admin/archive-manager.html", icon: "archive" }
];

const USER_LINKS = [
  { label: "Dashboard", href: "dashboard.html", icon: "home" },
  { label: "Tours", href: "tours.html", icon: "folder" },
  { label: "Receipts", href: "receipts.html", icon: "receipt" },
  { label: "Voucher / Downloads", href: "voucher-downloads.html", icon: "download" },
  { label: "Reports", href: "reports.html", icon: "bar-chart" }
];

function isAdminPath() {
  return location.pathname.includes('/admin/');
}

function pathPrefix() {
  return isAdminPath() ? '../' : '';
}

function normalizeHref(href) {
  return pathPrefix() + href;
}

function isActive(href) {
  const file = location.pathname.split('/').pop() || 'index.html';
  return href.endsWith(file);
}


function assetWithCache(url) {
  if (!url) return '';
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}v=${Date.now()}`;
}
function renderBrandLogo(settings) {
  const logoPath = settings?.site_logo_path;
  if (logoPath) {
    return `<div class="logo-mark image-logo"><img src="${assetWithCache(logoPath)}" alt="Site logo"></div>`;
  }
  return '${renderBrandLogo(settings)}';
}

function iconSvg(name) {
  const icons = {
    home: '<path d="M3 10.5 12 3l9 7.5V21a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>',
    calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    receipt: '<path d="M6 2h12v20l-3-2-3 2-3-2-3 2z"/><path d="M8 7h8M8 11h8M8 15h5"/>',
    folder: '<path d="M3 6h7l2 2h9v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    download: '<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/>',
    'bar-chart': '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
    tags: '<path d="M20.59 13.41 11 3H4v7l9.59 9.59a2 2 0 0 0 2.82 0l4.18-4.18a2 2 0 0 0 0-2.82z"/><circle cx="7.5" cy="7.5" r=".5"/>',
    help: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 1 1 5.82 1c-.55 1.1-1.91 1.5-2.41 2.5"/><path d="M12 17h.01"/>',
    palette: '<path d="M12 22a10 10 0 1 1 10-10 3 3 0 0 1-3 3h-2a2 2 0 0 0-2 2v1a4 4 0 0 1-3 4z"/><circle cx="7.5" cy="10.5" r="1"/><circle cx="12" cy="7.5" r="1"/><circle cx="16.5" cy="10.5" r="1"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.65 1.65 0 0 0 15 19.4a1.65 1.65 0 0 0-1 .6 1.65 1.65 0 0 0-.4 1v.17a2 2 0 1 1-4 0V21a1.65 1.65 0 0 0-.4-1 1.65 1.65 0 0 0-1-.6 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-.6-1 1.65 1.65 0 0 0-1-.4H2.83a2 2 0 1 1 0-4H3a1.65 1.65 0 0 0 1-.4 1.65 1.65 0 0 0 .6-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-.6 1.65 1.65 0 0 0 .4-1V2.83a2 2 0 1 1 4 0V3a1.65 1.65 0 0 0 .4 1 1.65 1.65 0 0 0 1 .6 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.14.36.36.69.6 1 .28.24.62.38 1 .4h.17a2 2 0 1 1 0 4H21c-.38.02-.72.16-1 .4-.24.31-.46.64-.6 1z"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
    archive: '<path d="M21 8v13H3V8"/><path d="M1 3h22v5H1z"/><path d="M10 12h4"/>'
  };
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${icons[name] || icons.home}</svg>`;
}

async function loadSettings() {
  const { data } = await window.usafSupabase.from("USAF_settings").select("*").eq("id", true).maybeSingle();
  return data || {};
}



function ensureHelpDeskNavBadgeStyle() {
  if (document.getElementById('helpDeskNavBadgeStyle')) return;
  const style = document.createElement('style');
  style.id = 'helpDeskNavBadgeStyle';
  style.textContent = '.nav-link .nav-badge{margin-left:auto;min-width:20px;height:20px;border-radius:999px;background:#dc2626;color:#fff;font-size:12px;font-weight:900;line-height:20px;text-align:center;padding:0 6px;display:inline-flex;align-items:center;justify-content:center}.nav-link .nav-badge[hidden]{display:none!important}';
  document.head.appendChild(style);
}

async function refreshHelpDeskAdminBadge(profile) {
  try {
    if (String(profile?.role || '').toLowerCase() !== 'admin') return;
    const { count, error } = await window.usafSupabase
      .from('USAF_helpdesk_tickets')
      .select('id', { count: 'exact', head: true })
      .eq('admin_unread', true);
    if (error) throw error;
    document.querySelectorAll('[data-helpdesk-admin-badge]').forEach(badge => {
      const value = count || 0;
      badge.textContent = value;
      badge.hidden = !value;
    });
  } catch (err) {
    console.warn('Help Desk admin badge failed to load', err);
  }
}

async function renderLayout(activeTitle) {
  await requireAuth();
  const profile = await getCurrentProfile();
  const settings = await loadSettings();
  const prefix = pathPrefix();

  document.documentElement.style.setProperty('--primary', settings.primary_color || '#00308F');
  document.documentElement.style.setProperty('--secondary', settings.secondary_color || '#0A2342');
  document.documentElement.style.setProperty('--accent', settings.accent_color || '#C0C0C0');

  ensureHelpDeskNavBadgeStyle();
  const app = document.querySelector('#app');
  const content = app.innerHTML;
  const userLinksHtml = USER_LINKS.map(l => `<a class="nav-link ${isActive(l.href) ? 'active' : ''}" href="${normalizeHref(l.href)}">${iconSvg(l.icon)}<span>${l.label}</span></a>`).join('');
  const adminLinksHtml = profile?.role === 'admin' ? `<div class="nav-section-title">Admin</div>${ADMIN_LINKS.map(l => `<a class="nav-link ${isActive(l.href) ? 'active' : ''}" href="${normalizeHref(l.href)}">${iconSvg(l.icon)}<span>${l.label}</span>${l.badge === 'admin' ? '<span class="nav-badge" data-helpdesk-admin-badge hidden>0</span>' : ''}</a>`).join('')}` : '';

  app.innerHTML = `
    <aside class="sidebar">
      <div class="brand">
        ${renderBrandLogo(settings)}
        <div>
          <div class="brand-title">${settings.organization_name || 'USAF Travel Tracker'}</div>
          <div class="brand-subtitle">Integrity · Service · Excellence</div>
        </div>
      </div>
      <nav>${userLinksHtml}${adminLinksHtml}</nav>
      ${settings.show_sidebar_footer === false ? '' : `<div class="sidebar-footer">${settings.footer_text || '© 2026 CajunVeteran™'}</div>`}
    </aside>
    <main class="main">
      <header class="topbar" style="background-image: linear-gradient(90deg, rgba(0,48,143,.94), rgba(10,35,66,.86)), url('${assetWithCache(settings.dashboard_banner_path) || prefix + 'assets/img/default-banner.svg'}')">
        <div><h1>${activeTitle}</h1><p>${settings.system_tagline || 'Track receipts, cycles, vouchers, and reports.'}</p></div>
        <div class="user-chip"><span>${profile?.display_name || profile?.email || 'User'}</span><small>${profile?.role || 'user'}</small><button onclick="signOut()">Sign Out</button></div>
      </header>
      <section class="page-content">${content}</section>
    </main>`;

  await refreshHelpDeskAdminBadge(profile);
  showProtectedPage();
}

function money(value) {
  return Number(value || 0).toLocaleString(undefined, { style: 'currency', currency: 'USD' });
}

function fmtDate(dateValue) {
  if (!dateValue) return '';
  const d = new Date(dateValue + 'T12:00:00');
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
