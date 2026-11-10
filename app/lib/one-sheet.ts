// A one-sheet is a reel's cinema poster. Everything on it is the reel's own: its name, its
// line, its three sensibilities as laurels, its five films, and a billing block set the way
// a poster's credits are, with small words leading into tall names.

export type OneSheetData = {
  seed: string;
  persona: string;
  insight: string;
  palette: readonly string[];
  sensibilities: readonly string[];
  director?: string;
  films: ReadonlyArray<{ title: string; year: string; facets?: Partial<Record<string, { label: string; traits: readonly string[] }>> }>;
  developedAt?: Date;
};

/** One run of the billing block: a tall name, or the small words that lead into it. */
export type BillingRun = { text: string; small: boolean };

const upper = (value: string) => value.trim().replace(/\s+/g, ' ').toLocaleUpperCase();

/** The credits at the foot of the poster, in the order a billing block gives them. */
export function billingBlock(data: Pick<OneSheetData, 'persona' | 'director' | 'films'>): BillingRun[] {
  const runs: BillingRun[] = [
    { text: 'AFTERIMAGE', small: false }, { text: 'presents', small: true },
    { text: `a reel in ${['no', 'one', 'two', 'three', 'four', 'five'][data.films.length] ?? data.films.length} films`, small: true },
    { text: upper(data.persona), small: false },
  ];
  if (data.director?.trim()) runs.push({ text: 'in the spirit of', small: true }, { text: upper(data.director), small: false });
  data.films.forEach((film, index) => {
    runs.push({ text: index === 0 ? 'starring' : index === data.films.length - 1 ? 'and' : 'with', small: true }, { text: upper(film.title), small: false });
  });
  runs.push({ text: 'programmed for', small: true }, { text: 'YOU', small: false });
  return runs;
}

/** A stable number for the poster, like the serial in the corner of a one-sheet. */
export function sheetNumber(seed: string): string {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) { hash ^= seed.charCodeAt(index); hash = Math.imul(hash, 16777619); }
  return String((hash >>> 0) % 10000).padStart(4, '0');
}

export function sheetFilename(persona: string): string {
  const slug = persona.toLocaleLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'reel';
  return `afterimage-one-sheet-${slug}.png`;
}

/** What the poster says, for anyone who cannot see it. */
export function sheetDescription(data: OneSheetData): string {
  const films = data.films.map(film => `${film.title} (${film.year})`).join(', ');
  return `A cinema poster for the reel “${data.persona}”. ${data.insight} Laurels: ${data.sensibilities.join(', ')}. ${data.director ? `In the spirit of ${data.director}. ` : ''}Films: ${films}.`;
}
