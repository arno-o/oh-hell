import { Card } from '@/lib/card';
import { dealCards } from '@/lib/deck';
import { CardSuit, CardValue } from '@/lib/common';

export type SerializedCard = {
    suit: CardSuit;
    value: CardValue;
    isFaceUp?: boolean;
};

export function serializeCards(cards: Card[]): SerializedCard[] {
    return cards.map((card) => ({
        suit: card.suit,
        value: card.value,
        isFaceUp: card.isFaceUp
    }));
}

export function deserializeCards(cards: SerializedCard[]): Card[] {
    return cards.map((card) => {
        const instance = new Card(card.suit, card.value, Boolean(card.isFaceUp));
        return instance;
    });
}

export class GameLogic {
    private deck: Card[];
    private playerIds: string[];
    private hands: Map<string, Card[]> = new Map();
    private round = 1;
    private maxCardsPerPlayer = 7;
    private minCardsPerPlayer = 1;

    constructor(deck: Card[], playerIds: string[]) {
        this.deck = deck;
        this.playerIds = playerIds;
    }

    public syncFromState(state: { round: number, deck: SerializedCard[] }) {
        this.round = state.round;
        this.deck = deserializeCards(state.deck);
    }

    drawCards(cardsPerPlayer = this.getCardsPerPlayerForRound()): Map<string, Card[]> {
        const hands: Map<string, Card[]> = new Map();
        let workingDeck = this.deck;

        this.playerIds.forEach((playerId) => {
            const { dealt, remaining } = dealCards(workingDeck, cardsPerPlayer);
            dealt.forEach((card) => {
                if (!card.isFaceUp) {
                    card.flip();
                }
            });
            hands.set(playerId, dealt);
            workingDeck = remaining;
        });

        this.deck = workingDeck;
        this.hands = hands;

        this.getTrumpSuit();

        return hands;
    }

    getHand(playerId: string): Card[] {
        return this.hands.get(playerId) ?? [];
    }

    getRemainingDeck(): Card[] {
        return this.deck;
    }

    getRound(): number {
        return this.round;
    }

    getCardsPerPlayerForRound(
        roundNumber = this.round,
        maxCards = this.maxCardsPerPlayer,
        minCards = this.minCardsPerPlayer
    ): number {
        if (maxCards <= minCards) {
            return Math.max(1, maxCards);
        }

        const span = maxCards - minCards;
        const period = span * 2;
        const index = (roundNumber - 1) % period;

        if (index <= span) {
            return maxCards - index;
        }

        return minCards + (index - span);
    }

    advanceRound(): number {
        this.round += 1;
        return this.round;
    }

    getTrumpSuit(): CardSuit | null {
        const trumpCard = this.deck[0];

        if (!trumpCard) {
            return null;
        }

        if (!trumpCard.isFaceUp) {
            trumpCard.flip();
        }

        console.log('Trump suit chosen: ' + trumpCard.suit);

        return trumpCard.suit;
    }

    determineTrickWinner(trick: {playerId: string, card: Card }[], trumpSuit: CardSuit | null): string {
        const leadSuit = trick[0].card.suit;
        let winner = trick[0];

        for (let i = 1; i < trick.length; i++) {
            const current = trick[i];
            const winnerCard = winner.card;
            const currentCard = current.card;

            // if current card is trump and winner isn't, trump wins
            if (currentCard.suit === trumpSuit && winnerCard.suit !== trumpSuit) {
                winner = current;
            }
            // if both are trump, highest wins
            else if (currentCard.suit === trumpSuit && winnerCard.suit === trumpSuit) {
                if (currentCard.value > winnerCard.value) winner = current;
            }
            // if current matches lead suit and winner is not trump
            else if (currentCard.suit === leadSuit && winnerCard.suit !== trumpSuit) {
                if (currentCard.value > winnerCard.value) winner = current;
            }
        }

        return winner.playerId;
    }
}
