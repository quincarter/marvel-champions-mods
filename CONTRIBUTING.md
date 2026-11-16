# Submitting a pack to the Mod Store

This repo is the Mod Store's list of approved packs: one `packs/<pack-id>.yaml` file per pack. You submit a pack, or
a new version of one, by opening a pull request that adds or changes that file. Merging the pull request approves
the pack and publishes it to the store.

**Making the pack itself** (cards, scripts, pictures, permission, tagging a release) is covered step by step in the
pack template's guide:
[marvel-champions-mod-template/SUBMITTING.md](https://github.com/quincarter/marvel-champions-mod-template/blob/main/SUBMITTING.md).
This page starts where that guide's step 9 does: your pack repo has a tagged release with the pack's zip on it.

## Before you open the pull request

- Your pack repo is public on GitHub, made from the template, and its CI is green at the tag.
- The tag is `v` plus `pack.json`'s `version`, and its GitHub release carries `<pack-id>-<version>.zip` (the template's
  CI attaches it; don't upload one by hand).
- `pack.json`'s `permission` says the creator **granted** permission for the store to distribute the pack, with the
  evidence, and its `languages` cover every language the pack ships. **A pack without permission evidence is never
  approved.** If you didn't make the pack, the evidence must come from the person who did.
- In your pack repo, `node .agents/skills/submit-pack/scripts/submit.mjs` prints `Ready` and writes
  `submission/<pack-id>.yaml`. That is the file you add here.

## The file

`packs/<pack-id>.yaml`, named after the pack's id:

```yaml
id: my-hero
repo: https://github.com/<you>/<your-pack-repo>
tag: v1.0.0
commit: 0123456789abcdef0123456789abcdef01234567
creator: Your Name
permission:
  by: Your Name
  evidence: https://example.com/where-permission-was-given
  date: 2026-11-11
tags: [hero, justice]
summary: One line for the store list.
```

| Field                 | Required | Rule                                                                                                   |
| --------------------- | -------- | ------------------------------------------------------------------------------------------------------ |
| `id`                  | yes      | `pack.json`'s `id`: lowercase letters, digits and single dashes. The file name is `<id>.yaml`.         |
| `repo`                | yes      | `https://github.com/<owner>/<repo>`: no `.git`, no trailing slash.                                     |
| `tag`                 | yes      | The release tag, `v<version>`.                                                                         |
| `commit`              | yes      | The full 40-character sha the tag points at (`git rev-parse v1.0.0^{commit}`).                         |
| `creator`             | yes      | The pack's creator, as the store shows it.                                                             |
| `permission.by`       | yes      | Who granted permission: the creator, or who granted it on their behalf.                                |
| `permission.evidence` | yes      | A link to where it was given, or where the message is kept. The same as `pack.json`'s.                 |
| `permission.date`     | yes      | `YYYY-MM-DD`.                                                                                          |
| `tags`                | no       | The pack's kind first (`hero`, `scenario`, `modular`, `campaign`, `art`), then anything that helps players find it. |
| `summary`             | no       | One line for the store list. Without it, the store uses the first line of `pack.json`'s `description`. |

Quote a value that contains `: ` or starts with a special character (`"I made it: all of it"`); the submit script
does this for you.

## Opening the pull request

One pack per pull request, and change nothing but its file. With the [GitHub CLI](https://cli.github.com/):

```bash
gh repo fork quincarter/marvel-champions-mods --clone
cd marvel-champions-mods
git switch -c add-my-hero
cp ../<your-pack-repo>/submission/my-hero.yaml packs/my-hero.yaml
git add packs/my-hero.yaml
git commit -m "Add my-hero v1.0.0"
git push -u origin add-my-hero
gh pr create --repo quincarter/marvel-champions-mods --web
```

Or on github.com: **Fork**, then in your fork **Add file ▸ Create new file** as `packs/my-hero.yaml`, commit to a new
branch, and **Compare & pull request**.

Fill in the pull request template: what the pack adds, who made it, who granted permission and where, the languages
it covers, and the checklist.

## What the check does

Every pull request runs the **Check submission** workflow. It runs `main`'s copy of this repo's scripts, never
your pull request's, and fails if your pull request changes anything but your one `packs/<id>.yaml`. For each added
or changed entry it:

1. checks the file: the name matches `id`, the fields above are present and well-formed;
2. checks that `tag` points at `commit` in your repo, and downloads `<id>-<version>.zip` from that tag's release;
3. checks out your repo at `commit` (never the tag, since a tag can move), refuses a pack with a `DRAFT` file or
   with other packs in `pack.json`'s `requires.packs` (not supported yet), runs `npm ci` with your lockfile, then
   `mc-pack validate --publish` (which also requires `pack.json`'s `permission` to record the creator's grant, and
   `permission.languages` to cover every language the pack ships), `mc-pack test` (headless smoke games with your
   precon or scenario) and `mc-pack build`;
4. compares the zip it built with your release's zip, byte for byte. They must match, so what players install is
   what you published.

The job that builds your pack runs its code, so it has no secrets, no token and no checkout of this repo.

**Reading the result.** On the pull request, click **Details** next to the check, then **Summary**. For a passing
entry it shows the version, the zip's size and sha256, the oldest game version that can load it ("Needs app"), the
packs it needs, the number of card pictures, the permission, and the engine features it uses. **All checks** is the
one result that has to be green.

If it fails, open the failing step's log. The template guide's
[Troubleshooting](https://github.com/quincarter/marvel-champions-mod-template/blob/main/SUBMITTING.md#troubleshooting)
table maps each message to its fix. A mistake in this file only (a field, a short sha) needs just a corrected file. A
problem in the pack needs a new version: fix it in your pack repo, bump `version`, tag and release again, and push
the new `tag` and `commit` to the same pull request branch.

## Review and publishing

A maintainer reads the permission evidence, reads the cards and their scripts, and plays the pack
([REVIEWING.md](REVIEWING.md) is their checklist). They may ask for changes in the pull request. Merging approves the
pack: the **Publish packs** workflow uploads the zip and its preview to the store and lists it in the store's catalog,
and it appears in the game's **Extras ▸ Mod Store**.

## Updating a pack

Bump `version` in your pack's `pack.json`, tag and release the new version, run the submit script again, and open a
pull request that changes `tag` and `commit` in your `packs/<id>.yaml` (and `permission` or `summary` if they
changed).

**Published versions are immutable.** The store keeps every published version so games saved with it still load, and
a publish that finds the same version with a different zip fails. Never reuse a version number.

## Withdrawing a pack

Open a pull request that deletes `packs/<id>.yaml`, and say why. It must come from the pack's creator, or from the
person whose permission it was published under. Once merged, the store stops offering the pack; players who
installed it keep their copy, marked withdrawn, so their saves still load. Adding the file back lists the pack again.

A withdrawal goes in a pull request of its own, one pack at a time: the check fails a submission that deletes two
entries, or deletes one next to a new or changed entry. Renaming an entry file counts as both (it withdraws the old id
and submits a new one).

## Packs that need other packs

Not supported yet. If your `pack.json` lists other packs in `requires.packs` (a campaign using another pack's
scenario, say), the check refuses it before building: the registry can't yet resolve another approved pack's content
for the build. Make the pack stand alone for now, or ask in the custom content discussion.

## Packs kept in this repo

Packs kept in this repo (`packs/<id>/` with a `path` entry) build with the SDK pinned by this repo's root
`package.json` and `package-lock.json`. They are curated by the maintainer, with their creators' permission (README,
"Packs kept in this repo"). **Don't open pull requests that add or change them**: submit your pack from your
own repo made from the template, as above.

The one exception is a pack's **editors**: the GitHub logins its entry lists under `editors:` (set by the maintainer).
An editor may open a pull request from a fork that changes files inside that pack's folder, `packs/<id>/`, and
nothing else:

- one pack per pull request, and only inside its folder: not the entry `packs/<id>.yaml` (its `path`, `adopt` and
  `editors` stay the maintainer's), not another pack, not `scripts/`, `.github/`, `package.json` or
  `package-lock.json`;
- `pack.json`'s `version` must go up (a plain `1.2.3`), since published versions are immutable;
- the pack must pass `mc-pack validate --publish` and `mc-pack test` with the SDK pinned here; the check rebuilds it.

The gate reads the editors list from `main`, never from the pull request, so a pull request can't add its author.
If you were added as an editor after you opened the pull request, push a new commit to it (or ask the maintainer to
close and reopen it) so the check runs again with the new list.

## What a pack can't do

A pack is data, never code. A card that needs a rule the game's engine doesn't have yet (a new keyword, timing or
effect) can't be approved until a game release adds it. Ask in the game's
[custom content discussion](https://github.com/quincarter/marvel-champions-digital-game/issues/488) first.

## Questions

Open an issue here (there are templates for a permission question and for a pack request), or ask in the
[custom content discussion](https://github.com/quincarter/marvel-champions-digital-game/issues/488).
