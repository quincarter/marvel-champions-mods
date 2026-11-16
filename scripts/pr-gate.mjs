#!/usr/bin/env node
/**
 * The trusted gate of the Check submission workflow (check.yml, `pull_request_target`). It runs the base branch's copy
 * of this script, never the pull request's, and reads the pull request only as data through the GitHub API:
 *
 *   - lists the pull request's changed files (the API, not a diff computed by a script the pull request could change);
 *   - refuses a submission from someone who is not a maintainer (write, maintain or admin on this repo) that touches
 *     anything but `packs/<id>.yaml`, more than one pack (deletions and renames count: one withdrawal on its own is
 *     allowed, more than one, or one next to a new or changed entry, is not), or a `path:` entry (packs kept here
 *     are maintainer-only);
 *   - except for a pack's editors: a `path:` entry on the base branch may list GitHub logins under `editors:`, and a
 *     pull request whose non-maintainer author (and whoever triggered the run, unless a maintainer) are all listed may
 *     change files inside that pack's folder `packs/<id>/`, and nothing else: not the entry itself (so not its `path`,
 *     `adopt` or `editors`), not another pack, not the scripts, workflows or SDK version. The list is read from the
 *     base branch, never the pull request, so a pull request can't make its author an editor. The folder's
 *     `pack.json` must raise `version` above the base branch's, since published versions are immutable;
 *   - lets Dependabot's SDK bump (.github/dependabot.yml) change the root package.json and package-lock.json, and
 *     nothing else, and checks it as a maintainer's bump;
 *   - lists the entries to check: every added or changed `packs/<id>.yaml`, the entry of every `packs/<id>/` folder a
 *     maintainer changed, and every `path:` entry when the root package.json / package-lock.json changed;
 *   - fails closed: an entry file or pack folder that changed but whose entry can't be read at the pull request's head
 *     fails the gate, so a pack change can never pass with nothing checked. The one exception is a maintainer's pack
 *     folder with a DRAFT file and no entry yet: a draft is never built or published, so there is nothing to check.
 *
 * It writes each entry's YAML to <out>/entries/<id>.yaml, the ids to check to <out>/ids.json, and the ids of `path:`
 * entries to <out>/kept-ids.txt, and sets the `ids` step output. Deleted entries are not checked (a deletion
 * withdraws the pack).
 *
 *   node scripts/pr-gate.mjs <out dir>
 *
 * Environment: GH_TOKEN, REPO (owner/name), PR (number), HEAD_SHA, BASE_SHA (the base branch's commit this workflow
 * runs from), AUTHOR (the pull request's author), SENDER (who triggered this run), CHANGED_FILES (the event's
 * changed_files count).
 */
import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { compareVersions } from "./update-index.mjs";

const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ENTRY_FILE = /^packs\/([^/]+)\.yaml$/;
const PACK_FOLDER = /^packs\/([^/]+)\/./;
const ROOT_MANIFEST = /^package(-lock)?\.json$/;
const KEPT_HERE = /^path:/m;
const LOGIN = /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/;
const PLAIN_VERSION = /^\d+\.\d+\.\d+$/;

/**
 * The GitHub logins a `path:` entry lists as its pack's editors, lowercased (logins are case-insensitive). Only a
 * top-level `editors:` key is read, as a flow list (`editors: [a, b]`) or a block list (`- a` lines under it); any
 * other shape, or a name that isn't a login, reads as no editors at all (fail closed).
 */
export function editorsOf(text) {
  const lines = String(text ?? "").split(/\r?\n/);
  const at = lines.findIndex((line) => /^editors:/.test(line));
  if (at < 0) return [];
  const strip = (s) =>
    s
      .replace(/\s+#.*$/, "")
      .trim()
      .replace(/^(["'])(.*)\1$/, "$2");
  const rest = strip(lines[at].slice("editors:".length));
  let names;
  if (rest !== "") {
    const flow = /^\[(.*)\]$/.exec(rest);
    if (!flow) return [];
    names = flow[1].trim() === "" ? [] : flow[1].split(",").map(strip);
  } else {
    names = [];
    for (const line of lines.slice(at + 1)) {
      if (/^\s*(#.*)?$/.test(line)) continue;
      const item = /^\s*-\s+(.*)$/.exec(line);
      if (!item) break;
      names.push(strip(item[1]));
    }
  }
  if (names.some((name) => !LOGIN.test(name))) return [];
  return names.map((name) => name.toLowerCase());
}

/** Repo permissions that make someone a maintainer. */
export const MAINTAINER_PERMISSIONS = new Set(["admin", "maintain", "write"]);
/** The account that opens the SDK bumps (.github/dependabot.yml). It is not a collaborator, so it has no permission. */
export const SDK_BOT = "dependabot[bot]";

/**
 * Decides what a pull request may change and which entries to check.
 *
 *   files: [{ filename, status, previous_filename? }] (the pull request's files, from the API)
 *   maintainer: whether the author and whoever triggered the run are maintainers
 *   sdkBump: whether this is Dependabot's SDK bump (its author is SDK_BOT, and whoever else triggered the run is a
 *     maintainer). It may change the root package.json and package-lock.json and nothing else; within that, it is
 *     checked as a maintainer's bump is: every `path:` entry, rebuilt with the new SDK.
 *   outsiders: the logins among the author and whoever triggered the run that are not maintainers (whoOpened())
 *   readEntry(path): resolves a file's text at the pull request's head, or null when it is not there
 *   readBase(path): resolves a file's text on the base branch (this workflow's own commit), or null
 *   listEntries(): resolves every packs/<id>.yaml path at the pull request's head
 *
 * Resolves `{ entries: [{ id, file, text, kept }], errors }`.
 */
export async function gate({
  files,
  maintainer,
  sdkBump = false,
  outsiders = [],
  readEntry,
  readBase = async () => null,
  listEntries,
}) {
  const errors = [];
  const paths = [...new Set(files.flatMap((f) => [f.filename, f.previous_filename].filter(Boolean)))];
  // Packs whose folder this pull request may change because every outsider is one of its editors (on the base branch).
  const edited = maintainer || sdkBump ? new Set() : await editedPacks(paths, outsiders, readBase);

  if (sdkBump) {
    const others = paths.filter((p) => !ROOT_MANIFEST.test(p));
    if (others.length > 0) {
      const list = others.join(", ");
      errors.push(`an SDK bump changes only package.json and package-lock.json; this one also changes ${list}`);
      return { entries: [], errors };
    }
    maintainer = true;
  }

  if (!maintainer) {
    for (const p of paths) {
      const folder = PACK_FOLDER.exec(p);
      if (folder && edited.has(folder[1])) continue;
      if (!ENTRY_FILE.test(p)) {
        errors.push(
          `${p}: a submission may only add, change or delete packs/<id>.yaml; everything else (scripts, workflows, ` +
            "pack folders kept here, the SDK version) is changed by the maintainer, or for a pack kept here, by " +
            "the editors its entry lists",
        );
      }
    }
    for (const id of edited) errors.push(...(await versionRaised(id, readEntry, readBase)));
  }

  // Entry files to check, each with why it is checked (an entry file changed, or a folder of a pack kept here).
  const candidates = new Map();
  for (const f of files) {
    if (f.status !== "removed" && ENTRY_FILE.test(f.filename)) candidates.set(f.filename, "changed");
  }
  for (const p of paths) {
    const folder = PACK_FOLDER.exec(p);
    if (folder && !candidates.has(`packs/${folder[1]}.yaml`)) candidates.set(`packs/${folder[1]}.yaml`, "folder");
  }
  if (paths.some((p) => ROOT_MANIFEST.test(p))) {
    for (const file of await listEntries()) {
      if (candidates.has(file)) continue;
      const text = await readEntry(file);
      if (text != null && KEPT_HERE.test(text)) candidates.set(file, "sdk");
    }
  }

  if (!maintainer) errors.push(...onePack(files, candidates));

  const entries = [];
  // Pack folders kept here as drafts (a DRAFT file at the head, no entry yet): nothing is built, so nothing to check.
  let drafts = 0;
  for (const [file, why] of candidates) {
    const id = ENTRY_FILE.exec(file)[1];
    if (!ID.test(id)) {
      errors.push(`${file}: the file name must be <id>.yaml, the id lowercase letters, digits and single dashes`);
      continue;
    }
    const text = await readEntry(file);
    if (text == null && why === "folder" && maintainer && (await readEntry(`packs/${id}/DRAFT`)) != null) {
      drafts++;
      continue;
    }
    if (text == null) {
      errors.push(
        why === "folder"
          ? `packs/${id}/ changed but ${file} is not in the pull request: a pack folder needs its entry to be checked`
          : `${file} changed but could not be read at the pull request's head: nothing would be checked`,
      );
      continue;
    }
    const kept = KEPT_HERE.test(text);
    // An editor's pull request leaves the entry alone (`why` is "folder"), so its text is the base branch's.
    const byEditor = why === "folder" && edited.has(id);
    if (kept && !maintainer && !byEditor) {
      errors.push(`${file}: path entries (packs kept in this repo) are added and changed by the maintainer`);
    }
    entries.push({ id, file, text, kept });
  }

  // Fail closed: a pack change never passes with an empty check (every candidate above is an entry or an error, so
  // this is the last line of defence, not the usual way a gate fails).
  if (candidates.size > drafts && entries.length === 0 && errors.length === 0) {
    errors.push("pack files changed but no entry was found to check");
  }
  return { entries, errors };
}

/**
 * The pack ids among `paths`' folders (packs/<id>/...) whose entry on the base branch is a `path:` entry listing every
 * outsider as an editor. With no outsiders (nobody to match) there are none.
 */
async function editedPacks(paths, outsiders, readBase) {
  const edited = new Set();
  if (outsiders.length === 0) return edited;
  const ids = new Set(paths.map((p) => PACK_FOLDER.exec(p)?.[1]).filter((id) => id && ID.test(id)));
  for (const id of ids) {
    const text = await readBase(`packs/${id}.yaml`);
    if (text == null || !KEPT_HERE.test(text)) continue;
    const editors = editorsOf(text);
    if (outsiders.every((user) => editors.includes(user.toLowerCase()))) edited.add(id);
  }
  return edited;
}

/** An editor's change must raise the pack's version: published versions are immutable. */
async function versionRaised(id, readEntry, readBase) {
  const file = `packs/${id}/pack.json`;
  const version = async (read, where) => {
    const text = await read(file);
    if (text == null) return { error: `${file} is missing on ${where}` };
    try {
      const value = JSON.parse(text).version;
      if (typeof value === "string" && PLAIN_VERSION.test(value)) return { value };
    } catch {
      // Reported below.
    }
    return { error: `${file} on ${where} needs a version of the form 1.2.3` };
  };
  const head = await version(readEntry, "the pull request's head");
  const base = await version(readBase, "the base branch");
  const problems = [head.error, base.error].filter(Boolean);
  if (problems.length > 0) return problems;
  if (compareVersions(head.value, base.value) <= 0) {
    return [`${file}: raise version above ${base.value} (it is ${head.value}): published versions are immutable`];
  }
  return [];
}

/**
 * A submission's one-pack rule, counting every pack id it touches: entries added, changed, deleted (a deletion
 * withdraws the pack on merge) or renamed (which withdraws the old id and submits the new one), and the entries it
 * would check. One pack added or changed passes, and so does one withdrawal on its own; two packs, two withdrawals, or
 * a withdrawal next to a new or changed entry do not.
 */
function onePack(files, candidates) {
  const withdrawn = new Set();
  const submitted = new Set();
  const idOf = (file) => ENTRY_FILE.exec(file)?.[1];
  for (const f of files) {
    const id = idOf(f.filename);
    if (id && f.status === "removed") withdrawn.add(id);
    else if (id) submitted.add(id);
    const previous = f.previous_filename && idOf(f.previous_filename);
    if (previous && previous !== id) withdrawn.add(previous);
  }
  for (const file of candidates.keys()) submitted.add(idOf(file));
  const list = (ids) => [...ids].sort().join(", ");
  if (withdrawn.size > 0 && submitted.size > 0) {
    return [
      `a submission adds, changes or withdraws one pack; this one withdraws ${list(withdrawn)} and adds or changes ` +
        `${list(submitted)}: open a pull request for each`,
    ];
  }
  if (withdrawn.size > 1) {
    return [`a submission withdraws one pack at a time; this one withdraws ${list(withdrawn)}`];
  }
  if (submitted.size > 1) return [`a submission adds or changes one pack; this one changes ${list(submitted)}`];
  return [];
}

/**
 * Who the pull request is from, for gate(): `{ maintainer, sdkBump }`. `permission(user)` resolves a user's permission
 * on this repo. A maintainer pull request is one whose author and whoever triggered the run are both maintainers.
 * Dependabot's SDK bump is one whose author is SDK_BOT: Dependabot itself is not looked up (it has no permission), but
 * anyone else who triggered the run must be a maintainer, or the pull request is held to a submission's rules.
 * `outsiders` lists the users who are not maintainers (a pack's editors must include them all); Dependabot as the
 * sender of someone else's pull request is one, and no editors list can name it (it isn't a plain login).
 */
export async function whoOpened({ author, sender, permission }) {
  const bot = author === SDK_BOT;
  const outsiders = [];
  for (const user of new Set([author, sender])) {
    if (bot && user === SDK_BOT) continue;
    if (!MAINTAINER_PERMISSIONS.has(await permission(user))) outsiders.push(user);
  }
  const maintainer = outsiders.length === 0;
  return { maintainer, sdkBump: bot && maintainer, outsiders };
}

const run = (file, args) =>
  new Promise((resolve) => {
    execFile(file, args, { maxBuffer: 64 * 1024 * 1024 }, (error, stdout, stderr) =>
      resolve({ code: error ? (typeof error.code === "number" ? error.code : 1) : 0, stdout, stderr }),
    );
  });

/**
 * The pull request over the GitHub API (gh): files read at its head (`headSha`) or on the base branch (`baseSha`).
 * `exec(file, args)` resolves `{ code, stdout, stderr }`.
 */
export function githubPullRequest({ repo, pr, headSha, baseSha, exec = run }) {
  const api = async (args) => {
    const result = await exec("gh", ["api", ...args]);
    if (result.code !== 0) {
      throw Object.assign(new Error(`gh api ${args.at(-1)} failed: ${result.stderr.trim()}`), result);
    }
    return result.stdout;
  };
  const notFound = (error) => /HTTP 404|Not Found/i.test(String(error.stderr));
  const readAt = async (file, ref) => {
    try {
      const raw = "Accept: application/vnd.github.raw+json";
      return await api(["-H", raw, `repos/${repo}/contents/${file}?ref=${ref}`]);
    } catch (error) {
      if (notFound(error)) return null;
      throw error;
    }
  };
  return {
    async files() {
      const out = await api([
        "--paginate",
        "--jq",
        ".[] | {filename, status, previous_filename}",
        `repos/${repo}/pulls/${pr}/files?per_page=100`,
      ]);
      return out
        .split("\n")
        .filter((line) => line.trim())
        .map((line) => JSON.parse(line));
    },
    async permission(user) {
      try {
        return (await api(["--jq", ".permission", `repos/${repo}/collaborators/${user}/permission`])).trim();
      } catch (error) {
        if (notFound(error)) return "none";
        throw error;
      }
    },
    readEntry: (file) => readAt(file, headSha),
    readBase: (file) => (baseSha ? readAt(file, baseSha) : Promise.reject(new Error("no base sha to read from"))),
    async listEntries() {
      try {
        const out = await api([
          "--jq",
          '.[] | select(.type == "file") | .path',
          `repos/${repo}/contents/packs?ref=${headSha}`,
        ]);
        return out.split("\n").filter((p) => ENTRY_FILE.test(p));
      } catch (error) {
        if (notFound(error)) return [];
        throw error;
      }
    },
  };
}

async function main() {
  const [out] = process.argv.slice(2);
  if (!out) throw new Error("usage: node scripts/pr-gate.mjs <out dir>");
  for (const name of ["REPO", "PR", "HEAD_SHA", "BASE_SHA", "AUTHOR", "SENDER", "CHANGED_FILES"]) {
    if (!process.env[name]) throw new Error(`${name} is not set`);
  }
  const { REPO, PR, HEAD_SHA, BASE_SHA, AUTHOR, SENDER, CHANGED_FILES } = process.env;
  const pull = githubPullRequest({ repo: REPO, pr: PR, headSha: HEAD_SHA, baseSha: BASE_SHA });

  const files = await pull.files();
  // The files API stops at 3000 files: a list shorter than the event's count would check only part of the change.
  if (files.length !== Number(CHANGED_FILES)) {
    throw new Error(`the API listed ${files.length} changed files, the pull request has ${CHANGED_FILES}`);
  }
  const { maintainer, sdkBump, outsiders } = await whoOpened({
    author: AUTHOR,
    sender: SENDER,
    permission: async (user) => {
      const permission = await pull.permission(user);
      console.log(`${user}: ${permission} on ${REPO}`);
      return permission;
    },
  });
  console.log(
    sdkBump
      ? "Dependabot's SDK bump: only package.json and package-lock.json may change."
      : maintainer
        ? "Maintainer pull request."
        : "Submission: only packs/<id>.yaml may change, or the folder of a kept pack whose editors list them.",
  );

  const { readEntry, readBase, listEntries } = pull;
  const { entries, errors } = await gate({ files, maintainer, sdkBump, outsiders, readEntry, readBase, listEntries });
  if (errors.length > 0) throw new Error(errors.join("\n"));

  fs.mkdirSync(path.join(out, "entries"), { recursive: true });
  for (const entry of entries) fs.writeFileSync(path.join(out, "entries", `${entry.id}.yaml`), entry.text);
  const ids = JSON.stringify(entries.map((e) => e.id));
  fs.writeFileSync(path.join(out, "ids.json"), `${ids}\n`);
  const kept = entries.filter((e) => e.kept).map((e) => `${e.id}\n`);
  fs.writeFileSync(path.join(out, "kept-ids.txt"), kept.join(""));
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `ids=${ids}\n`);
  console.log(entries.length > 0 ? `Entries to check: ${entries.map((e) => e.file).join(", ")}` : "No entry to check.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    for (const line of error.message.split("\n")) console.error(`::error::${line}`);
    process.exit(1);
  });
}
