import { getState, setState, PlayerState } from 'playroomkit';

export type ChatMessage = {
    id: string;
    playerId: string;
    playerName: string;
    text: string;
    timestamp: number;
};

const CHAT_STATE_KEY = 'chatMessages';
const CHAT_VERSION_KEY = 'chatVersion';
const CHAT_MAX_MESSAGES = 50;
export const CHAT_MAX_LENGTH = 140;

export function getChatMessages(): ChatMessage[] {
    return (getState(CHAT_STATE_KEY) as ChatMessage[] | undefined) ?? [];
}

export function getChatVersion(): number {
    return (getState(CHAT_VERSION_KEY) as number | undefined) ?? 0;
}

export function normalizeChatText(text: string): string {
    return text.replace(/\s+/g, ' ').trim().slice(0, CHAT_MAX_LENGTH);
}

export function appendChatMessage(text: string, player: PlayerState): ChatMessage[] {
    const normalized = normalizeChatText(text);
    if (!normalized) {
        return getChatMessages();
    }

    const message: ChatMessage = {
        id: `${player.id}-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        playerId: player.id,
        playerName: player.getProfile().name,
        text: normalized,
        timestamp: Date.now()
    };

    const nextMessages = [...getChatMessages(), message].slice(-CHAT_MAX_MESSAGES);
    setState(CHAT_STATE_KEY, nextMessages);
    setState(CHAT_VERSION_KEY, getChatVersion() + 1);

    return nextMessages;
}

export function formatChatMessages(messages: ChatMessage[], maxLines = 12): string {
    const visible = messages.slice(-maxLines);
    return visible.map((msg) => `${msg.playerName}: ${msg.text}`).join('\n');
}
