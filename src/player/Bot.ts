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

    decideBid(handCount: number, trumpSuit: CardSuit | null, round: number): number {
        const seed = this.getState("rngSeed") as number | undefined;
        this.rngSeed = typeof seed === "number" ? seed : Math.floor(Math.random() * 1_000_000);

        const base = Math.max(0, handCount - 1);
        const variance = this.nextInt(0, 2);
        const bias = trumpSuit ? 1 : 0;
        const bid = Math.min(handCount, Math.max(0, base + bias + variance - (round % 2)));

        return bid;
    }

    chooseCard(
        hand: SerializedCard[],
        trickCards: Array<{ playerId: string; card: SerializedCard }>,
        trumpSuit: CardSuit | null,
        participantCount: number
    ): SerializedCard | null {
        if (!hand.length) return null;

        const leadSuit = trickCards.length ? trickCards[0].card.suit : null;
        const isLastToAct = participantCount > 0 && trickCards.length === participantCount - 1;

        if (!leadSuit) {
            const nonTrump = trumpSuit
                ? hand.filter((card) => card.suit !== trumpSuit)
                : hand;
            const candidates = nonTrump.length ? nonTrump : hand;
            return this.selectLowest(candidates);
        }

        const followSuit = hand.filter((card) => card.suit === leadSuit);
        const candidates = followSuit.length ? followSuit : hand;
        const currentWinner = this.getCurrentWinner(trickCards, leadSuit, trumpSuit);

        if (isLastToAct && currentWinner) {
            const winningPlay = this.findLowestWinningCard(candidates, currentWinner, leadSuit, trumpSuit);
            if (winningPlay) return winningPlay;
        }

        if (!followSuit.length && trumpSuit) {
            const trumps = hand.filter((card) => card.suit === trumpSuit);
            if (trumps.length) {
                return this.selectLowest(trumps);
            }
        }

        return this.selectLowest(candidates);
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