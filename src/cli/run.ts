import fs from 'node:fs';
import path from 'node:path';

import { anonymizeOpenApiInPlace } from '../anonymize-script/anonymize.js';
import {
  isJsonFile,
  parseDocument,
  stringifyDocument,
} from '../anonymize-script/document-format.js';

export function printUsage() {
  console.error(
    'Usage: swagger-anonymizer <path-to-openapi.yaml|yml|json>\n\n' +
      'Anonymizes schema names, operationIds, tags, examples, descriptions, summaries, and titles (file is overwritten in place).',
  );
}

export function resolveTargetPathFromArgv() {
  const arg = process.argv[2];
  if (!arg || arg === '-h' || arg === '--help') {
    printUsage();
    process.exit(arg ? 0 : 1);
  }
  return path.resolve(process.cwd(), arg);
}

export function runCli() {
  const targetPath = resolveTargetPathFromArgv();
  console.log(`📂 Target file: ${targetPath}`);

  console.log('📖 Reading file…');
  const raw = fs.readFileSync(targetPath, 'utf8');
  console.log(`   (${raw.length} characters)`);

  const format = isJsonFile(targetPath) ? 'JSON' : 'YAML';
  console.log(`🔍 Parsing OpenAPI as ${format}…`);
  const doc = parseDocument(raw, targetPath);
  console.log('✅ Document parsed.');

  console.log('🔒 Anonymizing (schemas, paths, examples, metadata)…');
  anonymizeOpenApiInPlace(doc);
  console.log('✅ Anonymization finished.');

  console.log(`💾 Writing ${format} back to disk…`);
  const out = stringifyDocument(doc, targetPath);
  fs.writeFileSync(targetPath, out, 'utf8');
  console.log(`✨ Done. File updated: ${targetPath}`);
}
