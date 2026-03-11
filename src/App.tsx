import { useEffect } from 'react'
import { useMeetingStore } from './stores/meetingStore'
import Sidebar from './components/Sidebar'
import RecordingPanel from './components/RecordingPanel'
import TranscriptView from './components/TranscriptView'
import SummaryView from './components/SummaryView'
import SettingsPanel from './components/SettingsPanel'

export default function App() {
  const { view, currentMeeting, loadMeetings, loadSettings, setTranscriptionProgress } = useMeetingStore()

  useEffect(() => {
    loadMeetings()
    loadSettings()
    const unsub = window.api.onTranscriptionProgress((data) => {
      setTranscriptionProgress(data)
    })
    return unsub
  }, [])

  return (
    <div className="flex h-screen bg-bg">
      {/* Title bar spacer for macOS */}
      <div className="titlebar fixed top-0 left-0 right-0 h-8 z-50" />

      <Sidebar />

      <main className="flex-1 flex flex-col pt-8 overflow-hidden">
        {view === 'record' && <RecordingPanel />}

        {view === 'meeting' && currentMeeting && (
          <MeetingView />
        )}

        {view === 'settings' && <SettingsPanel />}
      </main>
    </div>
  )
}

function MeetingView() {
  const { currentMeeting } = useMeetingStore()
  if (!currentMeeting) return null

  const { meta, transcript, summary } = currentMeeting
  const hasTranscript = !!transcript
  const hasSummary = !!summary

  return (
    <div className="flex-1 flex flex-col overflow-hidden p-6 gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-heading font-semibold">{meta.title}</h1>
          <p className="text-muted text-sm">
            {new Date(meta.date).toLocaleDateString('en-ZA', {
              weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
              hour: '2-digit', minute: '2-digit'
            })}
            {' · '}
            {Math.floor(meta.duration / 60)}m {Math.floor(meta.duration % 60)}s
          </p>
        </div>
        <StatusBadge status={meta.status} />
      </div>

      {/* Audio player */}
      <AudioPlayer path={currentMeeting.audioPath} />

      {/* Actions */}
      <MeetingActions meetingId={meta.id} hasTranscript={hasTranscript} hasSummary={hasSummary} />

      {/* Content */}
      <div className="flex-1 flex gap-4 overflow-hidden">
        {hasTranscript && (
          <div className="flex-1 overflow-auto">
            <TranscriptView segments={transcript!.segments} />
          </div>
        )}
        {hasSummary && (
          <div className="flex-1 overflow-auto">
            <SummaryView summary={summary!} />
          </div>
        )}
      </div>
    </div>
  )
}

function AudioPlayer({ path }: { path: string }) {
  return (
    <div className="bg-surface rounded-lg p-3">
      <audio
        controls
        src={`file://${path}`}
        className="w-full h-8 [&::-webkit-media-controls-panel]:bg-surface"
      />
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    recorded: 'bg-yellow/20 text-yellow',
    transcribing: 'bg-accent/20 text-accent',
    transcribed: 'bg-green/20 text-green',
    summarized: 'bg-green/20 text-green'
  }
  return (
    <span className={`px-3 py-1 rounded-full text-xs font-medium ${colors[status] || 'bg-surface2 text-muted'}`}>
      {status}
    </span>
  )
}

function MeetingActions({ meetingId, hasTranscript, hasSummary }: { meetingId: string; hasTranscript: boolean; hasSummary: boolean }) {
  const { transcriptionProgress, loadMeetings, selectMeeting, settings, setView } = useMeetingStore()

  const handleTranscribe = async () => {
    // Check if Whisper is initialized first
    const { ready } = await window.api.getModelStatus()
    if (!ready) {
      alert('Whisper is not initialized. Go to Settings and click "Initialize Whisper" first.')
      setView('settings')
      return
    }
    try {
      await window.api.transcribe(meetingId)
      await loadMeetings()
      await selectMeeting(meetingId)
    } catch (err: any) {
      alert(`Transcription failed: ${err.message}`)
    }
  }

  const handleSummarize = async () => {
    if (!settings.workerUrl) {
      alert('Set your Cloudflare Worker URL in Settings first.')
      return
    }
    try {
      await window.api.summarize(meetingId, settings.workerUrl)
      await loadMeetings()
      await selectMeeting(meetingId)
    } catch (err: any) {
      alert(`Summary failed: ${err.message}`)
    }
  }

  return (
    <div className="flex gap-3">
      {!hasTranscript && (
        <button
          onClick={handleTranscribe}
          disabled={!!transcriptionProgress}
          className="px-4 py-2 bg-accent hover:bg-accent-hover rounded-lg text-sm font-medium transition disabled:opacity-50"
        >
          {transcriptionProgress
            ? `${transcriptionProgress.status} ${transcriptionProgress.progress ? `(${transcriptionProgress.progress}%)` : ''}`
            : 'Transcribe'}
        </button>
      )}
      {hasTranscript && !hasSummary && (
        <button
          onClick={handleSummarize}
          className="px-4 py-2 bg-accent hover:bg-accent-hover rounded-lg text-sm font-medium transition"
        >
          Generate Summary
        </button>
      )}
      <button
        onClick={() => window.api.openFolder(meetingId)}
        className="px-4 py-2 bg-surface2 hover:bg-border rounded-lg text-sm text-muted transition"
      >
        Open Folder
      </button>
    </div>
  )
}
