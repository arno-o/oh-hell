import { deserializeCards } from '@/lib/gameLogic';
import { renderPlayerHand } from '@/lib/ui';
import { myPlayer } from 'playroomkit';
import type { Game } from '@/game/scenes/Game';
import { attachHandInteractions, updatePlayableCards } from '@/game/systems/bidding';

export function syncLocalHandFromState(game: Game): void {
    const handState = myPlayer().getState('hand') as any[] | undefined;
    const signature = handState ? JSON.stringify(handState) : '';
    if (!handState || signature === game.lastHandSignature) return;

    game.lastHandSignature = signature;
    game.myHand = deserializeCards(handState);
    game.handSprites = renderPlayerHand(game, game.myHand, game.handSprites);
    attachHandInteractions(game);
    updatePlayableCards(game);
}
