// Daily Case modifiers. Each has an Up side and a Down side, both data-driven.
// Fields read by the engine (all optional): shatter (+/- Overload Shatter chance), hpMul (enemy HP), shopMul (shop prices),
// budget (+/- Budget), goldMul (fight gold), echo (Echo at combat start), lineCap (Thread Lines cap at this length).
// text is shown on the title card (keep it under ~72 chars, it wraps in 268 px). No em dashes, no exclamation marks.
// Order is part of the daily seed mapping: only ever append.
export const DAILY_MODS = [
  { id: 'fragile', name: 'Fragile Stitches', text: 'Up: fight gold +25%. Down: Shatter chance +15%.', up: 'Fight gold +25%.', down: 'Shatter chance +15%.', shatter: 0.15, goldMul: 1.25 },
  { id: 'tough', name: 'Thick Skinned', text: 'Up: shop prices -20%. Down: enemies have 15% more HP.', up: 'Shop prices -20%.', down: 'Enemies have 15% more HP.', hpMul: 1.15, shopMul: 0.8 },
  { id: 'cheap', name: 'Clearance Sale', text: 'Up: shop prices -25%. Down: Budget -1.', up: 'Shop prices -25%.', down: 'Budget -1.', shopMul: 0.75, budget: -1 },
  { id: 'roomy', name: 'Roomy Ward', text: 'Up: Budget +2. Down: enemies have 10% more HP.', up: 'Budget +2.', down: 'Enemies have 10% more HP.', budget: 2, hpMul: 1.1 },
  { id: 'poor', name: 'Lean Times', text: 'Up: start each combat with 1 Echo. Down: fight gold halved.', up: 'Start each combat with 1 Echo.', down: 'Fight gold is halved.', goldMul: 0.5, echo: 1 },
  { id: 'jumpy', name: 'Jumpy Hands', text: 'Up: 1 Echo each combat. Down: Shatter chance +10%.', up: 'Start each combat with 1 Echo.', down: 'Shatter chance +10%.', echo: 1, shatter: 0.1 },
  { id: 'fraying', name: 'Fraying', text: 'Up: Budget +1. Down: all Lines cap at 3.', up: 'Budget +1.', down: 'All Lines cap at 3.', lineCap: 3, budget: 1 },
  { id: 'heavy', name: 'Heavy Needles', text: 'Up: fight gold +40%. Down: Budget -2.', up: 'Fight gold +40%.', down: 'Budget -2.', budget: -2, goldMul: 1.4 },
  { id: 'tight', name: 'Tight Quarters', text: 'Up: 1 Echo each combat. Down: Budget -1.', up: 'Start each combat with 1 Echo.', down: 'Budget -1.', echo: 1, budget: -1 },
  { id: 'gilt', name: 'Gilt Week', text: 'Up: fight gold +50%. Down: enemies have 20% more HP.', up: 'Fight gold +50%.', down: 'Enemies have 20% more HP.', goldMul: 1.5, hpMul: 1.2 },
  { id: 'steady', name: 'Steady Hands', text: 'Up: Shatter chance -25%. Down: shop prices +25%.', up: 'Shatter chance -25%.', down: 'Shop prices +25%.', shatter: -0.25, shopMul: 1.25 },
  { id: 'short', name: 'Short Thread', text: 'Up: Shatter chance -10%. Down: all Lines cap at 4.', up: 'Shatter chance -10%.', down: 'All Lines cap at 4.', lineCap: 4, shatter: -0.1 },
];
export const dailyModFor = (hash) => DAILY_MODS[Math.abs(hash | 0) % DAILY_MODS.length];
