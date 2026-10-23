import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { getFirestore, collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, query, orderBy, runTransaction, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { firebaseConfig, adminEmail } from './config.js';
const $=id=>document.getElementById(id), dialog=$('admin-dialog'), grid=$('wish-grid'), status=$('status');
let db,auth,user=null,wishes=[];
const configured=!Object.values(firebaseConfig).some(v=>String(v).startsWith('PASTE_'))&&!adminEmail.includes('PASTE_');
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function toast(m){const e=$('toast');e.textContent=m;e.classList.add('show');setTimeout(()=>e.classList.remove('show'),2600)}
function showError(m){$('admin-error').textContent=m;$('admin-error').hidden=false}
function isAdmin(){return !!user&&user.email?.toLowerCase()===adminEmail.toLowerCase()}
function safeUrl(v){try{const u=new URL(v);return ['https:','http:'].includes(u.protocol)?u.href:''}catch{return ''}}
function render(){
 $('wish-count').textContent=wishes.length+(wishes.length===1?' önskning':' önskningar');status.hidden=wishes.length>0;
 if(!wishes.length)status.textContent=configured?'Listan är tom än så länge. Vi fyller på snart!':'Snart öppnar önskelistan! Firebase behöver konfigureras.';
 grid.innerHTML=wishes.map((w,i)=>{const img=safeUrl(w.image),link=safeUrl(w.link),picture=img?'<img src="'+esc(img)+'" alt="" loading="lazy" onerror="this.remove()">':'<span class="placeholder" aria-hidden="true">'+['✿','✦','♡','✳'][i%4]+'</span>';
 return '<article class="wish-card" style="animation-delay:'+Math.min(i*55,350)+'ms"><div class="wish-image">'+picture+'</div><div class="wish-content"><span class="category">'+esc(w.category||'Önskning')+'</span><h3>'+esc(w.title)+'</h3><p class="wish-description">'+esc(w.description||'')+'</p><div class="wish-bottom"><span class="price">'+esc(w.price||'')+'</span><div class="wish-actions">'+(link?'<a class="gift-link" href="'+esc(link)+'" target="_blank" rel="noopener noreferrer">Se present ↗</a>':'')+(w.reserved?'<span class="reserved-label">Någon har paxat ♡</span>':'<button class="reserve-button" data-reserve="'+esc(w.id)+'">Jag köper den!</button>')+'</div></div></div></article>';
 }).join('');
 grid.querySelectorAll('[data-reserve]').forEach(b=>b.addEventListener('click',()=>reserve(b.dataset.reserve,b)));if(isAdmin())renderManage();
}
async function reserve(id,b){b.disabled=true;b.textContent='Paxar…';try{await runTransaction(db,async tx=>{const ref=doc(db,'wishes',id),snap=await tx.get(ref);if(!snap.exists())throw Error('gone');if(snap.data().reserved)throw Error('reserved');tx.update(ref,{reserved:true,reservedAt:serverTimestamp()})});toast('Den är paxad! Tack för att du fixar en present ♡')}catch(e){toast(e.message==='reserved'?'Någon hann före, den är redan paxad.':'Det gick inte att reservera just nu. Prova igen.')}finally{b.disabled=false;b.textContent='Jag köper den!'}}
function renderManage(){$('manage-list').innerHTML=wishes.map(w=>'<div class="manage-row"><div><strong>'+esc(w.title)+'</strong><small>'+(w.reserved?'Reserverad':'Inte reserverad')+'</small></div><div><button data-edit="'+esc(w.id)+'">Ändra</button> <button data-delete="'+esc(w.id)+'">Ta bort</button></div></div>').join('');$('manage-list').querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>editWish(b.dataset.edit));$('manage-list').querySelectorAll('[data-delete]').forEach(b=>b.onclick=()=>removeWish(b.dataset.delete))}
function editWish(id){const w=wishes.find(x=>x.id===id);if(!w)return;$('wish-id').value=w.id;$('wish-title').value=w.title||'';$('wish-description').value=w.description||'';$('wish-link').value=w.link||'';$('wish-image').value=w.image||'';$('wish-price').value=w.price||'';$('wish-category').value=w.category||'Övrigt';$('wish-form').scrollIntoView({behavior:'smooth',block:'start'})}
function clearForm(){$('wish-form').reset();$('wish-id').value=''}
async function removeWish(id){if(!confirm('Ta bort önskningen?'))return;try{await deleteDoc(doc(db,'wishes',id));toast('Önskningen är borttagen.')}catch(e){showError('Kunde inte ta bort. Kontrollera att du är administratör.')}}
$('admin-open').onclick=()=>{dialog.showModal();$('admin-error').hidden=true};
$('login-button').onclick=async()=>{try{await signInWithPopup(auth,new GoogleAuthProvider())}catch(e){showError('Inloggningen misslyckades. Kontrollera att Google-inloggning är aktiverad i Firebase.')}};
$('logout-button').onclick=()=>signOut(auth);$('cancel-edit').onclick=clearForm;
$('wish-form').onsubmit=async e=>{e.preventDefault();if(!isAdmin())return showError('Du saknar behörighet.');const data={title:$('wish-title').value.trim(),description:$('wish-description').value.trim(),link:safeUrl($('wish-link').value),image:safeUrl($('wish-image').value),price:$('wish-price').value.trim(),category:$('wish-category').value};if(!data.title)return;try{const id=$('wish-id').value;if(id)await updateDoc(doc(db,'wishes',id),data);else await addDoc(collection(db,'wishes'),{...data,reserved:false,createdAt:serverTimestamp()});clearForm();toast('Önskningen sparad ♡')}catch(err){showError('Kunde inte spara. Kontrollera Firestore-regler och administratörsbehörighet.')}};
if(!configured){status.textContent='Snart öppnar önskelistan! Firebase behöver konfigureras.';$('wish-count').textContent='Snart klart'}else{
 const app=initializeApp(firebaseConfig);auth=getAuth(app);db=getFirestore(app);
 onSnapshot(query(collection(db,'wishes'),orderBy('createdAt','asc')),snap=>{wishes=snap.docs.map(d=>({id:d.id,...d.data()}));render()},err=>{status.hidden=false;status.textContent='Kunde inte ladda listan. Kontrollera Firebase-konfiguration och Firestore-regler.'});
 onAuthStateChanged(auth,async current=>{user=current;if(current&&!isAdmin()){await signOut(auth);user=null;showError('Det här Google-kontot har inte redigeringsbehörighet.')}$('admin-auth').hidden=isAdmin();$('admin-panel').hidden=!isAdmin();if(isAdmin())$('admin-welcome').textContent='Inloggad som '+user.email;render()});
}