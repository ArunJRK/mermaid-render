import * as vscode from 'vscode'

export class RendererPanel {
  static current: RendererPanel | undefined
  private panel: vscode.WebviewPanel
  private disposables: vscode.Disposable[] = []
  private currentDocument: vscode.TextDocument | undefined

  static createOrShow(extensionUri: vscode.Uri, document: vscode.TextDocument) {
    const column = vscode.ViewColumn.Beside

    if (RendererPanel.current) {
      RendererPanel.current.panel.reveal(column)
      RendererPanel.current.reload(document)
      return
    }

    const panel = vscode.window.createWebviewPanel(
      'mermaidRender', 'Mermaid Preview', column,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'dist')],
      }
    )

    RendererPanel.current = new RendererPanel(panel, extensionUri, document)
  }

  private constructor(
    panel: vscode.WebviewPanel,
    private extensionUri: vscode.Uri,
    document: vscode.TextDocument
  ) {
    this.panel = panel
    this.currentDocument = document

    const scriptUri = this.panel.webview.asWebviewUri(
      vscode.Uri.joinPath(extensionUri, 'dist', 'webview.js')
    )

    this.panel.webview.html = this.getHtml(scriptUri)

    this.panel.webview.onDidReceiveMessage(
      (msg) => {
        switch (msg.type) {
          case 'navigate':
            this.handleNavigate(msg.targetFile)
            break
          case 'ready':
            if (this.currentDocument) this.reload(this.currentDocument)
            break
        }
      },
      null,
      this.disposables
    )

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables)
  }

  reload(document: vscode.TextDocument) {
    this.currentDocument = document
    this.panel.webview.postMessage({
      type: 'load',
      source: document.getText(),
    })
  }

  postMessage(msg: any) {
    this.panel.webview.postMessage(msg)
  }

  private handleNavigate(targetFile: string) {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri
    if (!workspaceRoot) return

    const fileUri = vscode.Uri.joinPath(workspaceRoot, targetFile)
    vscode.workspace.openTextDocument(fileUri).then(
      (doc) => {
        this.reload(doc)
      },
      () => {
        vscode.window.showWarningMessage(`Mermaid file not found: ${targetFile}`)
      }
    )
  }

  private getHtml(scriptUri: vscode.Uri): string {
    return `<!DOCTYPE html>
<html>
<head>
  <style>
    body { margin: 0; overflow: hidden; background: #111827; }
    canvas { width: 100vw; height: 100vh; display: block; }
  </style>
</head>
<body>
  <canvas id="canvas"></canvas>
  <script src="${scriptUri}"></script>
</body>
</html>`
  }

  private dispose() {
    RendererPanel.current = undefined
    this.panel.dispose()
    for (const d of this.disposables) d.dispose()
  }
}
