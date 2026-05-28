// @ts-nocheck
import { OPENAPI_HTTP_METHODS } from './constants/openapi.js';

export function renameObjectKeys(obj, keyMap) {
  if (!obj || typeof obj !== 'object') return;
  if (Array.isArray(obj)) {
    for (const x of obj) renameObjectKeys(x, keyMap);
    return;
  }
  const props = obj.properties;
  if (props && typeof props === 'object' && !Array.isArray(props)) {
    for (const oldK of Object.keys(props)) {
      const nk = keyMap[oldK] ?? oldK;
      if (nk !== oldK) {
        props[nk] = props[oldK];
        delete props[oldK];
      }
    }
    for (const nk of Object.keys(props)) {
      renameObjectKeys(props[nk], keyMap);
    }
  }
  if (Array.isArray(obj.required)) {
    obj.required = obj.required.map((x) =>
      typeof x === 'string' ? (keyMap[x] ?? x) : x,
    );
  }
  for (const [k, v] of Object.entries(obj)) {
    if (k === 'properties' || k === 'required') continue;
    renameObjectKeys(v, keyMap);
  }
}

export function applyComponentParameterRename(comps, keyMap) {
  const cp = comps?.parameters;
  if (!cp || typeof cp !== 'object') return;
  for (const def of Object.values(cp)) {
    if (def && typeof def === 'object' && typeof def.name === 'string') {
      const nk = keyMap[def.name];
      if (nk) def.name = nk;
    }
  }
}

export function applyParameterRename(pathsObj, keyMap) {
  if (!pathsObj || typeof pathsObj !== 'object') return;
  for (const pathItem of Object.values(pathsObj)) {
    if (!pathItem || typeof pathItem !== 'object') continue;
    const plist = pathItem.parameters;
    if (Array.isArray(plist)) {
      for (const p of plist) {
        if (p && typeof p === 'object' && typeof p.name === 'string') {
          const nk = keyMap[p.name];
          if (nk) p.name = nk;
        }
      }
    }
    for (const method of Object.keys(pathItem)) {
      if (!OPENAPI_HTTP_METHODS.includes(method)) {
        continue;
      }
      const op = pathItem[method];
      if (!op || typeof op !== 'object') continue;
      if (Array.isArray(op.parameters)) {
        for (const p of op.parameters) {
          if (p && typeof p === 'object' && typeof p.name === 'string') {
            const nk = keyMap[p.name];
            if (nk) p.name = nk;
          }
        }
      }
    }
  }
}

export function anonymizePathKeys(pathsObj, propRename) {
  const pathKeyMap = {};
  if (!pathsObj || typeof pathsObj !== 'object') return pathKeyMap;
  const keys = Object.keys(pathsObj).sort((a, b) => a.localeCompare(b));
  const next = {};
  let idx = 0;
  for (const pk of keys) {
    let np = pk;
    for (const [oldP, newP] of Object.entries(propRename)) {
      np = np.replaceAll(`{${oldP}}`, `{${newP}}`);
    }
    const brace = [...np.matchAll(/\{([^}]+)\}/g)].map((m) => `{${m[1]}}`);
    const newKey =
      `/r/${++idx}` + (brace.length ? `/${brace.join('/')}` : '');
    pathKeyMap[pk] = newKey;
    next[newKey] = pathsObj[pk];
    delete pathsObj[pk];
  }
  Object.assign(pathsObj, next);
  return pathKeyMap;
}

export function replaceOperationIds(pathsObj, opMap) {
  if (!pathsObj || typeof pathsObj !== 'object') return;
  for (const pathItem of Object.values(pathsObj)) {
    if (!pathItem || typeof pathItem !== 'object') continue;
    for (const method of Object.keys(pathItem)) {
      if (!OPENAPI_HTTP_METHODS.includes(method)) {
        continue;
      }
      const op = pathItem[method];
      if (
        op &&
        typeof op === 'object' &&
        typeof op.operationId === 'string'
      ) {
        const nid = opMap[op.operationId];
        if (nid) op.operationId = nid;
      }
    }
  }
}

export function replaceTagsStrings(node, tagMap) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) {
      const x = node[i];
      if (typeof x === 'string') {
        const t = tagMap[x];
        if (t) node[i] = t;
      } else {
        replaceTagsStrings(x, tagMap);
      }
    }
    return;
  }
  for (const [k, v] of Object.entries(node)) {
    if (k === 'tags' && Array.isArray(v)) {
      for (let i = 0; i < v.length; i++) {
        if (typeof v[i] === 'string') {
          const t = tagMap[v[i]];
          if (t) v[i] = t;
        }
      }
    } else {
      replaceTagsStrings(v, tagMap);
    }
  }
}
