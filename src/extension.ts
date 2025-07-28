import * as vscode from 'vscode';
import { parseTap, OutlineNode } from './tapParser';

export function activate(ctx: vscode.ExtensionContext) {
  const selector: vscode.DocumentSelector = [
    { language: 'tap', scheme: 'file' },
    { scheme: 'file', pattern: '**/*.{tap,t}' },
  ];

  // ── Outline provider ─────────────────────────────────────────
  ctx.subscriptions.push(
    vscode.languages.registerDocumentSymbolProvider(selector, new TapOutlineProvider())
  );

  // ── Decorations ──────────────────────────────────────────────
  const notOkDecoration = vscode.window.createTextEditorDecorationType({
    color: '#000000', // black text
    backgroundColor: '#ff4d4d', // red background (dark)
    dark: { backgroundColor: '#ff4d4d' },
    light: { backgroundColor: '#ff6666' },
    rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
  });
  const okDecoration = vscode.window.createTextEditorDecorationType({
    color: '#000000', // black text
    backgroundColor: '#22c55e', // green background (dark)
    dark: { backgroundColor: '#22c55e' },
    light: { backgroundColor: '#34d399' },
    rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
  });
  ctx.subscriptions.push(notOkDecoration, okDecoration);

  const NOT_OK_RE = /^\s*(not\s+ok)\b/i;
  const OK_RE = /^\s*(ok)\b/i; // anchored so it won’t match "not ok"

  const applyTapDecorations = (editor?: vscode.TextEditor) => {
    const editors = editor ? [editor] : vscode.window.visibleTextEditors;
    for (const ed of editors) {
      if (!ed) continue;

      if (ed.document.languageId !== 'tap') {
        // Clear any previous ranges when not in TAP mode
        ed.setDecorations(notOkDecoration, []);
        ed.setDecorations(okDecoration, []);
        continue;
      }

      const notOkRanges: vscode.Range[] = [];
      const okRanges: vscode.Range[] = [];

      for (let line = 0; line < ed.document.lineCount; line++) {
        const text = ed.document.lineAt(line).text;

        const mNot = NOT_OK_RE.exec(text);
        if (mNot) {
          const startCh = mNot[0].length - mNot[1].length; // index of "not ok"
          const start = new vscode.Position(line, startCh);
          const end = new vscode.Position(line, startCh + mNot[1].length);
          notOkRanges.push(new vscode.Range(start, end));
          // Skip "ok" check if "not ok" matched
          continue;
        }

        const mOk = OK_RE.exec(text);
        if (mOk) {
          const startCh = mOk[0].length - mOk[1].length; // index of "ok"
          const start = new vscode.Position(line, startCh);
          const end = new vscode.Position(line, startCh + mOk[1].length);
          okRanges.push(new vscode.Range(start, end));
        }
      }

      ed.setDecorations(notOkDecoration, notOkRanges);
      ed.setDecorations(okDecoration, okRanges);
    }
  };

  // Initial pass
  applyTapDecorations();

  // Update when the active editor changes
  ctx.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((ed) => applyTapDecorations(ed || undefined))
  );

  // Update when visible editors set changes (split/close/open)
  ctx.subscriptions.push(vscode.window.onDidChangeVisibleTextEditors(() => applyTapDecorations()));

  // Update on content edits (debounced)
  let timer: NodeJS.Timeout | undefined;
  ctx.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((e) => {
      const isVisible = vscode.window.visibleTextEditors.some((ed) => ed.document === e.document);
      if (!isVisible) return;
      clearTimeout(timer);
      timer = setTimeout(() => applyTapDecorations(), 100);
    })
  );

  // Re-apply (or clear) when a document is opened or its language mode changes
  ctx.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument((doc) => {
      const ed = vscode.window.visibleTextEditors.find((e) => e.document === doc);
      if (ed) applyTapDecorations(ed);
    })
  );
}

/* ───────────────────────────────────────────────────────────── */

class TapOutlineProvider implements vscode.DocumentSymbolProvider {
  private static diagCollection = vscode.languages.createDiagnosticCollection('tap');

  provideDocumentSymbols(
    doc: vscode.TextDocument,
    _token: vscode.CancellationToken
  ): vscode.DocumentSymbol[] {
    /* ← synchronous call – no await needed */
    const { roots, diagnostics } = parseTap(doc.getText());

    /* map pure nodes → VS Code symbols */
    const symbols = roots.map((n) => toSymbol(n, doc));

    /* diagnostics */
    const vsDiags = diagnostics.map(
      (d) =>
        new vscode.Diagnostic(doc.lineAt(d.line).range, d.message, vscode.DiagnosticSeverity.Error)
    );
    TapOutlineProvider.diagCollection.set(doc.uri, vsDiags);

    return symbols;
  }
}

/* ───────────────────────────────────────────────────────────── */

function toSymbol(node: OutlineNode, doc: vscode.TextDocument): vscode.DocumentSymbol {
  const range = doc.lineAt(Math.min(node.line, doc.lineCount - 1)).range;

  const kind =
    node.ok === null
      ? vscode.SymbolKind.Namespace
      : node.ok
        ? vscode.SymbolKind.File
        : vscode.SymbolKind.Event;

  const sym = new vscode.DocumentSymbol(node.label, '', kind, range, range);
  sym.children = node.children.map((c) => toSymbol(c, doc));
  return sym;
}
