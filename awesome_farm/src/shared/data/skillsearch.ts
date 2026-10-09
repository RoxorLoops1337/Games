// What the skill tree's search box looks through: a skill's name, branch, words and stat lines, and the names of everything it unlocks
// (the buildings and recipes that wait for one of its unlock tokens), so "ballista" finds Siegeworks and "bed" finds nothing it should not.
// Pure, so a test can check it.

import { BUILDINGS } from './buildings';
import { ITEMS } from './items';
import { RECIPE_LIST } from './recipes';
import { BRANCHES, SKILL_LIST, UNLOCK_INFO, type SkillNode } from './skills';
import { modLine, type StatKey } from './stats';

let cache: Map<string, string> | null = null;

/** Everything searchable about every skill, lower case, built once. */
function index (): Map<string, string> {
    if (cache) return cache;
    const byToken = new Map<string, string[]>();
    const add = (tok: string, name: string) => { const l = byToken.get(tok); if (l) l.push(name); else byToken.set(tok, [name]); };
    for (const b of Object.values(BUILDINGS)) if (b.req) add(b.req, b.name);
    for (const r of RECIPE_LIST) if (r.req) add(r.req, ITEMS[r.out]?.name ?? r.out);
    cache = new Map();
    for (const n of SKILL_LIST) {
        const words = [
            n.name, BRANCHES[n.branch].name, n.desc ?? '', n.key ? 'keystone' : '',
            ...Object.entries(n.mods ?? {}).map(([k, v]) => modLine(k as StatKey, v as number)),
            ...(n.unlock ?? []).flatMap((t) => [UNLOCK_INFO[t] ?? t, ...(byToken.get(t) ?? [])]),
        ];
        cache.set(n.id, words.join(' | ').toLowerCase());
    }
    return cache;
}

/** Does this skill match what was typed (every word of it must appear somewhere)? An empty search matches everything. */
export function skillMatches (n: SkillNode, query: string): boolean {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    const hay = index().get(n.id) ?? '';
    return q.split(/\s+/).every((w) => hay.includes(w));
}

/** The skills that match, in tree order. */
export const searchSkills = (query: string): SkillNode[] => SKILL_LIST.filter((n) => skillMatches(n, query));
