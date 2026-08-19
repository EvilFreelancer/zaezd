@composer
Feature: The whole trip, assembled

  Everything the pure rules decide, wired to the sources that supply them. One event per
  request: fanning out over five would be a spinner rather than a product, and the other four
  are listed for the traveller to pick from.

  Background:
    Given the whole product is wired to the recordings

  Scenario: A trip is assembled from a topic and a home city
    When a trip is assembled for artificial intelligence from Москва
    Then the trip is for "SPb Python Meetup 2026"
    And the trip runs from 2026-08-20 to 2026-08-21
    And at least one package is offered

  Scenario: The traveller sees what else was on offer without waiting for it
    When a trip is assembled for artificial intelligence from Москва
    Then other events are listed without being computed

  Scenario: The catalogue's coverage is stated alongside the trip
    When a trip is assembled for artificial intelligence from Москва
    Then the answer says the catalogue lists 21 cities

  Scenario: Every package carries both journeys and a total
    When a trip is assembled for artificial intelligence from Москва
    Then every package names a journey there and a journey home
    And every package carries a total price

  Scenario: The venue that has an address gets a precise location
    When a trip is assembled for artificial intelligence from Москва
    Then the trip's venue is located precisely

  Scenario: The forecast is included when the dates fall inside the window
    When a trip is assembled for artificial intelligence from Москва
    Then a forecast is included

  Scenario: The same request assembled twice gives the same trip
    When a trip is assembled for artificial intelligence from Москва twice
    Then both trips are identical

  Scenario: The stages are announced as they complete
    When a trip is assembled for artificial intelligence from Москва
    Then the stages announced were events, transport, hotels, context, done

  Scenario: A trip whose hotels did not load is still a trip
    Given the hotel search fails
    When a trip is assembled for artificial intelligence from Москва
    Then at least one package is offered
    And the answer reports that the hotels did not load
    And no package claims to be the full price of taking part

  Scenario: A trip whose transport did not load is not a trip, and says why
    Given the transport search fails
    When a trip is assembled for artificial intelligence from Москва
    Then no package is offered
    And the answer reports that the journeys did not load

  Scenario: A trip whose optional sources all fail is still a trip
    Given every optional source of the product fails
    When a trip is assembled for artificial intelligence from Москва
    Then at least one package is offered
    And the trip's venue is not located
    And no forecast is included
    And the working days were not counted
