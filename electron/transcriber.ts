import { pipeline, env } from '@huggingface/transformers'
import { execFile } from 'child_process'
import { join, dirname } from 'path'
import { existsSync, mkdirSync } from 'fs'
import { app } from 'electron'

// Use app data for model cache
env.cacheDir = join(app.getPath('userData'), 'models')

type ProgressCallback = (progress: { status: string; progress?: number }) => void

export class Transcriber {
  private pipe: any = null

  async ensureModel(onProgress: ProgressCallback) {
    if (this.pipe) return

    onProgress({ status: 'Loading Whisper model...', progress: 0 })

    this.pipe = await pipeline('automatic-speech-recognition', 'Xenova/whisper-small', {
      progress_callback: (data: any) => {
        if (data.status === 'progress') {
          onProgress({ status: 'Downloading model...', progress: Math.round(data.progress) })
        }
      }
    })

    onProgress({ status: 'Model loaded', progress: 100 })
  }

  async transcribe(audioPath: string, onProgress: ProgressCallback) {
    await this.ensureModel(onProgress)

    // Convert webm to wav using ffmpeg-static
    onProgress({ status: 'Converting audio...', progress: 0 })
    const wavPath = audioPath.replace('.webm', '.wav')
    await this.convertToWav(audioPath, wavPath)

    onProgress({ status: 'Transcribing...', progress: 0 })

    const result = await this.pipe(wavPath, {
      return_timestamps: true,
      chunk_length_s: 30,
      stride_length_s: 5,
      language: 'english',
      task: 'transcribe'
    })

    const segments = (result.chunks || []).map((chunk: any) => ({
      start: chunk.timestamp[0] || 0,
      end: chunk.timestamp[1] || 0,
      text: chunk.text.trim()
    }))

    const fullText = segments.map((s: any) => s.text).join(' ')

    onProgress({ status: 'Complete', progress: 100 })

    return { segments, fullText }
  }

  private convertToWav(input: string, output: string): Promise<void> {
    return new Promise((resolve, reject) => {
      let ffmpegPath: string

      try {
        ffmpegPath = require('ffmpeg-static')
      } catch {
        ffmpegPath = 'ffmpeg'
      }

      execFile(ffmpegPath, [
        '-i', input,
        '-ar', '16000',
        '-ac', '1',
        '-f', 'wav',
        '-y',
        output
      ], (err) => {
        if (err) reject(err)
        else resolve()
      })
    })
  }
}
