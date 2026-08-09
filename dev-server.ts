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
    // Serve the client through Vite in middleware mode (single-port dev).
    // The HTTP server must exist before Vite starts so its HMR websocket can
    // attach to it — otherwise HMR silently fails to connect and the client
    // never recovers from a stale/cold module graph.
    const httpServer = app.listen(port, () => {
      console.log(`\n  ➜  Ascend Protocol running at http://localhost:${port}\n`);
    });

    const { createServer } = await import('vite');
    const vite = await createServer({
      server: { middlewareMode: true, hmr: { server: httpServer } },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }
})();
