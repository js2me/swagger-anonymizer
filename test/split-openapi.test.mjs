import assert from 'node:assert';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import YAML from 'yaml';

import { anonymizeSplitOpenApi } from '../dist/anonymize-script/split-openapi.js';
import {
  getFragmentKey,
  isInlinePathPlaceholder,
  isLocalResolvableSpecRef,
  isOpenApiRootRef,
  parseFileRef,
  rewriteLocalSchemaFileRef,
} from '../dist/anonymize-script/split-openapi.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SPLIT_FIXTURE = join(__dirname, 'fixtures', 'split-openapi');
const SNAPSHOT_DIR = join(__dirname, 'snapshots', 'split-openapi');
const UPDATE_SNAPSHOT = process.env.UPDATE_SNAPSHOT === '1';

function listFilesRecursive(dir, base = dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      out.push(...listFilesRecursive(full, base));
    } else {
      out.push(relative(base, full));
    }
  }
  return out.sort();
}

function copyFixtureToTemp() {
  const tempRoot = mkdtempSync(join(tmpdir(), 'split-openapi-'));
  cpSync(SPLIT_FIXTURE, tempRoot, { recursive: true });
  return tempRoot;
}

function readYaml(relPath, root) {
  return YAML.parse(readFileSync(join(root, relPath), 'utf8'));
}

function collectRefs(node, out = []) {
  if (node === null || typeof node !== 'object') return out;
  if (Array.isArray(node)) {
    for (const v of node) collectRefs(v, out);
    return out;
  }
  if (typeof node.$ref === 'string') out.push(node.$ref);
  for (const v of Object.values(node)) collectRefs(v, out);
  return out;
}

function snapshotTree(tempRoot) {
  const files = listFilesRecursive(tempRoot);
  const tree = {};
  for (const rel of files) {
    tree[rel] = readFileSync(join(tempRoot, rel), 'utf8');
  }
  return tree;
}

function assertSnapshotTree(tempRoot) {
  const actual = snapshotTree(tempRoot);
  const snapshotPath = join(SNAPSHOT_DIR, 'anonymized-tree.json');
  const serialized = `${JSON.stringify(actual, null, 2)}\n`;

  if (UPDATE_SNAPSHOT) {
    mkdirSync(dirname(snapshotPath), { recursive: true });
    writeFileSync(snapshotPath, serialized, 'utf8');
    return;
  }

  let expected;
  try {
    expected = JSON.parse(readFileSync(snapshotPath, 'utf8'));
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      assert.fail(
        `Missing snapshot at ${snapshotPath}. Run: UPDATE_SNAPSHOT=1 pnpm test`,
      );
    }
    throw err;
  }

  assert.deepStrictEqual(actual, expected);
}

describe('split-openapi helpers', () => {
  it('parseFileRef splits file and fragment', () => {
    assert.deepStrictEqual(parseFileRef('paths/foo.yaml#/specifications'), {
      filePart: 'paths/foo.yaml',
      fragment: '#/specifications',
    });
  });

  it('getFragmentKey reads first segment after #/', () => {
    assert.strictEqual(getFragmentKey('#/specifications'), 'specifications');
    assert.strictEqual(getFragmentKey('#/key'), 'key');
  });

  it('isOpenApiRootRef matches entry filename variants', () => {
    assert.ok(isOpenApiRootRef('../openapi.yaml#/components/schemas/X', 'openapi.yaml'));
    assert.ok(isOpenApiRootRef('./openapi.yaml#/components/parameters/Y', 'openapi.yaml'));
    assert.ok(!isOpenApiRootRef('./sch-entity-03.yaml', 'openapi.yaml'));
  });

  it('isInlinePathPlaceholder detects empty path stubs', () => {
    assert.strictEqual(isInlinePathPlaceholder({}), true);
    assert.strictEqual(
      isInlinePathPlaceholder({ get: { responses: { '200': { description: 'ok' } } } }),
      false,
    );
  });

  it('rewriteLocalSchemaFileRef skips remote refs', () => {
    const map = new Map([
      ['/tmp/definitions/sch-build-02.yaml', '/tmp/definitions/abc12.yaml'],
    ]);
    assert.strictEqual(
      rewriteLocalSchemaFileRef(
        'https://vendor.example/schemas/Foo.yaml#/components/schemas/X',
        '/tmp/definitions',
        map,
      ),
      'https://vendor.example/schemas/Foo.yaml#/components/schemas/X',
    );
    assert.strictEqual(
      isLocalResolvableSpecRef('https://vendor.example/schemas/Foo.yaml', '/tmp'),
      false,
    );
  });
});

describe('anonymizeSplitOpenApi', () => {
  it('anonymizes split fixture with preserved openapi-root and sibling refs', () => {
    const tempRoot = copyFixtureToTemp();
    try {
      const entryPath = join(tempRoot, 'openapi.yaml');
      const result = anonymizeSplitOpenApi({
        entryPath,
        rootDir: tempRoot,
        anonymizeServerUrls: true,
      });

      assert.ok(result.filesWritten.includes(entryPath));
      assert.ok(result.schemaMap.ModelPayloadA.startsWith('Sch'));
      assert.ok(result.schemaMap.ModelBundleB.startsWith('Sch'));
      assert.ok(result.parameterMap.ParamLookupA.startsWith('Par'));
      assert.strictEqual(Object.keys(result.schemaFileMap).length, 4);

      const entry = readYaml('openapi.yaml', tempRoot);
      assert.ok(entry.paths['/audit']);
      assert.strictEqual(Object.keys(entry.paths['/audit']).length, 0);

      const pathRefEntry = Object.entries(entry.paths).find(([, v]) => v?.$ref);
      assert.ok(pathRefEntry);
      assert.match(pathRefEntry[1].$ref, /^paths\/path-r1\.yaml#\/segment$/);

      const buildOldAbs = Object.keys(result.schemaFileMap).find((p) =>
        p.endsWith(`${join('definitions', 'sch-build-02.yaml')}`),
      );
      const buildSpecPath = result.schemaFileMap[buildOldAbs];
      assert.ok(buildSpecPath);
      assert.ok(!existsSync(join(tempRoot, 'definitions/sch-build-02.yaml')));

      const buildSpec = YAML.parse(readFileSync(buildSpecPath, 'utf8'));
      const buildRefs = collectRefs(buildSpec);
      assert.ok(
        buildRefs.some(
          (r) =>
            r.startsWith('../openapi.yaml#/components/schemas/Sch') &&
            !r.includes('.invalid'),
        ),
        `expected openapi-root schema ref, got: ${buildRefs.join(', ')}`,
      );
      assert.ok(
        buildRefs.some((r) => /^\.\/[a-z]+\d+\.yaml$/.test(r)),
        `expected anonymized local sibling ref, got: ${buildRefs.join(', ')}`,
      );
      assert.ok(
        buildRefs.every(
          (r) =>
            !r.includes('sch-build-02') &&
            !r.includes('sch-entity-03') &&
            !r.includes('sch-content-01'),
        ),
      );

      for (const oldAbs of Object.keys(result.schemaFileMap)) {
        assert.ok(!existsSync(oldAbs), `old schema file should be removed: ${oldAbs}`);
      }

      for (const newAbs of Object.values(result.schemaFileMap)) {
        assert.ok(existsSync(newAbs), `renamed schema file missing: ${newAbs}`);
      }

      const pathFile = readYaml('paths/path-r1.yaml', tempRoot);
      assert.ok(pathFile.segment?.get);
      const pathRefs = collectRefs(pathFile);
      assert.ok(
        pathRefs.every((r) => !r.includes('.invalid')),
        `unexpected anonymized file paths in path refs: ${pathRefs.join(', ')}`,
      );
      assert.ok(
        pathRefs.some((r) => r.startsWith('../openapi.yaml#/components/schemas/Sch')),
      );
      assert.ok(
        pathRefs.some((r) => r.startsWith('../openapi.yaml#/components/parameters/Par')),
      );

      assert.strictEqual(entry.servers[0].url.startsWith('https://api.example.invalid'), true);
      assert.strictEqual(entry.servers[1].url, 'http://localhost:8080');

      assertSnapshotTree(tempRoot);
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('is deterministic for split fixture', () => {
    const run = () => {
      const tempRoot = copyFixtureToTemp();
      anonymizeSplitOpenApi({ entryPath: join(tempRoot, 'openapi.yaml'), rootDir: tempRoot });
      const tree = snapshotTree(tempRoot);
      rmSync(tempRoot, { recursive: true, force: true });
      return tree;
    };
    assert.deepStrictEqual(run(), run());
  });

  it('anonymizes orphan local schema reachable via sibling refs', () => {
    const tempRoot = copyFixtureToTemp();
    try {
      const result = anonymizeSplitOpenApi({
        entryPath: join(tempRoot, 'openapi.yaml'),
        rootDir: tempRoot,
      });
      const sidecarOldAbs = Object.keys(result.schemaFileMap).find((p) =>
        p.endsWith(`${join('definitions', 'sch-sidecar-04.yaml')}`),
      );
      const sidecarAbs = result.schemaFileMap[sidecarOldAbs];
      assert.ok(sidecarAbs);
      assert.ok(!existsSync(sidecarOldAbs));
      const sidecar = YAML.parse(readFileSync(sidecarAbs, 'utf8'));
      assert.ok(sidecar.properties);
      const propKeys = Object.keys(sidecar.properties);
      assert.ok(propKeys.every((k) => !/retry_limit|enabled/.test(k)));
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('preserves local schema filenames when anonymizeLocalSchemaFiles is false', () => {
    const tempRoot = copyFixtureToTemp();
    try {
      const result = anonymizeSplitOpenApi({
        entryPath: join(tempRoot, 'openapi.yaml'),
        rootDir: tempRoot,
        anonymizeLocalSchemaFiles: false,
      });
      assert.strictEqual(Object.keys(result.schemaFileMap).length, 0);
      assert.ok(existsSync(join(tempRoot, 'definitions/sch-build-02.yaml')));
      assert.ok(existsSync(join(tempRoot, 'definitions/sch-sidecar-04.yaml')));
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });
});
