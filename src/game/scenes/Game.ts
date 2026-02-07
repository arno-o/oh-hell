import { Scene } from 'phaser';
import { AlertToast, animateTrumpSelection, ChatWindow, createDrawPile, createMenuButtons, createOtherPlayersUI, createPlayerUI, createRoundSummaryPanel, moveDrawPileToTopLeft, PlayerAnchor, renderPlayerHand, renderTrickCards, renderTrumpCardNextToDeck, RoundSummaryData } from '@/lib/ui';
import { ASSET_KEYS } from '@/lib/common';
import { Card, createDeck, shuffleDeck } from '@/lib/deck';
import { getParticipants, getState, isHost, myPlayer, onPlayerJoin, PlayerState, setState } from 'playroomkit';
import { deserializeCards, GameLogic, serializeCards, SerializedCard } from '@/lib/gameLogic';
import { CardSprite } from '@/lib/cardSprite';
import { PendingAction, PendingActionInput, queuePendingAction, hasPendingAction, updateBiddingUI, submitBid, setHandDisabledForBid, setHandDisabledForDelay, setHandDisabled, attachHandInteractions, updatePlayableCards } from '@/game/systems/bidding';
import { updateBots, playCardForPlayer, shouldDelayForPlayer, submitBidForPlayer, isBotReady, scheduleNextBotAction } from '@/game/systems/bots';
import { syncTrickWinState, handleTrickCompletion, animateTrickWinner, isRoundComplete } from '@/game/systems/tricks';
import { toggleChatWindow, closeChatWindow, updateChatFromState } from '@/game/systems/chat';
import { enqueueAlert, flushAlertQueue, positionAlerts, captureParticipantSnapshot, checkParticipantChanges, checkHostChanges, checkRoundAlerts, checkGameOverAlert, fillMissingBots } from '@/game/systems/alerts';
import { addPlayerAnchorForJoin, isBotProfile, getTurnOrder } from '@/game/systems/players';
import { syncLocalHandFromState } from '@/game/systems/handSync';

export class Game extends Scene {
    // -- Game State --
    public deck: Card[];
    public logic: GameLogic;
    public myHand: Card[] = [];
    public players: PlayerState[] = [];

    // -- Visual Elements --
    public handSprites: CardSprite[] = [];
    public trickSprites: CardSprite[] = [];
    public drawPileCards: Phaser.GameObjects.Image[] = [];
    public trumpCardSprite?: CardSprite;

    // -- UI & Layout --
    public playerAnchors: Record<string, PlayerAnchor> = {};
    public bidModal?: Phaser.GameObjects.Container;
    public bidBubbles: Record<string, Phaser.GameObjects.Container> = {};
    public roundSummaryContainer?: Phaser.GameObjects.Container;
    public deckAnchor = { x: 0, y: 0 };
    public pileX = 0;
    public pileY = 0;
    public chatWindow?: ChatWindow;
    public chatOpen = false;
    public chatInputBuffer = '';
    public chatLastVersion = 0;
    public chatKeyHandler?: (event: KeyboardEvent) => void;
    public chatPointerHandler?: (pointer: Phaser.Input.Pointer) => void;
    public chatIgnoreNextPointer = false;
    public chatInputFocused = false;
    public chatMessageNodes: Phaser.GameObjects.Text[] = [];

    // -- State Tracking --
    public lastDealId = 0;
    public lastTurnPlayerId?: string;
    public lastTrickVersion = 0;
    public lastBids: Record<string, number | null> = {};
    public lastBidsVersion = 0;
    public lastBiddingPhase = false;
    public lastBidPlayerId?: string;
    public lastBidTrickVersion = 0;
    public lastRoundSummaryVersion = 0;
    public lastTrickWinVersion = 0;
    public botNextActionAt: Map<string, number> = new Map();
    public botBaseDelayMs = 500;
    public botRandomDelayMs = 400;
    public botPendingAction: Map<string, boolean> = new Map();
    public botTurnDelayMs = 500;
    public botBidDelayMs = 200;
    public isAnimatingTrickWin = false;
    public isHandDisabledForBid = false;
    public isHandDisabledForDelay = false;
    public pollTimer?: Phaser.Time.TimerEvent;
    public uiPollMs = 100;
    public localActionSeq = 0;
    public lastProcessedActionSeq: Map<string, number> = new Map();
    public lastHandSignature = '';
    public alertQueue: string[] = [];
    public activeAlerts: AlertToast[] = [];
    public alertBaseY = 100;
    public alertGap = 12;
    public lastParticipantIds: Set<string> = new Set();
    public participantNames: Map<string, string> = new Map();
    public lastHostId?: string;
    public hostInitialized = false;
    public lastRound?: number;
    public lastRoundSummaryOpen = false;
    public lastGameOver = false;
    public isFillingBots = false;
    public maxPlayers = 4;

    constructor() { super('Game'); }

    init() {
        this.players = Object.values(getParticipants());

        onPlayerJoin(async (player) => {
            const existing = this.players.find(p => p.id === player.id);
            if (!existing) {
                this.players.push(player);
            }

            if (isHost() && player.getState('score') == null) {
                player.setState('score', 0);
            }

            if (this.scene.isActive()) {
                this.addPlayerAnchorForJoin(player);
            }
        });
    }

    create() {
        this.events.on(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);

        this.cameras.main.setBackgroundColor('#074924');
        this.deck = shuffleDeck(createDeck());
        this.runGameSetup(this);
        this.captureParticipantSnapshot();
        this.lastHostId = getState('hostId') as string | undefined;
        this.hostInitialized = Boolean(this.lastHostId);
        this.lastRound = getState('round') as number | undefined;

        this.pollTimer = this.time.addEvent({
            delay: this.uiPollMs,
            loop: true,
            callback: () => {
                if (!this.scene.isActive()) return;
                this.updateBiddingUI();
                this.updateRoundSummaryUI();
                this.updateChatFromState();
                this.processPendingActions();
                this.updateBots();
                this.checkParticipantChanges();
                this.checkHostChanges();
                this.checkRoundAlerts();
                this.checkGameOverAlert();
            }
        });
    }

    shutdown() {
        this.handSprites = [];
        this.trickSprites = [];
        this.alertQueue = [];
        this.activeAlerts.forEach((toast) => toast.container.destroy());
        this.activeAlerts = [];
        this.botPendingAction.clear();
        this.botNextActionAt.clear();
        this.players = [];
        this.closeChatWindow();
        if (this.pollTimer) {
            this.pollTimer.remove(false);
            this.pollTimer = undefined;
        }
        this.events.off(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);
    }

    runGameSetup(scene: Phaser.Scene): void {
        const localPlayer = myPlayer();
        this.logic = new GameLogic(this.deck, this.players.map((player) => player.id));

        if (isHost()) {
            setState('hostId', localPlayer.id);
            this.players.forEach((player) => {
                if (player.getState('score') == null) {
                    player.setState('score', 0);
                }
            });
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

            this.players.forEach((player) => {
                const hand = hands?.get(player.id) ?? [];
                player.setState('hand', serializeCards(hand));
                player.setState('handCount', hand.length);
                player.setState('bid', null);
                console.log('[Deal] Set player hand', { playerId: player.id, count: hand.length });
            });

            setState('bidsVersion', (getState('bidsVersion') ?? 0) + 1);

            setState('round', this.logic.getRound());
            setState('cardsPerPlayer', cardsPerPlayer);
            setState('trumpSuit', trumpSuit);
            setState('trumpCard', trumpCard ? serializeCards([trumpCard])[0] : null);
            const hostId = getState('hostId') ?? localPlayer.id;
            const turnOrder = this.getTurnOrder(this.players.map((player) => player.id), hostId);
            setState('turnOrder', turnOrder);
            setState('turnIndex', 0);
            setState('currentTurnPlayerId', hostId);
            setState('biddingOrder', turnOrder);
            setState('biddingIndex', 0);
            setState('currentBidPlayerId', hostId);
            const nextDealId = (getState('dealId') ?? 0) + 1;
            setState('dealId', nextDealId);

            console.log('[Deal] State committed', { dealId: nextDealId });

            drawButton.destroy();

            setState('biddingPhase', false);
            this.setHandDisabledForDelay(true);
        });

        this.pileX = pileX;
        this.pileY = pileY;
        this.drawPileCards = drawPileCards;

        if (!isHost()) {
            drawButton.destroy();
        }

        const localAnchor = createPlayerUI(scene, localPlayer);
        const otherAnchors = createOtherPlayersUI(scene, this.players, localPlayer.id);
        this.playerAnchors = { [localPlayer.id]: localAnchor, ...otherAnchors };
        createMenuButtons(scene, {
            chat: () => this.toggleChatWindow(),
            settings: () => console.log('[Menu] Settings clicked')
        });
    }

    public safeDelayedCall(delay: number, callback: () => void) {
        if (!this.scene.isActive()) return;
        this.time.delayedCall(delay, () => {
            if (this.scene.isActive()) callback();
        });
    }

    update(): void {
        this.syncLocalHandFromState();
        const currentTurnPlayerId = getState('currentTurnPlayerId') as string | undefined;
        if (currentTurnPlayerId && currentTurnPlayerId !== this.lastTurnPlayerId) {
            this.lastTurnPlayerId = currentTurnPlayerId;

            Object.entries(this.playerAnchors).forEach(([playerId, anchor]) => {
                anchor.turnHighlight?.setAlpha(playerId === currentTurnPlayerId ? 1 : 0);
            });

            this.updatePlayableCards();
        }

        const dealId = getState('dealId') ?? 0;
        if (dealId !== this.lastDealId) {
            console.log('[Deal] Detected new dealId', { previous: this.lastDealId, current: dealId });
            this.lastDealId = dealId;

            // Prepare Trump Card data first
            const trumpState = getState('trumpCard') as SerializedCard | null;
            let trumpCard: Card | null = null;
            if (trumpState) {
                [trumpCard] = deserializeCards([trumpState]);
            }

            const handState = myPlayer().getState('hand') as SerializedCard[] | undefined;
            if (!handState || !handState.length) {
                console.log('[Deal] No hand state found for player');
            } else {
                this.myHand = deserializeCards(handState);
                this.lastHandSignature = JSON.stringify(handState);
                console.log('[Deal] Rendering hand', { cards: this.myHand.length });

                this.handSprites = renderPlayerHand(this, this.myHand, this.handSprites, { from: { x: this.pileX, y: this.pileY }, staggerMs: 120 }, () => {
                    animateTrumpSelection(this, trumpCard, this.drawPileCards, () => {
                        this.deckAnchor = moveDrawPileToTopLeft(this, this.drawPileCards);
                        this.trumpCardSprite = renderTrumpCardNextToDeck(this, trumpCard ?? null, this.trumpCardSprite, this.deckAnchor);

                        this.safeDelayedCall(2000, () => {
                            this.setHandDisabledForDelay(false);
                            setState('biddingPhase', true);
                        });
                    });
                });

                this.attachHandInteractions(this.handSprites);
                this.setHandDisabledForDelay(true);
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
            this.updatePlayableCards();
        }

        this.syncTrickWinState();

    }

    private toggleChatWindow(): void {
        toggleChatWindow(this);
    }

    private closeChatWindow(): void {
        closeChatWindow(this);
    }

    private updateChatFromState(): void {
        updateChatFromState(this);
    }

    public attachHandInteractions(sprites: CardSprite[]): void {
        void sprites;
        attachHandInteractions(this);
    }

    public playCard(sprite: CardSprite): void {
        this.sound.play(ASSET_KEYS.AUDIO_CARD_2, { volume: 0.3 });
        const currentTurnPlayerId = getState('currentTurnPlayerId') as string;
        const localId = myPlayer().id;

        if (currentTurnPlayerId !== localId) {
            return; // not your turn
        }

        if (hasPendingAction()) {
            return;
        }

        const card = sprite.cardData;
        const cardIndex = this.myHand.findIndex((handCard) => handCard.suit === card.suit && handCard.value === card.value);

        if (cardIndex === -1) return;

        if (!isHost()) {
            queuePendingAction(this, { type: 'playCard', card: serializeCards([card])[0] });
            return;
        }

        this.myHand.splice(cardIndex, 1);
        myPlayer().setState('hand', serializeCards(this.myHand));
        myPlayer().setState('handCount', this.myHand.length);

        // refresh hand ui
        this.handSprites = renderPlayerHand(this, this.myHand, this.handSprites);
        attachHandInteractions(this);
        updatePlayableCards(this);

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

            if (shouldDelayForPlayer(this, nextPlayerId)) {
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
                handleTrickCompletion(this, updatedTrick);
            }
        }
    }

    public handleTrickCompletion(trick: Array<{ playerId: string; card: SerializedCard }>): void {
        handleTrickCompletion(this, trick);
    }

    public animateTrickWinner(winnerId: string): void {
        animateTrickWinner(this, winnerId);
    }

    private updateBiddingUI(): void {
        updateBiddingUI(this);
    }

    public isRoundComplete(): boolean {
        return isRoundComplete();
    }

    public showRoundSummary(): void {
        if (!isHost()) return;
        if (getState('roundSummaryOpen')) return;

        const round = (getState('round') as number | undefined) ?? 1;
        const results = Object.values(getParticipants()).map((player) => {
            const bid = (player.getState('bid') as number | null) ?? 0;
            const tricks = (getState(`tricks_${player.id}`) as number | undefined) ?? 0;
            const points = tricks + (tricks === bid ? 10 : 0);
            const previousTotal = (player.getState('score') as number | undefined) ?? 0;
            const total = previousTotal + points;
            player.setState('score', total);

            const profile = player.getProfile();
            const rawColor = profile.color?.hex;
            const color = typeof rawColor === 'number'
                ? `#${rawColor.toString(16).padStart(6, '0')}`
                : rawColor;
            return {
                playerId: player.id,
                playerName: profile.name,
                color,
                bid,
                tricks,
                points,
                total
            };
        });

        results.sort((a, b) => {
            if (b.points !== a.points) return b.points - a.points;
            return b.total - a.total;
        });

        setState('roundSummary', { round, results });
        setState('roundSummaryOpen', true);
        setState('roundSummaryVersion', (getState('roundSummaryVersion') ?? 0) + 1);
    }

    private updateRoundSummaryUI(): void {
        const isOpen = Boolean(getState('roundSummaryOpen'));
        const summaryVersion = (getState('roundSummaryVersion') as number | undefined) ?? 0;

        if (!isOpen) {
            if (this.roundSummaryContainer) {
                this.roundSummaryContainer.destroy(true);
                this.roundSummaryContainer = undefined;
            }
            return;
        }

        if (summaryVersion === this.lastRoundSummaryVersion && this.roundSummaryContainer) {
            return;
        }

        this.lastRoundSummaryVersion = summaryVersion;

        if (this.roundSummaryContainer) {
            this.roundSummaryContainer.destroy(true);
            this.roundSummaryContainer = undefined;
        }

        const summary = getState('roundSummary') as RoundSummaryData | undefined;

        if (!summary) return;

        const panel = createRoundSummaryPanel(this, summary, isHost(), () => this.continueFromRoundSummary());
        this.roundSummaryContainer = panel.container;
    }

    private continueFromRoundSummary(): void {
        if (!isHost()) return;
        setState('roundSummaryOpen', false);
        setState('roundSummary', null);
        setState('roundSummaryVersion', (getState('roundSummaryVersion') ?? 0) + 1);
        this.startNewRound();
    }

    public setHandDisabledForBid(disabled: boolean): void {
        setHandDisabledForBid(this, disabled);
    }

    public setHandDisabledForDelay(disabled: boolean): void {
        setHandDisabledForDelay(this, disabled);
    }

    public setHandDisabled(disabled: boolean, applyTint: boolean): void {
        setHandDisabled(this, disabled, applyTint);
    }

    public updatePlayableCards(): void {
        updatePlayableCards(this);
    }

    public submitBid(bid: number): void {
        submitBid(this, bid);
    }

    public updateBots(): void {
        updateBots(this);
    }

    public isBotReady(playerId: string, now: number): boolean {
        return isBotReady(this, playerId, now);
    }

    public scheduleNextBotAction(playerId: string, now: number): void {
        scheduleNextBotAction(this, playerId, now);
    }

    public submitBidForPlayer(player: PlayerState, bid: number): void {
        submitBidForPlayer(this, player, bid);
    }

    public playCardForPlayer(player: PlayerState, card: SerializedCard): void {
        playCardForPlayer(this, player, card);
    }

    public shouldDelayForPlayer(playerId: string): boolean {
        return shouldDelayForPlayer(this, playerId);
    }

    private addPlayerAnchorForJoin(player: PlayerState): void {
        addPlayerAnchorForJoin(this, player);
    }

    public isBotProfile(player: PlayerState): boolean {
        return isBotProfile(player);
    }

    public hasPendingAction(): boolean {
        return hasPendingAction();
    }

    public queuePendingAction(action: PendingActionInput): void {
        queuePendingAction(this, action);
    }

    private processPendingActions(): void {
        if (!isHost()) return;

        Object.values(getParticipants()).forEach((player) => {
            const pending = player.getState('pendingAction') as PendingAction | null | undefined;
            if (!pending) return;

            const lastSeq = this.lastProcessedActionSeq.get(player.id) ?? 0;
            if (pending.seq <= lastSeq) {
                player.setState('pendingAction', null);
                return;
            }

            if (pending.type === 'bid') {
                this.submitBidForPlayer(player, pending.bid);
            }

            if (pending.type === 'playCard') {
                this.playCardForPlayer(player, pending.card);
            }

            this.lastProcessedActionSeq.set(player.id, pending.seq);
            player.setState('pendingAction', null);
        });
    }

    private syncLocalHandFromState(): void {
        syncLocalHandFromState(this);
    }

    private syncTrickWinState(): void {
        syncTrickWinState(this);
    }

    public enqueueAlert(message: string): void {
        enqueueAlert(this, message);
    }

    public flushAlertQueue(): void {
        flushAlertQueue(this);
    }

    public positionAlerts(): void {
        positionAlerts(this);
    }

    private captureParticipantSnapshot(): void {
        captureParticipantSnapshot(this);
    }

    private checkParticipantChanges(): void {
        checkParticipantChanges(this, (id) => {
            delete this.playerAnchors[id];
        });
    }

    public fillMissingBots(): void {
        fillMissingBots(this);
    }

    private checkHostChanges(): void {
        checkHostChanges(this);
    }

    private checkRoundAlerts(): void {
        checkRoundAlerts(this);
    }

    private checkGameOverAlert(): void {
        checkGameOverAlert(this);
    }

    private getTurnOrder(playerIds: string[], hostId: string): string[] {
        return getTurnOrder(playerIds, hostId);
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
        this.players.forEach((player) => {
            const hand = hands?.get(player.id) ?? [];
            player.setState('hand', serializeCards(hand));
            player.setState('handCount', hand.length);
            player.setState('bid', null);
            setState(`tricks_${player.id}`, 0);
        });

        setState('bidsVersion', (getState('bidsVersion') ?? 0) + 1);

        // update global state
        setState('round', round);
        setState('cardsPerPlayer', cardsPerPlayer);
        setState('trumpSuit', trumpSuit);
        setState('trumpCard', trumpCard ? serializeCards([trumpCard])[0] : null);

        const hostId = getState('hostId') ?? myPlayer().id;
        const turnOrder = this.getTurnOrder(this.players.map((player) => player.id), hostId);
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