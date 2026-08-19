@sources
Feature: Talking to the catalogue and to Tutu

  Two servers, two different sets of rules. The catalogue mints a session and demands it back;
  Tutu has none at all and mixing their headers breaks both. Neither of them is allowed to take
  the product down with it, but they fail in different ways: without events there is nothing to
  show, while without hotels there is still a trip.

  Scenario: The catalogue answers from the recordings
    Given the catalogue and Tutu are wired to the recordings
    When the catalogue is asked for offline events on artificial intelligence
    Then 8 events come back
    And the event "SPb Python Meetup 2026" is among them

  Scenario: The catalogue directory answers from the recordings
    Given the catalogue and Tutu are wired to the recordings
    When the catalogue directory is asked for
    Then it lists 21 cities

  Scenario: The first question opens a session before it is asked
    Given the catalogue has never been asked anything yet
    When the catalogue is asked for offline events on artificial intelligence
    Then the session was opened before the question
    And 8 events come back

  Scenario: A session the catalogue no longer knows is reopened, however it says so
    Given the catalogue refuses the first call with a status code and no explanation
    When the catalogue is asked for offline events on artificial intelligence
    Then the session was reopened once
    And 8 events come back

  Scenario: A lost session is reopened once and the call goes through
    Given the catalogue lost its session
    When the catalogue is asked for offline events on artificial intelligence
    Then the session was reopened once
    And 8 events come back

  Scenario: A catalogue that is simply down is not retried forever
    Given the catalogue is down
    When the catalogue is asked and refuses
    Then the session was reopened once
    And the refusal names the catalogue

  Scenario: Two questions to the catalogue do not overlap
    Given the catalogue and Tutu are wired to the recordings
    When two different questions are asked at the same moment
    Then the catalogue answered them one at a time

  Scenario: Tutu answers with journeys
    Given the catalogue and Tutu are wired to the recordings
    When Tutu is asked for journeys from Москва to Санкт-Петербург on 2026-08-20
    Then 6 journeys come back

  Scenario: Tutu answers with hotels
    Given the catalogue and Tutu are wired to the recordings
    When Tutu is asked for hotels in Санкт-Петербург from 2026-08-20 to 2026-08-21
    Then 20 hotels come back
    And the listing names Санкт-Петербург as the geography it resolved

  Scenario: Hotels are searched by city name, never by an identifier from a transport answer
    Given the catalogue and Tutu are wired to the recordings
    When Tutu is asked for hotels in Санкт-Петербург from 2026-08-20 to 2026-08-21
    Then the question Tutu was asked names the city and no transport identifier

  Scenario: A checkout link is never answered from memory
    Given the catalogue and Tutu are wired to the recordings
    When the same checkout link is asked for twice
    Then Tutu was asked twice

  Scenario: A transport search is answered from memory the second time
    Given the catalogue and Tutu are wired to the recordings
    When the same journeys are asked for twice
    Then Tutu was asked once
