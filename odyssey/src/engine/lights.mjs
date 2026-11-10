// The six lights: six ways two films can be alike. The universe re-forms under
// each one. White light is all of them together.
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

export const ALL_LIGHTS = [WHITE, ...LIGHTS];
export const LIGHT_IDS = LIGHTS.map(light => light.id);
export const lightById = id => ALL_LIGHTS.find(light => light.id === id) || WHITE;
export const lightIndex = id => LIGHT_IDS.indexOf(id);
