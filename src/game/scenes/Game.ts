import { Scene } from 'phaser';
import { createDrawPile } from '@/lib/ui';
import { Card, createDeck, shuffleDeck } from '@/lib/deck';

export class Game extends Scene
{
    deck: Card[];
    

    constructor() { super('Game'); }

    create ()
    {
        this.cameras.main.setBackgroundColor('#074924');
        createDrawPile(this);
        this.deck = shuffleDeck(createDeck());
    }
}