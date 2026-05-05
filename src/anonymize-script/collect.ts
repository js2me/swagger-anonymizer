// @ts-nocheck
import { OPENAPI_HTTP_METHODS } from './constants/openapi.js';

export function collectPropertyKeys(node, out) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const x of node) collectPropertyKeys(x, out);
    return;
  }
  const props = node.properties;
  if (props && typeof props === 'object' && !Array.isArray(props)) {
    for (const k of Object.keys(props)) {
      out.add(k);
      collectPropertyKeys(props[k], out);
    }
  }
  for (const [k, v] of Object.entries(node)) {
    if (k === 'properties') continue;
    collectPropertyKeys(v, out);
  }
}

export function collectPathTemplateParams(pathsObj, out) {
  if (!pathsObj || typeof pathsObj !== 'object') return;
  for (const pk of Object.keys(pathsObj)) {
    const re = /\{([^}]+)\}/g;
    let m;
    while ((m = re.exec(pk)) !== null) {
      out.add(m[1]);
    }
  }
}

export function collectComponentParameterNames(comps, out) {
  const cp = comps?.parameters;
  if (!cp || typeof cp !== 'object') return;
  for (const def of Object.values(cp)) {
    if (def && typeof def === 'object' && typeof def.name === 'string') {
      out.add(def.name);
    }
  }
}

export function collectParameterNames(pathsObj, out) {
  if (!pathsObj || typeof pathsObj !== 'object') return;
  for (const pathItem of Object.values(pathsObj)) {
    if (!pathItem || typeof pathItem !== 'object') continue;
    const plist = pathItem.parameters;
    if (Array.isArray(plist)) {
      for (const p of plist) {
        if (p && typeof p === 'object' && typeof p.name === 'string') {
          out.add(p.name);
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
            out.add(p.name);
          }
        }
      }
    }
  }
}

export function collectOperationIds(pathsObj, out) {
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
        out.add(op.operationId);
      }
    }
  }
}

export function collectTags(pathsObj, tagsArr, out) {
  if (Array.isArray(tagsArr)) {
    for (const t of tagsArr) {
      if (t && typeof t === 'object' && typeof t.name === 'string') {
        out.add(t.name);
      }
    }
  }
  if (!pathsObj || typeof pathsObj !== 'object') return;
  for (const pathItem of Object.values(pathsObj)) {
    if (!pathItem || typeof pathItem !== 'object') continue;
    for (const method of Object.keys(pathItem)) {
      if (!OPENAPI_HTTP_METHODS.includes(method)) {
        continue;
      }
      const op = pathItem[method];
      if (!op || typeof op !== 'object') continue;
      if (Array.isArray(op.tags)) {
        for (const t of op.tags) {
          if (typeof t === 'string') out.add(t);
        }
      }
    }
  }
}
