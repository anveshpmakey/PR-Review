# Bitbucket PR Review Agent

LLM-powered pull request reviewer for Bitbucket Cloud. It receives Bitbucket webhooks (or runs from
the CLI / Bitbucket Pipelines), sends the diff to **Claude** (Anthropic) or any **OpenAI-compatible**
model, and posts:

- **inline comments** anchored to the exact changed lines, and
- a **summary comment** with verdict, severity counts and any findings that could not be anchored.

## How it works

1. `pullrequest:created` / `pullrequest:updated` webhook arrives → signature is verified (HMAC-SHA256
   `X-Hub-Signature`) → the job is queued and the webhook returns `202` immediately.
2. The PR, its diff and existing comments are fetched. If this source commit was already reviewed the
   job is skipped (no duplicate reviews or wasted tokens on title/description edits).
3. The unified diff is parsed per file. Lock files, generated/minified/vendored files and binaries are
   filtered out (`IGNORE_PATHS` / `INCLUDE_PATHS` to customise).
4. For context, full post-change contents of modified files are fetched (`INCLUDE_FILE_CONTEXT`).
   Repo-specific review rules are read from `.pr-review.md` on the **destination** branch, so a PR
   cannot rewrite its own review rules.
5. Large PRs are split into chunks (`MAX_DIFF_CHARS`, `MAX_CHUNKS`) and reviewed in parallel
   (`REVIEW_CONCURRENCY`). The model returns **structured JSON** (Anthropic forced tool-use / OpenAI
   `json_schema` strict mode), so findings never need to be scraped out of prose.
6. Findings are validated against the diff: paths are resolved, line numbers are snapped to lines that
   exist in the diff, low-confidence/low-severity findings are filtered (`MIN_CONFIDENCE`,
   `MIN_SEVERITY`), duplicates and issues already posted on earlier commits are dropped.
7. Inline comments are posted (capped by `MAX_INLINE_COMMENTS`), then the summary comment.

Comment `/ai-review` on a PR (configurable via `REVIEW_TRIGGER_PHRASE`) to force a fresh review.

## Setup

```bash
npm install
cp .env.example .env   # fill in Bitbucket + LLM credentials
npm start              # webhook server on :3000
```

Bitbucket webhook: **Repository settings → Webhooks → Add webhook**

- URL: `https://<host>/webhook/bitbucket`
- Secret: same value as `WEBHOOK_SECRET`
- Triggers: Pull request *Created*, *Updated* and (optional, for `/ai-review`) *Comment created*

Bitbucket credentials need `pullrequest:write` and `repository:read`. A repository/workspace access token
(`BITBUCKET_ACCESS_TOKEN`) is recommended; username + app password is also supported.

### Choosing a model

| Provider | Env | Notes |
|---|---|---|
| Anthropic Claude | `AI_PROVIDER=anthropic`, `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` | Default model `claude-sonnet-4-5`. Uses prompt caching for the system prompt across chunks. |
| OpenAI | `AI_PROVIDER=openai`, `OPENAI_API_KEY`, `OPENAI_MODEL` | Chat Completions with strict JSON schema. |
| OpenAI-compatible | `AI_PROVIDER=openai`, `OPENAI_BASE_URL`, `OPENAI_MODEL` | Azure OpenAI v1, OpenRouter, LiteLLM, vLLM, Ollama… |
| Mock | `AI_PROVIDER=mock` | Offline heuristics for local development. |

If `AI_PROVIDER` is unset it is picked from whichever API key is present (Anthropic first).

### Review profiles and repo guidelines

- `REVIEW_PROFILE=general` (default): correctness, security, reliability, performance, API breakage, tests.
- `REVIEW_PROFILE=java-spring`: adds Spring Boot architecture rules (layering, transactions, JPA, validation…).
- Add a `.pr-review.md` to the repo's default branch with team conventions; it is appended to the prompt.

## CLI / Bitbucket Pipelines

```bash
npm run review -- --pr 123 --repo my-workspace/my-repo --dry-run
```

`--dry-run` prints the review instead of posting it; `--force` re-reviews an already reviewed commit or
a draft. In Pipelines, `BITBUCKET_PR_ID` and `BITBUCKET_REPO_FULL_NAME` are picked up automatically:

```yaml
pipelines:
  pull-requests:
    '**':
      - step:
          name: AI review
          image: node:20
          script:
            - git clone https://github.com/anveshpmakey/PR-Review.git /tmp/reviewer
            - cd /tmp/reviewer && npm ci --omit=dev && node src/cli.js
```

(Set `ANTHROPIC_API_KEY` and `BITBUCKET_ACCESS_TOKEN` as secured repository variables.)

## Configuration

See [`.env.example`](.env.example) for every option and its default.

## Development

```bash
npm test        # node:test, no network access required
npm run dev     # restart on change
```
