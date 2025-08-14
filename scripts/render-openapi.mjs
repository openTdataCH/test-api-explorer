import fs from "fs";
import fse from "fs-extra";
import path from "path";
import dotenv from "dotenv";

const args = Object.fromEntries(
  process.argv.slice(2).map(a => {
    const [k, v] = a.startsWith("--") ? a.slice(2).split("=") : [a, true];
    return [k, v ?? true];
  })
);

const api = args.api;
if (!api) {
  console.error("Usage: npm run build:api -- --api api1");
  process.exit(1);
}

// 1) Load .env then .env.local (override)
const envOrder = [".env", ".env.local"];
const merged = {};
for (const file of envOrder) {
  if (fs.existsSync(file)) {
    const parsed = dotenv.parse(fs.readFileSync(file));
    Object.assign(merged, parsed); // later files override earlier ones
  }
}
// also allow real environment to override (useful in CI)
for (const [k, v] of Object.entries(process.env)) {
  if (k && v != null) merged[k] = v;
}

// 2) Helper: resolve ${VAR} with per-API fallback:
function resolveVar(name) {
  if (name === 'API_KEY') {
    const key = (() => {
      if (api === 'ojp1.0') {
        return 'API_KEY_OJP1';
      }

      if (api === 'ojp2.0') {
        return 'API_KEY_OJP2';
      }

      throw new Error(`Missing env var for ${api}: no map/resolver for API_KEY`);
    })();

    const value = merged[key] ?? null;

    if (value === null) {
      throw new Error(`Missing env var for ${api}: cant find ${key} in .env file`);    
    }

    return value;
  }

  throw new Error(`Missing env var for ${api}: cant resolve placeholder ${name}`);
}

// 3) Do ${VAR} substitutions in the YAML
function substitute(text) {
  return text.replace(/\$\{([A-Z0-9_]+)\}/g, (_, name) => String(resolveVar(name)));
}

// 4) Paths
const srcTemplate = path.join("openapi", api, "openapi.template.yaml");
const outDir = path.join("dist", api);
const outSpec = path.join(outDir, "openapi.yaml");
const swaggerHtmlSrc = path.join("site", "swagger.html");
const swaggerHtmlOut = path.join(outDir, "index.html");

// 5) Build
await fse.ensureDir(outDir);

if (!fs.existsSync(srcTemplate)) {
  throw new Error(`Template not found: ${srcTemplate}`);
}
const yaml = await fse.readFile(srcTemplate, "utf8");
await fse.writeFile(outSpec, substitute(yaml), "utf8");

if (!fs.existsSync(swaggerHtmlSrc)) {
  throw new Error(`Swagger HTML not found: ${swaggerHtmlSrc}`);
}
await fse.copy(swaggerHtmlSrc, swaggerHtmlOut);

console.log(`Built ${api} → ${outSpec} + ${swaggerHtmlOut}`);
