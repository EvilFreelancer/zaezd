@composer
Feature: Stay dates are decided by the event, not by the model

  Asked the same question three times, a traveller got three different trip lengths and a
  hotel bill that varied by half again. The length of a stay is not a matter of opinion: it
  follows from when the event opens and closes, and the same event always answers the same
  way.

  Scenario Outline: The arrival day depends on when the event opens
    Given an event running from <from> to <to> that opens at <opens>
    When the stay is computed
    Then the traveller arrives on <arrival>
    And the traveller leaves on <departure>
    And the stay is <nights> nights

    Examples: an opening before noon is worth arriving the day before
      | from       | to         | opens | arrival    | departure  | nights |
      | 2026-08-27 | 2026-08-29 | 10:00 | 2026-08-26 | 2026-08-30 | 4      |
      | 2026-08-27 | 2026-08-29 | 11:59 | 2026-08-26 | 2026-08-30 | 4      |

    Examples: an opening at noon or later can be reached on the day
      | from       | to         | opens | arrival    | departure  | nights |
      | 2026-08-27 | 2026-08-29 | 12:00 | 2026-08-27 | 2026-08-30 | 3      |
      | 2026-08-27 | 2026-08-29 | 19:00 | 2026-08-27 | 2026-08-30 | 3      |

    Examples: an unknown opening time is treated cautiously
      | from       | to         | opens   | arrival    | departure  | nights |
      | 2026-08-27 | 2026-08-29 | unknown | 2026-08-26 | 2026-08-30 | 4      |

  Scenario: The catalogue never says when an event closes, so the last night is kept
    Given the recorded catalogue of offline events on artificial intelligence
    When the stay is computed for "SPb Python Meetup 2026"
    Then the trip says the closing time is unknown
    And the traveller leaves on 2026-08-21

  Scenario: A stay that crosses the end of a month keeps counting
    Given an event running from 2026-10-29 to 2026-10-31 that opens at unknown
    When the stay is computed
    Then the traveller arrives on 2026-10-28
    And the traveller leaves on 2026-11-01
    And the stay is 4 nights

  Scenario: A stay that crosses the end of a year keeps counting
    Given an event running from 2026-12-31 to 2026-12-31 that opens at 10:00
    When the stay is computed
    Then the traveller arrives on 2026-12-30
    And the traveller leaves on 2027-01-01
    And the stay is 2 nights

  Scenario: The travel days are the arrival day and the departure day
    Given an event running from 2026-08-27 to 2026-08-29 that opens at 10:00
    When the stay is computed
    Then the outbound journey is booked for 2026-08-26
    And the return journey is booked for 2026-08-30
    And the trip books a hotel

  Scenario: An event that ends before it starts is refused rather than reshaped
    Given an event running from 2026-08-27 to 2026-08-20 that opens at 10:00
    When the stay is computed and refused
    Then the refusal names both dates

  Scenario: A same-day event needs no hotel
    Given an event running from 2026-08-27 to 2026-08-27 that opens at 12:00 and closes at 17:00
    When the stay is computed
    Then the stay is 0 nights
    And the trip needs no hotel

  Scenario: The same event asked three times answers the same way
    Given an event running from 2026-08-27 to 2026-08-29 that opens at 10:00
    When the stay is computed three times
    Then all three answers are identical

  Scenario Outline: Real events from the recorded catalogue
    Given the recorded catalogue of offline events on artificial intelligence
    When the stay is computed for "<event>"
    Then the traveller arrives on <arrival>
    And the traveller leaves on <departure>
    And the stay is <nights> nights

    Examples:
      | event                                            | arrival    | departure  | nights |
      | SPb Python Meetup 2026                                     | 2026-08-20 | 2026-08-21 | 1 |
      | Конференция СTRL+ALT+LEAD                                  | 2026-08-19 | 2026-08-21 | 2 |
      | CNews Петербург 2026 — передовые технологии и кейсы России | 2026-09-23 | 2026-09-25 | 2 |

  Scenario: An event the catalogue gave no start time for says so out loud
    Given the recorded catalogue of offline events on artificial intelligence
    When the stay is computed for "CNews Петербург 2026 — передовые технологии и кейсы России"
    Then the trip says the opening time is unknown

  Scenario: An event the catalogue did give a start time for is not called unknown
    Given the recorded catalogue of offline events on artificial intelligence
    When the stay is computed for "SPb Python Meetup 2026"
    Then the trip says the opening time is known
