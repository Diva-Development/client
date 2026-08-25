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
    dublin: { lat: 53.35, lon: -6.26 },
    france: { lat: 48.86, lon: 2.35 },
    lisbon: { lat: 38.72, lon: -9.14 },
    marseille: { lat: 43.30, lon: 5.37 },
    brussels: { lat: 50.85, lon: 4.35 },
    copenhagen: { lat: 55.68, lon: 12.57 },
    vienna: { lat: 48.21, lon: 16.37 },
    zurich: { lat: 47.38, lon: 8.54 },
    turkey: { lat: 41.01, lon: 28.98 },
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
    toronto: { lat: 43.65, lon: -79.38 },
    oregon: { lat: 45.84, lon: -119.70 },
    vancouver: { lat: 49.28, lon: -123.12 },
    mexico: { lat: 19.43, lon: -99.13 },
    // South America
    brazil: { lat: -23.55, lon: -46.63 },
    "buenos-aires": { lat: -34.60, lon: -58.38 },
    santiago: { lat: -33.45, lon: -70.67 },
    bogota: { lat: 4.71, lon: -74.07 },
    lima: { lat: -12.05, lon: -77.04 },
    // Middle East / Africa
    dubai: { lat: 25.20, lon: 55.27 },
    dammam: { lat: 26.43, lon: 50.10 },
    "tel-aviv": { lat: 32.07, lon: 34.78 },
    southafrica: { lat: -26.20, lon: 28.05 },
    nigeria: { lat: 6.52, lon: 3.38 },
    kenya: { lat: -1.29, lon: 36.82 },
    // Asia / Oceania
    india: { lat: 19.08, lon: 72.88 },
    mumbai: { lat: 19.08, lon: 72.88 },
    jakarta: { lat: -6.21, lon: 106.85 },
    singapore: { lat: 1.35, lon: 103.82 },
    hongkong: { lat: 22.32, lon: 114.17 },
    japan: { lat: 35.68, lon: 139.69 },
    "south-korea": { lat: 37.57, lon: 126.98 },
    sydney: { lat: -33.87, lon: 151.21 },
    melbourne: { lat: -37.81, lon: 144.96 },
    auckland: { lat: -36.85, lon: 174.76 },
    taiwan: { lat: 25.03, lon: 121.57 },
    thailand: { lat: 13.76, lon: 100.50 },
    malaysia: { lat: 3.14, lon: 101.69 },
    philippines: { lat: 14.60, lon: 120.98 },
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
    // novel Cloudflare edge adopted as a raw airport code (e.g. "yvr") - locate it by
    // airport so it routes to the nearest node instead of the fallback node
    if (AirportCoordinates[key]) return AirportCoordinates[key];
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

/**
 * IATA airport code -> Discord region name.
 *
 * Ported from the server-side `VoiceEndpointClassifier`; keep in sync with it so
 * client-side region labels match server metrics exactly.
 *
 * Note: several codes intentionally share a region (`den`/`dfw`/`ord` -> us-central,
 * `lax`/`sjc`/`phx` -> us-west, `bom`/`maa` -> india), so the mapping is **not
 * reversible** - you cannot recover the airport from the region.
 */
export const AirportRegions: Record<string, string> = {
    ams: "amsterdam", arn: "stockholm", atl: "atlanta", bah: "dammam",
    bom: "india", cdg: "france", cgk: "jakarta", den: "us-central",
    dfw: "us-central", dub: "dublin", dxb: "dubai", ewr: "newark",
    eze: "buenos-aires", fra: "frankfurt", gru: "brazil", hel: "finland",
    hkg: "hongkong", iad: "us-east", icn: "south-korea", jnb: "southafrica",
    lax: "us-west", lhr: "london", maa: "india", mad: "madrid",
    mia: "us-south", mxp: "milan", nrt: "japan", ord: "us-central",
    otp: "bucharest", phx: "us-west", rot: "rotterdam", scl: "santiago",
    sea: "seattle", sin: "singapore", sjc: "us-west", svo: "russia",
    syd: "sydney", tlv: "tel-aviv", waw: "warsaw", yul: "montreal",
    yyz: "toronto",
    // --- additions beyond the server map: edges Discord may serve from, named so
    // they can be claimed in a node's `regions` instead of surfacing as raw codes ---
    yvr: "vancouver", mex: "mexico", iah: "us-south", bog: "bogota",
    lim: "lima", gig: "brazil", lis: "lisbon", vie: "vienna",
    zrh: "zurich", ist: "turkey", los: "nigeria", nbo: "kenya",
    cpt: "southafrica", del: "india", tpe: "taiwan", bkk: "thailand",
    kul: "malaysia", mnl: "philippines", mel: "melbourne", akl: "auckland",
    hnd: "japan", kix: "japan", tpa: "st-pete", pdx: "oregon",
    // observed in production telemetry, previously unnamed
    mrs: "marseille", bru: "brussels", cph: "copenhagen",
};

/**
 * Canonical Discord region names emitted by the classifier.
 * Note `southafrica` has no hyphen while `south-korea` does - inconsistent, but it
 * matches what the server emits, which matters when comparing against its metrics.
 */
export const KnownRegions: Set<string> = new Set([
    "amsterdam", "atlanta", "brazil", "bucharest", "buenos-aires", "dammam", "dubai",
    "dublin", "eu-central", "eu-west", "europe", "finland", "france", "frankfurt",
    "hongkong", "india", "jakarta", "japan", "london", "madrid", "milan", "montreal",
    "mumbai", "newark", "oregon", "rotterdam", "russia", "santiago", "seattle",
    "singapore", "south-korea", "southafrica", "st-pete", "stockholm", "sydney",
    "tel-aviv", "toronto", "us-central", "us-east", "us-south", "us-west", "warsaw",
]);

/** Strips optional "c-" prefix, trailing digits, and an optional trailing hex suffix. */
const RegionPattern = /^(?:c-)?([a-z]+(?:-[a-z]+)*?)\d*(?:-[0-9a-f]+)?$/;
/** Guards adoption of novel tokens so junk hostnames don't become "regions". */
const BoundedToken = /^[a-z][a-z-]{1,20}$/;

/**
 * Approximate coordinates for airport codes seen in Cloudflare voice endpoints.
 *
 * Covers every code in {@link AirportRegions} plus edges Discord may add later.
 * Used to geo-route a **novel** IATA token (one with no {@link AirportRegions}
 * entry, e.g. `yvr`) to the nearest node, instead of dropping it on the fallback
 * node on another continent.
 */
export const AirportCoordinates: Record<string, RegionCoordinates> = {
    // North America
    ewr: { lat: 40.69, lon: -74.17 }, iad: { lat: 38.95, lon: -77.46 },
    atl: { lat: 33.64, lon: -84.43 }, ord: { lat: 41.98, lon: -87.90 },
    dfw: { lat: 32.90, lon: -97.04 }, den: { lat: 39.86, lon: -104.67 },
    mia: { lat: 25.79, lon: -80.29 }, tpa: { lat: 27.98, lon: -82.53 },
    sea: { lat: 47.45, lon: -122.31 }, pdx: { lat: 45.59, lon: -122.60 },
    sjc: { lat: 37.36, lon: -121.93 }, lax: { lat: 33.94, lon: -118.41 },
    phx: { lat: 33.43, lon: -112.01 }, yul: { lat: 45.47, lon: -73.74 },
    yyz: { lat: 43.68, lon: -79.63 }, yvr: { lat: 49.19, lon: -123.18 },
    mex: { lat: 19.44, lon: -99.07 }, iah: { lat: 29.99, lon: -95.34 },
    // South America
    gru: { lat: -23.43, lon: -46.47 }, gig: { lat: -22.81, lon: -43.25 },
    eze: { lat: -34.82, lon: -58.54 }, scl: { lat: -33.39, lon: -70.79 },
    bog: { lat: 4.70, lon: -74.15 }, lim: { lat: -12.02, lon: -77.11 },
    // Europe
    fra: { lat: 50.04, lon: 8.56 }, ams: { lat: 52.31, lon: 4.76 },
    rot: { lat: 51.96, lon: 4.44 }, lhr: { lat: 51.47, lon: -0.45 },
    dub: { lat: 53.43, lon: -6.25 }, cdg: { lat: 49.01, lon: 2.55 },
    mad: { lat: 40.47, lon: -3.56 }, mxp: { lat: 45.63, lon: 8.72 },
    otp: { lat: 44.57, lon: 26.10 }, waw: { lat: 52.17, lon: 20.97 },
    arn: { lat: 59.65, lon: 17.92 }, hel: { lat: 60.32, lon: 24.96 },
    svo: { lat: 55.97, lon: 37.41 }, lis: { lat: 38.77, lon: -9.13 },
    vie: { lat: 48.11, lon: 16.57 }, zrh: { lat: 47.46, lon: 8.55 },
    // Middle East / Africa
    dxb: { lat: 25.25, lon: 55.36 }, bah: { lat: 26.27, lon: 50.63 },
    tlv: { lat: 32.01, lon: 34.89 }, jnb: { lat: -26.13, lon: 28.24 },
    cpt: { lat: -33.97, lon: 18.60 }, los: { lat: 6.58, lon: 3.32 },
    nbo: { lat: -1.32, lon: 36.93 }, ist: { lat: 41.28, lon: 28.75 },
    // Asia / Oceania
    bom: { lat: 19.09, lon: 72.87 }, maa: { lat: 12.99, lon: 80.17 },
    del: { lat: 28.56, lon: 77.10 }, sin: { lat: 1.36, lon: 103.99 },
    hkg: { lat: 22.31, lon: 113.91 }, cgk: { lat: -6.13, lon: 106.66 },
    nrt: { lat: 35.77, lon: 140.39 }, hnd: { lat: 35.55, lon: 139.78 },
    kix: { lat: 34.43, lon: 135.24 }, icn: { lat: 37.46, lon: 126.44 },
    syd: { lat: -33.94, lon: 151.18 }, mel: { lat: -37.67, lon: 144.84 },
    akl: { lat: -37.01, lon: 174.79 }, tpe: { lat: 25.08, lon: 121.23 },
    bkk: { lat: 13.69, lon: 100.75 }, kul: { lat: 2.75, lon: 101.71 },
    mnl: { lat: 14.51, lon: 121.02 },
};

/** Where a voice endpoint is hosted. */
export type VoiceEndpointProvider = "cloudflare" | "discord" | "unknown";

/**
 * Extract the Discord voice region id from a `VOICE_SERVER_UPDATE` endpoint.
 *
 * Handles both endpoint spellings, which normalize to the same region name:
 *  - **Cloudflare**: `c-ewr13-927d9f5c.discord.media` (IATA code) -> `newark`
 *  - **Legacy**: `frankfurt1234.discord.gg` (city name) -> `frankfurt`
 *
 * This is the only way to learn the real region when the voice channel's
 * `rtcRegion` is "Automatic" (`null`), since Discord resolves it at connect time.
 *
 * An unmapped edge is adopted as its raw token (e.g. `yvr`, `bog`) rather than
 * discarded, so new datacenters surface instead of vanishing. Such a token has no
 * coordinates, so routing falls through to the configured fallback node.
 *
 * @param endpoint The endpoint string from VOICE_SERVER_UPDATE (port optional)
 * @returns The region id, or undefined if it can't be parsed
 *
 * @example
 * ```ts
 * getRegionFromVoiceEndpoint("c-ewr13-927d9f5c.discord.media:443"); // "newark"
 * ```
 */
export function getRegionFromVoiceEndpoint(endpoint?: string | null): string | undefined {
    return classifyVoiceEndpoint(endpoint).region;
}

/**
 * Classify a voice endpoint into its region and hosting provider.
 * Mirrors the server-side `VoiceEndpointClassifier` so labels line up with its metrics.
 *
 * @param endpoint The endpoint string from VOICE_SERVER_UPDATE (port optional)
 * @returns The resolved region (undefined if unparseable) and the provider
 *
 * @example
 * ```ts
 * classifyVoiceEndpoint("c-ewr13-927d9f5c.discord.media");
 * // { region: "newark", provider: "cloudflare" }
 * ```
 */
export function classifyVoiceEndpoint(endpoint?: string | null): { region?: string; provider: VoiceEndpointProvider; iata?: string } {
    if (!endpoint || typeof endpoint !== "string") return { region: undefined, provider: "unknown" };

    // strip protocol + port, then take the first hostname label
    const host = endpoint.trim().toLowerCase().replace(/^\w+:\/\//, "").split(":")[0]?.split("/")[0];
    if (!host) return { region: undefined, provider: "unknown" };

    const provider: VoiceEndpointProvider = host.endsWith(".discord.media") ? "cloudflare"
        : host.endsWith(".discord.gg") ? "discord"
            : "unknown";

    const match = RegionPattern.exec(host.split(".")[0]);
    if (!match) return { region: undefined, provider };

    const token = match[1];
    // a 3-letter token in the "c-" form is an airport code; keep it so callers can
    // geo-locate edges that have no AirportRegions entry yet
    const iata = /^[a-z]{3}$/.test(token) ? token : undefined;
    if (AirportRegions[token]) return { region: AirportRegions[token], provider, iata };
    if (KnownRegions.has(token)) return { region: token, provider, iata };
    // adopt a novel token as-is, but only if it looks like a region rather than junk
    if (BoundedToken.test(token)) return { region: token, provider, iata };
    return { region: undefined, provider, iata };
}
