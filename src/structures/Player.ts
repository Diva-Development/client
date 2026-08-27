import { DebugEvents, DestroyReasons } from "./Constants";
import { bandCampSearch } from "./CustomSearches/BandCampSearch";
import { FilterManager } from "./Filters";
import { Queue, QueueSaver } from "./Queue";
import { queueTrackEnd } from "./Utils";

import type { Track, UnresolvedTrack } from "./Types/Track";
import type { LavalinkNode } from "./Node";
import type { SponsorBlockSegment } from "./Types/Node";
import type { anyObject, LavalinkPlayOptions, PlayerJson, PlayerOptions, PlayOptions, RepeatMode } from "./Types/Player";
import type { LavalinkManager } from "./LavalinkManager";
import type {
    LavalinkPlayerVoiceOptions, LavaSearchQuery, SearchQuery
} from "./Types/Utils";
export class Player {
    /** Filter Manager per player */
    public filterManager: FilterManager;
    /** circular reference to the lavalink Manager from the Player for easier use */
    public LavalinkManager: LavalinkManager;
    /** Player options currently used, mutation doesn't affect player's state */
    public options: PlayerOptions;
    /** The lavalink node assigned the the player, don't change it manually */
    public node: LavalinkNode;
    /** The queue from the player */
    public queue: Queue;

    /** The Guild Id of the Player */
    public guildId: string;
    /** The Voice Channel Id of the Player */
    public voiceChannelId: string | null = null;
    /** The Text Channel Id of the Player */
    public textChannelId: string | null = null;
    /** States if the Bot is supposed to be outputting audio */
    public playing: boolean = false;
    /** States if the Bot is paused or not */
    public paused: boolean = false;
    /** Repeat Mode of the Player */
    public repeatMode: RepeatMode = "off";
    /** Player's ping */
    public ping = {
        /* Response time for rest actions with Lavalink Server */
        lavalink: 0,
        /* Latency of the Discord's Websocket Voice Server */
        ws: 0
    };

    /** The Display Volume */
    public volume: number = 100;
    /** The Volume Lavalink actually is outputting */
    public lavalinkVolume: number = 100;

    /** The current Positin of the player (Calculated) */
    public get position() {
        return this.lastPosition + (this.lastPositionChange ? Date.now() - this.lastPositionChange : 0)
    }
    /** The timestamp when the last position change update happened */
    public lastPositionChange: number | null = null;
    /** The current Positin of the player (from Lavalink) */
    public lastPosition: number = 0;

    public lastSavedPosition: number = 0;

    /** When the player was created [Timestamp in Ms] (from lavalink) */
    public createdTimeStamp: number;
    /** The Player Connection's State (from Lavalink) */
    public connected: boolean | undefined = false;
    /** Voice Server Data (from Lavalink) */
    public voice: LavalinkPlayerVoiceOptions = {
        endpoint: null,
        sessionId: null,
        token: null,
        channelId: undefined,
    };

    public voiceState: {
        selfDeaf: boolean,
        selfMute: boolean,
        serverDeaf: boolean,
        serverMute: boolean,
        suppress: boolean,
    } = {
            selfDeaf: false,
            selfMute: false,
            serverDeaf: false,
            serverMute: false,
            suppress: false,
        }

    /** Custom data for the player */
    private readonly data: Record<string, unknown> = {};

    /**
     * Create a new Player
     * @param options
     * @param LavalinkManager
     */
    constructor(options: PlayerOptions, LavalinkManager: LavalinkManager, dontEmitPlayerCreateEvent?: boolean) {
        if (typeof options?.customData === "object") for (const [key, value] of Object.entries(options.customData)) this.set(key, value);

        this.options = options;
        this.filterManager = new FilterManager(this);
        this.LavalinkManager = LavalinkManager;

        this.guildId = this.options.guildId;
        this.voiceChannelId = this.options.voiceChannelId;
        this.textChannelId = this.options.textChannelId || null;


        this.node = typeof this.options.node === "string"
            ? this.LavalinkManager.nodeManager.nodes.get(this.options.node)
            : this.options.node;

        if (!this.node || typeof this.node.request !== "function") {
            if (typeof this.options.node === "string" && this.LavalinkManager.options?.advancedOptions?.enableDebugEvents) {
                this.LavalinkManager.emit("debug", DebugEvents.PlayerCreateNodeNotFound, {
                    state: "warn",
                    message: `Player was created with provided node Id: ${this.options.node}, but no node with that Id was found.`,
                    functionLayer: "Player > constructor()",
                });
            }

            this.node = this.LavalinkManager.nodeManager.getOptimalNode(options.vcRegion);
        }
        if (!this.node) throw new Error("No available Node was found, please add a LavalinkNode to the Manager via Manager.NodeManager#createNode")

        if (typeof options.volume === "number" && !isNaN(options.volume)) this.volume = Number(options.volume);

        this.volume = Math.round(Math.max(Math.min(this.volume, 1000), 0));

        this.lavalinkVolume = Math.round(Math.max(Math.min(Math.round(
            this.LavalinkManager.options.playerOptions.volumeDecrementer
                ? this.volume * this.LavalinkManager.options.playerOptions.volumeDecrementer
                : this.volume), 1000), 0));

        if (!dontEmitPlayerCreateEvent) this.LavalinkManager.emit("playerCreate", this);

        this.queue = new Queue(this.guildId, {}, new QueueSaver(this.LavalinkManager.options.queueOptions), this.LavalinkManager.options.queueOptions)
    }

    /**
     * Set custom data.
     * @param key
     * @param value
     */
    public set(key: string, value: unknown) {
        this.data[key] = value;
        return this;
    }

    /**
     * Get custom data.
     * @param key
     */
    public get<T>(key: string): T {
        return this.data[key] as T;
    }

    /**
     * CLears all the custom data.
     */
    public clearData() {
        const toKeep = Object.keys(this.data).filter(v => v.startsWith("internal_"));
        for (const key in this.data) {
            if (toKeep.includes(key)) continue;
            delete this.data[key];
        }
        return this;
    }

    /**
     * Get all custom Data
     */
    public getAllData(): Record<string, unknown> {
        return Object.fromEntries(Object.entries(this.data).filter(v => !v[0].startsWith("internal_")));
    }

    /**
     * Play the next track from the queue / a specific track, with playoptions for Lavalink
     * @param options
     */
    async play(options: Partial<PlayOptions> = {}) {
        if (this.get("internal_queueempty")) {
            if (this.LavalinkManager.options?.advancedOptions?.enableDebugEvents) {
                this.LavalinkManager.emit("debug", DebugEvents.PlayerPlayQueueEmptyTimeoutClear, {
                    state: "log",
                    message: `Player was called to play something, while there was a queueEmpty Timeout set, clearing the timeout.`,
                    functionLayer: "Player > play()",
                });
            }
            this.LavalinkManager.emit("playerQueueEmptyCancel", this);
            clearTimeout(this.get("internal_queueempty"));
            this.set("internal_queueempty", undefined);
        }

        // if clientTrack provided, override options.track object
        if (options?.clientTrack && (this.LavalinkManager.utils.isTrack(options?.clientTrack) || this.LavalinkManager.utils.isUnresolvedTrack(options.clientTrack))) {
            if (this.LavalinkManager.utils.isUnresolvedTrack(options.clientTrack)) {
                try {
                    // resolve the unresolved track
                    await (options.clientTrack as UnresolvedTrack).resolve(this);
                } catch (error) {
                    if (this.LavalinkManager.options?.advancedOptions?.enableDebugEvents) {
                        this.LavalinkManager.emit("debug", DebugEvents.PlayerPlayUnresolvedTrackFailed, {
                            state: "error",
                            error: error,
                            message: `Player Play was called with clientTrack, Song is unresolved, but couldn't resolve it`,
                            functionLayer: "Player > play() > resolve currentTrack",
                        });
                    }

                    this.LavalinkManager.emit("trackError", this, this.queue.current, error);

                    if (options && "clientTrack" in options) delete options.clientTrack;
                    if (options && "track" in options) delete options.track;

                    // try to play the next track if possible
                    if (this.LavalinkManager.options?.autoSkipOnResolveError === true && (await this.queue.getTrackCount()) > 0) return this.play(options);

                    return this;
                }
            }

            if ((typeof options.track?.userData === "object" || typeof options.clientTrack?.userData === "object") && options.clientTrack) options.clientTrack.userData = {
                ...(typeof options?.clientTrack?.requester === "object" ? { requester: this.LavalinkManager.utils.getTransformedRequester(options?.clientTrack?.requester || {}) as anyObject } : {}),
                ...options?.clientTrack.userData,
                ...options.track?.userData,
            };

            options.track = {
                encoded: options.clientTrack?.encoded,
                requester: options.clientTrack?.requester,
                userData: options.clientTrack?.userData,
            }
        }
        // if either encoded or identifier is provided generate the data to play them
        if (options?.track?.encoded || options?.track?.identifier) {
            this.queue.current = options.clientTrack as Track || null;
            this.queue.utils.save();

            if (typeof options?.volume === "number" && !isNaN(options?.volume)) {
                this.volume = Math.max(Math.min(options?.volume, 500), 0);
                let vol = Number(this.volume);
                if (this.LavalinkManager.options.playerOptions.volumeDecrementer) vol *= this.LavalinkManager.options.playerOptions.volumeDecrementer;
                this.lavalinkVolume = Math.round(vol);
                options.volume = this.lavalinkVolume;

                // emit volume watcher event if available
                if (typeof (this.queue as any).queueChanges?.volumeChanged === "function") {
                    try { 
                        (this.queue as any).queueChanges.volumeChanged(this.guildId, this); 
                    } catch { /* */ }
                }
            }

            const track = Object.fromEntries(Object.entries({
                encoded: options.track.encoded,
                identifier: options.track.identifier,
                userData: {
                    ...(typeof options?.track?.requester === "object" ? { requester: this.LavalinkManager.utils.getTransformedRequester(options?.track?.requester || {}) } : {}),
                    ...options.track.userData,
                }
            }).filter(v => typeof v[1] !== "undefined")) as LavalinkPlayOptions["track"];

            if (this.LavalinkManager.options?.advancedOptions?.enableDebugEvents) {
                this.LavalinkManager.emit("debug", DebugEvents.PlayerPlayWithTrackReplace, {
                    state: "log",
                    message: `Player was called to play something, with a specific track provided. Replacing the current Track and resolving the track on trackStart Event.`,
                    functionLayer: "Player > play()",
                });
            }

            return this.node.updatePlayer({
                guildId: this.guildId,
                noReplace: false,
                playerOptions: Object.fromEntries(Object.entries({
                    track,
                    position: options.position ?? undefined,
                    paused: options.paused ?? undefined,
                    endTime: options?.endTime ?? undefined,
                    filters: options?.filters ?? undefined,
                    volume: options.volume ?? this.lavalinkVolume ?? undefined,
                    voice: options.voice ?? undefined,
                }).filter(v => typeof v[1] !== "undefined")) as Partial<LavalinkPlayOptions>,
            });
        }

        if (!this.queue.current && (await this.queue.getTrackCount()) > 0) await queueTrackEnd(this);

        if (this.queue.current && this.LavalinkManager.utils.isUnresolvedTrack(this.queue.current)) {
            if (this.LavalinkManager.options?.advancedOptions?.enableDebugEvents) {
                this.LavalinkManager.emit("debug", DebugEvents.PlayerPlayUnresolvedTrack, {
                    state: "log",
                    message: `Player Play was called, current Queue Song is unresolved, resolving the track.`,
                    functionLayer: "Player > play()",
                });
            }

            try {
                // resolve the unresolved track
                await (this.queue.current as unknown as UnresolvedTrack).resolve(this);

                if (typeof options.track?.userData === "object" && this.queue.current) this.queue.current.userData = {
                    ...(typeof this.queue.current?.requester === "object" ? { requester: this.LavalinkManager.utils.getTransformedRequester(this.queue.current?.requester || {}) as anyObject } : {}),
                    ...this.queue.current?.userData,
                    ...options.track?.userData
                };
            } catch (error) {

                if (this.LavalinkManager.options?.advancedOptions?.enableDebugEvents) {
                    this.LavalinkManager.emit("debug", DebugEvents.PlayerPlayUnresolvedTrackFailed, {
                        state: "error",
                        error: error,
                        message: `Player Play was called, current Queue Song is unresolved, but couldn't resolve it`,
                        functionLayer: "Player > play() > resolve currentTrack",
                    });
                }

                this.LavalinkManager.emit("trackError", this, this.queue.current, error);

                if (options && "clientTrack" in options) delete options.clientTrack;
                if (options && "track" in options) delete options.track;

                // get rid of the current song without shifting the queue, so that the shifting can happen inside the next .play() call when "autoSkipOnResolveError" is true
                await queueTrackEnd(this, true);

                // try to play the next track if possible
                if (this.LavalinkManager.options?.autoSkipOnResolveError === true && (await this.queue.getTrackCount()) > 0) return this.play(options);

                return this;
            }
        }

        if (!this.queue.current) throw new Error(`There is no Track in the Queue, nor provided in the PlayOptions`);

        if (typeof options?.volume === "number" && !isNaN(options?.volume)) {
            this.volume = Math.max(Math.min(options?.volume, 500), 0);
            let vol = Number(this.volume);
            if (this.LavalinkManager.options.playerOptions.volumeDecrementer) vol *= this.LavalinkManager.options.playerOptions.volumeDecrementer;
            this.lavalinkVolume = Math.round(vol);
            options.volume = this.lavalinkVolume;

            // emit volume watcher event if available
            if (typeof (this.queue as any).queueChanges?.volumeChanged === "function") {
                try { 
                    (this.queue as any).queueChanges.volumeChanged(this.guildId, this); 
                } catch { /* */ }
            }
        }

        const finalOptions = Object.fromEntries(Object.entries({
            track: {
                encoded: this.queue.current?.encoded || null,
                // identifier: options.identifier,
                userData: {
                    ...(typeof this.queue.current?.requester === "object" ? { requester: this.LavalinkManager.utils.getTransformedRequester(this.queue.current?.requester || {}) } : {}),
                    ...options?.track?.userData,
                    ...this.queue.current?.userData,
                },
            },
            volume: this.lavalinkVolume,
            position: options?.position ?? 0,
            endTime: options?.endTime ?? undefined,
            filters: options?.filters ?? undefined,
            paused: options?.paused ?? undefined,
            voice: options?.voice ?? undefined
        }).filter(v => typeof v[1] !== "undefined")) as Partial<LavalinkPlayOptions>;

        if ((typeof finalOptions.position !== "undefined" && isNaN(finalOptions.position)) || (typeof finalOptions.position === "number" && (finalOptions.position < 0 || finalOptions.position >= this.queue.current.info.duration))) throw new Error("PlayerOption#position must be a positive number, less than track's duration");
        if ((typeof finalOptions.volume !== "undefined" && isNaN(finalOptions.volume) || (typeof finalOptions.volume === "number" && finalOptions.volume < 0))) throw new Error("PlayerOption#volume must be a positive number");
        if ((typeof finalOptions.endTime !== "undefined" && isNaN(finalOptions.endTime)) || (typeof finalOptions.endTime === "number" && (finalOptions.endTime < 0 || finalOptions.endTime >= this.queue.current.info.duration))) throw new Error("PlayerOption#endTime must be a positive number, less than track's duration");
        if (typeof finalOptions.position === "number" && typeof finalOptions.endTime === "number" && finalOptions.endTime < finalOptions.position) throw new Error("PlayerOption#endTime must be bigger than PlayerOption#position")

        const now = performance.now();

        await this.node.updatePlayer({
            guildId: this.guildId,
            noReplace: (options?.noReplace ?? false),
            playerOptions: finalOptions,
        });

        this.ping.lavalink = Math.round((performance.now() - now) / 10) / 100;
        return this;
    }

    /**
     * Set the Volume for the Player
     * @param volume The Volume in percent
     * @param ignoreVolumeDecrementer If it should ignore the volumedecrementer option
     */
    async setVolume(volume: number, ignoreVolumeDecrementer: boolean = false) {
        volume = Number(volume);

        if (isNaN(volume)) throw new TypeError("Volume must be a number.");

        this.volume = Math.round(Math.max(Math.min(volume, 1000), 0));

        this.lavalinkVolume = Math.round(Math.max(Math.min(Math.round(
            this.LavalinkManager.options.playerOptions.volumeDecrementer && !ignoreVolumeDecrementer
                ? this.volume * this.LavalinkManager.options.playerOptions.volumeDecrementer
                : this.volume), 1000), 0));

        const now = performance.now();
        if (this.LavalinkManager.options.playerOptions.applyVolumeAsFilter) {
            if (this.LavalinkManager.options?.advancedOptions?.enableDebugEvents) {
                this.LavalinkManager.emit("debug", DebugEvents.PlayerVolumeAsFilter, {
                    state: "log",
                    message: `Player Volume was set as a Filter, because LavalinkManager option "playerOptions.applyVolumeAsFilter" is true`,
                    functionLayer: "Player > setVolume()",
                });
            }
            await this.node.updatePlayer({ guildId: this.guildId, playerOptions: { filters: { volume: this.lavalinkVolume / 100 } } });
        } else {
            await this.node.updatePlayer({ guildId: this.guildId, playerOptions: { volume: this.lavalinkVolume } });
        }
        this.ping.lavalink = Math.round((performance.now() - now) / 10) / 100;

        // emit volume watcher event if available
        if (typeof (this.queue as any).queueChanges?.volumeChanged === "function") {
            try { 
                (this.queue as any).queueChanges.volumeChanged(this.guildId, this); 
            } catch { /* */ }
        }

        return this;
    }
    /**
     * Search for a track
     * @param query The query to search for
     * @param requestUser The user that requested the track
     * @param throwOnEmpty If an error should be thrown if no track is found
     * @returns The search result
     */
    async lavaSearch(query: LavaSearchQuery, requestUser: unknown, throwOnEmpty: boolean = false) {
        return this.node.lavaSearch(query, requestUser, throwOnEmpty);
    }
    /**
     * Set the SponsorBlock
     * @param segments The segments to set
     */
    public async setSponsorBlock(segments: SponsorBlockSegment[] = ["sponsor", "selfpromo"]) {
        return this.node.setSponsorBlock(this, segments);
    }
    /**
     * Get the SponsorBlock
     */
    public async getSponsorBlock() {
        return this.node.getSponsorBlock(this);
    }
    /**
     * Delete the SponsorBlock
     */
    public async deleteSponsorBlock() {
        return this.node.deleteSponsorBlock(this);
    }
    /**
     *
     * @param query Query for your data
     * @param requestUser
     */
    async search(query: SearchQuery, requestUser: unknown, throwOnEmpty: boolean = false) {
        const Query = this.LavalinkManager.utils.transformQuery(query);

        if (["bcsearch", "bandcamp"].includes(Query.source) && !this.node.info.sourceManagers.includes("bandcamp")) {
            if (this.LavalinkManager.options?.advancedOptions?.enableDebugEvents) {
                this.LavalinkManager.emit("debug", DebugEvents.BandcampSearchLokalEngine, {
                    state: "log",
                    message: `Player.search was called with a Bandcamp Query, but no bandcamp search was enabled on lavalink, searching with the custom Search Engine.`,
                    functionLayer: "Player > search()",
                });
            }
            return await bandCampSearch(this, Query.query, requestUser);
        }

        return this.node.search(Query, requestUser, throwOnEmpty);
    }

    /**
     * Pause the player
     */
    async pause() {
        if (this.paused && !this.playing) throw new Error("Player is already paused - not able to pause.");
        this.paused = true;
        this.lastPositionChange = null; // needs to removed to not cause issues
        const now = performance.now();
        await this.node.updatePlayer({ guildId: this.guildId, playerOptions: { paused: true } });
        this.ping.lavalink = Math.round((performance.now() - now) / 10) / 100;
        // emit the event
        this.LavalinkManager.emit("playerPaused", this, this.queue.current);
        
        // emit pause/resume watcher event if available
        if (typeof (this.queue as any).queueChanges?.pauseResume === "function") {
            try { 
                (this.queue as any).queueChanges.pauseResume(this.guildId, this); 
            } catch { /* */ }
        }
        
        return this;
    }

    /**
     * Resume the Player
     */
    async resume() {
        if (!this.paused) throw new Error("Player isn't paused - not able to resume.");
        this.paused = false;
        const now = performance.now();
        await this.node.updatePlayer({ guildId: this.guildId, playerOptions: { paused: false } });
        this.ping.lavalink = Math.round((performance.now() - now) / 10) / 100;
        // emit the event
        this.LavalinkManager.emit("playerResumed", this, this.queue.current);
        
        // emit pause/resume watcher event if available
        if (typeof (this.queue as any).queueChanges?.pauseResume === "function") {
            try { 
                (this.queue as any).queueChanges.pauseResume(this.guildId, this); 
            } catch { /* */ }
        }
        
        return this;
    }

    /**
     * Seek to a specific Position
     * @param position
     */
    async seek(position: number) {
        if (!this.queue.current) return undefined;

        position = Number(position);

        if (isNaN(position)) throw new RangeError("Position must be a number.");

        if (!this.queue.current.info.isSeekable || this.queue.current.info.isStream) throw new RangeError("Current Track is not seekable / a stream");

        if (position < 0 || position > this.queue.current.info.duration) position = Math.max(Math.min(position, this.queue.current.info.duration), 0);

        const oldPosition = this.lastPosition;
        const oldStored = typeof (this.queue as any).queueChanges?.seeked === "function" ? await (this.queue as any).utils.toJSON() : null;

        this.lastPositionChange = Date.now();
        this.lastPosition = position;

        const now = performance.now();
        await this.node.updatePlayer({ guildId: this.guildId, playerOptions: { position } });
        this.ping.lavalink = Math.round((performance.now() - now) / 10) / 100;

        // emit seek watcher event if available
        if (typeof (this.queue as any).queueChanges?.seeked === "function") {
            try { 
                (this.queue as any).queueChanges.seeked(this.guildId, this.queue.current, oldPosition, position, this, oldStored, await (this.queue as any).utils.toJSON());
            } catch { /* */ }
        }

        return this;
    }

    /**
     * Set the Repeatmode of the Player
     * @param repeatMode
     */
    async setRepeatMode(repeatMode: RepeatMode) {
        if (!["off", "track", "queue"].includes(repeatMode)) throw new RangeError("Repeatmode must be either 'off', 'track', or 'queue'");
        this.repeatMode = repeatMode;
        
        // emit repeat mode watcher event if available
        if (typeof (this.queue as any).queueChanges?.repeatModeChanged === "function") {
            try { 
                (this.queue as any).queueChanges.repeatModeChanged(this.guildId, this); 
            } catch { /* */ }
        }
        
        return this;
    }

    /**
     * Skip the current song, or a specific amount of songs
     * @param amount provide the index of the next track to skip to
     */
    async skip(skipTo: number = 0, throwError: boolean = true) {
        const trackCount = await this.queue.getTrackCount();
        if (!trackCount && (throwError || (typeof skipTo === "boolean" && skipTo === true))) throw new RangeError("Can't skip more than the queue size");

        if (typeof skipTo === "number" && skipTo > 1) {
            if (skipTo > trackCount) throw new RangeError("Can't skip more than the queue size");
            await this.queue.splice(0, skipTo - 1);
        }

        if (!this.playing && !this.queue.current) return (this.play(), this);

        const now = performance.now();
        this.set("internal_skipped", true);

        await this.node.updatePlayer({ guildId: this.guildId, playerOptions: { track: { encoded: null }, paused: false } });

        this.ping.lavalink = Math.round((performance.now() - now) / 10) / 100;

        return this;
    }

    /**
     * Clears the queue and stops playing. Does not destroy the Player and not leave the channel
     * @returns
     */
    async stopPlaying(clearQueue: boolean = true, executeAutoplay: boolean = false) {
        // use internal_stopPlaying on true, so that it doesn't utilize current loop states. on trackEnd event
        this.set("internal_stopPlaying", true);

        // remove tracks from the queue
        if (clearQueue === true) await this.queue.clearTracks();

        if (executeAutoplay === false) this.set("internal_autoplayStopPlaying", true);
        else this.set("internal_autoplayStopPlaying", undefined);

        const now = performance.now();

        // send to lavalink, that it should stop playing
        await this.node.updatePlayer({ guildId: this.guildId, playerOptions: { track: { encoded: null } } });

        this.ping.lavalink = Math.round((performance.now() - now) / 10) / 100;

        return this;
    }
    /**
     * Switch the player to a different voice channel
     * @param voiceChannelId The ID of the new voice channel to switch to
     * @param selfDeaf Whether the bot should be deafened in the new channel (optional)
     * @param selfMute Whether the bot should be muted in the new channel (optional)
     * @returns The player instance for chaining
     */
    public async switchVoiceChannel(voiceChannelId: string, selfDeaf?: boolean, selfMute?: boolean) {
        if (!voiceChannelId) throw new RangeError("Voice Channel ID is required");

        const oldVoiceChannelId = this.options.voiceChannelId;

        await this.LavalinkManager.options.sendToShard(this.guildId, {
            op: 4,
            d: {
                guild_id: this.guildId,
                channel_id: voiceChannelId,
                self_mute: selfMute ?? this.options.selfMute ?? false,
                self_deaf: selfDeaf ?? this.options.selfDeaf ?? true,
            }
        });

        // Update the options
        this.options.voiceChannelId = voiceChannelId;
        if (typeof selfMute === "boolean") this.options.selfMute = selfMute;
        if (typeof selfDeaf === "boolean") this.options.selfDeaf = selfDeaf;

        this.voiceChannelId = voiceChannelId;

        // Emit an event for voice channel change
        this.LavalinkManager.emit("playerMove", this, oldVoiceChannelId, voiceChannelId);

        return this;
    }
    /**
     * Connects the Player to the Voice Channel
     * @returns
     */
    public async connect(skipVoiceHandshakeWatchdog = false) {
        if (!this.options.voiceChannelId) throw new RangeError("No Voice Channel id has been set. (player.options.voiceChannelId)");

        await this.LavalinkManager.options.sendToShard(this.guildId, {
            op: 4,
            d: {
                guild_id: this.guildId,
                channel_id: this.options.voiceChannelId,
                self_mute: this.options.selfMute ?? false,
                self_deaf: this.options.selfDeaf ?? true,
            }
        });

        this.voiceChannelId = this.options.voiceChannelId;

        // Discord may never answer the op-4; watch for that instead of hanging silently.
        // Skipped when moving nodes: re-connecting to a channel we are already in produces no
        // fresh VOICE_SERVER_UPDATE, so an armed watchdog would always fire and tear down a
        // player whose audio is working fine.
        if (!skipVoiceHandshakeWatchdog) this.armVoiceHandshakeTimeout();

        return this;
    }

    public async changeVoiceState(data: { voiceChannelId?: string, selfDeaf?: boolean, selfMute?: boolean }) {
        if (this.options.voiceChannelId === data.voiceChannelId) throw new RangeError("New Channel can't be equal to the old Channel.");

        await this.LavalinkManager.options.sendToShard(this.guildId, {
            op: 4,
            d: {
                guild_id: this.guildId,
                channel_id: data.voiceChannelId,
                self_mute: data.selfMute ?? this.options.selfMute ?? false,
                self_deaf: data.selfDeaf ?? this.options.selfDeaf ?? true,
            }
        });

        // override the options
        this.options.voiceChannelId = data.voiceChannelId;
        this.options.selfMute = data.selfMute;
        this.options.selfDeaf = data.selfDeaf;

        this.voiceChannelId = data.voiceChannelId;

        return this;
    }

    /**
     * Disconnects the Player from the Voice Channel, but keeps the player in the cache
     * @param force If false it throws an error, if player thinks it's already disconnected
     * @returns
     */
    public async disconnect(force: boolean = false) {
        if (!force && !this.options.voiceChannelId) throw new RangeError("No Voice Channel id has been set. (player.options.voiceChannelId)");

        await this.LavalinkManager.options.sendToShard(this.guildId, {
            op: 4,
            d: {
                guild_id: this.guildId,
                channel_id: null,
                self_mute: false,
                self_deaf: false,
            }
        });

        this.voiceChannelId = null;

        return this;
    }

    /**
     * Destroy the player and disconnect from the voice channel
     */
    public async destroy(reason?: DestroyReasons | string, disconnect: boolean = true) { //  [disconnect -> queue destroy -> cache delete -> lavalink destroy -> event emit]
        if (this.LavalinkManager.options.advancedOptions?.debugOptions.playerDestroy.debugLog) console.log(`Lavalink-Client-Debug | PlayerDestroy [::] destroy Function, [guildId ${this.guildId}] - Destroy-Reason: ${String(reason)}`);

        if (this.get("internal_queueempty")) {
            clearTimeout(this.get("internal_queueempty"));
            this.set("internal_queueempty", undefined);
        }

        if (this.get("internal_destroystatus") === true) {

            if (this.LavalinkManager.options?.advancedOptions?.enableDebugEvents) {
                this.LavalinkManager.emit("debug", DebugEvents.PlayerDestroyingSomewhereElse, {
                    state: "warn",
                    message: `Player is already destroying somewhere else..`,
                    functionLayer: "Player > destroy()",
                });
            }

            if (this.LavalinkManager.options.advancedOptions?.debugOptions.playerDestroy.debugLog) console.log(`Lavalink-Client-Debug | PlayerDestroy [::] destroy Function, [guildId ${this.guildId}] - Already destroying somewhere else..`);
            return;
        }
        this.set("internal_destroystatus", true);
        this.clearVoiceHandshakeTimeout();
        // disconnect player and set VoiceChannel to Null
        if (disconnect) await this.disconnect(true);
        else this.set("internal_destroywithoutdisconnect", true);
        // Destroy the queue
        await this.queue.utils.destroy();
        // delete the player from cache
        this.LavalinkManager.deletePlayer(this.guildId);
        // destroy the player on lavalink side
        await this.node.destroyPlayer(this.guildId);

        if (this.LavalinkManager.options.advancedOptions?.debugOptions.playerDestroy.debugLog) console.log(`Lavalink-Client-Debug | PlayerDestroy [::] destroy Function, [guildId ${this.guildId}] - Player got destroyed successfully`);

        // emit the event
        this.LavalinkManager.emit("playerDestroy", this, reason);
        // return smt
        return this;
    }

    /**
     * Get the current lyrics of the track currently playing on the guild
     * @param guildId The guild id to get the current lyrics for
     * @param skipTrackSource If true, it will not try to get the lyrics from the track source
     * @returns The current lyrics
     * @example
     * ```ts
     * const lyrics = await player.getCurrentLyrics();
     * ```
     */
    public async getCurrentLyrics(skipTrackSource?: boolean) {
        return await this.node.lyrics.getCurrent(this.guildId, skipTrackSource);
    }

    /**
     * Get the lyrics of a specific track
     * @param track The track to get the lyrics for
     * @param skipTrackSource If true, it will not try to get the lyrics from the track source
     * @returns The lyrics of the track
     * @example
     * ```ts
     * const lyrics = await player.getLyrics(player.queue.tracks[0], true);
     * ```
     */
    public async getLyrics(track: Track, skipTrackSource?: boolean) {
        return await this.node.lyrics.get(track, skipTrackSource);
    }

    /**
     * Subscribe to the lyrics event on a specific guild to active live lyrics events
     * @returns The unsubscribe function
     * @example
     * ```ts
     * const lyrics = await player.subscribeLyrics();
     * ```
     */
    public subscribeLyrics() {
        return this.node.lyrics.subscribe(this.guildId);
    }

    /**
     * Unsubscribe from the lyrics event on a specific guild to disable live lyrics events
     * @returns The unsubscribe function
     * @example
     * ```ts
     * const lyrics = await player.unsubscribeLyrics();
     * ```
     */
    public unsubscribeLyrics() {
        return this.node.lyrics.unsubscribe(this.guildId);
    }

    /** Timer that fires if Discord never completes the voice handshake. */
    private voiceHandshakeTimeout?: NodeJS.Timeout;
    /** Node ids that already failed to complete a voice handshake for this player. */
    private failedVoiceNodes: Set<string> = new Set();
    /**
     * Incremented on every arm/clear of the voice watchdog. A timeout callback compares the
     * generation it captured against this; a mismatch means the handshake it was watching is
     * already resolved or superseded, so the callback is stale and must do nothing.
     * (Testing `voice.endpoint` instead would break on reconnects, where a stale endpoint from
     * the previous session is still set.)
     */
    private voiceHandshakeGeneration = 0;

    /**
     * Arm the voice-handshake watchdog.
     *
     * `connect()` only fires the gateway op-4 and returns - Discord may never answer
     * with a VOICE_SERVER_UPDATE (dead edge, gateway hiccup, bad node), leaving the
     * player silently stuck with no audio and no error. If nothing arrives in time,
     * {@link onVoiceHandshakeTimeout} moves the player to another node and retries.
     *
     * Cleared by {@link clearVoiceHandshakeTimeout} as soon as the handshake lands.
     */
    public armVoiceHandshakeTimeout(): void {
        const opts = this.LavalinkManager.options?.playerOptions?.onVoiceTimeout;
        const timeoutMs = opts?.timeoutMs ?? 15_000;
        if (!(timeoutMs > 0)) return;

        this.clearVoiceHandshakeTimeout();
        const generation = ++this.voiceHandshakeGeneration;
        this.voiceHandshakeTimeout = setTimeout(() => {
            this.voiceHandshakeTimeout = undefined;
            if (generation !== this.voiceHandshakeGeneration) return; // superseded
            void this.onVoiceHandshakeTimeout(generation);
        }, timeoutMs);
        // never keep the process alive just for this watchdog
        this.voiceHandshakeTimeout.unref?.();
    }

    /** Cancel the voice-handshake watchdog (handshake completed, or player is going away). */
    public clearVoiceHandshakeTimeout(): void {
        // bump unconditionally: a callback already queued on the event loop must be
        // invalidated even when the timer handle itself is gone
        this.voiceHandshakeGeneration++;
        if (!this.voiceHandshakeTimeout) return;
        clearTimeout(this.voiceHandshakeTimeout);
        this.voiceHandshakeTimeout = undefined;
    }

    /**
     * Forget which nodes failed a handshake and how many attempts were spent.
     * Called on a successful handshake so blame is per-connect-episode, not per player
     * lifetime - otherwise one transient slow handshake poisons routing forever.
     */
    /**
     * Marks the handshake for the current connect episode as completed. Recorded as the
     * generation value so a later episode (reconnect) is distinguishable from this one -
     * testing `voice.endpoint` alone cannot do that, because it persists across reconnects.
     */
    public markVoiceHandshakeComplete(): void {
        this.set("internal_voiceHandshakeDoneGen", this.voiceHandshakeGeneration);
    }

    public resetVoiceFailureState(): void {
        this.failedVoiceNodes.clear();
        this.set("internal_voiceTimeoutAttempts", undefined);
    }

    /**
     * Handle a voice handshake that never completed: blame the current node, move to
     * the next best one that hasn't failed yet, and retry. Destroys the player once
     * every attempt is exhausted (unless `destroyOnFail` is disabled).
     */
    private async onVoiceHandshakeTimeout(generation: number): Promise<void> {
        // a destroy, a disconnect, or a node change in flight makes this moot
        if (this.get("internal_destroystatus") === true) return;
        if (!this.voiceChannelId) return;
        if (this.get("internal_nodeChanging") === true) return;
        if (generation !== this.voiceHandshakeGeneration) return;
        // Never touch a player that is demonstrably fine. This watchdog exists for a handshake
        // that never happened - if audio is flowing, the connection works and tearing it down
        // would CAUSE the outage it is meant to detect.
        // NOTE: deliberately NOT testing voice.endpoint/token/sessionId - those persist from the
        // previous session across a reconnect, so testing them would make this dead code on every
        // path except a brand-new player's first connect. The generation check above already
        // invalidates a watchdog whose handshake landed.
        if (this.playing || this.connected) return;
        // The decisive check: did the handshake for THIS connect episode already land? A slow
        // VOICE_SERVER_UPDATE (busy gateway, large guild) still arrives - it is just late - and a
        // player mid-connect legitimately has playing=false and connected=false, because
        // `connected` only becomes true once Lavalink pushes a playerUpdate, which cannot happen
        // before the handshake. Without this, the watchdog tears down healthy connecting players.
        if (this.get("internal_voiceHandshakeDoneGen") === this.voiceHandshakeGeneration) return;
        // Voice data present with no newer arm means the handshake completed and nothing has
        // re-connected since - also healthy.
        if (this.voice.endpoint && this.voice.token && this.voice.sessionId
            && (this.get("internal_voiceHandshakeDoneGen") as number ?? -1) >= 0) return;

        const opts = this.LavalinkManager.options?.playerOptions?.onVoiceTimeout;
        const maxAttempts = opts?.maxAttempts ?? 2;
        const attempts = (this.get("internal_voiceTimeoutAttempts") as number ?? 0) + 1;
        this.set("internal_voiceTimeoutAttempts", attempts);

        this.failedVoiceNodes.add(this.node.id);

        if (this.LavalinkManager.options?.advancedOptions?.enableDebugEvents) {
            this.LavalinkManager.emit("debug", DebugEvents.PlayerChangeNode, {
                state: "warn",
                message: `No VOICE_SERVER_UPDATE within ${opts?.timeoutMs ?? 15_000}ms on node "${this.node.id}" (attempt ${attempts}/${maxAttempts})`,
                functionLayer: "Player > onVoiceHandshakeTimeout()",
            });
        }

        if (attempts < maxAttempts && (opts?.switchNode ?? true)) {
            const next = this.LavalinkManager.nodeManager.getOptimalNode(
                this.options.vcRegion, "players", this.failedVoiceNodes,
            );
            // only worth retrying elsewhere - the same node just failed us
            if (next && next.id !== this.node.id) {
                // take the same mutex changeNode() uses, so the two can't both write this.node
                this.set("internal_nodeChanging", true);
                try {
                    // no voice data yet, so changeNode() would throw - swap directly.
                    // Only tear down the old side when this player never established audio;
                    // guarded above, but re-checked here because of the awaits in between.
                    // Re-check BEFORE the destructive call: a slow-but-healthy handshake can land
                    // while we sit here, and deleting then would kill a player that just started
                    // streaming. Checked again after, since the await is another window.
                    if (generation !== this.voiceHandshakeGeneration || this.get("internal_destroystatus") === true) return;
                    if (this.node.connected && !this.playing && !this.connected) {
                        await this.node.destroyPlayer(this.guildId).catch(() => null);
                    }
                    if (generation !== this.voiceHandshakeGeneration || this.get("internal_destroystatus") === true) return;
                    this.node = next;
                    this.set("internal_nodeChanging", undefined);
                    // arm explicitly: connect()'s default would re-arm on an op-4 that Discord
                    // answers with nothing when the bot is already in the channel
                    await this.connect(true);
                    this.armVoiceHandshakeTimeout();
                    return;
                } catch (error) {
                    if (this.LavalinkManager.options?.advancedOptions?.enableDebugEvents) {
                        this.LavalinkManager.emit("debug", DebugEvents.PlayerChangeNode, {
                            state: "error",
                            error: error,
                            message: `Failed to retry voice handshake on node "${next.id}"`,
                            functionLayer: "Player > onVoiceHandshakeTimeout()",
                        });
                    }
                } finally {
                    this.set("internal_nodeChanging", undefined);
                }
            }
        }

        // always signal, even when we leave the player alive - otherwise a stuck player
        // is invisible in the default (non-destroying) configuration
        this.LavalinkManager.emit("playerVoiceTimeout", this, this.node.id, attempts);
        if (opts?.destroyOnFail ?? false) {
            await this.destroy(DestroyReasons.LavalinkNoVoice).catch(() => null);
        }
    }

    /**
     * Re-route this player to the optimal node for a region that was only learned
     * at connect time (i.e. the voice channel's region is "Automatic", so
     * `rtcRegion` was null when the player was created).
     *
     * Does nothing when the player already sits on the optimal node, when it is
     * already playing (moving mid-track would interrupt audio), or when another
     * node change is in flight. Failures are non-fatal — the player simply stays
     * on its current node.
     *
     * @param region The region resolved from the VOICE_SERVER_UPDATE endpoint
     * @returns The node id the player ended up on, and why it did not move (if it didn't)
     */
    public async rerouteToRegion(region: string): Promise<{ nodeId: string; moved: boolean; reason?: "already-optimal" | "playing" | "changing" | "failed" }> {
        if (this.get("internal_nodeChanging") === true) return { nodeId: this.node.id, moved: false, reason: "changing" };

        // Resolve the target node BEFORE the playing check: when the node is already optimal
        // there is nothing to move, and reporting "playing" there would be misleading.
        const optimal = this.LavalinkManager.nodeManager.getOptimalNode(region);
        if (!optimal || optimal.id === this.node.id) return { nodeId: this.node.id, moved: false, reason: "already-optimal" };

        // A move mid-track costs a short audio gap. But a region change has already interrupted
        // voice, so moving then is usually free - hence rerouteWhilePlaying defaults to true.
        if ((this.playing || this.queue.current) && this.LavalinkManager.options?.playerOptions?.rerouteWhilePlaying === false) {
            return { nodeId: this.node.id, moved: false, reason: "playing" };
        }

        if (this.LavalinkManager.options?.advancedOptions?.enableDebugEvents) {
            this.LavalinkManager.emit("debug", DebugEvents.PlayerChangeNode, {
                state: "log",
                message: `Auto voice region resolved to "${region}", re-routing player from "${this.node.id}" to "${optimal.id}"`,
                functionLayer: "Player > rerouteToRegion()",
            });
        }

        try {
            return { nodeId: await this.changeNode(optimal), moved: true };
        } catch (error) {
            if (this.LavalinkManager.options?.advancedOptions?.enableDebugEvents) {
                this.LavalinkManager.emit("debug", DebugEvents.PlayerChangeNode, {
                    state: "warn",
                    error: error,
                    message: `Failed to re-route player to "${optimal.id}" for resolved region "${region}", staying on "${this.node.id}"`,
                    functionLayer: "Player > rerouteToRegion()",
                });
            }
            return { nodeId: this.node.id, moved: false, reason: "failed" };
        }
    }

    /**
     * Move the player on a different Audio-Node
     * @param newNode New Node / New Node Id
     * @param checkSources If it should check if the sources are supported by the new node @default true
     * @return The new Node Id
     * @example
     * ```ts
     * const changeNode = await player.changeNode(newNode, true);
     * ```
     */
    public async changeNode(newNode: LavalinkNode | string, checkSources: boolean = true) {
        const updateNode = typeof newNode === "string" ? this.LavalinkManager.nodeManager.nodes.get(newNode) : newNode;
        if (!updateNode) throw new Error("Could not find the new Node");
        if (!updateNode.connected) throw new Error("The provided Node is not active or disconnected");
        if (this.node.id === updateNode.id) throw new Error("Player is already on the provided Node");
        if (this.get("internal_nodeChanging") === true) throw new Error("Player is already changing the node please wait");
        if (checkSources) {
            const isDefaultSource = (): boolean => { // check if defaultSearchPlatform is enabled on newNode
                try {
                    this.LavalinkManager.utils.validateSourceString(updateNode, this.LavalinkManager.options.playerOptions.defaultSearchPlatform);
                    return true;
                } catch { return false }
            };
            if (!isDefaultSource()) throw new RangeError(`defaultSearchPlatform "${this.LavalinkManager.options.playerOptions.defaultSearchPlatform}" is not supported by the newNode`);
            const queueTracks = await this.queue.getTracks();
            if (this.queue.current || queueTracks.length) { // Check if all queued track sources are supported by the new node
                const trackSources = new Set([this.queue.current, ...queueTracks].map(track => track.info.sourceName));
                const missingSources = [...trackSources].filter(
                    source => !updateNode.info.sourceManagers.includes(source));
                if (missingSources.length)
                    throw new RangeError(`Sources missing for Node ${updateNode.id}: ${missingSources.join(', ')}`)
            }
        }

        if (this.LavalinkManager.options?.advancedOptions?.enableDebugEvents) {
            this.LavalinkManager.emit("debug", DebugEvents.PlayerChangeNode, {
                state: "log",
                message: `Player.changeNode() was executed, trying to change from "${this.node.id}" to "${updateNode.id}"`,
                functionLayer: "Player > changeNode()",
            });
        }

        const data = await this.toJSON();
        const currentTrack = this.queue.current;
        if (!this.voice.endpoint ||
            !this.voice.sessionId ||
            !this.voice.token)
            throw new Error("Voice Data is missing, can't change the node");
        const oldNode = this.node;
        this.set("internal_nodeChanging", true); // This will stop execution of trackEnd or queueEnd event while changing the node
        const now = performance.now();
        try {
            // Build the player on the new node FIRST, and only tear the old one down once the new
            // side has accepted it. Destroying first means any failure below (REST hiccup, shard
            // reconnecting, node info not yet fetched) leaves the player on no node at all - a
            // permanently silent player with no recovery path.
            this.node = updateNode;
            // node move, not a fresh handshake - see connect()
            await this.connect(true);
            // node.connected only means the socket is open; info is fetched slightly later, and
            // setSponsorBlock() dereferences this.info.plugins without a guard
            const hasSponsorBlock = this.node.info?.plugins?.length
                ? this.node.info.plugins.find(v => v.name === "sponsorblock-plugin")
                : undefined;
                if (hasSponsorBlock) {
                    const sponsorBlockCategories = this.get("internal_sponsorBlockCategories");
                    if (Array.isArray(sponsorBlockCategories) && sponsorBlockCategories.length) {
                        await this.setSponsorBlock(sponsorBlockCategories).catch(error => {
                            if (this.LavalinkManager.options?.advancedOptions?.enableDebugEvents) {
                                this.LavalinkManager.emit("debug", DebugEvents.PlayerChangeNode, {
                                    state: "error",
                                    error: error,
                                    message: `Player > changeNode() Unable to set SponsorBlock Segments`,
                                    functionLayer: "Player > changeNode()",
                                });
                            }
                        });
                    } else {
                        await this.setSponsorBlock().catch(error => {
                            if (this.LavalinkManager.options?.advancedOptions?.enableDebugEvents) {
                                this.LavalinkManager.emit("debug", DebugEvents.PlayerChangeNode, {
                                    state: "error",
                                    error: error,
                                    message: `Player > changeNode() Unable to set SponsorBlock Segments`,
                                    functionLayer: "Player > changeNode()",
                                });
                            }
                        });
                    }
                }
            // Stop the old node streaming BEFORE the new one starts, or both play into the same
            // voice connection for the duration of the move (audible as the old track continuing
            // over the new one). Pausing is safe: the player still exists on the old node, so a
            // failed move can still be rolled back to it.
            if (oldNode.connected && oldNode.id !== updateNode.id && currentTrack) {
                await oldNode.updatePlayer({
                    guildId: this.guildId,
                    playerOptions: { paused: true },
                }).catch(() => null);
            }

            await this.node.updatePlayer({
                guildId: this.guildId,
                noReplace: false,
                playerOptions: {
                    ...(currentTrack && {
                        track: currentTrack,
                        position: data.lastPosition || 0,
                        volume: this.lavalinkVolume,
                        paused: this.paused,
                    }),
                    voice: {
                        token: this.voice.token,
                        endpoint: this.voice.endpoint,
                        sessionId: this.voice.sessionId,
                        channelId: this.voice.channelId,
                    },
                },
            });
            // the new node now owns the player - safe to tear down the old side. Failure here is
            // cosmetic (an orphaned player on the old node), never a reason to fail the move.
            if (oldNode.connected && oldNode.id !== this.node.id) {
                await oldNode.destroyPlayer(this.guildId).catch(() => null);
            }
            this.filterManager.applyPlayerFilters(); // Apply filters to the new node
            this.ping.lavalink = Math.round((performance.now() - now) / 10) / 100;
            return this.node.id;
        } catch (error) {
            // a failed move must be a no-op, not an outage: the old node still holds the player
            this.node = oldNode;
            if (this.LavalinkManager.options?.advancedOptions?.enableDebugEvents) {
                this.LavalinkManager.emit("debug", DebugEvents.PlayerChangeNode, {
                    state: "error",
                    error: error,
                    message: `Player.changeNode() execution failed, staying on "${oldNode.id}"`,
                    functionLayer: "Player > changeNode()",
                });
            }
            throw new Error(`Failed to change the node: ${error}`);
        } finally {
            this.set("internal_nodeChanging", undefined);
        }
    }

    /**
     * Move the player to a different node. If no node is provided, it will find the least used node that is not the same as the current node.
     * @param node the id of the node to move to
     * @returns the player
     * @throws RangeError if there is no available nodes.
     * @throws Error if the node to move to is the same as the current node.
     */
    public async moveNode(node?: string) {
        try {
            if (!node) node = Array.from(this.LavalinkManager.nodeManager.leastUsedNodes("playingPlayers"))
                .find(n => n.connected && n.options.id !== this.node.options.id).id;
            if (!node || !this.LavalinkManager.nodeManager.nodes.get(node)) throw new RangeError("No nodes are available.");
            if (this.node.options.id === node) return this;
            this.LavalinkManager.emit("debug", DebugEvents.PlayerChangeNode, { state: "log", message: `Player.moveNode() was executed, trying to move from "${this.node.id}" to "${node}"`, functionLayer: "Player > moveNode()" });
            const updateNode = this.LavalinkManager.nodeManager.nodes.get(node);
            if (!updateNode) throw new RangeError("No nodes are available.");
            return await this.changeNode(updateNode);
        } catch (error) {
            throw new Error(`Failed to move the node: ${error}`);
        }
    }

    /** Converts the Player including Queue to a Json state */
    public async toJSON() {
        return {
            guildId: this.guildId,
            options: this.options,
            voiceChannelId: this.voiceChannelId,
            textChannelId: this.textChannelId,
            position: this.position,
            lastPosition: this.lastPosition,
            lastPositionChange: this.lastPositionChange,
            volume: this.volume,
            lavalinkVolume: this.lavalinkVolume,
            repeatMode: this.repeatMode,
            paused: this.paused,
            playing: this.playing,
            createdTimeStamp: this.createdTimeStamp,
            filters: this.filterManager?.data || {},
            equalizer: this.filterManager?.equalizerBands || [],
            nodeId: this.node?.id,
            nodeSessionId: this.node?.sessionId,
            ping: this.ping,
            queue: await this.queue.utils.toJSON(),
        } as PlayerJson
    }
}
