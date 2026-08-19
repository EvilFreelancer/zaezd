@harness
Feature: Executable specification harness

  Every use case of Zaezd is written here in Gherkin before any unit test and before
  any implementation. This scenario keeps the harness itself honest: while it is green,
  a red scenario below means the product is wrong, not the tooling.

  Scenario: A step definition runs and carries state to the next step
    Given the harness records the value 42
    When the harness reads the recorded value
    Then the recorded value is 42
