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

export function fakerizeExamples(node) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const x of node) fakerizeExamples(x);
    return;
  }

  if (Object.hasOwn(node, 'example')) {
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
    } else if (typeof node.example === 'string') {
      node.example = faker.lorem.words({ min: 2, max: 5 });
    }
  }

  for (const [k, v] of Object.entries(node)) {
    if (k === 'example') continue;
    fakerizeExamples(v);
  }
}
