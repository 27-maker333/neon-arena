/* ==================================================================
 * Editor de imágenes del panel (sin librerías externas)
 * Recortar con proporción, zoom, mover, rotar, voltear, brillo,
 * contraste y saturación. Exporta WEBP/JPG (o PNG con transparencia).
 * ================================================================== */
(function (global) {
  'use strict';
  const { icon, esc, modal, toast } = UI;

  const ASPECTS = [
    { id: '1', label: '1:1', title: 'Cuadrado (productos)', v: 1 },
    { id: '4/3', label: '4:3', title: 'Horizontal 4:3', v: 4 / 3 },
    { id: '16/9', label: '16:9', title: 'Panorámico 16:9', v: 16 / 9 },
    { id: '16/6', label: 'Banner', title: 'Banner 16:6 (campañas)', v: 16 / 6 },
    { id: 'free', label: 'Original', title: 'Sin recorte', v: null },
  ];
  const MAX_OUT = 1600;

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      let url = null;
      img.decoding = 'async';
      img.onload = () => resolve({ img, revoke: () => url && URL.revokeObjectURL(url) });
      img.onerror = () => { if (url) URL.revokeObjectURL(url); reject(new Error('No se pudo abrir la imagen')); };
      if (src instanceof Blob) { url = URL.createObjectURL(src); img.src = url; } else img.src = src;
    });
  }

  let webpOk = null;
  function outputType(transparent) {
    if (transparent) return { type: 'image/png', ext: 'png', q: undefined };
    if (webpOk === null) {
      try { webpOk = document.createElement('canvas').toDataURL('image/webp').startsWith('data:image/webp'); } catch { webpOk = false; }
    }
    return webpOk ? { type: 'image/webp', ext: 'webp', q: 0.88 } : { type: 'image/jpeg', ext: 'jpg', q: 0.9 };
  }

  function toBlob(canvas, type, q) {
    return new Promise((resolve, reject) => {
      try { canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('No se pudo generar la imagen'))), type, q); }
      catch { reject(new Error('Esta imagen no se puede editar (origen externo)')); }
    });
  }

  /** Reduce una imagen grande sin recortarla (para subidas múltiples). */
  async function resize(file, max = MAX_OUT) {
    if (!(file instanceof Blob) || /gif|svg/.test(file.type)) return file;
    const { img, revoke } = await loadImage(file);
    try {
      const w = img.naturalWidth; const h = img.naturalHeight;
      const f = Math.min(1, max / Math.max(w, h));
      if (f === 1 && file.size < 900 * 1024) return file;
      const c = document.createElement('canvas');
      c.width = Math.round(w * f); c.height = Math.round(h * f);
      const ctx = c.getContext('2d');
      const transparent = file.type === 'image/png';
      if (!transparent) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); }
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, c.width, c.height);
      const o = outputType(transparent);
      return await toBlob(c, o.type, o.q);
    } finally { revoke(); }
  }

  async function upload(api, blob) {
    const fd = new FormData();
    const ext = (blob.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg').replace('svg+xml', 'svg');
    fd.append('image', blob, `imagen.${ext}`);
    return (await api.post('/api/admin/upload', fd)).url;
  }

  /**
   * Abre el editor. Devuelve una promesa con el Blob resultante o null si se cancela.
   * @param {object} o { src: File|Blob|string, aspect: '1'|'16/6'|'free'|..., transparent: bool, title }
   */
  async function open(o = {}) {
    let loaded;
    try { loaded = await loadImage(o.src); } catch (err) { toast(err.message, 'error'); return null; }
    const { img, revoke } = loaded;
    const iw = img.naturalWidth || 800;
    const ih = img.naturalHeight || 800;
    const st = {
      aspect: ASPECTS.find((a) => a.id === (o.aspect || '1')) || ASPECTS[0],
      rot: 0, flip: false, zoom: 1, ox: 0, oy: 0, b: 100, c: 100, s: 100,
      transparent: !!o.transparent,
    };

    return new Promise((resolve) => {
      let finished = false;
      const done = (val) => { if (finished) return; finished = true; revoke(); resolve(val); };

      const m = modal({
        title: o.title || 'Editar imagen', size: 'lg',
        body: `<div class="ie">
          <div class="ie-stage"><div class="ie-canvas-wrap ${st.transparent ? 'checker' : ''}"><canvas class="ie-canvas" aria-label="Vista previa"></canvas></div>
            <p class="muted small ie-hint">${icon('info', 'icon-sm')} Arrastra para encuadrar · usa la rueda del mouse o el control para acercar</p></div>
          <div class="ie-controls">
            <div><span class="label">Recorte</span><div class="seg ie-aspects">${ASPECTS.map((a) => `<button type="button" data-aspect="${a.id}" title="${esc(a.title)}">${esc(a.label)}</button>`).join('')}</div></div>
            <label class="ie-range"><span class="label">Zoom</span><input type="range" min="1" max="4" step="0.01" value="1" data-k="zoom"></label>
            <div><span class="label">Girar y voltear</span><div class="flex mt-1">
              <button class="btn btn-sm" type="button" data-act="rotl" title="Girar a la izquierda">${icon('refresh', 'icon-sm')} −90°</button>
              <button class="btn btn-sm" type="button" data-act="rotr" title="Girar a la derecha">${icon('refresh', 'icon-sm')} +90°</button>
              <button class="btn btn-sm" type="button" data-act="flip" title="Voltear horizontal">⇋ Voltear</button></div></div>
            <label class="ie-range"><span class="label">Brillo <b data-out="b">100%</b></span><input type="range" min="50" max="150" value="100" data-k="b"></label>
            <label class="ie-range"><span class="label">Contraste <b data-out="c">100%</b></span><input type="range" min="50" max="150" value="100" data-k="c"></label>
            <label class="ie-range"><span class="label">Saturación <b data-out="s">100%</b></span><input type="range" min="0" max="200" value="100" data-k="s"></label>
            <label class="check small"><input type="checkbox" data-k="transparent" ${st.transparent ? 'checked' : ''}> Conservar transparencia (PNG, ideal para logos)</label>
            <button class="btn btn-ghost btn-sm" type="button" data-act="reset" style="align-self:flex-start">Restablecer</button>
          </div>
        </div>`,
        footer: `<span class="muted small grow ie-size"></span><button class="btn" type="button" data-close>Cancelar</button><button class="btn btn-primary" type="button" data-act="save" data-loading="Procesando…">${icon('check')} Usar imagen</button>`,
      });
      const el = m.el;
      const canvas = el.querySelector('.ie-canvas');
      const wrap = el.querySelector('.ie-canvas-wrap');
      const ctx = canvas.getContext('2d');
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      let W = 0; let H = 0;

      const rotated = () => (st.rot % 180 === 0 ? [iw, ih] : [ih, iw]);
      const ratio = () => { if (st.aspect.v) return st.aspect.v; const [rw, rh] = rotated(); return rw / rh; };
      const coverScale = (w, h) => { const [rw, rh] = rotated(); return Math.max(w / rw, h / rh); };

      function layout() {
        const maxW = Math.min(wrap.parentElement.clientWidth || 520, 560);
        const maxH = Math.min(420, window.innerHeight * 0.5);
        const r = ratio();
        W = maxW; H = W / r;
        if (H > maxH) { H = maxH; W = H * r; }
        W = Math.round(W); H = Math.round(H);
        canvas.style.width = `${W}px`; canvas.style.height = `${H}px`;
        canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
        clamp(); draw();
      }
      function clamp() {
        const [rw, rh] = rotated();
        const s = coverScale(W, H) * st.zoom;
        const mx = Math.max(0, (rw * s - W) / 2);
        const my = Math.max(0, (rh * s - H) / 2);
        st.ox = Math.max(-mx, Math.min(mx, st.ox));
        st.oy = Math.max(-my, Math.min(my, st.oy));
      }
      function paint(c2, w, h, k, forExport) {
        c2.save();
        c2.clearRect(0, 0, w, h);
        if (!st.transparent) { c2.fillStyle = '#ffffff'; c2.fillRect(0, 0, w, h); }
        const s = coverScale(w, h) * st.zoom;
        if ('filter' in c2) c2.filter = `brightness(${st.b}%) contrast(${st.c}%) saturate(${st.s}%)`;
        c2.imageSmoothingQuality = 'high';
        c2.translate(w / 2 + st.ox * k, h / 2 + st.oy * k);
        c2.rotate((st.rot * Math.PI) / 180);
        c2.scale(st.flip ? -1 : 1, 1);
        c2.drawImage(img, (-iw * s) / 2, (-ih * s) / 2, iw * s, ih * s);
        c2.restore();
        void forExport;
      }
      function exportSize() {
        const s = coverScale(W, H) * st.zoom;
        let natW = W / s; let natH = H / s;
        const f = Math.min(1, MAX_OUT / Math.max(natW, natH));
        natW = Math.max(1, Math.round(natW * f)); natH = Math.max(1, Math.round(natH * f));
        return [natW, natH];
      }
      function draw() {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        paint(ctx, W, H, 1, false);
        const [ow, oh] = exportSize();
        el.querySelector('.ie-size').textContent = `Resultado: ${ow} × ${oh} px`;
      }
      function syncUi() {
        el.querySelectorAll('[data-aspect]').forEach((b) => b.classList.toggle('active', b.dataset.aspect === st.aspect.id));
        el.querySelector('[data-k=zoom]').value = st.zoom;
        ['b', 'c', 's'].forEach((k) => { el.querySelector(`[data-k=${k}]`).value = st[k]; el.querySelector(`[data-out=${k}]`).textContent = `${st[k]}%`; });
      }

      el.querySelectorAll('[data-aspect]').forEach((b) => b.addEventListener('click', () => {
        st.aspect = ASPECTS.find((a) => a.id === b.dataset.aspect); st.ox = 0; st.oy = 0; syncUi(); layout();
      }));
      el.querySelectorAll('input[type=range]').forEach((r) => r.addEventListener('input', () => {
        st[r.dataset.k] = Number(r.value);
        if (r.dataset.k !== 'zoom') el.querySelector(`[data-out=${r.dataset.k}]`).textContent = `${r.value}%`;
        clamp(); draw();
      }));
      el.querySelector('[data-k=transparent]').addEventListener('change', (e) => {
        st.transparent = e.target.checked; wrap.classList.toggle('checker', st.transparent); draw();
      });
      el.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', async () => {
        const a = b.dataset.act;
        if (a === 'rotl') { st.rot = (st.rot + 270) % 360; st.ox = 0; st.oy = 0; layout(); }
        if (a === 'rotr') { st.rot = (st.rot + 90) % 360; st.ox = 0; st.oy = 0; layout(); }
        if (a === 'flip') { st.flip = !st.flip; draw(); }
        if (a === 'reset') { Object.assign(st, { rot: 0, flip: false, zoom: 1, ox: 0, oy: 0, b: 100, c: 100, s: 100 }); syncUi(); layout(); }
        if (a === 'save') {
          b.disabled = true;
          try {
            const [ow, oh] = exportSize();
            const out = document.createElement('canvas');
            out.width = ow; out.height = oh;
            paint(out.getContext('2d'), ow, oh, ow / W, true);
            const t = outputType(st.transparent);
            const blob = await toBlob(out, t.type, t.q);
            done(blob); m.close();
          } catch (err) { toast(err.message, 'error'); b.disabled = false; }
        }
      }));

      // Arrastrar para mover
      let drag = null;
      canvas.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, ox: st.ox, oy: st.oy }; canvas.setPointerCapture(e.pointerId); canvas.classList.add('dragging'); });
      canvas.addEventListener('pointermove', (e) => { if (!drag) return; st.ox = drag.ox + (e.clientX - drag.x); st.oy = drag.oy + (e.clientY - drag.y); clamp(); draw(); });
      const end = () => { drag = null; canvas.classList.remove('dragging'); };
      canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end);
      canvas.addEventListener('wheel', (e) => { e.preventDefault(); st.zoom = Math.max(1, Math.min(4, st.zoom * (e.deltaY < 0 ? 1.06 : 0.94))); clamp(); syncUi(); draw(); }, { passive: false });

      const obs = new MutationObserver(() => { if (!document.body.contains(el)) { obs.disconnect(); window.removeEventListener('resize', layout); done(null); } });
      obs.observe(document.body, { childList: true });
      window.addEventListener('resize', layout);
      syncUi();
      requestAnimationFrame(layout);
    });
  }

  global.ImageEditor = { open, resize, upload, ASPECTS };
})(window);
