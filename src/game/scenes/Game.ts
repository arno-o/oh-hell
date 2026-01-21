import { Scene } from 'phaser';
import { createBidBubble, createBidModal, createDrawPile, createMenuButtons, createOtherPlayersUI, createPlayerUI, createTurnText, moveDrawPileToTopLeft, PlayerAnchor, renderPlayerHand, renderTrickCards, renderTrumpCardNextToDeck } from '@/lib/ui';
import { Card, createDeck, shuffleDeck } from '@/lib/deck';
import { getParticipants, getState, isHost, myPlayer, setState } from 'playroomkit';
import { deserializeCards, GameLogic, serializeCards, SerializedCard } from '@/lib/gameLogic';
import { CardSprite } from '@/lib/cardSprite';

export class Game extends Scene
{
    deck: Card[];
    logic: GameLogic;
    handSprites: CardSprite[] = [];
    myHand: Card[] = [];
    lastDealId = 0;
    pileX = 0;
    pileY = 0;
    drawPileCards: Phaser.GameObjects.Image[] = [];
    trumpCardSprite?: CardSprite;
    turnText?: Phaser.GameObjects.Text;
    lastTurnPlayerId?: string;
    lastTrickVersion = 0;
    trickSprites: CardSprite[] = [];
    deckAnchor = { x: 0, y: 0 };
    playerAnchors: Record<string, PlayerAnchor> = {};
    bidModal?: Phaser.GameObjects.Container;
    lastBidPlayerId?: string;
    lastBidValue?: number;
    bidBubbles: Record<string, Phaser.GameObjects.Container> = {};
    lastBids: Record<string, number | null> = {};

    constructor() { super('Game'); }

    create ()
    {
        this.cameras.main.setBackgroundColor('#074924');
        this.deck = shuffleDeck(createDeck());
        this.runGameSetup(this);
    }

    runGameSetup(scene: Phaser.Scene): void {
        const localPlayer = myPlayer();
        const allPlayers = Object.values(getParticipants());
        this.logic = new GameLogic(this.deck, allPlayers.map((player) => player.id));

        if (isHost()) {
            setState('hostId', localPlayer.id);
        }

        const { drawButton, pileX, pileY, drawPileCards } = createDrawPile(scene, () => {
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

            Object.values(getParticipants()).forEach((player) => {
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
            const turnOrder = this.getTurnOrder(allPlayers.map((player) => player.id), hostId);
            setState('turnOrder', turnOrder);
            setState('turnIndex', 0);
            setState('currentTurnPlayerId', hostId);
            setState('biddingOrder', turnOrder);
            setState('biddingIndex', 0);
            setState('currentBidPlayerId', hostId);
            setState('biddingPhase', true);
            const nextDealId = (getState('dealId') ?? 0) + 1;
            setState('dealId', nextDealId);
            console.log('[Deal] State committed', { dealId: nextDealId });

            this.deckAnchor = moveDrawPileToTopLeft(this, this.drawPileCards);
            this.trumpCardSprite = renderTrumpCardNextToDeck(this, trumpCard ?? null, this.trumpCardSprite, this.deckAnchor);

            this.logic.advanceRound();
            drawButton.destroy();
        });

        this.pileX = pileX;
        this.pileY = pileY;
        this.drawPileCards = drawPileCards;

        const localAnchor = createPlayerUI(scene, localPlayer);
        const otherAnchors = createOtherPlayersUI(scene, allPlayers, localPlayer.id);
        this.playerAnchors = { [localPlayer.id]: localAnchor, ...otherAnchors };
        createMenuButtons(scene);

        this.turnText = createTurnText(scene);
    }

    update(): void {
        const currentTurnPlayerId = getState('currentTurnPlayerId') as string | undefined;
        if (currentTurnPlayerId && currentTurnPlayerId !== this.lastTurnPlayerId) {
            this.lastTurnPlayerId = currentTurnPlayerId;
            const localId = myPlayer().id;
            const players = getParticipants();
            const currentPlayer = players[currentTurnPlayerId];
            const displayName = currentPlayer?.getProfile().name ?? 'Unknown';
            const label = currentTurnPlayerId === localId ? 'Your turn' : `Turn: ${displayName}`;
            this.turnText?.setText(label);
            console.log('[Turn] Current player', displayName);

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
        if (trickVersion !== this.lastTrickVersion) {
            this.lastTrickVersion = trickVersion;
            const trickCards = (getState('trickCards') as Array<{ playerId: string; card: SerializedCard }>) ?? [];
            const cards = trickCards.map((entry) => deserializeCards([entry.card])[0]);
            this.trickSprites = renderTrickCards(this, cards, this.trickSprites);
        }

        this.updateBiddingUI();
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
        const currentTurnPlayerId = getState('currentTurnPlayerId') as string | undefined;
        const localId = myPlayer().id;
        if (currentTurnPlayerId !== localId) {
            console.log('[Play] Not your turn');
            return;
        }

        const card = sprite.cardData;
        const cardIndex = this.myHand.findIndex((handCard) => handCard.suit === card.suit && handCard.value === card.value);
        if (cardIndex === -1) {
            return;
        }

        this.myHand.splice(cardIndex, 1);
        myPlayer().setState('hand', serializeCards(this.myHand));
        myPlayer().setState('handCount', this.myHand.length);

        this.handSprites = renderPlayerHand(this, this.myHand, this.handSprites);
        this.attachHandInteractions(this.handSprites);

        const existing = (getState('trickCards') as Array<{ playerId: string; card: SerializedCard }>) ?? [];
        const next = [...existing, { playerId: localId, card: serializeCards([card])[0] }];
        setState('trickCards', next);
        setState('trickVersion', (getState('trickVersion') ?? 0) + 1);

        const turnOrder = (getState('turnOrder') as string[]) ?? [];
        const turnIndex = getState('turnIndex') ?? 0;
        const nextIndex = turnOrder.length ? (turnIndex + 1) % turnOrder.length : 0;
        const nextPlayerId = turnOrder[nextIndex] ?? localId;
        setState('turnIndex', nextIndex);
        setState('currentTurnPlayerId', nextPlayerId);
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

    private submitBid(bid: number): void {
        const localId = myPlayer().id;
        myPlayer().setState('bid', bid);
        this.lastBidPlayerId = localId;
        this.lastBidValue = bid;

        const order = (getState('biddingOrder') as string[]) ?? [];
        const currentIndex = getState('biddingIndex') ?? 0;
        const nextIndex = currentIndex + 1;

        if (nextIndex >= order.length) {
            setState('biddingPhase', false);
            setState('currentBidPlayerId', null);
            return;
        }

        const nextPlayerId = order[nextIndex];
        setState('biddingIndex', nextIndex);
        setState('currentBidPlayerId', nextPlayerId);
    }

    private getTurnOrder(playerIds: string[], hostId: string): string[] {
        const unique = Array.from(new Set(playerIds));
        const others = unique.filter((id) => id !== hostId).sort();
        return [hostId, ...others];
    }
}