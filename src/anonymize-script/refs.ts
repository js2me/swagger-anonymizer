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

export function replaceRefs(
  value,
  schemaMap,
  responseMap,
  paramMap,
  definitionMap = {},
) {
  if (typeof value !== 'string') return value;
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
) {
  if (node === null || node === undefined) return;
  if (typeof node === 'string') {
    return replaceRefs(node, schemaMap, responseMap, paramMap, definitionMap);
  }
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) {
      const v = node[i];
      node[i] =
        typeof v === 'string'
          ? replaceRefs(v, schemaMap, responseMap, paramMap, definitionMap)
          : (deepReplaceRefs(v, schemaMap, responseMap, paramMap, definitionMap),
            v);
    }
    return;
  }
  if (typeof node === 'object') {
    for (const k of Object.keys(node)) {
      const v = node[k];
      if (typeof v === 'string') {
        node[k] = replaceRefs(v, schemaMap, responseMap, paramMap, definitionMap);
      } else {
        deepReplaceRefs(v, schemaMap, responseMap, paramMap, definitionMap);
      }
    }
  }
}
