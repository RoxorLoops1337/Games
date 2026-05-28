import React from 'react';
import { NounId } from '../engine/types';

// Maps an enemy noun to its asset slug. Returns null if no icon exists.
function iconSlug(noun: NounId): string | null {
  switch (noun) {
    case 'GOBLIN':       return 'goblin';
    case 'WOLF':         return 'wolf';
    case 'MUSHROOM':     return 'mushroom';
    case 'TREE':         return 'tree';
    case 'THORN':        return 'thorn';
    case 'BIG_GOBLIN':   return 'big_goblin';
    case 'GREEN_KNIGHT': return 'green_knight';
    default:             return null;
  }
}

interface Props {
  noun: NounId;
  size?: number;
}

// Renders a tinted SVG mask of the enemy icon. Color follows currentColor
// so callers can theme via CSS color.
export function EnemyIcon({ noun, size = 64 }: Props): React.ReactElement | null {
  const slug = iconSlug(noun);
  if (!slug) return null;
  const url = `./assets/icons/${slug}.svg`;
  return (
    <div
      className="enemy-icon"
      role="img"
      aria-label={noun.toLowerCase()}
      style={{
        width: size,
        height: size,
        WebkitMaskImage: `url('${url}')`,
        maskImage: `url('${url}')`,
        WebkitMaskRepeat: 'no-repeat',
        maskRepeat: 'no-repeat',
        WebkitMaskPosition: 'center',
        maskPosition: 'center',
        WebkitMaskSize: 'contain',
        maskSize: 'contain',
        backgroundColor: 'currentColor',
      }}
    />
  );
}
