import { system, world, ItemStack, Player, Block, Entity, BlockPermutation, EquipmentSlot, ItemLockMode } from "@minecraft/server";

globalThis.CTsAPI = {
    /**
     * Utility functions
     * to simplify common development tasks within Minecraft addons.
     *
     * @namespace CTsAPI.utils
     */
    utils: {
        /**
         * @param {string} typeId
         * @returns {string}
         */
        getSourceFromId(typeId) {
            if (!typeId.includes(":")) return "Minecraft";
            const namespace = typeId.split(":")[0];
            if (namespace === "es" || namespace === "essentialpp") return "Essential++";
            return this.formatIdToText(namespace);
        },
        /**
         *
         * @param {ItemStack} item
         * @returns {boolean}
         */
        shouldTakeDurabilityDamage(item) {
            const ench = item.getComponent("enchantable");
            if (!ench) return true;

            const unbreaking = ench.getEnchantment("unbreaking");
            if (!unbreaking) return true;

            const level = unbreaking.level;
            const chanceNoDamage = level / (level + 1);

            return Math.random() >= chanceNoDamage;
        },

        /**
         *
         * @param {Player} player
         * @param {ItemStack} itemStack
         * @param {number} amount
         * @returns {void}
         */
        increaseDurability(player, itemStack, amount = 1) {
            const container = player.getComponent("inventory").container;
            const slotIndex = player.selectedSlotIndex;
            if (player.getGameMode().toLowerCase() === "creative") {
                return;
            }
            if (!itemStack) {
                return;
            }

            const damageComp = itemStack.getComponent("minecraft:durability");
            if (!damageComp) {
                return;
            }

            const applyAmount = Math.max(0, Math.floor(Number(amount) || 0));
            if (applyAmount === 0) {
                container.setItem(slotIndex, itemStack);
                return;
            }

            if (this.shouldTakeDurabilityDamage(itemStack)) {
                const currentDamage = Number(damageComp.damage) || 0;
                const remaining = Math.max(0, (Number(damageComp.maxDurability) || 0) - currentDamage);
                const damageToApply = Math.min(applyAmount, remaining);
                damageComp.damage = currentDamage + damageToApply;
            }
            if (damageComp.damage >= damageComp.maxDurability) {
                container.setItem(slotIndex, undefined);
                player.playSound("random.break", { volume: 10 });
                return;
            }
            // console.warn(`Setting durability of ${itemStack.typeId} to ${damageComp.damage}/${damageComp.maxDurability}`);
            container.setItem(slotIndex, itemStack);
        },

        /**
         *
         * @param {Player} player
         * @param {ItemStack} itemStack
         * @param {number} amount
         * @returns {void}
         */
        increaseDurabilityArmor(player, itemStack, amount = 1) {
            if (player.getGameMode().toLowerCase() === "creative") return;
            if (!itemStack) return;

            const equippable = player.getComponent("equippable");
            if (!equippable) return;

            // Identify which armor slot holds this item
            const slots = [EquipmentSlot.Head, EquipmentSlot.Chest, EquipmentSlot.Legs, EquipmentSlot.Feet];
            let targetSlot = undefined;
            for (const slot of slots) {
                const equipped = equippable.getEquipment(slot);
                if (equipped && equipped.typeId === itemStack.typeId) {
                    targetSlot = slot;
                    break;
                }
            }
            if (targetSlot === undefined) return;

            const damageComp = itemStack.getComponent("minecraft:durability");
            if (!damageComp) {
                // Re-set to ensure any changes persist
                equippable.setEquipment(targetSlot, itemStack);
                return;
            }

            const applyAmount = Math.max(0, Math.floor(Number(amount) || 0));
            if (applyAmount === 0) {
                equippable.setEquipment(targetSlot, itemStack);
                return;
            }

            if (this.shouldTakeDurabilityDamage(itemStack)) {
                const currentDamage = Number(damageComp.damage) || 0;
                const remaining = Math.max(0, (Number(damageComp.maxDurability) || 0) - currentDamage);
                const damageToApply = Math.min(applyAmount, remaining);
                damageComp.damage = currentDamage + damageToApply;
            }

            if (damageComp.damage >= damageComp.maxDurability) {
                equippable.setEquipment(targetSlot, undefined);
                player.playSound("random.break", { volume: 10 });
                return;
            }
            // console.warn(`Setting durability of ${itemStack.typeId} to ${damageComp.damage}/${damageComp.maxDurability}`);
            equippable.setEquipment(targetSlot, itemStack);
        },

        toSlotArray(v) {
            return Array.isArray(v) ? v : [v];
        },

        /**
         * Offsets a position by a vector * amount.
         *
         * @param {{x:number,y:number,z:number}} pos
         * @param {{x:number,y:number,z:number}} vec
         * @param {number} amount
         */
        offsetPos(pos, vec, amount = 1) {
            return {
                x: pos.x + vec.x * amount,
                y: pos.y + vec.y * amount,
                z: pos.z + vec.z * amount,
            };
        },
        /**
         * Converts a number of seconds into a formatted time string (mm:ss or hh:mm:ss).
         *
         * - Displays hours only when greater than zero.
         * - Pads minutes and seconds with leading zeros when needed.
         *
         * Example outputs:
         *   formatTimeFull(2083) → "34:43"
         *   formatTimeFull(7265) → "2:01:05"
         *
         * @param {number} seconds Total seconds to convert.
         * @returns {string} Time string formatted as "mm:ss" or "hh:mm:ss".
         */
        formatTimeFull(seconds) {
            const hours = Math.floor(seconds / 3600);
            const minutes = Math.floor((seconds % 3600) / 60);
            const secs = Math.floor(seconds % 60);

            if (hours > 0) {
                return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
            }
            return `${minutes}:${secs.toString().padStart(2, "0")}`;
        },

        /**
         * Converts seconds into a compact, human-readable duration string.
         *
         * Rules:
         * - Shows at most 2 time units.
         * - Example outputs:
         *   45s → "45s"
         *   323s → "5m 23s"
         *   8108s → "2h 15m"
         *   98640s → "1d 3h"
         *
         * @param {number} seconds Total seconds to convert.
         * @returns {string} Compact time string.
         */
        formatTime(seconds) {
            const d = Math.floor(seconds / 86400);
            const h = Math.floor((seconds % 86400) / 3600);
            const m = Math.floor((seconds % 3600) / 60);
            const s = Math.floor(seconds % 60);

            if (d > 0) {
                return `${d}d${h > 0 ? ` ${h}h` : ""}`; // only days + hours
            }
            if (h > 0) {
                return `${h}h${m > 0 ? ` ${m}m` : ""}`; // only hours + minutes
            }
            if (m > 0) {
                return `${m}m${s > 0 ? ` ${s}s` : ""}`; // only minutes + seconds
            }
            return `${s}s`; // only seconds
        },

        /**
         * Capitalizes the first letter of a string and lowers the rest.
         *
         * Example:
         *   capitalizeFirst("lava") → "Lava"
         *   capitalizeFirst("LIQUID") → "Liquid"
         *
         * @param {string} text The text to format.
         * @returns {string} The formatted string with only the first letter capitalized.
         */
        capitalizeFirst(text) {
            return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
        },
        /**
         * Wait for a specified number of ticks before executing a callback.
         *
         * @param {number} ticks The number of ticks to wait (20 ticks = 1 second).
         * @param {() => void} callback The function to execute after the delay.
         */
        waitTicks(ticks, callback) {
            system.runTimeout(callback, ticks);
        },
        /**
         * Creates a promise that resolves after a specified number of ticks.
         * @param {number} ticks
         * @returns {Promise<void>}
         */
        delay(ticks) {
            return new Promise((resolve) => system.runTimeout(resolve, ticks));
        },

        /**
         * Wait for a specified number of seconds before executing a callback.
         *
         * @param {number} seconds The number of seconds to wait.
         * @param {() => void} callback The function to execute after the delay.
         */
        waitSeconds(seconds, callback) {
            const ticks = Math.floor(seconds * 20);
            system.runTimeout(callback, ticks);
        },

        /**
         * Sends an action bar message to a player.
         *
         * @param {Player} player The player to show the message to.
         * @param {string} msg The message to display.
         * @param {boolean} [condition=false] If provided, the message will only be sent if this condition is true.
         */
        actionBar(player, msg, condition = false) {
            if (condition) return;
            if (!player?.onScreenDisplay || typeof msg !== "string") return;
            try {
                player.onScreenDisplay.setActionBar(msg);
            } catch {
                system.runTimeout(() => {
                    player.onScreenDisplay.setActionBar(msg);
                });
            }
        },

        /**
         * Returns a random integer between min and max, inclusive.
         *
         * @param {number} min The minimum value (inclusive).
         * @param {number} max The maximum value (inclusive).
         * @returns {number} A random integer between min and max.
         */
        randomInterval(min, max) {
            const minCeiled = Math.ceil(min);
            const maxFloored = Math.floor(max);
            return Math.floor(Math.random() * (maxFloored - minCeiled + 1)) + minCeiled;
        },
        /**
         * Checks if an itemStack is a placeable block by attempting to set it at a dummy location.
         * It uses y = -64 to avoid affecting real structures.
         *
         * @param {ItemStack} itemStack The item to test.
         * @returns {boolean} True if the itemStack can be placed as a block, false otherwise.
         */
        isBlock(itemStack) {
            try {
                if (!itemStack?.typeId) return false;
                BlockPermutation.resolve(itemStack.typeId);
                return true;
            } catch {
                return false;
            }
        },

        /**
         * Checks if an itemStack is *not* a block (i.e., is a regular item).
         * It does this by trying to place the item at a dummy location (y = -64).
         *
         * @param {ItemStack} itemStack The item to test.
         * @returns {boolean} True if the item is not a block, false if it's placeable.
         */
        isItem(itemStack) {
            try {
                if (!itemStack?.typeId) return true;
                BlockPermutation.resolve(itemStack.typeId);
                return false;
            } catch {
                return true;
            }
        },
        /**
         * Transforms a namespaced or snake_case identifier into a human-readable title.
         *
         * Examples:
         *   "minecraft:iron_sword" → "Iron Sword"
         *   "custom_item_name"     → "Custom Item Name"
         *
         * @param {string} text The identifier to format.
         * @returns {string} The formatted title string.
         */
        formatIdToText(text) {
            const rawName = text.includes(":") ? text.split(":")[1] : text;
            return rawName
                .split("_")
                .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
                .join(" ");
        },
        /**
         * Prints a formatted JSON object to the player's chat.
         *
         * @param {Entity} player The player to send the message to.
         * @param {string} title A title to show before the JSON.
         * @param {Object} obj The object to stringify and print.
         */
        printJSON(player, title, obj) {
            const formatted = JSON.stringify(obj, null, 2).split("\n");
            player.sendMessage(`§6${title}:`);
            for (const line of formatted) {
                player.sendMessage(`§7${line}`);
            }
        },
        /**
         * Adds an item to the player's inventory. When the inventory is full, the item will be dropped on the ground.
         * @param {Player} player
         * @param {ItemStack} item
         */
        addItem(player, item) {
            if (!item) return;
            const inv = player.getComponent("minecraft:inventory").container;
            const leftover = inv.addItem(item);
            if (leftover) {
                player.dimension.spawnItem(leftover, player.location);
            }
        },
        /**
         * Gives an item to the player that will be kept on death. If the player already has the item, it won't be added again.
         * @param {Player} player
         * @param {string} itemId
         * @param {'keepOnDeath' | 'inventory' | 'slot' | 'none'} mode Determines how to handle duplicates:
         * - 'keepOnDeath' (default): If the player already has the item, do nothing. Otherwise, add it with keepOnDeath = true.
         * - 'inventory': Always add the item to the inventory, even if it creates duplicates. The new item will have keepOnDeath = true.
         * - 'slot': If the player already has the item, set keepOnDeath = true on the existing item. If not, add it to the inventory with keepOnDeath = true.
         * - 'none': Always add the item without keepOnDeath, allowing duplicates and no special death behavior.
         * @returns {boolean} True if the item was added or updated, false if no changes were made (e.g. item already exists and mode is 'keepOnDeath').
         */
        giveItem(player, itemId, mode = "keepOnDeath") {
            system.run(() => {
                let inv = player.getComponent("minecraft:inventory").container;
                let menu = new ItemStack(itemId, 1);
                if (mode === "keepOnDeath") {
                    menu.keepOnDeath = true;
                } else if (mode === "inventory" || mode === "slot" || mode === "none") {
                    let lockMode = ItemLockMode[mode];
                    console.warn(lockMode);
                    menu.lockMode = lockMode;
                }
                if (!inv.contains(menu)) {
                    inv.addItem(menu);
                    return true;
                } else {
                    return false;
                }
            });
        },
        /**
         * Converts a location object to a string for use in Sets or Maps.
         * @param {{x: number, y: number, z: number}} loc The location object.
         * @returns {string} A string representation like "x,y,z".
         */
        locationToString(loc) {
            return `${loc.x},${loc.y},${loc.z}`;
        },
        /**
         * Decreases the amount of items in an ItemStack by a specified amount. If the resulting amount is 0 or less, the item is removed from the player's inventory.
         * @param {Player} player The player whose inventory to modify.
         * @param {ItemStack} itemStack The ItemStack to decrease.
         * @param {number} amount The amount to decrease by (default is 1).
         */
        decreaseItemAmount(player, itemStack, amount = 1) {
            if (player.getGameMode().toLowerCase() === "creative") return;
            if (!itemStack) return;
            const inv = player.getComponent("minecraft:inventory").container;
            if (itemStack.amount <= 1) {
                inv.setItem(player.selectedSlotIndex, undefined);
            } else {
                itemStack.amount -= amount;
                inv.setItem(player.selectedSlotIndex, itemStack);
            }
        },
    },
    /**
     * Mathematical helper functions
     *
     * Includes common math utilities, number formatting,
     * vector calculations, proportional scaling, and
     * Roman numeral conversions.
     *
     * @namespace CTsAPI.math
     */
    math: {
        /**
         * Clamps a value within a given range.
         *
         * @param {number} val The value to clamp.
         * @param {number} min The minimum allowed value.
         * @param {number} max The maximum allowed value.
         * @returns {number} Clamped value.
         */
        clamp(val, min, max) {
            return Math.max(min, Math.min(max, val));
        },

        /**
         * Rounds a number to a specified number of decimal places.
         *
         * @param {number} val The value to round.
         * @param {number} decimals Number of decimal places.
         * @returns {number} Rounded number.
         */
        roundTo(val, decimals) {
            const factor = Math.pow(10, decimals);
            return Math.round(val * factor) / factor;
        },

        /**
         * Calculates a clamped proportional value from 0 to the given scale.
         *
         * Useful for visual indicators like progress bars, energy levels, or tiered icons.
         * Converts a current value within a maximum range to a fixed-scale number.
         *
         * Example:
         *   scaleToSetNumber(45, 100, 5, 'floor') → 2
         *   scaleToSetNumber(45, 100, 5, 'normal') → 2.25
         *   scaleToSetNumber(45, 100, 5, 'ceil') → 3
         *
         * @param {number} current The current value (e.g. progress, energy).
         * @param {number} max The maximum possible value (e.g. capacity).
         * @param {number} scale The scale to map to (e.g. 6 for 0–6 icons).
         * @param {'floor' | 'ceil' | 'normal'} [mode='floor'] Rounding mode to apply to the result.
         * @returns {number} A clamped number from 0 to `scale`, rounded according to mode.
         */
        scaleToSetNumber(current, max, scale, mode = "floor") {
            if (max <= 0) return 0;

            let value = (scale * current) / max;
            if (mode === "floor") value = Math.floor(value);
            else if (mode === "ceil") value = Math.ceil(value);

            return Math.max(0, Math.min(scale, value));
        },

        /**
         * Returns a directional vector [x, y, z] based on the block's facing direction.
         * @param {Block} block
         * @returns {[number, number, number] | null}
         */
        getFacingVector(block) {
            const facing = block.permutation.getState("minecraft:facing_direction");
            switch (facing) {
                case "up":
                    return [0, 1, 0];
                case "down":
                    return [0, -1, 0];
                case "north":
                    return [0, 0, -1];
                case "south":
                    return [0, 0, 1];
                case "west":
                    return [-1, 0, 0];
                case "east":
                    return [1, 0, 0];
                default:
                    return null;
            }
        },
        /**
         * Converts a Roman numeral string to its integer equivalent.
         *
         * @param {string} str The Roman numeral to convert (e.g., "XIV").
         * @returns {number} The integer representation of the Roman numeral.
         */
        romanToInteger(str) {
            const map = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
            let total = 0,
                prev = 0;
            for (let i = str.length - 1; i >= 0; i--) {
                const val = map[str[i]];
                if (val < prev) total -= val;
                else total += val;
                prev = val;
            }
            return total;
        },

        /**
         * Converts an integer to its Roman numeral representation.
         *
         * @param {number} num The number to convert (must be between 1 and 3999).
         * @returns {string} The Roman numeral string, or an empty string if invalid input.
         */
        integerToRoman(num) {
            if (typeof num !== "number" || num <= 0 || num >= 4000) return "";
            const map = [
                { value: 1000, numeral: "M" },
                { value: 900, numeral: "CM" },
                { value: 500, numeral: "D" },
                { value: 400, numeral: "CD" },
                { value: 100, numeral: "C" },
                { value: 90, numeral: "XC" },
                { value: 50, numeral: "L" },
                { value: 40, numeral: "XL" },
                { value: 10, numeral: "X" },
                { value: 9, numeral: "IX" },
                { value: 5, numeral: "V" },
                { value: 4, numeral: "IV" },
                { value: 1, numeral: "I" },
            ];
            let result = "";
            for (const { value, numeral } of map) {
                while (num >= value) {
                    result += numeral;
                    num -= value;
                }
            }
            return result;
        },

        /**
         * Calculates the distance between two vectors using the Pythagorean theorem.
         *
         * @param {{ x: number, y: number, z: number }} a First vector.
         * @param {{ x: number, y: number, z: number }} b Second vector.
         * @returns {number} The distance between the two vectors.
         */
        distanceBetween(a, b) {
            const dx = a.x - b.x;
            const dy = a.y - b.y;
            const dz = a.z - b.z;
            return Math.sqrt(dx * dx + dy * dy + dz * dz);
        },

        /**
         * Returns a random number between [min, max], inclusive if mode = "floor".
         *
         * @param {number|null} min Minimum value or null
         * @param {number} max Maximum value.
         * @param {string} [mode="floor"] How to handle decimals:
         *   - "floor": round down (inclusive of max)
         *   - "round": round to nearest
         *   - "float": return raw decimal
         * @returns {number} Random value
         */
        randomInterval(min, max, mode = "floor") {
            const nullAsZero = min === null;
            const effectiveMin = nullAsZero ? 0 : min;

            let value;

            if (mode === "floor") {
                value = Math.random() * (max - effectiveMin + 1) + effectiveMin;
                value = Math.floor(value);
            } else {
                value = Math.random() * (max - effectiveMin) + effectiveMin;
                switch (mode) {
                    case "round":
                        value = Math.round(value);
                        break;
                    case "float":
                        break;
                    default:
                        value = Math.floor(value);
                }
            }
            if (nullAsZero && value === 0) {
                return null;
            }

            return value;
        },
    },
    /**
     * @typedef Vector3
     * @property {number} x
     * @property {number} y
     * @property {number} z
     */
    /**
     * @typedef {[number, number, number]} Vector3Array
     */
    /**
     * Contains a description of a vector.
     * @implements {Vector3}
     */
    vector: class Vector {
        /**
         * X component of this vector.
         * @type {number}
         */
        x;
        /**
         * Y component of this vector.
         * @type {number}
         */
        y;
        /**
         * Z component of this vector.
         * @type {number}
         */
        z;
        /**
         * A constant vector that represents (0, 0, -1).
         * @readonly
         */
        static back = new this(0, 0, -1);
        /**
         * A constant vector that represents (0, -1, 0).
         * @readonly
         */
        static down = new this(0, -1, 0);
        /**
         * A constant vector that represents (0, 0, 1).
         * @readonly
         */
        static forward = new this(0, 0, 1);
        /**
         * A constant vector that represents (-1, 0, 0).
         * @readonly
         */
        static left = new this(-1, 0, 0);
        /**
         * A constant vector that represents (1, 1, 1).
         * @readonly
         */
        static one = new this(1, 1, 1);
        /**
         * A constant vector that represents (1, 0, 0).
         * @readonly
         */
        static right = new this(1, 0, 0);
        /**
         * A constant vector that represents (0, 1, 0).
         * @readonly
         */
        static up = new this(0, 1, 0);
        /**
         * A constant vector that represents (0, 0, 0).
         * @readonly
         */
        static zero = new this(0, 0, 0);
        /**
         * @remarks
         * Creates a new instance of an abstract vector.
         * @param {number} x
         * X component of the vector.
         * @param {number} y
         * Y component of the vector.
         * @param {number} z
         * Z component of the vector.
         */
        constructor(x, y, z) {
            this.x = x;
            this.y = y;
            this.z = z;
        }
        /**
         * @remarks
         * Compares this vector and another vector to one another.
         * @param {Vector} other
         * Other vector to compare this vector to.
         * @returns {boolean}
         * True if the two vectors are equal.
         */
        equals(other) {
            if (this.x === other.x && this.y === other.y && this.z === other.z) return true;
            else return false;
        }
        /**
         * @remarks
         * Retur
         * @returns {number}ns the length of this vector.
         */
        length() {
            return Math.hypot(this.x, this.y, this.z);
        }
        /**
         * @remarks
         * Returns the
         * @returns {number}squared length of this vector.
         */
        lengthSquared() {
            return this.x ** 2 + this.y ** 2 + this.z ** 2;
        }
        /**
         * @remarks
         * Returns this vector as a normalized vector.
         * @returns {Vector}
         */
        normalized() {
            const magnitude = this.length();
            const DirectionX = this.x / magnitude;
            const DirectionY = this.y / magnitude;
            const DirectionZ = this.z / magnitude;
            return new Vector(DirectionX, DirectionY, DirectionZ);
        }
        /**
         * @remarks
         * Returns the addition of these vectors.
         * @param {Vector3} a
         * @param {Vector3} b
         * @returns {Vector}
         */
        static add(a, b) {
            const vector = new Vector(a.x, a.y, a.z);
            vector.x += b.x;
            vector.y += b.y;
            vector.z += b.z;
            return vector;
        }
        /**
         * @remarks
         * Returns the cross product of these two vectors.
         * @param {Vector3} a
         * @param {Vector3} b
         * @returns {Vector}
         */
        static cross(a, b) {
            return new Vector(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
        }
        /**
         * @remarks
         * Returns the distance between two vectors.
         * @param {Vector3} a
         * @param {Vector3} b
         * @returns {number}
         */
        static distance(a, b) {
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const dz = b.z - a.z;
            const distance = Math.hypot(dx, dy, dz);

            return distance;
        }
        /**
         * @remarks
         * Returns the component-wise division of these vectors.
         * @param {Vector3} a
         * @param {Vector3 | number} b
         * @returns {Vector}
         */
        static divide(a, b) {
            const vector = new Vector(a.x, a.y, a.z);

            if (typeof b === "number") {
                vector.x /= b;
                vector.y /= b;
                vector.z /= b;
            } else {
                vector.x /= b.x;
                vector.y /= b.y;
                vector.z /= b.z;
            }

            return vector;
        }
        /**
         * @remarks
         * Returns the linear interpolation between a and b using t as
         * the control.
         * @param {Vector3} a
         * @param {Vector3} b
         * @param {number} t
         * @returns {Vector}
         */
        static lerp(a, b, t) {
            const dest = new Vector(a.x, a.y, a.z);
            dest.x += (b.x - a.x) * t;
            dest.y += (b.y - a.y) * t;
            dest.z += (b.z - a.z) * t;
            return dest;
        }
        /**
         * @remarks
         * Returns a vector that is made from the largest components of
         * two vectors.
         * @param {Vector3} a
         * @param {Vector3} b
         * @returns {Vector}
         */
        static max(a, b) {
            const vectors = [a, b];
            const arr = vectors.map(({ x, y, z }) => new Vector(x, y, z).length());
            const max = Math.max(...arr);
            const index = arr.indexOf(max);
            const vector3 = vectors[index];

            return new Vector(vector3.x, vector3.y, vector3.z);
        }
        /**
         * @remarks
         * Returns a vector that is made from the smallest components
         * of two vectors.
         * @param {Vector3} a
         * @param {Vector3} b
         * @returns {Vector}
         */
        static min(a, b) {
            const vectors = [a, b];
            const arr = vectors.map(({ x, y, z }) => new Vector(x, y, z).length());
            const min = Math.min(...arr);
            const index = arr.indexOf(min);
            const vector3 = vectors[index];

            return new Vector(vector3.x, vector3.y, vector3.z);
        }
        /**
         * @remarks
         * Returns the component-wise product of these vectors.
         * @param {Vector3} a
         * @param {Vector3 | number} b
         * @returns {Vector}
         */
        static multiply(a, b) {
            const vector = new Vector(a.x, a.y, a.z);

            if (typeof b === "number") {
                vector.x *= b;
                vector.y *= b;
                vector.z *= b;
            } else {
                vector.x *= b.x;
                vector.y *= b.y;
                vector.z *= b.z;
            }

            return vector;
        }
        /**
         * @remarks
         * Returns the spherical linear interpolation between a and b
         * using s as the control.
         * @param {Vector3} a
         * @param {Vector3} b
         * @param {number} s
         * @returns {Vector}
         */
        static slerp(a, b, s) {
            /**
             * @param {Vector3Array} a
             * @param {Vector3Array} b
             * @returns {number}
             */
            function MathDot(a, b) {
                return a.map((x, i) => a[i] * b[i]).reduce((m, n) => m + n);
            }

            const θ = Math.acos(MathDot([a.x, a.y, a.z], [b.x, b.y, b.z]));
            const factor1 = Math.sin(θ * (1 - s)) / Math.sin(θ);
            const factor2 = Math.sin(θ * s) / Math.sin(θ);

            return new Vector(a.x * factor1 + b.x * factor2, a.y * factor1 + b.y * factor2, a.z * factor1 + b.z * factor2);
        }
        /**
         * @remarks
         * Returns the subtraction of these vectors.
         * @param {Vector3} a
         * @param {Vector3} b
         * @returns {Vector}
         */
        static subtract(a, b) {
            const vector = new Vector(a.x, a.y, a.z);
            vector.x -= b.x;
            vector.y -= b.y;
            vector.z -= b.z;
            return vector;
        }
    },
    /**
     * Message helper functions for sending formatted messages to players or broadcasting to all players.
     */
    msg: {
        /**
         * Sends a standard, formatted informational message to a player.
         * @param {import("@minecraft/server").Player} player The player to send the message to.
         * @param {string} message The message content (including any color codes).
         */
        sendInfoMessage(player, message) {
            player.sendMessage(`§8[§eEssential++§8] ${message}`);
        },

        /**
         * Sends a success message to a player with a positive sound effect.
         * @param {import("@minecraft/server").Player} player The player to send the message to.
         * @param {string} message The message content (including any color codes).
         * @param {boolean} [sound=true]
         */
        sendSuccessMessage(player, message, sound = true) {
            // Using a green prefix for success
            player.sendMessage(`§8[§aEssential++§8] ${message}`);
            if (sound) {
                player.playSound("random.orb", { volume: 0.5, pitch: 1.2 });
            }
        },

        /**
         * Sends an error or denial message to a player with a negative sound effect.
         * @param {import("@minecraft/server").Player} player The player to send the message to.
         * @param {string} message The message content (including any color codes).
         */
        sendErrorMessage(player, message) {
            // Using a red prefix for errors
            player.sendMessage(`§8[§cEssential++§8] ${message}`);
            player.playSound("note.bass", { volume: 1.0, pitch: 0.8 });
        },

        /**
         * Sends a message indicating a generic action or toggle, with a click sound.
         * @param {import("@minecraft/server").Player} player The player to send the message to.
         * @param {string} message The message content (including any color codes).
         * @param {boolean} [condition=false] If provided, the pitch of the click sound will be higher for true and lower for false, indicating on/off states.
         */
        sendActionMessage(player, message, condition = false) {
            // Using the default yellow prefix for actions
            player.sendMessage(`§8[§eEssential++§8] ${message}`);
            let soundOptions = { volume: 0.8, pitch: 1.0 };
            if (condition !== undefined && typeof condition === "boolean") {
                soundOptions = { volume: 0.8, pitch: condition ? 1.0 : 0.6 };
            }
            player.playSound("random.click", soundOptions);
        },

        /**
         * Broadcasts a formatted message to all players with a corresponding sound effect.
         * @param {string} message The message content.
         * @param {'info' | 'success' | 'error'} [type='info'] The type of message for prefix coloring and sound.
         * @param {boolean} [sound={}] If true, plays a sound effect corresponding to the message type. Can also be an object to specify custom sound options (volume and pitch).
         */
        broadcastMessage(message, type = "info", sound = {}) {
            let prefix;
            let soundID;
            let soundOptions = { volume: 1.0, pitch: 1.0 };

            if (typeof sound === "object" && sound !== null) {
                soundOptions = { ...soundOptions, ...sound };
            }

            switch (type) {
                case "success":
                    prefix = "§8[§aEssential++§8]";
                    soundID = "random.levelup";
                    soundOptions = { volume: 0.5, pitch: 1.5 };
                    break;
                case "error":
                    prefix = "§8[§cEssential++§8]";
                    soundID = "note.bass";
                    soundOptions = { volume: 1.0, pitch: 0.5 };
                    break;
                default: // info
                    prefix = "§8[§eEssential++§8]";
                    soundID = null;
            }
            world.sendMessage(`${prefix} ${message}`);
            if (sound && soundID) {
                for (const player of world.getAllPlayers()) {
                    player.playSound(soundID, soundOptions);
                }
            }
        },
    },
};
