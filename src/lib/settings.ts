const SOUND_KEY = 'oh-hell-sound-enabled';

export function isSoundEnabled(): boolean {
    const stored = localStorage.getItem(SOUND_KEY);
    // Default to ON if never set
    return stored === null ? true : stored === '1';
}

export function setSoundEnabled(enabled: boolean): void {
    localStorage.setItem(SOUND_KEY, enabled ? '1' : '0');
}
