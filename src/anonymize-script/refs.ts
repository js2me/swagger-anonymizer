// @ts-nocheck
export function renameTopLevelMap(section, map, nextName) {
  if (!section || typeof section !== 'object') return;
  const keys = Object.keys(section).sort((a, b) => a.localeCompare(b));
  for (const k of keys) {
    map[k] = nextName();
  }
  const next = {};
  for (const k of keys) {
    next[map[k]] = section[k];
    delete section[k];
  }
  Object.assign(section, next);
}

export function sortMapEntriesLongestFirst(map) {
  return Object.entries(map).sort((a, b) => b[0].length - a[0].length);
}

const ABSOLUTE_URI_RE = /^[a-zA-Z][a-zA-Z+.-]*:\/\//;

function isExternalRefString(value) {
  return (
    typeof value === 'string' &&
    value.includes('#') &&
    !value.startsWith('#')
  );
}

function collectExternalRefStrings(node, out) {
  if (node === null || node === undefined) return;
  if (Array.isArray(node)) {
    for (const v of node) collectExternalRefStrings(v, out);
    return;
  }
  if (typeof node === 'object') {
    for (const k of Object.keys(node)) {
      const v = node[k];
      if (k === '$ref' && isExternalRefString(v)) {
        out.add(v);
      } else {
        collectExternalRefStrings(v, out);
      }
    }
  }
}

/** Сегменты пути без ведущего «/» (нап. ['v1','api.yaml']) — та же логика имён, что у относительных путей. */
function anonymizeUrlStylePathParts(parts, names) {
  if (parts.length === 0) return '/';
  const out = [];
  for (let i = 0; i < parts.length; i++) {
    const seg = parts[i];
    const isLast = i === parts.length - 1;
    if (isLast) {
      const m = seg.match(/^(.+)(\.(yaml|yml|json))$/i);
      if (m) {
        out.push(`${names.nextExternalPathSegment()}${m[2]}`);
      } else {
        out.push(names.nextExternalPathSegment());
      }
    } else {
      out.push(names.nextExternalPathSegment());
    }
  }
  return `/${out.join('/')}`;
}

const TRANSFORMABLE_ABSOLUTE_SCHEMES = new Set([
  'http',
  'https',
  'ftp',
  'file',
]);

/**
 * http(s)://, ftp:// — маскирует хост и путь; порт не переносится.
 * file:// — локальный (без host): только путь; file://host/... — как ftp по хосту.
 */
function transformAbsoluteUri(filePart, names) {
  let u;
  try {
    u = new URL(filePart);
  } catch {
    return filePart;
  }
  const scheme = u.protocol.replace(/:$/, '').toLowerCase();
  if (!TRANSFORMABLE_ABSOLUTE_SCHEMES.has(scheme)) {
    return filePart;
  }

  const pathOnly = u.pathname.split('/').filter((s) => s !== '');
  const pathname = anonymizeUrlStylePathParts(pathOnly, names);

  if (scheme === 'file') {
    const labels = u.hostname.split('.').filter((s) => s.length > 0);
    if (labels.length === 0) {
      return `file://${pathname}${u.search}`;
    }
    const fakeHost = `${labels.map(() => names.nextExternalPathSegment()).join('.')}.invalid`;
    return `file://${fakeHost}${pathname}${u.search}`;
  }

  const labels = u.hostname.split('.').filter((s) => s.length > 0);
  const fakeHost =
    labels.length > 0
      ? `${labels.map(() => names.nextExternalPathSegment()).join('.')}.invalid`
      : `${names.nextExternalPathSegment()}.invalid`;

  let out = `${scheme}://${fakeHost}${pathname}`;
  if (u.search) out += u.search;
  return out;
}

function transformRelativeFilePath(filePart, names) {
  if (ABSOLUTE_URI_RE.test(filePart)) {
    return transformAbsoluteUri(filePart, names);
  }
  const segments = filePart.split('/');
  const next = [];
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (seg === '' || seg === '.' || seg === '..') {
      next.push(seg);
      continue;
    }
    const isLast = i === segments.length - 1;
    if (isLast) {
      const m = seg.match(/^(.+)(\.(yaml|yml|json))$/i);
      if (m) {
        next.push(`${names.nextExternalPathSegment()}${m[2]}`);
      } else {
        next.push(names.nextExternalPathSegment());
      }
    } else {
      next.push(names.nextExternalPathSegment());
    }
  }
  return next.join('/');
}

function transformExternalFragment(frag, names) {
  if (!frag.startsWith('#/')) return frag;
  if (/^#\/definitions\//.test(frag)) {
    return `#/definitions/${names.nextSchemaName()}`;
  }
  if (/^#\/components\/schemas\//.test(frag)) {
    return `#/components/schemas/${names.nextSchemaName()}`;
  }
  if (/^#\/components\/responses\//.test(frag)) {
    return `#/components/responses/${names.nextResponseName()}`;
  }
  if (/^#\/components\/parameters\//.test(frag)) {
    return `#/components/parameters/${names.nextParameterBlockName()}`;
  }
  const m = frag.match(/^(.+\/)([^/]+)$/);
  if (m) {
    return `${m[1]}${names.nextSchemaName()}`;
  }
  return frag;
}

function anonymizeExternalRefString(ref, names) {
  const hashIdx = ref.indexOf('#');
  const filePart = ref.slice(0, hashIdx);
  const frag = ref.slice(hashIdx);
  const newFile = transformRelativeFilePath(filePart, names);
  const newFrag = transformExternalFragment(frag, names);
  return newFile + newFrag;
}

/**
 * Карта полных внешних $ref → анонимизированное значение (путь с тем же числом сегментов и расширением).
 */
export function buildExternalRefMap(doc, names) {
  const found = new Set();
  collectExternalRefStrings(doc, found);
  const sorted = [...found].sort((a, b) => a.localeCompare(b));
  const map = {};
  for (const ref of sorted) {
    map[ref] = anonymizeExternalRefString(ref, names);
  }
  return map;
}

export function replaceRefs(
  value,
  schemaMap,
  responseMap,
  paramMap,
  definitionMap = {},
  externalRefMap = {},
) {
  if (typeof value !== 'string') return value;
  if (isExternalRefString(value)) {
    const mapped = externalRefMap[value];
    if (mapped !== undefined) return mapped;
  }
  let s = value;
  for (const [oldName, newName] of sortMapEntriesLongestFirst(definitionMap)) {
    s = s.replaceAll(
      `#/definitions/${oldName}`,
      `#/definitions/${newName}`,
    );
  }
  for (const [oldName, newName] of sortMapEntriesLongestFirst(schemaMap)) {
    s = s.replaceAll(
      `#/components/schemas/${oldName}`,
      `#/components/schemas/${newName}`,
    );
  }
  for (const [oldName, newName] of sortMapEntriesLongestFirst(responseMap)) {
    s = s.replaceAll(
      `#/components/responses/${oldName}`,
      `#/components/responses/${newName}`,
    );
  }
  for (const [oldName, newName] of sortMapEntriesLongestFirst(paramMap)) {
    s = s.replaceAll(
      `#/components/parameters/${oldName}`,
      `#/components/parameters/${newName}`,
    );
  }
  return s;
}

export function deepReplaceRefs(
  node,
  schemaMap,
  responseMap,
  paramMap,
  definitionMap = {},
  externalRefMap = {},
) {
  if (node === null || node === undefined) return;
  if (typeof node === 'string') {
    return replaceRefs(
      node,
      schemaMap,
      responseMap,
      paramMap,
      definitionMap,
      externalRefMap,
    );
  }
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) {
      const v = node[i];
      node[i] =
        typeof v === 'string'
          ? replaceRefs(
              v,
              schemaMap,
              responseMap,
              paramMap,
              definitionMap,
              externalRefMap,
            )
          : (deepReplaceRefs(
              v,
              schemaMap,
              responseMap,
              paramMap,
              definitionMap,
              externalRefMap,
            ),
            v);
    }
    return;
  }
  if (typeof node === 'object') {
    for (const k of Object.keys(node)) {
      const v = node[k];
      if (typeof v === 'string') {
        node[k] = replaceRefs(
          v,
          schemaMap,
          responseMap,
          paramMap,
          definitionMap,
          externalRefMap,
        );
      } else {
        deepReplaceRefs(
          v,
          schemaMap,
          responseMap,
          paramMap,
          definitionMap,
          externalRefMap,
        );
      }
    }
  }
}
