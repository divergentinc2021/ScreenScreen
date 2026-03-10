import { useState, useEffect } from 'react'
import { useMeetingStore } from '../stores/meetingStore'

export default function SettingsPanel() {
  const { settings, saveSettings } = useMeetingStore()
  const [workerUrl, setWorkerUrl] = useState(settings.workerUrl)
  const [whisperModel, setWhisperModel] = useState(settings.whisperModel)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    setWorkerUrl(settings.workerUrl)
    setWhisperModel(settings.whisperModel)
  }, [settings])

  const handleSave = async () => {
    await saveSettings({ workerUrl, whisperModel })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="flex-1 flex flex-col p-8 max-w-xl">
      <h1 className="font-heading font-semibold text-xl mb-6">Settings</h1>

      <div className="flex flex-col gap-5">
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
            Leave blank to skip summary generation.
          </p>
        </div>

        {/* Whisper Model */}
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium">Whisper Model</label>
          <select
            value={whisperModel}
            onChange={(e) => setWhisperModel(e.target.value)}
            className="px-3 py-2 bg-surface border border-border rounded-lg text-sm focus:outline-none focus:border-accent"
          >
            <option value="Xenova/whisper-tiny">Tiny (~75MB, fastest, lower accuracy)</option>
            <option value="Xenova/whisper-base">Base (~150MB, balanced)</option>
            <option value="Xenova/whisper-small">Small (~250MB, recommended)</option>
          </select>
          <p className="text-xs text-muted">
            Model downloads on first use and is cached locally. Larger models are more accurate but slower.
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
