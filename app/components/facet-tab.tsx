import { useId, type MouseEvent } from 'react';
import {
  FACET_META,
  isSameSelectedFacet,
  type CinematicFacet,
  type FacetKey,
  type FacetSource,
  type SelectedFacet,
} from '../lib/light-table.ts';

type Props = {
  channel: FacetKey;
  facet: CinematicFacet;
  source: FacetSource;
  selected?: SelectedFacet;
  disabled?: boolean;
  onSelect: (
    channel: FacetKey,
    facet: CinematicFacet,
    source: FacetSource,
    trigger: HTMLButtonElement,
  ) => void;
};

export function FacetTab({ channel, facet, source, selected, disabled, onSelect }: Props) {
  const id = useId();
  const meta = FACET_META[channel];
  const active = isSameSelectedFacet(channel, selected, { ...facet, source });

  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    onSelect(channel, facet, source, event.currentTarget);
  }

  return (
    <button
      type="button"
      className={`ai-facet-tab ${meta.className}${active ? ' is-selected' : ''}`}
      aria-pressed={active}
      aria-label={`Borrow ${meta.label}: ${facet.label} from ${source.title}`}
      aria-describedby={`${id}-explanation`}
      disabled={disabled}
      onClick={handleClick}
    >
      <span className="ai-facet-tab__channel">
        <i aria-hidden="true">{meta.icon}</i>
        {meta.label}
      </span>
      <strong>{facet.label}</strong>
      <span className="ai-facet-tab__explanation" id={`${id}-explanation`}>
        {facet.explanation}
      </span>
      <span className="ai-facet-tab__action" aria-hidden="true">
        {active ? 'On table' : 'Borrow quality'}
      </span>
    </button>
  );
}
