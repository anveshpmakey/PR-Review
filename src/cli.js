#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { config } from './config/env.js';
import { createContext } from './context.js';
import { reviewPullRequest } from './services/prReview.js';

const USAGE = `Usage: pr-review --pr <id> [--repo <workspace/slug>] [--dry-run] [--force]

  --pr        Pull request id (or BITBUCKET_PR_ID env var, set by Bitbucket Pipelines)
  --repo      Repository full name (defaults to BITBUCKET_WORKSPACE/BITBUCKET_REPO_SLUG)
  --dry-run   Print the review instead of posting comments
  --force     Review even if this commit was already reviewed or the PR is a draft`;

const { values } = parseArgs({
  options: {
    pr: { type: 'string' },
    repo: { type: 'string' },
    'dry-run': { type: 'boolean', default: false },
    force: { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h', default: false }
  }
});

const prId = values.pr || process.env.BITBUCKET_PR_ID;
const repo = values.repo
  || process.env.BITBUCKET_REPO_FULL_NAME
  || (config.bitbucket.workspace && config.bitbucket.repoSlug ? `${config.bitbucket.workspace}/${config.bitbucket.repoSlug}` : '');

if (values.help || !prId || !repo) {
  console.log(USAGE);
  process.exit(values.help ? 0 : 1);
}

try {
  const ctx = createContext({ ...config, dryRun: config.dryRun || values['dry-run'] });
  const result = await reviewPullRequest({ repo, prId: Number(prId), force: values.force }, ctx);
  if (result.skipped) console.log(`Skipped: ${result.reason}`);
  else if (ctx.config.dryRun) {
    console.log(result.summaryText);
    console.log('\n--- Inline findings ---');
    console.log(JSON.stringify(result.findings, null, 2));
  } else console.log(`Posted review on ${repo}#${prId}: ${result.findings.length} finding(s), verdict ${result.verdict}`);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
