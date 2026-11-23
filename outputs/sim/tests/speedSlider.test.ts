import { describe, it, expect } from 'vitest';

/**
 * Maps a range slider input value in [0, 500] step=20 to an orbital simulation speed multiplier.
 * Rule: position 0 maps strictly to 1x real-time; any value > 0 lands on exact 20x increments.
 */
export function mapSliderToRate(sliderValue: number): number {
  if (sliderValue <= 0) return 1;
  return Math.min(500, Math.round(sliderValue / 20) * 20);
}

describe('Precision Playback Speed Slider (1x to 500x)', () => {
  it('maps position 0 to strictly 1x real-time', () => {
    expect(mapSliderToRate(0)).toBe(1);
  });

  it('preserves exact 20x increments for all steps above 0', () => {
    expect(mapSliderToRate(20)).toBe(20);
    expect(mapSliderToRate(40)).toBe(40);
    expect(mapSliderToRate(60)).toBe(60);
    expect(mapSliderToRate(100)).toBe(100);
    expect(mapSliderToRate(260)).toBe(260);
    expect(mapSliderToRate(480)).toBe(480);
    expect(mapSliderToRate(500)).toBe(500);
  });

  it('clamps values correctly at boundary', () => {
    expect(mapSliderToRate(-10)).toBe(1);
    expect(mapSliderToRate(600)).toBe(500);
  });
});
