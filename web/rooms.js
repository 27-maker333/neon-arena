export function setupRooms({config,onStatus=()=>{}}){
 const root=document.querySelector('.lobbyText'),join=document.querySelector('#joinForm');
 const API=(config.supabaseUrl||'').replace(/\/$/,'')+'/functions/v1/arena-rooms',key=config.supabaseAnonKey||'';
 const q=new URLSearchParams(location.search),invite=(q.get('room')||'').toUpperCase().replace(/[^A-Z2-9]/g,'').slice(0,6);
 let code=invite||'PUB222',current=null,mode=invite?'join':'public';
 const el=document.createElement('section');el.className='roomLobby';el.setAttribute('aria-label','Salas multijugador');
 el.innerHTML=[
 '<div class="roomHeading"><div><span class="roomEyebrow">⚡ ISLA TITÁN · ONLINE</span><h2>ELIGE TU SALA</h2></div><span class="roomLive"><i></i> CROSS-PLAY WEB</span></div>',
 '<div class="roomModes">',
 '<button type="button" class="roomMode" data-mode="public"><b>🌎</b><span>ISLA PÚBLICA<small>Juega online ahora</small></span></button>',
 '<button type="button" class="roomMode" data-mode="create"><b>＋</b><span>CREAR SALA<small>Invita a tus amigos</small></span></button>',
 '<button type="button" class="roomMode" data-mode="join"><b>⌁</b><span>UNIRME<small>Tengo un código</small></span></button>',
 '</div><div id="roomPanel" class="roomPanel" aria-live="polite"></div>'
 ].join('');
 root.insertBefore(el,join);
 const panel=el.querySelector('#roomPanel');
 function showReady(){
  if(!current)return;
  panel.innerHTML='<div class="roomReady"><div><small>SALA LISTA PARA INVITAR</small><strong id="roomDisplayCode"></strong><span id="roomDisplayName"></span></div><button type="button" id="copyRoomLink" class="copyRoom">COPIAR ENLACE ↗</button></div>';
  panel.querySelector('#roomDisplayCode').textContent=current.code;
  panel.querySelector('#roomDisplayName').textContent=current.title+' · '+current.max_players+' jugadores';
  panel.querySelector('#copyRoomLink').addEventListener('click',async()=>{
   const u=new URL(location.href);u.searchParams.set('room',current.code);u.hash='';
   try{await navigator.clipboard.writeText(u.href);onStatus('Enlace copiado. ¡Envíalo a tus amigos!')}catch{onStatus('Invita con el enlace: '+u.href)}
  });
 }
 function render(){
  for(const b of el.querySelectorAll('[data-mode]'))b.classList.toggle('active',b.dataset.mode===mode);
  if(mode==='public')panel.innerHTML='<div class="roomSelected"><strong>🌴 ISLA PÚBLICA · SALA 001</strong><span>Mapa grande · 8 jugadores · Combate libre</span></div>';
  else if(mode==='create'){
   panel.innerHTML='<div class="roomForm"><label for="roomTitle">NOMBRE DE LA SALA</label><div class="roomControl"><input id="roomTitle" maxlength="35" value="SALA DE AMIGOS" placeholder="Mi sala épica"><button type="button" id="roomCreate">CREAR ↗</button></div><span>Se genera un código de 6 caracteres válido por 5 horas.</span></div>';
   panel.querySelector('#roomCreate').addEventListener('click',createRoom);
  }else{
   const safe=code!=='PUB222'?code:'';
   panel.innerHTML='<div class="roomForm"><label for="roomInput">CÓDIGO DE INVITACIÓN</label><div class="roomControl"><input id="roomInput" maxlength="6" spellcheck="false" autocapitalize="characters" placeholder="ABC234"><button type="button" id="roomJoin">VERIFICAR ↗</button></div><span>Pega el código o abre el enlace compartido por tu amigo.</span></div>';
   panel.querySelector('#roomInput').value=safe;
   panel.querySelector('#roomJoin').addEventListener('click',async()=>{try{await resolve();showReady();onStatus('Sala verificada. ¡Entra a jugar!')}catch(e){onStatus(e.message)}});
  }
  if(current&&mode!=='public')showReady();
 }
 async function request(data){
  if(!key||!config.supabaseUrl)throw Error('El servidor de salas no está configurado.');
  const r=await fetch(API,{method:'POST',headers:{'Content-Type':'application/json','apikey':key},body:JSON.stringify(data)});
  const body=await r.json().catch(()=>({}));
  if(!r.ok)throw Error(body.error||'No se pudo consultar la sala');
  if(!body.room?.code)throw Error('Respuesta de sala inválida');
  return body.room;
 }
 async function createRoom(){
  const b=panel.querySelector('#roomCreate'),title=panel.querySelector('#roomTitle')?.value.trim()||'SALA DE AMIGOS';
  b.disabled=true;b.textContent='CREANDO...';
  try{current=await request({action:'create',title,is_private:true,max_players:8});
   code=current.code;history.replaceState(null,'','?room='+code);
   showReady();onStatus('Sala '+code+' lista. Copia el enlace y entra.');
  }catch(e){b.disabled=false;b.textContent='CREAR ↗';onStatus(e.message)}
 }
 async function resolve(){
  if(mode==='create'&&current)return current;
  let c=mode==='public'?'PUB222':(panel.querySelector('#roomInput')?.value||code).toUpperCase().trim();
  c=c.replace(/[^A-Z2-9]/g,'');
  if(!/^[A-Z2-9]{6}$/.test(c))throw Error('El código debe tener exactamente 6 caracteres.');
  current=await request({action:'join',code:c});code=current.code;
  history.replaceState(null,'','?room='+code);
  return current;
 }
 for(const b of el.querySelectorAll('[data-mode]'))b.addEventListener('click',()=>{mode=b.dataset.mode;current=null;if(mode==='public')code='PUB222';render()});
 render();
 return {enter:resolve,get room(){return current},get code(){return current?.code||code},reset(){current=null;code='PUB222';mode='public';history.replaceState(null,'',location.pathname);render()}};
}
