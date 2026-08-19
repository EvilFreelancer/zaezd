@sources
Feature: The same question is asked once, and the recordings answer offline

  A cold rail search takes six seconds, so asking the same question twice is a spinner the
  traveller pays for. And on the day it matters the venue network is not a dependency worth
  having, so everything except the recorder runs on what was recorded.

  Scenario: The same question in three shapes is asked once
    Given the topics arrive as the list ai and data
    And the same topics arrive again as a JSON string
    And the same topics arrive again separated by commas
    When the catalogue is asked each time
    Then the catalogue is asked once
    And all three callers get the same answer

  Scenario: The same question in a different order is still the same question
    Given the topics arrive as the list ai and data
    And the same topics arrive again in the opposite order
    When the catalogue is asked each time
    Then the catalogue is asked once

  Scenario: A different question is a different question
    Given the topics arrive as the list ai and data
    And the topics arrive as the list ai
    When the catalogue is asked each time
    Then the catalogue is asked twice

  Scenario: An answer that has gone stale is asked for again
    Given the catalogue was asked 11 minutes ago
    When the catalogue is asked again
    Then the catalogue is asked twice

  Scenario: An answer that is still fresh is not asked for again
    Given the catalogue was asked 9 minutes ago
    When the catalogue is asked again
    Then the catalogue is asked once

  Scenario: A failure is not remembered as though it were an answer
    Given the catalogue fails the first time and answers the second
    When the catalogue is asked, and asked again after it failed
    Then the second answer arrives
    And the catalogue is asked twice

  Scenario: Two callers asking at the same moment share one call
    Given two callers ask the catalogue at the same moment
    When both wait for their answer
    Then the catalogue is asked once
    And all three callers get the same answer

  Scenario: The recordings answer without opening a socket
    Given the recorded sources are loaded
    When the recorded catalogue answer is looked up
    Then the recorded answer is returned

  Scenario: Today, in replay, is the day the recordings were made
    Given the recorded sources are loaded
    Then the reference date is the day the recordings were made

  Scenario: A question nobody recorded is refused rather than sent to the network
    Given the recorded sources are loaded
    When an unrecorded question is looked up and refused
    Then the refusal says to record it

  Scenario: A recorded checkout link is known to have expired
    Given the recorded sources are loaded
    When the recorded checkout answer is looked up
    Then the answer is marked as one that has most likely expired
