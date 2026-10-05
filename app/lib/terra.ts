// Terra Incognita. Your sky shows where you have been; this charts where you have not.
// Every film you have met is placed by where it was made, when, and what form it takes,
// from the catalogue's own records. The blank places become doors: an ordinary reel
// request into the part of cinema your sky has not reached yet.
import type { FilmEnrichment } from './movie-metadata.ts';

export const TERRA_KEY = 'afterimage:terra:v1';
const MAX_CACHED = 800;
/** Below this, a sky is too young to have edges worth naming. */
export const TERRA_MINIMUM = 5;

export type TerraFacts = { countries: string[]; genres: string[] };
export type TerraFilm = { key: string; title: string; year: string };

export const REGIONS = [
  { id: 'north-america', examples: 'the United States and Canada', name: 'North America', area: 'na', countries: ['United States of America', 'United States', 'USA', 'Canada'] },
  { id: 'latin-america', examples: 'Mexico, Brazil, Argentina, Chile, Cuba', name: 'Latin America', area: 'la', countries: ['Mexico', 'Brazil', 'Argentina', 'Chile', 'Colombia', 'Cuba', 'Peru', 'Uruguay', 'Venezuela', 'Bolivia', 'Paraguay', 'Ecuador', 'Guatemala', 'Costa Rica', 'Dominican Republic', 'Puerto Rico', 'Panama', 'Nicaragua', 'Honduras', 'El Salvador', 'Haiti', 'Jamaica', 'Trinidad and Tobago', 'Bahamas'] },
  { id: 'britain-ireland', examples: 'the United Kingdom and Ireland', name: 'Britain and Ireland', area: 'uk', countries: ['United Kingdom', 'UK', 'Ireland'] },
  { id: 'western-europe', examples: 'France, Germany, Belgium, the Netherlands, Austria', name: 'Western Europe', area: 'we', countries: ['France', 'Belgium', 'Netherlands', 'Luxembourg', 'Switzerland', 'Germany', 'West Germany', 'East Germany', 'German Democratic Republic', 'Austria', 'Monaco', 'Liechtenstein'] },
  { id: 'southern-europe', examples: 'Italy, Spain, Portugal, Greece', name: 'Southern Europe', area: 'se', countries: ['Italy', 'Spain', 'Portugal', 'Greece', 'Malta', 'Cyprus', 'San Marino', 'Andorra'] },
  { id: 'the-north', examples: 'Sweden, Denmark, Norway, Finland, Iceland', name: 'The Nordic countries', area: 'no', countries: ['Sweden', 'Denmark', 'Norway', 'Finland', 'Iceland', 'Faroe Islands', 'Greenland'] },
  { id: 'eastern-europe', examples: 'Poland, Czechoslovakia, Hungary, Romania, Russia', name: 'Eastern Europe and Russia', area: 'ee', countries: ['Poland', 'Czech Republic', 'Czechia', 'Czechoslovakia', 'Slovakia', 'Hungary', 'Romania', 'Bulgaria', 'Serbia', 'Serbia and Montenegro', 'Montenegro', 'Yugoslavia', 'Croatia', 'Bosnia and Herzegovina', 'Slovenia', 'Macedonia', 'North Macedonia', 'Albania', 'Kosovo', 'Russia', 'Russian Federation', 'Soviet Union', 'USSR', 'Ukraine', 'Belarus', 'Estonia', 'Latvia', 'Lithuania', 'Moldova', 'Georgia', 'Armenia', 'Azerbaijan', 'Kazakhstan', 'Kyrgyzstan', 'Uzbekistan', 'Tajikistan', 'Turkmenistan'] },
  { id: 'middle-east', examples: 'Iran, Turkey, Lebanon, Egypt, Morocco', name: 'The Middle East and North Africa', area: 'me', countries: ['Iran', 'Islamic Republic of Iran', 'Turkey', 'Türkiye', 'Israel', 'Lebanon', 'Egypt', 'Morocco', 'Tunisia', 'Algeria', 'Palestinian Territory', 'Palestine', 'State of Palestine', 'Syrian Arab Republic', 'Syria', 'Iraq', 'Jordan', 'Saudi Arabia', 'United Arab Emirates', 'Kuwait', 'Qatar', 'Bahrain', 'Oman', 'Yemen', 'Libya', 'Libyan Arab Jamahiriya', 'Afghanistan'] },
  { id: 'africa', examples: 'Senegal, Mali, Burkina Faso, Nigeria, South Africa', name: 'Sub-Saharan Africa', area: 'af', countries: ['Senegal', 'Nigeria', 'South Africa', 'Mali', 'Burkina Faso', 'Ethiopia', 'Kenya', 'Ghana', 'Cameroon', 'Chad', 'Mauritania', "Cote D'Ivoire", "Côte d'Ivoire", 'Ivory Coast', 'Rwanda', 'Uganda', 'Zimbabwe', 'Tanzania', 'United Republic of Tanzania', 'Angola', 'Mozambique', 'Congo', 'Democratic Republic of the Congo', 'Sudan', 'South Sudan', 'Somalia', 'Lesotho', 'Madagascar', 'Niger', 'Guinea', 'Guinea-Bissau', 'Benin', 'Togo', 'Zambia', 'Namibia', 'Botswana', 'Gabon', 'Eritrea', 'Cape Verde', 'Malawi', 'Sierra Leone', 'Liberia', 'Gambia'] },
  { id: 'south-asia', examples: 'India, Pakistan, Bangladesh, Sri Lanka', name: 'South Asia', area: 'sa', countries: ['India', 'Pakistan', 'Bangladesh', 'Sri Lanka', 'Nepal', 'Bhutan'] },
  { id: 'southeast-asia', examples: 'Thailand, the Philippines, Indonesia, Vietnam', name: 'Southeast Asia', area: 'sea', countries: ['Thailand', 'Philippines', 'Indonesia', 'Vietnam', 'Viet Nam', 'Malaysia', 'Singapore', 'Cambodia', 'Myanmar', 'Burma', 'Laos', "Lao People's Democratic Republic", 'Timor-Leste', 'Brunei Darussalam'] },
  { id: 'east-asia', examples: 'Japan, South Korea, China, Hong Kong, Taiwan', name: 'East Asia', area: 'ea', countries: ['Japan', 'South Korea', 'Korea', 'Republic of Korea', 'North Korea', "Democratic People's Republic of Korea", 'China', "People's Republic of China", 'Hong Kong', 'Taiwan', 'Mongolia', 'Macao', 'Macau'] },
  { id: 'oceania', examples: 'Australia and New Zealand', name: 'Oceania', area: 'oc', countries: ['Australia', 'New Zealand', 'Papua New Guinea', 'Fiji', 'Samoa', 'Tonga', 'Vanuatu'] },
] as const;
export type RegionId = typeof REGIONS[number]['id'];

/** Where the doors open first: the cinemas a curious viewer is likeliest to love next. */
const REGION_ORDER: RegionId[] = ['east-asia', 'western-europe', 'middle-east', 'latin-america', 'eastern-europe', 'south-asia', 'africa', 'southeast-asia', 'the-north', 'southern-europe', 'oceania', 'britain-ireland', 'north-america'];

export const ERAS = [
  { id: 'silent', label: 'Before 1930', short: '<1930', from: 1870, to: 1929 },
  ...[1930, 1940, 1950, 1960, 1970, 1980, 1990, 2000, 2010, 2020].map(decade => ({ id: `${decade}s`, label: `The ${decade}s`, short: `${String(decade).slice(2)}s`, from: decade, to: decade + 9 })),
] as const;
const ERA_ORDER = ['1970s', '1960s', '1950s', '1940s', '1930s', 'silent', '1980s', '1990s', '2000s', '2010s', '2020s'];

export const FORMS = [
  { genre: 'Documentary', name: 'Documentary', line: 'no documentaries', brief: 'documentaries that feel like cinema rather than homework' },
  { genre: 'Animation', name: 'Animation', line: 'no animation', brief: 'animated films made for grown-up eyes, in different styles and traditions' },
  { genre: 'Music', name: 'Music and musicals', line: 'no musicals or music films', brief: 'musicals and films built around music, where the songs carry the story' },
  { genre: 'Western', name: 'Westerns', line: 'no westerns', brief: 'westerns, classic and revisionist, that are more than gunfights' },
  { genre: 'Horror', name: 'Horror', line: 'no horror', brief: 'horror films that frighten through atmosphere and dread rather than gore' },
  { genre: 'Science Fiction', name: 'Science fiction', line: 'no science fiction', brief: 'science fiction films driven by ideas and feeling, not spectacle' },
  { genre: 'War', name: 'War films', line: 'no war films', brief: 'war films about the people inside it, not the battles' },
  { genre: 'Comedy', name: 'Comedy', line: 'no comedies', brief: 'comedies with real intelligence and heart' },
  { genre: 'Romance', name: 'Romance', line: 'no romances', brief: 'love stories that earn their feeling' },
  { genre: 'Crime', name: 'Crime', line: 'no crime films', brief: 'crime films with moral weight and style' },
  { genre: 'Fantasy', name: 'Fantasy', line: 'no fantasy', brief: 'fantasy films with a real sense of wonder' },
  { genre: 'Mystery', name: 'Mystery', line: 'no mysteries', brief: 'mysteries that stay with you after they are solved' },
] as const;

export type TerraRegion = { id: RegionId; name: string; area: string; films: TerraFilm[] };
export type TerraEra = { id: string; label: string; short: string; films: TerraFilm[] };
export type TerraForm = { genre: string; name: string; films: TerraFilm[] };
export type Door = { kind: 'region' | 'era' | 'form'; id: string; title: string; line: string };
export type TerraChart = {
  regions: TerraRegion[]; eras: TerraEra[]; forms: TerraForm[];
  /** Films placed from the catalogue, of all the films in the sky. */
  charted: number; total: number; doors: Door[];
};

function normalize(name: string): string {
  return name.normalize('NFKD').replace(/\p{Mark}/gu, '').toLocaleLowerCase('en-US').replace(/[^a-z]+/g, '');
}
const COUNTRY_REGION = new Map<string, RegionId>(REGIONS.flatMap(region => region.countries.map(country => [normalize(country), region.id] as [string, RegionId])));

export function regionOf(country: string): RegionId | null {
  return COUNTRY_REGION.get(normalize(country)) ?? null;
}

export function eraOf(year: string): string | null {
  const value = Number(year);
  if (!/^\d{4}$/.test(year)) return null;
  return ERAS.find(era => value >= era.from && value <= era.to)?.id ?? null;
}

export function factsFromEnrichment(record: FilmEnrichment | undefined): TerraFacts | null {
  if (!record) return null;
  if (record.status === 'matched') return { countries: record.countries.slice(0, 6), genres: record.genres.slice(0, 8) };
  // Not in the catalogue: placed nowhere, and not looked up again.
  return record.status === 'unmatched' ? { countries: [], genres: [] } : null;
}

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
const strings = (value: unknown, max: number) => Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.length > 0 && item.length <= 80).slice(0, max) : [];

export function parseTerraCache(raw: string | null): Record<string, TerraFacts> {
  if (!raw) return {};
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return {}; }
  if (!record(value) || value.version !== 1 || !record(value.films)) return {};
  const films: Record<string, TerraFacts> = {};
  for (const [key, item] of Object.entries(value.films).slice(-MAX_CACHED)) {
    if (!/^.{1,200}\|\d{4}$/.test(key) || !record(item)) continue;
    films[key] = { countries: strings(item.c, 6), genres: strings(item.g, 8) };
  }
  return films;
}

export function serializeTerraCache(films: Record<string, TerraFacts>): string {
  const entries = Object.entries(films).slice(-MAX_CACHED).map(([key, facts]) => [key, { c: facts.countries, g: facts.genres }]);
  return JSON.stringify({ version: 1, films: Object.fromEntries(entries) });
}

export function chartTerra(films: readonly TerraFilm[], facts: Readonly<Record<string, TerraFacts>>): TerraChart {
  const regions: TerraRegion[] = REGIONS.map(region => ({ id: region.id, name: region.name, area: region.area, films: [] }));
  const eras: TerraEra[] = ERAS.map(era => ({ id: era.id, label: era.label, short: era.short, films: [] }));
  const forms: TerraForm[] = FORMS.map(form => ({ genre: form.genre, name: form.name, films: [] }));
  let charted = 0;
  for (const film of films) {
    const era = eraOf(film.year);
    if (era) eras.find(item => item.id === era)!.films.push(film);
    const known = facts[film.key];
    if (!known) continue;
    charted++;
    const places = new Set(known.countries.map(regionOf).filter((id): id is RegionId => Boolean(id)));
    for (const id of places) regions.find(region => region.id === id)!.films.push(film);
    for (const form of forms) if (known.genres.some(genre => normalize(genre) === normalize(form.genre))) form.films.push(film);
  }
  const chart = { regions, eras, forms, charted, total: films.length, doors: [] as Door[] };
  const blank = blankPlaces(chart);
  chart.doors = [blank.regions[0], blank.eras[0], blank.forms[0]].filter((door): door is Door => Boolean(door));
  return chart;
}

function regionDoor(region: { id: RegionId; name: string }): Door {
  return { kind: 'region', id: region.id, title: region.name, line: `Your sky has never reached ${region.name.replace(/^The /, 'the ')}.` };
}
function eraDoor(era: { id: string; label: string }): Door {
  return { kind: 'era', id: era.id, title: era.label, line: era.id === 'silent' ? 'Nothing in your sky was made before sound.' : `Nothing in your sky was made in ${era.label.replace(/^The/, 'the')}.` };
}
function formDoor(form: { genre: string; name: string }): Door {
  const meta = FORMS.find(item => item.genre === form.genre) ?? FORMS[0];
  return { kind: 'form', id: form.genre, title: form.name, line: `There are ${meta.line} in your sky yet.` };
}

/** The blank places of each kind, in the order their doors open. */
function blankPlaces(chart: Pick<TerraChart, 'regions' | 'eras' | 'forms' | 'charted' | 'total'>): Record<'regions' | 'eras' | 'forms', Door[]> {
  const charted = chart.charted >= TERRA_MINIMUM;
  return {
    regions: charted ? REGION_ORDER.map(id => chart.regions.find(item => item.id === id)!).filter(item => !item.films.length).map(regionDoor) : [],
    eras: chart.total >= TERRA_MINIMUM ? ERA_ORDER.map(id => chart.eras.find(item => item.id === id)!).filter(item => !item.films.length).map(eraDoor) : [],
    forms: charted ? chart.forms.filter(item => !item.films.length).map(formDoor) : [],
  };
}

/** How a blank place reads inside a sentence: "East Asia", "the 1970s", "documentary". */
export function doorName(door: Pick<Door, 'kind' | 'id' | 'title'>): string {
  if (door.kind === 'era') return door.id === 'silent' ? 'the silent era' : door.title.replace(/^The/, 'the');
  return door.kind === 'form' ? door.title.toLocaleLowerCase('en-US') : door.title.replace(/^The /, 'the ');
}

// Where the dark places sit around your sky, as the page drew them, and the colour of each nebula.
const ZONE_SLOTS = [{ x: 0.15, y: 0.22 }, { x: 0.82, y: 0.2 }, { x: 0.12, y: 0.78 }, { x: 0.84, y: 0.8 }, { x: 0.5, y: 0.1 }] as const;
const ZONE_INKS = [[120, 90, 160], [190, 110, 60], [150, 150, 150], [200, 90, 130], [110, 170, 140]] as const;
export type Zone = Door & { x: number; y: number; ink: readonly [number, number, number] };

/** The dark places drawn at the edges of your sky: up to five, taking a place, a time and a form in turn. */
export function terraZones(chart: TerraChart): Zone[] {
  const blank = blankPlaces(chart);
  const lists = [blank.regions, blank.eras, blank.forms];
  const doors: Door[] = [];
  for (let index = 0; doors.length < ZONE_SLOTS.length && lists.some(list => index < list.length); index++) {
    for (const list of lists) if (list[index] && doors.length < ZONE_SLOTS.length) doors.push(list[index]);
  }
  return doors.map((door, index) => ({ ...door, ...ZONE_SLOTS[index], ink: ZONE_INKS[index] }));
}

function doorFor(door: Pick<Door, 'kind' | 'id'>): Door | null {
  if (door.kind === 'region') { const region = REGIONS.find(item => item.id === door.id); return region ? regionDoor(region) : null; }
  if (door.kind === 'era') { const era = ERAS.find(item => item.id === door.id); return era ? eraDoor(era) : null; }
  const form = FORMS.find(item => item.genre === door.id);
  return form ? formDoor(form) : null;
}

const DOOR_OPENING = 'A door into ';

/**
 * A door as an Atlas around a film you love: every film on the map comes from the dark
 * place, and each is chosen as a way in from that film, so the first step never feels
 * like homework. Its first neighbour is the door.
 */
export function doorAtlasRequest(door: Pick<Door, 'kind' | 'id'>, love: 'liked' | 'kept'): { films: string[]; creativeBrief: string } {
  const place = doorFor(door) ?? formDoor(FORMS[0]);
  const name = doorName(place);
  let rule = `Every film on this map must be one of the ${(FORMS.find(item => item.genre === place.id) ?? FORMS[0]).brief}.`;
  if (place.kind === 'region') rule = `Every film on this map must have been made in ${name} (${REGIONS.find(item => item.id === place.id)!.examples}, or anywhere else in it), from different countries and decades where you can.`;
  if (place.kind === 'era') rule = `Every film on this map must have been made ${place.id === 'silent' ? 'before 1930, in the silent era' : `in ${name}`}, from different countries where you can, and still alive to a viewer today.`;
  const before = place.line.replace('Your sky', 'My film sky').replace('your sky', 'my film sky');
  const anchor = love === 'liked' ? 'The anchor is a film I love' : 'The anchor is a film that stayed with me';
  return { films: [], creativeBrief: `${DOOR_OPENING}${name}. ${before} ${rule} ${anchor}: choose each neighbour as a way in from it, so the first step starts from something I already feel.` };
}

/** Which dark place an Atlas was drawn for, read back from its request. */
export function parseDoorBrief(brief: string | undefined): Pick<Door, 'kind' | 'id'> | null {
  if (!brief?.startsWith(DOOR_OPENING)) return null;
  const name = brief.slice(DOOR_OPENING.length, brief.indexOf('. '));
  const every = [...REGIONS.map(regionDoor), ...ERAS.map(eraDoor), ...FORMS.map(formDoor)];
  const door = every.find(item => doorName(item) === name);
  return door ? { kind: door.kind, id: door.id } : null;
}

/** A door as an ordinary reel request: the blank place is written into the brief. */
export function doorRequest(door: Pick<Door, 'kind' | 'id'>): { films: string[]; creativeBrief: string } {
  if (door.kind === 'region') {
    const region = REGIONS.find(item => item.id === door.id);
    if (region) {
      return { films: [], creativeBrief: `My film sky has never reached ${region.name.replace(/^The /, 'the ')}: none of the films I have met here were made there. Take me there. Five films made in ${region.name.replace(/^The /, 'the ')} (${region.examples}, or anywhere else in it), chosen as good first steps for someone with my taste, from different countries and decades where you can. In each reason, say what makes it a good way in.` };
    }
  }
  if (door.kind === 'era') {
    const era = ERAS.find(item => item.id === door.id);
    if (era) {
      const when = era.id === 'silent' ? 'before 1930, in the silent era' : `in ${era.label.replace(/^The/, 'the')}`;
      return { films: [], creativeBrief: `My film sky has nothing made ${when}. Take me back: five films made ${when}, from different countries, chosen as good first steps for someone with my taste and still alive to a viewer today. In each reason, say what that time gave cinema that this film shows.` };
    }
  }
  const form = FORMS.find(item => item.genre === door.id) ?? FORMS[0];
  return { films: [], creativeBrief: `My film sky has ${form.line} in it yet. Five ${form.brief}, chosen for someone with my taste. In each reason, say what it shares with the films I already love.` };
}
