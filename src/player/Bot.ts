import { Bot, isHost } from "playroomkit";
import { CardSuit } from "@/lib/common";
import { SerializedCard } from "@/lib/gameLogic";

type BotParams = {
    seed?: number;
};

export class PlayerBot extends Bot {
    private rngSeed: number;

    constructor(botParams: BotParams) {
        super(botParams);

        if (!isHost()) return;

        this.rngSeed = botParams?.seed ?? Math.floor(Math.random() * 1_000_000);
        this.setState("rngSeed", this.rngSeed);
    }

    decideBid(hand: SerializedCard[], trumpSuit: CardSuit | null, round: number): number {
        const seed = this.getState("rngSeed") as number | undefined;
        this.rngSeed = typeof seed === "number" ? seed : Math.floor(Math.random() * 1_000_000);

        const handCount = hand.length;
        if (handCount === 0) return 0;

        const highValues = new Set([1, 13, 12, 11, 10]); // A, K, Q, J, 10
        const highCount = hand.filter((card) => highValues.has(card.value)).length;
        const trumpCount = trumpSuit ? hand.filter((card) => card.suit === trumpSuit).length : 0;

        const strengthScore = highCount * 0.7 + trumpCount * 0.9 + (handCount - highCount) * 0.15;
        const expected = Math.round(strengthScore / 1.2);
        const variance = this.nextInt(0, 2) - 1; // -1, 0, 1
        const roundBias = round % 2 === 0 ? 0 : -1;
        const bid = Math.min(handCount, Math.max(0, expected + variance + roundBias));

        return bid;
    }

    chooseCard(
        hand: SerializedCard[],
        trickCards: Array<{ playerId: string; card: SerializedCard }>,
        trumpSuit: CardSuit | null,
        participantCount: number,
        targetBid: number | null,
        currentTricks: number
    ): SerializedCard | null {
        if (!hand.length) return null;

        const leadSuit = trickCards.length ? trickCards[0].card.suit : null;
        const isLastToAct = participantCount > 0 && trickCards.length === participantCount - 1;
        const bidTarget = targetBid ?? 0;
        const needsWins = currentTricks < bidTarget;

        if (!leadSuit) {
            const nonTrump = trumpSuit
                ? hand.filter((card) => card.suit !== trumpSuit)
                : hand;
            const candidates = nonTrump.length ? nonTrump : hand;
            return needsWins ? this.selectHighest(candidates) : this.selectLowest(candidates);
        }

        const followSuit = hand.filter((card) => card.suit === leadSuit);
        const candidates = followSuit.length ? followSuit : hand;
        const currentWinner = this.getCurrentWinner(trickCards, leadSuit, trumpSuit);

        if (currentWinner) {
            if (needsWins) {
                const winningPlay = this.findLowestWinningCard(candidates, currentWinner, leadSuit, trumpSuit);
                if (winningPlay) return winningPlay;
            } else {
                const losingPlay = this.findLowestLosingCard(candidates, currentWinner, leadSuit, trumpSuit);
                if (losingPlay) return losingPlay;
            }
        }

        if (!followSuit.length && trumpSuit && needsWins) {
            const trumps = hand.filter((card) => card.suit === trumpSuit);
            if (trumps.length) {
                return this.selectLowest(trumps);
            }
        }

        return needsWins && isLastToAct
            ? this.selectHighest(candidates)
            : this.selectLowest(candidates);
    }

    private nextInt(min: number, max: number): number {
        if (min >= max) return min;

        const seed = (this.getState("rngSeed") as number | undefined) ?? this.rngSeed ?? 1;
        const nextSeed = (seed * 9301 + 49297) % 233280;
        const value = min + Math.floor((nextSeed / 233280) * (max - min + 1));

        this.setState("rngSeed", nextSeed);
        this.rngSeed = nextSeed;

        return value;
    }

    private selectLowest(cards: SerializedCard[]): SerializedCard {
        return [...cards].sort((a, b) => a.value - b.value)[0];
    }

    private selectHighest(cards: SerializedCard[]): SerializedCard {
        return [...cards].sort((a, b) => b.value - a.value)[0];
    }

    private getCurrentWinner(
        trickCards: Array<{ playerId: string; card: SerializedCard }>,
        leadSuit: CardSuit,
        trumpSuit: CardSuit | null
    ): SerializedCard | null {
        if (!trickCards.length) return null;

        let winner = trickCards[0].card;

        for (let i = 1; i < trickCards.length; i += 1) {
            const candidate = trickCards[i].card;
            if (this.cardBeats(candidate, winner, leadSuit, trumpSuit)) {
                winner = candidate;
            }
        }

        return winner;
    }

    private findLowestWinningCard(
        candidates: SerializedCard[],
        currentWinner: SerializedCard,
        leadSuit: CardSuit,
        trumpSuit: CardSuit | null
    ): SerializedCard | null {
        const winningCards = candidates.filter((card) =>
            this.cardBeats(card, currentWinner, leadSuit, trumpSuit)
        );

        if (!winningCards.length) return null;

        return this.selectLowest(winningCards);
    }

    private findLowestLosingCard(
        candidates: SerializedCard[],
        currentWinner: SerializedCard,
        leadSuit: CardSuit,
        trumpSuit: CardSuit | null
    ): SerializedCard | null {
        const losingCards = candidates.filter((card) =>
            !this.cardBeats(card, currentWinner, leadSuit, trumpSuit)
        );

        if (!losingCards.length) return null;

        return this.selectLowest(losingCards);
    }

    private cardBeats(
        candidate: SerializedCard,
        currentWinner: SerializedCard,
        leadSuit: CardSuit,
        trumpSuit: CardSuit | null
    ): boolean {
        if (candidate.suit === currentWinner.suit) {
            return candidate.value > currentWinner.value;
        }

        if (trumpSuit && candidate.suit === trumpSuit && currentWinner.suit !== trumpSuit) {
            return true;
        }

        if (trumpSuit && currentWinner.suit === trumpSuit && candidate.suit !== trumpSuit) {
            return false;
        }

        if (candidate.suit === leadSuit && currentWinner.suit !== leadSuit) {
            return true;
        }

        return false;
    }
}