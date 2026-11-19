import { BlockVolume, PlayerBreakBlockBeforeEvent, system, world } from "@minecraft/server";
import { Module, moduleManager } from "../mainCore.js";

class ExcavationModule extends Module {
    constructor() {
        super(
            "Excavation",
            "Automatically breaks blocks in a 3x3 area",
            "Helps with mining. Only works when you are sneaking and mining a block with a pickaxe.",
            false,
            "textures/items/netherite_pickaxe.png",
        );
        this.settings = {
            mode: {
                type: "dropdown",
                label: "Excavation Mode",
                tooltip: "Determines the shape of the area that will be excavated.",
                options: ["2x2", "3x3", "5x5"],
            },
            worksWithAllTypes: {
                type: "toggle",
                label: "Works With All Types",
                tooltip: "If enabled, the excavation will work with all block types. If disabled, it will only work with the same block type as the one you are mining.",
            },
            takeDurability: {
                type: "toggle",
                label: "Take Durability",
                tooltip: "If enabled, the pickaxe used will take durability damage for each block excavated.",
            },
        };
        this.isEnabled = false;
        this.mode = 0; // 0 = 2x2, 1 = 3x3, 2 = 5x5
        this.isEnabled = false;
        this.worksWithAllTypes = false;
        this.breakPriority = 10;
    }

    /**
     * @param {PlayerBreakBlockBeforeEvent} event
     */
    onPlayerBreak(event) {
        const { itemStack, player, block } = event;
        if (event.cancel) return;
        if (!player.isSneaking || !itemStack?.hasTag("minecraft:is_pickaxe") || player.hasTag("excavating")) return;

        event.cancel = true;
        event.handled = true;

        const originalBlockType = block.typeId;
        system.run(async () => {
            player.addTag("excavating");
            if (this.takeDurability) {
                CTsAPI.utils.increaseDurability(player, itemStack, 1);
            }
            let i = 0;
            try {
                const dimension = player.dimension;
                const autoPickupModule = moduleManager.modules.get("AutoPickup");
                const autoPickupEnabled = autoPickupModule?.isEnabled;
                const hasSilkTouch = itemStack.getComponent("enchantable")?.hasEnchantment("minecraft:silk_touch");

                const mode = this.mode;
                const size = mode === 0 ? 2 : mode === 1 ? 3 : 5;
                const halfSize = Math.floor(size / 2);

                const viewDir = player.getViewDirection();
                const absX = Math.abs(viewDir.x);
                const absY = Math.abs(viewDir.y);
                const absZ = Math.abs(viewDir.z);

                const blocksToProcess = [];

                if (absX > absY && absX > absZ) {
                    // Facing East/West, plane is YZ
                    for (let y = -halfSize; y <= halfSize; y++) {
                        for (let z = -halfSize; z <= halfSize; z++) {
                            blocksToProcess.push(block.offset({ x: 0, y: y, z: z }));
                        }
                    }
                } else if (absY > absX && absY > absZ) {
                    // Facing Up/Down, plane is XZ
                    for (let x = -halfSize; x <= halfSize; x++) {
                        for (let z = -halfSize; z <= halfSize; z++) {
                            blocksToProcess.push(block.offset({ x: x, y: 0, z: z }));
                        }
                    }
                } else {
                    // Facing North/South, plane is XY
                    for (let x = -halfSize; x <= halfSize; x++) {
                        for (let y = -halfSize; y <= halfSize; y++) {
                            blocksToProcess.push(block.offset({ x: x, y: y, z: 0 }));
                        }
                    }
                }

                for (const targetBlock of blocksToProcess) {
                    if (!targetBlock) continue;

                    if (!itemStack || !itemStack.hasTag("minecraft:is_pickaxe")) break;

                    if (targetBlock.typeId === originalBlockType || this.worksWithAllTypes) {
                        const drops = hasSilkTouch
                            ? [targetBlock.getItemStack(1)].filter(Boolean)
                            : (world.getLootTableManager().generateLootFromBlock(targetBlock, itemStack) ?? []);
                        if (drops.length === 0) continue;

                        if (autoPickupEnabled && autoPickupModule) {
                            world.gameRules.doTileDrops = false;
                            dimension.runCommand(`setblock ${targetBlock.location.x} ${targetBlock.location.y} ${targetBlock.location.z} air destroy`);
                            for (const drop of drops) {
                                CTsAPI.utils.addItem(player, drop);
                                i += drop.amount;
                            }
                            world.gameRules.doTileDrops = true;
                        } else {
                            if (hasSilkTouch) {
                                if (targetBlock.getComponent("minecraft:inventory")) {
                                    dimension.runCommand(`setblock ${targetBlock.location.x} ${targetBlock.location.y} ${targetBlock.location.z} air destroy`);
                                } else {
                                    dimension.runCommand(`setblock ${targetBlock.location.x} ${targetBlock.location.y} ${targetBlock.location.z} air`);
                                    for (const drop of drops) {
                                        dimension.spawnItem(drop, targetBlock.center());
                                    }
                                }
                            } else {
                                dimension.runCommand(`setblock ${targetBlock.location.x} ${targetBlock.location.y} ${targetBlock.location.z} air destroy`);
                            }
                        }
                        if (this.takeDurability) {
                            CTsAPI.utils.increaseDurability(player, itemStack, 1);
                        }
                    }
                }
            } catch (e) {
                console.error(`[Excavation] Error: ${e} ${e.stack}`);
            } finally {
                player.removeTag("excavating");
                // console.warn(`${i} blocks processed for excavation.`);
            }
        });
    }
}

moduleManager.registerModule(new ExcavationModule());
