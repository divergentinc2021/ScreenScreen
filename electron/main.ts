import { app, BrowserWindow, ipcMain, desktopCapturer, shell } from 'electron'
import { join } from 'path'
import { Transcriber } from './transcriber'
import { Storage } from './storage'

let mainWindow: BrowserWindow | null = null
const storage = new Storage()
const transcriber = new Transcriber()

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

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// ── IPC Handlers ──

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

ipcMain.handle('save-recording', async (_e, buffer: ArrayBuffer, duration: number, title: string) => {
  const meeting = await storage.saveRecording(Buffer.from(buffer), duration, title)
  return meeting
})

ipcMain.handle('transcribe', async (_e, meetingId: string) => {
  const meetingDir = storage.getMeetingDir(meetingId)
  const audioPath = join(meetingDir, 'audio.webm')

  const onProgress = (progress: { status: string; progress?: number }) => {
    mainWindow?.webContents.send('transcription-progress', { meetingId, ...progress })
  }

  try {
    const result = await transcriber.transcribe(audioPath, onProgress)
    await storage.saveTranscript(meetingId, result)
    return result
  } catch (err: any) {
    throw new Error(`Transcription failed: ${err.message}`)
  }
})

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

ipcMain.handle('get-meetings', async () => {
  return storage.getMeetings()
})

ipcMain.handle('get-meeting', async (_e, id: string) => {
  return storage.getMeeting(id)
})

ipcMain.handle('delete-meeting', async (_e, id: string) => {
  return storage.deleteMeeting(id)
})

ipcMain.handle('get-settings', async () => {
  return storage.getSettings()
})

ipcMain.handle('save-settings', async (_e, settings: any) => {
  return storage.saveSettings(settings)
})

ipcMain.handle('open-folder', async (_e, meetingId: string) => {
  const dir = storage.getMeetingDir(meetingId)
  shell.openPath(dir)
})

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}
