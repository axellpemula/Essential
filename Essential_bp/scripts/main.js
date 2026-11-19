import "./CTsAPI/main.js";
import "./mining/index.js";
import "./farming/index.js";
import "./mainCore.js";
import "./multiplayer/index.js";
import "./navi/index.js";
import "./player_QoL/index.js";
import "./building/index.js";
import "./fake_block/index.js";
import { CommandPermissionLevel, ItemLockMode, ItemStack, system, world } from "@minecraft/server";
import { moduleManager } from "./mainCore.js";

// system.beforeEvents.watchdogTerminate.subscribe((e) => {
//     e.cancel = true;
// });

// system.run(() => {
//     world.getDynamicPropertyIds().forEach((prop) => {
//         console.warn(`§a[Dynamic Property Type] §c${prop}§r: §b${JSON.stringify(world.getDynamicProperty(prop))}`); // Debug property types
//     });
// });

world.afterEvents.playerJoin.subscribe(({ playerId }) => {
    let ownerId = world.getDynamicProperty("owner");
    if (!ownerId) {
        world.setDynamicProperty("owner", playerId);
    }
});

world.afterEvents.playerSpawn.subscribe(({ player, initialSpawn }) => {
    if (!initialSpawn) return;
    let giveMenu = world.getDynamicProperty("essential++:give_menu_on_join");
    if (giveMenu === undefined || giveMenu === true) {
        CTsAPI.utils.giveItem(player, "es:menu", "keepOnDeath");
    }
});

world.beforeEvents.itemUse.subscribe(({ source: player, itemStack: item }) => {
    if (item.typeId === "es:menu") {
        system.run(() => {
            moduleManager.showMainMenu(player);
        });
    }
});

let flashlightIdCounter = 0;

world.afterEvents.playerInventoryItemChange.subscribe(({ player, slot, itemStack }) => {
    if (!itemStack || !itemStack.typeId.includes("es:flashlight")) return;

    if (itemStack.getLore()?.length > 0) return;

    const inventory = player.getComponent("minecraft:inventory")?.container;
    if (!inventory) return;

    const makeFlashlight = () => {
        const raw = (Date.now() + flashlightIdCounter++).toString();
        const encodedDate = raw
            .toString()
            .split("")
            .map((d) => "§" + d)
            .join("");

        const single = new ItemStack(itemStack.typeId, 1);
        single.setLore(["§r§7Interact with the flashlight to toggle it on/off." + encodedDate]);
        return single;
    };

    if (itemStack.amount > 1) {
        const amount = itemStack.amount;
        inventory.setItem(slot, undefined);

        system.run(() => {
            for (let i = 0; i < amount; i++) {
                const newItem = makeFlashlight();
                const leftover = inventory.addItem(newItem);
                if (leftover) {
                    player.dimension.spawnItem(leftover, player.location);
                }
            }
        });
    } else {
        inventory.setItem(slot, makeFlashlight());
    }
});
