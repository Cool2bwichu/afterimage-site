// The words the site uses for each trait. `label` is the chip a viewer reads,
// `adj` and `noun` build names for galaxies and constellations ("Tender
// Violence", "Paranoid Futures"), and `light` is the kind of likeness the
// trait belongs to.

export const ATTRIBUTES = {
  // pace, tone and mood: how it feels
  'pace:relentless': { light: 'feeling', label: 'relentless', adj: 'Relentless', noun: 'Momentum' },
  'pace:brisk': { light: 'feeling', label: 'brisk', adj: 'Brisk', noun: 'Quick Steps' },
  'pace:slow-burn': { light: 'feeling', label: 'slow-burning', adj: 'Slow-Burning', noun: 'Slow Burns' },
  'pace:contemplative': { light: 'feeling', label: 'contemplative', adj: 'Contemplative', noun: 'Long Looks' },
  'tone:hopeful': { light: 'feeling', label: 'hopeful', adj: 'Hopeful', noun: 'Hope' },
  'tone:bleak': { light: 'feeling', label: 'bleak', adj: 'Bleak', noun: 'Bleakness' },
  'tone:melancholy': { light: 'feeling', label: 'melancholy', adj: 'Melancholy', noun: 'Melancholy' },
  'tone:comic': { light: 'feeling', label: 'comic', adj: 'Comic', noun: 'Comedy' },
  'tone:ironic': { light: 'feeling', label: 'ironic', adj: 'Ironic', noun: 'Irony' },
  'tone:earnest': { light: 'feeling', label: 'earnest', adj: 'Earnest', noun: 'Earnestness' },
  'tone:cerebral': { light: 'feeling', label: 'cerebral', adj: 'Cerebral', noun: 'Thought' },
  'tone:tender': { light: 'feeling', label: 'tender', adj: 'Tender', noun: 'Tenderness' },
  'mood:dreamlike': { light: 'feeling', label: 'dreamlike', adj: 'Dreamlike', noun: 'Dreams' },
  'mood:menacing': { light: 'feeling', label: 'menacing', adj: 'Menacing', noun: 'Menace' },
  'mood:paranoid': { light: 'feeling', label: 'paranoid', adj: 'Paranoid', noun: 'Paranoia' },
  'mood:warm': { light: 'feeling', label: 'warm', adj: 'Warm', noun: 'Warmth' },
  'mood:austere': { light: 'feeling', label: 'austere', adj: 'Austere', noun: 'Austerity' },
  'mood:elegiac': { light: 'feeling', label: 'elegiac', adj: 'Elegiac', noun: 'Elegies' },
  'mood:sensual': { light: 'feeling', label: 'sensual', adj: 'Sensual', noun: 'Sensuality' },
  'mood:absurd': { light: 'feeling', label: 'absurd', adj: 'Absurd', noun: 'Absurdity' },

  // subjects: what it is about
  'subject:spiritual': { light: 'idea', label: 'faith and the spirit', adj: 'Spiritual', noun: 'Faith' },
  'subject:political': { light: 'idea', label: 'politics and power', adj: 'Political', noun: 'Politics' },
  'subject:coming-of-age': { light: 'idea', label: 'growing up', adj: 'Coming-of-Age', noun: 'Youth' },
  'subject:grief': { light: 'idea', label: 'grief', adj: 'Grieving', noun: 'Grief' },
  'subject:obsession': { light: 'idea', label: 'obsession', adj: 'Obsessive', noun: 'Obsession' },
  'subject:family': { light: 'idea', label: 'family', adj: 'Family', noun: 'Families' },
  'subject:desire': { light: 'idea', label: 'desire', adj: 'Desiring', noun: 'Desire' },
  'subject:work': { light: 'idea', label: 'work', adj: 'Working', noun: 'Work' },
  'subject:memory': { light: 'idea', label: 'memory', adj: 'Remembering', noun: 'Memory' },
  'subject:class': { light: 'idea', label: 'class', adj: 'Class-Bound', noun: 'Class' },

  // story kinds and ways of telling: what happens
  'story:coming-home': { light: 'story', label: 'a homecoming', adj: 'Homeward', noun: 'Homecomings' },
  'story:fish-out-of-water': { light: 'story', label: 'a stranger in a strange place', adj: 'Out-of-Place', noun: 'Strangers' },
  'story:race-against-time': { light: 'story', label: 'a race against time', adj: 'Against-the-Clock', noun: 'Countdowns' },
  'story:descent': { light: 'story', label: 'a descent', adj: 'Descending', noun: 'Descents' },
  'story:investigation': { light: 'story', label: 'an investigation', adj: 'Investigating', noun: 'Investigations' },
  'story:revenge': { light: 'story', label: 'revenge', adj: 'Vengeful', noun: 'Revenge' },
  'story:survival': { light: 'story', label: 'survival', adj: 'Surviving', noun: 'Survival' },
  'structure:nonlinear': { light: 'story', label: 'told out of order', adj: 'Out-of-Order', noun: 'Shuffled Time' },
  'structure:ensemble': { light: 'story', label: 'an ensemble', adj: 'Ensemble', noun: 'Ensembles' },
  'structure:single-setting': { light: 'story', label: 'a single setting', adj: 'One-Room', noun: 'Single Rooms' },
  'structure:episodic': { light: 'story', label: 'told in episodes', adj: 'Episodic', noun: 'Episodes' },
  'structure:twist': { light: 'story', label: 'a twist', adj: 'Twisting', noun: 'Twists' },
  'structure:narrated': { light: 'story', label: 'a narrator', adj: 'Narrated', noun: 'Narrators' },

  // texture: how it looks and sounds
  'texture:sparse-dialogue': { light: 'image', label: 'few words', adj: 'Near-Silent', noun: 'Silence' },
  'texture:talky': { light: 'image', label: 'wall-to-wall talk', adj: 'Talkative', noun: 'Talk' },
  'texture:painterly': { light: 'image', label: 'painterly frames', adj: 'Painterly', noun: 'Paintings' },
  'texture:handheld-raw': { light: 'image', label: 'raw, handheld', adj: 'Handheld', noun: 'Raw Footage' },
  'texture:stylised': { light: 'image', label: 'heavily stylised', adj: 'Stylised', noun: 'Style' },
  'texture:graphic-violence': { light: 'image', label: 'graphic violence', adj: 'Violent', noun: 'Violence' },
  'texture:music-led': { light: 'image', label: 'led by its music', adj: 'Musical', noun: 'Music' },
  'texture:grimy': { light: 'image', label: 'grime and grain', adj: 'Grimy', noun: 'Grime' },

  // setting and mode: where it lives
  'setting:space': { light: 'world', label: 'space', adj: 'Spaceborne', noun: 'Space' },
  'setting:small-town': { light: 'world', label: 'a small town', adj: 'Small-Town', noun: 'Small Towns' },
  'setting:city-at-night': { light: 'world', label: 'a city at night', adj: 'Nocturnal', noun: 'Cities at Night' },
  'setting:wilderness': { light: 'world', label: 'wilderness', adj: 'Wild', noun: 'Wilderness' },
  'setting:future': { light: 'world', label: 'the future', adj: 'Future', noun: 'Futures' },
  'mode:action': { light: 'world', label: 'action', adj: 'Action', noun: 'Action' },
  'mode:suspense': { light: 'world', label: 'suspense', adj: 'Suspenseful', noun: 'Suspense' },
  'mode:spectacle': { light: 'world', label: 'spectacle', adj: 'Spectacular', noun: 'Spectacle' },
};

// The five scored axes. A film only carries a pole when it sits clearly at it.
export const AXES = {
  dread: { light: 'feeling', high: { id: 'dread', label: 'steeped in dread', adj: 'Dread-Filled', noun: 'Dread' }, low: { id: 'ease', label: 'at ease', adj: 'Easygoing', noun: 'Ease' } },
  cruelty: { light: 'feeling', high: { id: 'cruelty', label: 'cruel to its people', adj: 'Cruel', noun: 'Cruelty' }, low: { id: 'tenderness', label: 'tender to its people', adj: 'Gentle', noun: 'Gentleness' } },
  irony: { light: 'feeling', high: { id: 'irony', label: 'held at an ironic distance', adj: 'Arch', noun: 'Distance' }, low: { id: 'sincerity', label: 'wholly sincere', adj: 'Sincere', noun: 'Sincerity' } },
  ambiguity: { light: 'story', high: { id: 'open', label: 'an ending left open', adj: 'Unresolved', noun: 'Open Endings' }, low: null },
  fracture: { light: 'story', high: { id: 'fractured', label: 'a fractured telling', adj: 'Fractured', noun: 'Fractured Time' }, low: null },
};

// Which light each of the 28 ATLAS worlds mostly belongs to.
export const REGISTER_LIGHT = {
  'silver-print': 'image',
  'folk-horror': 'world',
  'haunted-house': 'world',
  'cerebral-horror': 'feeling',
  'body-horror': 'world',
  gothic: 'world',
  'the-killer-outside': 'story',
  'dream-logic': 'feeling',
  'films-about-films': 'idea',
  'argument-as-plot': 'story',
  'faith-and-silence': 'idea',
  'family-as-trap': 'idea',
  'marriage-in-decay': 'idea',
  'coming-of-age': 'idea',
  'aching-romance': 'feeling',
  'melancholy-drift': 'feeling',
  'paranoid-thriller': 'feeling',
  'noir-fatalism': 'world',
  'the-professional-job': 'story',
  'the-institution': 'world',
  'cyberpunk-mood': 'world',
  'cold-science-fiction': 'world',
  'artificial-life': 'idea',
  'after-the-end': 'world',
  'dystopian-satire': 'idea',
  'war-as-attrition': 'world',
  'wilderness-obsession': 'idea',
  'new-wave-restlessness': 'hands',
};

// What the frame measurements say in words, for films that have them.
export const FRAME_TRAITS = {
  bright: { label: 'bright, open frames', adj: 'Bright', noun: 'Daylight' },
  dim: { label: 'low light', adj: 'Dim', noun: 'Low Light' },
  hard: { label: 'hard contrast', adj: 'High-Contrast', noun: 'Hard Light' },
  soft: { label: 'soft contrast', adj: 'Soft', noun: 'Soft Light' },
  saturated: { label: 'saturated colour', adj: 'Saturated', noun: 'Colour' },
  muted: { label: 'muted colour', adj: 'Muted', noun: 'Muted Colour' },
  warm: { label: 'warm colour', adj: 'Warm-Toned', noun: 'Warm Colour' },
  cool: { label: 'cool colour', adj: 'Cool-Toned', noun: 'Cool Colour' },
};

export const ASPECTS = {
  scope: { match: ['2.35:1', '2.39:1', '2.2:1', '2:1'], label: 'a wide scope frame' },
  flat: { match: ['1.85:1', '16:9', '1.90:1'], label: 'a 1.85 frame' },
  european: { match: ['1.66:1'], label: 'a 1.66 frame' },
  academy: { match: ['4:3', 'Academy ratio', '3:2', '10:7', '19:16'], label: 'a square Academy frame' },
};

export function decadeOf(year) {
  const y = Number(year);
  return Number.isFinite(y) && y > 1800 ? `${Math.floor(y / 10) * 10}s` : null;
}
