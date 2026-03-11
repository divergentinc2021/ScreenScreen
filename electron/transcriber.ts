import { execFile } from 'child_process'
import { readFileSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'

type ProgressCallback = (progress: { status: string; progress?: number }) => void

export class Transcriber {
  private pipe: any = null

  async ensureModel(onProgress: ProgressCallback) {
    if (this.pipe) return

    onProgress({ status: 'Loading Whisper model...', progress: 0 })

    // Use Function trick to prevent TypeScript from converting import() to require()
    // @huggingface/transformers is ESM-only and cannot be require()'d
    const importModule = new Function('specifier', 'return import(specifier)')
    const { pipeline, env } = await importModule('@huggingface/transformers')
    env.cacheDir = join(app.getPath('userData'), 'models')

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

    // Convert webm to 16kHz mono WAV using ffmpeg
    onProgress({ status: 'Converting audio...', progress: 0 })
    const wavPath = audioPath.replace('.webm', '.wav')
    await this.convertToWav(audioPath, wavPath)

    // Read WAV as raw Float32Array (Node.js has no AudioContext)
    onProgress({ status: 'Reading audio...', progress: 0 })
    const audioData = this.readWavAsFloat32(wavPath)

    onProgress({ status: 'Transcribing...', progress: 0 })

    const result = await this.pipe(audioData, {
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

  /**
   * Parse a 16kHz mono 16-bit PCM WAV file into a Float32Array.
   * ffmpeg outputs little-endian signed 16-bit samples (pcm_s16le).
   */
  private readWavAsFloat32(wavPath: string): Float32Array {
    const buffer = readFileSync(wavPath)

    // Find the 'data' chunk — skip the RIFF header and search for marker
    let dataOffset = 12
    while (dataOffset < buffer.length - 8) {
      const chunkId = buffer.toString('ascii', dataOffset, dataOffset + 4)
      const chunkSize = buffer.readUInt32LE(dataOffset + 4)
      if (chunkId === 'data') {
        dataOffset += 8
        const numSamples = chunkSize / 2 // 16-bit = 2 bytes per sample
        const float32 = new Float32Array(numSamples)
        for (let i = 0; i < numSamples; i++) {
          const sample = buffer.readInt16LE(dataOffset + i * 2)
          float32[i] = sample / 32768 // normalize to [-1, 1]
        }
        return float32
      }
      dataOffset += 8 + chunkSize
    }

    throw new Error('Invalid WAV file: no data chunk found')
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
        '-sample_fmt', 's16',
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
