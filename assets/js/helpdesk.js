(function(){
  const TABLE = 'USAF_helpdesk_tickets';
  const MSGS = 'USAF_helpdesk_messages';
  const BUCKET = 'usaf-helpdesk';
  let client = null;

  function sb(){
    if (window.usafSupabase) return window.usafSupabase;
    if (client) return client;
    if (!window.supabase || !window.USAF_CONFIG) throw new Error('Supabase or config.js did not load.');
    client = window.supabase.createClient(window.USAF_CONFIG.SUPABASE_URL, window.USAF_CONFIG.SUPABASE_ANON_KEY, {
      auth:{ persistSession:true, autoRefreshToken:true, detectSessionInUrl:true }
    });
    return client;
  }
  function esc(v){ return String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function dt(v){ if(!v) return ''; try{return new Date(String(v)+'T00:00:00').toLocaleDateString();}catch{return String(v);} }
  async function currentUser(){ const r = await sb().auth.getUser(); return r?.data?.user || null; }
  async function profile(uid){ const {data}=await sb().from('USAF_profiles').select('*').eq('id',uid).maybeSingle(); return data || {}; }
  function activeTourLabel(t){
    const name = t.tour_name || t.title || t.location || t.destination || `Tour ${String(t.id).slice(0,8)}`;
    const start = t.orders_start_date || t.start_date;
    const end = t.orders_end_date || t.end_date;
    const range = start || end ? ` (${dt(start)} - ${dt(end)})` : '';
    return `${name}${range}`;
  }
  async function activeTours(uid){
    const attempts = [
      () => sb().from('USAF_tours').select('id,tour_name,location,orders_start_date,orders_end_date,status,user_id').eq('user_id',uid).eq('status','active').order('orders_start_date',{ascending:false}),
      () => sb().from('USAF_tours').select('id,tour_name,location,orders_start_date,orders_end_date,status,user_id').eq('user_id',uid).order('orders_start_date',{ascending:false}),
      () => sb().from('USAF_tour_summary').select('*').eq('user_id',uid).order('orders_start_date',{ascending:false}),
      () => sb().from('USAF_tours').select('*').eq('user_id',uid)
    ];
    let data = [];
    let lastError = null;
    for (const run of attempts) {
      const r = await run();
      if (!r.error) { data = r.data || []; break; }
      lastError = r.error;
    }
    if (!data.length && lastError) console.warn('Help Desk active tours fallback:', lastError.message || lastError);
    const today = new Date().toISOString().slice(0,10);
    return (data || []).filter(t => {
      const status = String(t.status || 'active').toLowerCase();
      const end = t.orders_end_date || t.end_date;
      return status === 'active' || (!t.status && (!end || end >= today));
    });
  }
  async function upload(file,uid){
    if(!file) return null;
    const safe=(file.name||'image').replace(/[^a-zA-Z0-9._-]/g,'_');
    const path=`${uid}/${Date.now()}-${safe}`;
    const {error}=await sb().storage.from(BUCKET).upload(path,file,{upsert:false});
    if(error) throw error;
    const {data}=sb().storage.from(BUCKET).getPublicUrl(path);
    return data?.publicUrl || path;
  }
  async function counts(uid){ const {count}=await sb().from(TABLE).select('id',{count:'exact',head:true}).eq('created_by',uid).eq('user_unread',true); return count || 0; }
  async function adminCount(){ const {count}=await sb().from(TABLE).select('id',{count:'exact',head:true}).eq('admin_unread',true); return count || 0; }
  async function updateUserBadge(){
    try{
      const u=await currentUser(); if(!u) return;
      const n=await counts(u.id);
      document.querySelectorAll('[data-helpdesk-user-badge]').forEach(b=>{ b.textContent=n; b.hidden=!n; });
    }catch(e){ console.warn('Help Desk user badge skipped:', e.message || e); }
  }
  async function updateAdminBadge(){
    try{
      const n=await adminCount();
      document.querySelectorAll('[data-helpdesk-admin-badge]').forEach(b=>{ b.textContent=n; b.hidden=!n; });
    }catch(e){ console.warn('Help Desk admin badge skipped:', e.message || e); }
  }
  function modal(html){
    document.querySelector('.helpdesk-modal-backdrop')?.remove();
    const el=document.createElement('div');
    el.className='helpdesk-modal-backdrop';
    el.innerHTML=html;
    document.body.appendChild(el);
    el.querySelector('.helpdesk-close')?.addEventListener('click',()=>el.remove());
    el.addEventListener('click', e => { if(e.target === el) el.remove(); });
    return el;
  }
  function success(el,ticketId){
    el.querySelector('.helpdesk-body').innerHTML = `<div class="helpdesk-success-card"><div class="helpdesk-success-icon">✓</div><h3>Submitted to Admin</h3><p>Your Help Desk ticket was created. You will see a red notification bubble on Help Desk when Admin replies or marks it resolved.</p><div class="helpdesk-actions"><button class="helpdesk-btn secondary" type="button" data-close-success>Close</button><button class="helpdesk-btn" type="button" data-open-ticket="${esc(ticketId)}">View Ticket</button></div></div>`;
    el.querySelector('[data-close-success]')?.addEventListener('click',()=>el.remove());
    el.querySelector('[data-open-ticket]')?.addEventListener('click',()=>ticketDetail(ticketId));
  }
  async function open(){
    const u=await currentUser(); if(!u) return;
    const p=await profile(u.id);
    const tours=await activeTours(u.id);
    const el=modal(`<div class="helpdesk-modal"><div class="helpdesk-head"><div><h2>Question / Issue Help Desk</h2><p>Submit a question or issue, or review admin replies.</p></div><button class="helpdesk-close" type="button">×</button></div><div class="helpdesk-body"><div class="helpdesk-tabs"><button class="helpdesk-tab active" data-tab="new">New Question / Issue</button><button class="helpdesk-tab" data-tab="mine">My Tickets <span class="tab-badge" data-helpdesk-user-badge hidden>0</span></button></div><div id="helpdeskPanel"></div></div></div>`);
    await updateUserBadge();
    const panel=el.querySelector('#helpdeskPanel');
    function renderForm(){
      el.querySelectorAll('.helpdesk-tab').forEach(x=>x.classList.toggle('active',x.dataset.tab==='new'));
      panel.innerHTML=`<form class="helpdesk-form" id="helpdeskForm"><div class="helpdesk-row"><label>Type<select name="type"><option value="question">Question</option><option value="issue">Issue</option></select></label><label>Related Active Tour, if applicable<select name="tour"><option value="">None / Not applicable</option>${tours.map(t=>`<option value="${esc(t.id)}">${esc(activeTourLabel(t))}</option>`).join('')}</select></label></div><label>Description<textarea name="description" required placeholder="Describe the question or issue..."></textarea></label><label>Upload image, optional<input type="file" name="image" accept="image/*"></label><div class="helpdesk-actions"><button class="helpdesk-btn secondary" type="button" data-cancel>Cancel</button><button class="helpdesk-btn" type="submit">Submit</button></div></form>`;
      panel.querySelector('[data-cancel]').onclick=()=>el.remove();
      panel.querySelector('#helpdeskForm').onsubmit=async(e)=>{
        e.preventDefault();
        const fd=new FormData(e.target);
        try{
          const file=fd.get('image');
          const image_url=file && file.size ? await upload(file,u.id) : null;
          const tourId=fd.get('tour') || null;
          const t=tours.find(x=>x.id===tourId);
          const payload={created_by:u.id,created_by_display_name:p.display_name||p.email||u.email,type:fd.get('type'),description:fd.get('description'),related_tour_id:tourId,related_tour_label:t?activeTourLabel(t):null,image_url,status:'open',admin_unread:true,user_unread:false};
          const {data,error}=await sb().from(TABLE).insert(payload).select('id').single();
          if(error) throw error;
          await sb().from(MSGS).insert({ticket_id:data.id,sender_id:u.id,sender_role:p.role||'user',message:fd.get('description'),image_url});
          await updateUserBadge();
          await updateAdminBadge();
          success(el,data.id);
        }catch(err){ alert(err.message || 'Could not submit Help Desk ticket.'); }
      };
    }
    async function renderMine(){
      el.querySelectorAll('.helpdesk-tab').forEach(x=>x.classList.toggle('active',x.dataset.tab==='mine'));
      panel.innerHTML='<div class="helpdesk-empty">Loading tickets...</div>';
      const {data,error}=await sb().from(TABLE).select('*').eq('created_by',u.id).order('updated_at',{ascending:false});
      if(error){ panel.innerHTML=`<div class="helpdesk-empty">${esc(error.message)}</div>`; return; }
      const rows=data||[];
      panel.innerHTML= rows.length ? `<div class="helpdesk-list">${rows.map(t=>`<button class="helpdesk-ticket" type="button" data-ticket="${esc(t.id)}"><strong>${esc(t.type)} - ${esc(t.status)}</strong><div class="helpdesk-meta"><span>${esc(t.related_tour_label||'No tour')}</span><span>${esc(new Date(t.updated_at||t.created_at).toLocaleString())}</span></div><small>${esc((t.description||'').slice(0,110))}</small></button>`).join('')}</div>` : '<div class="helpdesk-empty">No tickets yet.</div>';
      panel.querySelectorAll('[data-ticket]').forEach(b=>b.onclick=()=>ticketDetail(b.dataset.ticket));
    }
    el.querySelector('[data-tab="new"]').onclick=renderForm;
    el.querySelector('[data-tab="mine"]').onclick=renderMine;
    renderForm();
  }
  async function ticketDetail(id){
    const u=await currentUser(); if(!u) return;
    const {data:t,error:ticketError}=await sb().from(TABLE).select('*').eq('id',id).single();
    if(ticketError) return alert(ticketError.message);
    const {data:msgs,error:msgError}=await sb().from(MSGS).select('*').eq('ticket_id',id).order('created_at',{ascending:true});
    if(msgError) return alert(msgError.message);
    await sb().from(TABLE).update({user_unread:false}).eq('id',id);
    await updateUserBadge();
    const el=modal(`<div class="helpdesk-modal"><div class="helpdesk-head"><div><h2>${esc(t.type)} Ticket</h2><p>${esc(t.related_tour_label||'No related tour')}</p></div><button class="helpdesk-close" type="button">×</button></div><div class="helpdesk-body"><div class="helpdesk-status-line"><span class="helpdesk-pill ${t.type==='issue'?'issue':''}">${esc(t.type)}</span><span class="helpdesk-pill ${t.status==='resolved'?'resolved':''}">${esc(t.status)}</span></div>${(msgs||[]).map(m=>`<div class="helpdesk-message ${m.sender_role==='admin'?'admin':'user'}"><b>${esc(m.sender_role)}</b><p>${esc(m.message)}</p>${m.image_url?`<a class="helpdesk-image-link" href="${esc(m.image_url)}" target="_blank">View image</a>`:''}<div class="helpdesk-muted">${esc(new Date(m.created_at).toLocaleString())}</div></div>`).join('')}${t.status==='resolved'?'<div class="helpdesk-empty">Resolved ticket.</div>':`<form class="helpdesk-form" id="userReplyForm"><label>Reply<textarea name="message" required></textarea></label><div class="helpdesk-actions"><button class="helpdesk-btn" type="submit">Reply</button></div></form>`}</div></div>`);
    el.querySelector('#userReplyForm')?.addEventListener('submit',async(e)=>{e.preventDefault(); const msg=new FormData(e.target).get('message'); const {error}=await sb().from(MSGS).insert({ticket_id:id,sender_id:u.id,sender_role:'user',message:msg}); if(error) return alert(error.message); await sb().from(TABLE).update({status:'user_replied',admin_unread:true,user_unread:false}).eq('id',id); ticketDetail(id);});
  }
  function bind(){
    document.addEventListener('click',e=>{ const trigger=e.target.closest('[data-helpdesk-open]'); if(trigger){ e.preventDefault(); open(); }});
    updateUserBadge(); updateAdminBadge();
  }
  window.USAFHelpDesk={open,userBadge:updateUserBadge,adminBadge:updateAdminBadge};
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',bind); else bind();
})();
