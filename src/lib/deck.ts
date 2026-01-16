import { Card } from './card';
import { CARD_SUIT, CardSuit, CardValue } from './common';

export { Card };

const SUITS: CardSuit[] = [CARD_SUIT.CLUB, CARD_SUIT.DIAMOND, CARD_SUIT.HEART, CARD_SUIT.SPADE];

const SUIT_OFFSET: Record<CardSuit, number> = {
    [CARD_SUIT.CLUB]: 0,
    [CARD_SUIT.DIAMOND]: 13,
    [CARD_SUIT.SPADE]: 26,
    [CARD_SUIT.HEART]: 39
};

export function createDeck(): Card[] {
    const deck: Card[] = [];

    SUITS.forEach((suit) => {
        // 1 to 13
        for (let v = 1; v <= 13; v++) {
            deck.push(new Card(suit, v as CardValue));
        }
    });

    return deck;
}

export function shuffleDeck(deck: Card[]): Card[] {
    const shuffled = [...deck];

    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    return shuffled;
}

export function dealCards(deck: Card[], numCards: number): { dealt: Card[], remaining: Card[] } {
    return { dealt: deck.slice(0, numCards), remaining: deck.slice(numCards) };
}

export function getCardFrame(card: Card): number {
    // Value 1 (Ace) -> 0, Value 2 -> 1, ... Value 13 (King) -> 12
    const rankIndex = card.value - 1;
    return SUIT_OFFSET[card.suit] + rankIndex;
}

export function getCardName(card: Card): string {
    const symbols: Record<CardSuit, string> = { 
        [CARD_SUIT.CLUB]: '♣', 
        [CARD_SUIT.DIAMOND]: '♦', 
        [CARD_SUIT.SPADE]: '♠', 
        [CARD_SUIT.HEART]: '♥' 
    };
    
    let rankStr = card.value.toString();
    if (card.value === 1) rankStr = 'A';
    if (card.value === 11) rankStr = 'J';
    if (card.value === 12) rankStr = 'Q';
    if (card.value === 13) rankStr = 'K';

    return `${rankStr}${symbols[card.suit]}`;
}
