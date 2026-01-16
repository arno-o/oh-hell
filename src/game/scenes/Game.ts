import { Scene } from 'phaser';
import { createDrawPile, createPlayerUI, createMenuButtons } from '@/lib/ui';
import { Card, createDeck, shuffleDeck } from '@/lib/deck';
import { myPlayer } from 'playroomkit';

export class Game extends Scene
{
    deck: Card[];
    

    constructor() { super('Game'); }

    create ()
    {
        this.cameras.main.setBackgroundColor('#074924');
        this.runGameSetup(this);
        this.deck = shuffleDeck(createDeck());
    }

    runGameSetup(scene: Phaser.Scene): void {
        createDrawPile(scene);
        createPlayerUI(scene, myPlayer());
        createMenuButtons(scene);
    }
}