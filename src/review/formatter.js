const BOT_TAG = 'ai-pr-review';
const SUMMARY_MARKER_RE = /ai-pr-review · commit `([0-9a-f]+)`/i;
const INLINE_TITLE_RE = /\*\*\[(LOW|MEDIUM|HIGH|CRITICAL)\] [^*]+:\*\* (.+)/;

const VERDICT_LABEL = {
  approve: 'Looks good',
  comment: 'Comments',
  request_changes: 'Changes requested'
};

const label = s => s.charAt(0).toUpperCase() + s.slice(1).replace(/-/g, ' ');

export function summaryMarker(commit) {
  return `${BOT_TAG} · commit \`${commit}\``;
}

export function hasSummaryForCommit(comments, commit) {
  return comments.some(c => {
    const m = c?.content?.raw?.match(SUMMARY_MARKER_RE);
    return m && !c.deleted && (m[1].startsWith(commit) || commit.startsWith(m[1]));
  });
}

export function extractExistingInlineFindings(comments) {
  return comments
    .filter(c => !c.deleted && c.inline?.path && c.content?.raw?.includes(BOT_TAG))
    .map(c => {
      const m = c.content.raw.match(INLINE_TITLE_RE);
      return m ? { path: c.inline.path, title: m[2].trim() } : null;
    })
    .filter(Boolean);
}

export function formatInlineComment(f) {
  const lines = [`**[${f.severity.toUpperCase()}] ${label(f.category)}:** ${f.title}`, '', f.body];
  if (f.suggestion) lines.push('', '**Suggestion:**', f.suggestion);
  lines.push('', `<sub>${BOT_TAG} · confidence ${Math.round(f.confidence * 100)}%</sub>`);
  return lines.join('\n');
}

export function formatSummaryComment(result, { commit, stats, ignoredFiles = [], failedInline = [] }) {
  const counts = Object.fromEntries(['critical', 'high', 'medium', 'low'].map(s => [s, result.findings.filter(f => f.severity === s).length]));
  const out = [
    '## AI Code Review',
    '',
    `**Verdict:** ${VERDICT_LABEL[result.verdict]}  `,
    `**Findings:** ${counts.critical} critical · ${counts.high} high · ${counts.medium} medium · ${counts.low} low  `,
    `**Scope:** ${stats.files} file(s), +${stats.linesAdded} / -${stats.linesRemoved}`,
    ''
  ];
  if (result.summary) out.push('### Summary', result.summary, '');

  if (result.inline.length) {
    out.push('### Inline findings');
    for (const f of result.inline) out.push(`- **[${f.severity.toUpperCase()}]** \`${f.path}${f.line ? `:${f.line}` : ''}\` — ${f.title}`);
    out.push('');
  }

  const extra = [...result.overflow, ...failedInline];
  if (extra.length) {
    out.push('### Additional findings');
    for (const f of extra) {
      out.push(`- **[${f.severity.toUpperCase()}]** \`${f.path}${f.line ? `:${f.line}` : ''}\` — ${f.title}`);
      if (f.body) out.push(`  ${f.body.replace(/\n/g, '\n  ')}`);
      if (f.suggestion) out.push(`  *Suggestion:* ${f.suggestion.replace(/\n/g, '\n  ')}`);
    }
    out.push('');
  }

  const notes = [];
  if (result.skippedFiles.length) notes.push(`Not reviewed (size limit): ${result.skippedFiles.map(p => `\`${p}\``).join(', ')}`);
  if (ignoredFiles.length) notes.push(`Ignored (generated/binary/filtered): ${ignoredFiles.length} file(s)`);
  if (result.failedChunks) notes.push(`${result.failedChunks} of ${result.totalChunks} review chunk(s) failed; results may be incomplete.`);
  if (notes.length) out.push('### Notes', ...notes.map(n => `- ${n}`), '');

  out.push('---', `*${summaryMarker(commit)} · ${result.model}*`);
  return out.join('\n');
}
