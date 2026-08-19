@sources
Feature: The optional context, and the silence when there is none

  Three sources add context to a trip and none of them is allowed to break it. Each is a
  function with a timeout and a fallback, and every fallback renders an absence rather than a
  guess. A geocoder that is slow today must not become a trip that does not load, and a
  forecast nobody has must not become a plausible average.

  Background:
    Given the optional sources are wired to the recordings

  Scenario: A venue with a real address is located precisely
    When the venue "Городской молодёжный кластер «Салют», ул. Толмачёва, 12" in Екатеринбург is located
    Then the venue is located precisely

  Scenario: A venue nobody can find falls back to the city, and says so
    When the venue "GOELRO" in Екатеринбург is located
    Then the venue is known only as a city

  Scenario: A venue the catalogue never named is not located at all
    When a venue nobody named in Екатеринбург is located
    Then the venue is known only as a city

  Scenario: Nothing at all is nothing at all
    When a venue nobody named in no city is located
    Then the venue is not located

  Scenario: A city centre earns no walking time
    Given only the city of the venue is known
    When the walk from a hotel is measured
    Then no walking time is given

  Scenario: A precise venue earns a walking time from the foot profile
    Given the venue is located precisely at 55.796127, 49.108891
    When the walk from a hotel at 55.799152, 49.119747 is measured
    Then the walk is 14 minutes

  Scenario: The production calendar marks the days of a trip
    When the calendar is read for 2026-08-26 to 2026-08-30
    Then 2026-08-27 is a working day
    And 2026-08-29 is not a working day

  Scenario: A trip across a month boundary reads both months
    When the calendar is read for 2026-10-29 to 2026-11-02
    Then 2026-10-30 is a working day
    And 2026-11-02 is a working day

  Scenario: A forecast inside the window is given
    When the forecast is asked for Екатеринбург from 2026-08-26 to 2026-08-30
    Then a forecast for 5 days is given

  Scenario: A forecast beyond the window is not invented
    When the forecast is asked for Казань from 2026-10-28 to 2026-11-01
    Then no forecast is given

  Scenario: A source that falls over leaves the trip alone
    Given every optional source fails
    When the venue "любая" in Казань is located
    And the calendar is read for 2026-08-26 to 2026-08-30
    And the forecast is asked for Казань from 2026-08-26 to 2026-08-30
    Then the venue is not located
    And no calendar is given
    And no forecast is given
