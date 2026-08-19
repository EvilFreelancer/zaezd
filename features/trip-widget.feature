@mcp
Feature: The same board, drawn inside an agent

  A host that can draw gets the trip board itself rather than a paragraph about it, and it is
  the same board the public link opens - one renderer, two channels. What differs is only where
  the data comes from and who is allowed to act: the page inside a host recomputes through the
  host and opens payment links through the host, because an iframe under a strict policy can do
  neither by itself.

  Background:
    Given the recorded catalogue and Tutu answers are the only sources

  Scenario: The board arrives as a shell, because a widget loads before the answer exists
    When the agent reads the trip board resource
    Then the resource is served as an app page
    And the page carries no trip inside it
    And the page loads the same renderer as the public link

  Scenario: The trip travels beside the answer, so the widget draws the same board
    When the agent asks for a trip on "ai" from "Москва"
    Then the answer carries the whole trip for the widget to draw
    And the trip beside the answer is the one the public link would show
    And the trip beside the answer carries nothing a board cannot draw

  Scenario: Opening a package does not shrink the board the host already drew
    Given the agent found a trip
    When the agent opens the trip asking for package "cheapest"
    Then the answer names one package for the model
    And the board beside the answer still carries every package

  Scenario: The payment checklist draws no board of its own
    Given the agent found a trip
    When the agent asks for the payment checklist
    Then no trip travels beside the checklist
    And the checklist travels in the shape the screen already renders

  Scenario: The board's own files load into a page that has no origin of its own
    Given the product is published at an address
    When the widget asks that address for the renderer
    Then the renderer is allowed to load into a page from anywhere

  Scenario: The widget is told who it may talk to and where its own files live
    When the agent reads the trip board resource
    Then the resource names our own address as the one it talks to
    And the resource allows the map tiles it draws
    And the page itself carries the same permissions, where a host reads them

  Scenario: The answer itself says which board to draw it on
    When the agent asks for a trip on "ai" from "Москва"
    Then the answer points at the trip board, in both spellings hosts read

  Scenario Outline: A tool that draws the board says so; the checklist does not
    When the agent lists the tools
    Then <tool> <points> at the trip board

    Examples:
      | tool                 | points          |
      | find_event_trips     | points          |
      | get_trip_details     | points          |
      | create_trip_checkout | does not point  |
