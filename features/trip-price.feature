@composer
Feature: What the trip actually costs

  The headline number is not the price of a ticket, it is the price of taking part: getting
  there, sleeping somewhere, getting back, and the event itself. Every part comes from its own
  source and is named, and a part nobody could read is shown as text rather than folded into
  the sum.

  Scenario: The total carries both journeys and the whole stay
    Given the journey there costs 2090.93 ₽
    And the journey home costs 2090.93 ₽
    And the hotel costs 12800 ₽ for the whole stay
    When the trip is priced
    Then the total is 16981.86 ₽
    And the breakdown adds up to the total

  Scenario: The hotel price is for the stay and is never multiplied by the nights
    Given the journey there costs 2090.93 ₽
    And the journey home costs 2090.93 ₽
    And the hotel costs 12800 ₽ for the whole stay
    And the stay is 4 nights long
    When the trip is priced
    Then the total is 16981.86 ₽

  Scenario: A price the catalogue wrote as free text is shown but left out of the sum
    Given the journey there costs 2090.93 ₽
    And the journey home costs 2090.93 ₽
    And the event price reads "уточняется у организатора"
    When the trip is priced
    Then the total is 4181.86 ₽
    And the event price is shown as text and excluded from the sum
    And the screen is given the words "уточняется у организатора" to show

  Scenario: A price the catalogue wrote as a number is part of the sum
    Given the journey there costs 2090.93 ₽
    And the journey home costs 2090.93 ₽
    And the event price reads "13000 р."
    When the trip is priced
    Then the total is 17181.86 ₽

  Scenario: A price that starts with "от" makes the whole total a lower bound
    Given the journey there costs 2090.93 ₽
    And the journey home costs 2090.93 ₽
    And the event price reads "от 7 000 ₽"
    When the trip is priced
    Then the total is 11181.86 ₽
    And the total is a lower bound, not an exact figure

  Scenario: A free event adds nothing and is not called unknown
    Given the journey there costs 2090.93 ₽
    And the journey home costs 2090.93 ₽
    And the event price reads "бесплатно"
    When the trip is priced
    Then the total is 4181.86 ₽
    And the event is priced as free

  Scenario Outline: Prices the catalogue writes that must not be turned into numbers
    Given the journey there costs 1000 ₽
    And the journey home costs 1000 ₽
    And the event price reads "<price>"
    When the trip is priced
    Then the total is 2000 ₽
    And the event price is shown as text and excluded from the sum

    Examples: two prices in one line, and no way to know which applies
      | price                                             |
      | Онлайн — 100 000 руб., Очно — 130 000 руб.        |
      | Для представителей организаций ОПК — 37 800 рублей |

    Examples: numbers that are not money
      | price                                                              |
      | 5 мест с грантом на 100% стоимости обучения, остальные — 25 платных мест |
      | Бесплатно для слушателей; для докладчиков — платно                 |

  Scenario: Without a journey home the number is not called the full price
    Given the journey there costs 2090.93 ₽
    And the hotel costs 12800 ₽ for the whole stay
    When the trip is priced
    Then the total does not claim to be the full price of taking part
    And the missing part is named as the journey home

  Scenario: Without a hotel on a trip that needs one the number is not called the full price
    Given the journey there costs 2090.93 ₽
    And the journey home costs 2090.93 ₽
    And the stay is 4 nights long
    When the trip is priced
    Then the total does not claim to be the full price of taking part
    And the missing part is named as the hotel

  Scenario: A budget that does not fit is shown as exceeded rather than hidden
    Given the journey there costs 9000 ₽
    And the journey home costs 9000 ₽
    And the hotel costs 15000 ₽ for the whole stay
    And the traveller has a budget of 30000 ₽
    When the trip is priced
    Then the budget is exceeded by 3000 ₽

  Scenario: A budget met exactly is not an overflow
    Given the journey there costs 9000 ₽
    And the journey home costs 9000 ₽
    And the hotel costs 12000 ₽ for the whole stay
    And the traveller has a budget of 30000 ₽
    When the trip is priced
    Then the budget is not exceeded
    And 0 ₽ is left over

  Scenario: A budget verdict on a lower bound is not promised as certain
    Given the journey there costs 1000 ₽
    And the journey home costs 1000 ₽
    And the event price reads "от 7 000 ₽"
    And the traveller has a budget of 10000 ₽
    When the trip is priced
    Then the budget is not exceeded
    But the trip may still cost more than the budget

  Scenario Outline: A night departure costs fewer working days than a midday one
    Given the traveller leaves home at <departure> and gets back at 2026-08-30T22:00:00+03:00
    And every day in between is a working day
    When the working days are counted
    Then the trip burns <days> working days

    Examples:
      | departure                 | days |
      | 2026-08-28T23:15:00+03:00 | 2    |
      | 2026-08-28T14:00:00+03:00 | 3    |

  Scenario: A weekend trip burns no working days at all
    Given the traveller leaves home at 2026-08-28T20:00:00+03:00 and gets back at 2026-08-30T09:00:00+03:00
    And no day in between is a working day
    When the working days are counted
    Then the trip burns 0 working days

  Scenario: Without a production calendar no number is invented
    Given the traveller leaves home at 2026-08-28T20:00:00+03:00 and gets back at 2026-08-30T09:00:00+03:00
    And the production calendar did not answer
    When the working days are counted
    Then the trip does not say how many working days it burns

  Scenario: The cheapest recorded trip is priced from the recorded payloads
    Given the recorded journeys there
    And the recorded journeys home
    And the recorded hotels of the demo trip
    When the cheapest recorded trip is priced
    Then the total is exactly both journeys plus the whole-stay hotel price
    And the hotel line equals the price Tutu returned for the whole stay
    And the breakdown adds up to the total
