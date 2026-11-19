import { world, system, BlockPermutation, Player, Block, ItemStack } from "@minecraft/server";
import { Module, moduleManager } from "../mainCore.js";

class ScaffoldModule extends Module {
    constructor() {
        super(
            "Scaffold",
            "Automatically places blocks under you while sneaking over edges.",
            "Helps with bridging. Consumes blocks from your inventory.",
            true,
            "textures/ui/Scaffolding.png",
        );
        this.isEnabled = false;
    }

    tick() {
        if (!this.isEnabled) return;
        if (system.currentTick % 2 !== 0) return;

        for (const player of world.getPlayers({ gameModes: ["survival", "adventure"] })) {
            if (!player.isSneaking) continue;

            const blockBelowLocation = {
                x: Math.floor(player.location.x),
                y: Math.floor(player.location.y) - 1,
                z: Math.floor(player.location.z),
            };
            if (blockBelowLocation.y < player.dimension.heightRange.min) continue;

            const blockBelow = player.dimension.getBlock(blockBelowLocation);

            if (blockBelow && blockBelow.isAir) {
                const inventory = player.getComponent("inventory").container;

                for (let i = inventory.size - 1; i >= 0; i--) {
                    const item = inventory.getItem(i);

                    if (item && CTsAPI.utils.isBlock(item)) {
                        try {
                            blockBelow.setPermutation(BlockPermutation.resolve(item.typeId));

                            if (item.amount > 1) {
                                item.amount--;
                                inventory.setItem(i, item);
                            } else {
                                inventory.setItem(i, undefined);
                            }

                            player.dimension.playSound("dig.stone", blockBelow.location, { volume: 0.8, pitch: 1.2 });
                            break;
                        } catch (e) {
                            continue;
                        }
                    }
                }
            }
        }
    }
}

moduleManager.registerModule(new ScaffoldModule());
