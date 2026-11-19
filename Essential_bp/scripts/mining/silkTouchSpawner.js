import { system, world, PlayerBreakBlockBeforeEvent } from "@minecraft/server";
import { Module, moduleManager } from "../mainCore";

class SilkTouchSpawner extends Module {
    constructor() {
        super(
            "Silk Touch Spawner",
            "Mines blocks with silk touch.",
            "When enabled, mining will cause blocks to drop themselves instead of their usual drops, simulating the effect of the Silk Touch enchantment.",
            false,
            "textures/items/diamond_pickaxe",
        );

        this.settings = {
            enableNetherite: {
                type: "toggle",
                label: "Enable for Netherite Pickaxe",
                tooltip: "If enabled, the silk touch effect will also apply when using a netherite pickaxe.",
            },
            enableDiamond: {
                type: "toggle",
                label: "Enable for Diamond Pickaxe",
                tooltip: "If enabled, the silk touch effect will also apply when using a diamond pickaxe.",
            },
            enableIron: {
                type: "toggle",
                label: "Enable for Iron Pickaxe",
                tooltip: "If enabled, the silk touch effect will also apply when using an iron pickaxe.",
            },
            enableStone: {
                type: "toggle",
                label: "Enable for Stone Pickaxe",
                tooltip: "If enabled, the silk touch effect will also apply when using a stone pickaxe.",
            },
            enableWood: {
                type: "toggle",
                label: "Enable for Wooden Pickaxe",
                tooltip: "If enabled, the silk touch effect will also apply when using a wooden pickaxe.",
            },
            enableCustom: {
                type: "toggle",
                label: "Enable for Custom Pickaxes",
                tooltip: "If enabled, the silk touch effect will also apply when using any custom pickaxes added by other mods.",
            },
            toDropChance: {
                type: "slider",
                label: "Drop Chance",
                min: 0,
                max: 100,
                step: 1,
                tooltip: "The percentage chance for blocks to drop themselves when mined with the silk touch effect. Set to 100% for guaranteed drops.",
            },
        };
        this.isEnabled = false;
        this.enableNetherite = true;
        this.enableDiamond = true;
        this.enableIron = false;
        this.enableStone = false;
        this.enableWood = false;
        this.toDropChance = 100;
        this.breakPriority = 5;
    }
    /**
     *
     * @param {PlayerBreakBlockBeforeEvent} event
     * @returns
     */
    onPlayerBreak(event) {
        if (event.cancel) return;
        const { player, block, itemStack } = event;
        if (!this.isEnabled || !itemStack?.hasTag("minecraft:is_pickaxe")) return;
        if (block.typeId !== "minecraft:mob_spawner") return;
        const toolTier = this.getToolTier(itemStack.typeId);
        if (toolTier === null) return;

        if (
            (toolTier === "netherite" && !this.enableNetherite) ||
            (toolTier === "diamond" && !this.enableDiamond) ||
            (toolTier === "iron" && !this.enableIron) ||
            (toolTier === "stone" && !this.enableStone) ||
            (toolTier === "wood" && !this.enableWood) ||
            (toolTier === "custom" && !this.enableCustom)
        ) {
            return;
        }

        const enchantments = itemStack.getComponent("enchantable")?.getEnchantments() || [];
        const hasSilkTouch = enchantments.some((e) => e.type.id === "silk_touch");
        if (!hasSilkTouch) return;
        event.cancel = true;
        event.handled = true;
        system.run(() => {
            if (Math.random() * 100 < this.toDropChance) {
                const itemToDrop = block.getItemStack(1, true);
                const autoPickupModule = moduleManager.modules.get("AutoPickup");
                if (autoPickupModule) {
                    autoPickupModule.handlePickup(player, [itemToDrop], block.center(), itemStack);
                } else {
                    player.dimension.spawnItem(itemToDrop, block.center());
                }
            }
            world.gameRules.doTileDrops = false;
            block.dimension.runCommand(`setblock ${block.location.x} ${block.location.y} ${block.location.z} air destroy`);
            world.gameRules.doTileDrops = true;
            CTsAPI.utils.increaseDurability(player, itemStack, 1);
        });
    }

    getToolTier(typeId) {
        if (typeId.includes("netherite_pickaxe")) return "netherite";
        if (typeId.includes("diamond_pickaxe")) return "diamond";
        if (typeId.includes("iron_pickaxe")) return "iron";
        if (typeId.includes("stone_pickaxe")) return "stone";
        if (typeId.includes("wooden_pickaxe")) return "wood";
        if (typeId.includes("_pickaxe") && !typeId.startsWith("minecraft:")) return "custom";
        return null;
    }
}

moduleManager.registerModule(new SilkTouchSpawner());
