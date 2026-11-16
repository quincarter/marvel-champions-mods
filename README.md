# Mod store registry

This repo lists the community content packs approved for the mod store in the
[Marvel Champions digital game](https://github.com/quincarter/marvel-champions-digital-game). The game's **Extras ▸ Mod
Store** screen reads a catalog built from this repo, and only packs listed here appear in it.

This is a fan-made, non-commercial project. Marvel Champions, its card text, artwork and characters are the
intellectual property of Fantasy Flight Games and Marvel.

## How a pack gets into the store

**Submitting a pack: read [CONTRIBUTING.md](CONTRIBUTING.md).** Making one: the pack template's step-by-step guide,
[SUBMITTING.md](https://github.com/quincarter/marvel-champions-mod-template/blob/main/SUBMITTING.md). Reviewing one:
[REVIEWING.md](REVIEWING.md). AI assistants: [AGENTS.md](AGENTS.md).

In short:

1. **Make the pack** in your own repo, made from the
   [pack template](https://github.com/quincarter/marvel-champions-mod-template) ("Use this template"). Its CI
   validates the pack and plays headless smoke games with it; on a `v<version>` tag it attaches the pack's zip to a
   release.
2. **Record permission** in the pack's `pack.json`: the creator granted the store permission to distribute it, with
   the evidence. If you didn't make the pack, you need its creator's permission; a post or message where they grant
   it is enough. Packs without permission evidence are never approved.
3. **Open a pull request** here that adds `packs/<pack-id>.yaml`:

   ```yaml
   id: fan-example-hero # the pack's id from its pack.json
   repo: https://github.com/<you>/<pack-repo>
   tag: v1.0.0
   commit: <the full commit sha that tag points at>
   creator: <the pack's creator>
   permission:
     by: <who granted permission: the creator, or who granted it for them>
     evidence: <a link to where permission was given>
     date: YYYY-MM-DD
   tags: [hero]
   summary: One line for the store list. # optional; defaults to the first line of the pack's description
   ```

4. **CI checks it.** It builds the pack from `commit`, validates it with `mc-pack validate --publish` (which also
   requires `pack.json` to record the creator's grant), plays the smoke games, requires the release's zip to match
   its build byte for byte, and writes the pack's size, the engine features it uses and the oldest game version that
   can load it on the run's Summary page.
5. **Review.** The maintainer checks the permission evidence, reads the cards and plays the pack. Merging the pull
   request approves it, and the publish workflow uploads it to the store.

To **update** a pack, open a pull request that changes `tag` and `commit`. Published versions are immutable, and
older ones stay available, so games saved with them still load.

To **withdraw** a pack, open a pull request that deletes its file. Players who already installed it keep their copy,
but the store stops offering it.

**Not supported yet: packs that need other packs.** A pack whose `pack.json` lists other packs in `requires.packs`
(for example a campaign that uses another pack's scenario) can't be submitted yet: the registry's build has no way to
resolve another approved pack's content, so the check refuses such a pack before building it. Make the pack stand
alone for now, or ask in the custom content discussion.

## Packs kept in this repo

Some packs are curated here rather than in a creator's own repo: community packs the maintainer brought in with
their authors' permission. Their source is a folder in this repo, `packs/<pack-id>/` (the same layout as the pack
template: `pack.json`, `cards/`, `abilities/index.ts`, `decks/`, the pictures, `CREDITS.md`, `PERMISSION.md`), and
their entry gives `path` instead of `repo`, `tag` and `commit`:

```yaml
id: carnage-nep
path: packs/carnage-nep
creator: Neptune
permission:
  by: Neptune
  evidence: <a link, or where the message is kept>
  date: 2026-11-05
tags: [hero]
```

They build with this repo's own SDK version (the root `package.json` and `package-lock.json`), so bumping the SDK
there rebuilds and re-checks every pack kept here. The game's release workflow opens that bump as a pull request
(its Registry SDK bump workflow, on the branch `feature/mod-sdk-bump`) as soon as a release has published a new SDK
to npm, and moves that same pull request to a newer version published before it is merged. Merge it on its own and
let its publish finish before merging the next change. A change to a pack's folder is checked and, once merged,
published like any other entry: bump the pack's `version` in its `pack.json`, since published versions are
immutable. A folder with a `DRAFT` file in it is not built or published; leave its entry out until it is ready.

**Editors.** A `path` entry may list GitHub logins under `editors:` (`editors: [someone]`): people who curate that
pack without write access to this repo. The check's gate (`scripts/pr-gate.mjs`) lets an editor's fork pull request
change files inside `packs/<id>/` and nothing else, and requires `pack.json`'s `version` to go up. It reads the list
from `main`, so only the maintainer adds or removes an editor, by changing the entry. Prefer this to making someone a
collaborator: write access would let them change the scripts and workflows in a pull request the gate treats as a
maintainer's, and push branches whose workflows run in this repo.

**Packs the game repo used to publish.** The community packs that started in the game repo (its
`content-packs/community/` and publish-packs workflow) move here as packs kept in this repo, with the same ids and
versions. Their entries add `adopt: game`, which takes the id over from the game repo: the publish lets the id
through, keeps every version the game repo published exactly as it is (it builds and checks a version already listed,
but doesn't upload it again, so a rebuild with other bytes can't break it), and makes the entry `source: "registry"`.
Saves and decks that used those versions keep loading. Only a `path` entry may adopt, so only the maintainer can.
Remove the pack from the game repo in the same release, since the game repo's publish then refuses the id.

## What a pack can and can't do

Packs are data: card records, abilities written with the game's ability DSL, scenarios, decks and images. A pack
never ships code. A card that needs a rule the game's engine doesn't have yet can't be approved until a game release
adds it. Ask in the game's
[custom content discussion](https://github.com/quincarter/marvel-champions-digital-game/issues/488) first.

The full design is in
[docs/custom-content-packs.md](https://github.com/quincarter/marvel-champions-digital-game/blob/feature/custom-content-packs/docs/custom-content-packs.md)
§11 in the game's repo.

## Maintainer setup

- `check.yml` runs on every pull request, as `pull_request_target`: the workflow and every script it runs come from
  `main`, never from the pull request, so a pull request that changes `scripts/` or `.github/` can't change what checks
  it. Its `gate` job reads the pull request through the GitHub API (the changed files, each entry's YAML, the
  creator's release zip, with a read-only token) and fails a submission from anyone without write access that touches
  anything but one `packs/<id>.yaml`. It fails closed: a changed entry or pack folder that yields nothing to check
  fails the gate. Each entry is then rebuilt from `commit` in a job with `permissions: {}`, no checkout and no token
  (the pack's code runs there), from `main`'s scripts handed on by the gate. A repo entry's tagged release must carry
  the zip `mc-pack build` wrote, byte for byte. Its last job, **All checks**, is the one the branch ruleset requires;
  it fails unless the gate passed and every entry it listed was checked.
- `script-tests.yml` runs a pull request's own copy of the scripts' tests and `check-workflow-secrets.mjs`, with no
  token. It is not required (a pull request controls it), so read it on a maintainer pull request that changes
  `scripts/` or `.github/`: those changes only take effect in `check.yml` once merged.
- `publish.yml` runs on a merge to `main`. A job without secrets builds the changed packs. A second job, in the
  `store` environment, uploads each version to R2 under `<id>/<version>/` (the zip, `pack.json`, and the
  `preview.json`, `thumb.webp` and card pictures the store shows before an install), makes a release here as the
  fallback download, and regenerates `index.json`. Published versions are immutable: a version already in the bucket
  with any file different (the zip, `pack.json`, the preview or a picture) fails the run, while one with the same
  files is skipped, so a failed run can simply be re-run. Every upload is conditional, so it never overwrites a file
  another publisher wrote first. A
  push that only deletes entries still updates `index.json`.
- A pack id is published either here or by the game repo's own publish, never both. Entries this repo publishes carry
  `source: "registry"` in `index.json`; an id already listed by the game repo is refused before anything is uploaded,
  and deleting a `packs/<id>.yaml` only withdraws this repo's own entries.
- Before the first publish, set these on this repo:
  - Actions secrets: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY`;
  - Actions variable `PACKS_BASE_URL`, for example `https://packs.<domain>`;
  - optionally, the variable `R2_BUCKET`, which defaults to `mc-packs`.

## Repository settings

Merging to `main` approves a pack and publishes it, so `main` takes changes only through a reviewed pull request.
These are repository settings, not files, and have to be set by the owner:

- **Branch ruleset on `main`** (Settings > Rules > Rulesets), active, with no bypass list:
  - require a pull request before merging, with review from Code Owners ([`.github/CODEOWNERS`](.github/CODEOWNERS))
    and stale approvals dismissed on a new push;
  - require the status check **All checks** (`check.yml`), with the branch up to date. A pull request can add a
    workflow with a job of the same name, so the required Code Owners review is what stops a submission that touches
    `.github/`; the gate fails such a submission, and reviewers check that **All checks** comes from the
    **Check submission** workflow;
  - block force pushes and deletion.
- **`store` environment** (Settings > Environments), which holds the R2 secrets: deployment branches limited to
  `main`, so no other branch's workflow can reach them. Keep the R2 secrets in that environment only, never as
  repository secrets: `check.yml` runs on `pull_request_target`, where repository secrets would be within reach.
- **Fork pull requests** (Settings > Actions > General): this repo is private, so allow workflows to run from fork
  pull requests (without sending write tokens or secrets to them), or submissions from forks get no check. Require
  approval for outside contributors' runs.
