/* LubizJeans: interfaz original restaurada. Persistencia exclusiva en Supabase. */
(function () {
  'use strict';
  const { icon, esc, toast, modal, confirmDialog, withLoading, formData, fmtDate } = UI;
  const SB = 'https://vtfhjqyzttdxknjldzwx.supabase.co';
  const KEY = 'sb_publishable_Nt4li8VGcN315JnEgA-BEw_8TjjNuKs';
  const STORE_KEY = 'lubiz_session';
  const BUCKET = 'lubizjeans-products';
  const $ = (s, node = document) => node.querySelector(s);
  const $$ = (s, node = document) => [...node.querySelectorAll(s)];
  const root = $('#root');
  let session = null, user = null, settings = {}, products = [], categories = [], orders = [], coupons = [], campaigns = [], shipping = [], customers = [], activePage = 'dashboard';
  const labels = { dashboard: 'Resumen', pedidos: 'Pedidos', productos: 'Productos', categorias: 'Categorías', clientes: 'Clientes', cupones: 'Cupones', campanas: 'Campañas', envios: 'Envíos', reclamaciones: 'Reclamaciones', ajustes: 'Ajustes' };
  const NAV = [
    ['dashboard','Resumen','chart'], ['pedidos','Pedidos','receipt'], ['productos','Productos','box'],
    ['categorias','Categorías','grid'],['clientes','Clientes','users'],['cupones','Cupones','ticket'],
    ['campanas','Campañas','megaphone'],['envios','Envíos','truck'],['reclamaciones','Reclamaciones','book'],['ajustes','Ajustes','settings']
  ];
  const money = n => 'S/ ' + Number(n || 0).toFixed(2);
  const slug = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,85);
  const empty = (title, detail='Todavía no hay registros reales.') => `<div class="empty">${icon('box')}<h3>${esc(title)}</h3><p>${esc(detail)}</p></div>`;
  const actions = (label, action='add') => `<button class="btn btn-primary" data-action="${action}">${icon('plus')} ${esc(label)}</button>`;
  const table = (heads, rows) => `<div class="card table-wrap"><table class="table"><thead><tr>${heads.map(x=>'<th>'+esc(x)+'</th>').join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
  function saved(s) { session=s; if(s)sessionStorage.setItem(STORE_KEY,JSON.stringify(s));else sessionStorage.removeItem(STORE_KEY); }
  async function api(path, opt={}) {
    const h = { apikey:KEY, ...(opt.headers||{}) };
    if (session?.access_token && opt.auth !== false) h.Authorization = 'Bearer '+session.access_token;
    let body = opt.body;
    if (body!==undefined && !(body instanceof Blob) && !(body instanceof FormData)) { h['content-type']='application/json';body=JSON.stringify(body); }
    const res = await fetch(SB+path,{method:opt.method||'GET',headers:h,body});
    const txt=await res.text();let json;
    try{json=txt?JSON.parse(txt):null;}catch{json={message:txt};}
    if(!res.ok)throw new Error(json?.message||json?.msg||json?.error_description||json?.error||'HTTP '+res.status);
    return json;
  }
  const get = (name,query='?select=*')=>api('/rest/v1/'+name+query);
  function change(name,method,body,where='') {
    return api('/rest/v1/'+name+where,{method,body,headers:{Prefer: method==='POST'?'return=representation':'return=minimal'}});
  }
  async function refresh(){if(!session?.refresh_token)return false;try{saved(await api('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:{refresh_token:session.refresh_token},auth:false}));return true;}catch{return false;}}
  async function authenticate() {
    if(!session?.access_token)return false;
    try{
      const me=await api('/auth/v1/user');
      if(!me.id)return false;
      const rows=await get('lubiz_admins','?user_id=eq.'+encodeURIComponent(me.id)+'&active=eq.true&select=role');
      if(rows.length===0)return false;
      user={name:me.email.split('@')[0],email:me.email,id:me.id,role:rows[0].role}; return true;
    }catch{return false;}
  }
  function logoHtml(){return `<img class="logo-img" src="/img/lubiz-mark.svg" alt="LubizJeans">`;}
  function renderLogin(){
    document.title='Ingresar · Panel LubizJeans';
    root.innerHTML=`<div class="adm-login">
      <div class="adm-login-art">
        <div class="logo" style="color:#fff">${logoHtml()} LubizJeans</div>
        <div><h2>LUBIZJEANS: tu universo denim, bajo control</h2><p>Colección, fotografías, tallas, inventario y pedidos en un solo lugar.</p>
        <ul><li>${icon('check')} Gestiona jeans y sus existencias reales</li><li>${icon('check')} Controla los pedidos de tu marca</li><li>${icon('check')} Catálogo y fotografías en Supabase</li></ul></div>
        <small style="color:#b5bcc4;position:relative;z-index:1">© ${new Date().getFullYear()} LubizJeans</small>
      </div>
      <div class="adm-login-form"><form id="adm-login" novalidate>
        <div><h1>Iniciar sesión</h1><p class="muted mt-1">Acceso exclusivo para administradores.</p></div>
        <label class="field"><span>Correo</span><input class="input" type="email" name="email" required autocomplete="username"></label>
        <label class="field"><span>Contraseña</span><input class="input" type="password" name="password" required minlength="8" autocomplete="current-password"></label>
        <button class="btn btn-primary btn-lg btn-block" type="submit" data-loading="Ingresando…">Ingresar al panel</button>
        <button class="btn btn-block" type="button" id="first-account">Crear acceso por primera vez</button>
        <div class="alert alert-info small">${icon('info')}<div>Si todavía no tienes acceso, crea tu cuenta con el correo autorizado y confirma el mensaje que enviará Supabase. La contraseña anterior no se reutiliza.</div></div>
        <a href="/" class="btn btn-ghost">${icon('arrowLeft')} Volver a la tienda</a>
      </form></div>
    </div>`;
    $('#adm-login').addEventListener('submit',async e=>{
      e.preventDefault();const d=formData(e.target);
      if(!d.email || !d.password){toast('Completa los datos','error');return;}
      await withLoading($('button[type=submit]',e.target),async()=>{
        try{saved(await api('/auth/v1/token?grant_type=password',{method:'POST',auth:false,body:{email:d.email.trim(),password:d.password}}));
          if(!await authenticate()){saved(null);throw new Error('Cuenta no autorizada. Verifica tu correo de administrador.');}
          await showDashboard();
        }catch(err){toast(err.message,'error');}
      });
    });
    $('#first-account').addEventListener('click',async()=>{
      const form=$('#adm-login'),d=formData(form);
      if(!d.email||!d.password||d.password.length<8){toast('Escribe correo y una contraseña nueva de al menos 8 caracteres','error');return;}
      if(!await confirmDialog('¿Crear tu cuenta con este correo en Supabase? Necesitarás verificar el email.',{title:'Primer acceso'}))return;
      try{await api('/auth/v1/signup',{method:'POST',auth:false,body:{email:d.email.trim(),password:d.password}});toast('Comprueba tu correo y luego inicia sesión','success');}
      catch(err){toast(err.message,'error');}
    });
  }
  function renderShell(){
    root.innerHTML=`<div class="adm">
      <aside class="sidebar" id="sidebar">
        <a class="logo" href="#/dashboard">${logoHtml()}<span>LubizJeans<small>Administración</small></span></a>
        <div class="side-label">Gestión</div>
        ${NAV.map(([id,name,ico])=>`<a class="side-link" href="#/${id}" data-nav="${id}">${icon(ico)}${esc(name)}${id==='pedidos'?'<span class="count" id="pending-count"></span>':''}</a>`).join('')}
        <div class="side-foot">
          <a class="side-link" href="/" target="_blank" rel="noopener">${icon('store')} Ver tienda ${icon('external','icon-sm')}</a>
          <button class="side-link" type="button" id="adm-logout">${icon('logout')} Cerrar sesión</button>
          <div class="side-user"><span class="avatar">${esc(user.email.charAt(0).toUpperCase())}</span><div><b>Administrador</b><span>${esc(user.email)}</span></div></div>
        </div>
      </aside>
      <div class="adm-main">
        <header class="adm-top"><button class="btn btn-ghost btn-icon menu-btn" type="button" id="menu-btn" aria-label="Menú">${icon('menu')}</button><h1 id="page-title">Resumen</h1><div class="grow"></div><span class="muted small">${new Date().toLocaleDateString('es-PE',{weekday:'long',day:'numeric',month:'long'})}</span></header>
        <div class="adm-content" id="view"></div>
      </div></div>`;
    $('#adm-logout').onclick=async()=>{try{await api('/auth/v1/logout',{method:'POST'})}catch{}saved(null);user=null;renderLogin();};
    $('#menu-btn').onclick=()=>{const side=$('#sidebar');side.classList.add('open');const bd=document.createElement('div');bd.className='side-backdrop';bd.onclick=()=>{side.classList.remove('open');bd.remove()};document.body.appendChild(bd);};
    window.addEventListener('hashchange',renderCurrent);
  }
  async function load(){
    const names=['products','categories','orders','coupons','promotions','shipping_methods','customers','settings'];
    const q={products:'?select=*&order=id.desc',categories:'?select=*&order=sort.asc',orders:'?select=*&order=created_at.desc&limit=200',coupons:'?select=*&order=id.desc',promotions:'?select=*&order=id.desc',shipping_methods:'?select=*&order=sort.asc',customers:'?select=*&order=created_at.desc&limit=200',settings:'?select=*'};
    const all=await Promise.all(names.map(n=>get(n,q[n])));
    [products,categories,orders,coupons,campaigns,shipping,customers]=all;
    settings=Object.fromEntries(all[7].map(r=>[r.key,r.value]));
    if($('#pending-count')){$('#pending-count').textContent=String(orders.filter(o=>o.status==='pendiente').length||'');}
  }
  async function showDashboard(){renderShell();try{await load()}catch(e){toast('Error de conexión: '+e.message,'error');} if(!location.hash)location.hash='#/dashboard';renderCurrent();}
  function renderCurrent(){
    if(!user)return;
    const route=location.hash.replace(/^#\//,'').split('/')[0]||'dashboard';activePage=labels[route]?route:'dashboard';
    $$('.side-link[data-nav]').forEach(a=>a.classList.toggle('active',a.dataset.nav===activePage));
    $('#page-title').textContent=labels[activePage];
    const side=$('#sidebar');if(side)side.classList.remove('open');$$('.side-backdrop').forEach(x=>x.remove());
    ({dashboard:dashboard,pedidos:ordersPage,productos:productsPage,categorias:categoriesPage,clientes:customersPage,cupones:couponsPage,campanas:promosPage,envios:shippingPage,reclamaciones:complaintsPage,ajustes:settingsPage}[activePage])();
  }
  function rerender(){load().then(renderCurrent).catch(e=>toast(e.message,'error'));}
  const rowsProducts=()=>products.map(p=>`<tr><td><div class="flex">${p.image_url?`<img class="thumb" src="${esc(p.image_url)}" alt="">`:`<img class="thumb" src="/img/placeholder.svg" alt="">`}<div><div class="cell-main">${esc(p.name)}</div><div class="cell-sub">${esc(p.sku||p.slug)}</div></div></div></td><td>${esc(categories.find(c=>c.id===p.category_id)?.name||'—')}</td><td>${money(p.price)}${p.compare_price?`<div class="cell-sub" style="text-decoration:line-through">${money(p.compare_price)}</div>`:''}</td><td><span class="stock-num ${p.stock<=0?'out':''}">${p.stock}</span></td><td><span class="badge ${p.active?'b-success':'b-muted'}">${p.active?'Publicado':'Oculto'}</span></td><td class="right"><button class="btn btn-sm" data-edit-product="${p.id}">${icon('edit')} Editar</button> <button class="btn btn-sm btn-danger" data-delete-product="${p.id}">${icon('trash')}</button></td></tr>`);
  function dashboard(){
    $('#view').innerHTML=`<div class="kpis">
      ${[['Productos',products.length,'box'],['Stock disponible',products.filter(p=>p.active&&p.stock>0).length,'check'],['Pedidos',orders.length,'receipt'],['Categorías',categories.length,'grid']].map(([label,value,ico])=>`<div class="card kpi"><div class="kpi-top"><span>${label}</span><span class="kpi-ic">${icon(ico)}</span></div><b>${value}</b><small>Información real en Supabase</small></div>`).join('')}
      </div><div class="dash-grid"><section class="card"><div class="panel-head"><h3>Productos recientes</h3><a class="btn btn-sm" href="#/productos">Ver todos</a></div><div class="panel-body">${products.length?products.slice(0,5).map(p=>`<div class="list-row"><img class="thumb" src="${esc(p.image_url||'/img/placeholder.svg')}" alt=""><div class="grow"><b>${esc(p.name)}</b><div class="cell-sub">Stock: ${p.stock}</div></div><strong>${money(p.price)}</strong></div>`).join(''):empty('Sin productos todavía','Agrega tus jeans reales desde Productos.')}</div></section><section class="card"><div class="panel-head"><h3>Pedidos recientes</h3></div><div class="panel-body">${orders.length?orders.slice(0,5).map(o=>`<div class="list-row"><div class="grow"><b>${esc(o.code)}</b><div class="cell-sub">${esc(o.status)}</div></div><b>${money(o.total)}</b></div>`).join(''):empty('No hay pedidos','Solo se mostrarán pedidos reales.')}</div></section></div>`;
  }
  function productsPage(){
    $('#view').innerHTML=`<div class="toolbar"><div class="search-box">${icon('search')}<input class="input" id="p-search" placeholder="Buscar jeans por nombre o SKU..."></div><div class="spacer"></div>${actions('Añadir producto','add-product')}</div><div id="product-results"></div>`;
    const redraw=()=>{const q=($('#p-search').value||'').toLowerCase(),found=products.filter(p=>p.name.toLowerCase().includes(q)||String(p.sku||'').toLowerCase().includes(q));$('#product-results').innerHTML=found.length?table(['Producto','Categoría','Precio','Stock','Estado','Acciones'],found.map(p=>rowsProducts().find(x=>x.includes(`data-edit-product="${p.id}"`)))):empty('Sin jeans registrados','El catálogo no contiene datos de demostración.');};
    $('#p-search').addEventListener('input',redraw);redraw();
    $('#view').onclick=e=>{const b=e.target.closest('button');if(!b)return; if(b.dataset.action==='add-product')openProduct();if(b.dataset.editProduct)openProduct(products.find(p=>p.id===Number(b.dataset.editProduct)));if(b.dataset.deleteProduct)removeProduct(Number(b.dataset.deleteProduct));};
  }
  async function uploadPhoto(file){
    if(!file)return null;
    if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>5*1024*1024)throw new Error('La foto debe ser JPG, PNG o WebP de máximo 5 MB');
    const ext=file.type==='image/png'?'png':file.type==='image/webp'?'webp':'jpg';
    const id=crypto.randomUUID();const key='products/'+id+'.'+ext;
    await api('/storage/v1/object/'+BUCKET+'/'+key,{method:'POST',body:file,headers:{'content-type':file.type,'x-upsert':'false'}});
    return SB+'/storage/v1/object/public/'+BUCKET+'/'+key;
  }
  function openProduct(p){
    const body=`<form id="product-form"><div style="display:grid;grid-template-columns:1fr 1fr;gap:15px">
      <label class="field" style="grid-column:1/-1"><span>Nombre del jean *</span><input class="input" name="name" required maxlength="140" value="${esc(p?.name||'')}"></label>
      <label class="field"><span>SKU</span><input class="input" name="sku" maxlength="60" value="${esc(p?.sku||'')}"></label>
      <label class="field"><span>Categoría</span><select class="select" name="category_id"><option value="">Sin categoría</option>${categories.map(c=>`<option value="${c.id}" ${c.id===p?.category_id?'selected':''}>${esc(c.name)}</option>`).join('')}</select></label>
      <label class="field"><span>Precio (S/) *</span><input class="input" name="price" type="number" min="0" step=".01" value="${p?.price??''}" required></label>
      <label class="field"><span>Precio anterior (S/)</span><input class="input" name="compare_price" type="number" min="0" step=".01" value="${p?.compare_price??''}"></label>
      <label class="field"><span>Unidades disponibles *</span><input class="input" name="stock" type="number" min="0" step="1" value="${p?.stock??0}" required></label>
      <label class="field"><span>Descripción breve / tallas</span><input class="input" name="short_description" maxlength="300" value="${esc(p?.short_description||'')}"></label>
      <label class="field" style="grid-column:1/-1"><span>Detalles del producto</span><textarea class="textarea" name="description" maxlength="10000">${esc(p?.description||'')}</textarea></label>
      <label class="field" style="grid-column:1/-1"><span>Fotografía del jean (JPEG, PNG, WebP; máximo 5 MB)</span><input class="input" name="photo" type="file" accept="image/jpeg,image/png,image/webp"></label>
      <label style="display:flex;align-items:center;gap:8px"><input type="checkbox" name="active" ${p?.active===false?'':'checked'}> Publicado</label>
      <label style="display:flex;align-items:center;gap:8px"><input type="checkbox" name="featured" ${p?.featured?'checked':''}> Destacado</label>
    </div></form>`;
    const m=modal({title:p?'Editar producto':'Nuevo producto',size:'lg',body,
      footer:'<button class="btn" data-close>Cancelar</button><button class="btn btn-primary" id="product-save">Guardar producto</button>',
      onMount:(el,close)=>{$('#product-save',el).onclick=()=>withLoading($('#product-save',el),async()=>{
        const form=$('#product-form',el);if(!form.reportValidity())return;
        const d=formData(form),price=Number(d.price),stock=Number(d.stock),compare=d.compare_price?Number(d.compare_price):null;
        if(!Number.isFinite(price)||price<0||!Number.isInteger(stock)||stock<0){toast('Revisa precio y stock','error');return;}
        if(compare!==null&&compare<=price){toast('El precio anterior debe superar el actual','error');return;}
        try{
          const file=form.elements.photo.files?.[0];
          const image_url=file?await uploadPhoto(file):(p?.image_url||null);
          const next={name:String(d.name).trim(),slug:p?.slug||(slug(d.name)+'-'+Date.now().toString(36)),sku:String(d.sku||'').trim()||null,category_id:d.category_id?Number(d.category_id):null,price,compare_price:compare,stock,short_description:String(d.short_description||'').trim()||null,description:String(d.description||'').trim()||null,active:!!d.active,featured:!!d.featured,image_url};
          await change('products',p?'PATCH':'POST',next,p?'?id=eq.'+p.id:'');close();await load();renderCurrent();toast('Producto guardado en Supabase');
        }catch(err){toast(err.message,'error');}
      });}
    });
  }
  async function removeProduct(id){const p=products.find(x=>x.id===id);if(!p||!await confirmDialog('¿Eliminar definitivamente '+p.name+'?',{title:'Eliminar jean',danger:true}))return;try{await change('products','DELETE',undefined,'?id=eq.'+id);rerender();toast('Producto eliminado');}catch(err){toast(err.message,'error');}}
  function categoriesPage(){
    $('#view').innerHTML=`<div class="toolbar"><div class="spacer"></div>${actions('Nueva categoría','add-category')}</div>`+(categories.length?table(['Categoría','Slug','Activa','Acciones'],categories.map(c=>`<tr><td><strong>${esc(c.name)}</strong></td><td>${esc(c.slug)}</td><td>${c.active?'Sí':'No'}</td><td class="right"><button class="btn btn-sm" data-category="${c.id}">${icon('edit')} Editar</button></td></tr>`)):empty('Sin categorías'));
    $('#view').onclick=e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.action==='add-category')categoryForm();if(b.dataset.category)categoryForm(categories.find(c=>c.id===Number(b.dataset.category)));};
  }
  function categoryForm(c){
    modal({title:c?'Editar categoría':'Nueva categoría',body:`<form id="cat-form"><label class="field"><span>Nombre</span><input class="input" name="name" required maxlength="80" value="${esc(c?.name||'')}"></label><label class="field mt-2"><span>Descripción</span><textarea class="textarea" name="description">${esc(c?.description||'')}</textarea></label></form>`,footer:'<button class="btn" data-close>Cancelar</button><button class="btn btn-primary" id="cat-submit">Guardar</button>',onMount:(el,close)=>{$('#cat-submit',el).onclick=async()=>{const f=$('#cat-form',el);if(!f.reportValidity())return;const d=formData(f);try{await change('categories',c?'PATCH':'POST',{name:d.name.trim(),description:d.description.trim(),...(c?{}:{slug:slug(d.name)+'-'+Date.now().toString(36),active:true,sort:categories.length})},c?'?id=eq.'+c.id:'');close();rerender();toast('Categoría guardada');}catch(e){toast(e.message,'error');}};}});
  }
  function ordersPage(){
    $('#view').innerHTML=orders.length?table(['Código','Cliente','Total','Estado','Pago','Fecha','Opciones'],orders.map(o=>`<tr><td class="cell-main">${esc(o.code)}</td><td>${esc(o.customer_name)}</td><td>${money(o.total)}</td><td><span class="badge">${esc(o.status)}</span></td><td>${esc(o.payment_status)}</td><td>${fmtDate(o.created_at)}</td><td><button class="btn btn-sm" data-order="${o.id}">Actualizar estado</button></td></tr>`)):empty('Sin pedidos','No se importaron pedidos inventados.');
    $('#view').onclick=e=>{const b=e.target.closest('[data-order]');if(b)orderStatus(orders.find(o=>o.id===Number(b.dataset.order)));};
  }
  function orderStatus(o){
    const statuses=['pendiente','confirmado','preparando','enviado','entregado','cancelado'];
    modal({title:'Estado del pedido '+o.code,body:`<label class="field"><span>Estado</span><select class="select" id="order-status">${statuses.map(s=>`<option value="${s}" ${s===o.status?'selected':''}>${s}</option>`).join('')}</select></label>`,footer:'<button class="btn" data-close>Cancelar</button><button class="btn btn-primary" id="order-save">Guardar estado</button>',onMount:(el,close)=>{$('#order-save',el).onclick=async()=>{try{await change('orders','PATCH',{status:$('#order-status',el).value},'?id=eq.'+o.id);close();rerender();toast('Pedido actualizado');}catch(e){toast(e.message,'error');}};}});
  }
  function customersPage(){
    $('#view').innerHTML=customers.length?table(['Cliente','Teléfono','Ciudad','Fecha'],customers.map(c=>`<tr><td>${esc(c.name||'Cliente registrado')}</td><td>${esc(c.phone||'—')}</td><td>${esc(c.city||'—')}</td><td>${fmtDate(c.created_at)}</td></tr>`)):empty('Sin clientes','No se importaron usuarios de demostración.');
  }
  function couponsPage(){
    $('#view').innerHTML=`<div class="toolbar"><div class="spacer"></div>${actions('Crear cupón','add-coupon')}</div>`+(coupons.length?table(['Código','Descuento','Límite','Estado'],coupons.map(c=>`<tr><td>${esc(c.code)}</td><td>${c.type==='percent'?Number(c.value)+'%':money(c.value)}</td><td>${c.max_uses??'Ilimitado'}</td><td>${c.active?'Activo':'Inactivo'}</td></tr>`)):empty('Sin cupones','Crea promociones únicamente cuando sean reales.'));
    $('#view').onclick=e=>{if(e.target.closest('[data-action=add-coupon]'))couponForm();};
  }
  function couponForm(){
    modal({title:'Nuevo cupón',body:`<form id="coupon-form"><label class="field"><span>Código</span><input class="input" name="code" maxlength="30" required></label><label class="field mt-2"><span>Tipo</span><select class="select" name="type"><option value="percent">Porcentaje</option><option value="fixed">Monto en soles</option></select></label><label class="field mt-2"><span>Valor</span><input class="input" name="value" type="number" min="0.01" step=".01" required></label></form>`,footer:'<button class="btn" data-close>Cancelar</button><button class="btn btn-primary" id="coupon-save">Crear</button>',onMount:(el,close)=>{$('#coupon-save',el).onclick=async()=>{const f=$('#coupon-form',el);if(!f.reportValidity())return;const d=formData(f);if(d.type==='percent'&&Number(d.value)>100){toast('Porcentaje no válido','error');return;}try{await change('coupons','POST',{code:d.code.trim().toUpperCase(),type:d.type,value:Number(d.value),active:true});close();rerender();toast('Cupón creado');}catch(e){toast(e.message,'error');}};}});
  }
  function promosPage(){
    $('#view').innerHTML=`<div class="toolbar"><div class="spacer"></div>${actions('Nueva campaña','add-promo')}</div>`+(campaigns.length?table(['Campaña','Título','Vigencia','Estado'],campaigns.map(c=>`<tr><td>${esc(c.name)}</td><td>${esc(c.title)}</td><td>${fmtDate(c.starts_at)} – ${fmtDate(c.ends_at)}</td><td>${c.active?'Activa':'Inactiva'}</td></tr>`)):empty('Sin campañas','No se muestran descuentos que no existan.'));
    $('#view').onclick=e=>{if(e.target.closest('[data-action=add-promo]'))promoForm();};
  }
  function promoForm(){
    modal({title:'Nueva campaña',body:`<form id="promo-form" class="settings-grid"><label class="field"><span>Identificador</span><input class="input" name="name" required></label><label class="field"><span>Título visible</span><input class="input" name="title" required></label><label class="field"><span>Inicio (fecha y hora)</span><input class="input" type="datetime-local" name="starts_at" required></label><label class="field"><span>Final</span><input class="input" type="datetime-local" name="ends_at" required></label><label class="field"><span>Descuento real (%)</span><input class="input" name="discount_value" type="number" min="0" max="90" step=".1" value="0"></label></form>`,footer:'<button class="btn" data-close>Cancelar</button><button class="btn btn-primary" id="promo-save">Guardar</button>',onMount:(el,close)=>{$('#promo-save',el).onclick=async()=>{const f=$('#promo-form',el);if(!f.reportValidity())return;const d=formData(f);if(new Date(d.ends_at)<=new Date(d.starts_at)){toast('El fin debe ser posterior al inicio','error');return;}try{await change('promotions','POST',{name:d.name.trim(),title:d.title.trim(),starts_at:new Date(d.starts_at).toISOString(),ends_at:new Date(d.ends_at).toISOString(),discount_value:Number(d.discount_value||0),active:true});close();rerender();toast('Campaña guardada');}catch(e){toast(e.message,'error');}};}});
  }
  function shippingPage(){
    $('#view').innerHTML=`<div class="toolbar"><div class="spacer"></div>${actions('Añadir método','add-shipping')}</div>`+(shipping.length?table(['Método','Precio','Activo'],shipping.map(s=>`<tr><td>${esc(s.name)}</td><td>${money(s.base_price)}</td><td>${s.active?'Sí':'No'}</td></tr>`)):empty('Sin métodos de envío','Configura solo los envíos que realmente ofreces.'));
    $('#view').onclick=e=>{if(e.target.closest('[data-action=add-shipping]'))shippingForm();};
  }
  function shippingForm(){
    modal({title:'Nuevo método de envío',body:`<form id="ship-form"><label class="field"><span>Nombre</span><input class="input" name="name" required maxlength="100"></label><label class="field mt-2"><span>Precio base (S/)</span><input class="input" name="base_price" type="number" min="0" step=".01" value="0" required></label><label class="field mt-2"><span>Descripción</span><input class="input" name="description" maxlength="300"></label></form>`,footer:'<button class="btn" data-close>Cancelar</button><button class="btn btn-primary" id="ship-save">Crear</button>',onMount:(el,close)=>{$('#ship-save',el).onclick=async()=>{const f=$('#ship-form',el);if(!f.reportValidity())return;const d=formData(f);try{await change('shipping_methods','POST',{name:d.name.trim(),description:d.description.trim(),base_price:Number(d.base_price),active:true,sort:shipping.length,type:'custom'});close();rerender();toast('Método de envío creado');}catch(e){toast(e.message,'error');}};}});
  }
  function complaintsPage(){ $('#view').innerHTML=`<div class="card card-pad"><h3>Libro de reclamaciones</h3><p class="muted mt-2">El registro digital anterior está desactivado tras migrar los datos. El módulo requiere conexión y validación legal antes de usarse.</p></div>`; }
  function settingsPage(){
    $('#view').innerHTML=`<div class="settings-grid">
    <section class="card settings-sec"><div><h3>Identidad</h3><p>Nombre y descripción de tu marca.</p></div><form id="settings-form"><label class="field"><span>Nombre comercial</span><input class="input" name="store_name" maxlength="100" value="${esc(settings.store_name||'LubizJeans')}"></label><label class="field mt-2"><span>Eslogan</span><input class="input" name="store_tagline" maxlength="200" value="${esc(settings.store_tagline||'Denim sin reglas')}"></label><label class="field mt-2"><span>WhatsApp (código de país)</span><input class="input" name="whatsapp" inputmode="tel" value="${esc(settings.whatsapp||'')}"></label><label class="field mt-2"><span>Instagram (URL HTTPS)</span><input class="input" name="instagram" value="${esc(settings.instagram||'')}"></label><label class="field mt-2"><span>Dirección real</span><input class="input" name="address" value="${esc(settings.address||'')}"></label><button type="submit" class="btn btn-primary mt-3">${icon('check')} Guardar cambios</button></form></section></div>`;
    $('#settings-form').onsubmit=async e=>{e.preventDefault();const d=formData(e.target);const phone=String(d.whatsapp||'').replace(/\D/g,'');if(phone&&(phone.length<10||phone.length>15)){toast('WhatsApp debe tener entre 10 y 15 cifras','error');return;}if(d.instagram && !/^https:\/\/(www\.)?instagram\.com\//i.test(d.instagram)){toast('La URL de Instagram debe ser https://instagram.com/...','error');return;}const updated={store_name:d.store_name.trim(),store_tagline:d.store_tagline.trim(),whatsapp:phone,instagram:d.instagram.trim(),address:d.address.trim()};try{await api('/rest/v1/settings?on_conflict=key',{method:'POST',body:Object.entries(updated).map(([key,value])=>({key,value})),headers:{Prefer:'resolution=merge-duplicates,return=minimal'}});await load();renderCurrent();toast('Configuración guardada');}catch(err){toast(err.message,'error');}};
  }
  async function init(){
    try{session=JSON.parse(sessionStorage.getItem(STORE_KEY)||'null');}catch{saved(null)}
    if(session){if(await authenticate())return showDashboard();if(await refresh()&&await authenticate())return showDashboard();saved(null);}
    renderLogin();
  }
  init();
})();