import { ASSET_KEYS } from '@/lib/common';
import { getCardScale, getTrickCardScale, getUILayout } from '@/lib/layout';
import { deserializeCards, SerializedCard } from '@/lib/gameLogic';
import { getParticipants, getState, setState } from 'playroomkit';
import type { Game } from '@/game/scenes/Game';

export function handleTrickCompletion(game: Game, trick: Array<{ playerId: string; card: SerializedCard }>): void {
    const trumpSuit = getState('trumpSuit') as any;
    const deserializedTrick = trick.map(t => ({
        playerId: t.playerId,
        card: deserializeCards([t.card])[0]
    }));

    const winnerId = game.logic.determineTrickWinner(deserializedTrick, trumpSuit);

    setState('trickWinnerId', winnerId);
    setState('trickWinVersion', (getState('trickWinVersion') ?? 0) + 1);

    game.time.delayedCall(1700, () => {
        setState('trickCards', []);
        setState('trickVersion', (getState('trickVersion') ?? 0) + 1);
        game.isAnimatingTrickWin = false;
        game.lastTrickVersion = getState('trickVersion') ?? 0;

        const currentWins = getState(`tricks_${winnerId}`) ?? 0;
        setState(`tricks_${winnerId}`, currentWins + 1);

        const turnOrder = (getState('turnOrder') as string[]) ?? [];
        const nextWinnerIndex = turnOrder.indexOf(winnerId);
        setState('turnIndex', nextWinnerIndex);
        setState('currentTurnPlayerId', winnerId);

        if (isRoundComplete()) {
            game.time.delayedCall(1600, () => {
                game.showRoundSummary();
            });
        }
    });
}

export function animateTrickWinner(game: Game, winnerId: string): void {
    const anchor = game.playerAnchors[winnerId];

    if (!anchor) return;

    game.isAnimatingTrickWin = true;

    game.sound.play(ASSET_KEYS.AUDIO_TRUMP_MOVE, { volume: 0.3 });

    if (anchor.turnHighlight) {
        anchor.turnHighlight.setAlpha(1);
        game.tweens.add({
            targets: anchor.turnHighlight,
            alpha: 0,
            duration: 900,
            ease: 'Sine.easeInOut'
        });
    }

    if (game.trickSprites.length) {
        const layout = getUILayout(game);
        const shrinkScale = layout.isMobile ? getTrickCardScale(game) * 0.5 : getCardScale(game) * 0.5;
        game.tweens.add({
            targets: game.trickSprites,
            alpha: 0,
            x: anchor.x,
            y: anchor.y,
            scale: shrinkScale,
            duration: 800,
            ease: 'Power2',
            stagger: 80
        });
    }
}

export function syncTrickWinState(game: Game): void {
    const trickWinVersion = (getState('trickWinVersion') as number | undefined) ?? 0;
    if (trickWinVersion !== game.lastTrickWinVersion) {
        game.lastTrickWinVersion = trickWinVersion;
        const winnerId = getState('trickWinnerId') as string | undefined;
        if (winnerId) {
            game.isAnimatingTrickWin = true;
            game.safeDelayedCall(1000, () => animateTrickWinner(game, winnerId));
        }
    }

    const trickCards = (getState('trickCards') as Array<{ playerId: string; card: SerializedCard }>) ?? [];
    if (game.isAnimatingTrickWin && trickCards.length === 0) {
        game.isAnimatingTrickWin = false;
    }
}

export function isRoundComplete(): boolean {
    return Object.values(getParticipants()).every((player) => {
        const count = (player.getState('handCount') as number | undefined) ?? 0;
        return count === 0;
    });
}
