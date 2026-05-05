// @ts-nocheck
import { faker } from '@faker-js/faker';

import {
  collectComponentParameterNames,
  collectOperationIds,
  collectParameterNames,
  collectPathTemplateParams,
  collectPropertyKeys,
  collectTags,
} from './collect.js';
import { OPENAPI_STRUCTURE_KEYS } from './constants/openapi.js';
import {
  FAKER_SEED,
  FAKER_SEED_EXAMPLES,
  FAKER_SEED_INFO_TAIL,
  FAKER_SEED_TAG_DESCRIPTIONS,
} from './constants/seeds.js';
import { fakerizeExamples, neutralizeEnumStrings } from './enums-examples.js';
import { createUniqueNamers } from './namer.js';
import { deepReplaceRefs, renameTopLevelMap } from './refs.js';
import {
  anonymizePathKeys,
  applyComponentParameterRename,
  applyParameterRename,
  renameObjectKeys,
  replaceOperationIds,
  replaceTagsStrings,
} from './rename-ops.js';
import { scrubDescriptions } from './scrub.js';
import {
  anonymizeApiKeySchemeNames,
  rewriteSecurityRefs,
} from './security.js';
import { buildSyntheticOpenApiInfo } from './synthetic-info.js';

/**
 * Мутирует переданный объект документа OpenAPI/Swagger (один корневой объект).
 */
export function anonymizeOpenApiInPlace(doc) {
  faker.seed(FAKER_SEED);
  const prevVersion = doc.info?.version ?? '0.0.0';
  const syntheticInfo = buildSyntheticOpenApiInfo(prevVersion);
  doc.info = structuredClone(syntheticInfo);

  const names = createUniqueNamers();

  const comps = doc.components ?? (doc.components = {});
  const schemaMap = {};
  const responseMap = {};
  const paramMap = {};
  const secRename = {};

  if (comps.schemas)
    renameTopLevelMap(comps.schemas, schemaMap, names.nextSchemaName);
  if (comps.responses)
    renameTopLevelMap(comps.responses, responseMap, names.nextResponseName);
  if (comps.parameters)
    renameTopLevelMap(
      comps.parameters,
      paramMap,
      names.nextParameterBlockName,
    );

  deepReplaceRefs(doc, schemaMap, responseMap, paramMap);

  const sec = comps.securitySchemes;
  if (sec && typeof sec === 'object') {
    const sk = Object.keys(sec).sort((a, b) => a.localeCompare(b));
    sk.forEach((k, i) => {
      secRename[k] = `sec${i + 1}`;
    });
    const nextSec = {};
    for (const k of sk) {
      nextSec[secRename[k]] = sec[k];
      delete sec[k];
    }
    Object.assign(sec, nextSec);
    anonymizeApiKeySchemeNames(sec);
  }

  rewriteSecurityRefs(doc, secRename);

  const propKeys = new Set();
  collectPropertyKeys(doc, propKeys);
  collectPathTemplateParams(doc.paths, propKeys);
  collectParameterNames(doc.paths, propKeys);
  collectComponentParameterNames(comps, propKeys);

  const skipProps = new Set([
    ...OPENAPI_STRUCTURE_KEYS,
    '$ref',
    'additionalProperties',
  ]);

  const sortedProps = [...propKeys]
    .filter((k) => !skipProps.has(k))
    .sort((a, b) => a.localeCompare(b));

  const propRename = {};
  for (const k of sortedProps) {
    propRename[k] = names.nextSnakeProperty();
  }

  renameObjectKeys(doc, propRename);
  applyParameterRename(doc.paths, propRename);
  applyComponentParameterRename(comps, propRename);
  anonymizePathKeys(doc.paths, propRename);

  const opIds = new Set();
  collectOperationIds(doc.paths, opIds);
  const opSorted = [...opIds].sort((a, b) => a.localeCompare(b));
  const opMap = {};
  opSorted.forEach((id, i) => {
    opMap[id] = `op${String(i + 1).padStart(4, '0')}`;
  });
  replaceOperationIds(doc.paths, opMap);

  const tagSet = new Set();
  collectTags(doc.paths, doc.tags, tagSet);
  const tagSorted = [...tagSet].sort((a, b) => a.localeCompare(b));
  const tagMap = {};
  tagSorted.forEach((t, i) => {
    tagMap[t] = `tg${String(i + 1).padStart(2, '0')}`;
  });
  replaceTagsStrings(doc, tagMap);

  if (Array.isArray(doc.tags)) {
    for (const t of doc.tags) {
      if (t && typeof t === 'object') {
        if (typeof t.name === 'string') {
          const nn = tagMap[t.name];
          if (nn) t.name = nn;
        }
      }
    }
  }

  neutralizeEnumStrings(doc);
  faker.seed(FAKER_SEED_EXAMPLES);
  fakerizeExamples(doc);
  scrubDescriptions(doc);
  doc.info = structuredClone(syntheticInfo);
  faker.seed(FAKER_SEED_INFO_TAIL);
  doc.info.title = `${faker.company.name()} API`;
  doc.info.description = faker.lorem.paragraph({ min: 2, max: 4 });

  faker.seed(FAKER_SEED_TAG_DESCRIPTIONS);
  if (Array.isArray(doc.tags)) {
    for (const t of doc.tags) {
      if (t && typeof t === 'object' && typeof t.description === 'string') {
        t.description = faker.lorem.sentence();
      }
    }
  }
}
