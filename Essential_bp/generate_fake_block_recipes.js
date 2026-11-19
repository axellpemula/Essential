// Auto-generate shaped crafting recipes for all fake blocks
// found under blocks/fake/* by mirroring the example pattern.
// Usage:
//   node generate_fake_block_recipes.js [--overwrite]
// If --overwrite is passed, existing recipe files will be replaced.

const fs = require("fs");
const path = require("path");

const BEHAVIOR_ROOT = __dirname;
const FAKE_BLOCKS_DIR = path.join(BEHAVIOR_ROOT, "blocks", "fake");
const RECIPES_DIR = path.join(BEHAVIOR_ROOT, "recipes/blocks");
const OVERWRITE = process.argv.includes("--overwrite");

// Known exceptions or renames to vanilla item ids.
const ITEM_ID_OVERRIDES = new Map([
    ["crimson_log", "minecraft:crimson_stem"],
    ["snow", "minecraft:snow"],
    ["stone_bricks", "minecraft:stone_bricks"],
    ["mossy_cobblestone", "minecraft:mossy_cobblestone"],
    ["grass_block", "minecraft:grass_block"],
    ["clay", "minecraft:clay"],
    ["stone", "minecraft:stone"],
    ["cobblestone", "minecraft:cobblestone"],
    ["sand", "minecraft:sand"],
    ["gravel", "minecraft:gravel"],
    // hyphae and stems (kept as-is)
    ["warped_stem", "minecraft:warped_stem"],
    ["crimson_stem", "minecraft:crimson_stem"],
    ["warped_hyphae", "minecraft:warped_hyphae"],
    ["crimson_hyphae", "minecraft:crimson_hyphae"],
]);

// Extract identifier reliably even if JSONC-style comments are present.
function extractIdentifier(jsonText) {
    const m = jsonText.match(/"identifier"\s*:\s*"([^"]+)"/);
    return m ? m[1] : null;
}

function readJsonSafe(filePath) {
    const text = fs.readFileSync(filePath, "utf8");
    return { text, identifier: extractIdentifier(text) };
}

function ensureDir(dir) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function vanillaItemIdFromBase(baseName) {
    if (ITEM_ID_OVERRIDES.has(baseName)) return ITEM_ID_OVERRIDES.get(baseName);
    return `minecraft:${baseName}`;
}

function makeRecipeJson(identifier, baseItemId) {
    return {
        format_version: "1.21.130",
        "minecraft:recipe_shaped": {
            description: { identifier },
            tags: ["fake_blocks"],
            pattern: ["bg"],
            key: {
                g: { item: "minecraft:glass_pane" },
                b: { item: baseItemId },
            },
            unlock: { context: "AlwaysUnlocked" },
            result: { item: identifier, count: 1 },
        },
    };
}

function recipeOutPath(fakeFile) {
    const baseName = path.basename(fakeFile, ".block.json");
    const relDir = path.relative(FAKE_BLOCKS_DIR, path.dirname(fakeFile));
    const outDir = path.join(RECIPES_DIR, relDir);
    ensureDir(outDir);
    return path.join(outDir, `${baseName}.recipe.json`);
}

function collectBlockFiles(dir) {
    const results = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) {
            results.push(...collectBlockFiles(full));
        } else if (e.isFile() && e.name.endsWith(".block.json")) {
            results.push(full);
        }
    }
    return results;
}

function baseNameFromFile(fakeFile) {
    return path.basename(fakeFile, ".block.json");
}

function main() {
    if (!fs.existsSync(FAKE_BLOCKS_DIR)) {
        console.error("Fake blocks folder not found:", FAKE_BLOCKS_DIR);
        process.exit(1);
    }

    ensureDir(RECIPES_DIR);

    const files = collectBlockFiles(FAKE_BLOCKS_DIR);
    let generated = 0;
    let skipped = 0;

    for (const fakeFile of files) {
        const { text, identifier } = readJsonSafe(fakeFile);
        if (!identifier) {
            console.warn("Skipped (no identifier):", fakeFile);
            skipped++;
            continue;
        }

        const baseName = baseNameFromFile(fakeFile);
        const baseItemId = vanillaItemIdFromBase(baseName);
        const outPath = recipeOutPath(fakeFile);

        if (!OVERWRITE && fs.existsSync(outPath)) {
            skipped++;
            continue;
        }

        const recipe = makeRecipeJson(identifier, baseItemId);
        fs.writeFileSync(outPath, JSON.stringify(recipe, null, 4));
        generated++;
    }

    console.log(`Generated: ${generated}, Skipped: ${skipped}`);
}

main();
