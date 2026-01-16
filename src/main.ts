import StartGame from './game/main';
import { addBot, getParticipants, insertCoin, isHost } from 'playroomkit';
import { PlayerBot } from '@/player/Bot';

document.addEventListener('DOMContentLoaded', async () => {
    try {
        await insertCoin({
            enableBots: true,
            maxPlayersPerRoom: 4,
            botOptions: {
                botClass: PlayerBot,
                botParams: {
                    // Initial params if needed
                    score: 0
                }
            },
            skipLobby: true // for developing only
        });

        await fillBotsToFourPlayers();

        StartGame('game-container');
    } catch (error) {
        console.error("Failed to start Playroom:", error);
    }
});

async function fillBotsToFourPlayers(): Promise<void> {
    if (!isHost()) {
        return;
    }

    const participantCount = Object.keys(getParticipants()).length;
    const missing = Math.max(0, 4 - participantCount);

    for (let i = 0; i < missing; i += 1) {
        await addBot();
    }
}