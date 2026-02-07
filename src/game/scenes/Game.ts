import { Scene } from 'phaser';
import { AlertToast, animateTrumpSelection, ChatWindow, createAlertToast, createBidBubble, createBidModal, createChatWindow, createDrawPile, createMenuButtons, createOtherPlayersUI, createPlayerUI, createRoundSummaryPanel, createSidePlayerUI, moveDrawPileToTopLeft, PlayerAnchor, renderPlayerHand, renderTrickCards, renderTrumpCardNextToDeck, RoundSummaryData } from '@/lib/ui';
import { ASSET_KEYS, CARD_SCALE } from '@/lib/common';
import { Card, createDeck, shuffleDeck } from '@/lib/deck';
import { addBot, getParticipants, getState, isHost, myPlayer, onPlayerJoin, PlayerState, setState } from 'playroomkit';
import { deserializeCards, GameLogic, serializeCards, SerializedCard } from '@/lib/gameLogic';
import { CardSprite } from '@/lib/cardSprite';
import { PlayerBot } from '@/player/Bot';
import { appendChatMessage, CHAT_MAX_LENGTH, getChatMessages, getChatVersion, normalizeChatText } from '@/lib/chat';

type BotCapablePlayer = PlayerState & {
    isBot: () => boolean;
    bot?: PlayerBot;
};

type PendingAction =
    | { type: 'playCard'; card: SerializedCard; seq: number }
    | { type: 'bid'; bid: number; seq: number };

type PendingActionInput =
    | { type: 'playCard'; card: SerializedCard }
    | { type: 'bid'; bid: number };

export class Game extends Scene
{
    // -- Game State --
    private deck: Card[];
    private logic: GameLogic;
    private myHand: Card[] = [];
    private players: PlayerState[] = [];

    // -- Visual Elements --
    private handSprites: CardSprite[] = [];
    private trickSprites: CardSprite[] = [];
    private drawPileCards: Phaser.GameObjects.Image[] = [];
    private trumpCardSprite?: CardSprite;

    // -- UI & Layout --
    private playerAnchors: Record<string, PlayerAnchor> = {};
    private bidModal?: Phaser.GameObjects.Container;
    private bidBubbles: Record<string, Phaser.GameObjects.Container> = {};
    private roundSummaryContainer?: Phaser.GameObjects.Container;
    private deckAnchor = { x: 0, y: 0 };
    private pileX = 0;
    private pileY = 0;
    private chatWindow?: ChatWindow;
    private chatOpen = false;
    private chatInputBuffer = '';
    private chatLastVersion = 0;
    private chatKeyHandler?: (event: KeyboardEvent) => void;
    private chatPointerHandler?: (pointer: Phaser.Input.Pointer) => void;
    private chatIgnoreNextPointer = false;
    private chatInputFocused = false;
    private chatMessageNodes: Phaser.GameObjects.Text[] = [];

    // -- State Tracking --
    private lastDealId = 0;
    private lastTurnPlayerId?: string;
    private lastTrickVersion = 0;
    private lastBids: Record<string, number | null> = {};
    private lastBidsVersion = 0;
    private lastBiddingPhase = false;
    private lastBidPlayerId?: string;
    private lastBidTrickVersion = 0;
    private lastRoundSummaryVersion = 0;
    private lastTrickWinVersion = 0;
    private botNextActionAt: Map<string, number> = new Map();
    private botBaseDelayMs = 500;
    private botRandomDelayMs = 400;
    private botPendingAction: Map<string, boolean> = new Map();
    private botTurnDelayMs = 500;
    private botBidDelayMs = 200;
    private isAnimatingTrickWin = false;
    private isHandDisabledForBid = false;
    private isHandDisabledForDelay = false;
    private pollTimer?: Phaser.Time.TimerEvent;
    private uiPollMs = 100;
    private localActionSeq = 0;
    private lastProcessedActionSeq: Map<string, number> = new Map();
    private lastHandSignature = '';
    private alertQueue: string[] = [];
    private activeAlerts: AlertToast[] = [];
    private alertBaseY = 100;
    private alertGap = 12;
    private lastParticipantIds: Set<string> = new Set();
    private participantNames: Map<string, string> = new Map();
    private lastHostId?: string;
    private hostInitialized = false;
    private lastRound?: number;
    private lastRoundSummaryOpen = false;
    private lastGameOver = false;
    private isFillingBots = false;
    private maxPlayers = 4;

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

    create ()
    {
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

    private safeDelayedCall(delay: number, callback: () => void) {
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
        if (this.chatOpen) {
            this.closeChatWindow();
        } else {
            this.openChatWindow();
        }
    }

    private openChatWindow(): void {
        if (this.chatOpen) return;

        this.chatOpen = true;
        this.chatInputBuffer = '';
        this.chatInputFocused = false;
        this.chatIgnoreNextPointer = true;

        this.chatWindow = createChatWindow(this, {
            onClose: () => this.closeChatWindow()
        });
        this.setChatInputFocus(false);

        this.chatWindow.inputHitArea.on('pointerdown', () => {
            this.setChatInputFocus(true);
        });

        this.chatPointerHandler = (pointer: Phaser.Input.Pointer) => {
            if (!this.chatWindow) return;
            if (this.chatIgnoreNextPointer) {
                this.chatIgnoreNextPointer = false;
                return;
            }
            const panelBounds = this.chatWindow.panelBounds;
            if (!panelBounds.contains(pointer.x, pointer.y)) {
                this.closeChatWindow();
                return;
            }

            const inputBounds = this.chatWindow.inputHitArea.getBounds();
            if (inputBounds.contains(pointer.x, pointer.y)) {
                this.setChatInputFocus(true);
            } else {
                this.setChatInputFocus(false);
            }
        };
        this.input.on('pointerdown', this.chatPointerHandler);

        this.refreshChatMessages();
        this.updateChatInputText();

        const keyboard = this.input.keyboard;
        if (keyboard) {
            this.chatKeyHandler = (event: KeyboardEvent) => this.handleChatKeydown(event);
            keyboard.on('keydown', this.chatKeyHandler);
        }
    }

    private closeChatWindow(): void {
        if (!this.chatOpen) return;
        this.chatOpen = false;
        this.setChatInputFocus(false);

        if (this.chatWindow) {
            this.chatWindow.inputHitArea.off('pointerdown');
            this.chatWindow.container.destroy();
            this.chatWindow = undefined;
        }

        this.chatMessageNodes = [];

        if (this.chatPointerHandler) {
            this.input.off('pointerdown', this.chatPointerHandler);
            this.chatPointerHandler = undefined;
        }

        if (this.chatKeyHandler && this.input.keyboard) {
            this.input.keyboard.off('keydown', this.chatKeyHandler);
        }

        this.chatKeyHandler = undefined;
        this.chatInputBuffer = '';
        this.chatIgnoreNextPointer = false;
    }

    private setChatInputFocus(focused: boolean): void {
        this.chatInputFocused = focused;
        if (this.chatWindow) {
            this.chatWindow.drawInputBg(focused);
        }
    }

    private handleChatKeydown(event: KeyboardEvent): void {
        if (event.key === 'Escape') {
            this.closeChatWindow();
            return;
        }

        if (!this.chatOpen || !this.chatInputFocused) return;

        if (event.key === 'Enter') {
            const trimmed = normalizeChatText(this.chatInputBuffer);
            if (trimmed) {
                appendChatMessage(trimmed, myPlayer());
                this.chatInputBuffer = '';
                this.updateChatInputText();
                this.refreshChatMessages();
            }
            this.sound.play(ASSET_KEYS.AUDIO_CHAT_POST, {volume: 0.3});
            return;
        }

        if (event.key === 'Backspace') {
            this.chatInputBuffer = this.chatInputBuffer.slice(0, -1);
            this.updateChatInputText();
            return;
        }

        if (event.key.length === 1) {
            if (this.chatInputBuffer.length >= CHAT_MAX_LENGTH) return;
            this.chatInputBuffer += event.key;
            this.updateChatInputText();
        }
    }

    private updateChatFromState(): void {
        const version = getChatVersion();
        if (version !== this.chatLastVersion) {
            this.chatLastVersion = version;
            this.refreshChatMessages();
        }
    }

    private refreshChatMessages(): void {
        if (!this.chatWindow) return;
        const messages = getChatMessages();

        this.chatMessageNodes.forEach((node) => node.destroy());
        this.chatMessageNodes = [];

        const container = this.chatWindow.messagesContainer;
        const gap = 8;
    const maxWidth = this.chatWindow.messagesBounds.width;
    const maxHeight = this.chatWindow.messagesBounds.height;

        const items: Array<{
            nameText: Phaser.GameObjects.Text;
            messageText: Phaser.GameObjects.Text;
            rowHeight: number;
        }> = [];

        let usedHeight = 0;

        for (let i = messages.length - 1; i >= 0; i -= 1) {
            const message = messages[i];

            const nameText = this.add.text(0, 0, `${message.playerName}:`, {
                fontSize: '13px',
                fontStyle: 'bold',
                color: message.color ?? '#f9fafb'
            });

            const messageText = this.add.text(nameText.width + 6, 0, message.text, {
                fontSize: '13px',
                color: '#e5e7eb',
                wordWrap: { width: Math.max(60, maxWidth - nameText.width - 6) }
            });

            const rowHeight = Math.max(nameText.height, messageText.height);
            const nextHeight = usedHeight + rowHeight + (items.length ? gap : 0);
            if (nextHeight > maxHeight) {
                nameText.destroy();
                messageText.destroy();
                break;
            }

            usedHeight = nextHeight;
            items.push({ nameText, messageText, rowHeight });
        }

        let y = Math.max(0, maxHeight - usedHeight);

        for (let i = items.length - 1; i >= 0; i -= 1) {
            const item = items[i];
            item.nameText.setPosition(0, y);
            item.messageText.setPosition(item.nameText.width + 6, y);
            container.add([item.nameText, item.messageText]);
            this.chatMessageNodes.push(item.nameText, item.messageText);
            y += item.rowHeight + gap;
        }
    }

    private updateChatInputText(): void {
        if (!this.chatWindow) return;
        const isEmpty = this.chatInputBuffer.length === 0;
        this.chatWindow.inputText
            .setText(isEmpty ? 'Type a message…' : this.chatInputBuffer)
            .setColor(isEmpty ? '#9ca3af' : '#f9fafb');
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
        this.sound.play(ASSET_KEYS.AUDIO_CARD_2, {volume: 0.3});
        const currentTurnPlayerId = getState('currentTurnPlayerId') as string;
        const localId = myPlayer().id;

        if (currentTurnPlayerId !== localId) {
            return; // not your turn
        }

        if (this.hasPendingAction()) {
            return;
        }

        const card = sprite.cardData;
        const cardIndex = this.myHand.findIndex((handCard) => handCard.suit === card.suit && handCard.value === card.value);

        if (cardIndex === -1) return;

        if (!isHost()) {
            this.queuePendingAction({ type: 'playCard', card: serializeCards([card])[0] });
            return;
        }

        this.myHand.splice(cardIndex, 1);
        myPlayer().setState('hand', serializeCards(this.myHand));
        myPlayer().setState('handCount', this.myHand.length);

        // refresh hand ui
        this.handSprites = renderPlayerHand(this, this.myHand, this.handSprites);
        this.attachHandInteractions(this.handSprites);
        this.updatePlayableCards();

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

        setState('trickWinnerId', winnerId);
        setState('trickWinVersion', (getState('trickWinVersion') ?? 0) + 1);

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
            if (this.isRoundComplete()) {
                console.log('[Round] Round complete, showing summary');
                this.time.delayedCall(1600, () => {
                    this.showRoundSummary();
                });
            }
        });
    }

    private animateTrickWinner(winnerId: string): void {
        const anchor = this.playerAnchors[winnerId];

        if (!anchor) return;

        this.isAnimatingTrickWin = true;

        this.sound.play(ASSET_KEYS.AUDIO_TRUMP_MOVE, { volume: 0.3 });

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
        const bidsVersion = (getState('bidsVersion') as number | undefined) ?? 0;
        const trickVersion = (getState('trickVersion') as number | undefined) ?? 0;
        const trickCards = (getState('trickCards') as Array<{ playerId: string; card: SerializedCard }>) ?? [];
        const hasTrickStarted = trickCards.length > 0;

        const shouldUpdate =
            biddingPhase !== this.lastBiddingPhase ||
            currentBidPlayerId !== this.lastBidPlayerId ||
            bidsVersion !== this.lastBidsVersion ||
            trickVersion !== this.lastBidTrickVersion;

        if (!shouldUpdate) {
            return;
        }

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
            const previous = this.lastBids[player.id];
            const anchor = this.playerAnchors[player.id];
            const tricks = (getState(`tricks_${player.id}`) as number | undefined) ?? 0;

            if (anchor?.bidText) {
                anchor.bidText.setText(bid == null ? '--' : `${tricks}/${bid}`);
            }

            if (bid == null && previous != null) {
                this.bidBubbles[player.id]?.destroy();
                this.bidBubbles[player.id] = undefined as unknown as Phaser.GameObjects.Container;
            }

            if (hasTrickStarted && this.bidBubbles[player.id]) {
                this.bidBubbles[player.id].destroy();
                this.bidBubbles[player.id] = undefined as unknown as Phaser.GameObjects.Container;
            }

            if (!hasTrickStarted && this.lastBids[player.id] !== bid && bid != null && anchor) {
                this.sound.play(ASSET_KEYS.AUDIO_BUTTON_2, {volume: 0.3});
                this.bidBubbles[player.id] = createBidBubble(this, anchor, bid, this.bidBubbles[player.id]);
            }

            this.lastBids[player.id] = bid ?? null;
        });

        this.lastBidsVersion = bidsVersion;
        this.lastBiddingPhase = biddingPhase;
        this.lastBidPlayerId = currentBidPlayerId;
        this.lastBidTrickVersion = trickVersion;
    }

    private isRoundComplete(): boolean {
        return Object.values(getParticipants()).every((player) => {
            const count = (player.getState('handCount') as number | undefined) ?? 0;
            return count === 0;
        });
    }

    private showRoundSummary(): void {
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

    private setHandDisabledForBid(disabled: boolean): void {
        this.isHandDisabledForBid = disabled;
        this.setHandDisabled(disabled, true);
    }

    private setHandDisabledForDelay(disabled: boolean): void {
        this.isHandDisabledForDelay = disabled;
        this.setHandDisabled(disabled, false);
    }

    private setHandDisabled(disabled: boolean, applyTint: boolean): void {
        if (disabled) {
            this.handSprites.forEach((sprite) => sprite.markAsDisabled(applyTint));
            return;
        }

        if (this.isHandDisabledForBid || this.isHandDisabledForDelay) {
            return;
        }

        this.handSprites.forEach((sprite) => {
            sprite.clearTint();
            sprite.enableInteractions();
        });
        this.attachHandInteractions(this.handSprites);
        this.updatePlayableCards();
    }

    private updatePlayableCards(): void {
        if (!this.handSprites.length) return;
        if (this.isHandDisabledForBid || this.isHandDisabledForDelay) return;

        const currentTurnPlayerId = getState('currentTurnPlayerId') as string | undefined;
        const localId = myPlayer().id;

        if (currentTurnPlayerId && currentTurnPlayerId !== localId) {
            this.handSprites.forEach((sprite) => sprite.markAsDisabled(true));
            return;
        }

        const trickCards = (getState('trickCards') as Array<{ playerId: string; card: SerializedCard }>) ?? [];
        const deserializedTrick = trickCards.map((entry) => ({
            playerId: entry.playerId,
            card: deserializeCards([entry.card])[0]
        }));

        this.handSprites.forEach((sprite) => {
            const playable = this.logic.checkIfCardIsPlayable(sprite.cardData, this.myHand, deserializedTrick);
            if (!playable) {
                sprite.markAsDisabled(true);
            } else {
                sprite.clearTint();
                sprite.enableInteractions();
            }
        });

        this.attachHandInteractions(this.handSprites);
    }

    private submitBid(bid: number): void {
        if (this.hasPendingAction()) {
            return;
        }

        myPlayer().setState('bid', bid);

        if (!isHost()) {
            this.queuePendingAction({ type: 'bid', bid });
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

        this.players.forEach((player) => {
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
                    const bid = bot.decideBid(hand, trumpSuit, round);
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

                const bid = (botPlayer.getState('bid') as number | null) ?? 0;
                const currentTricks = (getState(`tricks_${botPlayer.id}`) as number | undefined) ?? 0;
                const chosen = bot.chooseCard(hand, trickCards, trumpSuit, participantCount, bid, currentTricks);
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

        this.sound.play(ASSET_KEYS.AUDIO_CARD_2, {volume: 0.3});

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
        const player = this.players.find((p) => p.id === playerId) as BotCapablePlayer | undefined;
        if (!player || typeof player.isBot !== 'function') return false;
        return player.isBot();
    }

    private addPlayerAnchorForJoin(player: PlayerState): void {
        if (player.id === myPlayer().id) return;
        if (this.playerAnchors[player.id]) return;

        const usedPositions = new Set(Object.values(this.playerAnchors).map((anchor) => anchor.position));
        const positions: Array<'left' | 'top' | 'right'> = ['left', 'top', 'right'];
        const nextPosition = positions.find((position) => !usedPositions.has(position));

        if (!nextPosition) return;

        const anchor = createSidePlayerUI(this, player, nextPosition, this.isBotProfile(player));
        this.playerAnchors[player.id] = anchor;
    }

    private isBotProfile(player: PlayerState): boolean {
        const maybe = player as PlayerState & { isBot?: () => boolean };
        if (typeof maybe.isBot === 'function') {
            return maybe.isBot();
        }

        const profile = player.getProfile() as { name?: string; isBot?: boolean };
        return Boolean(profile.isBot) || /bot/i.test(profile.name ?? '');
    }

    private hasPendingAction(): boolean {
        const pending = myPlayer().getState('pendingAction') as PendingAction | null | undefined;
        return Boolean(pending);
    }

    private queuePendingAction(action: PendingActionInput): void {
        this.localActionSeq += 1;
        myPlayer().setState('pendingAction', { ...action, seq: this.localActionSeq });
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
        const handState = myPlayer().getState('hand') as SerializedCard[] | undefined;
        const signature = handState ? JSON.stringify(handState) : '';
        if (!handState || signature === this.lastHandSignature) return;

        this.lastHandSignature = signature;
        this.myHand = deserializeCards(handState);
        this.handSprites = renderPlayerHand(this, this.myHand, this.handSprites);
        this.attachHandInteractions(this.handSprites);
        this.updatePlayableCards();
    }

    private syncTrickWinState(): void {
        const trickWinVersion = (getState('trickWinVersion') as number | undefined) ?? 0;
        if (trickWinVersion !== this.lastTrickWinVersion) {
            this.lastTrickWinVersion = trickWinVersion;
            const winnerId = getState('trickWinnerId') as string | undefined;
            if (winnerId) {
                this.isAnimatingTrickWin = true;
                this.safeDelayedCall(1000, () => this.animateTrickWinner(winnerId));
            }
        }

        const trickCards = (getState('trickCards') as Array<{ playerId: string; card: SerializedCard }>) ?? [];
        if (this.isAnimatingTrickWin && trickCards.length === 0) {
            this.isAnimatingTrickWin = false;
        }
    }

    private enqueueAlert(message: string): void {
        this.alertQueue.push(message);
        this.flushAlertQueue();
    }

    private flushAlertQueue(): void {
        if (!this.alertQueue.length) return;

        while (this.alertQueue.length) {
            const message = this.alertQueue.shift();
            if (!message) return;
            const toast = createAlertToast(this, message, { width: 420 });
            this.activeAlerts.push(toast);
            this.positionAlerts();

            toast.container.setAlpha(0);
            this.tweens.add({
                targets: toast.container,
                alpha: 1,
                duration: 160,
                ease: 'Sine.easeOut'
            });

            this.time.delayedCall(2400, () => {
                this.tweens.add({
                    targets: toast.container,
                    alpha: 0,
                    duration: 220,
                    ease: 'Sine.easeIn',
                    onComplete: () => {
                        toast.container.destroy();
                        this.activeAlerts = this.activeAlerts.filter((item) => item !== toast);
                        this.positionAlerts();
                    }
                });
            });
        }
    }

    private positionAlerts(): void {
        let y = this.alertBaseY;
        this.activeAlerts.forEach((toast) => {
            toast.container.setPosition(this.scale.width / 2, y);
            y += toast.height + this.alertGap;
        });
    }

    private captureParticipantSnapshot(): void {
        const participants = Object.values(getParticipants());
        this.lastParticipantIds = new Set(participants.map((player) => player.id));
        participants.forEach((player) => {
            this.participantNames.set(player.id, player.getProfile().name);
        });
    }

    private checkParticipantChanges(): void {
        const participants = Object.values(getParticipants());
        const currentIds = new Set(participants.map((player) => player.id));

        let playerLeft = false;

        participants.forEach((player) => {
            if (!this.lastParticipantIds.has(player.id)) {
                this.enqueueAlert(`${player.getProfile().name} joined`);
            }
        });

        this.lastParticipantIds.forEach((id) => {
            if (!currentIds.has(id)) {
                const name = this.participantNames.get(id) ?? 'A player';
                this.enqueueAlert(`${name} left`);
                playerLeft = true;
                delete this.playerAnchors[id];
            }
        });

        this.participantNames.clear();
        participants.forEach((player) => {
            this.participantNames.set(player.id, player.getProfile().name);
        });
        this.lastParticipantIds = currentIds;
        this.players = participants;

        if (playerLeft) {
            this.fillMissingBots();
        }
    }

    private fillMissingBots(): void {
        if (!isHost()) return;
        if (this.isFillingBots) return;

        const count = Object.keys(getParticipants()).length;
        const missing = Math.max(0, this.maxPlayers - count);

        if (missing === 0) return;

        this.isFillingBots = true;

        const addMissing = async () => {
            for (let i = 0; i < missing; i += 1) {
                await addBot();
            }
            this.isFillingBots = false;
        };

        addMissing();
    }

    private checkHostChanges(): void {
        const hostId = getState('hostId') as string | undefined;

        if (!hostId && isHost()) {
            setState('hostId', myPlayer().id);
            return;
        }

        if (!this.hostInitialized) {
            this.lastHostId = hostId;
            this.hostInitialized = Boolean(hostId);
            return;
        }

        if (hostId && this.lastHostId && hostId !== this.lastHostId) {
            const name = this.participantNames.get(hostId) ?? 'Unknown';
            this.enqueueAlert(`Host left. New host is ${name}`);
        }

        this.lastHostId = hostId;
    }

    private checkRoundAlerts(): void {
        const round = getState('round') as number | undefined;
        const summaryOpen = Boolean(getState('roundSummaryOpen'));

        if (summaryOpen && !this.lastRoundSummaryOpen && round) {
            this.enqueueAlert(`Round ${round} over`);
        }

        if (typeof round === 'number' && this.lastRound != null && round !== this.lastRound) {
            this.enqueueAlert(`Round ${round} begins`);
        }

        this.lastRoundSummaryOpen = summaryOpen;
        this.lastRound = round;
    }

    private checkGameOverAlert(): void {
        const gameOver = Boolean(getState('gameOver'));
        if (gameOver && !this.lastGameOver) {
            this.enqueueAlert('Game over');
        }
        this.lastGameOver = gameOver;
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