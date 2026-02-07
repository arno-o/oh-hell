import { createSidePlayerUI } from '@/lib/ui';
import type { Game } from '@/game/scenes/Game';
import { myPlayer } from 'playroomkit';
import type { PlayerState } from 'playroomkit';

export function addPlayerAnchorForJoin(game: Game, player: PlayerState): void {
    if (player.id === myPlayer().id) return;
    if (game.playerAnchors[player.id]) return;

    const usedPositions = new Set(Object.values(game.playerAnchors).map((anchor) => anchor.position));
    const positions: Array<'left' | 'top' | 'right'> = ['left', 'top', 'right'];
    const nextPosition = positions.find((position) => !usedPositions.has(position));

    if (!nextPosition) return;

    const anchor = createSidePlayerUI(game, player, nextPosition, isBotProfile(player));
    game.playerAnchors[player.id] = anchor;
}

export function isBotProfile(player: PlayerState): boolean {
    const maybe = player as PlayerState & { isBot?: () => boolean };
    if (typeof maybe.isBot === 'function') {
        return maybe.isBot();
    }

    const profile = player.getProfile() as { name?: string; isBot?: boolean };
    return Boolean(profile.isBot) || /bot/i.test(profile.name ?? '');
}

export function getTurnOrder(playerIds: string[], hostId: string): string[] {
    const unique = Array.from(new Set(playerIds));
    const others = unique.filter((id) => id !== hostId).sort();
    return [hostId, ...others];
}
