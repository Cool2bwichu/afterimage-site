// Reads the beginning of a JSON document while it is still being written, so
// a developing answer can be shown before it is complete. Strings, numbers
// and literals count only once finished; an open object or array keeps the
// members finished so far. Text before the first `{` or `[` (a code fence, a
// stray sentence) is skipped. Returns undefined when nothing can be read yet.
const OPEN = Symbol('open');
const ESCAPES = { '"': '"', '\\': '\\', '/': '/', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t' };

export function readPartial(text) {
  if (typeof text !== 'string') return undefined;
  const start = text.search(/[{[]/);
  if (start < 0) return undefined;
  const length = text.length;
  let at = start;

  const space = () => { while (at < length && /\s/.test(text[at])) at += 1; };

  function string() {
    let out = '';
    let cursor = at + 1;
    while (cursor < length) {
      const char = text[cursor];
      if (char === '"') { at = cursor + 1; return out; }
      if (char === '\\') {
        const next = text[cursor + 1];
        if (next === undefined) break;
        if (next === 'u') {
          const code = text.slice(cursor + 2, cursor + 6);
          if (code.length < 4) break;
          out += String.fromCharCode(parseInt(code, 16) || 0xfffd);
          cursor += 6;
          continue;
        }
        out += ESCAPES[next] ?? next;
        cursor += 2;
        continue;
      }
      out += char;
      cursor += 1;
    }
    at = length;
    return OPEN;
  }

  function scalar() {
    const rest = text.slice(at);
    const number = /^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(rest);
    if (number) {
      // A number counts once something has been written that ends it: until then
      // more digits, a decimal point or an exponent may still be coming.
      const next = rest[number[0].length];
      if (next === undefined || /[\d.eE+-]/.test(next)) { at = length; return OPEN; }
      at += number[0].length;
      return Number(number[0]);
    }
    for (const [word, value] of [['true', true], ['false', false], ['null', null]]) {
      if (rest.startsWith(word)) { at += word.length; return value; }
      if (word.startsWith(rest)) { at = length; return OPEN; }
    }
    at = length; // something unexpected: stop reading here
    return OPEN;
  }

  function value() {
    space();
    if (at >= length) return OPEN;
    const char = text[at];
    if (char === '"') return string();
    if (char === '{') return object();
    if (char === '[') return array();
    return scalar();
  }

  function object() {
    const out = {};
    at += 1;
    for (;;) {
      space();
      if (at >= length) return out;
      if (text[at] === '}') { at += 1; return out; }
      if (text[at] === ',') { at += 1; continue; }
      if (text[at] !== '"') { at = length; return out; }
      const key = string();
      if (key === OPEN) return out;
      space();
      if (text[at] !== ':') { at = length; return out; }
      at += 1;
      const member = value();
      if (member === OPEN) return out;
      out[key] = member;
    }
  }

  function array() {
    const out = [];
    at += 1;
    for (;;) {
      space();
      if (at >= length) return out;
      if (text[at] === ']') { at += 1; return out; }
      if (text[at] === ',') { at += 1; continue; }
      const before = at;
      const member = value();
      if (member === OPEN) return out;
      // An object or array still being written is not an item yet: an array
      // only holds finished members, so a list can be shown one item at a time.
      if (member && typeof member === 'object' && at >= length && !closedAt(before)) return out;
      out.push(member);
    }
  }

  // Whether the value that starts at `from` is closed in the text read so far.
  function closedAt(from) {
    let depth = 0;
    let inString = false;
    for (let cursor = from; cursor < length; cursor += 1) {
      const char = text[cursor];
      if (inString) {
        if (char === '\\') cursor += 1;
        else if (char === '"') inString = false;
        continue;
      }
      if (char === '"') inString = true;
      else if (char === '{' || char === '[') depth += 1;
      else if (char === '}' || char === ']') { depth -= 1; if (depth === 0) return true; }
    }
    return false;
  }

  const result = value();
  return result === OPEN ? undefined : result;
}
