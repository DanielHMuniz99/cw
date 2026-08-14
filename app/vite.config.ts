import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { mkdir, readdir, stat, writeFile } from 'node:fs/promises'

function safeJsonParse(rawBody: string) {
  try {
    return JSON.parse(rawBody)
  } catch {
    return null
  }
}

function readRawBody(request: import('node:http').IncomingMessage) {
  return new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = []

    request.on('data', (chunk) => {
      chunks.push(Buffer.from(chunk))
    })

    request.on('end', () => {
      resolve(Buffer.concat(chunks).toString('utf-8'))
    })

    request.on('error', (error) => {
      reject(error)
    })
  })
}

function sanitizeFileName(fileName: string) {
  return fileName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

function mapCentersApi() {
  const rootDir = path.dirname(fileURLToPath(import.meta.url))
  const mapsDir = path.resolve(rootDir, 'public/maps')
  const mapsJsonDir = path.resolve(rootDir, 'public/json/maps')

  return {
    name: 'map-centers-api',
    configureServer(server: import('vite').ViteDevServer) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url) {
          next()
          return
        }

        if (req.method === 'GET' && req.url === '/api/map-centers/assets') {
          try {
            await mkdir(mapsDir, { recursive: true })
            const files = await readdir(mapsDir)
            const allowed = files.filter((file) => /\.(png|bmp)$/i.test(file)).sort()

            res.statusCode = 200
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify(allowed))
            return
          } catch {
            res.statusCode = 500
            res.end('Falha ao listar imagens')
            return
          }
        }

        if (req.method === 'GET' && req.url === '/api/map-centers/json-assets') {
          try {
            await mkdir(mapsJsonDir, { recursive: true })

            const files = await readdir(mapsJsonDir)

            const allowed = files
              .filter((file) => /\.json$/i.test(file))
              .sort()

            res.statusCode = 200
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify(allowed))
            return
          } catch {
            res.statusCode = 500
            res.end('Falha ao listar mapas')
            return
          }
        }

        if (req.method === 'POST' && req.url === '/api/map-centers/upload') {
          try {
            const rawBody = await readRawBody(req)
            const payload = safeJsonParse(rawBody)
            const fileNameRaw = String(payload?.fileName ?? '')
            const dataUrl = String(payload?.dataUrl ?? '')
            const fileName = sanitizeFileName(fileNameRaw)

            if (!fileName || !/\.(png|bmp)$/i.test(fileName)) {
              res.statusCode = 400
              res.end('Nome de arquivo invalido. Use PNG ou BMP.')
              return
            }

            const match = dataUrl.match(/^data:image\/(png|bmp|x-ms-bmp);base64,(.+)$/i)
            if (!match) {
              res.statusCode = 400
              res.end('Conteudo de imagem invalido.')
              return
            }

            const base64Content = match[2]
            const fileBuffer = Buffer.from(base64Content, 'base64')
            await mkdir(mapsDir, { recursive: true })
            await writeFile(path.join(mapsDir, fileName), fileBuffer)

            res.statusCode = 200
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({
              fileName,
              publicPath: `/maps/${fileName}`,
            }))
            return
          } catch {
            res.statusCode = 500
            res.end('Falha ao salvar imagem em public/maps')
            return
          }
        }

        if (req.method === 'POST' && req.url === '/api/map-centers/save') {
          try {
            const rawBody = await readRawBody(req)
            const payload = safeJsonParse(rawBody)
            const fileNameRaw = String(payload?.fileName ?? '')
            const mapData = payload?.map
            const baseFileName = sanitizeFileName(fileNameRaw)

            if (!baseFileName || !baseFileName.endsWith('.json')) {
              res.statusCode = 400
              res.end('Arquivo invalido. Use extensao .json')
              return
            }

            if (!mapData || typeof mapData !== 'object') {
              res.statusCode = 400
              res.end('Conteudo de mapa invalido')
              return
            }

            await mkdir(mapsJsonDir, { recursive: true })

            const now = new Date()
            const stamp = [
              now.getUTCFullYear(),
              String(now.getUTCMonth() + 1).padStart(2, '0'),
              String(now.getUTCDate()).padStart(2, '0'),
              '-',
              String(now.getUTCHours()).padStart(2, '0'),
              String(now.getUTCMinutes()).padStart(2, '0'),
              String(now.getUTCSeconds()).padStart(2, '0'),
            ].join('')

            let finalFileName = baseFileName
            let finalPath = path.join(mapsJsonDir, finalFileName)

            try {
              await stat(finalPath)
              finalFileName = `${baseFileName.replace(/\.json$/, '')}-${stamp}.json`
              finalPath = path.join(mapsJsonDir, finalFileName)
            } catch {
              finalPath = path.join(mapsJsonDir, finalFileName)
            }

            const content = {
              schemaVersion: 1,
              createdAt: now.toISOString(),
              ...mapData,
            }

            await writeFile(finalPath, `${JSON.stringify(content, null, 2)}\n`, 'utf-8')

            res.statusCode = 200
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({
              fileName: finalFileName,
              message: `Mapa salvo em public/json/maps/${finalFileName}`,
            }))
            return
          } catch {
            res.statusCode = 500
            res.end('Falha ao salvar JSON do mapa')
            return
          }
        }

        next()
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue(), mapCentersApi()],
})
