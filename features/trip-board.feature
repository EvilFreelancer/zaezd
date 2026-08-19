@web
Feature: The public link opens on a trip, not on a form

  A judge opening this link has already seen twenty projects on the same MCP server. If the
  first thing on screen is an empty form or a chat box, this one is indistinguishable from the
  previous nineteen. So the link opens on a computed trip, and the parts of it that could lie -
  a name from a source, a link that is not a cart, a page with no scripting - are the parts
  worth specifying.

  Scenario: The page is named after the event it shows
    Given the recorded trip is ready to show
    When the page is rendered
    Then the page is titled after "SPb Python Meetup 2026"

  Scenario: The trip travels with the page, so the screen needs no second request
    Given the recorded trip is ready to show
    When the page is rendered
    Then the trip is embedded in the page

  Scenario: A reader with no scripting still learns where and when
    Given the recorded trip is ready to show
    When the page is rendered
    Then the page carries a readable summary for a reader without scripting

  Scenario Outline: A name from a source cannot become markup
    Given an event named <name>
    When the page is rendered
    Then the page contains no unescaped <fragment>

    Examples:
      | name                              | fragment      |
      | "<img src=x onerror=alert(1)>"    | <img          |
      | "</script><script>alert(1)</script>" | </script><script |
      | "Кавычки \"внутри\" названия"     | "внутри"      |

  Scenario: A link that could not be read is explained rather than shown as an empty page
    Given the link cannot be read
    When the page is rendered
    Then the page explains what went wrong

  Scenario: The MCP App gets the same shell with no data in it
    Given the recorded trip is ready to show
    When the page is rendered for an agent
    Then the trip is not embedded in the page
    And the page loads the same renderer as the web page
