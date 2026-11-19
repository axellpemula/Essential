import { CommandPermissionLevel, Player, PlayerPermissionLevel, system, world } from "@minecraft/server";
import { ActionFormData, ModalFormData } from "@minecraft/server-ui";
import { Module, moduleManager } from "../mainCore.js";
import { ACTION_FORM_TAG, MODAL_FORM_TAG } from "../uiTags.js";

class Warp extends Module {
    constructor() {
        super("Warp", "A powerful warp system.", "Create public, private, and global warps via a UI menu.", false, "textures/ui/portalBg.png");
        this.settings = {
            isOpRequired: {
                type: "toggle",
                label: "Require Operator Status for Global Warps",
                tooltip: "If enabled, only operators can create global warps. Non-operators will have their warps set as private.",
            },
        };
        this.isEnabled = true;
        this.warpsKey = "essential++:warps";
        this.isOpRequired = true;
    }

    _getWarps() {
        const warpsJSON = world.getDynamicProperty(this.warpsKey);
        if (warpsJSON && typeof warpsJSON === "string") {
            try {
                return JSON.parse(warpsJSON);
            } catch {
                return {};
            }
        }
        return {};
    }

    _saveWarps(warps) {
        world.setDynamicProperty(this.warpsKey, JSON.stringify(warps));
    }

    setWarp(player, warpName, { isPublic = true, isGlobal = false }) {
        const warps = this._getWarps();

        if (isGlobal && !hasAdminPermission(player, this.isOpRequired)) {
            CTsAPI.msg.sendErrorMessage(player, "§7Only §cOperators §7can create global warps.");
            isGlobal = false;
        }

        if (warps[warpName] && warps[warpName].owner !== player.name && !hasAdminPermission(player, this.isOpRequired)) {
            CTsAPI.msg.sendErrorMessage(player, `§7Warp §b${warpName} §7already exists and you don't own it.`);
            return;
        }

        const isUpdate = !!warps[warpName];

        if (isUpdate) {
            CTsAPI.msg.sendSuccessMessage(player, `§7Warp §b${warpName} §7has been updated.`);
        } else {
            CTsAPI.msg.sendSuccessMessage(player, `§7Warp §b${warpName} §7has been created!`);
        }

        warps[warpName] = {
            ...player.location,
            dimension: player.dimension.id,
            owner: player.name,
            isPublic: isPublic,
            isGlobal: isGlobal,
        };

        this._saveWarps(warps);
    }
    /**
     *
     * @param {Player} player
     * @param {string} warpName
     * @returns
     */
    async deleteWarp(player, warpName) {
        const warps = this._getWarps();
        const warp = warps[warpName];

        if (!warps[warpName]) {
            CTsAPI.msg.sendErrorMessage(player, `§7Warp §b${warpName} §7not found.`);
            return;
        }

        if (warp.owner !== player.name && !hasAdminPermission(player, this.isOpRequired)) {
            CTsAPI.msg.sendErrorMessage(player, `§7You do not have permission to delete §b${warpName}§7.`);
            return;
        }

        const confirmForm = new ModalFormData().title(`${MODAL_FORM_TAG}Confirm Deletion`).label(`Are you sure you want to delete the warp "${warpName}"? This cannot be undone.`);
        confirmForm.toggle("Confirm Delete");
        const { formValues, canceled } = await confirmForm.show(player);

        if (canceled || !formValues || !formValues[1]) {
            CTsAPI.msg.sendInfoMessage(player, "§7Deletion cancelled.");
            return;
        }

        delete warps[warpName];
        this._saveWarps(warps);
        CTsAPI.msg.sendSuccessMessage(player, `§7Warp §b${warpName} §7has been deleted.`);
    }

    teleportToWarp(player, warpName) {
        const warps = this._getWarps();
        const warp = warps[warpName];

        if (!warp) {
            CTsAPI.msg.sendErrorMessage(player, `§7Warp §b${warpName} §7not found. Use §e/es:warp §7to see the list.`);
            return;
        }

        player.teleport({ x: warp.x, y: warp.y, z: warp.z }, { dimension: world.getDimension(warp.dimension) });
        CTsAPI.msg.sendSuccessMessage(player, `§7Teleporting to warp §b${warpName}§7...`);
    }

    async showTeleportMenu(player) {
        const warps = this._getWarps();
        const warpKeys = Object.keys(warps);

        const globalWarps = warpKeys.filter((key) => warps[key].isGlobal);
        const publicWarps = warpKeys.filter((key) => warps[key].isPublic && !warps[key].isGlobal);
        const privateWarps = warpKeys.filter((key) => !warps[key].isPublic && warps[key].owner === player.name);

        const availableWarps = [...globalWarps, ...publicWarps, ...privateWarps];

        if (availableWarps.length === 0) {
            CTsAPI.msg.sendInfoMessage(player, "§7There are no warps available for you to teleport to.");
            return;
        }

        const form = new ActionFormData().title(`${ACTION_FORM_TAG}Teleport to a Warp`).body("Select a destination.");
        const warpMap = [];

        globalWarps.sort().forEach((name) => {
            form.button(`§b${name}\n§8[Global]`, "textures/items/nether_star");
            warpMap.push(name);
        });
        publicWarps.sort().forEach((name) => {
            form.button(`${name}\n§8[Public]`, "textures/ui/portalBg");
            warpMap.push(name);
        });
        privateWarps.sort().forEach((name) => {
            form.button(`§a${name}\n§8[Private]`, "textures/ui/home_icon");
            warpMap.push(name);
        });

        const { selection, canceled } = await form.show(player);

        if (canceled || selection === undefined) return;

        const selectedWarp = warpMap[selection];
        this.teleportToWarp(player, selectedWarp);
    }

    async showCreateWarpMenu(player) {
        const form = new ModalFormData()
            .title(`${MODAL_FORM_TAG}Create Warp`)
            .textField("Warp Name", "Enter a unique name for the new warp")
            .toggle("Make this warp public?", { defaultValue: true });
        if (hasAdminPermission(player, this.isOpRequired)) {
            form.toggle("Make this a global warp? (Admin)", { defaultValue: false });
        }
        const { formValues, canceled } = await form.show(player);

        if (canceled || !formValues || !formValues[0]) {
            CTsAPI.msg.sendInfoMessage(player, "§7Warp creation cancelled.");
            return;
        }

        const [warpName, isPublic, isGlobal] = formValues;
        this.setWarp(player, warpName, { isPublic, isGlobal: isGlobal ?? false });
    }

    async showDeleteWarpSelectionMenu(player, isAdmin = false) {
        const allWarps = this._getWarps();
        const targetWarps = isAdmin ? Object.keys(allWarps) : Object.keys(allWarps).filter((name) => allWarps[name].owner === player.name);

        if (targetWarps.length === 0) {
            CTsAPI.msg.sendInfoMessage(player, `§7${isAdmin ? "There are no warps on the server" : "You have no warps"} to delete.`);
            return;
        }

        const form = new ActionFormData().title(`${ACTION_FORM_TAG}${isAdmin ? "Admin: Delete Warp" : "Delete My Warp"}`).body("Select a warp to delete.");
        targetWarps.sort().forEach((name) => form.button(name, "textures/ui/cancel"));
        const { selection, canceled } = await form.show(player);

        if (canceled || selection === undefined) return;

        const selectedWarp = targetWarps[selection];
        this.deleteWarp(player, selectedWarp);
    }

    async showEditWarpSelectionMenu(player, isAdmin = false) {
        const allWarps = this._getWarps();
        const targetWarps = isAdmin ? Object.keys(allWarps) : Object.keys(allWarps).filter((name) => allWarps[name].owner === player.name);

        if (targetWarps.length === 0) {
            CTsAPI.msg.sendInfoMessage(player, `§7${isAdmin ? "There are no warps on the server" : "You have no warps"} to edit.`);
            return;
        }

        const form = new ActionFormData().title(`${ACTION_FORM_TAG}${isAdmin ? "Admin: Edit Warp" : "Edit My Warp"}`).body("Select a warp to edit.");
        targetWarps.sort().forEach((name) => form.button(name, "textures/ui/pencil_edit_icon"));
        const { selection, canceled } = await form.show(player);
        if (canceled || selection === undefined) return;

        const selectedWarpName = targetWarps[selection];
        this.showEditWarpPropertiesMenu(player, selectedWarpName);
    }

    async showEditWarpPropertiesMenu(player, warpName) {
        const warps = this._getWarps();
        const warp = warps[warpName];
        if (!warp) {
            CTsAPI.msg.sendErrorMessage(player, `§7Warp §b${warpName} §7no longer exists.`);
            return;
        }
        if (warp.owner !== player.name && !hasAdminPermission(player, this.isOpRequired)) {
            CTsAPI.msg.sendErrorMessage(player, "§7You do not have permission to edit this warp.");
            return;
        }

        const form = new ModalFormData().title(`${MODAL_FORM_TAG}Editing: ${warpName}`).toggle("Public", { defaultValue: warp.isPublic });
        if (hasAdminPermission(player, this.isOpRequired)) form.toggle("Global (Admin)", { defaultValue: warp.isGlobal });

        const { formValues, canceled } = await form.show(player);
        if (canceled) {
            CTsAPI.msg.sendInfoMessage(player, "§7Edit cancelled.");
            return;
        }

        const [isPublic, isGlobal] = formValues;
        warp.isPublic = isPublic;
        if (hasAdminPermission(player, this.isOpRequired)) warp.isGlobal = isGlobal ?? false;

        this._saveWarps(warps);
        CTsAPI.msg.sendSuccessMessage(player, `§7Successfully updated warp §b${warpName}§7.`);
    }

    async showMyWarpsMenu(player) {
        const form = new ActionFormData().title(`${ACTION_FORM_TAG}Manage My Warps`).body("Manage your personal and public warps.");
        form.button("Create a New Warp", "textures/ui/icon_recipe_item");
        form.button("Edit a Warp", "textures/ui/pencil_edit_icon");
        form.button("Delete a Warp", "textures/ui/trash");

        const { selection, canceled } = await form.show(player);
        if (canceled) return;

        switch (selection) {
            case 0:
                this.showCreateWarpMenu(player);
                break;
            case 1:
                this.showEditWarpSelectionMenu(player, false);
                break;
            case 2:
                this.showDeleteWarpSelectionMenu(player, false);
                break;
        }
    }

    async showAdminMenu(player) {
        const form = new ActionFormData().title(`${ACTION_FORM_TAG}Admin: Warp Management`).body("Manage all server warps.");
        form.button("Edit a Warp", "textures/ui/pencil_edit_icon");
        form.button("Delete a Warp", "textures/ui/trash");
        form.button("Set a Warp's Location", "textures/blocks/command_block");

        const { selection, canceled } = await form.show(player);
        if (canceled) return;

        switch (selection) {
            case 0:
                this.showEditWarpSelectionMenu(player, true);
                break;
            case 1:
                this.showDeleteWarpSelectionMenu(player, true);
                break;
            case 2:
                this.showAdminSetLocationMenu(player);
                break;
        }
    }

    async showAdminSetLocationMenu(player) {
        const warps = this._getWarps();
        const warpNames = Object.keys(warps);
        if (warpNames.length === 0) {
            CTsAPI.msg.sendInfoMessage(player, "§7There are no warps to update.");
            return;
        }

        const form = new ActionFormData().title(`${ACTION_FORM_TAG}Admin: Set Warp Location`).body("Select a warp to update to your current location.");
        warpNames.sort().forEach((name) => form.button(name));

        const { selection, canceled } = await form.show(player);
        if (canceled || selection === undefined) return;

        const warpName = warpNames[selection];
        const warp = warps[warpName];
        Object.assign(warp, { ...player.location, dimension: player.dimension.id });
        this._saveWarps(warps);
        CTsAPI.msg.sendSuccessMessage(player, `§7Location for warp §b${warpName} §7has been updated.`);
    }

    /**
     *
     * @param {Player} player
     * @returns
     */
    async showMainMenu(player) {
        const form = new ActionFormData().title(`${ACTION_FORM_TAG}Warp System`).body("What would you like to do?");
        form.button("Teleport to a Warp", "textures/ui/portalBg");
        form.button("Manage My Warps", "textures/items/book_writable");
        if (hasAdminPermission(player, this.isOpRequired)) {
            form.button("Admin: Manage All Warps", "textures/items/nether_star");
        }
        const { selection, canceled } = await form.show(player);

        if (canceled) return;

        switch (selection) {
            case 0:
                this.showTeleportMenu(player);
                break;
            case 1:
                this.showMyWarpsMenu(player);
                break;
            case 2:
                if (hasAdminPermission(player, this.isOpRequired)) {
                    this.showAdminMenu(player);
                }
                break;
        }
    }
}

/**
 * Checks if a player has administrative permissions for warps, respecting the module setting.
 * @param {Player} player The player to check.
 * @param {boolean} isOpRequired The value from the module's setting.
 * @returns {boolean} True if the player has permission (either because OP isn't required or because they are an OP).
 */
function hasAdminPermission(player, isOpRequired) {
    let isOp = player.playerPermissionLevel == PlayerPermissionLevel.Operator;
    if (isOp) {
        return true;
    } else if (!isOpRequired) {
        return true;
    }
    return false;
}

const warpModule = new Warp();
moduleManager.registerModule(warpModule);

system.beforeEvents.startup.subscribe(({ customCommandRegistry }) => {
    customCommandRegistry.registerCommand(
        {
            name: "es:warp",
            description: "Opens the warp menu.",
            permissionLevel: CommandPermissionLevel.Any,
            cheatsRequired: false,
        },
        (origin) => {
            const player = origin.sourceEntity;
            if (player?.typeId === "minecraft:player") {
                if (warpModule.isEnabled) {
                    system.run(() => warpModule.showMainMenu(player));
                } else {
                    CTsAPI.msg.sendErrorMessage(player, `§7Warp §b${warpName} §7not found. Use §e/es:warp §7to see the list.`);
                }
            }
        },
    );
});
