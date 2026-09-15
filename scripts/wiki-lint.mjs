#!/usr/bin/env node
// Dependency-free LINT for the wiki/ LLM Wiki (see wiki/SCHEMA.md).
// Run from the repo root: `node scripts/wiki-lint.mjs [--pages-only] [--base REV]`
//
// Checks (see wiki/SCHEMA.md for the layer/page/log conventions being enforced):
//   1. layers        - wiki/SCHEMA.md, wiki/index.md, wiki/log.md, wiki/raw/, wiki/pages/ exist
//   2. pages          - frontmatter shape + type-matches-directory for every wiki/pages/TYPE/*.md
//   3. duplicate slugs - no filename reused across type directories
//   4. broken links   - every [[slug]] in wiki/pages/** and wiki/index.md resolves to a real page
//   5. sensitive data - no CG- key pattern or email address in any page (wiki/raw/ is exempt)
//   6. index          - headings present, every page listed exactly once, correct category, no dead links
//   7. log            - every log line (after the header) matches the SCHEMA.md format
//   8. --base REV     - wiki/raw/ unchanged since REV; wiki/log.md at REV is an exact prefix of today's
//
// Prints one `ERROR <CODE> <detail>` line per failure, then a single deterministic summary line:
//   wiki-lint: pages=N orphans=N broken_links=N duplicates=N unverified=N errors=N
// Exits 1 if errors > 0, else 0.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, posix } from "node:path";
import { execFileSync } from "node:child_process";

const args = process.argv.slice(2);
const pagesOnly = args.includes("--pages-only");
const baseIdx = args.indexOf("--base");
const baseRev = baseIdx !== -1 ? args[baseIdx + 1] : null;

const ROOT = process.cwd();
const WIKI_DIR = join(ROOT, "wiki");
const PAGES_DIR = join(WIKI_DIR, "pages");

/** @type {{ code: string, detail: string }[]} */
const errors = [];

function addError(code, detail) {
  errors.push({ code, detail });
}

// ---------------------------------------------------------------------------
// 1. Layers
// ---------------------------------------------------------------------------

if (!existsSync(join(WIKI_DIR, "SCHEMA.md")))
  addError("LAYER_MISSING", "wiki/SCHEMA.md is missing");
if (!existsSync(join(WIKI_DIR, "index.md"))) addError("LAYER_MISSING", "wiki/index.md is missing");
if (!existsSync(join(WIKI_DIR, "log.md"))) addError("LAYER_MISSING", "wiki/log.md is missing");
if (!existsSync(PAGES_DIR)) addError("LAYER_MISSING", "wiki/pages/ is missing");

const RAW_DIR = join(WIKI_DIR, "raw");
if (!existsSync(RAW_DIR) || readdirSync(RAW_DIR).length === 0) {
  addError("LAYER_MISSING", "wiki/raw/ is missing or has no files");
}

// ---------------------------------------------------------------------------
// 2 & 3. Pages: collect, validate frontmatter, find duplicate slugs
// ---------------------------------------------------------------------------

const TYPE_SINGULAR = {
  sources: "source",
  entities: "entity",
  concepts: "concept",
  decisions: "decision",
  findings: "finding",
};
const HEADING_BY_DIR = {
  sources: "Sources",
  entities: "Entities",
  concepts: "Concepts",
  decisions: "Decisions",
  findings: "Findings",
};
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** @type {{ dir: string, file: string, slug: string, relPath: string, absPath: string, content: string }[]} */
const pages = [];

if (existsSync(PAGES_DIR)) {
  const entries = readdirSync(PAGES_DIR, { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  for (const entry of entries) {
    const entryAbsPath = join(PAGES_DIR, entry.name);
    if (entry.isDirectory()) {
      const files = readdirSync(entryAbsPath)
        .filter((f) => f.endsWith(".md"))
        .sort();
      if (Object.prototype.hasOwnProperty.call(TYPE_SINGULAR, entry.name)) {
        for (const file of files) {
          const slug = file.slice(0, -3);
          const absPath = join(entryAbsPath, file);
          const content = readFileSync(absPath, "utf8");
          pages.push({
            dir: entry.name,
            file,
            slug,
            relPath: posix.join("pages", entry.name, file),
            absPath,
            content,
          });
        }
      } else if (files.length === 0) {
        addError("PAGE_BAD_DIR", `wiki/pages/${entry.name}/ is not a recognized page type`);
      } else {
        for (const file of files) {
          addError(
            "PAGE_BAD_DIR",
            `wiki/pages/${entry.name}/${file} is under an unrecognized directory`,
          );
        }
      }
    } else if (entry.name.endsWith(".md")) {
      addError("PAGE_BAD_DIR", `wiki/pages/${entry.name} is not inside a type directory`);
    }
  }
}

function parseFrontmatter(content) {
  const lines = content.split(/\r?\n/);
  if (lines[0] !== "---") return null;
  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === "---") {
      end = i;
      break;
    }
  }
  if (end === -1) return null;
  const data = {};
  for (const line of lines.slice(1, end)) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/);
    if (m) data[m[1]] = m[2].trim();
  }
  return data;
}

for (const page of pages) {
  const fm = parseFrontmatter(page.content);
  if (!fm) {
    addError("FRONTMATTER", `${page.relPath}: missing frontmatter block`);
    continue;
  }
  const requiredKeys = ["title", "type", "updated", "sources", "related"];
  const missing = requiredKeys.filter((k) => !(k in fm) || fm[k] === "");
  if (missing.length > 0) {
    addError("FRONTMATTER", `${page.relPath}: missing frontmatter key(s) ${missing.join(", ")}`);
  }
  const expectedType = TYPE_SINGULAR[page.dir];
  if ("type" in fm && fm.type !== "" && fm.type !== expectedType) {
    addError(
      "FRONTMATTER",
      `${page.relPath}: type "${fm.type}" does not match expected "${expectedType}" for wiki/pages/${page.dir}/`,
    );
  }
  if ("updated" in fm && fm.updated !== "" && !DATE_RE.test(fm.updated)) {
    addError("FRONTMATTER", `${page.relPath}: updated "${fm.updated}" is not YYYY-MM-DD`);
  }
}

// Duplicate slugs across type directories
const slugToDirs = new Map();
for (const page of pages) {
  const list = slugToDirs.get(page.slug) ?? [];
  list.push(page.dir);
  slugToDirs.set(page.slug, list);
}
const duplicateSlugs = [...slugToDirs.entries()]
  .filter(([, dirs]) => dirs.length > 1)
  .sort(([a], [b]) => a.localeCompare(b));
for (const [slug, dirs] of duplicateSlugs) {
  addError(
    "DUPLICATE_SLUG",
    `slug "${slug}" used in multiple type directories: ${dirs.sort().join(", ")}`,
  );
}

const validSlugs = new Set(pages.map((p) => p.slug));

// ---------------------------------------------------------------------------
// 4. Broken links ([[slug]] in wiki/pages/** and wiki/index.md)
// ---------------------------------------------------------------------------

const LINK_RE = /\[\[([^\]]+)\]\]/g;
let brokenLinkCount = 0;

function scanBrokenLinks(relPath, content) {
  for (const match of content.matchAll(LINK_RE)) {
    const slug = match[1].trim();
    if (!validSlugs.has(slug)) {
      addError("BROKEN_LINK", `${relPath}: [[${slug}]] does not match an existing page`);
      brokenLinkCount++;
    }
  }
}

for (const page of pages) scanBrokenLinks(page.relPath, page.content);

const indexPath = join(WIKI_DIR, "index.md");
const indexContent = existsSync(indexPath) ? readFileSync(indexPath, "utf8") : "";
if (existsSync(indexPath)) scanBrokenLinks("index.md", indexContent);

// ---------------------------------------------------------------------------
// 5. Sensitive data (CG- key pattern, email addresses) in pages
// ---------------------------------------------------------------------------

const CG_KEY_RE = /CG-[A-Za-z0-9]{16,}/;
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;

for (const page of pages) {
  if (CG_KEY_RE.test(page.content)) {
    addError("SENSITIVE", `${page.relPath}: contains a CG- API key pattern`);
  }
  if (EMAIL_RE.test(page.content)) {
    addError("SENSITIVE", `${page.relPath}: contains an email address`);
  }
}

// ---------------------------------------------------------------------------
// unverified count (informational, never an error)
// ---------------------------------------------------------------------------

let unverifiedCount = 0;
const UNVERIFIED_RE = /unverified/gi;
for (const page of pages) {
  const matches = page.content.match(UNVERIFIED_RE);
  if (matches) unverifiedCount += matches.length;
}

// ---------------------------------------------------------------------------
// 6. Index (skipped with --pages-only)
// ---------------------------------------------------------------------------

const REQUIRED_HEADINGS = ["Overview", "Sources", "Entities", "Concepts", "Decisions", "Findings"];
let orphanCount = 0;

if (!pagesOnly && existsSync(indexPath)) {
  const indexLines = indexContent.split(/\r?\n/);
  const headingRe = /^##\s+(.+?)\s*$/;
  /** @type {{ heading: string, lines: string[] }[]} */
  const sections = [];
  let current = null;
  for (const line of indexLines) {
    const m = line.match(headingRe);
    if (m) {
      current = { heading: m[1].trim(), lines: [] };
      sections.push(current);
    } else if (current) {
      current.lines.push(line);
    }
  }

  const foundHeadings = new Set(sections.map((s) => s.heading));
  for (const heading of REQUIRED_HEADINGS) {
    if (!foundHeadings.has(heading)) {
      addError("INDEX_HEADING", `wiki/index.md is missing the "## ${heading}" heading`);
    }
  }

  // Markdown links per section, and globally, for page-path / dead-link checks.
  const MD_LINK_RE = /\[([^\]]*)\]\(([^)]+)\)/g;
  /** @type {{ heading: string, target: string }[]} */
  const sectionLinks = [];
  for (const section of sections) {
    const sectionText = section.lines.join("\n");
    for (const match of sectionText.matchAll(MD_LINK_RE)) {
      sectionLinks.push({ heading: section.heading, target: match[2].trim() });
    }
  }

  // ORPHAN / INDEX_DUPLICATE / INDEX_CATEGORY: every recognized page must appear exactly once,
  // under the right heading (concepts may also sit under Overview).
  for (const page of pages) {
    const occurrences = sectionLinks.filter((l) => l.target === page.relPath);
    if (occurrences.length === 0) {
      addError("ORPHAN", `${page.relPath} is not listed in wiki/index.md`);
      orphanCount++;
    } else if (occurrences.length > 1) {
      addError(
        "INDEX_DUPLICATE",
        `${page.relPath} is listed ${occurrences.length} times in wiki/index.md`,
      );
    } else {
      const expectedHeading = HEADING_BY_DIR[page.dir];
      const actualHeading = occurrences[0].heading;
      const allowedHeadings =
        page.dir === "concepts" ? [expectedHeading, "Overview"] : [expectedHeading];
      if (!allowedHeadings.includes(actualHeading)) {
        addError(
          "INDEX_CATEGORY",
          `${page.relPath} is listed under "## ${actualHeading}" but belongs under "## ${expectedHeading}"`,
        );
      }
    }
  }

  // INDEX_DEAD: every link target in index.md (internal, non-anchor) must exist under wiki/.
  const allLinks = [...indexContent.matchAll(MD_LINK_RE)];
  for (const match of allLinks) {
    const target = match[2].trim();
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(target)) continue; // external URL
    const withoutAnchor = target.split("#")[0];
    if (withoutAnchor === "") continue; // pure in-page anchor
    if (!existsSync(join(WIKI_DIR, withoutAnchor))) {
      addError("INDEX_DEAD", `wiki/index.md links to "${target}" which does not exist`);
    }
  }

  // INDEX_EMPTY: a heading with zero page-bullets must contain the literal "_(none yet)_".
  for (const section of sections) {
    if (!REQUIRED_HEADINGS.includes(section.heading)) continue;
    const hasPageLink = sectionLinks.some((l) => l.heading === section.heading);
    if (!hasPageLink) {
      const sectionText = section.lines.join("\n");
      if (!sectionText.includes("_(none yet)_")) {
        addError(
          "INDEX_EMPTY",
          `wiki/index.md "## ${section.heading}" has no pages and no "_(none yet)_" marker`,
        );
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 7. Log (skipped with --pages-only)
// ---------------------------------------------------------------------------

const logPath = join(WIKI_DIR, "log.md");
const LOG_LINE_RE = /^\d{4}-\d{2}-\d{2} \| (INGEST|QUERY|LINT|DECISION|FINDING) \| .+ \| .+$/;

if (!pagesOnly && existsSync(logPath)) {
  const logContent = readFileSync(logPath, "utf8");
  const logLines = logContent.split(/\r?\n/);
  let headerEndIdx = logLines.findIndex((l) => l.startsWith("Append-only."));
  if (headerEndIdx === -1) headerEndIdx = 0;
  for (const line of logLines.slice(headerEndIdx + 1)) {
    if (line.trim() === "") continue;
    if (!LOG_LINE_RE.test(line)) {
      addError("LOG_FORMAT", `wiki/log.md: line does not match the log format: "${line}"`);
    }
  }
}

// ---------------------------------------------------------------------------
// 8. --base REV: raw/ immutability and log.md append-only history
// ---------------------------------------------------------------------------

if (baseRev) {
  try {
    execFileSync("git", ["diff", "--quiet", baseRev, "--", "wiki/raw"], {
      cwd: ROOT,
      stdio: "ignore",
    });
  } catch {
    addError("RAW_MODIFIED", `wiki/raw/ differs from its content at ${baseRev}`);
  }

  try {
    const oldLog = execFileSync("git", ["show", `${baseRev}:wiki/log.md`], {
      cwd: ROOT,
      encoding: "utf8",
    });
    const currentLog = existsSync(logPath) ? readFileSync(logPath, "utf8") : "";
    if (!currentLog.startsWith(oldLog)) {
      addError(
        "LOG_REWRITTEN",
        `wiki/log.md at ${baseRev} is not an exact prefix of the current file`,
      );
    }
  } catch (err) {
    addError("LOG_REWRITTEN", `could not read wiki/log.md at ${baseRev}: ${err.message}`);
  }
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

for (const error of errors) {
  process.stdout.write(`ERROR ${error.code} ${error.detail}\n`);
}

const duplicateCount = duplicateSlugs.length;

process.stdout.write(
  `wiki-lint: pages=${pages.length} orphans=${orphanCount} broken_links=${brokenLinkCount} duplicates=${duplicateCount} unverified=${unverifiedCount} errors=${errors.length}\n`,
);

process.exit(errors.length > 0 ? 1 : 0);
