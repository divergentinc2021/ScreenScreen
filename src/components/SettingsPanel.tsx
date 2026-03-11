import { useState, useEffect } from 'react'
import { useMeetingStore } from '../stores/meetingStore'

export default function SettingsPanel() {
  const { settings, saveSettings } = useMeetingStore()
  const [workerUrl, setWorkerUrl] = useState(settings.workerUrl)
  const [whisperModel, setWhisperModel] = useState(settings.whisperModel)
  const [saved, setSaved] = useState(false)

  // Whisper model state
  const [modelReady, setModelReady] = useState(false)
  const [modelLoading, setModelLoading] = useState(false)
  const [modelProgress, setModelProgress] = useState<{ status: string; progress?: number } | null>(null)
  const [modelError, setModelError] = useState<string | null>(null)

  useEffect(() => {
    setWorkerUrl(settings.workerUrl)
    setWhisperModel(settings.whisperModel)
  }, [settings])

  // Check model status on mount
  useEffect(() => {
    window.api.getModelStatus().then(({ ready }) => setModelReady(ready))
  }, [])

  // Listen for model download progress
  useEffect(() => {
    const unsub = window.api.onModelProgress((data) => {
      setModelProgress(data)
      if (data.status === 'Model ready') {
        setModelReady(true)
        setModelLoading(false)
      }
    })
    return unsub
  }, [])

  const handleSave = async () => {
    await saveSettings({ workerUrl, whisperModel })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleInitWhisper = async () => {
    setModelLoading(true)
    setModelError(null)
    setModelProgress({ status: 'Starting...', progress: 0 })

    const result = await window.api.prepareModel(whisperModel)

    if (!result.success) {
      setModelError(result.error || 'Failed to initialize Whisper')
      setModelLoading(false)
      setModelProgress(null)
    }
  }

  return (
    <div className="flex-1 flex flex-col p-8 max-w-xl">
      <h1 className="font-heading font-semibold text-xl mb-6">Settings</h1>

      <div className="flex flex-col gap-6">
        {/* Whisper Model Section */}
        <div className="bg-surface rounded-xl p-5 border border-border">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-heading font-semibold text-base">Whisper Transcription</h2>
            <WhisperStatus ready={modelReady} loading={modelLoading} />
          </div>

          {/* Model selector */}
          <div className="flex flex-col gap-1.5 mb-4">
            <label className="text-sm font-medium">Model</label>
            <select
              value={whisperModel}
              onChange={(e) => setWhisperModel(e.target.value)}
              disabled={modelLoading}
              className="px-3 py-2 bg-bg border border-border rounded-lg text-sm focus:outline-none focus:border-accent disabled:opacity-50"
            >
              <option value="Xenova/whisper-tiny">Tiny (~75MB, fastest, lower accuracy)</option>
              <option value="Xenova/whisper-base">Base (~150MB, balanced)</option>
              <option value="Xenova/whisper-small">Small (~250MB, recommended)</option>
            </select>
          </div>

          {/* Progress bar */}
          {modelLoading && modelProgress && (
            <div className="mb-4">
              <div className="flex justify-between text-xs text-muted mb-1">
                <span>{modelProgress.status}</span>
                {modelProgress.progress !== undefined && <span>{modelProgress.progress}%</span>}
              </div>
              <div className="h-2 bg-bg rounded-full overflow-hidden">
                <div
                  className="h-full bg-accent rounded-full transition-all duration-300"
                  style={{ width: `${modelProgress.progress || 0}%` }}
                />
              </div>
            </div>
          )}

          {/* Error */}
          {modelError && (
            <div className="mb-4 p-3 bg-red/10 border border-red/20 rounded-lg text-xs text-red">
              {modelError}
            </div>
          )}

          {/* Initialize button */}
          <button
            onClick={handleInitWhisper}
            disabled={modelLoading}
            className={`w-full px-5 py-2.5 rounded-lg text-sm font-medium transition ${
              modelReady
                ? 'bg-green/15 text-green border border-green/30 hover:bg-green/25'
                : 'bg-accent hover:bg-accent-hover text-text'
            } disabled:opacity-50`}
          >
            {modelLoading
              ? 'Initializing...'
              : modelReady
                ? 'Whisper Ready — Re-initialize'
                : 'Initialize Whisper'
            }
          </button>

          <p className="text-xs text-muted mt-2">
            {modelReady
              ? 'Whisper is ready to transcribe. You can now use the Transcribe button on any recording.'
              : 'Download and load the Whisper model before transcribing. This only needs to be done once per session.'
            }
          </p>
        </div>

        {/* Worker URL */}
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium">Cloudflare Worker URL</label>
          <input
            type="url"
            placeholder="https://meeting-summarizer.your-subdomain.workers.dev"
            value={workerUrl}
            onChange={(e) => setWorkerUrl(e.target.value)}
            className="px-3 py-2 bg-surface border border-border rounded-lg text-sm focus:outline-none focus:border-accent placeholder:text-muted"
          />
          <p className="text-xs text-muted">
            Deploy the included Cloudflare Worker to get AI summaries.
          </p>
        </div>

        {/* Save */}
        <button
          onClick={handleSave}
          className="self-start px-5 py-2 bg-accent hover:bg-accent-hover rounded-lg text-sm font-medium transition"
        >
          {saved ? 'Saved!' : 'Save Settings'}
        </button>
      </div>
    </div>
  )
}

function WhisperStatus({ ready, loading }: { ready: boolean; loading: boolean }) {
  if (loading) {
    return (
      <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-yellow/15 text-yellow">
        <span className="w-2 h-2 rounded-full bg-yellow animate-pulse" />
        Loading...
      </span>
    )
  }
  if (ready) {
    return (
      <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-green/15 text-green">
        <span className="w-2 h-2 rounded-full bg-green" />
        Ready
      </span>
    )
  }
  return (
    <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-red/15 text-red">
      <span className="w-2 h-2 rounded-full bg-red" />
      Not Initialized
    </span>
  )
}
