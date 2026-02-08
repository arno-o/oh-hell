import { ASSET_KEYS, CARD_BACK_FRAME, CARD_HEIGHT, CARD_WIDTH, CARD_SUIT_COLOR, CARD_SUIT_TO_COLOR, MenuItemId } from '@/lib/common';
import { getCardScale, getTrickCardScale, getUILayout } from '@/lib/layout';
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
    bidText?: Phaser.GameObjects.Text;
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
    const layout = getUILayout(scene);
    const centerX = layout.centerX;
    // On mobile, center the draw pile in the play area — same zone as trick cards
    const centerY = layout.isMobile ? layout.pctH(45) : layout.centerY;
    const cardOffset = layout.isMobile ? 6 : 10;
    const buttonOffset = layout.isMobile ? 80 : 100;
    // Use trick card scale for the draw pile on mobile so it doesn't dominate center
    const cardScale = layout.isMobile ? getTrickCardScale(scene) : getCardScale(scene);

    for (let i = 0; i < 3; i += 1) {
        drawPileCards.push(createCard(scene, centerX + i * cardOffset, centerY, cardScale));
    }

    const drawButton = createButton(scene, centerX, centerY + buttonOffset, "Draw cards", () => onDraw?.());

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

    const layout = getUILayout(scene);
    const centerX = layout.centerX;
    const cardScale = getCardScale(scene);
    const cardWidth = CARD_WIDTH * cardScale;
    const cardHeight = CARD_HEIGHT * cardScale;

    let handY: number;
    let spacing: number;
    let fanAngle: number;

    if (layout.isMobile) {
        // Mobile: large cards in a horizontal strip.
        // Bottom portion gets clipped by the slim player bar — intentional,
        // since rank/suit are shown in the top-left corner of each card.
        const bottomBarHeight = layout.pctH(6);
        handY = layout.height - bottomBarHeight - cardHeight * 0.42;

        const availableWidth = layout.width - layout.pctW(4);
        // Show ~55% of each card so rank/suit are always visible
        const idealSpacing = cardWidth * 0.55;
        const maxFitSpacing = (availableWidth - cardWidth) / Math.max(1, cards.length - 1);
        spacing = Math.min(idealSpacing, maxFitSpacing);
        fanAngle = 0; // No fan on mobile — straight horizontal strip
    } else {
        handY = layout.height - 140;
        const maxSpacing = 60;
        spacing = Math.min(cardWidth, maxSpacing);
        fanAngle = 12;
    }

    const totalWidth = spacing * (cards.length - 1);
    const startX = centerX - totalWidth / 2;
    const angleStep = cards.length > 1 ? fanAngle / (cards.length - 1) : 0;

    const from = options?.from;
    const staggerMs = options?.staggerMs ?? 60;

    const lastIndex = cards.length - 1;

    return cards.map((card, index) => {
        const x = startX + spacing * index;
        const startXPos = from?.x ?? x;
        const startYPos = from?.y ?? handY;
        const angle = layout.isMobile ? 0 : (-fanAngle / 2 + angleStep * index);
        const sprite = new CardSprite(scene, startXPos, startYPos, ASSET_KEYS.CARDS, getCardFrame(card), card, cardScale);

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
                onStart: () => {
                    scene.sound.play(ASSET_KEYS.AUDIO_CARD_SPREAD, { volume: 0.3 });
                },
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

function createCard(scene: Phaser.Scene, x: number, y: number, cardScale: number): Phaser.GameObjects.Image {
    return scene.add.image(x, y, ASSET_KEYS.CARDS, CARD_BACK_FRAME).setOrigin(0.5).setScale(cardScale);
}

export function createPlayerUI(scene: Phaser.Scene, player: PlayerState): PlayerAnchor {
    const layout = getUILayout(scene);

    if (layout.isMobile) {
        // Mobile: slim bottom bar — avatar + name, menu buttons go here too
        const barHeight = layout.pctH(6);
        const barY = layout.height - barHeight;
        const avatarRadius = Math.round(barHeight * 0.38);
        const avatarSize = avatarRadius * 2;
        const avatarX = layout.pctW(2);
        const avatarY = barY + (barHeight - avatarSize) / 2;

        scene.add.rectangle(0, barY, layout.width, barHeight, 0x002200, 1).setOrigin(0, 0).setDepth(5);

        loadAvatar(scene, player.getProfile().photo, `avatar-${player.id}`, avatarX, avatarY, avatarSize);
        const circle = scene.add.circle(avatarX, avatarY, avatarRadius)
            .setOrigin(0, 0)
            .setFillStyle(0x000000, 0.5)
            .setStrokeStyle(3, player.getProfile().color.hex);
        circle.setDepth(6);

        scene.add.text(avatarX + avatarSize + layout.pctW(2), barY + barHeight / 2, player.getProfile().name, {
            fontSize: `${Math.max(13, Math.round(layout.width / 30))}px`,
            color: '#ffffff',
            fontStyle: 'bold'
        }).setOrigin(0, 0.5).setDepth(6);

        return {
            x: layout.centerX,
            y: layout.pctH(48), // trick card anchor for local player — below center
            position: 'bottom'
        };
    }

    // Desktop: original layout
    const barHeight = 80;
    const profileImageRadius = 50;
    const avatarSize = profileImageRadius * 2;
    const barY = scene.scale.height - barHeight;
    const avatarX = layout.safeSide;
    const avatarY = barY - (profileImageRadius + 20);

    scene.add.rectangle(0, barY, scene.scale.width, barHeight).setOrigin(0, 0).setFillStyle(0x002200, 1);

    loadAvatar(scene, player.getProfile().photo, `avatar-${player.id}`, avatarX, avatarY, avatarSize);
    scene
        .add.circle(avatarX, avatarY, profileImageRadius)
        .setOrigin(0, 0)
        .setFillStyle(0x000000, 0.5)
        .setStrokeStyle(8, player.getProfile().color.hex);

    scene.add.text(avatarSize + 50, barY + 25, `Player: ${player.getProfile().name}`, {
        fontSize: '18px'
    });

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

export function createSidePlayerUI(scene: Phaser.Scene, player: PlayerState, position: 'left' | 'top' | 'right', isBot: boolean): PlayerAnchor {
    const layout = getUILayout(scene);

    if (layout.isMobile) {
        // Mobile: wider pill badges along the top with bid integrated inside
        const pillHeight = layout.pctH(5);
        const avatarRadius = Math.round(pillHeight * 0.38);
        const avatarSize = avatarRadius * 2;
        const pillPadding = layout.pctW(1.5);
        const fontSize = Math.max(14, Math.round(layout.width / 28));

        // Position pills: left → top-left, top → top-center, right → top-right
        const pillY = layout.pctH(1);
        let pillX: number;
        const pillWidth = layout.pctW(31);

        if (position === 'left') {
            pillX = layout.pctW(1);
        } else if (position === 'right') {
            pillX = layout.width - layout.pctW(1) - pillWidth;
        } else {
            pillX = layout.centerX - pillWidth / 2;
        }

        // Pill background
        const panel = scene.add.graphics();
        panel.fillStyle(0x1c1f26, 0.92);
        panel.lineStyle(2, player.getProfile().color.hex, 0.9);
        panel.fillRoundedRect(pillX, pillY, pillWidth, pillHeight, pillHeight / 2);
        panel.strokeRoundedRect(pillX, pillY, pillWidth, pillHeight, pillHeight / 2);

        // Avatar
        const avatarX = pillX + pillPadding;
        const avatarY = pillY + (pillHeight - avatarSize) / 2;
        loadAvatar(scene, player.getProfile().photo, `avatar-${player.id}`, avatarX, avatarY, avatarSize);
        scene.add.circle(avatarX, avatarY, avatarRadius)
            .setOrigin(0, 0)
            .setFillStyle(0x000000, 0.5)
            .setStrokeStyle(2, player.getProfile().color.hex);

        // Name — truncate to leave room for bid on the right
        const nameX = avatarX + avatarSize + pillPadding;
        const bidAreaWidth = layout.pctW(8); // reserve space for bid number on right
        const maxNameWidth = pillWidth - avatarSize - pillPadding * 3 - bidAreaWidth - (isBot ? 30 : 0);
        const nameText = scene.add.text(nameX, pillY + pillHeight / 2, player.getProfile().name, {
            fontSize: `${fontSize}px`,
            color: '#ffffff',
            fontStyle: 'bold'
        }).setOrigin(0, 0.5);

        if (nameText.width > maxNameWidth) {
            nameText.setStyle({ ...nameText.style, fixedWidth: maxNameWidth });
            nameText.setCrop(0, 0, maxNameWidth, nameText.height);
        }

        // Bot badge — small, next to name
        if (isBot) {
            const badgeX = nameX + Math.min(nameText.width, maxNameWidth) + 4;
            const badgeY = pillY + pillHeight / 2;
            const badgeBg = scene.add.graphics();
            badgeBg.fillStyle(0xffd24a, 1);
            badgeBg.fillRoundedRect(badgeX, badgeY - 7, 24, 14, 5);
            scene.add.text(badgeX + 12, badgeY, 'BOT', {
                fontSize: '8px',
                color: '#1a1a1a',
                fontStyle: 'bold'
            }).setOrigin(0.5);
        }

        // Bid text — right-aligned inside the pill
        const bidText = scene.add.text(pillX + pillWidth - pillPadding - 2, pillY + pillHeight / 2, '--', {
            fontSize: `${fontSize + 1}px`,
            color: '#f7d560',
            fontStyle: 'bold'
        }).setOrigin(1, 0.5);

        // Turn highlight
        const turnHighlight = scene.add.graphics();
        turnHighlight.lineStyle(2, 0xf7d560, 0.9);
        turnHighlight.strokeRoundedRect(pillX - 2, pillY - 2, pillWidth + 4, pillHeight + 4, pillHeight / 2 + 2);
        turnHighlight.setAlpha(0);

        // Trick card anchor — in the play area, spread by position
        let anchorX: number;
        const anchorY = layout.pctH(35);
        if (position === 'left') {
            anchorX = layout.pctW(30);
        } else if (position === 'right') {
            anchorX = layout.pctW(70);
        } else {
            anchorX = layout.centerX;
        }

        return {
            x: anchorX,
            y: anchorY,
            position,
            turnHighlight,
            bidText
        };
    }

    // ---- Desktop layout ----
    const profileImageRadius = 32;
    const avatarSize = profileImageRadius * 2;
    const margin = layout.safeSide;
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
        panelY = layout.safeTop;
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

    const bidBgWidth = 40;
    const bidBgHeight = 20;
    const bidBgX = bidLabelX + 28;
    const bidBgY = bidLabelY - bidBgHeight / 2;
    const bidBg = scene.add.graphics();
    bidBg.fillStyle(0x2a2f3a, 1);
    bidBg.fillRoundedRect(bidBgX, bidBgY, bidBgWidth, bidBgHeight, 8);

    const bidValue = '--';
    const bidText = scene.add.text(0, bidLabelY, bidValue, {
        fontSize: '14px',
        color: '#ffffff',
        fontStyle: 'bold'
    });
    bidText.setOrigin(0.5, 0.5);

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
            turnHighlight,
            bidText
        };
    }

    if (position === 'right') {
        return {
            x: panelX - 16,
            y: panelY + panelHeight / 2,
            position: 'right',
            turnHighlight,
            bidText
        };
    }

    return {
        x: panelX + panelWidth / 2,
        y: panelY + panelHeight + 16,
        position: 'top',
        turnHighlight,
        bidText
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
    const layout = getUILayout(scene);
    const fontSize = layout.isMobile ? 20 : 24;
    const padding = 10;
    const button = scene.add.text(x, y, label)
        .setOrigin(0.5)
        .setPadding(padding)
        .setStyle({ backgroundColor: '#111', fontSize: `${fontSize}px` })
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => {
            scene.sound.play(ASSET_KEYS.AUDIO_BUTTON_3, { volume: 0.3 });
            onClick();
        })
        .on('pointerover', () => button.setStyle({ fill: '#f39c12' }))
        .on('pointerout', () => button.setStyle({ fill: '#FFF' }));

    return button;
}

export function createMenuButtons(scene: Phaser.Scene, actions: Partial<Record<MenuItemId, () => void>> = {}) {
    const layout = getUILayout(scene);
    const buttonSize = layout.isMobile ? 32 : 40;
    const spacing = layout.isMobile ? 10 : 15;
    const iconScale = 0.6;
    const cornerRadius = 8;

    const drawBg = (bg: Phaser.GameObjects.Graphics, color: number) => {
        bg.clear();
        bg.fillStyle(color, 1);
        bg.fillRoundedRect(-buttonSize / 2, -buttonSize / 2, buttonSize, buttonSize, cornerRadius);
    };

    const totalWidth = (MENU_ITEMS.length * buttonSize) + ((MENU_ITEMS.length - 1) * spacing);
    // On mobile, put menu buttons in the bottom-right corner (inside the player bar)
    let x: number;
    let y: number;
    if (layout.isMobile) {
        x = layout.width - totalWidth - layout.pctW(2) + (buttonSize / 2);
        y = layout.height - layout.pctH(3.5);
    } else {
        x = scene.scale.width - totalWidth - layout.safeSide + (buttonSize / 2);
        y = layout.safeTop;
    }

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

        container.on('pointerdown', () => {
            actions[item.id]?.();
            scene.sound.play(ASSET_KEYS.AUDIO_UI_CLICK, { volume: 0.4 }) ?? console.log(`[Menu] ${item.label} clicked`);
        });
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

export type RoundSummaryResult = {
    playerId: string;
    playerName: string;
    color?: string;
    bid: number;
    tricks: number;
    points: number;
    total: number;
};

export type RoundSummaryData = {
    round: number;
    results: RoundSummaryResult[];
};

export type RoundSummaryPanel = {
    container: Phaser.GameObjects.Container;
    textNodes: Phaser.GameObjects.Text[];
};

export type AlertToast = {
    container: Phaser.GameObjects.Container;
    height: number;
};

export function createChatWindow(
    scene: Phaser.Scene,
    options: { onClose: () => void; title?: string; width?: number; height?: number } 
): ChatWindow {
    const layout = getUILayout(scene);
    const maxWidth = layout.width - layout.safeSide * 2;
    const maxHeight = layout.height - layout.safeTop - layout.safeBottom - 60;
    const width = Math.min(options.width ?? (layout.isMobile ? maxWidth : 360), maxWidth);
    const height = Math.min(options.height ?? (layout.isMobile ? maxHeight * 0.65 : 320), maxHeight);
    const panelX = layout.isMobile ? layout.safeSide : layout.width - width - layout.safeSide;
    const panelY = layout.safeTop + 40;
    const padding = 14;
    const headerHeight = 28;
    const inputHeight = layout.isMobile ? 36 : 40;
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
    const messagesMaskShape = scene.add.graphics();
    messagesMaskShape.fillStyle(0xffffff, 1);
    messagesMaskShape.fillRect(messagesBounds.x, messagesBounds.y, messagesBounds.width, messagesBounds.height);
    messagesContainer.setMask(messagesMaskShape.createGeometryMask());
    messagesMaskShape.setVisible(false);

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

export function createAlertToast(
    scene: Phaser.Scene,
    message: string,
    options: { width?: number; bgColor?: number; textColor?: string } = {}
): AlertToast {
    const layout = getUILayout(scene);
    const maxWidth = layout.width - layout.safeSide * 2;
    const width = Math.min(options.width ?? (layout.isMobile ? maxWidth : 360), maxWidth);
    const paddingX = 16;
    const paddingY = 12;
    const textColor = options.textColor ?? '#f9fafb';
    const bgColor = options.bgColor ?? 0x111827;

    const container = scene.add.container(0, 0);
    container.setDepth(1000);

    const text = scene.add.text(0, 0, message, {
        fontSize: '14px',
        color: textColor,
        align: 'center',
        wordWrap: { width: width - paddingX * 2 }
    });
    text.setOrigin(0.5, 0.5);

    const height = text.height + paddingY * 2;
    const background = scene.add.graphics();
    background.fillStyle(bgColor, 0.92);
    background.fillRoundedRect(-width / 2, -height / 2, width, height, 12);
    background.lineStyle(2, 0x334155, 0.9);
    background.strokeRoundedRect(-width / 2, -height / 2, width, height, 12);

    container.add(background);
    container.add(text);

    return { container, height };
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
    const layout = getUILayout(scene);
    const container = scene.add.container(0, 0);
    const overlay = scene.add.rectangle(0, 0, scene.scale.width, scene.scale.height, 0x000000, 0.5).setOrigin(0, 0);

    const panelWidth = Math.min(layout.isMobile ? 300 : 320, layout.width - layout.safeSide * 2);
    const panelHeight = Math.min(layout.isMobile ? 340 : 400, layout.height - layout.safeTop - layout.safeBottom);
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
    const buttonSize = layout.isMobile ? 64 : 80;
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
            scene.sound.play(ASSET_KEYS.AUDIO_BUTTON_3, { volume: 0.3 })
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
            fontSize: `${layout.isMobile ? 20 : 24}px`,
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
                    scene.sound.play(ASSET_KEYS.AUDIO_BUTTON_1, { volume: 0.3 })
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
    const layout = getUILayout(scene);
    const deckScale = layout.isMobile ? getTrickCardScale(scene) : getCardScale(scene);
    const cardWidth = CARD_WIDTH * deckScale;

    const sprite = new CardSprite(scene, startX, startY, ASSET_KEYS.CARDS, getCardFrame(trumpCard), trumpCard, deckScale);
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

    const layout = getUILayout(scene);
    const centerX = layout.centerX;
    // On mobile, show between pills and trick area; on desktop, high up
    const centerY = layout.isMobile ? layout.pctH(15) : (layout.centerY - 260);

    const prefix = 'The trump suit is ';
    const suitLabel = trumpCard.suit;
    const suitColorKey = CARD_SUIT_TO_COLOR[suitLabel];
    const isRedSuit = suitColorKey === CARD_SUIT_COLOR.RED;
    const suitColor = isRedSuit ? '#ef4444' : '#111111';

    const mobileFontSize = Math.max(16, Math.round(layout.width / 22));
    const prefixText = scene.add.text(0, 0, prefix, {
        fontSize: `${layout.isMobile ? mobileFontSize : 25}px`,
        color: '#ffffff',
        fontStyle: 'bold'
    }).setOrigin(0, 0.5);

    const suitText = scene.add.text(0, 0, suitLabel, {
        fontSize: `${layout.isMobile ? mobileFontSize : 25}px`,
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

    const layout = getUILayout(scene);
    const margin = layout.safeSide;
    const deckScale = layout.isMobile ? getTrickCardScale(scene) : getCardScale(scene);
    const cardWidth = CARD_WIDTH * deckScale;
    const cardHeight = CARD_HEIGHT * deckScale;
    const targetX = cardWidth / 2 + margin;
    // On mobile, push below the pill badges
    const targetY = cardHeight / 2 + margin + (layout.isMobile ? layout.pctH(8) : 0);

    scene.sound.play(ASSET_KEYS.AUDIO_TRUMP_MOVE);

    if (trumpCardText) {
        const textTargetX = layout.isMobile ? targetX + 50 : targetX + 80;
        const textTargetY = layout.isMobile ? targetY + cardHeight * 0.8 : targetY + 90;
        scene.tweens.add({
            targets: trumpCardText,
            x: textTargetX,
            y: textTargetY,
            scale: layout.isMobile ? 0.55 : 0.70,
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

    const layout = getUILayout(scene);
    const margin = layout.safeSide;
    const deckScale = layout.isMobile ? getTrickCardScale(scene) : getCardScale(scene);
    const cardWidth = CARD_WIDTH * deckScale;
    const x = deckPosition.x + cardWidth + margin;
    const y = deckPosition.y;

    const sprite = new CardSprite(scene, x, y, ASSET_KEYS.CARDS, getCardFrame(trumpCard), trumpCard, deckScale);
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

    const layout = getUILayout(scene);
    const centerX = layout.centerX;
    // On mobile, center the trick area lower — between pills and hand
    const centerY = layout.isMobile ? layout.pctH(45) : (layout.centerY - 10);
    const offsetSmall = layout.isMobile ? 36 : 50;
    const offsetLarge = layout.isMobile ? 44 : 60;
    const angleTilt = layout.isMobile ? 4 : 8;
    const cardScale = layout.isMobile ? getTrickCardScale(scene) : getCardScale(scene);
    
    // Map player positions to card offsets
    const offsetMap: Record<PlayerAnchorPosition, { x: number; y: number; angle: number }> = {
        'top': { x: 0, y: -offsetSmall, angle: 0 },
        'left': { x: -offsetLarge, y: 0, angle: -angleTilt },
        'right': { x: offsetLarge, y: 0, angle: angleTilt },
        'bottom': { x: 0, y: offsetLarge, angle: 0 }
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
            cardScale
        );
        sprite.setAngle(offset.angle);
        sprite.setDepth(20 + index);
        sprite.setAlpha(0);
        sprite.setScale(cardScale * 0.85);
        scene.tweens.add({
            targets: sprite,
            alpha: 1,
            scale: cardScale,
            duration: 260,
            ease: 'Cubic.easeOut'
        });
        return sprite;
    });
}

export function createRoundSummaryPanel(
    scene: Phaser.Scene,
    summary: RoundSummaryData,
    isHost: boolean,
    onContinue: () => void
): RoundSummaryPanel {
    const layout = getUILayout(scene);
    const panelWidth = Math.min(layout.isMobile ? 340 : 380, layout.width - layout.safeSide * 2);
    const padding = 14;
    const headerHeight = 26;
    const rowHeight = 22;
    const footerHeight = 54;
    const height = padding * 2 + headerHeight + rowHeight * (summary.results.length + 1) + footerHeight;
    const x = scene.scale.width - panelWidth - layout.safeSide;
    const y = scene.scale.height - height - layout.safeBottom;

    const container = scene.add.container(x, y);
    const textNodes: Phaser.GameObjects.Text[] = [];

    const bg = scene.add.graphics();
    bg.fillStyle(0x1c1f26, 0.95);
    bg.lineStyle(2, 0xffffff, 0.15);
    bg.fillRoundedRect(0, 0, panelWidth, height, 12);
    bg.strokeRoundedRect(0, 0, panelWidth, height, 12);
    container.add(bg);

    const title = scene.add.text(padding, padding, `Round ${summary.round} Results`, {
        fontSize: '16px',
        color: '#ffffff',
        fontStyle: 'bold'
    });
    container.add(title);

    let currentY = padding + headerHeight;
    const colBid = Math.round(panelWidth * 0.46);
    const colTricks = Math.round(panelWidth * 0.57);
    const colPts = Math.round(panelWidth * 0.72);
    const colTotal = Math.round(panelWidth * 0.83);
    const hdrFontSize = '12px';
    const header = scene.add.text(padding, currentY, 'Player', {
        fontSize: hdrFontSize,
        color: '#9aa0a6',
        fontStyle: 'bold'
    });
    const headerBid = scene.add.text(colBid, currentY, 'Bid', { fontSize: hdrFontSize, color: '#9aa0a6', fontStyle: 'bold' });
    const headerTricks = scene.add.text(colTricks, currentY, 'Tricks', { fontSize: hdrFontSize, color: '#9aa0a6', fontStyle: 'bold' });
    const headerPoints = scene.add.text(colPts, currentY, 'Pts', { fontSize: hdrFontSize, color: '#9aa0a6', fontStyle: 'bold' });
    const headerTotal = scene.add.text(colTotal, currentY, 'Total', { fontSize: hdrFontSize, color: '#9aa0a6', fontStyle: 'bold' });
    container.add(header);
    container.add(headerBid);
    container.add(headerTricks);
    container.add(headerPoints);
    container.add(headerTotal);

    currentY += rowHeight;
    const rowFontSize = '13px';
    summary.results.forEach((result) => {
        const name = scene.add.text(padding, currentY, result.playerName, {
            fontSize: rowFontSize,
            color: result.color ?? '#ffffff'
        });
        const bidText = scene.add.text(colBid + 10, currentY, `${result.bid}`, { fontSize: rowFontSize, color: '#ffffff' });
        const tricksText = scene.add.text(colTricks + 10, currentY, `${result.tricks}`, { fontSize: rowFontSize, color: '#ffffff' });
        const pointsText = scene.add.text(colPts + 2, currentY, `${result.points}`, { fontSize: rowFontSize, color: '#f7d560' });
        const totalText = scene.add.text(colTotal + 4, currentY, `${result.total}`, { fontSize: rowFontSize, color: '#ffffff' });

        container.add(name);
        container.add(bidText);
        container.add(tricksText);
        container.add(pointsText);
        container.add(totalText);

        textNodes.push(name, bidText, tricksText, pointsText, totalText);
        currentY += rowHeight;
    });

    const buttonLabel = isHost ? 'Continue' : 'Waiting for host…';
    const button = createButton(scene, panelWidth / 2, height - padding - 10, buttonLabel, () => {
        if (!isHost) return;
        onContinue();
    });
    button.setFontSize(18);
    container.add(button);

    return { container, textNodes };
}
