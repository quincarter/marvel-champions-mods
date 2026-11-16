// node --test "scripts/*.test.mjs" (the script tests). The check workflow's trusted gate: what a pull request may change
// and which entries it checks, with the pull request's files and head faked.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { editorsOf, gate, githubPullRequest, SDK_BOT, whoOpened } from "./pr-gate.mjs";

const repoEntry = (id) => `id: ${id}\nrepo: https://github.com/someone/${id}\ntag: v1.0.0\n`;
const keptEntry = (id) => `id: ${id}\npath: packs/${id}\n`;

/** The pull request's head: `{ path: text }`. */
const head = (tree) => ({
  readEntry: async (file) => tree[file] ?? null,
  listEntries: async () => Object.keys(tree).filter((p) => /^packs\/[^/]+\.yaml$/.test(p)),
});
const changed = (...names) => names.map((filename) => ({ filename, status: "modified" }));

describe("gate: a submission (not a maintainer)", () => {
  it("checks the one entry it adds", async () => {
    const { entries, errors } = await gate({
      files: [{ filename: "packs/fan-a.yaml", status: "added" }],
      maintainer: false,
      ...head({ "packs/fan-a.yaml": repoEntry("fan-a") }),
    });
    assert.deepEqual(errors, []);
    assert.deepEqual(
      entries.map((e) => e.id),
      ["fan-a"],
    );
  });

  // The review's P1s: a submission that also changes the scripts the check would run is refused, whatever they say.
  for (const script of ["scripts/fetch-release.sh", "scripts/changed-entries.sh", ".github/workflows/check.yml"]) {
    it(`refuses a change to ${script} next to its entry`, async () => {
      const { errors } = await gate({
        files: changed("packs/fan-a.yaml", script),
        maintainer: false,
        ...head({ "packs/fan-a.yaml": repoEntry("fan-a") }),
      });
      assert.equal(errors.length, 1);
      assert.match(errors[0], new RegExp(`^${script.replaceAll(".", "\\.")}: a submission may only`));
    });
  }

  it("refuses a change under a pack folder, a path entry and the SDK version", async () => {
    const { errors } = await gate({
      files: changed("packs/fan-a/abilities/index.ts", "package-lock.json"),
      maintainer: false,
      ...head({ "packs/fan-a.yaml": keptEntry("fan-a") }),
    });
    assert.deepEqual(errors.length, 3);
    assert.match(errors[0], /^packs\/fan-a\/abilities\/index\.ts: a submission may only/);
    assert.match(errors[1], /^package-lock\.json: a submission may only/);
    assert.match(errors[2], /path entries .* are added and changed by the maintainer/);
  });

  it("refuses two entries in one pull request", async () => {
    const { errors } = await gate({
      files: changed("packs/fan-a.yaml", "packs/fan-b.yaml"),
      maintainer: false,
      ...head({ "packs/fan-a.yaml": repoEntry("fan-a"), "packs/fan-b.yaml": repoEntry("fan-b") }),
    });
    assert.match(errors.join("\n"), /one pack/);
  });

  it("refuses a file name that is not a well-formed id", async () => {
    const { errors } = await gate({
      files: changed("packs/Fan_A.yaml"),
      maintainer: false,
      ...head({ "packs/Fan_A.yaml": repoEntry("Fan_A") }),
    });
    assert.match(errors.join("\n"), /lowercase letters, digits and single dashes/);
  });

  it("checks nothing, and passes, for a withdrawal (a deleted entry)", async () => {
    const { entries, errors } = await gate({
      files: [{ filename: "packs/fan-a.yaml", status: "removed" }],
      maintainer: false,
      ...head({}),
    });
    assert.deepEqual([entries, errors], [[], []]);
  });

  // The one-pack rule counts withdrawals too (deleting an entry withdraws the pack on merge).
  it("refuses two withdrawals in one pull request", async () => {
    const { errors } = await gate({
      files: [
        { filename: "packs/fan-a.yaml", status: "removed" },
        { filename: "packs/fan-b.yaml", status: "removed" },
      ],
      maintainer: false,
      ...head({}),
    });
    assert.deepEqual(errors, ["a submission withdraws one pack at a time; this one withdraws fan-a, fan-b"]);
  });

  it("refuses a withdrawal next to a new entry", async () => {
    const { errors } = await gate({
      files: [
        { filename: "packs/fan-a.yaml", status: "removed" },
        { filename: "packs/fan-b.yaml", status: "added" },
      ],
      maintainer: false,
      ...head({ "packs/fan-b.yaml": repoEntry("fan-b") }),
    });
    assert.equal(errors.length, 1);
    assert.match(errors[0], /one pack; this one withdraws fan-a and adds or changes fan-b/);
  });

  it("refuses a withdrawal next to a changed entry", async () => {
    const { errors } = await gate({
      files: [{ filename: "packs/fan-a.yaml", status: "removed" }, ...changed("packs/fan-b.yaml")],
      maintainer: false,
      ...head({ "packs/fan-b.yaml": repoEntry("fan-b") }),
    });
    assert.match(errors.join("\n"), /withdraws fan-a and adds or changes fan-b/);
  });

  it("refuses a rename, which withdraws the old id and submits the new one", async () => {
    const { errors } = await gate({
      files: [{ filename: "packs/fan-b.yaml", previous_filename: "packs/fan-a.yaml", status: "renamed" }],
      maintainer: false,
      ...head({ "packs/fan-b.yaml": repoEntry("fan-b") }),
    });
    assert.match(errors.join("\n"), /withdraws fan-a and adds or changes fan-b/);
  });

  it("refuses two withdrawals hidden in renames and deletions", async () => {
    const { errors } = await gate({
      files: [
        { filename: "packs/fan-c.yaml", previous_filename: "packs/fan-a.yaml", status: "renamed" },
        { filename: "packs/fan-b.yaml", status: "removed" },
      ],
      maintainer: false,
      ...head({ "packs/fan-c.yaml": repoEntry("fan-c") }),
    });
    assert.match(errors.join("\n"), /withdraws fan-a, fan-b and adds or changes fan-c/);
  });
});

describe("editorsOf", () => {
  it("reads a flow list and a block list, lowercased", () => {
    assert.deepEqual(editorsOf("id: a\npath: packs/a\neditors: [BlueFire, 'other-one'] # curators\n"), [
      "bluefire",
      "other-one",
    ]);
    assert.deepEqual(editorsOf('id: a\neditors:\n  - "Fan"\n\n  - helper\ntags: [hero]\n'), ["fan", "helper"]);
  });

  it("reads nothing from no list, an empty one, a nested key or a malformed name", () => {
    for (const text of [
      "id: a\n",
      "editors: []\n",
      "permission:\n  editors: [fan]\n",
      "editors: fan\n",
      "editors: [fan, dependabot[bot]]\n",
      "editors: [fan, -bad]\n",
    ]) {
      assert.deepEqual(editorsOf(text), [], text);
    }
  });
});

describe("gate: a kept pack's editors (not maintainers)", () => {
  const entry = (id, editors) => `${keptEntry(id)}editors: [${editors.join(", ")}]\n`;
  const manifest = (version) => JSON.stringify({ id: "fan-a", version });
  const base = {
    "packs/fan-a.yaml": entry("fan-a", ["BlueFire"]),
    "packs/fan-a/pack.json": manifest("1.0.0"),
    "packs/fan-b.yaml": entry("fan-b", ["someone"]),
    "packs/fan-b/pack.json": manifest("1.0.0"),
  };
  const run = ({ files, outsiders = ["bluefire"], headTree = {}, baseTree = base }) =>
    gate({
      files,
      maintainer: false,
      outsiders,
      ...head({ ...baseTree, ...headTree }),
      readBase: async (file) => baseTree[file] ?? null,
    });
  const bumped = { "packs/fan-a/pack.json": manifest("1.0.1") };
  const refused = (errors, file) => errors.some((e) => e.startsWith(`${file}: a submission may only`));

  it("may change the folder of a pack listing them, with a raised version; the entry is checked as kept", async () => {
    const { entries, errors } = await run({
      files: [
        ...changed("packs/fan-a/pack.json", "packs/fan-a/decks/a.json"),
        { filename: "packs/fan-a/cards/new.webp", status: "added" },
        { filename: "packs/fan-a/old.md", status: "removed" },
      ],
      headTree: bumped,
    });
    assert.deepEqual(errors, []);
    assert.deepEqual(
      entries.map((e) => [e.id, e.kept]),
      [["fan-a", true]],
    );
  });

  it("is refused without a raised version", async () => {
    for (const version of ["1.0.0", "0.9.9"]) {
      const { errors } = await run({
        files: changed("packs/fan-a/pack.json"),
        headTree: { "packs/fan-a/pack.json": manifest(version) },
      });
      assert.deepEqual(errors, [
        `packs/fan-a/pack.json: raise version above 1.0.0 (it is ${version}): published versions are immutable`,
      ]);
    }
    const { errors } = await run({ files: changed("packs/fan-a/decks/a.json") });
    assert.match(errors.join("\n"), /raise version above 1\.0\.0 \(it is 1\.0\.0\)/);
  });

  it("is refused a version that isn't 1.2.3, or a deleted pack.json", async () => {
    const odd = await run({
      files: changed("packs/fan-a/pack.json"),
      headTree: { "packs/fan-a/pack.json": manifest("2.0.0-beta") },
    });
    assert.match(odd.errors.join("\n"), /on the pull request's head needs a version of the form 1\.2\.3/);
    const gone = await gate({
      files: [{ filename: "packs/fan-a/pack.json", status: "removed" }],
      maintainer: false,
      outsiders: ["bluefire"],
      readEntry: async (file) => (file === "packs/fan-a/pack.json" ? null : (base[file] ?? null)),
      readBase: async (file) => base[file] ?? null,
      listEntries: async () => [],
    });
    assert.match(gone.errors.join("\n"), /packs\/fan-a\/pack\.json is missing on the pull request's head/);
  });

  it("may not change the entry itself (path, adopt, editors), even next to its folder", async () => {
    const { errors } = await run({
      files: changed("packs/fan-a.yaml", "packs/fan-a/pack.json"),
      headTree: { ...bumped, "packs/fan-a.yaml": entry("fan-a", ["BlueFire", "friend"]) },
    });
    assert.deepEqual(errors, [
      "packs/fan-a.yaml: path entries (packs kept in this repo) are added and changed by the maintainer",
    ]);
  });

  it("may not change a pack that doesn't list them, scripts, workflows or the SDK version", async () => {
    for (const other of ["packs/fan-b/pack.json", "scripts/pr-gate.mjs", ".github/workflows/check.yml", "package.json"]) {
      const { errors } = await run({ files: changed("packs/fan-a/pack.json", other), headTree: bumped });
      assert.ok(refused(errors, other), `${other}: ${errors.join(" | ")}`);
    }
  });

  it("may not move a file in from another pack's folder", async () => {
    const { errors } = await run({
      files: [{ filename: "packs/fan-a/x.json", previous_filename: "packs/fan-b/x.json", status: "renamed" }],
      headTree: bumped,
    });
    assert.ok(refused(errors, "packs/fan-b/x.json"), errors.join(" | "));
  });

  it("reads the editors from the base branch, never the pull request", async () => {
    const { errors } = await run({
      files: changed("packs/fan-b/pack.json"),
      headTree: { "packs/fan-b.yaml": entry("fan-b", ["bluefire"]), "packs/fan-b/pack.json": manifest("1.0.1") },
    });
    assert.ok(refused(errors, "packs/fan-b/pack.json"), errors.join(" | "));
  });

  it("needs every outsider listed (an outsider re-running someone's pull request counts)", async () => {
    const { errors } = await run({
      files: changed("packs/fan-a/pack.json"),
      outsiders: ["bluefire", "fan"],
      headTree: bumped,
    });
    assert.ok(refused(errors, "packs/fan-a/pack.json"), errors.join(" | "));
  });

  it("doesn't reach a repo entry or a draft folder with no entry", async () => {
    const baseTree = {
      "packs/fan-r.yaml": `${repoEntry("fan-r")}editors: [bluefire]\n`,
      "packs/fan-d/DRAFT": "",
      "packs/fan-d/pack.json": manifest("1.0.0"),
    };
    for (const file of ["packs/fan-r/pack.json", "packs/fan-d/pack.json"]) {
      const { errors } = await run({ files: changed(file), baseTree, headTree: { [file]: manifest("1.0.1") } });
      assert.ok(refused(errors, file), errors.join(" | "));
    }
  });
});

describe("gate: fails closed", () => {
  // The review's second P1: packs/foo.yaml changed and nothing to check must fail, never pass as "no entry".
  it("fails when packs/foo.yaml changed but no entry is found at the head", async () => {
    const { entries, errors } = await gate({ files: changed("packs/foo.yaml"), maintainer: true, ...head({}) });
    assert.deepEqual(entries, []);
    assert.equal(errors.length, 1);
    assert.match(errors[0], /packs\/foo\.yaml changed but could not be read/);
  });

  it("fails when a pack folder changed without its entry", async () => {
    const { errors } = await gate({ files: changed("packs/foo/pack.json"), maintainer: true, ...head({}) });
    assert.match(errors.join("\n"), /packs\/foo\/ changed but packs\/foo\.yaml is not in the pull request/);
  });

  it("lets a maintainer keep a draft pack folder with no entry, and checks nothing for it", async () => {
    const draft = { "packs/foo/DRAFT": "waiting on a co-author" };
    const { entries, errors } = await gate({ files: changed("packs/foo/pack.json"), maintainer: true, ...head(draft) });
    assert.deepEqual(errors, []);
    assert.deepEqual(entries, []);
  });

  it("still refuses a draft folder from a submission", async () => {
    const draft = { "packs/foo/DRAFT": "" };
    const { errors } = await gate({ files: changed("packs/foo/pack.json"), maintainer: false, ...head(draft) });
    assert.ok(errors.length > 0);
  });
});

describe("gate: a maintainer", () => {
  it("may change scripts and workflows; with no pack touched, nothing is checked", async () => {
    const { entries, errors } = await gate({
      files: changed("scripts/fetch-release.sh", ".github/workflows/check.yml"),
      maintainer: true,
      ...head({ "packs/fan-a.yaml": repoEntry("fan-a") }),
    });
    assert.deepEqual([entries, errors], [[], []]);
  });

  it("may rename an entry and withdraw others in one pull request; the new name is checked", async () => {
    const { entries, errors } = await gate({
      files: [
        { filename: "packs/fan-b.yaml", previous_filename: "packs/fan-a.yaml", status: "renamed" },
        { filename: "packs/fan-c.yaml", status: "removed" },
        { filename: "packs/fan-d.yaml", status: "removed" },
      ],
      maintainer: true,
      ...head({ "packs/fan-b.yaml": repoEntry("fan-b") }),
    });
    assert.deepEqual(errors, []);
    assert.deepEqual(
      entries.map((e) => e.id),
      ["fan-b"],
    );
  });

  it("checks the entry of a pack folder they changed", async () => {
    const { entries, errors } = await gate({
      files: changed("packs/fan-a/cards/en/01a.webp"),
      maintainer: true,
      ...head({ "packs/fan-a.yaml": keptEntry("fan-a") }),
    });
    assert.deepEqual(errors, []);
    assert.deepEqual(
      entries.map((e) => [e.id, e.kept]),
      [["fan-a", true]],
    );
  });

  it("checks every path entry when the SDK version changes", async () => {
    const { entries, errors } = await gate({
      files: changed("package-lock.json"),
      maintainer: true,
      ...head({
        "packs/fan-a.yaml": keptEntry("fan-a"),
        "packs/fan-b.yaml": repoEntry("fan-b"),
        "packs/fan-c.yaml": keptEntry("fan-c"),
      }),
    });
    assert.deepEqual(errors, []);
    assert.deepEqual(
      entries.map((e) => e.id),
      ["fan-a", "fan-c"],
    );
  });
});

describe("gate: Dependabot's SDK bump", () => {
  const tree = {
    "packs/fan-a.yaml": keptEntry("fan-a"),
    "packs/fan-b.yaml": repoEntry("fan-b"),
    "packs/fan-c.yaml": keptEntry("fan-c"),
  };

  it("checks every path entry when it changes the root manifests", async () => {
    const { entries, errors } = await gate({
      files: changed("package.json", "package-lock.json"),
      maintainer: true,
      sdkBump: true,
      ...head(tree),
    });
    assert.deepEqual(errors, []);
    assert.deepEqual(
      entries.map((e) => [e.id, e.kept]),
      [
        ["fan-a", true],
        ["fan-c", true],
      ],
    );
  });

  it("is refused when it changes anything else", async () => {
    const others = ["packs/fan-a.yaml", "packs/fan-a/pack.json", "scripts/pr-gate.mjs", ".github/dependabot.yml"];
    for (const other of others) {
      const { entries, errors } = await gate({
        files: changed("package.json", "package-lock.json", other),
        maintainer: true,
        sdkBump: true,
        ...head(tree),
      });
      assert.deepEqual(entries, []);
      assert.equal(errors.length, 1, other);
      assert.match(errors[0], /only package\.json and package-lock\.json/);
      assert.ok(errors[0].endsWith(other), errors[0]);
    }
  });

  it("counts a rename's old name too", async () => {
    const { errors } = await gate({
      files: [{ filename: "package.json", previous_filename: "scripts/x.mjs", status: "renamed" }],
      maintainer: true,
      sdkBump: true,
      ...head(tree),
    });
    assert.equal(errors.length, 1);
    assert.match(errors[0], /scripts\/x\.mjs/);
  });
});

describe("whoOpened", () => {
  const permissions = { quincarter: "admin", helper: "write", fan: "read" };
  const lookups = [];
  const permission = async (user) => {
    lookups.push(user);
    return permissions[user] ?? "none";
  };

  it("a maintainer's pull request", async () => {
    assert.deepEqual(await whoOpened({ author: "quincarter", sender: "helper", permission }), {
      maintainer: true,
      sdkBump: false,
      outsiders: [],
    });
  });

  it("a submission", async () => {
    assert.deepEqual(await whoOpened({ author: "fan", sender: "fan", permission }), {
      maintainer: false,
      sdkBump: false,
      outsiders: ["fan"],
    });
    assert.deepEqual(await whoOpened({ author: "fan", sender: "quincarter", permission }), {
      maintainer: false,
      sdkBump: false,
      outsiders: ["fan"],
    });
  });

  it("Dependabot's bump, run by Dependabot or re-run by a maintainer; Dependabot is never looked up", async () => {
    lookups.length = 0;
    assert.deepEqual(await whoOpened({ author: SDK_BOT, sender: SDK_BOT, permission }), {
      maintainer: true,
      sdkBump: true,
      outsiders: [],
    });
    assert.deepEqual(await whoOpened({ author: SDK_BOT, sender: "quincarter", permission }), {
      maintainer: true,
      sdkBump: true,
      outsiders: [],
    });
    assert.deepEqual(lookups, ["quincarter"]);
  });

  it("Dependabot's pull request triggered by someone without write access is a submission", async () => {
    assert.deepEqual(await whoOpened({ author: SDK_BOT, sender: "fan", permission }), {
      maintainer: false,
      sdkBump: false,
      outsiders: ["fan"],
    });
  });

  it("Dependabot as the sender of someone else's pull request counts for nothing", async () => {
    assert.deepEqual(await whoOpened({ author: "quincarter", sender: SDK_BOT, permission }), {
      maintainer: false,
      sdkBump: false,
      outsiders: [SDK_BOT],
    });
  });
});

describe("githubPullRequest", () => {
  const pull = (respond) =>
    githubPullRequest({
      repo: "o/r",
      pr: "7",
      headSha: "h".repeat(40),
      exec: async (_file, args) => respond(args),
    });

  it("lists the files from the API, and reads entries at the head sha", async () => {
    const seen = [];
    const api = pull((args) => {
      seen.push(args.at(-1));
      if (args.at(-1).includes("/files")) {
        return {
          code: 0,
          stdout: '{"filename":"packs/a.yaml","status":"added","previous_filename":null}\n',
          stderr: "",
        };
      }
      return { code: 0, stdout: "id: a\n", stderr: "" };
    });
    assert.deepEqual(await api.files(), [{ filename: "packs/a.yaml", status: "added", previous_filename: null }]);
    assert.equal(await api.readEntry("packs/a.yaml"), "id: a\n");
    assert.deepEqual(seen, [
      "repos/o/r/pulls/7/files?per_page=100",
      `repos/o/r/contents/packs/a.yaml?ref=${"h".repeat(40)}`,
    ]);
  });

  it("reads the base branch at the base sha", async () => {
    const seen = [];
    const api = githubPullRequest({
      repo: "o/r",
      pr: "7",
      headSha: "h".repeat(40),
      baseSha: "b".repeat(40),
      exec: async (_file, args) => {
        seen.push(args.at(-1));
        return { code: 0, stdout: "id: a\n", stderr: "" };
      },
    });
    assert.equal(await api.readBase("packs/a.yaml"), "id: a\n");
    assert.deepEqual(seen, [`repos/o/r/contents/packs/a.yaml?ref=${"b".repeat(40)}`]);
  });

  it("reads a missing entry as null and a non-collaborator as no permission", async () => {
    const api = pull(() => ({ code: 1, stdout: "", stderr: "gh: Not Found (HTTP 404)" }));
    assert.equal(await api.readEntry("packs/a.yaml"), null);
    assert.equal(await api.permission("someone"), "none");
  });

  it("fails on any other API error", async () => {
    const api = pull(() => ({ code: 1, stdout: "", stderr: "gh: Server Error (HTTP 502)" }));
    await assert.rejects(api.readEntry("packs/a.yaml"), /HTTP 502/);
    await assert.rejects(api.files(), /HTTP 502/);
  });
});
