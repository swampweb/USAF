
(function(){
  const TABLE='USAF_helpdesk_tickets'; const MSGS='USAF_helpdesk_messages'; const BUCKET='usaf-helpdesk';
  let selected=null;
  function sb(){return window.usafSupabase;} function esc(v){return String(v??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}
  async function me(){const p=await getCurrentProfile(); return p||{};}
  async function load(){
    const list=document.getElementById('helpdeskTicketList'); const detail=document.getElementById('helpdeskTicketDetail');
    list.innerHTML='<div class="helpdesk-empty">Loading tickets...</div>'; detail.innerHTML='<div class="helpdesk-empty">Select a ticket.</div>';
    const {data,error}=await sb().from(TABLE).select('*').order('updated_at',{ascending:false});
    if(error){list.innerHTML=`<div class="helpdesk-empty">${esc(error.message)}</div>`;return;}
    list.innerHTML=(data||[]).length?data.map(t=>`<article class="helpdesk-ticket ${selected===t.id?'active':''}" data-id="${esc(t.id)}"><strong>${esc(t.created_by_display_name||'User')}</strong><div class="helpdesk-meta"><span class="helpdesk-pill ${t.type==='issue'?'issue':''}">${esc(t.type)}</span><span class="helpdesk-pill ${t.status==='resolved'?'resolved':''}">${esc(t.status)}</span>${t.admin_unread?'<span class="helpdesk-pill issue">Unread</span>':''}</div><div class="helpdesk-muted">${t.related_tour_label?`Tour: ${esc(t.related_tour_label)}`:'No related tour'}</div><div class="helpdesk-muted">${esc(new Date(t.updated_at||t.created_at).toLocaleString())}</div></article>`).join(''):'<div class="helpdesk-empty">No Help Desk tickets.</div>';
    list.querySelectorAll('[data-id]').forEach(el=>el.onclick=()=>show(el.dataset.id));
    if(selected) show(selected);
    window.USAFHelpDesk?.adminBadge?.();
  }
  async function show(id){
    selected=id; const detail=document.getElementById('helpdeskTicketDetail'); detail.innerHTML='<div class="helpdesk-empty">Loading ticket...</div>';
    const {data:t,error}=await sb().from(TABLE).select('*').eq('id',id).single(); if(error){detail.innerHTML=`<div class="helpdesk-empty">${esc(error.message)}</div>`;return;}
    await sb().from(TABLE).update({admin_unread:false}).eq('id',id);
    const {data:msgs}=await sb().from(MSGS).select('*').eq('ticket_id',id).order('created_at',{ascending:true});
    detail.innerHTML=`<div class="helpdesk-ticket"><strong>${esc(t.created_by_display_name||'User')}</strong><div class="helpdesk-meta"><span class="helpdesk-pill ${t.type==='issue'?'issue':''}">${esc(t.type)}</span><span class="helpdesk-pill ${t.status==='resolved'?'resolved':''}">${esc(t.status)}</span></div><div><b>Related Tour:</b> ${esc(t.related_tour_label||'None / Not applicable')}</div><p>${esc(t.description)}</p>${t.image_url?`<a class="helpdesk-image-link" href="${esc(t.image_url)}" target="_blank">View uploaded image</a>`:''}</div><div>${(msgs||[]).map(m=>`<div class="helpdesk-message ${m.sender_role==='admin'?'admin':'user'}"><b>${esc(m.sender_role)}</b><p>${esc(m.message)}</p>${m.image_url?`<a href="${esc(m.image_url)}" target="_blank">View image</a>`:''}<div class="helpdesk-muted">${esc(new Date(m.created_at).toLocaleString())}</div></div>`).join('')}</div>${t.status==='resolved'?'<div class="helpdesk-empty">Resolved ticket.</div>':`<form class="helpdesk-form" id="adminReplyForm"><label>Admin reply<textarea name="message" required></textarea></label><div class="helpdesk-actions"><button class="helpdesk-btn" type="submit">Reply</button><button class="helpdesk-btn success" type="button" id="resolveBtn">Mark Resolved</button></div></form>`}`;
    document.getElementById('adminReplyForm')?.addEventListener('submit',async(e)=>{e.preventDefault(); const p=await me(); const msg=new FormData(e.target).get('message'); const {error}=await sb().from(MSGS).insert({ticket_id:id,sender_id:p.id,sender_role:'admin',message:msg}); if(error) return alert(error.message); await sb().from(TABLE).update({status:'admin_replied',admin_unread:false,user_unread:true}).eq('id',id); await show(id); await load();});
    document.getElementById('resolveBtn')?.addEventListener('click',async()=>{const p=await me(); await sb().from(MSGS).insert({ticket_id:id,sender_id:p.id,sender_role:'admin',message:'Marked resolved by Admin.'}); await sb().from(TABLE).update({status:'resolved',resolved_at:new Date().toISOString(),admin_unread:false,user_unread:true}).eq('id',id); await show(id); await load();});
    await loadBadgesOnly();
  }
  async function loadBadgesOnly(){ try{ window.USAFHelpDesk?.adminBadge?.(); }catch(e){} }
  document.addEventListener('DOMContentLoaded',async()=>{ const p=await requireAdmin(); if(!p) return; await renderLayout('Help Desk'); await load(); document.getElementById('refreshHelpDeskBtn')?.addEventListener('click',load); });
})();
