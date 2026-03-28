import * as vscode from 'vscode'

export class FileExplorer implements vscode.TreeDataProvider<MermaidFileItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<MermaidFileItem | undefined>()
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event
  private watcher: vscode.FileSystemWatcher

  constructor() {
    this.watcher = vscode.workspace.createFileSystemWatcher('**/*.{mmd,mermaid}')
    this.watcher.onDidCreate(() => this.refresh())
    this.watcher.onDidDelete(() => this.refresh())
  }

  refresh() { this._onDidChangeTreeData.fire(undefined) }

  getTreeItem(element: MermaidFileItem): vscode.TreeItem { return element }

  async getChildren(element?: MermaidFileItem): Promise<MermaidFileItem[]> {
    if (!vscode.workspace.workspaceFolders || element) return []
    const files = await vscode.workspace.findFiles('**/*.{mmd,mermaid}', '**/node_modules/**')
    return files
      .sort((a, b) => a.fsPath.localeCompare(b.fsPath))
      .map(uri => new MermaidFileItem(uri))
  }
}

class MermaidFileItem extends vscode.TreeItem {
  constructor(public readonly uri: vscode.Uri) {
    super(vscode.workspace.asRelativePath(uri), vscode.TreeItemCollapsibleState.None)
    this.tooltip = uri.fsPath
    this.iconPath = new vscode.ThemeIcon('file')
    this.command = { command: 'vscode.open', arguments: [uri], title: 'Open' }
  }
}
