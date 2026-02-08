import { CARD_SCALE, CARD_WIDTH } from '@/lib/common';

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export type UILayout = {
    width: number;
    height: number;
    shortSide: number;
    longSide: number;
    isMobile: boolean;
    scale: number;
    fontScale: number;
    safeTop: number;
    safeBottom: number;
    safeSide: number;
    centerX: number;
    centerY: number;
    /** Percentage of width */
    pctW: (pct: number) => number;
    /** Percentage of height */
    pctH: (pct: number) => number;
};

export function getUILayout(scene: Phaser.Scene): UILayout {
    const width = scene.scale.width;
    const height = scene.scale.height;
    const shortSide = Math.min(width, height);
    const longSide = Math.max(width, height);
    const isMobile = shortSide < 700 || width < 720;

    const scale = isMobile
        ? clamp(width / 400, 0.8, 1.4)
        : clamp(shortSide / 900, 0.65, 1.1);

    const fontScale = isMobile
        ? clamp(width / 360, 0.95, 1.5)
        : clamp(shortSide / 800, 0.7, 1.2);

    const safeTop = isMobile ? Math.round(height * 0.015) : Math.round(Math.max(12, height * 0.03));
    const safeBottom = isMobile ? Math.round(height * 0.02) : Math.round(Math.max(12, height * 0.04));
    const safeSide = isMobile ? Math.round(width * 0.02) : Math.round(Math.max(12, width * 0.03));

    return {
        width,
        height,
        shortSide,
        longSide,
        isMobile,
        scale,
        fontScale,
        safeTop,
        safeBottom,
        safeSide,
        centerX: width / 2,
        centerY: height / 2,
        pctW: (pct: number) => Math.round(width * pct / 100),
        pctH: (pct: number) => Math.round(height * pct / 100),
    };
}

export function scaleValue(layout: UILayout, value: number, min?: number, max?: number): number {
    const scaled = value * layout.scale;
    return clamp(scaled, min ?? 0, max ?? Number.POSITIVE_INFINITY);
}

export function scaleFont(layout: UILayout, value: number, min?: number, max?: number): number {
    const scaled = value * layout.fontScale;
    return clamp(scaled, min ?? 8, max ?? Number.POSITIVE_INFINITY);
}

export function getCardScale(scene: Phaser.Scene): number {
    const layout = getUILayout(scene);
    if (layout.isMobile) {
        // On mobile, hand cards should be big and readable — target ~22% of screen width
        const targetCardWidth = layout.width * 0.22;
        return targetCardWidth / CARD_WIDTH;
    }
    return CARD_SCALE * layout.scale;
}

/**
 * Scale for trick cards and deck on mobile — close to hand card size
 * but slightly smaller so 4 trick cards fit in the center play area.
 */
export function getTrickCardScale(scene: Phaser.Scene): number {
    const layout = getUILayout(scene);
    if (layout.isMobile) {
        // 24% of screen width — large and readable in the trick area
        const targetCardWidth = layout.width * 0.24;
        return targetCardWidth / CARD_WIDTH;
    }
    return CARD_SCALE * layout.scale;
}
