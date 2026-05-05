import { faker } from '@faker-js/faker';

/** Стабильные при `faker.seed(FAKER_SEED)` значения для `info` (`title` и `description` — в конце пайплайна). */
export function buildSyntheticOpenApiInfo(version) {
  const termsBase = faker.internet.url({ appendSlash: false });
  return {
    version,
    license: {
      name: faker.helpers.arrayElement([
        'MIT',
        'Apache-2.0',
        'BSD-3-Clause',
        'ISC',
        'Unlicense',
      ]),
    },
    contact: {
      name: faker.person.fullName(),
      email: faker.internet.email(),
      url: faker.internet.url({ appendSlash: false }),
    },
    termsOfService: `${termsBase}/terms`,
  };
}
