Feature: Layout Engine
  As a developer using mermaid-render
  I want the layout engine to position nodes according to layout philosophies
  So that diagrams are readable and well-organized

  Background:
    Given a parsed graph with nodes A, B, C connected A->B->C
    And a subgraph "sg1" containing nodes B and C

  # --- Basic Layout ---

  Scenario: Position all visible nodes
    When I compute layout with philosophy "narrative"
    Then all 3 nodes should have x, y positions
    And all nodes should have width > 0 and height > 0

  Scenario: Produce edges with waypoints
    When I compute layout with philosophy "narrative"
    Then each edge should have at least 2 waypoints

  Scenario: Nodes do not overlap
    When I compute layout with philosophy "narrative"
    Then no two nodes should overlap

  # --- Fold Support ---

  Scenario: Collapsed subgraph hides children
    Given subgraph "sg1" is collapsed
    When I compute layout
    Then nodes "B" and "C" should not appear in the positioned output
    And a summary node "sg1" should appear instead

  Scenario: Edges reroute to summary node when subgraph collapsed
    Given a graph with A->B, A->C, and subgraph "sg1" containing B and C
    And subgraph "sg1" is collapsed
    When I compute layout
    Then there should be 1 edge from "A" to "sg1" (not 2 separate edges)

  Scenario: Uncollapsed subgraph shows all children
    Given subgraph "sg1" is not collapsed
    When I compute layout
    Then nodes "B" and "C" should both appear in the positioned output
    And no summary node should appear

  # --- Philosophy Spacing ---

  Scenario: Breath philosophy produces more space than Blueprint
    When I compute layout with philosophy "breath"
    And I also compute layout with philosophy "blueprint"
    Then the "breath" layout should have greater total height than "blueprint"
    And the "breath" layout should have greater total width than "blueprint"

  Scenario: Narrative philosophy uses tight rhythm along spine
    When I compute layout with philosophy "narrative"
    Then the vertical gaps between sequential nodes should be consistent (within 10%)

  Scenario: Blueprint philosophy aligns nodes to ranks
    Given a graph with A->B, A->C (B and C are peers)
    When I compute layout with philosophy "blueprint"
    Then nodes "B" and "C" should have the same y-coordinate (within 1px)

  # --- Spacing Multiplier ---

  Scenario: Spacing multiplier increases gaps
    When I compute layout with philosophy "narrative" and spacing multiplier 2.0
    And I also compute layout with philosophy "narrative" and spacing multiplier 1.0
    Then the 2.0 layout should have greater total height than the 1.0 layout

  # --- Edge Cases ---

  Scenario: Empty graph produces empty layout
    Given an empty graph with 0 nodes
    When I compute layout
    Then the positioned output should have 0 nodes and 0 edges

  Scenario: Single node graph
    Given a graph with only node A
    When I compute layout
    Then node "A" should be positioned
    And there should be 0 edges

  Scenario: Graph with cycle
    Given a graph with A->B->C->A
    When I compute layout
    Then all 3 nodes should be positioned without error
    And no two nodes should overlap
