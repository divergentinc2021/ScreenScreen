import { useState, useEffect } from 'react'
import { useMeetingStore } from '../stores/meetingStore'

type ModelInfo = {
  id: string
  name: string
  size: string
  downloaded: boolean
  downloading: boolean
  progress: number
}

export default function SettingsPanel() {
  const { settings, saveSettings } = useMeetingStore()
  const [mode, setMode] = useState<'local' | 'cloud'>(settings.transcriptionMode || 'cloud')
  const [selectedModel, setSelectedModel] = useState(settings.whisperModel || 'base')
  const [workerUrl, setWorkerUrl] = useState(settings.workerUrl)
  const [language, setLanguage] = useState(settings.language || 'auto')
  const [translateToEnglish, setTranslateToEnglish] = useState(settings.translateToEnglish || false)
  const [saved, setSaved] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null)
  const [models, setModels] = useState<ModelInfo[]>([])
  const [calendarConnected, setCalendarConnected] = useState(false)
  const [calendarEnabled, setCalendarEnabled] = useState(settings.calendar?.enabled || false)
  const [autoRecord, setAutoRecord] = useState(settings.calendar?.autoRecord || false)
  const [reminderMinutes, setReminderMinutes] = useState(settings.calendar?.reminderMinutes || 5)
  const [connectingCalendar, setConnectingCalendar] = useState(false)
  const [upcomingEvents, setUpcomingEvents] = useState<any[]>([])

  useEffect(() => {
    setWorkerUrl(settings.workerUrl)
    setMode(settings.transcriptionMode || 'cloud')
    setSelectedModel(settings.whisperModel || 'base')
    setLanguage(settings.language || 'auto')
    setTranslateToEnglish(settings.translateToEnglish || false)
    setCalendarEnabled(settings.calendar?.enabled || false)
    setAutoRecord(settings.calendar?.autoRecord || false)
    setReminderMinutes(settings.calendar?.reminderMinutes || 5)
  }, [settings])

  useEffect(() => {
    checkCalendarStatus()
  }, [])

  const checkCalendarStatus = async () => {
    try {
      const connected = await window.api.calendarIsConnected()
      setCalendarConnected(connected)
      if (connected) {
        const events = await window.api.getUpcomingEvents()
        setUpcomingEvents(events)
      }
    } catch { /* calendar not available */ }
  }

  const handleConnectCalendar = async () => {
    setConnectingCalendar(true)
    try {
      const result = await window.api.googleCalendarAuth()
      if (result.success) {
        setCalendarConnected(true)
        const events = await window.api.getUpcomingEvents()
        setUpcomingEvents(events)
      } else {
        alert(`Calendar connection failed: ${result.error}`)
      }
    } catch (err: any) {
      alert(`Failed: ${err.message}`)
    }
    setConnectingCalendar(false)
  }

  const handleDisconnectCalendar = async () => {
    await window.api.googleCalendarDisconnect()
    setCalendarConnected(false)
    setUpcomingEvents([])
  }

  useEffect(() => {
    loadModels()
    const unsub = window.api.onModelDownloadProgress((data) => {
      setModels(prev => prev.map(m =>
        m.id === data.modelId
          ? { ...m, progress: data.progress, downloading: data.progress < 100 }
          : m
      ))
      // When download completes, refresh model list
      if (data.progress >= 100) {
        setTimeout(loadModels, 500)
      }
    })
    return unsub
  }, [])

  const loadModels = async () => {
    try {
      const status = await window.api.getModelStatus()
      setModels(status)
    } catch { /* ignore if not available */ }
  }

  const handleSave = async () => {
    await saveSettings({
      workerUrl,
      transcriptionMode: mode,
      whisperModel: selectedModel,
      language,
      translateToEnglish,
      calendar: {
        enabled: calendarEnabled,
        autoRecord,
        reminderMinutes
      }
    } as any)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleTest = async () => {
    if (!workerUrl) return
    setTesting(true)
    setTestResult(null)
    try {
      const res = await fetch(workerUrl)
      const data = await res.json()
      if (data.status === 'ok') {
        setTestResult({ ok: true, msg: 'Connected! Worker is running.' })
      } else {
        setTestResult({ ok: false, msg: 'Unexpected response from Worker.' })
      }
    } catch (err: any) {
      setTestResult({ ok: false, msg: `Connection failed: ${err.message}` })
    }
    setTesting(false)
  }

  const handleDownload = async (modelId: string) => {
    setModels(prev => prev.map(m =>
      m.id === modelId ? { ...m, downloading: true, progress: 0 } : m
    ))
    try {
      await window.api.downloadModel(modelId as any)
      loadModels()
    } catch (err: any) {
      alert(`Download failed: ${err.message}`)
      loadModels()
    }
  }

  const handleDelete = async (modelId: string) => {
    try {
      await window.api.deleteModel(modelId as any)
      loadModels()
    } catch (err: any) {
      alert(`Delete failed: ${err.message}`)
    }
  }

  return (
    <div className="flex-1 flex flex-col p-8 max-w-xl overflow-auto">
      <h1 className="font-heading font-semibold text-xl mb-6">Settings</h1>

      <div className="flex flex-col gap-6">
        {/* Transcription Mode */}
        <div className="bg-surface rounded-xl p-5 border border-border">
          <h2 className="font-heading font-semibold text-base mb-3">Transcription Mode</h2>
          <p className="text-xs text-muted mb-4">
            Choose how audio is transcribed. Local runs on your machine (no internet needed).
            Cloud uses Cloudflare Workers AI.
          </p>

          <div className="flex gap-2">
            <button
              onClick={() => setMode('local')}
              className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition border ${
                mode === 'local'
                  ? 'bg-accent/15 border-accent text-accent'
                  : 'bg-surface2 border-border text-muted hover:border-accent/50'
              }`}
            >
              Local (whisper.cpp)
            </button>
            <button
              onClick={() => setMode('cloud')}
              className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition border ${
                mode === 'cloud'
                  ? 'bg-accent/15 border-accent text-accent'
                  : 'bg-surface2 border-border text-muted hover:border-accent/50'
              }`}
            >
              Cloud (Cloudflare)
            </button>
          </div>
        </div>

        {/* Local Mode: Model Manager */}
        {mode === 'local' && (
          <div className="bg-surface rounded-xl p-5 border border-border">
            <h2 className="font-heading font-semibold text-base mb-3">Whisper Model</h2>
            <p className="text-xs text-muted mb-4">
              Select and download a model. Larger models are more accurate but slower and use more disk space.
            </p>

            <div className="flex flex-col gap-3">
              {models.map((model) => (
                <ModelCard
                  key={model.id}
                  model={model}
                  isSelected={selectedModel === model.id}
                  onSelect={() => setSelectedModel(model.id)}
                  onDownload={() => handleDownload(model.id)}
                  onDelete={() => handleDelete(model.id)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Cloud Mode: Worker URL */}
        {mode === 'cloud' && (
          <div className="bg-surface rounded-xl p-5 border border-border">
            <h2 className="font-heading font-semibold text-base mb-3">Cloudflare Worker</h2>
            <p className="text-xs text-muted mb-4">
              Your Worker handles transcription (Whisper AI) and summaries (Llama 3.1).
            </p>

            <div className="flex flex-col gap-2">
              <input
                type="url"
                placeholder="https://meeting-summarizer.your-subdomain.workers.dev"
                value={workerUrl}
                onChange={(e) => setWorkerUrl(e.target.value)}
                className="px-3 py-2.5 bg-bg border border-border rounded-lg text-sm focus:outline-none focus:border-accent placeholder:text-muted"
              />

              <div className="flex gap-2">
                <button
                  onClick={handleTest}
                  disabled={!workerUrl || testing}
                  className="px-4 py-2 bg-surface2 hover:bg-border rounded-lg text-sm text-muted font-medium transition disabled:opacity-50"
                >
                  {testing ? 'Testing...' : 'Test Connection'}
                </button>
              </div>

              {testResult && (
                <div className={`p-2.5 rounded-lg text-xs ${
                  testResult.ok ? 'bg-green/10 text-green border border-green/20' : 'bg-red/10 text-red border border-red/20'
                }`}>
                  {testResult.msg}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Worker URL (always needed for summaries + minutes) */}
        {mode === 'local' && (
          <div className="bg-surface rounded-xl p-5 border border-border">
            <h2 className="font-heading font-semibold text-base mb-3">Cloudflare Worker (for Summaries)</h2>
            <p className="text-xs text-muted mb-4">
              Even with local transcription, summaries and meeting minutes still use Cloudflare Workers AI.
            </p>
            <input
              type="url"
              placeholder="https://meeting-summarizer.your-subdomain.workers.dev"
              value={workerUrl}
              onChange={(e) => setWorkerUrl(e.target.value)}
              className="px-3 py-2.5 bg-bg border border-border rounded-lg text-sm focus:outline-none focus:border-accent placeholder:text-muted w-full"
            />
          </div>
        )}

        {/* Transcription Language */}
        <div className="bg-surface rounded-xl p-5 border border-border">
          <h2 className="font-heading font-semibold text-base mb-3">Transcription Language</h2>
          <p className="text-xs text-muted mb-4">
            Select the language of your recordings. Auto-detect works for most cases.
          </p>
          <select
            value={language}
            onChange={e => {
              setLanguage(e.target.value)
              if (e.target.value === 'en' || e.target.value === 'auto') setTranslateToEnglish(false)
            }}
            className="w-full px-3 py-2.5 bg-bg border border-border rounded-lg text-sm focus:outline-none focus:border-accent"
          >
            <option value="auto">Auto-detect</option>
            <option value="en">English</option>
            <option value="fr">French / Français</option>
            <option value="es">Spanish / Español</option>
            <option value="de">German / Deutsch</option>
            <option value="pt">Portuguese / Português</option>
            <option value="af">Afrikaans</option>
            <option value="zu">Zulu / isiZulu</option>
            <option value="xh">Xhosa / isiXhosa</option>
          </select>

          {language !== 'en' && language !== 'auto' && (
            <label className="flex items-center gap-3 mt-3 p-3 rounded-lg bg-bg border border-border cursor-pointer">
              <input
                type="checkbox"
                checked={translateToEnglish}
                onChange={e => setTranslateToEnglish(e.target.checked)}
                className="w-4 h-4 accent-accent"
              />
              <div>
                <p className="text-sm font-medium">Translate to English</p>
                <p className="text-xs text-muted">Whisper will translate the transcript to English</p>
              </div>
            </label>
          )}
        </div>

        {/* Google Calendar Integration */}
        <div className="bg-surface rounded-xl p-5 border border-border">
          <h2 className="font-heading font-semibold text-base mb-3">Google Calendar</h2>
          <p className="text-xs text-muted mb-4">
            Sync with Google Calendar to get reminders before meetings and auto-start recording.
          </p>

          {!calendarConnected ? (
            <button
              onClick={handleConnectCalendar}
              disabled={connectingCalendar}
              className="px-4 py-2.5 rounded-lg text-sm font-medium transition border bg-accent/15 border-accent text-accent hover:bg-accent/25 disabled:opacity-50 flex items-center gap-2"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              {connectingCalendar ? 'Connecting...' : 'Connect Google Calendar'}
            </button>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-sm text-green">
                  <span className="w-2 h-2 rounded-full bg-green" />
                  Connected to Google Calendar
                </span>
                <button
                  onClick={handleDisconnectCalendar}
                  className="text-xs text-muted hover:text-red transition"
                >
                  Disconnect
                </button>
              </div>

              <label className="flex items-center gap-3 p-3 rounded-lg bg-bg border border-border cursor-pointer">
                <input
                  type="checkbox"
                  checked={calendarEnabled}
                  onChange={e => setCalendarEnabled(e.target.checked)}
                  className="w-4 h-4 accent-accent"
                />
                <div>
                  <p className="text-sm font-medium">Enable meeting reminders</p>
                  <p className="text-xs text-muted">Get notified before meetings with Zoom/Teams/Meet links</p>
                </div>
              </label>

              {calendarEnabled && (
                <>
                  <label className="flex items-center gap-3 p-3 rounded-lg bg-bg border border-border cursor-pointer">
                    <input
                      type="checkbox"
                      checked={autoRecord}
                      onChange={e => setAutoRecord(e.target.checked)}
                      className="w-4 h-4 accent-accent"
                    />
                    <div>
                      <p className="text-sm font-medium">Auto-start recording</p>
                      <p className="text-xs text-muted">Automatically begin recording when a meeting starts</p>
                    </div>
                  </label>

                  <div className="flex items-center gap-3 p-3 rounded-lg bg-bg border border-border">
                    <div className="flex-1">
                      <p className="text-sm font-medium">Reminder time</p>
                      <p className="text-xs text-muted">Minutes before meeting to show notification</p>
                    </div>
                    <select
                      value={reminderMinutes}
                      onChange={e => setReminderMinutes(Number(e.target.value))}
                      className="px-2 py-1.5 bg-surface border border-border rounded-lg text-sm"
                    >
                      <option value={1}>1 min</option>
                      <option value={2}>2 min</option>
                      <option value={5}>5 min</option>
                      <option value={10}>10 min</option>
                      <option value={15}>15 min</option>
                    </select>
                  </div>
                </>
              )}

              {/* Upcoming events preview */}
              {upcomingEvents.length > 0 && (
                <div className="mt-2">
                  <p className="text-xs text-muted font-medium mb-2">Upcoming meetings (24h)</p>
                  <div className="flex flex-col gap-1.5">
                    {upcomingEvents.slice(0, 5).map(event => (
                      <div key={event.id} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-bg text-xs">
                        <span className={`w-2 h-2 rounded-full ${
                          event.platform === 'zoom' ? 'bg-blue-400' :
                          event.platform === 'teams' ? 'bg-purple-400' :
                          event.platform === 'meet' ? 'bg-green' : 'bg-muted'
                        }`} />
                        <span className="flex-1 truncate font-medium">{event.title}</span>
                        <span className="text-muted">
                          {new Date(event.start).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        {event.platform && (
                          <span className="text-muted capitalize">{event.platform}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Save button */}
        <button
          onClick={handleSave}
          className="px-4 py-2.5 bg-accent hover:bg-accent-hover rounded-lg text-sm font-medium transition"
        >
          {saved ? 'Saved!' : 'Save Settings'}
        </button>

        {/* How it works */}
        <div className="bg-surface rounded-xl p-5 border border-border">
          <h2 className="font-heading font-semibold text-base mb-3">How It Works</h2>
          <div className="flex flex-col gap-3 text-sm text-muted">
            <Step n={1} text="Record a meeting (screen audio + mic)" />
            <Step n={2} text={mode === 'local'
              ? "Audio is converted to WAV and processed locally by whisper.cpp"
              : "Audio is converted to WAV and uploaded to your Worker"
            } />
            <Step n={3} text={mode === 'local'
              ? "whisper.cpp transcribes the audio on your machine"
              : "Cloudflare Whisper AI transcribes the audio"
            } />
            <Step n={4} text="Llama 3.1 generates a summary with action items" />
            <Step n={5} text="Generate professional meeting minutes with export options" />
          </div>
        </div>
      </div>
    </div>
  )
}

function ModelCard({ model, isSelected, onSelect, onDownload, onDelete }: {
  model: ModelInfo
  isSelected: boolean
  onSelect: () => void
  onDownload: () => void
  onDelete: () => void
}) {
  return (
    <div className={`p-4 rounded-lg border transition ${
      isSelected ? 'border-accent bg-accent/5' : 'border-border bg-surface2'
    }`}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-medium">{model.name}</span>
        <span className="text-xs text-muted">{model.size}</span>
      </div>

      {/* Download progress bar */}
      {model.downloading && (
        <div className="mt-2 mb-2">
          <div className="h-1.5 bg-bg rounded-full overflow-hidden">
            <div
              className="h-full bg-accent transition-all duration-300"
              style={{ width: `${model.progress}%` }}
            />
          </div>
          <span className="text-xs text-muted mt-1">{model.progress}%</span>
        </div>
      )}

      <div className="flex gap-2 mt-2">
        {model.downloaded ? (
          <>
            <button
              onClick={onSelect}
              className={`px-3 py-1.5 rounded text-xs font-medium transition ${
                isSelected
                  ? 'bg-accent text-white'
                  : 'bg-surface hover:bg-border text-muted'
              }`}
            >
              {isSelected ? 'Selected' : 'Select'}
            </button>
            <button
              onClick={onDelete}
              className="px-3 py-1.5 rounded text-xs font-medium bg-surface hover:bg-red/20 text-muted hover:text-red transition"
            >
              Delete
            </button>
          </>
        ) : (
          <button
            onClick={onDownload}
            disabled={model.downloading}
            className="px-3 py-1.5 rounded text-xs font-medium bg-accent/15 text-accent hover:bg-accent/25 transition disabled:opacity-50"
          >
            {model.downloading ? 'Downloading...' : 'Download'}
          </button>
        )}
      </div>
    </div>
  )
}

function Step({ n, text }: { n: number; text: string }) {
  return (
    <div className="flex gap-3 items-start">
      <span className="w-6 h-6 rounded-full bg-accent/15 text-accent text-xs font-bold flex items-center justify-center shrink-0">
        {n}
      </span>
      <span>{text}</span>
    </div>
  )
}
