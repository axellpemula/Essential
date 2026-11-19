import { BlockPermutation, PlayerInteractWithBlockBeforeEvent, system, world } from "@minecraft/server";
import { Module, moduleManager } from "../mainCore.js";

class AnvilRepair extends Module {
    constructor() {
        super("AnvilRepair", "Repair the Anvil with a certain item.", "When an anvil is interacted with a specific item, it will repair it", false, "textures/ui/anvil_icon.png");

        this.settings = {
            instaRepair: {
                type: "toggle",
                label: "Instant Repair",
                tooltip: "Whether the anvil should be repaired instantly or not.",
            },
            repairItem: {
                type: "dropdown",
                label: "Repair Item",
                options: ["minecraft:iron_ingot", "minecraft:iron_block", "minecraft:iron_nugget"],
                tooltip: "The item that will be used to repair the anvil.",
            },
        };
        this.isEnabled = true;
        this.instaRepair = false;
        this.anvilState = ["minecraft:anvil", "minecraft:chipped_anvil", "minecraft:damaged_anvil"];
        this.repairItem = 0;
    }
    /**
     * @param {PlayerInteractWithBlockBeforeEvent} event
     */
    onPlayerInteract(event) {
        const { player, block, itemStack } = event;
        if (!block || !itemStack) return;
        event.handled = true;
        if (this.anvilState.includes(block.typeId) && this.anvilState[0] != block.typeId && itemStack?.typeId === this.settings.repairItem.options[this.repairItem]) {
            event.cancel = true;
            system.run(() => {
                let nextState = this.anvilState[Math.max(0, this.anvilState.indexOf(block.typeId) - 1)];
                let realNextState = this.instaRepair ? this.anvilState[0] : nextState;
                block.setPermutation(BlockPermutation.resolve(realNextState, { "minecraft:cardinal_direction": block.permutation.getState("minecraft:cardinal_direction") }));
                block.dimension.playSound("random.anvil_use", block.center(), { volume: 1, pitch: 1 });
                CTsAPI.utils.decreaseItemAmount(player, itemStack, 1);
            });
        }
    }
}

moduleManager.registerModule(new AnvilRepair());
