import { Buffer } from 'node:buffer'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Dev-only: streams an Azure Blob file through the dev server so the browser can read it same-origin
// (no CORS) and show it inline instead of downloading it. Production needs the same on the backend.
const blobProxy = () => ({
  name: 'blob-proxy',
  configureServer(server) {
    server.middlewares.use('/blob-proxy', async (req, res) => {
      try {
        const target = new URL(new URL(req.url, 'http://localhost').searchParams.get('u'))
        if (target.protocol !== 'https:' || !target.hostname.endsWith('.blob.core.windows.net')) {
          res.statusCode = 400
          return res.end('Only Azure Blob URLs can be proxied.')
        }
        const upstream = await fetch(target)
        res.statusCode = upstream.status
        res.setHeader('Content-Type', 'application/pdf')
        res.setHeader('Content-Disposition', 'inline')
        res.end(Buffer.from(await upstream.arrayBuffer()))
      } catch {
        res.statusCode = 502
        res.end('Unable to fetch the document.')
      }
    })
  },
})

export default defineConfig({
  plugins: [react(), tailwindcss(), blobProxy()],
})
