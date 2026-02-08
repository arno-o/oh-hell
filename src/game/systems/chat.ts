import { ASSET_KEYS } from '@/lib/common';
import { appendChatMessage, CHAT_MAX_LENGTH, getChatMessages, getChatVersion, normalizeChatText } from '@/lib/chat';
import { createChatWindow, ChatWindow } from '@/lib/ui';
import { myPlayer } from 'playroomkit';
import type { Game } from '@/game/scenes/Game';

export function toggleChatWindow(game: Game): void {
    if (game.chatOpen) {
        closeChatWindow(game);
    } else {
        openChatWindow(game);
    }
}

export function openChatWindow(game: Game): void {
    if (game.chatOpen) return;

    game.chatOpen = true;
    game.chatInputBuffer = '';
    game.chatInputFocused = false;
    game.chatIgnoreNextPointer = true;

    game.chatWindow = createChatWindow(game, {
        onClose: () => closeChatWindow(game)
    });
    setChatInputFocus(game, false);

    game.chatWindow.inputHitArea.on('pointerdown', () => {
        setChatInputFocus(game, true);
    });

    game.chatPointerHandler = (pointer: Phaser.Input.Pointer) => {
        if (!game.chatWindow) return;
        if (game.chatIgnoreNextPointer) {
            game.chatIgnoreNextPointer = false;
            return;
        }
        const panelBounds = game.chatWindow.panelBounds;
        if (!panelBounds.contains(pointer.x, pointer.y)) {
            closeChatWindow(game);
            return;
        }

        const inputBounds = game.chatWindow.inputHitArea.getBounds();
        if (inputBounds.contains(pointer.x, pointer.y)) {
            setChatInputFocus(game, true);
        } else {
            setChatInputFocus(game, false);
        }
    };
    game.input.on('pointerdown', game.chatPointerHandler);

    refreshChatMessages(game);
    updateChatInputText(game);

    const keyboard = game.input.keyboard;
    if (keyboard) {
        game.chatKeyHandler = (event: KeyboardEvent) => handleChatKeydown(game, event);
        keyboard.on('keydown', game.chatKeyHandler);
    }
}

export function closeChatWindow(game: Game): void {
    if (!game.chatOpen) return;
    game.chatOpen = false;
    setChatInputFocus(game, false);

    if (game.chatWindow) {
        game.chatWindow.inputHitArea.off('pointerdown');
        game.chatWindow.container.destroy();
        game.chatWindow = undefined;
    }

    game.chatMessageNodes = [];

    if (game.chatPointerHandler) {
        game.input.off('pointerdown', game.chatPointerHandler);
        game.chatPointerHandler = undefined;
    }

    if (game.chatKeyHandler && game.input.keyboard) {
        game.input.keyboard.off('keydown', game.chatKeyHandler);
    }

    game.chatKeyHandler = undefined;
    game.chatInputBuffer = '';
    game.chatIgnoreNextPointer = false;
}

export function setChatInputFocus(game: Game, focused: boolean): void {
    game.chatInputFocused = focused;
    if (game.chatWindow) {
        game.chatWindow.drawInputBg(focused);
    }
}

export function handleChatKeydown(game: Game, event: KeyboardEvent): void {
    if (event.key === 'Escape') {
        closeChatWindow(game);
        return;
    }

    if (!game.chatOpen || !game.chatInputFocused) return;

    if (event.key === 'Enter') {
        const trimmed = normalizeChatText(game.chatInputBuffer);
        if (trimmed) {
            appendChatMessage(trimmed, myPlayer());
            game.chatInputBuffer = '';
            updateChatInputText(game);
            refreshChatMessages(game);
        }
        game.sound.play(ASSET_KEYS.AUDIO_CHAT_POST, {volume: 0.3});
        return;
    }

    if (event.key === 'Backspace') {
        game.chatInputBuffer = game.chatInputBuffer.slice(0, -1);
        updateChatInputText(game);
        return;
    }

    if (event.key.length === 1) {
        if (game.chatInputBuffer.length >= CHAT_MAX_LENGTH) return;
        game.chatInputBuffer += event.key;
        updateChatInputText(game);
    }
}

export function updateChatFromState(game: Game): void {
    const version = getChatVersion();
    if (version !== game.chatLastVersion) {
        game.chatLastVersion = version;
        refreshChatMessages(game);
    }
}

export function refreshChatMessages(game: Game): void {
    if (!game.chatWindow) return;
    const messages = getChatMessages();

    game.chatMessageNodes.forEach((node) => node.destroy());
    game.chatMessageNodes = [];

    const container = game.chatWindow.messagesContainer;
    const gap = 8;
    const maxWidth = game.chatWindow.messagesBounds.width;
    const maxHeight = game.chatWindow.messagesBounds.height;

    const items: Array<{
        nameText: Phaser.GameObjects.Text;
        messageText: Phaser.GameObjects.Text;
        rowHeight: number;
    }> = [];

    let usedHeight = 0;

    for (let i = messages.length - 1; i >= 0; i -= 1) {
        const message = messages[i];

        const nameText = game.add.text(0, 0, `${message.playerName}:`, {
            fontSize: '13px',
            fontStyle: 'bold',
            color: message.color ?? '#f9fafb'
        });

        const messageText = game.add.text(nameText.width + 6, 0, message.text, {
            fontSize: '13px',
            color: '#e5e7eb',
            wordWrap: { width: Math.max(60, maxWidth - nameText.width - 6) }
        });

        const rowHeight = Math.max(nameText.height, messageText.height);
        const nextHeight = usedHeight + rowHeight + (items.length ? gap : 0);
        if (nextHeight > maxHeight) {
            nameText.destroy();
            messageText.destroy();
            break;
        }

        usedHeight = nextHeight;
        items.push({ nameText, messageText, rowHeight });
    }

    let y = Math.max(0, maxHeight - usedHeight);

    for (let i = items.length - 1; i >= 0; i -= 1) {
        const item = items[i];
        item.nameText.setPosition(0, y);
        item.messageText.setPosition(item.nameText.width + 6, y);
        container.add([item.nameText, item.messageText]);
        game.chatMessageNodes.push(item.nameText, item.messageText);
        y += item.rowHeight + gap;
    }
}

export function updateChatInputText(game: Game): void {
    if (!game.chatWindow) return;
    const isEmpty = game.chatInputBuffer.length === 0;
    game.chatWindow.inputText
        .setText(isEmpty ? 'Type a message…' : game.chatInputBuffer)
        .setColor(isEmpty ? '#9ca3af' : '#f9fafb');
}

export type ChatState = {
    chatWindow?: ChatWindow;
    chatOpen: boolean;
    chatInputBuffer: string;
    chatLastVersion: number;
    chatKeyHandler?: (event: KeyboardEvent) => void;
    chatPointerHandler?: (pointer: Phaser.Input.Pointer) => void;
    chatIgnoreNextPointer: boolean;
    chatInputFocused: boolean;
    chatMessageNodes: Phaser.GameObjects.Text[];
};
