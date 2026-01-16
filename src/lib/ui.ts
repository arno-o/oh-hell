import { ASSET_KEYS, CARD_BACK_FRAME, CARD_SCALE } from '@/lib/common';
import { PlayerState } from 'playroomkit';

// -- draw pile
export function createDrawPile(scene: Phaser.Scene): Phaser.GameObjects.Image[] {
    const drawPileCards: Phaser.GameObjects.Image[] = [];
    const centerX = scene.scale.width / 2;
    const centerY = scene.scale.height / 2;

    for (let i = 0; i < 3; i += 1) {
        drawPileCards.push(createCard(scene, centerX + i * 10, centerY));
    }

    return drawPileCards;
}

function createCard(scene: Phaser.Scene, x: number, y: number): Phaser.GameObjects.Image {
    return scene.add.image(x, y, ASSET_KEYS.CARDS, CARD_BACK_FRAME).setOrigin(0.5, 0.5).setScale(CARD_SCALE);
}

export function createPlayerUI(scene: Phaser.Scene, player: PlayerState): void {
    const height = 80;
    const profileImageRadius = 50;

    scene.add.rectangle(0, scene.scale.height - height, scene.scale.width, height).setOrigin(0, 0).setFillStyle(0x002200, 1);

    loadAvatar(scene, player.getProfile().photo, `avatar-${player.id}`, 30, scene.scale.height - (height + 50), profileImageRadius * 2);
    scene.add.circle(30, scene.scale.height - (height + 50), profileImageRadius).setOrigin(0, 0).setFillStyle(0x000000, .5).setStrokeStyle(4, 0x000000);

    scene.add.text((profileImageRadius*2) + 50, scene.scale.height - 55, `Player: ${player.getProfile().name}`, { fontSize: '2vh' });
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