Feature: Mermaid Parsing
  As a developer using mermaid-render
  I want to parse Mermaid text into an interactive graph model
  So that the renderer can display and interact with it

  Background:
    Given the mermaid-render core library is loaded

  # --- Directive Extraction ---

  Scenario: Extract @link directive with full path and fragment
    Given a mermaid source:
      """
      %% @link authService -> /services/auth/flow.mmd#loginNode
      graph TD
          authService[Auth Service] --> db[Database]
      """
    When I extract directives
    Then I should get 1 directive
    And the directive should be a link from "authService" to "/services/auth/flow.mmd#loginNode"
    And the cleaned source should not contain "@link"
    And the cleaned source should contain "graph TD"

  Scenario: Extract @link without fragment
    Given a mermaid source:
      """
      %% @link nodeA -> /services/overview.mmd
      graph TD
          nodeA[Service]
      """
    When I extract directives
    Then the directive target file should be "/services/overview.mmd"
    And the directive target node should be undefined

  Scenario: Extract multiple directive types
    Given a mermaid source:
      """
      %% @link A -> /a.mmd#x
      %% @layout blueprint
      %% @pin B 200 150
      %% @rank C D E
      %% @spacing 1.5
      graph TD
          A --> B --> C
      """
    When I extract directives
    Then I should get 5 directives
    And directive 1 should be type "link"
    And directive 2 should be type "layout" with philosophy "blueprint"
    And directive 3 should be type "pin" with coordinates 200, 150
    And directive 4 should be type "rank" with nodes "C", "D", "E"
    And directive 5 should be type "spacing" with multiplier 1.5

  Scenario: Preserve regular mermaid comments
    Given a mermaid source:
      """
      %% This is a normal comment
      graph TD
          A --> B
      """
    When I extract directives
    Then I should get 0 directives
    And the cleaned source should contain "%% This is a normal comment"

  # --- Graph Building ---

  Scenario: Parse a simple flowchart
    Given a mermaid source:
      """
      graph TD
          A[Hello] --> B[World]
      """
    When I build the graph
    Then the result should be successful
    And the graph should have 2 nodes
    And node "A" should have label "Hello"
    And node "B" should have label "World"
    And the graph should have 1 edge from "A" to "B"
    And the diagram type should be "flowchart"
    And the direction should be "TD"

  Scenario: Parse flowchart with subgraphs
    Given a mermaid source:
      """
      graph TD
          subgraph backend[Backend Services]
              API[API Server]
              DB[(Database)]
          end
          API --> DB
      """
    When I build the graph
    Then the result should be successful
    And the graph should have at least 1 subgraph
    And a subgraph labeled "Backend Services" should contain nodes "API" and "DB"

  Scenario: Parse edge labels
    Given a mermaid source:
      """
      graph TD
          A -->|yes| B
          A -->|no| C
      """
    When I build the graph
    Then the graph should have 2 edges
    And the edge from "A" to "B" should have label "yes"
    And the edge from "A" to "C" should have label "no"

  Scenario: Attach @link directives to nodes
    Given a mermaid source:
      """
      %% @link auth -> /services/auth/flow.mmd#loginHandler
      graph TD
          auth[Auth Service] --> db[Database]
      """
    When I build the graph
    Then node "auth" should have 1 cross-file link
    And the link should point to "/services/auth/flow.mmd" node "loginHandler"

  Scenario: Warn when @link references unknown node
    Given a mermaid source:
      """
      %% @link nonexistent -> /path.mmd
      graph TD
          A --> B
      """
    When I build the graph
    Then the result should be successful
    And the result should have 1 warning with code "LINK_NODE_NOT_FOUND"

  Scenario: Reject invalid mermaid syntax
    Given a mermaid source:
      """
      this is not valid mermaid at all
      """
    When I build the graph
    Then the result should not be successful
    And the result should have an error with code "PARSE_FAILED"
