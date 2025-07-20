import * as vscode from 'vscode';
import Parser from 'tap-parser';

export function activate(ctx: vscode.ExtensionContext) {
  const selector: vscode.DocumentSelector = [
    { language: 'tap', scheme: 'file' }, // when VS Code already tags the doc as TAP
    { scheme: 'file', pattern: '**/*.{tap,t}' }, // fallback by extension
  ];

  ctx.subscriptions.push(
    vscode.languages.registerDocumentSymbolProvider(selector, new TapOutlineProvider())
  );
}

class TapOutlineProvider implements vscode.DocumentSymbolProvider {
  async provideDocumentSymbols(
    doc: vscode.TextDocument,
    _token: vscode.CancellationToken
  ): Promise<vscode.DocumentSymbol[]> {
    const symbols: vscode.DocumentSymbol[] = [];
    const diags: vscode.Diagnostic[] = [];
    const parser = new Parser();

    // top‑level assertions
    parser.on('assert', (t: any) => {
      const lineIdx = typeof t.line === 'number' && t.line > 0 ? t.line - 1 : 0;
      const range = doc.lineAt(Math.min(lineIdx, doc.lineCount - 1)).range;

      const kind = t.ok ? vscode.SymbolKind.File : vscode.SymbolKind.Event;

      symbols.push(
        new vscode.DocumentSymbol(`${t.ok ? '✓' : '✗'} ${t.name}`, '', kind, range, range)
      );

      if (!t.ok) {
        diags.push(
          new vscode.Diagnostic(range, t.diag?.message || t.name, vscode.DiagnosticSeverity.Error)
        );
      }
    });

    // sub‑tests
    parser.on('child', (sub: any) => {
      const parentLine = Math.max(0, (sub.line || 1) - 1);
      const headerRange = doc.lineAt(Math.min(parentLine, doc.lineCount - 1)).range;

      const parent = new vscode.DocumentSymbol(
        `⤷ ${sub.name}`,
        '',
        vscode.SymbolKind.Namespace,
        headerRange,
        headerRange
      );
      symbols.push(parent);

      sub.on('assert', (t: any) => {
        const childIdx = Math.min((t.line || 1) - 1, doc.lineCount - 1);
        const childRange = doc.lineAt(childIdx).range;

        const kind = t.ok ? vscode.SymbolKind.File : vscode.SymbolKind.Event;

        parent.children.push(
          new vscode.DocumentSymbol(
            `${t.ok ? '✓' : '✗'} ${t.name}`,
            '',
            kind,
            childRange,
            childRange
          )
        );

        if (!t.ok) {
          diags.push(new vscode.Diagnostic(childRange, t.name, vscode.DiagnosticSeverity.Error));
        }
      });
    });

    return new Promise((resolve) => {
      parser.on('complete', () => {
        TapOutlineProvider.diagCollection.set(doc.uri, diags);
        resolve(symbols);
      });

      // feed file contents to tap‑parser
      for (const line of doc.getText().split(/\r?\n/)) {
        parser.write(line + '\n');
      }
      parser.end();
    });
  }

  private static diagCollection = vscode.languages.createDiagnosticCollection('tap');
}
