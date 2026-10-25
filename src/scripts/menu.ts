/* We POS — Kelola menu & kategori. */
import {
  S, D, VIEWS, reg, $, esc, num, fmtMoney, IC, rp, isMgr, openSheet, closeSheet, run, addRow, updRow, delRow, ask, prompt2, emptyBox, toast,
  FOOD_ICONS, shrinkImage,
} from './core';
import { setHeader } from './shell';

VIEWS.menu = () => {
  const mgr = isMgr();
  setHeader('Menu', `<button class="hb" onclick="App.printMenuSheet()">${IC.print}<span>Cetak menu meja</span></button>` + (mgr ? `<button class="hb" onclick="App.catSheet()">${IC.tag}<span>Kategori</span></button><button class="hb pri" onclick="App.itemForm('')">${IC.plus}<span>Menu</span></button>` : ''));
  const q = (S.menuQ || '').toLowerCase();
  const groups = [...D.categories, { id: '', name: 'Tanpa kategori', icon: '📦' }];
  const sold = D.items.filter((i: any) => i.available === false).length;
  $('#main').innerHTML = `<div class="wrap narrow">
   <div class="tbar"><label class="search">${IC.search}<input type="search" placeholder="Cari menu…" value="${esc(S.menuQ || '')}" oninput="App.menuSearch(this.value)"></label></div>
   ${!mgr ? '<div class="alert info">Anda bisa menandai menu <b>Habis</b> / <b>Tersedia</b>. Ubah harga & menu hanya oleh Pemilik/Manajer.</div>' : ''}
   ${sold ? `<div class="kpi-mini warn">${sold} menu ditandai habis — tidak bisa dipesan di kasir.</div>` : ''}
   <div id="menuList">${menuList(groups, q, mgr)}</div></div>`;
};
function menuList(groups: any[], q: string, mgr: boolean) {
  if (!D.items.length) return emptyBox('food', 'Belum ada menu', 'Tambahkan menu pertama Anda: nama, harga, dan foto/ikon.', mgr ? `<button class="btn" onclick="App.itemForm('')">${IC.plus}Tambah menu</button>` : '');
  const html = groups.map((c) => {
    const items = D.items.filter((i: any) => (c.id ? i.categoryId === c.id : !D.categories.some((x: any) => x.id === i.categoryId)) && (!q || i.name.toLowerCase().includes(q)));
    if (!items.length) return '';
    return `<div class="sec-t">${c.icon || ''} ${esc(c.name)} <span>${items.length}</span></div><div class="list">${items.map((i: any) => `<div class="li mrow ${i.available === false ? 'off' : ''}">
      <span class="mpic">${i.photo ? `<img src="${i.photo}" alt="">` : `<em>${i.icon || '🍽️'}</em>`}</span>
      <div class="m" ${mgr ? `onclick="App.itemForm('${i.id}')"` : ''}><b>${esc(i.name)}</b><small>${rp(i.price)}${i.station === 'bar' ? ' · Bar' : ''}</small></div>
      <label class="switch" title="Tersedia"><input type="checkbox" ${i.available !== false ? 'checked' : ''} onchange="App.toggleAvail('${i.id}',this.checked)"><i></i><span>${i.available !== false ? 'Tersedia' : 'Habis'}</span></label>
      ${mgr ? `<button class="ib" onclick="App.itemForm('${i.id}')" aria-label="Ubah">${IC.edit}</button>` : ''}</div>`).join('')}</div>`;
  }).join('');
  return html || emptyBox('search', 'Menu tidak ditemukan');
}
function menuSearch(v: string) { S.menuQ = v; const groups = [...D.categories, { id: '', name: 'Tanpa kategori', icon: '📦' }]; $('#menuList').innerHTML = menuList(groups, v.toLowerCase(), isMgr()); }
async function toggleAvail(id: string, on: boolean) { await run(() => updRow('items', id, { available: on }), on ? 'Menu tersedia lagi' : 'Ditandai habis'); }

/* ---------- Form menu ---------- */
function itemForm(id: string) {
  if (!isMgr()) return;
  const it = D.items.find((x: any) => x.id === id) || { name: '', price: '', categoryId: S.cat !== 'all' ? S.cat : D.categories[0]?.id || '', icon: '🍛', photo: '', station: 'dapur', available: true };
  S.mf = { icon: it.icon || '🍛', photo: it.photo || '', station: it.station || 'dapur' };
  openSheet(`<h2>${id ? 'Ubah menu' : 'Tambah menu'}</h2>
   <div class="mf-top"><button class="mf-pic" id="mfPic" onclick="document.getElementById('mfFile').click()">${picHTML()}</button>
    <div class="mf-pic-acts"><button class="btn sm sec" onclick="document.getElementById('mfFile').click()">${IC.upload}Foto</button>${'<button class="btn sm ghost" onclick="App.mfIcons()">Pilih ikon</button>'}<input id="mfFile" type="file" accept="image/*" hidden onchange="App.mfPhoto(this.files[0])"></div></div>
   <div id="mfIcons" class="icons" hidden>${FOOD_ICONS.map((e) => `<button onclick="App.mfIcon('${e}')">${e}</button>`).join('')}</div>
   <label class="fl"><span>Nama menu</span><input id="mfN" value="${esc(it.name)}" placeholder="mis. Nasi Goreng Spesial" autofocus></label>
   <div class="row2"><label class="fl"><span>Harga (Rp)</span><input id="mfP" type="text" inputmode="numeric" autocomplete="off" data-money value="${fmtMoney(it.price)}" placeholder="25.000"></label>
    <label class="fl"><span>Kategori</span><select id="mfC">${D.categories.map((c: any) => `<option value="${c.id}" ${c.id === it.categoryId ? 'selected' : ''}>${c.icon || ''} ${esc(c.name)}</option>`).join('')}<option value="__new">+ Kategori baru…</option></select></label></div>
   <label class="fl"><span>Dibuat di</span></label><div class="seg"><button class="${S.mf.station === 'dapur' ? 'on' : ''}" onclick="App.mfStation(this,'dapur')">🍳 Dapur</button><button class="${S.mf.station === 'bar' ? 'on' : ''}" onclick="App.mfStation(this,'bar')">🥤 Bar / minuman</button></div>
   <label class="check mt"><input id="mfA" type="checkbox" ${it.available !== false ? 'checked' : ''}><span>Tersedia untuk dipesan</span></label>
   <div class="row2 mt">${id ? `<button class="btn ghost danger" onclick="App.delItem('${id}')">${IC.trash}Hapus</button>` : '<span></span>'}<button class="btn" onclick="App.saveItem('${id}')">Simpan</button></div>`);
}
const picHTML = () => (S.mf.photo ? `<img src="${S.mf.photo}" alt="">` : `<em>${S.mf.icon}</em>`);
function mfIcons() { const e = $('#mfIcons'); e.hidden = !e.hidden; }
function mfIcon(e: string) { S.mf.icon = e; S.mf.photo = ''; $('#mfPic').innerHTML = picHTML(); $('#mfIcons').hidden = true; }
async function mfPhoto(f: File) { try { S.mf.photo = await shrinkImage(f, 320); $('#mfPic').innerHTML = picHTML(); } catch (e: any) { toast(e.message, 'err'); } }
function mfStation(b: any, s: string) { S.mf.station = s; b.parentNode.querySelectorAll('button').forEach((x: any) => x.classList.toggle('on', x === b)); }
async function saveItem(id: string) {
  const name = $('#mfN').value.trim(), price = Math.round(num($('#mfP').value));
  let categoryId = $('#mfC').value;
  if (!name) return toast('Nama menu wajib diisi', 'err');
  if (price <= 0) return toast('Harga belum diisi', 'err');
  if (categoryId === '__new') {
    const n = await prompt2('Kategori baru', 'Nama kategori', ''); if (!n?.trim()) return;
    categoryId = (await addRow('categories', { name: n.trim(), icon: '🍽️', sort: D.categories.length })) as string;
  }
  const data = { name, price, categoryId, icon: S.mf.icon, photo: S.mf.photo, station: S.mf.station, available: $('#mfA').checked };
  closeSheet();
  if (id) await run(() => updRow('items', id, data), 'Menu disimpan');
  else await run(() => addRow('items', { ...data, sort: D.items.length }), 'Menu ditambahkan');
}
async function delItem(id: string) {
  if (!(await ask('Hapus menu ini?', 'Pesanan lama tidak terpengaruh.', 'Hapus', true))) return;
  closeSheet(); await run(() => delRow('items', id), 'Menu dihapus');
}

/* ---------- Kategori ---------- */
function catSheet() {
  openSheet(`<h2>Kategori</h2><p class="mut">Urutan kategori = urutan tab di kasir.</p>
   <div class="list">${D.categories.map((c: any, i: number) => `<div class="li"><span class="cat-ic">${c.icon || '🍽️'}</span><div class="m"><b>${esc(c.name)}</b><small>${D.items.filter((x: any) => x.categoryId === c.id).length} menu</small></div>
     <button class="ib" ${i ? '' : 'disabled'} onclick="App.catMove('${c.id}',-1)" aria-label="Naik">${IC.chev.replace('<svg ', '<svg style="transform:rotate(-90deg)" ')}</button>
     <button class="ib" ${i < D.categories.length - 1 ? '' : 'disabled'} onclick="App.catMove('${c.id}',1)" aria-label="Turun">${IC.chev.replace('<svg ', '<svg style="transform:rotate(90deg)" ')}</button>
     <button class="ib" onclick="App.catEdit('${c.id}')">${IC.edit}</button><button class="ib danger" onclick="App.catDel('${c.id}')">${IC.trash}</button></div>`).join('')}</div>
   <button class="btn blk mt" onclick="App.catEdit('')">${IC.plus}Tambah kategori</button>`);
}
async function catEdit(id: string) {
  const c = D.categories.find((x: any) => x.id === id);
  const n = await prompt2(id ? 'Ubah kategori' : 'Kategori baru', 'Nama kategori (boleh diawali emoji, mis. "🍜 Mie")', c ? `${c.icon || ''} ${c.name}`.trim() : '');
  if (!n?.trim()) return;
  const m = n.trim().match(/^(\p{Extended_Pictographic}️?)\s*(.*)$/u);
  const icon = m ? m[1] : c?.icon || '🍽️', name = (m ? m[2] : n).trim() || n.trim();
  if (id) await run(() => updRow('categories', id, { name, icon }));
  else await run(() => addRow('categories', { name, icon, sort: D.categories.length }));
  catSheet();
}
async function catMove(id: string, d: number) {
  const arr = [...D.categories]; const i = arr.findIndex((x) => x.id === id), j = i + d; if (j < 0 || j >= arr.length) return;
  [arr[i], arr[j]] = [arr[j], arr[i]];
  await run(async () => { for (const [k, c] of arr.entries()) if (c.sort !== k) await updRow('categories', c.id, { sort: k }); });
  catSheet();
}
async function catDel(id: string) {
  const n = D.items.filter((x: any) => x.categoryId === id).length;
  if (!(await ask('Hapus kategori ini?', n ? `${n} menu di kategori ini akan pindah ke “Tanpa kategori”.` : '', 'Hapus', true))) return;
  await run(() => delRow('categories', id), 'Kategori dihapus'); catSheet();
}
reg({ menuSearch, toggleAvail, itemForm, mfIcons, mfIcon, mfPhoto, mfStation, saveItem, delItem, catSheet, catEdit, catMove, catDel });
