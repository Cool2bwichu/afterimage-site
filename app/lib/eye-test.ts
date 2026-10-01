// The Eye Test: five pairs of film frames, one tap each, no typing. Each pair sets
// two looks against each other along one visual axis; the five choices become a
// reel request whose reference films are the frames that pulled the viewer in.
// The deck is editorial and fixed, so the test itself never waits on Claude.

export type EyeFilm = { title: string; year: string; look: string; palette: readonly [string, string, string] };
type EyePole = { name: string; films: readonly EyeFilm[] };
export type EyeAxis = { key: string; question: string; poles: readonly [EyePole, EyePole] };
export type EyeRound = { axis: string; question: string; frames: readonly [EyeFrame, EyeFrame] };
export type EyeFrame = EyeFilm & { pole: string };
export type EyePick = 0 | 1;

const film = (title: string, year: string, look: string, palette: readonly [string, string, string]): EyeFilm => ({ title, year, look, palette });

export const EYE_AXES: readonly EyeAxis[] = [
  { key: 'light', question: 'Which light?', poles: [
    { name: 'warm, golden light', films: [
      film('Days of Heaven', '1978', 'Wheat fields at magic hour, everything gold', ['#d39a45', '#f3d58f', '#4a2f17']),
      film('Call Me by Your Name', '2017', 'A sunlit Italian summer in apricot and green', ['#e2a865', '#9db06a', '#f4e3c3']),
      film('Barry Lyndon', '1975', 'Faces lit only by candles', ['#b8782f', '#3a2412', '#f0c27a']),
    ] },
    { name: 'cold, clear light', films: [
      film('Fargo', '1996', 'Snow that erases the horizon', ['#e9eef2', '#9fb2c1', '#3b4a57']),
      film('Let the Right One In', '2008', 'A blue-white winter night', ['#20344a', '#8fa8bf', '#e8eef4']),
    ] },
  ] },
  { key: 'distance', question: 'How close?', poles: [
    { name: 'vast, open space', films: [
      film('Lawrence of Arabia', '1962', 'A lone figure in an endless desert', ['#e0a656', '#f5d7a0', '#7a4b22']),
      film('2001: A Space Odyssey', '1968', 'White geometry adrift in black space', ['#0b0d12', '#f2f2f0', '#c0453a']),
    ] },
    { name: 'faces up close', films: [
      film('Persona', '1966', 'Two faces in stark black and white', ['#1a1a1a', '#d9d9d4', '#7d7d78']),
      film('The Passion of Joan of Arc', '1928', 'A face in close-up, and nothing else', ['#e6e3dc', '#5c5a55', '#121212']),
      film('Portrait of a Lady on Fire', '2019', 'Two women by firelight', ['#2a3b44', '#d27b45', '#e8d3b3']),
    ] },
  ] },
  { key: 'colour', question: 'Which colour?', poles: [
    { name: 'saturated colour', films: [
      film('Chungking Express', '1994', 'Smeared neon and rain', ['#e6365f', '#1f9c8e', '#f2c84b']),
      film('Suspiria', '1977', 'Rooms flooded red and blue', ['#c4122f', '#1d2c8f', '#f0e6d0']),
      film('Amélie', '2001', 'Paris in deep green and red', ['#2f6b3a', '#c8322e', '#e8c25c']),
    ] },
    { name: 'black and white', films: [
      film('Roma', '2018', 'A household in silver monochrome', ['#e3e3e0', '#7b7b78', '#1c1c1c']),
      film('Ida', '2013', 'Square frames, people low in the corner', ['#d5d5d0', '#5d5d59', '#151515']),
      film('Nebraska', '2013', 'Flat plains in quiet grey', ['#cfcfcb', '#8d8d88', '#2b2b29']),
    ] },
  ] },
  { key: 'world', question: 'Which world?', poles: [
    { name: 'a city at night', films: [
      film('Taxi Driver', '1976', 'Steam and sodium light on wet streets', ['#7a1f1a', '#e3a243', '#0d1014']),
      film('Collateral', '2004', 'Los Angeles in digital night', ['#14303f', '#e48f3b', '#5e8aa0']),
      film('Blade Runner', '1982', 'A rain-soaked future city', ['#0e1a26', '#d9773a', '#5aa1b5']),
    ] },
    { name: 'nature in daylight', films: [
      film('The Tree of Life', '2011', 'Sunlight through trees over a small town', ['#93b55a', '#e8d9a2', '#3e5a2c']),
      film('My Neighbor Totoro', '1988', 'Rice fields under a camphor tree', ['#5f9c4a', '#a7d0e6', '#2d4d2a']),
    ] },
  ] },
  { key: 'frame', question: 'Which frame?', poles: [
    { name: 'composed, still frames', films: [
      film('The Grand Budapest Hotel', '2014', 'Pink symmetry, everything centred', ['#e7a4b0', '#7b2f4e', '#f3e2c6']),
      film('Columbus', '2017', 'Modernist buildings framing two people', ['#cfd6cf', '#8a9a83', '#3f4b47']),
      film('Tokyo Story', '1953', 'A low camera in still family rooms', ['#d8d2c4', '#6b6558', '#22201b']),
    ] },
    { name: 'a restless, moving camera', films: [
      film('City of God', '2002', 'Sun-bleached streets in constant motion', ['#e9a63a', '#a8572a', '#38261a']),
      film('Children of Men', '2006', 'Grey chaos followed in one breath', ['#6e6f64', '#a59f86', '#2c2d28']),
      film('Uncut Gems', '2019', 'Showroom glare and crowded rooms', ['#1f2a44', '#d24c8f', '#e8d27a']),
    ] },
  ] },
  { key: 'time', question: 'Which time?', poles: [
    { name: 'the past, in amber and grain', films: [
      film('The Godfather', '1972', 'Amber rooms and deep shadow', ['#5a3a1c', '#c58a3e', '#120c08']),
      film('Bicycle Thieves', '1948', 'Rome’s streets in grey daylight', ['#bdbdb6', '#6a6a65', '#222220']),
    ] },
    { name: 'a clean, glowing future', films: [
      film('Blade Runner 2049', '2017', 'Orange haze over a ruined city', ['#e07b2a', '#f2c27a', '#3a2a1f']),
      film('Her', '2013', 'Soft coral rooms and city glass', ['#e86a50', '#f4c9a0', '#6d8aa3']),
      film('Gattaca', '1997', 'Clean modern halls in green-gold', ['#5f6b3a', '#d9c27a', '#20241a']),
    ] },
  ] },
  { key: 'reality', question: 'How real?', poles: [
    { name: 'something dreamlike', films: [
      film('Mulholland Drive', '2001', 'Hollywood at night, slightly wrong', ['#1b1f3a', '#c9a24a', '#7a1c2b']),
      film('Stalker', '1979', 'Sepia rooms and green overgrowth', ['#7b6a3e', '#4d6b45', '#1e1d17']),
      film('In the Mood for Love', '2000', 'Narrow corridors and red rooms', ['#8c1d1d', '#e0a65b', '#1a1210']),
    ] },
    { name: 'something close to life', films: [
      film('The Florida Project', '2017', 'Lilac motels in Florida sun', ['#b59ad8', '#f3c86b', '#5fb0c9']),
      film('Rosetta', '1999', 'A handheld camera close behind someone', ['#6d7a62', '#b6a98a', '#2c2e28']),
      film('Close-Up', '1990', 'Tehran streets, unadorned', ['#b9ae8f', '#6c6450', '#2b2720']),
    ] },
  ] },
];

export const EYE_TEST_ROUNDS = 5;

/** Five rounds from five different axes, one film from each side, sides shuffled. */
export function createEyeTest(random: () => number = Math.random, rounds = EYE_TEST_ROUNDS): EyeRound[] {
  const pick = <T,>(items: readonly T[]): T => items[Math.min(items.length - 1, Math.floor(random() * items.length))];
  const axes = [...EYE_AXES];
  for (let index = axes.length - 1; index > 0; index -= 1) {
    const other = Math.min(index, Math.floor(random() * (index + 1)));
    [axes[index], axes[other]] = [axes[other], axes[index]];
  }
  return axes.slice(0, Math.min(rounds, axes.length)).map(axis => {
    const frames = axis.poles.map(pole => ({ ...pick(pole.films), pole: pole.name })) as [EyeFrame, EyeFrame];
    if (random() < .5) frames.reverse();
    return { axis: axis.key, question: axis.question, frames };
  });
}

/** The reel request the five choices make. */
export function eyeTestRequest(rounds: readonly EyeRound[], picks: readonly EyePick[]): { films: string[]; creativeBrief: string } {
  const chosen = rounds.slice(0, picks.length).map((round, index) => ({ chosen: round.frames[picks[index]], other: round.frames[1 - picks[index]] }));
  const leanings = chosen.map(({ chosen: frame, other }) => `${frame.pole} (${frame.title} over ${other.title})`);
  return {
    films: chosen.map(({ chosen: frame }) => `${frame.title} (${frame.year})`),
    creativeBrief: `I took AFTERIMAGE's Eye Test: pairs of film frames, choosing the one that pulled me in. I chose ${leanings.join('; ')}. These are frames I picked, not necessarily films I have seen, so weigh their look and feel more than their stories.`,
  };
}
