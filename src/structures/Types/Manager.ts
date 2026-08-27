import type { DebugEvents } from "../Constants";
import { LavalinkManager } from "../LavalinkManager";

import type { Player } from "../Player";

import type { LavalinkNodeOptions } from "./Node";
import type { DestroyReasonsType, PlayerJson, PlayerOptions } from "./Player";
import type { ManagerQueueOptions } from "./Queue";
import type { Track, UnresolvedTrack } from "./Track";
import type { GuildShardPayload, SearchPlatform, SponsorBlockChaptersLoaded, SponsorBlockChapterStarted, SponsorBlockSegmentSkipped, SponsorBlockSegmentsLoaded, TrackExceptionEvent, TrackEndEvent, TrackStuckEvent, WebSocketClosedEvent, TrackStartEvent, LyricsFoundEvent, LyricsNotFoundEvent, LyricsLineEvent } from "./Utils";

/**
 * The events from the lavalink Manager
 */
export interface LavalinkManagerEvents<CustomPlayerT extends Player = Player> {
    /**
     * Emitted when a Track started playing.
     * @event Manager#trackStart
     */
    "trackStart": (player: CustomPlayerT, track: Track | null, payload: TrackStartEvent) => void;
    /**
     * Emitted when a Track finished.
     * @event Manager#trackEnd
     */
    "trackEnd": (player: CustomPlayerT, track: Track | null, payload: TrackEndEvent) => void;
    /**
     * Emitted when a Track got stuck while playing.
     * @event Manager#trackStuck
     */
    "trackStuck": (player: CustomPlayerT, track: Track | null, payload: TrackStuckEvent) => void;
    /**
     * Emitted when a Track errored.
     * @event Manager#trackError
     */
    "trackError": (player: CustomPlayerT, track: Track | UnresolvedTrack | null, payload: TrackExceptionEvent) => void;
    /**
     * Emitted when the Playing finished and no more tracks in the queue.
     * @event Manager#queueEnd
     */
    "queueEnd": (player: CustomPlayerT, track: Track | UnresolvedTrack | null, payload: TrackEndEvent | TrackStuckEvent | TrackExceptionEvent) => void;
    /**
     * Emitted when a Player is created.
     * @event Manager#playerCreate
     */
    "playerCreate": (player: CustomPlayerT) => void;
    /**
     * Emitted when a Player is moved within the channel.
     * @event Manager#playerMove
     */
    "playerMove": (player: CustomPlayerT, oldVoiceChannelId: string, newVoiceChannelId: string) => void;
    /**
     * Emitted when a Player is disconnected from a channel.
     * @event Manager#playerDisconnect
     */
    "playerDisconnect": (player: CustomPlayerT, voiceChannelId: string) => void;
    /**
     * Emitted when a Node-Socket got closed for a specific Player.
     * Usually emits when the audio websocket to discord is closed, This can happen for various reasons (normal and abnormal), e.g. when using an expired voice server update. 4xxx codes are usually bad.
     *
     * So this is just information, normally lavalink should handle disconnections
     *
     * Discord Docs:
     * @link https://discord.com/developers/docs/topics/opcodes-and-status-codes#voice-voice-close-event-codes
     *
     * Lavalink Docs:
     * @link https://lavalink.dev/api/websocket.html#websocketclosedevent
     * @event Manager#playerSocketClosed
     */
    "playerSocketClosed": (player: CustomPlayerT, payload: WebSocketClosedEvent) => void;
    /**
     * Emitted when a Player get's destroyed
     * @event Manager#playerDestroy
     */
    "playerDestroy": (player: CustomPlayerT, destroyReason?: DestroyReasonsType) => void;

    /**
     * Always emits when the player (on lavalink side) got updated
     * @event Manager#playerUpdate
     */
    "playerUpdate": (oldPlayerJson: PlayerJson, newPlayer: CustomPlayerT) => void;

    /**
     * Emitted when the player's selfMuted or serverMuted state changed (true -> false | false -> true)
     * @event Manager#playerMuteChange
     */
    "playerMuteChange": (player: CustomPlayerT, selfMuted: boolean, serverMuted: boolean) => void;

    /**
     * Emitted when the player's selfDeafed or serverDeafed state changed (true -> false | false -> true)
     * @event Manager#playerDeafChange
     */
    "playerDeafChange": (player: CustomPlayerT, selfDeafed: boolean, serverDeafed: boolean) => void;

    /**
     * Emitted when the player's suppressed (true -> false | false -> true)
     * @event Manager#playerSuppressChange
     */
    "playerSuppressChange": (player: CustomPlayerT, suppress: boolean) => void;

    /**
     * Emitted when the player's queue got empty, and the timeout started
     * @event Manager#playerQueueEmptyStart
     */
    "playerQueueEmptyStart": (player: CustomPlayerT, timeoutMs: number) => void;

    /**
     * Emitted when the player's queue got empty, and the timeout finished leading to destroying the player
     * @event Manager#playerQueueEmptyEnd
     */
    "playerQueueEmptyEnd": (player: CustomPlayerT) => void;

    /**
     * Emitted when the player's queue got empty, and the timeout got cancelled becuase a track got re-added to it.
     * @event Manager#playerQueueEmptyEnd
     */
    "playerQueueEmptyCancel": (player: CustomPlayerT) => void;

    /**
     * Emitted, when a user joins the voice channel, while there is a player existing
     * @event Manager#playerQueueEmptyStart
     */
    "playerVoiceJoin": (player: CustomPlayerT, userId: string) => void;

    /**
     * Emitted, when a user leaves the voice channel, while there is a player existing
     * @event Manager#playerQueueEmptyEnd
     */
    "playerVoiceLeave": (player: CustomPlayerT, userId: string) => void;

    /**
     * Emitted when Discord never completed the voice handshake and every retry node
     * was exhausted. The player is destroyed right after (unless `destroyOnFail`
     * is disabled).
     * @event Manager#playerVoiceTimeout
     */
    "playerVoiceTimeout": (player: CustomPlayerT, lastNodeId: string, attempts: number) => void;

    /**
     * Emitted when the player's resolved voice region changes - on first resolution of an
     * "Automatic" region, and whenever someone changes the channel's region afterwards.
     *
     * `movedNode` tells you whether the player actually changed node: it is false when the
     * current node was already optimal, or when the player was mid-track (moving would cut
     * audio, so the region is recorded but the node is kept).
     *
     * @event Manager#playerRegionChange
     * @example
     * ```ts
     * client.lavalink.on("playerRegionChange", (player, { firstResolution, newRegion, movedNode, newNodeId }) => {
     *   if (firstResolution || !movedNode) return; // not a real change, or nothing moved
     *   channel.send(`Voice region changed to ${newRegion} - routed you to ${newNodeId}, the closest server.`);
     * });
     * ```
     */
    "playerRegionChange": (player: CustomPlayerT, data: {
        /** The previously known region, or null if this is the first resolution. */
        oldRegion: string | null;
        /** The newly resolved region (e.g. "newark"). */
        newRegion: string;
        /**
         * True when this is the FIRST time the region was resolved for this player - i.e. the
         * channel's region is "Automatic" and the player just connected. This is not a region
         * *change*; skip it when messaging users, or every join produces a notification.
         */
        firstResolution: boolean;
        /** Airport code the region came from, when the endpoint used the Cloudflare format. */
        iata?: string;
        /** The raw VOICE_SERVER_UPDATE endpoint the region was parsed from. */
        endpoint: string;
        /** Whether the player was actually moved to a different node. */
        movedNode: boolean;
        /** Node the player is on after handling the change. */
        newNodeId: string;
        /** Node the player was on before. Equals `newNodeId` when `movedNode` is false. */
        oldNodeId: string;
        /** Why the node was not changed, when `movedNode` is false. */
        reason?: "already-optimal" | "playing" | "explicit-region" | "changing" | "failed";
    }) => void;

    /**
     * SPONSORBLOCK-PLUGIN EVENT
     * Emitted when Segments are loaded
     * @link https://github.com/topi314/Sponsorblock-Plugin#segmentsloaded
     * @event Manager#trackError
     */
    "SegmentsLoaded": (player: CustomPlayerT, track: Track | UnresolvedTrack | null, payload: SponsorBlockSegmentsLoaded) => void;

    /**
     * SPONSORBLOCK-PLUGIN EVENT
     * Emitted when a specific Segment was skipped
     * @link https://github.com/topi314/Sponsorblock-Plugin#segmentskipped
     * @event Manager#trackError
     */
    "SegmentSkipped": (player: CustomPlayerT, track: Track | UnresolvedTrack | null, payload: SponsorBlockSegmentSkipped) => void;

    /**
     * SPONSORBLOCK-PLUGIN EVENT
     * Emitted when a specific Chapter starts playing
     * @link https://github.com/topi314/Sponsorblock-Plugin#chapterstarted
     * @event Manager#trackError
     */
    "ChapterStarted": (player: CustomPlayerT, track: Track | UnresolvedTrack | null, payload: SponsorBlockChapterStarted) => void;

    /**
     * SPONSORBLOCK-PLUGIN EVENT
     * Emitted when Chapters are loaded
     * @link https://github.com/topi314/Sponsorblock-Plugin#chaptersloaded
     * @event Manager#trackError
     */
    "ChaptersLoaded": (player: CustomPlayerT, track: Track | UnresolvedTrack | null, payload: SponsorBlockChaptersLoaded) => void;

    /**
     * Lavalink-Client Debug Event
     * Emitted for several erros, and logs within lavalink-client, if managerOptions.advancedOptions.enableDebugEvents is true
     * Useful for debugging the lavalink-client
     *
     * @event Manager#debug
     */
    "debug": (eventKey: DebugEvents, eventData: { message: string, state: "log" | "warn" | "error", error?: Error | string, functionLayer: string }) => void;

    /**
     * Emitted when a Lyrics line is received
     * @link https://github.com/topi314/LavaLyrics
     * @event Manager#LyricsLine
     */
    "LyricsLine": (player: CustomPlayerT, track: Track | UnresolvedTrack | null, payload: LyricsLineEvent) => void;

    /**
     * Emitted when a Lyrics is found
     * @link https://github.com/topi314/LavaLyrics
     * @event Manager#LyricsFound
     */
    "LyricsFound": (player: CustomPlayerT, track: Track | UnresolvedTrack | null, payload: LyricsFoundEvent) => void;

    /**
     * Emitted when a Lyrics is not found
     * @link https://github.com/topi314/LavaLyrics
     * @event Manager#LyricsNotFound
     */
    "LyricsNotFound": (player: CustomPlayerT, track: Track | UnresolvedTrack | null, payload: LyricsNotFoundEvent) => void;

    /**
     * Emitted when a track ends - always emitted regardless of reason
     * Contains the message stored in player.get("message") or null if not set
     * @event Manager#deleteMessage
     */
    "deleteMessage": (player: CustomPlayerT, message: unknown) => void;

    "playerResumed": (player: CustomPlayerT, track: Track | UnresolvedTrack | null) => void;

    "playerPaused": (player: CustomPlayerT, track: Track | UnresolvedTrack | null) => void;
}
/**
 * The Bot client Options needed for the manager
 */
export interface BotClientOptions {
    /** Bot Client Id */
    id: string;
    /** Bot Client Username */
    username?: string;
    /** So users can pass entire objects / classes */
    [x: string | number | symbol]: unknown;
}

/** Sub Manager Options, for player specific things */
export interface ManagerPlayerOptions<CustomPlayerT extends Player = Player> {
    /** If the Lavalink Volume should be decremented by x number */
    volumeDecrementer?: number;
    /** How often it should update the the player Position */
    clientBasedPositionUpdateInterval?: number;
    /** What should be used as a searchPlatform, if no source was provided during the query */
    defaultSearchPlatform?: SearchPlatform;
    /** Applies the volume via a filter, not via the lavalink volume transformer */
    applyVolumeAsFilter?: boolean;
    /** Transforms the saved data of a requested user */
    requesterTransformer?: (requester: unknown) => unknown;
    /**
     * Move a player to a better node even while it is playing.
     *
     * A region change has already interrupted the voice connection, so switching nodes at that
     * moment usually adds no downtime the listener didn't already experience. Set to `false` to
     * keep the player on its current node until the track ends. @default true
     */
    rerouteWhilePlaying?: boolean;
    /**
     * How long cached Discord voice credentials stay usable for a node move.
     *
     * Voice tokens are per-session and are invalidated by the voice-server events that usually
     * trigger a move. Beyond this age, changeNode() forces a real re-handshake instead of
     * replaying dead credentials onto the new node (which yields a player Lavalink accepts but
     * that never produces audio). @default 60000
     */
    maxVoiceCredentialAgeMs?: number;
    /**
     * Max random delay before re-routing a player after its voice region resolves.
     * Discord migrates a whole edge at once, so without jitter thousands of players
     * would fire changeNode() REST calls in the same second. @default 2000
     */
    rerouteJitterMs?: number;
    /**
     * What to do when Discord never completes the voice handshake after connect().
     *
     * `connect()` only fires the gateway op-4 and returns; if no VOICE_SERVER_UPDATE
     * arrives the player is silently stuck with no audio and no error. This watchdog
     * detects that and moves the player to another node before giving up.
     */
    onVoiceTimeout?: {
        /**
         * How long to wait for VOICE_SERVER_UPDATE before acting. `<= 0` disables the watchdog.
         *
         * DISABLED BY DEFAULT. A handshake that is merely slow is far more common than one that
         * never happens, and several code paths legitimately re-connect a player to a channel it
         * is already in - which Discord answers with no VOICE_SERVER_UPDATE at all, so an armed
         * timer can never be cleared. Enable this only if you have telemetry showing genuinely
         * stuck players, and prefer `switchNode: false` so it stays a pure diagnostic signal.
         * @default 0 (disabled)
         */
        timeoutMs?: number;
        /**
         * Move the player to a different node and retry the handshake.
         *
         * Off by default: a late VOICE_SERVER_UPDATE is far more common than an absent one, and a
         * node swap tears down a connection that was about to succeed. Leave this false to get
         * `playerVoiceTimeout` purely as a diagnostic signal, and enable it only if telemetry
         * shows handshakes that truly never complete. @default false
         */
        switchNode?: boolean;
        /** How many nodes to try before giving up. @default 2 */
        maxAttempts?: number;
        /**
         * Destroy the player once every attempt failed. Off by default: a slow-but-healthy
         * handshake should never cost the user their player. Leaves the player alive on the
         * last node tried, and emits `playerVoiceTimeout` either way.
         * @default false
         */
        destroyOnFail?: boolean;
    };
    /** What lavalink-client should do when the player reconnects */
    onDisconnect?: {
        /** Try to reconnect? -> If fails -> Destroy */
        autoReconnect?: boolean;
        /** Only try to reconnect if there are tracks in the queue */
        autoReconnectOnlyWithTracks?: boolean;
        /** Instantly destroy player (overrides autoReconnect) | Don't provide == disable feature*/
        destroyPlayer?: boolean;
    };
    /** Minimum time to play the song before autoPlayFunction is executed (prevents error spamming) Set to 0 to disable it @default 10000 */
    minAutoPlayMs?: number;
    /** Allows you to declare how many tracks are allowed to error/stuck within a time-frame before player is destroyed @default "{threshold: 35000, maxAmount: 3 }" */
    maxErrorsPerTime?: {
        /** The threshold time to count errors (recommended is 35s) */
        threshold: number;
        /** The max amount of errors within the threshold time which are allowed before destroying the player (when errors > maxAmount -> player.destroy()) */
        maxAmount: number;
    };
    /* What the Player should do, when the queue gets empty */
    onEmptyQueue?: {
        /** Get's executed onEmptyQueue -> You can do any track queue previous transformations, if you add a track to the queue -> it will play it, if not queueEnd will execute! */
        autoPlayFunction?: (player: CustomPlayerT, lastPlayedTrack: Track) => Promise<void>;
        /* aut. destroy the player after x ms, if 1 it instantly destroys, don't provide or set to 0 to not destroy the player */
        destroyAfterMs?: number;
    };
    /* If to override the data from the Unresolved Track. for unresolved tracks */
    useUnresolvedData?: boolean;
}

export type DeepRequired<T> = {
  [K in keyof T]-?: NonNullable<T[K]> extends object
    ? DeepRequired<NonNullable<T[K]>>
    : NonNullable<T[K]>;
};

export type RequiredManagerOptions<T extends Player> = DeepRequired<ManagerOptions<T>>;

type PlayerConstructor<T extends Player = Player> = new (options: PlayerOptions, LavalinkManager: LavalinkManager, dontEmitPlayerCreateEvent?: boolean) => T;

/** Manager Options used to create the manager */
export interface ManagerOptions<CustomPlayerT extends Player = Player> {
    /** The Node Options, for all Nodes! (on init) */
    nodes: LavalinkNodeOptions[];
    /** @async The Function to send the voice connection changes from Lavalink to Discord */
    sendToShard: (guildId: string, payload: GuildShardPayload) => void;
    /** The Bot Client's Data for Authorization */
    client?: BotClientOptions;
    /** QueueOptions for all Queues */
    queueOptions?: ManagerQueueOptions<CustomPlayerT>;
    /** PlayerOptions for all Players */
    playerOptions?: ManagerPlayerOptions<CustomPlayerT>;
    /** The player class you want to use when creating a player. (can be extendable) */
    playerClass?: PlayerConstructor<CustomPlayerT>;
    /** If it should skip to the next Track on TrackEnd / TrackError etc. events */
    autoSkip?: boolean;
    /** If it should automatically move the player to the next node when node is down */
    autoMove?: boolean;
    /** If it should skip to the next Track if track.resolve errors while trying to play a track. */
    autoSkipOnResolveError?: boolean;
    /** If it should emit only new (unique) songs and not when a looping track (or similar) is plaid, default false */
    emitNewSongsOnly?: boolean;
    /** Only allow link requests with links either matching some of that regExp or including some of that string */
    linksWhitelist?: (RegExp | string)[];
    /** Never allow link requests with links either matching some of that regExp or including some of that string (doesn't even allow if it's whitelisted) */
    linksBlacklist?: (RegExp | string)[];
    /** If links should be allowed or not. If set to false, it will throw an error if a link was provided. */
    linksAllowed?: boolean;
    /** Advanced Options for the Library, which may or may not be "library breaking" */
    advancedOptions?: {
        /** Max duration for that the filter fix duration works (in ms) - default is 8mins */
        maxFilterFixDuration?: number,
        /** Enable Debug event */
        enableDebugEvents?: boolean;
        /** optional */
        debugOptions?: {
            /** For logging custom searches */
            logCustomSearches?: boolean;
            /** logs for debugging the "no-Audio" playing error */
            noAudio?: boolean;
            /** For Logging the Destroy function */
            playerDestroy?: {
                /** To show the debug reason at all times. */
                debugLog?: boolean;
                /** If you get 'Error: Use Player#destroy("reason") not LavalinkManager#deletePlayer() to stop the Player' put it on true */
                dontThrowError?: boolean;
            }
        }
    }
}
