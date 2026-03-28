Feature: VS Code Extension
  As a developer using VS Code
  I want to preview Mermaid diagrams interactively
  So that I can navigate complex architectures within my editor

  # --- File Explorer ---

  Scenario: Show .mmd files in sidebar
    Given a workspace with files: "src/flow.mmd", "src/auth.mmd", "README.md"
    When the extension activates
    Then the Mermaid file explorer should list 2 files
    And "src/flow.mmd" and "src/auth.mmd" should be listed
    And "README.md" should not be listed

  Scenario: Show .mermaid files too
    Given a workspace with files: "diagram.mermaid"
    When the extension activates
    Then the Mermaid file explorer should list 1 file

  Scenario: Refresh when new .mmd file is created
    Given the Mermaid file explorer is showing 1 file
    When a new file "new-diagram.mmd" is created in the workspace
    Then the file explorer should refresh and show 2 files

  # --- Preview Panel ---

  Scenario: Open preview for current .mmd file
    Given an open editor with "flow.mmd" containing "graph TD\n A --> B"
    When I run command "mermaidRender.openPreview"
    Then a webview panel should open beside the editor
    And the panel should send a "load" message with the file contents

  Scenario: Hot-reload on save
    Given a preview panel is open for "flow.mmd"
    When I save "flow.mmd" with new content
    Then the panel should receive a "load" message with the updated content

  Scenario: Preview survives panel hide and reshow
    Given a preview panel is open with retainContextWhenHidden
    When the panel is hidden and then re-shown
    Then the diagram should still be rendered

  # --- Cross-File Navigation ---

  Scenario: Navigate to linked file
    Given a preview panel is rendering a diagram with:
      """
      %% @link auth -> /services/auth.mmd#loginNode
      graph TD
          auth[Auth] --> db[DB]
      """
    When the webview sends a "navigate" message with targetFile "/services/auth.mmd"
    Then the extension should open "/services/auth.mmd" in the workspace
    And the preview panel should reload with the new file's content

  Scenario: Navigate to non-existent file shows warning
    Given a preview panel is active
    When the webview sends a "navigate" message with targetFile "/nonexistent.mmd"
    Then a warning notification should be shown: "Mermaid file not found: /nonexistent.mmd"

  # --- Commands ---

  Scenario: Fold All command
    Given a preview panel is open
    When I run command "mermaidRender.foldAll"
    Then the panel should receive a "foldAll" message

  Scenario: Unfold All command
    Given a preview panel is open
    When I run command "mermaidRender.unfoldAll"
    Then the panel should receive a "unfoldAll" message

  # --- Keybinding ---

  Scenario: Ctrl+Shift+M opens preview
    Given an open editor with a .mmd file
    When the user presses Ctrl+Shift+M
    Then the "mermaidRender.openPreview" command should execute
