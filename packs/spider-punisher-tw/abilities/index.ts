/**
 * Spider-Punisher (by T-Wrecks, Hitch templates): every ability of the pack, each modeled on the base-game card named in
 * its comment. The pack's own printed text is the authority (docs/custom-content-packs.md section 6), then the RRG
 * (v1.8) and FFG rulings for what the text does not override. English is the text language; the Spanish pictures are
 * the curators' translation.
 *
 * Ability ids are `<card code>.<slug>`, as the importer wrote them.
 *
 * Since SDK 0.51.0 (#890 items 1-3): Web-Sling hears the end-of-phase ready step (`on.yourCardsReadiedAtPhaseEnd`,
 * its cards in slot `readied.cards`); Enhanced Combat Sense's star is a resource that works from the hand and pays
 * for its own card (`inHand`), its count `paid.ability.<id>`; With Great Firepower's resource pays only an upgrade's
 * ability cost (`forAbility`).
 */
import {
  after,
  alterEgoAction,
  anAttackableEnemy,
  attack,
  attacksGainKeywords,
  boost,
  cancelRevealedCard,
  cards,
  chooseCards,
  chooseOne,
  chooseTarget,
  chosen,
  confuse,
  constant,
  countOf,
  coveredByEngineRule,
  dealDamage,
  definePackAbilities,
  discard,
  discardCardsCost,
  discardThis,
  draw,
  eitherCost,
  encounterCards,
  enemyAttack,
  exhaust,
  exhaustCardsCost,
  exhaustThis,
  exhaustYourHero,
  exists,
  findCard,
  forcedInterrupt,
  forcedResponse,
  gainsTrait,
  giveTough,
  hasStatus,
  hasTrait,
  heroAction,
  heroInterrupt,
  ifThen,
  instead,
  lookAtAndRearrange,
  min,
  moveCards,
  on,
  oncePerPhase,
  onlySourceRemovesThreat,
  option,
  packObligation,
  placeThreat,
  playFromHandReducingCost,
  preventDamage,
  product,
  putIntoPlay,
  query,
  ready,
  refCount,
  removeThreat,
  repeatTimes,
  resource,
  response,
  scaled,
  retargetAttack,
  revealCard,
  self,
  shuffleDeck,
  stun,
  sum,
  surge,
  takeDamageCost,
  theMainScheme,
  theVillain,
  valueAtLeast,
  varOf,
  when,
  whenRevealed,
  you,
  yourIdentity,
  YOUR_IDENTITY,
  zone,
} from "@mc/mod-sdk";

// The content package's `trait()` is not part of the SDK; a trait is its upper-cased name.
type Trait = NonNullable<Parameters<typeof gainsTrait>[0]>;
const trait = (name: string): Trait => name.toUpperCase() as Trait;
const AERIAL = trait("Aerial");
const WEAPON = trait("Weapon");
const TECH = trait("Tech");
const WEB_SHOOTER = trait("Web-Shooter");
const ELITE = trait("Elite");

const WEB_SHOOTER_UPGRADE = query("upgrade", { trait: WEB_SHOOTER });
const YOUR_WEAPON_OR_TECH = query("upgrade", { anyTrait: [WEAPON, TECH], controller: "you" });
const YOUR_WEB_SHOOTERS = query("upgrade", { trait: WEB_SHOOTER, controller: "you" });
const YOUR_EXHAUSTED_UPGRADES = query("upgrade", { controller: "you", exhausted: true });
const YOUR_ALLIES = query("ally", { controller: "you" });
const ENHANCED_COMBAT_SENSE_RESOURCE = "x.spider-punisher-tw.02.enhanced-combat-sense-constant";
const UPGRADES_READIED = query("upgrade", { inSlot: "readied.cards" });

/** "Deal 1 damage to an enemy or remove 1 threat from a scheme." */
const damageOrThreat = () =>
  chooseOne(
    option("Deal 1 damage to an enemy", chooseTarget("enemy", query("enemy")), dealDamage(1, chosen("enemy"))),
    option("Remove 1 threat from a scheme", chooseTarget("scheme", query("scheme")), removeThreat(1, chosen("scheme"))),
  );

const NON_ELITE_MINION = query("minion", { withoutTrait: ELITE });

export default definePackAbilities({
  // =========================================================================
  // 01a Spider-Punisher (hero identity)
  // =========================================================================

  // "[star] Spider-Punisher's attacks from Web-Shooter upgrades gain ranged." Powered Gauntlets (56065) for the
  // constant keyword grant; `via` is the card the attack is made from (an upgrade's attack ability).
  "x.spider-punisher-tw.01a.spider-punisher-constant": constant(
    attacksGainKeywords(["ranged"], { attacker: YOUR_IDENTITY, via: WEB_SHOOTER_UPGRADE }),
  ),
  // Web-Sling: "Response: After you ready your cards at the end of the player phase, for each 2 upgrades you readied
  // this way, deal 1 damage to an enemy or remove 1 threat from a scheme (to a maximum of 3)." The ready step's own
  // announcement (#890 item 1); usable once at least 2 upgrades were readied.
  "x.spider-punisher-tw.01a.web-sling": response(
    on.yourCardsReadiedAtPhaseEnd(),
    { while: valueAtLeast(countOf(UPGRADES_READIED), 2) },
    repeatTimes(min(scaled(countOf(UPGRADES_READIED), { divide: { by: 2, round: "down" } }), 3), damageOrThreat()),
  ),

  // =========================================================================
  // 01b Peter Parker (alter-ego)
  // =========================================================================

  // Vengeance: "Action: Search your deck and discard pile for a Web-Shooter upgrade and add it to your hand. (Limit once
  // per phase.)" Thor's Worthy (06001b) with a trait in place of the name, one card chosen.
  "x.spider-punisher-tw.01b.vengeance": alterEgoAction(
    { limit: oncePerPhase },
    chooseCards("found", zone(["deck", "discard"], you, { filter: WEB_SHOOTER_UPGRADE }), { min: 1, max: 1 }),
    moveCards(cards(chosen("found")), "hand"),
    shuffleDeck(),
  ),

  // =========================================================================
  // 02 Enhanced Combat Sense (event)
  // =========================================================================

  // "[star] You can exhaust any number of Weapon or Tech upgrades you control to generate that many [wild] resources
  // while paying for this card." A resource of the card in hand that pays for itself alone (#890 item 2).
  "x.spider-punisher-tw.02.enhanced-combat-sense-constant": resource(
    { kind: "amount", resource: "wild", amount: countOf(query("upgrade", { inSlot: "exhausted" })) },
    { inHand: true, cost: exhaustCardsCost(YOUR_WEAPON_OR_TECH, { max: "any" }) },
  ),
  // "Hero Interrupt: When an encounter card is revealed from the encounter deck, cancel all of its effects and discard
  // it. For each upgrade you exhausted to pay for this card, deal 1 damage to an enemy or remove 1 threat from a
  // scheme." Enhanced Spider-Sense (01004) for the timing; the count is what the star's resource generated in this
  // card's payment (`paid.ability.<id>`).
  "x.spider-punisher-tw.02.enhanced-combat-sense-interrupt": heroInterrupt(
    when.encounterCardRevealedFromEncounterDeck(),
    cancelRevealedCard(),
    repeatTimes(varOf(`paid.ability.${ENHANCED_COMBAT_SENSE_RESOURCE}`), damageOrThreat()),
  ),

  // =========================================================================
  // 03 Point Blank (event)
  // =========================================================================

  // "Hero Action (attack): Deal 3 damage to an enemy. You may exhaust up to 2 Weapon upgrades you control. For each
  // upgrade exhausted this way, deal 3 damage to that enemy." In the printed order, each its own instance of damage
  // (PR #44 review): the attack's 3 first (a tough status card stops only that one), then 3 for each Weapon exhausted.
  "x.spider-punisher-tw.03.point-blank-action": heroAction(
    { label: "attack" },
    anAttackableEnemy("enemy"),
    attack(3, chosen("enemy")),
    chooseTarget("weapons", query("upgrade", { trait: WEAPON, controller: "you", exhausted: false }), {
      count: 2,
      upTo: true,
    }),
    exhaust(chosen("weapons")),
    repeatTimes(refCount(chosen("weapons")), dealDamage(3, chosen("enemy"))),
  ),

  // =========================================================================
  // 04 Web Snatch (event)
  // =========================================================================

  // "Hero Action: Stun an enemy. Choose: • Search your deck and discard pile for an upgrade and add it to your hand.
  // (Shuffle.) • Discard an attachment from the villain."
  "x.spider-punisher-tw.04.web-snatch-action": heroAction(
    chooseTarget("enemy", query("enemy")),
    stun(chosen("enemy")),
    chooseOne(
      option(
        "Search your deck and discard pile for an upgrade",
        chooseCards("found", zone(["deck", "discard"], you, { filter: query("upgrade") }), { min: 1, max: 1 }),
        moveCards(cards(chosen("found")), "hand"),
        shuffleDeck(),
      ),
      option(
        "Discard an attachment from the villain",
        chooseTarget("attachment", query("attachment", { host: theVillain })),
        discard(chosen("attachment")),
      ),
    ),
  ),

  // =========================================================================
  // 05 Neighborhood Watch (upgrade)
  // =========================================================================

  // "While 2 or more upgrades you control are exhausted, your identity gains the Aerial trait." Cloak of Levitation
  // (09009)'s grant, scoped by `while`.
  "x.spider-punisher-tw.05.neighborhood-watch-constant": constant(
    gainsTrait(AERIAL, YOUR_IDENTITY, { while: valueAtLeast(countOf(YOUR_EXHAUSTED_UPGRADES), 2) }),
  ),
  // "Hero Action: If your identity has the Aerial trait, exhaust this card → ready Spider-Punisher."
  "x.spider-punisher-tw.05.neighborhood-watch-action": heroAction(
    { cost: exhaustThis, while: hasTrait(yourIdentity, AERIAL) },
    ready(yourIdentity),
  ),

  // =========================================================================
  // 06 With Great Firepower (upgrade)
  // =========================================================================

  // "Hero Resource: Exhaust this card → generate a [wild] resource for an upgrade ability." Only for an ability's cost on
  // an upgrade, never to play one (#890 item 3).
  "x.spider-punisher-tw.06.with-great-firepower-resource": resource(
    { wild: 1 },
    { form: "hero", cost: exhaustThis, generatesFor: query("upgrade"), forAbility: true },
  ),
  // "Alter-Ego Action: Exhaust this card → play a Weapon or Tech upgrade from
  // your hand, reducing its cost by 2." Team-Building Exercise (`ant`) for the reduced play.
  "x.spider-punisher-tw.06.with-great-firepower-action": alterEgoAction(
    { cost: exhaustThis },
    playFromHandReducingCost(2, you, { filter: query("upgrade", { anyTrait: [WEAPON, TECH] }) }),
  ),

  // =========================================================================
  // 07 Concrete Perch (support)
  // =========================================================================

  // "Hero Action: Exhaust Concrete Perch and X Weapon or Tech upgrades you control (to a maximum of 4 upgrades) → look at
  // the top X cards of the encounter deck and put them back in any order." Strength in Numbers (cap) for the bound
  // exhaust; the look is `lookAtAndRearrange` on the top X.
  "x.spider-punisher-tw.07.concrete-perch-action": heroAction(
    { cost: [exhaustThis, exhaustCardsCost(YOUR_WEAPON_OR_TECH, { max: 4, bind: "n" })] },
    lookAtAndRearrange(encounterCards(["deck"], undefined, varOf("n"))),
  ),

  // =========================================================================
  // 08 Armor-Piercing Rounds (upgrade)
  // =========================================================================

  // "Hero Action (attack): Spend a [mental] resource and exhaust this card → deal 2 damage to an enemy. If that enemy
  // has a tough status card, deal 5 damage instead. This attack gains piercing."
  "x.spider-punisher-tw.08.armor-piercing-rounds-action": heroAction(
    { label: "attack", cost: [{ resources: { mental: 1 } }, exhaustThis] },
    anAttackableEnemy("enemy"),
    ifThen(
      hasStatus(chosen("enemy"), "tough"),
      attack(5, chosen("enemy"), { keywords: ["piercing"] }),
      attack(2, chosen("enemy"), { keywords: ["piercing"] }),
    ),
  ),

  // =========================================================================
  // 09 EMP Rounds (upgrade)
  // =========================================================================

  // "Hero Action: Spend a [energy] resource and exhaust this card → stun or confuse a minion. You may shuffle this card
  // into your deck to stun or confuse the villain instead."
  "x.spider-punisher-tw.09.emp-rounds-action": heroAction(
    { cost: [{ resources: { energy: 1 } }, exhaustThis] },
    chooseOne(
      option("Stun a minion", chooseTarget("minion", query("minion")), stun(chosen("minion"))),
      option("Confuse a minion", chooseTarget("minion", query("minion")), confuse(chosen("minion"))),
      option("Shuffle this card into your deck to stun the villain", moveCards(cards(self), "deckShuffle"), stun(theVillain)),
      option(
        "Shuffle this card into your deck to confuse the villain",
        moveCards(cards(self), "deckShuffle"),
        confuse(theVillain),
      ),
    ),
  ),

  // =========================================================================
  // 10 High Explosive Rounds (upgrade)
  // =========================================================================

  // "Hero Action (attack): Spend a [physical] resource and exhaust this card → deal 3 damage to an enemy. This attack
  // gains overkill. If this attack defeats an enemy, draw 1 card."
  "x.spider-punisher-tw.10.high-explosive-rounds-action": heroAction(
    { label: "attack", cost: [{ resources: { physical: 1 } }, exhaustThis] },
    anAttackableEnemy("enemy"),
    attack(3, chosen("enemy"), { keywords: ["overkill"], bind: "hit" }),
    ifThen(valueAtLeast(varOf("hit.defeated"), 1), draw(1)),
  ),

  // =========================================================================
  // 11 Incendiary Rounds (upgrade)
  // =========================================================================

  // "Hero Action (attack): Spend 1 resource of any type and exhaust this card → deal 3 damage to an enemy. Reduce this
  // damage by 1 for each other enemy in play, to a maximum of 2. Then, deal 1 damage to that many other enemies." The
  // other enemies are counted when the attack is made (up to 2): the attack deals 3 minus that, then 1 damage to that
  // many of them.
  "x.spider-punisher-tw.11.incendiary-rounds-action": heroAction(
    { label: "attack", cost: [{ resources: 1 }, exhaustThis] },
    anAttackableEnemy("enemy"),
    chooseTarget("others", query("enemy", { excluding: chosen("enemy") }), {
      count: min(2, countOf(query("enemy", { excluding: chosen("enemy") }))),
    }),
    attack(sum(3, product(-1, refCount(chosen("others")))), chosen("enemy")),
    dealDamage(1, chosen("others")),
  ),

  // =========================================================================
  // 12 Swing and Reload (upgrade)
  // =========================================================================

  // "Hero Action: If your identity has the Aerial trait, exhaust this card → ready another upgrade you control."
  "x.spider-punisher-tw.12.swing-and-reload-action": heroAction(
    { cost: exhaustThis, while: hasTrait(yourIdentity, AERIAL) },
    chooseTarget("upgrade", query("upgrade", { controller: "you", excluding: self })),
    ready(chosen("upgrade")),
  ),
  // "Hero Interrupt: When you would take any amount of damage, discard this card → prevent that damage." Defensive
  // Stance (08032) with all of it prevented.
  "x.spider-punisher-tw.12.swing-and-reload-interrupt": heroInterrupt(
    when.damage(YOUR_IDENTITY),
    { cost: discardThis },
    preventDamage(),
  ),

  // =========================================================================
  // 13 Punisher No More (obligation)
  // =========================================================================

  // "Give to the Peter Parker player. You may flip to alter-ego form. Choose: • Discard 2 Web-Shooter upgrades you
  // control. Remove Punisher No More from the game. • Exhaust Peter Parker → discard this card." The shared obligation
  // shape (`packObligation`, Throg's Between Two Worlds), the first option as the card's own.
  "x.spider-punisher-tw.13.obligation": packObligation("Peter Parker", {
    label: "Discard 2 Web-Shooter upgrades you control. Remove Punisher No More from the game",
    effects: [
      chooseTarget("shooters", YOUR_WEB_SHOOTERS, { count: 2 }),
      discard(chosen("shooters")),
      moveCards(cards(self), "removedFromGame"),
    ],
  }),

  // =========================================================================
  // 14 Green Goblin (minion, nemesis)
  // =========================================================================

  // "Toughness." is a data keyword. "Forced Interrupt: When Green Goblin attacks you, he attacks an ally you control
  // instead (if able)." Hercules' Protect Humanity (59004) for the retarget, on his own attack.
  "x.spider-punisher-tw.14.green-goblin-forced-interrupt": forcedInterrupt(
    on.enemyAttacks("self", { againstYou: true }),
    ifThen(exists(YOUR_ALLIES), [chooseTarget("ally", YOUR_ALLIES), retargetAttack(chosen("ally"))]),
  ),

  // =========================================================================
  // 15 The Goblin's Ultimatum (side scheme, nemesis)
  // =========================================================================

  // "Threat cannot be removed from this scheme except by its own ability." Focus the Senses' (60012)
  // `onlySourceRemovesThreat`: every removal is stopped but one whose removing card is this scheme (its Hero Action).
  "x.spider-punisher-tw.15.the-goblins-ultimatum-constant": constant(onlySourceRemovesThreat({ self: true }, { self: true })),
  // "Hero Action: Exhaust your hero, discard 1 upgrade you control, or take 2 damage → remove 1 threat from this scheme."
  "x.spider-punisher-tw.15.the-goblins-ultimatum-action": heroAction(
    { cost: eitherCost(exhaustYourHero, discardCardsCost(query("upgrade", { controller: "you" })), takeDamageCost(2)) },
    removeThreat(1, self),
  ),
  // "Forced Response: After the player phase ends, find the Punisher No More obligation and reveal it. Discard this
  // card."
  "x.spider-punisher-tw.15.the-goblins-ultimatum-forced-response": forcedResponse(
    after.phaseEnding("player"),
    findCard({ name: "Punisher No More" }, "reveal"),
    discard(self),
  ),

  // =========================================================================
  // 16 Reorganized Crime (treachery, nemesis)
  // =========================================================================

  // "When Revealed: Search the encounter discard pile for a non-Elite minion and put it into play engaged with you. Give
  // that minion a tough status card. If you cannot, this card gains surge." Ransacked Armory's search (24037).
  "x.spider-punisher-tw.16.when-revealed": whenRevealed(
    // Mandatory when one is there (`min: 1`); with none in the discard pile the choice is empty and it gains surge.
    chooseCards("minion", encounterCards(["discard"], NON_ELITE_MINION), { min: 1, max: 1 }),
    ifThen(
      valueAtLeast(refCount(chosen("minion")), 1),
      [putIntoPlay(chosen("minion"), you), giveTough(chosen("minion"))],
      surge(),
    ),
  ),
  // "[star] Boost: Reveal this card."
  "x.spider-punisher-tw.16.boost": boost(revealCard(self)),

  // =========================================================================
  // 17 Revealed Identity (obligation, nemesis)
  // =========================================================================

  // An obligation of the nemesis set that stays in play: the shared obligation choice does not apply to it.
  "x.spider-punisher-tw.17.obligation": coveredByEngineRule(),
  // "Forced Interrupt: When the villain would scheme against you, it attacks you instead. Place 2 threat on the main
  // scheme after that attack." Get Behind Me! (01078) for "the villain attacks you instead".
  "x.spider-punisher-tw.17.revealed-identity-forced-interrupt": forcedInterrupt(
    on.enemySchemes(query("villain")),
    instead(enemyAttack(theVillain, { against: you }), placeThreat(2, theMainScheme)),
  ),
  // "Hero Action: Spend 2 resources of any type → discard this card."
  "x.spider-punisher-tw.17.revealed-identity-action": heroAction({ cost: { resources: 2 } }, discard(self)),
});
