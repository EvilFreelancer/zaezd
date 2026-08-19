@mcp
Feature: An agent gets three verbs, not sixteen searches

  What faces an agent is a product contract - find a trip, open a package, hand over the
  payment checklist. Everything the agent needs to act is in the structured content, because
  a text channel with no widget is the channel that has to read well. The parts worth
  specifying are the ones that could quietly lie: a package that no longer exists, a link
  that was never a cart, a count that reads as broken Russian, and an identifier from a
  previous version of the product.

  Background:
    Given the recorded catalogue and Tutu answers are the only sources

  Scenario: The manifest is three verbs long
    When the agent lists the tools
    Then the tools are exactly find_event_trips, get_trip_details and create_trip_checkout
    And every tool declares what it returns
    And every tool is marked read-only and non-destructive
    And the payment checklist does not promise the same links twice

  Scenario: Finding a trip answers with structure, not with prose to be parsed
    When the agent asks for a trip on "ai" from "Москва"
    Then the answer carries structured content
    And the answer names the event and the city
    And the answer carries at least one package with both legs and a total
    And the answer carries a link to the same trip on the web

  Scenario Outline: A request with nothing in it is refused, not invented
    When the agent asks for a trip omitting <missing>
    Then the answer asks for what is missing instead of inventing it

    Examples:
      | missing         |
      | the topic       |
      | the origin city |
      | both            |

  Scenario Outline: The same request in three shapes is one request
    When the agent asks for a trip with topics <shape>
    Then the identifier matches the one asked for as a plain list

    Examples:
      | shape      |
      | ["ai"]     |
      | "[\"ai\"]" |
      | "ai"       |

  Scenario: A count that meets a noun is written the way a person writes it
    When the agent asks for a trip on "ai" from "Москва"
    Then the coverage sentence says "21 город", not "21 городов"
    And the coverage sentence is the one the screen shows

  Scenario: A total that is missing a part never passes for the price of taking part
    When the agent asks for a trip on "ai" from "Москва"
    Then every package that calls itself complete lists nothing as missing
    And a package that excludes the event price says so

  Scenario: A shared link opens the trip it was made from, not a newer one
    Given the agent found a trip
    When a sooner event appears in the catalogue
    And the agent opens the trip by its identifier
    Then the answer is still about the event the link was made for

  Scenario: Opening a trip needs nothing but its identifier
    Given the agent found a trip
    When the agent opens the trip by its identifier
    Then the answer names the event and the city
    And the answer carries the stay dates and the number of nights

  Scenario: Opening a trip adds what only an opened trip knows
    Given the agent found a trip
    When the agent opens the trip by its identifier
    Then the answer carries the walk to the venue and the forecast
    And the way there is named by its number and carrier

  Scenario: A package that is not in this trip is named as missing, not answered with silence
    Given the agent found a trip
    When the agent opens the trip asking for package "package-that-never-existed"
    Then the answer says that package is not in this trip

  Scenario: An identifier from another version is refused with a reason
    When the agent opens the trip by identifier "v0.something-else"
    Then the answer explains that the identifier cannot be read

  Scenario: The hotel price says outright that it covers the whole stay
    When the agent asks for a trip on "ai" from "Москва"
    Then every hotel price is marked as the price of the whole stay

  Scenario: The payment checklist carries a label for every link
    Given the agent found a trip
    When the agent asks for the payment checklist
    Then every link carries the label its own kind earned
    And no link claims a cart it cannot open

  Scenario: The checklist names the package it was built from
    Given the agent found a trip
    When the agent asks for the payment checklist
    Then the checklist names the first package the trip offered

  Scenario: A checklist read out loud carries its warnings
    Given the agent found a trip
    When the agent asks for the payment checklist
    Then the plain checklist repeats every caveat the links carry

  Scenario: A checklist is never built for a package the agent was never offered
    Given the agent found a trip
    When the agent asks for the payment checklist of package "package-that-never-existed"
    Then the answer says that package is not in this trip

  Scenario: A replayed answer says so, so nobody pays from a recording
    When the agent asks for a trip on "ai" from "Москва"
    Then the answer admits it came out of a recording

  Scenario: A host with no widget is told enough to decide
    When the agent asks for a trip on "ai" from "Москва"
    Then the plain text names the event, the dates, both legs and the total
    And the plain text carries the link to the screen

  Scenario: An opened trip tells a text host about the walk and the weather too
    Given the agent found a trip
    When the agent opens the trip by its identifier
    Then the plain text gives the walk to the venue and the forecast

  Scenario: The published address answers agents over the network, not only in this process
    Given the product is published at an address
    When an agent asks that address for the tool list
    Then the three tools come back over the network

  Scenario: The published address is honest about having no sessions
    Given the product is published at an address
    When an agent opens a stream at that address instead of asking
    Then the address answers that this server has no sessions

  Scenario: A body nobody could mean is refused before it is parsed
    Given the product is published at an address
    When an agent sends a body far larger than any request
    Then the address refuses it without reading it all
