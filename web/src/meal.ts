import { readString, useStored, write } from './store';

// Tonight's meal, shared with the Meal picker app (same keys).
const MEALS_KEY = 'meal-picker:meals';
const LAST_KEY = 'meal-picker:last';

export const DEFAULT_MEALS = [
  'Jollof rice and chicken', 'Spaghetti bolognese', 'Fried rice and turkey', 'Beans and plantain',
  'Egusi and pounded yam', 'Chicken salad', 'Noodles and eggs', 'Pizza night',
];

function meals(): string[] {
  try {
    const v = JSON.parse(readString(MEALS_KEY) ?? 'null');
    if (Array.isArray(v) && v.length > 0 && v.every((m) => typeof m === 'string')) return v;
  } catch {
    // corrupt list: fall back to defaults
  }
  return DEFAULT_MEALS;
}

export function useMealPick(): string {
  return useStored(LAST_KEY) ?? DEFAULT_MEALS[0];
}

export function rerollMeal() {
  const all = meals();
  const current = readString(LAST_KEY) ?? DEFAULT_MEALS[0];
  const pool = all.length > 1 ? all.filter((m) => m !== current) : all;
  write(LAST_KEY, pool[Math.floor(Math.random() * pool.length)]);
}

// "Jollof rice and chicken" reads as "Tonight it's jollof rice and chicken";
// leave acronyms ("BBQ ribs") alone.
export function inSentence(meal: string): string {
  return /^[A-Z][^A-Z]/.test(meal) ? meal[0].toLowerCase() + meal.slice(1) : meal;
}
