const fs = require("fs");
const path = require("path");

// Helper to capitalize strings for display names (e.g., "dark_oak" -> "Dark Oak")
function capitalize(str) {
    return str
        .split("_")
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ");
}

// Common permutations for all wood/log/stem blocks, taken from your examples.
const permutations = [
    // Facing north
    {
        condition: "q.block_state('minecraft:block_face') == 'north'",
        components: { "minecraft:transformation": { rotation: [90, 0, 0] } },
    },
    // Facing west
    {
        condition: "q.block_state('minecraft:block_face') == 'west'",
        components: { "minecraft:transformation": { rotation: [0, 0, -90] } },
    },
    // Facing south
    {
        condition: "q.block_state('minecraft:block_face') == 'south'",
        components: { "minecraft:transformation": { rotation: [-90, 0, 0] } },
    },
    // Facing east
    {
        condition: "q.block_state('minecraft:block_face') == 'east'",
        components: { "minecraft:transformation": { rotation: [0, 0, 90] } },
    },
    // Facing up/down
    {
        condition: "q.block_state('minecraft:block_face') == 'up' || q.block_state('minecraft:block_face') == 'down'",
        components: { "minecraft:transformation": { rotation: [0, -90, 0] } },
    },
    {
        condition: "q.block_state('es:fake_block_on') == true",
        components: { "minecraft:collision_box": true },
    },
    {
        condition: "q.block_state('es:fake_block_on') == false",
        components: { "minecraft:collision_box": false },
    }
];

// Template for log/stem blocks (with top/bottom textures)
function getLogBlockJson(woodName, logSuffix, prefix) {
    const textureBase = `${prefix}${woodName}_${logSuffix}`;
    return {
        format_version: "1.21.130",
        "minecraft:block": {
            description: {
                identifier: `es:fake_${prefix}${woodName}_${logSuffix}`,
                menu_category: { category: "construction" },
                traits: {
                    "minecraft:placement_position": { enabled_states: ["minecraft:block_face"] },
                },
                states: {
                    "es:fake_block_on": [false, true]
                }
            },
            components: {
                "minecraft:geometry": "minecraft:geometry.full_block",
                "minecraft:material_instances": {
                    "*": { render_method: "alpha_test_single_sided", texture: `${textureBase}_side`, ambient_occlusion: true, face_dimming: true },
                    up: { render_method: "alpha_test_single_sided", texture: `${textureBase}_top`, ambient_occlusion: true, face_dimming: true },
                    down: { render_method: "alpha_test_single_sided", texture: `${textureBase}_top`, ambient_occlusion: true, face_dimming: true },
                },
                "minecraft:light_dampening": 15,
                "minecraft:redstone_conductivity": {
                    allows_wire_to_step_down: true,
                    redstone_conductor: true,
                },
                "minecraft:selection_box": true,
                "es:fake_block": {},
                "minecraft:destructible_by_mining": {
                    seconds_to_destroy: 1,
                },
                "minecraft:tick": {
                    interval_range: [20, 20],
                    looping: true,
                },
                "tag:minecraft:is_axe_item_destructible": {},
                "minecraft:display_name": `Fake ${capitalize(prefix)}${capitalize(woodName)} ${capitalize(logSuffix)}`,
            },
            permutations: permutations,
        },
    };
}

// Template for wood/hyphae blocks (bark on all sides)
function getWoodBlockJson(woodName, woodSuffix, logSuffix, prefix) {
    const sideTexture = `${prefix}${woodName}_${logSuffix}_side`;
    return {
        format_version: "1.21.130",
        "minecraft:block": {
            description: {
                identifier: `es:fake_${prefix}${woodName}_${woodSuffix}`,
                menu_category: { category: "construction" },
                traits: {
                    "minecraft:placement_position": { enabled_states: ["minecraft:block_face"] },
                },
                states: {
                    "es:fake_block_on": [false, true]
                }
            },
            components: {
                "minecraft:geometry": "minecraft:geometry.full_block",
                "minecraft:material_instances": {
                    "*": { render_method: "alpha_test_single_sided", texture: sideTexture, ambient_occlusion: true, face_dimming: true },
                },
                "minecraft:light_dampening": 15,
                "minecraft:redstone_conductivity": {
                    allows_wire_to_step_down: true,
                    redstone_conductor: true,
                },
                "minecraft:selection_box": true,
                "es:fake_block": {},
                "minecraft:destructible_by_mining": {
                    seconds_to_destroy: 1,
                },
                "minecraft:tick": {
                    interval_range: [20, 20],
                    looping: true,
                },
                "tag:minecraft:is_axe_item_destructible": {},
                "minecraft:display_name": `Fake ${capitalize(prefix)}${capitalize(woodName)} ${capitalize(woodSuffix)}`,
            },
            permutations: permutations,
        },
    };
}

function getPlanksBlockJson(woodName, logSuffix) {
    const sideTexture = `${woodName}_${logSuffix}`;
    return {
        format_version: "1.21.130",
        "minecraft:block": {
            description: {
                identifier: `es:fake_${woodName}_${logSuffix}`,
                menu_category: { category: "construction" },
                states: {
                    "es:fake_block_on": [false, true]
                }
            },
            components: {
                "minecraft:geometry": "minecraft:geometry.full_block",
                "minecraft:material_instances": {
                    "*": { render_method: "alpha_test_single_sided", texture: sideTexture, ambient_occlusion: true, face_dimming: true },
                },
                "minecraft:light_dampening": 15,
                "minecraft:redstone_conductivity": {
                    allows_wire_to_step_down: true,
                    redstone_conductor: true,
                },
                "minecraft:selection_box": true,
                "es:fake_block": {},
                "minecraft:destructible_by_mining": {
                    seconds_to_destroy: 1,
                },
                "minecraft:tick": {
                    interval_range: [20, 20],
                    looping: true,
                },
                "tag:minecraft:is_axe_item_destructible": {},
                "minecraft:display_name": `Fake ${capitalize(woodName)} ${capitalize(logSuffix)}`,
            },
            permutations: permutations.filter(p => p.condition.includes("es:fake_block_on")), // Planks don't need up/down rotations
        },
    };
}

// List of wood types to generate files for
const woodTypes = [
    { prefix: "stripped_", name: "oak", logSuffix: "log", woodSuffix: "wood" },
    { prefix: "stripped_", name: "spruce", logSuffix: "log", woodSuffix: "wood" },
    { prefix: "stripped_", name: "birch", logSuffix: "log", woodSuffix: "wood" },
    { prefix: "stripped_", name: "jungle", logSuffix: "log", woodSuffix: "wood" },
    { prefix: "stripped_", name: "acacia", logSuffix: "log", woodSuffix: "wood" },
    { prefix: "stripped_", name: "dark_oak", logSuffix: "log", woodSuffix: "wood" },
    { prefix: "stripped_", name: "mangrove", logSuffix: "log", woodSuffix: "wood" },
    { prefix: "stripped_", name: "cherry", logSuffix: "log", woodSuffix: "wood" },
    { prefix: "stripped_", name: "pale_oak", logSuffix: "log", woodSuffix: "wood" },
    { prefix: "stripped_", name: "crimson", logSuffix: "stem", woodSuffix: "hyphae" },
    { prefix: "stripped_", name: "warped", logSuffix: "stem", woodSuffix: "hyphae" },
    { prefix: "", name: "oak", logSuffix: "log", woodSuffix: "wood" },
    { prefix: "", name: "spruce", logSuffix: "log", woodSuffix: "wood" },
    { prefix: "", name: "birch", logSuffix: "log", woodSuffix: "wood" },
    { prefix: "", name: "jungle", logSuffix: "log", woodSuffix: "wood" },
    { prefix: "", name: "acacia", logSuffix: "log", woodSuffix: "wood" },
    { prefix: "", name: "dark_oak", logSuffix: "log", woodSuffix: "wood" },
    { prefix: "", name: "mangrove", logSuffix: "log", woodSuffix: "wood" },
    { prefix: "", name: "cherry", logSuffix: "log", woodSuffix: "wood" },
    { prefix: "", name: "pale_oak", logSuffix: "log", woodSuffix: "wood" },
    { prefix: "", name: "crimson", logSuffix: "log", woodSuffix: "hyphae" },
    { prefix: "", name: "warped", logSuffix: "stem", woodSuffix: "hyphae" },
];

const plankTypes = [
    { name: "oak", logSuffix: "planks" },
    { name: "spruce", logSuffix: "planks" },
    { name: "birch", logSuffix: "planks" },
    { name: "jungle", logSuffix: "planks" },
    { name: "acacia", logSuffix: "planks" },
    { name: "dark_oak", logSuffix: "planks" },
    { name: "mangrove", logSuffix: "planks" },
    { name: "cherry", logSuffix: "planks" },
    { name: "pale_oak", logSuffix: "planks" },
    { name: "crimson", logSuffix: "planks" },
    { name: "warped", logSuffix: "planks" },
    { name: "bamboo", logSuffix: "planks" },
    { name: "bamboo", logSuffix: "mosaic" },
];

function generateWoodFiles() {
    const woodBaseDir = path.resolve(__dirname, "blocks/fake/wood");
    const logBaseDir = path.resolve(__dirname, "blocks/fake/log");

    // Ensure base dirs exist
    if (!fs.existsSync(woodBaseDir)) fs.mkdirSync(woodBaseDir, { recursive: true });
    if (!fs.existsSync(logBaseDir)) fs.mkdirSync(logBaseDir, { recursive: true });

    woodTypes.forEach(({ prefix, name, logSuffix, woodSuffix }) => {
        const isStripped = prefix === "stripped_";
        const woodOutDir = isStripped ? path.join(woodBaseDir, "stripped") : woodBaseDir;
        const logOutDir = isStripped ? path.join(logBaseDir, "stripped") : logBaseDir;

        if (!fs.existsSync(woodOutDir)) fs.mkdirSync(woodOutDir, { recursive: true });
        if (!fs.existsSync(logOutDir)) fs.mkdirSync(logOutDir, { recursive: true });

        const logJson = getLogBlockJson(name, logSuffix, prefix);
        fs.writeFileSync(path.join(logOutDir, `${prefix}${name}_${logSuffix}.block.json`), JSON.stringify(logJson, null, 4));

        const woodJson = getWoodBlockJson(name, woodSuffix, logSuffix, prefix);
        fs.writeFileSync(path.join(woodOutDir, `${prefix}${name}_${woodSuffix}.block.json`), JSON.stringify(woodJson, null, 4));
    });

    console.log(`Generation complete!\nWood saved in: ${woodBaseDir}\nLog saved in: ${logBaseDir}`);
}

function generatePlanksFiles() {
    const outputDir = path.resolve(__dirname, "blocks/fake/planks");
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

    plankTypes.forEach(({ name, logSuffix }) => {
        const woodJson = getPlanksBlockJson(name, logSuffix);
        fs.writeFileSync(path.join(outputDir, `${name}_${logSuffix}.block.json`), JSON.stringify(woodJson, null, 4));
    });

    console.log(`Generation complete! All files saved in:\n${outputDir}`);
}

generatePlanksFiles();
generateWoodFiles();
