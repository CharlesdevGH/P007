'use strict';
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => '&#' + c.charCodeAt(0) + ';');
const money = n => 'S/ ' + Number(n).toFixed(2);
const thumb = id => 'https://drive.google.com/thumbnail?id=' + id + '&sz=w400';
const ICON = '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"><rect x="6" y="8" width="36" height="32" rx="7"/><circle cx="32" cy="19" r="3.5"/><path d="M7 35l11-11 8 8 5-5 10 10"/></svg>';
const CATALOGO_PRECIO = true; // false = catálogo solo con imagen y nombre
const TAG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"><path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.2"/></svg>';
const EST = [{ v: '', l: 'Todos' }, { v: 'd', l: 'Disponibles' }, { v: 'a', l: 'Agotados' }];
const S = { tok: '', nombre: '', in: false, prod: [], tags: [], pend: {}, ft: '', fe: '' };
let first = false; // primer ingreso: cambio de PIN obligatorio

/* ---------- Utilidades ---------- */
function toast(m) { const t = $('#toast'); t.textContent = m; t.className = 'show'; setTimeout(() => t.className = '', 2600); }
const touch = () => localStorage.setItem('inv_s', JSON.stringify({ tok: S.tok, nombre: S.nombre, t: Date.now() })); // sesión de 1 h
function logout() { localStorage.removeItem('inv_s'); location.reload(); }
// POST como text/plain para evitar preflight CORS con Apps Script
async function api(action, data = {}) {
  try {
    const r = await fetch(API, { method: 'POST', body: JSON.stringify({ action, token: S.tok, ...data }) });
    const j = await r.json();
    if (!j.ok) throw new Error(j.error);
    if (j.prod) { // las acciones devuelven la lista actualizada: 1 sola petición
      S.prod = j.prod; S.tags = j.tags;
      if (action === 'stock') S.pend = {};
      Object.keys(S.pend).forEach(k => S.prod.some(p => p.id === k) || delete S.pend[k]);
    }
    if (S.in) touch();
    return j;
  } catch (e) {
    toast(e.message === 'Failed to fetch' ? 'Sin conexión con el servidor' : e.message);
    if (e.message === 'Sesión expirada') setTimeout(logout, 1200);
    throw e;
  }
}
const onlyDigits = (el, max) => el.addEventListener('input', () => el.value = el.value.replace(/\D/g, '').slice(0, max));
/* Recorte cuadrado: arrastrar para mover y deslizar para acercar. Devuelve JPEG 800px en base64 */
function cropper(file) {
  return new Promise(res => {
    const d = $('#pk'), img = new Image(), V = 240;
    img.onerror = () => { toast('Imagen no válida'); res(); };
    img.onload = () => {
      const base = V / Math.min(img.width, img.height);
      let z = 1, ox = (V - img.width * base) / 2, oy = (V - img.height * base) / 2, px = null, py;
      d.innerHTML = `<h3>Recortar imagen</h3><div class="crop" id="cv"><img id="ci" alt="" draggable="false" src="${img.src}"></div><input type="range" id="zm" min="1" max="3" step="0.01" value="1" aria-label="Zoom"><div class="row"><button type="button" class="ghost" id="no">Cancelar</button><button type="button" class="btn" id="si">Usar</button></div>`;
      const el = $('#ci'), cv = $('#cv'), draw = () => {
        const w = img.width * base * z, h = img.height * base * z;
        ox = Math.min(0, Math.max(V - w, ox)); oy = Math.min(0, Math.max(V - h, oy)); // la imagen siempre cubre el cuadro
        Object.assign(el.style, { width: w + 'px', height: h + 'px', left: ox + 'px', top: oy + 'px' });
      };
      draw();
      $('#zm').oninput = e => { // zoom hacia el centro
        const s0 = base * z, cx = (V / 2 - ox) / s0, cy = (V / 2 - oy) / s0;
        z = +e.target.value; ox = V / 2 - cx * base * z; oy = V / 2 - cy * base * z; draw();
      };
      cv.onpointerdown = e => { cv.setPointerCapture(e.pointerId); px = e.clientX; py = e.clientY; };
      cv.onpointermove = e => { if (px === null) return; ox += e.clientX - px; oy += e.clientY - py; px = e.clientX; py = e.clientY; draw(); };
      cv.onpointerup = cv.onpointercancel = () => px = null;
      $('#no').onclick = () => { res(); d.close(); };
      $('#si').onclick = () => {
        const k = base * z, c = document.createElement('canvas'); c.width = c.height = 800;
        c.getContext('2d').drawImage(img, -ox / k, -oy / k, V / k, V / k, 0, 0, 800, 800);
        res(c.toDataURL('image/jpeg', .85).split(',')[1]); d.close();
      };
      d.oncancel = () => res();
      d.showModal();
    };
    img.src = URL.createObjectURL(file);
  });
}

/* ---------- Selector flotante (radio buttons, se cierra al elegir) ---------- */
function pick(title, opts, val, { grid = false, extra = '' } = {}) {
  const d = $('#pk');
  d.innerHTML = `<h3>${title}</h3><div class="opts${grid ? ' g' : ''}">${opts.map(o => `<label class="opt"><input type="radio" name="o" value="${esc(o.v)}"${String(o.v) === String(val) ? ' checked' : ''}><span>${esc(o.l)}</span><i></i></label>`).join('')}</div>${extra}<button type="button" class="ghost" id="xp">Cancelar</button>`;
  return new Promise(res => {
    let done = false;
    const end = v => { if (!done) { done = true; res(v); d.close(); } };
    d.querySelectorAll('input[type=radio]').forEach(i => i.onclick = () => end(i.value));
    $('#xp').onclick = () => end();
    d.oncancel = () => { done = true; res(); };
    if ($('#ok')) { onlyDigits($('#oc'), 6); $('#ok').onclick = () => { if ($('#oc').value !== '') end($('#oc').value); }; }
    d.showModal();
    const c = d.querySelector('input:checked'); if (c) c.closest('label').scrollIntoView({ block: 'center' });
  });
}
/* Confirmación (o texto) en panel flotante: devuelve true / el texto, o undefined si se cancela */
function ask(title, msg, ok = 'Eliminar', val) {
  const d = $('#pk');
  d.innerHTML = `<h3>${esc(title)}</h3><p class="mut">${esc(msg)}</p>${val !== undefined ? `<input id="av" maxlength="30" value="${esc(val)}">` : ''}<div class="row"><button type="button" class="ghost" id="no">Cancelar</button><button type="button" class="btn" id="si">${ok}</button></div>`;
  return new Promise(res => {
    let done = false;
    const end = v => { if (!done) { done = true; res(v); d.close(); } };
    $('#no').onclick = () => end();
    $('#si').onclick = () => end(val !== undefined ? $('#av').value.trim() : true);
    d.oncancel = () => { done = true; res(); };
    d.showModal();
  });
}

/* ---------- Login, PIN y sesión ---------- */
onlyDigits($('#pin'), 4); onlyDigits($('#pin2'), 4);
document.addEventListener('keydown', e => { if (e.key === 'Enter' && !$('#login').hidden) $('#go').click(); });
$('#go').onclick = async () => {
  const p = $('#pin').value;
  if (first) {
    if (p.length !== 4) return toast('El PIN debe tener 4 dígitos');
    if (p !== $('#pin2').value) return toast('Los PIN no coinciden');
    if (p === '0000') return toast('Elige un PIN distinto al inicial');
    await api('setPin', { newPin: p }); return enter();
  }
  const nombre = $('#nom').value.trim();
  if (!nombre || p.length !== 4) return toast('Escribe tu usuario y tu PIN de 4 dígitos');
  const r = await api('login', { nombre, pin: p }).catch(() => null);
  if (!r) return;
  S.tok = r.token; S.nombre = r.mostrar || r.nombre;
  if (r.mustChange) {
    first = true; $('#loginMsg').textContent = 'Primer ingreso: crea tu PIN personal';
    $('#nom').hidden = true; $('#pin').value = ''; $('#pin').placeholder = 'NUEVO PIN'; $('#pin').classList.add('lbl'); $('#pin2').hidden = false; $('#go').textContent = 'Guardar PIN';
  } else enter();
};
async function enter() {
  S.in = true; touch(); $('#login').hidden = true; $('#main').hidden = false; $('#who').innerHTML = '<small>Bienvenido</small>' + esc(S.nombre);
  await api('list'); render();
}
$('#bOut').onclick = logout;
const sv = JSON.parse(localStorage.getItem('inv_s') || 'null');
if (sv && Date.now() - sv.t < 3600e3) { S.tok = sv.tok; S.nombre = sv.nombre; enter(); }

/* ---------- Lista, filtros y stock rápido ---------- */
function render() {
  if (!S.tags.some(t => t.id === S.ft)) S.ft = '';
  $('#fTag').textContent = (S.tags.find(t => t.id === S.ft) || {}).nombre || 'Todas las etiquetas';
  $('#fEst').textContent = EST.find(o => o.v === S.fe).l;
  const q = $('#q').value.toLowerCase();
  const list = S.prod.filter(p => {
    const st = p.stock + (S.pend[p.id] || 0);
    return p.nombre.toLowerCase().includes(q) && (!S.ft || p.etiqueta === S.ft) && (!S.fe || (S.fe === 'd') === (st > 0));
  });
  $('#grid').innerHTML = list.map(p => {
    const d = S.pend[p.id] || 0, st = p.stock + d, t = S.tags.find(x => x.id === p.etiqueta);
    return `<article class="card${st < 1 ? ' out' : ''}">
      <div class="im">${p.imagen ? `<img loading="lazy" alt="" src="${thumb(p.imagen)}">` : ICON}${st < 1 ? '<b class="badge">Agotado</b>' : ''}</div>
      <h3>${esc(p.nombre)}</h3>${t ? `<small class="tag">${esc(t.nombre)}</small>` : ''}
      <p class="pr">${money(p.precio)}</p>
      <div class="qty"><button data-m="${p.id}" aria-label="Restar">−</button><span class="${d ? 'chg' : ''}">${st}</span><button data-p="${p.id}" aria-label="Sumar">+</button></div>
      <button class="ghost" data-e="${p.id}">Editar</button></article>`;
  }).join('') || '<p class="mut">No hay productos. Toca + para crear el primero.</p>';
  const n = Object.keys(S.pend).length;
  $('#saveBar').hidden = !n; $('#pend').textContent = n + ' cambio(s) sin guardar';
}
$('#grid').onclick = e => {
  const b = e.target.closest('button'); if (!b) return;
  const D = b.dataset;
  if (D.e) return form(S.prod.find(p => p.id === D.e));
  const id = D.m || D.p, p = S.prod.find(x => x.id === id), d = (S.pend[id] || 0) + (D.p ? 1 : -1);
  if (p.stock + d < 0) return;
  d ? S.pend[id] = d : delete S.pend[id]; render();
};
$('#undo').onclick = () => { S.pend = {}; render(); };
$('#save').onclick = async () => {
  await api('stock', { changes: Object.entries(S.pend).map(([id, delta]) => ({ id, delta })) });
  render(); toast('Stock guardado');
};
$('#q').oninput = render;
$('#fTag').onclick = async () => { const v = await pick('Filtrar por etiqueta', [{ v: '', l: 'Todas las etiquetas' }, ...S.tags.map(t => ({ v: t.id, l: t.nombre }))], S.ft); if (v !== undefined) { S.ft = v; render(); } };
$('#fEst').onclick = async () => { const v = await pick('Filtrar por estado', EST, S.fe); if (v !== undefined) { S.fe = v; render(); } };
$('#dlg').onclick = e => { if (e.target.id === 'x') $('#dlg').close(); };

/* ---------- Crear / editar producto ---------- */
$('#add').onclick = () => form();
function form(p = {}) {
  const d = $('#dlg'), F = { stock: p.stock ?? '', etiqueta: p.etiqueta || '', img: '' };
  d.innerHTML = `<form id="f" autocomplete="off"><h3>${p.id ? 'Editar' : 'Nuevo'} producto</h3>
    <label class="photo" for="fi"><div id="pv">${p.imagen ? `<img alt="" src="${thumb(p.imagen)}">` : ICON + '<small>Agregar imagen</small>'}</div></label>
    <input type="file" id="fi" accept="image/*" hidden>
    <input name="nombre" autocomplete="off" placeholder="Nombre del producto" maxlength="80" required value="${esc(p.nombre)}">
    <div class="row"><button type="button" class="fld" id="bs"></button>
      <div class="fld money"><span>S/</span><input name="precio" placeholder="Precio" inputmode="decimal" autocomplete="off" value="${p.precio != null ? Number(p.precio).toFixed(2) : ''}"></div></div>
    <button type="button" class="fld" id="bt"></button>
    <div class="row">${p.id ? '<button type="button" class="ghost" id="del">Eliminar</button>' : ''}<button type="button" class="ghost" id="x">Cerrar</button><button class="btn">Guardar</button></div></form>`;
  const f = $('#f'), sync = () => {
    $('#bs').textContent = F.stock === '' ? 'Stock' : 'Stock: ' + F.stock; $('#bs').classList.toggle('empty', F.stock === '');
    $('#bt').textContent = (S.tags.find(t => t.id === F.etiqueta) || {}).nombre || 'Etiqueta (opcional)'; $('#bt').classList.toggle('empty', !F.etiqueta);
  };
  sync();
  $('#fi').onchange = async e => {
    const file = e.target.files[0]; e.target.value = ''; if (!file) return;
    const b = await cropper(file); if (!b) return;
    F.img = b; $('#pv').innerHTML = `<img alt="" src="data:image/jpeg;base64,${b}">`;
  };
  $('#bs').onclick = async () => {
    const v = await pick('Stock', Array.from({ length: 20 }, (_, i) => ({ v: i + 1, l: i + 1 })), F.stock,
      { extra: '<div class="row"><input id="oc" inputmode="numeric" autocomplete="off" placeholder="Otra cantidad"><button type="button" class="btn" id="ok">Usar</button></div>' });
    if (v !== undefined) { F.stock = +v; sync(); }
  };
  $('#bt').onclick = async () => {
    const v = await pick('Etiqueta', [{ v: '', l: 'Sin etiqueta' }, ...S.tags.map(t => ({ v: t.id, l: t.nombre }))], F.etiqueta);
    if (v !== undefined) { F.etiqueta = v; sync(); }
  };
  f.precio.addEventListener('input', () => f.precio.value = f.precio.value.replace(',', '.').replace(/[^\d.]/g, '').match(/^\d*\.?\d{0,2}/)[0]);
  f.precio.addEventListener('blur', () => { const n = parseFloat(f.precio.value); f.precio.value = isNaN(n) ? '' : n.toFixed(2); }); // 10 → 10.00
  if (p.id) $('#del').onclick = async () => {
    if (!await ask('Eliminar producto', '¿Eliminar "' + p.nombre + '"? Esta acción no se puede deshacer.')) return;
    await api('deleteProduct', { id: p.id }); d.close(); render();
  };
  f.onsubmit = async ev => {
    ev.preventDefault();
    const precio = parseFloat(f.precio.value), b = f.querySelector('.btn');
    if (!f.nombre.value.trim()) return toast('Escribe el nombre del producto');
    if (F.stock === '') return toast('Elige el stock');
    if (isNaN(precio)) return toast('Escribe el precio');
    b.disabled = true; b.textContent = 'Guardando…';
    try {
      await api('saveProduct', { p: { id: p.id || '', nombre: f.nombre.value.trim(), stock: F.stock, precio, etiqueta: F.etiqueta, imagen: p.imagen || '' }, img: F.img });
      d.close(); render();
    } catch (e) { b.disabled = false; b.textContent = 'Guardar'; }
  };
  d.open || d.showModal();
}

/* ---------- Etiquetas ---------- */
$('#bTags').onclick = tagsUI;
function tagsUI() {
  const d = $('#dlg');
  d.innerHTML = `<h3>Mis etiquetas</h3><ul class="tl">${S.tags.length ? '' : '<li class="mut">Aún no tienes etiquetas.</li>'}${S.tags.map(t => `<li><b class="tg">${TAG}</b><em>${esc(t.nombre)}</em><span><button class="ghost" data-r="${t.id}" aria-label="Renombrar">✎</button> <button class="ghost" data-d="${t.id}" aria-label="Eliminar">🗑</button></span></li>`).join('')}</ul>
    <div class="row"><input id="nt" placeholder="Nueva etiqueta" maxlength="30"><button class="btn" id="at">Añadir</button></div><button class="ghost" id="x">Cerrar</button>`;
  const done = () => { render(); tagsUI(); };
  $('#at').onclick = async () => { const n = $('#nt').value.trim(); if (n) { await api('saveTag', { t: { id: '', nombre: n } }); done(); } };
  d.querySelectorAll('[data-r]').forEach(b => b.onclick = async () => {
    const n = await ask('Renombrar etiqueta', 'Escribe el nuevo nombre.', 'Guardar', S.tags.find(t => t.id === b.dataset.r).nombre);
    if (n) { await api('saveTag', { t: { id: b.dataset.r, nombre: n } }); done(); }
  });
  d.querySelectorAll('[data-d]').forEach(b => b.onclick = async () => {
    if (await ask('Eliminar etiqueta', 'Los productos con esta etiqueta quedarán sin etiqueta.')) { await api('deleteTag', { id: b.dataset.d }); done(); }
  });
  d.open || d.showModal();
}

/* ---------- Catálogo PDF (todo el inventario: solo imagen y nombre) ---------- */
const crop = src => new Promise(res => { // cuadrado centrado con esquinas redondeadas, 450px
  const i = new Image();
  i.onload = () => {
    const m = Math.min(i.width, i.height), c = document.createElement('canvas'), x = c.getContext('2d'); c.width = c.height = 450;
    x.fillStyle = '#fff'; x.fillRect(0, 0, 450, 450); x.beginPath(); x.roundRect(0, 0, 450, 450, 24); x.clip();
    x.drawImage(i, (i.width - m) / 2, (i.height - m) / 2, m, m, 0, 0, 450, 450);
    res(c.toDataURL('image/jpeg', .85));
  };
  i.onerror = () => res(''); i.src = src;
});
$('#bPdf').onclick = async () => {
  toast('Generando catálogo…');
  const r = await api('catalogo'), doc = new window.jspdf.jsPDF(), W = 56, G = 7, M = 14, P = 78, Y0 = 48;
  const fecha = new Date().toLocaleDateString('es-PE', { day: 'numeric', month: 'long', year: 'numeric' });
  for (let i = 0; i < r.items.length; i++) {
    const it = r.items[i], pr = (S.prod[i] && S.prod[i].nombre === it.nombre ? S.prod[i] : S.prod.find(p => p.nombre === it.nombre)) || {};
    const k = i % 9; if (i && !k) doc.addPage();
    const x = M + (k % 3) * (W + G), y = Y0 + Math.floor(k / 3) * P, im = it.img && await crop(it.img);
    doc.setLineWidth(0.6); doc.setDrawColor(30, 30, 36);
    if (im) doc.addImage(im, 'JPEG', x, y, W, W); else { doc.setFillColor(238, 238, 242); doc.roundedRect(x, y, W, W, 3, 3, 'F'); }
    doc.roundedRect(x, y, W, W, 3, 3, 'S');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); // nombre en etiqueta sobre el borde superior
    let nm = it.nombre; while (doc.getTextWidth(nm) > 42 && nm.length > 1) nm = nm.slice(0, -1);
    if (nm !== it.nombre) nm += '…';
    const pw = doc.getTextWidth(nm) + 12;
    doc.setFillColor(30, 30, 36); doc.roundedRect(x + (W - pw) / 2, y - 4.5, pw, 9, 3, 3, 'F');
    doc.setTextColor(255); doc.text(nm, x + W / 2, y + 1.5, { align: 'center' });
    if (CATALOGO_PRECIO && pr.precio != null) { // precio debajo, centrado
      doc.setDrawColor(205); doc.setLineWidth(0.3); doc.line(x + 3, y + W + 6, x + W - 3, y + W + 6);
      doc.setFontSize(13); doc.setTextColor(255, 107, 0); doc.text(money(pr.precio), x + W / 2, y + W + 13, { align: 'center' });
    }
  }
  const n = doc.getNumberOfPages();
  for (let p = 1; p <= n; p++) { // encabezado y pie en todas las páginas
    doc.setPage(p); doc.setFillColor(20, 21, 26); doc.rect(0, 0, 210, 36, 'F'); doc.setFillColor(255, 107, 0); doc.rect(0, 36, 210, 1.5, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(24); doc.setTextColor(255); doc.text('CATÁLOGO DE PRODUCTOS', 105, 20, { align: 'center' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(180); doc.text(fecha, 105, 29, { align: 'center' });
    doc.setFillColor(20, 21, 26); doc.rect(0, 289, 210, 8, 'F'); doc.setFontSize(8); doc.text('Página ' + p + ' de ' + n, 105, 294, { align: 'center' });
  }
  doc.save('catalogo-' + new Date().toISOString().slice(0, 10) + '.pdf');
};

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
