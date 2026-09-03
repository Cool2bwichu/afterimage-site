import { FACET_KEYS, FACET_META, type FacetMap } from '../lib/light-table.ts';

type Props = {
  fingerprint: FacetMap;
  insight: string;
};

export function SearchFingerprint({ fingerprint, insight }: Props) {
  return (
    <section className="ai-print" aria-labelledby="ai-print-title">
      <header className="ai-print__header">
        <div>
          <span className="ai-kicker">Search fingerprint</span>
          <h2 id="ai-print-title">Your Print</h2>
        </div>
        <p>{insight}</p>
      </header>

      <div className="ai-print__grid">
        {FACET_KEYS.map((channel) => {
          const meta = FACET_META[channel];
          const facet = fingerprint[channel];
          return (
            <article className={`ai-print-channel ${meta.className}`} key={channel}>
              <div className="ai-print-channel__label">
                <span aria-hidden="true">{meta.icon}</span>
                {meta.label}
              </div>
              <h3>{facet.label}</h3>
              <p>{facet.explanation}</p>
              <ul aria-label={`${meta.label} traits`}>
                {facet.traits.slice(0, 3).map((trait) => <li key={trait}>{trait}</li>)}
              </ul>
            </article>
          );
        })}
      </div>
    </section>
  );
}
