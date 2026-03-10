import { app } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'fs'

export class Storage {
  private baseDir: string = ''

  init() {
    this.baseDir = join(app.getPath('home'), 'MeetingRecorder')
    mkdirSync(join(this.baseDir, 'recordings'), { recursive: true })

    // Init settings file if missing
    const settingsPath = join(this.baseDir, 'settings.json')
    if (!existsSync(settingsPath)) {
      writeFileSync(settingsPath, JSON.stringify({
        workerUrl: '',
        whisperModel: 'Xenova/whisper-small'
      }, null, 2))
    }
  }

  getMeetingDir(id: string): string {
    return join(this.baseDir, 'recordings', id)
  }

  async saveRecording(buffer: Buffer, duration: number, title: string) {
    const id = new Date().toISOString().replace(/[:.]/g, '-')
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

    // Update status
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

  async getTranscript(meetingId: string) {
    const path = join(this.getMeetingDir(meetingId), 'transcript.json')
    if (!existsSync(path)) return null
    return JSON.parse(readFileSync(path, 'utf-8'))
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

    return {
      meta,
      transcript: existsSync(transcriptPath) ? JSON.parse(readFileSync(transcriptPath, 'utf-8')) : undefined,
      summary: existsSync(summaryPath) ? JSON.parse(readFileSync(summaryPath, 'utf-8')) : undefined,
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
    if (!existsSync(path)) return { workerUrl: '', whisperModel: 'Xenova/whisper-small' }
    return JSON.parse(readFileSync(path, 'utf-8'))
  }

  saveSettings(settings: any) {
    const path = join(this.baseDir, 'settings.json')
    writeFileSync(path, JSON.stringify(settings, null, 2))
  }
}
