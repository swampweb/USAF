// Help Desk mobile add-on v84
// Split mobile file for the USAF Orders & Travel Tracker mobile workflow.
// This file intentionally does not redefine MobileApp or MobileShell.
(function(){
  if (window.USAFMobileHelpDesk) return;

  const TABLE = 'USAF_helpdesk_tickets';
  const MSGS = 'USAF_helpdesk_messages';
  const BUCKET = 'usaf-helpdesk';
  let client = null;

  function sb(){
    if (window.usafSupabase) return window.usafSupabase;
    if (window.MobileShell && typeof window.MobileShell.supa === 'function') return window.MobileShell.supa();
    if (typeof window.supa === 'function') return window.supa();
    if (client) return client;
    if (!window.supabase || !window.USAF_CONFIG) throw new Error('Supabase or config.js did not load.');
    client = window.supabase.createClient(window.USAF_CONFIG.SUPABASE_URL, window.USAF_CONFIG.SUPABASE_ANON_KEY, {
      auth: { persistSession:true, autoRefreshToken:true, detectSessionInUrl:true }
    });
    return client;
  }

  function esc(v){
    return String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  function dateLabel(v){
    if (!v) return '';
    try { return new Date(v + 'T00:00:00').toLocaleDateString(); } catch { return String(v); }
  }

  async function currentUser(){
    const r = await sb().auth.getUser();
    return r?.data?.user || null;
  }

  async function profile(uid){
    const { data } = await sb().from('USAF_profiles').select('*').eq('id', uid).maybeSingle();
    return data || {};
  }

  function tourName(t){
    const name = t.tour_name || t.title || t.location || t.destination || `Tour ${String(t.id).slice(0,8)}`;
    const start = t.orders_start_date || t.start_date;
    const end = t.orders_end_date || t.end_date;
    const range = start || end ? ` (${dateLabel(start)} - ${dateLabel(end)})` : '';
    return `${name}${range}`;
  }

  async function activeTours(uid){
    const selectFields = 'id,tour_name,location,orders_start_date,orders_end_date,status,user_id';
    let result = await sb()
      .from('USAF_tours')
      .select(selectFields)
      .eq('user_id', uid)
      .eq('status', 'active')
      .order('orders_start_date', { ascending:false });

    if (result.error) {
      result = await sb()
        .from('USAF_tours')
        .select('*')
        .eq('user_id', uid)
        .order('orders_start_date', { ascending:false });
    }

    if (result.error) throw result.error;
    const today = new Date().toISOString().slice(0,10);
    return (result.data || []).filter(t => {
      const status = String(t.status || 'active').toLowerCase();
      const end = t.orders_end_date || t.end_date;
      return status === 'active' || (!t.status && (!end || end >= today));
    });
  }

  async function badge(uid){
    try{
      const { count } = await sb()
        .from(TABLE)
        .select('id', { count:'exact', head:true })
        .eq('created_by', uid)
        .eq('user_unread', true);
      document.querySelectorAll('[data-mobile-helpdesk-badge]').forEach(b => {
        b.textContent = count || 0;
        b.hidden = !(count || 0);
      });
    }catch(e){
      console.warn('Help Desk badge skipped:', e.message || e);
    }
  }

  async function upload(file, uid){
    if (!file) return null;
    const safe = (file.name || 'image').replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `${uid}/${Date.now()}-${safe}`;
    const { error } = await sb().storage.from(BUCKET).upload(path, file, { upsert:false });
    if (error) throw error;
    const { data } = sb().storage.from(BUCKET).getPublicUrl(path);
    return data?.publicUrl || path;
  }

  function addStyles(){
    if (document.getElementById('mobileHelpDeskStyles')) return;
    const style = document.createElement('style');
    style.id = 'mobileHelpDeskStyles';
    style.textContent = `
      .mobile-helpdesk-fab{position:fixed;right:18px;bottom:18px;z-index:9999;width:58px;height:58px;border-radius:50%;border:0;background:#1d4ed8;color:white;font-size:1.45rem;font-weight:800;box-shadow:0 14px 30px rgba(0,0,0,.28)}
      .mobile-helpdesk-fab span{position:absolute;top:-5px;right:-5px;min-width:22px;height:22px;padding:0 6px;border-radius:999px;background:#dc2626;color:white;font-size:.76rem;line-height:22px}
      .mobile-helpdesk-sheet{position:fixed;inset:0;z-index:10000;background:rgba(15,23,42,.62);display:flex;align-items:flex-end;justify-content:center;padding:12px}
      .mobile-helpdesk-card{width:100%;max-width:560px;max-height:88vh;overflow:auto;background:#fff;border-radius:18px 18px 12px 12px;padding:16px;box-shadow:0 24px 60px rgba(0,0,0,.35);color:#0f172a}
      .mobile-helpdesk-card header{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px}
      .mobile-helpdesk-card header button{border:0;background:#e5e7eb;border-radius:10px;font-size:1.3rem;width:36px;height:36px}
      .mobile-helpdesk-card label{display:block;font-weight:700;margin:12px 0 6px}
      .mobile-helpdesk-card input,.mobile-helpdesk-card select,.mobile-helpdesk-card textarea{width:100%;box-sizing:border-box;border:1px solid #cbd5e1;border-radius:12px;padding:10px;font:inherit;background:white;color:#0f172a}
      .mobile-helpdesk-card textarea{min-height:110px;resize:vertical}
      .mobile-ticket{width:100%;text-align:left;border:1px solid #dbe3ef;background:#f8fafc;border-radius:14px;padding:12px;margin:8px 0;color:#0f172a}
      .mobile-ticket b,.mobile-ticket span,.mobile-ticket small{display:block;margin:2px 0}
      .mobile-help-msg{border-left:4px solid #1d4ed8;background:#f8fafc;border-radius:10px;padding:10px;margin:10px 0}
      .mobile-help-msg p{margin:6px 0 0;white-space:pre-wrap}
      .muted{color:#64748b}
    `;
    document.head.appendChild(style);
  }

  function sheet(html){
    document.querySelector('.mobile-helpdesk-sheet')?.remove();
    const el = document.createElement('div');
    el.className = 'mobile-helpdesk-sheet';
    el.innerHTML = html;
    document.body.appendChild(el);
    el.querySelector('[data-close]')?.addEventListener('click', () => el.remove());
    el.addEventListener('click', e => { if (e.target === el) el.remove(); });
    return el;
  }

  async function openHelpDesk(){
    const u = await currentUser();
    if (!u) return;
    const p = await profile(u.id);
    const tours = await activeTours(u.id);
    const el = sheet(`<div class="mobile-helpdesk-card"><header><strong>Question / Issue</strong><button type="button" data-close>×</button></header><form id="mobileHelpForm"><label>Type<select name="type"><option value="question">Question</option><option value="issue">Issue</option></select></label><label>Related Active Tour<select name="tour"><option value="">None / Not applicable</option>${tours.map(t => `<option value="${esc(t.id)}">${esc(tourName(t))}</option>`).join('')}</select></label><label>Description<textarea name="description" required></textarea></label><label>Image<input type="file" name="image" accept="image/*"></label><button class="btn full" type="submit">Submit</button><button class="btn secondary full" type="button" id="mobileTicketsBtn">View Notifications</button></form></div>`);

    el.querySelector('#mobileHelpForm').onsubmit = async e => {
      e.preventDefault();
      const fd = new FormData(e.target);
      try{
        const file = fd.get('image');
        const image_url = file && file.size ? await upload(file, u.id) : null;
        const tourId = fd.get('tour') || null;
        const t = tours.find(x => x.id === tourId);
        const payload = {
          created_by: u.id,
          created_by_display_name: p.display_name || p.email || u.email,
          type: fd.get('type'),
          description: fd.get('description'),
          related_tour_id: tourId,
          related_tour_label: t ? tourName(t) : null,
          image_url,
          status: 'open',
          admin_unread: true,
          user_unread: false
        };
        const { data, error } = await sb().from(TABLE).insert(payload).select('id').single();
        if (error) throw error;
        await sb().from(MSGS).insert({ ticket_id:data.id, sender_id:u.id, sender_role:p.role || 'user', message:fd.get('description'), image_url });
        alert('Submitted to Admin.');
        el.remove();
        await badge(u.id);
      }catch(err){
        alert(err.message || 'Could not submit Help Desk ticket.');
      }
    };
    el.querySelector('#mobileTicketsBtn').onclick = () => tickets(u.id);
  }

  async function tickets(uid){
    const { data, error } = await sb().from(TABLE).select('*').eq('created_by', uid).order('updated_at', { ascending:false });
    if (error) return alert(error.message);
    const rows = data || [];
    const el = sheet(`<div class="mobile-helpdesk-card"><header><strong>Help Desk Notifications</strong><button type="button" data-close>×</button></header><div class="mobile-ticket-list">${rows.length ? rows.map(t => `<button class="mobile-ticket" type="button" data-id="${esc(t.id)}"><b>${esc(t.type)} - ${esc(t.status)}</b><span>${esc(t.related_tour_label || 'No tour')}</span><small>${esc((t.description || '').slice(0,70))}</small></button>`).join('') : '<p>No tickets yet.</p>'}</div></div>`);
    el.querySelectorAll('[data-id]').forEach(b => b.onclick = () => ticketDetail(b.dataset.id, uid));
  }

  async function ticketDetail(id, uid){
    const { data:t, error:ticketError } = await sb().from(TABLE).select('*').eq('id', id).single();
    if (ticketError) return alert(ticketError.message);
    const { data:msgs, error:messageError } = await sb().from(MSGS).select('*').eq('ticket_id', id).order('created_at', { ascending:true });
    if (messageError) return alert(messageError.message);
    await sb().from(TABLE).update({ user_unread:false }).eq('id', id);
    await badge(uid);
    const el = sheet(`<div class="mobile-helpdesk-card"><header><strong>${esc(t.type)} Ticket</strong><button type="button" data-close>×</button></header><p><b>Status:</b> ${esc(t.status)}</p><p><b>Tour:</b> ${esc(t.related_tour_label || 'None')}</p>${(msgs || []).map(m => `<div class="mobile-help-msg"><b>${esc(m.sender_role)}</b><p>${esc(m.message)}</p></div>`).join('')}${t.status === 'resolved' ? '<p class="muted">Resolved.</p>' : `<form id="mobileReplyForm"><label>Reply<textarea name="message" required></textarea></label><button class="btn full" type="submit">Reply</button></form>`}</div>`);
    el.querySelector('#mobileReplyForm')?.addEventListener('submit', async e => {
      e.preventDefault();
      const msg = new FormData(e.target).get('message');
      const { error:insertError } = await sb().from(MSGS).insert({ ticket_id:id, sender_id:uid, sender_role:'user', message:msg });
      if (insertError) return alert(insertError.message);
      const { error:updateError } = await sb().from(TABLE).update({ status:'user_replied', admin_unread:true, user_unread:false }).eq('id', id);
      if (updateError) return alert(updateError.message);
      ticketDetail(id, uid);
    });
  }

  async function init(){
    addStyles();
    try{
      const u = await currentUser();
      if (!u || document.querySelector('.mobile-helpdesk-fab')) return;
      const p = await profile(u.id);
      if (String(p.role || '').toLowerCase() === 'admin') return;
      const btn = document.createElement('button');
      btn.className = 'mobile-helpdesk-fab';
      btn.innerHTML = '?<span data-mobile-helpdesk-badge hidden>0</span>';
      btn.type = 'button';
      btn.setAttribute('aria-label', 'Open Help Desk');
      btn.onclick = openHelpDesk;
      document.body.appendChild(btn);
      await badge(u.id);
    }catch(e){
      console.warn('Help Desk mobile init skipped:', e.message || e);
    }
  }

  window.USAFMobileHelpDesk = { init, open: openHelpDesk, refreshBadge: badge };
})();
