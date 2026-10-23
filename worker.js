const encoder = new TextEncoder();
let cachedGoogleToken = null;
let cachedGoogleTokenExpiry = 0;

function base64url(bytes) {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}
function fromBase64url(value) {
  const s = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = s + '='.repeat((4 - s.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, c => c.charCodeAt(0));
}
function json(data, status=200, origin='*') {
  return new Response(JSON.stringify(data), {status, headers:{
    'Content-Type':'application/json; charset=utf-8',
    'Cache-Control':'no-store',
    'Access-Control-Allow-Origin':origin,
    'Access-Control-Allow-Methods':'GET,POST,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers':'Content-Type,Authorization',
    'Vary':'Origin'
  }});
}
function originFor(request, env) {
  const origin=request.headers.get('Origin') || '';
  if (env.ALLOWED_ORIGIN && origin && origin !== env.ALLOWED_ORIGIN) return null;
  return env.ALLOWED_ORIGIN || origin || '*';
}
async function hmacKey(secret) {
  return crypto.subtle.importKey('raw', encoder.encode(secret), {name:'HMAC',hash:'SHA-256'}, false, ['sign','verify']);
}
async function issueSession(env) {
  const payload=base64url(encoder.encode(JSON.stringify({exp:Math.floor(Date.now()/1000)+43200})));
  const sig=await crypto.subtle.sign('HMAC',await hmacKey(env.SESSION_SECRET),encoder.encode(payload));
  return payload+'.'+base64url(new Uint8Array(sig));
}
async function validSession(request, env) {
  const header=request.headers.get('Authorization') || '';
  if (!header.startsWith('Bearer ')) return false;
  const token=header.slice(7).split('.');
  if (token.length!==2) return false;
  try {
    const key=await hmacKey(env.SESSION_SECRET);
    const valid=await crypto.subtle.verify('HMAC',key,fromBase64url(token[1]),encoder.encode(token[0]));
    if (!valid) return false;
    const payload=JSON.parse(new TextDecoder().decode(fromBase64url(token[0])));
    return Number(payload.exp)>Math.floor(Date.now()/1000);
  } catch { return false; }
}
function pemBytes(pem) {
  const base64=pem.replace(/-----BEGIN PRIVATE KEY-----/g,'').replace(/-----END PRIVATE KEY-----/g,'').replace(/\s/g,'');
  const binary=atob(base64);
  return Uint8Array.from(binary,c=>c.charCodeAt(0));
}
async function googleAccessToken(env) {
  if (cachedGoogleToken && Date.now() < cachedGoogleTokenExpiry-60000) return cachedGoogleToken;
  const account=JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON);
  const now=Math.floor(Date.now()/1000);
  const header=base64url(encoder.encode(JSON.stringify({alg:'RS256',typ:'JWT'})));
  const claim=base64url(encoder.encode(JSON.stringify({
    iss:account.client_email,
    scope:'https://www.googleapis.com/auth/datastore',
    aud:'https://oauth2.googleapis.com/token',
    iat:now, exp:now+3600
  })));
  const unsigned=header+'.'+claim;
  const key=await crypto.subtle.importKey('pkcs8',pemBytes(account.private_key),{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['sign']);
  const signature=await crypto.subtle.sign('RSASSA-PKCS1-v1_5',key,encoder.encode(unsigned));
  const assertion=unsigned+'.'+base64url(new Uint8Array(signature));
  const response=await fetch('https://oauth2.googleapis.com/token',{
    method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion})
  });
  const data=await response.json();
  if(!response.ok || !data.access_token) throw new Error('Could not authenticate with Google APIs: '+(data.error_description||data.error||response.status));
  cachedGoogleToken=data.access_token; cachedGoogleTokenExpiry=Date.now()+(Number(data.expires_in)||3600)*1000;
  return cachedGoogleToken;
}
function toFirestoreValue(value) {
  if(value===null || value===undefined) return {nullValue:null};
  if(typeof value==='boolean') return {booleanValue:value};
  if(typeof value==='number') return {doubleValue:value};
  if(Array.isArray(value)) return {arrayValue:{values:value.map(toFirestoreValue)}};
  return {stringValue:String(value)};
}
function toFirestoreFields(data) {
  const fields={};
  for(const [key,value] of Object.entries(data)) fields[key]=toFirestoreValue(value);
  return fields;
}
async function firestoreRequest(env, path, options={}) {
  const token=await googleAccessToken(env);
  const url='https://firestore.googleapis.com/v1/projects/'+encodeURIComponent(env.FIREBASE_PROJECT_ID)+'/databases/(default)/documents'+path;
  const response=await fetch(url,{...options,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',...(options.headers||{})}});
  const data=await response.json().catch(()=>({}));
  if(!response.ok) {
    const message=data.error?.message || 'Firestore API returned '+response.status;
    throw new Error(message);
  }
  return data;
}
function validateWish(body) {
  const fields=['title','description','link','image','price','category'];
  const data={};
  for(const field of fields) data[field]=typeof body[field]==='string'?body[field].trim():'';
  if(!data.title || data.title.length>100) throw new Error('Titeln måste vara mellan 1 och 100 tecken.');
  if(data.description.length>500) throw new Error('Beskrivningen får vara högst 500 tecken.');
  data.items=Array.isArray(body.items)?[...new Set(body.items.filter(x=>typeof x==='string').map(x=>x.trim()).filter(Boolean))].slice(0,30):[];
  data.reservedItems=Array.isArray(body.reservedItems)?[...new Set(body.reservedItems.filter(x=>typeof x==='string').map(x=>x.trim()).filter(Boolean))].slice(0,30):[];
  if(data.items.some(x=>x.length>100)) throw new Error('Varje val får vara högst 100 tecken.');
  if(data.items.length>30) throw new Error('Max 30 val per önskning.');
  if(data.reservedItems.some(x=>!data.items.includes(x))) data.reservedItems=data.reservedItems.filter(x=>data.items.includes(x));
  for(const key of ['link','image']) {
    if(data[key]) {
      let u; try {u=new URL(data[key]);} catch {throw new Error('Länk eller bildadress är ogiltig.');}
      if(!['http:','https:'].includes(u.protocol)) throw new Error('Länkar måste börja med http eller https.');
    }
  }
  return data;
}
async function handle(request, env) {
  const origin=originFor(request,env);
  if(origin===null) return json({error:'Origin not allowed.'},403,env.ALLOWED_ORIGIN||'null');
  if(request.method==='OPTIONS') return new Response(null,{status:204,headers:{
    'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'GET,POST,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers':'Content-Type,Authorization','Access-Control-Max-Age':'86400','Vary':'Origin'
  }});
  if(!env.ADMIN_PASSWORD || !env.SESSION_SECRET || !env.FIREBASE_SERVICE_ACCOUNT_JSON || !env.FIREBASE_PROJECT_ID) {
    return json({error:'Worker secrets/configuration are incomplete.'},500,origin);
  }
  const url=new URL(request.url);
  try {
    if(url.pathname==='/login' && request.method==='POST') {
      const body=await request.json().catch(()=>({}));
      const supplied=typeof body.password==='string'?body.password:'';
      const a=new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(supplied)));
      const b=new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(env.ADMIN_PASSWORD)));
      let diff=0; for(let i=0;i<a.length;i++) diff|=a[i]^b[i];
      if(diff!==0) return json({error:'Fel lösenord.'},401,origin);
      return json({token:await issueSession(env)},200,origin);
    }
    if(!await validSession(request,env)) return json({error:'Sessionen har gått ut. Logga in igen.'},401,origin);
    if(url.pathname==='/categories' && request.method==='PUT') {
      const body=await request.json().catch(()=>({}));
      const categories=Array.isArray(body.categories)?[...new Set(body.categories.filter(x=>typeof x==='string').map(x=>x.trim()).filter(Boolean))].slice(0,50):[];
      if(!categories.length || categories.some(x=>x.length>40)) return json({error:'Lägg till minst en kategori (max 40 tecken per kategori).'},400,origin);
      const fields=toFirestoreFields({isSettings:true,categories});
      const path='/wishes/__settings_categories__';
      try {
        await firestoreRequest(env,path+'?updateMask.fieldPaths=isSettings&updateMask.fieldPaths=categories',{method:'PATCH',body:JSON.stringify({fields})});
      } catch(e) {
        if(!String(e.message).includes('404')) throw e;
        await firestoreRequest(env,'/wishes?documentId=__settings_categories__',{method:'POST',body:JSON.stringify({fields})});
      }
      return json({ok:true,categories},200,origin);
    }
    if(url.pathname==='/wishes' && request.method==='POST') {
      const data=validateWish(await request.json());
      data.reserved=false;
      data.createdAt=new Date().toISOString();
      const result=await firestoreRequest(env,'/wishes',{method:'POST',body:JSON.stringify({fields:{...toFirestoreFields(data),createdAt:{timestampValue:data.createdAt}}})});
      return json({id:result.name.split('/').pop()},201,origin);
    }
    const unreserveMatch=url.pathname.match(/^\\/wishes\\/([^/]+)\\/unreserve$/);
    if(unreserveMatch && request.method==='POST') {
      const id=decodeURIComponent(unreserveMatch[1]);
      if(!id || id.includes('/')) return json({error:'Ogiltigt ID.'},400,origin);
      await firestoreRequest(env,'/wishes/'+encodeURIComponent(id)+'?updateMask.fieldPaths=reserved&updateMask.fieldPaths=reservedItems&updateMask.fieldPaths=reservedAt',{
        method:'PATCH',
        body:JSON.stringify({fields:{
          reserved:{booleanValue:false},
          reservedItems:{arrayValue:{values:[]}},
          reservedAt:{nullValue:null}
        }})
      });
      return json({ok:true},200,origin);
    }
    const match=url.pathname.match(/^\/wishes\/([^/]+)$/);
    if(match && request.method==='PATCH') {
      const id=decodeURIComponent(match[1]);
      if(!id || id.includes('/')) return json({error:'Ogiltigt ID.'},400,origin);
      const data=validateWish(await request.json());
      const mask=Object.keys(data).map(k=>'updateMask.fieldPaths='+encodeURIComponent(k)).join('&');
      await firestoreRequest(env,'/wishes/'+encodeURIComponent(id)+'?'+mask,{method:'PATCH',body:JSON.stringify({fields:toFirestoreFields(data)})});
      return json({ok:true},200,origin);
    }
    if(match && request.method==='DELETE') {
      const id=decodeURIComponent(match[1]);
      if(!id || id.includes('/')) return json({error:'Ogiltigt ID.'},400,origin);
      await firestoreRequest(env,'/wishes/'+encodeURIComponent(id),{method:'DELETE'});
      return json({ok:true},200,origin);
    }
    return json({error:'Not found.'},404,origin);
  } catch(error) {
    return json({error:error.message||'Server error.'},500,origin);
  }
}
export default { fetch(request,env) { return handle(request,env); } };
