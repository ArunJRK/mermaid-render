import * as vscode from 'vscode'
import { RendererPanel } from './renderer-panel'
import { FileExplorer } from './file-explorer'

export function activate(context: vscode.ExtensionContext) {
  const fileExplorer = new FileExplorer()

  context.subscriptions.push(
    vscode.commands.registerCommand('mermaidRender.openPreview', () => {
      const editor = vscode.window.activeTextEditor
      if (editor) {
        RendererPanel.createOrShow(context.extensionUri, editor.document)
      }
    }),

    vscode.commands.registerCommand('mermaidRender.foldAll', () => {
      RendererPanel.current?.postMessage({ type: 'foldAll' })
    }),

    vscode.commands.registerCommand('mermaidRender.unfoldAll', () => {
      RendererPanel.current?.postMessage({ type: 'unfoldAll' })
    }),

    vscode.window.registerTreeDataProvider('mermaidRender.fileExplorer', fileExplorer),

    vscode.workspace.onDidSaveTextDocument((doc) => {
      if (doc.fileName.endsWith('.mmd') || doc.fileName.endsWith('.mermaid')) {
        RendererPanel.current?.reload(doc)
      }
    }),
  )
}

export function deactivate() {}
