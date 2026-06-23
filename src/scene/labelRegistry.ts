// Shared bridge between the in-canvas label projector and the DOM label
// overlay. The projector (inside <Canvas>) writes each planet label's screen
// position straight onto the registered DOM element each frame.
export const labelEls: Record<string, HTMLElement | null> = {};
