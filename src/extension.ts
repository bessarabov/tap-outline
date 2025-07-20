import * as vscode from 'vscode';
import Parser from 'tap-parser';

export function activate(ctx: vscode.ExtensionContext) {
  const selector: vscode.DocumentSelector = [
    { language: 'tap', scheme: 'file' }, // preferred – fires on any file VS Code already classifies as TAP
    { scheme: 'file', pattern: '**/*.{tap,t}' }, // fallback for raw pattern match
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

    // --- debug helpers ----------------------------------
    console.log('[tap-outline] parsing', doc.uri.fsPath);
    parser.on('assert', (t: any) => console.log('[assert]', t.name, t.ok));
    parser.on('complete', () => console.log('[complete]'));
    parser.on('line', (l: any) => {
      /* tap-parser v10 emits 'line' */
    });
    // -----------------------------------------------------

    parser.on('assert', (t: any) => {
      // fall back to first column if tap-parser doesn't give line numbers
      const line = typeof t.line === 'number' && t.line > 0 ? t.line - 1 : 0;
      const range = doc.lineAt(Math.min(line, doc.lineCount - 1)).range;

      symbols.push(
        new vscode.DocumentSymbol(
          `${t.ok ? '✓' : '✗'} ${t.name}`,
          '',
          vscode.SymbolKind.Method,
          range,
          range
        )
      );

      if (!t.ok) {
        diags.push(
          new vscode.Diagnostic(range, t.diag?.message || t.name, vscode.DiagnosticSeverity.Error)
        );
      }
    });

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
        const childRange = doc.lineAt(Math.min((t.line || 1) - 1, doc.lineCount - 1)).range;
        parent.children.push(
          new vscode.DocumentSymbol(
            `${t.ok ? '✓' : '✗'} ${t.name}`,
            '',
            vscode.SymbolKind.Method,
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

      // feed data
      for (const line of doc.getText().split(/\r?\n/)) {
        parser.write(line + '\n');
      }
      parser.end();
    });
  }

  private static diagCollection = vscode.languages.createDiagnosticCollection('tap');
}
