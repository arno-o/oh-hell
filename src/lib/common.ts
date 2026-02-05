export type MenuItemId = 'chat' | 'settings';

export interface MenuItem {
    id: MenuItemId;
    icon: string;
    label: string;
}

export const MENU_ITEMS: MenuItem[] = [
    {
        id: 'chat',
        icon: 'icon-chat',
        label: 'Chat'
    },
    {
        id: 'settings',
        icon: 'icon-settings',
        label: 'Settings'
    },
];

export const CARD_WIDTH = 37;
export const CARD_HEIGHT = 52;
export const CARD_SCALE = 2.5;
export const CARD_BACK_FRAME = 53;

export const ASSET_KEYS = {
    CARDS: 'CARDS',
    AUDIO_BUTTON_1: 'AUDIO_BUTTON_1',
    AUDIO_BUTTON_2: 'AUDIO_BUTTON_2',
    AUDIO_BUTTON_3: 'AUDIO_BUTTON_3',
    AUDIO_CARD_1: 'AUDIO_CARD_1',
    AUDIO_CARD_2: 'AUDIO_CARD_2',
    AUDIO_ROUND_WIN: 'AUDIO_ROUND_WIN',
    AUDIO_TRICK_WIN: 'AUDIO_TRICK_WIN',
    AUDIO_TRUMP_MOVE: 'AUDIO_TRUMP_MOVE',
    AUDIO_CARD_SPREAD: 'AUDIO_CARD_SPREAD',
    AUDIO_UI_CLICK: 'AUDIO_UI_CLICK',
    AUDIO_CHAT_POST: 'AUDIO_CHAT_POST',
} as const;

export type CardSuit = typeof CARD_SUIT[keyof typeof CARD_SUIT];

export const CARD_SUIT = {
    HEART: 'HEARTS',
    DIAMOND: 'DIAMONDS',
    SPADE: 'SPADES',
    CLUB: 'CLUBS'
} as const;

export type CardValue = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13;

export type CardSuitColor = keyof typeof CARD_SUIT_COLOR;

export const CARD_SUIT_COLOR = {
    RED: 'RED',
    BLACK: 'BLACK',
} as const;

export const CARD_SUIT_TO_COLOR = {
    [CARD_SUIT.HEART]: CARD_SUIT_COLOR.RED,
    [CARD_SUIT.DIAMOND]: CARD_SUIT_COLOR.RED,
    [CARD_SUIT.SPADE]: CARD_SUIT_COLOR.BLACK,
    [CARD_SUIT.CLUB]: CARD_SUIT_COLOR.BLACK,
} as const;