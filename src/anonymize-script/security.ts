// @ts-nocheck
export function anonymizeApiKeySchemeNames(sec) {
  if (!sec || typeof sec !== 'object') return;
  const headerNames = new Set();
  for (const scheme of Object.values(sec)) {
    if (
      scheme &&
      typeof scheme === 'object' &&
      scheme.type === 'apiKey' &&
      typeof scheme.name === 'string' &&
      scheme.name.length > 0
    ) {
      headerNames.add(scheme.name);
    }
  }
  const sorted = [...headerNames].sort((a, b) => a.localeCompare(b));
  const hdrMap = {};
  sorted.forEach((n, i) => {
    hdrMap[n] = `hdr${String(i + 1).padStart(2, '0')}`;
  });
  for (const scheme of Object.values(sec)) {
    if (
      scheme &&
      typeof scheme === 'object' &&
      scheme.type === 'apiKey' &&
      typeof scheme.name === 'string' &&
      Object.hasOwn(hdrMap, scheme.name)
    ) {
      scheme.name = hdrMap[scheme.name];
    }
  }
}

export function rewriteSecurityRefs(node, secRename) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const item of node) {
      if (item && typeof item === 'object') {
        for (const k of Object.keys(item)) {
          if (secRename[k]) {
            item[secRename[k]] = item[k];
            delete item[k];
          }
        }
      }
    }
    return;
  }
  for (const v of Object.values(node)) rewriteSecurityRefs(v, secRename);
}
