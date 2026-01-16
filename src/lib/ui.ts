import { ASSET_KEYS, CARD_BACK_FRAME, CARD_SCALE } from '@/lib/common';
import { PlayerState } from 'playroomkit';
import { MENU_ITEMS } from '@/lib/common';

// -- draw pile
export function createDrawPile(scene: Phaser.Scene): Phaser.GameObjects.Image[] {
    const drawPileCards: Phaser.GameObjects.Image[] = [];
    const centerX = scene.scale.width / 2;
    const centerY = scene.scale.height / 2;

    for (let i = 0; i < 3; i += 1) {
        drawPileCards.push(createCard(scene, centerX + i * 10, centerY));
    }

    createButton(scene, centerX, centerY + 100, "Draw cards", () => alert("Draw cards"));

    return drawPileCards;
}

function createCard(scene: Phaser.Scene, x: number, y: number): Phaser.GameObjects.Image {
    return scene.add.image(x - 10, y, ASSET_KEYS.CARDS, CARD_BACK_FRAME).setOrigin(0.5).setScale(CARD_SCALE);
}

export function createPlayerUI(scene: Phaser.Scene, player: PlayerState): void {
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

    createTitle(scene);
}

export function createOtherPlayersUI(scene: Phaser.Scene, players: PlayerState[], localPlayerId: string): void {
    const others = players.filter((player) => player.id !== localPlayerId).slice(0, 3);
    const positions: Array<'left' | 'top' | 'right'> = ['left', 'top', 'right'];

    others.forEach((player, index) => {
        const position = positions[index];
        if (position) {
            createSidePlayerUI(scene, player, position);
        }
    });
}

function createSidePlayerUI(scene: Phaser.Scene, player: PlayerState, position: 'left' | 'top' | 'right'): void {
    const profileImageRadius = 32;
    const avatarSize = profileImageRadius * 2;
    const margin = 30;
    const labelSpacing = 8;

    let x = margin;
    let y = margin;
    let nameX = margin + avatarSize + 12;
    let nameY = margin + profileImageRadius - 10;

    if (position === 'left') {
        x = margin;
        y = scene.scale.height / 2 - profileImageRadius;
        nameX = x + avatarSize + 12;
        nameY = y + profileImageRadius - 10;
    }

    if (position === 'right') {
        x = scene.scale.width - margin - avatarSize;
        y = scene.scale.height / 2 - profileImageRadius;
        nameX = x - 12;
        nameY = y + profileImageRadius - 10;
    }

    if (position === 'top') {
        x = scene.scale.width / 2 - profileImageRadius;
        y = margin;
        nameX = x + profileImageRadius;
        nameY = y + avatarSize + labelSpacing;
    }

    loadAvatar(scene, player.getProfile().photo, `avatar-${player.id}`, x, y, avatarSize);
    scene
        .add.circle(x, y, profileImageRadius)
        .setOrigin(0, 0)
        .setFillStyle(0x000000, 0.5)
        .setStrokeStyle(6, player.getProfile().color.hex);

    const nameStyle: Phaser.Types.GameObjects.Text.TextStyle = {
        fontSize: '18px',
        color: '#ffffff',
        align: 'center'
    };

    const name = scene.add.text(nameX, nameY, player.getProfile().name, nameStyle);

    if (position === 'right') {
        name.setOrigin(1, 0.5);
    } else if (position === 'top') {
        name.setOrigin(0.5, 0);
    } else {
        name.setOrigin(0, 0.5);
    }
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

function createTitle(scene: Phaser.Scene) {
    const offset = 20;
    scene.add.image(offset, offset, 'title').setOrigin(0, 0).setScale(0.4);
}