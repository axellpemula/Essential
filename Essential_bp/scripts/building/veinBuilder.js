import { world, system, BlockPermutation, Player, Block, ItemStack, Direction } from "@minecraft/server";
import { Module, moduleManager } from "../mainCore.js";

class VeinBuilderModule extends Module {
    constructor() {
        super(
            "Vein Builder",
            "Builds a line of blocks in the direction you're looking.",
            "While sneaking, place a block against another surface. A line of blocks will extend from that point in the direction you are facing.",
            true,
            "textures/ui/building_a_shelter.png",
        );

        this.settings = {
            maxBlocks: {
                type: "slider",
                label: "Max Blocks to Build",
                min: 2,
                max: 64,
                step: 1,
                tooltip: "The maximum number of blocks to place in a single build action.",
            },
            showPreview: {
                type: "toggle",
                label: "Show Build Preview",
                tooltip: "Shows a particle preview of where blocks will be placed.",
            },
        };

        this.isEnabled = false;
        this.maxBlocks = 16;
        this.interactPriority = 100; // High priority to ensure it runs before other interact handlers
        this.showPreview = true;
    }

    tick() {
        if (!this.isEnabled || !this.showPreview) return;
        if (system.currentTick % 4 !== 0) return;

        for (const player of world.getPlayers({ gameModes: ["survival", "adventure"] })) {
            if (!player.isSneaking) continue;

            const itemStack = player.getComponent("inventory").container.getItem(player.selectedSlotIndex);
            if (!itemStack || !CTsAPI.utils.isBlock(itemStack)) continue;

            const blockHit = player.getBlockFromViewDirection({ maxDistance: 8 });
            if (!blockHit) continue;

            const { block, face } = blockHit;

            const firstBlockLocation = {
                x: block.location.x + (face === Direction.East ? 1 : face === Direction.West ? -1 : 0),
                y: block.location.y + (face === Direction.Up ? 1 : face === Direction.Down ? -1 : 0),
                z: block.location.z + (face === Direction.South ? 1 : face === Direction.North ? -1 : 0),
            };

            const viewDir = player.getViewDirection();
            const absX = Math.abs(viewDir.x),
                absY = Math.abs(viewDir.y),
                absZ = Math.abs(viewDir.z);
            let buildDirection;
            if (absX > absZ && absX > absY) buildDirection = { x: Math.sign(viewDir.x), y: 0, z: 0 };
            else if (absZ > absX && absZ > absY) buildDirection = { x: 0, y: 0, z: Math.sign(viewDir.z) };
            else buildDirection = { x: 0, y: Math.sign(viewDir.y), z: 0 };

            for (let i = 0; i < this.maxBlocks; i++) {
                const nextLocation = {
                    x: firstBlockLocation.x + buildDirection.x * i,
                    y: firstBlockLocation.y + buildDirection.y * i,
                    z: firstBlockLocation.z + buildDirection.z * i,
                };
                const blockToReplace = player.dimension.getBlock(nextLocation);
                if (blockToReplace?.isAir) {
                    const particleLoc = { x: nextLocation.x + 0.5, y: nextLocation.y + 0.5, z: nextLocation.z + 0.5 };
                    player.dimension.spawnParticle("minecraft:endrod", particleLoc);
                } else {
                    break;
                }
            }
        }
    }

    /**
     * @param {import("@minecraft/server").PlayerInteractWithBlockBeforeEvent} event
     */
    onPlayerInteract(event) {
        if (!this.isEnabled) return;

        const { player, itemStack, blockFace, block } = event;
        let isBlock = CTsAPI.utils.isBlock(itemStack);
        if (!player.isSneaking || !isBlock || player.hasTag("vein_building")) return;
        event.cancel = true;
        event.handled = true
        system.run(() => this.startVeinBuild(player, block, blockFace, itemStack));
    }

    /**
     * @param {Player} player
     * @param {Block} block
     * @param {*} blockFace
     * @param {ItemStack} itemStack
     */
    async startVeinBuild(player, block, blockFace, itemStack) {
        player.addTag("vein_building");
        try {
            const dimension = player.dimension;
            const inventory = player.getComponent("inventory").container;
            const buildPermutation = BlockPermutation.resolve(itemStack.typeId);

            const firstBlockLocation = {
                x: block.location.x + (blockFace === "East" ? 1 : blockFace === "West" ? -1 : 0),
                y: block.location.y + (blockFace === "Up" ? 1 : blockFace === "Down" ? -1 : 0),
                z: block.location.z + (blockFace === "South" ? 1 : blockFace === "North" ? -1 : 0),
            };

            const firstBlock = dimension.getBlock(firstBlockLocation);
            if (!firstBlock?.isAir) return player.removeTag("vein_building");

            const itemInHand = inventory.getItem(player.selectedSlotIndex);
            if (!itemInHand || itemInHand.typeId !== itemStack.typeId) return player.removeTag("vein_building");

            firstBlock.setPermutation(buildPermutation);
            if (itemInHand.amount > 1) (itemInHand.amount--, inventory.setItem(player.selectedSlotIndex, itemInHand));
            else inventory.setItem(player.selectedSlotIndex, undefined);

            const viewDir = player.getViewDirection();
            const absX = Math.abs(viewDir.x),
                absY = Math.abs(viewDir.y),
                absZ = Math.abs(viewDir.z);
            let buildDirection;
            if (absX > absZ && absX > absY) buildDirection = { x: Math.sign(viewDir.x), y: 0, z: 0 };
            else if (absZ > absX && absZ > absY) buildDirection = { x: 0, y: 0, z: Math.sign(viewDir.z) };
            else buildDirection = { x: 0, y: Math.sign(viewDir.y), z: 0 };
            for (let i = 1; i < this.maxBlocks; i++) {
                const currentItem = inventory.getItem(player.selectedSlotIndex);
                if (!currentItem || currentItem.typeId !== itemStack.typeId) break;

                const nextLocation = {
                    x: firstBlockLocation.x + buildDirection.x * i,
                    y: firstBlockLocation.y + buildDirection.y * i,
                    z: firstBlockLocation.z + buildDirection.z * i,
                };
                const blockToReplace = dimension.getBlock(nextLocation);
                if (blockToReplace?.isAir) {
                    blockToReplace.setPermutation(buildPermutation);
                    if (currentItem.amount > 1) (currentItem.amount--, inventory.setItem(player.selectedSlotIndex, currentItem));
                    else inventory.setItem(player.selectedSlotIndex, undefined);
                } else break;
            }
            dimension.playSound("dig.stone", firstBlockLocation);
        } catch (e) {
            console.error(`[VeinBuilder] Error: ${e.stack ?? e}`);
        } finally {
            player.removeTag("vein_building");
        }
    }
}

moduleManager.registerModule(new VeinBuilderModule());
