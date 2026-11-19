import { world, system, PlayerBreakBlockBeforeEvent } from "@minecraft/server";
import { Module, moduleManager } from "../mainCore.js";

class GravityControlModule extends Module {
    constructor() {
        super(
            "Gravity Control",
            "Breaking the bottom block of a sand/gravel column breaks the entire column.",
            "Safely clear out sand and gravel pillars. Only works with a shovel.",
            true, // isHeavy
            "textures/blocks/sand.png",
        );

        this.settings = {
            enableDurability: {
                type: "toggle",
                label: "Enable Durability Loss",
                tooltip: "If enabled, the shovel used will take durability damage for each block broken.",
            },
            maxHeight: {
                type: "slider",
                label: "Max Column Height",
                min: 2,
                max: 256,
                step: 1,
                tooltip: "The maximum number of blocks to collapse in a single column.",
            },
            delay: {
                type: "slider",
                label: "Delay Between Blocks (ticks)",
                min: 0,
                max: 10,
                step: 1,
                tooltip: "The delay in ticks between breaking each block.",
            },
        };

        this.maxHeight = 64; // Default value
        this.delay = 1; // Default value
        this.isEnabled = false; // Disabled by default
        this.enableDurability = true;
        this.validBlocks = new Set(["minecraft:sand", "minecraft:gravel", "minecraft:red_sand", "concrete_powder"]);

        this.breakPriority = 10;
    }
    /**
     * @param {PlayerBreakBlockBeforeEvent} event
     */
    onPlayerBreak(event) {
        const { player, block, itemStack } = event;
        let blockWithType = this.getBlockBaseType(block.typeId);
        if (!this.validBlocks.has(blockWithType)) return;
        if (!itemStack || !itemStack.hasTag("minecraft:is_shovel")) return;

        // Only trigger if there's a matching block directly above, to avoid single blocks.
        const blockAbove = block.above(1);
        if (this.getBlockBaseType(blockAbove?.typeId) !== blockWithType) return;

        event.cancel = true;
        event.handled = true;
        system.run(() => this.startCollapse(player, block, itemStack));
    }

    async startCollapse(player, startBlock, itemStack) {
        const dimension = player.dimension;
        const blockType = startBlock.typeId;
        const blocksToBreak = [startBlock];
        let currentY = startBlock.location.y + 1;

        // Find all blocks in the column above, up to the max height
        while (blocksToBreak.length < this.maxHeight) {
            const checkLocation = { x: startBlock.location.x, y: currentY, z: startBlock.location.z };
            try {
                const blockAbove = dimension.getBlock(checkLocation);
                if (blockAbove && this.getBlockBaseType(blockAbove.typeId) === this.getBlockBaseType(blockType)) (blocksToBreak.push(blockAbove), currentY++);
                else break;
            } catch (e) {
                break;
            }
        }

        const inv = player.getComponent("inventory").container;
        const autoPickupModule = moduleManager.modules.get("AutoPickup");

        for (const block of blocksToBreak.reverse()) {
            const mainHandItem = inv.getItem(player.selectedSlotIndex);
            if (!mainHandItem || !mainHandItem.hasTag("minecraft:is_shovel")) break;
            if (this.enableDurability && mainHandItem.getComponent("durability")) CTsAPI.utils.increaseDurability(player, mainHandItem, 1);

            const drops = world.getLootTableManager().generateLootFromBlock(block, mainHandItem) ?? [];
            world.gameRules.doTileDrops = false;
            dimension.runCommand(`setblock ${block.location.x} ${block.location.y} ${block.location.z} air destroy`);
            world.gameRules.doTileDrops = true;

            if (autoPickupModule) {
                autoPickupModule.handlePickup(player, drops, block.center(), itemStack);
            } else {
                for (const drop of drops) {
                    dimension.spawnItem(drop, block.center());
                }
            }

            await CTsAPI.utils.delay(this.delay);
        }
    }

    getBlockBaseType(typeId) {
        if (typeId.endsWith("concrete_powder")) {
            return typeId.match(/concrete_powder/)[0];
        }
        return typeId;
    }
}
moduleManager.registerModule(new GravityControlModule());
