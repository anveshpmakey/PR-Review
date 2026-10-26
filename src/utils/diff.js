// Parses unified git diffs (as returned by Bitbucket's /diff endpoint) into structured files and
// renders them with explicit new-file line numbers so the LLM can anchor comments precisely.

const HUNK_RE = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/;

function stripPrefix(p) {
  if (!p || p === '/dev/null') return null;
  return p.replace(/^[ab]\//, '').replace(/\t.*$/, '').replace(/^"(.*)"$/, '$1');
}

export function parseUnifiedDiff(diffText = '') {
  const files = [];
  let file = null;
  let hunk = null;
  let oldLine = 0;
  let newLine = 0;

  const lines = diffText.split('\n');
  for (const line of lines) {
    if (line.startsWith('diff --git ')) {
      const m = line.match(/^diff --git "?a\/(.+?)"? "?b\/(.+?)"?$/);
      file = {
        path: m ? m[2] : null,
        oldPath: m ? m[1] : null,
        status: 'modified',
        isBinary: false,
        hunks: [],
        additions: 0,
        deletions: 0
      };
      files.push(file);
      hunk = null;
      continue;
    }
    if (!file) continue;

    if (!hunk) {
      if (line.startsWith('new file mode')) file.status = 'added';
      else if (line.startsWith('deleted file mode')) file.status = 'deleted';
      else if (line.startsWith('rename from ')) { file.status = 'renamed'; file.oldPath = line.slice(12); }
      else if (line.startsWith('rename to ')) file.path = line.slice(10);
      else if (line.startsWith('Binary files') || line.startsWith('GIT binary patch')) file.isBinary = true;
      else if (line.startsWith('--- ')) file.oldPath = stripPrefix(line.slice(4)) ?? file.oldPath;
      else if (line.startsWith('+++ ')) {
        const p = stripPrefix(line.slice(4));
        if (p) file.path = p;
        else file.status = 'deleted';
      }
    }

    const hm = line.match(HUNK_RE);
    if (hm) {
      oldLine = Number(hm[1]);
      newLine = Number(hm[3]);
      hunk = { header: line, lines: [] };
      file.hunks.push(hunk);
      continue;
    }
    if (!hunk) continue;

    if (line.startsWith('+')) {
      hunk.lines.push({ type: 'add', newLine, content: line.slice(1) });
      newLine += 1;
      file.additions += 1;
    } else if (line.startsWith('-')) {
      hunk.lines.push({ type: 'del', oldLine, content: line.slice(1) });
      oldLine += 1;
      file.deletions += 1;
    } else if (line.startsWith(' ')) {
      hunk.lines.push({ type: 'ctx', oldLine, newLine, content: line.slice(1) });
      oldLine += 1;
      newLine += 1;
    } else if (line.startsWith('\\')) {
      // "\ No newline at end of file"
    }
  }

  for (const f of files) {
    if (!f.path) f.path = f.oldPath;
    f.addedLines = new Set();
    f.commentableLines = new Set();
    for (const h of f.hunks) {
      for (const l of h.lines) {
        if (l.type === 'add') { f.addedLines.add(l.newLine); f.commentableLines.add(l.newLine); }
        if (l.type === 'ctx') f.commentableLines.add(l.newLine);
      }
    }
  }
  return files;
}

export function renderFileDiff(file) {
  const out = [`### File: ${file.path}${file.status !== 'modified' ? ` (${file.status}${file.status === 'renamed' ? ` from ${file.oldPath}` : ''})` : ''}`];
  if (file.isBinary) return `${out[0]}\n(binary file, not shown)`;
  for (const h of file.hunks) {
    out.push(h.header);
    for (const l of h.lines) {
      if (l.type === 'add') out.push(`${String(l.newLine).padStart(5)} + ${l.content}`);
      else if (l.type === 'del') out.push(`${''.padStart(5)} - ${l.content}`);
      else out.push(`${String(l.newLine).padStart(5)}   ${l.content}`);
    }
  }
  return out.join('\n');
}

export function nearestCommentableLine(file, line, maxDistance = 3) {
  if (!file || !Number.isInteger(line)) return null;
  if (file.commentableLines.has(line)) return line;
  for (let d = 1; d <= maxDistance; d += 1) {
    if (file.addedLines.has(line - d) || file.commentableLines.has(line - d)) return line - d;
    if (file.addedLines.has(line + d) || file.commentableLines.has(line + d)) return line + d;
  }
  return null;
}

export function summarizeFiles(files = []) {
  return files.reduce((acc, f) => {
    acc.files += 1;
    acc.linesAdded += f.additions;
    acc.linesRemoved += f.deletions;
    return acc;
  }, { files: 0, linesAdded: 0, linesRemoved: 0 });
}

export function truncateText(text, maxChars) {
  if (!text || text.length <= maxChars) return text || '';
  return `${text.slice(0, maxChars)}\n[TRUNCATED]`;
}
