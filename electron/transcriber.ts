import { execFile } from 'child_process'
import { readFileSync, existsSync, statSync } from 'fs'

type ProgressCallback = (progress: { status: string; progress?: number }) => void

/**
 * Transcriber — converts audio and uploads to Cloudflare Workers AI Whisper.
 * No local model needed; all inference happens on Cloudflare.
 */
export class Transcriber {

  async transcribe(audioPath: string, workerUrl: string, onProgress: ProgressCallback) {
    if (!workerUrl) {
      throw new Error('Worker URL not configured. Set it in Settings first.')
    }

    // Step 1: Convert WebM → WAV (16kHz mono PCM) for Whisper
    onProgress({ status: 'Converting audio...', progress: 10 })
    const wavPath = audioPath.replace('.webm', '.wav')
    await this.convertToWav(audioPath, wavPath)

    // Verify conversion
    if (!existsSync(wavPath)) {
      throw new Error('Audio conversion failed: WAV file not created')
    }
    const stat = statSync(wavPath)
    if (stat.size < 100) {
      throw new Error(`Audio conversion produced empty file (${stat.size} bytes)`)
    }

    onProgress({ status: 'Reading audio...', progress: 30 })
    const audioBuffer = readFileSync(wavPath)

    // Step 2: Upload to Cloudflare Workers AI Whisper
    onProgress({ status: 'Uploading to Whisper AI...', progress: 40 })
    const res = await fetch(`${workerUrl}/api/transcribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: audioBuffer
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
      throw new Error(`Transcription API error: ${(err as any).error || res.status}`)
    }

    onProgress({ status: 'Processing transcript...', progress: 90 })
    const result = await res.json() as { segments: any[]; fullText: string }

    onProgress({ status: 'Complete', progress: 100 })
    return result
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
        '-y',
        '-i', input,
        '-vn',
        '-acodec', 'pcm_s16le',
        '-ar', '16000',
        '-ac', '1',
        output
      ], { timeout: 120000 }, (err, _stdout, stderr) => {
        if (err) {
          reject(new Error(`ffmpeg failed: ${err.message}\n${stderr}`))
        } else {
          resolve()
        }
      })
    })
  }
}
