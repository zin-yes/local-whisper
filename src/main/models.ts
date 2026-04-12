import { app } from 'electron'
import * as path from 'path'
import * as fs from 'fs'
import * as https from 'https'
import * as http from 'http'
import { WHISPER_MODELS, WhisperModel } from '../shared/types'
import { isModelDownloaded, getModelPath } from './whisper'

function getModelsDir(): string {
  const dir = path.join(app.getPath('userData'), 'models')
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  return dir
}

export function listModels(): WhisperModel[] {
  return WHISPER_MODELS.map(model => ({
    ...model,
    downloaded: isModelDownloaded(model.id),
    filePath: isModelDownloaded(model.id) ? getModelPath(model.id) : undefined
  }))
}

export function downloadModel(
  modelId: string,
  onProgress?: (percent: number) => void
): Promise<string> {
  return new Promise((resolve, reject) => {
    const modelDef = WHISPER_MODELS.find(m => m.id === modelId)
    if (!modelDef) {
      reject(new Error(`Unknown model: ${modelId}`))
      return
    }

    const destPath = path.join(getModelsDir(), `ggml-${modelId}.bin`)
    const tempPath = destPath + '.tmp'

    const makeRequest = (url: string) => {
      const client = url.startsWith('https') ? https : http

      client.get(url, { headers: { 'User-Agent': 'LocalWhisper/1.0' } }, (response) => {
        // Handle redirects
        if (response.statusCode === 301 || response.statusCode === 302) {
          const redirectUrl = response.headers.location
          if (redirectUrl) {
            makeRequest(redirectUrl)
            return
          }
        }

        if (response.statusCode !== 200) {
          reject(new Error(`Download failed: HTTP ${response.statusCode}`))
          return
        }

        const totalBytes = parseInt(response.headers['content-length'] || '0', 10)
        let downloadedBytes = 0

        const file = fs.createWriteStream(tempPath)

        response.on('data', (chunk: Buffer) => {
          downloadedBytes += chunk.length
          if (totalBytes > 0) {
            const percent = Math.round((downloadedBytes / totalBytes) * 100)
            onProgress?.(percent)
          }
        })

        response.pipe(file)

        file.on('finish', () => {
          file.close(() => {
            fs.renameSync(tempPath, destPath)
            resolve(destPath)
          })
        })

        file.on('error', (err) => {
          fs.unlinkSync(tempPath)
          reject(err)
        })
      }).on('error', reject)
    }

    makeRequest(modelDef.url)
  })
}

export function deleteModel(modelId: string): boolean {
  const modelPath = getModelPath(modelId)
  if (fs.existsSync(modelPath)) {
    fs.unlinkSync(modelPath)
    return true
  }
  return false
}
