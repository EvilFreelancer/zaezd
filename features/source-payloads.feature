@sources
Feature: What the sources said, and what they did not

  Raw third-party JSON stops at one file. Above it the product works with its own types, and a
  field a source did not return stays missing all the way to the screen instead of being filled
  in from general knowledge. Tutu's own instructions call that substitution the biggest failure
  mode they see in agent transcripts.

  Scenario: The catalogue answer is read into events the product understands
    Given the recorded catalogue answer for offline events on artificial intelligence
    When the answer is read
    Then 18 events are understood
    And the event "Kazan Digital Week - 2026" is in Казань

  Scenario: A field the catalogue did not fill stays missing
    Given the recorded catalogue answer for offline events on artificial intelligence
    When the answer is read
    Then the event "Kazan Digital Week - 2026" has no venue
    And the event "Kazan Digital Week - 2026" has no opening time

  Scenario: A field the catalogue did fill is kept
    Given the recorded catalogue answer for offline events on artificial intelligence
    When the answer is read
    Then the event "Искусственный интеллект для роста бизнеса AI Growth Days" has a venue
    And the event "Искусственный интеллект для роста бизнеса AI Growth Days" has an opening time
    And the event "Искусственный интеллект для роста бизнеса AI Growth Days" has a link

  Scenario: The transport answer is read into journeys
    Given the recorded transport answer from Москва to Екатеринбург
    When the answer is read
    Then 6 journeys are understood
    And every journey names its price, its duration and both its times
    And the answer names Москва and Екатеринбург as the places Tutu resolved

  Scenario: A journey keeps the handle Tutu will need back at checkout
    Given the recorded transport answer from Москва to Екатеринбург
    When the answer is read
    Then every journey carries the checkout handle Tutu returned

  Scenario: An empty mode is not a claim that the mode does not exist
    Given the recorded transport answer from Москва to Екатеринбург
    When the answer is read
    Then no journey by suburban trains is offered
    But suburban trains are not reported as unavailable

  Scenario: A mode that failed upstream is reported as failed, with the reason
    Given the recorded transport answer for a route with no direct connection
    When the answer is read
    Then flights are reported as unavailable
    And trains are reported as unavailable
    And the reason Tutu gave is kept

  Scenario: The hotel listing is read into hotels with their coordinates
    Given the recorded hotel listing for Екатеринбург
    When the answer is read
    Then 20 hotels are understood
    And every hotel names its whole-stay price
    And the answer names Екатеринбург as the geography Tutu resolved

  Scenario: A tool error is an error, not data
    Given the recorded answer where Tutu rejected an unknown argument
    When the answer is read and refused
    Then the refusal names Tutu
    And the refusal repeats what Tutu said

  Scenario: A hotel geography identifier is never taken from a transport answer
    Given the recorded transport answer from Москва to Екатеринбург
    And the recorded hotel listing for Екатеринбург
    When both answers are read
    Then the hotel geography and the transport geography are different identifiers
