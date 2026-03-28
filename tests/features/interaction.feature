Feature: Interaction
  As a user viewing a Mermaid diagram
  I want to interact with the canvas via mouse and keyboard
  So that I can navigate and explore complex diagrams

  # --- Fold Manager ---

  Scenario: Toggle fold on subgraph
    Given a graph with subgraph "sg1" that is not collapsed
    When I toggle fold on "sg1"
    Then "sg1" should be collapsed

  Scenario: Toggle fold again unfolds
    Given a graph with subgraph "sg1" that is collapsed
    When I toggle fold on "sg1"
    Then "sg1" should not be collapsed

  Scenario: Folding parent collapses descendants
    Given a graph with subgraph "parent" containing subgraph "child"
    And "child" is not collapsed
    When I toggle fold on "parent"
    Then "parent" should be collapsed
    And "child" should also be collapsed

  Scenario: Fold all subgraphs
    Given a graph with 3 subgraphs, all uncollapsed
    When I call foldAll
    Then all 3 subgraphs should be collapsed

  Scenario: Unfold all subgraphs
    Given a graph with 3 subgraphs, all collapsed
    When I call unfoldAll
    Then all 3 subgraphs should be uncollapsed

  Scenario: Toggle on non-existent subgraph returns false
    Given a graph with no subgraph "missing"
    When I toggle fold on "missing"
    Then the result should be false

  # --- Keyboard Shortcuts ---

  Scenario: F key triggers fitToView
    Given a focused canvas
    When the user presses "f"
    Then the "fitToView" action should fire

  Scenario: R key triggers resetView
    Given a focused canvas
    When the user presses "r"
    Then the "resetView" action should fire

  Scenario: Other keys do nothing
    Given a focused canvas
    When the user presses "x"
    Then no action should fire

  # --- Edge Rerouting on Fold ---

  Scenario: Multiple edges to folded subgraph merge into one
    Given a graph with edges A->B and A->C
    And subgraph "sg1" contains B and C
    And "sg1" is collapsed
    When I compute layout
    Then there should be exactly 1 edge from "A" to "sg1"

  Scenario: Internal edges within folded subgraph disappear
    Given a graph with edges B->C inside subgraph "sg1"
    And "sg1" is collapsed
    When I compute layout
    Then there should be no edge from "B" to "C"
    And there should be no edge involving nodes inside "sg1"
