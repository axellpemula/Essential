import { system, world, EquipmentSlot } from "@minecraft/server";
import { Module, moduleManager } from "../mainCore.js";

class WAILA extends Module {
    constructor() {
        super(
            "WAILA",
            "Show the blocks or entities data on the screen when looking at them.",
            "What Am I Looking At: Displays information about the world directly on your screen.",
            true,
            "textures/ui/WAILA.png",
        );

        this.settings = {
            maxDistance: {
                type: "slider",
                label: "Max Distance",
                min: 5,
                max: 64,
                step: 1,
                tooltip: "The maximum distance to check for blocks and entities.",
            },
            showBlocks: {
                type: "toggle",
                label: "Show Block Info",
                tooltip: "Display information for the block you are looking at.",
            },
            showEntities: {
                type: "toggle",
                label: "Show Entity Info",
                tooltip: "Display information for the entity you are looking at.",
            },
            showPermutationInfo: {
                type: "toggle",
                label: "Show Block State Info",
                tooltip: "Display information about the block's current state (e.g. growth stage for crops, honey level for beehives).",
            },
            showHealth: {
                type: "toggle",
                label: "Show Entity Health",
                tooltip: "Display the health of entities you are looking at.",
            },
            disableAllEntityBlocksHint: {
                type: "toggle",
                label: "Disable All Hints",
                tooltip:
                    "Disable all block and entity hints, including health, food and tool info. This is useful if you only want to use the mod for its source display and not the hints.",
            },
            showFoodHints: {
                type: "toggle",
                label: "Show Entity Food Hints",
                tooltip: "Show hints for what food certain entities like (e.g. cows like wheat, pigs like carrots).",
            },
            showToolHints: {
                type: "toggle",
                label: "Show Block Tool Hints",
                tooltip: "Show hints for what tools are effective for breaking certain blocks (e.g. pickaxe for stone, axe for wood).",
            },
        };
        this.isEnabled = false;
        this.showHealth = false;
        this.showFoodHints = false;
        this.showPermutationInfo = false;
        this.showToolHints = false;
        this.maxDistance = 15;
        this.showBlocks = true;
        this.showEntities = true;
        this.disableAllEntityBlocksHint = false;
        this.blockToolCache = new Map();
        this.toolEmojiMap = {
            pickaxe: ["", "", "", "", "\uE904"], // Wood, Stone, Iron, Diamond, Netherite
            axe: ["", "", "", "", "\uE909"],
            shovel: [""],
            hoe: [""],
            sword: "",
            shears: "",
            brush: "",
            bucket: "",
            crops: "",
            breakable: "",
            notbreakable: "",
        };

        this.entityEmojiMap = {
            baby: "",
            tamed: "",
            trader: "",
            saddle: "",
            noSaddle: "",
            chest: "",
            container: "",
            effect: "",
            dyeable: "",
            seed: "",
            wheat: "",
            cactus: "",
            hay: "",
        };

        this.skipEntityTypes = new Set([
            "minecraft:arrow",
            "minecraft:spectral_arrow",
            "minecraft:trident",
            "minecraft:egg",
            "minecraft:snowball",
            "minecraft:ender_pearl",
            "minecraft:eye_of_ender_signal",
            "minecraft:fireball",
            "minecraft:small_fireball",
            "minecraft:wither_skull",
            "minecraft:wind_charge_projectile",
            "minecraft:potion",
            "minecraft:llama_spit",
            "minecraft:shulker_bullet",
            "minecraft:tnt",
            "minecraft:item",
            "minecraft:xp_orb",
            "minecraft:xp_bottle",
            "minecraft:fishing_hook",
            "minecraft:area_effect_cloud",
            "minecraft:chest_minecart",
        ]);

        this.blockNameOverrides = {
            "minecraft:wooden_door": "Oak Door",
            "minecraft:spruce_door": "Spruce Door",
            "minecraft:birch_door": "Birch Door",
            "minecraft:jungle_door": "Jungle Door",
            "minecraft:acacia_door": "Acacia Door",
            "minecraft:dark_oak_door": "Dark Oak Door",
            "minecraft:mangrove_door": "Mangrove Door",
            "minecraft:cherry_door": "Cherry Door",
            "minecraft:bamboo_door": "Bamboo Door",
            "minecraft:pale_oak_door": "Pale Oak Door",
            "minecraft:standing_sign": "Oak Sign",
            "minecraft:wall_sign": "Oak Sign (Wall)",
            "minecraft:lit_furnace": "Furnace (Lit)",
            "minecraft:lit_blast_furnace": "Blast Furnace (Lit)",
            "minecraft:lit_smoker": "Smoker (Lit)",
            "minecraft:lit_redstone_lamp": "Redstone Lamp (On)",
            "minecraft:lit_redstone_ore": "Redstone Ore (Lit)",
            "minecraft:lit_deepslate_redstone_ore": "Deepslate Redstone Ore (Lit)",
            "minecraft:seagrass": "Seagrass",
            "minecraft:reeds": "Sugar Cane",
            "minecraft:brewing_stand": "Brewing Stand",
            "minecraft:frame": "Item Frame",
            "minecraft:glow_frame": "Glow Item Frame",
        };

        this.entityFoodHints = [
            { targets: ["minecraft:cow", "minecraft:mooshroom", "minecraft:sheep", "minecraft:goat"], label: "Wheat", emoji: "\uE00A", emojiKey: "wheat" },
            { targets: ["minecraft:pig"], label: "Carrot/Potato", emoji: "\uE00B" },
            { targets: ["minecraft:chicken", "minecraft:parrot"], label: "Seeds", emoji: "\uE00C", emojiKey: "seed" },
            { targets: ["minecraft:horse", "minecraft:donkey", "minecraft:mule"], label: "Golden Apple", emoji: "\uE00D" },
            { targets: ["minecraft:cat", "minecraft:ocelot"], label: "Raw Fish", emoji: "\uE00E" },
            { targets: ["minecraft:llama", "minecraft:trader_llama"], label: "Hay Bale", emoji: "", emojiKey: "hay" },
            { targets: ["minecraft:wolf"], label: "Raw Meat", emoji: "\uE010" },
            { targets: ["minecraft:bee", "minecraft:rabbit"], label: "Flowers", emoji: "\uE011" },
            { targets: ["minecraft:hoglin"], label: "Crimson Fungus", emoji: "\uE012" },
            { targets: ["minecraft:strider"], label: "Warped Fungus", emoji: "\uE013" },
            { targets: ["minecraft:frog"], label: "Slimeball", emoji: "\uE014" },
            { targets: ["minecraft:camel"], label: "Cactus", emoji: "", emojiKey: "cactus" },
            { targets: ["minecraft:sniffer"], label: "Torchflower", emoji: "\uE016" },
            { targets: ["minecraft:armadillo"], label: "Spider Eye", emoji: "\uE017" },
            { targets: ["minecraft:axolotl"], label: "Tropical Fish", emoji: "\uE018" },
            { targets: ["minecraft:panda"], label: "Bamboo", emoji: "\uE019" },
            { targets: ["minecraft:polar_bear"], label: "Fish", emoji: "\uE01A" },
            { targets: ["minecraft:turtle"], label: "Seagrass", emoji: "\uE01B" },
            { targets: ["minecraft:fox"], label: "Sweet Berries", emoji: "\uE01C" },
        ];
    }

    tick() {
        if (!this.isEnabled || system.currentTick % 3 !== 0) return;

        for (const player of world.getPlayers()) {
            const entityHitResult = this.showEntities ? player.getEntitiesFromViewDirection({ maxDistance: this.maxDistance })[0] : undefined;
            const blockHitResult = this.showBlocks ? player.getBlockFromViewDirection({ maxDistance: this.maxDistance, includeLiquidBlocks: true }) : undefined;
            let inv = player.getComponent("inventory").container;
            let itemStack = inv.getItem(player.selectedSlotIndex);
            let message = "";
            const entityHit = entityHitResult?.entity?.isValid ? entityHitResult : undefined;
            const blockHit = blockHitResult?.block && !blockHitResult.block.isAir ? blockHitResult : undefined;

            if (entityHit && blockHit) {
                const blockDistance = CTsAPI.vector.distance(player.getHeadLocation(), blockHit.block.center());
                if (entityHit.distance < blockDistance) {
                    message = this.getEntityInfo(entityHit.entity);
                } else {
                    message = this.getBlockInfo(blockHit.block, itemStack);
                }
            } else if (entityHit) {
                message = this.getEntityInfo(entityHit.entity);
            } else if (blockHit) {
                message = this.getBlockInfo(blockHit.block, itemStack);
            }

            if (message) {
                player.onScreenDisplay.setActionBar(message);
            }
        }
    }

    getEntityInfo(entity) {
        if (entity.typeId.startsWith("es:")) return "";
        if (this.skipEntityTypes.has(entity.typeId)) return "";

        const name = entity.nameTag || CTsAPI.utils.formatIdToText(entity.typeId);
        const source = CTsAPI.utils.getSourceFromId(entity.typeId);
        let healthInfo = "";
        let extraInfo = "";
        let armorInfo = "";
        const health = entity.getComponent("health");
        if (health && this.showHealth && !this.disableAllEntityBlocksHint) {
            const currentHealth = Math.ceil(health.currentValue);
            const maxHealth = health.effectiveMax;
            if (maxHealth > 40) {
                healthInfo = `\n§c${currentHealth} / ${maxHealth} `;
            } else {
                const maxHearts = Math.ceil(maxHealth / 2);
                const fullHearts = Math.floor(currentHealth / 2);
                const halfHeart = currentHealth % 2 === 1;
                let hearts = "".repeat(fullHearts); // full heart
                if (halfHeart) {
                    hearts += ""; // half heart
                }
                const emptyHearts = maxHearts - fullHearts - (halfHeart ? 1 : 0);
                if (emptyHearts > 0) {
                    hearts += "".repeat(emptyHearts); // empty heart
                }
                healthInfo = `\n${hearts}`;
            }
        }

        if (entity.typeId === "minecraft:villager" || entity.typeId === "minecraft:villager_v2") {
            const variantComp = entity.getComponent("minecraft:variant");
            if (variantComp) {
                const professionId = variantComp.value;
                const professionNames = [
                    "Farmer",
                    "Fisherman",
                    "Shepherd",
                    "Fletcher",
                    "Librarian",
                    "Cartographer",
                    "Cleric",
                    "Armorer",
                    "Weaponsmith",
                    "Toolsmith",
                    "Butcher",
                    "Leatherworker",
                    "Stone Mason",
                    "Unemployed",
                    "Nitwit",
                ];
                const professionName = professionNames[professionId - 1] || "Unknown";
                extraInfo += `\n§e${this.entityEmojiMap.trader} ${professionName}`;
            }
        }

        const inventoryComp = entity.getComponent("inventory");
        if (inventoryComp) {
            const container = inventoryComp.container;
            let usedSlots = 0;
            for (let i = 0; i < container.size; i++) {
                if (container.getItem(i)) {
                    usedSlots++;
                }
            }
            if (container.size > 0) {
                extraInfo += `\n§6${this.entityEmojiMap.container} ${usedSlots} / ${container.size}`;
            }
        }

        const isBaby = entity.getComponent("minecraft:is_baby");
        if (isBaby) extraInfo += `\n§e${this.entityEmojiMap.baby} Baby`;

        const tameComp = entity.getComponent("minecraft:tameable");
        const isTamed = entity.getComponent("minecraft:is_tamed");
        if (isTamed) {
            const ownerName = entity.nameTag ? " (" + entity.nameTag + ")" : "";
            extraInfo += `\n§a${this.entityEmojiMap.tamed} Tamed${ownerName}`;
        } else if (tameComp) {
            extraInfo += `\n§eWild`;
        }

        const rideableTypes = [
            "minecraft:horse",
            "minecraft:donkey",
            "minecraft:mule",
            "minecraft:skeleton_horse",
            "minecraft:zombie_horse",
            "minecraft:camel",
            "minecraft:strider",
            "minecraft:pig",
        ];
        if (rideableTypes.includes(entity.typeId)) {
            const isSaddled = entity.getComponent("minecraft:equippable");
            if (isSaddled) {
                const saddle = isSaddled.getEquipment(EquipmentSlot.Saddle);
                extraInfo += saddle ? `\n§a${this.entityEmojiMap.saddle} Saddled` : `\n§7${this.entityEmojiMap.noSaddle} No Saddle`;
            }
        }

        const isChested = entity.getComponent("minecraft:is_chested");
        if (isChested) extraInfo += `\n§6${this.entityEmojiMap.chest} Chest`;

        if (entity.typeId === "minecraft:horse" || entity.typeId === "minecraft:donkey" || entity.typeId === "minecraft:mule") {
            const variantComp = entity.getComponent("minecraft:variant");
            const markingComp = entity.getComponent("minecraft:mark_variant");
            const horseColors = ["White", "Creamy", "Chestnut", "Brown", "Black", "Gray", "Dark Brown"];
            const horseMarkings = ["None", "White", "White Field", "White Dots", "Black Dots"];
            if (variantComp !== undefined) extraInfo += `\n§e${horseColors[variantComp.value] ?? "Unknown"}`;
            if (markingComp !== undefined && markingComp.value > 0) extraInfo += ` (${horseMarkings[markingComp.value] ?? ""})`;
        }

        if (entity.typeId === "minecraft:sheep") {
            const colorComp = entity.getComponent("minecraft:color");
            if (colorComp !== undefined) {
                const dyeNames = [
                    "White",
                    "Orange",
                    "Magenta",
                    "Light Blue",
                    "Yellow",
                    "Lime",
                    "Pink",
                    "Gray",
                    "Light Gray",
                    "Cyan",
                    "Purple",
                    "Blue",
                    "Brown",
                    "Green",
                    "Red",
                    "Black",
                ];
                extraInfo += `\n§e${this.entityEmojiMap.dyeable} ${dyeNames[colorComp.value] ?? ""} Wool`;
            }
        }

        if (entity.typeId === "minecraft:cat" || entity.typeId === "minecraft:wolf") {
            const variantComp = entity.getComponent("minecraft:variant");
            if (variantComp !== undefined) {
                const catTypes = ["Tabby", "Tuxedo", "Red", "Siamese", "British Shorthair", "Calico", "Persian", "Ragdoll", "White", "Jellie", "Black"];
                const wolfTypes = ["Pale", "Ashen", "Black", "Chestnut", "Rusty", "Snowy", "Spotted", "Striped", "Woods"];
                const names = entity.typeId === "minecraft:cat" ? catTypes : wolfTypes;
                extraInfo += `\n§e${names[variantComp.value] ?? ""}`;
            }
            const isTamedForCollar = entity.getComponent("minecraft:is_tamed");
            const collarColor = entity.getComponent("minecraft:color");
            if (isTamedForCollar && collarColor !== undefined) {
                const dyeNames = [
                    "White",
                    "Orange",
                    "Magenta",
                    "Light Blue",
                    "Yellow",
                    "Lime",
                    "Pink",
                    "Gray",
                    "Light Gray",
                    "Cyan",
                    "Purple",
                    "Blue",
                    "Brown",
                    "Green",
                    "Red",
                    "Black",
                ];
                extraInfo += `\n§e${this.entityEmojiMap.dyeable} ${dyeNames[collarColor.value] ?? ""} Collar`;
            }
        }

        if (entity.typeId === "minecraft:llama" || entity.typeId === "minecraft:trader_llama") {
            const carpetColor = entity.getComponent("minecraft:color");
            if (carpetColor !== undefined && carpetColor.value !== -1) {
                const dyeNames = [
                    "White",
                    "Orange",
                    "Magenta",
                    "Light Blue",
                    "Yellow",
                    "Lime",
                    "Pink",
                    "Gray",
                    "Light Gray",
                    "Cyan",
                    "Purple",
                    "Blue",
                    "Brown",
                    "Green",
                    "Red",
                    "Black",
                ];
                extraInfo += `\n§e${this.entityEmojiMap.dyeable} ${dyeNames[carpetColor.value] ?? ""} Carpet`;
            }
        }

        if (entity.typeId === "minecraft:slime" || entity.typeId === "minecraft:magma_cube") {
            const sizeComp = entity.getComponent("minecraft:variant");
            if (sizeComp !== undefined) {
                const sizeNames = ["Tiny", "Small", "Large"];
                extraInfo += `\n§e${sizeNames[sizeComp.value] ?? "Size " + sizeComp.value}`;
            }
        }

        if (this.showFoodHints && !this.disableAllEntityBlocksHint) {
            for (const hint of this.entityFoodHints) {
                if (hint.targets.includes(entity.typeId)) {
                    const icon = hint.emojiKey ? `${this.entityEmojiMap[hint.emojiKey]} ` : "";
                    extraInfo += `\n§b${icon}§f${hint.label}`;
                    break;
                }
            }
        }

        if (entity.typeId === "minecraft:frame" || entity.typeId === "minecraft:glow_frame") {
            const frameItem = entity.getComponent("minecraft:item")?.itemStack;
            if (frameItem) {
                const itemName = frameItem.nameTag || CTsAPI.utils.formatIdToText(frameItem.typeId);
                extraInfo += `\n§d§f${itemName}${frameItem.amount > 1 ? " x" + frameItem.amount : ""}`;
            } else {
                extraInfo += `\n§7Empty`;
            }
        }

        if (entity.typeId === "minecraft:creeper") {
            const isCharged = entity.getComponent("minecraft:is_charged");
            if (isCharged) {
                extraInfo += `\n§bCharged`;
            }
        }

        const angryComp = entity.getComponent("minecraft:angry");
        if (angryComp) extraInfo += `\n§cAngry`;

        const effects = entity.getEffects();
        if (effects.length > 0) {
            for (const effect of effects) {
                const effectName = CTsAPI.utils.formatIdToText(effect.typeId);
                const duration = Math.floor(effect.duration / 20);
                const amplifier = effect.amplifier;
                const level = amplifier > 0 ? ` ${amplifier + 1}` : "";
                const effectColor = effect.typeId.includes("harm") || effect.typeId.includes("poison") || effect.typeId.includes("wither") ? "§c" : "§b";
                extraInfo += `\n${effectColor}${this.entityEmojiMap.effect} ${effectName}${level} (${duration}s)`;
            }
        }

        if (!this.disableAllEntityBlocksHint) {
            armorInfo = this.getEntityArmorInfo(entity);
        }
        return `§f${name}${healthInfo}${armorInfo}${extraInfo}\n§9${source}`;
    }

    getEntityArmorInfo(entity) {
        const equippable = entity.getComponent("equippable");
        if (!equippable) return "";

        const armorValues = {
            "minecraft:leather_helmet": 1,
            "minecraft:leather_chestplate": 3,
            "minecraft:leather_leggings": 2,
            "minecraft:leather_boots": 1,
            "minecraft:chainmail_helmet": 2,
            "minecraft:chainmail_chestplate": 5,
            "minecraft:chainmail_leggings": 4,
            "minecraft:chainmail_boots": 1,
            "minecraft:iron_helmet": 2,
            "minecraft:iron_chestplate": 6,
            "minecraft:iron_leggings": 5,
            "minecraft:iron_boots": 2,
            "minecraft:golden_helmet": 2,
            "minecraft:golden_chestplate": 5,
            "minecraft:golden_leggings": 3,
            "minecraft:golden_boots": 1,
            "minecraft:diamond_helmet": 3,
            "minecraft:diamond_chestplate": 8,
            "minecraft:diamond_leggings": 6,
            "minecraft:diamond_boots": 3,
            "minecraft:netherite_helmet": 3,
            "minecraft:netherite_chestplate": 8,
            "minecraft:netherite_leggings": 6,
            "minecraft:netherite_boots": 3,
            "minecraft:turtle_helmet": 2,
        };

        let armorPoints = 0;
        const slots = [EquipmentSlot.Head, EquipmentSlot.Chest, EquipmentSlot.Legs, EquipmentSlot.Feet];
        for (const slot of slots) {
            const item = equippable.getEquipment(slot);
            if (item) {
                armorPoints += armorValues[item.typeId] || 0;
            }
        }
        if (armorPoints === 0) return "";

        const maxArmorIcons = 10;
        const fullArmorIcons = Math.floor(armorPoints / 2);
        const halfArmorIcon = armorPoints % 2 === 1;
        let armorBar = "§f" + "".repeat(fullArmorIcons); // full armor
        if (halfArmorIcon) {
            armorBar += ""; // half armor
        }
        const emptyArmorIcons = maxArmorIcons - fullArmorIcons - (halfArmorIcon ? 1 : 0);
        if (emptyArmorIcons > 0) {
            armorBar += "§7" + "".repeat(emptyArmorIcons); // empty armor
        }
        return `\n${armorBar}`;
    }

    getBlockInfo(block, itemStack) {
        const blockId = block.typeId;
        const name = this.blockNameOverrides[blockId] ?? CTsAPI.utils.formatIdToText(blockId);
        const source = CTsAPI.utils.getSourceFromId(blockId);
        const permutation = block.permutation;
        let extraInfo = "";

        const fillLevel = permutation.getState("fill_level");

        if (this.showPermutationInfo) {
            const growth = permutation.getState("growth");
            if (growth !== undefined) {
                const maxGrowth = 7;
                const growthPercent = Math.floor((growth / maxGrowth) * 100);
                extraInfo += `\n§aGrowth: ${growthPercent}%`;
            }

            const age = permutation.getState("age");
            if (age !== undefined && blockId.includes("sapling")) {
                extraInfo += `\n§aGrowth Stage: ${age}`;
            }

            const honeyLevel = permutation.getState("honey_level");
            if (honeyLevel !== undefined) {
                extraInfo += `\n§eHoney Level: ${honeyLevel}/5`;
            }

            const composterFillLevel = permutation.getState("composter_fill_level");
            if (composterFillLevel) {
                const fillPercent = Math.floor((composterFillLevel / 8) * 100);
                extraInfo += `\n§aCompost: ${fillPercent}%`;
            }

            if (fillLevel && !blockId.includes("cauldron")) {
                extraInfo += `\n§9Water Level: ${fillLevel}/6`;
            }

            const moisture = permutation.getState("moisturized_amount");
            if (moisture !== undefined && blockId === "minecraft:farmland") {
                extraInfo += `\n§9Moisture: ${moisture}/7`;
            }
        }

        const power = block.getRedstonePower();
        if (power !== undefined && power > 0) {
            extraInfo += `\n§cRedstone Power: ${power}`;
        }

        const inventoryComp = block.getComponent("inventory");
        if (inventoryComp) {
            const container = inventoryComp.container;
            if (container.size > 0) {
                let usedSlots = 0;
                for (let i = 0; i < container.size; i++) {
                    if (container.getItem(i)) {
                        usedSlots++;
                    }
                }
                extraInfo += `\n§6${this.entityEmojiMap.chest} ${usedSlots} / ${container.size}`;
            }
        }

        if (
            blockId === "minecraft:lit_furnace" ||
            blockId === "minecraft:furnace" ||
            blockId === "minecraft:lit_smoker" ||
            blockId === "minecraft:smoker" ||
            blockId === "minecraft:lit_blast_furnace" ||
            blockId === "minecraft:blast_furnace"
        ) {
            const furnaceInv = block.getComponent("inventory")?.container;
            if (furnaceInv) {
                const input = furnaceInv.getItem(0);
                const fuel = furnaceInv.getItem(1);
                const output = furnaceInv.getItem(2);
                if (input) extraInfo += `\n§7Smelting: §f${input.nameTag || CTsAPI.utils.formatIdToText(input.typeId)}`;
                if (fuel) extraInfo += `\n§cFuel: §f${fuel.nameTag || CTsAPI.utils.formatIdToText(fuel.typeId)}`;
                if (output) extraInfo += `\n§aOutput: §f${output.nameTag || CTsAPI.utils.formatIdToText(output.typeId)}`;
            }
        }

        if (this.showPermutationInfo) {
            if (fillLevel !== undefined && blockId.includes("cauldron")) {
                extraInfo += `\n§9Cauldron: ${fillLevel}/6`;
            }

            if (blockId === "minecraft:beehive" || blockId === "minecraft:bee_nest") {
                const beeCount = permutation.getState("bee_count");
                if (beeCount !== undefined) extraInfo += `\n§eBees: ${beeCount}/3`;
            }

            const bitesLeft = permutation.getState("bite_counter");
            if (bitesLeft !== undefined) {
                extraInfo += `\n§eSlices Left: ${7 - bitesLeft}/7`;
            }

            const candleCount = permutation.getState("candles");
            if (candleCount !== undefined) {
                extraInfo += `\n§eCandles: ${candleCount + 1}/4`;
            }

            const repeaterDelay = permutation.getState("repeater_delay");
            if (repeaterDelay !== undefined) {
                extraInfo += `\n§cDelay: ${repeaterDelay + 1} tick${repeaterDelay > 0 ? "s" : ""}`;
            }

            const handledStates = new Set([
                "growth",
                "age",
                "honey_level",
                "composter_fill_level",
                "fill_level",
                "moisturized_amount",
                "bee_count",
                "bite_counter",
                "candles",
                "repeater_delay",
            ]);
            let color = "§8";
            const allStates = permutation.getAllStates();
            for (const [key, value] of Object.entries(allStates)) {
                if (!handledStates.has(key)) {
                    if (typeof value === "number") {
                        color = "§3";
                    } else if (typeof value === "boolean") {
                        color = value ? "§a" : "§c";
                    } else if (typeof value === "string") {
                        color = "§e";
                    }
                    extraInfo += `\n§7${key.split(":")[1] || key}: ${color}${value}`;
                }
            }
        }

        const signComp = block.getComponent("sign");
        if (signComp) {
            const text = signComp.getText().trim();
            if (text) {
                extraInfo += `\n§7Sign: §f"${text.replace(/\n/g, " ")}"`;
            }
        }

        const lecternInv = block.typeId === "minecraft:lectern" ? block.getComponent("inventory")?.container : undefined;
        if (lecternInv?.getItem(0)) {
            const book = lecternInv.getItem(0);
            extraInfo += `\n§dBook: ${book.nameTag || CTsAPI.utils.formatIdToText(book.typeId)}`;
        }

        let displayToolInfo = "";
        if (this.showToolHints && !this.disableAllEntityBlocksHint) {
            let toolData;
            if (this.blockToolCache.has(blockId)) {
                toolData = this.blockToolCache.get(blockId);
            } else {
                toolData = { emoji: "", toolType: null, requiredTier: 0 };
                const blockTags = permutation.getTags();
                if (blockTags.includes("minecraft:crop") || blockTags.includes("plant")) {
                    toolData = { emoji: ` ${this.toolEmojiMap.crops}`, toolType: "crops", requiredTier: 0 };
                } else if (blockId === "minecraft:suspicious_sand" || blockId === "minecraft:suspicious_gravel") {
                    toolData = { emoji: ` ${this.toolEmojiMap.brush}`, toolType: "brush", requiredTier: 0 };
                } else if (
                    blockId === "minecraft:water" ||
                    blockId === "minecraft:flowing_water" ||
                    blockId === "minecraft:lava" ||
                    blockId === "minecraft:flowing_lava" ||
                    blockId === "minecraft:powder_snow"
                ) {
                    toolData = { emoji: ` ${this.toolEmojiMap.bucket}`, toolType: "bucket", requiredTier: 0 };
                } else if (
                    blockTags.includes("minecraft:is_shears_item_destructible") &&
                    !blockTags.includes("minecraft:is_pickaxe_item_destructible") &&
                    !blockTags.includes("minecraft:is_axe_item_destructible")
                ) {
                    toolData = { emoji: ` ${this.toolEmojiMap.shears}`, toolType: "shears", requiredTier: 0 };
                } else if (
                    blockTags.includes("minecraft:is_sword_item_destructible") &&
                    !blockTags.includes("minecraft:is_pickaxe_item_destructible") &&
                    !blockTags.includes("minecraft:is_axe_item_destructible")
                ) {
                    toolData = { emoji: ` ${this.toolEmojiMap.sword}`, toolType: "sword", requiredTier: 0 };
                } else {
                    let toolType = null;
                    if (blockTags.includes("minecraft:is_pickaxe_item_destructible")) toolType = "pickaxe";
                    else if (blockTags.includes("minecraft:is_axe_item_destructible")) toolType = "axe";
                    else if (blockTags.includes("minecraft:is_shovel_item_destructible")) toolType = "shovel";
                    else if (blockTags.includes("minecraft:is_hoe_item_destructible")) toolType = "hoe";
                    if (toolType) {
                        let requiredTier = 0;
                        if (blockTags.includes("minecraft:diamond_tier_destructible")) requiredTier = 3;
                        else if (blockTags.includes("minecraft:iron_tier_destructible")) requiredTier = 2;
                        else if (blockTags.includes("minecraft:stone_tier_destructible")) requiredTier = 1;
                        const tierEmojis = this.toolEmojiMap[toolType];
                        const emoji = Array.isArray(tierEmojis) ? (tierEmojis[requiredTier] ?? tierEmojis[0]) : tierEmojis;
                        toolData = { emoji: ` ${emoji}`, toolType, requiredTier };
                    }
                }
                this.blockToolCache.set(blockId, toolData);
            }

            displayToolInfo = toolData.emoji;
            let effectiveToolType = toolData.toolType;
            let effectiveRequiredTier = toolData.requiredTier;

            if (block.permutation.getState("tall_grass_type")) {
                displayToolInfo += ` ${this.toolEmojiMap.shears}`;
                effectiveToolType = effectiveToolType ?? "shears";
            }

            if (effectiveToolType !== null) {
                if (this.itemSatisfiesRequirement(itemStack, effectiveToolType, effectiveRequiredTier)) {
                    displayToolInfo += ` ${this.toolEmojiMap.breakable}`;
                } else {
                    displayToolInfo += ` ${this.toolEmojiMap.notbreakable}`;
                }
            }
        }

        return `§f${name}${displayToolInfo}${extraInfo}\n§9${source}`;
    }

    /**
     * @param {import("@minecraft/server").Block} block
     * @param {import("@minecraft/server").ItemStack} itemStack
     * @returns {ItemStack[]}
     */
    breakAble(block, itemStack) {
        try {
            return world.getLootTableManager().generateLootFromBlock(block, itemStack) || [];
        } catch (e) {
            return [];
        }
    }

    /**
     * Returns the mining tier of the held item (0=wood/gold/hand, 1=stone, 2=iron, 3=diamond, 4=netherite).
     * @param {import("@minecraft/server").ItemStack|undefined} itemStack
     * @returns {number}
     */
    getItemTier(itemStack) {
        if (!itemStack) return -1; // bare hand — can't satisfy any tier requirement
        const id = itemStack.typeId;
        if (id.startsWith("minecraft:netherite_")) return 4;
        if (id.startsWith("minecraft:diamond_")) return 3;
        if (id.startsWith("minecraft:iron_")) return 2;
        if (id.startsWith("minecraft:stone_")) return 1;
        // wooden_*, golden_*, or anything else counts as tier 0
        return 0;
    }

    /**
     * Returns true if the held item satisfies the block's tool requirement.
     * @param {import("@minecraft/server").ItemStack|undefined} itemStack
     * @param {string} toolType  — "pickaxe"|"axe"|"shovel"|"hoe"|"sword"|"shears"|"brush"|"bucket"|"crops"
     * @param {number} requiredTier — 0-3
     * @returns {boolean}
     */
    itemSatisfiesRequirement(itemStack, toolType, requiredTier) {
        if (toolType === "crops") return true; // crops are always hand-breakable
        if (!itemStack) return false;
        const id = itemStack.typeId;

        switch (toolType) {
            case "bucket":
                return id.includes("bucket");
            case "brush":
                return id === "minecraft:brush";
            case "shears":
                return id === "minecraft:shears";
            case "sword":
                return id.includes("sword");
            case "pickaxe":
                return id.includes("pickaxe") && this.getItemTier(itemStack) >= requiredTier;
            case "axe":
                return id.includes("axe") && this.getItemTier(itemStack) >= requiredTier;
            case "shovel":
                return id.includes("shovel") && this.getItemTier(itemStack) >= requiredTier;
            case "hoe":
                return id.includes("hoe") && this.getItemTier(itemStack) >= requiredTier;
            default:
                return false;
        }
    }
}

moduleManager.registerModule(new WAILA());
