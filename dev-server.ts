/**
 * Local dev / prod server entry.
 *
 * This is intentionally NOT imported by the Vercel serverless function — it
 * pulls in Vite (dev) and static file serving, which must never be bundled into
 * the serverless API function. Vercel only uses `server.ts` (via `api/index.ts`).
 *
 *  - `npm run dev`   -> tsx dev-server.ts       (Vite middleware, single port)
 *  - `npm run start` -> node dist/server.cjs    (serves prebuilt dist/)
 */
import express from 'express';
import app from './server';

const port = Number(process.env.PORT) || 3000;
const isProd = process.env.NODE_ENV === 'production';

(async () => {
  const path = await import('node:path');

  if (isProd) {
    // Serve the prebuilt client.
    const distDir = path.resolve('dist');
    const distIndex = path.join(distDir, 'index.html');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => res.sendFile(distIndex));

    app.listen(port, () => {
      console.log(`\n  ➜  Ascend Protocol running at http://localhost:${port}\n`);
    });
  } else {
    // Serve the client through Vite in middleware mode.
    //
    // HMR gets its own port rather than sharing this server's `upgrade` event.
    // Sharing is the tidier-looking setup but it was silently failing here, and
    // a dead HMR socket is worse than no HMR: when Vite re-optimises deps it
    // can no longer tell the browser to reload, so the page keeps its cached
    // pre-bundle and ends up loading two different copies of React — which
    // renders as a blank screen that only a cache-bypassing reload clears.
    app.listen(port, () => {
      console.log(`\n  ➜  Ascend Protocol running at http://localhost:${port}\n`);
    });

    const { createServer } = await import('vite');
    const vite = await createServer({
      server: { middlewareMode: true, hmr: { port: port + 1 } },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }
})();
