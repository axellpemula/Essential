import { world, system } from "@minecraft/server";
import { Module, moduleManager } from "../mainCore.js";

class OreHighlightModule extends Module {
    constructor() {
        super(
            "Ore Highlight Ping",
            "Briefly highlights nearby ores of the same type when you mine one.",
            "Helps you find the rest of an ore vein. Has a cooldown to prevent spam.",
            true, // isHeavy
            "textures/ui/ore_highlight.png",
        );

        this.settings = {
            highlightRadius: {
                type: "slider",
                label: "Highlight Radius",
                min: 2,
                max: 16,
                step: 1,
                tooltip: "How many blocks away to check for similar ores.",
            },
            cooldown: {
                type: "slider",
                label: "Cooldown (seconds)",
                min: 1,
                max: 60,
                step: 1,
                tooltip: "The time a player must wait before triggering another highlight.",
            },
            style: {
                type: "dropdown",
                label: "Highlight Style",
                options: ["Box", "Ore", "Outline"],
                tooltip: "The visual style used to highlight ores.",
            },
        };

        this.isEnabled = false;
        this.highlightRadius = 8; // Default value
        this.cooldown = 10; // Default value in seconds
        this.style = 0; // Default highlight style
        this.playerCooldowns = new Map(); // Map<playerId, timestamp>

        this.breakPriority = -9; // Run after everything else
    }
    /**
     *
     * @param {import("@minecraft/server").PlayerBreakBlockBeforeEvent} event
     * @returns
     */
    onPlayerBreak(event) {
        const { player, block } = event;
        const blockTypeId = block.typeId?.replace("lit_", "");

        if (!blockTypeId.includes("ore") && !blockTypeId.includes("ancient_debris") && !blockTypeId.includes("quartz_ore")) return;

        const now = Date.now();
        const lastPing = this.playerCooldowns.get(player.id) || 0;

        if (now - lastPing < this.cooldown * 1000) return;
        event.handled = true;

        this.playerCooldowns.set(player.id, now);

        const dimension = player.dimension;
        const center = block.location;

        system.run(() => {
            for (let x = -this.highlightRadius; x <= this.highlightRadius; x++) {
                for (let y = -this.highlightRadius; y <= this.highlightRadius; y++) {
                    for (let z = -this.highlightRadius; z <= this.highlightRadius; z++) {
                        const checkLocation = { x: center.x + x, y: center.y + y, z: center.z + z };
                        try {
                            let foundBlock = dimension.getBlock(checkLocation);
                            if (foundBlock?.typeId?.replace("lit_", "") === blockTypeId?.replace("lit_", "")) {
                                let loc = CTsAPI.vector.add(foundBlock.center(), { x: 0, y: -0.5, z: 0 });
                                let entity = dimension.spawnEntity("es:glowblock", loc);
                                if (this.style === 0) {
                                    entity.setProperty("es:glow_type", "box");
                                    entity.setProperty("es:color_index", this.blockColor(blockTypeId));
                                } else if (this.style === 1) {
                                    entity.setProperty("es:glow_type", "ore");
                                    entity.setProperty("es:ore_index", this.oreColor(blockTypeId));
                                } else if (this.style === 2) {
                                    entity.setProperty("es:glow_type", "outline");
                                    entity.setProperty("es:color_index", this.blockColor(blockTypeId));
                                }
                                entity.addEffect("invisibility", this.cooldown * 20, { showParticles: false });
                                system.runTimeout(() => {
                                    if (entity.isValid) entity.remove();
                                }, this.cooldown * 20);
                            }
                        } catch (e) {}
                    }
                }
            }
        });
    }
    onUnload() {
        console.warn("OreHighlightModule unloaded. Clearing cooldowns.");
        this.playerCooldowns.clear();
        //removing the entities
        for (const dimension of this.getDimensions()) {
            for (const entity of world.getDimension(dimension).getEntities({ type: "es:glowblock" })) {
                entity.remove();
            }
        }
    }
    oreColor(blockTypeId) {
        let oreColors = {
            "minecraft:ancient_debris": 0,
            "minecraft:coal_ore": 1,
            "minecraft:deepslate_coal_ore": 2,
            "minecraft:iron_ore": 3,
            "minecraft:deepslate_iron_ore": 4,
            "minecraft:gold_ore": 5,
            "minecraft:deepslate_gold_ore": 6,
            "minecraft:diamond_ore": 7,
            "minecraft:deepslate_diamond_ore": 8,
            "minecraft:emerald_ore": 9,
            "minecraft:deepslate_emerald_ore": 10,
            "minecraft:lapis_ore": 11,
            "minecraft:deepslate_lapis_ore": 12,
            "minecraft:redstone_ore": 13,
            "minecraft:deepslate_redstone_ore": 14,
            "minecraft:nether_quartz_ore": 15,
            "minecraft:copper_ore": 16,
            "minecraft:deepslate_copper_ore": 17,
            "minecraft:nether_gold_ore": 18,
        };

        return oreColors[blockTypeId?.replace("lit_", "")] || 0;
    }
    blockColor(blockTypeId) {
        const colorMap = {
            "minecraft:nether_gold_ore": 4, // Using gold color
            "minecraft:quartz_ore": 0,
            "minecraft:ancient_debris": 9,
            "minecraft:coal_ore": 8,
            "minecraft:deepslate_coal_ore": 8,
            "minecraft:iron_ore": 3,
            "minecraft:deepslate_iron_ore": 3,
            "minecraft:gold_ore": 4,
            "minecraft:deepslate_gold_ore": 4,
            "minecraft:diamond_ore": 5,
            "minecraft:deepslate_diamond_ore": 5,
            "minecraft:emerald_ore": 1,
            "minecraft:deepslate_emerald_ore": 1,
            "minecraft:redstone_ore": 7,
            "minecraft:deepslate_redstone_ore": 7,
            "minecraft:lapis_ore": 6,
            "minecraft:deepslate_lapis_ore": 6,
            "minecraft:copper_ore": 2,
            "minecraft:deepslate_copper_ore": 2,
        };
        return colorMap[blockTypeId?.replace("lit_", "")] || 0;
    }
    getDimensions() {
        return ["overworld", "nether", "the_end"];
    }
}

moduleManager.registerModule(new OreHighlightModule());
