import { ItemStack, PlayerInteractWithBlockBeforeEvent, system, world } from "@minecraft/server";
import { Module, moduleManager } from "../mainCore";

class AutoReEquip extends Module {
    constructor() {
        super(
            "AutoReEquip",
            "Automatically re-equips the same block type after placing a block.",
            "When placing blocks, if the player has more of the same block type in their inventory, it will automatically be equipped.",
            false,
            "textures/ui/auto-re-equip.png",
        );
        this.isEnabled = true;
    }
    /**
     *
     * @param {PlayerInteractWithBlockBeforeEvent} event
     */
    onPlayerInteract(event) {
        if (!this.isEnabled) return;
        const { itemStack, player } = event;
        if (!itemStack) return;

        // if (!itemStack.typeId.startsWith("minecraft:")) return;

        system.run(() => {
            const inv = player.getComponent("minecraft:inventory").container;
            const selectedSlot = player.selectedSlotIndex;
            const itemInHand = inv.getItem(selectedSlot);

            if (!itemInHand) {
                const placedItemTypeId = itemStack.typeId;
                let replacementSlot = -1;
                for (let i = 0; i < inv.size; i++) {
                    if (i === selectedSlot) continue;
                    const currentItem = inv.getItem(i);
                    if (currentItem?.typeId === placedItemTypeId) {
                        replacementSlot = i;
                        break;
                    }
                }
                if (replacementSlot !== -1) inv.swapItems(selectedSlot, replacementSlot, inv);
            }
        });
    }
}

moduleManager.registerModule(new AutoReEquip());
