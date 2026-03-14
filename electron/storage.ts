import { app } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'fs'

const DEFAULT_SETTINGS = {
  workerUrl: '',
  transcriptionMode: 'cloud' as const,
  whisperModel: 'base' as const
}

export class Storage {
  private baseDir: string = ''

  init() {
    this.baseDir = join(app.getPath('home'), 'MeetingRecorder')
    mkdirSync(join(this.baseDir, 'recordings'), { recursive: true })
    mkdirSync(join(this.baseDir, 'models'), { recursive: true })

    // Init settings file if missing
    const settingsPath = join(this.baseDir, 'settings.json')
    if (!existsSync(settingsPath)) {
      writeFileSync(settingsPath, JSON.stringify(DEFAULT_SETTINGS, null, 2))
    }
  }

  getBaseDir(): string {
    return this.baseDir
  }

  getModelsDir(): string {
    return join(this.baseDir, 'models')
  }

  getMeetingDir(id: string): string {
    return join(this.baseDir, 'recordings', id)
  }

  createMeetingId(): string {
    return new Date().toISOString().replace(/[:.]/g, '-')
  }

  preallocateMeetingDir(id: string): string {
    const dir = this.getMeetingDir(id)
    mkdirSync(dir, { recursive: true })
    return dir
  }

  async saveRecording(buffer: Buffer, duration: number, title: string, preAllocatedId?: string) {
    const id = preAllocatedId || new Date().toISOString().replace(/[:.]/g, '-')
    const dir = this.getMeetingDir(id)
    mkdirSync(dir, { recursive: true })

    writeFileSync(join(dir, 'audio.webm'), buffer)

    const meta = {
      id,
      title: title || `Meeting ${new Date().toLocaleDateString()}`,
      date: new Date().toISOString(),
      duration,
      status: 'recorded' as const
    }
    writeFileSync(join(dir, 'meta.json'), JSON.stringify(meta, null, 2))
    return meta
  }

  async saveTranscript(meetingId: string, result: { segments: any[]; fullText: string }) {
    const dir = this.getMeetingDir(meetingId)
    writeFileSync(join(dir, 'transcript.json'), JSON.stringify(result, null, 2))
    writeFileSync(join(dir, 'transcript.txt'), result.fullText)

    const metaPath = join(dir, 'meta.json')
    const meta = JSON.parse(readFileSync(metaPath, 'utf-8'))
    meta.status = 'transcribed'
    writeFileSync(metaPath, JSON.stringify(meta, null, 2))
  }

  async saveSummary(meetingId: string, summary: any) {
    const dir = this.getMeetingDir(meetingId)
    writeFileSync(join(dir, 'summary.json'), JSON.stringify(summary, null, 2))

    const metaPath = join(dir, 'meta.json')
    const meta = JSON.parse(readFileSync(metaPath, 'utf-8'))
    meta.status = 'summarized'
    writeFileSync(metaPath, JSON.stringify(meta, null, 2))
  }

  async saveMinutes(meetingId: string, minutes: any) {
    const dir = this.getMeetingDir(meetingId)
    writeFileSync(join(dir, 'minutes.json'), JSON.stringify(minutes, null, 2))

    const metaPath = join(dir, 'meta.json')
    const meta = JSON.parse(readFileSync(metaPath, 'utf-8'))
    meta.status = 'minutes'
    writeFileSync(metaPath, JSON.stringify(meta, null, 2))
  }

  async getTranscript(meetingId: string) {
    const path = join(this.getMeetingDir(meetingId), 'transcript.json')
    if (!existsSync(path)) return null
    return JSON.parse(readFileSync(path, 'utf-8'))
  }

  async getMinutes(meetingId: string) {
    const path = join(this.getMeetingDir(meetingId), 'minutes.json')
    if (!existsSync(path)) return null
    return JSON.parse(readFileSync(path, 'utf-8'))
  }

  // ── Screenshots ──

  getScreenshotsDir(meetingId: string): string {
    const dir = join(this.getMeetingDir(meetingId), 'screenshots')
    mkdirSync(dir, { recursive: true })
    return dir
  }

  async saveScreenshot(meetingId: string, imageBuffer: Buffer, timestamp: number): Promise<{ filename: string; timestamp: number }> {
    const dir = this.getScreenshotsDir(meetingId)
    const filename = `screenshot-${Date.now()}.png`
    writeFileSync(join(dir, filename), imageBuffer)

    // Update screenshots manifest
    const manifestPath = join(this.getMeetingDir(meetingId), 'screenshots.json')
    const screenshots = existsSync(manifestPath)
      ? JSON.parse(readFileSync(manifestPath, 'utf-8'))
      : []
    const entry = { filename, timestamp }
    screenshots.push(entry)
    writeFileSync(manifestPath, JSON.stringify(screenshots, null, 2))
    return entry
  }

  async getScreenshots(meetingId: string): Promise<any[]> {
    const manifestPath = join(this.getMeetingDir(meetingId), 'screenshots.json')
    if (!existsSync(manifestPath)) return []
    return JSON.parse(readFileSync(manifestPath, 'utf-8'))
  }

  async deleteScreenshot(meetingId: string, filename: string): Promise<void> {
    const dir = this.getScreenshotsDir(meetingId)
    const filePath = join(dir, filename)
    if (existsSync(filePath)) rmSync(filePath)

    const manifestPath = join(this.getMeetingDir(meetingId), 'screenshots.json')
    if (existsSync(manifestPath)) {
      const screenshots = JSON.parse(readFileSync(manifestPath, 'utf-8'))
      const filtered = screenshots.filter((s: any) => s.filename !== filename)
      writeFileSync(manifestPath, JSON.stringify(filtered, null, 2))
    }
  }

  async getMeetings() {
    const dir = join(this.baseDir, 'recordings')
    if (!existsSync(dir)) return []

    const entries = readdirSync(dir, { withFileTypes: true })
    const meetings = []

    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const metaPath = join(dir, entry.name, 'meta.json')
      if (existsSync(metaPath)) {
        meetings.push(JSON.parse(readFileSync(metaPath, 'utf-8')))
      }
    }

    return meetings.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  }

  async getMeeting(id: string) {
    const dir = this.getMeetingDir(id)
    const metaPath = join(dir, 'meta.json')
    if (!existsSync(metaPath)) throw new Error('Meeting not found')

    const meta = JSON.parse(readFileSync(metaPath, 'utf-8'))
    const transcriptPath = join(dir, 'transcript.json')
    const summaryPath = join(dir, 'summary.json')
    const minutesPath = join(dir, 'minutes.json')

    const screenshotsPath = join(dir, 'screenshots.json')

    return {
      meta,
      transcript: existsSync(transcriptPath) ? JSON.parse(readFileSync(transcriptPath, 'utf-8')) : undefined,
      summary: existsSync(summaryPath) ? JSON.parse(readFileSync(summaryPath, 'utf-8')) : undefined,
      minutes: existsSync(minutesPath) ? JSON.parse(readFileSync(minutesPath, 'utf-8')) : undefined,
      screenshots: existsSync(screenshotsPath) ? JSON.parse(readFileSync(screenshotsPath, 'utf-8')) : undefined,
      audioPath: join(dir, 'audio.webm')
    }
  }

  async deleteMeeting(id: string) {
    const dir = this.getMeetingDir(id)
    if (existsSync(dir)) {
      rmSync(dir, { recursive: true })
    }
  }

  getSettings() {
    const path = join(this.baseDir, 'settings.json')
    if (!existsSync(path)) return { ...DEFAULT_SETTINGS }
    const saved = JSON.parse(readFileSync(path, 'utf-8'))
    // Merge with defaults for backward compatibility
    return { ...DEFAULT_SETTINGS, ...saved }
  }

  saveSettings(settings: any) {
    const path = join(this.baseDir, 'settings.json')
    writeFileSync(path, JSON.stringify(settings, null, 2))
  }
}
