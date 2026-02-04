import * as Phaser from 'phaser';

const globalScope = window as typeof window & { Phaser?: typeof Phaser };

if (!globalScope.Phaser) {
    globalScope.Phaser = Phaser;
}

import '@azerion/phaser-input/build/phaser-input.js';
