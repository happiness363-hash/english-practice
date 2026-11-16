import html from './index.html';
const json=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const norm=s=>s.trim().replace(/\s+/g,' ').toLowerCase();
export function validWords(words){
  return Array.isArray(words)&&words.length<=2000&&new Set(words.map(w=>typeof w?.en==='string'?norm(w.en):'')).size===words.length&&words.every(w=>w&&typeof w.id==='string'&&w.id.length<=100&&typeof w.en==='string'&&w.en.trim()&&w.en.length<=100&&typeof w.zh==='string'&&w.zh.trim()&&w.zh.length<=150&&['hint','ipa','speech','cat'].every(k=>w[k]===undefined||typeof w[k]==='string'&&w[k].length<=180)&&Array.isArray(w.courses)&&w.courses.length<=50&&w.courses.every(c=>typeof c==='string'&&c.trim()&&c.length<=60));
}
const decode=s=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/').padEnd(Math.ceil(s.length/4)*4,'=')),c=>c.charCodeAt(0));
let cachedKeys=null,keysUntil=0;
export async function authenticate(request,env){
  try{
    const token=request.headers.get('Cf-Access-Jwt-Assertion');if(!token)return false;
    const parts=token.split('.');if(parts.length!==3)return false;
    const header=JSON.parse(new TextDecoder().decode(decode(parts[0]))),payload=JSON.parse(new TextDecoder().decode(decode(parts[1])));
    const issuer='https://'+env.ACCESS_TEAM;
    if(header.alg!=='RS256'||payload.iss!==issuer||!Array.isArray(payload.aud)||!payload.aud.includes(env.ACCESS_AUD)||!Number.isFinite(payload.exp)||payload.exp<=Date.now()/1000||payload.nbf>Date.now()/1000||!payload.email)return false;
    if(!cachedKeys||Date.now()>keysUntil||!cachedKeys.some(k=>k.kid===header.kid)){
      const response=await fetch(issuer+'/cdn-cgi/access/certs');if(!response.ok)return false;
      cachedKeys=(await response.json()).keys;keysUntil=Date.now()+300000;
    }
    const jwk=cachedKeys.find(k=>k.kid===header.kid);if(!jwk)return false;
    const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
    return await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,decode(parts[2]),new TextEncoder().encode(parts[0]+'.'+parts[1]));
  }catch{return false;}
}
export async function handleApi(request,env){
  const path=new URL(request.url).pathname;
  if(path==='/api/login'&&request.method==='GET')return Response.redirect(new URL('/',request.url).href,303);
  if(path!=='/api/words')return json({error:'Not found'},404);
  if(request.method==='GET'){
    const row=await env.DB.prepare('SELECT data, revision, updated_at FROM vocabulary WHERE id = 1').first();
    if(!row)return json({error:'字庫尚未初始化'},503);
    return json({words:JSON.parse(row.data),revision:row.revision,updatedAt:row.updated_at});
  }
  if(request.method!=='PUT')return json({error:'Method not allowed'},405);
  const url=new URL(request.url);
  if(request.headers.get('Origin')!==url.origin||!request.headers.get('Content-Type')?.startsWith('application/json'))return json({error:'Invalid origin or content type'},403);
  if(Number(request.headers.get('Content-Length')||0)>1000000)return json({error:'檔案超過 1 MB'},413);
  const reader=request.body?.getReader();if(!reader)return json({error:'Missing body'},400);
  let chunks=[],size=0;while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>1000000){await reader.cancel();return json({error:'檔案超過 1 MB'},413);}chunks.push(value);}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  let body;try{body=JSON.parse(new TextDecoder().decode(bytes));}catch{return json({error:'Invalid JSON'},400);}
  if(!Number.isInteger(body.revision)||body.revision<0||!validWords(body.words))return json({error:'單字資料格式不正確'},400);
  const updatedAt=new Date().toISOString();
  const result=await env.DB.prepare('UPDATE vocabulary SET data = ?1, revision = revision + 1, updated_at = ?2 WHERE id = 1 AND revision = ?3').bind(JSON.stringify(body.words),updatedAt,body.revision).run();
  if(result.meta.changes!==1)return json({error:'另一個裝置已更新字庫。請先下載本次草稿，再按重新整理雲端後重試。'},409);
  return json({revision:body.revision+1,updatedAt});
}
export default {
  async fetch(request,env){
    const path=new URL(request.url).pathname;
    try{
      if(path==='/api'||path.startsWith('/api/')){
        if(!await authenticate(request,env))return json({error:'請先登入雲端字庫'},401);
        return await handleApi(request,env);
      }
      if(!['GET','HEAD'].includes(request.method))return new Response('Method Not Allowed',{status:405});
      if(path!=='/'&&path!=='/index.html')return new Response('Not Found',{status:404});
      return new Response(request.method==='HEAD'?null:html,{headers:{'Content-Type':'text/html; charset=utf-8','X-Content-Type-Options':'nosniff','Cache-Control':'no-cache','Referrer-Policy':'strict-origin-when-cross-origin'}});
    }catch(error){console.error(JSON.stringify({event:'request_failed',message:error.message}));return json({error:'雲端服務暫時無法使用，請稍後重試'},503);}
  }
};
