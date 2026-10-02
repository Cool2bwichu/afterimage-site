import assert from 'node:assert/strict';
import test from 'node:test';

import { ATLAS_CANDIDATE_SCHEMA } from '../lib/atlas-contract.mjs';
import { createReplacementSchema } from '../lib/replacement-contract.mjs';
import { extractJson, toStructuredSchema } from '../lib/structured-output.mjs';
import { AFTERIMAGE_LIGHT_TABLE_SCHEMA_V1, AFTERIMAGE_SCHEMA_V2, LIGHT_TABLE_EXPERIENCE } from '../lib/v2-contract.mjs';

const GRAMMAR_KEYS = new Set(['type', 'properties', 'required', 'additionalProperties', 'items', 'enum', 'const', 'description', 'minItems']);

function keysIn(schema, found = new Set()) {
  for (const [key, value] of Object.entries(schema)) {
    found.add(key);
    if (key === 'properties') Object.values(value).forEach((child) => keysIn(child, found));
    if (key === 'items') keysIn(value, found);
  }
  return found;
}

test('limits that the output grammar cannot enforce move into descriptions', () => {
  const schema = toStructuredSchema({
    type: 'object',
    additionalProperties: false,
    required: ['palette', 'status', 'note'],
    properties: {
      palette: { type: 'array', minItems: 5, maxItems: 5, items: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' } },
      status: { type: 'string', enum: ['complete'] },
      note: { type: 'string', minLength: 1, maxLength: 80, description: 'A short note.' },
      optional: { type: 'array', minItems: 1, items: { type: 'string' } },
    },
  });
  assert.deepEqual(schema.properties.palette, {
    type: 'array',
    items: { type: 'string', description: '{pattern: "^#[0-9a-fA-F]{6}$"}' },
    description: '{minItems: 5, maxItems: 5}',
  });
  assert.deepEqual(schema.properties.status, { type: 'string', enum: ['complete'] });
  assert.equal(schema.properties.note.description, 'A short note.\n\n{minLength: 1, maxLength: 80}');
  assert.equal(schema.properties.optional.minItems, 1);
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual(schema.required, ['palette', 'status', 'note']);
});

test('every AFTERIMAGE schema compiles to supported grammar keywords only', () => {
  const schemas = [
    AFTERIMAGE_SCHEMA_V2,
    AFTERIMAGE_LIGHT_TABLE_SCHEMA_V1,
    ATLAS_CANDIDATE_SCHEMA,
    createReplacementSchema(undefined),
    createReplacementSchema(LIGHT_TABLE_EXPERIENCE),
  ];
  for (const source of schemas) {
    const before = JSON.stringify(source);
    const compiled = toStructuredSchema(source);
    assert.equal(JSON.stringify(source), before, 'the source schema is not modified');
    for (const key of keysIn(compiled)) assert.ok(GRAMMAR_KEYS.has(key), key + ' is not a grammar keyword');
  }
  const atlas = toStructuredSchema(ATLAS_CANDIDATE_SCHEMA);
  assert.match(atlas.properties.neighbors.description, /minItems: 8, maxItems: 8/);
  assert.deepEqual(atlas.properties.neighbors.items.properties.lenses.properties.howItLooks.properties.affinity.enum,
    ['close', 'echo', 'contrast']);
});

test('schemas that the grammar cannot express are refused', () => {
  assert.throws(() => toStructuredSchema({ type: 'object', properties: {} }), /additionalProperties/);
  assert.throws(() => toStructuredSchema({ type: 'number', minimum: 1 }), /Unsupported schema keyword: minimum/);
  assert.throws(() => toStructuredSchema(null), /must be an object/);
});

test('JSON is read from a bare or fenced answer within a size limit', () => {
  assert.deepEqual(extractJson('{"a":1}'), { a: 1 });
  assert.deepEqual(extractJson('```json\n{"a":1}\n```'), { a: 1 });
  assert.throws(() => extractJson(''), /empty/);
  assert.throws(() => extractJson('no object here'), /JSON object/);
  assert.throws(() => extractJson('{"a":"' + 'x'.repeat(30) + '"}', 20), /too long/);
  assert.throws(() => extractJson('{"a": }'), SyntaxError);
});
