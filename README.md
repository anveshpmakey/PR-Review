# Bitbucket PR Review Agent

LLM-powered pull request reviewer for Bitbucket Cloud. It receives Bitbucket webhooks (or runs from
the CLI / Bitbucket Pipelines), sends the diff to **Claude** (Anthropic) or any **OpenAI-compatible**
model, with automatic fallback to free / open-source models (Ollama, Groq, OpenRouter, Gemini, Hugging Face, ...), and posts:

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

### Choosing a model (with free / open-source fallbacks)

`AI_PROVIDER` takes a comma-separated chain (plus optional `AI_FALLBACK_PROVIDERS`). Each chunk is sent
to the first provider; if it fails after retries (outage, exhausted quota, invalid key, network), the
next one is tried. A provider that failed is skipped for `LLM_FALLBACK_COOLDOWN_MS` (default 5 min), so
the rest of the PR doesn't wait on it again. The summary comment shows which model(s) did the review.

```bash
AI_PROVIDER=anthropic,groq,ollama      # Claude first, then Groq's free tier, then a local model
```

If `AI_PROVIDER` is unset, every provider with credentials is chained in this order: anthropic, openai,
gemini, groq, openrouter, mistral, huggingface, deepseek, ollama. With nothing configured it uses `mock`.

| Provider | Key env | Default model | Notes |
|---|---|---|---|
| `anthropic` (`claude`) | `ANTHROPIC_API_KEY` | `claude-sonnet-4-5` | Forced tool-use output, prompt caching. |
| `openai` | `OPENAI_API_KEY` | `gpt-4.1` | Strict JSON schema. With `OPENAI_BASE_URL`, also works with any OpenAI-compatible server (vLLM, LM Studio, LocalAI, LiteLLM, Azure v1). |
| `ollama` (`local`) | none | `qwen2.5-coder:14b` | Self-hosted open-source models. Enable with `OLLAMA_MODEL` / `OLLAMA_BASE_URL`. |
| `groq` | `GROQ_API_KEY` | `llama-3.3-70b-versatile` | Free tier, very fast. |
| `openrouter` | `OPENROUTER_API_KEY` | `meta-llama/llama-3.3-70b-instruct:free` | Many `:free` open models. |
| `gemini` (`google`) | `GEMINI_API_KEY` / `GOOGLE_API_KEY` | `gemini-2.5-flash` | Free tier through Google's OpenAI-compatible endpoint. |
| `huggingface` (`hf`) | `HF_TOKEN` | `Qwen/Qwen2.5-Coder-32B-Instruct` | HF Inference Providers router. |
| `mistral` | `MISTRAL_API_KEY` | `mistral-small-latest` | Free "Experiment" tier. |
| `deepseek` | `DEEPSEEK_API_KEY` | `deepseek-chat` | Open-weights model, low cost. |
| `mock` | none | heuristics | Offline rules for local development. |

Free-tier model names and limits change often. Override the model with `<PREFIX>_MODEL` (for example `GROQ_MODEL`).

Open-source models and gateways support structured output unevenly. Each provider starts with the best
mode it supports (`json_schema` or `json_object`). If the server rejects it, the client drops to
`json_object` and then to plain prompting, and pulls the JSON out of the reply. Force a mode with
`<PREFIX>_STRUCTURED_OUTPUT=json_schema|json_object|none`.

**Running locally with Ollama**

```bash
ollama pull qwen2.5-coder:14b
OLLAMA_CONTEXT_LENGTH=32768 ollama serve   # Ollama's default context is small and silently truncates prompts
AI_PROVIDER=ollama OLLAMA_MODEL=qwen2.5-coder:14b MAX_DIFF_CHARS=40000 npm start
```

Smaller local models review better with smaller chunks (`MAX_DIFF_CHARS`) and `MIN_CONFIDENCE=0.7` to cut noise.

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
