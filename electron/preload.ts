import { contextBridge, ipcRenderer } from 'electron'

const api = {
  // ── Recording ──
  getSources: () =>
    ipcRenderer.invoke('get-sources'),

  createMeetingId: () =>
    ipcRenderer.invoke('create-meeting-id'),

  saveRecording: (buffer: ArrayBuffer, duration: number, title: string, meetingId?: string) =>
    ipcRenderer.invoke('save-recording', buffer, duration, title, meetingId),

  // ── Cloud Transcription ──
  transcribe: (meetingId: string, workerUrl: string, options?: { language?: string; task?: string }) =>
    ipcRenderer.invoke('transcribe', meetingId, workerUrl, options),

  // ── Local Transcription ──
  transcribeLocal: (meetingId: string, model: string) =>
    ipcRenderer.invoke('transcribe-local', meetingId, model),

  // ── Model Management ──
  getModelStatus: () =>
    ipcRenderer.invoke('get-model-status'),

  downloadModel: (model: string) =>
    ipcRenderer.invoke('download-model', model),

  deleteModel: (model: string) =>
    ipcRenderer.invoke('delete-model', model),

  onModelDownloadProgress: (callback: (data: { modelId: string; progress: number }) => void): (() => void) => {
    const handler = (_e: any, data: any) => callback(data)
    ipcRenderer.on('model-download-progress', handler)
    return () => { ipcRenderer.removeListener('model-download-progress', handler) }
  },

  // ── Summarization ──
  summarize: (meetingId: string, workerUrl: string) =>
    ipcRenderer.invoke('summarize', meetingId, workerUrl),

  // ── Meeting Minutes ──
  generateMinutes: (meetingId: string, workerUrl: string) =>
    ipcRenderer.invoke('generate-minutes', meetingId, workerUrl),

  exportMinutes: (meetingId: string, format: string) =>
    ipcRenderer.invoke('export-minutes', meetingId, format),

  // ── Data Access ──
  getMeetings: () =>
    ipcRenderer.invoke('get-meetings'),

  getMeeting: (id: string) =>
    ipcRenderer.invoke('get-meeting', id),

  deleteMeeting: (id: string) =>
    ipcRenderer.invoke('delete-meeting', id),

  // ── Settings ──
  getSettings: () =>
    ipcRenderer.invoke('get-settings'),

  saveSettings: (settings: any) =>
    ipcRenderer.invoke('save-settings', settings),

  // ── Audio Import ──
  importAudio: () =>
    ipcRenderer.invoke('import-audio'),

  // ── Screenshots ──
  takeScreenshot: (meetingId: string, timestamp: number) =>
    ipcRenderer.invoke('take-screenshot', meetingId, timestamp),

  getScreenshots: (meetingId: string) =>
    ipcRenderer.invoke('get-screenshots', meetingId),

  deleteScreenshot: (meetingId: string, filename: string) =>
    ipcRenderer.invoke('delete-screenshot', meetingId, filename),

  // ── Calendar ──
  calendarSignIn: (partition: string) =>
    ipcRenderer.invoke('calendar-sign-in', partition),

  calendarTestSession: (partition: string) =>
    ipcRenderer.invoke('calendar-test-session', partition),

  calendarRemoveSession: (partition: string) =>
    ipcRenderer.invoke('calendar-remove-session', partition),

  getUpcomingEvents: () =>
    ipcRenderer.invoke('get-upcoming-events'),

  calendarIsConnected: () =>
    ipcRenderer.invoke('calendar-is-connected'),

  onMeetingReminder: (callback: (event: any) => void): (() => void) => {
    const handler = (_e: any, data: any) => callback(data)
    ipcRenderer.on('meeting-reminder', handler)
    return () => { ipcRenderer.removeListener('meeting-reminder', handler) }
  },

  // ── Mini Recorder ──
  showMiniRecorder: () =>
    ipcRenderer.invoke('show-mini-recorder'),

  hideMiniRecorder: () =>
    ipcRenderer.invoke('hide-mini-recorder'),

  sendMiniState: (state: { time: number; screenshotCount: number }) =>
    ipcRenderer.send('mini-state-update', state),

  miniStopRecording: () =>
    ipcRenderer.send('mini-stop-recording'),

  miniTakeScreenshot: () =>
    ipcRenderer.send('mini-take-screenshot'),

  miniShowMain: () =>
    ipcRenderer.send('mini-show-main'),

  onMiniStateUpdate: (callback: (state: { time: number; screenshotCount: number }) => void): (() => void) => {
    const handler = (_e: any, data: any) => callback(data)
    ipcRenderer.on('mini-state-update', handler)
    return () => { ipcRenderer.removeListener('mini-state-update', handler) }
  },

  onTriggerStopRecording: (callback: () => void): (() => void) => {
    const handler = () => callback()
    ipcRenderer.on('trigger-stop-recording', handler)
    return () => { ipcRenderer.removeListener('trigger-stop-recording', handler) }
  },

  onTriggerTakeScreenshot: (callback: () => void): (() => void) => {
    const handler = () => callback()
    ipcRenderer.on('trigger-take-screenshot', handler)
    return () => { ipcRenderer.removeListener('trigger-take-screenshot', handler) }
  },

  // ── Utilities ──
  openFolder: (meetingId: string) =>
    ipcRenderer.invoke('open-folder', meetingId),

  onTranscriptionProgress: (callback: (data: { meetingId: string; status: string; progress?: number }) => void): (() => void) => {
    const handler = (_e: any, data: any) => callback(data)
    ipcRenderer.on('transcription-progress', handler)
    return () => { ipcRenderer.removeListener('transcription-progress', handler) }
  }
}

contextBridge.exposeInMainWorld('api', api)
