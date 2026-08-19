@sources
Feature: The optional context, and the silence when there is none

  Three sources add context to a trip and none of them is allowed to break it. Each is a
  function with a timeout and a fallback, and every fallback renders an absence rather than a
  guess. A geocoder that is slow today must not become a trip that does not load, and a
  forecast nobody has must not become a plausible average.

  Background:
    Given the optional sources are wired to the recordings

  Scenario: A venue with a real address is located precisely
    When the venue "Офис «Леста Игры», площадь Карла Фаберже, 8В" in Санкт-Петербург is located
    Then the venue is located precisely

  Scenario: A company name resolves to something plausible, and precision is not claimed for it
    When the venue "YADRO" in Санкт-Петербург is located
    And the walk from a hotel is measured
    Then the venue is placed roughly, by its name
    And no walking time is given

  Scenario: A venue the catalogue never named is not located at all
    When a venue nobody named in Санкт-Петербург is located
    Then the venue is known only as a city

  Scenario: Nothing at all is nothing at all
    When a venue nobody named in no city is located
    Then the venue is not located

  Scenario: A city centre earns no walking time
    Given only the city of the venue is known
    When the walk from a hotel is measured
    Then no walking time is given

  Scenario: A precise venue earns a walking time from the foot profile
    Given the venue is located precisely at the recorded venue
    When the walk from the recorded hotel is measured
    Then the walk is 9 minutes

  Scenario: The production calendar marks the days of a trip
    When the calendar is read for 2026-08-19 to 2026-08-23
    Then 2026-08-20 is a working day
    And 2026-08-22 is not a working day

  Scenario: A trip across a month boundary reads both months
    When the calendar is read for 2026-08-30 to 2026-09-02
    Then 2026-08-31 is a working day
    And 2026-09-01 is a working day

  Scenario: A forecast inside the window is given
    When the forecast is asked for the venue from 2026-08-20 to 2026-08-21
    Then a forecast for 2 days is given

  Scenario: A forecast beyond the window is not invented
    When the forecast is asked for the city centre from 2026-09-23 to 2026-09-25
    Then no forecast is given

  Scenario: A source that falls over leaves the trip alone
    Given every optional source fails
    When the venue "любая" in Санкт-Петербург is located
    And the calendar is read for 2026-08-19 to 2026-08-23
    And the forecast is asked for the venue from 2026-08-20 to 2026-08-21
    Then the venue is not located
    And no calendar is given
    And no forecast is given
