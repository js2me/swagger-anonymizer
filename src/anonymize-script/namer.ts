import { faker } from '@faker-js/faker';

function pascalChunk(word) {
  const w = String(word).replace(/[^a-zA-Z0-9]+/g, '');
  if (!w.length) return 'X';
  return w[0].toUpperCase() + w.slice(1).toLowerCase();
}

export function createUniqueNamers() {
  const used = new Set();

  function nextUnique(makeCandidate) {
    let id;
    let guard = 0;
    do {
      id = makeCandidate();
      guard++;
      if (guard > 400) {
        id = `Id${used.size}`;
        break;
      }
    } while (used.has(id));
    used.add(id);
    return id;
  }

  return {
    nextSchemaName: () =>
      nextUnique(() => {
        const adj = pascalChunk(faker.word.adjective());
        const noun = pascalChunk(faker.word.noun());
        const n = faker.number.int({ min: 1, max: 99 });
        const id = `Sch${adj}${noun}${n}`;
        return id.length > 56 ? id.slice(0, 56) : id;
      }),
    nextResponseName: () =>
      nextUnique(() => {
        const adj = pascalChunk(faker.word.adjective());
        const noun = pascalChunk(faker.word.noun());
        const n = faker.number.int({ min: 1, max: 99 });
        const id = `Res${adj}${noun}${n}`;
        return id.length > 56 ? id.slice(0, 56) : id;
      }),
    nextParameterBlockName: () =>
      nextUnique(() => {
        const adj = pascalChunk(faker.word.adjective());
        const noun = pascalChunk(faker.word.noun());
        const n = faker.number.int({ min: 1, max: 99 });
        const id = `Par${adj}${noun}${n}`;
        return id.length > 56 ? id.slice(0, 56) : id;
      }),
    nextSnakeProperty: () =>
      nextUnique(() => {
        const a = faker.word
          .adjective()
          .replace(/[^a-z]/gi, '')
          .toLowerCase();
        const n = faker.word
          .noun()
          .replace(/[^a-z]/gi, '')
          .toLowerCase();
        const k = faker.number.int({ min: 1, max: 999 });
        const tail = `${a}_${n}_${k}`.replace(/_+/g, '_');
        return tail.length > 48 ? tail.slice(0, 48) : tail;
      }),
  };
}
