import { useEffect, useState } from 'react'
import { useMeetingStore } from './stores/meetingStore'
import Sidebar from './components/Sidebar'
import RecordingPanel from './components/RecordingPanel'
import TranscriptView from './components/TranscriptView'
import SummaryView from './components/SummaryView'
import MeetingMinutesView from './components/MeetingMinutesView'
import SettingsPanel from './components/SettingsPanel'

export default function App() {
  const { view, currentMeeting, loadMeetings, loadSettings, setTranscriptionProgress, setView } = useMeetingStore()
  const [meetingReminder, setMeetingReminder] = useState<any>(null)

  useEffect(() => {
    loadMeetings()
    loadSettings()
    const unsub = window.api.onTranscriptionProgress((data) => {
      setTranscriptionProgress(data)
    })
    const unsubReminder = window.api.onMeetingReminder((event) => {
      setMeetingReminder(event)
    })
    return () => { unsub(); unsubReminder() }
  }, [])

  const dismissReminder = () => setMeetingReminder(null)

  const startRecordingFromReminder = () => {
    setMeetingReminder(null)
    setView('record')
  }

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

        {view === 'minutes' && currentMeeting?.minutes && (
          <MeetingMinutesView
            minutes={currentMeeting.minutes}
            onExport={(format) => window.api.exportMinutes(currentMeeting.meta.id, format)}
          />
        )}

        {view === 'settings' && <SettingsPanel />}
      </main>

      {/* Meeting Reminder Toast */}
      {meetingReminder && (
        <div className="fixed bottom-6 right-6 z-50 bg-surface border border-accent/30 rounded-xl shadow-lg p-5 max-w-sm animate-slide-up">
          <div className="flex items-start gap-3">
            <span className="text-2xl">
              {meetingReminder.platform === 'zoom' ? '📹' :
               meetingReminder.platform === 'teams' ? '👥' :
               meetingReminder.platform === 'meet' ? '🟢' : '📅'}
            </span>
            <div className="flex-1">
              <p className="text-sm font-medium">{meetingReminder.title}</p>
              <p className="text-xs text-muted mt-1">
                Starting at {new Date(meetingReminder.start).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })}
                {meetingReminder.platform && ` on ${meetingReminder.platform.charAt(0).toUpperCase() + meetingReminder.platform.slice(1)}`}
              </p>
              <div className="flex gap-2 mt-3">
                <button
                  onClick={startRecordingFromReminder}
                  className="px-3 py-1.5 bg-accent rounded-lg text-xs font-medium transition hover:bg-accent-hover"
                >
                  Start Recording
                </button>
                <button
                  onClick={dismissReminder}
                  className="px-3 py-1.5 bg-surface2 rounded-lg text-xs text-muted font-medium transition hover:bg-border"
                >
                  Dismiss
                </button>
              </div>
            </div>
            <button onClick={dismissReminder} className="text-muted hover:text-text">&times;</button>
          </div>
        </div>
      )}
    </div>
  )
}

function MeetingView() {
  const { currentMeeting, selectMeeting } = useMeetingStore()
  const [showScreenshots, setShowScreenshots] = useState(false)
  if (!currentMeeting) return null

  const { meta, transcript, summary, minutes, screenshots } = currentMeeting
  const hasTranscript = !!transcript
  const hasSummary = !!summary
  const hasMinutes = !!minutes
  const hasScreenshots = screenshots && screenshots.length > 0

  const handleDeleteScreenshot = async (filename: string) => {
    await window.api.deleteScreenshot(meta.id, filename)
    await selectMeeting(meta.id)
  }

  const formatTimestamp = (s: number) => {
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`
  }

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
            {hasScreenshots && ` · ${screenshots!.length} screenshot${screenshots!.length > 1 ? 's' : ''}`}
          </p>
        </div>
        <StatusBadge status={meta.status} />
      </div>

      {/* Audio player */}
      <AudioPlayer path={currentMeeting.audioPath} />

      {/* Actions */}
      <MeetingActions
        meetingId={meta.id}
        hasTranscript={hasTranscript}
        hasSummary={hasSummary}
        hasMinutes={hasMinutes}
      />

      {/* Screenshots bar */}
      {hasScreenshots && (
        <div className="bg-surface rounded-lg border border-border">
          <button
            onClick={() => setShowScreenshots(!showScreenshots)}
            className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-medium text-muted hover:text-text transition"
          >
            <span className="flex items-center gap-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                <circle cx="12" cy="13" r="4" />
              </svg>
              Screenshots ({screenshots!.length})
            </span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              style={{ transform: showScreenshots ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
          {showScreenshots && (
            <div className="px-4 pb-4 grid grid-cols-3 gap-3">
              {screenshots!.map((ss) => (
                <div key={ss.filename} className="relative group rounded-lg overflow-hidden border border-border">
                  <img
                    src={`file://${currentMeeting.audioPath.replace('audio.webm', `screenshots/${ss.filename}`)}`}
                    alt={`Screenshot at ${formatTimestamp(ss.timestamp)}`}
                    className="w-full aspect-video object-cover"
                  />
                  <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-2 py-1 flex items-center justify-between">
                    <span className="text-xs text-white">{formatTimestamp(ss.timestamp)}</span>
                    <button
                      onClick={() => handleDeleteScreenshot(ss.filename)}
                      className="text-xs text-red hover:text-red/80 opacity-0 group-hover:opacity-100 transition"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

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
    summarized: 'bg-green/20 text-green',
    minutes: 'bg-accent/20 text-accent'
  }
  return (
    <span className={`px-3 py-1 rounded-full text-xs font-medium ${colors[status] || 'bg-surface2 text-muted'}`}>
      {status}
    </span>
  )
}

function MeetingActions({ meetingId, hasTranscript, hasSummary, hasMinutes }: {
  meetingId: string; hasTranscript: boolean; hasSummary: boolean; hasMinutes: boolean
}) {
  const { transcriptionProgress, loadMeetings, selectMeeting, settings, setView } = useMeetingStore()

  const handleTranscribe = async () => {
    if (settings.transcriptionMode === 'local') {
      // Local transcription via whisper.cpp
      try {
        const models = await window.api.getModelStatus()
        const selected = models.find(m => m.id === settings.whisperModel)
        if (!selected?.downloaded) {
          alert(`Model "${settings.whisperModel}" not downloaded. Go to Settings to download it.`)
          setView('settings')
          return
        }
        await window.api.transcribeLocal(meetingId, settings.whisperModel as any)
        await loadMeetings()
        await selectMeeting(meetingId)
      } catch (err: any) {
        alert(`Local transcription failed: ${err.message}`)
      }
    } else {
      // Cloud transcription via Cloudflare Worker
      if (!settings.workerUrl) {
        alert('Set your Cloudflare Worker URL in Settings first.')
        setView('settings')
        return
      }
      try {
        const options: { language?: string; task?: string } = {}
        if (settings.language && settings.language !== 'auto') options.language = settings.language
        if (settings.translateToEnglish) options.task = 'translate'
        await window.api.transcribe(meetingId, settings.workerUrl, options)
        await loadMeetings()
        await selectMeeting(meetingId)
      } catch (err: any) {
        alert(`Transcription failed: ${err.message}`)
      }
    }
  }

  const handleSummarize = async () => {
    if (!settings.workerUrl) {
      alert('Set your Cloudflare Worker URL in Settings first.')
      setView('settings')
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

  const handleGenerateMinutes = async () => {
    if (!settings.workerUrl) {
      alert('Set your Cloudflare Worker URL in Settings first.')
      setView('settings')
      return
    }
    try {
      await window.api.generateMinutes(meetingId, settings.workerUrl)
      await loadMeetings()
      await selectMeeting(meetingId)
    } catch (err: any) {
      alert(`Minutes generation failed: ${err.message}`)
    }
  }

  return (
    <div className="flex gap-3 flex-wrap">
      {/* Transcribe button */}
      {!hasTranscript && (
        <button
          onClick={handleTranscribe}
          disabled={!!transcriptionProgress}
          className="px-4 py-2 bg-accent hover:bg-accent-hover rounded-lg text-sm font-medium transition disabled:opacity-50"
        >
          {transcriptionProgress
            ? `${transcriptionProgress.status} ${transcriptionProgress.progress ? `(${transcriptionProgress.progress}%)` : ''}`
            : settings.transcriptionMode === 'local' ? 'Transcribe (Local)' : 'Transcribe (Cloud)'}
        </button>
      )}

      {/* Summarize button */}
      {hasTranscript && !hasSummary && (
        <button
          onClick={handleSummarize}
          className="px-4 py-2 bg-accent hover:bg-accent-hover rounded-lg text-sm font-medium transition"
        >
          Generate Summary
        </button>
      )}

      {/* Generate Minutes button */}
      {hasTranscript && (
        <button
          onClick={handleGenerateMinutes}
          className="px-4 py-2 bg-accent hover:bg-accent-hover rounded-lg text-sm font-medium transition"
        >
          {hasMinutes ? 'Regenerate Minutes' : 'Generate Minutes'}
        </button>
      )}

      {/* View Minutes button */}
      {hasMinutes && (
        <button
          onClick={() => setView('minutes')}
          className="px-4 py-2 bg-green/15 hover:bg-green/25 text-green rounded-lg text-sm font-medium transition"
        >
          View Minutes
        </button>
      )}

      {/* Open Folder */}
      <button
        onClick={() => window.api.openFolder(meetingId)}
        className="px-4 py-2 bg-surface2 hover:bg-border rounded-lg text-sm text-muted transition"
      >
        Open Folder
      </button>
    </div>
  )
}
