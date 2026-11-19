import { BlockVolume, ItemStack, Player, PlayerBreakBlockBeforeEvent, system, world } from "@minecraft/server";
import { Module, moduleManager } from "../mainCore.js";

class AutoPickup extends Module {
    constructor() {
        super(
            "AutoPickup",
            "Automatically picks up items broken by the player.",
            "If broken block drops items by a player, they will be automatically added to the player's inventory.",
            false,
            "textures/ui/auto-pickup.png",
        );

        this.settings = {
            filteredItems: {
                type: "textField",
                placeholder: "stone,dirt",
                label: "Filtered Items",
                tooltip: "Items that will not be automatically picked up.",
            },
            toggleWhiteBlackList: {
                type: "toggle",
                label: "Toggle Whitelist/Blacklist",
                tooltip: "If enabled, only items in the filtered list will be picked up. If disabled, items in the filtered list will be ignored.",
            },
            enableDurability: {
                type: "toggle",
                label: "Enable Durability Loss",
                tooltip: "If enabled, the tool used will take durability damage.",
            },
        };
        this.isEnabled = false;
        this.filteredItems = "air,bedrock";
        this.toggleWhiteBlackList = false;
        this.enableDurability = true;
        this.breakPriority = -10; // Low priority to run after other modules
        this.xpList = {
            coal_ore: [0, 2],
            deepslate_coal_ore: [0, 2],
            diamond_ore: [3, 7],
            deepslate_diamond_ore: [3, 7],
            emerald_ore: [3, 7],
            deepslate_emerald_ore: [3, 7],
            lapis_ore: [2, 5],
            deepslate_lapis_ore: [2, 5],
            quartz_ore: [2, 5],
            nether_gold_ore: [0, 1],
            redstone_ore: [1, 5],
            lit_redstone_ore: [1, 5],
            deepslate_redstone_ore: [1, 5],
            lit_deepslate_redstone_ore: [1, 5],
            mob_spawner: [15, 43],
            sculk: [1, 1],
            sculk_sensor: [5, 5],
            sculk_shrieker: [5, 5],
            sculk_catalyst: [5, 5],
            calibrated_sculk_sensor: [5, 5],
        };
    }
    /**
     * @param {PlayerBreakBlockBeforeEvent} event
     */
    onPlayerBreak(event) {
        const { player, block, itemStack } = event;
        if (player.getGameMode().toLowerCase() === "creative") return;

        // Don't interfere if another addon already handled this
        // if (event.handled) return;

        event.cancel = true;
        event.handled = true;
        system.run(() => {
            if (block.typeId === "minecraft:air") return;
            const stackedBlockRules = {
                "minecraft:reeds": { itemId: "minecraft:sugar_cane", filterTypes: ["minecraft:reeds"] },
                "minecraft:cactus": { itemId: "minecraft:cactus", filterTypes: ["minecraft:cactus"] },
                "minecraft:kelp": { itemId: "minecraft:kelp", filterTypes: ["minecraft:kelp"] },
                "minecraft:pointed_dripstone": { itemId: "minecraft:pointed_dripstone", filterTypes: ["minecraft:pointed_dripstone"] },
                "minecraft:sulfur_spike": { itemId: "minecraft:sulfur_spike", filterTypes: ["minecraft:sulfur_spike"] },
                "minecraft:bamboo": { itemId: "minecraft:bamboo", filterTypes: ["minecraft:bamboo"] },
                "minecraft:big_dripleaf": { itemId: "minecraft:big_dripleaf", filterTypes: ["minecraft:big_dripleaf"] },
                "minecraft:twisting_vines": { itemId: "minecraft:twisting_vines", filterTypes: ["minecraft:twisting_vines"] },
                "minecraft:weeping_vines": { itemId: "minecraft:weeping_vines", filterTypes: ["minecraft:weeping_vines"], reverse: true },
            };

            const stackedBlock = stackedBlockRules[block.typeId];
            if (stackedBlock) {
                const caneVolume = new BlockVolume(block.location, {
                    x: block.location.x,
                    y: block.location.y + (stackedBlock.reverse ? -10 : 10),
                    z: block.location.z,
                });
                const caneLocations = [...block.dimension.getBlocks(caneVolume, { includeTypes: stackedBlock.filterTypes }).getBlockLocationIterator()];
                const drops = [new ItemStack(stackedBlock.itemId, caneLocations.length)];

                world.gameRules.doTileDrops = false;
                this.handlePickup(player, drops, block.center(), itemStack);
                let reverseY = stackedBlock.reverse ? -1 : 1;
                const finalLocs = caneLocations.sort((a, b) => (a.y - b.y) * reverseY);
                for (const caneLocation of finalLocs) {
                    if (stackedBlock.reverse) {
                        block.dimension.getBlock(caneLocation)?.setType("minecraft:air");
                    } else {
                        block.dimension.runCommand(`setblock ${caneLocation.x} ${caneLocation.y} ${caneLocation.z} air destroy`);
                    }
                }

                world.gameRules.doTileDrops = true;
                if (this.enableDurability) CTsAPI.utils.increaseDurability(player, itemStack);
                return;
            } else {
                world.gameRules.doTileDrops = false;
                const drops = world.getLootTableManager().generateLootFromBlock(block, itemStack) || [];
                this.handlePickup(player, drops, block.center(), itemStack);
                block.dimension.runCommand(`setblock ${block.location.x} ${block.location.y} ${block.location.z} air destroy`);
                world.gameRules.doTileDrops = true;
                if (this.enableDurability) CTsAPI.utils.increaseDurability(player, itemStack);
            }
        });
    }

    /**
     * Handles the logic for picking up or dropping items based on module settings.
     * @param {Player} player The player who should receive the items.
     * @param {import("@minecraft/server").ItemStack[]} items The array of items to process.
     * @param {import("@minecraft/server").Vector3} location The location to spawn items if they are not picked up.
     * @param {import("@minecraft/server").ItemStack} itemStack The item stack used for breaking the block.
     */
    handlePickup(player, items, location, itemStack) {
        if (!this.isEnabled) {
            for (const item of items) {
                player.dimension.spawnItem(item, location);
            }
            return;
        }

        const filteredItemsList = this.filteredItems?.split(",").map((item) => item.trim().toLowerCase()) ?? [];
        const isWhitelist = this.toggleWhiteBlackList;

        // Xp handling
        let enchantmentComponent = itemStack?.getComponent("enchantable");
        let hasSilkTouch = enchantmentComponent ? enchantmentComponent.hasEnchantment("minecraft:silk_touch") : false;
        if (!hasSilkTouch) {
            let block = player.dimension.getBlock(location);
            let filteredBlockId = block.typeId.replace("minecraft:", "");
            let xpAmount = this.xpList[filteredBlockId] || [0, 0];
            if (xpAmount[0] > 0 || xpAmount[1] > 0) {
                const xpToDrop = Math.floor(Math.random() * (xpAmount[1] - xpAmount[0] + 1)) + xpAmount[0];
                if (xpToDrop > 0) {
                    for (let i = 0; i < xpToDrop; i++) {
                        player.dimension.spawnEntity("minecraft:xp_orb", location);
                    }
                }
            }
        }
        for (const item of items) {
            const itemId = item.typeId.replace("minecraft:", "").toLowerCase();
            const isInList = filteredItemsList.includes(itemId);

            // Whitelist: pickup if in list. Blacklist: pickup if not in list.
            const shouldPickup = isWhitelist ? isInList : !isInList;

            if (shouldPickup) {
                CTsAPI.utils.addItem(player, item);
            } else {
                player.dimension.spawnItem(item, location);
            }
        }
    }
}

moduleManager.registerModule(new AutoPickup());
