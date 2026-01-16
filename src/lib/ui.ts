import { ASSET_KEYS, CARD_BACK_FRAME, CARD_SCALE } from '@/lib/common';

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