(function(){
  const TABLE='USAF_helpdesk_tickets';
  const MSGS='USAF_helpdesk_messages';
  let selected=null;
  function sb(){return window.usafSupabase;}

  function sleep(ms){ return new Promise(resolve => setTimeout(resolve, ms)); }
  async function waitForSupabase(){
    for (let i = 0; i < 50; i++) {
      if (window.usafSupabase) return window.usafSupabase;
      await sleep(100);
    }
    const hasConfig = !!window.USAF_CONFIG;
    const hasLibrary = !!window.supabase;
    throw new Error(`Supabase client did not load. config.js loaded: ${hasConfig}. Supabase library loaded: ${hasLibrary}. Check admin/help-desk.html script order and assets/js/supabaseClient.js.`);
  }
  function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function ticketNo(id){return 'Ticket #'+String(id||'').replace(/-/g,'').slice(0,8).toUpperCase();}

  function normStatus(v){ return String(v || 'open').toLowerCase().replace(/\s+/g,'_'); }
  function isClosedStatus(v){ return ['resolved','closed'].includes(normStatus(v)); }
  function isActiveStatus(v){ return !isClosedStatus(v); }
  function statusClass(v){ return 'status-' + normStatus(v).replace(/[^a-z0-9_-]/g,'-'); }
  function statusLabel(v){ const s=normStatus(v); return s.split('_').map(x=>x.charAt(0).toUpperCase()+x.slice(1)).join(' '); }

  function statusBucket(v){ return isClosedStatus(v) ? 'closed' : 'active'; }
  async function statusFixFromMessages(rows){
    const list = Array.isArray(rows) ? rows : [];
    if(!list.length) return list;
    try{
      const ids = list.map(t => t && t.id).filter(Boolean);
      if(!ids.length) return list;
      const {data:msgs,error} = await sb().from(MSGS).select('ticket_id,sender_role,message,created_at').in('ticket_id', ids).order('created_at',{ascending:true});
      if(error || !Array.isArray(msgs)) return list;
      const forced = {};
      msgs.forEach(m => {
        const role = String(m.sender_role || '').toLowerCase();
        const text = String(m.message || '').toLowerCase();
        if(role === 'admin' && text.includes('closed by admin')) forced[m.ticket_id] = 'closed';
        if(role === 'admin' && text.includes('marked resolved by admin')) forced[m.ticket_id] = 'resolved';
      });
      list.forEach(t => {
        if(t && forced[t.id] && !isClosedStatus(t.status)){
          t.status = forced[t.id];
          try{ sb().from(TABLE).update({status:t.status,resolved_at:new Date().toISOString(),admin_unread:false}).eq('id',t.id); }catch(_e){}
        }
      });
    }catch(_e){}
    return list;
  }
  function filterRowsByStatus(rows, filter){
    const f = filter || 'active';
    if(f === 'all') return rows;
    if(f === 'closed') return rows.filter(t => isClosedStatus(t.status));
    if(f === 'resolved') return rows.filter(t => normStatus(t.status)==='resolved');
    return rows.filter(t => isActiveStatus(t.status));
  }
  function filterSelectHtml(current){
    const f = current || 'active';
    return `<div class="helpdesk-filter-row"><label>Status <select id="helpdeskStatusFilter"><option value="active" ${f==='active'?'selected':''}>Active / Open</option><option value="all" ${f==='all'?'selected':''}>All</option><option value="closed" ${f==='closed'?'selected':''}>Resolved / Closed</option></select></label></div>`;
  }
  function pill(t){return `<span class="helpdesk-pill ${t.type==='issue'?'issue':''} ${isClosedStatus(t.status)?'resolved':''} ${statusClass(t.status)}">${esc(t.type)} / ${esc(statusLabel(t.status))}</span>`;}
  async function localGetProfile(){
    if (typeof window.getCurrentProfile === 'function' && window.getCurrentProfile !== localGetProfile) return await window.getCurrentProfile();
    await waitForSupabase();
    const sessionResult = await sb().auth.getSession();
    const user = sessionResult?.data?.session?.user;
    if (!user) { window.location.replace('../login.html?returnTo=admin/help-desk.html'); return null; }
    const {data,error}=await sb().from('USAF_profiles').select('*').eq('id',user.id).maybeSingle();
    if(error) throw error;
    return data;
  }
  async function localRequireAuth(){
    await waitForSupabase();
    const sessionResult = await sb().auth.getSession();
    const session = sessionResult?.data?.session;
    if (!session) {
      const returnTo = encodeURIComponent('admin/help-desk.html');
      window.location.replace(`../login.html?returnTo=${returnTo}`);
      return null;
    }
    return session;
  }
  async function localRequireAdmin(){
    if (typeof window.requireAdmin === 'function' && window.requireAdmin !== localRequireAdmin) return await window.requireAdmin();
    const p = await localGetProfile();
    if (!p) return null;
    if (p.role !== 'admin') { window.location.replace('../dashboard.html'); return null; }
    return p;
  }
  function ensureAuthGlobals(){
    if (typeof window.requireAuth !== 'function') window.requireAuth = localRequireAuth;
    if (typeof window.getCurrentProfile !== 'function') window.getCurrentProfile = localGetProfile;
    if (typeof window.requireAdmin !== 'function') window.requireAdmin = localRequireAdmin;
    if (typeof window.showProtectedPage !== 'function') window.showProtectedPage = function(){ document.body.style.visibility='visible'; };
    if (typeof window.signOut !== 'function') window.signOut = async function(){ try{ await sb().auth.signOut(); } finally { window.location.replace('../login.html'); } };
  }
  async function me(){return await localGetProfile() || {};}
  async function adminBadge(){
    try{const {count}=await sb().from(TABLE).select('id',{count:'exact',head:true}).eq('admin_unread',true); document.querySelectorAll('[data-helpdesk-admin-badge]').forEach(b=>{b.textContent=count||0;b.hidden=!(count||0);});}catch(e){}
  }
  async function load(){
    const list=document.getElementById('helpdeskTicketList');
    const detail=document.getElementById('helpdeskTicketDetail');
    if(!list || !detail) return;
    list.innerHTML='<div class="helpdesk-empty">Loading tickets...</div>';
    if(!selected) detail.innerHTML='<div class="helpdesk-empty">Select a ticket.</div>';
    const {data,error}=await sb().from(TABLE).select('*').order('updated_at',{ascending:false});
    if(error){list.innerHTML=`<div class="helpdesk-empty">${esc(error.message)}</div>`; return;}
    const rows=await statusFixFromMessages(data||[]);
    const statusFilter=(document.getElementById('helpdeskStatusFilter')?.value)||'active'; const shown=filterRowsByStatus(rows,statusFilter); list.innerHTML=filterSelectHtml(statusFilter)+(shown.length?shown.map(t=>`<button class="helpdesk-ticket ${statusClass(t.status)}" type="button" data-ticket="${esc(t.id)}"><strong>${esc(ticketNo(t.id))}</strong>${pill(t)}<div class="helpdesk-meta"><span>Status: ${esc(statusLabel(t.status))}</span><span>${esc(t.created_by_display_name||'User')}</span><span>${esc(t.related_tour_label||'No tour')}</span><span>${esc(new Date(t.updated_at||t.created_at).toLocaleString())}</span>${t.admin_unread?'<span class="nav-badge static">!</span>':''}</div><small>${esc((t.description||'').slice(0,120))}</small></button>`).join(''):`<div class="helpdesk-empty">No ${statusFilter==='active'?'active / open':statusFilter} tickets.</div>`); list.querySelector('#helpdeskStatusFilter')?.addEventListener('change',load);
    list.querySelectorAll('[data-ticket]').forEach(b=>b.onclick=()=>show(b.dataset.ticket));
    await adminBadge();
  }
  async function show(id){
    selected=id;
    const detail=document.getElementById('helpdeskTicketDetail');
    detail.innerHTML='<div class="helpdesk-empty">Loading detail...</div>';
    const {data:t,error}=await sb().from(TABLE).select('*').eq('id',id).single();
    if(error){detail.innerHTML=`<div class="helpdesk-empty">${esc(error.message)}</div>`;return;}
    await sb().from(TABLE).update({admin_unread:false}).eq('id',id);
    const {data:msgs,error:msgError}=await sb().from(MSGS).select('*').eq('ticket_id',id).order('created_at',{ascending:true});
    if(msgError){detail.innerHTML=`<div class="helpdesk-empty">${esc(msgError.message)}</div>`;return;}
    const forced=(msgs||[]).some(m=>String(m.sender_role||'').toLowerCase()==='admin' && String(m.message||'').toLowerCase().includes('closed by admin'))?'closed':((msgs||[]).some(m=>String(m.sender_role||'').toLowerCase()==='admin' && String(m.message||'').toLowerCase().includes('marked resolved by admin'))?'resolved':null); if(forced && !isClosedStatus(t.status)){ t.status=forced; try{ await sb().from(TABLE).update({status:forced,resolved_at:new Date().toISOString(),admin_unread:false}).eq('id',id); }catch(_e){} }
    const isClosed = isClosedStatus(t.status);
    detail.innerHTML=`<div class="helpdesk-detail-head"><h3>${esc(ticketNo(t.id))}</h3>${pill(t)}<div class="helpdesk-meta"><span>User: ${esc(t.created_by_display_name||'User')}</span><span>Tour: ${esc(t.related_tour_label||'None')}</span><span>Updated: ${esc(new Date(t.updated_at||t.created_at).toLocaleString())}</span></div>${t.image_url?`<a class="helpdesk-image-link" href="${esc(t.image_url)}" target="_blank">View uploaded image</a>`:''}</div><div>${(msgs||[]).map(m=>`<div class="helpdesk-message ${m.sender_role==='admin'?'admin':'user'}"><b>${esc(m.sender_role)}</b><p>${esc(m.message)}</p>${m.image_url?`<a class="helpdesk-image-link" href="${esc(m.image_url)}" target="_blank">View image</a>`:''}<div class="helpdesk-muted">${esc(new Date(m.created_at).toLocaleString())}</div></div>`).join('')}</div>${isClosed?'<div class="helpdesk-empty">This ticket is closed/resolved.</div>':`<form class="helpdesk-form" id="adminReplyForm"><label>Admin reply<textarea name="message" required></textarea></label><div class="helpdesk-actions"><button class="helpdesk-btn secondary" type="button" id="closeTicketBtn">Close Ticket</button><button class="helpdesk-btn" type="submit">Reply</button><button class="helpdesk-btn success" type="button" id="resolveBtn">Mark Resolved</button></div></form>`}`;
    detail.querySelector('#adminReplyForm')?.addEventListener('submit',async(e)=>{e.preventDefault(); const p=await me(); const msg=new FormData(e.target).get('message'); const {error}=await sb().from(MSGS).insert({ticket_id:id,sender_id:p.id,sender_role:'admin',message:msg}); if(error) return alert(error.message); await sb().from(TABLE).update({status:'admin_replied',admin_unread:false,user_unread:true}).eq('id',id); await show(id); await load();});
    detail.querySelector('#resolveBtn')?.addEventListener('click',async()=>{const p=await me(); const {error}=await sb().from(MSGS).insert({ticket_id:id,sender_id:p.id,sender_role:'admin',message:'Marked resolved by Admin.'}); if(error) return alert(error.message); await sb().from(TABLE).update({status:'resolved',resolved_at:new Date().toISOString(),admin_unread:false,user_unread:true}).eq('id',id); await show(id); await load();});
    detail.querySelector('#closeTicketBtn')?.addEventListener('click',async()=>{const p=await me(); const {error}=await sb().from(MSGS).insert({ticket_id:id,sender_id:p.id,sender_role:'admin',message:'Closed by Admin.'}); if(error) return alert(error.message); await sb().from(TABLE).update({status:'closed',resolved_at:new Date().toISOString(),admin_unread:false,user_unread:true}).eq('id',id); await show(id); await load();});
    await adminBadge();
  }
  async function boot(){
    try{
      ensureAuthGlobals();
      await waitForSupabase();
      const p=await localRequireAdmin();
      if(!p) return;
      if (typeof window.renderLayout === 'function') await renderLayout('Help Desk'); else document.body.style.visibility='visible';
      await load();
      document.getElementById('refreshHelpDeskBtn')?.addEventListener('click',load);
    }catch(err){
      console.error(err);
      document.body.style.visibility='visible';
      const app=document.getElementById('app');
      if(app) app.innerHTML=`<div class="card"><h2>Help Desk failed to load</h2><p>${esc(err.message||err)}</p></div>`;
    }
  }
  document.addEventListener('DOMContentLoaded',boot);
})();
