import { PlayerInteractWithBlockBeforeEvent, system, world } from "@minecraft/server";
import { Module, moduleManager } from "./../mainCore";

export class Sorter extends Module {
    constructor() {
        super("Sorter", "Sorts items in your inventory/container", "", false, "textures/items/sorter");
        this.settings = {
            sortBy: {
                type: "dropdown",
                label: "Sort By",
                tooltip: "Determines how items will be sorted.",
                options: ["Category", "Name", "Material"],
            },
            includeHotbar: {
                type: "toggle",
                label: "Include Hotbar",
                tooltip: "If enabled, the sorter will also sort items in the hotbar. If disabled, only the main inventory will be sorted.",
            },
        };
        this.sortBy = 0;
        this.includeHotbar = false;
        this.isEnabled = true;
        this.interactPriority = 100;
    }
    /**
     * @param {PlayerInteractWithBlockBeforeEvent} event
     */
    onPlayerInteract(event) {
        const { player, itemStack: item, block } = event;
        if (!this.isEnabled) return;
        if (!player.isSneaking) {
            const inventory = block.getComponent("inventory")?.container;
            if (!inventory) return;
            if (item?.typeId !== "es:sorter") return;
            system.run(() => {
                const cooldown = item.getComponent("minecraft:cooldown");
                let remaining = cooldown.getCooldownTicksRemaining(player);
                if (remaining != 0) {
                    return;
                }
                if (cooldown) {
                    cooldown.startCooldown(player);
                }
                sortAndPlaceItems(player, inventory, 0, this, item);
            });
            event.cancel = true;
        }
    }
}

system.beforeEvents.startup.subscribe(({ itemComponentRegistry }) => {
    itemComponentRegistry.registerCustomComponent("es:sorter", {
        onUse: ({ source: player, itemStack: item }) => {
            if (player.isSneaking) return;
            const sorterModule = moduleManager.modules.get("Sorter");
            if (!sorterModule?.isEnabled) return;
            system.run(() => {
                const cooldown = item.getComponent("minecraft:cooldown");

                if (cooldown) {
                    cooldown.startCooldown(player);
                }
                const inventory = player.getComponent("inventory").container;
                let includeHotbar = sorterModule.includeHotbar ? 0 : 9;
                sortAndPlaceItems(player, inventory, includeHotbar, sorterModule, item);
            });
        },
    });
});

const materialTiers = {
    netherite: 6,
    diamond: 5,
    golden: 4,
    iron: 3,
    copper: 2,
    stone: 1,
    chainmail: 1,
    wooden: 0,
    leather: 0,
};

function getMaterialTier(item) {
    const id = item.typeId;
    for (const material in materialTiers) {
        if (id.includes(material)) {
            return materialTiers[material];
        }
    }
    return -1;
}

function getItemCategory(item) {
    const id = item.typeId;

    if (item.hasTag("minecraft:is_armor")) return "Armor";
    if (item.hasTag("minecraft:is_tool") || item.hasTag("minecraft:is_weapon")) return "Tools & Weapons";
    if (item.hasTag("minecraft:is_food")) return "Food & Potions";
    if (id.includes("potion")) return "Food & Potions";
    if (
        id.includes("redstone") ||
        id.includes("piston") ||
        id.includes("repeater") ||
        id.includes("comparator") ||
        id.includes("observer") ||
        id.includes("dispenser") ||
        id.includes("dropper") ||
        id.includes("lever") ||
        id.includes("button")
    )
        return "Redstone";
    if (id.includes("_ore") || id.includes("raw_")) return "Ores & Raw Materials";
    if (
        id.includes("ingot") ||
        id === "minecraft:diamond" ||
        id === "minecraft:emerald" ||
        id === "minecraft:lapis_lazuli" ||
        id === "minecraft:coal" ||
        id === "minecraft:stick" ||
        id === "minecraft:string" ||
        id === "minecraft:leather"
    )
        return "Crafting Materials";
    if (CTsAPI.utils.isBlock(item)) return "Blocks";

    return "Miscellaneous";
}

function sortAndPlaceItems(player, container, startSlot, sorterModule, item) {
    const itemsToSort = [];
    const sorterSlots = new Set();

    for (let i = startSlot; i < container.size; i++) {
        const currentItem = container.getItem(i);
        if (currentItem) {
            if (currentItem.typeId === "es:sorter") {
                sorterSlots.add(i);
            } else {
                itemsToSort.push(currentItem);
                container.setItem(i, undefined);
            }
        }
    }

    if (itemsToSort.length === 0) return;

    const sortOption = sorterModule.settings.sortBy.options[sorterModule.sortBy];
    const categoryOrder = ["Tools & Weapons", "Armor", "Food & Potions", "Redstone", "Blocks", "Ores & Raw Materials", "Crafting Materials", "Miscellaneous"];

    itemsToSort.sort((a, b) => {
        let compare = 0;

        if (sortOption === "Category") {
            const categoryA = getItemCategory(a);
            const categoryB = getItemCategory(b);
            const indexA = categoryOrder.indexOf(categoryA);
            const indexB = categoryOrder.indexOf(categoryB);
            compare = indexA - indexB;

            if (compare === 0) {
                const getBaseType = (item) => {
                    const id = item.typeId;
                    const types = ["pickaxe", "axe", "shovel", "hoe", "sword", "helmet", "chestplate", "leggings", "boots"];
                    for (const type of types) {
                        if (id.includes(`_${type}`)) return type;
                    }
                    return id;
                };

                const baseTypeA = getBaseType(a);
                const baseTypeB = getBaseType(b);
                compare = baseTypeA.localeCompare(baseTypeB);

                if (compare === 0) {
                    const tierA = getMaterialTier(a);
                    const tierB = getMaterialTier(b);
                    compare = tierB - tierA;

                    if (compare === 0) {
                        const nameA = a.nameTag || a.typeId;
                        const nameB = b.nameTag || b.typeId;
                        compare = nameA.localeCompare(nameB);
                    }
                }
            }
        } else if (sortOption === "Name") {
            const nameA = a.nameTag || a.typeId;
            const nameB = b.nameTag || b.typeId;
            compare = nameA.localeCompare(nameB);
        } else if (sortOption === "Material") {
            const tierA = getMaterialTier(a);
            const tierB = getMaterialTier(b);
            compare = tierB - tierA; // higher tier first

            if (compare === 0) {
                const categoryA = getItemCategory(a);
                const categoryB = getItemCategory(b);
                const indexA = categoryOrder.indexOf(categoryA);
                const indexB = categoryOrder.indexOf(categoryB);
                compare = indexA - indexB;

                if (compare === 0) {
                    const nameA = a.nameTag || a.typeId;
                    const nameB = b.nameTag || b.typeId;
                    compare = nameA.localeCompare(nameB);
                }
            }
        }
        if (compare === 0) {
            return b.amount - a.amount;
        }
        return compare;
    });

    const finalItems = [];
    for (const item of itemsToSort) {
        let amountToPlace = item.amount;
        while (amountToPlace > 0) {
            const lastStack = finalItems.length > 0 ? finalItems[finalItems.length - 1] : null;
            if (lastStack && lastStack.isStackableWith(item) && lastStack.amount < lastStack.maxAmount) {
                const canAdd = lastStack.maxAmount - lastStack.amount;
                const toAdd = Math.min(amountToPlace, canAdd);
                lastStack.amount += toAdd;
                amountToPlace -= toAdd;
            } else {
                const newStack = item.clone();
                const amountForNewStack = Math.min(amountToPlace, newStack.maxAmount);
                newStack.amount = amountForNewStack;
                finalItems.push(newStack);
                amountToPlace -= amountForNewStack;
            }
        }
    }

    let slotIndex = startSlot;
    for (const stack of finalItems) {
        while (slotIndex < container.size && sorterSlots.has(slotIndex)) {
            slotIndex++;
        }

        if (slotIndex >= container.size) {
            player.dimension.spawnItem(stack, player.location);
        } else {
            container.setItem(slotIndex, stack);
            slotIndex++;
        }
    }
    const isPlayerInventory = container === player.getComponent("inventory").container;
    CTsAPI.utils.actionBar(player, isPlayerInventory ? "§aInventory sorted successfully!" : "§aContainer sorted successfully!");
    CTsAPI.utils.increaseDurability(player, item);
}

moduleManager.registerModule(new Sorter());
