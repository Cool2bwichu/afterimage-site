// Reads the beginning of a JSON document while it is still being written, so a
// developing answer can be shown before it is complete. Strings, numbers and
// literals appear only once they are finished; an open object or array keeps
// the members finished so far. Text before the first `{` or `[`, such as a code
// fence, is skipped. Returns undefined when nothing can be read yet.
const INCOMPLETE = Symbol('incomplete');
const ESCAPES = { '"': '"', '\\': '\\', '/': '/', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t' };
const NUMBER = /-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/y;

export function parsePartialJson(text) {
  if (typeof text !== 'string') return undefined;
  const start = text.search(/[{[]/);
  if (start < 0) return undefined;
  const length = text.length;
  let index = start;

  const skipSpace = () => {
    while (index < length && (text[index] === ' ' || text[index] === '\n' || text[index] === '\r' || text[index] === '\t')) index += 1;
  };

  function string() {
    let out = '';
    let cursor = index + 1;
    while (cursor < length) {
      const char = text[cursor];
      if (char === '"') {
        index = cursor + 1;
        return out;
      }
      if (char === '\\') {
        if (cursor + 1 >= length) break;
        const escape = text[cursor + 1];
        if (escape === 'u') {
          const hex = text.slice(cursor + 2, cursor + 6);
          if (hex.length < 4) break;
          if (!/^[0-9a-f]{4}$/i.test(hex)) throw new SyntaxError('Invalid unicode escape in JSON.');
          out += String.fromCharCode(parseInt(hex, 16));
          cursor += 6;
          continue;
        }
        if (!Object.hasOwn(ESCAPES, escape)) throw new SyntaxError('Invalid escape in JSON.');
        out += ESCAPES[escape];
        cursor += 2;
        continue;
      }
      out += char;
      cursor += 1;
    }
    index = length;
    return INCOMPLETE;
  }

  function number() {
    NUMBER.lastIndex = index;
    const match = NUMBER.exec(text);
    // A number that runs to the end of the text may still have digits coming.
    if (!match || index + match[0].length >= length) {
      index = length;
      return INCOMPLETE;
    }
    index += match[0].length;
    return Number(match[0]);
  }

  function literal() {
    for (const [word, value] of [['true', true], ['false', false], ['null', null]]) {
      if (text.startsWith(word, index)) {
        index += word.length;
        return value;
      }
      if (word.startsWith(text.slice(index))) {
        index = length;
        return INCOMPLETE;
      }
    }
    throw new SyntaxError('Unexpected token in JSON.');
  }

  function value() {
    skipSpace();
    if (index >= length) return INCOMPLETE;
    const char = text[index];
    if (char === '{') return object();
    if (char === '[') return array();
    if (char === '"') return string();
    if (char === '-' || (char >= '0' && char <= '9')) return number();
    return literal();
  }

  function array() {
    index += 1;
    const out = [];
    for (;;) {
      skipSpace();
      if (index >= length) return out;
      if (text[index] === ']') {
        index += 1;
        return out;
      }
      const item = value();
      if (item === INCOMPLETE) return out;
      out.push(item);
      skipSpace();
      if (index >= length) return out;
      if (text[index] === ',') {
        index += 1;
        continue;
      }
      if (text[index] === ']') {
        index += 1;
        return out;
      }
      throw new SyntaxError('Expected a comma or ] in a JSON array.');
    }
  }

  function object() {
    index += 1;
    const out = {};
    for (;;) {
      skipSpace();
      if (index >= length) return out;
      if (text[index] === '}') {
        index += 1;
        return out;
      }
      if (text[index] !== '"') throw new SyntaxError('Expected a property name in a JSON object.');
      const key = string();
      if (key === INCOMPLETE) return out;
      skipSpace();
      if (index >= length) return out;
      if (text[index] !== ':') throw new SyntaxError('Expected a colon in a JSON object.');
      index += 1;
      const item = value();
      if (item === INCOMPLETE) return out;
      // Never let a property such as __proto__ reach the prototype.
      Object.defineProperty(out, key, { value: item, enumerable: true, writable: true, configurable: true });
      skipSpace();
      if (index >= length) return out;
      if (text[index] === ',') {
        index += 1;
        continue;
      }
      if (text[index] === '}') {
        index += 1;
        return out;
      }
      throw new SyntaxError('Expected a comma or } in a JSON object.');
    }
  }

  try {
    const result = value();
    return result === INCOMPLETE ? undefined : result;
  } catch {
    return undefined;
  }
}
