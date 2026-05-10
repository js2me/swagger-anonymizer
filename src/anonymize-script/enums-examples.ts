import { faker } from '@faker-js/faker';

export function neutralizeEnumStrings(node) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const x of node) neutralizeEnumStrings(x);
    return;
  }
  for (const [k, v] of Object.entries(node)) {
    if (k === 'enum' && Array.isArray(v)) {
      node[k] = v.map((item, i) =>
        typeof item === 'string' ? `ev${i}` : item,
      );
    } else {
      neutralizeEnumStrings(v);
    }
  }
}

/**
 * Replaces every string leaf in an OpenAPI `example` payload (object, array, or
 * nested) so media-type examples like `{ error: "real API message" }` are
 * anonymized.
 */
function fakerizeExamplePayload(node) {
  if (node === null || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) {
      const x = node[i];
      if (typeof x === 'string') {
        node[i] = faker.lorem.words({ min: 2, max: 5 });
      } else if (x !== null && typeof x === 'object') {
        fakerizeExamplePayload(x);
      }
    }
    return;
  }
  for (const k of Object.keys(node)) {
    const v = node[k];
    if (typeof v === 'string') {
      node[k] = faker.lorem.words({ min: 2, max: 5 });
    } else if (v !== null && typeof v === 'object') {
      fakerizeExamplePayload(v);
    }
  }
}

/** OpenAPI Media Type Object: `examples` map → Example Object → `value`. */
function fakerizeExamplesMap(node) {
  const examples = node.examples;
  if (
    !examples ||
    typeof examples !== 'object' ||
    Array.isArray(examples)
  ) {
    return;
  }
  for (const ex of Object.values(examples)) {
    if (!ex || typeof ex !== 'object' || Array.isArray(ex)) continue;
    const exampleObj = ex as Record<string, unknown>;
    if (!Object.hasOwn(exampleObj, 'value')) continue;
    const val = exampleObj.value;
    if (val === null || val === undefined) continue;
    if (typeof val === 'string') {
      exampleObj.value = faker.lorem.words({ min: 2, max: 5 });
    } else if (typeof val === 'object') {
      fakerizeExamplePayload(val as object);
    }
  }
}

export function fakerizeExamples(node) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const x of node) fakerizeExamples(x);
    return;
  }

  fakerizeExamplesMap(node);

  if (Object.hasOwn(node, 'example')) {
    const ex = node.example;
    if (ex !== null && typeof ex === 'object') {
      fakerizeExamplePayload(ex);
    } else {
      const t = node.type;
      const fmt = node.format;

      if (t === 'string') {
        if (fmt === 'email') node.example = faker.internet.email();
        else if (fmt === 'date')
          node.example = faker.date.recent().toISOString().slice(0, 10);
        else if (fmt === 'date-time')
          node.example = faker.date.recent().toISOString();
        else if (fmt === 'uuid') node.example = faker.string.uuid();
        else if (fmt === 'uri' || fmt === 'url')
          node.example = faker.internet.url();
        else
          node.example = faker.lorem.words({ min: 2, max: 5 });
      } else if (t === 'integer') {
        node.example = faker.number.int({ min: 1, max: 50_000 });
      } else if (t === 'number') {
        node.example = faker.number.float({
          min: 1,
          max: 1000,
          fractionDigits: 2,
        });
      } else if (t === 'boolean') {
        node.example = faker.datatype.boolean();
      } else if (typeof ex === 'string') {
        node.example = faker.lorem.words({ min: 2, max: 5 });
      }
    }
  }

  for (const [k, v] of Object.entries(node)) {
    if (k === 'example') continue;
    fakerizeExamples(v);
  }
}
