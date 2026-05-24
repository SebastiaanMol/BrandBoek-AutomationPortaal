import fs from "node:fs";
import path from "node:path";

const HTTP_METHODS = new Set(["get", "post", "put", "patch", "delete"]);

function walk(dir) {
  const items = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) items.push(...walk(full));
    else if (entry.isFile() && entry.name.endsWith(".py")) items.push(full);
  }
  return items;
}

function toPosix(value) {
  return value.split(path.sep).join("/");
}

function toModule(appRoot, file) {
  const rel = path.relative(path.dirname(appRoot), file).replace(/\.py$/, "");
  return toPosix(rel).replace(/\//g, ".");
}

function moduleToFile(repoRoot, moduleName) {
  const file = path.join(repoRoot, "gitlabtest", ...moduleName.split(".")).concat(".py");
  return fs.existsSync(file) ? file : null;
}

function normalizeImportBlocks(content) {
  const lines = content.split(/\r?\n/);
  const result = [];
  for (let i = 0; i < lines.length; i += 1) {
    let line = lines[i];
    if (/^\s*from app\..*import\s*\(\s*$/.test(line)) {
      const block = [line.trim()];
      while (i + 1 < lines.length) {
        i += 1;
        block.push(lines[i].trim());
        if (lines[i].includes(")")) break;
      }
      result.push(block.join(" "));
    } else {
      result.push(line);
    }
  }
  return result;
}

function parseImports(lines) {
  const imports = new Map();

  for (const line of lines) {
    const importMatch = line.match(/^\s*import\s+(app\.[\w.]+)(?:\s+as\s+(\w+))?/);
    if (importMatch) {
      imports.set(importMatch[2] || importMatch[1].split(".")[0], {
        type: "module",
        module: importMatch[1],
      });
      continue;
    }

    const fromMatch = line.match(/^\s*from\s+(app\.[\w.]+)\s+import\s+(.+)$/);
    if (!fromMatch) continue;
    const fromModule = fromMatch[1];
    const names = fromMatch[2]
      .replace(/[()]/g, "")
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);

    for (const raw of names) {
      const aliasMatch = raw.match(/^(\w+)\s+as\s+(\w+)$/);
      const importedName = aliasMatch ? aliasMatch[1] : raw;
      const localName = aliasMatch ? aliasMatch[2] : raw;
      imports.set(localName, {
        type: "symbol",
        module: fromModule,
        name: importedName,
      });
    }
  }

  return imports;
}

function parseRouterPrefix(content) {
  const match = content.match(/router\s*=\s*APIRouter\s*\([\s\S]*?prefix\s*=\s*["']([^"']+)["']/m);
  return match?.[1] || "";
}

function lineIndent(line) {
  const match = line.match(/^(\s*)/);
  return match ? match[1].length : 0;
}

function parseFunctions(lines) {
  const functions = new Map();
  let pendingDecorators = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const trimmed = line.trim();
    if (trimmed.startsWith("@")) {
      pendingDecorators.push(trimmed);
      continue;
    }

    const defMatch = line.match(/^(\s*)(?:async\s+)?def\s+(\w+)\s*\((.*)$/);
    if (!defMatch) {
      if (trimmed && !trimmed.startsWith("#")) pendingDecorators = [];
      continue;
    }

    const indent = defMatch[1].length;
    const name = defMatch[2];
    const signatureParts = [line.trim()];
    while (!signatureParts.at(-1)?.trim().endsWith(":") && i + 1 < lines.length) {
      i += 1;
      signatureParts.push(lines[i].trim());
    }

    const body = [];
    let j = i + 1;
    for (; j < lines.length; j += 1) {
      const bodyLine = lines[j];
      if (bodyLine.trim() && lineIndent(bodyLine) <= indent) break;
      body.push(bodyLine);
    }
    i = j - 1;

    functions.set(name, {
      name,
      decorators: pendingDecorators,
      signature: signatureParts.join(" "),
      body: body.join("\n"),
    });
    pendingDecorators = [];
  }

  return functions;
}

function joinRoute(prefix, routePath) {
  const left = prefix.replace(/\/$/, "");
  const right = routePath.startsWith("/") ? routePath : `/${routePath}`;
  return left ? `${left}${right}` : right;
}

function endpointDecorators(functionInfo, prefix) {
  const routes = [];
  for (const decorator of functionInfo.decorators) {
    const match = decorator.match(/^@router\.(\w+)\s*\(\s*["']([^"']+)["']/);
    if (!match) continue;
    const method = match[1].toLowerCase();
    if (!HTTP_METHODS.has(method)) continue;
    routes.push({ method: method.toUpperCase(), endpoint: joinRoute(prefix, match[2]) });
  }
  return routes;
}

function resolveTarget(moduleInfo, rawTarget) {
  if (!rawTarget) return null;
  const clean = rawTarget.replace(/^await\s+/, "").trim();
  const parts = clean.split(".");
  const first = parts[0];
  const imported = moduleInfo.imports.get(first);

  if (imported?.type === "module") {
    return {
      module: imported.module,
      functionName: parts.slice(1).join(".") || first,
    };
  }

  if (imported?.type === "symbol") {
    return {
      module: imported.module,
      functionName: [imported.name, ...parts.slice(1)].join("."),
    };
  }

  if (moduleInfo.functions.has(first)) {
    return { module: moduleInfo.module, functionName: first };
  }

  return null;
}

function extractCallTargets(moduleInfo, functionInfo) {
  const body = functionInfo.body;
  const targets = [];

  for (const match of body.matchAll(/background_tasks\.add_task\s*\(\s*([\w.]+)/g)) {
    targets.push({ kind: "background_task", raw: match[1] });
  }

  for (const match of body.matchAll(/call_hubspot_api\s*\(\s*([\w.]+)/g)) {
    targets.push({ kind: "hubspot_repository_call", raw: match[1] });
  }

  for (const match of body.matchAll(/(?:return\s+)?await\s+([\w.]+)\s*\(/g)) {
    if (match[1] === "call_hubspot_api") continue;
    targets.push({ kind: "await_call", raw: match[1] });
  }

  for (const match of body.matchAll(/\b([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)\s*\(/g)) {
    const raw = match[1];
    if (
      raw === "call_hubspot_api" ||
      raw === "background_tasks.add_task" ||
      raw.startsWith("logger.") ||
      raw.startsWith("logging.") ||
      raw.startsWith("HTTPException")
    ) {
      continue;
    }
    const resolved = resolveTarget(moduleInfo, raw);
    if (resolved) targets.push({ kind: "call", raw });
  }

  return dedupeTargets(targets)
    .map((target) => ({ ...target, resolved: resolveTarget(moduleInfo, target.raw) }))
    .filter((target) => target.resolved);
}

function dedupeTargets(targets) {
  const seen = new Set();
  const result = [];
  for (const target of targets) {
    const key = `${target.kind}:${target.raw}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(target);
  }
  return result;
}

function collectCalls(modules, moduleName, functionName, repoRoot, depth = 0, maxDepth = 3, seen = new Set()) {
  const key = `${moduleName}::${functionName}`;
  if (seen.has(key)) return [];
  seen.add(key);

  const moduleInfo = modules.get(moduleName);
  const functionInfo = moduleInfo?.functions.get(functionName);
  if (!moduleInfo || !functionInfo) return [];

  const records = [];
  for (const target of extractCallTargets(moduleInfo, functionInfo)) {
    const targetModule = target.resolved.module;
    const targetFunction = target.resolved.functionName;
    const targetFile = moduleToFile(repoRoot, targetModule);
    const record = {
      depth,
      kind: target.kind,
      from: `${moduleName}::${functionName}`,
      to: `${targetModule}::${targetFunction}`,
      file: targetFile ? toPosix(path.relative(repoRoot, targetFile)) : null,
    };
    records.push(record);

    const nestedFunction = targetFunction.split(".").at(-1);
    if (depth + 1 < maxDepth && nestedFunction) {
      records.push(...collectCalls(modules, targetModule, nestedFunction, repoRoot, depth + 1, maxDepth, new Set(seen)));
    }
  }

  return dedupe(records);
}

function dedupe(records) {
  const seen = new Set();
  const result = [];
  for (const record of records) {
    const key = JSON.stringify(record);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(record);
  }
  return result;
}

function inferSystems(endpoint, calls) {
  const text = [
    endpoint,
    ...calls.map((call) => call.to),
    ...calls.map((call) => call.file || ""),
  ].join(" ").toLowerCase();
  const systems = ["GitLab"];
  for (const [needle, label] of [
    ["hubspot", "HubSpot"],
    ["typeform", "Typeform"],
    ["clockify", "Clockify"],
    ["kvk", "KvK"],
    ["wefact", "WeFact"],
    ["sharepoint", "SharePoint"],
    ["graph", "Microsoft Graph"],
  ]) {
    if (text.includes(needle) && !systems.includes(label)) systems.push(label);
  }
  return systems;
}

function humanizeIdentifier(value) {
  const cleaned = value
    .split("::")
    .at(-1)
    .replace(/^_+/, "")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned ? `${cleaned[0].toUpperCase()}${cleaned.slice(1)}` : "Onbekende stap";
}

function describeCallKind(kind) {
  if (kind === "background_task") return "zet een achtergrondtaak klaar";
  if (kind === "await_call") return "voert een asynchrone vervolgstap uit";
  if (kind === "hubspot_repository_call") return "leest of wijzigt gegevens in HubSpot";
  return "voert vervolgstap uit";
}

function summarizeCalls(calls, limit = 6) {
  const seen = new Set();
  const summary = [];

  for (const call of calls) {
    const target = humanizeIdentifier(call.to);
    const key = `${call.kind}:${target}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const file = call.file ? ` (${call.file})` : "";
    summary.push(`${describeCallKind(call.kind)}: ${target}${file}`);
    if (summary.length >= limit) break;
  }

  return summary;
}

function buildBusinessDescription(route, functionInfo, calls, systems) {
  const trigger = `${route.method} ${route.endpoint}`;
  const mainAction = humanizeIdentifier(functionInfo.name).toLowerCase();
  const otherSystems = systems.filter((system) => system !== "GitLab");
  const systemText = otherSystems.length
    ? ` en raakt vooral ${otherSystems.join(", ")}`
    : "";

  const logicSummary = summarizeCalls(calls);
  const descriptionParts = [
    `Deze automation start wanneer het endpoint ${trigger} wordt aangeroepen${systemText}.`,
    `De handler ${functionInfo.name} verwerkt dit verzoek en probeert daarna: ${mainAction}.`,
  ];

  if (logicSummary.length > 0) {
    descriptionParts.push(`De belangrijkste logica is: ${logicSummary.join("; ")}.`);
  } else {
    descriptionParts.push("Er zijn geen duidelijke vervolgstappen naar service- of repositorybestanden gevonden in de statische analyse.");
  }

  return {
    trigger,
    description: descriptionParts.join(" "),
    logic_summary: logicSummary,
  };
}

function readableName(handler) {
  const name = handler.replace(/_/g, " ").trim();
  return name ? `${name[0].toUpperCase()}${name.slice(1)}` : "Endpoint automation";
}

function loadModules(repoRoot) {
  const appRoot = path.join(repoRoot, "gitlabtest", "app");
  const modules = new Map();
  for (const file of walk(appRoot)) {
    const content = fs.readFileSync(file, "utf8");
    const lines = normalizeImportBlocks(content);
    const moduleName = toModule(appRoot, file);
    modules.set(moduleName, {
      module: moduleName,
      file,
      imports: parseImports(lines),
      functions: parseFunctions(lines),
      routerPrefix: parseRouterPrefix(content),
    });
  }
  return modules;
}

function analyze(repoRoot, maxDepth) {
  const modules = loadModules(repoRoot);
  const endpoints = [];
  for (const moduleInfo of [...modules.values()].sort((a, b) => a.file.localeCompare(b.file))) {
    if (!moduleInfo.module.startsWith("app.API.")) continue;
    for (const functionInfo of moduleInfo.functions.values()) {
      for (const route of endpointDecorators(functionInfo, moduleInfo.routerPrefix)) {
        const calls = collectCalls(modules, moduleInfo.module, functionInfo.name, repoRoot, 0, maxDepth);
        const systems = inferSystems(route.endpoint, calls);
        const description = buildBusinessDescription(route, functionInfo, calls, systems);
        endpoints.push({
          id: `${toPosix(path.relative(repoRoot, moduleInfo.file))}::${route.method} ${route.endpoint}`,
          name: readableName(functionInfo.name),
          method: route.method,
          endpoint: route.endpoint,
          api_file: toPosix(path.relative(repoRoot, moduleInfo.file)),
          handler: functionInfo.name,
          systems,
          trigger: description.trigger,
          description: description.description,
          logic_summary: description.logic_summary,
          calls,
        });
      }
    }
  }
  return endpoints;
}

function parseArgs(argv) {
  const args = { repoRoot: process.cwd(), maxDepth: 3, limit: 0 };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--repo-root") args.repoRoot = path.resolve(argv[++i]);
    else if (arg === "--max-depth") args.maxDepth = Number(argv[++i] || 3);
    else if (arg === "--limit") args.limit = Number(argv[++i] || 0);
  }
  return args;
}

const args = parseArgs(process.argv);
let endpoints = analyze(path.resolve(args.repoRoot), args.maxDepth);
if (args.limit > 0) endpoints = endpoints.slice(0, args.limit);
console.log(JSON.stringify(endpoints, null, 2));
