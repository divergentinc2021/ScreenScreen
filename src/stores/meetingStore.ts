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
  view: View
  setView: (v: View) => void

  meetings: MeetingMeta[]
  loadMeetings: () => Promise<void>

  currentMeeting: MeetingDetail | null
  selectMeeting: (id: string) => Promise<void>

  isRecording: boolean
  recordingTime: number
  setRecording: (v: boolean) => void
  setRecordingTime: (t: number) => void

  transcriptionProgress: { status: string; progress?: number } | null
  setTranscriptionProgress: (p: { status: string; progress?: number } | null) => void

  settings: { workerUrl: string }
  loadSettings: () => Promise<void>
  saveSettings: (s: { workerUrl: string }) => Promise<void>
}

export const useMeetingStore = create<MeetingStore>((set) => ({
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

  settings: { workerUrl: '' },
  loadSettings: async () => {
    const settings = await window.api.getSettings()
    set({ settings })
  },
  saveSettings: async (s) => {
    await window.api.saveSettings(s)
    set({ settings: s })
  }
}))
