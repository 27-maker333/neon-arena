import {createClient} from 'npm:@supabase/supabase-js@2';
const URL=Deno.env.get('SUPABASE_URL')??'';
const SERVICE=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')??'';
const db=createClient(URL,SERVICE,{auth:{persistSession:false,autoRefreshToken:false}});
const allowed=new Set(['https://neon-arena-gaming.vercel.app','http://localhost:8000','http://127.0.0.1:8000','http://localhost:5173']);
const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const codePattern=/^[A-Z2-9]{6}$/;
const header=(req:Request)=>{
 const origin=req.headers.get('origin');
 return {'Access-Control-Allow-Origin':origin&&allowed.has(origin)?origin:'null','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Access-Control-Allow-Headers':'content-type,apikey,authorization,x-client-info','Content-Type':'application/json;charset=utf-8','Cache-Control':'no-store','Vary':'Origin'};
};
const reply=(req:Request,data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:header(req)});
const error=(req:Request,message:string,status=400)=>reply(req,{error:message},status);
async function fingerprint(req:Request){
 const raw=(req.headers.get('cf-connecting-ip')||req.headers.get('x-forwarded-for')||req.headers.get('x-real-ip')||'guest').split(',')[0].trim();
 const bytes=new TextEncoder().encode(raw+'|'+URL);
 const hash=await crypto.subtle.digest('SHA-256',bytes);
 return Array.from(new Uint8Array(hash),x=>x.toString(16).padStart(2,'0')).join('');
}
function generateCode(){
 const bytes=crypto.getRandomValues(new Uint8Array(6));
 return Array.from(bytes,n=>alphabet[n%alphabet.length]).join('');
}
function cleanRoom(room:any){
 return {id:room.id,code:room.code,title:room.title,max_players:room.max_players,is_private:room.is_private,expires_at:room.expires_at,channel:'na:room:'+room.code};
}
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:header(req)});
 const origin=req.headers.get('origin');
 if(origin&&!allowed.has(origin))return error(req,'Origen no autorizado',403);
 if(req.method==='GET')return reply(req,{ok:true,service:'neon-island-rooms',max_players:8});
 if(req.method!=='POST')return error(req,'Método no permitido',405);
 let body:any;
 try{
  const raw=await req.text();
  if(raw.length>2500) return error(req,'Solicitud demasiado grande',413);
  body=JSON.parse(raw);
  if(!body||typeof body!=='object'||Array.isArray(body))throw Error();
 }catch{return error(req,'JSON inválido')}
 try{
  const action=String(body.action||'join');
  if(action==='join'||action==='public'){
   const code=action==='public'?'PUB222':String(body.code||'').trim().toUpperCase();
   if(!codePattern.test(code))return error(req,'Código de sala inválido');
   const {data, error:e}=await db.from('arena_rooms').select('id,code,title,max_players,is_private,expires_at').eq('code',code).gt('expires_at',new Date().toISOString()).maybeSingle();
   if(e)return error(req,'No se pudo consultar la sala',503);
   if(!data)return error(req,'Esta sala no existe o ha caducado',404);
   return reply(req,{room:cleanRoom(data)});
  }
  if(action==='create'){
   const title=String(body.title||'SALA DE AMIGOS').replace(/[^a-zA-ZÀ-ÿ0-9 _-]/g,'').trim().slice(0,35);
   if(title.length<3)return error(req,'Nombre de sala inválido');
   const privacy=body.is_private!==false;
   const max=Math.min(8,Math.max(2,Math.trunc(Number(body.max_players)||8)));
   const fp=await fingerprint(req);
   const quota=await db.rpc('arena_consume_room_quota',{p_fingerprint:fp});
   if(quota.error)return error(req,'Servicio de salas no disponible',503);
   if(quota.data!==true)return error(req,'Has creado demasiadas salas. Vuelve a intentarlo más tarde.',429);
   const count=await db.from('arena_rooms').select('id',{count:'exact',head:true}).gt('expires_at',new Date().toISOString());
   if(count.error)return error(req,'No se pudo crear la sala',503);
   if((count.count??0)>100)return error(req,'Capacidad de salas alcanzada',503);
   for(let i=0;i<6;i++){
    const code=generateCode();
    const created=await db.from('arena_rooms').insert({code,title,is_private:privacy,max_players:max}).select('id,code,title,max_players,is_private,expires_at').single();
    if(!created.error&&created.data)return reply(req,{room:cleanRoom(created.data)},201);
    if(created.error?.code!=='23505')return error(req,'No se pudo crear la sala',503);
   }
   return error(req,'No se pudo generar el código',503);
  }
  return error(req,'Acción desconocida');
 }catch(e){console.error('arena room error',e);return error(req,'Error interno',500)}
});
