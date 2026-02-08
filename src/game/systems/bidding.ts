import { createBidBubble, createBidModal } from '@/lib/ui';
import { getParticipants, getState, isHost, myPlayer, setState } from 'playroomkit';
import { deserializeCards, SerializedCard } from '@/lib/gameLogic';
import { ASSET_KEYS } from '@/lib/common';
import type { Game } from '@/game/scenes/Game';
import { shouldDelayForPlayer } from '@/game/systems/bots';

export function updateBiddingUI(game: Game): void {
    const biddingPhase = Boolean(getState('biddingPhase'));
    const localId = myPlayer().id;
    const currentBidPlayerId = getState('currentBidPlayerId') as string | undefined;
    const bidsVersion = (getState('bidsVersion') as number | undefined) ?? 0;
    const trickVersion = (getState('trickVersion') as number | undefined) ?? 0;
    const trickCards = (getState('trickCards') as Array<{ playerId: string; card: SerializedCard }>) ?? [];
    const hasTrickStarted = trickCards.length > 0;

    const shouldUpdate =
        biddingPhase !== game.lastBiddingPhase ||
        currentBidPlayerId !== game.lastBidPlayerId ||
        bidsVersion !== game.lastBidsVersion ||
        trickVersion !== game.lastBidTrickVersion;

    if (!shouldUpdate) {
        return;
    }

    if (biddingPhase && currentBidPlayerId === localId && myPlayer().getState('bid') == null) {
        if (!game.bidModal) {
            const maxBid = game.myHand.length;
            game.bidModal = createBidModal(game, maxBid, (bid) => submitBid(game, bid));
        }
    } else if (game.bidModal) {
        game.bidModal.destroy();
        game.bidModal = undefined;
    }

    setHandDisabledForBid(game, Boolean(game.bidModal));

    Object.values(getParticipants()).forEach((player) => {
        const bid = player.getState('bid') as number | null;
        const previous = game.lastBids[player.id];
        const anchor = game.playerAnchors[player.id];
        const tricks = (getState(`tricks_${player.id}`) as number | undefined) ?? 0;

        if (anchor?.bidText) {
            anchor.bidText.setText(bid == null ? '--' : `${tricks}/${bid}`);
        }

        if (anchor?.scoreText) {
            const score = (player.getState('score') as number | undefined) ?? 0;
            anchor.scoreText.setText(`${score}`);
        }

        if (bid == null && previous != null) {
            game.bidBubbles[player.id]?.destroy();
            game.bidBubbles[player.id] = undefined as unknown as Phaser.GameObjects.Container;
        }

        if (hasTrickStarted && game.bidBubbles[player.id]) {
            game.bidBubbles[player.id].destroy();
            game.bidBubbles[player.id] = undefined as unknown as Phaser.GameObjects.Container;
        }

        if (!hasTrickStarted && game.lastBids[player.id] !== bid && bid != null && anchor) {
            game.sound.play(ASSET_KEYS.AUDIO_BUTTON_2, {volume: 0.3});
            game.bidBubbles[player.id] = createBidBubble(game, anchor, bid, game.bidBubbles[player.id]);
        }

        game.lastBids[player.id] = bid ?? null;
    });

    game.lastBidsVersion = bidsVersion;
    game.lastBiddingPhase = biddingPhase;
    game.lastBidPlayerId = currentBidPlayerId;
    game.lastBidTrickVersion = trickVersion;
}

export function submitBid(game: Game, bid: number): void {
    if (hasPendingAction()) {
        return;
    }

    myPlayer().setState('bid', bid);

    if (!isHost()) {
        queuePendingAction(game, { type: 'bid', bid });
        return;
    }

    setState('bidsVersion', (getState('bidsVersion') ?? 0) + 1);

    const order = (getState('biddingOrder') as string[]) ?? [];
    const currentIndex = getState('biddingIndex') ?? 0;
    const nextIndex = currentIndex + 1;

    if (nextIndex >= order.length) {
        setState('biddingPhase', false);
        setState('currentBidPlayerId', null);
        return;
    }

    const nextPlayerId = order[nextIndex];
    if (shouldDelayForPlayer(game, nextPlayerId)) {
        game.time.delayedCall(game.botBidDelayMs, () => {
            setState('biddingIndex', nextIndex);
            setState('currentBidPlayerId', nextPlayerId);
        });
    } else {
        setState('biddingIndex', nextIndex);
        setState('currentBidPlayerId', nextPlayerId);
    }
}

export function setHandDisabledForBid(game: Game, disabled: boolean): void {
    game.isHandDisabledForBid = disabled;
    setHandDisabled(game, disabled, true);
}

export function setHandDisabledForDelay(game: Game, disabled: boolean): void {
    game.isHandDisabledForDelay = disabled;
    setHandDisabled(game, disabled, false);
}

export function setHandDisabled(game: Game, disabled: boolean, applyTint: boolean): void {
    if (disabled) {
        game.handSprites.forEach((sprite) => sprite.markAsDisabled(applyTint));
        return;
    }

    if (game.isHandDisabledForBid || game.isHandDisabledForDelay) {
        return;
    }

    game.handSprites.forEach((sprite) => {
        sprite.clearTint();
        sprite.enableInteractions();
    });
    attachHandInteractions(game);
    updatePlayableCards(game);
}

export function attachHandInteractions(game: Game): void {
    game.handSprites.forEach((sprite) => {
        sprite.removeAllListeners('card-drop');
        sprite.removeAllListeners('pointerdown');
        sprite.on('card-drop', () => game.playCard(sprite));
        sprite.on('pointerdown', () => game.playCard(sprite));
    });
}

export function updatePlayableCards(game: Game): void {
    if (!game.handSprites.length) return;
    if (game.isHandDisabledForBid || game.isHandDisabledForDelay) return;

    const currentTurnPlayerId = getState('currentTurnPlayerId') as string | undefined;
    const localId = myPlayer().id;

    if (currentTurnPlayerId && currentTurnPlayerId !== localId) {
        game.handSprites.forEach((sprite) => sprite.markAsDisabled(true));
        return;
    }

    const trickCards = (getState('trickCards') as Array<{ playerId: string; card: SerializedCard }>) ?? [];
    const deserializedTrick = trickCards.map((entry) => ({
        playerId: entry.playerId,
        card: deserializeCards([entry.card])[0]
    }));

    game.handSprites.forEach((sprite) => {
        const playable = game.logic.checkIfCardIsPlayable(sprite.cardData, game.myHand, deserializedTrick);
        if (!playable) {
            sprite.markAsDisabled(true);
        } else {
            sprite.clearTint();
            sprite.enableInteractions();
        }
    });

    attachHandInteractions(game);
}

export function hasPendingAction(): boolean {
    const pending = myPlayer().getState('pendingAction') as PendingAction | null | undefined;
    return Boolean(pending);
}

export function queuePendingAction(game: Game, action: PendingActionInput): void {
    game.localActionSeq += 1;
    myPlayer().setState('pendingAction', { ...action, seq: game.localActionSeq });
}

export type PendingAction =
    | { type: 'playCard'; card: SerializedCard; seq: number }
    | { type: 'bid'; bid: number; seq: number };

export type PendingActionInput =
    | { type: 'playCard'; card: SerializedCard }
    | { type: 'bid'; bid: number };
