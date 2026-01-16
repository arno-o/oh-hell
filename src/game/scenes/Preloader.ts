import { Scene } from 'phaser';
import { ASSET_KEYS, CARD_HEIGHT, CARD_WIDTH } from '@/lib/common';

export class Preloader extends Scene
{
    constructor ()
    {
        super('Preloader');
    }

    init() { }

    preload ()
    {
        //  Load the assets for the game - Replace with your own assets
        this.load.setPath('assets');

        this.load.spritesheet(ASSET_KEYS.CARDS, 'cards.png', {
            frameWidth: CARD_WIDTH,
            frameHeight: CARD_HEIGHT,
        });
    }

    create ()
    {
        this.textures.get(ASSET_KEYS.CARDS).setFilter(Phaser.Textures.FilterMode.NEAREST); // AI fix for low res cards
        this.scene.start('Game');
    }
}
