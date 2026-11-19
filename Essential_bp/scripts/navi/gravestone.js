import {
    world,
    system,
    Player,
    EquipmentSlot,
    EntityDieAfterEvent,
    Block,
    BlockPermutation,
    EntityHurtAfterEvent,
    EntityHurtBeforeEvent,
    CommandPermissionLevel,
    PlayerBreakBlockBeforeEvent,
} from "@minecraft/server";
import { ActionFormData } from "@minecraft/server-ui";
import { Module, moduleManager } from "../mainCore.js";
import { ACTION_FORM_TAG } from "../uiTags.js";

class GravestoneModule extends Module {
    constructor() {
        super(
            "Gravestone",
            "Stores your items in a gravestone when you die.",
            "Owner-only access. Gravestones despawn after a set time.",
            false,
            "textures/ui/gravestone_icon.png",
        );

        this.settings = {
            despawnMinutes: {
                type: "slider",
                label: "Gravestone Despawn Time (Minutes)",
                min: 1,
                max: 120,
                step: 1,
                tooltip: "How long until a gravestone despawn.",
            },
            gravestoneStyle: {
                type: "dropdown",
                label: "Gravestone Style",
                default: 0,
                options: ["Steve", "xVoid", "Patrick", "No Head"],
                tooltip: "Choose the visual style of the gravestone.",
            },
            disableBeam: {
                type: "toggle",
                label: "Disable Beacon Beam on Gravestones",
                tooltip: "Disables the beacon beam effect on gravestones.",
            },
            beamStyle: {
                type: "dropdown",
                label: "Gravestone Beam Style",
                default: 0,
                options: ["§fWhite", "§aLime", "§6Orange", "§7light Gray", "§eYellow", "§bAqua", "§1Blue", "§4Red", "§0Black", "§nBrown"],
                tooltip: "Choose the visual style of the gravestone beacon beam.",
            },
            placeOnHighestBlock: {
                type: "toggle",
                label: "Place on Highest Block",
                tooltip: "If enabled, gravestones will spawn at the highest possible Y level (surface). Otherwise, it spawns at your exact death elevation.",
            },
            resetGravestoneData: {
                type: "toggle",
                label: "Reset Gravestone Data",
                tooltip: "Deletes all existing gravestone data. Use this if you want to remove old gravestones or fix issues with them.",
            },
        };
        this.isEnabled = false; // Default value
        this.despawnMinutes = 30; // Default value
        this.disableBeam = false;
        this.gravestoneStyle = 0; // Default value
        this.beamStyle = 0; // Default value
        this.placeOnHighestBlock = true; // Default value
        this.gravestonesKey = "essential++:gravestones"; // New key for entity-based system
        this.resetGravestoneData = false;
        this.breakPriority = -10;

        this.originalKeepInventory = false; // To store the original gamerule value
        this._onEntityHurt = this._onEntityHurt.bind(this);
    }

    onLoad() {
        this.originalKeepInventory = world.gameRules.keepInventory || false;
        world.gameRules.keepInventory = true;
        world.beforeEvents.entityHurt.subscribe(this._onEntityHurt);

        if (this.resetGravestoneData) {
            world.setDynamicProperty(this.gravestonesKey, JSON.stringify({}));
            world.gameRules.keepInventory = false;
            this.resetGravestoneData = false; // Reset the toggle after use
            console.warn("[Gravestone] Gravestone data has been reset.");
        }
    }

    onUnload() {
        world.gameRules.keepInventory = this.originalKeepInventory;
        console.warn(`[Gravestone] Restored keepInventory gamerule to ${this.originalKeepInventory}`);
        world.beforeEvents.entityHurt.unsubscribe(this._onEntityHurt);
    }

    _getGravestones() {
        const data = world.getDynamicProperty(this.gravestonesKey);
        if (typeof data === "string") {
            try {
                return JSON.parse(data);
            } catch (e) {
                console.error("[Gravestone] Failed to parse gravestone data.", e);
                return {};
            }
        }
        return {};
    }
    /**
     *
     * @param {PlayerBreakBlockBeforeEvent} event
     * @returns
     */
    onPlayerBreak(event) {
        if (event.cancel) return;
        const { block, player } = event;
        if (block.typeId !== "es:gravestone_block") return;
        event.handled = true;
        event.cancel = true;
        if (player.getGameMode() != "Creative") return recoverGraveItems(player, block, player.dimension.id, event);
        system.run(() => {
            let form = new ActionFormData();
            form.title(`${ACTION_FORM_TAG}Break Gravestone?`);
            form.body("Breaking the gravestone will permanently delete it and its contents. Are you sure you want to do this?");
            form.button("No, keep it");
            form.button("Yes, break it");
            form.show(player).then((response) => {
                if (response.selection === 1) {
                    const gravestoneModule = moduleManager.modules.get("Gravestone");
                    const gravestones = gravestoneModule._getGravestones();
                    const locationString = `${block.location.x},${block.location.y},${block.location.z}`;
                    const key = `${locationString},${player.dimension.id}`;
                    const grave = gravestones[key];
                    if (grave) {
                        try {
                            if (grave.structureName) {
                                world.structureManager.delete(grave.structureName);
                            }
                            const entity = world.getEntity(grave.entityId);
                            const beamEntity = world.getEntity(grave.beamId);
                            if (entity) entity.remove();
                            if (beamEntity) beamEntity.remove();
                            block.setType("minecraft:air");
                        } catch (e) {
                            console.error(`[Gravestone] Failed to break gravestone at ${key}: ${e}`);
                        }
                        delete gravestones[key];
                        gravestoneModule._saveGravestones(gravestones);
                        CTsAPI.msg.sendSuccessMessage(player, "§7The gravestone has been broken and removed.");
                    } else {
                        CTsAPI.msg.sendErrorMessage(player, "§cFailed to find gravestone data. The block will be removed, but the gravestone entity may still exist.");
                        block.setType("minecraft:air");
                    }
                } else {
                    CTsAPI.msg.sendInfoMessage(player, "§7The gravestone will remain intact.");
                }
            });
        });
    }

    _saveGravestones(gravestones) {
        world.setDynamicProperty(this.gravestonesKey, JSON.stringify(gravestones));
    }
    /**
     *
     * @param {EntityHurtBeforeEvent} event
     * @returns
     */
    _onEntityHurt(event) {
        const player = event.hurtEntity;
        if (player.typeId !== "minecraft:player") return;
        if (!this.isEnabled) return;

        const health = player.getComponent("minecraft:health");
        if (health && event.damage >= health.currentValue) {
            const equippable = player.getComponent("equippable");
            const offhand = equippable?.getEquipment(EquipmentSlot.Offhand);
            const mainhand = equippable?.getEquipment(EquipmentSlot.Mainhand);
            if (offhand?.typeId === "minecraft:totem_of_undying" || mainhand?.typeId === "minecraft:totem_of_undying") {
                return;
            }

            const inventory = player.getComponent("inventory")?.container;
            const itemsToStore = [];

            if (inventory) {
                for (let i = 0; i < inventory.size; i++) {
                    const item = inventory.getItem(i);
                    if (item && !item.keepOnDeath) {
                        itemsToStore.push({ item: item.clone(), originalSlot: i });
                    }
                }
            }

            const equipmentSlots = [EquipmentSlot.Head, EquipmentSlot.Chest, EquipmentSlot.Legs, EquipmentSlot.Feet, EquipmentSlot.Offhand];
            if (equippable) {
                for (let i = 0; i < equipmentSlots.length; i++) {
                    const slot = equipmentSlots[i];
                    const item = equippable.getEquipment(slot);
                    if (item && !item.keepOnDeath) {
                        itemsToStore.push({ item: item.clone(), originalSlot: 36 + i });
                    }
                }
            }

            const xpToStore = getTotalExperience(player);
            const deathLocation = { x: player.location.x, y: player.location.y, z: player.location.z };
            const dimension = player.dimension;

            system.run(() => {
                const newHealth = player.getComponent("minecraft:health");
                if (newHealth && newHealth.currentValue <= 0) {
                    this._createGravestone(player, itemsToStore, xpToStore, deathLocation, dimension);
                }
            });
        }
    }

    _saveGraveToStructure(player, dim, items, xp, slotMapping, deathLocation) {
        let safeY = 315;
        try {
            if (dim.heightRange) safeY = dim.heightRange.max - 5;
            else if (dim.id === "minecraft:nether") safeY = 120;
            else if (dim.id === "minecraft:the_end") safeY = 250;
        } catch {}

        const loc = { x: Math.floor(deathLocation.x), y: safeY, z: Math.floor(deathLocation.z) };
        let structureName = null;
        let entity = null;

        try {
            entity = dim.spawnEntity("es:gravestone_entity", { x: loc.x + 0.5, y: loc.y, z: loc.z + 0.5 });
            const inv = entity.getComponent("inventory").container;

            let graveSlotIndex = 0;
            for (const data of items) {
                if (graveSlotIndex < inv.size) {
                    inv.setItem(graveSlotIndex, data.item);
                    graveSlotIndex++;
                } else {
                    const leftover = inv.addItem(data.item);
                    if (leftover) dim.spawnItem(leftover, deathLocation);
                }
            }
            entity.setDynamicProperty("es:slotMapping", JSON.stringify(slotMapping));
            entity.setDynamicProperty("es:xp", xp);

            const id = String(player.id)
                .replace(/[^a-z0-9_]/gi, "_")
                .toLowerCase();
            const rand = Math.floor(Math.random() * 1000000);
            structureName = `es_grave:${id}_${Date.now()}_${rand}`.slice(0, 120);

            world.structureManager.createFromWorld(structureName, dim, loc, { x: loc.x, y: loc.y + 1, z: loc.z }, { includeBlocks: false, includeEntities: true });
        } catch (e) {
            console.error(`[Gravestone] Error saving to structure: ${e} ${e.stack}`);
            structureName = null;
        } finally {
            if (entity && entity.isValid) entity.remove();
        }
        return structureName;
    }

    _createGravestone(player, itemsToStore, xpToStore, deathLocation, dimension) {
        if (!this.isEnabled) return;

        if (player && player.isValid) {
            const inventory = player.getComponent("inventory")?.container;
            const equippable = player.getComponent("equippable");

            if (inventory) {
                for (let i = 0; i < inventory.size; i++) {
                    const item = inventory.getItem(i);
                    if (item && !item.keepOnDeath) inventory.setItem(i, undefined);
                }
            }
            const equipmentSlots = [EquipmentSlot.Head, EquipmentSlot.Chest, EquipmentSlot.Legs, EquipmentSlot.Feet, EquipmentSlot.Offhand];
            if (equippable) {
                for (const slot of equipmentSlots) {
                    const item = equippable.getEquipment(slot);
                    if (item && !item.keepOnDeath) equippable.setEquipment(slot, undefined);
                }
            }
            player.resetLevel();
        }

        if (itemsToStore.length === 0 && xpToStore === 0) {
            if (player?.isValid) CTsAPI.msg.sendInfoMessage(player, "§7You died, but had no items or experience to save in a gravestone.");
            return;
        }

        const searchX = Math.floor(deathLocation.x);
        const searchZ = Math.floor(deathLocation.z);
        let graveLocationY = Math.floor(deathLocation.y);
        let surfaceIsFluid = false;

        let startY = this.placeOnHighestBlock ? dimension.heightRange.max : Math.floor(deathLocation.y);
        if (dimension.id === "minecraft:nether" && startY > Math.floor(deathLocation.y)) {
            startY = Math.floor(deathLocation.y);
        }

        for (let y = startY; y >= dimension.heightRange.min; y--) {
            try {
                const block = dimension.getBlock({ x: searchX, y: y, z: searchZ });
                if (block && !block.isAir) {
                    graveLocationY = y + 1;
                    surfaceIsFluid = block.isLiquid;
                    break;
                }
            } catch (e) {
                /* Ignore errors from unloaded chunks */
            }
        }
        const blockLocation = { x: searchX, y: Math.max(graveLocationY, dimension.heightRange.min), z: searchZ };

        try {
            if (surfaceIsFluid) {
                for (let dx = -1; dx <= 1; dx++) {
                    for (let dz = -1; dz <= 1; dz++) {
                        try {
                            dimension.setBlockType({ x: blockLocation.x + dx, y: blockLocation.y - 1, z: blockLocation.z + dz }, "minecraft:dirt");
                        } catch (e) {
                            console.warn(`[Gravestone] Failed to place platform block at ${blockLocation.x + dx},${blockLocation.y - 1},${blockLocation.z + dz}: ${e}`);
                        }
                    }
                }
            }

            const slotMapping = {};
            const itemsToSave = [];
            let index = 0;
            for (const data of itemsToStore) {
                itemsToSave.push({ item: data.item });
                slotMapping[index] = data.originalSlot;
                index++;
            }

            const structureName = this._saveGraveToStructure(player, dimension, itemsToSave, xpToStore, slotMapping, deathLocation);

            let graveEntityId = null;
            let beamEntityId = null;

            try {
                const graveEntity = dimension.spawnEntity("es:gravestone_entity", { x: blockLocation.x + 0.5, y: blockLocation.y + 1, z: blockLocation.z + 0.5 });
                graveEntity.nameTag = `§6${player.name}'s Grave`;
                graveEntityId = graveEntity.id;

                if (!this.disableBeam) {
                    const beamEntity = dimension.spawnEntity("es:beam", { x: blockLocation.x + 0.5, y: blockLocation.y, z: blockLocation.z + 0.5 });
                    beamEntity.setProperty("es:color_index", this.beamStyle);
                    player.setPropertyOverrideForEntity(beamEntity, "es:show", true);
                    beamEntityId = beamEntity.id;
                }
            } catch (e) {
                console.error("[Gravestone] Failed to spawn visuals: " + e);
            }

            let graveBlock = dimension.getBlock(blockLocation);
            if (graveBlock) graveBlock.setPermutation(BlockPermutation.resolve("es:gravestone_block", { "es:style": this.gravestoneStyle }));

            const gravestones = this._getGravestones();
            const locationString = `${blockLocation.x},${blockLocation.y},${blockLocation.z}`;
            const key = `${locationString},${dimension.id}`;

            gravestones[key] = {
                ownerId: player.id,
                ownerName: player.name,
                entityId: graveEntityId,
                beamId: beamEntityId,
                structureName: structureName,
                despawnTimestamp: Date.now() + this.despawnMinutes * 60 * 1000,
            };
            this._saveGravestones(gravestones);
            if (player?.isValid) CTsAPI.msg.sendSuccessMessage(player, `§7Your items and experience are safe in a gravestone at §b${locationString?.replace(/,/g, " ")}§7.`);
        } catch (e) {
            console.error(`[Gravestone] Failed to create gravestone: ${e} ${e.stack}`);
            if (player?.isValid) CTsAPI.msg.sendErrorMessage(player, "§cFailed to create a gravestone. Your items have been dropped at a safe location nearby.");

            const safeY = Math.max(Math.min(graveLocationY - 1, dimension.heightRange.max), dimension.heightRange.min);
            const safeSpawnLoc = { x: blockLocation.x + 0.5, y: safeY, z: blockLocation.z + 0.5 };
            for (const data of itemsToStore) {
                try {
                    dimension.spawnItem(data.item, safeSpawnLoc);
                } catch (spawnError) {
                    console.error(`[Gravestone] Failed to spawn fallback item: ${spawnError}`);
                }
            }
            if (xpToStore > 0 && player?.isValid) {
                player.addExperience(xpToStore);
            }
        }
    }
    /**
     *
     * @param {string} key
     * @param {Location} playerPos
     * @param {Player} player
     * @returns
     */
    async _createBeam(key, playerPos, player) {
        await system.waitTicks(5);
        const gravestones = this._getGravestones();
        const grave = gravestones[key];
        // If grave was removed while waiting, exit.
        if (!grave) return;

        const [, , , dimensionId] = key.split(",");
        const dimension = world.getDimension(dimensionId);

        try {
            const beamEntity = dimension.spawnEntity("es:beam", playerPos);
            beamEntity.setProperty("es:color_index", this.beamStyle);
            player.setPropertyOverrideForEntity(beamEntity, "es:show", true);
            grave.beamId = beamEntity.id;
            this._saveGravestones(gravestones); // Save the updated gravestones object
        } catch (e) {
            console.error(`[Gravestone] Failed to spawn new beam for grave at ${key}: ${e} ${e.stack}`);
        }
    }

    async tick() {
        if (system.currentTick % 100 !== 0) return; // Check every 5 seconds
        const gravestones = this._getGravestones();
        const now = Date.now();
        let changed = false;

        for (const key of Object.keys(gravestones)) {
            const grave = gravestones[key];
            const entity = world.getEntity(grave.entityId);
            const beamEntity = world.getEntity(grave.beamId);
            if (beamEntity && this.disableBeam) {
                beamEntity.remove();
            }
            let time = CTsAPI.utils.formatTimeFull(grave.despawnTimestamp / 1000 - now / 1000);
            if (entity) entity.nameTag = `§b${grave.ownerName}'s§6 Grave\n${time}`;

            if (now > grave.despawnTimestamp) {
                const [x, y, z, dimensionId] = key.split(",");
                const location = { x: parseInt(x), y: parseInt(y), z: parseInt(z) };
                const tickingAreaId = ("es:tick" + grave.entityId).slice(0, 32);

                delete gravestones[key];
                changed = true;

                try {
                    await world.tickingAreaManager.createTickingArea(tickingAreaId, { dimension: world.getDimension(dimensionId), from: location, to: location });
                    const dimension = world.getDimension(dimensionId);

                    if (grave.structureName) {
                        world.structureManager.place(grave.structureName, dimension, location);
                        const entities = dimension.getEntitiesAtBlockLocation(location);
                        const savedEntity = entities.find((e) => e.typeId === "es:gravestone_entity" && e.getDynamicProperty("es:slotMapping"));
                        if (savedEntity) {
                            const graveInventory = savedEntity.getComponent("inventory").container;
                            for (let i = 0; i < graveInventory.size; i++) {
                                const item = graveInventory.getItem(i);
                                if (item) dimension.spawnItem(item, location);
                            }
                            savedEntity.remove();
                        }
                        world.structureManager.delete(grave.structureName);
                    } else if (entity) {
                        const graveInventory = entity.getComponent("inventory").container;
                        for (let i = 0; i < graveInventory.size; i++) {
                            const item = graveInventory.getItem(i);
                            if (item) dimension.spawnItem(item, location);
                        }
                    }

                    if (entity) entity.remove();
                    if (beamEntity) beamEntity.remove();

                    const block = dimension.getBlock(location);
                    if (block?.typeId === "es:gravestone_block") {
                        block.setType("minecraft:air");
                    }
                } catch (e) {
                    console.error(`[Gravestone] Error removing expired gravestone at ${key}: ${e.stack ?? e}`);
                } finally {
                    try {
                        await world.tickingAreaManager.removeTickingArea(tickingAreaId);
                    } catch (e) {}
                }
            }
        }

        if (changed) this._saveGravestones(gravestones);
    }

    async showGravesMenu(player) {
        const gravestones = this._getGravestones();
        const myGraves = Object.entries(gravestones).filter(([key, grave]) => grave.ownerId === player.id);

        if (myGraves.length === 0) {
            CTsAPI.msg.sendInfoMessage(player, "§7You have no active gravestones.");
            return;
        }

        const form = new ActionFormData();
        form.title(`${ACTION_FORM_TAG}My Gravestones`);
        form.body("Select a gravestone to view details or recover items.");

        myGraves.forEach(([key, grave]) => {
            const [x, y, z, dim] = key.split(",");
            const timeRemaining = Math.max(0, grave.despawnTimestamp - Date.now());
            const timeStr = CTsAPI.utils.formatTimeFull(timeRemaining / 1000);
            form.button(`§b${grave.ownerName}'s§r Grave: ${x}, ${y}, ${z}\n§8${dim.replace("minecraft:", "")} - ${timeStr}`, "textures/ui/gravestone_icon");
        });

        const { selection, canceled } = await form.show(player);
        if (canceled) return;

        const [selectedKey, selectedGrave] = myGraves[selection];
        this.showGraveDetailsMenu(player, selectedKey, selectedGrave);
    }

    async showGraveDetailsMenu(player, key, grave) {
        const [x, y, z, dimId] = key.split(",");
        const form = new ActionFormData();
        form.title(`${ACTION_FORM_TAG}Gravestone Details`);

        const timeRemaining = Math.max(0, grave.despawnTimestamp - Date.now());
        const timeStr = CTsAPI.utils.formatTimeFull(timeRemaining / 1000);
        form.body(`§7Name: §b${grave.ownerName}\n§7Location: §b${x}, ${y}, ${z}\n§7Dimension: §b${dimId.replace("minecraft:", "")}\n§7Despawns in: §b${timeStr}`);

        form.button("Recover Items (Emergency)", "textures/ui/refresh_light");
        form.button("Back", "textures/ui/arrow_left");

        const { selection, canceled } = await form.show(player);
        if (canceled) return;

        if (selection === 0) {
            this.recoverGraveManually(player, key, grave);
        } else {
            this.showGravesMenu(player);
        }
    }

    async recoverGraveManually(player, key, grave) {
        const gravestones = this._getGravestones();
        if (!gravestones[key]) {
            CTsAPI.msg.sendErrorMessage(player, "§cThis gravestone no longer exists.");
            return;
        }

        try {
            let storedXp = 0;
            const playerInventory = player.getComponent("inventory").container;
            const equippable = player.getComponent("equippable");
            let droppedItemCount = 0;

            const recoverItems = (sourceEntity) => {
                const graveInventory = sourceEntity.getComponent("inventory").container;
                const slotMappingStr = sourceEntity.getDynamicProperty("es:slotMapping");
                const slotMapping = slotMappingStr ? JSON.parse(slotMappingStr) : null;
                const equipmentSlots = [EquipmentSlot.Head, EquipmentSlot.Chest, EquipmentSlot.Legs, EquipmentSlot.Feet, EquipmentSlot.Offhand];

                for (let i = 0; i < graveInventory.size; i++) {
                    const item = graveInventory.getItem(i);
                    if (!item) continue;

                    let remainder = item;
                    let restored = false;

                    if (slotMapping && slotMapping[i] !== undefined) {
                        const origSlot = slotMapping[i];
                        if (origSlot < 36) {
                            const currentItem = playerInventory.getItem(origSlot);
                            if (!currentItem) {
                                playerInventory.setItem(origSlot, item);
                                restored = true;
                                remainder = undefined;
                            }
                        } else {
                            const eqSlotIndex = origSlot - 36;
                            const eqSlot = equipmentSlots[eqSlotIndex];
                            if (eqSlot) {
                                const currentEq = equippable.getEquipment(eqSlot);
                                if (!currentEq) {
                                    equippable.setEquipment(eqSlot, item);
                                    restored = true;
                                    remainder = undefined;
                                }
                            }
                        }
                    }

                    if (!restored && remainder) {
                        remainder = playerInventory.addItem(remainder);
                    }

                    if (remainder) {
                        player.dimension.spawnItem(remainder, player.location);
                        droppedItemCount++;
                    }
                }

                const xp = sourceEntity.getDynamicProperty("es:xp");
                if (typeof xp === "number" && xp > 0) storedXp += xp;
            };

            if (grave.structureName) {
                const dim = player.dimension;
                const tempLoc = { x: Math.floor(player.location.x), y: dim.heightRange.max - 5, z: Math.floor(player.location.z) };

                world.structureManager.place(grave.structureName, dim, tempLoc);

                const entities = dim.getEntities({ location: tempLoc, maxDistance: 5, type: "es:gravestone_entity" });
                const savedEntity = entities.find((e) => e.getDynamicProperty("es:slotMapping"));

                if (savedEntity) {
                    recoverItems(savedEntity);
                    savedEntity.remove();
                } else {
                    CTsAPI.msg.sendErrorMessage(player, "§cCould not find saved items in the structure.");
                }
                world.structureManager.delete(grave.structureName);
            } else {
                const visualEntity = world.getEntity(grave.entityId);
                if (visualEntity && visualEntity.getComponent("inventory")) {
                    recoverItems(visualEntity);
                }
            }

            if (storedXp > 0) player.addExperience(storedXp);
            if (droppedItemCount > 0) CTsAPI.msg.sendInfoMessage(player, "§eYour inventory was full§7, so some items were dropped on the ground.");

            const visualEntity = world.getEntity(grave.entityId);
            const beamEntity = world.getEntity(grave.beamId);
            if (visualEntity) visualEntity.remove();
            if (beamEntity) beamEntity.remove();

            const [x, y, z, dimId] = key.split(",");
            const graveDim = world.getDimension(dimId);
            try {
                const block = graveDim.getBlock({ x: parseInt(x), y: parseInt(y), z: parseInt(z) });
                if (block && block.typeId === "es:gravestone_block") {
                    block.setType("minecraft:air");
                }
            } catch (e) {}

            delete gravestones[key];
            this._saveGravestones(gravestones);
            CTsAPI.msg.sendSuccessMessage(player, "§7You have manually recovered your items.");
        } catch (e) {
            console.error(`[Gravestone] Failed to recover items manually: ${e} ${e.stack}`);
            CTsAPI.msg.sendErrorMessage(player, "§cAn error occurred while recovering items.");
        }
    }
}

system.beforeEvents.startup.subscribe(({ blockComponentRegistry, customCommandRegistry }) => {
    blockComponentRegistry.registerCustomComponent("es:gravestone", {
        onPlayerInteract: (event) => {
            const { block, player } = event;
            recoverGraveItems(player, block, player.dimension.id);
        },
    });

    customCommandRegistry.registerCommand(
        {
            name: "es:graves",
            description: "Manage your active gravestones.",
            permissionLevel: CommandPermissionLevel.Any,
            cheatsRequired: false,
        },
        (origin) => {
            const player = origin.sourceEntity;
            if (player?.typeId === "minecraft:player") {
                const gravestoneModule = moduleManager.modules.get("Gravestone");
                if (gravestoneModule?.isEnabled) {
                    system.run(() => gravestoneModule.showGravesMenu(player));
                } else {
                    CTsAPI.msg.sendErrorMessage(player, "§cThe Gravestone module is currently disabled.");
                }
            }
        },
    );
});

function recoverGraveItems(player, block, dimensionId, event = null) {
    const gravestoneModule = moduleManager.modules.get("Gravestone");
    if (!gravestoneModule?.isEnabled) return;

    const gravestones = gravestoneModule._getGravestones();
    const locationString = `${block.location.x},${block.location.y},${block.location.z}`;
    const key = `${locationString},${dimensionId}`;
    const grave = gravestones[key];
    if (grave) {
        if (grave.ownerId !== player.id) {
            if (event) {
                console.warn("D");
                event.cancel = true;
            }
            system.run(() => {
                CTsAPI.utils.actionBar(player, "§cThis is not your gravestone!");
            });
            return;
        }

        try {
            let storedXp = 0;
            const playerInventory = player.getComponent("inventory").container;
            const equippable = player.getComponent("equippable");
            let droppedItemCount = 0;

            const recoverItems = (sourceEntity) => {
                const graveInventory = sourceEntity.getComponent("inventory").container;
                const slotMappingStr = sourceEntity.getDynamicProperty("es:slotMapping");
                const slotMapping = slotMappingStr ? JSON.parse(slotMappingStr) : null;
                const equipmentSlots = [EquipmentSlot.Head, EquipmentSlot.Chest, EquipmentSlot.Legs, EquipmentSlot.Feet, EquipmentSlot.Offhand];

                for (let i = 0; i < graveInventory.size; i++) {
                    const item = graveInventory.getItem(i);
                    if (!item) continue;

                    let remainder = item;
                    let restored = false;

                    if (slotMapping && slotMapping[i] !== undefined) {
                        const origSlot = slotMapping[i];
                        if (origSlot < 36) {
                            const currentItem = playerInventory.getItem(origSlot);
                            if (!currentItem) {
                                playerInventory.setItem(origSlot, item);
                                restored = true;
                                remainder = undefined;
                            }
                        } else {
                            const eqSlotIndex = origSlot - 36;
                            const eqSlot = equipmentSlots[eqSlotIndex];
                            if (eqSlot) {
                                const currentEq = equippable.getEquipment(eqSlot);
                                if (!currentEq) {
                                    equippable.setEquipment(eqSlot, item);
                                    restored = true;
                                    remainder = undefined;
                                }
                            }
                        }
                    }

                    if (!restored && remainder) {
                        remainder = playerInventory.addItem(remainder);
                    }

                    if (remainder) {
                        player.dimension.spawnItem(remainder, block.location);
                        droppedItemCount++;
                    }
                }

                const xp = sourceEntity.getDynamicProperty("es:xp");
                if (typeof xp === "number" && xp > 0) storedXp += xp;
            };

            system.run(() => {
                if (grave.structureName) {
                    const dim = player.dimension;
                    const blockLoc = block.location;

                    world.structureManager.place(grave.structureName, dim, blockLoc);

                    const entities = dim.getEntitiesAtBlockLocation(blockLoc);
                    const savedEntity = entities.find((e) => e.typeId === "es:gravestone_entity" && e.getDynamicProperty("es:slotMapping"));

                    if (savedEntity) {
                        recoverItems(savedEntity);
                        savedEntity.remove();
                    } else {
                        system.run(() => {
                            CTsAPI.msg.sendErrorMessage(player, "§cCould not find saved items in the structure.");
                        });
                    }
                    world.structureManager.delete(grave.structureName);
                } else {
                    const visualEntity = world.getEntity(grave.entityId);
                    if (visualEntity && visualEntity.getComponent("inventory")) {
                        recoverItems(visualEntity);
                    }
                }

                if (storedXp > 0) player.addExperience(storedXp);
                if (droppedItemCount > 0) system.run(() => CTsAPI.msg.sendInfoMessage(player, "§eYour inventory was full§7, so some items were dropped on the ground."));

                const visualEntity = world.getEntity(grave.entityId);
                const beamEntity = world.getEntity(grave.beamId);
                if (visualEntity) visualEntity.remove();
                if (beamEntity) beamEntity.remove();
                block.setType("minecraft:air");
            });
        } catch (e) {
            console.error(`[Gravestone] Failed to recover items from grave at ${key}: ${e}`);
        }

        delete gravestones[key];
        gravestoneModule._saveGravestones(gravestones);

        system.run(() => {
            CTsAPI.msg.sendSuccessMessage(player, "§7You have recovered the items from your gravestone.");
        });
    }
}

export const lastPositions = new Map();
const beamsBeingCreated = new Set();

system.runInterval(() => {
    for (const player of world.getAllPlayers()) {
        if (system.currentTick % 100 == 0) {
            for (let en of world.getDimension(player.dimension.id).getEntities()) {
                if (en.typeId === "es:gravestone_entity") {
                    if (en.getBlockFromViewDirection()?.block?.typeId !== "es:gravestone_block") {
                        en.remove();
                    }
                }
            }
        }
        const gravestoneModule = moduleManager.modules.get("Gravestone");
        if (!gravestoneModule?.isEnabled || gravestoneModule.disableBeam) continue;
        const gravestones = gravestoneModule._getGravestones();
        for (const key of Object.keys(gravestones)) {
            const grave = gravestones[key];
            if (player.id !== grave.ownerId) continue;
            let entity = world.getEntity(grave.beamId);

            const [x, y, z, dimensionId] = key.split(",");
            const playerPos = { x: player.location.x, y: player.location.y, z: player.location.z };
            let waypointPos = { x: parseFloat(x) + 0.5, y: parseFloat(y), z: parseFloat(z) + 0.5 };
            let offsetPos = offset(playerPos, waypointPos);

            if (!entity?.isValid) {
                if (beamsBeingCreated.has(key)) continue; // Already processing this grave

                beamsBeingCreated.add(key);
                gravestoneModule._createBeam(key, offsetPos, player).finally(() => {
                    beamsBeingCreated.delete(key); // Remove lock when done, even if it fails
                });
                continue; // Skip to next grave, as this one is being handled
            }

            const distance = Math.floor(horizontalDistance(playerPos, waypointPos));
            if (lastPositions.get(entity.id) == distance) continue;
            lastPositions.set(entity.id, distance);
            const distanceEntity = horizontalDistance(playerPos, entity.location);
            if (distanceEntity > 34 + 16) {
                entity.tryTeleport(offsetPos, { rotation: { x: 0, y: 0 } });
            } else if (distance > 34) {
                entity.tryTeleport(offsetPos, { rotation: { x: 0, y: 0 } });
            } else {
                const nearPos = { x: waypointPos.x, y: player.location.y - 2, z: waypointPos.z };
                entity.tryTeleport(nearPos, { rotation: { x: 0, y: 0 } });
            }
        }
    }
}, 3);

export function offset(pointA, pointB) {
    const dx = pointB.x - pointA.x;
    const dz = pointB.z - pointA.z;
    const length = Math.sqrt(dx ** 2 + dz ** 2);
    if (length === 0) return { x: pointA.x, y: pointA.y, z: pointA.z };
    return {
        x: pointA.x + (dx / length) * 34,
        y: pointA.y,
        z: pointA.z + (dz / length) * 34,
    };
}

function horizontalDistance(a, b) {
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    return Math.sqrt(dx * dx + dz * dz);
}

function getExperienceForLevel(level) {
    if (level <= 16) {
        return level * level + 6 * level;
    } else if (level <= 31) {
        return 2.5 * level * level - 40.5 * level + 360;
    } else {
        return 4.5 * level * level - 162.5 * level + 2220;
    }
}

/**
 * @param {Player} player
 */
function getTotalExperience(player) {
    return getExperienceForLevel(player.level) + player.xpEarnedAtCurrentLevel;
}

moduleManager.registerModule(new GravestoneModule());

// system.run(() => {
//     world.getDynamicPropertyIds().forEach((prop) => {
//         if (prop === "essential++:gravestones") {
//             const data = world.getDynamicProperty(prop);
//             console.warn(JSON.stringify(data));
//         }
//     });
//     for (let en of world.getDimension("minecraft:overworld").getEntities()) {
//         if (en.typeId === "es:beam") {
//             en.remove();
//             console.warn("Removed stray beam entity on startup.");
//         }
//     }
// });
