import { EquipmentSlot, ItemDyeableComponent, ItemStack, ItemUseBeforeEvent, Player, system, world } from "@minecraft/server";
import { Module, moduleManager } from "../mainCore.js";

class DynamicLightModule extends Module {
    constructor() {
        super(
            "Dynamic Light",
            "Provides a dynamic light source that follows the player, illuminating dark areas.",
            "A floating light source follows you around, brightening your surroundings.",
            true,
            "textures/items/light_block_15.png",
        );
        this.settings = {
            // Add a light setting when it true that it always use maximum light level
            offHandQuickMove: {
                type: "toggle",
                label: "Offhand Quick Move",
                tooltip: "If enabled, sneaking and using a light source will quickly move it to your offhand for easier access.",
            },
            light: {
                type: "toggle",
                label: "Use Maximum Light Level",
                tooltip: "If enabled, the dynamic light will always use the highest light level, otherwise it will use the light level of the held item.",
            },
            hatLight: {
                type: "toggle",
                label: "Hat Light Path",
                tooltip: "If enabled, wearing an excavator hat will create a path of light blocks from your head to the block you're looking at.",
            },
            hatDistance: {
                type: "slider",
                label: "Hat Light Distance",
                tooltip: "The maximum distance for the hat light path.",
                min: 5,
                max: 60,
                step: 1,
            },
            takeDurability: {
                type: "toggle",
                label: "Hat Durability Loss",
                tooltip: "If enabled, the excavator hat will lose durability over time when the hat light path is active.",
            },
        };
        this.takeDurability = false; // Default value
        this.light = false; // Default value
        this.offHandQuickMove = false; // Default value
        this.hatLight = false; // Default value
        this.hatDistance = 15; // Default value
        this.propKey = "essential++:dynamic_light";
        this.updateInterval = 1;
    }

    async tick() {
        if (!this.isEnabled) {
            if (!this.cleanupDone) {
                for (const player of world.getPlayers()) {
                    // Cleanup for held item
                    const lightPos = player.getDynamicProperty(this.propKey) ?? player.getDynamicProperty("essentialpp:dynamic_light");
                    if (lightPos) {
                        try {
                            const block = player.dimension.getBlock(lightPos);
                            if (block && !block.isAir && block.typeId?.includes("light_block")) {
                                block.setType("minecraft:air");
                            }
                        } catch (e) { }
                    }
                    player.setDynamicProperty(this.propKey, undefined);
                    player.setDynamicProperty("essentialpp:dynamic_light", undefined);
                    if (player.hasTag("dynamic_light")) player.removeTag("dynamic_light");

                    // Cleanup for hat item
                    this.cleanupLightPath(player);
                }
                this.cleanupDone = true;
            }
            return;
        }

        if (this.cleanupDone) {
            this.cleanupDone = false;
        }

        if (system.currentTick % this.updateInterval !== 0) return;
        for (const player of world.getPlayers()) {
            const equippable = player.getComponent("equippable");
            const helmet = equippable?.getEquipment(EquipmentSlot.Head);

            const invComp = player.getComponent("inventory");
            let offHandItem;
            try {
                offHandItem = equippable?.getEquipment(EquipmentSlot.Offhand);
            } catch { }
            const inv = invComp?.container;
            const heldItem = inv?.getItem(player.selectedSlotIndex);

            const isUsingHatLogic = helmet?.getTags()?.includes("es:light") || heldItem?.typeId === "es:flashlight_on" || offHandItem?.typeId === "es:flashlight_on";

            if (this.hatLight && isUsingHatLogic) {
                const drainInterval = Math.max(5, 65 - this.hatDistance);
                if (system.currentTick % drainInterval === 0 && this.takeDurability && !heldItem?.typeId.includes("flashlight") && !offHandItem?.typeId.includes("flashlight")) {
                    CTsAPI.utils.increaseDurabilityArmor(player, helmet, 1);
                }

                const headLocation = player.getHeadLocation();
                const viewDirection = player.getViewDirection();

                const blockHit = player.getBlockFromViewDirection({ maxDistance: this.hatDistance });
                let endPoint;
                if (blockHit) {
                    endPoint = blockHit.block.center();
                } else {
                    endPoint = CTsAPI.vector.add(headLocation, CTsAPI.vector.multiply(viewDirection, this.hatDistance));
                }
                this.createLightPath(player, endPoint);
                // Skip the rest of the logic for this player to prevent conflicts
                continue;
            } else {
                // If not wearing hat, ensure any old path is cleaned up
                this.cleanupLightPath(player);
            }

            const hasLightTag = player.hasTag("dynamic_light");
            const holdingTorch = this.isHoldingLight(player);
            let isCrawling = player.getHeadLocation().y - player.location.y < 0.5;
            if (holdingTorch && !hasLightTag) {
                player.addTag("dynamic_light");
                const desired = { x: Math.floor(player.location.x), y: Math.floor(player.location.y) + (isCrawling ? 0 : 1), z: Math.floor(player.location.z) };
                const desiredBlock = player.dimension.getBlock(desired);
                const placePos = this.canPlaceLight(desiredBlock) ? desired : this.findPlacementPos(player, desired);
                if (placePos) {
                    const block = player.dimension.getBlock(placePos);
                    if (block) {
                        block.setType(`minecraft:light_block_${this.light ? 15 : holdingTorch}`);
                        player.setDynamicProperty(this.propKey, placePos);
                    }
                }
            } else if (!holdingTorch && hasLightTag) {
                const lightPos = player.getDynamicProperty(this.propKey) ?? player.getDynamicProperty("essentialpp:dynamic_light");
                if (lightPos) {
                    const block = player.dimension.getBlock(lightPos);
                    if (block && !block.isAir && block.typeId?.includes("light_block")) {
                        block.setType("minecraft:air");
                    }
                }
                player.setDynamicProperty(this.propKey, undefined);
                player.setDynamicProperty("essentialpp:dynamic_light", undefined);
                player.removeTag("dynamic_light");
            } else if (holdingTorch && hasLightTag) {
                const lightPos = player.getDynamicProperty(this.propKey) ?? player.getDynamicProperty("essentialpp:dynamic_light");
                const desired = { x: Math.floor(player.location.x), y: Math.floor(player.location.y) + (isCrawling ? 0 : 1), z: Math.floor(player.location.z) };
                const desiredBlock = player.dimension.getBlock(desired);
                const currentPos = this.canPlaceLight(desiredBlock) ? desired : (this.findPlacementPos(player, desired) ?? desired);
                const same = !!lightPos && lightPos.x === currentPos.x && lightPos.y === currentPos.y && lightPos.z === currentPos.z;
                if (!same) {
                    const newBlock = player.dimension.getBlock(currentPos);
                    if (newBlock && (newBlock.isAir || this.isWater(newBlock))) {
                        newBlock.setType(`minecraft:light_block_${this.light ? 15 : holdingTorch}`);
                        if (lightPos) {
                            const oldBlock = player.dimension.getBlock(lightPos);
                            if (oldBlock && !oldBlock.isAir && oldBlock.typeId?.includes("light_block")) {
                                oldBlock.setType("minecraft:air");
                            }
                        }
                        player.setDynamicProperty(this.propKey, currentPos);
                        player.setDynamicProperty("essentialpp:dynamic_light", undefined);
                    }
                }
            }
        }
    }
    /**
     *
     * @param {ItemUseBeforeEvent} event
     */
    onItemUse(event) {
        if (!this.isEnabled) return;
        if (!this.offHandQuickMove) return;
        let itemStack = event.itemStack;

        let player = event.source;
        system.run(() => {
            if (itemStack && itemStack.typeId.includes("flashlight") && !player.isSneaking) {
                let inv = player.getComponent("minecraft:inventory").container;
                if (inv) {
                    if (itemStack.typeId === "es:flashlight") {
                        inv.setItem(player.selectedSlotIndex, new ItemStack("es:flashlight_on", itemStack.amount));
                    } else if (itemStack.typeId === "es:flashlight_on") {
                        inv.setItem(player.selectedSlotIndex, new ItemStack("es:flashlight", itemStack.amount));
                    }
                }
            }
        });
        if (!player.isSneaking) return;
        if (this.isSelectedLightSource(player, itemStack) || itemStack.typeId.includes("flashlight")) {
            event.cancel = true;
            system.run(() => {
                this.tryMoveHeldToOffhand(player);
            });
        }
        event.handled = true;
    }

    createLightPath(player, endVec) {
        const dimension = player.dimension;
        const pathKey = "essential++:hat_light_path";
        const startVec = player.getHeadLocation();

        // 1. Get old path locations
        let oldPathSet = new Set();
        const oldPathJSON = player.getDynamicProperty(pathKey);
        if (oldPathJSON && typeof oldPathJSON === "string") {
            try {
                oldPathSet = new Set(JSON.parse(oldPathJSON));
            } catch { }
        }

        // 2. Get new path locations
        let newPathSet = new Set();
        const direction = CTsAPI.vector.subtract(endVec, startVec).normalized();
        const distance = Math.min(CTsAPI.vector.distance(startVec, endVec), this.hatDistance);

        for (let i = 0; i < distance; i += 3) {
            const point = CTsAPI.vector.add(startVec, CTsAPI.vector.multiply(direction, i));
            const blockPos = { x: Math.floor(point.x), y: Math.floor(point.y), z: Math.floor(point.z) };
            newPathSet.add(`${blockPos.x},${blockPos.y},${blockPos.z}`);
        }
        const finalBlockPos = { x: Math.floor(endVec.x), y: Math.floor(endVec.y), z: Math.floor(endVec.z) };
        newPathSet.add(`${finalBlockPos.x},${finalBlockPos.y},${finalBlockPos.z}`); // Also add the final block

        // 3. Find blocks to remove (in old but not new)
        for (const locString of oldPathSet) {
            if (!newPathSet.has(locString)) {
                const [x, y, z] = locString.split(",").map(Number);
                try {
                    const block = dimension.getBlock({ x, y, z });
                    if (block && block.typeId.includes("light_block")) {
                        block.setType("minecraft:air");
                    }
                } catch (e) { }
            }
        }

        // 4. Find blocks to add (in new but not old)
        for (const locString of newPathSet) {
            if (!oldPathSet.has(locString)) {
                const [x, y, z] = locString.split(",").map(Number);
                try {
                    const block = dimension.getBlock({ x, y, z });
                    if (block && this.canPlaceLight(block)) {
                        block.setType(`minecraft:light_block_15`);
                    }
                } catch (e) { }
            }
        }

        // 5. Save new path
        player.setDynamicProperty(pathKey, JSON.stringify(Array.from(newPathSet)));
    }

    cleanupLightPath(player) {
        const pathKey = "essential++:hat_light_path";
        const pathJSON = player.getDynamicProperty(pathKey);

        if (pathJSON && typeof pathJSON === "string") {
            this.removeLightsFromPath(player.dimension, pathJSON);
            player.setDynamicProperty(pathKey, undefined);
        }
    }

    /**
     *
     * @param {Player} player
     * @returns
     */
    tryMoveHeldToOffhand(player) {
        try {
            const inv = player.getComponent("inventory")?.container;
            const equip = player.getComponent("equippable");
            if (!inv || !equip) return;

            const slot = player.selectedSlotIndex;
            const heldItem = inv.getItem(slot);
            if (!heldItem) return;

            const isShield = heldItem.typeId === "minecraft:shield";
            if (!this.isSelectedLightSource(player, heldItem) && !isShield && !heldItem.typeId.includes("flashlight")) return;

            const offhandItem = equip.getEquipment(EquipmentSlot.Offhand);

            if (offhandItem && offhandItem.typeId === heldItem.typeId) {
                return;
            }

            if (heldItem.amount > 1 && !isShield) {
                const toOffhand = heldItem.clone();
                toOffhand.amount = 1;

                heldItem.amount -= 1;

                player.runCommand(`replaceitem entity @s slot.weapon.offhand 0 ${toOffhand.typeId} ${toOffhand.amount}`);
                inv.setItem(slot, heldItem);

                if (offhandItem) {
                    const leftover = inv.addItem(offhandItem);
                    if (leftover) {
                        player.dimension.spawnItem(leftover, player.location);
                    }
                }
            } else {
                player.runCommand(`replaceitem entity @s slot.weapon.offhand 0 ${heldItem.typeId} ${heldItem.amount}`);
                inv.setItem(slot, offhandItem);
            }

            player.playSound("armor.equip_generic", { volume: 2, pitch: 1.0, location: player.location });
        } catch (e) {
            console.warn(`[DynamicLight] Error: ${e} ${e.stack}`);
        }
    }

    isWater(block) {
        const id = block?.typeId || "";
        return id.includes("water");
    }

    canPlaceLight(block) {
        if (!block) return false;
        return block.isAir || this.isWater(block) || block.typeId.includes("light_block");
    }

    findPlacementPos(player, desired) {
        const dim = player.dimension;
        const offsets = [
            { x: 0, y: 0, z: 0 },
            { x: 0, y: 1, z: 0 },
            { x: 0, y: -1, z: 0 },
            { x: 0, y: 2, z: 0 },
            { x: 1, y: 0, z: 0 },
            { x: -1, y: 0, z: 0 },
            { x: 0, y: 0, z: 1 },
            { x: 0, y: 0, z: -1 },
        ];
        for (const off of offsets) {
            try {
                const pos = { x: desired.x + off.x, y: desired.y + off.y, z: desired.z + off.z };
                const b = dim.getBlock(pos);
                if (this.canPlaceLight(b)) return pos;
                // return pos;
            } catch { }
        }
        return null;
    }
    /**
     *
     * @param {Player} player
     * @returns
     */
    isHoldingLight(player) {
        const invComp = player.getComponent("inventory");
        const offHandComp = player.getComponent("equippable");
        const inv = invComp?.container;
        const offHand = offHandComp?.getEquipment(EquipmentSlot.Offhand);
        const item = inv?.getItem(player.selectedSlotIndex);
        const id = item?.typeId;
        const offHandId = offHand?.typeId;
        if (!id && !offHandId) return false;
        const sources = Array.from(this.lightSources());
        for (const [typeId, lightLevel] of sources) {
            if (typeId.startsWith("minecraft:") && (id === typeId || offHandId === typeId)) {
                return lightLevel;
            }
        }
        for (const [typeId, lightLevel] of sources) {
            if (!typeId.startsWith("minecraft:") && (id?.includes(typeId) || offHandId?.includes(typeId))) {
                return lightLevel;
            }
        }
        return false;
    }

    // Only checks the currently selected main-hand item
    isSelectedLightSource(player, itemStack = null) {
        const invComp = player.getComponent("inventory");
        const inv = invComp?.container;
        const item = itemStack || inv?.getItem(player.selectedSlotIndex);
        const id = item?.typeId;
        if (!id) return false;
        if (id === "minecraft:shield") return true; // Shields block light
        if (id?.includes("es:flashlight")) return true;
        const sources = Array.from(this.lightSources());
        for (const [typeId] of sources) {
            if (typeId.startsWith("minecraft:") && id === typeId) return true;
        }
        for (const [typeId] of sources) {
            if (!typeId.startsWith("minecraft:") && id?.includes(typeId)) return true;
        }
        return false;
    }

    lightSources() {
        return new Set([
            ["torch", 15],
            ["minecraft:redstone_torch", 7],
            ["minecraft:enchanting_table", 7],
            ["lantern", 15],
            // ["es:flashlight_on", 15],
            ["froglight", 15],
            ["minecraft:soul_lantern", 10],
            ["minecraft:sea_lantern", 15],
            ["minecraft:glowstone", 15],
            ["minecraft:shroomlight", 15],
            ["minecraft:end_rod", 14],
            ["minecraft:campfire", 15],
            ["minecraft:soul_campfire", 10],
            ["minecraft:magma", 5],
            ["minecraft:beacon", 15],
            ["minecraft:lit_pumpkin", 15],
            ["minecraft:lava_bucket", 15],
            ["minecraft:light_block_0", 15],
            ["minecraft:glow_lichen", 7],
        ]);
    }
    removeLightsFromPath(dimension, pathJSON) {
        try {
            const pathBlocks = JSON.parse(pathJSON);
            for (const locString of pathBlocks) {
                const [x, y, z] = locString.split(",").map(Number);
                try {
                    const block = dimension.getBlock({ x, y, z });
                    if (block && block.typeId.includes("light_block")) {
                        block.setType("minecraft:air");
                    }
                } catch (e) { }
            }
        } catch { }
    }
}

moduleManager.registerModule(new DynamicLightModule());
