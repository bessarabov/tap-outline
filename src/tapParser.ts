import Parser from 'tap-parser';

export interface OutlineNode {
  label: string;
  line: number; // 0‑based
  ok: boolean | null;
  children: OutlineNode[];
}

export interface DiagnosticInfo {
  line: number;
  message: string;
}

/**
 * Synchronous TAP → outline + diagnostics
 */
export function parseTap(tapText: string): { roots: OutlineNode[]; diagnostics: DiagnosticInfo[] } {
  const roots: OutlineNode[] = [];
  const diagnostics: DiagnosticInfo[] = [];
  const parser = new Parser();

  /* ───────────────────────────────────────────────
     track the *last* line we fully pushed to the parser
     (starts at −1 so the very first assert becomes 0)
  ─────────────────────────────────────────────── */
  let currentLine = -1;

  /* 1️⃣ top‑level asserts */
  parser.on('assert', (t: any) => {
    roots.push(createAssertNode(t, currentLine));
  });

  /* 2️⃣ sub‑tests & their nested asserts */
  parser.on('child', (sub: any) => {
    const parent = createNamespaceNode(sub, currentLine);
    roots.push(parent);

    sub.on('assert', (t: any) => {
      parent.children.push(createAssertNode(t, currentLine));
    });
  });

  /* 3️⃣ stream every line, THEN bump the index */
  const lines = tapText.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    parser.write(lines[i] + '\n'); // events may fire *here*
    currentLine = i; // …so they see the correct line
  }
  parser.end();

  return { roots, diagnostics };

  /* helpers ─────────────────────────────────────── */

  function createAssertNode(t: any, line: number): OutlineNode {
    if (!t.ok) diagnostics.push({ line, message: t.diag?.message || t.name });
    return {
      label: `${t.ok ? '✓' : '✗'}${t.name ? ' ' + t.name : ''}`,
      line,
      ok: t.ok,
      children: [],
    };
  }

  function createNamespaceNode(sub: any, line: number): OutlineNode {
    return { label: `⤷ ${sub.name}`, line, ok: null, children: [] };
  }
}
