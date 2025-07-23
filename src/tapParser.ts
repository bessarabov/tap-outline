/*  src/tapParser.ts
    A tiny, dependency‑free TAP parser that builds
    an outline tree and collects failing‑test diagnostics.
*/

export interface OutlineNode {
  label: string; // human‑readable label
  line: number; // 0‑based line number
  ok: boolean | null; // true = pass, false = fail, null = grouping node
  children: OutlineNode[];
}

export interface DiagnosticInfo {
  line: number; // 0‑based line number
  message: string;
}

/**
 * Parse TAP text into an outline tree and diagnostics list.
 * – Indentation (groups of 4 spaces or tabs) determines nesting.
 * – Lines starting with “ok” / “not ok” become assert nodes.
 * – Lines starting with “# Subtest:” become namespace nodes.
 */
export function parseTap(tapText: string): { roots: OutlineNode[]; diagnostics: DiagnosticInfo[] } {
  const roots: OutlineNode[] = [];
  const diagnostics: DiagnosticInfo[] = [];
  const stack: OutlineNode[] = []; // keeps the current ancestry

  const lines = tapText.split(/\r?\n/);

  lines.forEach((raw, idx) => {
    // Tabs → four spaces (TAP spec allows either for indenting subtests)
    const line = raw.replace(/\t/g, '    ');
    const trimmed = line.trimStart();
    const indent = line.length - trimmed.length;
    const depth = Math.floor(indent / 4); // 0,1,2,…

    // Walk the stack back up to our current depth
    while (stack.length > depth) stack.pop();

    /* 1️⃣  "ok" / "not ok" assertions ─────────────────────────── */
    if (/^(ok|not ok)\b/i.test(trimmed)) {
      const ok = trimmed.toLowerCase().startsWith('ok');
      const labelText = trimmed.replace(/^(ok|not ok)\b\s*\d*\s*-?\s*/i, ''); // strip leading tokens & optional index/“-”
      const node: OutlineNode = {
        label: `${ok ? '✓' : '✗'}${labelText ? ' ' + labelText : ''}`,
        line: idx,
        ok,
        children: [],
      };
      if (!ok) diagnostics.push({ line: idx, message: labelText || trimmed });

      appendNode(node);
      return; // done for this line
    }

    /* 2️⃣  "# Subtest:" namespaces ────────────────────────────── */
    const subMatch = /^#\s*subtest:\s*(.+)/i.exec(trimmed);
    if (subMatch) {
      const node: OutlineNode = {
        label: `⤷ ${subMatch[1].trim()}`,
        line: idx,
        ok: null,
        children: [],
      };
      appendNode(node);
      stack.push(node); // descend into this subtest
    }

    // All other lines are ignored.
  });

  return { roots, diagnostics };

  /* helper – attach node to the correct parent (or roots) */
  function appendNode(node: OutlineNode) {
    if (stack.length) {
      stack[stack.length - 1].children.push(node);
    } else {
      roots.push(node);
    }
  }
}
