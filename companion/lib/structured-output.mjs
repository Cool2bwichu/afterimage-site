// Claude's structured outputs compile a JSON schema into a response grammar. The
// grammar supports types, objects with `additionalProperties: false`, `required`,
// `items`, `enum` and `const`, but not length, pattern or count constraints. This
// moves those constraints into the field description, where Claude still reads
// them, and leaves enforcement to AFTERIMAGE's own validators after the response.
const KEPT = new Set(['type', 'properties', 'required', 'additionalProperties', 'items', 'enum', 'const', 'description']);
const DESCRIBED = ['minLength', 'maxLength', 'pattern', 'minItems', 'maxItems'];

export function toStructuredSchema(schema) {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
    throw new TypeError('A structured output schema must be an object.');
  }
  const unsupported = Object.keys(schema).filter((key) => !KEPT.has(key) && !DESCRIBED.includes(key));
  if (unsupported.length) throw new TypeError('Unsupported schema keyword: ' + unsupported.join(', ') + '.');

  const result = { type: schema.type };
  if (schema.enum) result.enum = [...schema.enum];
  if (schema.const !== undefined) result.const = schema.const;

  if (schema.type === 'object') {
    if (schema.additionalProperties !== false) throw new TypeError('Objects must set additionalProperties to false.');
    result.properties = Object.fromEntries(Object.entries(schema.properties || {})
      .map(([key, value]) => [key, toStructuredSchema(value)]));
    result.required = [...(schema.required || [])];
    result.additionalProperties = false;
  } else if (schema.type === 'array') {
    result.items = toStructuredSchema(schema.items);
    // A minimum of zero or one item is part of the grammar; larger bounds are not.
    if (schema.minItems === 0 || schema.minItems === 1) result.minItems = schema.minItems;
  }

  const limits = DESCRIBED
    .filter((key) => schema[key] !== undefined && !(key === 'minItems' && result.minItems !== undefined))
    .map((key) => key + ': ' + JSON.stringify(schema[key]));
  const description = [schema.description, limits.length ? '{' + limits.join(', ') + '}' : '']
    .filter(Boolean).join('\n\n');
  if (description) result.description = description;
  return result;
}

export function extractJson(text, maximumLength = 20000) {
  if (typeof text !== 'string' || !text.trim()) throw new Error('Claude returned an empty response.');
  if (text.length > maximumLength) throw new Error('Claude returned a response that is too long.');
  const cleaned = text.trim()
    .replace(/^\s*```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '');
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace < 0 || lastBrace <= firstBrace) throw new Error('Claude did not return a JSON object.');
  return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1));
}
