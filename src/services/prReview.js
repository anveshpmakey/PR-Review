import { logger } from '../utils/logger.js';
import { parseUnifiedDiff, summarizeFiles } from '../utils/diff.js';
import { createPathFilter } from '../utils/fileFilter.js';
import { runReview } from '../review/engine.js';
import {
  extractExistingInlineFindings,
  formatInlineComment,
  formatSummaryComment,
  hasSummaryForCommit
} from '../review/formatter.js';

async function loadGuidelines({ bitbucket, reviewConfig, pr, repo }) {
  const parts = [];
  if (reviewConfig.guidelines) parts.push(reviewConfig.guidelines);
  // Read guidelines from the destination (trusted) branch so a PR cannot rewrite its own review rules.
  const commit = pr.destination?.commit?.hash;
  if (reviewConfig.guidelinesPath && commit) {
    try {
      const destRepo = pr.destination?.repository?.full_name || repo;
      const text = await bitbucket.getFileContent(destRepo, commit, reviewConfig.guidelinesPath);
      if (text) parts.push(text.slice(0, 20000));
    } catch (error) {
      logger.warn(`Could not load ${reviewConfig.guidelinesPath}: ${error.message}`);
    }
  }
  return parts.join('\n\n');
}

async function loadFileContents({ bitbucket, reviewConfig, pr, repo, files }) {
  const contents = new Map();
  const commit = pr.source?.commit?.hash;
  if (!reviewConfig.includeFileContext || !commit) return contents;
  const sourceRepo = pr.source?.repository?.full_name || repo;
  const targets = files.filter(f => f.status === 'modified' || f.status === 'renamed');
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(4, targets.length) }, async () => {
    while (next < targets.length) {
      const file = targets[next];
      next += 1;
      try {
        const text = await bitbucket.getFileContent(sourceRepo, commit, file.path);
        if (text && text.length <= reviewConfig.maxContextFileChars) contents.set(file.path, text);
      } catch (error) {
        logger.debug(`Skipping context for ${file.path}: ${error.message}`);
      }
    }
  }));
  return contents;
}

export async function reviewPullRequest({ repo, prId, force = false }, { config, bitbucket, llm }) {
  const reviewConfig = config.review;
  const pr = await bitbucket.getPullRequest(repo, prId);

  if (pr.state && pr.state !== 'OPEN') return { skipped: true, reason: `state ${pr.state}`, prId };
  if (pr.draft && reviewConfig.skipDrafts && !force) return { skipped: true, reason: 'draft', prId };

  const commit = (pr.source?.commit?.hash || String(pr.updated_on || Date.now())).slice(0, 12);
  const comments = await bitbucket.listPullRequestComments(repo, prId);
  if (!force && hasSummaryForCommit(comments, commit)) {
    logger.info(`PR #${prId} already reviewed at commit ${commit}; skipping`);
    return { skipped: true, reason: 'duplicate', prId, commit };
  }

  const allFiles = parseUnifiedDiff(await bitbucket.getPullRequestDiff(repo, prId));
  const isReviewablePath = createPathFilter(reviewConfig);
  const files = allFiles.filter(f => f.status !== 'deleted' && !f.isBinary && f.hunks.length && isReviewablePath(f.path));
  const ignoredFiles = allFiles.filter(f => !files.includes(f)).map(f => f.path);

  if (!files.length) {
    logger.info(`PR #${prId} has no reviewable files`);
    return { skipped: true, reason: 'no reviewable files', prId, ignoredFiles };
  }

  const [guidelines, contents] = await Promise.all([
    loadGuidelines({ bitbucket, reviewConfig, pr, repo }),
    loadFileContents({ bitbucket, reviewConfig, pr, repo, files })
  ]);

  const result = await runReview({
    pr,
    files,
    llm,
    reviewConfig,
    guidelines,
    contents,
    existingInline: extractExistingInlineFindings(comments)
  });

  const posted = [];
  const failedInline = [];
  if (config.postInlineComments && !config.dryRun) {
    for (const finding of result.inline) {
      const inline = finding.line ? { path: finding.path, to: finding.line } : { path: finding.path };
      try {
        const res = await bitbucket.postPullRequestComment(repo, prId, formatInlineComment(finding), inline);
        posted.push(res?.id);
      } catch (error) {
        logger.warn(`Inline comment on ${finding.path}:${finding.line} failed: ${error.message}`);
        failedInline.push(finding);
      }
    }
  }

  const inlineForSummary = config.postInlineComments ? result.inline.filter(f => !failedInline.includes(f)) : [];
  const summaryResult = {
    ...result,
    inline: inlineForSummary,
    overflow: config.postInlineComments ? result.overflow : [...result.inline, ...result.overflow]
  };
  const summaryText = formatSummaryComment(summaryResult, {
    commit,
    stats: summarizeFiles(allFiles),
    ignoredFiles,
    failedInline
  });

  let summaryCommentId = null;
  if (config.postGeneralComment && !config.dryRun) {
    summaryCommentId = (await bitbucket.postPullRequestComment(repo, prId, summaryText))?.id ?? null;
  }

  logger.info(`PR #${prId} reviewed: ${result.findings.length} finding(s), verdict ${result.verdict}`);
  return {
    skipped: false,
    prId,
    commit,
    verdict: result.verdict,
    findings: result.findings,
    inlineCommentIds: posted,
    summaryCommentId,
    summaryText
  };
}
