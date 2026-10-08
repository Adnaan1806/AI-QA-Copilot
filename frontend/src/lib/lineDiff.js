// Line diff for comparing one automation try's script with the next.
// Scripts are short (well under a few hundred lines), so a plain LCS table is fine.

export function lineDiff(before, after) {
  const a = before.split("\n");
  const b = after.split("\n");
  // lcs[i][j] = length of the longest common subsequence of a[i:] and b[j:]
  const lcs = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const lines = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      lines.push({ type: "same", text: a[i] });
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      lines.push({ type: "del", text: a[i++] });
    } else {
      lines.push({ type: "add", text: b[j++] });
    }
  }
  while (i < a.length) lines.push({ type: "del", text: a[i++] });
  while (j < b.length) lines.push({ type: "add", text: b[j++] });
  return lines;
}

// Unchanged stretches longer than this collapse to a "N unchanged lines" marker,
// keeping CONTEXT lines on each side of a change.
const CONTEXT = 2;

export function collapseUnchanged(lines) {
  const out = [];
  let run = [];
  const flush = (atStart, atEnd) => {
    const keepBefore = atStart ? 0 : CONTEXT;
    const keepAfter = atEnd ? 0 : CONTEXT;
    if (run.length > keepBefore + keepAfter + 1) {
      out.push(...run.slice(0, keepBefore));
      out.push({ type: "skip", count: run.length - keepBefore - keepAfter });
      out.push(...run.slice(run.length - keepAfter));
    } else {
      out.push(...run);
    }
    run = [];
  };
  lines.forEach((line) => {
    if (line.type === "same") {
      run.push(line);
    } else {
      flush(out.length === 0, false);
      out.push(line);
    }
  });
  flush(out.length === 0, true);
  return out;
}

// Assertion lines a fix removed or rewrote. Healing may fix how a script reaches
// the page, but a changed check deserves a reviewer's eye.
export function changedChecks(lines) {
  return lines.filter((line) => line.type === "del" && /\bexpect\s*\(/.test(line.text)).map((line) => line.text.trim());
}

export function diffStats(lines) {
  return {
    added: lines.filter((line) => line.type === "add").length,
    removed: lines.filter((line) => line.type === "del").length,
  };
}
