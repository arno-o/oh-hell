export interface MenuItem {
    icon: string;
    label: string;
    action: () => void;
}

export const MENU_ITEMS: MenuItem[] = [
    {
        icon: 'icon-chat',
        label: 'Chat',
        action: () => console.log('Chat clicked'),
    },
    {
        icon: 'icon-settings',
        label: 'Settings',
        action: () => console.log('Settings clicked'),
    },
];

export const CARD_WIDTH = 37;
export const CARD_HEIGHT = 52;
export const CARD_SCALE = 2.5;
export const CARD_BACK_FRAME = 53;

export const ASSET_KEYS = {
    CARDS: 'CARDS'
} as const;

export type CardSuit = keyof typeof CARD_SUIT;

export const CARD_SUIT = {
    HEART: 'HEART',
    DIAMOND: 'DIAMOND',
    SPADE: 'SPADE',
    CLUB: 'CLUB'
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