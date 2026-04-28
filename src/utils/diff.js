export function summarizeDiffstat(values = []) {
  return values.reduce((acc, item) => {
    acc.files += 1;
    acc.linesAdded += item.lines_added || 0;
    acc.linesRemoved += item.lines_removed || 0;
    return acc;
  }, { files: 0, linesAdded: 0, linesRemoved: 0 });
}

export function extractChangedPaths(values = []) {
  return values.map(v => v?.new?.path || v?.old?.path).filter(Boolean);
}

export function filterInterestingFiles(paths = []) {
  return paths.filter(p => /src\/main\/java|src\/test\/java|pom\.xml|build\.gradle|application\.(ya?ml|properties)|openapi|swagger/i.test(p));
}

export function truncateText(text, maxChars) {
  if (!text || text.length <= maxChars) return text || '';
  return `${text.slice(0, maxChars)}\n\n[TRUNCATED]`;
}
