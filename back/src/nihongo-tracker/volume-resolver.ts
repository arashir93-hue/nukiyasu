export type VolumeNumberSource = "detected" | "position" | "manual";

export interface VolumeResolution {
    volumeNumber:number;
    source:VolumeNumberSource;
}

/**
 * Detects an explicitly marked volume number. Bare numbers are deliberately
 * ignored so numbers that belong to a title (for example "86 Eighty Six")
 * cannot be mistaken for a volume.
 */
export function detectVolumeNumber(name:string | undefined):number | undefined {
    if (!name) return undefined;

    const match = name.match(/\b(?:v|vol(?:\.|ume|umen)?)\s*(\d+(?:\.\d+)?)(?!\d)/i);
    if (!match) return undefined;

    const number = Number(match[1]);
    return Number.isFinite(number) && number > 0 ? number : undefined;
}

export function resolveVolumeNumber(options:{
    sortName?:string;
    visibleName?:string;
    position:number;
    override?:number;
}):VolumeResolution {
    if (options.override !== undefined && Number.isFinite(options.override) && options.override > 0) {
        return {volumeNumber:options.override, source:"manual"};
    }

    const detected = detectVolumeNumber(options.sortName) ?? detectVolumeNumber(options.visibleName);
    if (detected !== undefined) return {volumeNumber:detected, source:"detected"};

    return {volumeNumber:Math.max(1, options.position), source:"position"};
}
