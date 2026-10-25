/* We POS — titik masuk aplikasi (Astro + Dexie + PWA). */
import { App, S, sess, $, BASE, closeSheet, track, applyTheme } from './core';
// Pakai warna toko terakhir sejak layar pertama (sebelum data dimuat)
try { applyTheme(localStorage.getItem('wp_theme') || undefined); } catch {}
import { renderPage } from './shell';
import { initAuth, renderOverlay } from './auth';
import './pos';
import './tables';
import './kitchen';
import './menu';
import './report';
import './admin';
import './selfmenu';

(window as any).App = App;
App.track = track;
import('../lib/db').then((m) => (App._debug = { db: m.db, sess, S })); // untuk pengecekan/dukungan teknis

document.addEventListener('astro:page-load', () => {
  $('#sheetBg')?.addEventListener('click', closeSheet);
  S.view = document.body.dataset.page || 'pos';
  if (sess.phase === 'ready') renderPage(); else { const o = $('#overlay'); if (o) o.dataset.k = ''; renderOverlay(); }
});
document.addEventListener('astro:before-swap', () => closeSheet());
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheet(); });
window.addEventListener('popstate', () => closeSheet());

initAuth();

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => navigator.serviceWorker.register(BASE + 'sw.js').catch(() => {}));
}
