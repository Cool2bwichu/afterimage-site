// The Credits Question. Not "what do you like?" but "where do you want to be when the
// credits roll?" Two lights on a map of moods, where you are now and where you want to
// end up, become an ordinary reel request: the route is written into the brief, so the
// bridge needs nothing new. On a long night the first two films are a double feature.

/** x runs from light (0) to heavy (1); y from still (0) to charged (1). */
export type MoodPoint = { x: number; y: number };

export const MOODS = [
  { word: 'at peace', x: 0.12, y: 0.14 },
  { word: 'ready for sleep', x: 0.34, y: 0.06 },
  { word: 'restored', x: 0.22, y: 0.36 },
  { word: 'lifted', x: 0.18, y: 0.74 },
  { word: 'giddy', x: 0.1, y: 0.94 },
  { word: 'feeling something', x: 0.44, y: 0.6 },
  { word: 'restless', x: 0.5, y: 0.86 },
  { word: 'wired', x: 0.84, y: 0.9 },
  { word: 'on edge', x: 0.7, y: 0.7 },
  { word: 'low', x: 0.8, y: 0.42 },
  { word: 'numb', x: 0.6, y: 0.12 },
  { word: 'wrung out', x: 0.88, y: 0.12 },
  { word: 'somewhere in between', x: 0.5, y: 0.38 },
] as const;

export type MoodWord = typeof MOODS[number]['word'];

export const JOURNEYS: ReadonlyArray<{ from: MoodWord; to: MoodWord }> = [
  { from: 'wrung out', to: 'restored' },
  { from: 'numb', to: 'feeling something' },
  { from: 'wired', to: 'ready for sleep' },
  { from: 'low', to: 'lifted' },
];

export type Route = { now: string; credits: string; double: boolean };

const clamp = (value: number) => Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0.5));

export function moodPoint(word: string): MoodPoint {
  const mood = MOODS.find(item => item.word === word) ?? MOODS[MOODS.length - 1];
  return { x: mood.x, y: mood.y };
}

/** The word for a point on the map: its nearest named mood. */
export function nameMood(point: MoodPoint): MoodWord {
  const x = clamp(point.x);
  const y = clamp(point.y);
  let best: MoodWord = MOODS[0].word;
  let distance = Infinity;
  for (const mood of MOODS) {
    const d = (mood.x - x) ** 2 + (mood.y - y) ** 2;
    if (d < distance) { distance = d; best = mood.word; }
  }
  return best;
}

export function routeBrief(route: Route): string {
  const now = route.now.trim().slice(0, 40);
  const credits = route.credits.trim().slice(0, 40);
  const opening = `Right now I feel ${now}. By the time the credits roll, I want to feel ${credits}.`;
  const same = now.toLocaleLowerCase() === credits.toLocaleLowerCase();
  const course = same
    ? 'Stay with me where I am: no rescue, no lesson, just films that keep me company in it.'
    : 'Treat the evening as a route between the two: meet me where I am and leave me where I want to be, without forcing the change.';
  const shape = route.double
    ? 'This is a double feature: make the first two films a pair to watch in that order, the first meeting me where I am and the second carrying me the rest of the way. In each reason, say where that film sits on the route.'
    : 'In each reason, say how the film moves me from one to the other.';
  return `${opening} ${course} ${shape}`;
}

/** The route back out of a brief this entrance wrote, for the strip above the reel. */
export function parseRoute(brief: string | undefined): Route | null {
  if (!brief) return null;
  const match = /^Right now I feel (.{1,40}?)\. By the time the credits roll, I want to feel (.{1,40}?)\./.exec(brief);
  if (!match) return null;
  return { now: match[1], credits: match[2], double: /This is a double feature:/.test(brief) };
}

export function routeRequest(route: Route): { films: string[]; creativeBrief: string } {
  return { films: [], creativeBrief: routeBrief(route) };
}
