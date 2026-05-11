// Scenarios and research.

export const SCENARIOS = [
  {
    id: 'forest',
    name: 'Forest Frontiers',
    diff: 'easy',
    description: 'A peaceful starter park. Hit 250 guests at rating 600+ in 3 years.',
    startCash: 10000,
    loanLimit: 20000,
    startLoan: 10000,
    parkAdmission: 0,
    rideAdmission: true,
    seed: 1,
    objective: { kind: 'guests', count: 250, rating: 600, years: 3 },
    initialUnlocks: ['carousel', 'ferris', 'swinger', 'haunted', 'burger', 'drink', 'icecream', 'bathroom', 'info'],
    parkName: 'Forest Frontiers',
  },
  {
    id: 'diamond',
    name: 'Diamond Heights',
    diff: 'medium',
    description: 'Mountainous, mid-budget. Reach park value $50,000 in 3 years.',
    startCash: 15000,
    loanLimit: 25000,
    startLoan: 15000,
    parkAdmission: 0,
    rideAdmission: true,
    seed: 7,
    objective: { kind: 'value', amount: 50000, years: 3 },
    initialUnlocks: ['carousel', 'ferris', 'swinger', 'twist', 'haunted', 'topspin', 'burger', 'drink', 'icecream', 'bathroom', 'info'],
    parkName: 'Diamond Heights',
  },
  {
    id: 'leafy',
    name: 'Leafy Lake',
    diff: 'hard',
    description: 'Lakeside, tight budget. 400 guests, rating 700+ in 4 years.',
    startCash: 8000,
    loanLimit: 30000,
    startLoan: 12000,
    parkAdmission: 10,
    rideAdmission: false,
    seed: 13,
    objective: { kind: 'guests', count: 400, rating: 700, years: 4 },
    initialUnlocks: ['carousel', 'ferris', 'burger', 'drink', 'bathroom', 'info'],
    parkName: 'Leafy Lake',
  },
];

export const RESEARCH_POOL = {
  gentle: ['twist', 'haunted'],
  thrill: ['topspin'],
  shops: ['icecream'],
  coaster: ['wooden', 'steel'],
};

export function makeResearch(initialUnlocks) {
  return {
    unlocked: new Set(initialUnlocks),
    progress: 0,
    budget: 100,
    category: 'gentle',
    advance(state) {
      this.progress += this.budget / 20;
      if (this.progress >= 1000) {
        this.progress = 0;
        // pick next unlock from category
        const pool = RESEARCH_POOL[this.category] || [];
        const locked = pool.filter(x => !this.unlocked.has(x));
        if (locked.length) {
          const item = locked[Math.floor(Math.random() * locked.length)];
          this.unlocked.add(item);
          state.notify(`Research complete: ${item}`, 'good');
        }
      }
    },
  };
}

export function evaluateObjective(state) {
  const o = state.scenario.objective;
  const ageMonths = state.time.month + state.time.year * 12;
  const totalMonths = o.years * 12;
  if (o.kind === 'guests') {
    if (state.peeps.filter(p => p.alive).length >= o.count && state.parkRating >= o.rating) {
      return 'won';
    }
    if (ageMonths >= totalMonths) return 'lost';
  } else if (o.kind === 'value') {
    const value = state.finance.parkValue(state.rides, state.coasters);
    if (value >= o.amount) return 'won';
    if (ageMonths >= totalMonths) return 'lost';
  }
  // bankruptcy
  if (state.finance.cash < -1000 && state.monthsOfNegativeCash >= 12) return 'lost';
  return 'playing';
}
