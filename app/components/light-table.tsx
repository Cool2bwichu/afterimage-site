'use client';

import { useEffect, useRef, useState } from 'react';
import { FACET_KEYS, FACET_META, searchBreadth, selectionCount, type FacetKey, type SelectedFacets } from '../lib/light-table';

export function BlendSummary({ selectedFacets }: { selectedFacets: SelectedFacets }) {
  const count = selectionCount(selectedFacets);
  return <div className="ai-blend-summary" aria-live="polite" aria-atomic="true">
    <span className="ai-blend-count">{count}/4</span>
    <span><strong>{searchBreadth(selectedFacets)}</strong><small>{count ? 'Only your chosen qualities guide the next reel.' : 'Borrow a quality from any recommendation.'}</small></span>
  </div>;
}

export function LightTable({ selectedFacets, locked, canSubmit, onRemove, onClear, onDevelop }: {
  selectedFacets: SelectedFacets;
  locked: boolean;
  canSubmit: boolean;
  onRemove: (channel: FacetKey) => void;
  onClear: () => void;
  onDevelop: () => void;
}) {
  const count = selectionCount(selectedFacets);
  const [expansionOverride, setExpansionOverride] = useState<boolean | null>(null);
  const expanded = expansionOverride ?? count > 0;
  const [height, setHeight] = useState(80);
  const tableRef = useRef<HTMLElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const table = tableRef.current;
    if (!table) return;
    const observer = new ResizeObserver(() => setHeight(table.getBoundingClientRect().height));
    observer.observe(table);
    return () => observer.disconnect();
  }, []);

  function restoreTableFocus() {
    const target = window.matchMedia('(max-width: 760px)').matches ? toggleRef.current : titleRef.current;
    target?.focus({ preventScroll: true });
  }

  return <>
    <div aria-hidden="true" style={{ height: height + 28 }} />
    <aside ref={tableRef} className={`ai-light-table ${count ? 'has-selections' : 'is-empty'} ${expanded ? 'is-expanded' : ''}`} aria-label="The Light Table">
      <header className="ai-light-table__header">
        <div><span className="ai-kicker">Remix the reel</span><h2 ref={titleRef} tabIndex={-1}>The Light Table</h2></div>
        <BlendSummary selectedFacets={selectedFacets} />
      </header>
      <button ref={toggleRef} className="ai-light-table__mobile-toggle" type="button" aria-expanded={expanded} aria-controls="ai-light-table-body" onClick={() => setExpansionOverride(!expanded)}>
        <span>Light Table <strong>{count}/4 · {searchBreadth(selectedFacets)}</strong></span>
        <span aria-hidden="true">{expanded ? '−' : '+'}</span>
      </button>
      <div className="ai-light-table__body" id="ai-light-table-body">
        <div className="ai-light-table__lanes">
          {FACET_KEYS.map(channel => {
            const facet = selectedFacets[channel];
            const meta = FACET_META[channel];
            return <div key={channel} className={`ai-light-table__lane ${meta.className} ${facet ? 'is-filled' : ''}`} data-light-table-lane={channel}>
              <div className="ai-light-table__lane-label"><i aria-hidden="true">{meta.icon}</i>{meta.label}</div>
              {facet ? <div className="ai-light-table__selection">
                <div><strong>{facet.label}</strong><small>{facet.source.title} · {facet.source.year}</small></div>
                <button type="button" disabled={locked} aria-label={`Remove ${meta.label}: ${facet.label}`} onClick={() => { onRemove(channel); restoreTableFocus(); }}>×</button>
              </div> : <span className="ai-light-table__open">Open to surprise</span>}
            </div>;
          })}
        </div>
      </div>
      <div className="ai-light-table__actions">
        <p>{count ? `${4-count} ${4-count === 1 ? 'channel remains' : 'channels remain'} open to surprise.` : 'Choose one quality per channel.'}</p>
        <button type="button" className="ai-light-table__clear" disabled={!count || locked} onClick={() => { onClear(); restoreTableFocus(); }}>Clear table</button>
        <button type="button" className="ai-light-table__develop" disabled={!count || locked || !canSubmit} onClick={onDevelop}>{locked ? 'Developing…' : 'Develop This Blend'} <span aria-hidden="true">↗</span></button>
      </div>
    </aside>
  </>;
}
