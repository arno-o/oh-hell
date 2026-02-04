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

        this.load.image('title', 'title.png');
        this.load.image('icon-chat', 'icon-chat.png');
        this.load.image('icon-settings', 'icon-settings.png');

        this.load.audio(ASSET_KEYS.AUDIO_BUTTON_1, 'audio/button.ogg');
        this.load.audio(ASSET_KEYS.AUDIO_BUTTON_2, 'audio/button2.ogg');
        this.load.audio(ASSET_KEYS.AUDIO_BUTTON_3, 'audio/button3.ogg');
        this.load.audio(ASSET_KEYS.AUDIO_CARD_1, 'audio/card1.ogg');
        this.load.audio(ASSET_KEYS.AUDIO_CARD_2, 'audio/card2.ogg');
        this.load.audio(ASSET_KEYS.AUDIO_CARD_SPREAD, 'audio/cardSpread.ogg');
        this.load.audio(ASSET_KEYS.AUDIO_ROUND_WIN, 'audio/roundWin.ogg');
        // this.load.audio(ASSET_KEYS.AUDIO_TRICK_WIN, 'audio/trickWin.ogg');
        this.load.audio(ASSET_KEYS.AUDIO_TRUMP_MOVE, 'audio/trumpMove.wav');
        this.load.audio(ASSET_KEYS.AUDIO_UI_CLICK, 'audio/ui_click.wav');
        this.load.audio(ASSET_KEYS.AUDIO_CHAT_POST, 'audio/chatPost.wav');
    }

    create ()
    {
        this.textures.get(ASSET_KEYS.CARDS).setFilter(Phaser.Textures.FilterMode.NEAREST); // AI fix for low res cards
        this.scene.start('Game');
    }
}
