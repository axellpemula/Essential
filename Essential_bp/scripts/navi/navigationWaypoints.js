import { CommandPermissionLevel, LocationWaypoint, system, WaypointTexture, world } from "@minecraft/server";
import { ActionFormData } from "@minecraft/server-ui";
import { ACTION_FORM_TAG } from "../uiTags.js";
import { Module, moduleManager } from "../mainCore.js";

const ACTIVE_WAYPOINT_KEY = "essential++:active_waypoint";
const WAYPOINT_COLOR = { red: 0.2, green: 0.75, blue: 1 };
const WAYPOINT_TEXTURE = {
    textureBoundsList: [{ lowerBound: 0, texture: WaypointTexture.Circle }],
};

class NavigationWaypointsModule extends Module {
    constructor() {
        super(
            "Navigation Waypoints",
            "Track a home, warp, waystone, or your gravestone on the locator bar.",
            "Adds a native HUD marker for the selected destination. Tracking does not teleport you.",
            false,
            "textures/ui/home_icon.png",
        );
        this.activeWaypoints = new Map();
    }

    onLoad() {
        for (const player of world.getAllPlayers()) {
            this.restoreWaypoint(player);
        }
    }

    onUnload() {
        for (const player of world.getAllPlayers()) {
            this.removeOwnedWaypoint(player);
        }
    }

    getDestinations(player) {
        const destinations = [];
        const homesModule = moduleManager.modules.get("Homes");
        if (homesModule?.isEnabled) {
            const homes = homesModule._getHomes(player);
            for (const [name, home] of Object.entries(homes)) {
                if (!this.isValidLocation(home)) continue;
                destinations.push({
                    name: `Home: ${name}`,
                    description: this.formatLocation(home),
                    ...home,
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
                    name: `Warp: ${name}`,
                    description: this.formatLocation(warp),
                    ...warp,
                });
            }
        }

        const waystonesModule = moduleManager.modules.get("Waystones");
        if (waystonesModule?.isEnabled) {
            for (const id of world.getDynamicPropertyIds().filter((propertyId) => propertyId.startsWith("es:waystone:"))) {
                try {
                    const data = JSON.parse(world.getDynamicProperty(id));
                    const isAvailable = data?.public || data?.plr === player.id;
                    const location = data?.loc && { ...data.loc, dimension: data.dim };
                    if (!isAvailable || !this.isValidLocation(location)) continue;
                    destinations.push({
                        name: `Waystone: ${data.name || "Unnamed"}`,
                        description: this.formatLocation(location),
                        ...location,
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
                    name: `Your Gravestone (${Math.floor(x)}, ${Math.floor(y)}, ${Math.floor(z)})`,
                    description: this.formatLocation(location),
                    ...location,
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

    async showMenu(player) {
        if (!this.isEnabled) {
            CTsAPI.msg.sendErrorMessage(player, "§7Navigation Waypoints is currently disabled.");
            return;
        }

        const destinations = this.getDestinations(player);
        const body = destinations.length > 0
            ? "Choose a destination to show a marker on your locator bar. Tracking does not teleport you."
            : "No available destinations were found. Set a home, create a warp or waystone, or recover items from a gravestone first.";
        const form = new ActionFormData()
            .title(`${ACTION_FORM_TAG}Navigation Waypoints`)
            .body(body);

        destinations.forEach((destination) => {
            const icon = destination.name.startsWith("Home:")
                ? "textures/ui/home_icon.png"
                : destination.name.startsWith("Warp:")
                  ? "textures/ui/portalBg"
                  : destination.name.startsWith("Waystone:")
                    ? "textures/blocks/waystones/icons/waystone"
                    : "textures/ui/gravestone_icon.png";
            form.button(`${destination.name}\n§8${destination.description}`, icon);
        });

        form.button("Clear Tracked Destination", "textures/ui/cancel");

        try {
            const { selection, canceled } = await form.show(player);
            if (canceled || selection === undefined) return;
            if (selection < destinations.length) {
                this.setWaypoint(player, destinations[selection]);
            } else {
                this.clearWaypoint(player);
            }
        } catch (error) {
            console.warn(`[Essential++] Could not show the navigation waypoint menu: ${error}`);
            CTsAPI.msg.sendErrorMessage(player, "§7Unable to open the waypoint menu right now.");
        }
    }

    setWaypoint(player, destination) {
        if (!this.isValidLocation(destination)) {
            CTsAPI.msg.sendErrorMessage(player, "§7That destination has invalid location data.");
            return;
        }

        const record = {
            name: String(destination.name),
            dimension: String(destination.dimension),
            x: Number(destination.x),
            y: Number(destination.y),
            z: Number(destination.z),
        };

        this.removeOwnedWaypoint(player);
        try {
            this.addWaypoint(player, record);
            player.setDynamicProperty(ACTIVE_WAYPOINT_KEY, JSON.stringify(record));
            CTsAPI.msg.sendSuccessMessage(player, `§7Tracking §b${record.name} §7on your locator bar.`);
        } catch (error) {
            console.warn(`[Essential++] Failed to add a locator-bar waypoint for ${player.name}: ${error}`);
            CTsAPI.msg.sendErrorMessage(player, "§7Could not add the waypoint. The locator bar may be full or the location may be unavailable.");
            this.restoreWaypoint(player);
        }
    }

    addWaypoint(player, record) {
        const dimension = world.getDimension(record.dimension.replace(/^minecraft:/, ""));
        const waypoint = new LocationWaypoint(
            {
                dimension,
                x: record.x,
                y: record.y,
                z: record.z,
            },
            WAYPOINT_TEXTURE,
            WAYPOINT_COLOR,
        );
        player.locatorBar.addWaypoint(waypoint);
        this.activeWaypoints.set(player.id, waypoint);
    }

    restoreWaypoint(player) {
        if (!this.isEnabled) return;

        let saved;
        try {
            const raw = player.getDynamicProperty(ACTIVE_WAYPOINT_KEY);
            if (typeof raw !== "string") return;
            saved = JSON.parse(raw);
            if (!this.isValidLocation(saved)) return;
            this.removeOwnedWaypoint(player);
            this.addWaypoint(player, saved);
        } catch (error) {
            console.warn(`[Essential++] Could not restore a locator-bar waypoint for ${player.name}: ${error}`);
        }
    }

    clearWaypoint(player) {
        this.removeOwnedWaypoint(player);
        player.setDynamicProperty(ACTIVE_WAYPOINT_KEY, undefined);
        CTsAPI.msg.sendInfoMessage(player, "§7Tracked destination cleared.");
    }

    removeOwnedWaypoint(player) {
        const current = this.activeWaypoints.get(player.id);
        if (current) {
            try {
                current.remove();
            } catch {
                // The waypoint may already have been removed by the game.
            }
            this.activeWaypoints.delete(player.id);
        }

        // Recover our marker after a script reload without touching markers
        // created by other behavior packs (they are not visible through this API).
        try {
            for (const waypoint of player.locatorBar.getAllWaypoints()) {
                const color = waypoint.color;
                if (
                    color &&
                    color.red === WAYPOINT_COLOR.red &&
                    color.green === WAYPOINT_COLOR.green &&
                    color.blue === WAYPOINT_COLOR.blue
                ) {
                    player.locatorBar.removeWaypoint(waypoint);
                }
            }
        } catch {
            // Players may be leaving or their locator bar may not be ready yet.
        }
    }
}

const navigationWaypointsModule = new NavigationWaypointsModule();
moduleManager.registerModule(navigationWaypointsModule);

world.afterEvents.playerSpawn.subscribe(({ player }) => {
    system.run(() => navigationWaypointsModule.restoreWaypoint(player));
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
