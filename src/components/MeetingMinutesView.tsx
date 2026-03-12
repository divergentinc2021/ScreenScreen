import { useState } from 'react'

type MeetingMinutes = {
  title: string
  date: string
  duration: number
  location: string
  attendees: string[]
  chairperson: string
  absentees: string[]
  agenda: string[]
  discussions: { topic: string; discussion: string; outcome: string }[]
  overview: string
  actionItems: { action: string; owner: string; deadline: string; status: string }[]
  decisions: string[]
  nextMeetingDate: string
  adjournmentTime: string
  transcript: { start: number; end: number; text: string }[]
  generatedAt: string
}

export default function MeetingMinutesView({ minutes, onExport }: {
  minutes: MeetingMinutes
  onExport: (format: 'markdown' | 'pdf' | 'clipboard') => void
}) {
  const [showTranscript, setShowTranscript] = useState(false)
  const [exporting, setExporting] = useState<string | null>(null)

  const handleExport = async (format: 'markdown' | 'pdf' | 'clipboard') => {
    setExporting(format)
    try {
      await onExport(format)
    } catch (err: any) {
      alert(`Export failed: ${err.message}`)
    }
    setExporting(null)
  }

  return (
    <div className="flex-1 overflow-auto p-6">
      {/* Export toolbar */}
      <div className="max-w-3xl mx-auto mb-4 flex justify-end gap-2">
        <ExportBtn
          label="Copy"
          icon="clipboard"
          loading={exporting === 'clipboard'}
          onClick={() => handleExport('clipboard')}
        />
        <ExportBtn
          label="Markdown"
          icon="md"
          loading={exporting === 'markdown'}
          onClick={() => handleExport('markdown')}
        />
        <ExportBtn
          label="PDF"
          icon="pdf"
          loading={exporting === 'pdf'}
          onClick={() => handleExport('pdf')}
        />
      </div>

      {/* Document */}
      <div className="max-w-3xl mx-auto bg-surface rounded-xl border border-border">
        <div className="p-8 flex flex-col gap-6">

          {/* Header */}
          <div className="text-center border-b border-border pb-6">
            <h1 className="font-heading text-2xl font-bold">{minutes.title}</h1>
            <p className="text-muted text-sm mt-2">
              {formatDate(minutes.date)}
              {minutes.duration ? ` | Duration: ${formatDuration(minutes.duration)}` : ''}
            </p>
            {minutes.location && (
              <p className="text-muted text-xs mt-1">{minutes.location}</p>
            )}
            {minutes.chairperson && (
              <p className="text-muted text-xs mt-1">Chairperson: {minutes.chairperson}</p>
            )}
          </div>

          {/* Attendees */}
          {minutes.attendees?.length > 0 && (
            <Section title="Attendees">
              <div className="flex flex-wrap gap-2">
                {minutes.attendees.map((a, i) => (
                  <span key={i} className="px-3 py-1 bg-surface2 rounded-full text-sm">
                    {a}
                  </span>
                ))}
              </div>
              {minutes.absentees?.length > 0 && (
                <p className="text-xs text-muted mt-2">
                  Apologies: {minutes.absentees.join(', ')}
                </p>
              )}
            </Section>
          )}

          {/* Agenda */}
          {minutes.agenda?.length > 0 && (
            <Section title="Agenda">
              <ol className="list-decimal list-inside flex flex-col gap-1 text-sm">
                {minutes.agenda.map((item, i) => (
                  <li key={i} className="text-text/90">{item}</li>
                ))}
              </ol>
            </Section>
          )}

          {/* Executive Summary */}
          {minutes.overview && (
            <Section title="Executive Summary">
              <p className="text-sm leading-relaxed text-text/90">{minutes.overview}</p>
            </Section>
          )}

          {/* Discussion Items */}
          {minutes.discussions?.length > 0 && (
            <Section title="Discussion">
              <div className="flex flex-col gap-4">
                {minutes.discussions.map((d, i) => (
                  <div key={i} className="bg-surface2 rounded-lg p-4">
                    <h4 className="text-sm font-semibold mb-2">
                      {i + 1}. {d.topic}
                    </h4>
                    <p className="text-sm text-text/80 mb-2">{d.discussion}</p>
                    {d.outcome && (
                      <p className="text-xs text-accent">
                        <span className="font-semibold">Outcome:</span> {d.outcome}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Action Items */}
          {minutes.actionItems?.length > 0 && (
            <Section title="Action Items">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-muted text-left">
                      <th className="pb-2 pr-3 w-8">#</th>
                      <th className="pb-2 pr-3">Action</th>
                      <th className="pb-2 pr-3 w-28">Owner</th>
                      <th className="pb-2 pr-3 w-28">Deadline</th>
                      <th className="pb-2 w-20">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {minutes.actionItems.map((item, i) => (
                      <tr key={i} className="border-b border-border/50">
                        <td className="py-2.5 pr-3 text-muted">{i + 1}</td>
                        <td className="py-2.5 pr-3">{item.action}</td>
                        <td className="py-2.5 pr-3 text-muted">{item.owner}</td>
                        <td className="py-2.5 pr-3 text-muted">{item.deadline}</td>
                        <td className="py-2.5">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${
                            item.status === 'completed'
                              ? 'bg-green/15 text-green'
                              : 'bg-yellow/15 text-yellow'
                          }`}>
                            {item.status === 'completed' ? 'Done' : 'Pending'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          )}

          {/* Decisions */}
          {minutes.decisions?.length > 0 && (
            <Section title="Decisions Made">
              <ul className="flex flex-col gap-1.5">
                {minutes.decisions.map((d, i) => (
                  <li key={i} className="flex gap-2 text-sm">
                    <span className="text-green mt-0.5 shrink-0">✓</span>
                    <span className="text-text/90">{d}</span>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {/* Closing */}
          {(minutes.nextMeetingDate || minutes.adjournmentTime) && (
            <Section title="Closing">
              {minutes.adjournmentTime && (
                <p className="text-sm text-muted">
                  Meeting adjourned at: {minutes.adjournmentTime}
                </p>
              )}
              {minutes.nextMeetingDate && (
                <p className="text-sm text-muted">
                  Next meeting: {minutes.nextMeetingDate}
                </p>
              )}
            </Section>
          )}

          {/* Full Transcript (collapsible) */}
          {minutes.transcript?.length > 0 && (
            <div>
              <button
                onClick={() => setShowTranscript(!showTranscript)}
                className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted hover:text-text transition"
              >
                <span className={`transition-transform ${showTranscript ? 'rotate-90' : ''}`}>
                  ▶
                </span>
                Full Transcript ({minutes.transcript.length} segments)
              </button>

              {showTranscript && (
                <div className="mt-3 flex flex-col gap-1.5 max-h-96 overflow-auto bg-surface2 rounded-lg p-4">
                  {minutes.transcript.map((seg, i) => (
                    <div key={i} className="flex gap-3 text-xs">
                      <span className="text-muted font-mono shrink-0">
                        {formatTimestamp(seg.start)}
                      </span>
                      <span className="text-text/80">{seg.text}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Footer */}
          <div className="text-center text-xs text-muted border-t border-border pt-4">
            Minutes generated by DiScreenRecorder on {formatDate(minutes.generatedAt)}
          </div>
        </div>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted mb-3">
        {title}
      </h3>
      {children}
    </div>
  )
}

function ExportBtn({ label, icon, loading, onClick }: {
  label: string; icon: string; loading: boolean; onClick: () => void
}) {
  const icons: Record<string, string> = {
    clipboard: '📋',
    md: '📄',
    pdf: '📕'
  }
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="px-3 py-1.5 bg-surface2 hover:bg-border rounded-lg text-xs text-muted font-medium transition disabled:opacity-50 flex items-center gap-1.5"
    >
      <span>{icons[icon]}</span>
      {loading ? 'Exporting...' : label}
    </button>
  )
}

function formatDate(isoString: string): string {
  if (!isoString) return ''
  try {
    return new Date(isoString).toLocaleDateString('en-ZA', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  } catch {
    return isoString
  }
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}m ${s}s`
}

function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}
