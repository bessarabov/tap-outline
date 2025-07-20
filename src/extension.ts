import * as vscode from 'vscode';
import Parser from 'tap-parser';

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
  async provideDocumentSymbols(
    doc: vscode.TextDocument,
    _token: vscode.CancellationToken
  ): Promise<vscode.DocumentSymbol[]> {
    const roots: vscode.DocumentSymbol[] = [];
    const diags: vscode.Diagnostic[] = [];
    const parser = new Parser();

    /** holds the line index of *the line we just wrote* to tap‑parser */
    let currentLine = 0;

    /* 1️⃣ top‑level asserts */
    parser.on('assert', (t: any) => {
      roots.push(createAssertSymbol(t, currentLine));
    });

    /* 2️⃣ sub‑tests & their asserts */
    parser.on('child', (sub: any) => {
      const parent = createNamespaceSymbol(sub, currentLine);
      roots.push(parent);

      sub.on('assert', (t: any) => {
        parent.children.push(createAssertSymbol(t, currentLine));
      });
    });

    /* 3️⃣ finish + diagnostics */
    return new Promise((resolve) => {
      parser.on('complete', () => {
        TapOutlineProvider.diagCollection.set(doc.uri, diags);
        resolve(roots); // symbols already ordered by appearance
      });

      /* feed the file line‑by‑line, tracking the line number */
      const lines = doc.getText().split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        currentLine = i;
        parser.write(lines[i] + '\n');
      }
      parser.end();
    });

    /* helper: make a pass/fail symbol */
    function createAssertSymbol(t: any, lineIdx: number): vscode.DocumentSymbol {
      const range = doc.lineAt(Math.min(lineIdx, doc.lineCount - 1)).range;
      const kind = t.ok ? vscode.SymbolKind.File : vscode.SymbolKind.Event;

      if (!t.ok) {
        diags.push(
          new vscode.Diagnostic(range, t.diag?.message || t.name, vscode.DiagnosticSeverity.Error)
        );
      }

      return new vscode.DocumentSymbol(`${t.ok ? '✓' : '✗'} ${t.name}`, '', kind, range, range);
    }

    /* helper: make the sub‑test header symbol */
    function createNamespaceSymbol(sub: any, lineIdx: number): vscode.DocumentSymbol {
      const range = doc.lineAt(Math.min(lineIdx, doc.lineCount - 1)).range;
      return new vscode.DocumentSymbol(
        `⤷ ${sub.name}`,
        '',
        vscode.SymbolKind.Namespace,
        range,
        range
      );
    }
  }

  private static diagCollection = vscode.languages.createDiagnosticCollection('tap');
}
