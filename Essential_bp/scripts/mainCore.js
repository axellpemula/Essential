import {
    world,
    system,
    CommandPermissionLevel,
    CustomCommandParamType,
    PlayerBreakBlockBeforeEvent,
    PlayerInteractWithBlockBeforeEvent,
    ItemUseBeforeEvent,
    PlayerBreakBlockAfterEvent,
} from "@minecraft/server";
import { ActionFormData, ModalFormData } from "@minecraft/server-ui";
import { changelog } from "./changelog.js";

let latestVersion = changelog[0]?.version;
/**
 * @typedef {import("@minecraft/server").PlayerBreakBlockBeforeEvent} PlayerBreakBlockBeforeEvent
 * @typedef {import("@minecraft/server").PlayerInteractWithBlockBeforeEvent} PlayerInteractWithBlockBeforeEvent
 * @typedef {import("@minecraft/server").ItemUseBeforeEvent} ItemUseBeforeEvent
 */
/**
 * A base class for creating modular features for Essential++.
 * Each major feature (like Skills, Daily Rewards, etc.) should extend this class.
 */
class Module {
    /**
     * @param {string} name The name of the module.
     * @param {string} description A brief description of what the module does.
     * @param {string} [tooltip] An optional tooltip for additional info in the UI.
     * @param {boolean} [isHeavy=false] Whether the module is performance-intensive.
     * @param {string} [texture] An optional texture path for the module icon.
     */
    constructor(name, description, tooltip, isHeavy = false, texture) {
        this.name = name;
        this.description = description;
        this.tooltip = tooltip || "Toggles this module on or off for the entire server.";
        this.isHeavy = isHeavy;
        this.texture = texture || "";
        this.isEnabled = true;
        this.settings = {};
        this.breakPriority = 0; // Default priority for break events
        this.interactPriority = 0; // Default priority for interact events
    }

    /**
     * Called when the module is loaded or enabled.
     * Good for one-time setup or subscribing to events.
     */
    onLoad() { }

    /**
     * Called when the module is unloaded or disabled.
     * Good for cleanup, like unsubscribing from events.
     */
    onUnload() { }

    /**
     * This method is intended to be called on every game tick.
     * Subclasses should override this with their specific tick-based logic.
     * Keep this as lightweight as possible for performance.
     */
    tick() { }

    /**
     * Event handler for world.beforeEvents.playerBreakBlock.
     * Modules that handle block breaking should override this.
     * @param {PlayerBreakBlockBeforeEvent} event
     */
    onPlayerBreak(event) {
        // Default empty handler
    }

    /**
     * Event handler for world.beforeEvents.playerInteractWithBlock.
     * Modules that handle block interaction should override this.
     * @param {PlayerInteractWithBlockBeforeEvent} event
     */
    onPlayerInteract(event) { }

    /**
     * Event handler for player using an item (e.g., right-clicking with an item).
     * Modules that handle item usage should override this.
     * @param {ItemUseBeforeEvent} event
     */
    onItemUse(event) { }
}

/**
 * Manages all Essential++ modules, including registration,
 * the main update loop, and core commands.
 */
class ModuleManager {
    constructor() {
        this.modules = new Map();
        this.currentTps = 20.0;
        this.settingsId = "essential++:module_settingsv2";
        this.setupEventListeners();
        this.initialize();
    }

    /**
     * Internal method to set up the module manager, including command registration.
     * @private
     */
    initialize() {
        let lastTickTime = Date.now();
        const tickTimes = [];
        const tickSampleSize = 100; // Sample last 100 ticks (5 seconds)

        system.runInterval(() => {
            const now = Date.now();
            const deltaTime = now - lastTickTime;
            lastTickTime = now;

            // Prevent abnormally large deltaTimes from skewing TPS (e.g., after a pause)
            // Cap at 200ms (5 TPS) to prevent extreme drops.
            const cappedDeltaTime = Math.min(deltaTime, 200);

            tickTimes.push(cappedDeltaTime);
            if (tickTimes.length > tickSampleSize) {
                tickTimes.shift();
            }

            if (tickTimes.length > 0) {
                const averageDelta = tickTimes.reduce((a, b) => a + b, 0) / tickTimes.length;
                this.currentTps = 1000 / averageDelta;
            }

            for (const module of this.modules.values()) {
                if (module.isEnabled) {
                    module.tick();
                }
            }
        });
    }

    /**
     * Sets up central event listeners for various Minecraft events.
     * This method acts as a dispatcher, routing events to registered modules
     * based on their priority and enabled status.
     * @private
     */
    setupEventListeners() {
        world.beforeEvents.playerBreakBlock.subscribe((event) => {
            const relevantModules = Array.from(this.modules.values())
                .filter((module) => module.isEnabled && typeof module.onPlayerBreak === "function" && module.breakPriority !== undefined)
                .sort((a, b) => b.breakPriority - a.breakPriority); // Highest priority first

            for (const module of relevantModules) {
                module.onPlayerBreak(event);
            }
        });

        world.beforeEvents.playerInteractWithBlock.subscribe((event) => {
            const relevantModules = Array.from(this.modules.values())
                .filter((module) => module.isEnabled && typeof module.onPlayerInteract === "function" && module.interactPriority !== undefined)
                .sort((a, b) => b.interactPriority - a.interactPriority); // Highest priority first

            for (const module of relevantModules) {
                module.onPlayerInteract(event);
            }
        });

        world.beforeEvents.itemUse.subscribe((event) => {
            const relevantModules = Array.from(this.modules.values())
                .filter((module) => module.isEnabled && typeof module.onItemUse === "function")
                .sort((a, b) => (b.itemUsePriority || 0) - (a.itemUsePriority || 0)); // Highest priority first

            for (const module of relevantModules) {
                module.onItemUse(event);
            }
        });
    }

    loadAndApplySettings() {
        const settingsJSON = world.getDynamicProperty(this.settingsId);
        let savedSettings = {};
        if (settingsJSON && typeof settingsJSON === "string") {
            try {
                savedSettings = JSON.parse(settingsJSON);
            } catch (e) {
                console.error("[Essential++] Failed to parse saved module settings.", e);
                return; // Exit if parsing fails
            }
        }

        for (const [name, module] of this.modules.entries()) {
            const saved = savedSettings[name];
            if (saved) {
                if (typeof saved.isEnabled === "boolean") module.isEnabled = saved.isEnabled;
                for (const key in module.settings) {
                    if (saved[key] !== undefined) {
                        const def = module.settings[key];
                        let val = saved[key];
                        // Coerce type based on setting definition
                        if (def?.type === "slider") val = Number(val);
                        else if (def?.type === "toggle") val = val === true;
                        else if (def?.type === "textField") val = String(val ?? "");
                        else if (def?.type === "dropdown") val = Number(val);
                        module[key] = val;
                    }
                }
            }
            // After settings are applied, call onLoad for enabled modules.
            if (module.isEnabled) {
                try {
                    module.onLoad();
                } catch (e) {
                    console.error(`[Essential++] Error during onLoad for module '${module.name}': ${e}`);
                }
            }
        }
        console.warn(`[Essential++] Successfully loaded and applied module settings.`);
    }

    saveSettings() {
        const settingsToSave = {};
        for (const [name, module] of this.modules.entries()) {
            settingsToSave[name] = {
                isEnabled: module.isEnabled,
            };
            for (const key in module.settings) {
                settingsToSave[name][key] = module[key];
            }
        }
        try {
            world.setDynamicProperty(this.settingsId, JSON.stringify(settingsToSave));
        } catch (e) {
            console.error("[Essential++] Failed to save module settings.", e);
        }
    }

    /**
     * Registers a new module with the manager.
     * @param {Module} module The module instance to register.
     */
    registerModule(module) {
        if (!(module instanceof Module)) {
            console.warn(`[Essential++] Attempted to register an object that is not a Module.`);
            return;
        }
        if (this.modules.has(module.name)) {
            console.warn(`[Essential++] A module with the name "${module.name}" is already registered.`);
            return;
        }

        this.modules.set(module.name, module);
        // console.warn(`[Essential++] Module "${module.name}" registered.`);
    }

    /**
     * Shows the main UI to the player, allowing them to see registered modules.
     * @param {import("@minecraft/server").Player} player The player to show the form to.
     */
    async showMainMenuCommand(player) {
        const moduleArray = Array.from(this.modules.values()).sort((a, b) => a.name.localeCompare(b.name));
        let ownerId = world.getDynamicProperty("owner");
        if (!ownerId) {
            world.setDynamicProperty("owner", player.id);
        }
        const form = new ActionFormData();
        form.title("Essential++");
        form.body(`Select a module to configure.` + `\n§7Current TPS: §a${this.currentTps.toFixed(2)}` + `\n§7Modules: §a${moduleArray.length}`);

        for (const module of moduleArray) {
            form.button(`${module.name}\n§8${module.isEnabled ? "§aEnabled" : "§cDisabled"}`, module.texture);
        }

        const { canceled, selection } = await form.show(player);

        if (canceled) return;

        const selectedModule = moduleArray[selection];
        if (selectedModule) {
            this.showModuleConfigMenu(player, selectedModule);
        }
    }

    /**
     * Shows the main UI to the player.
     * @param {import("@minecraft/server").Player} player The player to show the form to.
     */
    async showMainMenu(player) {
        let owner = world.getDynamicProperty("owner");
        let hasPermission = player.id === owner || player.hasTag("essential++:config_access");
        const form = new ActionFormData();
        form.title(`Essential++ Add-On §8[${latestVersion}]`);
        form.body("Welcome to the Essential++ configuration menu!\n" + `§7Current TPS: §a${this.currentTps.toFixed(2)}\n` + "§cNo access? /tag <yourname> add essential++:config_access");

        const actions = [];
        if (hasPermission) {
            form.button("Modules", "textures/ui/automation_glyph_color");
            actions.push("Modules");
            form.button("Settings", "textures/ui/settings_glyph_color_2x");
            actions.push("Settings");
        }
        if (this.modules.get("Navigation Waypoints")?.isEnabled) {
            form.button("Track Destination", "textures/ui/home_icon.png");
            actions.push("Track Destination");
        }
        form.button("Changelog", "textures/ui/blue_info_glyph");
        actions.push("Changelog");
        form.button("Credits", "textures/ui/icon_book_writable");
        actions.push("Credits");
        if (player.id === owner) {
            form.button("Grant Permission", "textures/ui/op");
            actions.push("Grant Permission");
            form.button("Revoke Permission", "textures/ui/permissions_member_star");
            actions.push("Revoke Permission");
        }

        form.show(player).then(({ canceled, selection }) => {
            if (canceled) return;
            const action = actions[selection];
            switch (action) {
                case "Modules":
                    this.showMainMenuCommand(player);
                    break;
                case "Settings":
                    this.showSettingsMenu(player);
                    break;
                case "Track Destination":
                    system.run(() => this.modules.get("Navigation Waypoints")?.showMenu(player));
                    break;
                case "Changelog":
                    this.showChangelog(player);
                    break;
                case "Credits":
                    this.showCredits(player);
                    break;
                case "Grant Permission":
                    this.grantPermission(player);
                    break;
                case "Revoke Permission":
                    this.revokePermission(player);
                    break;
            }
        });
    }

    /**
     * Shows general settings for Essential++.
     * @param {import("@minecraft/server").Player} player
     */
    async showSettingsMenu(player) {
        const form = new ModalFormData();
        form.title("Essential++ Settings");

        let giveMenu = world.getDynamicProperty("essential++:give_menu_on_join");
        if (giveMenu === undefined) giveMenu = true;

        form.toggle("Give Menu Item on Join", { defaultValue: giveMenu });

        const { canceled, formValues } = await form.show(player);
        if (canceled) {
            system.run(() => this.showMainMenu(player));
            return;
        }

        world.setDynamicProperty("essential++:give_menu_on_join", formValues[0]);
        CTsAPI.msg.sendSuccessMessage(player, "§7Settings saved.");
        system.run(() => this.showMainMenu(player));
    }

    /**
     * Grants configuration access permission to another player.
     * @param {import("@minecraft/server").Player} player
     */
    async grantPermission(player) {
        let players = Array.from(world.getAllPlayers()).filter((p) => p.id !== player.id);
        const form = new ModalFormData();
        if (players.length === 0) {
            form.title("Grant Permission");
            form.label(`§cNo other players available to grant permission to.`);
            form.submitButton("Back");
            form.show(player).then((re) => {
                if (re.canceled) return;
                system.run(() => this.showMainMenu(player));
            });
            return;
        }
        form.title("Grant Permission");
        form.label(`Allow other player to access Essential++ configuration menu`);
        form.dropdown(
            "Select a player to grant permission to:",
            Array.from(players.values()).map((p) => p.name),
        );
        form.submitButton("Grant Permission");
        const { canceled, formValues } = await form.show(player);
        if (canceled) return;
        const selectedPlayer = players[formValues[1]];
        if (selectedPlayer) {
            CTsAPI.msg.sendSuccessMessage(player, `§7Access granted to §a${selectedPlayer.name}§7.`);
            CTsAPI.msg.sendSuccessMessage(selectedPlayer, `§a${player.name} §7granted you config access.`);
            selectedPlayer.addTag("essential++:config_access");
        }
    }

    /**
     * Revokes configuration access permission from a player.
     * @param {import("@minecraft/server").Player} player
     */
    async revokePermission(player) {
        let players = Array.from(world.getAllPlayers()).filter((p) => p.hasTag("essential++:config_access"));
        const form = new ModalFormData();
        if (players.length === 0) {
            form.title("Revoke Permission");
            form.label(`§cNo other players available to revoke permission from.`);
            form.submitButton("Back");
            form.show(player).then((re) => {
                if (re.canceled) return;
                system.run(() => this.showMainMenu(player));
            });
            return;
        }
        form.title("Revoke Permission");
        form.label(`Revoke permission from a player`);
        form.dropdown(
            "Select a player to revoke permission from:",
            Array.from(players.values()).map((p) => p.name),
        );
        form.submitButton("Revoke Permission");
        const { canceled, formValues } = await form.show(player);
        if (canceled) return;
        const selectedPlayer = players[formValues[1]];
        if (selectedPlayer) {
            CTsAPI.msg.sendInfoMessage(player, `§7Access revoked from §c${selectedPlayer.name}§7.`);
            player.playSound("note.bass", { volume: 1.0 });
            selectedPlayer.removeTag("essential++:config_access");
            CTsAPI.msg.sendErrorMessage(selectedPlayer, `§cYour config access was revoked by §7${player.name}§c.`);
        }
    }

    /**
     * Shows a body-based changelog with a visual linebreaker.
     * @param {import("@minecraft/server").Player} player
     */
    async showChangelog(player) {
        const form = new ActionFormData();
        form.title("Changelog");
        const br = "§8═════════════════════§r";
        // Show every changelog
        const lines = [];
        lines.push(br);
        lines.push("§7Legend at the end");
        lines.push(br);
        lines.push(" ");
        for (const entry of changelog) {
            const latest = entry;
            if (latest.version == latestVersion) {
                lines.push(`§a§l${latest.version} Changelog §7(latest)`);
            } else {
                lines.push(`§l§a${latest.version} Changelog`);
            }
            lines.push(br);
            for (const item of latest.items) {
                if (typeof item === "string") {
                    lines.push(`${this.cCT(item.type)}§r ${item.title}`);
                } else if (item && typeof item.title === "string") {
                    lines.push(`${this.cCT(item.type)}§r §m${item.title}§r`);
                    if (Array.isArray(item.sub)) {
                        for (const sub of item.sub) {
                            lines.push(`  - ${sub}`);
                        }
                    }
                }
            }
            lines.push("\n");
        }
        let info = `§a§lLegend§r\n${br}\n${this.cCT("add")}§r Added\n${this.cCT("remove")}§r Removed\n${this.cCT("fix")}§r Fixed\n${this.cCT("change")}§r Changed\n\n`;
        const body = lines.join("\n") + info;
        form.body(body);
        form.button("Back");
        const { canceled } = await form.show(player);
        if (canceled) return;
        system.run(() => this.showMainMenu(player));
    }

    cCT(type) {
        switch (type) {
            case "add":
                return "§a+";
            case "remove":
                return "§c-";
            case "fix":
                return "§e»";
            case "change":
                return "§b»";
            default:
                return `§f${type}`;
        }
    }

    /**
     * Shows a simple credits view.
     * @param {import("@minecraft/server").Player} player
     */
    async showCredits(player) {
        const form = new ActionFormData();
        form.title("Credits");
        const lines = ["§aEssential++ Add-On", "§7Developed by: §bxVoid_Axell", "§9Discord: §baxell_08", "§7Contributors: §fCommunity members", "§7Thanks for using Essential++!"];
        const br = "§8═════════════════════§r";
        form.body([br, ...lines, br].join("\n"));
        form.button("Back");
        const { canceled } = await form.show(player);
        if (canceled) return;
        system.run(() => this.showMainMenu(player));
    }

    /**
     * Shows configuration UI for a specific module.
     * @param {import("@minecraft/server").Player} player
     * @param {Module} module
     */
    async showModuleConfigMenu(player, module) {
        const form = new ModalFormData();
        form.title(module.name);
        form.label(module.description);
        form.toggle("Enable Module", {
            defaultValue: module.isEnabled,
            tooltip: module.tooltip,
        });

        const settingKeys = Object.keys(module.settings);
        for (const key of settingKeys) {
            const setting = module.settings[key];
            const currentValue = module[key];
            switch (setting.type) {
                case "slider":
                    form.slider(setting.label, setting.min, setting.max, {
                        valueStep: setting.step,
                        defaultValue: currentValue,
                        tooltip: setting.tooltip,
                    });
                    break;
                case "toggle":
                    form.toggle(setting.label, { defaultValue: currentValue, tooltip: setting.tooltip });
                    break;
                case "textField":
                    form.textField(setting.label, setting.placeholder, { defaultValue: currentValue, tooltip: setting.tooltip });
                    break;
                case "dropdown":
                    form.dropdown(setting.label, setting.options, { defaultValueIndex: currentValue, tooltip: setting.tooltip });
                    break;
            }
        }

        const { canceled, formValues } = await form.show(player);
        if (!canceled) {
            const cleaned = formValues.filter((value) => value !== null && value !== undefined);
            const [enabledRaw, ...settingValues] = cleaned;
            const wasEnabled = module.isEnabled;
            const isNowEnabled = enabledRaw === true;
            let settingsChanged = false;

            if (settingValues.length !== settingKeys.length) {
                console.warn(`[Essential++] Warning: Settings value count mismatch for '${module.name}'. Expected ${settingKeys.length}, got ${settingValues.length}.`);
            }
            settingKeys.forEach((key, index) => {
                const definition = module.settings[key];
                let value = settingValues[index];
                if (definition?.type === "slider") value = Number(value);
                else if (definition?.type === "toggle") value = value === true;
                else if (definition?.type === "textField") value = String(value ?? "");
                else if (definition?.type === "dropdown") value = Number(value);

                if (module[key] !== value) {
                    module[key] = value;
                    settingsChanged = true;
                }
            });

            module.isEnabled = isNowEnabled;
            if (!wasEnabled && isNowEnabled) {
                try {
                    module.onLoad();
                } catch (error) {
                    console.error(`[Essential++] Error during onLoad for module '${module.name}': ${error}`);
                }
                CTsAPI.msg.sendActionMessage(player, `§7Module §b${module.name} §7is now §aenabled§7.`, true);
            } else if (wasEnabled && !isNowEnabled) {
                try {
                    module.onUnload();
                } catch (error) {
                    console.error(`[Essential++] Error during onUnload for module '${module.name}': ${error}`);
                }
                CTsAPI.msg.sendActionMessage(player, `§7Module §b${module.name} §7is now §cdisabled§7.`, false);
            } else if (isNowEnabled && settingsChanged) {
                try {
                    module.onUnload();
                    module.onLoad();
                } catch (error) {
                    console.error(`[Essential++] Error during settings-change reload for module '${module.name}': ${error}`);
                }
                CTsAPI.msg.sendSuccessMessage(player, `§7Settings reloaded for §b${module.name}§7.`);
            } else if (settingsChanged) {
                CTsAPI.msg.sendSuccessMessage(player, `§7Settings saved for §b${module.name}§7.`);
            }
            this.saveSettings();
        }

        system.run(() => this.showMainMenuCommand(player));
    }
}

class PerformanceModeModule extends Module {
    constructor() {
        super(
            "Performance Mode",
            "Automatically disables heavy features when server is lagging.",
            "Monitors server TPS and toggles modules marked as 'heavy' to improve performance.",
            false,
            "textures/ui/Ping_Green.png",
        );
        this.lagThreshold = 15.0; // TPS below which lag is detected
        this.recoveryThreshold = 17.5; // TPS above which server is considered stable
        this.isLagging = false;

        this.originallyEnabledHeavyModules = new Set(); // Stores names of modules that were enabled and heavy when lag started.
    }

    tick() {
        if (!this.isEnabled) return;
        if (system.currentTick % 20 !== 0) return; // Check every second (20 ticks)
        const tps = moduleManager.currentTps;

        if (!this.isLagging && tps < this.lagThreshold) {
            if (tps < 1) return;
            this.isLagging = true;
            CTsAPI.msg.broadcastMessage("§cHigh latency detected. §7Temporarily pausing features to stabilize.", "error");
            for (const module of moduleManager.modules.values()) {
                if (module.isHeavy && module !== this && module.isEnabled) {
                    this.originallyEnabledHeavyModules.add(module.name);
                    module.isEnabled = false;
                }
            }
        } else if (this.isLagging && tps > this.recoveryThreshold) {
            this.isLagging = false;
            CTsAPI.msg.broadcastMessage("§aPerformance stabilized. §7Restoring features.", "success");
            for (const moduleName of this.originallyEnabledHeavyModules) {
                const module = moduleManager.modules.get(moduleName);
                if (module) {
                    module.isEnabled = true;
                }
            }
            this.originallyEnabledHeavyModules.clear();
        }
    }
}

const moduleManager = new ModuleManager();
// moduleManager.registerModule(new PerformanceModeModule());

world.afterEvents.worldLoad.subscribe(() => {
    system.run(() => {
        moduleManager.loadAndApplySettings();
    });
});

system.beforeEvents.startup.subscribe((event) => {
    const { customCommandRegistry } = event;

    const essentialCommand = {
        name: "es:config",
        description: "Opens the main configuration menu for Essential++.",
        cheatsRequired: false,
        permissionLevel: CommandPermissionLevel.Any,
    };

    const essentialCallback = (origin, args) => {
        const player = origin.sourceEntity;
        let owner = world.getDynamicProperty("owner");
        system.run(() => {
            if (player.id != owner && !player.hasTag("essential++:config_access")) {
                CTsAPI.msg.sendErrorMessage(player, "§cAccess Denied. §7You do not have permission to view this menu.");
                return;
            }
            if (player && player.typeId === "minecraft:player") {
                moduleManager.showMainMenuCommand(player);
            } else {
                console.warn("The /es:config command can only be run by a player.");
            }
        });
    };

    try {
        customCommandRegistry.registerCommand(essentialCommand, essentialCallback);
    } catch (warn) {
        console.warn("[Essential++] Failed to register '/es:config' command.", warn);
    }

    const pvpCommand = {
        name: "es:pvp",
        description: "Toggles your Player vs. Player status.",
        permissionLevel: CommandPermissionLevel.Any,
        cheatsRequired: false,
    };

    const pvpCallback = (origin) => {
        const player = origin.sourceEntity;
        if (player?.typeId === "minecraft:player") {
            const pvpModule = moduleManager.modules.get("PvP");
            if (pvpModule?.isEnabled) {
                system.run(() => pvpModule.togglePvp(player));
            } else {
                system.run(() => {
                    CTsAPI.msg.sendErrorMessage(player, `§cAction Blocked. §7The §bPvP Module §7is currently disabled.`);
                })
            }
        }
    };

    try {
        customCommandRegistry.registerCommand(pvpCommand, pvpCallback);
    } catch (warn) {
        console.warn("[Essential++] Failed to register '/es:pvp' command.", warn);
    }

    // Homes Commands
    const setHomeCommand = {
        name: "es:sethome",
        description: "Sets a home at your current location.",
        permissionLevel: CommandPermissionLevel.Any,
        mandatoryParameters: [
            {
                name: "homeName",
                type: CustomCommandParamType.String,
            },
        ],
        cheatsRequired: false,
    };

    const setHomeCallback = (origin, homeName) => {
        const player = origin.sourceEntity;
        if (player?.typeId === "minecraft:player") {
            const homesModule = moduleManager.modules.get("Homes");
            if (homesModule?.isEnabled) {
                system.run(() => homesModule.setHome(player, homeName));
            } else {
                system.run(() => {
                    CTsAPI.msg.sendErrorMessage(player, "§7The §bHomes module §7is currently §cdisabled§7.");
                });
            }
        }
    };

    const homeCommand = {
        name: "es:home",
        description: "Teleports you to one of your saved homes.",
        permissionLevel: CommandPermissionLevel.Any,
        optionalParameters: [
            {
                name: "homeName",
                type: CustomCommandParamType.String,
            },
        ],
        cheatsRequired: false,
    };

    const homeCallback = (origin, homeName) => {
        const player = origin.sourceEntity;
        if (player?.typeId === "minecraft:player") {
            const homesModule = moduleManager.modules.get("Homes");
            if (homesModule?.isEnabled) {
                system.run(() => {
                    if (homeName) {
                        homesModule.teleportToHome(player, homeName);
                    } else {
                        homesModule.listHomes(player);
                    }
                });
            } else {
                system.run(() => {
                    CTsAPI.msg.sendErrorMessage(player, "§7The §bHomes module §7is currently §cdisabled§7.");
                });
            }
        }
    };

    const delHomeCommand = {
        name: "es:delhome",
        description: "Deletes one of your saved homes.",
        permissionLevel: CommandPermissionLevel.Any,
        cheatsRequired: false,
        mandatoryParameters: [{ name: "homeName", type: CustomCommandParamType.String }],
    };

    const delHomeCallback = (origin, homeName) => {
        const player = origin.sourceEntity;
        if (player?.typeId === "minecraft:player") {
            const homesModule = moduleManager.modules.get("Homes");
            if (homesModule?.isEnabled) {
                system.run(() => homesModule.deleteHome(player, homeName));
            } else {
                system.run(() => {
                    CTsAPI.msg.sendErrorMessage(player, "§7The §bHomes module §7is currently §cdisabled§7.");
                });
            }
        }
    };

    try {
        customCommandRegistry.registerCommand(setHomeCommand, setHomeCallback);
    } catch (e) {
        console.warn("[Essential++] Failed to register '/es:sethome' command.", e);
    }

    try {
        customCommandRegistry.registerCommand(homeCommand, homeCallback);
    } catch (e) {
        console.warn("[Essential++] Failed to register '/es:home' command.", e);
    }

    try {
        customCommandRegistry.registerCommand(delHomeCommand, delHomeCallback);
    } catch (e) {
        console.warn("[Essential++] Failed to register '/es:delhome' command.", e);
    }
    const changelogCommand = {
        name: "es:changelog",
        description: "Shows the changelog for Essential++.",
        permissionLevel: CommandPermissionLevel.Any,
        cheatsRequired: false,
    };

    try {
        customCommandRegistry.registerCommand(changelogCommand, (origin) => {
            const player = origin.sourceEntity;
            if (player?.typeId === "minecraft:player") {
                system.run(() => moduleManager.showChangelog(player));
            }
        });
    } catch (e) {
        console.warn("[Essential++] Failed to register '/es:changelog' command.", e);
    }
});

export { Module, moduleManager };
