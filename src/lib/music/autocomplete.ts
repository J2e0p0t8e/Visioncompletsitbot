// @ts-nocheck
const AUTocomplete_TIMEOUT_MS = 2500;
const CACHE_TTL_MS = 60_000;
const suggestCache = new Map();

function getCachedSuggestions(query) {
  const entry = suggestCache.get(query.toLowerCase().trim());
  if (!entry) return null;
  if (Date.now() - entry.time > CACHE_TTL_MS) {
    suggestCache.delete(query.toLowerCase().trim());
    return null;
  }
  return entry.choices;
}

function setCachedSuggestions(query, choices) {
  if (!choices.length) return;
  suggestCache.set(query.toLowerCase().trim(), { choices, time: Date.now() });
  if (suggestCache.size > 100) {
    const oldest = suggestCache.keys().next().value;
    suggestCache.delete(oldest);
  }
}

function isIgnorableAutocompleteError(err) {
  return (
    err?.code === 10062 ||
    err?.code === 'UND_ERR_CONNECT_TIMEOUT' ||
    err?.message?.includes('Unknown interaction') ||
    err?.message?.includes('Connect Timeout') ||
    err?.message?.includes('already been acknowledged')
  );
}

async function safeAutocompleteRespond(interaction, choices = []) {
  if (interaction.responded) return false;
  try {
    await interaction.respond(choices);
    return true;
  } catch (err) {
    if (!isIgnorableAutocompleteError(err)) {
      console.warn('Autocomplete respond:', err.message);
    }
    return false;
  }
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((resolve) => setTimeout(() => resolve([]), ms)),
  ]);
}

export {
  AUTocomplete_TIMEOUT_MS,
  getCachedSuggestions,
  setCachedSuggestions,
  safeAutocompleteRespond,
  withTimeout,
  isIgnorableAutocompleteError,
};
