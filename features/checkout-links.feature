@checkout
Feature: Paying is a checklist, not a button

  The journey there, the room and the journey home are three separate handovers to Tutu. Tutu
  builds the cart in the traveller's own browser; nothing here creates one. And nothing here
  stores a link either - `checkout_ref` expires, so a stored link is a cart button that quietly
  becomes a search page a few hours later.

  Background:
    Given a trip assembled from the recordings

  Scenario: Three links, in the order the traveller uses them
    When the checkout list is built
    Then the list is the journey there, the room, the journey home

  Scenario: Every link says what it will open
    When the checkout list is built
    Then every link carries a label
    And no link is called a cart unless Tutu called it one

  Scenario: The room link is a real cart, because a room rate was asked for
    When the checkout list is built
    Then the room link opens a cart

  Scenario: Without a room rate the room link is a page and says so
    Given the hotel details cannot be fetched
    When the checkout list is built
    Then the room link does not open a cart
    And the room link reads "Открыть страницу выбора"

  Scenario: A link Tutu could not build falls back to search, honestly labelled
    Given Tutu refuses to build checkout links
    When the checkout list is built
    Then every link reads "Открыть поиск, корзины не будет"

  Scenario: Links built from a recording say they came from one
    Given the links come from a recording
    When the checkout list is built
    Then every link is marked as recorded

  Scenario: A trip with no hotel hands over two links, not three
    Given the trip has no hotel
    When the checkout list is built
    Then the list is the journey there, the journey home
