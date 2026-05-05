import assert from 'node:assert';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import YAML from 'yaml';

import { anonymizeOpenApiInPlace } from '../dist/anonymize-script/anonymize.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturePath = join(__dirname, 'fixtures', 'sample-openapi.yaml');
const snapshotPath = snapshotPathForFixture(fixturePath);

const UPDATE_SNAPSHOT = process.env.UPDATE_SNAPSHOT === '1';

/** Deep-sort object keys so snapshots stay stable regardless of insertion order. */
function sortKeysDeep(value) {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(sortKeysDeep);
  }
  const sorted = {};
  for (const key of Object.keys(value).sort()) {
    sorted[key] = sortKeysDeep(value[key]);
  }
  return sorted;
}

function formatFromFixturePath(fixturePath) {
  const ext = extname(fixturePath).toLowerCase();
  if (ext === '.json') return 'json';
  if (ext === '.yaml' || ext === '.yml') return 'yaml';
  throw new Error(`Unsupported fixture extension ${ext}; use .yaml, .yml, or .json`);
}

/** Same directory as fixture basename → snapshots/<name>.anonymized.<ext> */
function snapshotPathForFixture(fixturePath) {
  const base = basename(fixturePath, extname(fixturePath));
  const ext = extname(fixturePath);
  return join(__dirname, 'snapshots', `${base}.anonymized${ext}`);
}

function parseFixture(raw, format) {
  if (format === 'json') {
    return JSON.parse(raw);
  }
  return YAML.parse(raw);
}

/** Snapshot text in the same serialization family as the input file (YAML or JSON). */
function snapshotString(doc, format) {
  const sorted = sortKeysDeep(doc);
  if (format === 'json') {
    return `${JSON.stringify(sorted, null, 2)}\n`;
  }
  let out = YAML.stringify(sorted, {
    directives: false,
    indent: 2,
    lineWidth: 0,
  });
  if (!out.endsWith('\n')) {
    out += '\n';
  }
  return out;
}

describe('anonymizeOpenApiInPlace', () => {
  it('matches golden snapshot for sample-openapi.yaml', () => {
    const format = formatFromFixturePath(fixturePath);
    const doc = parseFixture(readFileSync(fixturePath, 'utf8'), format);
    anonymizeOpenApiInPlace(doc);

    const actual = snapshotString(doc, format);

    if (UPDATE_SNAPSHOT) {
      mkdirSync(dirname(snapshotPath), { recursive: true });
      writeFileSync(snapshotPath, actual, 'utf8');
      return;
    }

    let expected;
    try {
      expected = readFileSync(snapshotPath, 'utf8');
    } catch (err) {
      if (err && err.code === 'ENOENT') {
        assert.fail(
          `Missing snapshot at ${snapshotPath}. Run: UPDATE_SNAPSHOT=1 pnpm test`,
        );
      }
      throw err;
    }

    assert.strictEqual(actual, expected);
  });

  it('is deterministic for the same fixture input', () => {
    const format = formatFromFixturePath(fixturePath);
    const run = () => {
      const d = parseFixture(readFileSync(fixturePath, 'utf8'), format);
      anonymizeOpenApiInPlace(d);
      return snapshotString(d, format);
    };

    assert.strictEqual(run(), run());
  });
});
