(function(){
  const TABLE='USAF_helpdesk_tickets';
  const MSGS='USAF_helpdesk_messages';
  let selected=null;
  function sb(){return window.usafSupabase;}
  function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function pill(t){return `<span class="helpdesk-pill ${t.type==='issue'?'issue':''} ${t.status==='resolved'?'resolved':''}">${esc(t.type)} / ${esc(t.status)}</span>`;}
  async function me(){const p=await getCurrentProfile(); return p||{};}
  async function adminBadge(){
    try{const {count}=await sb().from(TABLE).select('id',{count:'exact',head:true}).eq('admin_unread',true); document.querySelectorAll('[data-helpdesk-admin-badge]').forEach(b=>{b.textContent=count||0;b.hidden=!(count||0);});}catch(e){}
  }
  async function load(){
    const list=document.getElementById('helpdeskTicketList');
    const detail=document.getElementById('helpdeskTicketDetail');
    if(!list || !detail) return;
    list.innerHTML='<div class="helpdesk-empty">Loading tickets...</div>';
    detail.innerHTML='<div class="helpdesk-empty">Select a ticket.</div>';
    const {data,error}=await sb().from(TABLE).select('*').order('updated_at',{ascending:false});
    if(error){list.innerHTML=`<div class="helpdesk-empty">${esc(error.message)}</div>`; return;}
    const rows=data||[];
    list.innerHTML=rows.length?rows.map(t=>`<button class="helpdesk-ticket" type="button" data-ticket="${esc(t.id)}"><strong>${esc(t.created_by_display_name||'User')}</strong>${pill(t)}<div class="helpdesk-meta"><span>${esc(t.related_tour_label||'No tour')}</span><span>${esc(new Date(t.updated_at||t.created_at).toLocaleString())}</span>${t.admin_unread?'<span class="nav-badge static">!</span>':''}</div><small>${esc((t.description||'').slice(0,120))}</small></button>`).join(''):'<div class="helpdesk-empty">No tickets yet.</div>';
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
    detail.innerHTML=`<div class="helpdesk-detail-head"><h3>${esc(t.created_by_display_name||'User Ticket')}</h3>${pill(t)}<div class="helpdesk-meta"><span>Tour: ${esc(t.related_tour_label||'None')}</span><span>Updated: ${esc(new Date(t.updated_at||t.created_at).toLocaleString())}</span></div>${t.image_url?`<a class="helpdesk-image-link" href="${esc(t.image_url)}" target="_blank">View uploaded image</a>`:''}</div><div>${(msgs||[]).map(m=>`<div class="helpdesk-message ${m.sender_role==='admin'?'admin':'user'}"><b>${esc(m.sender_role)}</b><p>${esc(m.message)}</p>${m.image_url?`<a class="helpdesk-image-link" href="${esc(m.image_url)}" target="_blank">View image</a>`:''}<div class="helpdesk-muted">${esc(new Date(m.created_at).toLocaleString())}</div></div>`).join('')}</div>${t.status==='resolved'?'<div class="helpdesk-empty">Resolved ticket.</div>':`<form class="helpdesk-form" id="adminReplyForm"><label>Admin reply<textarea name="message" required></textarea></label><div class="helpdesk-actions"><button class="helpdesk-btn" type="submit">Reply</button><button class="helpdesk-btn success" type="button" id="resolveBtn">Mark Resolved</button></div></form>`}`;
    detail.querySelector('#adminReplyForm')?.addEventListener('submit',async(e)=>{e.preventDefault(); const p=await me(); const msg=new FormData(e.target).get('message'); const {error}=await sb().from(MSGS).insert({ticket_id:id,sender_id:p.id,sender_role:'admin',message:msg}); if(error) return alert(error.message); await sb().from(TABLE).update({status:'admin_replied',admin_unread:false,user_unread:true}).eq('id',id); await show(id); await load();});
    detail.querySelector('#resolveBtn')?.addEventListener('click',async()=>{const p=await me(); const {error}=await sb().from(MSGS).insert({ticket_id:id,sender_id:p.id,sender_role:'admin',message:'Marked resolved by Admin.'}); if(error) return alert(error.message); await sb().from(TABLE).update({status:'resolved',resolved_at:new Date().toISOString(),admin_unread:false,user_unread:true}).eq('id',id); await show(id); await load();});
    await adminBadge();
  }
  async function boot(){
    try{
      const p=await requireAdmin();
      if(!p) return;
      await renderLayout('Help Desk');
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
