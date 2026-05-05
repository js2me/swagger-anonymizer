import path from 'node:path';

import YAML from 'yaml';

export function isJsonFile(filePath) {
  return path.extname(filePath).toLowerCase() === '.json';
}

export function parseDocument(raw, filePath) {
  if (isJsonFile(filePath)) {
    return JSON.parse(raw);
  }
  return YAML.parse(raw);
}

export function stringifyDocument(doc, filePath) {
  if (isJsonFile(filePath)) {
    return `${JSON.stringify(doc, null, 2)}\n`;
  }
  return (
    '# Anonymized OpenAPI (no prod names).\n' +
    YAML.stringify(doc, {
      indent: 4,
      lineWidth: 120,
      defaultStringType: 'QUOTE_DOUBLE',
      defaultKeyType: 'PLAIN',
    })
  );
}
