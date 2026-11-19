import { CommandPermissionLevel, CustomCommandParamType, system, world } from "@minecraft/server";
import { Module, moduleManager } from "../mainCore.js";

const REQUEST_EXPIRY_SECONDS = 60;
const REQUEST_COOLDOWN_SECONDS = 30;

class TeleportRequestModule extends Module {
    constructor() {
        super(
            "Teleport Requests",
            "Let players request to teleport to one another.",
            "Use /es:tpa <player>; the target can accept or deny the request.",
            false,
            "textures/ui/home_icon.png",
        );

        this.settings = {
            requestExpiry: {
                type: "slider",
                label: "Request Expiry (Seconds)",
                min: 15,
                max: 120,
                step: 15,
                tooltip: "How long a teleport request remains available.",
            },
            requestCooldown: {
                type: "slider",
                label: "Request Cooldown (Seconds)",
                min: 0,
                max: 120,
                step: 10,
                tooltip: "How long a player must wait before sending another request. Set to 0 to disable.",
            },
        };

        this.requestExpiry = REQUEST_EXPIRY_SECONDS;
        this.requestCooldown = REQUEST_COOLDOWN_SECONDS;
        this.requestsByTarget = new Map();
        this.targetByRequester = new Map();
        this.cooldownUntil = new Map();

        world.afterEvents.playerLeave.subscribe(({ playerId }) => this.onPlayerLeave(playerId));
        system.beforeEvents.startup.subscribe(({ customCommandRegistry }) => this.registerCommands(customCommandRegistry));
    }

    registerCommands(customCommandRegistry) {
        const commands = [
            {
                definition: {
                    name: "es:tpa",
                    description: "Request to teleport to another player.",
                    permissionLevel: CommandPermissionLevel.Any,
                    cheatsRequired: false,
                    mandatoryParameters: [{ name: "player", type: CustomCommandParamType.PlayerSelector }],
                },
                callback: (origin, target) => {
                    const requester = origin.sourceEntity;
                    if (requester?.typeId !== "minecraft:player" || target?.typeId !== "minecraft:player") return;
                    system.run(() => this.sendRequest(requester, target));
                },
            },
            {
                definition: {
                    name: "es:tpaccept",
                    description: "Accept the pending teleport request.",
                    permissionLevel: CommandPermissionLevel.Any,
                    cheatsRequired: false,
                },
                callback: (origin) => {
                    const player = origin.sourceEntity;
                    if (player?.typeId === "minecraft:player") system.run(() => this.acceptRequest(player));
                },
            },
            {
                definition: {
                    name: "es:tpdeny",
                    description: "Deny the pending teleport request.",
                    permissionLevel: CommandPermissionLevel.Any,
                    cheatsRequired: false,
                },
                callback: (origin) => {
                    const player = origin.sourceEntity;
                    if (player?.typeId === "minecraft:player") system.run(() => this.denyRequest(player));
                },
            },
            {
                definition: {
                    name: "es:tpacancel",
                    description: "Cancel your outgoing teleport request.",
                    permissionLevel: CommandPermissionLevel.Any,
                    cheatsRequired: false,
                },
                callback: (origin) => {
                    const player = origin.sourceEntity;
                    if (player?.typeId === "minecraft:player") system.run(() => this.cancelRequest(player));
                },
            },
        ];

        for (const { definition, callback } of commands) {
            try {
                customCommandRegistry.registerCommand(definition, callback);
            } catch (error) {
                console.warn(`[Essential++] Failed to register '/${definition.name}' command.`, error);
            }
        }
    }

    onUnload() {
        for (const request of this.requestsByTarget.values()) {
            this.removeRequest(request);
            const requester = this.getOnlinePlayer(request.requesterId);
            const target = this.getOnlinePlayer(request.targetId);
            if (requester) CTsAPI.msg.sendInfoMessage(requester, "§7Your teleport request was cleared because the module was disabled.");
            if (target) CTsAPI.msg.sendInfoMessage(target, "§7The pending teleport request was cleared because the module was disabled.");
        }
        this.requestsByTarget.clear();
        this.targetByRequester.clear();
        this.cooldownUntil.clear();
    }

    sendRequest(requester, target) {
        if (!this.isEnabled) {
            CTsAPI.msg.sendErrorMessage(requester, "§7Teleport Requests is currently disabled.");
            return;
        }
        const requesterOnline = this.getOnlinePlayer(requester.id);
        if (!requesterOnline) return;
        requester = requesterOnline;

        if (requester.id === target.id) {
            CTsAPI.msg.sendErrorMessage(requester, "§7You cannot request to teleport to yourself.");
            return;
        }

        const targetOnline = this.getOnlinePlayer(target.id);
        if (!targetOnline) {
            CTsAPI.msg.sendErrorMessage(requester, "§7That player is no longer online.");
            return;
        }

        const now = Date.now();
        const existingOutgoingTargetId = this.targetByRequester.get(requester.id);
        const existingOutgoing = existingOutgoingTargetId && this.requestsByTarget.get(existingOutgoingTargetId);
        if (existingOutgoing?.expiresAt > now) {
            CTsAPI.msg.sendInfoMessage(requester, `§7You already have a pending request to §b${existingOutgoing.targetName}§7. Use §e/es:tpacancel §7to cancel it.`);
            return;
        }
        if (existingOutgoing) this.expireRequest(existingOutgoing);
        else if (existingOutgoingTargetId) this.targetByRequester.delete(requester.id);

        const cooldownUntil = this.cooldownUntil.get(requester.id) ?? 0;
        if (cooldownUntil > now) {
            const secondsLeft = Math.ceil((cooldownUntil - now) / 1000);
            CTsAPI.msg.sendErrorMessage(requester, `§7Please wait §b${secondsLeft} §7second(s) before sending another request.`);
            return;
        }
        this.cooldownUntil.delete(requester.id);

        const currentRequest = this.requestsByTarget.get(targetOnline.id);
        if (currentRequest?.expiresAt > now) {
            CTsAPI.msg.sendErrorMessage(requester, `§b${targetOnline.name} §7already has a pending teleport request.`);
            return;
        }
        if (currentRequest) this.expireRequest(currentRequest);

        const request = {
            requesterId: requester.id,
            requesterName: requester.name,
            targetId: targetOnline.id,
            targetName: targetOnline.name,
            expiresAt: now + this.requestExpiry * 1000,
        };
        this.requestsByTarget.set(targetOnline.id, request);
        this.targetByRequester.set(requester.id, targetOnline.id);
        if (this.requestCooldown > 0) {
            this.cooldownUntil.set(requester.id, now + this.requestCooldown * 1000);
        }

        CTsAPI.msg.sendSuccessMessage(requester, `§7Teleport request sent to §b${targetOnline.name}§7. It expires in §b${this.requestExpiry} §7seconds.`);
        CTsAPI.msg.sendInfoMessage(targetOnline, `§b${requester.name} §7wants to teleport to you. Use §e/es:tpaccept §7or §e/es:tpdeny§7. Request expires in §b${this.requestExpiry} §7seconds.`);
        system.runTimeout(() => this.expireRequest(request), this.requestExpiry * 20);
    }

    acceptRequest(target) {
        if (!this.isEnabled) {
            CTsAPI.msg.sendErrorMessage(target, "§7Teleport Requests is currently disabled.");
            return;
        }
        const targetOnline = this.getOnlinePlayer(target.id);
        if (!targetOnline) return;
        target = targetOnline;

        const request = this.requestsByTarget.get(target.id);
        if (!request) {
            CTsAPI.msg.sendInfoMessage(target, "§7You do not have a pending teleport request.");
            return;
        }
        if (request.expiresAt <= Date.now()) {
            this.expireRequest(request);
            return;
        }

        const requester = this.getOnlinePlayer(request.requesterId);
        if (!requester) {
            this.removeRequest(request);
            CTsAPI.msg.sendInfoMessage(target, "§7The requesting player is no longer online.");
            return;
        }

        try {
            requester.teleport(target.location, {
                dimension: target.dimension,
                facingLocation: target.location,
            });
            this.removeRequest(request);
            CTsAPI.msg.sendSuccessMessage(target, `§7Accepted §b${request.requesterName}§7's teleport request.`);
            CTsAPI.msg.sendSuccessMessage(requester, `§b${target.name} §7accepted your teleport request.`);
        } catch (error) {
            console.warn(`[Essential++] Could not teleport ${requester.name} to ${target.name}: ${error}`);
            CTsAPI.msg.sendErrorMessage(target, "§7The teleport failed. The request remains pending until it expires.");
        }
    }

    denyRequest(target) {
        if (!this.isEnabled) {
            CTsAPI.msg.sendErrorMessage(target, "§7Teleport Requests is currently disabled.");
            return;
        }
        const targetOnline = this.getOnlinePlayer(target.id);
        if (!targetOnline) return;
        target = targetOnline;

        const request = this.requestsByTarget.get(target.id);
        if (!request) {
            CTsAPI.msg.sendInfoMessage(target, "§7You do not have a pending teleport request.");
            return;
        }

        this.removeRequest(request);
        CTsAPI.msg.sendInfoMessage(target, `§7Denied §b${request.requesterName}§7's teleport request.`);
        const requester = this.getOnlinePlayer(request.requesterId);
        if (requester) CTsAPI.msg.sendInfoMessage(requester, `§b${target.name} §7denied your teleport request.`);
    }

    cancelRequest(requester) {
        if (!this.isEnabled) {
            CTsAPI.msg.sendErrorMessage(requester, "§7Teleport Requests is currently disabled.");
            return;
        }
        const requesterOnline = this.getOnlinePlayer(requester.id);
        if (!requesterOnline) return;
        requester = requesterOnline;

        const targetId = this.targetByRequester.get(requester.id);
        const request = targetId && this.requestsByTarget.get(targetId);
        if (!request || request.requesterId !== requester.id) {
            if (targetId) this.targetByRequester.delete(requester.id);
            CTsAPI.msg.sendInfoMessage(requester, "§7You do not have an outgoing teleport request.");
            return;
        }

        this.removeRequest(request);
        CTsAPI.msg.sendInfoMessage(requester, "§7Your teleport request was cancelled.");
        const target = this.getOnlinePlayer(request.targetId);
        if (target) CTsAPI.msg.sendInfoMessage(target, `§b${requester.name} §7cancelled their teleport request.`);
    }

    expireRequest(request) {
        const current = this.requestsByTarget.get(request.targetId);
        if (current !== request || request.expiresAt > Date.now()) return;
        this.removeRequest(request);
        const requester = this.getOnlinePlayer(request.requesterId);
        const target = this.getOnlinePlayer(request.targetId);
        if (requester) CTsAPI.msg.sendInfoMessage(requester, `§7Your teleport request to §b${request.targetName} §7expired.`);
        if (target) CTsAPI.msg.sendInfoMessage(target, `§7The teleport request from §b${request.requesterName} §7expired.`);
    }

    removeRequest(request) {
        if (this.requestsByTarget.get(request.targetId) === request) {
            this.requestsByTarget.delete(request.targetId);
        }
        if (this.targetByRequester.get(request.requesterId) === request.targetId) {
            this.targetByRequester.delete(request.requesterId);
        }
    }

    onPlayerLeave(playerId) {
        const targetId = this.targetByRequester.get(playerId);
        const outgoing = targetId && this.requestsByTarget.get(targetId);
        if (outgoing?.requesterId === playerId) {
            this.removeRequest(outgoing);
            const target = this.getOnlinePlayer(outgoing.targetId);
            if (target) CTsAPI.msg.sendInfoMessage(target, `§b${outgoing.requesterName} §7left the world; their teleport request was cleared.`);
        }

        const incoming = this.requestsByTarget.get(playerId);
        if (incoming) {
            this.removeRequest(incoming);
            const requester = this.getOnlinePlayer(incoming.requesterId);
            if (requester) CTsAPI.msg.sendInfoMessage(requester, `§b${incoming.targetName} §7left the world; your teleport request was cleared.`);
        }
        this.cooldownUntil.delete(playerId);
    }

    getOnlinePlayer(playerId) {
        return world.getAllPlayers().find((player) => player.id === playerId);
    }
}

const teleportRequestModule = new TeleportRequestModule();
moduleManager.registerModule(teleportRequestModule);
