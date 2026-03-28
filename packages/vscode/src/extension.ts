import * as vscode from 'vscode'
import { FileExplorer } from './file-explorer'

export function activate(context: vscode.ExtensionContext) {
  const fileExplorer = new FileExplorer()

  context.subscriptions.push(
    vscode.commands.registerCommand('mermaidRender.openPreview', () => {
      const editor = vscode.window.activeTextEditor
      if (!editor) return
      // RendererPanel will be implemented in a later chunk
      vscode.window.showInformationMessage(`Mermaid Preview: ${editor.document.fileName}`)
    }),

    vscode.commands.registerCommand('mermaidRender.foldAll', () => {
      // Will be wired to renderer panel in later chunk
    }),

    vscode.commands.registerCommand('mermaidRender.unfoldAll', () => {
      // Will be wired to renderer panel in later chunk
    }),

    vscode.window.registerTreeDataProvider('mermaidRender.fileExplorer', fileExplorer),

    vscode.workspace.onDidSaveTextDocument((doc) => {
      if (doc.fileName.endsWith('.mmd') || doc.fileName.endsWith('.mermaid')) {
        // Will trigger reload in later chunk
      }
    }),
  )
}

export function deactivate() {}
