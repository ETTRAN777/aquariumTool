import type { AppData } from '../types';

// No tanks preloaded — every user starts with a blank slate and either
// picks a starter template or builds their own tank from scratch.
export const seedData: AppData = {
  activeTankId: '',
  tanks: [],
};
