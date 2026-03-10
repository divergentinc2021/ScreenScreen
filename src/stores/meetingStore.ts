import { create } from 'zustand'

type MeetingMeta = {
  id: string
  title: string
  date: string
  duration: number
  status: string
}

type TranscriptSegment = {
  start: number
  end: number
  text: string
}

type TranscriptResult = {
  segments: TranscriptSegment[]
  fullText: string
}

type Summary = {
  overview: string
  keyPoints: string[]
  actionItems: string[]
  decisions: string[]
}

type MeetingDetail = {
  meta: MeetingMeta
  transcript?: TranscriptResult
  summary?: Summary
  audioPath: string
}

type View = 'record' | 'meeting' | 'settings'

type MeetingStore = {
  // Navigation
  view: View
  setView: (v: View) => void

  // Meetings list
  meetings: MeetingMeta[]
  loadMeetings: () => Promise<void>

  // Current meeting
  currentMeeting: MeetingDetail | null
  selectMeeting: (id: string) => Promise<void>

  // Recording
  isRecording: boolean
  recordingTime: number
  setRecording: (v: boolean) => void
  setRecordingTime: (t: number) => void

  // Transcription
  transcriptionProgress: { status: string; progress?: number } | null
  setTranscriptionProgress: (p: { status: string; progress?: number } | null) => void

  // Settings
  settings: { workerUrl: string; whisperModel: string }
  loadSettings: () => Promise<void>
  saveSettings: (s: { workerUrl: string; whisperModel: string }) => Promise<void>
}

export const useMeetingStore = create<MeetingStore>((set, get) => ({
  view: 'record',
  setView: (v) => set({ view: v }),

  meetings: [],
  loadMeetings: async () => {
    const meetings = await window.api.getMeetings()
    set({ meetings })
  },

  currentMeeting: null,
  selectMeeting: async (id) => {
    const detail = await window.api.getMeeting(id)
    set({ currentMeeting: detail, view: 'meeting' })
  },

  isRecording: false,
  recordingTime: 0,
  setRecording: (v) => set({ isRecording: v }),
  setRecordingTime: (t) => set({ recordingTime: t }),

  transcriptionProgress: null,
  setTranscriptionProgress: (p) => set({ transcriptionProgress: p }),

  settings: { workerUrl: '', whisperModel: 'Xenova/whisper-small' },
  loadSettings: async () => {
    const settings = await window.api.getSettings()
    set({ settings })
  },
  saveSettings: async (s) => {
    await window.api.saveSettings(s)
    set({ settings: s })
  }
}))
