// Gives every galaxy and arm a name. Authored rules are tried first (see
// authored/galaxies.mjs); anything they do not cover is named from its own
// leading traits, so a sky always comes out fully labelled.
import { GALAXY_NAMES } from '../authored/galaxies.mjs';

const LEADING = 8;

function fit(rule, labels, shares) {
  let score = 0;
  for (const wanted of rule.has) {
    const rank = labels.indexOf(wanted.toLowerCase());
    if (rank < 0 || rank >= LEADING) return 0;
    // A rule may ask that its traits truly dominate the family (`share`), so
    // one director's name is not given to a galaxy he only leads.
    if (rule.share && shares[rank] < rule.share) return 0;
    score += 1 / (rank + 1);
  }
  // A rule that asks for more is a better description when it fits.
  return score + 0.05 * rule.has.length;
}

function computedName(top, traits, taken) {
  const info = top.map(entry => traits[entry.trait]);
  const tryName = name => (name && !taken.has(name) ? name : null);
  const first = info[0];
  if (!first) return tryName('Uncharted') || `Uncharted ${taken.size + 1}`;
  if (first.kind === 'director') {
    const name = tryName(`${first.short} and Company`);
    if (name) return name;
  }
  if (first.kind === 'movement') {
    const name = tryName(first.short);
    if (name) return name;
  }
  const adjective = info.find(t => t.adj);
  const noun = info.find(t => t.noun && t !== adjective);
  const candidates = [
    adjective && noun ? `${adjective.adj} ${noun.noun}` : null,
    info[1] ? `${first.short} and ${info[1].short}` : null,
    first.short,
    info[2] ? `${first.short} and ${info[2].short}` : null,
    info[3] ? `${first.short} and ${info[3].short}` : null,
  ];
  for (const candidate of candidates) {
    const name = tryName(candidate);
    if (name) return name;
  }
  let n = 2;
  while (taken.has(`${first.short} ${n}`)) n += 1;
  return `${first.short} ${n}`;
}

function computedThesis(top, traits) {
  const labels = [...new Set(top.slice(0, 3).map(entry => traits[entry.trait].label))];
  if (!labels.length) return 'A family this light has not named yet.';
  if (labels.length === 1) return `Films that share one thing above all: ${labels[0]}.`;
  return `Films that share ${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}.`;
}

/** Adds { name, thesis, authored } to each galaxy of one light. */
export function nameGalaxies({ lightId, galaxies, traits }) {
  const rules = GALAXY_NAMES[lightId] || [];
  const pairs = [];
  galaxies.forEach((galaxy, at) => {
    const labels = galaxy.top.map(entry => traits[entry.trait].label.toLowerCase());
    const shares = galaxy.top.map(entry => entry.share);
    rules.forEach((rule, ruleAt) => {
      const score = fit(rule, labels, shares);
      if (score > 0) pairs.push({ at, ruleAt, score });
    });
  });
  pairs.sort((a, b) => b.score - a.score || a.ruleAt - b.ruleAt || a.at - b.at);
  const named = new Map();
  const taken = new Set();
  for (const pair of pairs) {
    const rule = rules[pair.ruleAt];
    if (named.has(pair.at) || taken.has(rule.name)) continue;
    named.set(pair.at, rule);
    taken.add(rule.name);
  }
  return galaxies.map((galaxy, at) => {
    const rule = named.get(at);
    if (rule) return { ...galaxy, name: rule.name, thesis: rule.thesis, authored: true };
    const name = computedName(galaxy.top, traits, taken);
    taken.add(name);
    return { ...galaxy, name, thesis: computedThesis(galaxy.top, traits), authored: false };
  });
}

/** Names an arm by what sets it apart inside its galaxy. */
export function nameArm({ arm, galaxy, traits, taken, films = null }) {
  const lead = galaxy.top[0] ? galaxy.top[0].trait : -1;
  const shorts = [];
  for (const entry of arm.top) {
    if (entry.trait === lead) continue;
    const short = traits[entry.trait].short;
    if (!shorts.includes(short)) shorts.push(short);
  }
  if (!shorts.length && arm.top[0]) shorts.push(traits[arm.top[0].trait].short);
  const options = [
    shorts.slice(0, 2).join(' · '),
    shorts.slice(0, 3).join(' · '),
    [shorts[0], shorts[2]].filter(Boolean).join(' · '),
    shorts[0],
  ].filter(Boolean);
  for (const option of options) if (!taken.has(option)) return option;
  // Nothing sets this arm apart in words: name it after the film it turns on.
  if (films && arm.lead && arm.lead.length) {
    for (const film of arm.lead) {
      const option = `Around ${films[film].title}`;
      if (!taken.has(option)) return option;
    }
  }
  let n = 2;
  const base = options[0] || 'Arm';
  while (taken.has(`${base} ${n}`)) n += 1;
  return `${base} ${n}`;
}
