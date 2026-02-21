import type { Player } from "../Player";
import type { Track, UnresolvedTrack } from "./Track";
import type { Awaitable } from "./Utils";

export interface StoredQueue {
    current: Track | null;
    previous: Track[];
    tracks: (Track | UnresolvedTrack)[];
}

export interface QueueStoreManager {
    /** @async get a Value (MUST RETURN UNPARSED!) */
    get: (guildId: string) => Awaitable<StoredQueue | string>;
    /** @async Set a value inside a guildId (MUST BE UNPARSED) */
    set: (guildId: string, value: StoredQueue | string) => Awaitable<void | boolean>;
    /** @async Delete a Database Value based of it's guildId */
    delete: (guildId: string) => Awaitable<void | boolean>;
    /** @async Transform the value(s) inside of the QueueStoreManager (IF YOU DON'T NEED PARSING/STRINGIFY, then just return the value) */
    stringify: (value: StoredQueue | string) => Awaitable<StoredQueue | string>;
    /** @async Parse the saved value back to the Queue (IF YOU DON'T NEED PARSING/STRINGIFY, then just return the value) */
    parse: (value: StoredQueue | string) => Awaitable<Partial<StoredQueue>>;
}

export interface ManagerQueueOptions<CustomPlayerT extends Player = Player> {
    /** Maximum Amount of tracks for the queue.previous array. Set to 0 to not save previous songs. Defaults to 25 Tracks */
    maxPreviousTracks?: number;
    /** Custom Queue Store option */
    queueStore?: QueueStoreManager;
    /** Custom Queue Watcher class */
    queueChangesWatcher?: QueueChangesWatcher;
}

export interface TargetedQueueStoreManager extends QueueStoreManager {
    readonly supportsTargetedOps: true;

    // Current track
    getCurrent(guildId: string): Awaitable<Track | null>;
    setCurrent(guildId: string, track: Track | null): Awaitable<void>;

    // Tracks list
    getTracksCount(guildId: string): Awaitable<number>;
    getTrackAt(guildId: string, index: number): Awaitable<Track | UnresolvedTrack | null>;
    getTracksRange(guildId: string, start: number, end: number): Awaitable<(Track | UnresolvedTrack)[]>;
    getAllTracks(guildId: string): Awaitable<(Track | UnresolvedTrack)[]>;
    pushTrack(guildId: string, ...tracks: (Track | UnresolvedTrack)[]): Awaitable<number>;
    unshiftTrack(guildId: string, ...tracks: (Track | UnresolvedTrack)[]): Awaitable<number>;
    shiftTrack(guildId: string): Awaitable<Track | UnresolvedTrack | null>;
    setTrackAt(guildId: string, index: number, track: Track | UnresolvedTrack): Awaitable<void>;
    clearTracks(guildId: string): Awaitable<void>;
    replaceTracks(guildId: string, tracks: (Track | UnresolvedTrack)[]): Awaitable<void>;

    // Previous list
    getPreviousCount(guildId: string): Awaitable<number>;
    getPreviousAt(guildId: string, index: number): Awaitable<Track | null>;
    getAllPrevious(guildId: string): Awaitable<Track[]>;
    addToPrevious(guildId: string, track: Track, maxSize: number): Awaitable<void>;
    shiftPrevious(guildId: string): Awaitable<Track | null>;
    clearPrevious(guildId: string): Awaitable<void>;

    // Full load/save for complex ops
    loadFull(guildId: string): Awaitable<StoredQueue>;
    saveFull(guildId: string, stored: StoredQueue, maxPreviousTracks: number): Awaitable<void>;

    // Lifecycle
    deleteAll(guildId: string): Awaitable<void>;
}

export function isTargetedStore(store: QueueStoreManager): store is TargetedQueueStoreManager {
    return 'supportsTargetedOps' in store && (store as any).supportsTargetedOps === true;
}

export interface QueueChangesWatcher {
    /** get a Value (MUST RETURN UNPARSED!) */
    tracksAdd: (guildId: string, tracks: (Track | UnresolvedTrack)[], position: number, oldStoredQueue: StoredQueue, newStoredQueue: StoredQueue) => void;
    /** Set a value inside a guildId (MUST BE UNPARSED) */
    tracksRemoved: (guildId: string, tracks: (Track | UnresolvedTrack)[], position: number | number[], oldStoredQueue: StoredQueue, newStoredQueue: StoredQueue) => void;
    /** Set a value inside a guildId (MUST BE UNPARSED) */
    shuffled: (guildId: string, oldStoredQueue: StoredQueue, newStoredQueue: StoredQueue) => void;
    /** Track seeked event (MUST BE UNPARSED!) */
    seeked: (guildId: string, track: Track, oldPosition: number, newPosition: number, player: Player, oldStoredQueue: StoredQueue, newStoredQueue: StoredQueue) => void;
    /** Volume changed event (MUST BE UNPARSED!) */
    volumeChanged: (guildId: string, player: Player) => void;
    /** Pause/Resume event (MUST BE UNPARSED!) */
    pauseResume: (guildId: string, player: Player) => void;
    /** Repeat mode changed event (MUST BE UNPARSED!) */
    repeatModeChanged: (guildId: string, player: Player) => void;
}
