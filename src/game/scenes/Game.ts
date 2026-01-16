import { Scene } from 'phaser';
import { createDrawPile, createPlayerUI, createMenuButtons, createOtherPlayersUI } from '@/lib/ui';
import { Card, createDeck, shuffleDeck } from '@/lib/deck';
import { getParticipants, myPlayer } from 'playroomkit';

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
        const localPlayer = myPlayer();
        createPlayerUI(scene, localPlayer);
        createOtherPlayersUI(scene, Object.values(getParticipants()), localPlayer.id);
        createMenuButtons(scene);
    }
}