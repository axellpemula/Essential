import { EntityHitBlockAfterEvent, Player, world, PlayerInteractWithBlockBeforeEvent, system } from "@minecraft/server";
import { Module, moduleManager } from "../mainCore.js";

class ToolAutoSwitchModule extends Module {
    constructor() {
        super(
            "Tool Auto-Switch",
            "Automatically switches to the best tool for the job.",
            "When you start breaking a block, it will switch to the best tool in your hotbar.",
            false,
            "textures/items/gold_pickaxe.png",
        );

        this.settings = {
            useTheHoleInventory: {
                type: "toggle",
                label: "Use the whole Inventory",
                tooltip:
                    "Searches the entire inventory for the best tool instead of just the hotbar. This can cause more lag and may not work well with certain backpacks or inventory mods.",
            },
            disableActionbarMessages: {
                type: "toggle",
                label: "Disable Actionbar Messages",
                tooltip: "Prevents messages about tool switching from appearing in the action bar.",
            },
            pickaxe: {
                type: "toggle",
                label: "Auto-Switch Pickaxe",
                tooltip: "Automatically switch to the best pickaxe when breaking blocks that require one.",
            },
            axe: {
                type: "toggle",
                label: "Auto-Switch Axe",
                tooltip: "Automatically switch to the best axe when breaking blocks that require one.",
            },
            shovel: {
                type: "toggle",
                label: "Auto-Switch Shovel",
                tooltip: "Automatically switch to the best shovel when breaking blocks that require one.",
            },
            hoe: {
                type: "toggle",
                label: "Auto-Switch Hoe",
                tooltip: "Automatically switch to the best hoe when breaking blocks that require one or when right-clicking on tillable soil.",
            },
        };

        this.isEnabled = false;
        this.useTheHoleInventory = false;
        this.disableActionbarMessages = true;
        this.pickaxe = true;
        this.axe = true;
        this.shovel = true;
        this.hoe = true;

        // Tier list for tools, from worst to best.
        this.toolTiers = ["wooden", "stone", "copper", "iron", "golden", "diamond", "netherite"];
        this.validHoeBlocks = new Set([
            "minecraft:dirt",
            "minecraft:grass_block",
            "minecraft:coarse_dirt",
            "minecraft:rooted_dirt",
            "minecraft:dirt_with_roots",
            "minecraft:grass_path",
        ]);

        world.afterEvents.entityHitBlock.subscribe(this.hitBlock.bind(this));
    }

    /**
     * @param {EntityHitBlockAfterEvent} param0
     * @returns
     */
    hitBlock({ hitBlock: block, damagingEntity: entity }) {
        if (!(entity instanceof Player)) return;
        if (!this.isEnabled || entity.isSneaking) return;

        const blockTags = block.permutation.getTags();
        const destructibleTag = blockTags.find((tag) => tag.startsWith("minecraft:is_") && tag.endsWith("_item_destructible"));

        if (!destructibleTag) return;
        const requiredTool = destructibleTag.slice(13, -18);
        if (!this[requiredTool]) return;

        const inventory = entity.getComponent("inventory").container;
        let bestToolSlot = -1;
        let bestToolTier = -1;

        const searchSlots = this.useTheHoleInventory ? inventory.size : 9;

        for (let i = 0; i < searchSlots; i++) {
            const item = inventory.getItem(i);
            if (item?.typeId.includes(`_${requiredTool}`) || item?.hasTag(`minecraft:is_${requiredTool}`)) {
                const tierName = this.toolTiers.find((t) => item.typeId.includes(t));
                const tier = tierName ? this.toolTiers.indexOf(tierName) : -1;
                if (tier > bestToolTier) {
                    bestToolTier = tier;
                    bestToolSlot = i;
                }
            }
        }

        if (bestToolSlot !== -1) {
            const currentSlot = entity.selectedSlotIndex;
            if (bestToolSlot < 9) {
                if (currentSlot !== bestToolSlot) {
                    entity.selectedSlotIndex = bestToolSlot;
                    CTsAPI.utils.actionBar(entity, `§aSwitched to §b${CTsAPI.utils.formatIdToText(inventory.getItem(bestToolSlot).typeId)}`, this.disableActionbarMessages);
                }
            } else {
                inventory.swapItems(bestToolSlot, currentSlot, inventory);
                CTsAPI.utils.actionBar(entity, `§aSwitched to §b${CTsAPI.utils.formatIdToText(inventory.getItem(currentSlot).typeId)}`, this.disableActionbarMessages);
            }
        }
    }

    /**
     * @param {PlayerInteractWithBlockBeforeEvent} event
     */
    onPlayerInteract(event) {
        const { player, block, itemStack } = event;
        if (!this.isEnabled || !player.isSneaking) return;
        if (itemStack?.hasTag("minecraft:is_hoe")) return;
        if (!this.hoe) return;

        if (this.validHoeBlocks.has(block.typeId)) {
            const requiredTool = "hoe";
            const inventory = player.getComponent("inventory").container;
            let bestToolSlot = -1;
            let bestToolTier = -1;

            const searchSlots = this.useTheHoleInventory ? inventory.size : 9;
            for (let i = 0; i < searchSlots; i++) {
                const item = inventory.getItem(i);
                if (item?.typeId.includes(`_${requiredTool}`) || item?.hasTag(`minecraft:is_${requiredTool}`)) {
                    const tierName = this.toolTiers.find((t) => item.typeId.includes(t));
                    const tier = tierName ? this.toolTiers.indexOf(tierName) : -1;
                    if (tier > bestToolTier) {
                        bestToolTier = tier;
                        bestToolSlot = i;
                    }
                }
            }

            if (bestToolSlot !== -1) {
                event.cancel = true;
                system.run(() => {
                    const currentSlot = player.selectedSlotIndex;
                    if (bestToolSlot < 9) {
                        if (currentSlot !== bestToolSlot) {
                            player.selectedSlotIndex = bestToolSlot;
                            CTsAPI.utils.actionBar(player, `§aSwitched to §b${CTsAPI.utils.formatIdToText(inventory.getItem(bestToolSlot).typeId)}`, this.disableActionbarMessages);
                        }
                    } else {
                        inventory.swapItems(bestToolSlot, currentSlot, inventory);
                        CTsAPI.utils.actionBar(player, `§aSwitched to §b${CTsAPI.utils.formatIdToText(inventory.getItem(currentSlot).typeId)}`, this.disableActionbarMessages);
                    }
                });
            }
        }
    }
}

moduleManager.registerModule(new ToolAutoSwitchModule());
