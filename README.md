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
swagger-anonymizer <entry-openapi.yaml|yml|json> [options]
```

The entry file and all reachable YAML/JSON fragments via `$ref` are **read, transformed, and overwritten in place**. Make a backup if you need the original.

```bash
swagger-anonymizer ./api/openapi.yaml
swagger-anonymizer ./api/swagger.json --anonymize-servers
```

Options:

| Option | Description |
|--------|-------------|
| `--root <dir>` | Root directory for resolving relative `$ref` (default: entry file directory) |
| `--preserve-openapi-refs` | Keep the entry filename in `../openapi.yaml#/components/…` refs (default) |
| `--no-preserve-openapi-refs` | Disable `--preserve-openapi-refs` |
| `--anonymize-servers` | Mask non-localhost `servers[].url` values (e.g. to `https://api.example.invalid/...`) |
| `--no-anonymize-local-schema-files` | Keep local schema definition filenames (default: rename reachable local schema files) |

Help:

```bash
swagger-anonymizer --help
```

## Split / multi-file specs

Typical layout:

```text
openapi.yaml
  components.schemas.*  →  $ref: ./definitions/Foo.yaml
  paths.*               →  $ref: paths/bar.yaml#/fragment

definitions/*.yaml      →  $ref: ./Sibling.yaml  or  ../openapi.yaml#/components/schemas/Bar
paths/*.yaml            →  $ref: ../openapi.yaml#/components/schemas/…
```

The CLI bundles reachable files in memory, runs the same anonymization as single-file mode, then writes each file back:

- **Schema / path file paths** in `$ref` (`./definitions/Foo.yaml`, `paths/bar.yaml#/key`) are preserved for path fragments; **local schema definition files** on disk are renamed and all sibling `$ref` strings updated (remote `https://` / `file://host/…` refs are not renamed).
- **OpenAPI-root refs** (`../openapi.yaml#/components/schemas/X`) keep the real entry filename; only component names inside the fragment are anonymized.
- **Sibling definition refs** (`./NovaEntity.yaml`) stay relative sibling paths.
- **Inline path placeholders** (`/audit: {}`) are not renamed to `/r/N`.
- **Orphan definition files** (referenced but not listed under `components.schemas`) are discovered and anonymized too.

Programmatic API for split specs:

```js
import { anonymizeSplitOpenApi } from 'swagger-anonymizer';

const { filesWritten, schemaMap, parameterMap, schemaFileMap } = anonymizeSplitOpenApi({
  entryPath: './openapi.yaml',
  anonymizeServerUrls: true,
});
```

## Programmatic API

After `pnpm run build`:

```js
import {
  anonymizeOpenApiInPlace,
  anonymizeSplitOpenApi,
} from 'swagger-anonymizer';

anonymizeOpenApiInPlace(myParsedSpec); // mutates a single parsed document in place

anonymizeSplitOpenApi({ entryPath: './openapi.yaml' }); // multi-file bundle → unbundle
```

Deep import (same surface as `./anonymize` export):

```js
import {
  anonymizeOpenApiInPlace,
  anonymizeSplitOpenApi,
} from 'swagger-anonymizer/anonymize';
```

## License

ISC
