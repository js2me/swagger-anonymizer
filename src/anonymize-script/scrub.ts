import { faker } from '@faker-js/faker';

import { FAKER_SEED_SCRUB } from './constants/seeds.js';

function scrubDescriptionsWalk(node) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const x of node) scrubDescriptionsWalk(x);
    return;
  }
  for (const [k, v] of Object.entries(node)) {
    if (
      k === 'description' &&
      typeof v === 'string' &&
      v.length > 0
    ) {
      node[k] = faker.lorem.sentence();
    } else if (k === 'title' && typeof v === 'string') {
      node[k] = faker.lorem.words({ min: 2, max: 5 });
    } else {
      scrubDescriptionsWalk(v);
    }
  }
}

/** Обходит дерево и подменяет строковые `description` / `title` на текст из faker (фиксированный поток). */
export function scrubDescriptions(node) {
  faker.seed(FAKER_SEED_SCRUB);
  scrubDescriptionsWalk(node);
}
