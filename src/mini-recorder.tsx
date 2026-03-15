import { StrictMode, useState, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import './mini-recorder.css'

function formatTime(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}

function MiniRecorder() {
  const [time, setTime] = useState(0)
  const [screenshotCount, setScreenshotCount] = useState(0)

  useEffect(() => {
    const unsub = window.api.onMiniStateUpdate((state: any) => {
      setTime(state.time)
      setScreenshotCount(state.screenshotCount)
    })
    return unsub
  }, [])

  return (
    <div className="mini-drag w-full h-full flex items-center">
      <div className="flex items-center gap-3 px-4 py-2 bg-surface/95 backdrop-blur-xl rounded-2xl border border-red/30 shadow-2xl w-full mx-1">
        {/* Recording dot */}
        <div className="pulse-dot w-2.5 h-2.5 rounded-full bg-red shrink-0" />

        {/* REC label */}
        <span className="text-red text-xs font-semibold tracking-wider uppercase shrink-0">REC</span>

        {/* Timer */}
        <span className="text-text text-lg font-heading font-semibold tabular-nums flex-1" style={{ fontVariantNumeric: 'tabular-nums' }}>
          {formatTime(time)}
        </span>

        {/* Screenshot button */}
        <button
          onClick={() => window.api.miniTakeScreenshot()}
          className="mini-no-drag relative p-1.5 rounded-lg hover:bg-surface2 transition text-muted hover:text-text"
          title="Take screenshot"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
            <circle cx="12" cy="13" r="4" />
          </svg>
          {screenshotCount > 0 && (
            <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-accent text-[9px] font-bold flex items-center justify-center text-white">
              {screenshotCount}
            </span>
          )}
        </button>

        {/* Stop button */}
        <button
          onClick={() => window.api.miniStopRecording()}
          className="mini-no-drag w-8 h-8 rounded-lg bg-red hover:bg-red/80 flex items-center justify-center transition"
          title="Stop recording"
        >
          <div className="w-3 h-3 rounded-sm bg-white" />
        </button>

        {/* Expand/show main */}
        <button
          onClick={() => window.api.miniShowMain()}
          className="mini-no-drag p-1.5 rounded-lg hover:bg-surface2 transition text-muted hover:text-text"
          title="Show main window"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 3 21 3 21 9" />
            <polyline points="9 21 3 21 3 15" />
            <line x1="21" y1="3" x2="14" y2="10" />
            <line x1="3" y1="21" x2="10" y2="14" />
          </svg>
        </button>
      </div>
    </div>
  )
}

createRoot(document.getElementById('mini-root')!).render(
  <StrictMode>
    <MiniRecorder />
  </StrictMode>
)
