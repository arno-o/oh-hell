import StartGame from './game/main';
import { insertCoin } from 'playroomkit';

document.addEventListener('DOMContentLoaded', async () => {
    try {
        await insertCoin({
            enableBots: true,
            maxPlayersPerRoom: 6,
            // botOptions: {
            //     botClass: OhHellBot,
            //     botParams: {
            //         // Initial params if needed
            //         score: 0
            //     }
            // }
        });
        
        StartGame('game-container');
    } catch (error) {
        console.error("Failed to start Playroom:", error);
    }
});