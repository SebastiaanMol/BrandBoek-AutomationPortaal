import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const sourceRoot = path.join(root, "gitlabtest", "app");
const target = path.join(root, "src", "lib", "generatedPythonCodePathAnalysis.ts");

function walk(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, acc);
    else if (entry.isFile() && entry.name.endsWith(".py")) acc.push(full);
  }
  return acc;
}

function rel(file) {
  return path.relative(root, file).replace(/\\/g, "/");
}

function indentOf(line) {
  const match = line.match(/^(\s*)/);
  return match ? match[1].replace(/\t/g, "    ").length : 0;
}

function clean(line) {
  return line.trim();
}

function findMatchingParen(lines, startIndex) {
  let depth = 0;
  let started = false;
  for (let i = startIndex; i < lines.length; i += 1) {
    const text = stripComment(lines[i]);
    for (const char of text) {
      if (char === "(" || char === "[" || char === "{") {
        depth += 1;
        started = true;
      } else if (char === ")" || char === "]" || char === "}") {
        depth -= 1;
      }
    }
    if (started && depth <= 0) return i;
  }
  return startIndex;
}

function stripComment(line) {
  let quote = "";
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if ((char === "\"" || char === "'") && line[i - 1] !== "\\") {
      quote = quote === char ? "" : quote || char;
    }
    if (char === "#" && !quote) return line.slice(0, i);
  }
  return line;
}

function collectStatement(lines, startIndex) {
  const end = findMatchingParen(lines, startIndex);
  return lines.slice(startIndex, end + 1).map((line) => clean(stripComment(line))).join(" ").replace(/\s+/g, " ").trim();
}

function extractDictKeys(statement) {
  const keys = [];
  const regex = /["']([^"']+)["']\s*:/g;
  let match;
  while ((match = regex.exec(statement))) keys.push(match[1]);
  return [...new Set(keys)];
}

function extractCallName(statement) {
  const awaitMatch = statement.match(/\bawait\s+([A-Za-z_][\w.]*)(?=\()/);
  if (awaitMatch) return awaitMatch[1];
  const returnAwaitMatch = statement.match(/\breturn\s+await\s+([A-Za-z_][\w.]*)(?=\()/);
  if (returnAwaitMatch) return returnAwaitMatch[1];
  const callMatch = statement.match(/\b([A-Za-z_][\w.]*)(?=\()/);
  return callMatch?.[1] ?? "";
}

function extractHubspotTarget(statement) {
  const match = statement.match(/call_hubspot_api\(\s*([A-Za-z_][\w.]*)/);
  return match?.[1] ?? "";
}

function splitArgsSignature(signature) {
  return signature
    .split(",")
    .map((part) => part.trim().split(":")[0]?.trim())
    .filter(Boolean);
}

function analyzeFunction(lines, startIndex, file) {
  const header = clean(lines[startIndex]);
  const headerMatch = header.match(/^(async\s+def|def)\s+([A-Za-z_]\w*)\s*\((.*)$/);
  if (!headerMatch) return null;
  const isAsync = headerMatch[1].startsWith("async");
  const functionName = headerMatch[2];
  const headerEnd = findMatchingParen(lines, startIndex);
  const signature = lines.slice(startIndex, headerEnd + 1).join(" ");
  const argsMatch = signature.match(/\((.*)\)\s*(?:->.*?)?:/);
  const args = splitArgsSignature(argsMatch?.[1] ?? "");
  const baseIndent = indentOf(lines[startIndex]);
  let endIndex = lines.length - 1;
  for (let i = headerEnd + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (!clean(line)) continue;
    const indent = indentOf(line);
    if (indent <= baseIndent && /^(async\s+def|def)\s+/.test(clean(line))) {
      endIndex = i - 1;
      break;
    }
  }

  const decisions = [];
  const loops = [];
  const raises = [];
  const returns = [];
  const calls = [];

  for (let i = headerEnd + 1; i <= endIndex; i += 1) {
    const raw = lines[i];
    const line = clean(stripComment(raw));
    if (!line) continue;
    const depth = Math.max(0, Math.floor((indentOf(raw) - baseIndent) / 4) - 1);

    const ifMatch = line.match(/^if\s+(.+):$/) ?? line.match(/^elif\s+(.+):$/);
    if (ifMatch) {
      decisions.push({
        condition: ifMatch[1],
        lineno: i + 1,
        depth,
        bodyCount: 0,
        elseCount: 0,
      });
    }

    const forMatch = line.match(/^for\s+(.+?)\s+in\s+(.+):$/);
    if (forMatch) {
      loops.push({ kind: "for", target: forMatch[1], iter: forMatch[2], lineno: i + 1, depth });
    }

    const whileMatch = line.match(/^while\s+(.+):$/);
    if (whileMatch) {
      loops.push({ kind: "while", condition: whileMatch[1], lineno: i + 1, depth });
    }

    if (line.startsWith("raise ")) {
      raises.push({ exception: line.replace(/^raise\s+/, ""), lineno: i + 1, depth });
    }

    if (line.startsWith("return")) {
      returns.push({ value: line.replace(/^return\s*/, ""), lineno: i + 1, depth });
    }

    if (/\b(await\s+)?[A-Za-z_][\w.]*\(/.test(line)) {
      const statement = collectStatement(lines, i);
      const name = extractCallName(statement);
      if (name && !["if", "for", "while", "return"].includes(name)) {
        calls.push({
          name,
          hubspotTarget: extractHubspotTarget(statement),
          payloadKeys: extractDictKeys(statement),
          lineno: i + 1,
          depth,
          code: statement,
        });
      }
    }
  }

  return {
    functionId: `${rel(file)}::${functionName}`,
    functionName,
    file: rel(file),
    lineno: startIndex + 1,
    endLineno: endIndex + 1,
    isAsync,
    args,
    decisions,
    loops,
    raises,
    returns,
    calls,
  };
}

const functions = [];
for (const file of walk(sourceRoot)) {
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    if (/^\s*(async\s+def|def)\s+[A-Za-z_]\w*\s*\(/.test(lines[i])) {
      const analyzed = analyzeFunction(lines, i, file);
      if (analyzed) functions.push(analyzed);
    }
  }
}

const content = `// Auto-generated by scripts/generate-python-codepath-analysis.mjs.
// Source: gitlabtest/app/**/*.py

export interface PythonCodeDecision { condition: string; lineno: number; depth: number; bodyCount: number; elseCount: number; }
export interface PythonCodeLoop { kind: string; target?: string; iter?: string; condition?: string; lineno: number; depth: number; }
export interface PythonCodeRaise { exception: string; lineno: number; depth: number; }
export interface PythonCodeReturn { value: string; lineno: number; depth: number; }
export interface PythonCodeCall { name: string; hubspotTarget: string; payloadKeys: string[]; lineno: number; depth: number; code: string; }
export interface PythonFunctionCodePath { functionId: string; functionName: string; file: string; lineno: number; endLineno: number; isAsync: boolean; args: string[]; decisions: PythonCodeDecision[]; loops: PythonCodeLoop[]; raises: PythonCodeRaise[]; returns: PythonCodeReturn[]; calls: PythonCodeCall[]; }

export const PYTHON_CODEPATH_ANALYSIS = ${JSON.stringify(functions, null, 2)} as PythonFunctionCodePath[];
`;

fs.writeFileSync(target, content);
console.log(`Generated ${rel(target)} with ${functions.length} functions.`);
