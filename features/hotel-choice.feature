@composer
Feature: Which hotels are worth showing

  Tutu cannot search hotels by coordinates, only by city, but it returns the coordinates of
  every hotel it lists. So the question a traveller actually asks about a conference hotel -
  how far is it from the venue - is answered here, and only when the venue is genuinely known.

  Background:
    Given the recorded hotels of the demo trip

  Scenario: With a precise venue the nearest hotels come first
    Given the venue is at 56.8381978, 60.6103939
    When the hotels are ranked
    Then every hotel shown carries its distance to the venue
    And the hotels are ordered from nearest to furthest

  Scenario: Three hotels are enough for one screen
    Given the venue is at 56.8381978, 60.6103939
    When the hotels are ranked
    Then 3 hotels are shown

  Scenario: Without a precise venue distance is not shown at all
    Given the venue address could not be found
    When the hotels are ranked
    Then no hotel shows a distance
    And the hotels are ordered by price and rating

  Scenario: A city centre is not a venue
    Given the venue is only known to be somewhere in the city
    When the hotels are ranked
    Then no hotel shows a distance

  Scenario: A hotel Tutu gave no coordinates for is still offered, without a distance
    Given the venue is at 56.8381978, 60.6103939
    And one recorded hotel has no coordinates
    When the hotels are ranked
    Then the hotel with no coordinates shows no distance
    And it is not ordered as though it were next door

  Scenario: A price ceiling the traveller set is respected
    Given the venue is at 56.8381978, 60.6103939
    And the traveller will not pay more than 16000 ₽ for the stay
    When the hotels are ranked
    Then no hotel shown costs more than 16000 ₽

  Scenario: A price ceiling nobody can meet still returns the nearest hotels
    Given the venue is at 56.8381978, 60.6103939
    And the traveller will not pay more than 1 ₽ for the stay
    When the hotels are ranked
    Then 3 hotels are shown
    And the answer says the price ceiling could not be met

  Scenario: The same listing ranked twice gives the same order
    Given the venue is at 56.8381978, 60.6103939
    When the hotels are ranked, and ranked again in the opposite order
    Then both shortlists are identical

  Scenario: An empty listing is an empty answer, not an error
    Given the recorded listing has no hotels
    And the venue is at 56.8381978, 60.6103939
    When the hotels are ranked
    Then no hotels are shown
