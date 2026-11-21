/**
 * "Don't Make Me Angry!" (by Abis Mal & Bluefire, Hitch template): a house rule for the official Hulk (10001a),
 * She-Hulk (01019a) and Hulkling (56029a), one identity-specific card per hero that no deck must hold
 * (`optionalForIdentity`; #890 item 13). An identity-specific card names one hero, so each hero has its own copy
 * (`x.hulk-angry-bf.01` / `.02` / `.03`) with the same abilities. "Permanent. Setup." is data: the game sets it aside
 * with the other Permanent cards and puts it into play at setup.
 *
 * The printed Response: "After an identity-specific card is discarded by an ability, tuck that card under here from
 * your discard pile. (Limit twice per phase.)" One Response with one limit (game issue #922), for a card a card's
 * ability discards from your hand (`cardDiscardedFromHand`), your deck (`cardDiscardedFromDeck`, every path off the top
 * of a player's deck, "discard until" included) or play. The card is discarded, the discarding ability sees it as
 * discarded (Abomination 10026's "if a [physical] resource was discarded this way"), then it is tucked from the discard
 * pile. The cards one effect discards share one response window.
 */
import {
  cards,
  constant,
  definePackAbilities,
  eventTarget,
  on,
  playableTucked,
  query,
  response,
  self,
  spendableFromTucked,
  tuckCards,
  you,
} from "@mc/mod-sdk";

/** One of your identity-specific cards (your hero's). */
const YOUR_IDENTITY_SPECIFIC = query([], { classification: "identitySpecific", controlledBy: you });
const TWICE_PER_PHASE = { count: 2, period: "phase" } as const;

/** The two abilities every copy of the card has, keyed by its card id. */
function dontMakeMeAngry(cardId: string) {
  return {
    // "Tucked cards here may be played and spent as if they were in your hand." Hawkeye's Quiver (`trors`) for the
    // play, Resource Reserve (`falcon` 53021) for the spending, here for every tucked card and you alone.
    [`${cardId}.dont-make-me-angry-constant`]: constant(playableTucked(), spendableFromTucked({ cards: {}, by: you })),
    // The Response, for a card discarded by a card's ability from your hand, your deck or play (see the header).
    [`${cardId}.dont-make-me-angry-response`]: response(
      on.either(
        on.cardDiscardedFromHand({ card: YOUR_IDENTITY_SPECIFIC, yours: true }),
        { on: "cardDiscardedFromDeck", playerIs: "controller", targetIs: YOUR_IDENTITY_SPECIFIC },
        on.playerCardDiscardedFromPlay({ who: YOUR_IDENTITY_SPECIFIC, by: "playerCard" }),
        on.playerCardDiscardedFromPlay({ who: YOUR_IDENTITY_SPECIFIC, by: "encounterCard" }),
      ),
      { limit: TWICE_PER_PHASE },
      tuckCards(cards(eventTarget), self),
    ),
  };
}

export default definePackAbilities({
  ...dontMakeMeAngry("x.hulk-angry-bf.01"), // Hulk
  ...dontMakeMeAngry("x.hulk-angry-bf.02"), // She-Hulk
  ...dontMakeMeAngry("x.hulk-angry-bf.03"), // Hulkling
});
