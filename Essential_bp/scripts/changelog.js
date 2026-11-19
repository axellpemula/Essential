// Supported item formats:
// - string (treated as an 'add')
// - { title, sub?: string[] } (treated as an 'add')
// - { type: 'add'|'remove'|'fix'|'change', title: string, sub?: string[] }
export const changelog = [
    {
        version: "v2.1.0",
        items: [
            {
                type: "add",
                title: "Navigation Waypoints",
                sub: ["Track homes, accessible warps, public/owned waystones, and your active gravestones on the native locator bar using /es:waypoint or the Essential++ menu."],
            },
            {
                type: "change",
                title: "Configuration UI",
                sub: ["Configuration and navigation forms now use Essential++ Resource Pack layouts and artwork; requires Minecraft 1.26.60 or newer."],
            },
            {
                type: "change",
                title: "Script API",
                sub: ["Updated @minecraft/server to 2.11.0 and @minecraft/server-ui to 2.3.0."],
            },
        ],
    },
    {
        version: "v2.0.1",
        items: [
            {
                type: "add",
                title: "Auto Pickup",
                sub: ["Added support for more stacked blocks: pointed dripstone, sulfur spike, kelp, big dripleaf, twisting vines, weeping vines, and bamboo."],
            },
            {
                type: "add",
                title: "Excavation",
                sub: ["Added a toggle to allow excavation to work with any block type, not just the one that was mined."],
            },
            {
                type: "add",
                title: "Gravestone",
                sub: ["Gravestone can be mined now it takes 4s to mine it and it will give the items back to the player."],
            },
            {
                type: "fix",
                title: "Ore Highlight",
                sub: ["Fixed a bug where the module would still show highlights even when disabled."],
            },
        ],
    },
    {
        version: "v2.0.0",
        items: [
            {
                type: "add",
                title: "moved to version 2.0.0",
                sub: ["The saved module settings would reset due to the new way of saving settings, so you need to reconfigure your settings after updating."],
            },
            {
                type: "add",
                title: "Settings",
                sub: ["Added a way to disable giving the menu item on join for new players"],
            },
            {
                type: "change",
                title: "Fake Blocks",
                sub: ["When the Module is disabled the fake blocks behave like a regular blocks"],
            },
            {
                type: "change",
                title: "Gravestone Module Overhaul",
                sub: [
                    "Completely redone the Gravestone module to improve reliability and performance.",
                    "Items are now snapshotted and safely stored into structure files exactly when you die, preventing despawning or data loss from unloaded chunks.",
                    "Added the new `/es:graves` command, allowing players to view their active gravestones and remotely recover their items in emergencies.",
                    "Fixed 'LocationInUnloadedChunkError' bugs that would cause the gravestone creation to fail.",
                    "Added a 'Place on Highest Block' setting to allow players to choose whether gravestones spawn at the surface or at their exact death elevation.",
                ],
            },
            {
                type: "fix",
                title: "Bug Fixes",
                sub: [
                    "Fixed a bug where breaking a waystone without Silk Touch while AutoPickup is enabled would yield no item.",
                    "Fixed a bug where waystones could be lost if mined while the player's inventory is full.",
                    "Fixed a bug where you could dupe waystones with the Silk Touch enchantment",
                    "Fixed a module conflict where AIOTs would overwrite Area Hoe functionality globally.",
                    "AIOTs now correctly create grass paths in a radius only when sneaking, and normal right-clicks correctly trigger Area Hoe to till farmland.",
                ],
            },
        ],
    },
    {
        version: "v1.4.12",
        items: [
            {
                type: "fix",
                title: "Bug Fixes and Performance Improvements",
                sub: [
                    "Fixed a bug where quartz and redstone ores would not drop XP when mined with VeinMiner enabled.",
                    "Fixed a bug where items would not be restored to their original inventory and armor slots when recovering a gravestone.",
                ],
            },
        ],
    },
    {
        version: "v1.4.11",
        items: [
            {
                type: "fix",
                title: "Gravestone",
                sub: [
                    "Fixed a bug where gravestones spawn underground if there is water",
                    "Fixed a bug where gravestones would not spawn if the player died in the nether below y=0",
                ],
            },
            {
                type: "fix",
                title: "Vein Builder",
                sub: ["Vein Builder will works properly now"],
            },
            {
                type: "change",
                title: "Gravestone",
                sub: [
                    "Improved the error handling and fallback mechanism when gravestone creation fails. If the gravestone entity cannot be spawned, the system will now attempt to drop the player's items at a safe nearby location instead of just sending an error message. This ensures that players can still retrieve their items even if there are issues with gravestone creation.",
                ],
            },
            {
                type: "change",
                title: "AIOTs",
                sub: ["Removed the functionality that doesnt allow breaking with the tools in creative mode"],
            },
        ],
    },
    {
        version: "v1.4.10",
        items: [
            {
                type: "add",
                title: "PVP",
                sub: ["Added a new PVP module that allows players to enable/disable pvp for themselves"],
            },
            {
                type: "fix",
                title: "Gravestone",
                sub: ["Fixed a bug where gravestones would not spawn above fluids"],
            },
            {
                type: "add",
                title: "Gravestone",
                sub: ["Added a new gravestone style: No Head option", "added a menu when you break the gravestone in creative mode to destroy the gravestone and his data"],
            },
            {
                type: "fix",
                title: "AIOTs",
                sub: ["Fixed a bug where interacting with Item Frames with AIOTs would cause duping the item"],
            },
            {
                type: "remove",
                title: "Performance Mode",
                sub: ["Removed the performance mode module due to many bugs"],
            },
        ],
    },
    {
        version: "v1.4.9",
        items: [
            {
                type: "change",
                title: "Dynamic Light",
                sub: ["Offhand item switching no longer consumes the entire stack", "Durability loss disabled by default"],
            },
            {
                type: "change",
                title: "Gravestone",
                sub: ["Gravestones can no longer be destroyed", "Gravestone blocks can no longer be obtained"],
            },
            {
                type: "add",
                title: "Gravestone",
                sub: ["Added gravestone styles: Steve, xVoid, and Patrick"],
            },
            {
                type: "fix",
                title: "Bugs",
                sub: ["Fixed XP not being saved in gravestones", "Fixed Keep Inventory remaining active when the module is disabled"],
            },
        ],
    },
    {
        version: "v1.4.8",
        items: [
            {
                type: "add",
                title: "Sorter Modules",
                sub: ["Added a Sorter module that allows players to sort their inventory and chests by material tier, item name, or mod origin using a new Sorter item."],
            },
            {
                type: "add",
                title: "Sorter Item",
                sub: ["Introduced a new Sorter item that players can use to sort their inventory and chests by right-clicking on them while sneaking."],
            },
            {
                type: "add",
                title: "AIOTs",
                sub: ["Introduced AIOTs (copper, diamond, golden, iron, netherite, stone, and wooden)"],
            },
            {
                type: "add",
                title: "AIOTs Modules",
                sub: ["Added an AIOTs module to enable/disable the multi-tool functionality of AIOTs and to allow them to till soil when right-clicking."],
            },
            {
                type: "change",
                title: "Waystone Destructibility",
                sub: ["Updated existing waystone blocks to be destructible by all tool tiers."],
            },
            {
                type: "fix",
                title: "Excavation",
                sub: [
                    "Fixed a bug where silktouch would not applied",
                    "Fixed a bug where blocks with inventory (e.g., chests) would not drop items when excavated with silktouch enabled",
                ],
            },
            {
                type: "fix",
                title: "Player QoL Enhancements",
                sub: ["Enhanced player QoL scripts: auto-pickup and tool swapping functionalities."],
            },
            {
                type: "fix",
                title: "Vein Builder & Area Hoe",
                sub: ["Improved vein builder and area hoe modules to support other addons custom hoes"],
            },
            {
                type: "fix",
                title: "Dynamic Light",
                sub: ["Fixed a bug where the flashlight would not turn on"],
            },
        ],
    },
    {
        version: "v1.4.7:1",
        items: [
            {
                type: "fix",
                title: "Bugs",
                sub: [
                    "Fixed a bug where, when you have AutoPickup module enabled, the ore highlight module would not highlight ores when broken",
                    "Fixed a bug where when AutoPickup module is enabled, ores cant drop xp",
                ],
            },
            {
                type: "add",
                title: "Healthbar",
                sub: [
                    "Added an option to filter mobs by types (e.g., npc,armor_stand) to exclude/include them from showing healthbars",
                    "Added an option which allows the owner disable custom entity healthbar",
                ],
            },
        ],
    },
    {
        version: "v1.4.7",
        items: [
            {
                type: "add",
                title: "Waystones",
                sub: [
                    "Introduced new waystone blocks: waystone_purpur, waystone_red_nether_brick, and waystone_sandstone with customizable rune colors and properties. + Recipes for crafting waystones using various materials.",
                ],
            },
            {
                type: "add",
                title: "New Items",
                sub: ["Add warpstone and unbound scroll items"],
            },
            {
                type: "add",
                title: "Waystone Icons",
                sub: ["Added new icons for waystones based on their location (Overworld, Nether, End, Village, etc.) to enhance visual identification."],
            },
            {
                type: "add",
                title: "Waystone Module",
                sub: ["Implemented a Waystone module to allow players to create and interact with waystones, including teleportation and customization features."],
            },
        ],
    },
    {
        version: "v1.4.6",
        items: [
            { type: "change", title: "Silk Touch Spawner", sub: ["disable silk touch by default"] },
            { type: "fix", title: "Bugs", sub: ["Fixed a bug where the Dynamic Light module would not properly clean up light blocks when disabled"] },
        ],
    },
    {
        version: "v1.4.5",
        items: [
            { type: "add", title: "AnvilRepair", sub: ["Implement AnvilRepair module for repairing anvils with items"] },
            { type: "add", title: "WAILA", sub: ["Show the blocks or entities data on the actionbar when looking at them."] },
            { type: "add", title: "Netherite Helmet with Light", sub: ["Created a new item: Netherite Helmet with Light."] },
            {
                type: "add",
                title: "Helmet Light Recipes",
                sub: ["Added recipes for crafting helmets with light using various materials: Chain, Copper, Diamond, Gold, Iron, Leather, and Netherite."],
            },
            { type: "add", title: "Flashlight", sub: ["Implemented a flashlight item used in the crafting recipes."] },
            { type: "add", title: "Silk Touch Spawner", sub: ["Introduced a Silk Touch Spawner module to allow players to mine spawners with silk touch effect."] },
            { type: "add", title: "Double Door", sub: ["Added a Double Door module to enhance player interaction with double doors, including auto-close functionality."] },
            {
                type: "add",
                title: "Item Hologram",
                sub: ["Implemented an Item Hologram module to display item details above dropped items, with customizable formats and visibility settings."],
            },
        ],
    },
    {
        version: "v1.4.4",
        items: [
            { type: "add", title: "Menu Item", sub: ["Access Essential++ settings from the main menu"] },
            { type: "add", title: "Changelog UI", sub: ["View the changelog in a new in-game interface"] },
            { type: "add", title: "Permission System", sub: ["Manage permissions for Essential++ modules"] },
            { type: "change", title: "Messages", sub: ["Improved formatting and readability"] },
            { type: "change", title: "Textures", sub: ["Improved the model and texture for the Excavation hat"] },
        ],
    },
    {
        version: "v1.4.3",
        items: [
            { type: "add", title: "Excavation module", sub: ["Patterns: 2x2, 3x3, 5x5"] },
            { type: "add", title: "Excavation hat", sub: ["Better cave visibility"] },
            { type: "add", title: "Recipes", sub: ["Excavation hat", "Fake Blocks Goggles"] },
            { type: "add", title: "Tools", sub: ["Per-module 'use durability' option"] },
            { type: "add", title: "Changelog shown in UI" },
            { type: "change", title: "AutoPickup", sub: ["Improved module compatibility"] },
            { type: "change", title: "Dynamic Light", sub: ["Hat durability scales with distance"] },
            { type: "fix", title: "SleepVote", sub: ["Skip day during thunder"] },
            { type: "fix", title: "Ore highlight", sub: ["More reliable despawn"] },
        ],
    },
];
