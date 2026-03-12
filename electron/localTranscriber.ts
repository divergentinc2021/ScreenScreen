import { execFile, spawn } from 'child_process'
import { join } from 'path'
import { existsSync, unlinkSync, renameSync, createWriteStream, mkdirSync, statSync } from 'fs'

type ProgressCallback = (progress: { status: string; progress?: number }) => void

const MODEL_REGISTRY: Record<string, { name: string; size: string; sizeBytes: number; url: string }> = {
  tiny: {
    name: 'Tiny',
    size: '75 MB',
    sizeBytes: 75_000_000,
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin'
  },
  base: {
    name: 'Base (Recommended)',
    size: '142 MB',
    sizeBytes: 142_000_000,
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin'
  },
  small: {
    name: 'Small',
    size: '466 MB',
    sizeBytes: 466_000_000,
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin'
  },
  medium: {
    name: 'Medium',
    size: '1.5 GB',
    sizeBytes: 1_500_000_000,
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.bin'
  },
  large: {
    name: 'Large',
    size: '3 GB',
    sizeBytes: 3_000_000_000,
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3.bin'
  }
}

export class LocalTranscriber {
  private modelsDir: string

  constructor(modelsDir: string) {
    this.modelsDir = modelsDir
    mkdirSync(modelsDir, { recursive: true })
  }

  /**
   * Resolve path to the whisper-cli binary.
   * Production: process.resourcesPath/whisper/whisper-cli
   * Development: binaries/whisper/{platform}-{arch}/whisper-cli
   */
  private getWhisperBinaryPath(): string {
    const binary = process.platform === 'win32' ? 'whisper-cli.exe' : 'whisper-cli'

    // Production: bundled via electron-builder extraResources
    const prodPath = join(process.resourcesPath, 'whisper', binary)
    if (existsSync(prodPath)) return prodPath

    // Development: look in project binaries/ directory
    const platformDir = process.platform === 'darwin' ? `mac-${process.arch}` : `win-${process.arch}`
    const devPath = join(__dirname, '..', 'binaries', 'whisper', platformDir, binary)
    if (existsSync(devPath)) return devPath

    throw new Error(
      `whisper-cli binary not found.\n` +
      `Checked: ${prodPath}\n` +
      `And: ${devPath}\n` +
      `Download it from https://github.com/ggerganov/whisper.cpp/releases`
    )
  }

  /**
   * Get the path to a model file.
   */
  private getModelPath(modelId: string): string {
    return join(this.modelsDir, `ggml-${modelId}.bin`)
  }

  /**
   * Check if a model is downloaded.
   */
  isModelDownloaded(modelId: string): boolean {
    return existsSync(this.getModelPath(modelId))
  }

  /**
   * Get status of all available models.
   */
  getModelStatus(): { id: string; name: string; size: string; downloaded: boolean; downloading: boolean; progress: number }[] {
    return Object.entries(MODEL_REGISTRY).map(([id, info]) => ({
      id,
      name: info.name,
      size: info.size,
      downloaded: this.isModelDownloaded(id),
      downloading: existsSync(this.getModelPath(id) + '.downloading'),
      progress: 0
    }))
  }

  /**
   * Download a model from HuggingFace with progress tracking.
   */
  async downloadModel(modelId: string, onProgress: (progress: number) => void): Promise<void> {
    const info = MODEL_REGISTRY[modelId]
    if (!info) throw new Error(`Unknown model: ${modelId}`)

    const destPath = this.getModelPath(modelId)
    const tempPath = destPath + '.downloading'

    // Clean up any previous partial download
    if (existsSync(tempPath)) unlinkSync(tempPath)

    try {
      const response = await fetch(info.url, { redirect: 'follow' })
      if (!response.ok) {
        throw new Error(`Download failed: HTTP ${response.status}`)
      }

      const contentLength = parseInt(response.headers.get('content-length') || '0')
      const totalSize = contentLength || info.sizeBytes

      const fileStream = createWriteStream(tempPath)
      const reader = response.body?.getReader()
      if (!reader) throw new Error('No response body')

      let downloaded = 0

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        fileStream.write(Buffer.from(value))
        downloaded += value.length

        const pct = Math.min(99, Math.floor((downloaded / totalSize) * 100))
        onProgress(pct)
      }

      fileStream.end()

      // Wait for the file to be fully written
      await new Promise<void>((resolve, reject) => {
        fileStream.on('finish', resolve)
        fileStream.on('error', reject)
      })

      // Rename temp file to final destination
      renameSync(tempPath, destPath)
      onProgress(100)
    } catch (err) {
      // Clean up on failure
      if (existsSync(tempPath)) unlinkSync(tempPath)
      throw err
    }
  }

  /**
   * Delete a downloaded model.
   */
  deleteModel(modelId: string): void {
    const path = this.getModelPath(modelId)
    if (existsSync(path)) unlinkSync(path)
    // Also clean up any partial downloads
    const tempPath = path + '.downloading'
    if (existsSync(tempPath)) unlinkSync(tempPath)
  }

  /**
   * Run local whisper.cpp transcription.
   */
  async transcribe(audioPath: string, modelId: string, onProgress: ProgressCallback): Promise<{ segments: any[]; fullText: string }> {
    const modelPath = this.getModelPath(modelId)
    if (!existsSync(modelPath)) {
      throw new Error(`Model "${modelId}" not downloaded. Go to Settings to download it.`)
    }

    // Step 1: Convert WebM → WAV (16kHz mono PCM)
    onProgress({ status: 'Converting audio...', progress: 5 })
    const wavPath = audioPath.replace('.webm', '.wav')
    await this.convertToWav(audioPath, wavPath)

    if (!existsSync(wavPath)) {
      throw new Error('Audio conversion failed: WAV file not created')
    }
    const stat = statSync(wavPath)
    if (stat.size < 100) {
      throw new Error(`Audio conversion produced empty file (${stat.size} bytes)`)
    }

    // Step 2: Run whisper-cli
    onProgress({ status: 'Starting local transcription...', progress: 10 })
    const binaryPath = this.getWhisperBinaryPath()

    const result = await new Promise<string>((resolve, reject) => {
      const args = [
        '-m', modelPath,
        '-f', wavPath,
        '-oj',        // Output JSON
        '-l', 'auto', // Auto-detect language
        '-pp',        // Print progress to stderr
      ]

      const child = spawn(binaryPath, args, {
        stdio: ['ignore', 'pipe', 'pipe']
      })

      let stdout = ''
      let stderr = ''

      child.stdout.on('data', (data: Buffer) => {
        stdout += data.toString()
      })

      child.stderr.on('data', (data: Buffer) => {
        const text = data.toString()
        stderr += text

        // Parse progress: "whisper_full_with_state: progress = XX%"
        const match = text.match(/progress\s*=\s*(\d+)%/)
        if (match) {
          const pct = parseInt(match[1])
          onProgress({
            status: 'Transcribing locally...',
            progress: 10 + Math.floor(pct * 0.85) // Map 0-100% to 10-95%
          })
        }
      })

      child.on('error', (err) => {
        reject(new Error(`Failed to start whisper-cli: ${err.message}`))
      })

      child.on('close', (code) => {
        if (code === 0) {
          resolve(stdout)
        } else {
          reject(new Error(`whisper-cli exited with code ${code}:\n${stderr.slice(-500)}`))
        }
      })
    })

    // Step 3: Parse JSON output
    onProgress({ status: 'Processing transcript...', progress: 95 })
    const parsed = this.parseWhisperOutput(result, wavPath)

    onProgress({ status: 'Complete', progress: 100 })
    return parsed
  }

  /**
   * Parse whisper.cpp JSON output into TranscriptResult format.
   * whisper.cpp with -oj writes a .json file alongside the input, not to stdout.
   */
  private parseWhisperOutput(stdout: string, wavPath: string): { segments: any[]; fullText: string } {
    // whisper.cpp -oj writes to <input>.json file
    const jsonPath = wavPath + '.json'

    let data: any
    if (existsSync(jsonPath)) {
      const { readFileSync } = require('fs')
      const content = readFileSync(jsonPath, 'utf-8')
      data = JSON.parse(content)
      // Clean up the json file
      unlinkSync(jsonPath)
    } else if (stdout.trim()) {
      // Fallback: try parsing stdout
      data = JSON.parse(stdout)
    } else {
      throw new Error('No transcription output found')
    }

    // whisper.cpp JSON format:
    // { "transcription": [{ "timestamps": { "from": "00:00:00.000", "to": "00:00:05.000" }, "text": "..." }] }
    const transcription = data.transcription || []
    const segments = transcription.map((seg: any) => ({
      start: this.parseTimestamp(seg.timestamps?.from || '00:00:00.000'),
      end: this.parseTimestamp(seg.timestamps?.to || '00:00:00.000'),
      text: (seg.text || '').trim()
    })).filter((s: any) => s.text.length > 0)

    const fullText = segments.map((s: any) => s.text).join(' ')
    return { segments, fullText }
  }

  /**
   * Parse "HH:MM:SS.mmm" or "HH:MM:SS,mmm" to seconds.
   */
  private parseTimestamp(ts: string): number {
    const cleaned = ts.replace(',', '.')
    const parts = cleaned.split(':')
    if (parts.length !== 3) return 0
    return parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2])
  }

  /**
   * Convert WebM to WAV using ffmpeg (same as cloud transcriber).
   */
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
