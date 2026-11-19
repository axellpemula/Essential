import { system, world } from "@minecraft/server";
import { moduleManager, Module } from "../mainCore";

class ItemHologram extends Module {
    constructor() {
        super(
            "Item Hologram",
            "Creates a hologram of the dropped item.",
            "Displays a customizable nametag above dropped items showing details like name, amount, and enchantments.",
            true,
            "textures/items/diamond_sword",
        );
        this.settings = {
            format: {
                type: "textField",
                placeholder: "§f{name} §e{amount}x",
                label: "Hologram Format\n§7Variables: {name}, {amount}, {\\n}",
                tooltip: "Set the format. Use §7{name}§r for item name and §7{amount}§r for stack size. Separate lines with §7{\\n}§r.",
            },
            showEnchantments: {
                type: "toggle",
                label: "Show Enchantments",
                tooltip: "If enabled, enchantments will be displayed below the item name.",
            },
            enchantFormat: {
                type: "textField",
                placeholder: "§d{ench} §f{level}",
                label: "Enchantment Format\n§7Variables: {ench}, {level}, {\\n}",
                tooltip: "Format for enchantments. Use §7{ench}§r for enchantment name and §7{level}§r for enchantment level. Separate multiple enchantments with §7{\\n}§r.",
            },
            despawnTime: {
                type: "toggle",
                label: "Show Despawn Time",
                tooltip: "If enabled, the time until the item despawns will be shown in the hologram.",
            },
            despawnFormat: {
                type: "textField",
                placeholder: "§7despawns in:§f {time}",
                label: "Despawn Time Format\n§7Variables: {time}",
                tooltip: "Format for the despawn time. Use §7{time}§r for the time remaining until despawn.",
            },
            distance: {
                type: "slider",
                label: "Hologram Distance",
                min: 0,
                max: 50,
                step: 1,
                tooltip: "Maximum distance at which holograms are visible to players.",
            },
            requireLineOfSight: {
                type: "toggle",
                label: "Require Line of Sight",
                tooltip: "If enabled, holograms will only appear if there is a clear line of sight between you and the item.",
            },
            showSource: {
                type: "toggle",
                label: "Show Item Source",
                tooltip: "If enabled, the namespace of the item will be shown in the hologram (e.g. 'minecraft:diamond_sword')",
            },
            filteredItems: {
                type: "textField",
                placeholder: "stone,dirt",
                label: "Filtered Items",
                tooltip: "A comma-separated list of item IDs to either ignore or exclusively show.",
            },
            toggleWhiteBlackList: {
                type: "toggle",
                label: "Whitelist Mode",
                tooltip: "If on, only items in the list will have holograms. If off, items in the list will be ignored.",
            },
            updateInterval: {
                type: "slider",
                label: "Update Interval (ticks)",
                min: 1,
                max: 20,
                step: 1,
                tooltip: "How often to update holograms. Higher values improve performance but updates are slower.",
            },
        };
        this.isEnabled = false;
        this.format = "§f{name} §e{amount}x";
        this.enchantFormat = "§d{ench} §f{level}";
        this.despawnFormat = "§7despawns in:§f {time}";
        this.distance = 10;
        this.requireLineOfSight = true;
        this.showEnchantments = true;
        this.showSource = false;
        this.despawnTime = false;
        this.filteredItems = "";
        this.toggleWhiteBlackList = false;
        this.updateInterval = 5;
        this.cleanupDone = false;
        this.dynamic = "essentialpp:itemHologram";
    }
    tick() {
        if (this.isEnabled && system.currentTick % 20 === 0) {
            const dims = ["overworld", "nether", "the_end"];
            for (const dimName of dims) {
                const dimension = world.getDimension(dimName);
                if (!dimension) continue;

                for (const item of dimension.getEntities({ type: "minecraft:item" })) {
                    const currentAgeTicks = item.getDynamicProperty(this.dynamic) || 0;
                    item.setDynamicProperty(this.dynamic, currentAgeTicks + 20);
                }
            }
        }

        if (!this.isEnabled) {
            if (!this.cleanupDone) {
                this.cleanupHolograms();
                this.cleanupDone = true;
            }
            return;
        }
        this.cleanupDone = false;

        if (system.currentTick % this.updateInterval !== 0) return;

        const dims = ["overworld", "nether", "the_end"];
        for (const dimName of dims) {
            const dimension = world.getDimension(dimName);
            if (!dimension) continue;

            const playersInDim = world.getPlayers();
            if (playersInDim.length === 0) {
                for (const item of dimension.getEntities({ type: "minecraft:item" })) {
                    if (item.nameTag) item.nameTag = "";
                }
                continue;
            }

            for (const item of dimension.getEntities({ type: "minecraft:item" })) {
                const itemStack = item.getComponent("minecraft:item")?.itemStack;
                if (!itemStack) {
                    if (item.nameTag) item.nameTag = "";
                    continue;
                }

                const itemId = itemStack.typeId.replace("minecraft:", "");
                const filteredItemsList = this.filteredItems?.split(",").map((i) => i.trim().toLowerCase()) ?? [];
                const isWhitelisted = this.toggleWhiteBlackList;

                let shouldSkip = false;
                if (filteredItemsList.length > 0 && filteredItemsList[0] !== "") {
                    const isInList = filteredItemsList.includes(itemId.toLowerCase());
                    if (isWhitelisted && !isInList) {
                        shouldSkip = true;
                    }
                    if (!isWhitelisted && isInList) {
                        shouldSkip = true;
                    }
                }

                if (shouldSkip) {
                    if (item.nameTag) item.nameTag = "";
                    continue;
                }

                let isVisibleToAnyPlayer = false;
                for (const player of playersInDim) {
                    const distance = CTsAPI.vector.distance(player.location, item.location);
                    if (distance > this.distance) {
                        continue;
                    }

                    if (this.requireLineOfSight) {
                        const headLoc = player.location;
                        const itemLoc = item.location;
                        const direction = { x: itemLoc.x - headLoc.x, y: itemLoc.y - headLoc.y, z: itemLoc.z - headLoc.z };
                        const blockHits = dimension.getBlockFromRay(headLoc, direction, { maxDistance: distance, includePassableBlocks: false, includeLiquidBlocks: false });
                        if (blockHits && !blockHits.block.isLiquid) {
                            continue;
                        }
                    }

                    isVisibleToAnyPlayer = true;
                    break;
                }

                if (isVisibleToAnyPlayer) {
                    let nameTag = this.format.replace("{amount}", itemStack.amount).replace("{name}", CTsAPI.utils.formatIdToText(itemStack.typeId))?.replace(/{\\n}/g, "\n");

                    if (this.despawnTime) {
                        const ageTicks = item.getDynamicProperty(this.dynamic) || 0;
                        const despawnTimeTicks = Math.max(0, 6000 - ageTicks);
                        const minutes = Math.floor(despawnTimeTicks / 1200);
                        const seconds = Math.floor((despawnTimeTicks % 1200) / 20);
                        nameTag += `\n${this.despawnFormat.replace("{time}", `${minutes}:${seconds.toString().padStart(2, "0")}`)}`;
                    }

                    if (this.showEnchantments) {
                        const enchantComp = itemStack.getComponent("enchantable");
                        const enchants = enchantComp?.getEnchantments() ?? [];
                        if (enchants.length > 0) {
                            const enchantText = enchants
                                .map((e) =>
                                    this.enchantFormat
                                        .replace("{ench}", CTsAPI.utils.formatIdToText(e.type.id))
                                        .replace("{level}", CTsAPI.math.integerToRoman(e.level)?.replace(/{\\n}/g, "\n")),
                                )
                                .join(", ");
                            nameTag += `\n${enchantText}`;
                        }
                    }
                    if (this.showSource) {
                        nameTag += `\n§9${CTsAPI.utils.getSourceFromId(itemStack.typeId)}`;
                    }

                    if (item.nameTag !== nameTag) {
                        item.nameTag = nameTag;
                    }
                } else {
                    if (item.nameTag) {
                        item.nameTag = "";
                    }
                }
            }
        }
    }

    cleanupHolograms() {
        const dims = ["overworld", "nether", "the_end"];
        for (const dimName of dims) {
            const dimension = world.getDimension(dimName);
            if (!dimension) continue;

            for (const item of dimension.getEntities({ type: "minecraft:item" })) {
                if (item.nameTag) {
                    item.nameTag = "";
                }
            }
        }
    }
}

moduleManager.registerModule(new ItemHologram());
