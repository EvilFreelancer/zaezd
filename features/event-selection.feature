@composer
Feature: Only events worth travelling to become a trip

  The catalogue answers a topic with dozens of events. Building transport and hotels for all
  of them is a spinner, not a product, so the list is narrowed by rules a traveller would
  recognise, and everything dropped is explained rather than silently disappearing.

  Background:
    Given the traveller sets out from Москва
    And today is 2026-08-19

  Scenario: An online event needs no trip and says so
    Given the recorded catalogue of online events on artificial intelligence
    When the events are narrowed down
    Then no event is offered as a trip
    And the answer explains that those events are online and need no travel

  Scenario: An event in the traveller's own city needs no trip and says so
    Given the recorded catalogue of offline events in the traveller own city
    When the events are narrowed down
    Then no event is offered as a trip
    And the answer explains that those events are already in Москва

  Scenario: The recorded catalogue offers its nearest event first
    Given the recorded catalogue of offline events on artificial intelligence
    When the events are narrowed down
    Then the first offer is "SPb Python Meetup 2026"
    And at most five events are offered

  Scenario: Only the first offer is worth computing in full
    Given the recorded catalogue of offline events on artificial intelligence
    When the events are narrowed down
    Then one event is chosen for the full trip
    And the rest are listed without being computed

  Scenario: An event that has already started is not offered
    Given an event "Прошедшее" in Казань running from 2026-08-10 to 2026-08-12
    When the events are narrowed down
    Then no event is offered as a trip
    And the answer explains that those events have already started

  Scenario: An event the traveller can no longer reach in time is not offered
    Given an event "Завтра утром" in Казань running from 2026-08-19 to 2026-08-19 that opens at 10:00
    When the events are narrowed down
    Then no event is offered as a trip
    And the answer explains that those events have already started

  Scenario: An event outside the requested dates is not offered
    Given an event "Поздней осенью" in Казань running from 2026-11-20 to 2026-11-22
    And the traveller can only travel until 2026-09-30
    When the events are narrowed down
    Then no event is offered as a trip
    And the answer explains that those events fall outside the requested dates

  Scenario: Two events on the same day are always offered in the same order
    Given an event "Второе по счёту" in Казань running from 2026-09-01 to 2026-09-01
    And an event "Первое по счёту" in Казань running from 2026-09-01 to 2026-09-01
    When the events are narrowed down twice
    Then both answers are identical

  Scenario: An empty answer still owes the traveller an explanation
    Given the recorded catalogue has no offline events on this topic
    When the events are narrowed down
    Then no event is offered as a trip
    And the answer is not silent about why

  Scenario: The coverage of the catalogue is stated plainly, empty cities included
    Given the recorded directory of catalogue cities
    When the coverage is described
    Then it says the catalogue lists 21 cities
    And it says 15 of them have upcoming events
    And it names Москва as the city with the most events
    And it counts 40 upcoming events with no city at all
