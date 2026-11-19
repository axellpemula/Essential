import { CommandPermissionLevel, LocationWaypoint, system, WaypointTexture, world } from "@minecraft/server";
import { ActionFormData } from "@minecraft/server-ui";
import { Module, moduleManager } from "../mainCore.js";

const ACTIVE_WAYPOINT_KEY = "essential++:active_waypoint";
const MAX_TRACKED_WAYPOINTS = 5;
const WAYPOINT_COLORS = {
    home: { red: 0.2, green: 0.75, blue: 1 },
    warp: { red: 0.78, green: 0.42, blue: 1 },
    waystone: { red: 1, green: 0.72, blue: 0.2 },
    grave: { red: 1, green: 0.35, blue: 0.38 },
    legacy: { red: 0.2, green: 0.75, blue: 1 },
};
const WAYPOINT_TEXTURE = {
    textureBoundsList: [{ lowerBound: 0, texture: WaypointTexture.Circle }],
};

class NavigationWaypointsModule extends Module {
    constructor() {
        super(
            "Navigation Waypoints",
            "Track homes, warps, waystones, and gravestones on the locator bar.",
            `Track up to ${MAX_TRACKED_WAYPOINTS} destinations at once.`,
            false,
            "textures/ui/home_icon.png",
        );
        // Player id -> waypoint id -> API waypoint handle.
        this.activeWaypoints = new Map();
    }

    onLoad() {
        for (const player of world.getAllPlayers()) this.restoreWaypoints(player);
    }

    onUnload() {
        for (const player of world.getAllPlayers()) this.removeOwnedWaypoints(player);
    }

    getDestinations(player) {
        const destinations = [];
        const homesModule = moduleManager.modules.get("Homes");
        if (homesModule?.isEnabled) {
            const homes = homesModule._getHomes(player);
            for (const [name, home] of Object.entries(homes)) {
                if (!this.isValidLocation(home)) continue;
                destinations.push({
                    ...home,
                    id: `home:${name}`,
                    name: `Home: ${name}`,
                    description: this.formatLocation(home),
                });
            }
        }

        const warpModule = moduleManager.modules.get("Warp");
        if (warpModule?.isEnabled) {
            const warps = warpModule._getWarps();
            for (const [name, warp] of Object.entries(warps)) {
                const isAvailable = warp.isGlobal || warp.isPublic || warp.owner === player.name;
                if (!isAvailable || !this.isValidLocation(warp)) continue;
                destinations.push({
                    ...warp,
                    id: `warp:${name}`,
                    name: `Warp: ${name}`,
                    description: this.formatLocation(warp),
                });
            }
        }

        const waystonesModule = moduleManager.modules.get("Waystones");
        if (waystonesModule?.isEnabled) {
            for (const propertyId of world.getDynamicPropertyIds().filter((id) => id.startsWith("es:waystone:"))) {
                try {
                    const data = JSON.parse(world.getDynamicProperty(propertyId));
                    const isAvailable = data?.public || data?.plr === player.id;
                    const location = data?.loc && { ...data.loc, dimension: data.dim };
                    if (!isAvailable || !this.isValidLocation(location)) continue;
                    destinations.push({
                        ...location,
                        id: `waystone:${propertyId}`,
                        name: `Waystone: ${data.name || "Unnamed"}`,
                        description: this.formatLocation(location),
                    });
                } catch {
                    // Ignore stale or malformed waystone records.
                }
            }
        }

        const gravestoneModule = moduleManager.modules.get("Gravestone");
        if (gravestoneModule?.isEnabled) {
            const graves = gravestoneModule._getGravestones();
            for (const [key, grave] of Object.entries(graves)) {
                if (grave.ownerId !== player.id || grave.despawnTimestamp <= Date.now()) continue;
                const parts = key.split(",");
                const dimension = parts.pop();
                const [x, y, z] = parts.map(Number);
                const location = { x, y, z, dimension };
                if (!this.isValidLocation(location)) continue;
                destinations.push({
                    ...location,
                    id: `grave:${key}`,
                    name: `Your Gravestone (${Math.floor(x)}, ${Math.floor(y)}, ${Math.floor(z)})`,
                    description: this.formatLocation(location),
                });
            }
        }

        return destinations.sort((a, b) => a.name.localeCompare(b.name));
    }

    isValidLocation(location) {
        return (
            location &&
            typeof location.dimension === "string" &&
            Number.isFinite(Number(location.x)) &&
            Number.isFinite(Number(location.y)) &&
            Number.isFinite(Number(location.z))
        );
    }

    formatLocation(location) {
        const dimension = String(location.dimension).replace(/^minecraft:/, "");
        return `${dimension} · ${Math.floor(location.x)}, ${Math.floor(location.y)}, ${Math.floor(location.z)}`;
    }

    getSavedWaypoints(player) {
        const raw = player.getDynamicProperty(ACTIVE_WAYPOINT_KEY);
        if (typeof raw !== "string") return [];

        try {
            const parsed = JSON.parse(raw);
            // Migrate the original single-object value transparently.
            const records = Array.isArray(parsed) ? parsed : parsed && typeof parsed === "object" ? [parsed] : [];
            return records
                .filter((record) => this.isValidLocation(record) && typeof record.name === "string")
                .map((record) => ({
                    ...(typeof record.id === "string" ? { id: record.id } : {}),
                    name: record.name,
                    dimension: record.dimension,
                    x: Number(record.x),
                    y: Number(record.y),
                    z: Number(record.z),
                }));
        } catch (error) {
            console.warn(`[Essential++] Could not read saved navigation waypoints for ${player.name}: ${error}`);
            return [];
        }
    }

    sameDestination(first, second) {
        if (first.id && second.id) return first.id === second.id;
        return (
            first.name === second.name &&
            first.dimension === second.dimension &&
            Number(first.x) === Number(second.x) &&
            Number(first.y) === Number(second.y) &&
            Number(first.z) === Number(second.z)
        );
    }

    getWaypointId(record) {
        return record.id || `legacy:${JSON.stringify([record.name, record.dimension, record.x, record.y, record.z])}`;
    }

    getWaypointColor(record) {
        const id = record.id || "legacy:";
        if (id.startsWith("home:")) return WAYPOINT_COLORS.home;
        if (id.startsWith("warp:")) return WAYPOINT_COLORS.warp;
        if (id.startsWith("waystone:")) return WAYPOINT_COLORS.waystone;
        if (id.startsWith("grave:")) return WAYPOINT_COLORS.grave;
        return WAYPOINT_COLORS.legacy;
    }

    async showMenu(player) {
        if (!this.isEnabled) {
            CTsAPI.msg.sendErrorMessage(player, "§7Navigation Waypoints is currently disabled.");
            return;
        }

        const destinations = this.getDestinations(player);
        const saved = this.getSavedWaypoints(player);
        const entries = destinations.map((destination) => ({
            destination,
            tracked: saved.some((record) => this.sameDestination(record, destination)),
            unavailable: false,
        }));

        for (const record of saved) {
            if (!destinations.some((destination) => this.sameDestination(record, destination))) {
                entries.push({ destination: record, tracked: true, unavailable: true });
            }
        }

        const body = destinations.length > 0 || saved.length > 0
            ? `Track up to ${MAX_TRACKED_WAYPOINTS} destinations simultaneously. Currently tracking ${saved.length}/${MAX_TRACKED_WAYPOINTS}. Select a destination to add or remove its marker.`
            : "No available destinations were found. Set a home, create a warp or waystone, or recover items from a gravestone first.";
        const form = new ActionFormData().title("Navigation Waypoints").body(body);

        for (const { destination, tracked, unavailable } of entries) {
            const status = tracked ? "§a[Tracking]" : "§7[Not tracking]";
            const detail = unavailable
                ? "§8Destination is unavailable; select to remove its saved marker."
                : `§8${destination.description || this.formatLocation(destination)}`;
            form.button(`${status} §r${destination.name}\n${detail}`, this.getDestinationIcon(destination));
        }
        form.button("Done");
        form.button("Clear All Tracked Destinations", "textures/ui/cancel");

        try {
            const { selection, canceled } = await form.show(player);
            if (canceled || selection === undefined) return;
            if (selection < entries.length) {
                const entry = entries[selection];
                if (entry.tracked) this.untrackDestination(player, entry.destination);
                else this.trackDestination(player, entry.destination);
                system.runTimeout(() => this.showMenu(player), 1);
            } else if (selection === entries.length + 1) {
                this.clearWaypoints(player);
            }
        } catch (error) {
            console.warn(`[Essential++] Could not show the navigation waypoint menu: ${error}`);
            CTsAPI.msg.sendErrorMessage(player, "§7Unable to open the waypoint menu right now.");
        }
    }

    getDestinationIcon(destination) {
        const id = destination.id || "";
        if (id.startsWith("home:") || destination.name.startsWith("Home:")) return "textures/ui/home_icon.png";
        if (id.startsWith("warp:") || destination.name.startsWith("Warp:")) return "textures/ui/portalBg";
        if (id.startsWith("waystone:") || destination.name.startsWith("Waystone:")) return "textures/blocks/waystones/icons/waystone";
        if (id.startsWith("grave:") || destination.name.startsWith("Your Gravestone")) return "textures/ui/gravestone_icon.png";
        return "textures/ui/home_icon.png";
    }

    trackDestination(player, destination) {
        if (!this.isValidLocation(destination)) {
            CTsAPI.msg.sendErrorMessage(player, "§7That destination has invalid location data.");
            return;
        }

        const saved = this.getSavedWaypoints(player);
        if (saved.some((record) => this.sameDestination(record, destination))) {
            CTsAPI.msg.sendInfoMessage(player, `§7Already tracking §b${destination.name}§7.`);
            return;
        }
        if (saved.length >= MAX_TRACKED_WAYPOINTS) {
            CTsAPI.msg.sendErrorMessage(player, `§7You can track at most §b${MAX_TRACKED_WAYPOINTS} §7destinations. Remove one first.`);
            return;
        }

        const record = {
            id: String(destination.id || this.getWaypointId(destination)),
            name: String(destination.name),
            dimension: String(destination.dimension),
            x: Number(destination.x),
            y: Number(destination.y),
            z: Number(destination.z),
        };

        try {
            this.addWaypoint(player, record);
            player.setDynamicProperty(ACTIVE_WAYPOINT_KEY, JSON.stringify([...saved, record]));
            CTsAPI.msg.sendSuccessMessage(player, `§7Now tracking §b${record.name} §7(${saved.length + 1}/${MAX_TRACKED_WAYPOINTS}).`);
        } catch (error) {
            this.removeActiveWaypoint(player, record);
            console.warn(`[Essential++] Failed to add a locator-bar waypoint for ${player.name}: ${error}`);
            CTsAPI.msg.sendErrorMessage(player, "§7Could not add the waypoint. The locator bar may be full or the location may be unavailable.");
        }
    }

    untrackDestination(player, destination) {
        const saved = this.getSavedWaypoints(player);
        const updated = saved.filter((record) => !this.sameDestination(record, destination));
        if (updated.length === saved.length) return;

        this.saveWaypoints(player, updated);
        this.rebuildWaypoints(player, updated);
        CTsAPI.msg.sendInfoMessage(player, `§7Stopped tracking §b${destination.name}§7. ${updated.length}/${MAX_TRACKED_WAYPOINTS} markers remain.`);
    }

    addWaypoint(player, record) {
        const dimension = world.getDimension(record.dimension.replace(/^minecraft:/, ""));
        const waypoint = new LocationWaypoint(
            { dimension, x: record.x, y: record.y, z: record.z },
            WAYPOINT_TEXTURE,
            this.getWaypointColor(record),
        );
        player.locatorBar.addWaypoint(waypoint);

        let playerWaypoints = this.activeWaypoints.get(player.id);
        if (!playerWaypoints) {
            playerWaypoints = new Map();
            this.activeWaypoints.set(player.id, playerWaypoints);
        }
        playerWaypoints.set(this.getWaypointId(record), waypoint);
    }

    restoreWaypoints(player) {
        if (!this.isEnabled) return;
        const saved = this.getSavedWaypoints(player);
        this.removeOwnedWaypoints(player);
        for (const record of saved.slice(0, MAX_TRACKED_WAYPOINTS)) {
            try {
                this.addWaypoint(player, record);
            } catch (error) {
                console.warn(`[Essential++] Could not restore waypoint '${record.name}' for ${player.name}: ${error}`);
            }
        }
    }

    saveWaypoints(player, records) {
        if (records.length === 0) player.setDynamicProperty(ACTIVE_WAYPOINT_KEY, undefined);
        else player.setDynamicProperty(ACTIVE_WAYPOINT_KEY, JSON.stringify(records));
    }

    rebuildWaypoints(player, records) {
        this.removeOwnedWaypoints(player);
        if (!this.isEnabled) return;
        for (const record of records) {
            try {
                this.addWaypoint(player, record);
            } catch (error) {
                console.warn(`[Essential++] Could not restore waypoint '${record.name}' for ${player.name}: ${error}`);
            }
        }
    }

    removeActiveWaypoint(player, record) {
        const playerWaypoints = this.activeWaypoints.get(player.id);
        const key = this.getWaypointId(record);
        const waypoint = playerWaypoints?.get(key);
        if (!waypoint) return false;

        try {
            waypoint.remove();
        } catch {
            // The waypoint may already have been removed by the game.
        }
        playerWaypoints.delete(key);
        if (playerWaypoints.size === 0) this.activeWaypoints.delete(player.id);
        return true;
    }

    removeOwnedWaypoints(player) {
        const playerWaypoints = this.activeWaypoints.get(player.id);
        if (playerWaypoints) {
            for (const waypoint of playerWaypoints.values()) {
                try {
                    waypoint.remove();
                } catch {
                    // The waypoint may already have been removed by the game.
                }
            }
            this.activeWaypoints.delete(player.id);
        }

        // Recover our markers after a script reload without removing markers
        // with colors that are not used by this module.
        try {
            for (const waypoint of player.locatorBar.getAllWaypoints()) {
                if (this.isOwnedWaypointColor(waypoint.color)) player.locatorBar.removeWaypoint(waypoint);
            }
        } catch {
            // Players may be leaving or their locator bar may not be ready yet.
        }
    }

    isOwnedWaypointColor(color) {
        if (!color) return false;
        return Object.values(WAYPOINT_COLORS).some((expected) =>
            Math.abs(color.red - expected.red) < 0.001 &&
            Math.abs(color.green - expected.green) < 0.001 &&
            Math.abs(color.blue - expected.blue) < 0.001,
        );
    }

    clearWaypoints(player) {
        this.removeOwnedWaypoints(player);
        player.setDynamicProperty(ACTIVE_WAYPOINT_KEY, undefined);
        CTsAPI.msg.sendInfoMessage(player, "§7All tracked destinations were cleared.");
    }
}

const navigationWaypointsModule = new NavigationWaypointsModule();
moduleManager.registerModule(navigationWaypointsModule);

world.afterEvents.playerSpawn.subscribe(({ player }) => {
    system.run(() => navigationWaypointsModule.restoreWaypoints(player));
});
world.afterEvents.playerLeave.subscribe(({ playerId }) => {
    navigationWaypointsModule.activeWaypoints.delete(playerId);
});

system.beforeEvents.startup.subscribe(({ customCommandRegistry }) => {
    customCommandRegistry.registerCommand(
        {
            name: "es:waypoint",
            description: "Opens the navigation waypoint menu.",
            permissionLevel: CommandPermissionLevel.Any,
            cheatsRequired: false,
        },
        (origin) => {
            const player = origin.sourceEntity;
            if (player?.typeId === "minecraft:player") {
                system.run(() => navigationWaypointsModule.showMenu(player));
            }
        },
    );
});
