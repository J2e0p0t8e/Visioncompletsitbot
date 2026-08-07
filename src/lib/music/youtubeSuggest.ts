// @ts-nocheck
import https from "https";

function fetchSuggestions(query) {
  const url = `https://suggestqueries.google.com/complete/search?client=firefox&ds=yt&q=${encodeURIComponent(query)}`;

  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            const start = data.indexOf('[');
            const end = data.lastIndexOf(']');
            if (start === -1 || end === -1) return resolve([]);
            const parsed = JSON.parse(data.slice(start, end + 1));
            const items = parsed[1] || [];
            const titles = items
              .map((item) => (Array.isArray(item) ? item[0] : item))
              .filter((t) => typeof t === 'string' && t.trim());
            resolve(titles);
          } catch {
            resolve([]);
          }
        });
      })
      .on('error', reject);
  });
}

async function suggestYoutubeTitles(query, limit = 5) {
  if (!query || query.length < 2) return [];
  try {
    const titles = await fetchSuggestions(query);
    return titles.slice(0, limit);
  } catch (err) {
    console.warn('Suggestions YouTube:', err.message);
    return [];
  }
}

export { suggestYoutubeTitles };
