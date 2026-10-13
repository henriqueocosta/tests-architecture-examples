#!/usr/bin/env node
// PreToolUse hook: blocks a tool call that would write, commit or push a
// secret, or that reads a secret file through the shell.
//
// - Write / Edit / MultiEdit / NotebookEdit: scans the text being written.
// - Bash: scans the command itself; on `git commit` scans what will be
//   committed (staged changes, plus unstaged and new files when the command
//   also runs `git add` or `commit -a`); on `git push` the commits not yet on
//   any remote; blocks commands that
//   touch secret files (.env, *.pem, *.key, id_rsa...).
//
// Known public values (for example the Hardhat test accounts) are listed, one
// per line, in <project>/.claude/secrets-allowlist.txt.
//
// Exit 2 blocks the call and shows stderr to Claude. Any internal error exits
// 1, which Claude Code treats as non-blocking: a broken hook must not stop all work.
import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";

const PATTERNS = [
  { kind: "private key (PEM)", regex: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP |ENCRYPTED )?PRIVATE KEY(?: BLOCK)?-----/g },
  { kind: "AWS access key", regex: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g },
  { kind: "GitHub token", regex: /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{60,})\b/g },
  { kind: "Slack token", regex: /\bxox[abprs]-[A-Za-z0-9-]{10,}/g },
  { kind: "Anthropic API key", regex: /\bsk-ant-[A-Za-z0-9_-]{20,}/g },
  { kind: "OpenAI API key", regex: /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}/g },
  { kind: "Stripe live key", regex: /\b[rs]k_live_[A-Za-z0-9]{20,}/g },
  { kind: "Google API key", regex: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { kind: "JWT", regex: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g },
  { kind: "Authorization header", regex: /authorization["']?\s*[:=]\s*["']?(?:Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{16,}/gi },
  // Recorded HAR files keep cookies and auth headers as name/value pairs.
  { kind: "header in a HAR recording", regex: /"name"\s*:\s*"(?:cookie|set-cookie|authorization|x-api-key)"\s*,\s*"value"\s*:\s*"[^"]{8,}"/gi },
  // 64 hex chars is also a tx hash: only a key when named like one.
  { kind: "blockchain private key", regex: /(?:private[_ -]?key|secret|mnemonic)[^\n]{0,40}?\b(?:0x)?[0-9a-fA-F]{64}\b/gi },
  { kind: "credential assigned in code", regex: /\b(?:api[_-]?key|secret|token|password|passwd|client[_-]?secret)\b["']?\s*[:=]\s*["'][^"'\s]{12,}["']/gi },
];

// Values that are obviously not real: placeholders, env lookups, test markers.
const PLACEHOLDER = /example|placeholder|changeme|dummy|fake|redacted|xxxx|\$\{|process\.env|<[^>]+>/i;

const SECRET_FILE = /(?:^|[\s'"=/:])(?:\.env(?!\.(?:example|sample|template)\b)(?:\.[\w-]+)?|[\w.-]+\.(?:pem|key|p12|pfx)|id_(?:rsa|ed25519|ecdsa)|credentials\.json)(?=$|[\s'";|&)])/;

function loadAllowlist(projectDir) {
  try {
    return readFileSync(path.join(projectDir, ".claude", "secrets-allowlist.txt"), "utf8")
      .split("\n")
      .map((line) => line.replace(/#.*/, "").trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function scan(text, where, allowlist) {
  const findings = [];
  for (const { kind, regex } of PATTERNS) {
    for (const match of text.matchAll(regex)) {
      const value = match[0];
      if (PLACEHOLDER.test(value) || allowlist.some((allowed) => value.includes(allowed))) continue;
      findings.push({ kind, where, preview: `${value.slice(0, 12)}…` });
    }
  }
  return findings;
}

/** Only the lines being added, from a unified diff. */
function addedLines(diff) {
  return diff
    .split("\n")
    .filter((line) => line.startsWith("+") && !line.startsWith("+++"))
    .join("\n");
}

function git(args, cwd) {
  try {
    return execFileSync("git", args, { cwd, encoding: "utf8", maxBuffer: 50 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return ""; // not a git repository, or nothing to compare
  }
}

const MAX_SCANNED_FILE_BYTES = 1024 * 1024; // larger untracked files are build output, not source

/** New files that `git add` would pick up, skipping large and binary ones. */
function untrackedTextFiles(cwd) {
  return git(["ls-files", "--others", "--exclude-standard", "-z"], cwd)
    .split("\0")
    .filter(Boolean)
    .filter((file) => {
      try {
        const stats = statSync(path.join(cwd, file));
        return stats.isFile() && stats.size <= MAX_SCANNED_FILE_BYTES && !readFileSync(path.join(cwd, file)).includes(0);
      } catch {
        return false;
      }
    });
}

function findingsFor(input, allowlist) {
  const { tool_name: tool, tool_input: args = {}, cwd = process.cwd() } = input;
  const file = args.file_path ?? args.notebook_path ?? "file";

  switch (tool) {
    case "Write":
      return scan(args.content ?? "", file, allowlist);
    case "Edit":
      return scan(args.new_string ?? "", file, allowlist);
    case "MultiEdit":
      return (args.edits ?? []).flatMap((edit) => scan(edit.new_string ?? "", file, allowlist));
    case "NotebookEdit":
      return scan(args.new_source ?? "", file, allowlist);
    case "Bash": {
      const command = args.command ?? "";
      const findings = scan(command, "the command", allowlist);
      if (SECRET_FILE.test(command)) {
        findings.push({ kind: "access to a secret file", where: "the command", preview: command.match(SECRET_FILE)[0].trim() });
      }
      if (/\bgit\b[^\n;&|]*\bcommit\b/.test(command)) {
        findings.push(...scan(addedLines(git(["diff", "--cached", "--no-color", "-U0"], cwd)), "staged changes", allowlist));
        // The hook runs before the command: with `git add ... && git commit` or
        // `commit -a`, what will be committed is not staged yet.
        const stagesFirst = /\bgit\b[^\n;&|]*\badd\b/.test(command);
        if (stagesFirst || /\bcommit\b[^\n;&|]*\s(?:-[a-zA-Z]*a[a-zA-Z]*|--all)\b/.test(command)) {
          findings.push(...scan(addedLines(git(["diff", "--no-color", "-U0"], cwd)), "unstaged changes", allowlist));
        }
        if (stagesFirst) {
          for (const file of untrackedTextFiles(cwd)) {
            findings.push(...scan(readFileSync(path.join(cwd, file), "utf8"), file, allowlist));
          }
        }
      }
      if (/\bgit\b[^\n;&|]*\bpush\b/.test(command)) {
        const unpushed = git(["log", "-p", "--no-color", "-U0", "--branches", "--not", "--remotes"], cwd);
        findings.push(...scan(addedLines(unpushed), "commits not yet pushed", allowlist));
      }
      return findings;
    }
    default:
      return [];
  }
}

try {
  const input = JSON.parse(readFileSync(0, "utf8"));
  const projectDir = process.env.CLAUDE_PROJECT_DIR ?? input.cwd ?? process.cwd();
  const findings = findingsFor(input, loadAllowlist(projectDir));

  if (findings.length > 0) {
    const lines = findings.map((f) => `- ${f.kind} in ${f.where}: ${f.preview}`);
    process.stderr.write(
      [
        "Blocked: this would expose sensitive data.",
        ...lines,
        "",
        "Read the value from an environment variable or a secrets manager instead of writing it.",
        "For a recorded HAR, trace or fixture, remove cookies, auth headers and personal data first.",
        "If it is a known public test value, the user can add it to .claude/secrets-allowlist.txt with the reason.",
        "Do not try to work around this check: tell the user what was blocked.",
      ].join("\n") + "\n",
    );
    process.exit(2);
  }
} catch (err) {
  process.stderr.write(`block-secrets hook failed, call not checked: ${err.message}\n`);
  process.exit(1);
}
