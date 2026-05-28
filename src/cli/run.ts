import path from 'node:path';

import { anonymizeSplitOpenApi } from '../anonymize-script/split-openapi.js';

export function printUsage() {
  console.error(
    'Usage: swagger-anonymizer <entry-openapi.yaml|yml|json> [options]\n\n' +
      'Anonymizes schema names, operationIds, tags, examples, descriptions, summaries, and titles.\n' +
      'For split specs, all reachable YAML/JSON files via $ref are updated in place.\n\n' +
      'Options:\n' +
      '  --root <dir>                 Root directory for resolving refs (default: entry file dir)\n' +
      '  --preserve-openapi-refs      Keep entry filename in ../openapi.yaml#/… refs (default)\n' +
      '  --no-preserve-openapi-refs   Disable preserve-openapi-refs\n' +
      '  --anonymize-servers          Mask non-localhost server URLs\n' +
      '  --no-anonymize-local-schema-files  Keep local schema filenames on disk\n' +
      '  -h, --help                   Show help',
  );
}

export function parseCliArgs(argv = process.argv.slice(2)) {
  if (argv.length === 0 || argv.includes('-h') || argv.includes('--help')) {
    return { help: true };
  }

  const entryPath = argv[0];
  let rootDir;
  let preserveOpenApiRefs = true;
  let anonymizeServerUrls = false;
  let anonymizeLocalSchemaFiles = true;

  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--root') {
      rootDir = argv[++i];
      if (!rootDir) {
        throw new Error('Missing value for --root');
      }
    } else if (arg === '--preserve-openapi-refs') {
      preserveOpenApiRefs = true;
    } else if (arg === '--no-preserve-openapi-refs') {
      preserveOpenApiRefs = false;
    } else if (arg === '--anonymize-servers') {
      anonymizeServerUrls = true;
    } else if (arg === '--no-anonymize-local-schema-files') {
      anonymizeLocalSchemaFiles = false;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return {
    help: false,
    entryPath: path.resolve(process.cwd(), entryPath),
    rootDir: rootDir ? path.resolve(process.cwd(), rootDir) : undefined,
    preserveOpenApiRefs,
    anonymizeServerUrls,
    anonymizeLocalSchemaFiles,
  };
}

export function runCli() {
  let args;
  try {
    args = parseCliArgs();
  } catch (err) {
    console.error(`Error: ${err.message}`);
    printUsage();
    process.exit(1);
  }

  if (args.help) {
    printUsage();
    process.exit(0);
  }

  console.log(`📂 Entry file: ${args.entryPath}`);
  if (args.rootDir) {
    console.log(`📁 Root dir: ${args.rootDir}`);
  }

  console.log('🔒 Anonymizing split OpenAPI (bundle → anonymize → unbundle)…');
  const result = anonymizeSplitOpenApi({
    entryPath: args.entryPath,
    rootDir: args.rootDir,
    preserveOpenApiRefs: args.preserveOpenApiRefs,
    anonymizeServerUrls: args.anonymizeServerUrls,
    anonymizeLocalSchemaFiles: args.anonymizeLocalSchemaFiles,
  });
  console.log(`✅ Anonymization finished (${result.filesWritten.length} file(s)).`);
  for (const file of result.filesWritten) {
    console.log(`   💾 ${file}`);
  }
}
