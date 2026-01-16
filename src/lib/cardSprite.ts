import { Scene } from 'phaser';
import { Card } from '@/lib/card';
import { getCardName } from '@/lib/deck';

export const HOVER_LIFT = 40;
export const HOVER_SCALE = 1.3;
export const ANIM_DURATION = 100;

export class CardSprite extends Phaser.GameObjects.Sprite {
    public cardData: Card;
    public originalX: number;
    public originalY: number;
    public originalAngle: number = 0;
    public isHovered: boolean = false;
    public isDragging: boolean = false;
    public baseScale: number = 1;

    constructor(scene: Scene, x: number, y: number, texture: string, frame: string | number, cardData: Card, scale: number) {
        super(scene, x, y, texture, frame);
        
        this.cardData = cardData;
        this.originalX = x;
        this.originalY = y;
        this.originalAngle = 0;
        this.baseScale = scale;
        
        this.setScale(scale);
        scene.add.existing(this);
    }

    public flip(targetFrame: string | number, onComplete?: () => void) {
        this.cardData.flip();
        
        this.scene.tweens.add({
            targets: this,
            scaleX: 0,
            duration: 100,
            ease: 'Cubic.easeIn',
            onComplete: () => {
                this.setFrame(targetFrame);
                this.scene.tweens.add({
                    targets: this,
                    scaleX: this.baseScale,
                    duration: 100,
                    ease: 'Cubic.easeOut',
                    onComplete: onComplete
                });
            }
        });
    }

    public setBaseScale(scale: number) {
        this.baseScale = scale;
        if (!this.isHovered && !this.isDragging) {
            this.setScale(scale);
        }
    }

    public enableInteractions() {
        this.setInteractive({ draggable: true, useHandCursor: true });

        this.on('pointerover', this.onPointerOver, this);
        this.on('pointerout', this.onPointerOut, this);
        this.on('dragstart', this.onDragStart, this);
        this.on('drag', this.onDrag, this);
        this.on('dragend', this.onDragEnd, this);
        this.on('pointerdown', this.onPointerDown, this);
    }

    private onPointerOver() {
        if (!this.isDragging) {
            this.isHovered = true;
            this.setDepth(1000);
            this.scene.tweens.add({
                targets: this,
                y: this.originalY - HOVER_LIFT * 1.5,
                angle: Phaser.Math.Between(-6, 6), // Straighten card
                scaleX: this.baseScale * HOVER_SCALE,
                scaleY: this.baseScale * HOVER_SCALE,
                duration: ANIM_DURATION,
                ease: 'Cubic.easeOut'
            });
        }
    }

    private onPointerOut() {
        if (!this.isDragging) {
            this.isHovered = false;
            this.setDepth(this.originalDepth); // We need to store original depth or manage it externally
            this.scene.tweens.add({
                targets: this,
                y: this.originalY,
                angle: this.originalAngle, // Return to fan angle
                scaleX: this.baseScale,
                scaleY: this.baseScale,
                duration: ANIM_DURATION,
                ease: 'Cubic.easeOut'
            });
        }
    }

    private onDragStart() {
        this.isDragging = true;
        this.setDepth(1001);
        this.scene.tweens.add({
            targets: this,
            angle: 0, // Straighten while dragging
            scaleX: this.baseScale * HOVER_SCALE,
            scaleY: this.baseScale * HOVER_SCALE,
            duration: ANIM_DURATION,
            ease: 'Cubic.easeOut'
        });
    }

    private onDrag(_pointer: Phaser.Input.Pointer, dragX: number, dragY: number) {
        this.x = dragX;
        this.y = dragY;
    }

    private onDragEnd() {
        this.isDragging = false;
        
        // drop it on the pile to play the card
        const droppedInPlayZone = this.y < this.scene.cameras.main.height * 0.7;
        
        if (droppedInPlayZone) {
            this.emit('card-drop', this);
        } else {
            this.resetPosition();
        }
    }

    public resetPosition() {
        this.scene.tweens.add({
            targets: this,
            x: this.originalX,
            y: this.isHovered ? this.originalY - HOVER_LIFT * 1.5 : this.originalY,
            angle: this.isHovered ? 0 : this.originalAngle,
            scaleX: this.isHovered ? this.baseScale * HOVER_SCALE : this.baseScale,
            scaleY: this.isHovered ? this.baseScale * HOVER_SCALE : this.baseScale,
            duration: ANIM_DURATION * 2,
            ease: 'Back.easeOut'
        });
        
        this.setDepth(this.isHovered ? 1000 : this.originalDepth);
    }

    private onPointerDown() {
        console.log(`Selected: ${getCardName(this.cardData)}`);
    }

    public originalDepth: number = 0;
    public setOriginalDepth(depth: number) {
        this.originalDepth = depth;
        if (!this.isHovered && !this.isDragging) {
            this.setDepth(depth);
        }
    }
}
