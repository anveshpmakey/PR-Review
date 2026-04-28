import { config } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { summarizeDiffstat, extractChangedPaths, filterInterestingFiles, truncateText } from '../utils/diff.js';
import { getPullRequest, getPullRequestDiff, getPullRequestDiffstat, listPullRequestComments, postPullRequestComment } from './bitbucketClient.js';
import { runReview } from './reviewEngine.js';

function alreadyReviewed(comments, marker) {
  return (comments.values || []).some(c => c?.content?.raw?.includes(marker));
}

export async function reviewPullRequest(prId) {
  const [pr, diffTextRaw, diffstat, comments] = await Promise.all([
    getPullRequest(prId),
    getPullRequestDiff(prId),
    getPullRequestDiffstat(prId),
    listPullRequestComments(prId, config.dedupLookbackComments)
  ]);

  const summary = summarizeDiffstat(diffstat.values || []);
  const changedPaths = extractChangedPaths(diffstat.values || []);
  const interestingPaths = filterInterestingFiles(changedPaths);
  const diffText = truncateText(diffTextRaw, config.maxDiffChars);
  const review = await runReview({ pr, diffText, changedPaths: interestingPaths, summary });

  const markerMatch = review.text.match(/Review fingerprint: ([a-f0-9]+)/i) || review.text.match(/`([a-f0-9]{12})`/);
  const marker = markerMatch ? markerMatch[1] : null;

  if (marker && alreadyReviewed(comments, marker)) {
    logger.info('Skipping duplicate review for PR', prId, marker);
    return { skipped: true, reason: 'duplicate', marker };
  }

  let posted = null;
  if (config.postGeneralComment) {
    posted = await postPullRequestComment(prId, review.text);
  }

  return {
    skipped: false,
    prId,
    summary,
    changedPaths: interestingPaths,
    commentId: posted?.id,
    reviewText: review.text
  };
}
