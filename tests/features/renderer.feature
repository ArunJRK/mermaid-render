Feature: Renderer
  As a developer using mermaid-render
  I want to render Mermaid diagrams on an interactive canvas
  So that users can zoom, pan, fold, and navigate diagrams

  # --- Loading ---

  Scenario: Load and render a simple flowchart
    Given a mounted MermaidRenderer
    When I load source "graph TD\n A[Hello] --> B[World]"
    Then the load result should be successful
    And the renderer should have 2 node sprites
    And the renderer should have 1 edge graphic

  Scenario: Load with layout philosophy option
    Given a mounted MermaidRenderer
    When I load source "graph TD\n A --> B" with layout "breath"
    Then the load result should be successful
    And the layout should use "breath" philosophy spacing

  Scenario: Load with @layout directive
    Given a mounted MermaidRenderer
    When I load source "%% @layout blueprint\ngraph TD\n A --> B"
    Then the layout should use "blueprint" philosophy spacing

  Scenario: Load invalid source shows error, preserves last render
    Given a mounted MermaidRenderer
    And I have previously loaded a valid diagram
    When I load invalid source "not valid mermaid"
    Then the load result should not be successful
    And an "error" event should have been emitted with code "PARSE_FAILED"
    And the previous diagram should still be visible

  Scenario: Concurrent load cancels previous
    Given a mounted MermaidRenderer
    When I load source "graph TD\n A --> B" without awaiting
    And I immediately load source "graph TD\n X --> Y"
    Then only the second diagram should be rendered
    And 2 node sprites should be visible (X and Y, not A and B)

  # --- Selection ---

  Scenario: Select a node
    Given a mounted MermaidRenderer with a rendered diagram
    When I select node "A"
    Then node "A" should be marked as selected
    And edges not connected to "A" should be dimmed

  Scenario: Select a different node deselects previous
    Given a mounted MermaidRenderer with node "A" selected
    When I select node "B"
    Then node "A" should not be marked as selected
    And node "B" should be marked as selected

  # --- Folding ---

  Scenario: Fold a subgraph
    Given a mounted MermaidRenderer
    And I have loaded a diagram with subgraph "backend" containing nodes "API" and "DB"
    When I fold subgraph "backend"
    Then nodes "API" and "DB" should not be visible
    And a summary node for "backend" should be visible
    And a "fold:change" event should have been emitted with nodeId "backend" and collapsed true

  Scenario: Unfold a subgraph
    Given a mounted MermaidRenderer with subgraph "backend" folded
    When I unfold subgraph "backend"
    Then nodes "API" and "DB" should be visible again
    And the summary node for "backend" should not be visible

  Scenario: Fold all subgraphs
    Given a mounted MermaidRenderer with 2 subgraphs
    When I call foldAll
    Then all subgraphs should be collapsed
    And only summary nodes should be visible for each subgraph

  Scenario: Unfold all subgraphs
    Given a mounted MermaidRenderer with all subgraphs folded
    When I call unfoldAll
    Then all child nodes should be visible

  # --- Cross-File Links ---

  Scenario: Node with @link emits navigate event on click
    Given a mounted MermaidRenderer
    And I have loaded:
      """
      %% @link auth -> /services/auth.mmd#login
      graph TD
          auth[Auth Service] --> db[DB]
      """
    When I click node "auth"
    Then a "link:navigate" event should be emitted
    And the event should contain targetFile "/services/auth.mmd" and targetNode "login"

  Scenario: Node without @link does not emit navigate
    Given a mounted MermaidRenderer with a rendered diagram
    When I click a node that has no cross-file link
    Then a "node:click" event should be emitted
    And a "link:navigate" event should NOT be emitted

  # --- Viewport ---

  Scenario: Fit to view
    Given a mounted MermaidRenderer with a rendered diagram
    When I call fitToView
    Then the entire diagram should be visible within the canvas bounds

  Scenario: Reset view
    Given a mounted MermaidRenderer that has been zoomed and panned
    When I call resetView
    Then the zoom should be 1.0
    And the viewport offset should be 0, 0

  # --- Events ---

  Scenario: Event unsubscription
    Given a mounted MermaidRenderer
    And I have subscribed a handler to "node:click"
    When I unsubscribe the handler using off()
    And I click a node
    Then the handler should NOT be called

  # --- Lifecycle ---

  Scenario: Destroy cleans up
    Given a mounted MermaidRenderer with a rendered diagram
    When I call destroy
    Then the canvas should be cleared
    And all event listeners should be removed
    And subsequent calls to load should throw or no-op
