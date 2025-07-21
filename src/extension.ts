import * as vscode from 'vscode';
import { parseTap, OutlineNode } from './tapParser';

export function activate(ctx: vscode.ExtensionContext) {
  const selector: vscode.DocumentSelector = [
    { language: 'tap', scheme: 'file' },
    { scheme: 'file', pattern: '**/*.{tap,t}' },
  ];

  ctx.subscriptions.push(
    vscode.languages.registerDocumentSymbolProvider(selector, new TapOutlineProvider())
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

    /* map pure nodes → VS Code symbols */
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
