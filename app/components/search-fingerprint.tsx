import { FACET_KEYS, FACET_META, type FacetMap } from "../lib/light-table.ts";

export function SearchFingerprint({
  fingerprint,
  insight,
}: {
  fingerprint: FacetMap;
  insight: string;
}) {
  const channels = FACET_KEYS.map((channel) => {
    const meta = FACET_META[channel];
    const facet = fingerprint[channel];
    return (
      <details className={`ai-print-channel ${meta.className}`} key={channel}>
        <summary>
          <span className="ai-print-channel__label">
            <i aria-hidden="true">{meta.icon}</i>
            {meta.label}
          </span>
          <strong>{facet.label}</strong>
          <span className="disclosure-sign" aria-hidden="true">
            +
          </span>
        </summary>
        <p>{facet.explanation}</p>
        <ul aria-label={`${meta.label} traits`}>
          {facet.traits.map((trait) => (
            <li key={trait}>{trait}</li>
          ))}
        </ul>
      </details>
    );
  });
  return (
    <section className="ai-print" aria-label="Your cinematic fingerprint">
      <header className="ai-print__header">
        <h2>Your cinematic fingerprint</h2>
        <span>Open a channel to look closer</span>
      </header>
      <div className="ai-print__grid ai-print-desktop">{channels}</div>
      <details className="ai-print-mobile">
        <summary>
          <span>Your cinematic fingerprint</span>
          <strong>{fingerprint.howItFeels.label}</strong>
          <span className="disclosure-sign" aria-hidden="true">
            +
          </span>
        </summary>
        <div className="ai-print__grid">{channels}</div>
      </details>
      <p className="sr-only">{insight}</p>
    </section>
  );
}
