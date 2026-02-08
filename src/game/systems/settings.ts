import { createSettingsWindow, SettingsPlayerEntry } from '@/lib/ui';
import { getParticipants, isHost, myPlayer } from 'playroomkit';
import { isSoundEnabled } from '@/lib/settings';
import { isBotProfile } from '@/game/systems/players';
import type { Game } from '@/game/scenes/Game';

export function toggleSettingsWindow(game: Game): void {
    if (game.settingsOpen) {
        closeSettingsWindow(game);
    } else {
        openSettingsWindow(game);
    }
}

export function openSettingsWindow(game: Game): void {
    if (game.settingsOpen) return;

    game.settingsOpen = true;

    const players = buildPlayerList();

    game.settingsWindow = createSettingsWindow(game, {
        onClose: () => closeSettingsWindow(game),
        isHost: isHost(),
        localPlayerId: myPlayer().id,
        players,
        onKick: (playerId) => handleKick(game, playerId),
        onLeave: () => handleLeave(game),
    });

    // apply current mute state on open (in case it was changed elsewhere)
    game.sound.mute = !isSoundEnabled();

    // register keyboard shortcut to close
    const keyboard = game.input.keyboard;
    if (keyboard) {
        game.settingsKeyHandler = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                closeSettingsWindow(game);
            }
        };
        keyboard.on('keydown', game.settingsKeyHandler);
    }
}

export function closeSettingsWindow(game: Game): void {
    if (!game.settingsOpen) return;
    game.settingsOpen = false;

    if (game.settingsWindow) {
        game.settingsWindow.container.destroy();
        game.settingsWindow = undefined;
    }

    if (game.settingsKeyHandler && game.input.keyboard) {
        game.input.keyboard.off('keydown', game.settingsKeyHandler);
    }
    game.settingsKeyHandler = undefined;
}

function buildPlayerList(): SettingsPlayerEntry[] {
    const participants = Object.values(getParticipants());
    return participants.map((player) => {
        const profile = player.getProfile();
        return {
            playerId: player.id,
            playerName: profile.name,
            color: profile.color?.hex ?? 0xffffff,
            isBot: isBotProfile(player),
        };
    });
}

async function handleKick(game: Game, playerId: string): Promise<void> {
    if (!isHost()) return;

    const participants = Object.values(getParticipants());
    const target = participants.find((p) => p.id === playerId);
    if (!target) return;

    // can't kick bots
    if (isBotProfile(target)) return;

    const targetName = target.getProfile().name;

    try {
        target.kick();
        console.log(`[Settings] Kicked player ${targetName} (${playerId})`);

        // refresh player list in settings
        if (game.settingsWindow) {
            const updatedPlayers = buildPlayerList();
            game.settingsWindow.refreshPlayers(updatedPlayers);
        }
    } catch (error) {
        console.error(`[Settings] Failed to kick player ${targetName}:`, error);
    }
}

async function handleLeave(game: Game): Promise<void> {
    const player = myPlayer();
    const playerName = player.getProfile().name;

    try {
        closeSettingsWindow(game);
        console.log(`[Settings] ${playerName} is leaving the game`);
        await player.leaveRoom();
    } catch (error) {
        console.error(`[Settings] Failed to leave room:`, error);
    }
}
