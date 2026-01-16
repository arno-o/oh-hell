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
    const height = 80;
    const profileImageRadius = 50;

    scene.add.rectangle(0, scene.scale.height - height, scene.scale.width, height).setOrigin(0, 0).setFillStyle(0x002200, 1);

    loadAvatar(scene, player.getProfile().photo, `avatar-${player.id}`, 30, scene.scale.height - (height + 50), profileImageRadius * 2);
    scene.add.circle(30, scene.scale.height - (height + 50), profileImageRadius).setOrigin(0, 0).setFillStyle(0x000000, .5).setStrokeStyle(4, 0x000000);

    scene.add.text((profileImageRadius*2) + 50, scene.scale.height - 55, `Player: ${player.getProfile().name}`, { fontSize: '2.5vh' });
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