import { contextBridge, ipcRenderer } from 'electron'

export type MeetingMeta = {
  id: string
  title: string
  date: string
  duration: number
  status: 'recording' | 'recorded' | 'transcribing' | 'transcribed' | 'summarized'
}

export type TranscriptSegment = {
  start: number
  end: number
  text: string
}

export type TranscriptResult = {
  segments: TranscriptSegment[]
  fullText: string
}

export type Summary = {
  overview: string
  keyPoints: string[]
  actionItems: string[]
  decisions: string[]
}

export type Source = {
  id: string
  name: string
  thumbnail: string
}

export type Settings = {
  workerUrl: string
}

const api = {
  getSources: (): Promise<Source[]> =>
    ipcRenderer.invoke('get-sources'),

  saveRecording: (buffer: ArrayBuffer, duration: number, title: string): Promise<MeetingMeta> =>
    ipcRenderer.invoke('save-recording', buffer, duration, title),

  transcribe: (meetingId: string, workerUrl: string): Promise<TranscriptResult> =>
    ipcRenderer.invoke('transcribe', meetingId, workerUrl),

  summarize: (meetingId: string, workerUrl: string): Promise<Summary> =>
    ipcRenderer.invoke('summarize', meetingId, workerUrl),

  getMeetings: (): Promise<MeetingMeta[]> =>
    ipcRenderer.invoke('get-meetings'),

  getMeeting: (id: string): Promise<{ meta: MeetingMeta; transcript?: TranscriptResult; summary?: Summary; audioPath: string }> =>
    ipcRenderer.invoke('get-meeting', id),

  deleteMeeting: (id: string): Promise<void> =>
    ipcRenderer.invoke('delete-meeting', id),

  getSettings: (): Promise<Settings> =>
    ipcRenderer.invoke('get-settings'),

  saveSettings: (settings: Settings): Promise<void> =>
    ipcRenderer.invoke('save-settings', settings),

  openFolder: (meetingId: string): Promise<void> =>
    ipcRenderer.invoke('open-folder', meetingId),

  onTranscriptionProgress: (callback: (data: { meetingId: string; status: string; progress?: number }) => void): (() => void) => {
    const handler = (_e: any, data: any) => callback(data)
    ipcRenderer.on('transcription-progress', handler)
    return () => { ipcRenderer.removeListener('transcription-progress', handler) }
  }
}

contextBridge.exposeInMainWorld('api', api)
