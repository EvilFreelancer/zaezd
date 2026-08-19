@checkout
Feature: The button says what the link actually does

  The judge opens the link in a private window. A button labelled "Открыть корзину" that lands
  on a search page undoes everything else the product says about honesty, so the wording comes
  from what Tutu returned and from nothing that was decided in advance.

  Scenario Outline: The wording follows what Tutu returned
    Given Tutu returned a link of kind "<kind>"
    When the button is labelled
    Then the button reads "<label>"

    Examples:
      | kind              | label                             |
      | checkout_deeplink | Открыть корзину                   |
      | deeplink          | Открыть страницу выбора           |
      | hotel_page        | Открыть страницу отеля            |
      | order_url         | Открыть заказ                     |
      | seats_url         | Выбрать места                     |
      | search_redirect   | Открыть поиск, корзины не будет   |

  Scenario: Only one kind of link is called a cart
    Given Tutu returned a link of kind "checkout_deeplink"
    When the button is labelled
    Then the button promises a cart

  Scenario Outline: Everything else is not called a cart
    Given Tutu returned a link of kind "<kind>"
    When the button is labelled
    Then the button does not promise a cart

    Examples:
      | kind            |
      | deeplink        |
      | hotel_page      |
      | order_url       |
      | seats_url       |
      | search_redirect |

  Scenario: A kind nobody recognises gets the most cautious wording there is
    Given Tutu returned a link of kind "какой-то новый вид"
    When the button is labelled
    Then the button does not promise a cart
    And the button warns that Tutu did not say what will open

  Scenario: A link with no kind at all is treated the same way
    Given Tutu returned a link with no kind
    When the button is labelled
    Then the button does not promise a cart
    And the button warns that Tutu did not say what will open

  Scenario: An air link warns about the cold browser it will be opened in
    Given Tutu returned a link of kind "deeplink" for a flight
    When the button is labelled
    Then the button warns that a browser without a Tutu session lands on search

  Scenario: A rail link of the same kind carries no such warning
    Given Tutu returned a link of kind "deeplink" for a train
    When the button is labelled
    Then the button carries no warning

  Scenario: The recorded hotel link without a room rate is not called a cart
    Given the recorded checkout link built without a room rate
    When the button is labelled
    Then the button reads "Открыть страницу выбора"
    And the button does not promise a cart

  Scenario: The recorded hotel link with a room rate is a cart
    Given the recorded checkout link built with a room rate
    When the button is labelled
    Then the button reads "Открыть корзину"
    And the button promises a cart
