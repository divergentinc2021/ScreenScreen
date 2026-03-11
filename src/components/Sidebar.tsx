import { useMeetingStore } from '../stores/meetingStore'

export default function Sidebar() {
  const { view, setView, meetings, selectMeeting, currentMeeting, isRecording } = useMeetingStore()

  return (
    <aside className="w-64 bg-surface border-r border-border flex flex-col pt-8">
      {/* Brand */}
      <div className="px-4 pb-4 border-b border-border">
        <h1 className="font-heading font-bold text-lg flex items-center gap-2">
          <span className="text-red text-xl">●</span>
          DiScreenRecorder
        </h1>
        <p className="text-muted text-xs mt-1">Record · Transcribe · Summarize</p>
      </div>

      {/* Nav */}
      <nav className="p-2 flex flex-col gap-1">
        <NavButton
          active={view === 'record'}
          onClick={() => setView('record')}
          icon={isRecording ? '⏺' : '🎙'}
          label={isRecording ? 'Recording...' : 'New Recording'}
        />
        <NavButton
          active={view === 'settings'}
          onClick={() => setView('settings')}
          icon="⚙"
          label="Settings"
        />
      </nav>

      {/* Meetings list */}
      <div className="flex-1 overflow-auto px-2 pb-2">
        <h2 className="text-muted text-xs font-semibold uppercase tracking-wider px-2 py-3">
          Meetings ({meetings.length})
        </h2>
        <div className="flex flex-col gap-1">
          {meetings.map((m) => (
            <button
              key={m.id}
              onClick={() => selectMeeting(m.id)}
              className={`w-full text-left px-3 py-2.5 rounded-lg transition text-sm ${
                currentMeeting?.meta.id === m.id
                  ? 'bg-accent/15 text-accent'
                  : 'hover:bg-surface2 text-text'
              }`}
            >
              <div className="font-medium truncate">{m.title}</div>
              <div className="text-xs text-muted mt-0.5 flex justify-between">
                <span>{new Date(m.date).toLocaleDateString('en-ZA')}</span>
                <span>{Math.floor(m.duration / 60)}m</span>
              </div>
            </button>
          ))}

          {meetings.length === 0 && (
            <p className="text-muted text-xs text-center py-6">No meetings yet</p>
          )}
        </div>
      </div>
    </aside>
  )
}

function NavButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: string; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition ${
        active ? 'bg-accent/15 text-accent' : 'hover:bg-surface2 text-text'
      }`}
    >
      <span className="text-base">{icon}</span>
      {label}
    </button>
  )
}
