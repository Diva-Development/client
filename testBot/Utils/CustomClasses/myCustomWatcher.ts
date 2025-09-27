import { QueueChangesWatcher } from "lavalink-client";

import type { BotClient } from "../../types/Client";

// you can make a custom queue watcher for queue logs!
export class myCustomWatcher implements QueueChangesWatcher {
    private client: BotClient;
    constructor(client: BotClient) {
        this.client = client;
    }
    shuffled(guildId, oldStoredQueue, newStoredQueue) {
        console.log(`${this.client.guilds.cache.get(guildId)?.name || guildId}: Queue got shuffled`)
    }
    tracksAdd(guildId, tracks, position, oldStoredQueue, newStoredQueue) {
        console.log(`${this.client.guilds.cache.get(guildId)?.name || guildId}: ${tracks.length} Tracks got added into the Queue at position #${position}`);
    }
    tracksRemoved(guildId, tracks, position, oldStoredQueue, newStoredQueue) {
        console.log(`${this.client.guilds.cache.get(guildId)?.name || guildId}: ${tracks.length} Tracks got removed from the Queue at position #${position}`);
    }
    seeked(guildId, track, oldPosition, newPosition, player, oldStoredQueue, newStoredQueue) {
        const guildName = this.client.guilds.cache.get(guildId)?.name || guildId;
        const trackTitle = track.info.title || "Unknown Track";
        const voiceChannel = this.client.channels.cache.get(player.voiceChannelId)?.name || "Unknown Channel";
        console.log(`${guildName}: Track "${trackTitle}" seeked from ${Math.floor(oldPosition / 1000)}s to ${Math.floor(newPosition / 1000)}s in ${voiceChannel}`);
    }
    volumeChanged(guildId, player) {
        const guildName = this.client.guilds.cache.get(guildId)?.name || guildId;
        const voiceChannel = this.client.channels.cache.get(player.voiceChannelId)?.name || "Unknown Channel";
        console.log(`${guildName}: Volume changed to ${player.volume}% in ${voiceChannel}`);
    }
}
