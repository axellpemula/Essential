import { world, system, ItemStack, PlayerBreakBlockBeforeEvent } from "@minecraft/server";
import { Module, moduleManager } from "../mainCore.js";

class AutoSmeltModule extends Module {
    constructor() {
        super(
            "Auto Smelt",
            "Automatically smelts ores when mined.",
            "Respects Silk Touch and can be configured to prioritize Fortune.",
            false,
            "textures/blocks/furnace_front_on.png",
        );

        this.settings = {
            prioritizeFortune: {
                type: "toggle",
                label: "Prioritize Fortune",
                tooltip: "If enabled, Auto Smelt will not trigger if your pickaxe has Fortune.",
            },
            enableDurability: {
                type: "toggle",
                label: "Enable Durability Loss",
                tooltip: "If enabled, the tool used will take durability damage.",
            },
        };

        this.prioritizeFortune = true; // Default value
        this.isEnabled = false; // Disabled by default
        this.enableDurability = true;

        this.smeltMap = new Map([
            ["minecraft:raw_iron", "minecraft:iron_ingot"],
            ["minecraft:raw_gold", "minecraft:gold_ingot"],
            ["minecraft:raw_copper", "minecraft:copper_ingot"],
            ["minecraft:ancient_debris", "minecraft:netherite_scrap"],
        ]);

        this.xpMap = new Map([
            ["minecraft:iron_ore", 0.7],
            ["minecraft:gold_ore", 1],
            ["minecraft:copper_ore", 0.7],
            ["minecraft:ancient_debris", 2],
        ]);

        this.breakPriority = 0;
    }
    /**
     *
     * @param {PlayerBreakBlockBeforeEvent} event
     * @returns
     */
    onPlayerBreak(event) {
        const { player, block, itemStack } = event;

        // Vein Miner handles smelting while sneaking, so this module shouldn't.
        if (player.isSneaking) return;
        if (player.getGameMode() === "creative") return;

        if (!itemStack || !itemStack.hasTag("minecraft:is_pickaxe")) return;

        const enchantments = itemStack.getComponent("enchantable")?.getEnchantments() || [];
        const hasSilkTouch = enchantments.some((e) => e.type.id === "silk_touch");
        if (hasSilkTouch) return;

        // Generate loot to see what would drop
        const lootItems = world.getLootTableManager().generateLootFromBlock(block, itemStack);
        const canSmeltAny = lootItems.some((item) => this.smeltMap.has(item.typeId));
        if (!canSmeltAny) return;

        const fortuneEnchant = enchantments.find((e) => e.type.id === "fortune");
        const fortuneLevel = fortuneEnchant ? fortuneEnchant.level : 0;
        if (fortuneLevel > 0 && this.prioritizeFortune) return;

        // All checks passed, proceed with auto-smelting
        event.cancel = true;
        event.handled = true;
        system.run(() => {
            const dimension = player.dimension;
            const blockCenter = block.center();

            dimension.getBlock(block.location).setType("minecraft:air");
            dimension.playSound("dig.stone", block.location);

            if (this.enableDurability) CTsAPI.utils.increaseDurability(player, itemStack, 1);

            let didSmeltSomething = false;
            for (const item of lootItems) {
                const smeltedResultId = this.smeltMap.get(item.typeId);
                if (smeltedResultId) {
                    dimension.spawnItem(new ItemStack(smeltedResultId, item.amount), blockCenter);
                    didSmeltSomething = true;
                } else {
                    dimension.spawnItem(item, blockCenter);
                }
            }

            if (didSmeltSomething) {
                dimension.spawnParticle("minecraft:basic_flame_particle", blockCenter);
                const xpToGive = this.xpMap.get(block.typeId.replace("deepslate_", "")) || 0;
                if (xpToGive > 0) {
                    try {
                        player.addExperience(xpToGive);
                    } catch (e) {
                        console.warn(`[AutoSmelt] Failed to add experience: ${e}`);
                    }
                }
            }
        });
    }
}
moduleManager.registerModule(new AutoSmeltModule());
