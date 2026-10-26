import { renderFileDiff, truncateText } from '../utils/diff.js';

// Groups files into LLM-sized chunks. Each entry carries its rendered diff and optional full file
// content (for surrounding context). Oversized files are truncated rather than dropped.
export function buildChunks(files, { maxChunkChars, maxChunks, contents = new Map() }) {
  const entries = files.map(file => {
    let diff = renderFileDiff(file);
    if (diff.length > maxChunkChars) diff = truncateText(diff, Math.floor(maxChunkChars * 0.9));
    let context = contents.get(file.path) || '';
    if (context && diff.length + context.length > maxChunkChars) context = '';
    return { file, diff, context, size: diff.length + context.length };
  });

  const chunks = [];
  let current = [];
  let size = 0;
  for (const entry of entries) {
    if (current.length && size + entry.size > maxChunkChars) {
      chunks.push(current);
      current = [];
      size = 0;
    }
    current.push(entry);
    size += entry.size;
  }
  if (current.length) chunks.push(current);

  const kept = chunks.slice(0, maxChunks);
  const skipped = chunks.slice(maxChunks).flat().map(e => e.file.path);
  return { chunks: kept, skipped };
}
