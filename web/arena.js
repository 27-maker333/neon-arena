import * as THREE from 'three';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.91.0';

const $=id=>document.getElementById(id);
const cfg=window.NEON_CONFIG||{};
const COLORS=[0xff8a4c,0x27e7f2,0xb28aff,0x99e35e];
const MAX_PLAYERS=6,ARENA=27,ROOM='neon-arena:deathmatch:room-001';
const IS_TOUCH=matchMedia('(pointer: coarse)').matches||('ontouchstart' in window);
const id=crypto.randomUUID(),peers=new Map(),bots=[],obstacles=[],shots=[],pickups=[];
let selectedColor=0,channel=null,client=null,connected=false,joining=false,playing=false,paused=false,dead=false;
let nickname='',hp=100,ammo=24,kills=0,deaths=0,reloading=false,reloadHandle=null;
let yaw=0,pitch=-.015,yVel=0,grounded=true,lastShot=0,netAccumulator=0,respawnHandle=null,mouseHeld=false,soundEnabled=true;
let scene,camera,renderer,world,playerAvatar,sun,skyDisk,clock=new THREE.Clock(),elapsed=0;
let toastHandle=0,hitHandle=0,damageHandle=0;
const moveKeys=new Set(),mobileMove={x:0,y:0},tmpV=new THREE.Vector3(),raycaster=new THREE.Raycaster();
const spawnPoints=[[-21,-19],[20,19],[-20,19],[21,-19],[0,-21],[0,21],[-21,0],[21,0]];
const state={pos:new THREE.Vector3(0,0,0),velocity:new THREE.Vector3(0,0,0),time:0};
const materials={
 ground:new THREE.MeshStandardMaterial({color:0x5a7296,roughness:.78,metalness:.04}),
 neon:new THREE.MeshStandardMaterial({color:0x5af2e6,emissive:0x15b4ac,emissiveIntensity:1.4,roughness:.28}),
 lime:new THREE.MeshStandardMaterial({color:0xc9f16b,emissive:0x70a637,emissiveIntensity:.8}),
 stone:new THREE.MeshStandardMaterial({color:0x334a6b,roughness:.72,metalness:.18}),
 slate:new THREE.MeshStandardMaterial({color:0x1e324e,roughness:.7,metalness:.1}),
 orange:new THREE.MeshStandardMaterial({color:0xffa257,roughness:.52,metalness:.05}),
 purple:new THREE.MeshStandardMaterial({color:0x9772dc,roughness:.5}),
 cyan:new THREE.MeshStandardMaterial({color:0x3bb9d6,roughness:.48}),
 white:new THREE.MeshStandardMaterial({color:0xf3efff,roughness:.65}),
 dark:new THREE.MeshStandardMaterial({color:0x10243b,roughness:.65})
};
const colorCss=n=>'#'+new THREE.Color(COLORS[(Number(n)||0)%4]).getHexString();
function showToast(message,ms=2300){const t=$('toast');t.textContent=message;t.classList.remove('hidden');clearTimeout(toastHandle);toastHandle=setTimeout(()=>t.classList.add('hidden'),ms)}
function playSound(freq=500,duration=.06,shape='sawtooth',gainLevel=.025){
 if(!soundEnabled)return;try{const C=window.AudioContext||window.webkitAudioContext;audio=audio||new C();if(audio.state==='suspended')audio.resume();const o=audio.createOscillator(),g=audio.createGain();o.type=shape;o.frequency.setValueAtTime(freq,audio.currentTime);o.frequency.exponentialRampToValueAtTime(Math.max(40,freq*.48),audio.currentTime+duration);g.gain.setValueAtTime(gainLevel,audio.currentTime);g.gain.exponentialRampToValueAtTime(.001,audio.currentTime+duration);o.connect(g);g.connect(audio.destination);o.start();o.stop(audio.currentTime+duration)}catch{}}
let audio=null;
function buildScene(){
 try{
  scene=new THREE.Scene();scene.background=new THREE.Color(0xa3d6ed);scene.fog=new THREE.Fog(0x9dc7e0,60,150);
  camera=new THREE.PerspectiveCamera(68,innerWidth/innerHeight,.1,220);
  renderer=new THREE.WebGLRenderer({antialias:!IS_TOUCH,powerPreference:'high-performance',alpha:false});
  renderer.setPixelRatio(Math.min(devicePixelRatio,IS_TOUCH?1.45:1.8));
  renderer.setSize(innerWidth,innerHeight);renderer.shadowMap.enabled=!IS_TOUCH;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.37;
  $('viewport').appendChild(renderer.domElement);
 }catch(err){$('errorScreen').classList.remove('hidden');$('errorText').textContent='WebGL no pudo iniciarse: '+err.message;throw err}
 scene.add(new THREE.HemisphereLight(0xe6faff,0x47567d,2.1));
 sun=new THREE.DirectionalLight(0xffe8bd,3.5);sun.position.set(30,62,15);sun.castShadow=!IS_TOUCH;sun.shadow.mapSize.set(1024,1024);
 sun.shadow.camera.left=-60;sun.shadow.camera.right=60;sun.shadow.camera.top=60;sun.shadow.camera.bottom=-60;sun.shadow.bias=-.001;scene.add(sun);
 world=new THREE.Group();scene.add(world);buildMap();
 for(let i=0;i<3;i++)bots.push(makeBot(i));
 for(let i=0;i<4;i++)createPickup(i);
 playerAvatar=makeAvatar('TÚ',selectedColor,true);
 playerAvatar.root.visible=false;
 camera.position.set(9,10,25);camera.lookAt(0,3,0);
 addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight)});
 renderer.domElement.addEventListener('contextmenu',e=>e.preventDefault());
 renderer.domElement.addEventListener('click',()=>{if(playing&&!dead&&!paused&&!IS_TOUCH&&document.pointerLockElement!==renderer.domElement){renderer.domElement.requestPointerLock().catch(()=>{})}});
 animate();
}
function box(w,h,d,mat,x,y,z,cast=true,group=world){const o=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);o.position.set(x,y,z);o.castShadow=cast;o.receiveShadow=true;group.add(o);return o}
function circle(radius,tube,color,x,y,z,rotation=Math.PI/2){
 const m=new THREE.Mesh(new THREE.TorusGeometry(radius,tube,8,48),new THREE.MeshStandardMaterial({color,emissive:color,emissiveIntensity:.75}));
 m.position.set(x,y,z);m.rotation.x=rotation;world.add(m);return m
}
function canvasLabel(text,w=512,h=128,bg='#102642',fg='#d0f98d'){
 const c=document.createElement('canvas');c.width=w;c.height=h;const ctx=c.getContext('2d');
 ctx.fillStyle=bg;ctx.fillRect(0,0,w,h);ctx.strokeStyle='#83ebee';ctx.lineWidth=10;ctx.strokeRect(8,8,w-16,h-16);
 ctx.fillStyle=fg;ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='900 '+Math.floor(h*.62)+'px Impact, sans-serif';ctx.fillText(text,w/2,h/2+5);
 const texture=new THREE.CanvasTexture(c);texture.colorSpace=THREE.SRGBColorSpace;return texture;
}
function sign(text,x,y,z,w=6,h=1.35,rotation=0){
 const mesh=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({map:canvasLabel(text),side:THREE.DoubleSide}));
 mesh.position.set(x,y,z);mesh.rotation.y=rotation;world.add(mesh);
}
function addSolid(x,z,w,d,h,material=materials.stone){
 box(w,h,d,material,x,h/2,z);obstacles.push({x,z,w,d,h});
 box(w+.08,.1,d+.08,materials.neon,x,h+.04,z,false)
}
function buildMap(){
 box(66,.8,66,materials.ground,0,-.58,0);
 const tileMatA=new THREE.MeshStandardMaterial({color:0x748cba,roughness:.78}),tileMatB=new THREE.MeshStandardMaterial({color:0x6884af,roughness:.8});
 for(let x=-30;x<30;x+=6)for(let z=-30;z<30;z+=6)box(5.95,.025,5.95,((x+z)/6)%2===0?tileMatA:tileMatB,x,-.14,z,false);
 // Arena: glowing perimeter and navy boundary towers
 for(const side of [-1,1]){
  box(66,3,1.8,materials.slate,0,1.35,side*33.3);
  box(1.8,3,66,materials.slate,side*33.3,1.35,0);
  box(66,.13,.3,materials.neon,0,3,side*33.3,false);
  box(.3,.13,66,materials.neon,side*33.3,3,0,false);
  for(let v=-27;v<=27;v+=9){
   box(1.3,6,1.8,materials.cyan,v,3.5,side*32.5);
   box(1.8,6,1.3,materials.purple,side*32.5,3.5,v);
  }
 }
 // Center ruins, cover and shortcuts
 addSolid(-.2,0,6,5,4.1,materials.slate);
 box(1.2,9,1.2,materials.white,0,4.5,0);box(4,1.3,4,materials.purple,0,8.6,0);
 circle(4.7,.18,0x7ff7db,0,-.04,0);
 const chunks=[
 [-15,-12,5,3,2.6,materials.orange],[14,12,5,3,2.6,materials.orange],
 [-14,12,5,3,3.1,materials.purple],[14,-12,5,3,3.1,materials.purple],
 [-19,1,3,7,2.4,materials.cyan],[19,-1,3,7,2.4,materials.cyan],
 [1,-17,7,3,2.7,materials.orange],[-1,17,7,3,2.7,materials.orange],
 [-8,8,3,3,2.5,materials.stone],[8,-8,3,3,2.5,materials.stone],
 [-9,-1,2.6,5,1.7,materials.purple],[9,1,2.6,5,1.7,materials.purple],
 [-4,-12,3.4,2.6,2.2,materials.orange],[4,12,3.4,2.6,2.2,materials.orange]
 ];
 for(const [x,z,w,d,h,mat]of chunks){addSolid(x,z,w,d,h,mat);box(.16,h+1,.16,materials.white,x-w/2+.18,h/2,z-d/2+.18)}
 // Decorative elevated trusses, but all game movement stays on ground for reliability.
 for(let q of [-1,1]){
  box(9,.75,1.2,materials.dark,q*20,5,q*20);
  box(.8,5,.8,materials.lime,q*25,2.5,-q*25);
  for(let i=0;i<5;i++)box(1,.05,1,materials.neon,q*22,.05,-q*10+i*2.2,false);
 }
 sign('NEON ARENA',0,6.3,-32.2,12,2);
 sign('RESPAWN • FIGHT',0,6.3,32.2,9,1.6,Math.PI);
 sign('⚡ POWER',-32.2,6,0,8,1.6,Math.PI/2);
 sign('NO MERCY',32.2,6,0,8,1.6,-Math.PI/2);
 // Holographic panels
 for(const [x,z]of [[-26,-26],[26,-26],[-26,26],[26,26]]){
  const crystal=new THREE.Mesh(new THREE.IcosahedronGeometry(2.2),new THREE.MeshStandardMaterial({color:0xacf5ee,transparent:true,opacity:.65,metalness:.45,roughness:.07,emissive:0x2dd5b8,emissiveIntensity:.5}));
  crystal.position.set(x,6,z);world.add(crystal);
  const p=new THREE.PointLight(0x5bf6dd,8,17);p.position.set(x,4.2,z);world.add(p);
 }
 // Distant floating towers to make the skyline read as a real world
 for(let i=0;i<36;i++){
  const a=i/36*Math.PI*2,r=55+Math.sin(i*3)*13,x=Math.cos(a)*r,z=Math.sin(a)*r,h=10+((i*7)%27);
  box(6+(i%4),h,6+(i%3),i%2?materials.slate:materials.stone,x,h/2-1,z,false);
  box(6+(i%4),.5,6+(i%3),materials.neon,x,h-.9,z,false);
 }
 for(let i=0;i<14;i++){
  const p=new THREE.Group();const m=new THREE.Mesh(new THREE.SphereGeometry(1.1,8,5),materials.white);m.scale.set(2.1,.52,1);p.add(m);p.position.set(Math.sin(i*33)*95,30+(i%6)*3,Math.cos(i*13)*95);world.add(p)
 }
}
function nameSprite(text,color=0xffffff){
 const c=document.createElement('canvas');c.width=512;c.height=110;const ctx=c.getContext('2d');
 ctx.fillStyle='#091a33c9';ctx.fillRect(2,12,508,84);ctx.fillStyle='#c9f76f';ctx.fillRect(2,12,10,84);
 ctx.fillStyle='#fff';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='800 42px sans-serif';ctx.fillText(String(text).slice(0,16),263,54,464);
 const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;
 const m=new THREE.Mesh(new THREE.PlaneGeometry(2.4,.53),new THREE.MeshBasicMaterial({map:t,transparent:true,depthWrite:false,side:THREE.DoubleSide}));m.position.y=3.45;return m;
}
function makeAvatar(name,colorIndex=0,isLocal=false){
 const root=new THREE.Group();scene.add(root);
 const material=new THREE.MeshStandardMaterial({color:COLORS[colorIndex%4],roughness:.62,metalness:.09});
 const skin=new THREE.MeshStandardMaterial({color:0xffd7a7,roughness:.79});
 const dark=materials.dark;
 const torso=box(1.16,1.3,.62,material,0,1.55,0,true,root);
 const vest=box(.83,.65,.68,dark,0,1.62,-.05,true,root);
 const chest=box(.63,.12,.72,materials.neon,0,1.85,-.05,false,root);
 const head=box(.88,.88,.87,skin,0,2.72,0,true,root);
 box(1.08,.33,1.06,dark,0,3.18,0,true,root);
 const visor=box(.74,.28,.06,new THREE.MeshStandardMaterial({color:0x182d45,emissive:0x139fb1,emissiveIntensity:.9}),0,2.76,-.46,false,root);
 const armL=box(.36,1.08,.4,material,-.84,1.57,0,true,root);
 const armR=box(.36,1.08,.4,material,.84,1.57,0,true,root);
 const legL=box(.44,1,.48,dark,-.31,.55,0,true,root);
 const legR=box(.44,1,.48,dark,.31,.55,0,true,root);
 box(.52,.12,.61,materials.white,-.32,.08,-.08,false,root);
 box(.52,.12,.61,materials.white,.32,.08,-.08,false,root);
 // Low-poly chunky energy rifle pointing forward -Z
 const gun=new THREE.Group();gun.position.set(.78,1.45,-.66);gun.rotation.x=-.10;root.add(gun);
 box(.24,.29,1.27,dark,0,0,-.26,true,gun);
 box(.29,.16,.54,materials.neon,0,.11,-.35,false,gun);
 box(.13,.17,.34,materials.white,0,-.15,-.01,false,gun);
 box(.17,.22,.27,materials.purple,0,.11,.23,false,gun);
 const muzzle=new THREE.Mesh(new THREE.IcosahedronGeometry(.26,0),new THREE.MeshBasicMaterial({color:0xffffab}));
 muzzle.position.set(0,0,-.96);muzzle.visible=false;gun.add(muzzle);
 const label=nameSprite(name);root.add(label);if(isLocal)label.visible=false;
 const hitMeshes=[torso,head,vest,armL,armR,legL,legR];
 const a={root,torso,head,legL,legR,armL,armR,gun,muzzle,label,hitMeshes,name,colorIndex};
 for(const m of hitMeshes)m.userData.entity=a;
 return a;
}
function renderAvatar(a,speed=0,time=0){
 const v=speed>.2?Math.sin(time*11)*.28:0;
 a.legL.rotation.x=v;a.legR.rotation.x=-v;
 a.armL.rotation.x=-v*.45;a.armR.rotation.x=v*.22;
 a.torso.position.y=1.55+(speed>.1?Math.abs(Math.sin(time*11))*.055:Math.sin(time*2)*.017);
 a.label.quaternion.copy(camera.quaternion);
}
function createPickup(i){
 const points=[[-22,5],[22,-5],[4,22],[-4,-22]];
 const [x,z]=points[i],group=new THREE.Group();group.position.set(x,.7,z);world.add(group);
 const core=new THREE.Mesh(new THREE.OctahedronGeometry(.58),new THREE.MeshStandardMaterial({color:i%2===0?0xaff65d:0x57dffc,emissive:i%2===0?0x85c63c:0x29b8c7,emissiveIntensity:1.5,metalness:.3}));
 group.add(core);
 const ring=new THREE.Mesh(new THREE.TorusGeometry(.78,.07,6,28),materials.neon);ring.rotation.x=Math.PI/2;group.add(ring);
 const p={group,core,x,z,alive:true,nextAt:0};pickups.push(p);
}
function blocked(x,z,radius=.62){
 if(Math.abs(x)>ARENA||Math.abs(z)>ARENA)return true;
 return obstacles.some(o=>Math.abs(x-o.x)<o.w/2+radius&&Math.abs(z-o.z)<o.d/2+radius);
}
function spawn(index=null){
 for(let i=0;i<spawnPoints.length;i++){
  const [x,z]=spawnPoints[index===null?((Math.random()*spawnPoints.length)|0):(index+i)%spawnPoints.length];
  if(!blocked(x,z,.8)){state.pos.set(x,0,z);break}
 }
 yaw=Math.random()*Math.PI*2;
 yVel=0;grounded=true;hp=100;ammo=24;dead=false;reloading=false;
 playerAvatar.root.visible=true;playerAvatar.root.position.copy(state.pos);
 $('deathScreen').classList.add('hidden');updateHud();
}
function makeBot(i){
 const start=[[-7,-21],[20,5],[-20,6]][i];
 const a=makeAvatar(['BOT · NIX','BOT · REX','BOT · KAI'][i],(i+1)%4);
 a.root.position.set(start[0],0,start[1]);
 return {id:'bot-'+i,avatar:a,px:start[0],pz:start[1],tx:start[0],tz:start[1],angle:0,hp:100,dead:false,respawnAt:0,fireAt:0,thinkAt:0,spin:i*2};
}
function setBotVisibility(){
 // Practice bots only when alone; avoid confusion with actual online participants.
 const practice=peers.size===0;
 for(const b of bots)b.avatar.root.visible=practice&&!b.dead;
}
function damageVisual(){
 const e=$('damageVignette');e.style.opacity='.65';clearTimeout(damageHandle);damageHandle=setTimeout(()=>e.style.opacity='0',210);
}
function showHit(){const m=$('hitMarker');m.classList.add('show');clearTimeout(hitHandle);hitHandle=setTimeout(()=>m.classList.remove('show'),145)}
function updateHud(){
 $('healthNumber').innerHTML=Math.max(0,hp)+' <small>/ 100</small>';
 $('healthFill').style.width=Math.max(0,hp)+'%';
 $('ammoNumber').textContent=ammo;
 $('reloadLabel').textContent=reloading?'RECARGANDO...':'R · RECARGAR';
 $('kills').textContent=kills;$('deaths').textContent=deaths;
}
function addFeed(attacker,victim){
 const e=document.createElement('div');e.textContent=attacker+'  ⚡  '+victim;$('killfeed').prepend(e);setTimeout(()=>e.remove(),5500);
 while($('killfeed').children.length>4)$('killfeed').lastChild.remove();
}
function refreshScore(){
 const list=[{id,name:nickname||'TÚ',color:selectedColor,kills,deaths},...Array.from(peers.values()).map(p=>({id:p.id,name:p.name,color:p.color,kills:p.kills||0,deaths:p.deaths||0}))];
 list.sort((a,b)=>b.kills-a.kills||a.deaths-b.deaths);
 $('scoreRows').textContent='';
 for(const p of list){const row=document.createElement('div');row.className='scoreRow'+(p.id===id?' you':'');
 const dot=document.createElement('i');dot.className='colorDot';dot.style.background=colorCss(p.color);
 const n=document.createElement('span');n.className='rankName';n.textContent=p.name;
 const points=document.createElement('b');points.textContent=p.kills;row.append(dot,n,points);$('scoreRows').append(row);}
 const total=connected?peers.size+1:1;
 $('hudPlayers').textContent=total+' / '+MAX_PLAYERS+' JUGADORES';
 $('lobbyOnline').textContent=total+' JUGADORES';
 $('headerStatus').textContent=connected?'SALA 01 · '+total+'/'+MAX_PLAYERS+' ONLINE':'SALA 01 · MODO PRÁCTICA';
}
async function connectRoom(){
 const key=cfg.supabaseAnonKey,host=cfg.supabaseUrl;
 if(!key||!host){$('netStatus').textContent='● PRÁCTICA OFFLINE';refreshScore();return}
 try{
  client=createClient(host,key,{auth:{persistSession:false,autoRefreshToken:false},realtime:{params:{eventsPerSecond:4}}});
  channel=client.channel(ROOM,{config:{presence:{key:id},broadcast:{self:false,ack:false}}});
  channel.on('presence',{event:'sync'},syncPresence);
  channel.on('broadcast',{event:'state'},({payload})=>receiveState(payload));
  channel.on('broadcast',{event:'hit'},({payload})=>receiveHit(payload));
  channel.on('broadcast',{event:'shot'},({payload})=>receiveShot(payload));
  channel.on('broadcast',{event:'kill'},({payload})=>receiveKill(payload));
  channel.subscribe(async status=>{
   if(status==='SUBSCRIBED'){
    const total=Object.values(channel.presenceState()).reduce((sum,a)=>sum+a.length,0);
    if(total>=MAX_PLAYERS){connected=false;$('netStatus').textContent='● SALA LLENA · PRÁCTICA';showToast('Sala llena: entrando en modo práctica');client.removeChannel(channel);channel=null;return}
    connected=true;
    await channel.track({id,name:nickname,color:selectedColor,kills,deaths,joinedAt:Date.now()});
    $('netStatus').textContent='● CONECTADO A SALA 001';showToast('⚡ ¡CONECTADO A LA ARENA ONLINE!');
    syncPresence();
   }else if(status==='CHANNEL_ERROR'||status==='TIMED_OUT'||status==='CLOSED'){
    connected=false;$('netStatus').textContent='● SIN CONEXIÓN · PRÁCTICA';refreshScore();setBotVisibility();
   }
  });
 }catch(err){console.warn('Realtime unavailable',err);connected=false;$('netStatus').textContent='● PRÁCTICA OFFLINE'}
}
function syncPresence(){
 if(!channel||!connected)return;
 const present=new Map();
 for(const value of Object.values(channel.presenceState()))for(const p of value){
  if(!p||p.id===id||typeof p.id!=='string'||!/^[-0-9a-f]{36}$/.test(p.id))continue;
  if(!present.has(p.id))present.set(p.id,p);
 }
 for(const [pid,p] of present){
  if(!peers.has(pid)){
   const av=makeAvatar(String(p.name||'Rival').slice(0,16),Number(p.color)||0);
   av.root.position.set(0,0,-14);peers.set(pid,{id:pid,name:String(p.name||'Rival').slice(0,16),color:Number(p.color)||0,kills:Number(p.kills)||0,deaths:Number(p.deaths)||0,avatar:av,x:0,z:-14,yaw:0,hp:100,live:true,updated:performance.now()});
   addFeed('⚡ '+String(p.name).slice(0,16),'ENTRÓ');
  }else{const o=peers.get(pid);o.name=String(p.name||'Rival').slice(0,16);o.kills=Number(p.kills)||0;o.deaths=Number(p.deaths)||0;}
 }
 for(const [pid,p] of peers)if(!present.has(pid)){scene.remove(p.avatar.root);peers.delete(pid)}
 setBotVisibility();refreshScore();
}
function broadcast(event,payload){
 if(!connected||!channel)return;
 channel.send({type:'broadcast',event,payload}).catch(()=>{});
}
function receiveState(p){
 if(!p||p.id===id||!peers.has(p.id))return;
 const o=peers.get(p.id);
 if(![p.x,p.z,p.yaw].every(Number.isFinite)||Math.abs(p.x)>45||Math.abs(p.z)>45)return;
 o.x=p.x;o.z=p.z;o.yaw=p.yaw;o.live=p.live!==false;o.hp=Math.max(0,Math.min(100,Number(p.hp)||0));o.updated=performance.now();
 o.avatar.root.visible=o.live;
}
function receiveShot(p){
 if(!p||p.id===id||!peers.has(p.id))return;
 const o=peers.get(p.id);o.avatar.muzzle.visible=true;
 setTimeout(()=>o.avatar.muzzle.visible=false,75);
 if(p.end&&Array.isArray(p.end)&&p.end.length===3){
  const from=o.avatar.root.position.clone().add(new THREE.Vector3(.65,1.6,-.7));
  const to=new THREE.Vector3(...p.end);
  if(to.distanceTo(from)<130)makeTracer(from,to,0xffd978);
 }
}
function receiveHit(p){
 if(!p||p.to!==id||!playing||dead)return;
 if(typeof p.by!=='string'||p.by===id||!peers.has(p.by))return;
 const damage=Math.min(28,Math.max(0,Number(p.damage)||0));
 if(damage===0)return;
 hp=Math.max(0,hp-damage);damageVisual();playSound(180,.12,'triangle',.06);updateHud();
 if(hp<=0)die(p.by);
}
function receiveKill(p){
 if(!p||!peers.has(p.victim)&&p.victim!==id||!p.by)return;
 const killer=peers.get(p.by)?.name||(p.by===id?nickname:'Rival');
 const victim=peers.get(p.victim)?.name||(p.victim===id?nickname:'Rival');
 addFeed(killer,victim);
 if(p.by===id){kills++;updateHud();refreshScore();updatePresence();showToast('+1 ELIMINACIÓN ⚡');playSound(880,.2,'square',.028);}
 if(peers.has(p.victim)){const target=peers.get(p.victim);target.avatar.root.visible=false;target.live=false;}
}
async function updatePresence(){if(connected&&channel)try{await channel.track({id,name:nickname,color:selectedColor,kills,deaths,joinedAt:Date.now()})}catch{}}
function die(by){
 if(dead)return;dead=true;deaths++;hp=0;playerAvatar.root.visible=false;updateHud();refreshScore();updatePresence();
 $('deathScreen').classList.remove('hidden');
 $('deathReason').textContent=by.startsWith('bot-')?'Un bot de práctica te eliminó.':'Un jugador rival te eliminó.';
 if(by.startsWith('bot-'))addFeed(bots.find(b=>b.id===by)?.avatar.name||'BOT',nickname);
 else broadcast('kill',{victim:id,by});
 let n=4;$('respawnTime').textContent=n;
 clearInterval(respawnHandle);respawnHandle=setInterval(()=>{n--;$('respawnTime').textContent=n;if(n<=0){clearInterval(respawnHandle);spawn();if(connected)broadcastState()}},1000);
}
function makeTracer(start,end,color=0xd6ff65){
 const geo=new THREE.BufferGeometry().setFromPoints([start,end]);
 const m=new THREE.LineBasicMaterial({color,transparent:true,opacity:1,depthTest:false});
 const line=new THREE.Line(geo,m);line.renderOrder=12;scene.add(line);shots.push({line,life:.16,max:.16});
}
function reload(){
 if(reloading||dead||!playing||ammo===24)return;
 reloading=true;updateHud();playSound(340,.15,'triangle');
 clearTimeout(reloadHandle);reloadHandle=setTimeout(()=>{ammo=24;reloading=false;updateHud();playSound(770,.07,'triangle')},1650);
}
function shoot(){
 if(!playing||paused||dead||reloading)return;
 const now=performance.now();if(now-lastShot<160)return;
 if(ammo<1){reload();return}
 lastShot=now;ammo--;updateHud();playSound(600,.12,'sawtooth',.018);
 playerAvatar.muzzle.visible=true;setTimeout(()=>playerAvatar.muzzle.visible=false,65);
 const origin=camera.position.clone(),dir=new THREE.Vector3();camera.getWorldDirection(dir);
 raycaster.set(origin,dir);raycaster.far=110;
 const hitTargets=[];
 for(const p of peers.values())if(p.live&&p.avatar.root.visible)hitTargets.push(...p.avatar.hitMeshes);
 if(peers.size===0)for(const b of bots)if(!b.dead)hitTargets.push(...b.avatar.hitMeshes);
 const solidMeshes=obstacleHitMeshes;
 const hits=raycaster.intersectObjects([...solidMeshes,...hitTargets],false);
 let endpoint=origin.clone().addScaledVector(dir,90);
 if(hits.length){
  const best=hits[0];endpoint=best.point.clone();const entity=best.object.userData.entity;
  if(entity){
   const peer=[...peers.values()].find(p=>p.avatar===entity);
   const bot=bots.find(b=>b.avatar===entity);
   if(peer){broadcast('hit',{by:id,to:peer.id,damage:25,t:Date.now()});showHit();playSound(1100,.04,'sine',.025)}
   if(bot){bot.hp-=34;showHit();if(bot.hp<=0)killBot(bot)}
  }
 }
 const muzzleStart=playerAvatar.root.localToWorld(new THREE.Vector3(.78,1.55,-1.55));
 makeTracer(muzzleStart,endpoint);
 broadcast('shot',{id,end:[endpoint.x,endpoint.y,endpoint.z]});
}
const obstacleHitMeshes=[];
function prepareObstacles(){
 world.traverse(o=>{if(!o.isMesh||!o.geometry?.type||o.geometry.type!=='BoxGeometry')return;
  if(obstacles.some(b=>Math.abs(o.position.x-b.x)<.01&&Math.abs(o.position.z-b.z)<.01&&Math.abs(o.geometry.parameters.width-b.w)<.01&&Math.abs(o.geometry.parameters.depth-b.d)<.01))obstacleHitMeshes.push(o);
 });
}
function killBot(bot){
 if(bot.dead)return;bot.dead=true;bot.avatar.root.visible=false;bot.hp=0;kills++;updateHud();refreshScore();
 addFeed(nickname,bot.avatar.name);showToast('BOT ELIMINADO ⚡');playSound(910,.2,'square',.026);
 bot.respawnAt=elapsed+4.5;
}
function spawnBot(bot){
 bot.dead=false;bot.hp=100;const p=spawnPoints[(Math.random()*spawnPoints.length)|0];
 bot.px=p[0];bot.pz=p[1];bot.avatar.root.position.set(bot.px,0,bot.pz);
 bot.avatar.root.visible=peers.size===0;
}
function updateBots(dt){
 const practice=peers.size===0;
 for(const b of bots){
  if(!practice){b.avatar.root.visible=false;continue}
  if(b.dead){if(elapsed>b.respawnAt)spawnBot(b);continue}
  b.avatar.root.visible=true;
  const dx=state.pos.x-b.px,dz=state.pos.z-b.pz,dist=Math.hypot(dx,dz);
  if(elapsed>b.thinkAt){
   b.thinkAt=elapsed+1.3+Math.random()*.6;
   b.spin=Math.sin(elapsed+b.id.length)*1.9;
  }
  const speed=dist>7?3.1:2.15;
  const steer=dist>9?Math.atan2(dx,dz):Math.atan2(dz,dx)+Math.sin(elapsed+b.spin)*2;
  const mx=Math.sin(steer)*speed*dt,mz=Math.cos(steer)*speed*dt;
  if(!blocked(b.px+mx,b.pz,.62))b.px+=mx;
  if(!blocked(b.px,b.pz+mz,.62))b.pz+=mz;
  b.angle=Math.atan2(-dx,-dz);
  b.avatar.root.position.set(b.px,0,b.pz);b.avatar.root.rotation.y=b.angle;
  renderAvatar(b.avatar,speed,elapsed+b.spin);
  if(!dead&&!paused&&dist<26&&elapsed>b.fireAt){
   b.fireAt=elapsed+1.8+Math.random()*1.3;
   // Bots shoot only when there is no large cover directly between them and the player
   const from=new THREE.Vector3(b.px,1.75,b.pz),to=state.pos.clone().add(new THREE.Vector3(0,1.6,0));
   const delta=to.clone().sub(from),length=delta.length();raycaster.set(from,delta.clone().normalize());raycaster.far=length;
   const blockedLine=raycaster.intersectObjects(obstacleHitMeshes,false).length>0;
   if(!blockedLine){
    makeTracer(from,to,0xff8b96);
    if(Math.random()<.52){hp=Math.max(0,hp-9);damageVisual();updateHud();playSound(160,.07,'triangle',.016);if(hp===0)die(b.id)}
   }
  }
 }
}
function broadcastState(){
 if(!connected||dead||!playing)return;
 broadcast('state',{id,x:+state.pos.x.toFixed(2),z:+state.pos.z.toFixed(2),yaw:+yaw.toFixed(3),hp,live:!dead});
}
function updatePickups(dt){
 for(const p of pickups){
  p.group.rotation.y+=dt*1.1;p.group.position.y=.7+Math.sin(elapsed*2+p.x)*.14;
  if(!p.alive){if(elapsed>p.nextAt){p.alive=true;p.group.visible=true}continue}
  if(playing&&!paused&&!dead&&state.pos.distanceTo(new THREE.Vector3(p.x,0,p.z))<1.55){
   if(hp>=100)continue;
   hp=Math.min(100,hp+35);updateHud();p.alive=false;p.group.visible=false;p.nextAt=elapsed+14;
   showToast('+35 DE SALUD 💚');playSound(950,.13,'sine',.035);
  }
 }
}
function updateLocal(dt){
 if(!playing||paused||dead)return;
 const forward=new THREE.Vector3(-Math.sin(yaw),0,-Math.cos(yaw)),right=new THREE.Vector3(Math.cos(yaw),0,-Math.sin(yaw));
 let f=(moveKeys.has('KeyW')?1:0)-(moveKeys.has('KeyS')?1:0)-mobileMove.y;
 let side=(moveKeys.has('KeyD')?1:0)-(moveKeys.has('KeyA')?1:0)+mobileMove.x;
 f=THREE.MathUtils.clamp(f,-1,1);side=THREE.MathUtils.clamp(side,-1,1);
 const direction=forward.multiplyScalar(f).addScaledVector(right,side);
 if(direction.lengthSq()>1)direction.normalize();
 const speed=moveKeys.has('ShiftLeft')||moveKeys.has('ShiftRight')?11:7.2;
 state.velocity.x=THREE.MathUtils.lerp(state.velocity.x,direction.x*speed,Math.min(1,dt*14));
 state.velocity.z=THREE.MathUtils.lerp(state.velocity.z,direction.z*speed,Math.min(1,dt*14));
 const nx=state.pos.x+state.velocity.x*dt,nz=state.pos.z+state.velocity.z*dt;
 if(!blocked(nx,state.pos.z))state.pos.x=nx;else state.velocity.x=0;
 if(!blocked(state.pos.x,nz))state.pos.z=nz;else state.velocity.z=0;
 // Jumping, gravity and floor
 yVel-=25*dt;state.pos.y+=yVel*dt;
 if(state.pos.y<0){state.pos.y=0;yVel=0;grounded=true}
 playerAvatar.root.position.copy(state.pos);playerAvatar.root.rotation.y=yaw;
 renderAvatar(playerAvatar,Math.hypot(state.velocity.x,state.velocity.z),elapsed);
 cameraUpdate(dt);
 netAccumulator+=dt;if(netAccumulator>.32){netAccumulator=0;broadcastState()}
}
function cameraUpdate(dt){
 const f=new THREE.Vector3(-Math.sin(yaw),0,-Math.cos(yaw));
 const target=state.pos.clone().add(new THREE.Vector3(0,1.95+pitch*1.9,0)).addScaledVector(f,4.7);
 const targetCamera=state.pos.clone().addScaledVector(f,-7.6).add(new THREE.Vector3(0,4.6,0));
 camera.position.lerp(targetCamera,Math.min(1,dt*13));camera.lookAt(target);
}
function jump(){if(playing&&!paused&&!dead&&grounded){yVel=10.3;grounded=false;playSound(500,.09,'triangle',.016)}}
function framePeers(dt){
 for(const p of peers.values()){
  p.avatar.root.position.x=THREE.MathUtils.lerp(p.avatar.root.position.x,p.x,Math.min(1,dt*7.2));
  p.avatar.root.position.z=THREE.MathUtils.lerp(p.avatar.root.position.z,p.z,Math.min(1,dt*7.2));
  let diff=THREE.MathUtils.euclideanModulo(p.yaw-p.avatar.root.rotation.y+Math.PI,Math.PI*2)-Math.PI;
  p.avatar.root.rotation.y+=diff*Math.min(1,dt*9);
  renderAvatar(p.avatar,1.8,elapsed+p.id.length);
 }
}
function frameShots(dt){for(let i=shots.length-1;i>=0;i--){const s=shots[i];s.life-=dt;s.line.material.opacity=Math.max(0,s.life/s.max);if(s.life<=0){scene.remove(s.line);s.line.geometry.dispose();s.line.material.dispose();shots.splice(i,1)}}}
function animate(){
 requestAnimationFrame(animate);const dt=Math.min(clock.getDelta(),.06);elapsed+=dt;
 if(!playing){const angle=elapsed*.075;camera.position.set(Math.sin(angle)*51,16.5,Math.cos(angle)*51);camera.lookAt(0,2.4,0);}
 else{if(!paused)updateLocal(dt);else cameraUpdate(dt);updateBots(dt);updatePickups(dt);framePeers(dt);}
 frameShots(dt);
 for(const a of [playerAvatar?.label,...bots.map(b=>b.avatar.label),...Array.from(peers.values()).map(p=>p.avatar.label)])if(a)a.quaternion.copy(camera.quaternion);
 if(renderer)renderer.render(scene,camera);
}
function startGame(e){
 e.preventDefault();if(joining)return;
 const input=$('nickname');const name=input.value.trim().replace(/[^A-Za-z0-9_ ÁÉÍÓÚáéíóúñÑ-]/g,'').slice(0,16);
 if(name.length<2){$('joinStatus').textContent='Escribe un nombre de al menos 2 caracteres';return}
 nickname=name;joining=true;playing=true;paused=false;dead=false;
 $('siteHeader').classList.add('hidden');$('lobby').classList.add('hidden');$('hud').classList.remove('hidden');
 $('nickname').blur();spawn();refreshScore();updateHud();setBotVisibility();
 if(!IS_TOUCH)renderer.domElement.requestPointerLock().catch(()=>{showToast('Haz clic sobre el mapa para controlar la cámara')});
 else showToast('Desliza para apuntar. Usa joystick y FUEGO.');
 connectRoom();
}
function openPause(){
 if(!playing)return;paused=true;mouseHeld=false;$('pauseScreen').classList.remove('hidden');if(document.pointerLockElement===renderer.domElement)document.exitPointerLock();
}
function resume(){
 paused=false;$('pauseScreen').classList.add('hidden');
 if(!IS_TOUCH)renderer.domElement.requestPointerLock().catch(()=>showToast('Haz clic sobre el mapa para apuntar'));
}
function leave(){
 clearInterval(respawnHandle);clearTimeout(reloadHandle);playing=false;paused=false;dead=false;mouseHeld=false;
 if(document.pointerLockElement===renderer.domElement)document.exitPointerLock();
 if(channel){channel.untrack().catch(()=>{});client.removeChannel(channel);channel=null}
 connected=false;for(const p of peers.values())scene.remove(p.avatar.root);peers.clear();
 $('hud').classList.add('hidden');$('pauseScreen').classList.add('hidden');$('deathScreen').classList.add('hidden');$('lobby').classList.remove('hidden');$('siteHeader').classList.remove('hidden');joining=false;setBotVisibility();refreshScore();
}
function setupEvents(){
 $('joinForm').addEventListener('submit',startGame);
 $('colorPicker').addEventListener('click',e=>{
  const b=e.target.closest('[data-color]');if(!b)return;selectedColor=Number(b.dataset.color);
  for(const item of document.querySelectorAll('.swatch')){const selected=item===b;item.classList.toggle('selected',selected);item.setAttribute('aria-pressed',String(selected))}
 });
 $('menuBtn').addEventListener('click',openPause);
 $('resumeBtn').addEventListener('click',resume);
 $('leaveBtn').addEventListener('click',leave);
 document.addEventListener('pointerlockchange',()=>{if(!IS_TOUCH&&playing&&document.pointerLockElement!==renderer.domElement&&!dead&&!paused)openPause()});
 document.addEventListener('mousemove',e=>{
  if(!playing||paused||dead)return;
  if(document.pointerLockElement===renderer.domElement){yaw-=e.movementX*.0027;pitch=THREE.MathUtils.clamp(pitch-e.movementY*.0023,-.85,.72)}
 });
 renderer.domElement.addEventListener('mousedown',e=>{if(e.button!==0||!playing||paused||dead)return;mouseHeld=true;if(IS_TOUCH)return;if(document.pointerLockElement===renderer.domElement)shoot()});
 document.addEventListener('mouseup',()=>{mouseHeld=false});
 document.addEventListener('keydown',e=>{
  if(e.code==='Escape'&&IS_TOUCH&&playing){openPause();return}
  if(!playing||paused)return;
  if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();
  moveKeys.add(e.code);
  if(e.code==='Space'&&!e.repeat)jump();
  if(e.code==='KeyR'&&!e.repeat)reload();
 });document.addEventListener('keyup',e=>moveKeys.delete(e.code));
 // Keep shooting while button is held, subject to per-shot cooldown.
 setInterval(()=>{if(mouseHeld&&!IS_TOUCH&&document.pointerLockElement===renderer.domElement)shoot()},40);
 if(IS_TOUCH){
  let looking=false,lastX=0,lastY=0;
  renderer.domElement.addEventListener('touchstart',e=>{if(!playing||paused)return;for(const t of e.changedTouches){if(t.clientX>innerWidth*.40){looking=true;lastX=t.clientX;lastY=t.clientY}}},{passive:true});
  renderer.domElement.addEventListener('touchmove',e=>{if(!playing||paused||!looking)return;const t=e.changedTouches[0];yaw-=(t.clientX-lastX)*.007;pitch=THREE.MathUtils.clamp(pitch-(t.clientY-lastY)*.005,-.85,.72);lastX=t.clientX;lastY=t.clientY},{passive:true});
  renderer.domElement.addEventListener('touchend',()=>looking=false);
  const stick=$('stickPad'),knob=$('stickKnob');let stickPointer=null;
  stick.addEventListener('pointerdown',e=>{stickPointer=e.pointerId;stick.setPointerCapture(e.pointerId);setStick(e)});
  stick.addEventListener('pointermove',e=>{if(e.pointerId===stickPointer)setStick(e)});
  const stopStick=()=>{stickPointer=null;mobileMove.x=0;mobileMove.y=0;knob.style.transform='translate(-50%,-50%)'};
  stick.addEventListener('pointerup',stopStick);stick.addEventListener('pointercancel',stopStick);
  function setStick(e){const b=stick.getBoundingClientRect(),dx=(e.clientX-(b.left+b.width/2))/(b.width/2),dy=(e.clientY-(b.top+b.height/2))/(b.height/2),m=Math.max(1,Math.hypot(dx,dy));mobileMove.x=dx/m;mobileMove.y=dy/m;knob.style.transform='translate(calc(-50% + '+(mobileMove.x*33)+'px),calc(-50% + '+(mobileMove.y*33)+'px))'}
  $('touchJump').addEventListener('pointerdown',jump);$('touchReload').addEventListener('pointerdown',reload);
  let touchFireTimer=null;
  $('touchFire').addEventListener('pointerdown',e=>{e.preventDefault();shoot();touchFireTimer=setInterval(shoot,170)});
  for(const name of ['pointerup','pointercancel','pointerleave'])$('touchFire').addEventListener(name,()=>clearInterval(touchFireTimer));
 }
 window.addEventListener('blur',()=>{moveKeys.clear();mouseHeld=false});
}
try{buildScene();prepareObstacles();setupEvents();$('joinStatus').innerHTML='<span class="pulse"></span> Sala online única · máximo 6 jugadores · bots de práctica';}catch(e){console.error(e)}
