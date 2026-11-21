# The Rose (`the-rose-bf`)

A fan-made villain scenario by BigDarsh and Bluefire (Hitch templates): The Rose I-III, main scheme Public Enemy Number
One (1A-3B), the two Fisk environments (Collateral Chaos, Lawless Justice), Hero Resistance (the environment that
removes their Fisk counters), Twisted Allegiance, Anti-Hulk Cannon, Rose's Greenhouse, Silent Pruning x2 and Nowhere to
Hide x2. Store shelf: Fear No Evil
(`wave: cycle11`). See `CREDITS.md` and `PERMISSION.md`.

**Modular sets** (the authors' choice for the store, 2026-11-20), by the rules sheet's roles: a minion set, **Sinister
Syndicate** (5 minions); a side scheme set, **State of Emergency** (4 side schemes); a third set, **Streets of Mayhem**
(Setting environments, which 1B finds). Mini-boss, set aside: **Running Interference** (Tombstone, 9 hit points): the scenario sets one modular set aside at setup
(`setAsideModularSetCount: 1`), for Twisted Allegiance to take its minion from, and names Running Interference as the
default (`recommendedSetAsideModularSetIds`, game 0.53.0). The setup screen's "Set-aside modular set" stepper picks
another; pick a mini-boss set (one with a minion), since the game does not limit that pick to such sets, and with a set
that has no minion Twisted Allegiance is discarded when revealed and the set is shuffled in. Its paper default is Fear No Evil's
(Tracksuit Mafia, Cops, Disasters; Tombstone or The Owl), which packs cannot recommend until wave 11 opens to them.

Needs the game at 0.53.0 or later (`requires.app`): overdefeated side schemes, the keyword check that leaves Rose's
Greenhouse's own grant out, a pack scenario's set-aside modular set (0.51.0) and its recommended default (0.53.0).

## How it was made

`mc-pack import-marvelcdb the_rose_bf --out packs/the-rose-bf --id the-rose-bf` from the curated source
(https://github.com/bluefireF5ran/mc-digital-custom-packs, commit `c131319`), with two changes for the import:

- **Twisted Allegiance is its own card (10).** In print it is the back of Hero Resistance (an environment that flips
  to an attachment); the importer takes no double-sided card whose faces have different types. Stage 3A removes Hero
  Resistance from the game and reveals the set-aside Twisted Allegiance (`setAsideCardIds`), which plays the same. It has
  no `attachesTo`: it attaches itself from its When Revealed (RRG 1.8 "Reveal", step 2; Old Grudge, `sm` 27172).
- **Stage abilities and pictures follow the pack format:** villain stages II and III are abilities of card 01
  (`-ii`, `-iii`), main scheme stages 2A-3B of 04a/04b; pictures `01`, `01b`, `01c` and `04a`-`04f` (§5.1).

Then by hand: `abilities/index.ts` (each ability commented with the base card it copies), `scenarios/the-rose-bf.json`,
the cover and `pack.json`'s store fields.
