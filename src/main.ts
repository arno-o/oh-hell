import StartGame from './game/main';
import { insertCoin } from 'playroomkit';
import { PlayerBot } from '@/player/Bot';

document.addEventListener('DOMContentLoaded', async () => {
    try {
        await insertCoin({
            enableBots: true,
            maxPlayersPerRoom: 6,
            botOptions: {
                botClass: PlayerBot,
                botParams: {
                    // Initial params if needed
                    score: 0
                }
            },
            skipLobby: true // for developing only
        });
        
        StartGame('game-container');
    } catch (error) {
        console.error("Failed to start Playroom:", error);
    }
});