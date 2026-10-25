import { defineConfig } from 'astro/config';
import { loadEnv } from 'vite';

/* Saat `npm run dev`, jalankan juga fungsi server di folder api/ (pesan mandiri lewat QR),
   sehingga QR bisa dicoba dari HP di Wi-Fi yang sama tanpa `vercel dev`.
   Di produksi (Vercel) folder api/ dijalankan Vercel sendiri — integrasi ini hanya aktif di mode dev.
   Kunci Dexie Cloud dibaca dari file .env (DEXIE_CLOUD_DB_URL, DEXIE_CLOUD_CLIENT_ID, DEXIE_CLOUD_CLIENT_SECRET). */
function devApi() {
  return {
    name: 'wepos-dev-api',
    apply: 'serve',
    configureServer(server) {
      const env = loadEnv('development', process.cwd(), '');
      for (const k of ['DEXIE_CLOUD_DB_URL', 'DEXIE_CLOUD_CLIENT_ID', 'DEXIE_CLOUD_CLIENT_SECRET', 'PUBLIC_DEXIE_CLOUD_URL']) if (env[k] && !process.env[k]) process.env[k] = env[k];
      const handle = async (req, res, next) => {
        const m = /^\/api\/([a-z]+)\/?(?:\?|$)/.exec(req.url || '');
        if (!m) return next();
        let mod;
        try { mod = await server.ssrLoadModule(`/api/${m[1]}.js`); }
        catch { res.statusCode = 404; res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify({ error: `Endpoint /api/${m[1]} tidak ada.` })); }
        req.query = Object.fromEntries(new URL(req.url, 'http://x').searchParams);
        await mod.default(req, res);
      };
      // Dijalankan setelah middleware Astro terpasang, lalu ditaruh paling depan
      // agar /api/menu?… (tanpa garis miring) tidak ditolak aturan trailingSlash Astro.
      return () => { server.middlewares.stack.unshift({ route: '', handle }); };
    },
  };
}

// Jika di-deploy di sub-folder (mis. GitHub Pages https://user.github.io/we-pos/),
// isi base: '/we-pos/'.
export default defineConfig({
  base: '/',
  output: 'static',
  devToolbar: { enabled: false }, // toolbar dev menutupi navigasi bawah di layar HP
  trailingSlash: 'always',
  build: { format: 'directory' },
  vite: { plugins: [devApi()] },
});
