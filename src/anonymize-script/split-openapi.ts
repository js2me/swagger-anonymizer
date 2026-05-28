// @ts-nocheck
import fs from 'node:fs';
import path from 'node:path';

import { faker } from '@faker-js/faker';

import { anonymizeOpenApiInPlace } from './anonymize.js';
import { OPENAPI_HTTP_METHODS } from './constants/openapi.js';
import { FAKER_SEED, FAKER_SEED_LOCAL_SCHEMA_FILES } from './constants/seeds.js';
import { parseDocument, stringifyDocument } from './document-format.js';
import { createUniqueNamers } from './namer.js';

const SPEC_EXTENSIONS = new Set(['.yaml', '.yml', '.json']);

function isSpecFile(filePath) {
  return SPEC_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function isExternalRef(value) {
  return (
    typeof value === 'string' &&
    value.includes('#') &&
    !value.startsWith('#')
  );
}

function isRelativeFileRef(value) {
  return (
    typeof value === 'string' &&
    !value.startsWith('#') &&
    !/^[a-zA-Z][a-zA-Z+.-]*:\/\//.test(value)
  );
}

function parseFileRef(ref) {
  const hashIdx = ref.indexOf('#');
  if (hashIdx === -1) {
    return { filePart: ref, fragment: null };
  }
  return {
    filePart: ref.slice(0, hashIdx),
    fragment: ref.slice(hashIdx),
  };
}

/** First JSON-pointer segment after `#/` (handles `#/specifications` and `#/key`). */
function getFragmentKey(fragment) {
  if (!fragment || fragment === '#') return null;
  const body = fragment.startsWith('#/')
    ? fragment.slice(2)
    : fragment.startsWith('#')
      ? fragment.slice(1)
      : fragment;
  if (!body) return null;
  const seg = body.split('/').filter(Boolean)[0];
  return seg ?? null;
}

function normalizeEntryFileName(name) {
  return path.basename(name);
}

function entryFilePattern(entryFileName) {
  const escaped = entryFileName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^(?:\\.\\./|\\.\\/)?${escaped}(?:#|$)`);
}

function isOpenApiRootRef(ref, entryFileName) {
  return entryFilePattern(entryFileName).test(ref);
}

function openApiRootSchemaRefPattern(entryFileName) {
  const escaped = entryFileName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(
    `^(?:\\.\\./|\\.\\/)?${escaped}#/components/schemas/([^/]+)$`,
  );
}

function openApiRootParameterRefPattern(entryFileName) {
  const escaped = entryFileName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(
    `^(?:\\.\\./|\\.\\/)?${escaped}#/components/parameters/([^/]+)$`,
  );
}

function readSpecFile(absPath) {
  const raw = fs.readFileSync(absPath, 'utf8');
  return parseDocument(raw, absPath);
}

function writeSpecFile(absPath, doc) {
  const out = stringifyDocument(doc, absPath);
  fs.writeFileSync(absPath, out, 'utf8');
}

function resolveRefPath(fromDir, refPath) {
  return path.resolve(fromDir, refPath);
}

function relativeRef(fromDir, toAbsPath) {
  let rel = path.relative(fromDir, toAbsPath);
  if (!rel.startsWith('.')) rel = `./${rel}`;
  return rel.split(path.sep).join('/');
}

function lookupFragmentContent(doc, fragmentKey) {
  if (!fragmentKey || !doc || typeof doc !== 'object') return undefined;
  if (Object.prototype.hasOwnProperty.call(doc, fragmentKey)) {
    return doc[fragmentKey];
  }
  const slashKey = fragmentKey.startsWith('/')
    ? fragmentKey
    : `/${fragmentKey}`;
  if (Object.prototype.hasOwnProperty.call(doc, slashKey)) {
    return doc[slashKey];
  }
  return undefined;
}

function isInlinePathPlaceholder(pathItem) {
  if (!pathItem || typeof pathItem !== 'object' || Array.isArray(pathItem)) {
    return false;
  }
  if (typeof pathItem.$ref === 'string') return false;
  return !Object.keys(pathItem).some((k) => OPENAPI_HTTP_METHODS.includes(k));
}

function collectReachableSpecFiles(absPath, visited = new Set()) {
  if (visited.has(absPath)) return visited;
  visited.add(absPath);
  if (!fs.existsSync(absPath)) return visited;

  let doc;
  try {
    doc = readSpecFile(absPath);
  } catch {
    return visited;
  }

  walkRefs(
    doc,
    (ref, fromDir) => {
      const { filePart } = parseFileRef(ref);
      if (!filePart) return;
      const target = resolveRefPath(fromDir, filePart);
      if (isSpecFile(target) && fs.existsSync(target)) {
        collectReachableSpecFiles(target, visited);
      }
    },
    path.dirname(absPath),
  );

  return visited;
}

function walkRefs(node, onRef, fromDir) {
  if (node === null || node === undefined) return;
  if (Array.isArray(node)) {
    for (const v of node) walkRefs(v, onRef, fromDir);
    return;
  }
  if (typeof node !== 'object') return;
  for (const [k, v] of Object.entries(node)) {
    if (k === '$ref' && typeof v === 'string') {
      onRef(v, fromDir);
    } else {
      walkRefs(v, onRef, fromDir);
    }
  }
}

function rewriteOpenApiComponentRefs(node, entryFileName) {
  transformRefsInTree(node, (ref) =>
    rewriteOpenApiComponentRefsValue(ref, entryFileName),
  );
}

function resolveRelativeSchemaRefs(
  node,
  fromDir,
  absFileToSchemaName,
  entryFileName,
  ctx,
) {
  transformRefsInTree(node, (ref) => {
    if (isOpenApiRootRef(ref, entryFileName)) {
      const schemaMatch = ref.match(openApiRootSchemaRefPattern(entryFileName));
      if (schemaMatch) {
        ctx.openApiRefSchemaNames.add(schemaMatch[1]);
      }
      return rewriteOpenApiComponentRefsValue(ref, entryFileName);
    }
    if (isRelativeFileRef(ref) && !ref.includes('#')) {
      const abs = resolveRefPath(fromDir, ref);
      const schemaName = absFileToSchemaName.get(abs);
      if (schemaName) {
        const internal = `#/components/schemas/${schemaName}`;
        ctx.siblingRefRestore.set(internal, ref);
        return internal;
      }
    }
    return ref;
  });
}

function rewriteOpenApiComponentRefsValue(ref, entryFileName) {
  const schemaMatch = ref.match(openApiRootSchemaRefPattern(entryFileName));
  if (schemaMatch) {
    return `#/components/schemas/${schemaMatch[1]}`;
  }
  const paramMatch = ref.match(openApiRootParameterRefPattern(entryFileName));
  if (paramMatch) {
    return `#/components/parameters/${paramMatch[1]}`;
  }
  return ref;
}

function transformRefsInTree(node, transform) {
  if (node === null || node === undefined) return;
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) {
      if (typeof node[i] === 'string') {
        node[i] = transform(node[i]);
      } else {
        transformRefsInTree(node[i], transform);
      }
    }
    return;
  }
  if (typeof node !== 'object') return;
  for (const k of Object.keys(node)) {
    const v = node[k];
    if (k === '$ref' && typeof v === 'string') {
      node[k] = transform(v);
    } else {
      transformRefsInTree(v, transform);
    }
  }
}

function collectOpenApiRefSchemaNames(node, entryFileName, out) {
  walkRefs(node, (ref) => {
    const m = ref.match(openApiRootSchemaRefPattern(entryFileName));
    if (m) out.add(m[1]);
  });
}

function loadExternalSchemaContent(absPath) {
  const parsed = readSpecFile(absPath);
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    if (parsed.$ref) {
      throw new Error(`Expected schema body in ${absPath}, got $ref wrapper`);
    }
    return structuredClone(parsed);
  }
  return structuredClone(parsed);
}

function discoverOrphanSchemas(
  absPath,
  absFileToSchemaName,
  schemaSources,
  entryFileName,
  rootDir,
) {
  const queue = [absPath];
  const seen = new Set([absPath]);

  while (queue.length > 0) {
    const current = queue.shift();
    let content;
    try {
      content = readSpecFile(current);
    } catch {
      continue;
    }
    const dir = path.dirname(current);

    walkRefs(content, (ref) => {
      if (isOpenApiRootRef(ref, entryFileName)) return;
      const { filePart, fragment } = parseFileRef(ref);
      if (!filePart || fragment) return;
      if (!isRelativeFileRef(ref)) return;

      const targetAbs = resolveRefPath(dir, filePart);
      if (!isSpecFile(targetAbs) || !fs.existsSync(targetAbs)) return;
      if (seen.has(targetAbs)) return;

      seen.add(targetAbs);
      if (!absFileToSchemaName.has(targetAbs)) {
        const orphanName = path.basename(
          targetAbs,
          path.extname(targetAbs),
        );
        absFileToSchemaName.set(targetAbs, orphanName);
        schemaSources.push({
          oldName: orphanName,
          absPath: targetAbs,
          entryRef: relativeRef(rootDir, targetAbs),
          isOrphan: true,
          openApiRefSchemaNames: new Set(),
          siblingRefRestore: new Map(),
        });
      }
      queue.push(targetAbs);
    }, dir);
  }
}

function lookupFragmentKeyInDoc(doc, fragmentKey) {
  if (Object.prototype.hasOwnProperty.call(doc, fragmentKey)) {
    return fragmentKey;
  }
  const slashKey = fragmentKey.startsWith('/')
    ? fragmentKey
    : `/${fragmentKey}`;
  if (Object.prototype.hasOwnProperty.call(doc, slashKey)) {
    return slashKey;
  }
  return fragmentKey;
}

function isLocalResolvableSpecRef(ref, fromDir) {
  if (!isRelativeFileRef(ref)) return false;
  const { filePart } = parseFileRef(ref);
  if (!filePart) return false;
  const abs = resolveRefPath(fromDir, filePart);
  return isSpecFile(abs) && fs.existsSync(abs);
}

/** oldAbs → newAbs для локальных файлов схем (basename анонимизируется, каталог сохраняется). */
function buildLocalSchemaFilePathMap(schemaSources, names) {
  const map = new Map();
  const sorted = [...schemaSources].sort((a, b) =>
    a.absPath.localeCompare(b.absPath),
  );
  for (const source of sorted) {
    if (!fs.existsSync(source.absPath)) continue;
    const dir = path.dirname(source.absPath);
    const ext = path.extname(source.absPath);
    map.set(
      source.absPath,
      path.join(dir, `${names.nextExternalPathSegment()}${ext}`),
    );
  }
  return map;
}

function rewriteLocalSchemaFileRef(ref, fromDir, localSchemaPathMap) {
  if (!localSchemaPathMap || localSchemaPathMap.size === 0) return ref;
  if (!isRelativeFileRef(ref)) return ref;
  const { filePart, fragment } = parseFileRef(ref);
  const abs = resolveRefPath(fromDir, filePart);
  const newAbs = localSchemaPathMap.get(abs);
  if (!newAbs) return ref;
  const newFilePart = relativeRef(fromDir, newAbs);
  return fragment ? `${newFilePart}${fragment}` : newFilePart;
}

function rewriteLocalSchemaFileRefs(node, fromDir, localSchemaPathMap) {
  if (!localSchemaPathMap || localSchemaPathMap.size === 0) return;
  transformRefsInTree(node, (ref) =>
    rewriteLocalSchemaFileRef(ref, fromDir, localSchemaPathMap),
  );
}

function convertDefinitionSchemaRefs(
  node,
  ctx,
  schemaMap,
  absFileToSchemaName,
  openApiRootPrefix,
  fromDir,
  localSchemaPathMap,
  anonymizeLocalSchemaFiles,
) {
  const reverse = reverseMap(schemaMap);
  transformRefsInTree(node, (ref) => {
    if (!ref.startsWith('#/components/schemas/')) return ref;
    const newName = ref.slice('#/components/schemas/'.length);
    const oldName = reverse[newName] ?? newName;

    if (ctx.openApiRefSchemaNames.has(oldName)) {
      return `${openApiRootPrefix}#/components/schemas/${newName}`;
    }

    const restored = ctx.siblingRefRestore.get(
      `#/components/schemas/${oldName}`,
    );
    if (restored) {
      return anonymizeLocalSchemaFiles
        ? rewriteLocalSchemaFileRef(restored, fromDir, localSchemaPathMap)
        : restored;
    }

    for (const [abs, schemaName] of absFileToSchemaName.entries()) {
      const mapped = schemaMap[schemaName] ?? schemaName;
      if (mapped === newName && abs !== ctx.absPath) {
        const targetAbs = localSchemaPathMap?.get(abs) ?? abs;
        const siblingRef = relativeRef(fromDir, targetAbs);
        return anonymizeLocalSchemaFiles
          ? rewriteLocalSchemaFileRef(siblingRef, fromDir, localSchemaPathMap)
          : siblingRef;
      }
    }

    return ref;
  });
}

function convertInternalComponentRefsToOpenApi(node, openApiRootPrefix) {
  transformRefsInTree(node, (ref) => {
    if (ref.startsWith('#/components/schemas/')) {
      return `${openApiRootPrefix}${ref}`;
    }
    if (ref.startsWith('#/components/parameters/')) {
      return `${openApiRootPrefix}${ref}`;
    }
    return ref;
  });
}

function reverseMap(map) {
  const out = {};
  for (const [oldName, newName] of Object.entries(map)) {
    out[newName] = oldName;
  }
  return out;
}

function buildSchemaMapFromDoc(beforeKeys, afterDoc) {
  const afterKeys = Object.keys(afterDoc.components?.schemas ?? {});
  const map = {};
  for (let i = 0; i < beforeKeys.length; i++) {
    map[beforeKeys[i]] = afterKeys[i];
  }
  return map;
}

function buildParameterMapFromDoc(beforeKeys, afterDoc) {
  const afterKeys = Object.keys(afterDoc.components?.parameters ?? {});
  const map = {};
  for (let i = 0; i < beforeKeys.length; i++) {
    map[beforeKeys[i]] = afterKeys[i];
  }
  return map;
}

/**
 * Bundle → anonymize → unbundle для split OpenAPI specs.
 */
export function anonymizeSplitOpenApi(options) {
  const entryPath = path.resolve(options.entryPath);
  const rootDir = path.resolve(options.rootDir ?? path.dirname(entryPath));
  const preserveOpenApiRefs = options.preserveOpenApiRefs !== false;
  const anonymizeLocalSchemaFiles = options.anonymizeLocalSchemaFiles !== false;
  const entryFileName = normalizeEntryFileName(
    options.entryFileName ?? path.basename(entryPath),
  );

  faker.seed(FAKER_SEED);
  const entryPathNamers = createUniqueNamers();
  const anonymizedEntryFileName = preserveOpenApiRefs
    ? entryFileName
    : `${entryPathNamers.nextExternalPathSegment()}${path.extname(entryFileName)}`;
  const openApiRootPrefix = `../${anonymizedEntryFileName}`;

  const entryDoc = readSpecFile(entryPath);
  const entryDir = path.dirname(entryPath);

  const bundled = structuredClone(entryDoc);
  bundled.components ??= {};
  bundled.components.schemas ??= {};
  bundled.components.parameters ??= {};
  bundled.paths ??= {};

  const schemaSources = [];
  const pathSources = [];
  const inlinePaths = {};
  const absFileToSchemaName = new Map();

  for (const [schemaName, schemaVal] of Object.entries(
    bundled.components.schemas,
  )) {
    if (
      schemaVal &&
      typeof schemaVal === 'object' &&
      typeof schemaVal.$ref === 'string' &&
      isRelativeFileRef(schemaVal.$ref)
    ) {
      const { filePart } = parseFileRef(schemaVal.$ref);
      const absPath = resolveRefPath(entryDir, filePart);
      absFileToSchemaName.set(absPath, schemaName);
      const content = loadExternalSchemaContent(absPath);
      const ctx = {
        absPath,
        openApiRefSchemaNames: new Set(),
        siblingRefRestore: new Map(),
      };
      collectOpenApiRefSchemaNames(content, entryFileName, ctx.openApiRefSchemaNames);
      resolveRelativeSchemaRefs(
        content,
        path.dirname(absPath),
        absFileToSchemaName,
        entryFileName,
        ctx,
      );
      rewriteOpenApiComponentRefs(content, entryFileName);
      bundled.components.schemas[schemaName] = content;
      schemaSources.push({
        oldName: schemaName,
        absPath,
        entryRef: schemaVal.$ref,
        isOrphan: false,
        openApiRefSchemaNames: ctx.openApiRefSchemaNames,
        siblingRefRestore: ctx.siblingRefRestore,
      });
      discoverOrphanSchemas(
        absPath,
        absFileToSchemaName,
        schemaSources,
        entryFileName,
        rootDir,
      );
    }
  }

  for (const orphanSource of schemaSources.filter((s) => s.isOrphan)) {
    if (bundled.components.schemas[orphanSource.oldName]) continue;
    const content = loadExternalSchemaContent(orphanSource.absPath);
    const ctx = {
      absPath: orphanSource.absPath,
      openApiRefSchemaNames: orphanSource.openApiRefSchemaNames,
      siblingRefRestore: orphanSource.siblingRefRestore,
    };
    collectOpenApiRefSchemaNames(content, entryFileName, ctx.openApiRefSchemaNames);
    resolveRelativeSchemaRefs(
      content,
      path.dirname(orphanSource.absPath),
      absFileToSchemaName,
      entryFileName,
      ctx,
    );
    rewriteOpenApiComponentRefs(content, entryFileName);
    bundled.components.schemas[orphanSource.oldName] = content;
  }

  for (const [pathKey, pathVal] of Object.entries(bundled.paths)) {
    if (isInlinePathPlaceholder(pathVal)) {
      inlinePaths[pathKey] = structuredClone(pathVal);
      delete bundled.paths[pathKey];
      continue;
    }
    if (
      pathVal &&
      typeof pathVal === 'object' &&
      typeof pathVal.$ref === 'string' &&
      isExternalRef(pathVal.$ref)
    ) {
      const { filePart, fragment } = parseFileRef(pathVal.$ref);
      const absPath = resolveRefPath(entryDir, filePart);
      const pathFile = readSpecFile(absPath);
      const fragmentKey = getFragmentKey(fragment);
      const pathItem = lookupFragmentContent(pathFile, fragmentKey);
      if (!pathItem) {
        throw new Error(
          `Cannot resolve path $ref ${pathVal.$ref} (fragment key: ${fragmentKey})`,
        );
      }
      const cloned = structuredClone(pathItem);
      rewriteOpenApiComponentRefs(cloned, entryFileName);
      bundled.paths[pathKey] = cloned;
      pathSources.push({
        originalPathKey: pathKey,
        entryRef: pathVal.$ref,
        absPath,
        fragmentKey,
      });
    }
  }

  const schemaKeysBefore = Object.keys(bundled.components.schemas ?? {}).sort(
    (a, b) => a.localeCompare(b),
  );
  const paramKeysBefore = Object.keys(
    bundled.components.parameters ?? {},
  ).sort((a, b) => a.localeCompare(b));

  const maps = anonymizeOpenApiInPlace(bundled, {
    anonymizeServerUrls: options.anonymizeServerUrls === true,
  });

  const schemaMap = buildSchemaMapFromDoc(schemaKeysBefore, bundled);
  const parameterMap = buildParameterMapFromDoc(paramKeysBefore, bundled);

  faker.seed(FAKER_SEED_LOCAL_SCHEMA_FILES);
  const localFileNamers = createUniqueNamers();
  const localSchemaPathMap = anonymizeLocalSchemaFiles
    ? buildLocalSchemaFilePathMap(schemaSources, localFileNamers)
    : new Map();

  const schemaFileMap = {};
  for (const [oldAbs, newAbs] of localSchemaPathMap.entries()) {
    schemaFileMap[oldAbs] = newAbs;
  }

  const filesWritten = [];
  const schemaPathsToDelete = [];

  const newEntry = structuredClone(bundled);
  newEntry.paths = {};
  newEntry.components ??= {};
  newEntry.components.schemas = {};

  for (const source of schemaSources) {
    const newName = schemaMap[source.oldName] ?? source.oldName;
    const schemaContent = structuredClone(
      bundled.components.schemas[newName],
    );
    convertDefinitionSchemaRefs(
      schemaContent,
      source,
      schemaMap,
      absFileToSchemaName,
      openApiRootPrefix,
      path.dirname(source.absPath),
      localSchemaPathMap,
      anonymizeLocalSchemaFiles,
    );
    if (anonymizeLocalSchemaFiles) {
      rewriteLocalSchemaFileRefs(
        schemaContent,
        path.dirname(source.absPath),
        localSchemaPathMap,
      );
    }
    const targetAbs = localSchemaPathMap.get(source.absPath) ?? source.absPath;
    writeSpecFile(targetAbs, schemaContent);
    filesWritten.push(targetAbs);
    if (targetAbs !== source.absPath) {
      schemaPathsToDelete.push(source.absPath);
    }

    if (!source.isOrphan) {
      newEntry.components.schemas[newName] = {
        $ref: anonymizeLocalSchemaFiles
          ? relativeRef(entryDir, targetAbs)
          : source.entryRef,
      };
    }
  }

  const externalSchemaNames = new Set(
    schemaSources.map((s) => schemaMap[s.oldName] ?? s.oldName),
  );
  for (const [name, val] of Object.entries(bundled.components.schemas ?? {})) {
    if (!externalSchemaNames.has(name)) {
      newEntry.components.schemas[name] = val;
    }
  }

  for (const source of pathSources) {
    const newPathKey = maps.pathKeyMap[source.originalPathKey];
    newEntry.paths[newPathKey] = { $ref: source.entryRef };

    const pathFile = readSpecFile(source.absPath);
    const anonymizedPathItem = structuredClone(bundled.paths[newPathKey]);
    convertInternalComponentRefsToOpenApi(anonymizedPathItem, openApiRootPrefix);

    const existingKey = lookupFragmentKeyInDoc(pathFile, source.fragmentKey);
    pathFile[existingKey] = anonymizedPathItem;

    writeSpecFile(source.absPath, pathFile);
    if (!filesWritten.includes(source.absPath)) {
      filesWritten.push(source.absPath);
    }
  }

  const handledPathKeys = new Set(
    pathSources.map((s) => maps.pathKeyMap[s.originalPathKey]),
  );
  for (const [pathKey, pathVal] of Object.entries(bundled.paths ?? {})) {
    if (!handledPathKeys.has(pathKey)) {
      newEntry.paths[pathKey] = pathVal;
    }
  }

  for (const [inlineKey, inlineVal] of Object.entries(inlinePaths)) {
    newEntry.paths[inlineKey] = inlineVal;
  }

  for (const oldAbs of schemaPathsToDelete) {
    if (fs.existsSync(oldAbs)) {
      fs.unlinkSync(oldAbs);
    }
  }

  writeSpecFile(entryPath, newEntry);
  if (!filesWritten.includes(entryPath)) {
    filesWritten.unshift(entryPath);
  }

  const reachable = collectReachableSpecFiles(entryPath);
  for (const abs of reachable) {
    if (filesWritten.includes(abs)) continue;
    if (!isSpecFile(abs)) continue;
    try {
      const orphanDoc = readSpecFile(abs);
      if (orphanDoc && typeof orphanDoc === 'object') {
        anonymizeOpenApiInPlace(orphanDoc, {
          anonymizeServerUrls: options.anonymizeServerUrls === true,
        });
        writeSpecFile(abs, orphanDoc);
        filesWritten.push(abs);
      }
    } catch {
      // skip unreadable fragments
    }
  }

  return {
    filesWritten,
    schemaMap,
    parameterMap,
    schemaFileMap,
  };
}

export {
  parseFileRef,
  getFragmentKey,
  isOpenApiRootRef,
  isInlinePathPlaceholder,
  isLocalResolvableSpecRef,
  collectReachableSpecFiles,
  rewriteLocalSchemaFileRef,
};
