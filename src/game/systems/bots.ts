import { ASSET_KEYS } from '@/lib/common';
import { deserializeCards, SerializedCard } from '@/lib/gameLogic';
import { getParticipants, getState, isHost, PlayerState, setState } from 'playroomkit';
import { PlayerBot } from '@/player/Bot';
import { handleTrickCompletion } from '@/game/systems/tricks';
import type { Game } from '@/game/scenes/Game';

export type BotCapablePlayer = PlayerState & {
    isBot: () => boolean;
    bot?: PlayerBot;
};

export function updateBots(game: Game): void {
    if (!isHost()) return;

    const now = game.time.now;
    const biddingPhase = Boolean(getState('biddingPhase'));
    const currentBidPlayerId = getState('currentBidPlayerId') as string | undefined;
    const currentTurnPlayerId = getState('currentTurnPlayerId') as string | undefined;
    const trickCards = (getState('trickCards') as Array<{ playerId: string; card: SerializedCard }>) ?? [];
    const trumpSuit = getState('trumpSuit') as any;
    const round = (getState('round') as number | undefined) ?? 1;
    const participantCount = Object.keys(getParticipants()).length;

    game.players.forEach((player) => {
        const botPlayer = player as BotCapablePlayer;
        if (!botPlayer.isBot()) return;

        const bot = botPlayer.bot;
        if (!bot) return;

        if (biddingPhase && botPlayer.id === currentBidPlayerId && botPlayer.getState('bid') == null) {
            if (!isBotReady(game, botPlayer.id, now)) return;
            if (game.botPendingAction.get(botPlayer.id)) return;

            game.botPendingAction.set(botPlayer.id, true);
            game.time.delayedCall(game.botTurnDelayMs, () => {
                const hand = (botPlayer.getState('hand') as SerializedCard[]) ?? [];
                const bid = bot.decideBid(hand, trumpSuit, round);
                submitBidForPlayer(game, botPlayer, bid);
                scheduleNextBotAction(game, botPlayer.id, game.time.now);
                game.botPendingAction.set(botPlayer.id, false);
            });
            return;
        }

        if (!biddingPhase && currentTurnPlayerId === botPlayer.id) {
            if (!isBotReady(game, botPlayer.id, now)) return;
            if (game.botPendingAction.get(botPlayer.id)) return;
            const alreadyPlayed = trickCards.some((entry) => entry.playerId === botPlayer.id);
            if (alreadyPlayed) return;

            const hand = (botPlayer.getState('hand') as SerializedCard[]) ?? [];
            if (!hand.length) return;

            const bid = (botPlayer.getState('bid') as number | null) ?? 0;
            const currentTricks = (getState(`tricks_${botPlayer.id}`) as number | undefined) ?? 0;
            const chosen = bot.chooseCard(hand, trickCards, trumpSuit, participantCount, bid, currentTricks);
            if (!chosen) return;

            game.botPendingAction.set(botPlayer.id, true);
            game.time.delayedCall(game.botTurnDelayMs, () => {
                playCardForPlayer(game, botPlayer, chosen);
                scheduleNextBotAction(game, botPlayer.id, game.time.now);
                game.botPendingAction.set(botPlayer.id, false);
            });
        }
    });
}

export function isBotReady(game: Game, playerId: string, now: number): boolean {
    const nextAt = game.botNextActionAt.get(playerId) ?? 0;
    return now >= nextAt;
}

export function scheduleNextBotAction(game: Game, playerId: string, now: number): void {
    const jitter = Math.floor(Math.random() * game.botRandomDelayMs);
    game.botNextActionAt.set(playerId, now + game.botBaseDelayMs + jitter);
}

export function submitBidForPlayer(game: Game, player: PlayerState, bid: number): void {
    const currentBidPlayerId = getState('currentBidPlayerId') as string | undefined;
    if (currentBidPlayerId && currentBidPlayerId !== player.id) return;

    player.setState('bid', bid);
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

export function playCardForPlayer(game: Game, player: PlayerState, card: SerializedCard): void {
    const currentTurnPlayerId = getState('currentTurnPlayerId') as string;
    if (currentTurnPlayerId !== player.id) return;

    const hand = (player.getState('hand') as SerializedCard[]) ?? [];
    const cardIndex = hand.findIndex((handCard) => handCard.suit === card.suit && handCard.value === card.value);

    if (cardIndex === -1) return;

    const updatedHand = [...hand];
    updatedHand.splice(cardIndex, 1);
    player.setState('hand', updatedHand);
    player.setState('handCount', updatedHand.length);

    const existingTrick = (getState('trickCards') as Array<{ playerId: string; card: SerializedCard }> ?? []);
    const updatedTrick = [...existingTrick, { playerId: player.id, card }];

    game.sound.play(ASSET_KEYS.AUDIO_CARD_2, {volume: 0.3});

    setState('trickCards', updatedTrick);
    setState('trickVersion', (getState('trickVersion') ?? 0) + 1);

    const turnOrder = (getState('turnOrder') as string[]) ?? [];
    const participantCount = Object.keys(getParticipants()).length;

    if (updatedTrick.length < participantCount) {
        const turnIndex = getState('turnIndex') ?? 0;
        const nextIndex = (turnIndex + 1) % turnOrder.length;
        const nextPlayerId = turnOrder[nextIndex];

        if (shouldDelayForPlayer(game, nextPlayerId)) {
            game.time.delayedCall(game.botTurnDelayMs, () => {
                setState('turnIndex', nextIndex);
                setState('currentTurnPlayerId', nextPlayerId);
            });
        } else {
            setState('turnIndex', nextIndex);
            setState('currentTurnPlayerId', nextPlayerId);
        }
    } else {
        handleTrickCompletion(game, updatedTrick);
    }
}

export function shouldDelayForPlayer(game: Game, playerId: string): boolean {
    const player = game.players.find((p) => p.id === playerId) as BotCapablePlayer | undefined;
    if (!player || typeof player.isBot !== 'function') return false;
    return player.isBot();
}

export function getCurrentTrickSuit(trickCards: Array<{ playerId: string; card: SerializedCard }>): string | null {
    if (!trickCards.length) return null;
    const first = deserializeCards([trickCards[0].card])[0];
    return first?.suit ?? null;
}
