import { Scene } from 'phaser';
import { createBidBubble, createBidModal, createDrawPile, createMenuButtons, createOtherPlayersUI, createPlayerUI, moveDrawPileToTopLeft, PlayerAnchor, renderPlayerHand, renderTrickCards, renderTrumpCardNextToDeck } from '@/lib/ui';
import { CARD_SCALE } from '@/lib/common';
import { Card, createDeck, shuffleDeck } from '@/lib/deck';
import { getParticipants, getState, isHost, myPlayer, onPlayerJoin, PlayerState, setState } from 'playroomkit';
import { deserializeCards, GameLogic, serializeCards, SerializedCard, delay } from '@/lib/gameLogic';
import { CardSprite } from '@/lib/cardSprite';
import { PlayerBot } from '@/player/Bot';

type BotCapablePlayer = PlayerState & {
    isBot: () => boolean;
    bot?: PlayerBot;
};

let players: PlayerState[] = [];

onPlayerJoin(async (player) => {
    const existing = players.find(p => p.id === player.id);
    if (!existing) {
        players.push(player);
    }
})

export class Game extends Scene
{
    // -- Game State --
    private deck: Card[];
    private logic: GameLogic;
    private myHand: Card[] = [];

    // -- Visual Elements --
    private handSprites: CardSprite[] = [];
    private trickSprites: CardSprite[] = [];
    private drawPileCards: Phaser.GameObjects.Image[] = [];
    private trumpCardSprite?: CardSprite;

    // -- UI & Layout --
    private playerAnchors: Record<string, PlayerAnchor> = {};
    private bidModal?: Phaser.GameObjects.Container;
    private bidBubbles: Record<string, Phaser.GameObjects.Container> = {};
    private deckAnchor = { x: 0, y: 0 };
    private pileX = 0;
    private pileY = 0;

    // -- State Tracking --
    private lastDealId = 0;
    private lastTurnPlayerId?: string;
    private lastTrickVersion = 0;
    private lastBids: Record<string, number | null> = {};
    private botNextActionAt: Map<string, number> = new Map();
    private botBaseDelayMs = 500;
    private botRandomDelayMs = 400;
    private botPendingAction: Map<string, boolean> = new Map();
    private botTurnDelayMs = 500;
    private botBidDelayMs = 200;
    private isAnimatingTrickWin = false;
    private isHandDisabledForBid = false;

    constructor() { super('Game'); }

    create ()
    {
        this.cameras.main.setBackgroundColor('#074924');
        this.deck = shuffleDeck(createDeck());
        this.runGameSetup(this);
    }

    runGameSetup(scene: Phaser.Scene): void {
        const localPlayer = myPlayer();
        this.logic = new GameLogic(this.deck, players.map((player) => player.id));

        if (isHost()) {
            setState('hostId', localPlayer.id);
        }

        const { drawButton, pileX, pileY, drawPileCards } = createDrawPile(scene, async () => {
            if (!isHost()) {
                console.log('[Deal] Non-host clicked draw; ignored.');
                return;
            }

            const cardsPerPlayer = this.logic.getCardsPerPlayerForRound();
            const hands = this.logic.drawCards(cardsPerPlayer);
            const trumpSuit = this.logic.getTrumpSuit();
            const trumpCard = this.logic.getRemainingDeck()[0];

            console.log('[Deal] Host dealing', {
                round: this.logic.getRound(),
                cardsPerPlayer,
                trumpSuit,
                remainingDeck: this.logic.getRemainingDeck().length
            });

            players.forEach((player) => {
                const hand = hands?.get(player.id) ?? [];
                player.setState('hand', serializeCards(hand));
                player.setState('handCount', hand.length);
                player.setState('bid', null);
                console.log('[Deal] Set player hand', { playerId: player.id, count: hand.length });
            });

            setState('round', this.logic.getRound());
            setState('cardsPerPlayer', cardsPerPlayer);
            setState('trumpSuit', trumpSuit);
            setState('trumpCard', trumpCard ? serializeCards([trumpCard])[0] : null);
            const hostId = getState('hostId') ?? localPlayer.id;
            const turnOrder = this.getTurnOrder(players.map((player) => player.id), hostId);
            setState('turnOrder', turnOrder);
            setState('turnIndex', 0);
            setState('currentTurnPlayerId', hostId);
            setState('biddingOrder', turnOrder);
            setState('biddingIndex', 0);
            setState('currentBidPlayerId', hostId);
            const nextDealId = (getState('dealId') ?? 0) + 1;
            setState('dealId', nextDealId);

            console.log('[Deal] State committed', { dealId: nextDealId });

            this.deckAnchor = moveDrawPileToTopLeft(this, this.drawPileCards);
            this.trumpCardSprite = renderTrumpCardNextToDeck(this, trumpCard ?? null, this.trumpCardSprite, this.deckAnchor);

            drawButton.destroy();

            setState('biddingPhase', false);
            await delay(3000);
            setState('biddingPhase', true);
        });

        this.pileX = pileX;
        this.pileY = pileY;
        this.drawPileCards = drawPileCards;

        const localAnchor = createPlayerUI(scene, localPlayer);
        const otherAnchors = createOtherPlayersUI(scene, players, localPlayer.id);
        this.playerAnchors = { [localPlayer.id]: localAnchor, ...otherAnchors };
        createMenuButtons(scene);
    }

    update(): void {
        const currentTurnPlayerId = getState('currentTurnPlayerId') as string | undefined;
        if (currentTurnPlayerId && currentTurnPlayerId !== this.lastTurnPlayerId) {
            this.lastTurnPlayerId = currentTurnPlayerId;

            Object.entries(this.playerAnchors).forEach(([playerId, anchor]) => {
                anchor.turnHighlight?.setAlpha(playerId === currentTurnPlayerId ? 1 : 0);
            });
        }

        const dealId = getState('dealId') ?? 0;
        if (dealId !== this.lastDealId) {
            console.log('[Deal] Detected new dealId', { previous: this.lastDealId, current: dealId });
            this.lastDealId = dealId;
            const handState = myPlayer().getState('hand') as SerializedCard[] | undefined;
            if (!handState || !handState.length) {
                console.log('[Deal] No hand state found for player');
            } else {
                this.myHand = deserializeCards(handState);
                console.log('[Deal] Rendering hand', { cards: this.myHand.length });
                this.handSprites = renderPlayerHand(this, this.myHand, this.handSprites, {
                    from: { x: this.pileX, y: this.pileY },
                    staggerMs: 70
                });
                this.attachHandInteractions(this.handSprites);
            }

            const trumpState = getState('trumpCard') as SerializedCard | null;
            if (trumpState) {
                const [trumpCard] = deserializeCards([trumpState]);
                this.trumpCardSprite = renderTrumpCardNextToDeck(this, trumpCard, this.trumpCardSprite, this.deckAnchor);
            }
        }

        const trickVersion = getState('trickVersion') ?? 0;
        if (trickVersion !== this.lastTrickVersion && !this.isAnimatingTrickWin) {
            this.lastTrickVersion = trickVersion;
            const trickCards = (getState('trickCards') as Array<{ playerId: string; card: SerializedCard }>) ?? [];
            const localId = myPlayer().id;
            const cardsWithPositions = trickCards.map((entry) => {
                const [card] = deserializeCards([entry.card]);
                const anchor = this.playerAnchors[entry.playerId];
                const position = entry.playerId === localId ? 'bottom' : (anchor?.position ?? 'top');
                return { card, position };
            });
            this.trickSprites = renderTrickCards(this, cardsWithPositions, this.trickSprites);
        }

        this.updateBiddingUI();
        this.updateBots();
    }

    private attachHandInteractions(sprites: CardSprite[]): void {
        sprites.forEach((sprite) => {
            sprite.removeAllListeners('card-drop');
            sprite.removeAllListeners('pointerdown');
            sprite.on('card-drop', () => this.playCard(sprite));
            sprite.on('pointerdown', () => this.playCard(sprite));
        });
    }

    private playCard(sprite: CardSprite): void {
        const currentTurnPlayerId = getState('currentTurnPlayerId') as string;
        const localId = myPlayer().id;

        if (currentTurnPlayerId !== localId) {
            return; // not your turn
        }

        const card = sprite.cardData;
        const cardIndex = this.myHand.findIndex((handCard) => handCard.suit === card.suit && handCard.value === card.value);

        if (cardIndex === -1) return;

        this.myHand.splice(cardIndex, 1);
        myPlayer().setState('hand', serializeCards(this.myHand));
        myPlayer().setState('handCount', this.myHand.length);

        // refresh hand ui
        this.handSprites = renderPlayerHand(this, this.myHand, this.handSprites);
        this.attachHandInteractions(this.handSprites);

        // update trick state
        const existingTrick = (getState('trickCards') as Array<{ playerId: string; card: SerializedCard }> ?? []);
        const updatedTrick = [...existingTrick, { playerId: localId, card: serializeCards([card])[0] }];

        setState('trickCards', updatedTrick);
        setState('trickVersion', (getState('trickVersion') ?? 0) + 1);

        // handle turn logic
        const turnOrder = (getState('turnOrder') as string[]) ?? 0;
        const participantCount = Object.keys(getParticipants()).length;

        if (updatedTrick.length < participantCount) {
            // truck is still going, move onto next player
            const turnIndex = getState('turnIndex') ?? 0;
            const nextIndex = (turnIndex + 1) % turnOrder.length;
            const nextPlayerId = turnOrder[nextIndex];

            if (this.shouldDelayForPlayer(nextPlayerId)) {
                this.time.delayedCall(this.botTurnDelayMs, () => {
                    setState('turnIndex', nextIndex);
                    setState('currentTurnPlayerId', nextPlayerId);
                });
            } else {
                setState('turnIndex', nextIndex);
                setState('currentTurnPlayerId', nextPlayerId);
            }
        } else {
            if (isHost()) {
                this.handleTrickCompletion(updatedTrick);
            }
        }
    }

    private handleTrickCompletion(trick: Array<{ playerId: string; card: SerializedCard }>): void {
        const trumpSuit = getState('trumpSuit') as any;
        const deserializedTrick = trick.map(t => ({
            playerId: t.playerId,
            card: deserializeCards([t.card])[0]
        }));

        const winnerId = this.logic.determineTrickWinner(deserializedTrick, trumpSuit);

        // delay animation start to allow UI to render the complete trick first
        this.time.delayedCall(1000, () => {
            this.animateTrickWinner(winnerId);
        });

        this.time.delayedCall(1700, () => {
            // reset trick for everyone
            setState('trickCards', []);
            setState('trickVersion', (getState('trickVersion') ?? 0) + 1);
            this.isAnimatingTrickWin = false;
            this.lastTrickVersion = getState('trickVersion') ?? 0;

            // update winner's trick count
            const currentWins = getState(`tricks_${winnerId}`) ?? 0;
            setState(`tricks_${winnerId}`, currentWins + 1);

            // winner of the trick starts the next one
            const turnOrder = (getState('turnOrder') as string[]) ?? [];
            const nextWinnerIndex = turnOrder.indexOf(winnerId);
            setState('turnIndex', nextWinnerIndex);
            setState('currentTurnPlayerId', winnerId);

            // check if round is over (everyone out of cards)
            if (this.myHand.length === 0) {
                console.log('[Round] Round complete, starting new round');
                this.time.delayedCall(2000, () => {
                    this.startNewRound();
                });
            }
        });
    }

    private animateTrickWinner(winnerId: string): void {
        const anchor = this.playerAnchors[winnerId];

        if (!anchor) return;

        this.isAnimatingTrickWin = true;

        if (anchor.turnHighlight) {
            anchor.turnHighlight.setAlpha(1);
            this.tweens.add({
                targets: anchor.turnHighlight,
                alpha: 0,
                duration: 900,
                ease: 'Sine.easeInOut'
            });
        }

        if (this.trickSprites.length) {
            this.tweens.add({
                targets: this.trickSprites,
                alpha: 0,
                x: anchor.x,
                y: anchor.y,
                scale: CARD_SCALE * 0.5,
                duration: 800,
                ease: 'Power2',
                stagger: 80
            });
        }
    }

    private updateBiddingUI(): void {
        const biddingPhase = Boolean(getState('biddingPhase'));
        const localId = myPlayer().id;
        const currentBidPlayerId = getState('currentBidPlayerId') as string | undefined;

        if (biddingPhase && currentBidPlayerId === localId && myPlayer().getState('bid') == null) {
            if (!this.bidModal) {
                const maxBid = this.myHand.length;
                
                this.bidModal = createBidModal(this, maxBid, (bid) => this.submitBid(bid));
            }
        } else if (this.bidModal) {
            this.bidModal.destroy();
            this.bidModal = undefined;
        }

        this.setHandDisabledForBid(Boolean(this.bidModal));

        Object.values(getParticipants()).forEach((player) => {
            const bid = player.getState('bid') as number | null;
            if (this.lastBids[player.id] !== bid && bid != null) {
                const anchor = this.playerAnchors[player.id];
                if (anchor) {
                    this.bidBubbles[player.id] = createBidBubble(this, anchor, bid, this.bidBubbles[player.id]);
                }
            }
            this.lastBids[player.id] = bid ?? null;
        });
    }

    private setHandDisabledForBid(disabled: boolean): void {
        if (disabled === this.isHandDisabledForBid) {
            if (disabled) {
                this.handSprites.forEach((sprite) => sprite.markAsDisabled());
            }
            return;
        }

        this.isHandDisabledForBid = disabled;

        if (disabled) {
            this.handSprites.forEach((sprite) => sprite.markAsDisabled());
        } else {
            this.handSprites.forEach((sprite) => {
                sprite.clearTint();
                sprite.enableInteractions();
            });
            this.attachHandInteractions(this.handSprites);
        }
    }

    private submitBid(bid: number): void {
        myPlayer().setState('bid', bid);

        const order = (getState('biddingOrder') as string[]) ?? [];
        const currentIndex = getState('biddingIndex') ?? 0;
        const nextIndex = currentIndex + 1;

        if (nextIndex >= order.length) {
            setState('biddingPhase', false);
            setState('currentBidPlayerId', null);
            return;
        }

        const nextPlayerId = order[nextIndex];
        if (this.shouldDelayForPlayer(nextPlayerId)) {
            this.time.delayedCall(this.botBidDelayMs, () => {
                setState('biddingIndex', nextIndex);
                setState('currentBidPlayerId', nextPlayerId);
            });
        } else {
            setState('biddingIndex', nextIndex);
            setState('currentBidPlayerId', nextPlayerId);
        }
    }

    private updateBots(): void {
        if (!isHost()) return;

        const now = this.time.now;
        const biddingPhase = Boolean(getState('biddingPhase'));
        const currentBidPlayerId = getState('currentBidPlayerId') as string | undefined;
        const currentTurnPlayerId = getState('currentTurnPlayerId') as string | undefined;
        const trickCards = (getState('trickCards') as Array<{ playerId: string; card: SerializedCard }>) ?? [];
        const trumpSuit = getState('trumpSuit') as any;
        const round = (getState('round') as number | undefined) ?? 1;
        const participantCount = Object.keys(getParticipants()).length;

        players.forEach((player) => {
            const botPlayer = player as BotCapablePlayer;
            if (!botPlayer.isBot()) return;

            const bot = botPlayer.bot;
            if (!bot) return;

            if (biddingPhase && botPlayer.id === currentBidPlayerId && botPlayer.getState('bid') == null) {
                if (!this.isBotReady(botPlayer.id, now)) return;
                if (this.botPendingAction.get(botPlayer.id)) return;

                this.botPendingAction.set(botPlayer.id, true);
                this.time.delayedCall(this.botTurnDelayMs, () => {
                    const hand = (botPlayer.getState('hand') as SerializedCard[]) ?? [];
                    const bid = bot.decideBid(hand.length, trumpSuit, round);
                    this.submitBidForPlayer(botPlayer, bid);
                    this.scheduleNextBotAction(botPlayer.id, this.time.now);
                    this.botPendingAction.set(botPlayer.id, false);
                });
                return;
            }

            if (!biddingPhase && currentTurnPlayerId === botPlayer.id) {
                if (!this.isBotReady(botPlayer.id, now)) return;
                if (this.botPendingAction.get(botPlayer.id)) return;
                const alreadyPlayed = trickCards.some((entry) => entry.playerId === botPlayer.id);
                if (alreadyPlayed) return;

                const hand = (botPlayer.getState('hand') as SerializedCard[]) ?? [];
                if (!hand.length) return;

                const chosen = bot.chooseCard(hand, trickCards, trumpSuit, participantCount);
                if (!chosen) return;

                this.botPendingAction.set(botPlayer.id, true);
                this.time.delayedCall(this.botTurnDelayMs, () => {
                    this.playCardForPlayer(botPlayer, chosen);
                    this.scheduleNextBotAction(botPlayer.id, this.time.now);
                    this.botPendingAction.set(botPlayer.id, false);
                });
            }
        });
    }

    private isBotReady(playerId: string, now: number): boolean {
        const nextAt = this.botNextActionAt.get(playerId) ?? 0;
        return now >= nextAt;
    }

    private scheduleNextBotAction(playerId: string, now: number): void {
        const jitter = Math.floor(Math.random() * this.botRandomDelayMs);
        this.botNextActionAt.set(playerId, now + this.botBaseDelayMs + jitter);
    }

    private submitBidForPlayer(player: PlayerState, bid: number): void {
        player.setState('bid', bid);

        const order = (getState('biddingOrder') as string[]) ?? [];
        const currentIndex = getState('biddingIndex') ?? 0;
        const nextIndex = currentIndex + 1;

        if (nextIndex >= order.length) {
            setState('biddingPhase', false);
            setState('currentBidPlayerId', null);
            return;
        }

        const nextPlayerId = order[nextIndex];
        if (this.shouldDelayForPlayer(nextPlayerId)) {
            this.time.delayedCall(this.botBidDelayMs, () => {
                setState('biddingIndex', nextIndex);
                setState('currentBidPlayerId', nextPlayerId);
            });
        } else {
            setState('biddingIndex', nextIndex);
            setState('currentBidPlayerId', nextPlayerId);
        }
    }

    private playCardForPlayer(player: PlayerState, card: SerializedCard): void {
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

        setState('trickCards', updatedTrick);
        setState('trickVersion', (getState('trickVersion') ?? 0) + 1);

        const turnOrder = (getState('turnOrder') as string[]) ?? [];
        const participantCount = Object.keys(getParticipants()).length;

        if (updatedTrick.length < participantCount) {
            const turnIndex = getState('turnIndex') ?? 0;
            const nextIndex = (turnIndex + 1) % turnOrder.length;
            const nextPlayerId = turnOrder[nextIndex];

            if (this.shouldDelayForPlayer(nextPlayerId)) {
                this.time.delayedCall(this.botTurnDelayMs, () => {
                    setState('turnIndex', nextIndex);
                    setState('currentTurnPlayerId', nextPlayerId);
                });
            } else {
                setState('turnIndex', nextIndex);
                setState('currentTurnPlayerId', nextPlayerId);
            }
        } else {
            this.handleTrickCompletion(updatedTrick);
        }
    }

    private shouldDelayForPlayer(playerId: string): boolean {
        const player = players.find((p) => p.id === playerId) as BotCapablePlayer | undefined;
        if (!player || typeof player.isBot !== 'function') return false;
        return player.isBot();
    }

    private getTurnOrder(playerIds: string[], hostId: string): string[] {
        const unique = Array.from(new Set(playerIds));
        const others = unique.filter((id) => id !== hostId).sort();
        return [hostId, ...others];
    }

    private startNewRound(): void {
        if (!isHost()) return;

        // check if game should continue
        if (!this.logic.shouldContinueGame()) {
            console.log('[Game] Game Over! All 13 rounds completed.');
            setState('gameOver', true);
            // TODO: Show final scores and game over screen
            return;
        }

        // reset deck and prepare next round
        const newDeck = shuffleDeck(createDeck());
        const { cardsPerPlayer, round } = this.logic.prepareNextRound(newDeck);

        console.log('[Round] Starting round', { round, cardsPerPlayer });

        // deal new hands
        const hands = this.logic.drawCards(cardsPerPlayer);
        const trumpSuit = this.logic.getTrumpSuit();
        const trumpCard = this.logic.getRemainingDeck()[0];

        // reset all player states
        players.forEach((player) => {
            const hand = hands?.get(player.id) ?? [];
            player.setState('hand', serializeCards(hand));
            player.setState('handCount', hand.length);
            player.setState('bid', null);
            setState(`tricks_${player.id}`, 0);
        });

        // update global state
        setState('round', round);
        setState('cardsPerPlayer', cardsPerPlayer);
        setState('trumpSuit', trumpSuit);
        setState('trumpCard', trumpCard ? serializeCards([trumpCard])[0] : null);
        
        const hostId = getState('hostId') ?? myPlayer().id;
        const turnOrder = this.getTurnOrder(players.map((player) => player.id), hostId);
        setState('turnOrder', turnOrder);
        setState('biddingOrder', turnOrder);
        setState('biddingIndex', 0);
        setState('currentBidPlayerId', hostId);
        setState('biddingPhase', true);
        
        const nextDealId = (getState('dealId') ?? 0) + 1;
        setState('dealId', nextDealId);

        console.log('[Round] New round state committed', { dealId: nextDealId, round });
    }
}