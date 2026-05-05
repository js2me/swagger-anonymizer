# swagger-anonymizer

CLI tool that **anonymizes** an OpenAPI (Swagger) spec in **YAML or JSON**: it replaces internal names, paths, tags, operation IDs, examples, and human-readable text with **neutral, synthetic values** so you can share or commit specs without leaking real API surface or product wording.

Output is **deterministic** for a given input (fixed random seeds).

## Why use it

- Strip identifiable schema/path/tag names before publishing fixtures or screenshots  
- Reduce accidental leaks when pasting specs into issues or chats  
- Produce stable “fake” specs for demos or codegen tests  

## Requirements

- **Node.js 18+**

## Install

From npm (after publish):

```bash
npx swagger-anonymizer path/to/openapi.yaml
```

From a clone: `pnpm install && pnpm run build`, then:

```bash
pnpm exec swagger-anonymizer path/to/openapi.yaml
# or: node dist/index.js path/to/openapi.yaml
```

## Usage

```text
swagger-anonymizer <path-to-openapi.yaml|yml|json>
```

The file is **read, transformed, and overwritten in place**. Make a backup if you need the original.

```bash
swagger-anonymizer ./api/openapi.yaml
swagger-anonymizer ./api/swagger.json
```

Help:

```bash
swagger-anonymizer --help
```

## Programmatic API

After `pnpm run build`:

```js
import { anonymizeOpenApiInPlace } from './dist/anonymize-script/index.js';

anonymizeOpenApiInPlace(myParsedSpec); // mutates in place
```

The published `main` entry is the CLI. For library-style usage from another package (once installed from npm), use a deep import if your bundler allows it, for example:

```js
import { anonymizeOpenApiInPlace } from 'swagger-anonymizer/dist/anonymize-script/index.js';
```

## License

ISC
