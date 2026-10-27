import { describe, expect, it } from 'vitest';
import { SEED, allUnits, runFreshness } from '../core';
import { verdict } from './Event';

const data = runFreshness(SEED, '2026-10-22').data;
const unit = (id: string) => allUnits(data).find((u) => u.unit.id === id)!.unit;

describe('Baseline Duel marks come from our checked fees', () => {
  it('₹75 for the fort differs from the ASI ₹25 / ₹20', () => {
    expect(verdict('₹75 "ASI monument ticket"', unit('fort-asi'))).toBe('differs');
    expect(verdict('₹25 cash', unit('fort-asi'))).toBe('match');
  });
  it('"Free" for Sas-Bahu differs, since it shares the ticketed ASI fort ticket', () => {
    expect(verdict('Free', unit('sas-bahu'))).toBe('differs');
  });
  it('any certain price for Jai Vilas is flagged as unsure, not right or wrong', () => {
    expect(verdict('₹350', unit('jai-vilas'))).toBe('unsure');
  });
  it('no claim is shown as a dash', () => {
    expect(verdict('—', unit('fort-gujari'))).toBe('none');
  });
});
