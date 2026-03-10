export {}

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

type Settings = {
  workerUrl: string
  whisperModel: string
}

type MeetingDetail = {
  meta: MeetingMeta
  transcript?: TranscriptResult
  summary?: Summary
  audioPath: string
}

declare global {
  interface Window {
    api: {
      getSources: () => Promise<Source[]>
      saveRecording: (buffer: ArrayBuffer, duration: number, title: string) => Promise<MeetingMeta>
      transcribe: (meetingId: string) => Promise<TranscriptResult>
      summarize: (meetingId: string, workerUrl: string) => Promise<Summary>
      getMeetings: () => Promise<MeetingMeta[]>
      getMeeting: (id: string) => Promise<MeetingDetail>
      deleteMeeting: (id: string) => Promise<void>
      getSettings: () => Promise<Settings>
      saveSettings: (settings: Settings) => Promise<void>
      openFolder: (meetingId: string) => Promise<void>
      onTranscriptionProgress: (callback: (data: { meetingId: string; status: string; progress?: number }) => void) => () => void
    }
  }
}
