/**
 * The Rose (by BigDarsh & Bluefire, Hitch templates): every ability of the scenario, each modeled on the base-game card
 * named in its comment. The pack's own printed text is the authority (docs/custom-content-packs.md section 6), then the
 * RRG (v1.8) and FFG rulings for what the text does not override.
 *
 * Ability ids are `<card code>.<slug>`, as the importer wrote them. Cards: 01 The Rose (I/II/III as 01/02/03), 04a-06b
 * the main scheme stages, 07 Collateral Chaos, 08 Lawless Justice, 09 Hero Resistance, 10 Twisted Allegiance (the back
 * of Hero Resistance in print: here its own card, set aside at setup), 11 Anti-Hulk Cannon, 12 Rose's Greenhouse, 13
 * Silent Pruning, 14 Nowhere to Hide.
 *
 * Fisk counters: the scenario's own counter type, `"fisk"`, on the two Fisk environments (07, 08); Hero Resistance (09)
 * has no Fisk trait and only removes them.
 *
 * Overdefeated side schemes (09, 12): `overdefeated` reads the excess threat the defeating removal attempted
 * (`defeatExcessThreat`, #890 item 8); "already has steady or stalwart" (12) leaves Rose's Greenhouse's own grant out
 * (`keywordNotFromSelf`, #890 item 9). Both since SDK 0.51.0.
 */
import {
  addCounters,
  addToVictoryDisplay,
  advanceMainScheme,
  attachCard,
  cards,
  countOf,
  boost,
  chooseCards,
  chooseOne,
  chooseTarget,
  chosen,
  constant,
  countersOn,
  allOf,
  anyOf,
  defeatedWithExcessDamage,
  exists,
  heroResponse,
  not,
  oncePerRound,
  overdefeated,
  perHero,
  response,
  definePackAbilities,
  discard,
  each,
  encounterCards,
  encounterSetAside,
  engagedPlayerOf,
  enemyActivates,
  enemyAttack,
  findCard,
  firstPlayer,
  forcedInterrupt,
  setVar,
  varOf,
  when,
  forcedResponse,
  forEachCard,
  gainsKeyword,
  gainsTrait,
  gets,
  giveBoostCard,
  giveTough,
  hasStatus,
  ifThen,
  inMode,
  moveCards,
  on,
  option,
  putIntoPlay,
  query,
  refCount,
  removeCountersFrom,
  removeStatus,
  revealCard,
  revealSetAside,
  self,
  setup,
  shuffleEncounterDeck,
  shuffleInSetAsideModularSet,
  modifyAttack,
  theVillain,
  valueAtLeast,
  whenDefeated,
  whenRevealed,
  you,
  zone,
  named,
} from "@mc/mod-sdk";

type Trait = NonNullable<Parameters<typeof gainsTrait>[0]>;
const trait = (name: string): Trait => name.toUpperCase() as Trait;
const FISK = trait("Fisk");
const INFLUENCED = trait("Influenced");
const ELITE = trait("Elite");

const FISK_COUNTER = "fisk";
const FISK_ENVIRONMENT = query("environment", { trait: FISK });
const FISK_ENVIRONMENT_WITH_COUNTERS = query("environment", { trait: FISK, hasCounter: FISK_COUNTER });
const FISK_ATTACHMENT = query("attachment", { trait: FISK });
const INFLUENCED_MINION = query("minion", { trait: INFLUENCED });
const ATTACHED_MINION = query("minion", { hostOfSelf: true });
/** "If it already has steady or stalwart": not counting Rose's Greenhouse's own grant (#890 item 9). */
const VILLAIN_ALREADY_STEADY_OR_STALWART = query("villain", {
  hostOfSelf: true,
  anyOf: [
    { withKeyword: "steady", keywordNotFromSelf: true },
    { withKeyword: "stalwart", keywordNotFromSelf: true },
  ],
});
const UPGRADE_ON_A_SCHEME = query("upgrade", { host: each(query(["mainScheme", "sideScheme"])) });

/** "Place 1 Fisk counter on a Fisk environment" (the first player chooses it for an encounter card). */
const fiskCounterOnAnEnvironment = (n = 1) => [
  chooseTarget("fiskEnvironment", FISK_ENVIRONMENT, { chooser: firstPlayer }),
  addCounters(FISK_COUNTER, n, chosen("fiskEnvironment")),
];
/** "Place 1 Fisk counter on each Fisk environment." */
const fiskCounterOnEach = () => forEachCard("env", each(FISK_ENVIRONMENT), addCounters(FISK_COUNTER, 1, chosen("env")));
/** "Search the encounter deck and discard pile for a Fisk attachment and reveal it. (Shuffle.)" */
const revealAFiskAttachment = () => [
  chooseCards("fiskAttachment", encounterCards(["deck", "discard"], FISK_ATTACHMENT), { min: 1, max: 1, chooser: firstPlayer }),
  revealCard(chosen("fiskAttachment"), you),
  shuffleEncounterDeck(),
];
/**
 * "Reveal the topmost [card] of the encounter deck (shuffle), or the topmost [card] of the encounter discard pile if
 * there is none." Cape-Killer's topmost pick (`cw` 56?, `topmostOnly`), deck first. Each pick is forced (`min: 1`): with
 * a match in the deck it is revealed, never skipped for the discard pile; with none, the pick binds nothing (the
 * engine's `chooseCards` asks for no more than there are) and the discard pile's topmost is revealed (PR #47 review).
 */
const revealTopmost = (q: ReturnType<typeof query>) => [
  chooseCards("top", encounterCards(["deck"], q, { topmostOnly: true }), { min: 1, max: 1 }),
  ifThen(
    valueAtLeast(refCount(chosen("top")), 1),
    [revealCard(chosen("top"), firstPlayer), shuffleEncounterDeck()],
    [
      chooseCards("topDiscard", encounterCards(["discard"], q, { topmostOnly: true }), { min: 1, max: 1 }),
      revealCard(chosen("topDiscard"), firstPlayer),
    ],
  ),
];

export default definePackAbilities({
  // =========================================================================
  // 01-03 The Rose (villain, stages I-III)
  // =========================================================================

  // I: "When Defeated: Advance the main scheme to stage 3A." Heart of Shadow's jump (`shadowland`).
  "x.the-rose-bf.01.when-defeated-i": whenDefeated(advanceMainScheme({ to: { stageNumber: 3 } })),
  // II: "When Revealed: Search the encounter deck and discard pile for a Fisk attachment and reveal it. (Shuffle.)"
  "x.the-rose-bf.01.when-revealed-ii": whenRevealed(...revealAFiskAttachment()),
  // II: "When Defeated: In expert mode, advance the main scheme to stage 3A."
  "x.the-rose-bf.01.when-defeated-ii": whenDefeated(ifThen(inMode("expert"), advanceMainScheme({ to: { stageNumber: 3 } }))),
  // III: "Steady." is data. "When Revealed: Search … for a Fisk attachment and reveal it. (Shuffle.)"
  "x.the-rose-bf.01.when-revealed-iii": whenRevealed(...revealAFiskAttachment()),

  // =========================================================================
  // 04a-06b Main scheme stages
  // =========================================================================

  // 1A: "Setup: Put Collateral Chaos, Lawless Justice and Hero Resistance into play. Set aside the mini-boss modular
  // set." The set-aside modular set is the scenario's `setAsideModularSetCount: 1` (The Hood's shape): the players pick
  // it at setup.
  "x.the-rose-bf.04a.setup": setup(
    findCard({ name: "Collateral Chaos" }, "play"),
    findCard({ name: "Lawless Justice" }, "play"),
    findCard({ name: "Hero Resistance" }, "play"),
    shuffleEncounterDeck(),
  ),
  // 1B: "When Revealed: Search the encounter deck for an environment and put it into play. (Shuffle.)"
  "x.the-rose-bf.04b.when-revealed": whenRevealed(
    chooseCards("environment", encounterCards(["deck"], query("environment")), { min: 1, max: 1, chooser: firstPlayer }),
    putIntoPlay(chosen("environment")),
    shuffleEncounterDeck(),
  ),
  // 1B: "[star] Forced Response: After resolving step 1 of the villain phase, place 1 Fisk counter on each Fisk
  // environment." Public Outrage (56122b) for the trigger.
  "x.the-rose-bf.04b.public-enemy-number-one-forced-response": forcedResponse(on.villainStepResolved(), fiskCounterOnEach()),

  // 2A: "When Revealed: Choose: • Place 1 Fisk counter on each Fisk environment. • Search the encounter deck and discard
  // pile for Anti-Hulk Cannon and reveal it. (Shuffle.)" The first player chooses (an encounter card).
  "x.the-rose-bf.04a.when-revealed-2a": whenRevealed(
    chooseOne(
      option("Place 1 Fisk counter on each Fisk environment", fiskCounterOnEach()),
      option(
        "Search for Anti-Hulk Cannon and reveal it",
        chooseCards("cannon", encounterCards(["deck", "discard"], query("attachment", { name: "Anti-Hulk Cannon" })), {
          min: 1,
          max: 1,
        }),
        revealCard(chosen("cannon"), you),
        shuffleEncounterDeck(),
      ),
    ),
  ),
  // 2B: "[star] Forced Response: After resolving step 1 of the villain phase, place 1 Fisk counter on each Fisk
  // environment. The first player places 1 additional Fisk counter on a Fisk environment." "If this stage is completed,
  // the players lose the game." is the main scheme's own rule.
  "x.the-rose-bf.04b.shadows-of-influence-forced-response": forcedResponse(
    on.villainStepResolved(),
    fiskCounterOnEach(),
    ...fiskCounterOnAnEnvironment(),
  ),

  // 3A: "When Revealed: Flip the Hero Resistance environment and reveal Twisted Allegiance. Advance to stage 3B." The
  // printed card's back is its own card here: Hero Resistance leaves play (removed from the game, as a flipped face is
  // no longer that card) and the set-aside Twisted Allegiance is revealed.
  "x.the-rose-bf.04a.when-revealed-3a": whenRevealed(
    moveCards(cards(each(query("environment", { name: "Hero Resistance" }))), "removedFromGame"),
    ...revealSetAside(query("attachment", { name: "Twisted Allegiance" }), you),
    advanceMainScheme(),
  ),
  // 3B: "When Revealed: Each Influenced minion activates against the player it is engaged with."
  "x.the-rose-bf.04b.when-revealed-3b": whenRevealed(
    forEachCard("minion", each(INFLUENCED_MINION), enemyActivates(chosen("minion"), { against: engagedPlayerOf(chosen("minion")) })),
  ),
  // 3B: "[star] Forced Response: After resolving step 1 of the villain phase, place 1 Fisk counter on each Fisk
  // environment."
  "x.the-rose-bf.04b.mindstorm-uprising-forced-response": forcedResponse(on.villainStepResolved(), fiskCounterOnEach()),

  // =========================================================================
  // 07-09 Fisk environments (Permanent is data)
  // =========================================================================

  // Collateral Chaos: "Forced Response: After a Fisk counter is placed here, if there are 6 or more Fisk counters here,
  // remove each Fisk counter from here. Reveal the topmost side scheme of the encounter deck (shuffle), or the topmost
  // side scheme of the encounter discard pile if there is none." Magneto's Magnets Gather (`mut_gen`) for the
  // threshold; the counters are removed (55011a Hypnotic Gaze's reset).
  "x.the-rose-bf.07.collateral-chaos-forced-response": forcedResponse(
    on.countersPlaced(FISK_COUNTER, "self"),
    ifThen(valueAtLeast(countersOn(self, FISK_COUNTER), 6), [
      removeCountersFrom(self, FISK_COUNTER, countersOn(self, FISK_COUNTER)),
      ...revealTopmost(query("sideScheme")),
    ]),
  ),
  // Lawless Justice: the same at 4 or more, with a minion.
  "x.the-rose-bf.08.lawless-justice-forced-response": forcedResponse(
    on.countersPlaced(FISK_COUNTER, "self"),
    ifThen(valueAtLeast(countersOn(self, FISK_COUNTER), 4), [
      removeCountersFrom(self, FISK_COUNTER, countersOn(self, FISK_COUNTER)),
      ...revealTopmost(query("minion")),
    ]),
  ),
  // Hero Resistance: "Response: After excess damage is dealt to a minion, or after a side scheme is overdefeated (more
  // threat was removed from it than it had), remove 1 Fisk counter from a Fisk environment. (Limit once per round.)"
  // One ability on either event (`on.either`, Stryfe's 40168a), so the limit is shared; excess damage only exists on a
  // defeat (RRG 1.8 "Excess Damage", p. 19), read as Bull in a China Shop (60135b) reads it. Only usable while a Fisk
  // environment has a Fisk counter to remove.
  "x.the-rose-bf.09.hero-resistance-response": response(
    on.either(on.defeated(query("minion")), on.schemeDefeated(query("sideScheme"))),
    {
      while: allOf(anyOf(defeatedWithExcessDamage, overdefeated), exists(FISK_ENVIRONMENT_WITH_COUNTERS)),
      limit: oncePerRound,
    },
    chooseTarget("fiskEnvironment", FISK_ENVIRONMENT_WITH_COUNTERS),
    removeCountersFrom(chosen("fiskEnvironment"), FISK_COUNTER, 1),
  ),

  // =========================================================================
  // 10 Twisted Allegiance (attachment, set aside)
  // =========================================================================

  // "Permanent. Victory 1." are data. "When Revealed: Put the set-aside mini-boss minion into play engaged with you and
  // attach this card to it. Shuffle the rest of the mini-boss modular set into the encounter deck." The minion of the
  // set-aside modular set (`setAsideModularSetCount: 1`); the rest goes in with The Hood's shuffle-in.
  // The only set-aside minion is the set-aside modular set's (the scenario sets no other minion aside). With a set
  // that has none (PR #47 review), nothing can be put into play: Twisted Allegiance has no host and is discarded
  // (RRG 1.8 "Attachments", p. 7), and the set is still shuffled in.
  "x.the-rose-bf.10.when-revealed": whenRevealed(
    chooseCards("boss", encounterSetAside(query("minion")), { min: 1, max: 1, chooser: firstPlayer }),
    ifThen(
      valueAtLeast(refCount(chosen("boss")), 1),
      [putIntoPlay(chosen("boss"), you), attachCard(self, chosen("boss"))],
      [discard(self)],
    ),
    shuffleInSetAsideModularSet(),
  ),
  // "Victory 1." on an attachment is "Forced Interrupt: When the attached card is defeated, add this card to the victory
  // display" (RRG 1.8 "Victory X", p. 46). Written out as this card's own ability: Permanent stops effects from other
  // sets only (RRG 1.8 "Permanent", p. 32), and the keyword alone does not pass that test for a Permanent attachment,
  // which then left the game with its host and never scored (PR #47 review). Spider-Tracer's trigger (01007).
  "x.the-rose-bf.10.victory-forced-interrupt": forcedInterrupt(when.defeated("host"), addToVictoryDisplay(cards(self))),
  // "Attached minion's printed hit points are 14. It gains villainous, guard, and the Influenced and Elite traits." The
  // printed value set as Ultron's facedown Drones' stats (`setBase`). A keyword grant takes a keyword instance
  // (`{ name }`), not a bare string: a string granted a nameless keyword, so the minion had neither keyword and the
  // client crashed drawing it (0.1.1).
  "x.the-rose-bf.10.twisted-allegiance-constant": constant(
    gets("hp", 14, ATTACHED_MINION, { setBase: true }),
    gainsKeyword({ name: "villainous" }, ATTACHED_MINION),
    gainsKeyword({ name: "guard" }, ATTACHED_MINION),
    gainsTrait(INFLUENCED, ATTACHED_MINION),
    gainsTrait(ELITE, ATTACHED_MINION),
  ),

  // =========================================================================
  // 11 Anti-Hulk Cannon (attachment; Uses is data)
  // =========================================================================

  // "[star] Forced Interrupt: When the villain would attack you, either place 1 Fisk counter on a Fisk environment, or
  // this attack gains overkill. Then, remove 1 charge counter from here." The last charge counter's removal discards it
  // (Uses).
  "x.the-rose-bf.11.anti-hulk-cannon-forced-interrupt": forcedInterrupt(
    on.villainAttacks({ againstYou: true }),
    chooseOne(
      option("Place 1 Fisk counter on a Fisk environment", ...fiskCounterOnAnEnvironment()),
      option("This attack gains overkill", modifyAttack({ overkill: true })),
    ),
    removeCountersFrom(self, "charge", 1),
  ),
  // "[star] Boost: Reveal this card."
  "x.the-rose-bf.11.boost": boost(revealCard(self)),

  // =========================================================================
  // 12 Rose's Greenhouse (attachment)
  // =========================================================================

  // "Attach to the villain." is data. "Attached villain gains steady. If it already has steady or stalwart, it gets
  // +4[per_hero] hit points instead." "Already" leaves this card's own grant out (`keywordNotFromSelf`), so the steady
  // it gives never turns itself into the hit points.
  "x.the-rose-bf.12.roses-greenhouse-constant": constant(
    gainsKeyword({ name: "steady" }, query("villain", { hostOfSelf: true }), {
      while: not(exists(VILLAIN_ALREADY_STEADY_OR_STALWART)),
    }),
    gets("hp", perHero(4), query("villain", { hostOfSelf: true }), {
      while: exists(VILLAIN_ALREADY_STEADY_OR_STALWART),
    }),
  ),
  // "Hero Response: After you overdefeat a side scheme (remove more threat from it than it had), discard this card."
  "x.the-rose-bf.12.roses-greenhouse-response": heroResponse(
    on.schemeDefeated(query("sideScheme"), { byYou: true }),
    { while: overdefeated },
    discard(self),
  ),
  // "[star] Boost: Reveal this card."
  "x.the-rose-bf.12.boost": boost(revealCard(self)),

  // =========================================================================
  // 13 Silent Pruning (treachery; Incite 1 is data)
  // =========================================================================

  // "When Revealed: Give the villain a tough status card and 1 facedown boost card. Discard each upgrade attached to a
  // scheme. If no upgrade was discarded this way, place 1 Fisk counter on a Fisk environment."
  // "No upgrade was discarded this way" is read after the discard: the upgrades on schemes before it, against those
  // still there after (one whose leaving is prohibited stays and was not discarded; PR #47 review).
  "x.the-rose-bf.13.when-revealed": whenRevealed(
    giveTough(theVillain),
    giveBoostCard(theVillain, 1),
    setVar("upgradesOnSchemes", countOf(UPGRADE_ON_A_SCHEME)),
    discard(each(UPGRADE_ON_A_SCHEME)),
    ifThen(valueAtLeast(countOf(UPGRADE_ON_A_SCHEME), varOf("upgradesOnSchemes")), fiskCounterOnAnEnvironment()),
  ),
  // "[star] Boost: Place 1 Fisk counter on a Fisk environment."
  "x.the-rose-bf.13.boost": boost(...fiskCounterOnAnEnvironment()),

  // =========================================================================
  // 14 Nowhere to Hide (treachery)
  // =========================================================================

  // "When Revealed: The villain attacks you (even if you are in alter-ego form). Either remove a confuse status card from
  // the villain or place 1 Fisk counter on a Fisk environment." War Delivery (28024) for the attack.
  "x.the-rose-bf.14.when-revealed": whenRevealed(
    enemyAttack(theVillain, { against: you }),
    chooseOne(
      option("Remove a confuse status card from the villain", { when: hasStatus(theVillain, "confused") }, removeStatus(theVillain, "confused")),
      option("Place 1 Fisk counter on a Fisk environment", ...fiskCounterOnAnEnvironment()),
    ),
  ),
  // "[star] Boost: Place 1 Fisk counter on a Fisk environment."
  "x.the-rose-bf.14.boost": boost(...fiskCounterOnAnEnvironment()),
});
