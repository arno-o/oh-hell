export function getPlayerPositions(width: number, height: number): { x: number, y: number }[] {
    const centerX = width / 2;
    // const centerY = height / 2;
    const positions: { x: number, y: number }[] = [];
    const isPortrait = height > width;

    // Player 1 (Bottom Center - Hero)
    positions.push({ x: centerX, y: height * (isPortrait ? 0.9 : 0.88) });
    
    

    return positions;
}