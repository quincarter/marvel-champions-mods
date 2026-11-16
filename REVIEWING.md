# Reviewing a pack submission

For maintainers and the reviewers they name (`.github/CODEOWNERS`). **Merging a pull request to `main` approves the
pack and publishes it to every player**: the Publish packs workflow runs on the merge, with no further gate. Approve
only when every box below is ticked. When in doubt, ask in the pull request and wait.

Copy this list into your review.

## 1. The pull request itself

- [ ] It touches only `packs/<id>.yaml` (one pack). The check's gate fails a submission from someone without write
      access that changes anything else (`scripts/`, `.github/`, `package.json`, `package-lock.json`, a pack folder or
      another entry), and the check always runs `main`'s scripts, never the pull request's. Close such a submission:
      only the maintainer changes them. Deletions and renames count toward the one pack: one withdrawal on its own
      passes, two withdrawals or a withdrawal next to a new or changed entry fail.
- [ ] It is not a `path:` entry or a change under `packs/<id>/`, unless the maintainer made it (packs kept here are
      maintainer-curated), or it is an editor's change to the folder of a pack whose entry on `main` lists them under
      `editors:`. The gate lets an editor change only that folder, with `pack.json`'s version raised; read the diff as
      you would the maintainer's own.
- [ ] The pull request template is filled in.

## 2. The check

- [ ] **All checks** from the **Check submission** workflow is green on the latest push (a pull request could add a
      workflow with a job of the same name; it can't change Check submission, which runs from `main`).
- [ ] On your own pull request that changes `scripts/` or `.github/`, **Script tests** is green too: Check submission
      keeps running `main`'s scripts until the change is merged.
- [ ] Open the **Check submission** run's **Summary** and note: version, zip size, "Needs app", "Needs packs", card
      pictures, and the engine features list. The items below use them.

## 3. Permission

The evidence is the reason a pack can be distributed at all. A pack without it is closed, not merged.

- [ ] `permission.evidence` opens, or is a message you can see, and it is the **creator** (or someone they named)
      saying the pack may be shared or included. A description that says "free to use" by the creator counts; a
      third party saying the creator would not mind does not.
- [ ] `permission.by` is that person, and `permission.date` matches the evidence.
- [ ] The scope covers distribution through the store (for example `inclusion`), and a translation's language is
      covered by the creator's grant too.
- [ ] The pack's own `pack.json` agrees: `permission.status` is `granted`, and `permission.languages` covers every
      language in `languages.available`. The check enforces this (`mc-pack validate --publish`), so a green check
      means `pack.json` says so; what you judge is whether the evidence backs it. To read what it records:

      ```bash
      gh release download <tag> --repo <owner>/<repo> --pattern pack.json --output - \
        | jq '{languages: .languages.available, permission}'
      ```
- [ ] `CREDITS.md` names the creator, the card template and art sources, and translators, and nothing in the pack is
      art the creator has no right to share.

## 4. The cards

Read them at `commit` (`https://github.com/<owner>/<repo>/tree/<commit>`).

- [ ] Each card's record matches its picture: name, cost, stats, traits, keywords, text.
- [ ] Each ability in `abilities/index.ts` does what the card's text says, and cites the base-game card it copies.
      Watch for a script that approximates a mechanic the engine lacks: that is a rejection, not a nit (the creator
      asks for the mechanic in the [custom content discussion](https://github.com/quincarter/marvel-champions-digital-game/issues/488)).
- [ ] No unscripted ability is hidden behind `--allow-unscripted` or a placeholder.
- [ ] Nothing offensive, nothing that is not Marvel Champions content, nothing that impersonates an official product.

## 5. Playing it

`mc-pack test` only proves a game runs without an engine error. Play it yourself:

- [ ] At least one full game with the pack's precon (a hero pack) or its scenario (a scenario pack), in a game build
      that can load it ("Needs app" or newer), using the zip from the release.
- [ ] The cards behave as their text says when played, and the pictures show on the right cards in each language.

## 6. Size, engine features, versions

- [ ] The size is reasonable for the content: the template's guidance is about 5 MB for a 40-card hero pack with
      WebP pictures about 900 px on the long side. Ask about a pack far above that.
- [ ] "Needs app" is a game version that has been released. If the pack needs an engine feature from an unreleased
      game version, wait for that release before merging.
- [ ] "Needs packs" lists only packs the store already has.
- [ ] The id is new, or this is an update of a pack this repo already publishes. An id the game repo publishes
      (`source: "game"`, or no `source`, in the store's `index.json`) is refused at publish time; settle it before
      merging.
- [ ] For an update: `tag` and `commit` changed, the version is higher than the published one, and that version was
      never published before (a published version with a different zip fails the publish).

## 7. Merge, then watch the publish

- [ ] Merge (squash or merge commit; the branch must be up to date with `main`).
- [ ] Watch the **Publish packs** run on `main`. It builds the changed packs without secrets, then its upload job (the
      `store` environment) uploads each version, makes a release here as the fallback download, and updates
      `index.json`. If it fails, read the log: a retry-safe failure (network, a conflicting `index.json` write) is
      fixed by re-running; a refusal (an id owned by the game repo, a version already published with another zip)
      needs a follow-up pull request.
- [ ] The pack shows in the store's catalog (`<PACKS_BASE_URL>/index.json`) and in **Extras ▸ Mod Store**.

## Withdrawals

A pull request that deletes `packs/<id>.yaml`:

- [ ] comes from the creator, or the reason is that the permission was withdrawn or found wanting (link it);
- [ ] deletes only that file.

Merging drops the pack from the catalog (only entries this repo published); players keep installed copies, marked
withdrawn. The published versions stay in the bucket, so saves still load.

## Packs kept in this repo

Not available yet: the check refuses `path:` entries until this repo has a root `package.json` and
`package-lock.json` pinning the published pack SDK. Once it does, only the maintainer adds or changes `packs/<id>/`
folders and their `path:` entries, apart from the editors an entry lists under `editors:` (CONTRIBUTING.md, "Packs
kept in this repo"), who may change that pack's folder only. The same checklist applies,
with the permission evidence recorded in the folder's `PERMISSION.md` and `pack.json`. Bump the pack's `version` for
every change; a folder with a `DRAFT` file is not built or published, so leave its entry out until it is ready.
