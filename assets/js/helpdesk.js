
(function(){
  const TABLE = 'USAF_helpdesk_tickets';
  const MSGS = 'USAF_helpdesk_messages';
  const BUCKET = 'usaf-helpdesk';
  function sb(){ return window.usafSupabase; }
  function esc(v){ return String(v ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
  async function user(){ const r = await sb().auth.getUser(); return r?.data?.user || null; }
  async function profile(uid){ const {data}=await sb().from('USAF_profiles').select('*').eq('id',uid).maybeSingle(); return data || {}; }
  function activeTourLabel(t){ return t.title || t.location || t.destination || (`Tour ${String(t.id).slice(0,8)}`); }
  async function activeTours(uid){
    let {data,error}=await sb().from('USAF_tours').select('id,title,location,destination,start_date,end_date,status').eq('user_id',uid).eq('status','active').order('start_date',{ascending:false});
    if(error){ const r=await sb().from('USAF_tours').select('id,title,location,destination,start_date,end_date,status').eq('user_id',uid).order('start_date',{ascending:false}); data=r.data||[]; }
    const today=new Date().toISOString().slice(0,10);
    return (data||[]).filter(t => (String(t.status||'active').toLowerCase()==='active') || (t.end_date && t.end_date >= today));
  }
  function prefix(){ return location.pathname.includes('/admin/') ? '../' : ''; }
  async function upload(file,uid){
    if(!file) return null;
    const safe=(file.name||'image').replace(/[^a-zA-Z0-9._-]/g,'_');
    const path=`${uid}/${Date.now()}-${safe}`;
    const {error}=await sb().storage.from(BUCKET).upload(path,file,{upsert:false});
    if(error) throw error;
    const {data}=sb().storage.from(BUCKET).getPublicUrl(path);
    return data?.publicUrl || path;
  }
  async function counts(uid){
    const {count}=await sb().from(TABLE).select('id',{count:'exact',head:true}).eq('created_by',uid).eq('user_unread',true);
    return count||0;
  }
  async function updateBadge(uid){
    try{ const n=await counts(uid); document.querySelectorAll('[data-helpdesk-user-badge]').forEach(b=>{ b.textContent=n; b.hidden=!n; }); }catch(e){ console.warn('Help Desk badge skipped',e); }
  }
  function modal(html){
    document.querySelector('.helpdesk-modal-backdrop')?.remove();
    const el=document.createElement('div'); el.className='helpdesk-modal-backdrop'; el.innerHTML=html; document.body.appendChild(el);
    el.addEventListener('click',e=>{ if(e.target===el) el.remove(); });
    el.querySelector('.helpdesk-close')?.addEventListener('click',()=>el.remove());
    return el;
  }
  async function open(){
    const u=await user(); if(!u) return;
    const p=await profile(u.id);
    const tours=await activeTours(u.id);
    const el=modal(`<div class="helpdesk-modal"><header><div><h2>Question / Issue Help Desk</h2><p>Submit a question or issue, or review admin replies.</p></div><button class="helpdesk-close">×</button></header><div class="helpdesk-body"><div class="helpdesk-tabs"><button data-tab="new" class="active">New Question / Issue</button><button data-tab="mine">My Tickets</button></div><div id="helpdeskPanel"></div></div></div>`);
    const panel=el.querySelector('#helpdeskPanel');
    async function renderNew(){
      panel.innerHTML=`<form class="helpdesk-form" id="helpdeskForm"><div class="helpdesk-row"><label>Type<select name="type"><option value="question">Question</option><option value="issue">Issue</option></select></label><label>Related Active Tour, if applicable<select name="tour"><option value="">None / Not applicable</option>${tours.map(t=>`<option value="${esc(t.id)}">${esc(activeTourLabel(t))}</option>`).join('')}</select></label></div><label>Description<textarea name="description" required placeholder="Describe the question or issue..."></textarea></label><label>Upload image, optional<input type="file" name="image" accept="image/*"></label><div class="helpdesk-actions"><button class="helpdesk-btn secondary" type="button" data-cancel>Cancel</button><button class="helpdesk-btn" type="submit">Submit</button></div></form>`;
      panel.querySelector('[data-cancel]').onclick=()=>el.remove();
      panel.querySelector('#helpdeskForm').onsubmit=async(e)=>{
        e.preventDefault(); const fd=new FormData(e.target); const file=fd.get('image');
        try{
          const image_url = file && file.size ? await upload(file,u.id) : null;
          const tourId=fd.get('tour')||null;
          const t=tours.find(x=>x.id===tourId);
          const payload={created_by:u.id, created_by_display_name:p.display_name||p.email||u.email, type:fd.get('type'), description:fd.get('description'), related_tour_id:tourId, related_tour_label:t?activeTourLabel(t):null, image_url, status:'open', admin_unread:true, user_unread:false};
          const {data,error}=await sb().from(TABLE).insert(payload).select('id').single(); if(error) throw error;
          await sb().from(MSGS).insert({ticket_id:data.id,sender_id:u.id,sender_role:p.role||'user',message:fd.get('description'),image_url});
          alert('Submitted to Admin.'); el.remove(); await updateBadge(u.id);
        }catch(err){ alert(err.message || 'Could not submit ticket.'); }
      };
    }
    async function renderMine(){
      panel.innerHTML='<div class="helpdesk-empty">Loading tickets...</div>';
      const {data,error}=await sb().from(TABLE).select('*').eq('created_by',u.id).order('updated_at',{ascending:false});
      if(error){ panel.innerHTML=`<div class="helpdesk-empty">${esc(error.message)}</div>`; return; }
      panel.innerHTML=(data||[]).length ? `<div class="helpdesk-list">${data.map(t=>`<article class="helpdesk-ticket" data-id="${esc(t.id)}"><strong>${esc(t.type)}: ${esc((t.description||'').slice(0,70))}</strong><div class="helpdesk-meta"><span class="helpdesk-pill ${t.type==='issue'?'issue':''}">${esc(t.type)}</span><span class="helpdesk-pill ${t.status==='resolved'?'resolved':''}">${esc(t.status)}</span>${t.related_tour_label?`<span>Tour: ${esc(t.related_tour_label)}</span>`:''}</div><div class="helpdesk-muted">${esc(new Date(t.updated_at||t.created_at).toLocaleString())}</div></article>`).join('')}</div>` : '<div class="helpdesk-empty">No tickets yet.</div>';
      panel.querySelectorAll('[data-id]').forEach(x=>x.onclick=()=>openTicket(x.dataset.id,u.id));
    }
    async function openTicket(id,uid){
      const {data:t,error}=await sb().from(TABLE).select('*').eq('id',id).single(); if(error) return alert(error.message);
      const {data:msgs}=await sb().from(MSGS).select('*').eq('ticket_id',id).order('created_at',{ascending:true});
      await sb().from(TABLE).update({user_unread:false}).eq('id',id);
      await updateBadge(uid);
      panel.innerHTML=`<div class="helpdesk-ticket"><strong>${esc(t.type)} Ticket</strong><div class="helpdesk-meta"><span class="helpdesk-pill ${t.status==='resolved'?'resolved':''}">${esc(t.status)}</span>${t.related_tour_label?`<span>Tour: ${esc(t.related_tour_label)}</span>`:''}</div><p>${esc(t.description)}</p>${t.image_url?`<a class="helpdesk-image-link" href="${esc(t.image_url)}" target="_blank">View uploaded image</a>`:''}</div><div>${(msgs||[]).map(m=>`<div class="helpdesk-message ${m.sender_role==='admin'?'admin':'user'}"><b>${esc(m.sender_role)}</b><p>${esc(m.message)}</p>${m.image_url?`<a href="${esc(m.image_url)}" target="_blank">View image</a>`:''}<div class="helpdesk-muted">${esc(new Date(m.created_at).toLocaleString())}</div></div>`).join('')}</div>${t.status==='resolved'?'<div class="helpdesk-empty">This ticket is resolved.</div>':`<form class="helpdesk-form" id="replyForm"><label>Reply<textarea name="message" required></textarea></label><div class="helpdesk-actions"><button class="helpdesk-btn secondary" type="button" data-back>Back</button><button class="helpdesk-btn" type="submit">Reply</button></div></form>`}`;
      panel.querySelector('[data-back]')?.addEventListener('click', renderMine);
      panel.querySelector('#replyForm')?.addEventListener('submit',async(e)=>{e.preventDefault(); const msg=new FormData(e.target).get('message'); const {error}=await sb().from(MSGS).insert({ticket_id:id,sender_id:uid,sender_role:p.role||'user',message:msg}); if(error) return alert(error.message); await sb().from(TABLE).update({status:'user_replied',admin_unread:true,user_unread:false}).eq('id',id); await openTicket(id,uid);});
    }
    el.querySelector('[data-tab="new"]').onclick=()=>{el.querySelectorAll('[data-tab]').forEach(b=>b.classList.remove('active')); el.querySelector('[data-tab="new"]').classList.add('active'); renderNew();};
    el.querySelector('[data-tab="mine"]').onclick=()=>{el.querySelectorAll('[data-tab]').forEach(b=>b.classList.remove('active')); el.querySelector('[data-tab="mine"]').classList.add('active'); renderMine();};
    await renderNew();
  }
  async function adminBadge(){
    try{ const {count}=await sb().from(TABLE).select('id',{count:'exact',head:true}).eq('admin_unread',true).neq('status','resolved'); document.querySelectorAll('[data-helpdesk-admin-badge]').forEach(b=>{ b.textContent=count||0; b.hidden=!(count||0); }); }catch(e){}
  }
  async function init(){
    if(!sb() || document.body.dataset.helpdeskInit==='1') { await adminBadge(); return; }
    document.body.dataset.helpdeskInit='1';
    const u=await user(); if(!u) return;
    const p=await profile(u.id);
    if(p.role==='admin') { await adminBadge(); return; }
    const btn=document.createElement('button'); btn.className='helpdesk-fab'; btn.type='button'; btn.title='Question / Issue Help Desk'; btn.innerHTML='?<span class="helpdesk-badge" data-helpdesk-user-badge hidden>0</span>'; btn.onclick=open; document.body.appendChild(btn);
    await updateBadge(u.id);
  }
  window.USAFHelpDesk={init,open,adminBadge};
})();
