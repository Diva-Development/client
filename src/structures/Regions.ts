/**
 * Geo-aware voice region routing helpers.
 *
 * Discord exposes a voice channel's `rtcRegion` (e.g. "us-east", "rotterdam", "japan").
 * To smart-route a player to the geographically closest Lavalink node we map each
 * known Discord voice region to approximate coordinates and pick the node with the
 * smallest great-circle distance.
 */

/** Latitude / Longitude pair (in degrees) */
export interface RegionCoordinates {
    /** Latitude in degrees */
    lat: number;
    /** Longitude in degrees */
    lon: number;
}

/**
 * Approximate coordinates (lat/lon) for every known Discord voice region id.
 * Values are the rough datacenter / city location Discord routes that region to.
 * Region ids are normalized to lowercase before lookup.
 */
export const DiscordVoiceRegionCoordinates: Record<string, RegionCoordinates> = {
    // Europe
    amsterdam: { lat: 52.37, lon: 4.90 },
    rotterdam: { lat: 51.92, lon: 4.48 },
    frankfurt: { lat: 50.11, lon: 8.68 },
    london: { lat: 51.51, lon: -0.13 },
    madrid: { lat: 40.42, lon: -3.70 },
    milan: { lat: 45.46, lon: 9.19 },
    bucharest: { lat: 44.43, lon: 26.10 },
    warsaw: { lat: 52.23, lon: 21.01 },
    stockholm: { lat: 59.33, lon: 18.07 },
    finland: { lat: 60.17, lon: 24.94 },
    russia: { lat: 55.76, lon: 37.62 },
    "eu-west": { lat: 53.35, lon: -6.26 },
    "eu-central": { lat: 50.11, lon: 8.68 },
    europe: { lat: 50.11, lon: 8.68 },
    // North America
    "us-east": { lat: 39.04, lon: -77.49 },
    "us-central": { lat: 41.88, lon: -87.63 },
    "us-south": { lat: 32.78, lon: -96.80 },
    "us-west": { lat: 45.84, lon: -119.70 },
    newark: { lat: 40.74, lon: -74.17 },
    atlanta: { lat: 33.75, lon: -84.39 },
    "st-pete": { lat: 27.77, lon: -82.64 },
    "santa-clara": { lat: 37.35, lon: -121.96 },
    seattle: { lat: 47.61, lon: -122.33 },
    montreal: { lat: 45.50, lon: -73.57 },
    // South America
    brazil: { lat: -23.55, lon: -46.63 },
    "buenos-aires": { lat: -34.60, lon: -58.38 },
    santiago: { lat: -33.45, lon: -70.67 },
    // Middle East / Africa
    dubai: { lat: 25.20, lon: 55.27 },
    "tel-aviv": { lat: 32.07, lon: 34.78 },
    southafrica: { lat: -26.20, lon: 28.05 },
    // Asia / Oceania
    india: { lat: 19.08, lon: 72.88 },
    singapore: { lat: 1.35, lon: 103.82 },
    hongkong: { lat: 22.32, lon: 114.17 },
    japan: { lat: 35.68, lon: 139.69 },
    "south-korea": { lat: 37.57, lon: 126.98 },
    sydney: { lat: -33.87, lon: 151.21 },
};

/** Coarse aliases for non-standard / shorthand region strings. */
const RegionAliases: Record<string, string> = {
    us: "us-central",
    usa: "us-central",
    eu: "frankfurt",
    asia: "singapore",
    oceania: "sydney",
    africa: "southafrica",
    "south-america": "brazil",
};

/**
 * Resolve a Discord voice region id (or shorthand) to coordinates.
 * Handles casing, the legacy "vip-" prefix and a few common aliases.
 * @param region The region id (e.g. interaction.member.voice.rtcRegion)
 * @returns The coordinates, or undefined if the region is unknown
 */
export function getVoiceRegionCoordinates(region?: string | null): RegionCoordinates | undefined {
    if (!region || typeof region !== "string") return undefined;
    let key = region.toLowerCase().trim();
    if (DiscordVoiceRegionCoordinates[key]) return DiscordVoiceRegionCoordinates[key];
    if (key.startsWith("vip-")) key = key.slice(4);
    if (DiscordVoiceRegionCoordinates[key]) return DiscordVoiceRegionCoordinates[key];
    if (RegionAliases[key]) return DiscordVoiceRegionCoordinates[RegionAliases[key]];
    return undefined;
}

/**
 * Great-circle (haversine) distance between two coordinates in kilometers.
 * @param a First coordinate
 * @param b Second coordinate
 * @returns Distance in kilometers
 */
export function haversineDistance(a: RegionCoordinates, b: RegionCoordinates): number {
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const earthRadiusKm = 6371;
    const dLat = toRad(b.lat - a.lat);
    const dLon = toRad(b.lon - a.lon);
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    return earthRadiusKm * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Compute the average (centroid) coordinate of a list of region ids.
 * Unknown regions are ignored. Returns undefined when none resolve.
 * @param regions Region ids to average
 * @returns The centroid coordinate, or undefined
 */
export function averageRegionCoordinates(regions?: string[]): RegionCoordinates | undefined {
    if (!regions?.length) return undefined;
    const coords = regions.map(getVoiceRegionCoordinates).filter((c): c is RegionCoordinates => !!c);
    if (!coords.length) return undefined;
    const sum = coords.reduce((acc, c) => ({ lat: acc.lat + c.lat, lon: acc.lon + c.lon }), { lat: 0, lon: 0 });
    return { lat: sum.lat / coords.length, lon: sum.lon / coords.length };
}
