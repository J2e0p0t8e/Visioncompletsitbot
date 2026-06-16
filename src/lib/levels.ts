/** Niveau à partir de l'XP total (aligné sur la fonction SQL credit_discord_xp) */
export function xpToLevel(totalXp: number): number {
  return Math.max(1, Math.floor(Math.sqrt(totalXp / 100)) + 1);
}

/** XP requis pour atteindre le niveau suivant */
export function xpForLevel(level: number): number {
  if (level <= 1) return 0;
  return (level - 1) ** 2 * 100;
}

/** XP manquant avant le prochain niveau */
export function xpProgress(totalXp: number): {
  level: number;
  current: number;
  needed: number;
  percent: number;
} {
  const level = xpToLevel(totalXp);
  const currentLevelXp = xpForLevel(level);
  const nextLevelXp = xpForLevel(level + 1);
  const current = totalXp - currentLevelXp;
  const needed = nextLevelXp - currentLevelXp;
  const percent = needed > 0 ? Math.min(100, Math.round((current / needed) * 100)) : 100;

  return { level, current, needed, percent };
}

export function formatXpBar(percent: number, length = 10): string {
  const filled = Math.round((percent / 100) * length);
  return "█".repeat(filled) + "░".repeat(length - filled);
}

/** Affichage FR : entier ou une décimale (ex. 12,5) */
export function formatXpAmount(xp: number): string {
  if (Number.isInteger(xp)) {
    return xp.toLocaleString("fr-FR");
  }
  return xp.toLocaleString("fr-FR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}
