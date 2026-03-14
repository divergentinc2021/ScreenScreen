import { execFile } from 'child_process'
import { readFileSync, existsSync, statSync } from 'fs'

type ProgressCallback = (progress: { status: string; progress?: number }) => void

// 25 seconds of 16kHz 16-bit mono PCM = 800,000 bytes of audio data
const CHUNK_SECONDS = 25
const SAMPLE_RATE = 16000
const BYTES_PER_SAMPLE = 2 // 16-bit
const WAV_HEADER_SIZE = 44
const CHUNK_DATA_SIZE = CHUNK_SECONDS * SAMPLE_RATE * BYTES_PER_SAMPLE // 800KB

/**
 * Transcriber — converts audio to WAV, chunks by time, uploads each chunk
 * to Cloudflare Workers AI Whisper individually, and stitches results.
 */
export class Transcriber {

  async transcribe(audioPath: string, workerUrl: string, onProgress: ProgressCallback, options?: { language?: string; task?: string }) {
    if (!workerUrl) {
      throw new Error('Worker URL not configured. Set it in Settings first.')
    }

    // Step 1: Convert WebM → WAV (16kHz mono PCM) for Whisper
    onProgress({ status: 'Converting audio…', progress: 5 })
    const wavPath = audioPath.replace('.webm', '.wav')
    await this.convertToWav(audioPath, wavPath)

    if (!existsSync(wavPath)) {
      throw new Error('Audio conversion failed: WAV file not created')
    }
    const stat = statSync(wavPath)
    if (stat.size < 100) {
      throw new Error(`Audio conversion produced empty file (${stat.size} bytes)`)
    }

    onProgress({ status: 'Reading audio…', progress: 10 })
    const wavBuffer = readFileSync(wavPath)

    // Step 2: Split WAV into time-based chunks
    const audioDataSize = wavBuffer.length - WAV_HEADER_SIZE
    const totalChunks = Math.ceil(audioDataSize / CHUNK_DATA_SIZE)
    const totalDuration = audioDataSize / (SAMPLE_RATE * BYTES_PER_SAMPLE)

    onProgress({ status: `Transcribing ${totalChunks} chunks (${Math.round(totalDuration)}s)…`, progress: 15 })

    // Step 3: Transcribe each chunk
    const allSegments: { start: number; end: number; text: string }[] = []
    const allTexts: string[] = []
    let failedChunks = 0

    for (let i = 0; i < totalChunks; i++) {
      const dataStart = WAV_HEADER_SIZE + (i * CHUNK_DATA_SIZE)
      const dataEnd = Math.min(dataStart + CHUNK_DATA_SIZE, wavBuffer.length)
      const chunkDataSize = dataEnd - dataStart
      const startTime = i * CHUNK_SECONDS
      const endTime = startTime + (chunkDataSize / (SAMPLE_RATE * BYTES_PER_SAMPLE))

      // Create a valid WAV file for this chunk
      const chunkWav = this.createWavChunk(wavBuffer.subarray(dataStart, dataEnd), chunkDataSize)

      const pct = 15 + Math.round(((i + 1) / totalChunks) * 75)
      onProgress({ status: `Transcribing chunk ${i + 1}/${totalChunks}…`, progress: pct })

      try {
        const params = new URLSearchParams()
        if (options?.language) params.set('language', options.language)
        if (options?.task) params.set('task', options.task)
        const transcribeUrl = `${workerUrl}/api/transcribe${params.toString() ? '?' + params : ''}`

        const res = await fetch(transcribeUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/octet-stream' },
          body: new Uint8Array(chunkWav),
        })

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
          console.warn(`Chunk ${i + 1} failed:`, (err as any).error)
          failedChunks++
          continue
        }

        const result = await res.json() as { segments: any[]; fullText: string }

        if (result.fullText) {
          allTexts.push(result.fullText)
        }

        if (result.segments) {
          const offset = result.segments.map((s: any) => ({
            start: s.start + startTime,
            end: s.end + startTime,
            text: s.text,
          }))
          allSegments.push(...offset)
        }
      } catch (err: any) {
        console.warn(`Chunk ${i + 1} error:`, err.message)
        failedChunks++
      }
    }

    if (allTexts.length === 0) {
      throw new Error(`All ${totalChunks} chunks failed to transcribe`)
    }

    const statusMsg = failedChunks > 0
      ? `Transcribed ${totalChunks - failedChunks}/${totalChunks} chunks`
      : 'Complete'
    onProgress({ status: statusMsg, progress: 100 })

    return {
      segments: allSegments,
      fullText: allTexts.join(' '),
    }
  }

  /** Create a valid WAV file from raw PCM data */
  private createWavChunk(pcmData: Buffer, dataSize: number): Buffer {
    const header = Buffer.alloc(WAV_HEADER_SIZE)
    // RIFF header
    header.write('RIFF', 0)
    header.writeUInt32LE(36 + dataSize, 4)
    header.write('WAVE', 8)
    // fmt chunk
    header.write('fmt ', 12)
    header.writeUInt32LE(16, 16)       // chunk size
    header.writeUInt16LE(1, 20)        // PCM format
    header.writeUInt16LE(1, 22)        // mono
    header.writeUInt32LE(SAMPLE_RATE, 24)
    header.writeUInt32LE(SAMPLE_RATE * BYTES_PER_SAMPLE, 28) // byte rate
    header.writeUInt16LE(BYTES_PER_SAMPLE, 32)  // block align
    header.writeUInt16LE(16, 34)       // bits per sample
    // data chunk
    header.write('data', 36)
    header.writeUInt32LE(dataSize, 40)

    return Buffer.concat([header, pcmData])
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
        '-ar', String(SAMPLE_RATE),
        '-ac', '1',
        output
      ], { timeout: 300000 }, (err, _stdout, stderr) => {
        if (err) {
          reject(new Error(`ffmpeg failed: ${err.message}\n${stderr}`))
        } else {
          resolve()
        }
      })
    })
  }
}
