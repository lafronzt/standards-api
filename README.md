# Standards API

Production-ready API for ReviewOps engineering standards. It stores versioned standards in PostgreSQL and returns the latest active rules for AI code review tooling.

## Stack

- Node.js 22
- TypeScript
- Fastify
- PostgreSQL
- Prisma
- Vitest

## Environment

Copy `.env.example` to `.env` and adjust values for your environment.

| Variable | Default | Description |
| --- | --- | --- |
| `DATABASE_URL` | required | PostgreSQL connection string used by Prisma |
| `HOST` | `0.0.0.0` | Bind host |
| `PORT` | `3000` | API port |
| `LOG_LEVEL` | `info` | Fastify logger level |
| `STANDARDS_API_KEY` | unset | Optional write API key. Required for writes when set, and always required when `NODE_ENV=production` |

Do not commit real database credentials or secrets.

## Local Development

```bash
npm install
cp .env.example .env
docker compose up -d postgres
npx prisma migrate dev
npm run prisma:seed
npm run dev
```

The API listens on `http://localhost:3000`.

## Docker

Run the full app and database:

```bash
docker compose up --build
```

Seed data after the app/database are running:

```bash
docker compose exec app npm run prisma:seed:prod
```

## Scripts

```bash
npm run dev              # start local dev server
npm run build            # compile TypeScript
npm run lint             # strict TypeScript check
npm test                 # run tests
npm run prisma:migrate   # create/apply local migration
npm run prisma:deploy    # apply migrations in deployed environments
npm run prisma:seed      # load example standards
```

## Database

The service creates one table:

- `standards`: versioned standards/rules with status, severity, category, applicability metadata, guidance, examples, owner, timestamps, and deprecation timestamp.

There is a unique constraint on `(rule_key, version)` to prevent duplicate versions and a partial unique index that allows only one active version for a given `rule_key`.

## Versioning

- `rule_key` is stable across versions.
- Each database row represents one version of a rule.
- Draft rules are updated in place by `PUT /api/v1/standards/:ruleKey`.
- Updating an active or deprecated rule creates a new version.
- Creating a new active version automatically marks the previous active version for the same `rule_key` as `deprecated` and sets `deprecated_at`.
- Deprecated rules remain queryable with list filters such as `?status=deprecated`, but they do not appear in `/api/v1/standards/latest` or `/api/v1/standards/applicable`.

## Endpoints

- `GET /health`
- `GET /api/v1/standards`
- `GET /api/v1/standards/:ruleKey`
- `GET /api/v1/standards/latest`
- `POST /api/v1/standards`
- `PUT /api/v1/standards/:ruleKey`
- `GET /api/v1/standards/applicable`
- `GET /openapi.json`
- `GET /docs`

`GET /api/v1/standards` defaults to active latest standards. Supported filters:

- `status`: `active`, `draft`, `deprecated`
- `category`: `reliability`, `security`, `observability`, `performance`, `cost`, `maintainability`, `architecture`, `compliance`
- `severity`: `critical`, `high`, `medium`, `low`, `info`
- `owner`
- `limit`
- `offset`

`GET /api/v1/standards/applicable` accepts:

- `repo`
- `team`
- `language`
- `framework`
- `runtime`
- `environment`
- `changed_paths`, comma-separated file paths

Matching is deterministic:

- Only active rules are returned.
- Empty or missing `applies_to` fields are global for that field.
- If an `applies_to` field has values, the request must match one of those values.
- Supported fields are `languages`, `frameworks`, `runtimes`, `file_patterns`, `teams`, `repos`, and `environments`.
- `changed_paths` is parsed as comma-separated file paths.
- `file_patterns` use glob matching against `changed_paths`.
- A rule with no file patterns can still match on repo, team, language, framework, runtime, or environment.
- Each returned applicable rule includes `match_reason`.

`/api/v1/standards/latest` and `/api/v1/standards/applicable` return:

```json
{
  "standards_version": "2026-05-18T15:30:00.000Z-count-6",
  "rules": []
}
```

The current `standards_version` is generated from the latest `updated_at` timestamp among returned rules and the returned rule count.

## Write API Key

Write endpoints are `POST /api/v1/standards` and `PUT /api/v1/standards/:ruleKey`.

- If `NODE_ENV=production`, writes require `x-api-key`.
- If `STANDARDS_API_KEY` is set in any environment, writes require `x-api-key`.
- In non-production, writes are allowed without a key only when `STANDARDS_API_KEY` is unset.
- Missing or invalid keys return a JSON `401` response with `error.code = "unauthorized"`.

## Example Curl Commands

Health:

```bash
curl http://localhost:3000/health
```

List active standards:

```bash
curl http://localhost:3000/api/v1/standards
```

Get a standard:

```bash
curl http://localhost:3000/api/v1/standards/SRE-K8S-003
```

Create a standard:

```bash
curl -X POST http://localhost:3000/api/v1/standards \
  -H 'content-type: application/json' \
  -d '{
    "rule_key": "PERF-API-010",
    "title": "Pagination required for collection endpoints",
    "description": "Collection endpoints must support bounded pagination.",
    "status": "active",
    "severity": "medium",
    "category": "performance",
    "applies_to": {
      "languages": ["typescript"],
      "file_patterns": ["src/**/*.ts"]
    },
    "rule_text": "Collection endpoints must enforce page size limits.",
    "review_guidance": "Look for unbounded list queries and missing limit parameters.",
    "owner": "api-platform",
    "version": 1
  }'
```

Get ReviewOps applicable standards:

```bash
curl 'http://localhost:3000/api/v1/standards/applicable?repo=payments-api&team=platform&language=typescript&environment=production&changed_paths=src/client.ts,infra/main.tf'
```

Get Kubernetes standards for a changed manifest:

```bash
curl 'http://localhost:3000/api/v1/standards/applicable?framework=kubernetes&runtime=container&environment=production&changed_paths=deploy/deployment.yaml'
```

## Example ReviewOps Response

```json
{
  "standards_version": "2026-05-18T19:42:00.000Z-count-1",
  "rules": [
    {
      "id": "c3c3d7a9-2e30-4c12-9f18-0bcb4b5f4b7a",
      "rule_key": "REL-NET-004",
      "title": "External calls must define timeouts/retries",
      "description": "External network calls must bound latency and define retry behavior appropriate to idempotency.",
      "status": "active",
      "severity": "high",
      "category": "reliability",
      "applies_to": {
        "languages": ["typescript", "javascript", "go", "python"],
        "file_patterns": ["src/**/*.ts", "src/**/*.js", "src/**/*.go", "src/**/*.py"]
      },
      "rule_text": "Every external HTTP/RPC call must define a timeout and explicit retry policy.",
      "review_guidance": "Inspect clients and SDK calls for configured timeouts, retry limits, and backoff.",
      "good_example": "fetch(url, { signal: AbortSignal.timeout(3000) }) with bounded retry wrapper.",
      "bad_example": "await fetch(url)",
      "owner": "platform",
      "version": 1,
      "created_at": "2026-05-18T19:42:00.000Z",
      "updated_at": "2026-05-18T19:42:00.000Z",
      "deprecated_at": null,
      "match_reason": "Matched language=typescript and Matched changed_paths=src/client.ts"
    }
  ]
}
```
