#!/usr/bin/env node
/**
 * Точка входа CLI: `npx swagger-anonymizer <entry-openapi.yaml>`.
 */
export { anonymizeOpenApiInPlace, anonymizeSplitOpenApi } from './anonymize-script/index.js';
export { runCli } from './cli/run.js';

import { runCli } from './cli/run.js';

runCli();
