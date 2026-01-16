import { CardSuit, CardValue } from "./common";

export class Card {
    #suit: CardSuit;
    #value: CardValue;
    #faceUp: boolean;

    constructor(suit: CardSuit, value: CardValue, isFaceUp = false) {
        this.#faceUp = isFaceUp;
        this.#suit = suit;
        this.#value = value;
    }

    get suit(): CardSuit {
        return this.#suit;
    }

    get value(): CardValue {
        return this.#value;
    }

    get isFaceUp(): boolean {
        return this.#faceUp;
    }

    public flip(): void {
        this.#faceUp = !this.#faceUp;
    }
}