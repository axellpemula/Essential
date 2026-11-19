import { system, world, EquipmentSlot, Block, BlockPermutation } from "@minecraft/server";
import { Module, moduleManager } from "../mainCore";
/**
 * @type {fakeBlock}
 */
let fakeBlockModuleInstance;

class fakeBlock extends Module {
    constructor() {
        super(
            "Fake Blocks",
            "Allows for blocks that only render when wearing specific goggles.",
            "Allows for blocks that only render when wearing specific goggles.",
            true,
            "textures/items/fake_blocks_goggles",
        );
        this.settings = {
            renderCheckDistance: {
                type: "slider",
                label: "Render Check Distance",
                min: 1,
                max: 30,
                step: 1,
                tooltip: "How far away fake blocks will render when wearing the goggles.",
            },
            durabilityLoss: {
                type: "toggle",
                label: "Durability Loss",
                tooltip: "If enabled, the goggles will take durability damage when rendering fake blocks.",
            },
        };
        this.isEnabled = false;
        this.durabilityLoss = false;
        this.renderCheckDistance = 30;
    }

    tick() {
        if (!this.isEnabled) return;
        if (system.currentTick % 20 !== 0) return; // Check every second
        for (const player of world.getAllPlayers()) {
            const equippable = player.getComponent("equippable");
            const helmet = equippable?.getEquipment(EquipmentSlot.Head);
            const hasGoggles = helmet && (helmet.typeId === "es:fake_block_goggles" || helmet.typeId === "es:fake_blocks_goggles");
            if (!hasGoggles) continue;

            const renders = player.dimension.getEntities({ type: "es:render", location: player.location, maxDistance: this.renderCheckDistance, closest: 1 });
            if (!renders || renders.length === 0) continue;

            if (this.durabilityLoss) CTsAPI.utils.increaseDurabilityArmor(player, helmet, 1);
        }
    }
}

system.beforeEvents.startup.subscribe(({ blockComponentRegistry }) => {
    blockComponentRegistry.registerCustomComponent("es:fake_block", {
        onTick: ({ block }) => {
            const fakeBlockInstance = fakeBlockModuleInstance;
            if (fakeBlockInstance?.isEnabled) {
                // if (block.permutation.getState("es:fake_block")) return;
                block.setPermutation(block.permutation.withState("es:fake_block_on", false));
                return
            }
            block.setPermutation(block.permutation.withState("es:fake_block_on", true));
            let renderer = getOrCleanupRenderer(block);

            const nearbyPlayers = block.dimension.getPlayers({
                location: block.location,
                maxDistance: fakeBlockInstance.renderCheckDistance,
            });

            const playersWithGoggles = [];
            const playersWithoutGoggles = [];
            for (const player of nearbyPlayers) {
                const equipment = player.getComponent("equippable");
                const helmet = equipment?.getEquipment(EquipmentSlot.Head);
                if (helmet?.typeId === "es:fake_block_goggles" || helmet?.typeId === "es:fake_blocks_goggles") {
                    playersWithGoggles.push(player);
                } else {
                    playersWithoutGoggles.push(player);
                }
            }

            const anyGoggles = playersWithGoggles.length > 0;
            if (anyGoggles) {
                if (!renderer?.isValid) {
                    renderer = block.dimension.spawnEntity("es:render", CTsAPI.vector.add(block.center(), { x: 0, y: -0.5, z: 0 }));
                }

                if (renderer?.isValid) {
                    for (const player of playersWithGoggles) {
                        player.setPropertyOverrideForEntity(renderer, "es:show", true);
                    }
                    for (const player of playersWithoutGoggles) {
                        player.setPropertyOverrideForEntity(renderer, "es:show", false);
                    }
                }
            } else if (renderer?.isValid) {
                renderer.remove();
            }
        },
        onBreak({ block }) {
            const renderer = getOrCleanupRenderer(block);
            if (renderer?.isValid) {
                renderer.remove();
            }
        },
    });
});
/**
 *
 * @param {Block} block
 * @returns {import("@minecraft/server").Entity|undefined}
 */
function getOrCleanupRenderer(block) {
    const center = block.center();
    const nearby = block.dimension.getEntities({ type: "es:render", location: CTsAPI.vector.add(center, { x: 0, y: -0.5, z: 0 }), maxDistance: 0.5, closest: 1 });
    if (!nearby || nearby.length === 0) return undefined;
    const sorted = nearby.sort((a, b) => {
        const da = (a.location.x - center.x) ** 2 + (a.location.y - center.y) ** 2 + (a.location.z - center.z) ** 2;
        const db = (b.location.x - center.x) ** 2 + (b.location.y - center.y) ** 2 + (b.location.z - center.z) ** 2;
        return da - db;
    });
    const keep = sorted[0];
    for (let i = 1; i < sorted.length; i++) {
        if (sorted[i]?.isValid) sorted[i].remove();
    }
    return keep?.isValid ? keep : undefined;
}

fakeBlockModuleInstance = new fakeBlock();
moduleManager.registerModule(fakeBlockModuleInstance);
