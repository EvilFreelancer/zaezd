@composer
Feature: Three trips instead of a list of offers

  The screen does not show a feed of offers. It shows at most three assembled trips whose
  selection rule reads off the name: the cheapest, the one that costs the fewest working days,
  and the fastest. When two rules land on the same trip the answer is fewer cards, not the same
  card twice.

  Scenario: Three different trips make three cards
    Given a trip "дешёвый" costing 16000 ₽, 1500 minutes on the road, burning 3 working days
    And a trip "отпускной" costing 21000 ₽, 1400 minutes on the road, burning 1 working day
    And a trip "быстрый" costing 24000 ₽, 200 minutes on the road, burning 2 working days
    When the packages are chosen
    Then there are 3 packages
    And the cheapest package is "дешёвый"
    And the package that saves leave is "отпускной"
    And the fastest package is "быстрый"

  Scenario: One trip that wins on two counts gets one card, not two
    Given a trip "везучий" costing 16000 ₽, 200 minutes on the road, burning 3 working days
    And a trip "второй" costing 21000 ₽, 1400 minutes on the road, burning 1 working day
    When the packages are chosen
    Then there are 2 packages
    And the card for "везучий" says it is both the cheapest and the fastest

  Scenario: One trip that wins on every count gets a single card
    Given a trip "единственный" costing 16000 ₽, 200 minutes on the road, burning 1 working day
    And a trip "хуже во всём" costing 21000 ₽, 1400 minutes on the road, burning 3 working days
    When the packages are chosen
    Then there is 1 package

  Scenario: A trip that misses the opening is not offered while a workable one exists
    Given a trip "успевает" costing 21000 ₽, 1400 minutes on the road, burning 3 working days
    And a trip "не успевает" costing 9000 ₽, 200 minutes on the road, burning 1 working day
    And "не успевает" does not make the opening
    When the packages are chosen
    Then the cheapest package is "успевает"

  Scenario: When nothing makes the opening the screen is not left empty
    Given a trip "поздний" costing 21000 ₽, 1400 minutes on the road, burning 3 working days
    And "поздний" does not make the opening
    When the packages are chosen
    Then there is 1 package
    And the answer warns that nothing makes the opening

  Scenario: A trip inside the budget wins over a cheaper one that is not
    Given a trip "влезает" costing 20000 ₽, 1400 minutes on the road, burning 3 working days
    And a trip "не влезает" costing 40000 ₽, 200 minutes on the road, burning 1 working day
    And the traveller has a budget of 30000 ₽
    When the packages are chosen
    Then there is 1 package
    And the cheapest package is "влезает"

  Scenario: When nothing fits the budget the best is shown with an overflow warning
    Given a trip "дорого" costing 40000 ₽, 1400 minutes on the road, burning 3 working days
    And a trip "ещё дороже" costing 50000 ₽, 200 minutes on the road, burning 1 working day
    And the traveller has a budget of 30000 ₽
    When the packages are chosen
    Then the cheapest package is "дорого"
    And the answer warns that nothing fits the budget

  Scenario: Without a production calendar the leave card is not invented
    Given a trip "первый" costing 16000 ₽, 1500 minutes on the road, with no working-day count
    And a trip "второй" costing 24000 ₽, 200 minutes on the road, with no working-day count
    When the packages are chosen
    Then there are 2 packages
    And no package claims to save leave
    And the answer warns that the working days could not be counted

  Scenario: Two trips that tie on everything still produce one stable answer
    Given a trip "b" costing 16000 ₽, 1500 minutes on the road, burning 3 working days
    And a trip "a" costing 16000 ₽, 1500 minutes on the road, burning 3 working days
    When the packages are chosen, and chosen again in the opposite order
    Then both answers are the same
    And the cheapest package is "a"

  Scenario: Nothing to choose from is an empty answer, not an error
    Given there are no trips to choose from
    When the packages are chosen
    Then there are 0 packages
