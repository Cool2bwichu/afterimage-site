// The six lights: six ways two films can be alike. The universe re-forms under
// each one. White light is all of them together, and Lookback is time.
export const LIGHTS = [
  {
    id: 'story', name: 'Story', color: '#f2b066',
    asks: 'What happens',
    line: 'Films whose stories move alike: the same turns, the same shape of fortune, the same way of telling.',
    short: 'the turns of the story',
    weight: 1,
  },
  {
    id: 'feeling', name: 'Feeling', color: '#f08aa0',
    asks: 'How it feels',
    line: 'Films that leave the same weather behind: mood, tone, pace, and how much dread or tenderness they carry.',
    short: 'the mood and pace',
    weight: 1,
  },
  {
    id: 'image', name: 'Image', color: '#79d3ea',
    asks: 'How it looks and sounds',
    line: 'Films that meet the eye and ear alike: light, colour, texture, the era of the print, the hand on the camera.',
    short: 'the look and sound',
    weight: 0.8,
  },
  {
    id: 'idea', name: 'Idea', color: '#bda0f7',
    asks: 'What it is about',
    line: 'Films circling the same subjects: grief, class, faith, desire, work, memory, and the people caught in them.',
    short: 'what it is about',
    weight: 1,
  },
  {
    id: 'world', name: 'World', color: '#8fdcaa',
    asks: 'Where it lives',
    line: 'Films that share a territory: genre, place, period, and the kind of reality they take for granted.',
    short: 'the territory it lives in',
    weight: 0.8,
  },
  {
    id: 'hands', name: 'Hands', color: '#8aa8f5',
    asks: 'Who made it',
    line: 'Films from the same hands and the same moment: directors, writers, crews, casts, movements, a country in a decade.',
    short: 'the people who made it',
    weight: 0.45,
  },
];

export const WHITE = {
  id: 'white', name: 'White light', color: '#f4efe5',
  asks: 'Everything at once',
  line: 'All six lights together: films that are alike in the most ways at once.',
  short: 'everything at once',
};

// Not a seventh light but another way of looking: the same films placed by when
// they were made (see time.mjs). It sits on the dial after the lights, on key 7.
export const LOOKBACK = {
  id: 'time', name: 'Lookback', color: '#ec8c66',
  asks: 'When it was made',
  line: 'The farther the star, the older its light: the present at the centre, a ring for each decade, the silent years at the horizon. A film keeps the direction of its kind, so looking outward from it is looking back along its line.',
  short: 'when it was made',
};

export const ALL_LIGHTS = [WHITE, ...LIGHTS, LOOKBACK];
export const LIGHT_IDS = LIGHTS.map(light => light.id);
export const lightById = id => ALL_LIGHTS.find(light => light.id === id) || WHITE;
export const lightIndex = id => LIGHT_IDS.indexOf(id);
