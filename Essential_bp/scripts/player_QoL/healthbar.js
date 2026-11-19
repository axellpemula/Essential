import { Entity, EntitySpawnAfterEvent, system, world } from "@minecraft/server";
import { Module, moduleManager } from "../mainCore.js";

const healthbarTypeId = "es:healthbar";

class HealthbarModule extends Module {
    constructor() {
        super(
            "Healthbar",
            "Displays a health indicator above entities.",
            "Shows health when looking at a mob or when it's damaged. Configurable style.",
            true,
            "textures/ui/heart_new.png",
        );

        this.settings = {
            displayStyle: {
                type: "dropdown",
                label: "Display Style",
                options: ["Bar", "Numeric (Current/Max)", "Numeric (Current)", "Hearts"],
                tooltip: "How the health indicator is displayed.",
            },
            showOnLook: {
                type: "toggle",
                label: "Show on Look",
                tooltip: "Display healthbar when looking at an entity.",
            },
            showOnDamage: {
                type: "toggle",
                label: "Show on Damage",
                tooltip: "Display healthbar for a short time after an entity is damaged.",
            },
            showForPlayer: {
                type: "toggle",
                label: "Show for Player",
                tooltip: "Display healthbar for the player.",
            },
            displayDuration: {
                type: "slider",
                label: "Display Duration (seconds)",
                min: 1,
                max: 30,
                step: 1,
                tooltip: "How long the healthbar stays visible after being triggered.",
            },
            disableCustomEntities: {
                type: "toggle",
                label: "Disable Custom Entities",
                tooltip: "Prevent custom entities from having healthbars displayed.",
            },
            filteredMobs: {
                type: "textField",
                placeholder: "npc,armor_stand",
                label: "Filtered Mobs",
                tooltip: "Mobs that will not have healthbars displayed.",
            },
            toggleWhiteBlackList: {
                type: "toggle",
                label: "Toggle Whitelist/Blacklist",
                tooltip: "If enabled, only mobs in the filtered list will have healthbars displayed. If disabled, mobs in the filtered list will be ignored.",
            },
        };

        this.displayStyle = 0;
        this.showOnLook = true;
        this.showOnDamage = true;
        this.showForPlayer = false;
        this.displayDuration = 5;

        this.healthbarTag = "es_healthbar_target";
        this.failedToSpawn = false;

        this.disableCustomEntities = false;

        this.filteredMobs = "npc,armor_stand";
        this.toggleWhiteBlackList = false;

        this.handleEntityHealthChanged = this.handleEntityHealthChanged.bind(this);
        this.handleEntitySpawn = this.handleEntitySpawn.bind(this);

        world.afterEvents.entityHealthChanged.subscribe(this.handleEntityHealthChanged);
        world.afterEvents.entitySpawn.subscribe(this.handleEntitySpawn);
    }
    handleEntityHealthChanged({ entity }) {
        if (!this.isEnabled || !this.showOnDamage) return;
        if (entity.typeId === "minecraft:player" && !this.showForPlayer) return;
        if (entity.typeId === healthbarTypeId) return;
        this.updateHealthbar(entity);
    }
    /**
     *
     * @param {EntitySpawnAfterEvent} param0
     * @returns
     */
    handleEntitySpawn({ entity }) {
        if (!this.isEnabled) return;
        if (entity.typeId === healthbarTypeId) return;
        if (entity.typeId === "minecraft:player" && !this.showForPlayer) return;
        try {
            const health = entity?.getComponent("health");
            if (health && this.showOnDamage && health.currentValue < health.effectiveMax) {
                this.updateHealthbar(entity);
            }
        } catch (error) { }
    }

    onUnload() {
        this.cleanupWorldHealthbars();
    }

    tick() {
        if (!this.isEnabled) return;

        const dims = ["overworld", "nether", "the_end"];
        for (const name of dims) {
            const dim = world.getDimension(name);
            if (!dim) continue;
            const healthbars = dim.getEntities({ type: healthbarTypeId });

            for (const healthbar of healthbars) {
                const targetId = healthbar.getDynamicProperty("es_target_id");

                if (typeof targetId !== "string") {
                    healthbar.remove();
                    continue;
                }

                const target = world.getEntity(targetId);

                if (!target?.isValid) {
                    healthbar.remove();
                    continue;
                }

                const expiryTick = target.getDynamicProperty("es_healthbar_expiry");
                const health = target.getComponent("health");

                if (!health || health.currentValue <= 0 || (expiryTick && system.currentTick > expiryTick)) {
                    this.clearHealthbar(target);
                    continue;
                }

                if (target.typeId === "minecraft:player" && !this.showForPlayer) {
                    this.clearHealthbar(target);
                    continue;
                }

                const headY = target.getHeadLocation().y;
                healthbar.tryTeleport({ x: target.location.x, y: headY + 0.4, z: target.location.z });
            }
        }

        const trimmedFilteredMobs = this.filteredMobs
            .split(",")
            .map((mob) => mob.trim())
            .filter((mob) => mob.length > 0);

        const shouldSkipEntity = (entity) => {
            if (!entity?.isValid) return true;
            if (entity.typeId === healthbarTypeId) return true;
            if (entity.typeId === "minecraft:player" && !this.showForPlayer) return true;

            const idParts = entity.typeId.split(":");
            const shortId = idParts[idParts.length - 1];
            const isListed = trimmedFilteredMobs.includes(entity.typeId) || trimmedFilteredMobs.includes(shortId);
            const filteredOut = this.toggleWhiteBlackList ? !isListed : isListed;
            if (filteredOut) return true;

            if (this.disableCustomEntities && !entity.typeId.startsWith("minecraft:")) return true;

            return false;
        };

        if (this.showOnLook) {
            for (const player of world.getAllPlayers()) {
                const viewQuery = { maxDistance: 15 };
                if (!this.toggleWhiteBlackList && trimmedFilteredMobs.length > 0) {
                    viewQuery.excludeTypes = trimmedFilteredMobs;
                }

                const entityHit = player.getEntitiesFromViewDirection(viewQuery);
                if (entityHit.length === 0) continue;

                const entity = entityHit[0].entity;
                if (shouldSkipEntity(entity)) continue;
                this.updateHealthbar(entity);
            }
        } else {
            for (const player of world.getAllPlayers()) {
                const dimensionQuery = {};
                if (!this.toggleWhiteBlackList && trimmedFilteredMobs.length > 0) {
                    dimensionQuery.excludeTypes = trimmedFilteredMobs;
                }

                const entities = player.dimension.getEntities(dimensionQuery);
                for (const entity of entities) {
                    if (shouldSkipEntity(entity)) continue;
                    this.updateHealthbar(entity);
                }
            }
        }
    }

    clearHealthbar(target) {
        if (typeof target === "string") {
            target = world.getEntity(target);
        }
        if (!target?.isValid) return;

        const healthbarEntityId = target.getDynamicProperty("es_healthbar_id");
        if (healthbarEntityId) {
            const healthbarEntity = typeof healthbarEntityId === "string" ? world.getEntity(healthbarEntityId) : null;
            if (healthbarEntity?.isValid) {
                healthbarEntity.remove();
            }
        }

        target.removeTag(this.healthbarTag);
        target.setDynamicProperty("es_healthbar_id", undefined);
        target.setDynamicProperty("es_healthbar_expiry", undefined);
    }

    updateHealthbar(targetEntity) {
        if (!targetEntity?.isValid || targetEntity.typeId === healthbarTypeId || targetEntity.typeId.startsWith("es:")) return;

        const health = targetEntity.getComponent("health");
        if (!health) return;

        if (health.currentValue <= 0) {
            this.clearHealthbar(targetEntity);
            return;
        }

        const expiryTick = system.currentTick + this.displayDuration * 20;
        const healthbarText = this.generateHealthbarText(health.currentValue, health.effectiveMax);
        const nameTag = (targetEntity.nameTag ? `${targetEntity.nameTag}\n` : "") + healthbarText;
        const existingHealthbarId = targetEntity.getDynamicProperty("es_healthbar_id");
        if (existingHealthbarId) {
            const healthbarEntity = world.getEntity(existingHealthbarId);

            if (healthbarEntity?.isValid) {
                healthbarEntity.nameTag = nameTag;
                healthbarEntity.setDynamicProperty("es_target_id", targetEntity.id);
                targetEntity.setDynamicProperty("es_healthbar_expiry", expiryTick);
                if (!targetEntity.hasTag(this.healthbarTag)) targetEntity.addTag(this.healthbarTag);
                return;
            }
        }

        if (this.failedToSpawn) return;

        const headLocation = targetEntity.getHeadLocation();
        try {

            const newHealthbarEntity = targetEntity.dimension.spawnEntity(healthbarTypeId, { x: targetEntity.location.x, y: headLocation.y + 0.4, z: targetEntity.location.z });
            newHealthbarEntity.nameTag = nameTag;

            newHealthbarEntity.setDynamicProperty("es_target_id", targetEntity.id);
            targetEntity.addTag(this.healthbarTag);
            targetEntity.setDynamicProperty("es_healthbar_id", newHealthbarEntity.id);
            targetEntity.setDynamicProperty("es_healthbar_expiry", expiryTick);
        } catch (error) { }
    }

    generateHealthbarText(current, max) {
        const health = Math.ceil(current),
            maxHealth = Math.ceil(max),
            percentage = max > 0 ? health / maxHealth : 0,
            color = percentage > 0.5 ? "§a" : percentage > 0.25 ? "§e" : "§c";
        switch (this.displayStyle) {
            case 0: // Bar
                const barLength = 10,
                    filledLength = Math.round(barLength * percentage),
                    bar = "█".repeat(filledLength) + "§7" + "█".repeat(barLength - filledLength);
                return `${color}[${bar}${color}]`;
            case 1: // Numeric (Current/Max)
                return `${color}${health}§f/${maxHealth} §c`;
            case 2: // Numeric (Current)
                return `${color}${health}§c`;
            case 3: // Hearts
                const maxHearts = Math.ceil(maxHealth / 2);
                if (maxHearts > 20) return `${color}${health}§f/${String(maxHealth).length <= 10 ? maxHealth : 20} §c`;
                const fullHearts = Math.floor(health / 2),
                    halfHeart = health % 2 === 1;
                let hearts = "§c" + "".repeat(fullHearts);
                if (halfHeart) hearts += "";
                const emptyHearts = maxHearts - fullHearts - (halfHeart ? 1 : 0);
                if (emptyHearts > 0) hearts += "§7" + "".repeat(emptyHearts);
                return hearts;
            default:
                return "";
        }
    }

    cleanupWorldHealthbars() {
        const dims = ["overworld", "nether", "the_end"];
        for (const name of dims) {
            const dim = world.getDimension(name);
            if (!dim) continue;
            const entities = dim.getEntities({ type: healthbarTypeId });
            for (const entity of entities) {
                entity.remove();
            }
        }
    }
}

moduleManager.registerModule(new HealthbarModule());
