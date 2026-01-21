import { ASSET_KEYS, CARD_BACK_FRAME, CARD_HEIGHT, CARD_SCALE, CARD_WIDTH } from '@/lib/common';
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
    options?: { from?: { x: number; y: number }; staggerMs?: number }
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
    const others = players.filter((player) => player.id !== localPlayerId).slice(0, 3);
    const positions: Array<'left' | 'top' | 'right'> = ['left', 'top', 'right'];
    const anchors: Record<string, PlayerAnchor> = {};

    others.forEach((player, index) => {
        const position = positions[index];
        if (position) {
            anchors[player.id] = createSidePlayerUI(scene, player, position);
        }
    });

    return anchors;
}

function createSidePlayerUI(scene: Phaser.Scene, player: PlayerState, position: 'left' | 'top' | 'right'): PlayerAnchor {
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
    const isBot = Boolean((profile as { isBot?: boolean }).isBot ?? (player as { isBot?: boolean }).isBot ?? /bot/i.test(profile.name));
    const botBadgeWidth = 36;
    const botBadgeHeight = 16;
    const botBadgeX = baseTextX;
    const nameY = panelY + 18;
    const nameX = isBot ? baseTextX + botBadgeWidth + 8 : baseTextX;

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

export function createMenuButtons(scene: Phaser.Scene) {
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

        container.on('pointerdown', () => item.action());
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

export function createBidModal(
    scene: Phaser.Scene,
    maxBid: number,
    onSelect: (bid: number) => void
): Phaser.GameObjects.Container {
    const container = scene.add.container(0, 0);
    const overlay = scene.add.rectangle(0, 0, scene.scale.width, scene.scale.height, 0x000000, 0.5)
        .setOrigin(0, 0)
        .setInteractive();

    const panelWidth = Math.min(scene.scale.width * 0.8, 420);
    const panelHeight = Math.min(scene.scale.height * 0.5, 280);
    const panelX = scene.scale.width / 2 - panelWidth / 2;
    const panelY = scene.scale.height / 2 - panelHeight / 2;

    const panel = scene.add.graphics();
    panel.fillStyle(0x222222, 0.95);
    panel.fillRoundedRect(panelX, panelY, panelWidth, panelHeight, 12);

    const title = scene.add.text(scene.scale.width / 2, panelY + 20, 'Place your bid', {
        fontSize: '20px',
        color: '#ffffff'
    }).setOrigin(0.5, 0);

    const buttons: Phaser.GameObjects.Text[] = [];
    const padding = 16;
    const buttonSize = 42;
    const cols = Math.min(6, Math.max(2, maxBid));
    const startX = scene.scale.width / 2 - ((cols - 1) * (buttonSize + padding)) / 2;
    const startY = panelY + 70;

    for (let bid = 1; bid <= maxBid; bid += 1) {
        const index = bid - 1;
        const col = index % cols;
        const row = Math.floor(index / cols);
        const x = startX + col * (buttonSize + padding);
        const y = startY + row * (buttonSize + padding);

        const button = scene.add.text(x, y, `${bid}`, {
            fontSize: '18px',
            color: '#ffffff',
            backgroundColor: '#444444',
            padding: { left: 12, right: 12, top: 8, bottom: 8 }
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });

        button.on('pointerdown', () => onSelect(bid));
        button.on('pointerover', () => button.setStyle({ backgroundColor: '#666666' }));
        button.on('pointerout', () => button.setStyle({ backgroundColor: '#444444' }));
        buttons.push(button);
    }

    container.add([overlay, panel, title, ...buttons]);
    container.setDepth(100);
    return container;
}

export function createTurnText(scene: Phaser.Scene): Phaser.GameObjects.Text {
    return scene.add.text(scene.scale.width / 2, 16, 'Turn: --', {
        fontSize: '18px',
        color: '#ffffff'
    }).setOrigin(0.5, 0);
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
    cards: Card[],
    previous: CardSprite[] = []
): CardSprite[] {
    previous.forEach((sprite) => sprite.destroy());

    if (!cards.length) {
        return [];
    }

    const centerX = scene.scale.width / 2;
    const centerY = scene.scale.height / 2 - 10;
    const offsets = [
        { x: 0, y: -50, angle: 0 },
        { x: -60, y: 0, angle: -8 },
        { x: 60, y: 0, angle: 8 },
        { x: 0, y: 60, angle: 0 }
    ];

    return cards.map((card, index) => {
        const offset = offsets[index] ?? { x: index * 6, y: index * 6, angle: 0 };
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
        return sprite;
    });
}
