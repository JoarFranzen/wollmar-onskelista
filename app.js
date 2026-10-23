import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getFirestore, collection, doc, onSnapshot, query, orderBy, runTransaction, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { firebaseConfig, adminApiUrl } from './config.js';

const $ = id => document.getElementById(id);
const dialog = $('admin-dialog'), grid = $('wish-grid'), status = $('status');
const firebaseConfigured = !Object.values(firebaseConfig).some(v => String(v).startsWith('PASTE_'));
const adminConfigured = firebaseConfigured && !String(adminApiUrl).startsWith('PASTE_');
let db, wishes = [], adminToken = sessionStorage.getItem('wollmar-admin-token') || '';
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function toast(m) { const e=$('toast'); e.textContent=m; e.classList.add('show'); setTimeout(()=>e.classList.remove('show'),2600); }
function showError(m) { $('admin-error').textContent=m; $('admin-error').hidden=false; }
function safeUrl(v) { try { const u=new URL(v); return ['https:','http:'].includes(u.protocol)?u.href:''; } catch { return ''; } }
function isAdmin() { return !!adminToken; }
function render() {
  $('wish-count').textContent = wishes.length + (wishes.length===1?' önskning':' önskningar');
  status.hidden = wishes.length > 0;
  if (!wishes.length) status.textContent = firebaseConfigured ? 'Listan är tom än så länge. Vi fyller på snart!' : 'Snart öppnar önskelistan! Firebase behöver konfigureras.';
  grid.innerHTML = wishes.map((w,i) => {
    const img=safeUrl(w.image), link=safeUrl(w.link);
    const picture=img?'<img src="'+esc(img)+'" alt="" loading="lazy" onerror="this.remove()">':'<span class="placeholder" aria-hidden="true">'+['✿','✦','♡','✳'][i%4]+'</span>';
    return '<article class="wish-card" style="animation-delay:'+Math.min(i*55,350)+'ms"><div class="wish-image">'+picture+'</div><div class="wish-content"><span class="category">'+esc(w.category||'Önskning')+'</span><h3>'+esc(w.title)+'</h3><p class="wish-description">'+esc(w.description||'')+'</p><div class="wish-bottom"><span class="price">'+esc(w.price||'')+'</span><div class="wish-actions">'+(link?'<a class="gift-link" href="'+esc(link)+'" target="_blank" rel="noopener noreferrer">Se present ↗</a>':'')+(w.reserved?'<span class="reserved-label">Någon har paxat ♡</span>':'<button class="reserve-button" data-reserve="'+esc(w.id)+'">Jag köper den!</button>')+'</div></div></div></article>';
  }).join('');
  grid.querySelectorAll('[data-reserve]').forEach(b=>b.addEventListener('click',()=>reserve(b.dataset.reserve,b)));
  if (isAdmin()) renderManage();
}
async function reserve(id,b) {
  b.disabled=true; b.textContent='Paxar…';
  try {
    await runTransaction(db, async tx => {
      const ref=doc(db,'wishes',id), snap=await tx.get(ref);
      if(!snap.exists()) throw Error('gone');
      if(snap.data().reserved) throw Error('reserved');
      tx.update(ref,{reserved:true,reservedAt:serverTimestamp()});
    });
    toast('Den är paxad! Tack för att du fixar en present ♡');
  } catch(e) {
    toast(e.message==='reserved'?'Någon hann före, den är redan paxad.':'Det gick inte att reservera just nu. Prova igen.');
  } finally { b.disabled=false; b.textContent='Jag köper den!'; }
}
async function adminRequest(path, method='GET', body) {
  if (!adminConfigured) throw Error('Cloudflare Worker är inte inkopplad ännu.');
  const res = await fetch(adminApiUrl.replace(/\/$/,'')+path, {
    method, headers: {'Content-Type':'application/json', ...(adminToken?{Authorization:'Bearer '+adminToken}:{})},
    ...(body?{body:JSON.stringify(body)}:{})
  });
  const data=await res.json().catch(()=>({}));
  if (!res.ok) throw Error(data.error || 'Något gick fel ('+res.status+').');
  return data;
}
function renderManage() {
  $('manage-list').innerHTML=wishes.map(w=>'<div class="manage-row"><div><strong>'+esc(w.title)+'</strong><small>'+(w.reserved?'Reserverad':'Inte reserverad')+'</small></div><div><button data-edit="'+esc(w.id)+'">Ändra</button> <button data-delete="'+esc(w.id)+'">Ta bort</button></div></div>').join('');
  $('manage-list').querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>editWish(b.dataset.edit));
  $('manage-list').querySelectorAll('[data-delete]').forEach(b=>b.onclick=()=>removeWish(b.dataset.delete));
}
function editWish(id) {
  const w=wishes.find(x=>x.id===id); if(!w)return;
  $('wish-id').value=w.id; $('wish-title').value=w.title||''; $('wish-description').value=w.description||'';
  $('wish-link').value=w.link||''; $('wish-image').value=w.image||''; $('wish-price').value=w.price||'';
  $('wish-category').value=w.category||'Övrigt'; $('wish-form').scrollIntoView({behavior:'smooth',block:'start'});
}
function clearForm() { $('wish-form').reset(); $('wish-id').value=''; }
function updateAdminUI() {
  $('admin-auth').hidden=isAdmin();
  $('admin-panel').hidden=!isAdmin();
  if(isAdmin()) { $('admin-welcome').textContent='Inloggad i vuxenläget'; renderManage(); }
}
async function removeWish(id) {
  if(!confirm('Ta bort önskningen?'))return;
  try { await adminRequest('/wishes/'+encodeURIComponent(id),'DELETE'); toast('Önskningen är borttagen.'); }
  catch(e) { showError(e.message); }
}
$('admin-open').onclick=()=>{dialog.showModal();$('admin-error').hidden=true;updateAdminUI();};
$('login-button').onclick=async()=>{
  $('admin-error').hidden=true;
  try {
    const result=await adminRequest('/login','POST',{password:$('admin-password').value});
    adminToken=result.token; sessionStorage.setItem('wollmar-admin-token',adminToken);
    $('admin-password').value=''; updateAdminUI(); render();
  } catch(e) { showError(e.message==='Failed to fetch'?'Kunde inte nå Cloudflare Worker. Kontrollera Worker-URL och CORS.':e.message); }
};
$('logout-button').onclick=()=>{adminToken='';sessionStorage.removeItem('wollmar-admin-token');clearForm();updateAdminUI();render();};
$('cancel-edit').onclick=clearForm;
$('wish-form').onsubmit=async e=>{
  e.preventDefault(); if(!isAdmin())return showError('Logga in i vuxenläget först.');
  const data={title:$('wish-title').value.trim(),description:$('wish-description').value.trim(),link:safeUrl($('wish-link').value),image:safeUrl($('wish-image').value),price:$('wish-price').value.trim(),category:$('wish-category').value};
  if(!data.title)return;
  try {
    const id=$('wish-id').value;
    if(id) await adminRequest('/wishes/'+encodeURIComponent(id),'PATCH',data);
    else await adminRequest('/wishes','POST',data);
    clearForm(); toast('Önskningen sparad ♡');
  } catch(err) { showError(err.message); }
};
if(!firebaseConfigured) {
  status.textContent='Snart öppnar önskelistan! Firebase behöver konfigureras.';
  $('wish-count').textContent='Snart klart';
} else {
  const app=initializeApp(firebaseConfig); db=getFirestore(app);
  onSnapshot(query(collection(db,'wishes'),orderBy('createdAt','asc')),snap=>{
    wishes=snap.docs.map(d=>({id:d.id,...d.data()})); render();
  },err=>{
    status.hidden=false; status.textContent='Kunde inte ladda listan. Kontrollera att Firestore-reglerna är publicerade.';
    console.error('Firestore wishlist error:',err);
  });
}
if(!adminConfigured) {
  $('login-button').disabled=true;
  $('admin-password').disabled=true;
  $('admin-help').textContent='Adminservern är inte inkopplad ännu. Följ stegen i projektets README.';
}
updateAdminUI();
