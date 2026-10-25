// Dijalankan setelah `astro build`: membuat dist/sw.js berisi daftar file
// yang di-precache, sehingga aplikasi bisa dibuka offline.
import { readdirSync, statSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { createHash } from 'node:crypto';

const DIST = 'dist';
const files = [];
(function walk(dir) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (!/\.(map|txt|woff)$/.test(f) && !/^(guide|landing)-/.test(f) && !p.includes(join('img', '')) && f !== 'sw.js') files.push(p);
  }
})(DIST);

const hash = createHash('sha256');
const urls = files.sort().map((p) => {
  hash.update(readFileSync(p));
  let u = './' + relative(DIST, p).split(sep).join('/');
  if (u.endsWith('/index.html')) u = u.slice(0, -'index.html'.length);
  return u;
});
const version = 'wepos-' + hash.digest('hex').slice(0, 10);
const tpl = readFileSync('scripts/sw-template.js', 'utf8')
  .replace('__VERSION__', version)
  .replace('__PRECACHE__', JSON.stringify(urls, null, 1));
writeFileSync(join(DIST, 'sw.js'), tpl);
console.log(`[sw] ${urls.length} file di-precache, versi ${version}`);
