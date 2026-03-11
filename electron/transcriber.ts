import { execFile } from 'child_process'
import { readFileSync, existsSync, statSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'

type ProgressCallback = (progress: { status: string; progress?: number }) => void

export class Transcriber {
  private pipe: any = null
  private modelReady = false

  isModelReady(): boolean {
    return this.modelReady
  }

  /**
   * Download and prepare the Whisper model (called from Settings).
   * Separating this from transcribe() so users can prep ahead of time.
   */
  async prepareModel(modelName: string, onProgress: ProgressCallback) {
    onProgress({ status: 'Loading Whisper engine...', progress: 0 })

    const importModule = new Function('specifier', 'return import(specifier)')
    const { pipeline, env } = await importModule('@huggingface/transformers')
    env.cacheDir = join(app.getPath('userData'), 'models')

    onProgress({ status: 'Downloading model...', progress: 5 })

    this.pipe = await pipeline('automatic-speech-recognition', modelName, {
      progress_callback: (data: any) => {
        if (data.status === 'progress') {
          onProgress({ status: 'Downloading model...', progress: Math.round(data.progress) })
        } else if (data.status === 'ready') {
          onProgress({ status: 'Model ready', progress: 100 })
        }
      }
    })

    this.modelReady = true
    onProgress({ status: 'Model ready', progress: 100 })
  }

  /**
   * Transcribe audio. Model must be prepared first via prepareModel().
   */
  async transcribe(audioPath: string, onProgress: ProgressCallback) {
    if (!this.pipe) {
      throw new Error('Model not loaded. Please download the model in Settings first.')
    }

    // Step 1: Convert WebM → 16kHz mono PCM WAV via ffmpeg
    onProgress({ status: 'Converting audio format...', progress: 10 })
    const wavPath = audioPath.replace('.webm', '.wav')
    await this.convertToWav(audioPath, wavPath)

    // Step 2: Verify the WAV file exists and has content
    if (!existsSync(wavPath)) {
      throw new Error('Audio conversion failed: WAV file not created')
    }
    const wavStat = statSync(wavPath)
    if (wavStat.size < 100) {
      throw new Error(`Audio conversion produced empty file (${wavStat.size} bytes)`)
    }

    onProgress({ status: 'Conversion complete, reading audio...', progress: 30 })

    // Step 3: Parse WAV into Float32Array
    const audioData = this.readWavAsFloat32(wavPath)
    if (audioData.length === 0) {
      throw new Error('No audio samples found in WAV file')
    }

    onProgress({ status: `Transcribing ${Math.round(audioData.length / 16000)}s of audio...`, progress: 40 })

    // Step 4: Run Whisper
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
      text: (chunk.text || '').trim()
    })).filter((s: any) => s.text.length > 0)

    const fullText = segments.map((s: any) => s.text).join(' ')

    onProgress({ status: 'Complete', progress: 100 })

    return { segments, fullText }
  }

  /**
   * Parse a 16kHz mono 16-bit PCM WAV file into a Float32Array.
   */
  private readWavAsFloat32(wavPath: string): Float32Array {
    const buffer = readFileSync(wavPath)

    if (buffer.length < 44) {
      throw new Error(`WAV file too small (${buffer.length} bytes)`)
    }

    // Verify RIFF header
    const riff = buffer.toString('ascii', 0, 4)
    if (riff !== 'RIFF') {
      throw new Error(`Not a valid WAV file (header: ${riff})`)
    }

    // Find the 'data' chunk
    let offset = 12
    while (offset < buffer.length - 8) {
      const chunkId = buffer.toString('ascii', offset, offset + 4)
      const chunkSize = buffer.readUInt32LE(offset + 4)

      if (chunkId === 'data') {
        const dataStart = offset + 8
        const numSamples = Math.floor(chunkSize / 2)
        const float32 = new Float32Array(numSamples)

        for (let i = 0; i < numSamples; i++) {
          const bytePos = dataStart + i * 2
          if (bytePos + 1 >= buffer.length) break
          float32[i] = buffer.readInt16LE(bytePos) / 32768
        }

        return float32
      }

      // Move to next chunk (pad to even boundary)
      offset += 8 + chunkSize + (chunkSize % 2)
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

      // Full explicit conversion pipeline:
      // -vn: strip video, -acodec pcm_s16le: force 16-bit PCM
      // -ar 16000: 16kHz sample rate, -ac 1: mono
      execFile(ffmpegPath, [
        '-y',
        '-i', input,
        '-vn',
        '-acodec', 'pcm_s16le',
        '-ar', '16000',
        '-ac', '1',
        output
      ], { timeout: 60000 }, (err, _stdout, stderr) => {
        if (err) {
          reject(new Error(`ffmpeg failed: ${err.message}\n${stderr}`))
        } else {
          resolve()
        }
      })
    })
  }
}
