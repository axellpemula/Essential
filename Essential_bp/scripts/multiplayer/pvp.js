import { EntityHurtBeforeEvent, world } from "@minecraft/server";
import { Module, moduleManager } from "../mainCore.js";

class TogglablePvpModule extends Module {
    constructor() {
        super("PvP", "Allows players to toggle their PvP status with /pvp.", "Players can only fight if both have PvP enabled.", false, "textures/ui/sword.png");
        this.isEnabled = false;
        this.pvpTag = "pvp_enabled";
        world.beforeEvents.entityHurt.subscribe(this.onEntityHurt.bind(this));
    }

    togglePvp(player) {
        if (player.hasTag(this.pvpTag)) {
            player.removeTag(this.pvpTag);
            player.sendMessage("§cYou have disabled PvP. You are now safe from other players.");
        } else {
            player.addTag(this.pvpTag);
            player.sendMessage("§aYou have enabled PvP. You can now fight other players who also have PvP enabled.");
        }
    }
    /**
     *
     * @param {EntityHurtBeforeEvent} event
     * @returns
     */
    onEntityHurt(event) {
        if (!this.isEnabled) return;

        const { hurtEntity, damageSource } = event;
        let damagingEntity = damageSource.damagingEntity;
        // Ensure both entities are players
        if (damagingEntity?.typeId !== "minecraft:player" || hurtEntity?.typeId !== "minecraft:player") {
            return;
        }

        const attackerHasPvp = damagingEntity.hasTag(this.pvpTag);
        const targetHasPvp = hurtEntity.hasTag(this.pvpTag);

        // If either player has PvP disabled, cancel the hit
        if (!attackerHasPvp || !targetHasPvp) {
            event.cancel = true;

            // Provide feedback to the attacker only if they have PvP enabled but the target doesn't.
            if (attackerHasPvp && !targetHasPvp) {
                CTsAPI.utils.actionBar(damagingEntity, `§c${hurtEntity.name} has PvP disabled.`);
            }
        }
    }
}

moduleManager.registerModule(new TogglablePvpModule());
