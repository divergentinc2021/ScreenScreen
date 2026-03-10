type Segment = { start: number; end: number; text: string }

export default function TranscriptView({ segments }: { segments: Segment[] }) {
  const formatTime = (s: number) => {
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`
  }

  return (
    <div className="bg-surface rounded-xl p-5">
      <h2 className="font-heading font-semibold text-base mb-4 flex items-center gap-2">
        <span className="text-accent">◆</span> Transcript
      </h2>
      <div className="flex flex-col gap-2">
        {segments.map((seg, i) => (
          <div key={i} className="flex gap-3 group hover:bg-surface2 rounded-lg p-2 -mx-2 transition">
            <button
              className="text-xs text-muted font-mono shrink-0 mt-0.5 hover:text-accent transition"
              title="Click to seek audio"
            >
              {formatTime(seg.start)}
            </button>
            <p className="text-sm leading-relaxed">{seg.text}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
