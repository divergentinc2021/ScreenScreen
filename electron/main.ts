import { app, BrowserWindow, ipcMain, desktopCapturer, shell, dialog, Notification } from 'electron'
import { join, basename, extname } from 'path'
import { copyFileSync } from 'fs'
import { Transcriber } from './transcriber'
import { LocalTranscriber } from './localTranscriber'
import { Storage } from './storage'
import { exportMarkdown, exportClipboard, exportPDF, exportDocx } from './minutesExporter'
import { CalendarSync } from './calendar'

let mainWindow: BrowserWindow | null = null
const storage = new Storage()
const transcriber = new Transcriber()
let localTranscriber: LocalTranscriber
let calendarSync: CalendarSync

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 750,
    minWidth: 800,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#0f0f14',
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  createWindow()
  storage.init()
  localTranscriber = new LocalTranscriber(storage.getModelsDir())
  calendarSync = new CalendarSync(storage.getBaseDir())
  if (mainWindow) calendarSync.setMainWindow(mainWindow)

  // Start calendar polling if enabled
  const settings = storage.getSettings()
  if (settings.calendar?.scriptUrl) {
    calendarSync.setScriptUrl(settings.calendar.scriptUrl)
  }
  if (settings.calendar?.accounts?.length) {
    calendarSync.setAccounts(settings.calendar.accounts)
  }
  if (settings.calendar?.enabled && calendarSync.isConnected()) {
    calendarSync.startPolling(settings.calendar.reminderMinutes || 5)
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// ── Recording ──

ipcMain.handle('get-sources', async () => {
  const sources = await desktopCapturer.getSources({
    types: ['window', 'screen'],
    thumbnailSize: { width: 150, height: 150 }
  })
  return sources.map(s => ({
    id: s.id,
    name: s.name,
    thumbnail: s.thumbnail.toDataURL()
  }))
})

ipcMain.handle('create-meeting-id', async () => {
  const id = storage.createMeetingId()
  storage.preallocateMeetingDir(id)
  return id
})

ipcMain.handle('save-recording', async (_e, buffer: ArrayBuffer, duration: number, title: string, meetingId?: string) => {
  const meeting = await storage.saveRecording(Buffer.from(buffer), duration, title, meetingId)
  return meeting
})

// ── Cloud Transcription ──

ipcMain.handle('transcribe', async (_e, meetingId: string, workerUrl: string, options?: { language?: string; task?: string }) => {
  const meetingDir = storage.getMeetingDir(meetingId)
  const audioPath = join(meetingDir, 'audio.webm')

  const onProgress = (progress: { status: string; progress?: number }) => {
    mainWindow?.webContents.send('transcription-progress', { meetingId, ...progress })
  }

  try {
    const result = await transcriber.transcribe(audioPath, workerUrl, onProgress, options)
    await storage.saveTranscript(meetingId, result)
    return result
  } catch (err: any) {
    throw new Error(`Transcription failed: ${err.message}`)
  }
})

// ── Local Transcription ──

ipcMain.handle('transcribe-local', async (_e, meetingId: string, model: string) => {
  const meetingDir = storage.getMeetingDir(meetingId)
  const audioPath = join(meetingDir, 'audio.webm')

  const onProgress = (progress: { status: string; progress?: number }) => {
    mainWindow?.webContents.send('transcription-progress', { meetingId, ...progress })
  }

  try {
    const result = await localTranscriber.transcribe(audioPath, model, onProgress)
    await storage.saveTranscript(meetingId, result)
    return result
  } catch (err: any) {
    throw new Error(`Local transcription failed: ${err.message}`)
  }
})

// ── Model Management ──

ipcMain.handle('get-model-status', async () => {
  return localTranscriber.getModelStatus()
})

ipcMain.handle('download-model', async (_e, modelId: string) => {
  await localTranscriber.downloadModel(modelId, (progress: number) => {
    mainWindow?.webContents.send('model-download-progress', { modelId, progress })
  })
})

ipcMain.handle('delete-model', async (_e, modelId: string) => {
  localTranscriber.deleteModel(modelId)
})

// ── Summarization ──

ipcMain.handle('summarize', async (_e, meetingId: string, workerUrl: string) => {
  const transcript = await storage.getTranscript(meetingId)
  if (!transcript) throw new Error('No transcript found')

  const text = transcript.segments
    .map((s: any) => `[${formatTime(s.start)}] ${s.text}`)
    .join('\n')

  const res = await fetch(`${workerUrl}/api/summarize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transcript: text })
  })

  if (!res.ok) throw new Error(`Summary API error: ${res.status}`)
  const summary = await res.json()
  await storage.saveSummary(meetingId, summary)
  return summary
})

// ── Meeting Minutes ──

ipcMain.handle('generate-minutes', async (_e, meetingId: string, workerUrl: string) => {
  const meeting = await storage.getMeeting(meetingId)
  if (!meeting.transcript) throw new Error('No transcript found. Transcribe first.')

  const text = meeting.transcript.segments
    .map((s: any) => `[${formatTime(s.start)}] ${s.text}`)
    .join('\n')

  if (!workerUrl) throw new Error('Worker URL not configured.')

  const res = await fetch(`${workerUrl}/api/generate-minutes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      transcript: text,
      meetingTitle: meeting.meta.title,
      duration: meeting.meta.duration,
      date: meeting.meta.date
    })
  })

  if (!res.ok) throw new Error(`Minutes generation API error: ${res.status}`)
  const minutesData: any = await res.json()

  const minutes = {
    title: meeting.meta.title,
    date: meeting.meta.date,
    duration: meeting.meta.duration,
    location: minutesData.location || 'Virtual Meeting',
    attendees: minutesData.attendees || [],
    chairperson: minutesData.chairperson || '',
    absentees: minutesData.absentees || [],
    agenda: minutesData.agenda || [],
    discussions: minutesData.discussions || [],
    overview: minutesData.overview || meeting.summary?.overview || '',
    actionItems: (minutesData.actionItems || []).map((a: any) => ({
      action: typeof a === 'string' ? a : a.action,
      owner: a.owner || 'TBD',
      deadline: a.deadline || 'TBD',
      status: a.status || 'pending'
    })),
    decisions: minutesData.decisions || meeting.summary?.decisions || [],
    nextMeetingDate: minutesData.nextMeetingDate || '',
    adjournmentTime: minutesData.adjournmentTime || '',
    transcript: meeting.transcript.segments,
    generatedAt: new Date().toISOString()
  }

  await storage.saveMinutes(meetingId, minutes)
  return minutes
})

ipcMain.handle('export-minutes', async (_e, meetingId: string, format: string) => {
  const meeting = await storage.getMeeting(meetingId)
  if (!meeting.minutes) throw new Error('No minutes found. Generate minutes first.')

  const meetingDir = storage.getMeetingDir(meetingId)

  const screenshots = await storage.getScreenshots(meetingId)

  switch (format) {
    case 'markdown': {
      const filePath = exportMarkdown(meeting.minutes, meetingDir)
      shell.openPath(filePath)
      return filePath
    }
    case 'pdf': {
      const filePath = await exportPDF(meeting.minutes, meetingDir)
      shell.openPath(filePath)
      return filePath
    }
    case 'docx': {
      const filePath = await exportDocx(meeting.minutes, meetingDir, screenshots)
      shell.openPath(filePath)
      return filePath
    }
    case 'clipboard': {
      exportClipboard(meeting.minutes)
      return 'Copied to clipboard'
    }
    default:
      throw new Error(`Unknown export format: ${format}`)
  }
})

// ── Audio Import ──

ipcMain.handle('import-audio', async () => {
  if (!mainWindow) return null

  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Import Audio File',
    filters: [
      { name: 'Audio Files', extensions: ['mp3', 'mp4', 'm4a', 'wav', 'ogg', 'webm', 'aac', 'flac'] }
    ],
    properties: ['openFile']
  })

  if (result.canceled || result.filePaths.length === 0) return null

  const filePath = result.filePaths[0]
  const fileName = basename(filePath, extname(filePath))

  // Save as a new meeting (storage.saveRecording handles dir creation)
  const audioBuffer = require('fs').readFileSync(filePath)
  const meeting = await storage.saveRecording(audioBuffer, 0, fileName)

  // Copy original file alongside the webm (the transcriber will convert it)
  const meetingDir = storage.getMeetingDir(meeting.id)
  const ext = extname(filePath)
  const destPath = join(meetingDir, `audio${ext}`)
  copyFileSync(filePath, destPath)

  // Also copy as audio.webm so transcriber finds it (it converts any format via ffmpeg)
  const webmDest = join(meetingDir, 'audio.webm')
  copyFileSync(filePath, webmDest)

  return meeting
})

// ── Data Access ──

ipcMain.handle('get-meetings', async () => {
  return storage.getMeetings()
})

ipcMain.handle('get-meeting', async (_e, id: string) => {
  return storage.getMeeting(id)
})

ipcMain.handle('delete-meeting', async (_e, id: string) => {
  return storage.deleteMeeting(id)
})

// ── Settings ──

ipcMain.handle('get-settings', async () => {
  return storage.getSettings()
})

ipcMain.handle('save-settings', async (_e, settings: any) => {
  storage.saveSettings(settings)
  // Update calendar accounts
  if (settings.calendar?.scriptUrl) {
    calendarSync.setScriptUrl(settings.calendar.scriptUrl)
  }
  if (settings.calendar?.accounts?.length) {
    calendarSync.setAccounts(settings.calendar.accounts)
    if (settings.calendar.enabled) {
      calendarSync.startPolling(settings.calendar.reminderMinutes || 5)
    } else {
      calendarSync.stopPolling()
    }
  } else {
    calendarSync.setAccounts([])
    calendarSync.stopPolling()
  }
})

// ── Screenshots ──

ipcMain.handle('take-screenshot', async (_e, meetingId: string, timestamp: number) => {
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width: 1920, height: 1080 }
  })

  if (sources.length === 0) throw new Error('No screen source available')

  const imageBuffer = sources[0].thumbnail.toPNG()
  const screenshot = await storage.saveScreenshot(meetingId, imageBuffer, timestamp)
  return screenshot
})

ipcMain.handle('get-screenshots', async (_e, meetingId: string) => {
  return storage.getScreenshots(meetingId)
})

ipcMain.handle('delete-screenshot', async (_e, meetingId: string, filename: string) => {
  return storage.deleteScreenshot(meetingId, filename)
})

// ── Calendar ──

ipcMain.handle('calendar-sign-in', async (_e, partition: string) => {
  return calendarSync.signIn(partition)
})

ipcMain.handle('calendar-test-session', async (_e, partition: string) => {
  return calendarSync.testSession(partition)
})

ipcMain.handle('calendar-remove-session', async (_e, partition: string) => {
  return calendarSync.removeSession(partition)
})

ipcMain.handle('get-upcoming-events', async () => {
  return calendarSync.getUpcomingEvents()
})

ipcMain.handle('calendar-start-polling', async (_e, reminderMinutes: number) => {
  calendarSync.startPolling(reminderMinutes)
})

ipcMain.handle('calendar-stop-polling', async () => {
  calendarSync.stopPolling()
})

ipcMain.handle('calendar-is-connected', async () => {
  return calendarSync.isConnected()
})

// ── Utilities ──

ipcMain.handle('open-folder', async (_e, meetingId: string) => {
  const dir = storage.getMeetingDir(meetingId)
  shell.openPath(dir)
})

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}
