import { ManagerUtils, MiniMap, QueueSymbol } from "./Utils";

import type { Track, UnresolvedTrack } from "./Types/Track";
import type {
    ManagerQueueOptions, QueueChangesWatcher, QueueStoreManager, StoredQueue
} from "./Types/Queue";
export class QueueSaver {
    /**
     * The queue store manager
     */
    private _: QueueStoreManager;
    /**
     * The options for the queue saver
     */
    public options: {
        maxPreviousTracks: number
    };
    constructor(options: ManagerQueueOptions) {
        this._ = options?.queueStore || new DefaultQueueStore();
        this.options = {
            maxPreviousTracks: options?.maxPreviousTracks || 25,
        };
    }

    /**
     * Get the queue for a guild
     * @param guildId The guild ID
     * @returns The queue for the guild
     */
    async get(guildId: string) {
        return this._.parse(await this._.get(guildId));
    }

    /**
     * Delete the queue for a guild
     * @param guildId The guild ID
     * @returns The queue for the guild
     */
    async delete(guildId: string) {
        return this._.delete(guildId);
    }

    /**
     * Set the queue for a guild
     * @param guildId The guild ID
     * @param valueToStringify The queue to set
     * @returns The queue for the guild
     */
    async set(guildId: string, valueToStringify: StoredQueue) {
        return this._.set(guildId, await this._.stringify(valueToStringify));
    }

    /**
     * Sync the queue for a guild
     * @param guildId The guild ID
     * @returns The queue for the guild
     */
    async sync(guildId: string) {
        return this.get(guildId);
    }
}

export class DefaultQueueStore implements QueueStoreManager {
    private data = new MiniMap<string, StoredQueue>();
    constructor() { }

    /**
     * Get the queue for a guild
     * @param guildId The guild ID
     * @returns The queue for the guild
     */
    get(guildId: string):StoredQueue {
        return this.data.get(guildId);
    }

    /**
     * Set the queue for a guild
     * @param guildId The guild ID
     * @param valueToStringify The queue to set
     * @returns The queue for the guild
     */
    set(guildId: string, valueToStringify):boolean {
        return this.data.set(guildId, valueToStringify) ? true : false;
    }

    /**
     * Delete the queue for a guild
     * @param guildId The guild ID
     * @returns The queue for the guild
     */
    delete(guildId: string) {
        return this.data.delete(guildId);
    }

    /**
     * Stringify the queue for a guild
     * @param value The queue to stringify
     * @returns The stringified queue
     */
    stringify(value: StoredQueue | string): StoredQueue | string {
        return value; // JSON.stringify(value);
    }

    /**
     * Parse the queue for a guild
     * @param value The queue to parse
     * @returns The parsed queue
     */
    parse(value: StoredQueue | string): Partial<StoredQueue> {
        return value as Partial<StoredQueue>; // JSON.parse(value)
    }
/*
    // the base now has an Awaitable util type, so it allows both ASYNC as well as SYNC examples for all functions!
    // here are all functions as async, typed, if you want to copy-paste it
    async get(guildId: string): Promise<StoredQueue> {
        return this.data.get(guildId);
    }
    async set(guildId: string, valueToStringify): Promise<boolean> {
        return this.data.set(guildId, valueToStringify) ? true : false;
    }
    async delete(guildId: string) {
        return this.data.delete(guildId);
    }
    async stringify(value: StoredQueue | string): Promise<StoredQueue | string> {
        return value; // JSON.stringify(value);
    }
    async parse(value: StoredQueue | string): Promise<Partial<StoredQueue>> {
        return value as Partial<StoredQueue>; // JSON.parse(value)
    }
*/
}

export class Queue {
    // tracks and previous live exclusively in Redis - no in-memory arrays
    public current: Track | null = null;
    public options = { maxPreviousTracks: 25 };
    private readonly guildId: string = "";
    private readonly QueueSaver: QueueSaver | null = null;
    private managerUtils = new ManagerUtils();
    private queueChanges: QueueChangesWatcher | null;

    /**
     * Check if a track is valid (has proper duration and is not too short)
     * @param track The track to validate
     * @returns true if the track is valid, false otherwise
     */
    private isValid(track: Track | UnresolvedTrack): boolean {
        // For resolved tracks, check duration - skip tracks less than 10 seconds
        if (this.managerUtils.isTrack(track)) {
            const duration = track.info?.duration;
            // Skip tracks with invalid duration (NaN, null, undefined) or duration less than 10 seconds
            if (!duration || isNaN(duration) || duration < 10000) {
                return false;
            }
        }

        return true;
    }

    /**
     * Create a new Queue
     * @param guildId The guild ID
     * @param data The data to initialize the queue with
     * @param QueueSaver The queue saver to use
     * @param queueOptions
     */
    constructor(guildId: string, data: Partial<StoredQueue> = {}, QueueSaver?: QueueSaver, queueOptions?: ManagerQueueOptions) {
        this.queueChanges = queueOptions.queueChangesWatcher || null;
        this.guildId = guildId;
        this.QueueSaver = QueueSaver;
        this.options.maxPreviousTracks = this.QueueSaver?.options?.maxPreviousTracks ?? this.options.maxPreviousTracks;

        this.current = this.managerUtils.isTrack(data.current) ? data.current : null;
        // tracks and previous are NOT stored in memory - they live in Redis

        Object.defineProperty(this, QueueSymbol, { configurable: true, value: true });
    }

    /** Load the full queue state from Redis, with current from memory */
    private async _load(): Promise<StoredQueue> {
        const data = await this.QueueSaver.get(this.guildId);
        return {
            current: this.current,
            previous: Array.isArray(data?.previous) ? data.previous : [],
            tracks: Array.isArray(data?.tracks) ? data.tracks : [],
        };
    }

    /** Save the full queue state to Redis, enforcing maxPreviousTracks */
    private async _save(stored: StoredQueue): Promise<void> {
        if (stored.previous.length > this.options.maxPreviousTracks) {
            stored.previous.splice(this.options.maxPreviousTracks, stored.previous.length);
        }
        await this.QueueSaver.set(this.guildId, stored);
    }

    /** Create a shallow copy of a StoredQueue for change watcher snapshots */
    private _snapshot(stored: StoredQueue): StoredQueue {
        return {
            current: stored.current ? { ...stored.current } : null,
            previous: [...stored.previous],
            tracks: [...stored.tracks],
        };
    }

    /** Get all tracks from Redis */
    public async getTracks(): Promise<(Track | UnresolvedTrack)[]> {
        const stored = await this._load();
        return stored.tracks;
    }

    /** Get the number of tracks in the queue */
    public async getTrackCount(): Promise<number> {
        const stored = await this._load();
        return stored.tracks.length;
    }

    /** Get a track at a specific index */
    public async getTrack(index: number): Promise<Track | UnresolvedTrack | undefined> {
        const stored = await this._load();
        return stored.tracks[index];
    }

    /** Get a slice of tracks */
    public async getTracksSlice(start: number, end?: number): Promise<(Track | UnresolvedTrack)[]> {
        const stored = await this._load();
        return stored.tracks.slice(start, end);
    }

    /** Get all previous tracks from Redis */
    public async getPrevious(): Promise<Track[]> {
        const stored = await this._load();
        return stored.previous;
    }

    /** Get a previous track at a specific index */
    public async getPreviousTrack(index: number): Promise<Track | undefined> {
        const stored = await this._load();
        return stored.previous[index];
    }

    /** Get the number of previous tracks */
    public async getPreviousCount(): Promise<number> {
        const stored = await this._load();
        return stored.previous.length;
    }

    /** Clear all tracks from the queue */
    public async clearTracks(): Promise<void> {
        const stored = await this._load();
        stored.tracks = [];
        await this._save(stored);
    }

    /** Add a track to the beginning of the queue */
    public async unshiftTrack(track: Track | UnresolvedTrack): Promise<number> {
        const stored = await this._load();
        stored.tracks.unshift(track);
        await this._save(stored);
        return stored.tracks.length;
    }

    /** Remove and return the first track from the queue */
    public async shiftTrack(): Promise<Track | UnresolvedTrack | undefined> {
        const stored = await this._load();
        const shifted = stored.tracks.shift();
        if (shifted) await this._save(stored);
        return shifted;
    }

    /** Add a track to the end of the queue */
    public async pushTrack(track: Track | UnresolvedTrack): Promise<number> {
        const stored = await this._load();
        stored.tracks.push(track);
        await this._save(stored);
        return stored.tracks.length;
    }

    /** Replace all tracks in the queue */
    public async setTracks(tracks: (Track | UnresolvedTrack)[]): Promise<void> {
        const stored = await this._load();
        stored.tracks = tracks;
        await this._save(stored);
    }

    /** Move a track from one position to another */
    public async moveTrack(from: number, to: number): Promise<void> {
        const stored = await this._load();
        if (from < 0 || from >= stored.tracks.length) return;
        const [moved] = stored.tracks.splice(from, 1);
        if (moved) stored.tracks.splice(to, 0, moved);
        await this._save(stored);
    }

    /** Find the index of a track matching a predicate */
    public async findTrackIndex(predicate: (track: Track | UnresolvedTrack) => boolean): Promise<number> {
        const stored = await this._load();
        return stored.tracks.findIndex(predicate);
    }

    /** Add a track to the beginning of the previous tracks array */
    public async addToPrevious(track: Track): Promise<void> {
        const stored = await this._load();
        stored.previous.unshift(track);
        await this._save(stored);
    }

    /** Replace a track at a specific index */
    public async replaceTrack(index: number, track: Track | UnresolvedTrack): Promise<boolean> {
        const stored = await this._load();
        if (index < 0 || index >= stored.tracks.length) return false;
        stored.tracks[index] = track;
        await this._save(stored);
        return true;
    }

    /** Swap two tracks in the queue */
    public async swapTracks(i: number, j: number): Promise<boolean> {
        const stored = await this._load();
        if (i < 0 || i >= stored.tracks.length || j < 0 || j >= stored.tracks.length) return false;
        [stored.tracks[i], stored.tracks[j]] = [stored.tracks[j], stored.tracks[i]];
        await this._save(stored);
        return true;
    }

    /**
     * Utils for a Queue
     */
    public utils = {
        /**
         * Save the current cached Queue on the database/server (overides the server)
         */
        save: async () => {
            const stored = await this._load();
            await this._save(stored);
        },

        /**
         * Sync the current queue database/server with the cached one
         * @returns {void}
         */
        sync: async (override = true, dontSyncCurrent = true) => {
            const data = await this.QueueSaver.get(this.guildId);
            if (!data) throw new Error(`No data found to sync for guildId: ${this.guildId}`);
            if (!dontSyncCurrent && !this.current && (this.managerUtils.isTrack(data.current))) this.current = data.current;
            // tracks and previous already live in Redis, no sync needed
        },

        destroy: async () => {
            return await this.QueueSaver.delete(this.guildId);
        },


        /**
         * @returns The Queue, but in a raw State, which allows easier handling for the QueueStoreManager
         * NOTE: This is now async since tracks/previous are loaded from Redis
         */
        toJSON: async (): Promise<StoredQueue> => {
            const stored = await this._load();
            if (stored.previous.length > this.options.maxPreviousTracks) stored.previous.splice(this.options.maxPreviousTracks, stored.previous.length);
            return {
                current: stored.current ? { ...stored.current } : null,
                previous: [...stored.previous],
                tracks: [...stored.tracks],
            };
        },

        /**
         * Get the Total Duration of the Queue-Songs summed up
         * NOTE: This is now async since tracks are loaded from Redis
         * @returns {Promise<number>}
         */
        totalDuration: async (): Promise<number> => {
            const stored = await this._load();
            return stored.tracks.reduce((acc: number, cur) => acc + (cur.info?.duration || 0), this.current?.info?.duration || 0);
        }
    }

    /**
     * Shuffles the current Queue, then saves it
     * @returns Amount of Tracks in the Queue
     */
    public async shuffle() {
        const stored = await this._load();
        const oldStored = typeof this.queueChanges?.shuffled === "function" ? this._snapshot(stored) : null;

        if (stored.tracks.length <= 1) return stored.tracks.length;
        // swap #1 and #2 if only 2 tracks.
        if (stored.tracks.length === 2) {
            [stored.tracks[0], stored.tracks[1]] = [stored.tracks[1], stored.tracks[0]];
        }
        else { // randomly swap places.
            for (let i = stored.tracks.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [stored.tracks[i], stored.tracks[j]] = [stored.tracks[j], stored.tracks[i]];
            }
        }

        // LOG
        if (typeof this.queueChanges?.shuffled === "function") this.queueChanges.shuffled(this.guildId, oldStored, this._snapshot(stored));

        await this._save(stored);
        return stored.tracks.length;
    }

    /**
     * Add a Track to the Queue, and after saved in the "db" it returns the amount of the Tracks
     * @param {Track | Track[]} TrackOrTracks
     * @param {number} index At what position to add the Track
     * @returns {number} Queue-Size (for the next Tracks)
     */
    public async add(TrackOrTracks: Track | UnresolvedTrack | (Track | UnresolvedTrack)[], index?: number) {
        // Filter out invalid tracks using the isValid function
        const validTracks = (Array.isArray(TrackOrTracks) ? TrackOrTracks : [TrackOrTracks])
            .flat(2)
            .filter(v => this.managerUtils.isTrack(v) || this.managerUtils.isUnresolvedTrack(v))
            .filter(v => this.isValid(v));

        const stored = await this._load();

        if (typeof index === "number" && index >= 0 && index < stored.tracks.length) {
            const oldStored = (typeof this.queueChanges?.tracksAdd === "function" || typeof this.queueChanges?.tracksRemoved === "function") ? this._snapshot(stored) : null;

            stored.tracks.splice(index, 0, ...validTracks);

            if (typeof this.queueChanges?.tracksAdd === "function") try { this.queueChanges.tracksAdd(this.guildId, validTracks, index, oldStored, this._snapshot(stored)); } catch { /* */ }

            await this._save(stored);
            return stored.tracks.length;
        }

        const oldStored = typeof this.queueChanges?.tracksAdd === "function" ? this._snapshot(stored) : null;
        // add the valid track(s)
        stored.tracks.push(...validTracks);
        // log if available
        if (typeof this.queueChanges?.tracksAdd === "function") try { this.queueChanges.tracksAdd(this.guildId, validTracks, stored.tracks.length, oldStored, this._snapshot(stored)); } catch { /*  */ }

        // save the queue
        await this._save(stored);
        // return the amount of the tracks
        return stored.tracks.length;
    }

    /**
     * Splice the tracks in the Queue
     * @param {number} index Where to remove the Track
     * @param {number} amount How many Tracks to remove?
     * @param {Track | Track[]} TrackOrTracks Want to Add more Tracks?
     * @returns {Track} Spliced Track
     */
    public async splice(index: number, amount: number, TrackOrTracks?: Track | UnresolvedTrack | (Track | UnresolvedTrack)[]) {
        const stored = await this._load();
        const oldStored = typeof this.queueChanges?.tracksAdd === "function" || typeof this.queueChanges?.tracksRemoved === "function" ? this._snapshot(stored) : null;
        // if no tracks to splice, add the tracks
        if (!stored.tracks.length) {
            if (TrackOrTracks) return await this.add(TrackOrTracks);
            return null
        }

        // Filter out invalid tracks using the isValid function if adding tracks
        const validTracks = TrackOrTracks ? (Array.isArray(TrackOrTracks) ? TrackOrTracks : [TrackOrTracks])
            .flat(2)
            .filter(v => this.managerUtils.isTrack(v) || this.managerUtils.isUnresolvedTrack(v))
            .filter(v => this.isValid(v)) : [];

        // Log if available
        if ((TrackOrTracks) && typeof this.queueChanges?.tracksAdd === "function") try { this.queueChanges.tracksAdd(this.guildId, validTracks, index, oldStored, this._snapshot(stored)); } catch { /*  */ }
        // remove the tracks (and add the new ones)
        let spliced = TrackOrTracks ? stored.tracks.splice(index, amount, ...validTracks) : stored.tracks.splice(index, amount);
        // get the spliced array
        spliced = (Array.isArray(spliced) ? spliced : [spliced]);
        // Log if available
        if (typeof this.queueChanges?.tracksRemoved === "function") try { this.queueChanges.tracksRemoved(this.guildId, spliced, index, oldStored, this._snapshot(stored)) } catch { /* */ }
        // save the queue
        await this._save(stored);
        // return the things
        return spliced.length === 1 ? spliced[0] : spliced;
    }

    /**
     * Remove stuff from the queue.tracks array
     *  - single Track | UnresolvedTrack
     *  - multiple Track | UnresovedTrack
     *  - at the index or multiple indexes
     * @param removeQueryTrack
     * @returns null (if nothing was removed) / { removed } where removed is an array with all removed elements
     *
     * @example
     * ```js
     * // remove single track
     *
     * const track = await player.queue.getTrack(4);
     * await player.queue.remove(track);
     *
     * // if you already have the index you can straight up pass it too
     * await player.queue.remove(4);
     *
     *
     * // if you want to remove multiple tracks, e.g. from position 4 to position 10 you can do smt like this
     * const tracks = await player.queue.getTracksSlice(4, 10);
     * await player.queue.remove(tracks);
     *
     * // I still highly suggest to use .splice!
     *
     * await player.queue.splice(4, 10); // removes at index 4, 10 tracks
     *
     * await player.queue.splice(1, 1); // removes at index 1, 1 track
     *
     * await player.queue.splice(4, 0, ...tracks) // removes 0 tracks at position 4, and then inserts all tracks after position 4.
     * ```
     */
    public async remove<T extends Track | UnresolvedTrack | number | Track[] | UnresolvedTrack[] | number[] | (number | Track | UnresolvedTrack)[]>(removeQueryTrack: T): Promise<{ removed: (Track | UnresolvedTrack)[] } | null> {
        const stored = await this._load();
        const oldStored = typeof this.queueChanges?.tracksRemoved === "function" ? this._snapshot(stored) : null;
        if (typeof removeQueryTrack === "number") {
            const toRemove = stored.tracks[removeQueryTrack];
            if (!toRemove) return null;

            const removed = stored.tracks.splice(removeQueryTrack, 1);
            // Log if available
            if (typeof this.queueChanges?.tracksRemoved === "function") try { this.queueChanges.tracksRemoved(this.guildId, removed, removeQueryTrack, oldStored, this._snapshot(stored)) } catch { /* */ }

            await this._save(stored);

            return { removed }
        }

        if (Array.isArray(removeQueryTrack)) {
            if (removeQueryTrack.every(v => typeof v === "number")) {
                const removed = [];
                for (const i of removeQueryTrack) {
                    if (stored.tracks[i]) {
                        removed.push(...stored.tracks.splice(i, 1))
                    }
                }
                if (!removed.length) return null;

                // Log if available
                if (typeof this.queueChanges?.tracksRemoved === "function") try { this.queueChanges.tracksRemoved(this.guildId, removed, removeQueryTrack as number[], oldStored, this._snapshot(stored)) } catch { /* */ }

                await this._save(stored);

                return { removed };
            }

            const tracksToRemove = stored.tracks.map((v, i) => ({ v, i })).filter(({ v, i }) => removeQueryTrack.find(t =>
                typeof t === "number" && (t === i) ||
                typeof t === "object" && (
                    t.encoded && t.encoded === v.encoded ||
                    t.info?.identifier && t.info.identifier === v.info?.identifier ||
                    t.info?.uri && t.info.uri === v.info?.uri ||
                    t.info?.title && t.info.title === v.info?.title ||
                    t.info?.isrc && t.info.isrc === v.info?.isrc ||
                    t.info?.artworkUrl && t.info.artworkUrl === v.info?.artworkUrl
                )
            ));

            if (!tracksToRemove.length) return null;

            const removed = [];

            for (const { i } of tracksToRemove) {
                if (stored.tracks[i]) {
                    removed.push(...stored.tracks.splice(i, 1))
                }
            }
            // Log if available
            if (typeof this.queueChanges?.tracksRemoved === "function") try { this.queueChanges.tracksRemoved(this.guildId, removed, tracksToRemove.map(v => v.i), oldStored, this._snapshot(stored)) } catch { /* */ }

            await this._save(stored);

            return { removed };
        }
        const toRemove = stored.tracks.findIndex((v) =>
            removeQueryTrack.encoded && removeQueryTrack.encoded === v.encoded ||
            removeQueryTrack.info?.identifier && removeQueryTrack.info.identifier === v.info?.identifier ||
            removeQueryTrack.info?.uri && removeQueryTrack.info.uri === v.info?.uri ||
            removeQueryTrack.info?.title && removeQueryTrack.info.title === v.info?.title ||
            removeQueryTrack.info?.isrc && removeQueryTrack.info.isrc === v.info?.isrc ||
            removeQueryTrack.info?.artworkUrl && removeQueryTrack.info.artworkUrl === v.info?.artworkUrl
        );

        if (toRemove < 0) return null;

        const removed = stored.tracks.splice(toRemove, 1);
        // Log if available
        if (typeof this.queueChanges?.tracksRemoved === "function") try { this.queueChanges.tracksRemoved(this.guildId, removed, toRemove, oldStored, this._snapshot(stored)) } catch { /* */ }

        await this._save(stored);

        return { removed };
    }

    /**
     * Shifts the previous array, to return the last previous track & thus remove it from the previous queue
     * @returns
     *
     * @example
     * ```js
     * // example on how to play the previous track again
     * const previous = await player.queue.shiftPrevious(); // get the previous track and remove it from the previous queue array!!
     * if(!previous) return console.error("No previous track found");
     * await player.play({ clientTrack: previous }); // play it again
     * ```
     */
    public async shiftPrevious() {
        const stored = await this._load();
        const removed = stored.previous.shift();
        if (removed) await this._save(stored);
        return removed ?? null;
    }
}
