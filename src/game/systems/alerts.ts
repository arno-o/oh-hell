import { createAlertToast } from '@/lib/ui';
import { addBot, getParticipants, getState, isHost, myPlayer, setState } from 'playroomkit';
import type { Game } from '@/game/scenes/Game';

export function enqueueAlert(game: Game, message: string): void {
    game.alertQueue.push(message);
    flushAlertQueue(game);
}

export function flushAlertQueue(game: Game): void {
    if (!game.alertQueue.length) return;

    while (game.alertQueue.length) {
        const message = game.alertQueue.shift();
        if (!message) return;
        const toast = createAlertToast(game, message, { width: 420 });
        game.activeAlerts.push(toast);
        positionAlerts(game);

        toast.container.setAlpha(0);
        game.tweens.add({
            targets: toast.container,
            alpha: 1,
            duration: 160,
            ease: 'Sine.easeOut'
        });

        game.time.delayedCall(2400, () => {
            game.tweens.add({
                targets: toast.container,
                alpha: 0,
                duration: 220,
                ease: 'Sine.easeIn',
                onComplete: () => {
                    toast.container.destroy();
                    game.activeAlerts = game.activeAlerts.filter((item) => item !== toast);
                    positionAlerts(game);
                }
            });
        });
    }
}

export function positionAlerts(game: Game): void {
    let y = game.alertBaseY;
    game.activeAlerts.forEach((toast) => {
        toast.container.setPosition(game.scale.width / 2, y);
        y += toast.height + game.alertGap;
    });
}

export function captureParticipantSnapshot(game: Game): void {
    const participants = Object.values(getParticipants());
    game.lastParticipantIds = new Set(participants.map((player) => player.id));
    participants.forEach((player) => {
        game.participantNames.set(player.id, player.getProfile().name);
    });
}

export function checkParticipantChanges(game: Game, onPlayerLeft?: (id: string) => void): void {
    const participants = Object.values(getParticipants());
    const currentIds = new Set(participants.map((player) => player.id));

    let playerLeft = false;

    participants.forEach((player) => {
        if (!game.lastParticipantIds.has(player.id)) {
            enqueueAlert(game, `${player.getProfile().name} joined`);
        }
    });

    game.lastParticipantIds.forEach((id) => {
        if (!currentIds.has(id)) {
            const name = game.participantNames.get(id) ?? 'A player';
            enqueueAlert(game, `${name} left`);
            playerLeft = true;
            onPlayerLeft?.(id);
        }
    });

    game.participantNames.clear();
    participants.forEach((player) => {
        game.participantNames.set(player.id, player.getProfile().name);
    });
    game.lastParticipantIds = currentIds;
    game.players = participants;

    if (playerLeft) {
        fillMissingBots(game);
    }
}

export function fillMissingBots(game: Game): void {
    if (!isHost()) return;
    if (game.isFillingBots) return;

    const count = Object.keys(getParticipants()).length;
    const missing = Math.max(0, game.maxPlayers - count);

    if (missing === 0) return;

    game.isFillingBots = true;

    const addMissing = async () => {
        for (let i = 0; i < missing; i += 1) {
            await addBot();
        }
        game.isFillingBots = false;
    };

    addMissing();
}

export function checkHostChanges(game: Game): void {
    const hostId = getState('hostId') as string | undefined;

    if (!hostId && isHost()) {
        setState('hostId', myPlayer().id);
        return;
    }

    if (!game.hostInitialized) {
        game.lastHostId = hostId;
        game.hostInitialized = Boolean(hostId);
        return;
    }

    if (hostId && game.lastHostId && hostId !== game.lastHostId) {
        const name = game.participantNames.get(hostId) ?? 'Unknown';
        enqueueAlert(game, `Host left. New host is ${name}`);
    }

    game.lastHostId = hostId;
}

export function checkRoundAlerts(game: Game): void {
    const round = getState('round') as number | undefined;
    const summaryOpen = Boolean(getState('roundSummaryOpen'));

    if (summaryOpen && !game.lastRoundSummaryOpen && round) {
        enqueueAlert(game, `Round ${round} over`);
    }

    if (typeof round === 'number' && game.lastRound != null && round !== game.lastRound) {
        enqueueAlert(game, `Round ${round} begins`);
    }

    game.lastRoundSummaryOpen = summaryOpen;
    game.lastRound = round;
}

export function checkGameOverAlert(game: Game): void {
    const gameOver = Boolean(getState('gameOver'));
    if (gameOver && !game.lastGameOver) {
        enqueueAlert(game, 'Game over');
    }
    game.lastGameOver = gameOver;
}
