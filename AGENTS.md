# Agent instructions: the Mod Store registry

For any AI coding assistant (Claude Code, Codex, Gemini CLI, Copilot, Cursor, ...) working in this repo. `CLAUDE.md`
points here.

## What this repo is

The list of community content packs approved for the Mod Store in the
[Marvel Champions digital game](https://github.com/quincarter/marvel-champions-digital-game): one `packs/<id>.yaml`
per pack, plus the workflows that check a submission (`.github/workflows/check.yml`) and publish merged packs to the
store (`.github/workflows/publish.yml`). **Merging a pull request to `main` publishes the pack to every player.**

- [README.md](README.md): how it works, packs kept in this repo, maintainer setup and repository settings.
- [CONTRIBUTING.md](CONTRIBUTING.md): for submitters; the entry file's fields, the check, updates, withdrawals.
- [REVIEWING.md](REVIEWING.md): the maintainer's checklist before a merge.
- Making a pack happens in the creator's own repo, made from the
  [pack template](https://github.com/quincarter/marvel-champions-mod-template); its `SUBMITTING.md` and its
  `submit-pack` skill cover the steps up to a pull request here.

This is a fan-made, non-commercial project. Marvel Champions, its card text, artwork and characters are the
intellectual property of Fantasy Flight Games and Marvel.

## What you may do

- **Prepare an entry for a creator**: write `packs/<id>.yaml` from the creator's `pack.json` and git (the tag, and
  `git rev-parse <tag>^{commit}` for the full sha), or copy the `submission/<id>.yaml` their template's submit script
  wrote. The fields and rules are in CONTRIBUTING.md.
- **Check an entry locally** before it is pushed, where the tools exist (bash, `yq` v4, `jq`, `git`, Node 24, `npm`,
  GNU `stat` and `sha256sum`; on Windows, WSL or Git Bash with those installed):

  ```bash
  bash scripts/fetch-release.sh packs/<id>.yaml /tmp/check-<id>    # needs gh signed in; downloads the release zip
  bash scripts/build-entry.sh packs/<id>.yaml /tmp/check-<id>      # rebuilds, validates, tests, compares the zip
  cat /tmp/check-<id>/summary.md
  ```

  `build-entry.sh` installs and **runs the pack's code** (`npm ci`, `mc-pack`): run it only on a pack you were asked
  to check, and never in a shell that holds secrets (cloud credentials, tokens in the environment). It never needs a
  GitHub token; keep `GH_TOKEN` out of its environment.
- **Run this repo's own tests**: `node --test "scripts/*.test.mjs"` and `node scripts/check-workflow-secrets.mjs`
  (the Script tests workflow runs both). The Check submission workflow runs `main`'s copies of the scripts, never a
  pull request's, so a script change is only checked there once merged.
- **Read a pull request's check** for a creator: `gh pr checks <number> --repo quincarter/marvel-champions-mods`, and
  `gh run view <run id> --repo quincarter/marvel-champions-mods --log-failed` for a failure. The template's
  [Troubleshooting](https://github.com/quincarter/marvel-champions-mod-template/blob/main/SUBMITTING.md#troubleshooting)
  table maps each message to its fix.
- **Draft a review** for a maintainer from REVIEWING.md: what you checked, with links, and what only a human can
  judge (the evidence's author, the art's rights, play). The maintainer decides.

## What you must not do

- **Never invent permission.** `permission.by`, `evidence` and `date` come from the creator or from evidence you were
  shown. If they are missing, ask; if nobody can show them, the pack is not submitted.
- **Never approve, merge, or enable auto-merge** on a pull request, and never post an approving review. Merging is the
  maintainer's decision, and it publishes.
- **Never run or trigger the publish**: no `workflow_dispatch` of `publish.yml`, no upload to R2, no edit of the
  store's `index.json`, no use of the `store` environment's secrets.
- **Never edit another pack's entry or folder**, and never change `scripts/`, `.github/`, `package.json` or
  `package-lock.json` in a submission pull request. Changes to the workflows and scripts are maintainer work in their
  own pull requests, and must keep `node scripts/check-workflow-secrets.mjs` passing (no job that runs pack code may
  hold a secret or a write token).
- **Never add or change a pack kept in this repo** (`path:` entries, `packs/<id>/`) unless the maintainer asked you to,
  or you are working for one of that pack's editors (its entry's `editors:` on `main`), and then only inside its
  `packs/<id>/` folder, with `pack.json`'s `version` raised.
- **Never move a creator's tag or replace a release zip**, and never point `commit` at anything but the tag's commit.
- **Ask before anything that leaves the machine**: forking, pushing a branch, opening or commenting on a pull request
  or issue. Show the human the exact file and text first, and write as them, with no assistant attribution lines.

## Facts to keep straight

- One pack per pull request; a submission changes only its `packs/<id>.yaml`.
- The check builds from `commit`, never the tag, and requires the release zip to match the rebuilt one byte for byte.
- Published versions are immutable. An update is a new version with a new `tag` and `commit`.
- Deleting `packs/<id>.yaml` withdraws the pack: it leaves the store, installed copies keep working.
- A pack id has one publisher: this repo (`source: "registry"`) or the game repo (`source: "game"`). An id the game
  repo publishes is refused here, unless the maintainer's `path` entry adopts it (`adopt: game`, README).
- The check runs `mc-pack validate --publish`: `pack.json`'s permission must record the creator's grant. A pack
  with a `DRAFT` file, or with other packs in `requires.packs` (not supported yet), is refused before it builds.
- A card that needs a rule the engine lacks can't be approved until a game release adds it
  ([custom content discussion](https://github.com/quincarter/marvel-champions-digital-game/issues/488)).
