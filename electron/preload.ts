import { contextBridge, ipcRenderer } from 'electron'

const api = {
  // ── Recording ──
  getSources: () =>
    ipcRenderer.invoke('get-sources'),

  saveRecording: (buffer: ArrayBuffer, duration: number, title: string) =>
    ipcRenderer.invoke('save-recording', buffer, duration, title),

  // ── Cloud Transcription ──
  transcribe: (meetingId: string, workerUrl: string) =>
    ipcRenderer.invoke('transcribe', meetingId, workerUrl),

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
