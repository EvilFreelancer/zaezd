@composer
Feature: Whether the traveller actually makes it

  A trip that arrives after the doors open is not a cheaper trip, it is a wasted one. Every
  variant is checked before it is offered, and the answer is a number the traveller can read
  rather than the word "успевает".

  Scenario Outline: Arriving in time for the opening
    Given the event opens at 2026-08-27T10:00:00+03:00
    When the traveller arrives at <arrival>
    Then the trip <verdict> the opening
    And the margin before the opening is <margin> minutes

    Examples: comfortably in time
      | arrival                   | verdict | margin |
      | 2026-08-27T08:00:00+03:00 | makes   | 120    |
      | 2026-08-27T09:00:00+03:00 | makes   | 60     |

    Examples: too late to be offered
      | arrival                   | verdict     | margin |
      | 2026-08-27T09:01:00+03:00 | misses      | 59     |
      | 2026-08-27T11:00:00+03:00 | misses      | -60    |

  Scenario: A variant that misses the opening cannot be the headline trip
    Given the event opens at 2026-08-27T10:00:00+03:00
    When the traveller arrives at 2026-08-27T11:00:00+03:00
    Then the variant cannot be offered as the main trip

  Scenario: A variant that makes the opening and leaves afterwards can be the headline trip
    Given the event opens at 2026-08-27T10:00:00+03:00
    When the traveller arrives at 2026-08-26T18:00:00+03:00 and leaves at 2026-08-28T09:00:00+03:00
    Then the variant can be offered as the main trip

  Scenario: A trip with no arrival time cannot be the headline one
    Given the event opens at 2026-08-27T10:00:00+03:00
    When only the journey home is known, leaving at 2026-08-28T09:00:00+03:00
    Then the variant cannot be offered as the main trip
    And the trip notes that nobody said when the traveller lands

  Scenario: A time with no offset is refused, because otherwise the answer depends on the server
    Given the event opens at 2026-08-27T10:00:00+03:00
    When the traveller arrives at 2026-08-27T08:00:00
    Then the trip cannot say whether it makes the opening
    And the variant cannot be offered as the main trip

  Scenario: Arrival and opening in different time zones are compared as moments, not as clocks
    Given the event opens at 2026-08-27T10:00:00+05:00
    When the traveller arrives at 2026-08-27T07:30:00+03:00
    Then the trip misses the opening

  Scenario: When the catalogue gave no opening time the check is relaxed and says so
    Given the event opening time is unknown
    When the traveller arrives at 2026-08-27T23:00:00+03:00 and leaves at 2026-08-28T09:00:00+03:00
    Then the trip cannot say whether it makes the opening
    And the trip notes that the catalogue gave no opening time
    And the variant can be offered as the main trip

  Scenario: A journey home that leaves before the event is over is flagged
    Given the event runs from 2026-08-27 to 2026-08-29
    When the journey home leaves at 2026-08-28T09:00:00+03:00
    Then the trip leaves too early
    And the variant cannot be offered as the main trip

  Scenario: A journey home on the day after the event is fine
    Given the event runs from 2026-08-27 to 2026-08-29
    When the journey home leaves at 2026-08-30T09:00:00+03:00
    Then the trip leaves after the event is over

  Scenario: A journey home on the last day cannot be judged without a closing time
    Given the event runs from 2026-08-27 to 2026-08-29
    When the journey home leaves at 2026-08-29T21:00:00+03:00
    Then the trip cannot say whether it leaves after the event is over
    And the trip notes that the catalogue gave no closing time

  Scenario: A time nobody can read is flagged rather than assumed to be fine
    Given the event opens at 2026-08-27T10:00:00+03:00
    When the traveller arrives at сегодня-вечером
    Then the trip cannot say whether it makes the opening
    And the variant cannot be offered as the main trip

  Scenario: The cheapest recorded train is checked against the real opening time
    Given the recorded catalogue of offline events on artificial intelligence
    And the event is "SPb Python Meetup 2026"
    And the recorded journeys there
    When the cheapest recorded train is checked
    Then the trip misses the opening
    And the variant cannot be offered as the main trip
