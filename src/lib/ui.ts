import { ASSET_KEYS, CARD_BACK_FRAME, CARD_HEIGHT, CARD_SCALE, CARD_WIDTH, CARD_SUIT_COLOR, CARD_SUIT_TO_COLOR, MenuItemId } from '@/lib/common';
import { PlayerState } from 'playroomkit';
import { MENU_ITEMS } from '@/lib/common';
import { Card } from '@/lib/card';
import { getCardFrame } from '@/lib/deck';
import { CardSprite } from '@/lib/cardSprite';

export type PlayerAnchorPosition = 'bottom' | 'left' | 'top' | 'right';

export type PlayerAnchor = {
    x: number;
    y: number;
    position: PlayerAnchorPosition;
    turnHighlight?: Phaser.GameObjects.Graphics;
};

/**
 * Delay helper for UI flows (uses Phaser's clock).
 * @param scene - The active Phaser scene.
 * @param ms - Duration of delay in milliseconds.
 */
export function delayUi(scene: Phaser.Scene, ms: number): Promise<void> {
    return new Promise((resolve) => {
        scene.time.delayedCall(ms, () => resolve());
    });
}

// -- draw pile
export function createDrawPile(scene: Phaser.Scene, onDraw?: () => void): {
    drawPileCards: Phaser.GameObjects.Image[];
    drawButton: Phaser.GameObjects.Text;
    pileX: number;
    pileY: number;
} {
    const drawPileCards: Phaser.GameObjects.Image[] = [];
    const centerX = scene.scale.width / 2;
    const centerY = scene.scale.height / 2;

    for (let i = 0; i < 3; i += 1) {
        drawPileCards.push(createCard(scene, centerX + i * 10, centerY));
    }

    const drawButton = createButton(scene, centerX, centerY + 100, "Draw cards", () => onDraw?.());

    return { drawPileCards, drawButton, pileX: centerX, pileY: centerY };
}

export function renderPlayerHand(
    scene: Phaser.Scene,
    cards: Card[],
    previous: CardSprite[] = [],
    options?: { from?: { x: number; y: number }; staggerMs?: number },
    onFinishedAnimation?: () => void
): CardSprite[] {
    previous.forEach((sprite) => sprite.destroy());

    if (!cards.length) {
        return [];
    }

    const centerX = scene.scale.width / 2;
    const handY = scene.scale.height - 140;
    const spacing = Math.min(CARD_WIDTH * CARD_SCALE * 1, 60);
    const totalWidth = spacing * (cards.length - 1);
    const startX = centerX - totalWidth / 2;
    const fanAngle = 12;
    const angleStep = cards.length > 1 ? fanAngle / (cards.length - 1) : 0;

    const from = options?.from;
    const staggerMs = options?.staggerMs ?? 60;

    const lastIndex = cards.length - 1;

    return cards.map((card, index) => {
        const x = startX + spacing * index;
        const startXPos = from?.x ?? x;
        const startYPos = from?.y ?? handY;
        const angle = -fanAngle / 2 + angleStep * index;
        const sprite = new CardSprite(scene, startXPos, startYPos, ASSET_KEYS.CARDS, getCardFrame(card), card, CARD_SCALE);

        sprite.originalAngle = angle;
        sprite.setAngle(from ? 0 : angle);
        sprite.setOriginalDepth(index);

        if (!from) {
            sprite.originalX = x;
            sprite.originalY = handY;
        }

        sprite.enableInteractions();

        if (from) {
            scene.tweens.add({
                targets: sprite,
                x,
                y: handY,
                angle,
                duration: 350,
                delay: index * staggerMs,
                ease: 'Cubic.easeOut',
                onComplete: () => {
                    sprite.originalX = x;
                    sprite.originalY = handY;
                    sprite.originalAngle = angle;
                    sprite.setOriginalDepth(index);

                    if (index === lastIndex) {
                        onFinishedAnimation?.();
                    }
                }
            });
        }

        return sprite;
    });
}

function createCard(scene: Phaser.Scene, x: number, y: number): Phaser.GameObjects.Image {
    return scene.add.image(x - 10, y, ASSET_KEYS.CARDS, CARD_BACK_FRAME).setOrigin(0.5).setScale(CARD_SCALE);
}

export function createPlayerUI(scene: Phaser.Scene, player: PlayerState): PlayerAnchor {
    const barHeight = 80;
    const profileImageRadius = 50;
    const avatarSize = profileImageRadius * 2;
    const barY = scene.scale.height - barHeight;
    const avatarX = 30;
    const avatarY = barY - (profileImageRadius + 20);

    scene.add.rectangle(0, barY, scene.scale.width, barHeight).setOrigin(0, 0).setFillStyle(0x002200, 1);

    loadAvatar(scene, player.getProfile().photo, `avatar-${player.id}`, avatarX, avatarY, avatarSize);
    scene
        .add.circle(avatarX, avatarY, profileImageRadius)
        .setOrigin(0, 0)
        .setFillStyle(0x000000, 0.5)
        .setStrokeStyle(8, player.getProfile().color.hex);

    scene.add.text(avatarSize + 50, barY + 25, `Player: ${player.getProfile().name}`, { fontSize: '2.5vh' });

    return {
        x: avatarX + avatarSize + 80,
        y: barY - 22,
        position: 'bottom'
    };
}

export function createOtherPlayersUI(scene: Phaser.Scene, players: PlayerState[], localPlayerId: string): Record<string, PlayerAnchor> {
    const allIds = players.map(p => p.id).sort();
    const myIndex = allIds.indexOf(localPlayerId);

    const anchors: Record<string, PlayerAnchor> = {};
    const positions: Array<'left' | 'top' | 'right'> = ['left', 'top', 'right'];

    for (let i = 1; i < allIds.length; i++) {
        const nextIndex = (myIndex + i) % allIds.length;
        const pId = allIds[nextIndex];
        const player = players.find(p => p.id === pId);
        const pos = positions[i - 1];

        if (player && pos) {
            anchors[pId] = createSidePlayerUI(scene, player, pos, isBotPlayer(player));
        }
    }

    return anchors;
}

function isBotPlayer(player: PlayerState): boolean {
    const maybe = player as PlayerState & { isBot?: () => boolean };
    if (typeof maybe.isBot === 'function') {
        return maybe.isBot();
    }

    const profile = player.getProfile() as { name?: string; isBot?: boolean };
    return Boolean(profile.isBot) || /bot/i.test(profile.name ?? '');
}

function createSidePlayerUI(scene: Phaser.Scene, player: PlayerState, position: 'left' | 'top' | 'right', isBot: boolean): PlayerAnchor {
    const profileImageRadius = 32;
    const avatarSize = profileImageRadius * 2;
    const margin = 28;
    const panelPadding = 14;
    const panelWidth = position === 'top' ? 260 : 220;
    const panelHeight = 88;

    let panelX = margin;
    let panelY = margin;

    if (position === 'left') {
        panelX = margin;
        panelY = scene.scale.height / 2 - panelHeight / 2;
    }

    if (position === 'right') {
        panelX = scene.scale.width - margin - panelWidth;
        panelY = scene.scale.height / 2 - panelHeight / 2;
    }

    if (position === 'top') {
        panelX = scene.scale.width / 2 - panelWidth / 2;
        panelY = margin;
    }

    const shadow = scene.add.graphics();
    shadow.fillStyle(0x000000, 0.25);
    shadow.fillRoundedRect(panelX + 2, panelY + 4, panelWidth, panelHeight, 14);

    const panel = scene.add.graphics();
    panel.fillStyle(0x1c1f26, 0.95);
    panel.lineStyle(2, player.getProfile().color.hex, 0.9);
    panel.fillRoundedRect(panelX, panelY, panelWidth, panelHeight, 14);
    panel.strokeRoundedRect(panelX, panelY, panelWidth, panelHeight, 14);

    const highlight = scene.add.graphics();
    highlight.fillStyle(0xffffff, 0.08);
    highlight.fillRoundedRect(panelX + 2, panelY + 2, panelWidth - 4, 18, 12);

    const avatarX = panelX + panelPadding;
    const avatarY = panelY + (panelHeight - avatarSize) / 2;

    loadAvatar(scene, player.getProfile().photo, `avatar-${player.id}`, avatarX, avatarY, avatarSize);

    scene
        .add.circle(avatarX, avatarY, profileImageRadius)
        .setOrigin(0, 0)
        .setFillStyle(0x000000, 0.55)
        .setStrokeStyle(5, player.getProfile().color.hex);

    const nameStyle: Phaser.Types.GameObjects.Text.TextStyle = {
        fontSize: '16px',
        color: '#ffffff',
        fontStyle: 'bold'
    };

    const baseTextX = avatarX + avatarSize + 12;
    const profile = player.getProfile();
    /**
     * Indicates whether the current participant should be treated as a bot.
     * Determined by checking an explicit `isBot` flag on the profile or player,
     * or by matching "bot" in the profile name.
     */
    const botBadgeWidth = 36;
    const botBadgeHeight = 16;
    const botBadgeX = baseTextX;
    const nameY = panelY + 18;
    const nameX = player ? baseTextX + botBadgeWidth + 8 : baseTextX;

    if (isBot) {
        const botBadgeBg = scene.add.graphics();
        botBadgeBg.fillStyle(0xffd24a, 1);
        botBadgeBg.fillRoundedRect(botBadgeX, nameY + 2, botBadgeWidth, botBadgeHeight, 6);
        scene.add.text(botBadgeX + botBadgeWidth / 2, nameY + 2 + botBadgeHeight / 2, 'BOT', {
            fontSize: '10px',
            color: '#1a1a1a',
            fontStyle: 'bold'
        }).setOrigin(0.5);
    }

    const name = scene.add.text(nameX, nameY, profile.name, nameStyle);
    name.setOrigin(0, 0);

    const bidLabelX = baseTextX;
    const bidLabelY = panelY + panelHeight - 26;
    const bidLabel = scene.add.text(bidLabelX, bidLabelY, 'BID', {
        fontSize: '11px',
        color: '#9aa0a6',
        fontStyle: 'bold'
    });
    bidLabel.setOrigin(0, 0.5);

    const bidValue = '--';
    const bidText = scene.add.text(0, bidLabelY, bidValue, {
        fontSize: '14px',
        color: '#ffffff',
        fontStyle: 'bold'
    });
    bidText.setOrigin(0.5, 0.5);

    const bidBgWidth = 40;
    const bidBgHeight = 20;
    const bidBgX = bidLabelX + 28;
    const bidBgY = bidLabelY - bidBgHeight / 2;
    const bidBg = scene.add.graphics();
    bidBg.fillStyle(0x2a2f3a, 1);
    bidBg.fillRoundedRect(bidBgX, bidBgY, bidBgWidth, bidBgHeight, 8);

    bidText.setX(bidBgX + bidBgWidth / 2);

    const turnHighlight = scene.add.graphics();
    turnHighlight.lineStyle(3, 0xf7d560, 0.9);
    turnHighlight.strokeRoundedRect(panelX - 2, panelY - 2, panelWidth + 4, panelHeight + 4, 16);
    turnHighlight.setAlpha(0);

    if (position === 'left') {
        return {
            x: panelX + panelWidth + 16,
            y: panelY + panelHeight / 2,
            position: 'left',
            turnHighlight
        };
    }

    if (position === 'right') {
        return {
            x: panelX - 16,
            y: panelY + panelHeight / 2,
            position: 'right',
            turnHighlight
        };
    }

    return {
        x: panelX + panelWidth / 2,
        y: panelY + panelHeight + 16,
        position: 'top',
        turnHighlight
    };
}

function loadAvatar(scene: Phaser.Scene, url: string, key: string, x: number, y: number, size: number) {
    const add = () => {
        const r = size / 2;
        const img = scene.add.image(x, y, key).setOrigin(0, 0).setDisplaySize(size, size);
        const mask = scene.add.circle(x + r, y + r, r, 0xffffff, 0);
        img.setMask(mask.createGeometryMask());
    };

    if (scene.textures.exists(key)) {
        add();
    } else {
        scene.load.image(key, url);
        scene.load.once(Phaser.Loader.Events.COMPLETE, add);
        scene.load.start();
    }
}

export function createButton(scene: Phaser.Scene, x: number, y: number, label: string, onClick: () => void): Phaser.GameObjects.Text {
    const button = scene.add.text(x, y, label)
        .setOrigin(0.5)
        .setPadding(10)
        .setStyle({ backgroundColor: '#111', fontSize: '24px' })
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => onClick())
        .on('pointerover', () => button.setStyle({ fill: '#f39c12' }))
        .on('pointerout', () => button.setStyle({ fill: '#FFF' }));

    return button;
}

export function createMenuButtons(scene: Phaser.Scene, actions: Partial<Record<MenuItemId, () => void>> = {}) {
    const buttonSize = 40;
    const spacing = 15;
    const iconScale = 0.6;
    const cornerRadius = 8;

    const drawBg = (bg: Phaser.GameObjects.Graphics, color: number) => {
        bg.clear();
        bg.fillStyle(color, 1);
        bg.fillRoundedRect(-buttonSize / 2, -buttonSize / 2, buttonSize, buttonSize, cornerRadius);
    };

    const totalWidth = (MENU_ITEMS.length * buttonSize) + ((MENU_ITEMS.length - 1) * spacing);
    let x = scene.scale.width - totalWidth - 20 + (buttonSize / 2);
    const y = 40;

    MENU_ITEMS.forEach((item) => {
        const container = scene.add.container(x, y);
        const bg = scene.add.graphics();
        drawBg(bg, 0xffffff);
        container.add(bg);

        const icon = scene.add.image(0, 0, item.icon).setDisplaySize(buttonSize * iconScale, buttonSize * iconScale);
        container.add(icon);

        const label = scene.add.text(0, (buttonSize / 2) + 5, item.label, {
            fontSize: '14px',
            color: '#ffffff',
            align: 'center'
        }).setOrigin(0.5, 0).setVisible(false);
        container.add(label);

        const hitArea = new Phaser.Geom.Rectangle(-buttonSize / 2, -buttonSize / 2, buttonSize, buttonSize);
        container.setInteractive({
            hitArea,
            hitAreaCallback: Phaser.Geom.Rectangle.Contains,
            useHandCursor: true
        });

        container.on('pointerdown', () => actions[item.id]?.() ?? console.log(`[Menu] ${item.label} clicked`));
        container.on('pointerover', () => {
            drawBg(bg, 0xdddddd);
            label.setVisible(true);
        });
        container.on('pointerout', () => {
            drawBg(bg, 0xffffff);
            label.setVisible(false);
        });

        x += buttonSize + spacing;
    });
}

export type ChatWindow = {
    container: Phaser.GameObjects.Container;
    messagesContainer: Phaser.GameObjects.Container;
    messagesBounds: Phaser.Geom.Rectangle;
    panelBounds: Phaser.Geom.Rectangle;
    inputText: Phaser.GameObjects.Text;
    inputBg: Phaser.GameObjects.Graphics;
    drawInputBg: (focused: boolean) => void;
    inputHitArea: Phaser.GameObjects.Rectangle;
    closeButton: Phaser.GameObjects.Text;
};

export function createChatWindow(
    scene: Phaser.Scene,
    options: { onClose: () => void; title?: string; width?: number; height?: number } 
): ChatWindow {
    const width = options.width ?? 360;
    const height = options.height ?? 320;
    const panelX = scene.scale.width - width - 24;
    const panelY = 80;
    const padding = 14;
    const headerHeight = 28;
    const inputHeight = 40;
    const inputGap = 10;

    const container = scene.add.container(0, 0);

    const panel = scene.add.graphics();
    panel.fillStyle(0x111827, 0.95);
    panel.lineStyle(2, 0x4b5563, 1);
    panel.fillRoundedRect(panelX, panelY, width, height, 12);
    panel.strokeRoundedRect(panelX, panelY, width, height, 12);
    container.add(panel);

    const title = scene.add.text(panelX + padding, panelY + padding, options.title ?? 'Lobby Chat', {
        fontSize: '16px',
        color: '#f9fafb',
        fontStyle: 'bold'
    });
    container.add(title);

    const closeButton = scene.add.text(panelX + width - padding, panelY + padding - 2, '×', {
        fontSize: '20px',
        color: '#e5e7eb'
    }).setOrigin(1, 0).setInteractive({ useHandCursor: true });
    closeButton.on('pointerdown', () => options.onClose());
    container.add(closeButton);

    const messagesPanelY = panelY + padding + headerHeight;
    const messagesHeight = height - headerHeight - inputHeight - padding * 2 - inputGap;
    const messagesBg = scene.add.graphics();
    messagesBg.fillStyle(0x1f2937, 0.9);
    messagesBg.fillRoundedRect(panelX + padding, messagesPanelY, width - padding * 2, messagesHeight, 10);
    container.add(messagesBg);

    const messagesContainer = scene.add.container(panelX + padding + 8, messagesPanelY + 8);
    container.add(messagesContainer);
    const messagesBounds = new Phaser.Geom.Rectangle(
        panelX + padding + 8,
        messagesPanelY + 8,
        width - padding * 2 - 16,
        messagesHeight - 16
    );

    const inputY = panelY + height - inputHeight - padding;
    const inputBg = scene.add.graphics();
    const drawInputBg = (fillColor: number) => {
        inputBg.clear();
        inputBg.fillStyle(fillColor, 1);
        inputBg.lineStyle(1, 0x4b5563, 1);
        inputBg.fillRoundedRect(panelX + padding, inputY, width - padding * 2, inputHeight, 10);
        inputBg.strokeRoundedRect(panelX + padding, inputY, width - padding * 2, inputHeight, 10);
    };
    drawInputBg(0x111827);
    container.add(inputBg);

    const drawInputState = (focused: boolean) => {
        drawInputBg(focused ? 0x0f172a : 0x111827);
    };

    const inputHitArea = scene.add.rectangle(
        panelX + padding,
        inputY,
        width - padding * 2,
        inputHeight,
        0xffffff,
        0.001
    ).setOrigin(0, 0);
    inputHitArea.setInteractive({ cursor: 'text' });
    container.add(inputHitArea);

    const inputText = scene.add.text(panelX + padding + 10, inputY + 10, 'Type a message…', {
        fontSize: '13px',
        color: '#9ca3af'
    });
    container.add(inputText);

    container.setDepth(120);

    const panelBounds = new Phaser.Geom.Rectangle(panelX, panelY, width, height);

    return {
        container,
        messagesContainer,
        messagesBounds,
        panelBounds,
        inputText,
        inputBg,
        drawInputBg: drawInputState,
        inputHitArea,
        closeButton
    };
}

export function createBidBubble(
    scene: Phaser.Scene,
    anchor: PlayerAnchor,
    bid: number,
    existing?: Phaser.GameObjects.Container
): Phaser.GameObjects.Container {
    existing?.destroy();

    const width = 56;
    const height = 32;
    const tailSize = 8;
    const container = scene.add.container(anchor.x, anchor.y);
    const bg = scene.add.graphics();

    bg.fillStyle(0xffffff, 1);
    bg.lineStyle(2, 0x333333, 1);
    bg.fillRoundedRect(-width / 2, -height / 2, width, height, 8);
    bg.strokeRoundedRect(-width / 2, -height / 2, width, height, 8);

    if (anchor.position === 'bottom') {
        bg.fillTriangle(0, height / 2, -tailSize, height / 2 + tailSize, tailSize, height / 2 + tailSize);
    } else if (anchor.position === 'top') {
        bg.fillTriangle(0, -height / 2, -tailSize, -height / 2 - tailSize, tailSize, -height / 2 - tailSize);
    } else if (anchor.position === 'left') {
        bg.fillTriangle(-width / 2, 0, -width / 2 - tailSize, -tailSize, -width / 2 - tailSize, tailSize);
    } else {
        bg.fillTriangle(width / 2, 0, width / 2 + tailSize, -tailSize, width / 2 + tailSize, tailSize);
    }

    const text = scene.add.text(0, 0, `${bid}`, {
        fontSize: '16px',
        color: '#111'
    }).setOrigin(0.5);

    container.add([bg, text]);
    container.setDepth(50);
    return container;
}

export function createBidModal(scene: Phaser.Scene, maxBid: number, onSelect: (bid: number) => void): Phaser.GameObjects.Container {
    const container = scene.add.container(0, 0);
    const overlay = scene.add.rectangle(0, 0, scene.scale.width, scene.scale.height, 0x000000, 0.5).setOrigin(0, 0);

    const panelWidth = 320;
    const panelHeight = 400;
    const panelX = scene.scale.width / 2 - panelWidth / 2;
    const panelY = scene.scale.height / 2 - panelHeight / 2;

    const panel = scene.add.graphics();
    panel.fillStyle(0xd1d5db, 1);
    panel.fillRoundedRect(panelX, panelY, panelWidth, panelHeight, 16);

    const title = scene.add.text(scene.scale.width / 2, panelY + 20, 'Place your bid', {
        fontSize: '18px',
        color: '#1f2937',
        fontStyle: 'bold'
    }).setOrigin(0.5, 0);

    let selectedBid: number | null = null;
    const keyStates = new Map<number, {
        bg: Phaser.GameObjects.Graphics;
        text: Phaser.GameObjects.Text;
        interactive: Phaser.GameObjects.Rectangle;
        disabled: boolean;
        drawButton: (state: 'normal' | 'hover' | 'selected' | 'disabled') => void;
    }>();

    // Keyboard layout
    const buttons: (Phaser.GameObjects.Graphics | Phaser.GameObjects.Text | Phaser.GameObjects.Rectangle)[] = [];
    const buttonSize = 80;
    const buttonGap = 8;
    const keypadStartY = panelY + 60;
    const keypadStartX = panelX + (panelWidth - (3 * buttonSize + 2 * buttonGap)) / 2;

    // Confirm button (created early so key handlers can reference it)
    const confirmButtonY = panelY + 60 + (buttonSize + buttonGap) * 3 + 10;
    const confirmButtonWidth = 3 * buttonSize + 2 * buttonGap;
    const confirmButtonHeight = 50;

    const confirmBg = scene.add.graphics();
    const drawConfirmButton = (state: 'normal' | 'hover' | 'press') => {
        confirmBg.clear();

        switch (state) {
            case 'press': confirmBg.fillStyle(0x059669, 1); break;
            case 'hover': confirmBg.fillStyle(0x10b981, 1); break;
            default: confirmBg.fillStyle(0x10b981, 1); break;
        }
        
        confirmBg.fillRoundedRect(keypadStartX, confirmButtonY, confirmButtonWidth, confirmButtonHeight, 12);
        if (state === 'hover') {
            confirmBg.strokeRoundedRect(keypadStartX, confirmButtonY, confirmButtonWidth, confirmButtonHeight, 12);
        }
    };
    drawConfirmButton('normal');

    const confirmText = scene.add.text(
        keypadStartX + confirmButtonWidth / 2,
        confirmButtonY + confirmButtonHeight / 2,
        'Confirm Bid',
        {
            fontSize: '20px',
            color: '#ffffff',
            fontStyle: 'bold'
        }
    ).setOrigin(0.5);

    const confirmButton = scene.add.container(0, 0, [confirmBg, confirmText]);
    confirmButton.setAlpha(0).setScale(0.9).setVisible(false);

    const confirmHitArea = new Phaser.Geom.Rectangle(0, 0, confirmButtonWidth, confirmButtonHeight);
    const confirmInteractive = scene.add.rectangle(keypadStartX, confirmButtonY, confirmButtonWidth, confirmButtonHeight, 0xffffff, 0.001)
        .setOrigin(0, 0)
        .setInteractive({
            hitArea: confirmHitArea,
            hitAreaCallback: Phaser.Geom.Rectangle.Contains,
            useHandCursor: true
        });
    confirmInteractive.setVisible(false);

    const setConfirmVisible = (visible: boolean) => {
        confirmButton.setVisible(visible);
        confirmInteractive.setVisible(visible);
        if (visible) {
            confirmButton.setAlpha(1).setScale(1);
        }
    };

    confirmInteractive.on('pointerdown', () => {
        if (selectedBid !== null) {
            drawConfirmButton('press');
            scene.time.delayedCall(150, () => {
                onSelect(selectedBid!);
            });
        }
    });

    confirmInteractive.on('pointerover', () => {
        drawConfirmButton('hover');
    });

    confirmInteractive.on('pointerout', () => {
        drawConfirmButton('normal');
        scene.tweens.add({
            targets: confirmButton,
            scale: 1,
            duration: 100,
            ease: 'Cubic.easeOut'
        });
    });

    const createKey = (x: number, y: number, value: number, isWide = false) => {
        const width = isWide ? buttonSize * 2 + buttonGap : buttonSize;
        const height = buttonSize;
        const isDisabled = value > maxBid;

        const bg = scene.add.graphics();
        const drawButton = (state: 'normal' | 'hover' | 'selected' | 'disabled') => {
            bg.clear();
            
            if (state === 'disabled') {
                bg.fillStyle(0x9ca3af, 0.3);
                bg.fillRoundedRect(x, y, width, height, 12);
            } else if (state === 'selected') {
                bg.fillStyle(0x10b981, 1);
                bg.lineStyle(3, 0x059669, 1);
                bg.fillRoundedRect(x, y, width, height, 12);
                bg.strokeRoundedRect(x, y, width, height, 12);
            } else if (state === 'hover') {
                bg.fillStyle(0xe5e7eb, 1);
                bg.lineStyle(2, 0xd1d5db, 1);
                bg.fillRoundedRect(x, y, width, height, 12);
                bg.strokeRoundedRect(x, y, width, height, 12);
            } else {
                bg.fillStyle(0xffffff, 1);
                bg.fillRoundedRect(x, y, width, height, 12);
            }
        };
        
        drawButton(isDisabled ? 'disabled' : 'normal');

        const text = scene.add.text(x + width / 2, y + height / 2, `${value}`, {
            fontSize: '24px',
            color: isDisabled ? '#6b7280' : '#1f2937',
            fontStyle: 'bold'
        }).setOrigin(0.5);

        const hitArea = new Phaser.Geom.Rectangle(0, 0, width, height);
        const interactive = scene.add.rectangle(x, y, width, height, 0xffffff, 0.001)
            .setOrigin(0, 0)
            .setInteractive({
                hitArea,
                hitAreaCallback: Phaser.Geom.Rectangle.Contains,
                useHandCursor: !isDisabled
            });

        keyStates.set(value, { bg, text, interactive, disabled: isDisabled, drawButton });

        if (!isDisabled) {
            interactive.on('pointerdown', () => {
                if (selectedBid !== null && selectedBid !== value) {
                    const prevKey = keyStates.get(selectedBid);
                    if (prevKey && !prevKey.disabled) {
                        prevKey.drawButton('normal');
                        prevKey.text.setColor('#1f2937');
                    }
                }

                selectedBid = value;
                drawButton('selected');
                text.setColor('#ffffff');

                // Show confirm button
                setConfirmVisible(true);
                scene.tweens.add({
                    targets: confirmButton,
                    alpha: 1,
                    scale: 1,
                    duration: 200,
                    ease: 'Back.easeOut'
                });
            });

            interactive.on('pointerover', () => {
                if (selectedBid !== value) {
                    drawButton('hover');
                }
            });

            interactive.on('pointerout', () => {
                if (selectedBid !== value) {
                    drawButton('normal');
                }
            });
        } else {
            interactive.disableInteractive();
        }

        buttons.push(bg, text, interactive);
    };

    // Row 1: [0 wide] [1]
    createKey(keypadStartX, keypadStartY, 0, true);
    createKey(keypadStartX + 2 * buttonSize + 2 * buttonGap, keypadStartY, 1);

    // Row 2: [2] [3] [4]
    const row2Y = keypadStartY + buttonSize + buttonGap;
    createKey(keypadStartX, row2Y, 2);
    createKey(keypadStartX + buttonSize + buttonGap, row2Y, 3);
    createKey(keypadStartX + 2 * (buttonSize + buttonGap), row2Y, 4);

    // Row 3: [5] [6] [7]
    const row3Y = row2Y + buttonSize + buttonGap;
    createKey(keypadStartX, row3Y, 5);
    createKey(keypadStartX + buttonSize + buttonGap, row3Y, 6);
    createKey(keypadStartX + 2 * (buttonSize + buttonGap), row3Y, 7);

    container.add([overlay, panel, title, ...buttons, confirmButton, confirmInteractive]);
    container.setDepth(100);
    return container;
}

export function createTurnText(scene: Phaser.Scene): Phaser.GameObjects.Text {
    return scene.add.text(scene.scale.width / 2, 16, 'Turn: --', {
        fontSize: '18px',
        color: '#ffffff'
    }).setOrigin(0.5, 0);
}

export function animateTrumpSelection(
    scene: Phaser.Scene,
    trumpCard: Card | null,
    drawPileCards: Phaser.GameObjects.Image[],
    onFinishedAnimation?: () => void
) {
    if (!trumpCard || !drawPileCards.length) {
        onFinishedAnimation?.();
        return;
    }

    const anchor = drawPileCards[0];
    const startX = anchor.x;
    const startY = anchor.y;
    const cardWidth = CARD_WIDTH * CARD_SCALE;

    const sprite = new CardSprite(scene, startX, startY, ASSET_KEYS.CARDS, getCardFrame(trumpCard), trumpCard, CARD_SCALE);
    sprite.setDepth(12);
    sprite.setAlpha(0);

    showTrumpCardText(scene, trumpCard);

    scene.tweens.add({
        targets: sprite,
        x: startX + cardWidth * 0.65,
        y: startY,
        alpha: 1,
        angle: -8,
        duration: 700,
        ease: 'Cubic.easeOut',
        onComplete: () => {
            onFinishedAnimation?.();
            sprite.destroy();
        }
    });
}

let trumpCardText: Phaser.GameObjects.Container | null = null;

function showTrumpCardText(scene: Phaser.Scene, trumpCard: Card | null) {
    if (!trumpCard) { return; }

    trumpCardText?.destroy();
    trumpCardText = null;

    const centerX = scene.scale.width / 2;
    const centerY = scene.scale.height / 2 - 260;

    const prefix = 'The trump suit is ';
    const suitLabel = trumpCard.suit;
    const suitColorKey = CARD_SUIT_TO_COLOR[suitLabel];
    const isRedSuit = suitColorKey === CARD_SUIT_COLOR.RED;
    const suitColor = isRedSuit ? '#ef4444' : '#111111';

    const prefixText = scene.add.text(0, 0, prefix, {
        fontSize: '25px',
        color: '#ffffff',
        fontStyle: 'bold'
    }).setOrigin(0, 0.5);

    const suitText = scene.add.text(0, 0, suitLabel, {
        fontSize: '25px',
        color: suitColor,
        fontStyle: '900'
    }).setOrigin(0, 0.5);

    const totalWidth = prefixText.width + suitText.width;
    prefixText.setX(-totalWidth / 2);
    suitText.setX(-totalWidth / 2 + prefixText.width);

    trumpCardText = scene.add.container(centerX, centerY, [prefixText, suitText]);
    trumpCardText.setDepth(15);
}

export function moveDrawPileToTopLeft(
    scene: Phaser.Scene,
    drawPileCards: Phaser.GameObjects.Image[]
): { x: number; y: number } {
    if (!drawPileCards.length) {
        return { x: 0, y: 0 };
    }

    const margin = 24;
    const cardWidth = CARD_WIDTH * CARD_SCALE;
    const cardHeight = CARD_HEIGHT * CARD_SCALE;
    const targetX = cardWidth / 2 + margin;
    const targetY = cardHeight / 2 + margin;

    if (trumpCardText) {
        scene.tweens.add({
            targets: trumpCardText,
            x: targetX + 80,
            y: targetY + 90,
            scale: 0.70,
            duration: 300,
            ease: 'Cubic.easeOut'
        });
    }

    drawPileCards.forEach((card, index) => {
        scene.tweens.add({
            targets: card,
            x: targetX + (index * 10),
            y: targetY,
            duration: 300,
            ease: 'Cubic.easeOut'
        });
    });

    return { x: targetX, y: targetY };
}

export function renderTrumpCardNextToDeck(
    scene: Phaser.Scene,
    trumpCard: Card | null,
    existing: CardSprite | undefined,
    deckPosition: { x: number; y: number }
): CardSprite | undefined {
    if (!trumpCard) {
        return existing;
    }

    existing?.destroy();

    const margin = 24;
    const cardWidth = CARD_WIDTH * CARD_SCALE;
    const x = deckPosition.x + cardWidth + margin;
    const y = deckPosition.y;

    const sprite = new CardSprite(scene, x, y, ASSET_KEYS.CARDS, getCardFrame(trumpCard), trumpCard, CARD_SCALE);
    sprite.setDepth(10);
    return sprite;
}

export function renderTrickCards(
    scene: Phaser.Scene,
    cardsWithPositions: Array<{ card: Card; position: PlayerAnchorPosition }>,
    previous: CardSprite[] = []
): CardSprite[] {
    previous.forEach((sprite) => sprite.destroy());

    if (!cardsWithPositions.length) {
        return [];
    }

    const centerX = scene.scale.width / 2;
    const centerY = scene.scale.height / 2 - 10;
    
    // Map player positions to card offsets
    const offsetMap: Record<PlayerAnchorPosition, { x: number; y: number; angle: number }> = {
        'top': { x: 0, y: -50, angle: 0 },
        'left': { x: -60, y: 0, angle: -8 },
        'right': { x: 60, y: 0, angle: 8 },
        'bottom': { x: 0, y: 60, angle: 0 }
    };

    return cardsWithPositions.map(({ card, position }, index) => {
        const offset = offsetMap[position] ?? { x: index * 6, y: index * 6, angle: 0 };
        const sprite = new CardSprite(
            scene,
            centerX + offset.x,
            centerY + offset.y,
            ASSET_KEYS.CARDS,
            getCardFrame(card),
            card,
            CARD_SCALE
        );
        sprite.setAngle(offset.angle);
        sprite.setDepth(20 + index);
        sprite.setAlpha(0);
        sprite.setScale(CARD_SCALE * 0.85);
        scene.tweens.add({
            targets: sprite,
            alpha: 1,
            scale: CARD_SCALE,
            duration: 260,
            ease: 'Cubic.easeOut'
        });
        return sprite;
    });
}
