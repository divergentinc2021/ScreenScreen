import { useState, useEffect } from 'react'
import { useMeetingStore } from '../stores/meetingStore'

export default function SettingsPanel() {
  const { settings, saveSettings } = useMeetingStore()
  const [workerUrl, setWorkerUrl] = useState(settings.workerUrl)
  const [saved, setSaved] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null)

  useEffect(() => {
    setWorkerUrl(settings.workerUrl)
  }, [settings])

  const handleSave = async () => {
    await saveSettings({ workerUrl })
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

  return (
    <div className="flex-1 flex flex-col p-8 max-w-xl">
      <h1 className="font-heading font-semibold text-xl mb-6">Settings</h1>

      <div className="flex flex-col gap-6">
        {/* Worker URL */}
        <div className="bg-surface rounded-xl p-5 border border-border">
          <h2 className="font-heading font-semibold text-base mb-3">Cloudflare Worker</h2>
          <p className="text-xs text-muted mb-4">
            Your Worker handles both transcription (Whisper AI) and summaries (Llama 3.1).
            Both features require this URL to be set.
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
                onClick={handleSave}
                className="flex-1 px-4 py-2 bg-accent hover:bg-accent-hover rounded-lg text-sm font-medium transition"
              >
                {saved ? 'Saved!' : 'Save'}
              </button>
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

        {/* How it works */}
        <div className="bg-surface rounded-xl p-5 border border-border">
          <h2 className="font-heading font-semibold text-base mb-3">How It Works</h2>
          <div className="flex flex-col gap-3 text-sm text-muted">
            <Step n={1} text="Record a meeting (screen audio + mic)" />
            <Step n={2} text="Audio is converted to WAV and uploaded to your Worker" />
            <Step n={3} text="Cloudflare Whisper AI transcribes the audio" />
            <Step n={4} text="Llama 3.1 generates a summary with action items" />
          </div>
        </div>
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
