import { world } from "@minecraft/server";
import { Module, moduleManager } from "../mainCore.js";

class AFKDetectionModule extends Module {
    constructor() {
        super(
            "AFK Detection",
            "Automatically marks players as AFK after a period of inactivity.",
            "Adds an 'afk' tag to inactive players. Great for server management.",
            true,
            "textures/ui/afk_icon.png",
        );

        this.settings = {
            afkTimeout: {
                type: "slider",
                label: "AFK Timeout (seconds)",
                min: 30,
                max: 600,
                step: 10,
            },
        };

        this.playerData = new Map();
        this.afkTimeout = 300; // 5 minutes in seconds
        this.afkTag = "afk";
    }

    tick() {
        const now = Date.now();
        const currentPlayers = new Set();

        for (const player of world.getPlayers()) {
            currentPlayers.add(player.id);
            const lastData = this.playerData.get(player.id);
            const currentRotation = player.getRotation();

            if (!lastData) {
                this.playerData.set(player.id, {
                    location: player.location,
                    rotation: currentRotation,
                    timestamp: now,
                    isAfk: false,
                });
                continue;
            }

            const hasMoved = CTsAPI.vector.distance(lastData.location, player.location) > 0.1;
            const hasRotated = lastData.rotation.x !== currentRotation.x || lastData.rotation.y !== currentRotation.y;

            if (hasMoved || hasRotated || player.isSneaking) {
                if (lastData.isAfk || player.hasTag(this.afkTag)) {
                    player.removeTag(this.afkTag);
                    CTsAPI.msg.broadcastMessage(`§b${player.name} §7is no longer §eAFK§7.`, "info", false);
                }
                this.playerData.set(player.id, { location: player.location, rotation: currentRotation, timestamp: now, isAfk: false });
            } else {
                if (!lastData.isAfk && now - lastData.timestamp > this.afkTimeout * 1000) {
                    lastData.isAfk = true;
                    player.addTag(this.afkTag);
                    CTsAPI.msg.broadcastMessage(`§b${player.name} §7is now §eAFK§7.`, "info", false);
                }
            }
        }

        for (const playerId of this.playerData.keys()) {
            if (!currentPlayers.has(playerId)) this.playerData.delete(playerId);
        }
    }
}

moduleManager.registerModule(new AFKDetectionModule());
