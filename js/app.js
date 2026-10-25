/* ============ DATA ============ */
const KEY='farawash_v1';
const STATUSES=[{k:'diterima',n:'Diterima'},{k:'dicuci',n:'Dicuci'},{k:'disetrika',n:'Disetrika'},{k:'siap',n:'Siap Diambil'},{k:'diambil',n:'Sudah Diambil'}];
const METHODS=['Tunai','Transfer','QRIS'];
const EXP_CAT=['Deterjen & Pewangi','Plastik & Kemasan','Listrik','Air','Gaji','Sewa','Perawatan Mesin','Lainnya'];
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,7);
function defaultDB(){return{
 settings:{name:'',tagline:'',address:'',phone:'',logo:'',color:'#0b6bcb',setupDone:false,footer:'Terima kasih! Cucian yang tidak diambil >30 hari di luar tanggung jawab kami.',prefix:'FW',expressPct:50},
 services:[['Cuci Kering Setrika','kg',7000,2],['Cuci Kering','kg',5000,2],['Setrika Saja','kg',4000,1],['Bed Cover','pcs',25000,3],['Selimut','pcs',15000,3],['Jas / Blazer','pcs',20000,3],['Sepatu','pasang',30000,3],['Karpet','m2',15000,4]].map(([name,unit,price,days])=>({id:uid(),name,unit,price,days})),
 customers:[],orders:[],expenses:[],seq:1}}
let mem=null;
function load(){try{const s=localStorage.getItem(KEY);if(s)return JSON.parse(s)}catch(e){}return mem||defaultDB()}
let db=load();
if(!db.settings.color)db.settings.color='#0b6bcb';
function save(){mem=db;try{localStorage.setItem(KEY,JSON.stringify(db))}catch(e){}}
save();
try{navigator.storage&&navigator.storage.persist&&navigator.storage.persist()}catch(e){}

/* ============ UTIL ============ */
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const rp=n=>'Rp '+Math.round(n||0).toLocaleString('id-ID');
const num=v=>parseFloat(String(v).replace(',','.'))||0;
const pad=n=>String(n).padStart(2,'0');
const dKey=d=>{d=new Date(d);return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())};
const fDate=d=>new Date(d).toLocaleDateString('id-ID',{day:'2-digit',month:'short',year:'numeric'});
const fShort=d=>new Date(d).toLocaleDateString('id-ID',{day:'2-digit',month:'short'});
const fDT=d=>new Date(d).toLocaleString('id-ID',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});
const today=()=>dKey(new Date());
function toast(m){const t=$('#toast');t.textContent=m;t.classList.add('show');clearTimeout(t._t);t._t=setTimeout(()=>t.classList.remove('show'),2200)}
const cust=id=>db.customers.find(c=>c.id===id)||{name:'(terhapus)',phone:''};
const paid=o=>o.payments.reduce((a,p)=>a+p.amount,0);
const due=o=>Math.max(0,o.total-paid(o));
function payStatus(o){const p=paid(o);if(p>=o.total)return['lunas','Lunas'];if(p>0)return['dp','DP'];return['belum','Belum Bayar']}
const stName=k=>(STATUSES.find(s=>s.k===k)||{}).n||k;
const stIdx=k=>STATUSES.findIndex(s=>s.k===k);
const badge=k=>`<span class="badge s-${k}">${stName(k)}</span>`;
const pbadge=o=>{const[c,n]=payStatus(o);return`<span class="badge p-${c}">${n}</span>`};
const initials=n=>String(n).trim().split(/\s+/).slice(0,2).map(w=>w[0]||'').join('').toUpperCase()||'?';
const isLate=o=>o.status!=='diambil'&&o.status!=='siap'&&new Date(o.dueAt)<new Date(today());
function waNum(p){p=String(p||'').replace(/\D/g,'');if(p.startsWith('0'))p='62'+p.slice(1);return p}
function openSheet(html){$('#sheet').innerHTML='<div class="grip"></div>'+html;$('#sheetBg').classList.add('show');requestAnimationFrame(()=>$('#sheet').classList.add('show'));$('#sheet').scrollTop=0}
function closeSheet(){$('#sheet').classList.remove('show');$('#sheetBg').classList.remove('show')}
const sheetOpen=()=>$('#sheet').classList.contains('show');
const IC={
 home:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg>',
 list:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>',
 plus:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
 users:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5c1.8.6 3 2.4 3.5 5.5"/></svg>',
 menu:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/></svg>',
 search:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>'};

/* ============ BRANDING ============ */
const COLORS=[['#0b6bcb','Biru'],['#0f8b8d','Tosca'],['#178a48','Hijau'],['#6d3fc4','Ungu'],['#d63384','Pink'],['#e0671b','Oranye'],['#c4332b','Merah'],['#1f2937','Hitam']];
const shopName=()=>db.settings.name||'Laundry Saya';
const slug=s=>String(s).toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'')||'laundry';
function applyBrand(){
 const s=db.settings;document.documentElement.style.setProperty('--pri',s.color||'#0b6bcb');
 document.querySelector('meta[name=theme-color]').setAttribute('content',s.color||'#0b6bcb');
 document.title=shopName();
 const am=document.querySelector('meta[name=apple-mobile-web-app-title]');if(am)am.setAttribute('content',shopName());
}
function pickLogo(input,cb){
 const f=input.files[0];if(!f)return;const r=new FileReader();
 r.onload=()=>{const img=new Image();img.onload=()=>{const S=256,c=document.createElement('canvas');c.width=c.height=S;const x=c.getContext('2d');
  const k=Math.max(S/img.width,S/img.height),w=img.width*k,h=img.height*k;x.fillStyle='#fff';x.fillRect(0,0,S,S);x.drawImage(img,(S-w)/2,(S-h)/2,w,h);cb(c.toDataURL('image/jpeg',.85))};
  img.onerror=()=>toast('Gambar tidak bisa dibaca');img.src=r.result};
 r.readAsDataURL(f);
}
let brand={};
function brandFields(){
 const s=brand;
 return`<div class="f"><label>Logo (opsional)</label><div class="logo-pick"><div class="ph" id="bLogo">${s.logo?`<img src="${s.logo}">`:esc(initials(s.name||'L'))}</div>
  <div><label class="btn sm sec" style="margin:0 0 6px;color:var(--tx)">Pilih gambar<input type="file" accept="image/*" style="display:none" onchange="pickLogo(this,d=>{brand.logo=d;brandPreview()})"></label>
  ${s.logo?`<button class="btn sm err" onclick="brand.logo='';brandPreview()">Hapus</button>`:''}</div></div></div>
 <div class="f"><label>Nama laundry *</label><input id="bN" value="${esc(s.name)}" placeholder="mis. Bersih Kilat Laundry" oninput="brand.name=this.value;brandPreview(true)"></div>
 <div class="f"><label>Slogan / keterangan</label><input id="bT" value="${esc(s.tagline)}" placeholder="mis. Cuci bersih, wangi, rapi" oninput="brand.tagline=this.value;brandPreview(true)"></div>
 <div class="f"><label>Alamat</label><input id="bA" value="${esc(s.address)}" oninput="brand.address=this.value"></div>
 <div class="f"><label>No. telp / WhatsApp</label><input id="bP" type="tel" inputmode="tel" value="${esc(s.phone)}" placeholder="08xxxxxxxxxx" oninput="brand.phone=this.value"></div>
 <div class="f"><label>Warna tema</label><div class="colors">${COLORS.map(([c,n])=>`<button title="${n}" style="background:${c}" class="${c===s.color?'on':''}" onclick="brand.color='${c}';brandPreview()"></button>`).join('')}</div></div>
 <div class="f"><label>Pratinjau</label><div class="preview" id="bPrev"></div></div>`;
}
function brandPreview(light){
 const s=brand;document.documentElement.style.setProperty('--pri',s.color);
 const pv=$('#bPrev');if(pv)pv.innerHTML=`<div class="bar">${s.logo?`<img src="${s.logo}" style="width:32px;height:32px;border-radius:9px;object-fit:cover">`:''}<div><b>${esc(s.name||'Nama Laundry')}</b><div style="font-size:12px;opacity:.85">${esc(s.tagline||'Kasir Laundry')}</div></div></div>`;
 if(light)return;
 const box=$('#brandBox');if(box){box.innerHTML=brandFields();brandPreview(true)}
}
function brandSave(){
 const n=(brand.name||'').trim();if(!n){toast('Nama laundry wajib diisi');$('#bN').focus();return false}
 Object.assign(db.settings,{name:n,tagline:(brand.tagline||'').trim(),address:(brand.address||'').trim(),phone:(brand.phone||'').trim(),logo:brand.logo||'',color:brand.color||'#0b6bcb'});
 if(!db.settings.prefix||db.settings.prefix==='FW'&&!db.orders.length)db.settings.prefix=(n.replace(/[^A-Za-z]/g,'').slice(0,3)||'LDR').toUpperCase();
 save();applyBrand();return true;
}
function showSetup(){
 const s=db.settings;brand={name:s.name,tagline:s.tagline,address:s.address,phone:s.phone,logo:s.logo,color:s.color||'#0b6bcb'};
 const el=$('#setup');el.hidden=false;
 el.innerHTML=`<div class="in"><div style="font-size:40px">🧺</div><h1>Selamat datang!</h1>
 <p class="mut" style="margin-top:0">Atur identitas laundry Anda. Nama, logo, dan warna ini tampil di aplikasi, nota, dan pesan WhatsApp. Bisa diubah kapan saja di Pengaturan.</p>
 <div class="card" id="brandBox">${brandFields()}</div>
 <button class="btn blk" onclick="if(brandSave()){db.settings.setupDone=true;save();$('#setup').hidden=true;render();toast('Siap dipakai!')}">Mulai Pakai Aplikasi</button></div>`;
 brandPreview(true);
}

/* ============ ROUTER ============ */
const TABS=[['home','home','Beranda'],['orders','list','Order'],['kasir','plus','Kasir'],['customers','users','Pelanggan'],['more','menu','Lainnya']];
const SUB={services:'more',finance:'more',settings:'more'};
const TITLES={home:'',orders:'Daftar Order',kasir:'Order Baru',customers:'Pelanggan',more:'Lainnya',services:'Layanan & Harga',finance:'Keuangan',settings:'Pengaturan'};
let view='home',stack=[];
function go(v,push=true){if(push&&v!==view){stack.push(view);history.pushState({v},'')}view=v;render();window.scrollTo(0,0)}
function back(){history.back()}
window.addEventListener('popstate',()=>{if(sheetOpen()){closeSheet();history.pushState({v:view},'');return}view=stack.pop()||'home';render()});
history.replaceState({v:'home'},'');
function renderNav(){
 const act=SUB[view]||view;
 $('#nav').innerHTML=TABS.map(([k,i,n])=>k==='kasir'
  ?`<button class="fab ${act===k?'on':''}" onclick="go('kasir')"><span class="c">${IC.plus}</span>${n}</button>`
  :`<button class="${act===k?'on':''}" onclick="stack=[];go('${k}')">${IC[i]}${n}</button>`).join('');
}
function setHeader(t,act=''){
 const home=view==='home',s=db.settings;
 $('#title').textContent=home?shopName():t;
 const lg=$('#hLogo');lg.hidden=!(home&&s.logo);if(home&&s.logo)lg.src=s.logo;
 const sb=$('#hSub');sb.hidden=!home;sb.textContent=s.tagline||'Kasir Laundry';
 $('#hAct').innerHTML=(SUB[view]?`<button class="hb" onclick="back()">‹ Kembali</button>`:'')+act;
}
function render(){
 applyBrand();renderNav();$('#paybar').innerHTML='';$('#main').className='';
 ({home:vHome,orders:vOrders,kasir:vKasir,customers:vCust,more:vMore,services:vSvc,finance:vFin,settings:vSet})[view]();
}

/* ============ HOME ============ */
function vHome(){
 setHeader('');
 const t=today();
 const pays=db.orders.flatMap(o=>o.payments);
 const incToday=pays.filter(p=>dKey(p.date)===t).reduce((a,p)=>a+p.amount,0);
 const ordToday=db.orders.filter(o=>dKey(o.createdAt)===t).length;
 const proses=db.orders.filter(o=>stIdx(o.status)<3);
 const ready=db.orders.filter(o=>o.status==='siap');
 const piut=db.orders.reduce((a,o)=>a+due(o),0);
 const late=db.orders.filter(isLate);
 const days=[];for(let i=13;i>=0;i--){const d=new Date();d.setDate(d.getDate()-i);days.push(dKey(d))}
 const inc=days.map(k=>pays.filter(p=>dKey(p.date)===k).reduce((a,p)=>a+p.amount,0));const mx=Math.max(...inc,1);
 const recent=[...db.orders].sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,6);
 $('#main').innerHTML=`
 <div class="install" id="installBox"><span style="font-size:22px">📲</span><div class="grow" style="flex:1">Pasang aplikasi di layar utama</div><button class="btn sm" onclick="doInstall()">Pasang</button></div>
 <div class="hero"><div class="l">Pemasukan hari ini</div><div class="v">${rp(incToday)}</div>
  <div class="s"><div><b>${ordToday}</b>order masuk</div><div><b>${proses.length}</b>diproses</div><div><b>${ready.length}</b>siap ambil</div></div></div>
 <div class="stats">
  <div class="stat" onclick="ordFilter='siap';go('orders')"><div class="l">Siap Diambil</div><div class="v">${ready.length}</div></div>
  <div class="stat" onclick="ordFilter='belum';go('orders')"><div class="l">Piutang</div><div class="v" style="color:${piut?'var(--err)':'inherit'}">${rp(piut)}</div></div>
 </div>
 ${late.length?`<div class="card" style="background:#fdecea;color:#8f2621;cursor:pointer" onclick="ordFilter='telat';go('orders')">⚠️ <b>${late.length} order</b> melewati estimasi selesai. Ketuk untuk lihat.</div>`:''}
 <div class="card"><div style="font-weight:600;margin-bottom:8px">Pemasukan 14 hari</div>
  <div class="bars">${inc.map((v,i)=>`<div class="b" title="${fDate(days[i])}: ${rp(v)}" onclick="toast('${fShort(days[i])}: ${rp(v)}')"><i style="height:${v/mx*100}%"></i><span>${days[i].slice(8)}</span></div>`).join('')}</div></div>
 <div class="sec-t">Status cucian</div>
 <div class="chips" style="padding-bottom:4px">${STATUSES.map(s=>`<button onclick="ordFilter='${s.k}';go('orders')">${s.n} · <b>${db.orders.filter(o=>o.status===s.k).length}</b></button>`).join('')}</div>
 <div class="sec-t">Order terbaru <a onclick="ordFilter='aktif';go('orders')">Lihat semua</a></div>
 ${orderList(recent)}`;
 if(deferredPrompt)$('#installBox').style.display='flex';
}

/* ============ ORDERS ============ */
let ordFilter='aktif',ordQ='';
function orderList(list){
 if(!list.length)return'<div class="list"><div class="empty">Belum ada order.</div></div>';
 return`<div class="list">${list.map(o=>{const c=cust(o.customerId);const late=isLate(o);
  return`<div class="li" onclick="showOrder('${o.id}')">
   <div class="m"><div class="t">${esc(c.name)}</div>
   <div class="d">${esc(o.code)}${o.express?' · ⚡Express':''}</div>
   <div class="d" ${late?'style="color:var(--err);font-weight:600"':''}>${late?'Terlambat · ':'Selesai '}${fShort(o.dueAt)}</div></div>
   <div class="r"><div class="amt">${rp(o.total)}</div><div style="margin-top:4px">${badge(o.status)}</div><div style="margin-top:3px">${pbadge(o)}</div></div></div>`}).join('')}</div>`;
}
function vOrders(){
 setHeader('Daftar Order');
 let list=[...db.orders].sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
 if(ordFilter==='aktif')list=list.filter(o=>o.status!=='diambil');
 else if(ordFilter==='belum')list=list.filter(o=>due(o)>0);
 else if(ordFilter==='telat')list=list.filter(isLate);
 else if(ordFilter!=='semua')list=list.filter(o=>o.status===ordFilter);
 const q=ordQ.toLowerCase();
 if(q)list=list.filter(o=>{const c=cust(o.customerId);return(o.code+' '+c.name+' '+c.phone).toLowerCase().includes(q)});
 const tabs=[['aktif','Aktif'],...STATUSES.map(s=>[s.k,s.n]),['belum','Belum Lunas'],['telat','Terlambat'],['semua','Semua']];
 $('#main').innerHTML=`
 <div class="search">${IC.search}<input id="oq" type="search" placeholder="Cari nota, nama, no. HP" value="${esc(ordQ)}"></div>
 <div class="chips" id="ochips">${tabs.map(([k,n])=>`<button class="${ordFilter===k?'on':''}" onclick="ordFilter='${k}';vOrders()">${n}</button>`).join('')}</div>
 <div class="mut" style="font-size:13px;margin:0 4px 8px">${list.length} order</div>
 <div id="olist">${orderList(list)}</div>`;
 $('#oq').oninput=e=>{ordQ=e.target.value;clearTimeout(window._oq);window._oq=setTimeout(()=>{const s=$('#ochips').scrollLeft;vOrders();$('#ochips').scrollLeft=s;const i=$('#oq');i.focus();i.setSelectionRange(i.value.length,i.value.length)},250)};
 const on=$('#ochips .on');if(on)on.scrollIntoView({inline:'center',block:'nearest'});
}
function showOrder(id){
 const o=db.orders.find(x=>x.id===id);if(!o)return;const c=cust(o.customerId);const si=stIdx(o.status);const nx=STATUSES[si+1];
 openSheet(`<h2><span>${esc(o.code)}</span><button class="x" onclick="closeSheet()">×</button></h2>
 <div class="row" style="flex-wrap:wrap;gap:6px">${badge(o.status)} ${pbadge(o)} ${o.express?'<span class="badge p-dp">⚡ Express</span>':''}</div>
 <div class="prog">${STATUSES.map((s,i)=>`<i class="${i<=si?'on':''}"></i>`).join('')}</div>
 ${nx?`<button class="btn blk ${nx.k==='diambil'?'ok':''}" style="margin-bottom:14px" onclick="advance('${o.id}')">Tandai: ${nx.n} →</button>`:''}
 <div class="li" style="padding:10px 0;border-bottom:1px solid var(--bd)" onclick="showCust('${o.customerId}')"><div class="av">${esc(initials(c.name))}</div><div class="m"><div class="t">${esc(c.name)}</div><div class="d">${esc(c.phone)}</div></div><span class="mut">›</span></div>
 <div class="g2" style="margin:12px 0;font-size:13.5px"><div><div class="mut" style="font-size:12px">Masuk</div>${fDT(o.createdAt)}</div><div><div class="mut" style="font-size:12px">Estimasi selesai</div><span ${isLate(o)?'style="color:var(--err);font-weight:600"':''}>${fDate(o.dueAt)}</span></div></div>
 <div style="background:#f6f8fb;border-radius:12px;padding:10px 12px;margin-bottom:12px">
 ${o.items.map(i=>`<div class="kv"><span>${esc(i.name)}<br><small class="mut">${i.qty} ${esc(i.unit)} × ${rp(i.price)}</small></span><span>${rp(i.price*i.qty)}</span></div>`).join('')}
 ${o.expressFee?`<div class="kv"><span>Biaya Express</span><span>${rp(o.expressFee)}</span></div>`:''}
 ${o.discount?`<div class="kv"><span>Diskon</span><span>- ${rp(o.discount)}</span></div>`:''}
 <div class="kv b"><span>Total</span><span>${rp(o.total)}</span></div>
 <div class="kv"><span>Sudah dibayar</span><span>${rp(paid(o))}</span></div>
 <div class="kv"><span><b>Sisa</b></span><b style="color:${due(o)?'var(--err)':'var(--ok)'}">${rp(due(o))}</b></div></div>
 ${o.note?`<div class="card" style="background:#fffaf0;padding:10px 12px">📝 ${esc(o.note)}</div>`:''}
 ${due(o)>0?`<div style="margin-bottom:14px"><label>Terima pembayaran</label><div class="row"><input id="pAmt" type="number" inputmode="numeric" class="grow" value="${due(o)}"><select id="pMet" style="width:110px">${METHODS.map(m=>`<option>${m}</option>`).join('')}</select></div><button class="btn ok blk" style="margin-top:8px" onclick="addPay('${o.id}')">Simpan Pembayaran</button></div>`:''}
 <div class="g2" style="margin-bottom:8px">
  <button class="btn sec" onclick="sendWA('${o.id}','nota')">💬 Nota WA</button>
  <button class="btn sec" onclick="${o.status==='siap'?`sendWA('${o.id}','siap')`:`shareNota('${o.id}')`}">${o.status==='siap'?'📢 Info Siap':'↗️ Bagikan'}</button>
  <button class="btn sec" onclick="printNota('${o.id}')">🖨️ Cetak</button>
  <button class="btn sec" onclick="statusPicker('${o.id}')">🔄 Ubah Status</button>
 </div>
 ${o.payments.length?`<div class="sec-t" style="margin-left:0">Pembayaran</div><div class="timeline">${o.payments.map(p=>`<div>${fDT(p.date)} · ${p.method} · <b>${rp(p.amount)}</b></div>`).join('')}</div>`:''}
 <div class="sec-t" style="margin-left:0">Riwayat status</div><div class="timeline">${o.history.map(h=>`<div>${stName(h.status)} <span class="mut">· ${fDT(h.date)}</span></div>`).join('')}</div>
 <button class="btn err blk" style="margin-top:14px" onclick="delOrder('${o.id}')">Hapus Order</button>`);
}
function statusPicker(id){
 const o=db.orders.find(x=>x.id===id);
 openSheet(`<h2>Ubah Status<button class="x" onclick="showOrder('${id}')">×</button></h2><div class="list" style="border:1px solid var(--bd)">${STATUSES.map(s=>`<div class="li" onclick="setStatus(db.orders.find(x=>x.id==='${id}'),'${s.k}');showOrder('${id}')"><div class="m">${badge(s.k)}</div>${s.k===o.status?'<b style="color:var(--pri)">✓</b>':''}</div>`).join('')}</div>`);
}
function advance(id){
 const o=db.orders.find(x=>x.id===id);const n=STATUSES[stIdx(o.status)+1];if(!n)return;
 if(n.k==='diambil'&&due(o)>0){
  if(!confirm(`Masih ada sisa tagihan ${rp(due(o))}.\nCatat pelunasan TUNAI sekarang dan tandai diambil?`))return;
  o.payments.push({date:new Date().toISOString(),amount:due(o),method:'Tunai'});
 }
 setStatus(o,n.k);showOrder(id);
 if(n.k==='siap'&&cust(o.customerId).phone&&confirm('Kirim notifikasi WhatsApp "siap diambil" ke pelanggan?'))sendWA(o.id,'siap');
}
function setStatus(o,k){if(o.status===k)return;o.status=k;o.history.push({status:k,date:new Date().toISOString()});save();toast(`${o.code}: ${stName(k)}`);render()}
function addPay(id){
 const o=db.orders.find(x=>x.id===id);const a=Math.min(num($('#pAmt').value),due(o));
 if(a<=0)return toast('Nominal tidak valid');
 o.payments.push({date:new Date().toISOString(),amount:a,method:$('#pMet').value});save();toast('Pembayaran dicatat');render();showOrder(id);
}
function delOrder(id){if(!confirm('Hapus order ini? Data pembayarannya ikut terhapus.'))return;db.orders=db.orders.filter(o=>o.id!==id);save();closeSheet();render();toast('Order dihapus')}
function notaText(o){
 const s=db.settings,c=cust(o.customerId);
 let t=`*${shopName()}*\n${s.tagline?s.tagline+'\n':''}${s.address?s.address+'\n':''}${s.phone?'Telp: '+s.phone+'\n':''}\nNota: *${o.code}*\nPelanggan: ${c.name}\nMasuk: ${fDT(o.createdAt)}\nEstimasi selesai: ${fDate(o.dueAt)}\n\n`;
 o.items.forEach(i=>t+=`${i.name}\n  ${i.qty} ${i.unit} x ${rp(i.price)} = ${rp(i.price*i.qty)}\n`);
 if(o.expressFee)t+=`Express: ${rp(o.expressFee)}\n`;
 if(o.discount)t+=`Diskon: -${rp(o.discount)}\n`;
 return t+`\n*Total: ${rp(o.total)}*\nDibayar: ${rp(paid(o))}\nSisa: ${rp(due(o))} (${payStatus(o)[1]})\n\n${s.footer}`;
}
function sendWA(id,type){
 const o=db.orders.find(x=>x.id===id),c=cust(o.customerId),s=db.settings;
 const msg=type==='siap'?`Halo ${c.name}, cucian Anda dengan nota *${o.code}* sudah *SIAP DIAMBIL* di ${shopName()}.\n${due(o)>0?`Sisa pembayaran: *${rp(due(o))}*\n`:''}\nTerima kasih 🙏`:notaText(o);
 window.open('https://wa.me/'+waNum(c.phone)+'?text='+encodeURIComponent(msg),'_blank');
}
function shareNota(id){
 const o=db.orders.find(x=>x.id===id);const text=notaText(o).replace(/\*/g,'');
 if(navigator.share)navigator.share({title:'Nota '+o.code,text}).catch(()=>{});
 else{navigator.clipboard&&navigator.clipboard.writeText(text);toast('Nota disalin')}
}
function printNota(id){
 const o=db.orders.find(x=>x.id===id),c=cust(o.customerId),s=db.settings;
 const L=(a,b)=>`<div class="l"><span>${a}</span><span>${b}</span></div>`;
 $('#print-area').innerHTML=`<div class="nota"><div class="c">${s.logo?`<img src="${s.logo}">`:''}<b style="font-size:15px">${esc(shopName())}</b>${s.tagline?'<br>'+esc(s.tagline):''}${s.address?'<br>'+esc(s.address):''}${s.phone?'<br>Telp '+esc(s.phone):''}</div><hr>
  ${L('Nota',esc(o.code))}${L('Pelanggan',esc(c.name))}${L('Masuk',fDT(o.createdAt))}${L('Selesai',fDate(o.dueAt))}<hr>
  ${o.items.map(i=>`<div>${esc(i.name)}</div>${L(`&nbsp;${i.qty} ${esc(i.unit)} x ${rp(i.price)}`,rp(i.price*i.qty))}`).join('')}<hr>
  ${o.expressFee?L('Express',rp(o.expressFee)):''}${o.discount?L('Diskon','-'+rp(o.discount)):''}
  ${L('<b>TOTAL</b>','<b>'+rp(o.total)+'</b>')}${L('Dibayar',rp(paid(o)))}${L('Sisa',rp(due(o)))}${L('Status',payStatus(o)[1].toUpperCase())}
  ${o.note?`<hr>Catatan: ${esc(o.note)}`:''}<hr><div class="c">${esc(s.footer)}</div></div>`;
 window.print();
}

/* ============ KASIR ============ */
let cart=null;
function newCart(){cart={customerId:'',items:[],express:false,discount:0,note:'',payAmount:0,method:'Tunai'}}
function vKasir(){
 setHeader('Order Baru',cart&&(cart.items.length||cart.customerId)?`<button class="hb" onclick="if(confirm('Kosongkan order ini?')){newCart();vKasir()}">Reset</button>`:'');
 if(!cart)newCart();
 const c=cart.customerId?cust(cart.customerId):null;
 $('#main').className='has-bar';
 $('#main').innerHTML=`
 <div class="sec-t" style="margin-top:4px">1 · Pelanggan</div>
 <div class="list">${c?`<div class="li" onclick="pickCust()"><div class="av">${esc(initials(c.name))}</div><div class="m"><div class="t">${esc(c.name)}</div><div class="d">${esc(c.phone)}</div></div><span style="color:var(--pri);font-weight:600;font-size:14px">Ganti</span></div>`
  :`<div class="li" onclick="pickCust()"><div class="av">+</div><div class="m"><div class="t" style="color:var(--pri)">Pilih / tambah pelanggan</div></div><span class="mut">›</span></div>`}</div>
 <div class="sec-t">2 · Layanan</div>
 <div class="svc">${db.services.map(s=>{const it=cart.items.find(i=>i.serviceId===s.id);return`<button class="${it?'in':''}" onclick="addItem('${s.id}')">${it?`<span class="cnt">${+it.qty}</span>`:''}<b>${esc(s.name)}</b><small>${rp(s.price)}/${esc(s.unit)} · ${s.days}h</small></button>`}).join('')||'<div class="empty">Belum ada layanan.</div>'}</div>
 ${cart.items.length?`<div class="sec-t">3 · Rincian</div><div class="list">${cart.items.map((it,i)=>{const dec=['kg','m2'].includes(it.unit);return`<div class="li" style="cursor:default">
  <div class="m"><div class="t">${esc(it.name)}</div><div class="d" id="sub${i}">${rp(it.price*it.qty)}</div></div>
  <div class="stepper"><button onclick="stepQty(${i},-${dec?0.5:1})">−</button><input type="number" inputmode="decimal" step="${dec?0.1:1}" value="${it.qty}" oninput="setQty(${i},this.value)"><button onclick="stepQty(${i},${dec?0.5:1})">+</button></div>
  <span class="mut" style="font-size:12px;width:34px">${esc(it.unit)}</span></div>`}).join('')}</div>
 <div class="card">
  <div class="tog"><div><b>⚡ Express</b><div class="mut" style="font-size:12.5px">+${db.settings.expressPct}%, selesai lebih cepat</div></div><label class="sw"><input type="checkbox" ${cart.express?'checked':''} onchange="cart.express=this.checked;calc()"><span></span></label></div>
  <div class="g2" style="margin-top:12px"><div class="f"><label>Diskon (Rp)</label><input type="number" inputmode="numeric" value="${cart.discount||''}" placeholder="0" oninput="cart.discount=num(this.value);calc()"></div>
  <div class="f"><label>Estimasi selesai</label><input id="kDue" value="" disabled></div></div>
  <div class="f" style="margin:0"><label>Catatan</label><input value="${esc(cart.note)}" placeholder="noda, parfum, jumlah potong…" oninput="cart.note=this.value"></div>
 </div>
 <div class="sec-t">4 · Pembayaran</div>
 <div class="card">
  <div class="seg" style="margin-bottom:12px">${METHODS.map(m=>`<button class="${m===cart.method?'on':''}" onclick="cart.method='${m}';this.parentNode.querySelectorAll('button').forEach(b=>b.classList.toggle('on',b===this))">${m}</button>`).join('')}</div>
  <label>Dibayar sekarang</label><input id="kPay" type="number" inputmode="numeric" value="${cart.payAmount||''}" placeholder="0" oninput="cart.payAmount=num(this.value);calc()">
  <div class="row" style="margin-top:8px"><button class="btn sm sec grow" onclick="cart.payAmount=cartTotal().total;$('#kPay').value=cart.payAmount;calc()">Lunas</button><button class="btn sm sec grow" onclick="cart.payAmount=0;$('#kPay').value='';calc()">Bayar nanti</button></div>
  <div id="kSum" style="margin-top:12px"></div>
 </div>`:'<div class="empty">Ketuk layanan di atas untuk menambahkan.</div>'}`;
 $('#paybar').innerHTML=`<div class="paybar"><div class="t"><small>Total</small><b id="kTot">Rp 0</b></div><button class="btn ok" style="padding:12px 22px" onclick="submitOrder()">Simpan Order</button></div>`;
 calc();
}
function pickCust(){
 const render=q=>{q=(q||'').toLowerCase();const l=[...db.customers].filter(c=>(c.name+' '+c.phone).toLowerCase().includes(q)).sort((a,b)=>a.name.localeCompare(b.name));
  $('#pcl').innerHTML=l.length?l.map(c=>`<div class="li" onclick="cart.customerId='${c.id}';closeSheet();vKasir()"><div class="av">${esc(initials(c.name))}</div><div class="m"><div class="t">${esc(c.name)}</div><div class="d">${esc(c.phone)}</div></div></div>`).join(''):'<div class="empty">Tidak ditemukan</div>'};
 openSheet(`<h2>Pilih Pelanggan<button class="x" onclick="closeSheet()">×</button></h2>
 <button class="btn blk" style="margin-bottom:10px" onclick="custForm(null,true)">+ Pelanggan Baru</button>
 <div class="search">${IC.search}<input id="pcq" type="search" placeholder="Cari nama / no. HP" style="border-color:var(--bd)"></div>
 <div class="list" id="pcl" style="border:1px solid var(--bd)"></div>`);
 render('');$('#pcq').oninput=e=>render(e.target.value);
}
function addItem(id){
 const s=db.services.find(x=>x.id===id);const ex=cart.items.find(i=>i.serviceId===id);
 if(ex)ex.qty=+(ex.qty+1).toFixed(2);else cart.items.push({serviceId:s.id,name:s.name,unit:s.unit,price:s.price,days:s.days,qty:1});
 if(navigator.vibrate)navigator.vibrate(15);vKasir();
}
function stepQty(i,d){const it=cart.items[i];it.qty=+(it.qty+d).toFixed(2);if(it.qty<=0)cart.items.splice(i,1);vKasir()}
function setQty(i,v){cart.items[i].qty=num(v);$('#sub'+i).textContent=rp(cart.items[i].price*cart.items[i].qty);calc()}
function cartTotal(){const sub=cart.items.reduce((a,i)=>a+i.price*i.qty,0);const exp=cart.express?Math.round(sub*db.settings.expressPct/100):0;return{sub,exp,total:Math.max(0,Math.round(sub+exp-(cart.discount||0)))}}
function estDue(){const d=Math.max(1,...cart.items.map(i=>i.days||1));const days=cart.express?Math.floor(d/2):d;const r=new Date();r.setDate(r.getDate()+days);return r}
function calc(){
 const t=cartTotal();const p=cart.payAmount||0;
 if($('#kTot'))$('#kTot').textContent=rp(t.total);
 if($('#kDue'))$('#kDue').value=fDate(estDue());
 if($('#kSum'))$('#kSum').innerHTML=`<div class="kv"><span>Subtotal</span><span>${rp(t.sub)}</span></div>
  ${t.exp?`<div class="kv"><span>Express</span><span>${rp(t.exp)}</span></div>`:''}${cart.discount?`<div class="kv"><span>Diskon</span><span>- ${rp(cart.discount)}</span></div>`:''}
  <div class="kv b"><span>Total</span><span>${rp(t.total)}</span></div>
  ${p>t.total?`<div class="kv" style="color:var(--ok)"><span>Kembalian</span><b>${rp(p-t.total)}</b></div>`:`<div class="kv"><span>Sisa tagihan</span><span>${rp(t.total-p)}</span></div>`}`;
}
function submitOrder(){
 if(!cart.customerId){toast('Pilih pelanggan dulu');return pickCust()}
 const items=cart.items.filter(i=>i.qty>0);if(!items.length)return toast('Tambahkan minimal 1 layanan');
 const t=cartTotal(),now=new Date().toISOString(),pay=Math.min(cart.payAmount||0,t.total),d=new Date();
 const code=db.settings.prefix+String(d.getFullYear()).slice(2)+pad(d.getMonth()+1)+pad(d.getDate())+'-'+String(db.seq++).padStart(4,'0');
 const o={id:uid(),code,customerId:cart.customerId,items:items.map(i=>({name:i.name,unit:i.unit,price:i.price,qty:i.qty})),subtotal:t.sub,expressFee:t.exp,express:cart.express,discount:cart.discount||0,total:t.total,note:cart.note,
  payments:pay>0?[{date:now,amount:pay,method:cart.method}]:[],status:'diterima',history:[{status:'diterima',date:now}],createdAt:now,dueAt:estDue().toISOString()};
 const change=Math.max(0,(cart.payAmount||0)-t.total);
 db.orders.push(o);save();newCart();vKasir();
 toast(change?`Tersimpan · Kembalian ${rp(change)}`:'Order '+code+' tersimpan');showOrder(o.id);
}

/* ============ CUSTOMERS ============ */
let custQ='';
function vCust(){
 setHeader('Pelanggan',`<button class="hb" onclick="custForm()">+ Baru</button>`);
 const q=custQ.toLowerCase();
 const list=db.customers.filter(c=>(c.name+' '+c.phone).toLowerCase().includes(q)).sort((a,b)=>a.name.localeCompare(b.name));
 $('#main').innerHTML=`<div class="search">${IC.search}<input id="cq" type="search" placeholder="Cari nama / no. HP" value="${esc(custQ)}"></div>
 <div class="mut" style="font-size:13px;margin:0 4px 8px">${list.length} pelanggan</div>
 <div class="list">${list.length?list.map(c=>{const os=db.orders.filter(o=>o.customerId===c.id);const pi=os.reduce((a,o)=>a+due(o),0);
  return`<div class="li" onclick="showCust('${c.id}')"><div class="av">${esc(initials(c.name))}</div><div class="m"><div class="t">${esc(c.name)}</div><div class="d">${esc(c.phone)} · ${os.length} order</div></div>
  <div class="r">${pi?`<div class="amt" style="color:var(--err);font-size:13px">${rp(pi)}</div><div class="mut" style="font-size:11px">piutang</div>`:'<span class="mut">›</span>'}</div></div>`}).join(''):'<div class="empty">Belum ada pelanggan.</div>'}</div>`;
 $('#cq').oninput=e=>{custQ=e.target.value;vCust();const i=$('#cq');i.focus();i.setSelectionRange(i.value.length,i.value.length)};
}
function showCust(id){
 const c=db.customers.find(x=>x.id===id);if(!c)return;
 const os=db.orders.filter(o=>o.customerId===id).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
 openSheet(`<h2><span>${esc(c.name)}</span><button class="x" onclick="closeSheet()">×</button></h2>
 <div class="mut" style="margin-top:-8px;margin-bottom:12px">${esc(c.phone)}${c.address?' · '+esc(c.address):''}</div>
 <div class="stats"><div class="stat" style="background:#f6f8fb"><div class="l">Total belanja</div><div class="v" style="font-size:17px">${rp(os.reduce((a,o)=>a+o.total,0))}</div></div>
 <div class="stat" style="background:#f6f8fb"><div class="l">Piutang</div><div class="v" style="font-size:17px">${rp(os.reduce((a,o)=>a+due(o),0))}</div></div></div>
 <div class="g2" style="margin-bottom:12px"><button class="btn" onclick="newCart();cart.customerId='${id}';closeSheet();go('kasir')">+ Order</button>
 ${c.phone?`<button class="btn sec" onclick="window.open('https://wa.me/${waNum(c.phone)}','_blank')">💬 WhatsApp</button>`:'<span></span>'}</div>
 <div class="sec-t" style="margin-left:0">Riwayat order (${os.length})</div>
 <div style="border:1px solid var(--bd);border-radius:14px;overflow:hidden">${os.length?os.map(o=>`<div class="li" onclick="showOrder('${o.id}')"><div class="m"><div class="t">${esc(o.code)}</div><div class="d">${fDate(o.createdAt)}</div></div><div class="r"><div class="amt">${rp(o.total)}</div>${badge(o.status)}</div></div>`).join(''):'<div class="empty">Belum ada order</div>'}</div>
 <div class="g2" style="margin-top:14px"><button class="btn sec" onclick="custForm('${id}')">Edit</button><button class="btn err" onclick="delCust('${id}')">Hapus</button></div>`);
}
function custForm(id,fromKasir){
 const c=id?db.customers.find(x=>x.id===id):{name:'',phone:'',address:''};
 openSheet(`<h2>${id?'Edit':'Tambah'} Pelanggan<button class="x" onclick="closeSheet()">×</button></h2>
 <div class="f"><label>Nama *</label><input id="cN" value="${esc(c.name)}" autocomplete="off"></div>
 <div class="f"><label>No. HP / WhatsApp</label><input id="cP" type="tel" inputmode="tel" value="${esc(c.phone)}" placeholder="08xxxxxxxxxx"></div>
 <div class="f"><label>Alamat</label><textarea id="cA" rows="2">${esc(c.address)}</textarea></div>
 <button class="btn blk" onclick="saveCust('${id||''}',${!!fromKasir})">Simpan</button>`);
 setTimeout(()=>$('#cN').focus(),300);
}
function saveCust(id,fromKasir){
 const name=$('#cN').value.trim();if(!name)return toast('Nama wajib diisi');
 const phone=$('#cP').value.trim();
 if(phone&&db.customers.some(x=>x.id!==id&&x.phone.replace(/\D/g,'')===phone.replace(/\D/g,'')))return toast('No. HP sudah terdaftar');
 const data={name,phone,address:$('#cA').value.trim()};
 if(id)Object.assign(db.customers.find(x=>x.id===id),data);
 else{const c={id:uid(),...data,createdAt:new Date().toISOString()};db.customers.push(c);if(fromKasir){if(!cart)newCart();cart.customerId=c.id}}
 save();closeSheet();render();toast('Pelanggan disimpan');
}
function delCust(id){
 if(db.orders.some(o=>o.customerId===id))return toast('Tidak bisa dihapus: ada riwayat order');
 if(!confirm('Hapus pelanggan ini?'))return;db.customers=db.customers.filter(c=>c.id!==id);save();closeSheet();render();
}

/* ============ MORE ============ */
let deferredPrompt=null;
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredPrompt=e;const b=$('#installBox');if(b)b.style.display='flex'});
function doInstall(){if(!deferredPrompt)return toast('Gunakan menu browser → "Tambahkan ke Layar Utama"');deferredPrompt.prompt();deferredPrompt.userChoice.finally(()=>{deferredPrompt=null;render()})}
function vMore(){
 setHeader('Lainnya');
 const it=(ic,t,d,on)=>`<div class="li" onclick="${on}"><div class="ic">${ic}</div><div class="m"><div class="t">${t}</div><div class="d">${d}</div></div><span class="mut">›</span></div>`;
 $('#main').innerHTML=`<div class="list menu">
  ${it('💰','Keuangan','Laporan, pengeluaran, piutang',"go('finance')")}
  ${it('🏷️','Layanan & Harga',db.services.length+' layanan',"go('services')")}
  ${it('⚙️','Pengaturan','Profil toko, backup data',"go('settings')")}
 </div>
 <div class="list menu">${it('📲','Pasang Aplikasi','Tambahkan ke layar utama HP','doInstall()')}</div>
 <p class="mut" style="text-align:center;font-size:12px">${esc(shopName())} · v1.1</p>`;
}

/* ============ SERVICES ============ */
function vSvc(){
 setHeader('Layanan & Harga',`<button class="hb" onclick="svcForm()">+ Baru</button>`);
 $('#main').innerHTML=`<div class="list">${db.services.length?db.services.map(s=>`<div class="li" onclick="svcForm('${s.id}')"><div class="m"><div class="t">${esc(s.name)}</div><div class="d">Durasi ${s.days} hari</div></div><div class="r"><div class="amt">${rp(s.price)}</div><div class="mut" style="font-size:12px">per ${esc(s.unit)}</div></div></div>`).join(''):'<div class="empty">Belum ada layanan.</div>'}</div>
 <p class="mut" style="font-size:13px;padding:0 4px">Express menambah biaya ${db.settings.expressPct}% dan memangkas durasi jadi setengah. Atur di Pengaturan.</p>`;
}
function svcForm(id){
 const s=id?db.services.find(x=>x.id===id):{name:'',unit:'kg',price:'',days:2};
 openSheet(`<h2>${id?'Edit':'Tambah'} Layanan<button class="x" onclick="closeSheet()">×</button></h2>
 <div class="f"><label>Nama layanan *</label><input id="sN" value="${esc(s.name)}" placeholder="mis. Cuci Kering Setrika"></div>
 <div class="g2"><div class="f"><label>Harga (Rp) *</label><input id="sP" type="number" inputmode="numeric" value="${s.price}"></div>
 <div class="f"><label>Satuan</label><select id="sU">${['kg','pcs','pasang','m2','set'].map(u=>`<option ${u===s.unit?'selected':''}>${u}</option>`).join('')}</select></div></div>
 <div class="f"><label>Durasi (hari)</label><input id="sD" type="number" inputmode="numeric" value="${s.days}"></div>
 <button class="btn blk" onclick="saveSvc('${id||''}')">Simpan</button>
 ${id?`<button class="btn err blk" style="margin-top:8px" onclick="delSvc('${id}')">Hapus Layanan</button>`:''}`);
}
function saveSvc(id){
 const name=$('#sN').value.trim(),price=num($('#sP').value);if(!name||price<=0)return toast('Nama dan harga wajib diisi');
 const d={name,unit:$('#sU').value,price,days:Math.max(0,parseInt($('#sD').value)||0)};
 if(id)Object.assign(db.services.find(x=>x.id===id),d);else db.services.push({id:uid(),...d});
 save();closeSheet();render();toast('Layanan disimpan');
}
function delSvc(id){if(!confirm('Hapus layanan ini? Order lama tidak terpengaruh.'))return;db.services=db.services.filter(s=>s.id!==id);save();closeSheet();render()}

/* ============ FINANCE ============ */
let finFrom,finTo,finTab='ringkas';
function setPeriod(p){const d=new Date();if(p==='hari')finFrom=finTo=today();else if(p==='bulan'){finFrom=dKey(new Date(d.getFullYear(),d.getMonth(),1));finTo=today()}else if(p==='lalu'){finFrom=dKey(new Date(d.getFullYear(),d.getMonth()-1,1));finTo=dKey(new Date(d.getFullYear(),d.getMonth(),0))}else if(p==='7'){const a=new Date();a.setDate(a.getDate()-6);finFrom=dKey(a);finTo=today()}vFin()}
function vFin(){
 setHeader('Keuangan',`<button class="hb" onclick="expForm()">+ Biaya</button>`);
 if(!finFrom){const d=new Date();finFrom=dKey(new Date(d.getFullYear(),d.getMonth(),1));finTo=today()}
 const inR=d=>{const k=dKey(d);return k>=finFrom&&k<=finTo};
 const pays=db.orders.flatMap(o=>o.payments.map(p=>({...p,o}))).filter(p=>inR(p.date)).sort((a,b)=>b.date.localeCompare(a.date));
 const income=pays.reduce((a,p)=>a+p.amount,0);
 const exps=db.expenses.filter(e=>e.date>=finFrom&&e.date<=finTo).sort((a,b)=>b.date.localeCompare(a.date));
 const expTot=exps.reduce((a,e)=>a+e.amount,0);
 const ordersIn=db.orders.filter(o=>inR(o.createdAt));
 const piut=db.orders.filter(o=>due(o)>0).sort((a,b)=>a.createdAt.localeCompare(b.createdAt));
 const svcSum={};ordersIn.forEach(o=>o.items.forEach(i=>{const s=svcSum[i.name]=svcSum[i.name]||{q:0,v:0,u:i.unit};s.q+=i.qty;s.v+=i.price*i.qty}));
 const per=[['hari','Hari ini'],['7','7 hari'],['bulan','Bulan ini'],['lalu','Bulan lalu']];
 let body='';
 if(finTab==='ringkas')body=`
  <div class="list">${METHODS.map(m=>`<div class="li" style="cursor:default"><div class="m"><div class="t">${m}</div></div><div class="amt">${rp(pays.filter(p=>p.method===m).reduce((a,p)=>a+p.amount,0))}</div></div>`).join('')}</div>
  <div class="sec-t">Layanan terlaris</div>
  <div class="list">${Object.keys(svcSum).length?Object.entries(svcSum).sort((a,b)=>b[1].v-a[1].v).map(([n,s])=>`<div class="li" style="cursor:default"><div class="m"><div class="t">${esc(n)}</div><div class="d">${+s.q.toFixed(2)} ${esc(s.u)}</div></div><div class="amt">${rp(s.v)}</div></div>`).join(''):'<div class="empty">Belum ada data</div>'}</div>
  <button class="btn sec blk" onclick="exportCSV()">⬇️ Export laporan (CSV)</button>`;
 else if(finTab==='masuk')body=`<div class="list">${pays.length?pays.map(p=>`<div class="li" onclick="showOrder('${p.o.id}')"><div class="m"><div class="t">${esc(cust(p.o.customerId).name)}</div><div class="d">${esc(p.o.code)} · ${p.method} · ${fShort(p.date)}</div></div><div class="amt" style="color:var(--ok)">+${rp(p.amount)}</div></div>`).join(''):'<div class="empty">Tidak ada pemasukan</div>'}</div>`;
 else if(finTab==='keluar')body=`<button class="btn blk" style="margin-bottom:12px" onclick="expForm()">+ Catat Pengeluaran</button><div class="list">${exps.length?exps.map(e=>`<div class="li" onclick="expForm('${e.id}')"><div class="m"><div class="t">${esc(e.category)}</div><div class="d">${esc(e.note||'-')} · ${fShort(e.date)}</div></div><div class="amt" style="color:var(--err)">-${rp(e.amount)}</div></div>`).join(''):'<div class="empty">Belum ada pengeluaran</div>'}</div>`;
 else body=`<div class="card" style="display:flex;justify-content:space-between"><span>Total piutang</span><b style="color:var(--err)">${rp(piut.reduce((a,o)=>a+due(o),0))}</b></div>
  <div class="list">${piut.length?piut.map(o=>`<div class="li" onclick="showOrder('${o.id}')"><div class="m"><div class="t">${esc(cust(o.customerId).name)}</div><div class="d">${esc(o.code)} · ${fShort(o.createdAt)}</div></div><div class="r"><div class="amt" style="color:var(--err)">${rp(due(o))}</div><div class="mut" style="font-size:11px">dari ${rp(o.total)}</div></div></div>`).join(''):'<div class="empty">Semua order lunas 🎉</div>'}</div>`;
 $('#main').innerHTML=`
 <div class="chips">${per.map(([k,n])=>`<button onclick="setPeriod('${k}')">${n}</button>`).join('')}</div>
 <div class="g2" style="margin-bottom:12px"><input type="date" value="${finFrom}" onchange="finFrom=this.value;vFin()"><input type="date" value="${finTo}" onchange="finTo=this.value;vFin()"></div>
 <div class="hero"><div class="l">Laba bersih</div><div class="v">${rp(income-expTot)}</div>
  <div class="s"><div><b>${rp(income)}</b>masuk</div><div><b>${rp(expTot)}</b>keluar</div><div><b>${ordersIn.length}</b>order</div></div></div>
 <div class="seg" style="margin-bottom:12px">${[['ringkas','Ringkas'],['masuk','Masuk'],['keluar','Keluar'],['piutang','Piutang']].map(([k,n])=>`<button class="${finTab===k?'on':''}" onclick="finTab='${k}';vFin()">${n}</button>`).join('')}</div>
 ${body}`;
}
function expForm(id){
 const e=id?db.expenses.find(x=>x.id===id):{date:today(),category:EXP_CAT[0],note:'',amount:''};
 openSheet(`<h2>${id?'Edit':'Catat'} Pengeluaran<button class="x" onclick="closeSheet()">×</button></h2>
 <div class="f"><label>Jumlah (Rp) *</label><input id="eA" type="number" inputmode="numeric" value="${e.amount}"></div>
 <div class="g2"><div class="f"><label>Tanggal</label><input id="eD" type="date" value="${e.date}"></div>
 <div class="f"><label>Kategori</label><select id="eC">${EXP_CAT.map(c=>`<option ${c===e.category?'selected':''}>${c}</option>`).join('')}</select></div></div>
 <div class="f"><label>Keterangan</label><input id="eN" value="${esc(e.note)}"></div>
 <button class="btn blk" onclick="saveExp('${id||''}')">Simpan</button>
 ${id?`<button class="btn err blk" style="margin-top:8px" onclick="if(confirm('Hapus pengeluaran ini?')){db.expenses=db.expenses.filter(x=>x.id!=='${id}');save();closeSheet();render()}">Hapus</button>`:''}`);
}
function saveExp(id){
 const amount=num($('#eA').value);if(amount<=0)return toast('Jumlah wajib diisi');
 const d={date:$('#eD').value||today(),category:$('#eC').value,note:$('#eN').value.trim(),amount};
 if(id)Object.assign(db.expenses.find(x=>x.id===id),d);else db.expenses.push({id:uid(),...d});
 save();closeSheet();render();toast('Pengeluaran dicatat');
}
function exportCSV(){
 const q=v=>'"'+String(v).replace(/"/g,'""')+'"';
 const rows=[];
 db.orders.forEach(o=>o.payments.forEach(p=>{const k=dKey(p.date);if(k>=finFrom&&k<=finTo)rows.push([k,'Pembayaran',o.code,cust(o.customerId).name,p.method,p.amount,0])}));
 db.expenses.filter(e=>e.date>=finFrom&&e.date<=finTo).forEach(e=>rows.push([e.date,'Pengeluaran',e.category,e.note,'',0,e.amount]));
 rows.sort((a,b)=>a[0].localeCompare(b[0]));rows.unshift(['Tanggal','Jenis','Referensi','Keterangan','Metode','Masuk','Keluar']);
 download(`laporan_${finFrom}_${finTo}.csv`,'﻿'+rows.map(r=>r.map(q).join(',')).join('\n'),'text/csv');
}
function download(name,content,type){
 const blob=new Blob([content],{type});
 try{const f=new File([blob],name,{type});if(navigator.canShare&&navigator.canShare({files:[f]})&&/Android|iPhone|iPad/i.test(navigator.userAgent)){navigator.share({files:[f],title:name}).catch(()=>{});return}}catch(e){}
 const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();a.remove();
}

/* ============ SETTINGS ============ */
function vSet(){
 setHeader('Pengaturan');const s=db.settings;
 brand={name:s.name,tagline:s.tagline,address:s.address,phone:s.phone,logo:s.logo,color:s.color||'#0b6bcb'};
 $('#main').innerHTML=`<div class="sec-t" style="margin-top:4px">Identitas laundry</div>
 <div class="card"><div id="brandBox">${brandFields()}</div>
  <div class="f"><label>Pesan bawah nota</label><textarea id="tF" rows="2">${esc(s.footer)}</textarea></div>
  <div class="g2"><div class="f"><label>Prefix no. nota</label><input id="tX" value="${esc(s.prefix)}"></div><div class="f"><label>Biaya express (%)</label><input id="tE" type="number" inputmode="numeric" value="${s.expressPct}"></div></div>
  <button class="btn blk" onclick="saveSet()">Simpan Pengaturan</button>
 </div>`;brandPreview(true);$('#main').innerHTML+=`
 <div class="sec-t">Backup & data</div>
 <div class="card">
  <p class="mut" style="margin-top:0;font-size:13.5px">Data tersimpan di HP ini. Backup rutin agar aman jika HP rusak/ganti, dan untuk pindah perangkat.</p>
  <p style="font-size:13.5px">${db.customers.length} pelanggan · ${db.orders.length} order · ${db.services.length} layanan · ${db.expenses.length} pengeluaran</p>
  <button class="btn blk" style="margin-bottom:8px" onclick="download('backup_'+slug(shopName())+'_'+today()+'.json',JSON.stringify(db),'application/json')">⬇️ Backup Data</button>
  <label class="btn sec blk" style="margin:0 0 8px;color:var(--tx)">⬆️ Restore dari Backup<input type="file" accept=".json,application/json" style="display:none" onchange="restore(this.files[0])"></label>
  <button class="btn sec blk" style="margin-bottom:8px" onclick="seedDemo()">Isi Data Contoh</button>
  <button class="btn err blk" onclick="if(confirm('Hapus SEMUA data? Tidak bisa dibatalkan.')&&confirm('Yakin? Pastikan sudah backup.')){db=defaultDB();save();applyBrand();render();showSetup()}">Reset Semua Data</button>
 </div>`;
}
function saveSet(){
 if(!brandSave())return;
 Object.assign(db.settings,{footer:$('#tF').value.trim(),prefix:$('#tX').value.trim()||'FW',expressPct:Math.max(0,num($('#tE').value))});
 save();render();toast('Pengaturan disimpan');
}
function restore(f){
 if(!f)return;const r=new FileReader();
 r.onload=()=>{try{const d=JSON.parse(r.result);if(!d.orders||!d.services||!d.settings)throw 0;if(!confirm('Ganti semua data saat ini dengan isi backup?'))return;db=d;if(!db.settings.color)db.settings.color='#0b6bcb';db.settings.setupDone=true;save();applyBrand();render();toast('Backup dipulihkan')}catch(e){toast('File backup tidak valid')}};
 r.readAsText(f);
}
function seedDemo(){
 const cs=[['Budi Santoso','081234567801'],['Siti Aminah','081234567802'],['Andi Wijaya','081234567803'],['Rina Marlina','081234567804'],['Dewi Lestari','081234567805'],['Agus Salim','081234567806']].map(([n,p])=>({id:uid(),name:n,phone:p,address:'',createdAt:new Date().toISOString()}));
 db.customers.push(...cs);const tmp=[];
 for(let i=0;i<28;i++){
  const d=new Date();d.setDate(d.getDate()-Math.floor(Math.random()*20));d.setHours(8+Math.floor(Math.random()*10),Math.floor(Math.random()*60));
  const s=db.services[Math.floor(Math.random()*db.services.length)];
  const qty=s.unit==='kg'?+(2+Math.random()*6).toFixed(1):1+Math.floor(Math.random()*2);
  const total=Math.round(s.price*qty),age=(Date.now()-d)/864e5;
  const status=age>4?'diambil':age>2?(Math.random()<.5?'siap':'diambil'):STATUSES[Math.floor(Math.random()*3)].k;
  const pr=Math.random(),pay=status==='diambil'||pr<.5?total:pr<.75?Math.round(total/2/1000)*1000:0;
  const du=new Date(d);du.setDate(du.getDate()+s.days);
  tmp.push({id:uid(),customerId:cs[i%cs.length].id,items:[{name:s.name,unit:s.unit,price:s.price,qty}],subtotal:total,expressFee:0,express:false,discount:0,total,note:'',
   payments:pay?[{date:d.toISOString(),amount:pay,method:METHODS[Math.floor(Math.random()*3)]}]:[],status,history:[{status:'diterima',date:d.toISOString()}],createdAt:d.toISOString(),dueAt:du.toISOString()});
 }
 tmp.sort((a,b)=>a.createdAt.localeCompare(b.createdAt)).forEach(o=>{o.code=db.settings.prefix+dKey(o.createdAt).slice(2).replace(/-/g,'')+'-'+String(db.seq++).padStart(4,'0');db.orders.push(o)});
 [['Deterjen & Pewangi','Deterjen 5L x2',180000],['Listrik','Token listrik',250000],['Plastik & Kemasan','Plastik laundry',60000]].forEach(([c,n,a],i)=>{const d=new Date();d.setDate(d.getDate()-i*3);db.expenses.push({id:uid(),date:dKey(d),category:c,note:n,amount:a})});
 save();stack=[];go('home');toast('Data contoh ditambahkan');
}

/* ============ PWA ============ */
if('serviceWorker' in navigator&&location.protocol!=='file:')window.addEventListener('load',()=>navigator.serviceWorker.register('sw.js').catch(()=>{}));
applyBrand();render();
if(!db.settings.setupDone)showSetup();
