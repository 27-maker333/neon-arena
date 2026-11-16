import {createClient} from 'npm:@supabase/supabase-js@2';
import {initialState,replay,type Move} from '../_shared/neon-blast.ts';

const url=Deno.env.get('SUPABASE_URL');
const serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
if(!url||!serviceKey) throw new Error('Missing Supabase environment');
const db=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
const origins=(Deno.env.get('ALLOWED_ORIGINS')??'https://neon-arena-gaming.vercel.app,http://localhost:5173,http://localhost:8000').split(',').map(x=>x.trim()).filter(Boolean);
function cors(req:Request):HeadersInit {
 const origin=req.headers.get('origin');
 return {'Access-Control-Allow-Origin':origin&&origins.includes(origin)?origin:(origin?'null':'*'),
 'Access-Control-Allow-Methods':'GET,POST,PATCH,OPTIONS',
 'Access-Control-Allow-Headers':'authorization,x-client-info,apikey,content-type','Vary':'Origin'};
}
function json(req:Request,data:unknown,status=200):Response{
 return new Response(JSON.stringify(data),{status,headers:{...cors(req),'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
}
function fail(req:Request,message:string,status=400):Response{return json(req,{error:{message}},status);}
async function userId(req:Request):Promise<string|null>{
 const header=req.headers.get('authorization')??'';
 if(!header.startsWith('Bearer ')) return null;
 const {data,error}=await db.auth.getUser(header.slice(7));
 return error?null:data.user?.id??null;
}
async function body(req:Request):Promise<Record<string,unknown>>{
 const raw=await req.text();if(raw.length>24000) throw new Error('Invalid body');
 const parsed=JSON.parse(raw);
 if(!parsed||Array.isArray(parsed)||typeof parsed!=='object') throw new Error('Invalid body');
 return parsed as Record<string,unknown>;
}
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
Deno.serve(async req=>{
 if(req.method==='OPTIONS') return new Response(null,{status:204,headers:cors(req)});
 const pathname=new URL(req.url).pathname;
 const ix=pathname.indexOf('/api/');
 const route=(ix>=0?pathname.slice(ix+4):pathname).replace(/\/$/,'');
 const method=req.method;
 const query=new URL(req.url).searchParams;
 try{
  if(method==='GET'&&route==='/v1/health') return json(req,{ok:true,project:'neon-arena',version:'1.0.0'});
  if(method==='GET'&&route==='/v1/games'){
   const {data,error}=await db.from('games').select('id,slug,title,description,enabled').eq('enabled',true);
   return error?fail(req,'Games unavailable',503):json(req,{games:data});
  }
  if(method==='GET'&&route==='/v1/leaderboard'){
   const slug=query.get('game')||'neon-blast';
   if(!/^[a-z0-9-]{1,40}$/.test(slug)) return fail(req,'Invalid slug');
   const limit=Math.min(100,Math.max(1,Number(query.get('limit')||20)||20));
   const {data,error}=await db.rpc('get_leaderboard',{p_slug:slug,p_limit:limit});
   return error?fail(req,'Ranking unavailable',503):json(req,{leaderboard:data});
  }
  if(method==='GET'&&route==='/v1/shop'){
   const {data,error}=await db.from('shop_items').select('id,slug,title,description,price_coins').eq('enabled',true).order('price_coins');
   return error?fail(req,'Shop unavailable',503):json(req,{items:data});
  }
  const player=await userId(req);
  if(!player) return fail(req,'Authentication required',401);
  if(method==='GET'&&route==='/v1/profile'){
   const {data,error}=await db.from('profiles').select('id,username,avatar_url,level,created_at').eq('id',player).single();
   return error?fail(req,'Profile unavailable',503):json(req,{profile:data});
  }
  if(method==='PATCH'&&route==='/v1/profile'){
   const b=await body(req),update:{username?:string|null;avatar_url?:string|null}={};
   if('username' in b){
    if(b.username!==null&&(typeof b.username!=='string'||!/^[a-zA-Z0-9_]{3,20}$/.test(b.username))) return fail(req,'Invalid username');
    update.username=b.username as string|null;
   }
   if('avatar_url' in b){
    if(b.avatar_url!==null&&(typeof b.avatar_url!=='string'||b.avatar_url.length>500||!b.avatar_url.startsWith('https://'))) return fail(req,'Invalid avatar URL');
    update.avatar_url=b.avatar_url as string|null;
   }
   if(!Object.keys(update).length) return fail(req,'No fields to update');
   const {data,error}=await db.from('profiles').update(update).eq('id',player).select('id,username,avatar_url,level').single();
   return error?fail(req,'Could not update profile',error.code==='23505'?409:503):json(req,{profile:data});
  }
  if(method==='GET'&&route==='/v1/wallet'){
   const {data,error}=await db.from('wallets').select('coins').eq('player_id',player).single();
   return error?fail(req,'Wallet unavailable',503):json(req,{wallet:data});
  }
  if(method==='GET'&&route==='/v1/inventory'){
   const {data,error}=await db.from('inventory').select('item_id,purchased_at,shop_items(id,slug,title,description)').eq('player_id',player);
   return error?fail(req,'Inventory unavailable',503):json(req,{inventory:data});
  }
  if(method==='GET'&&route==='/v1/stats/me'){
   const [count,best]=await Promise.all([
    db.from('matches').select('id',{head:true,count:'exact'}).eq('player_id',player).eq('status','completed'),
    db.from('matches').select('score').eq('player_id',player).eq('status','completed').order('score',{ascending:false}).limit(1)
   ]);
   return count.error||best.error?fail(req,'Stats unavailable',503):json(req,{stats:{games_played:count.count??0,best_score:best.data?.[0]?.score??0}});
  }
  if(method==='POST'&&route==='/v1/rewards/daily'){
   const {data,error}=await db.rpc('claim_neon_daily',{p_player:player});
   return error?fail(req,'Reward unavailable',503):json(req,{coins_awarded:data,already_claimed:data===0});
  }
  if(method==='POST'&&route==='/v1/shop/purchase'){
   const b=await body(req);if(!uuid(b.item_id)) return fail(req,'Invalid item_id');
   const {data,error}=await db.rpc('purchase_neon_item',{p_player:player,p_item:b.item_id});
   if(error) return fail(req,['already_owned','insufficient_coins','item_unavailable'].includes(error.message)?error.message:'Purchase failed',409);
   return json(req,{success:true,coins_remaining:data});
  }
  if(method==='POST'&&route==='/v1/matches/start'){
   const b=await body(req);
   if(b.game_slug!==undefined&&b.game_slug!=='neon-blast') return fail(req,'Game unavailable');
   const {data:game,error:gameError}=await db.from('games').select('id').eq('slug','neon-blast').eq('enabled',true).single();
   if(gameError||!game) return fail(req,'Game unavailable',503);
   await db.from('matches').update({status:'expired'}).eq('player_id',player).eq('status','active').lt('expires_at',new Date().toISOString());
   const {data:active,error:activeError}=await db.from('matches').select('id').eq('player_id',player).eq('status','active').gt('expires_at',new Date().toISOString()).limit(1);
   if(activeError) return fail(req,'Could not check active matches',503);
   if(active?.length) return fail(req,'Finish active match first',409);
   const seed=crypto.getRandomValues(new Uint32Array(1))[0]||1;
   const {data:match,error}=await db.from('matches').insert({player_id:player,game_id:game.id,seed}).select('id,seed,started_at,expires_at').single();
   return error||!match?fail(req,'Could not start match',503):json(req,{match:{...match,duration_ms:60000,grid:initialState(Number(match.seed)).grid}},201);
  }
  if(method==='POST'&&route==='/v1/matches/finish'){
   const b=await body(req);
   if(!uuid(b.match_id)||!Array.isArray(b.moves)) return fail(req,'Invalid match_id or moves');
   const {data:match,error}=await db.from('matches').select('id,seed,status,started_at,expires_at').eq('id',b.match_id).eq('player_id',player).single();
   if(error||!match) return fail(req,'Match not found',404);
   if(match.status!=='active'||Date.parse(match.expires_at)<=Date.now()) return fail(req,'Match unavailable',409);
   let state;
   try{state=replay(Number(match.seed),b.moves as Move[]);}catch{return fail(req,'Invalid moves');}
   const elapsed=Date.now()-Date.parse(match.started_at);
   const last=(b.moves as Move[]).at(-1)?.atMs??0;
   if(last>elapsed+1500) return fail(req,'Impossible move time');
   const {data:coins,error:finishError}=await db.rpc('finalize_neon_match',{p_player:player,p_match:match.id,p_score:state.score,p_moves:state.moves});
   return finishError?fail(req,'Match already finished or unavailable',409):json(req,{result:{score:state.score,moves:state.moves,coins_awarded:coins}});
  }
  return fail(req,'Endpoint not found',404);
 }catch(e){
  if(e instanceof SyntaxError||(e instanceof Error&&/Invalid body/.test(e.message))) return fail(req,'Invalid JSON body');
  console.error('Neon API error',e);
  return fail(req,'Internal server error',500);
 }
});
