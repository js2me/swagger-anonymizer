import assert from 'node:assert';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import YAML from 'yaml';

import { anonymizeOpenApiInPlace } from '../dist/anonymize-script/anonymize.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const FIXTURES = [
  join(__dirname, 'fixtures', 'sample-openapi.yaml'),
  join(__dirname, 'fixtures', 'swagger-2.json'),
];

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

function findFirstExternalRef(node) {
  if (node === null || typeof node !== 'object') return undefined;
  if (typeof node.$ref === 'string') {
    const r = node.$ref;
    if (r.includes('#') && !r.startsWith('#')) return r;
  }
  if (Array.isArray(node)) {
    for (const v of node) {
      const f = findFirstExternalRef(v);
      if (f !== undefined) return f;
    }
    return undefined;
  }
  for (const v of Object.values(node)) {
    const f = findFirstExternalRef(v);
    if (f !== undefined) return f;
  }
  return undefined;
}

const EXTERNAL_REF_FIXTURE = {
  openapi: '3.0.0',
  info: { title: 'External ref probe', version: '1.0.0' },
  paths: {
    '/probe': {
      get: {
        responses: {
          '400': {
            description: 'Ventito quas ager.',
            content: {
              'application/json': {
                schema: {
                  $ref:
                    './common/responses.yaml#/components/schemas/LolBeTest',
                },
              },
            },
          },
        },
      },
    },
  },
};

const EXTERNAL_HTTPS_REF_FIXTURE = {
  openapi: '3.0.0',
  info: { title: 'HTTPS external ref', version: '1.0.0' },
  paths: {
    '/probe-https': {
      get: {
        responses: {
          '400': {
            content: {
              'application/json': {
                schema: {
                  $ref:
                    'https://api.vendor.example.com/v2/common/responses.yaml#/components/schemas/LolBeTest',
                },
              },
            },
          },
        },
      },
    },
  },
};

describe('anonymizeOpenApiInPlace', () => {
  it('anonymizes external $ref while keeping relative path shape and pointer', () => {
    const doc = structuredClone(EXTERNAL_REF_FIXTURE);
    const before = findFirstExternalRef(doc);
    assert.strictEqual(
      before,
      './common/responses.yaml#/components/schemas/LolBeTest',
    );

    anonymizeOpenApiInPlace(doc);
    const after = findFirstExternalRef(doc);
    assert.notStrictEqual(after, before);
    assert.match(
      after,
      /^\.\/[^/]+\/[^/]+\.yaml#\/components\/schemas\/Sch[A-Za-z0-9]+$/,
    );
    assert.doesNotMatch(after, /common|responses|LolBeTest/i);
  });

  it('anonymizes https://... external $ref (fake host, path depth, fragment)', () => {
    const doc = structuredClone(EXTERNAL_HTTPS_REF_FIXTURE);
    const before = findFirstExternalRef(doc);
    assert.ok(before.startsWith('https://'));

    anonymizeOpenApiInPlace(doc);
    const after = findFirstExternalRef(doc);
    assert.notStrictEqual(after, before);
    assert.match(
      after,
      /^https:\/\/.+\.invalid\/(?:[^/]+\/){2}[^/]+\.yaml#\/components\/schemas\/Sch[A-Za-z0-9]+$/,
    );
    assert.doesNotMatch(
      after,
      /vendor|example|common|responses|LolBeTest|api\.vendor/i,
    );
  });

  it('anonymizes https URL when fragment is only #/ (root pointer)', () => {
    const doc = {
      openapi: '3.0.0',
      info: { title: 't', version: '1.0.0' },
      paths: {
        '/p': {
          get: {
            responses: {
              '200': {
                content: {
                  'application/json': {
                    schema: {
                      $ref:
                        'https://leaky.example.com/spec/openapi.yaml#/',
                    },
                  },
                },
              },
            },
          },
        },
      },
    };
    anonymizeOpenApiInPlace(doc);
    const after = findFirstExternalRef(doc);
    assert.strictEqual(after.slice(-2), '#/');
    assert.doesNotMatch(after, /leaky|example|spec|openapi/i);
    assert.match(
      after,
      /^https:\/\/.+\.invalid\/[^/]+\/[^/]+\.yaml#\/$/,
    );
  });

  it('anonymizes ftp://... external $ref like http(s)', () => {
    const doc = {
      openapi: '3.0.0',
      info: { title: 't', version: '1.0.0' },
      paths: {
        '/pf': {
          get: {
            responses: {
              '400': {
                content: {
                  'application/json': {
                    schema: {
                      $ref:
                        'ftp://mirror.vendor.example.org/pub/api/v1/spec.yaml#/components/schemas/LolBeTest',
                    },
                  },
                },
              },
            },
          },
        },
      },
    };
    anonymizeOpenApiInPlace(doc);
    const after = findFirstExternalRef(doc);
    assert.match(
      after,
      /^ftp:\/\/.+\.invalid\/(?:[^/]+\/)+[^/]+\.yaml#\/components\/schemas\/Sch[A-Za-z0-9]+$/,
    );
    assert.doesNotMatch(
      after,
      /mirror|vendor|example|org|pub|api|spec|LolBeTest/i,
    );
  });

  it('anonymizes file:///... local path (no host)', () => {
    const doc = {
      openapi: '3.0.0',
      info: { title: 't', version: '1.0.0' },
      paths: {
        '/pf': {
          get: {
            responses: {
              '400': {
                content: {
                  'application/json': {
                    schema: {
                      $ref:
                        'file:///home/leaky/projects/common/openapi.yaml#/components/schemas/LolBeTest',
                    },
                  },
                },
              },
            },
          },
        },
      },
    };
    anonymizeOpenApiInPlace(doc);
    const after = findFirstExternalRef(doc);
    assert.ok(after.startsWith('file:///'));
    assert.match(
      after,
      /^file:\/\/\/(?:[^/]+\/)+[^/]+\.yaml#\/components\/schemas\/Sch[A-Za-z0-9]+$/,
    );
    assert.doesNotMatch(after, /home|leaky|projects|common|openapi|LolBeTest/i);
  });

  it('anonymizes file://host/... with authority', () => {
    const doc = {
      openapi: '3.0.0',
      info: { title: 't', version: '1.0.0' },
      paths: {
        '/pf': {
          get: {
            responses: {
              '400': {
                content: {
                  'application/json': {
                    schema: {
                      $ref:
                        'file://nas.vendor.local/share/specs/api.yaml#/components/schemas/LolBeTest',
                    },
                  },
                },
              },
            },
          },
        },
      },
    };
    anonymizeOpenApiInPlace(doc);
    const after = findFirstExternalRef(doc);
    assert.match(
      after,
      /^file:\/\/.+\.invalid\/(?:[^/]+\/)+[^/]+\.yaml#\/components\/schemas\/Sch[A-Za-z0-9]+$/,
    );
    assert.doesNotMatch(after, /nas|vendor|local|share|specs|api|LolBeTest/i);
  });

  it('anonymizes object-shaped media type example and examples[].value strings', () => {
    const doc = {
      openapi: '3.0.0',
      info: { title: 't', version: '1.0.0' },
      components: {
        responses: {
          BadRequest: {
            description: 'bad',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/Err',
                },
                example: {
                  error: 'some parameters required',
                  hint: 'Editing groups for the service is not supported',
                },
                examples: {
                  named: {
                    summary: 'x',
                    value: {
                      error: 'internal server error',
                    },
                  },
                },
              },
            },
          },
        },
        schemas: {
          Err: {
            type: 'object',
            properties: {
              acidic_outset_265: { type: 'string' },
            },
          },
        },
      },
      paths: {},
    };

    anonymizeOpenApiInPlace(doc);

    const responses = doc.components.responses;
    const responseEntry = Object.values(responses)[0];
    const mt = responseEntry.content['application/json'];
    assert.ok(mt.example);
    assert.match(mt.example.error, /^\w+/);
    assert.doesNotMatch(
      mt.example.error,
      /some parameters required|Editing groups|internal server error/i,
    );
    assert.doesNotMatch(
      mt.example.hint,
      /some parameters required|Editing groups|internal server error/i,
    );
    assert.ok(mt.examples.named.value);
    assert.match(mt.examples.named.value.error, /^\w+/);
    assert.doesNotMatch(
      mt.examples.named.value.error,
      /internal server error/i,
    );
  });

  it('is deterministic for a document with an external $ref', () => {
    const run = () => {
      const d = structuredClone(EXTERNAL_REF_FIXTURE);
      anonymizeOpenApiInPlace(d);
      return findFirstExternalRef(d);
    };
    assert.strictEqual(run(), run());
  });

  for (const fixturePath of FIXTURES) {
    const fixtureName = basename(fixturePath);
    const snapshotPath = snapshotPathForFixture(fixturePath);

    it(`matches golden snapshot for ${fixtureName}`, () => {
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

    it(`is deterministic for the same fixture input (${fixtureName})`, () => {
      const format = formatFromFixturePath(fixturePath);
      const run = () => {
        const d = parseFixture(readFileSync(fixturePath, 'utf8'), format);
        anonymizeOpenApiInPlace(d);
        return snapshotString(d, format);
      };

      assert.strictEqual(run(), run());
    });
  }
});
