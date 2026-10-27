import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getFirestore, collection, doc, getDoc, onSnapshot, query, orderBy, runTransaction, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { firebaseConfig, adminApiUrl } from './config.js';

const $ = id => document.getElementById(id);
const dialog = $('admin-dialog'), grid = $('wish-grid'), status = $('status');
const firebaseConfigured = !Object.values(firebaseConfig).some(v => String(v).startsWith('PASTE_'));
const adminConfigured = firebaseConfigured && !String(adminApiUrl).startsWith('PASTE_');
const defaultCategories = ['Lek & bygg', 'Böcker & pyssel', 'Ute & äventyr', 'Övrigt'];
let db, wishes = [], categories = [...defaultCategories], adminToken = sessionStorage.getItem('wollmar-admin-token') || '';
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function toast(message) { const e=$('toast'); e.textContent=message; e.classList.add('show'); setTimeout(()=>e.classList.remove('show'),2600); }
function showError(message) { $('admin-error').textContent=message; $('admin-error').hidden=false; }
function safeUrl(value) { try { const u=new URL(value); return ['https:','http:'].includes(u.protocol)?u.href:''; } catch { return ''; } }
function isAdmin() { return !!adminToken; }

function render() {
  $('wish-count').textContent = wishes.length + (wishes.length===1?' önskning':' önskningar');
  status.hidden = wishes.length > 0;
  if (!wishes.length) status.textContent = firebaseConfigured ? 'Inga önskningar ännu.' : 'Firebase behöver konfigureras.';
  grid.innerHTML = wishes.map(w => {
    const img=safeUrl(w.image), link=safeUrl(w.link);
    const items=Array.isArray(w.items)?w.items.filter(x=>typeof x==='string'&&x.trim()):[];
    const reservedItems=Array.isArray(w.reservedItems)?w.reservedItems:[];
    const picture=img?'<img src="'+esc(img)+'" alt="" loading="lazy" onerror="this.remove()">':'';
    let choices='';
    if(items.length) {
      choices='<div class="item-picks">'+items.map(item=>{
        const taken=reservedItems.includes(item);
        const mine=isOwnItemReservation(w.id,item);
        return '<label class="item-choice'+(taken?' item-taken':'')+'"><input type="checkbox" value="'+esc(item)+'" '+(taken?'disabled':'')+'><span>'+esc(item)+'</span>'+(taken?(mine?'<small>Paxad av dig · <button type="button" class="undo-reservation" data-undo-item="'+esc(w.id)+'" data-item="'+esc(item)+'">Ångra</button></small>':'<small>Paxad</small>'):'')+'</label>';
      }).join('')+'<button class="reserve-button" data-reserve-items="'+esc(w.id)+'" '+(items.every(item=>reservedItems.includes(item))?'disabled':'')+'>Paxa valda</button></div>';
    } else {
      const taken=!!w.reserved || reservedItems.length>0;
      choices=taken?(isOwnWholeReservation(w.id)?'<span class="reserved-label">Paxad av dig</span> <button type="button" class="undo-reservation" data-undo-whole="'+esc(w.id)+'">Ångra paxning</button>':'<span class="reserved-label">Paxad</span>'):'<button class="reserve-button" data-reserve="'+esc(w.id)+'">Paxa presenten</button>';
    }
    return '<article class="wish-card"><div class="wish-image">'+picture+'</div><div class="wish-content"><span class="category">'+esc(w.category||'Övrigt')+'</span><h3>'+esc(w.title)+'</h3>'+(w.description?'<p class="wish-description">'+esc(w.description)+'</p>':'')+(w.price?'<div class="price">'+esc(w.price)+'</div>':'')+(link?'<a class="gift-link" href="'+esc(link)+'" target="_blank" rel="noopener noreferrer">Länk till present</a>':'')+choices+'</div></article>';
  }).join('');
  grid.querySelectorAll('[data-reserve]').forEach(b=>b.addEventListener('click',()=>reserve(b.dataset.reserve,b)));
  grid.querySelectorAll('[data-undo-item]').forEach(b=>b.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();unreserveItem(b.dataset.undoItem,b.dataset.item,b);}));
  grid.querySelectorAll('[data-undo-whole]').forEach(b=>b.addEventListener('click',()=>unreserveWhole(b.dataset.undoWhole,b)));
  grid.querySelectorAll('[data-reserve-items]').forEach(b=>b.addEventListener('click',()=>{
    const card=b.closest('.wish-card');
    const selected=[...card.querySelectorAll('.item-choice input:checked:not(:disabled)')].map(input=>input.value);
    reserveItems(b.dataset.reserveItems,selected,b);
  }));
  if(isAdmin()) renderManage();
}

const SESSION_RESERVATIONS_KEY = 'wollmar-session-reservations-v1';
function getSessionReservations() {
  try { return JSON.parse(sessionStorage.getItem(SESSION_RESERVATIONS_KEY)||'{}'); }
  catch { return {}; }
}
function saveSessionReservations(value) { sessionStorage.setItem(SESSION_RESERVATIONS_KEY,JSON.stringify(value)); }
function isOwnItemReservation(id,item) { return (getSessionReservations()[id]?.items||[]).includes(item); }
function isOwnWholeReservation(id) { return !!getSessionReservations()[id]?.whole; }
function rememberReservation(id,kind,value) {
  const all=getSessionReservations();
  if(!all[id])all[id]={items:[],whole:false};
  if(kind==='item'&&!all[id].items.includes(value))all[id].items.push(value);
  if(kind==='whole')all[id].whole=true;
  saveSessionReservations(all);
}
function forgetReservation(id,kind,value) {
  const all=getSessionReservations();
  if(!all[id])return;
  if(kind==='item')all[id].items=(all[id].items||[]).filter(x=>x!==value);
  if(kind==='whole')all[id].whole=false;
  if(!all[id].whole&&!all[id].items.length)delete all[id];
  saveSessionReservations(all);
}

async function unreserveItem(id,item,button) {
  button.disabled=true;
  try {
    await runTransaction(db,async tx=>{
      const ref=doc(db,'wishes',id),snap=await tx.get(ref);
      if(!snap.exists())throw Error('gone');
      const current=Array.isArray(snap.data().reservedItems)?snap.data().reservedItems:[];
      if(!current.includes(item))throw Error('already');
      tx.update(ref,{reservedItems:current.filter(x=>x!==item)});
    });
    forgetReservation(id,'item',item);
    toast('Paxningen är ångrad.');
  } catch(e) {
    toast('Kunde inte ångra paxningen. Prova igen.');
  } finally { button.disabled=false; }
}
async function unreserveWhole(id,button) {
  if(!confirm('Vill du ångra paxningen av hela presenten?'))return;
  button.disabled=true;
  try {
    await runTransaction(db,async tx=>{
      const ref=doc(db,'wishes',id),snap=await tx.get(ref);
      if(!snap.exists())throw Error('gone');
      if(!snap.data().reserved)throw Error('already');
      tx.update(ref,{reserved:false,reservedAt:null});
    });
    forgetReservation(id,'whole');
    toast('Paxningen är ångrad.');
  } catch(e) {
    toast('Kunde inte ångra paxningen. Prova igen.');
  } finally { button.disabled=false; }
}

async function reserveItems(id, selected, button) {
  if(!selected.length){toast('Välj minst en sak.');return;}
  button.disabled=true;
  try {
    await runTransaction(db, async tx => {
      const ref=doc(db,'wishes',id), snap=await tx.get(ref);
      if(!snap.exists()) throw Error('gone');
      const data=snap.data(), items=Array.isArray(data.items)?data.items:[], reserved=Array.isArray(data.reservedItems)?data.reservedItems:[];
      if(selected.some(item=>!items.includes(item)||reserved.includes(item))) throw Error('reserved');
      tx.update(ref,{reservedItems:[...reserved,...selected]});
    });
    selected.forEach(item=>rememberReservation(id,'item',item));
    toast('Valet är paxat.');
  } catch(e) {
    toast(e.message==='reserved'?'Någon hann före. Uppdatera listan och välj igen.':'Det gick inte att paxa just nu. Prova igen.');
  } finally { button.disabled=false; }
}

async function reserve(id, button) {
  button.disabled=true; button.textContent='Paxar…';
  try {
    await runTransaction(db, async tx => {
      const ref=doc(db,'wishes',id), snap=await tx.get(ref);
      if(!snap.exists()) throw Error('gone');
      if(snap.data().reserved) throw Error('reserved');
      tx.update(ref,{reserved:true,reservedAt:serverTimestamp()});
    });
    rememberReservation(id,'whole');
    toast('Presenten är paxad.');
  } catch(e) {
    toast(e.message==='reserved'?'Någon hann före, presenten är redan paxad.':'Det gick inte att paxa just nu. Prova igen.');
  } finally { button.disabled=false; button.textContent='Paxa presenten'; }
}

async function adminRequest(path, method='GET', body) {
  if(!adminConfigured) throw Error('Adminservern är inte konfigurerad.');
  const res=await fetch(adminApiUrl.replace(/\/$/,'')+path,{
    method,headers:{'Content-Type':'application/json',...(adminToken?{Authorization:'Bearer '+adminToken}:{})},
    ...(body?{body:JSON.stringify(body)}:{})
  });
  const data=await res.json().catch(()=>({}));
  if(!res.ok) throw Error(data.error||'Något gick fel ('+res.status+').');
  return data;
}

function renderManage() {
  $('manage-list').innerHTML=wishes.map(w=>{
    const reservedCount=Array.isArray(w.reservedItems)?w.reservedItems.length:0;
    const reservedSummary=reservedCount ? 'Paxade val: '+w.reservedItems.join(', ') : (w.reserved?'Paxad':'Inget paxat');
    const options=Array.isArray(w.items)&&w.items.length ? '<small class="admin-options">Valbara alternativ: '+esc(w.items.join(', '))+'</small>' : '';
    const hasReservation=!!w.reserved||reservedCount>0;
    return '<div class="manage-row"><div><strong>'+esc(w.title)+'</strong><small>'+esc(reservedSummary)+'</small>'+options+'</div><div class="manage-actions"><button data-edit="'+esc(w.id)+'">Ändra</button> '+(hasReservation?'<button data-unreserve="'+esc(w.id)+'">Ta bort paxning</button> ':'')+'<button data-delete="'+esc(w.id)+'">Ta bort önskning</button></div></div>';
  }).join('');
  $('manage-list').querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>editWish(b.dataset.edit));
  $('manage-list').querySelectorAll('[data-delete]').forEach(b=>b.onclick=()=>removeWish(b.dataset.delete));
  $('manage-list').querySelectorAll('[data-unreserve]').forEach(b=>b.onclick=()=>clearReservation(b.dataset.unreserve));
}
async function clearReservation(id) {
  if(!confirm('Ta bort paxningen? Presenten blir tillgänglig för alla igen.')) return;
  try {
    await adminRequest('/wishes/'+encodeURIComponent(id)+'/unreserve','POST',{});
    toast('Paxningen är borttagen.');
  } catch(e) { showError(e.message); }
}
function editWish(id) {
  const w=wishes.find(x=>x.id===id); if(!w)return;
  $('wish-id').value=w.id;
  $('wish-title').value=w.title||'';
  $('wish-description').value=w.description||'';
  $('wish-items').value=Array.isArray(w.items)?w.items.join('\n'):'';
  $('wish-link').value=w.link||'';
  $('wish-image').value=w.image||'';
  $('wish-price').value=w.price||'';
  populateCategorySelect();
  $('wish-category').value=w.category||categories[0]||'';
  $('wish-form').scrollIntoView({behavior:'smooth',block:'start'});
}
function clearForm() { $('wish-form').reset(); $('wish-id').value=''; populateCategorySelect(); }
function populateCategorySelect() {
  const select=$('wish-category'), current=select.value;
  select.innerHTML=categories.map(c=>'<option value="'+esc(c)+'">'+esc(c)+'</option>').join('');
  if(categories.includes(current)) select.value=current;
}
function renderCategoryManager() {
  populateCategorySelect();
  $('category-list').innerHTML=categories.map((category,index)=>'<div class="category-row"><span>'+esc(category)+'</span><button type="button" data-remove-category="'+index+'">Ta bort</button></div>').join('');
  $('category-list').querySelectorAll('[data-remove-category]').forEach(b=>b.onclick=()=>saveCategories(categories.filter((_,i)=>i!==Number(b.dataset.removeCategory))));
}
async function saveCategories(next) {
  const clean=[...new Set(next.map(c=>String(c).trim()).filter(Boolean))];
  if(!clean.length){toast('Minst en kategori behövs.');return;}
  try {
    await adminRequest('/categories','PUT',{categories:clean});
    categories=clean; renderCategoryManager(); toast('Kategorier sparade.');
  } catch(e) { showError(e.message); }
}
function updateAdminUI() {
  $('admin-auth').hidden=isAdmin();
  $('admin-panel').hidden=!isAdmin();
  if(isAdmin()) { $('admin-welcome').textContent=''; renderManage(); renderCategoryManager(); }
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
  e.preventDefault(); if(!isAdmin())return showError('Logga in först.');
  const items=$('wish-items').value.split('\n').map(s=>s.trim()).filter(Boolean).filter((s,i,a)=>a.indexOf(s)===i);
  const data={title:$('wish-title').value.trim(),description:$('wish-description').value.trim(),items,link:safeUrl($('wish-link').value),image:safeUrl($('wish-image').value),price:$('wish-price').value.trim(),category:$('wish-category').value};
  if(!data.title)return;
  try {
    const id=$('wish-id').value;
    if(id) {
      const existing=wishes.find(w=>w.id===id);
      data.reservedItems=(existing?.reservedItems||[]).filter(item=>items.includes(item));
      await adminRequest('/wishes/'+encodeURIComponent(id),'PATCH',data);
    } else {
      data.reservedItems=[];
      await adminRequest('/wishes','POST',data);
    }
    clearForm(); toast('Önskningen sparad.');
  } catch(err) { showError(err.message); }
};
$('add-category').onclick=()=>{
  const value=$('new-category').value.trim();
  if(!value)return;
  if(categories.some(c=>c.toLowerCase()===value.toLowerCase())){toast('Kategorin finns redan.');return;}
  $('new-category').value=''; saveCategories([...categories,value]);
};

if(!firebaseConfigured) {
  status.textContent='Firebase behöver konfigureras.';
  $('wish-count').textContent='Snart klart';
} else {
  const app=initializeApp(firebaseConfig); db=getFirestore(app);
  getDoc(doc(db,'wishes','__settings_categories__')).then(snap=>{
    if(snap.exists()&&Array.isArray(snap.data().categories)&&snap.data().categories.length) categories=snap.data().categories;
    populateCategorySelect(); if(isAdmin())renderCategoryManager();
  }).catch(()=>{});
  onSnapshot(query(collection(db,'wishes'),orderBy('createdAt','asc')),snap=>{
    wishes=snap.docs.map(d=>({id:d.id,...d.data()})); render();
  },err=>{
    status.hidden=false; status.textContent='Kunde inte ladda listan. Kontrollera Firestore-reglerna.';
    console.error('Firestore wishlist error:',err);
  });
}
if(!adminConfigured) {
  $('login-button').disabled=true;
  $('admin-password').disabled=true;
  $('admin-help').textContent='Adminservern är inte inkopplad ännu.';
}
updateAdminUI();
