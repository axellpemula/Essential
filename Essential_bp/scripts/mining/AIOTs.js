import { world, system, PlayerBreakBlockBeforeEvent, PlayerInteractWithBlockBeforeEvent } from "@minecraft/server";
import { moduleManager, Module } from "../mainCore";

class AIOTs extends Module {
    constructor() {
        super("AIOTs", "Adds a tool that includes every other tool's functionality.", "Disable/Enable the tool usage", false, "textures/items/AIOTs/wooden_aiots");
        this.settings = {
            disable: {
                type: "toggle",
                label: "Disable AIOTs",
                tooltip: "If enabled, the AIOTs will not function as a multi-tool and will not be able to break blocks",
            },
        };
        this.isEnabled = true;
        this.disable = false;
        this.breakPriority = 1;
        this.interactPriority = 15;
    }
    /**
     * @param {PlayerBreakBlockBeforeEvent} event
     */
    onPlayerBreak(event) {
        if (event.handled) return;
        if (event.cancel) return;
        if (!this.isEnabled) return;
        let { player, itemStack } = event;
        if (itemStack?.typeId.endsWith("aiot")) {
            if (!this.disable) return;
            event.cancel = true;
            event.handled = true;
            CTsAPI.msg.sendInfoMessage(player, "§7AIOTs are currently disabled.");
            return;
        }
    }
    /**
     * @param {PlayerInteractWithBlockBeforeEvent} event
     */
    onPlayerInteract(event) {
        if (event.handled) return;
        if (!this.isEnabled) return;
        let { player, itemStack, isFirstEvent, block } = event;
        if (itemStack?.typeId.endsWith("aiot")) {
            let areaHoeModule = moduleManager.modules.get("Area Hoe");
            if (this.disable) {
                event.cancel = true;
                event.handled = true;
                if (isFirstEvent) {
                    CTsAPI.msg.sendInfoMessage(player, "§7AIOTs are currently disabled.");
                }
            } else {
                if (player.isSneaking && areaHoeModule?.validBlocks?.has(block.typeId)) {
                    event.cancel = true;
                    event.handled = true;
                    system.run(() => {
                        const dimension = player.dimension;
                        const center = block.location;
                        if (areaHoeModule.isEnabled) {
                            const halfSize = Math.floor((areaHoeModule.areaSize * 2 + 3) / 2);
                            for (let x = -halfSize; x <= halfSize; x++) {
                                for (let z = -halfSize; z <= halfSize; z++) {
                                    const currentLoc = { x: center.x + x, y: center.y, z: center.z + z };
                                    const currentBlock = dimension.getBlock(currentLoc);
                                    if (currentBlock && areaHoeModule.validBlocks.has(currentBlock.typeId) && currentBlock.above(1).isAir) {
                                        currentBlock.setType("minecraft:grass_path");
                                        if (areaHoeModule.enableDurability) {
                                            const tool = player.getComponent("inventory").container.getItem(player.selectedSlotIndex);
                                            if (tool) CTsAPI.utils.increaseDurability(player, tool, 1);
                                        }
                                    }
                                }
                            }
                            dimension.playSound("step.grass", center, { volume: 1, pitch: 0.8 });
                        } else {
                            if (block.above(1).isAir) {
                                block.setType("minecraft:grass_path");
                                CTsAPI.utils.increaseDurability(player, itemStack, 1);
                                dimension.playSound("step.grass", center, { volume: 1, pitch: 0.8 });
                            }
                        }
                    });
                }
            }
        }
    }
}

moduleManager.registerModule(new AIOTs());
