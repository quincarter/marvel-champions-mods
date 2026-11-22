/**
 * The Punisher (by MissSugarPink, Hitch templates): every ability of the pack, each modeled on the base-game card named
 * in its comment. The pack's own printed text is the authority (docs/custom-content-packs.md section 6), then the RRG
 * (v1.8) and FFG rulings for what the text does not override. English is the text language; three English faces are
 * the curators' wording errata (Jigsaw "fewest remaining hit points", Modified M4 Carbine "each minion engaged with that
 * player", War Machine Armor in Warpath's form, 42013).
 *
 * Ability ids are `<card code>.<slug>`, as the importer wrote them.
 *
 * The five Loadouts (12-16) ship in the hero set, so they are in the deck: Frank Castle's Setup takes them from the deck
 * and the opening hand, as Valkyrie's Setup takes Death-Glow (25001b), puts the chosen one into play and removes the
 * rest from the game. In paper they are set aside before shuffling; Permanent keeps them out of the deck count and the
 * deck builder lists them in its Setup group (#890 item 16, #896).
 *
 * All-purpose counters (RRG 1.8 "All-Purpose Counter", p. 6) take the type of the card they are on: placed as
 * `"allPurpose"` (a Uses weapon's become ammo), removed as `"any"`.
 *
 * Since SDK 0.51.0 (#890 items 4-6): Warzone plays from the discard pile (`playFromDiscard`), War Machine Armor
 * resolves an Action ability of a card you control (`useActionAbility`), and Avengers' Cache's resource reads the
 * aspect of the card paid for (`generatesFor` with `aspect`).
 */
import {
  controllerOf,
  setAside,
  playFromDiscard,
  playFromHandReducingCost,
  resource,
  useActionAbility,
  after,
  alterEgoAction,
  anAttackableEnemy,
  aScheme,
  attack,
  attacksGainKeywords,
  cards,
  chooseCards,
  chooseOne,
  choosePlayer,
  chooseTarget,
  chosen,
  constant,
  countOf,
  coveredByEngineRule,
  dealDamage,
  definePackAbilities,
  discardCardsCost,
  divide,
  each,
  enemyActivates,
  enemyAttack,
  exhaustCardsCost,
  exhaustThis,
  exhaustYourHero,
  exists,
  findCard,
  forcedResponse,
  forEachCard,
  FRIENDLY_CHARACTER,
  gainsTrait,
  gets,
  heal,
  heroAction,
  heroInterrupt,
  heroResponse,
  ifThen,
  isAttached,
  losesIcon,
  modifyAttack,
  moveCards,
  moveCounters,
  named,
  not,
  on,
  oncePerRound,
  option,
  printedStatOf,
  putIntoPlay,
  query,
  ready,
  removeCounter,
  removeCountersFrom,
  removeThreat,
  removeUpToCounters,
  response,
  rule,
  self,
  setup,
  shuffleDeck,
  stun,
  superlative,
  remainingHpOf,
  thatPlayer,
  theVillain,
  thwart,
  tuckCards,
  tuckedUnder,
  tuckedUnderRef,
  addCounters,
  action,
  applyRuleUntil,
  bindTargets,
  draw,
  firstPlayer,
  valueAtLeast,
  varOf,
  when,
  whenDefeated,
  whenRevealed,
  you,
  yourIdentity,
  YOUR_IDENTITY,
  zone,
  changeForm,
  eachPlayer,
  chosenPlayer,
  ownerOf,
  setVar,
  encounterIconsInPlay,
  sum,
  product,
} from "@mc/mod-sdk";

type Trait = NonNullable<Parameters<typeof gainsTrait>[0]>;
const trait = (name: string): Trait => name.toUpperCase() as Trait;
const WEAPON = trait("Weapon");
const LOADOUT = trait("Loadout");
const MYSTIC = trait("Mystic");
const AERIAL = trait("Aerial");
const ATTACK = trait("Attack");
const THWART = trait("Thwart");

const ALL_PURPOSE = "allPurpose";
const ANY_COUNTER = "any";
const YOUR_UPGRADES = query("upgrade", { controller: "you" });
const DISMANTLED_ICONS = ["acceleration", "amplify", "crisis", "hazard"] as const;
const YOUR_WEAPONS = query("upgrade", { trait: WEAPON, controller: "you" });
const LOADOUT_UPGRADE = query("upgrade", { trait: LOADOUT });
const STASH_HOUSE = query("support", { name: "Stash House" });
const YOUR_STASH_HOUSE = query("support", { name: "Stash House", controller: "you" });
const YOUR_ALLIES = query("ally", { controller: "you" });
/** "The Frank Castle player": whoever controls this pack's identity, not the player an encounter card is revealed to. */
const FRANK_CASTLE_PLAYER = controllerOf(each(query("identity", { printedId: "x.punisher-msp.01a" as never })));
const FRANK_CASTLES_WEAPONS = query("upgrade", { trait: WEAPON, controlledBy: FRANK_CASTLE_PLAYER });
const YOUR_WEAPONS_WITH_COUNTERS = query("upgrade", { trait: WEAPON, controller: "you", hasCounter: ANY_COUNTER });
const YOUR_UPGRADES_WITH_COUNTERS = query("upgrade", { controller: "you", hasCounter: ANY_COUNTER });

export default definePackAbilities({
  // =========================================================================
  // 01a The Punisher (hero identity)
  // =========================================================================

  // 'Til They Stay Down: "Action: Remove 1 all-purpose counter from an upgrade you control → ready that upgrade. (Limit
  // once per round.)" The counter's card is bound by the cost and readied.
  "x.punisher-msp.01a.til-they-stay-down": heroAction(
    { limit: oncePerRound, while: exists(YOUR_UPGRADES_WITH_COUNTERS) },
    chooseTarget("upgrade", YOUR_UPGRADES_WITH_COUNTERS),
    removeCountersFrom(chosen("upgrade"), ANY_COUNTER, 1),
    ready(chosen("upgrade")),
  ),

  // =========================================================================
  // 01b Frank Castle (alter-ego)
  // =========================================================================

  // "Setup: Choose one Loadout upgrade and put it into play. Then, remove the remaining Loadout upgrade cards from the
  // game." The game sets each Permanent card aside before setup (#890 item 16), so the Loadouts are taken from there.
  "x.punisher-msp.01b.setup": setup(
    chooseCards("loadout", setAside(you, LOADOUT_UPGRADE), { min: 1, max: 1 }),
    putIntoPlay(chosen("loadout"), you),
    moveCards(setAside(you, LOADOUT_UPGRADE), "removedFromGame"),
  ),
  // "Action: Exhaust your identity → search your deck for a Weapon upgrade and add it to your hand. (Shuffle.)"
  "x.punisher-msp.01b.frank-castle-action": alterEgoAction(
    { cost: exhaustYourHero },
    chooseCards("weapon", zone("deck", you, { filter: query("upgrade", { trait: WEAPON }) }), { min: 1, max: 1 }),
    moveCards(cards(chosen("weapon")), "hand"),
    shuffleDeck(),
  ),

  // =========================================================================
  // 02 "Knock, Knock. You're Dead." (event)
  // =========================================================================

  // "Hero Action (attack): Deal 6 damage to an enemy. If you control at least 2 Weapon upgrades, deal 8 damage instead
  // and place 1 all-purpose counter on an upgrade you control."
  "x.punisher-msp.02.knock-knock-youre-dead-action": heroAction(
    { label: "attack" },
    anAttackableEnemy("enemy"),
    ifThen(
      valueAtLeast(countOf(YOUR_WEAPONS), 2),
      [
        attack(8, chosen("enemy")),
        chooseTarget("upgrade", YOUR_UPGRADES),
        addCounters(ALL_PURPOSE, 1, chosen("upgrade")),
      ],
      attack(6, chosen("enemy")),
    ),
  ),

  // =========================================================================
  // 03 Dismantled Operation (event)
  // =========================================================================

  // "Hero Action (thwart): Remove 3 threat from a scheme. Choose a side scheme. That scheme loses each [acceleration],
  // [amplify], [crisis], and [hazard] icon until the end of the round. If any icons were lost this way, place 1
  // all-purpose counter on an upgrade you control." Shadowcat's timed icon loss (`iceman` 46019): one `gainsIcon` loss
  // rule per icon until the round's end on the chosen scheme. "If any icons were lost": the four icons in play counted
  // before and after the loss (`encounterIconsInPlay`).
  "x.punisher-msp.03.dismantled-operation-action": heroAction(
    { label: "thwart" },
    aScheme("scheme"),
    thwart(3, chosen("scheme")),
    chooseTarget("side", query("sideScheme")),
    setVar("iconsBefore", encounterIconsInPlay(DISMANTLED_ICONS)),
    ...DISMANTLED_ICONS.map((icon) =>
      applyRuleUntil({ kind: "gainsIcon", icon, target: { inSlot: "side" }, loses: true }, "endOfRound"),
    ),
    ifThen(valueAtLeast(sum(varOf("iconsBefore"), product(-1, encounterIconsInPlay(DISMANTLED_ICONS))), 1), [
      chooseTarget("upgrade", YOUR_UPGRADES),
      addCounters(ALL_PURPOSE, 1, chosen("upgrade")),
    ]),
  ),

  // =========================================================================
  // 04 Many Men (event)
  // =========================================================================

  // "Hero Interrupt (defense): When an enemy attacks a friendly character, choose an enemy → damage from that attack is
  // dealt to the chosen enemy instead." Psychic Misdirection (34033): the attack and its defender stay as they are and
  // only its damage goes to the chosen enemy (`modifyAttack({ damageTo })`).
  "x.punisher-msp.04.many-men-interrupt": heroInterrupt(
    on.enemyAttacks(query("enemy")),
    { label: "defense" },
    chooseTarget("enemy", query("enemy")),
    modifyAttack({ damageTo: chosen("enemy") }),
  ),

  // =========================================================================
  // 05 Locked and Loaded (resource)
  // =========================================================================

  // "Response: After you spend this card, place 2 all-purpose counters on Stash House or an upgrade you control." Pym
  // Particles (12006) for the trigger.
  "x.punisher-msp.05.locked-and-loaded-response": response(
    on.youSpendThis(),
    chooseTarget("target", query(["upgrade", "support"], { anyOf: [YOUR_UPGRADES, YOUR_STASH_HOUSE] })),
    addCounters(ALL_PURPOSE, 2, chosen("target")),
  ),

  // =========================================================================
  // 06-08 Weapons (Restricted and Uses are data)
  // =========================================================================

  // Uzi 9mm SMG: "Hero Action (attack): Exhaust Uzi 9mm SMG and remove 1 ammo counter from it → deal a total of 3
  // damage divided among enemies as you choose. This attack gains ranged." Combo Move (63017) for the division.
  "x.punisher-msp.06.uzi-9mm-smg-action": heroAction(
    { label: "attack", cost: [exhaustThis, removeCounter("ammo", 1)] },
    divide("damage", 3, query("enemy")),
  ),
  // "This attack gains ranged": the attack its own ability makes (each enemy given a share is attacked) has ranged, as
  // Hawkeye's Bow grants it (`attacksGainKeywords` with `via` this card), so a retaliating enemy deals no damage back.
  "x.punisher-msp.06.uzi-9mm-smg-constant": constant(attacksGainKeywords(["ranged"], { via: { self: true } })),
  // Double-Barreled Shotgun: "Hero Action (attack): Exhaust this card and remove 2 ammo counters from it → deal 2 damage
  // to an enemy. Stun that enemy."
  "x.punisher-msp.07.double-barreled-shotgun-action": heroAction(
    { label: "attack", cost: [exhaustThis, removeCounter("ammo", 2)] },
    anAttackableEnemy("enemy"),
    attack(2, chosen("enemy")),
    stun(chosen("enemy")),
  ),
  // Modified M4 Carbine: "Hero Action (attack): Exhaust this card and remove 1 ammo counter from it → choose: • Deal 4
  // damage to an enemy. • Choose a player. Deal 2 damage to the villain and each minion engaged with that player."
  "x.punisher-msp.08.modified-m4-carbine-action": heroAction(
    { label: "attack", cost: [exhaustThis, removeCounter("ammo", 1)] },
    chooseOne(
      option("Deal 4 damage to an enemy", anAttackableEnemy("enemy"), attack(4, chosen("enemy"))),
      option(
        "Deal 2 damage to the villain and each minion engaged with a player",
        choosePlayer("p"),
        attack(2, theVillain),
        forEachCard("minion", each(query("minion", { engagedWithPlayer: chosenPlayer("p") })), attack(2, chosen("minion"))),
      ),
    ),
  ),

  // =========================================================================
  // 09 Stash House (support)
  // =========================================================================

  // "Resource: Exhaust Stash House → generate a [wild] resource."
  "x.punisher-msp.09.stash-house-resource": resource({ wild: 1 }, { cost: exhaustThis }),
  // "Action: Exhaust Stash House → remove up to 2 all-purpose counters from here and place them on an upgrade you
  // control. Any player may trigger this ability." Battery Pack (16034) for the move.
  "x.punisher-msp.09.stash-house-action": action(
    { cost: exhaustThis, triggerableBy: eachPlayer },
    chooseTarget("upgrade", query("upgrade", { controller: "you" })),
    moveCounters(self, chosen("upgrade"), ANY_COUNTER, 2),
  ),

  // =========================================================================
  // 10 Good Cup of Coffee (support)
  // =========================================================================

  // "Alter-Ego Action: Exhaust Good Cup of Coffee → heal 2 damage from your identity. Any player may trigger this
  // ability."
  "x.punisher-msp.10.good-cup-of-coffee-action": alterEgoAction(
    { cost: exhaustThis, triggerableBy: eachPlayer },
    heal(2, yourIdentity),
  ),

  // =========================================================================
  // 11 Microchip (support)
  // =========================================================================

  // "Hero Action: Exhaust Microchip → place 1 all-purpose counter on an upgrade you control."
  "x.punisher-msp.11.microchip-action": heroAction(
    { cost: exhaustThis },
    chooseTarget("upgrade", YOUR_UPGRADES),
    addCounters(ALL_PURPOSE, 1, chosen("upgrade")),
  ),
  // "Action: Exhaust Microchip → remove up to 2 all-purpose counters from an upgrade you control and place them on
  // Stash House."
  "x.punisher-msp.11.microchip-action-2": action(
    { cost: exhaustThis, while: exists(STASH_HOUSE) },
    chooseTarget("upgrade", YOUR_UPGRADES),
    chooseTarget("house", STASH_HOUSE),
    moveCounters(chosen("upgrade"), chosen("house"), ANY_COUNTER, 2),
  ),

  // =========================================================================
  // 12-16 Loadouts (Permanent is data)
  // =========================================================================

  // Warzone: "You can control 1 additional upgrade that has the restricted keyword." The restricted limit (`warm`).
  "x.punisher-msp.12.warzone-constant": constant(rule({ kind: "restrictedLimit", amount: 1 })),
  // "Hero Action: Exhaust Warzone, remove 1 all-purpose counter from a Weapon you control → play an Attack event from
  // your discard pile, paying its costs." The counter is removed as 'Til They Stay Down removes its own; the play is from
  // the discard pile (#890 item 5).
  "x.punisher-msp.12.warzone-action": heroAction(
    { cost: exhaustThis, while: exists(YOUR_WEAPONS_WITH_COUNTERS) },
    chooseTarget("weapon", YOUR_WEAPONS_WITH_COUNTERS),
    removeCountersFrom(chosen("weapon"), ANY_COUNTER, 1),
    playFromDiscard(query("event", { trait: ATTACK })),
  ),

  // High Slayer: "The Punisher gains the Mystic trait. Increase your ally limit by 1." The Triskelion (01073).
  "x.punisher-msp.13.high-slayer-constant": constant(
    gainsTrait(MYSTIC, YOUR_IDENTITY),
    rule({ kind: "allyLimit", amount: 1 }),
  ),
  // "Hero Action: Exhaust High Slayer and discard an ally you control → deal damage to an enemy equal to that ally's
  // printed ATK."
  // The ally is discarded as the cost, before the arrow's text resolves; the damage reads the bound card's printed ATK
  // (`discardCardsCost` binds it to "discarded", as Noble Sacrifice / Bulldozer read theirs).
  "x.punisher-msp.13.high-slayer-action": heroAction(
    { cost: [exhaustThis, discardCardsCost(YOUR_ALLIES)] },
    chooseTarget("enemy", query("enemy")),
    dealDamage(printedStatOf(chosen("discarded"), "atk"), chosen("enemy")),
  ),

  // Angel of Vengeance: "Hero Response: After The Punisher makes a basic thwart, ready this card." Wonder Man's basic
  // power trigger (58001a).
  "x.punisher-msp.14.angel-of-vengeance-response": heroResponse(
    { ...after.basicPowerUsed(YOUR_IDENTITY), eventIs: { power: "thwart" } },
    ready(self),
  ),
  // "Hero Response: After you play a Thwart event, exhaust Angel of Vengeance → draw 1 card." Gamora's Precision
  // (18001a).
  "x.punisher-msp.14.angel-of-vengeance-hero-response": heroResponse(
    after.youPlayedCard(query("event", { trait: THWART })),
    { cost: exhaustThis },
    draw(1),
  ),



  // War Machine Armor: "The Punisher gains the Aerial trait and gets +1 DEF. You get +2 hit points."
  "x.punisher-msp.15.war-machine-armor-constant": constant(
    gainsTrait(AERIAL, YOUR_IDENTITY),
    gets("def", 1, YOUR_IDENTITY),
    gets("hp", 2, YOUR_IDENTITY),
  ),

  // "Hero Response: After you defend against an attack, exhaust this card → play an event with an "Action" ability from
  // your hand (paying its costs), or resolve an "Action" ability on a card you control." Warpath (42013) for the play;
  // the other half uses one Action ability of a card you control, its cost paid (#890 item 6).
  "x.punisher-msp.15.war-machine-armor-response": heroResponse(
    after.defends(YOUR_IDENTITY),
    { cost: exhaustThis },
    chooseOne(
      option(
        "Play an event with an Action ability from your hand",
        playFromHandReducingCost(0, you, {
          filter: query("event", { abilityTiming: ["action", "heroAction"] }),
          ignoreActionTiming: true,
        }),
      ),
      option("Resolve an Action ability on a card you control", useActionAbility()),
    ),
  ),

  // Avengers' Cache: "Each identity gets +1 hand size."
  "x.punisher-msp.16.avengers-cache-constant": constant(gets("handSize", 1, query("identity"))),
  // "Resource: Exhaust Avengers' Cache → generate a [wild] resource for a 'Pool card." Only while paying for a card of
  // the 'Pool aspect (`generatesFor` with `aspect`).
  "x.punisher-msp.16.avengers-cache-resource": resource(
    { wild: 1 },
    { cost: exhaustThis, generatesFor: query([], { aspect: "pool" }) },
  ),

  // =========================================================================
  // 17 Haunting Memories (obligation)
  // =========================================================================

  // "Give to the Frank Castle player. Uses (3 haunted counters). You cannot thwart." Baron Zemo (03028) for the rule.
  "x.punisher-msp.17.haunting-memories-constant": constant(rule({ kind: "cannotThwart", player: you })),
  // "Forced Response: After you play an Attack event or defeat an enemy, remove 1 haunted counter from here." The last
  // counter's removal discards it (Uses).
  "x.punisher-msp.17.haunting-memories-forced-response": forcedResponse(
    on.either(after.youPlayedCard(query("event", { trait: ATTACK })), after.defeats(query([], { controller: "you" }))),
    removeCountersFrom(self, "haunted", 1),
  ),

  // =========================================================================
  // 18 Captured (side scheme, nemesis)
  // =========================================================================

  // "When Revealed: Tuck each Weapon upgrade controlled by the Frank Castle player under here." Silk's tuck. The Frank
  // Castle player's, whoever Captured is revealed to (PR #45 review).
  "x.punisher-msp.18.when-revealed": whenRevealed(tuckCards(cards(each(FRANK_CASTLES_WEAPONS)), self)),
  // "When Defeated: Put each upgrade tucked here into play under its owner's control."
  "x.punisher-msp.18.when-defeated": whenDefeated(
    forEachCard("tucked", tuckedUnderRef(self), putIntoPlay(chosen("tucked"), ownerOf(chosen("tucked")))),
  ),

  // =========================================================================
  // 19 Jigsaw (minion, nemesis)
  // =========================================================================

  // "Quickstrike." is data. "Forced Response: After Jigsaw activates, deal 1 damage to the friendly character with the
  // fewest remaining hit points." You're Dead Meat! (07016) for the superlative.
  "x.punisher-msp.19.jigsaw-forced-response": forcedResponse(
    on.enemyActivates("self"),
    bindTargets("fewest", superlative("lowest", each(FRIENDLY_CHARACTER), remainingHpOf(chosen("candidate")))),
    chooseTarget("pick", { inSlot: "fewest" }, { chooser: firstPlayer }),
    dealDamage(1, chosen("pick")),
  ),

  // =========================================================================
  // 20 Too Ugly to Die (treachery, nemesis)
  // =========================================================================

  // "When Revealed: Change to hero form. If Jigsaw is in play, he activates against you. Otherwise, find Jigsaw and
  // reveal him."
  "x.punisher-msp.20.when-revealed": whenRevealed(
    changeForm(you, "hero"),
    ifThen(
      exists(query("minion", { name: "Jigsaw" })),
      enemyActivates(named("Jigsaw"), { against: you }),
      findCard({ name: "Jigsaw" }, "reveal"),
    ),
  ),

  // =========================================================================
  // 21 Jigsaw Goon (minion, nemesis)
  // =========================================================================

  // "Guard." is data. "Forced Response: After The Punisher attacks a different enemy, Jigsaw Goon attacks The Punisher."
  "x.punisher-msp.21.jigsaw-goon-forced-response": forcedResponse(
    after.attacks(query("hero", { name: "The Punisher" }), { target: query("enemy", { excluding: self }) }),
    enemyAttack(self, { against: you }),
  ),
});
