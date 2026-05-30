import { createReadStream, existsSync, statSync } from 'node:fs'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import http from 'node:http'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const rootDir = normalize(join(__dirname, '..', 'dist-demo'))
const portArgIndex = process.argv.indexOf('--port')
const port = portArgIndex >= 0 ? Number(process.argv[portArgIndex + 1]) : 4173

if (!Number.isFinite(port) || port <= 0) {
  throw new Error(`Invalid --port value: ${process.argv[portArgIndex + 1] ?? '(missing)'}`)
}

const contentTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
  ['.ico', 'image/x-icon'],
  ['.txt', 'text/plain; charset=utf-8'],
])

function resolvePath(urlPath) {
  const cleanPath = urlPath.split('?')[0].split('#')[0]
  const relative = cleanPath === '/' ? '/index.html' : cleanPath
  const candidate = normalize(join(rootDir, relative))
  if (!candidate.startsWith(rootDir)) return null
  if (!existsSync(candidate)) return null
  const stat = statSync(candidate)
  if (stat.isDirectory()) {
    const indexFile = join(candidate, 'index.html')
    return existsSync(indexFile) ? indexFile : null
  }
  return candidate
}

const server = http.createServer((req, res) => {
  const resolved = resolvePath(req.url ?? '/')
  if (!resolved) {
    res.statusCode = 404
    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    res.end('Not found')
    return
  }

  res.statusCode = 200
  res.setHeader('Content-Type', contentTypes.get(extname(resolved)) ?? 'application/octet-stream')
  createReadStream(resolved).pipe(res)
})

server.listen(port, '127.0.0.1', () => {
  process.stdout.write(`Static demo server listening on http://127.0.0.1:${port}\n`)
})
