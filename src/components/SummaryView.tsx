type Summary = {
  overview: string
  keyPoints: string[]
  actionItems: string[]
  decisions: string[]
}

export default function SummaryView({ summary }: { summary: Summary }) {
  return (
    <div className="bg-surface rounded-xl p-5 flex flex-col gap-5">
      <h2 className="font-heading font-semibold text-base flex items-center gap-2">
        <span className="text-green">◆</span> AI Summary
      </h2>

      {/* Overview */}
      <Section title="Overview">
        <p className="text-sm leading-relaxed text-text/90">{summary.overview}</p>
      </Section>

      {/* Key Points */}
      {summary.keyPoints.length > 0 && (
        <Section title="Key Points">
          <ul className="flex flex-col gap-1.5">
            {summary.keyPoints.map((p, i) => (
              <li key={i} className="flex gap-2 text-sm">
                <span className="text-accent mt-0.5 shrink-0">▸</span>
                <span className="text-text/90">{p}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* Action Items */}
      {summary.actionItems.length > 0 && (
        <Section title="Action Items">
          <ul className="flex flex-col gap-1.5">
            {summary.actionItems.map((a, i) => (
              <li key={i} className="flex gap-2 text-sm">
                <span className="text-yellow mt-0.5 shrink-0">☐</span>
                <span className="text-text/90">{a}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* Decisions */}
      {summary.decisions.length > 0 && (
        <Section title="Decisions Made">
          <ul className="flex flex-col gap-1.5">
            {summary.decisions.map((d, i) => (
              <li key={i} className="flex gap-2 text-sm">
                <span className="text-green mt-0.5 shrink-0">✓</span>
                <span className="text-text/90">{d}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted mb-2">{title}</h3>
      {children}
    </div>
  )
}
