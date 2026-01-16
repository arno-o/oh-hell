import { Scene } from 'phaser';
import { Card, createDeck, shuffleDeck } from '@/lib/deck';

export class Game extends Scene
{
    deck: Card[];

    constructor() { super('Game'); }

    create ()
    {
        this.cameras.main.setBackgroundColor('#074924');
        this.deck = shuffleDeck(createDeck());
    }
    
    update () {
        
    }
}
