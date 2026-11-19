import { PlayerInteractWithBlockBeforeEvent, system, world } from "@minecraft/server";
import { Module, moduleManager } from "../mainCore.js";

class DoubleDoor extends Module {
    constructor() {
        super(
            "Double Door",
            "Automatically opens double doors when a player interacts with them.",
            "When enabled, interacting with one door of a double door setup will also open the other door, providing a seamless experience when entering or exiting through double doors.",
            false,
            "textures/items/door_iron",
        );
        this.settings = {
            trapDoor: {
                type: "toggle",
                label: "Include Trapdoors",
                tooltip: "When enabled, trapdoors will also be treated as double doors and will open together when one is interacted with.",
            },
            includeIron: {
                type: "toggle",
                label: "Include Iron Doors/Trapdoors",
                tooltip: "When enabled, iron doors will also be included in the double door functionality, allowing them to open together when one is interacted with.",
            },
            autoClose: {
                type: "toggle",
                label: "Auto Close Doors",
                tooltip: "When enabled, double doors will automatically close after being opened for a short duration, enhancing security and convenience.",
            },
            closeDelay: {
                type: "slider",
                label: "Auto Close Delay (seconds)",
                tooltip: "Adjust the delay time before double doors automatically close after being opened. This allows you to customize how long the doors remain open for.",
                min: 1,
                max: 10,
                step: 1,
            },
        };
        this.isEnabled = true;
        this.trapDoor = false;
        this.includeIron = false;
        this.autoClose = false;
        this.closeDelay = 5;
        this.interactPriority = -5;
    }
    /**
     *
     * @param {PlayerInteractWithBlockBeforeEvent} event
     * @returns
     */
    onPlayerInteract(event) {
        if (!this.isEnabled) return;
        const { block, isFirstEvent, player } = event;
        if (!isFirstEvent) return;
        if (!block) return;
        const blockType = block.typeId;
        const isDoor = blockType.endsWith("_door");
        const isTrapdoor = this.trapDoor && blockType.endsWith("trapdoor");

        if (!isDoor && !isTrapdoor) return;
        if (blockType.includes("iron") && !this.includeIron) return;

        let mainDoor = block;
        if (isDoor && mainDoor.permutation.getState("upper_block_bit")) {
            mainDoor = mainDoor.below();
        }
        const otherDoor = this.findPair(mainDoor);
        if (!otherDoor) return;

        const mainLoc = { ...mainDoor.location };
        const otherLoc = { ...otherDoor.location };
        const mainTypeId = mainDoor.typeId;
        const otherTypeId = otherDoor.typeId;
        const beforeOpen = mainDoor.permutation.getState("open_bit");

        system.run(() => {
            const mainNow = player.dimension.getBlock(mainLoc);
            const otherNow = player.dimension.getBlock(otherLoc);
            if (!mainNow || !otherNow) return;
            if (mainNow.typeId !== mainTypeId || otherNow.typeId !== otherTypeId) return;

            const afterOpen = mainNow.permutation.getState("open_bit");
            if (afterOpen === beforeOpen) {
                return;
            }

            if (otherNow.permutation.getState("open_bit") !== afterOpen) {
                this.toggleDoor(otherNow, afterOpen);
            }

            if (this.autoClose && afterOpen) {
                const doorsToClose = [mainLoc, otherLoc];
                system.runTimeout(() => {
                    for (const loc of doorsToClose) {
                        const door = player.dimension.getBlock(loc);
                        if (!door) continue;
                        if (door.permutation.getState("open_bit")) {
                            this.toggleDoor(door, false);
                        }
                    }
                }, this.closeDelay * 20);
            }
        });
    }
    /**
     * Finds the other door in a double-door setup.
     * @param {import("@minecraft/server").Block} doorBlock The bottom part of the first door.
     * @returns {import("@minecraft/server").Block | null} The other door block, or null if not found.
     */
    findPair(doorBlock) {
        const offsets = [
            { x: 1, y: 0, z: 0 },
            { x: -1, y: 0, z: 0 },
            { x: 0, y: 0, z: 1 },
            { x: 0, y: 0, z: -1 },
        ];

        const isDoor = doorBlock.typeId.endsWith("_door");
        const mainHinge = isDoor ? doorBlock.permutation.getState("minecraft:cardinal_direction") : undefined;

        for (const offset of offsets) {
            const neighborLoc = {
                x: doorBlock.location.x + offset.x,
                y: doorBlock.location.y,
                z: doorBlock.location.z + offset.z,
            };

            const neighborBlock = doorBlock.dimension.getBlock(neighborLoc);
            if (neighborBlock && neighborBlock.typeId === doorBlock.typeId) {
                if (isDoor) {
                    const neighborHinge = neighborBlock.permutation.getState("minecraft:cardinal_direction");
                    if (neighborHinge !== undefined && mainHinge !== undefined && neighborHinge == mainHinge) {
                        return neighborBlock;
                    }
                } else {
                    return neighborBlock;
                }
            }
        }
        return null;
    }
    /**
     * Toggles the state of a door and its upper half if it exists.
     * @param {import("@minecraft/server").Block} doorBlock The bottom part of the door.
     * @param {boolean} open The new state for the door.
     */
    toggleDoor(doorBlock, open) {
        const typeId = doorBlock.typeId;
        const isDoor = typeId.endsWith("_door");
        const currentPerm = doorBlock.permutation;

        if (currentPerm.getState("open_bit") === open) return;

        const newPerm = currentPerm.withState("open_bit", open);
        doorBlock.setPermutation(newPerm);

        if (isDoor) {
            const topBlock = doorBlock.above();
            if (topBlock && topBlock.typeId === typeId) {
                const topPerm = topBlock.permutation.withState("open_bit", open);
                topBlock.setPermutation(topPerm);
            }
        }

        this.playSound(doorBlock, open);
    }
    /**
     * Plays the appropriate open/close sound for a door or trapdoor.
     * @param {import("@minecraft/server").Block} block The block to play the sound for.
     * @param {boolean} isOpen The state the block is changing to.
     */
    playSound(block, isOpen) {
        const typeId = block.typeId;
        let soundId;
        const action = isOpen ? "open" : "close";

        if (typeId.endsWith("_trapdoor")) {
            if (typeId.includes("iron")) {
                soundId = `${action}.iron_trapdoor`;
            } else {
                soundId = `${action}.wooden_trapdoor`;
            }
        } else {
            if (typeId.includes("iron")) {
                soundId = `${action}.iron_door`;
            } else {
                soundId = `${action}.wooden_door`;
            }
        }
        block.dimension.playSound(soundId, block.center());
    }
}

moduleManager.registerModule(new DoubleDoor());
