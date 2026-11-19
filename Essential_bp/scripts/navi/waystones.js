import { Block, BlockPermutation, Direction, ItemStack, Player, PlayerBreakBlockBeforeEvent, system, world } from "@minecraft/server";
import { Module, moduleManager } from "../mainCore";
import { ActionFormData, ModalFormData } from "@minecraft/server-ui";

let waystoneModule;

class WaystoneModule extends Module {
    constructor() {
        super(
            "Waystones",
            "Allows players to create and interact with waystones.",
            "Place a waystone block to create a new waystone.",
            false,
            "textures/blocks/waystones/icons/waystone",
        );
        this.settings = {
            interact: {
                type: "toggle",
                label: "Enable Interaction",
                tooltip: "Allows players to interact with waystones to teleport.",
            },
            create: {
                type: "toggle",
                label: "Enable Creation",
                tooltip: "Allows players to create waystones by placing the block.",
            },
            limitWaystones: {
                type: "slider",
                label: "Limit Waystones",
                tooltip: "Limit the number of waystones a player can create. Set to 0 for unlimited.",
                min: 0,
                max: 20,
                step: 1,
            },
        };
        this.isEnabled = true;
        this.interact = true;
        this.create = true;
        this.limitWaystones = 0; // 0 for unlimited
        this.breakPriority = -2;
    }
    /**
     * @param {PlayerBreakBlockBeforeEvent} event
     */
    onPlayerBreak(event) {
        const { block, player, dimension, itemStack } = event;
        if (!block.hasTag("es:waystone") || !this.isEnabled) return;
        event.handled = true; // Claim the event to prevent other handlers from processing it
        const waystone = getWaystone(block);
        let baseLoc = block.center();
        let blockId = block.typeId;
        waystone.deleteData();
        if (block.permutation.getState("es:half") == "top") {
            baseLoc = block.below().center();
            system.run(() => {
                block.below().setType("air");
            });
        }
        system.run(() => {
            const autoPickupModule = moduleManager.modules.get("AutoPickup");
            const silkTouch = itemStack?.getComponent("enchantable")?.getEnchantment("minecraft:silk_touch");

            if (silkTouch) return;

            if (autoPickupModule?.isEnabled) {
                const inv = player.getComponent("inventory").container;
                const leftover = inv.addItem(new ItemStack(blockId, 1));
                if (leftover) dimension.spawnItem(leftover, baseLoc);
            } else {
                dimension.spawnItem(new ItemStack(blockId, 1), baseLoc);
            }
        });
    }
}

system.beforeEvents.startup.subscribe(({ blockComponentRegistry, itemComponentRegistry }) => {
    waystoneModule = moduleManager.modules.get("Waystones");
    itemComponentRegistry.registerCustomComponent("es:bound_scroll", {
        onCompleteUse: ({ itemStack: item, source: player }) => {
            if (!waystoneModule.interact || !waystoneModule.isEnabled || !waystoneModule.create) return;
            let dataStr = item.getDynamicProperty("es:bound_scroll_data");
            if (!dataStr) {
                CTsAPI.msg.sendErrorMessage(player, "§7This scroll is not bound to any waystone!");
                return;
            }
            let data = JSON.parse(dataStr);
            let waystone = new Waystone()
                .getAllData()
                .find((ws) => ws.data.loc.x === data.loc.x && ws.data.loc.y === data.loc.y && ws.data.loc.z === data.loc.z && ws.data.dim === data.dim);
            if (!waystone) {
                CTsAPI.msg.sendErrorMessage(player, "§7The waystone bound to this scroll no longer exists!");
                CTsAPI.utils.decreaseItemAmount(player, item);
                CTsAPI.utils.addItem(player, new ItemStack("es:unbound_scroll", 1));
                return;
            }
            let tpLoc = offsetTp(data.dir, data.loc);
            try {
                player.spawnParticle("es:waystone_teleport", tpLoc);
                player.spawnParticle("es:waystone_teleport", player.location);
            } catch { }
            player.teleport(tpLoc, {
                dimension: world.getDimension(data.dim),
                facingLocation: offsetTp(data.dir, data.loc, true),
            });
            CTsAPI.utils.decreaseItemAmount(player, item);
        },
    });
    itemComponentRegistry.registerCustomComponent("es:warp_stone", {
        onCompleteUse: ({ itemStack: item, source: player }) => {
            if (!waystoneModule.interact || !waystoneModule.isEnabled || !waystoneModule.create) return;
            openWaystoneUI(player, new Waystone(), item);
        },
    });
    blockComponentRegistry.registerCustomComponent("es:waystone", {
        beforeOnPlayerPlace: (ev) => {
            let { block, player } = ev;
            if (!block.above().isAir || !waystoneModule.create) {
                ev.cancel = true;
                return;
            }
            let waystone = getWaystone(block);
            if (exceedsWaystoneLimit(waystone, player)) {
                ev.cancel = true;
                return;
            }
            system.run(() => {
                createWaystone(waystone, player);
            });
        },
        onPlace: ({ block }) => {
            let above = block.above();
            if (!above.isAir || !waystoneModule.create) return;
            if (!block.hasTag("half_top")) {
                above.setPermutation(block.permutation.withState("es:half", "top"));
            }
        },
        onPlayerInteract: ({ block, player }) => {
            let holdBoundScroll = player.getComponent("inventory").container?.getItem(player.selectedSlotIndex);
            let waystone = getWaystone(block);
            if (holdBoundScroll?.typeId == "es:unbound_scroll") {
                let data = waystone.getData();
                if (!data.name) {
                    CTsAPI.msg.sendErrorMessage(player, "§7This waystone is not set up yet!");
                    return;
                }
                if (data.plr !== player.id) {
                    CTsAPI.msg.sendErrorMessage(player, "§7You can only bind to your own waystones!");
                    return;
                }
                let boundScroll = new ItemStack("es:bound_scroll", 1);
                boundScroll.setDynamicProperty("es:bound_scroll_data", JSON.stringify({ loc: data.loc, dim: data.dim, name: data.name, icon: data.icon, dir: data.dir }));
                boundScroll.setLore([
                    `§r§7Bound to: §a${data.name}`,
                    `§r§7Dimension: §a${data.dim.replace("minecraft:", "")}`,
                    `§r§7Location: §a${Math.round(data.loc.x)}, ${Math.round(data.loc.y)}, ${Math.round(data.loc.z)}`,
                ]);
                CTsAPI.utils.addItem(player, boundScroll);
                CTsAPI.utils.decreaseItemAmount(player, holdBoundScroll);
                return;
            }
            if (!waystoneModule.interact || !waystoneModule.isEnabled || !waystoneModule.create) return;
            // waystone.deleteAllData();
            if (player.isSneaking) {
                createWaystone(waystone, player);
                return;
            }
            openWaystoneUI(player, waystone);
        },
    });
});

class Waystone {
    /**
     * @param {Block} block
     */
    constructor(block) {
        this.block = block;
        this.identifier = "es:waystone";
    }
    getPropertyId() {
        const { x, y, z } = this.block.location;
        return `${this.identifier}:${this.block.dimension.id}:${x},${y},${z}`;
    }
    getData() {
        let data = world.getDynamicProperty(this.getPropertyId());
        return data ? JSON.parse(data) : {};
    }
    getAllData() {
        let data = world
            .getDynamicPropertyIds()
            .filter((id) => id.startsWith(this.identifier))
            .map((id) => {
                return {
                    id: id,
                    data: JSON.parse(world.getDynamicProperty(id)),
                    length: world.getDynamicPropertyIds().filter((id) => id.startsWith(this.identifier)).length,
                };
            });
        return data;
    }
    countOwnedBy(playerId) {
        return this.getAllData().filter((entry) => entry.data?.plr === playerId).length;
    }
    setData(data = {}) {
        world.setDynamicProperty(this.getPropertyId(), JSON.stringify(data));
    }
    deleteData() {
        world.setDynamicProperty(this.getPropertyId(), undefined);
    }
    deleteAllData() {
        this.getAllData().forEach((ws) => {
            world.setDynamicProperty(ws.id, undefined);
        });
    }
    saveData() {
        this.setData(this.getData());
    }
}
/**
 * @param {Block} block
 * @param {BlockPermutation} bBP
 * @return {Waystone}
 */
function getWaystone(block, bBP = null) {
    let waystone = new Waystone(block);

    if ((bBP || block).hasTag("half_top")) {
        waystone = new Waystone(block.below());
    }
    return waystone;
}

/**
 * @param {Direction} dir
 * @param {Location} location
 * @param {boolean} [facing=false]
 */
function offsetTp(dir, location, facing = false) {
    const delta = {
        north: { x: 0, z: facing ? -2 : -1 },
        south: { x: 0, z: facing ? 2 : 1 },
        west: { x: facing ? -2 : -1, z: 0 },
        east: { x: facing ? 2 : 1, z: 0 },
    }[dir] || { x: 0, z: 0 };
    return {
        x: location.x + delta.x,
        y: location.y,
        z: location.z + delta.z,
    };
}

function exceedsWaystoneLimit(waystone, player, existingData) {
    if (!waystoneModule) {
        return false;
    }
    const limit = waystoneModule.limitWaystones || 0;
    if (limit <= 0) {
        return false;
    }
    const data = existingData || waystone.getData();
    const ownsExisting = data?.name && data.plr === player.id;
    if (ownsExisting) {
        return false;
    }
    const ownedCount = waystone.countOwnedBy(player.id);
    if (ownedCount >= limit) {
        system.run(() => {
            CTsAPI.msg.sendErrorMessage(player, `§cYou can only have ${limit} waystones.`);
        });
        return true;
    }
    return false;
}
/**
 *
 * @param {Waystone} waystone
 * @param {Player} player
 */
function createWaystone(waystone, player) {
    const block = waystone.block;
    const currentData = waystone.getData();
    if (exceedsWaystoneLimit(waystone, player, currentData)) {
        return;
    }
    const defaultName = currentData.name;
    const defaultPublic = currentData.public || false;
    const defaultFavorite = currentData.fav || false;
    const types = waystoneTypes(block);
    const hasLogOptions = Array.isArray(types.log) && types.log.length > 0;
    const iconData = icons().name;
    const iconOptions = Object.values(iconData);
    const iconKeys = Object.keys(iconData);
    const defaultIconIndex = currentData.icon ? Math.max(0, iconKeys.indexOf(currentData.icon)) : iconKeys.indexOf(player.dimension.id?.replace("minecraft:", ""));
    const form = new ModalFormData();
    form.title("Waystone");
    form.textField("Name", "Waystone Name", { defaultValue: defaultName });
    if (hasLogOptions) {
        form.dropdown("Appearance", types.log, { defaultValueIndex: types.logIndex });
    }
    form.dropdown("Rune Color", types.notCleanColor, { defaultValueIndex: types.colorIndex });
    form.dropdown("Icon", iconOptions, { defaultValueIndex: defaultIconIndex });
    form.toggle("Public", { defaultValue: defaultPublic });
    form.toggle("Favorite", { defaultValue: defaultFavorite });
    const logFieldIndex = hasLogOptions ? 1 : -1;
    const colorFieldIndex = hasLogOptions ? 2 : 1;
    const iconFieldIndex = hasLogOptions ? 3 : 2;
    const publicFieldIndex = iconFieldIndex + 1;
    const favoriteFieldIndex = publicFieldIndex + 1;
    system.run(() => {
        form.show(player).then((response) => {
            const formValues = response.formValues || [];
            const genName = generateName();
            let name = defaultName || genName;
            if (!response.canceled) {
                const nameInput = formValues[0];
                if (nameInput?.trim()) {
                    name = nameInput.trim();
                } else if (!defaultName) {
                    name = genName;
                }
            } else if (!defaultName) {
                name = genName;
            }
            const selectedLog = hasLogOptions ? types.log[formValues[logFieldIndex] || types.logIndex] : null;
            const selectedColor = types.color[formValues[colorFieldIndex] || types.colorIndex];
            const selectedIconKey = iconKeys[formValues[iconFieldIndex] || defaultIconIndex];
            const isPublic = response.canceled ? defaultPublic : formValues[publicFieldIndex] || defaultPublic;
            const isFavorite = response.canceled ? defaultFavorite : formValues[favoriteFieldIndex] || defaultFavorite;
            player.playSound("note.harp", { volume: 0.5, pitch: 1, location: block.center() });
            waystone.setData({
                name: name,
                public: isPublic,
                loc: block.center(),
                dim: block.dimension.id,
                plr: player.id,
                log: selectedLog,
                color: selectedColor,
                icon: selectedIconKey,
                dir: block.permutation.getState("minecraft:cardinal_direction"),
                fav: isFavorite,
            });
            // console.warn(`Waystone Data: ${JSON.stringify(waystone.getData())}`);
            let bottomPermutation = block.permutation.withState("es:half", "bottom");
            if (selectedLog) {
                bottomPermutation = bottomPermutation.withState("es:log_type", selectedLog);
            }
            bottomPermutation = bottomPermutation.withState("es:rune_color", selectedColor);
            block.setPermutation(bottomPermutation);

            const topBlock = block.above();
            if (topBlock && !topBlock.isAir) {
                let topPermutation = topBlock.permutation.withState("es:half", "top");
                if (selectedLog) {
                    topPermutation = topPermutation.withState("es:log_type", selectedLog);
                }
                topPermutation = topPermutation.withState("es:rune_color", selectedColor);
                topBlock.setPermutation(topPermutation);
            }
        });
    });
}

function openWaystoneUI(player, waystone, item = null) {
    let form = new ActionFormData();
    form.title("Waystone Teleportation");
    let data;
    if (!item) {
        data = waystone.getData();
    }
    let filtered = waystone.getAllData().filter((ws) => ws.data.public || ws.data.plr === player.id);
    if (!item) {
        filtered = filtered.filter((ws) => ws.data.loc.x !== data.loc.x || ws.data.loc.y !== data.loc.y || ws.data.loc.z !== data.loc.z);
    }
    // sort by favorite, dimension (overworld, nether, the_end) then by name
    filtered.sort((a, b) => {
        if (a.data.fav && !b.data.fav) return -1;
        if (!a.data.fav && b.data.fav) return 1;
        const dimOrder = ["minecraft:overworld", "minecraft:nether", "minecraft:the_end"];
        const dimA = dimOrder.indexOf(a.data.dim) !== -1 ? dimOrder.indexOf(a.data.dim) : dimOrder.length;
        const dimB = dimOrder.indexOf(b.data.dim) !== -1 ? dimOrder.indexOf(b.data.dim) : dimOrder.length;
        if (dimA !== dimB) {
            return dimA - dimB;
        }
        return a.data.name.localeCompare(b.data.name);
    });
    if (filtered.length === 0) {
        CTsAPI.msg.sendErrorMessage(player, "§7No other waystones available!");
        return;
    }
    filtered.forEach((ws) => {
        form.button(`${ws.data.fav ? " §r" : ""}${ws.data.name}${ws.data.fav ? " §r" : ""}\n[${ws.data.public ? "§aPublic§r" : "§cPrivate§r"}]`, icons(ws.data.icon).path);
    });
    form.show(player).then((response) => {
        if (!response.canceled) {
            let selected = filtered[response.selection];
            if (selected) {
                let tpLoc = offsetTp(selected.data.dir, selected.data.loc);
                try {
                    player.spawnParticle("es:waystone_teleport", tpLoc);
                    player.spawnParticle("es:waystone_teleport", player.location);
                } catch { }
                player.teleport(tpLoc, {
                    dimension: world.getDimension(selected.data.dim),
                    facingLocation: offsetTp(selected.data.dir, selected.data.loc, true),
                });
                CTsAPI.utils.increaseDurability(player, item);
                player.playSound("note.harp", { volume: 0.5, pitch: 1, location: offsetTp(selected.data.dir, selected.data.loc, true) });
            }
        }
    });
}

function generateName() {
    const adjectives = ["Ancient", "Mystic", "Enchanted", "Hidden", "Sacred", "Forgotten", "Eternal", "Silent", "Shimmering", "Cursed"];
    const nouns = ["Grove", "Sanctuary", "Shrine", "Monument", "Portal", "Oasis", "Refuge", "Haven", "Citadel", "Bastion"];
    const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
    const noun = nouns[Math.floor(Math.random() * nouns.length)];
    return `${adjective} ${noun}`;
}
/**
 *
 * @param {Block} block
 * @returns
 */
function waystoneTypes(block) {
    const logOptions = ["oak", "spruce", "birch", "jungle", "acacia", "dark_oak", "mangrove", "cherry", "pale_oak", "crimson", "warped"];
    const colorOptions = [
        "§l§fwhite",
        "§l§0black",
        "§l§1blue",
        "§l§nbrown",
        "§l§3cyan",
        "§l§8gray",
        "§l§2green",
        "§l§blight_blue",
        "§l§7light_gray",
        "§l§alime",
        "§l§umagenta",
        "§l§vorange",
        "§l§dpink",
        "§l§5purple",
        "§l§4red",
        "§l§eyellow",
    ];
    const textures = [""];
    const logType = block.permutation.getState("es:log_type");
    const color = block.permutation.getState("es:rune_color");
    const logIndex = logType ? Math.max(logOptions.indexOf(logType), 0) : 0;
    let colorClean = colorOptions.map((c) => c.replace(/\§+./g, ""));
    const colorIndex = Math.max(colorClean.map((c) => c.replace(/\§+./g, "")).indexOf(color), 0);
    return {
        log: logType ? logOptions : null,
        logIndex,
        color: colorClean,
        colorIndex,
        notCleanColor: colorOptions,
    };
}

function icons(type, specific = false) {
    let path = {
        overworld: "textures/blocks/waystones/icons/overworld",
        nether: "textures/blocks/waystones/icons/nether",
        the_end: "textures/blocks/waystones/icons/end",
        village: "textures/blocks/waystones/icons/village",
        waystone: "textures/blocks/waystones/icons/waystone",
    };
    let iconsNames = {
        overworld: "Overworld",
        nether: "Nether",
        the_end: "End",
        village: "Village",
        waystone: "Waystone",
    };
    return {
        path: path[type] || path.overworld,
        name: specific ? iconsNames[type] || iconsNames.overworld : iconsNames,
    };
}

moduleManager.registerModule(new WaystoneModule());
