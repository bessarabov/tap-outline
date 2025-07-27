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

export function parseTap(tapText: string): { roots: OutlineNode[]; diagnostics: DiagnosticInfo[] } {
  const roots: OutlineNode[] = [];
  const diagnostics: DiagnosticInfo[] = [];

  // Open groups stack (represents anonymous subtest containers by indent)
  const stack: OutlineNode[] = [];
  // Recently-closed groups waiting for their summary line at a shallower depth
  const awaiting: Record<number, OutlineNode[]> = Object.create(null);

  const lines = tapText.split(/\r?\n/);

  for (let idx = 0; idx < lines.length; idx++) {
    const raw = lines[idx];

    // Tabs → four spaces for indent math
    const line = raw.replace(/\t/g, '    ');
    const trimmed = line.trimStart();

    // Ignore depth changes for **blank lines** entirely
    if (trimmed.length === 0) continue;

    const indent = line.length - trimmed.length;
    const depth = Math.floor(indent / 4);

    const isAssertion = /^(ok|not ok)\b/i.test(trimmed);

    if (isAssertion) {
      // Close groups to this depth; closed ones await a summary at this depth
      while (stack.length > depth) {
        const closed = stack.pop()!;
        (awaiting[depth] ||= []).push(closed);
      }

      // Open anonymous groups up to this depth **only now** (on an assertion)
      while (stack.length < depth) {
        const anon: OutlineNode = { label: '', line: idx, ok: null, children: [] };
        appendNode(anon);
        stack.push(anon);
      }

      const isOk = trimmed.toLowerCase().startsWith('ok');
      const labelText = trimmed.replace(/^(ok|not ok)\b\s*\d*\s*-?\s*/i, '').trim();

      // If a group just closed at this depth, this assertion is its summary
      const waiting = awaiting[depth];
      if (waiting && waiting.length) {
        const group = waiting.pop()!;
        group.ok = isOk;
        group.label = `${isOk ? '✓' : '✗'}${labelText ? ' ' + labelText : ''}`;
        group.line = idx;
        if (!isOk) diagnostics.push({ line: idx, message: labelText || trimmed });
        continue;
      }

      // Otherwise it's a normal assertion
      const node: OutlineNode = {
        label: `${isOk ? '✓' : '✗'}${labelText ? ' ' + labelText : ''}`,
        line: idx,
        ok: isOk,
        children: [],
      };
      if (!isOk) diagnostics.push({ line: idx, message: labelText || trimmed });
      appendNode(node);
      continue;
    }

    // Non-assertion lines:
    // - Do NOT open groups on deeper indent (prevents stray containers)
    // - We also avoid popping groups here; the real structural dedent
    //   we care about will be on the summary assertion line.
    // So we intentionally do nothing.
  }

  return { roots, diagnostics };

  function appendNode(node: OutlineNode) {
    if (stack.length) {
      stack[stack.length - 1].children.push(node);
    } else {
      roots.push(node);
    }
  }
}
