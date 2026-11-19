import { world, system } from "@minecraft/server";
import { Module, moduleManager } from "../mainCore.js";

class HomesModule extends Module {
    constructor() {
        super("Homes", "Allows players to set, teleport to, and delete homes.", "Set teleportation points with /es:sethome.", false, "textures/ui/home_icon.png");

        this.settings = {
            maxHomes: {
                type: "slider",
                label: "Max Homes Per Player",
                min: 1,
                max: 20,
                step: 1,
                tooltip: "The maximum number of homes a player can set.",
            },
        };

        this.maxHomes = 5; // Default value
        this.homesKey = "essential++:homes";
    }

    _getHomes(player) {
        const homesJSON = player.getDynamicProperty(this.homesKey);
        if (homesJSON && typeof homesJSON === "string") {
            try {
                return JSON.parse(homesJSON);
            } catch {
                return {};
            }
        }
        return {};
    }

    _saveHomes(player, homes) {
        player.setDynamicProperty(this.homesKey, JSON.stringify(homes));
    }

    setHome(player, homeName) {
        const homes = this._getHomes(player);
        const homeCount = Object.keys(homes).length;

        if (!homes[homeName] && homeCount >= this.maxHomes) {
            CTsAPI.msg.sendErrorMessage(player, `§7You have reached the maximum limit of §b${this.maxHomes} §7homes.`);
            return;
        }

        homes[homeName] = {
            x: player.location.x,
            y: player.location.y,
            z: player.location.z,
            dimension: player.dimension.id,
        };

        this._saveHomes(player, homes);
        CTsAPI.msg.sendSuccessMessage(player, `§7Home §b${homeName} §7has been set!`);
    }

    teleportToHome(player, homeName) {
        const homes = this._getHomes(player);
        const home = homes[homeName];

        if (!home) {
            CTsAPI.msg.sendErrorMessage(player, `§7Home §b${homeName} §7not found. Use §e/es:home §7to see your list.`);
            return;
        }

        player.teleport({ x: home.x, y: home.y, z: home.z }, { dimension: world.getDimension(home.dimension) });
        CTsAPI.msg.sendSuccessMessage(player, `§7Teleporting to home §b${homeName}§7...`);
    }

    deleteHome(player, homeName) {
        const homes = this._getHomes(player);

        if (!homes[homeName]) {
            CTsAPI.msg.sendErrorMessage(player, `§7Home §b${homeName} §7not found.`);
            return;
        }

        delete homes[homeName];
        this._saveHomes(player, homes);
        CTsAPI.msg.sendSuccessMessage(player, `§7Home §b${homeName} §7has been deleted.`);
    }

    listHomes(player) {
        const homes = this._getHomes(player);
        const homeNames = Object.keys(homes);

        if (homeNames.length === 0) {
            CTsAPI.msg.sendInfoMessage(player, `§7You have no homes set. Use §e/es:sethome <name> §7to set one.`);
        } else {
            CTsAPI.msg.sendInfoMessage(player, `§7Your homes: §b${homeNames.join("§7, §b")}`);
        }
    }
}

moduleManager.registerModule(new HomesModule());
