export {}

// ── Core types ──

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

type Source = {
  id: string
  name: string
  thumbnail: string
}

// ── Settings types ──

type TranscriptionMode = 'local' | 'cloud'
type WhisperModel = 'tiny' | 'base' | 'small' | 'medium' | 'large'

type ModelInfo = {
  id: WhisperModel
  name: string
  size: string
  downloaded: boolean
  downloading: boolean
  progress: number
}

type Settings = {
  workerUrl: string
  transcriptionMode: TranscriptionMode
  whisperModel: WhisperModel
  language: string
  translateToEnglish: boolean
}

// ── Meeting Minutes types ──

type DiscussionItem = {
  topic: string
  discussion: string
  outcome: string
}

type ActionItem = {
  action: string
  owner: string
  deadline: string
  status: 'pending' | 'completed'
}

type MeetingMinutes = {
  title: string
  date: string
  duration: number
  location: string
  attendees: string[]
  chairperson: string
  absentees: string[]
  agenda: string[]
  discussions: DiscussionItem[]
  overview: string
  actionItems: ActionItem[]
  decisions: string[]
  nextMeetingDate: string
  adjournmentTime: string
  transcript: TranscriptSegment[]
  generatedAt: string
}

// ── Meeting detail ──

type MeetingDetail = {
  meta: MeetingMeta
  transcript?: TranscriptResult
  summary?: Summary
  minutes?: MeetingMinutes
  audioPath: string
}

// ── Window API ──

declare global {
  interface Window {
    api: {
      // Recording
      getSources: () => Promise<Source[]>
      saveRecording: (buffer: ArrayBuffer, duration: number, title: string) => Promise<MeetingMeta>

      // Cloud transcription
      transcribe: (meetingId: string, workerUrl: string, options?: { language?: string; task?: string }) => Promise<TranscriptResult>

      // Local transcription
      transcribeLocal: (meetingId: string, model: WhisperModel) => Promise<TranscriptResult>
      getModelStatus: () => Promise<ModelInfo[]>
      downloadModel: (model: WhisperModel) => Promise<void>
      deleteModel: (model: WhisperModel) => Promise<void>
      onModelDownloadProgress: (callback: (data: { modelId: string; progress: number }) => void) => () => void

      // Summarization
      summarize: (meetingId: string, workerUrl: string) => Promise<Summary>

      // Meeting minutes
      generateMinutes: (meetingId: string, workerUrl: string) => Promise<MeetingMinutes>
      exportMinutes: (meetingId: string, format: 'markdown' | 'pdf' | 'clipboard') => Promise<string>

      // Data access
      getMeetings: () => Promise<MeetingMeta[]>
      getMeeting: (id: string) => Promise<MeetingDetail>
      deleteMeeting: (id: string) => Promise<void>

      // Settings
      getSettings: () => Promise<Settings>
      saveSettings: (settings: Settings) => Promise<void>

      // Audio import
      importAudio: () => Promise<MeetingMeta | null>

      // Utilities
      openFolder: (meetingId: string) => Promise<void>
      onTranscriptionProgress: (callback: (data: { meetingId: string; status: string; progress?: number }) => void) => () => void
    }
  }
}
