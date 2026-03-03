const memoryCache = Array.from({ length: 500 }, (_, i) => ({
  id: `chat-${i}`,
  name: i === 490 ? "Target Chat" : `Random Chat ${i}`,
  type: "Group"
}));

// Baseline
function searchCachedChatsBaseline(query) {
  const q = query.toLowerCase().trim();
  if (!q) return [];
  return memoryCache.filter((c) => (c.name || "").toLowerCase().includes(q));
}

// Optimized
const searchCache = memoryCache.map(c => (c.name || "").toLowerCase());
function searchCachedChatsOptimized(query) {
  const q = query.toLowerCase().trim();
  if (!q) return [];

  const results = [];
  for (let i = 0; i < searchCache.length; i++) {
    if (searchCache[i].includes(q)) {
      results.push(memoryCache[i]);
    }
  }
  return results;
}

// Optimized 2 (using filter index)
function searchCachedChatsOptimized2(query) {
  const q = query.toLowerCase().trim();
  if (!q) return [];
  return memoryCache.filter((_, i) => searchCache[i].includes(q));
}

let sum1 = 0, sum2 = 0, sum3 = 0;
const N = 5;

for (let j = 0; j < N; j++) {
  const start1 = performance.now();
  for (let i = 0; i < 10000; i++) {
    searchCachedChatsBaseline("target");
  }
  const end1 = performance.now();
  sum1 += (end1 - start1);

  const start2 = performance.now();
  for (let i = 0; i < 10000; i++) {
    searchCachedChatsOptimized("target");
  }
  const end2 = performance.now();
  sum2 += (end2 - start2);

  const start3 = performance.now();
  for (let i = 0; i < 10000; i++) {
    searchCachedChatsOptimized2("target");
  }
  const end3 = performance.now();
  sum3 += (end3 - start3);
}

console.log(`Baseline: ${sum1 / N}ms`);
console.log(`Optimized (for loop): ${sum2 / N}ms`);
console.log(`Optimized (filter): ${sum3 / N}ms`);
