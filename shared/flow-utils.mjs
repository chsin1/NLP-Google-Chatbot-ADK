export const mockAddresses = [
  { id: "a1", line1: "210 - 100 Galt Ave", city: "Toronto", province: "ON", postalCode: "M4M 2Z1", areaCode: "416" },
  { id: "a2", line1: "45 Front St W", city: "Toronto", province: "ON", postalCode: "M5J 1E6", areaCode: "416" },
  { id: "a3", line1: "88 Queen St E", city: "Toronto", province: "ON", postalCode: "M5C 1S1", areaCode: "647" },
  { id: "a4", line1: "12 Granville St", city: "Toronto", province: "ON", postalCode: "M5B 1J1", areaCode: "647" },
  { id: "a5", line1: "320 Lakeshore Blvd", city: "Toronto", province: "ON", postalCode: "M5V 1A1", areaCode: "986" },
  { id: "a6", line1: "5 Yonge St", city: "Toronto", province: "ON", postalCode: "M5E 1W7", areaCode: "986" }
];

export function classifyIntentFallback(message = "") {
  const text = String(message).toLowerCase();
  if (/(human|agent|representative|person)/.test(text)) return "human_handoff";
  if (/(bundle|pack)/.test(text)) return "bundle";
  if (/(internet|fibe|wifi|home net)/.test(text)) return "home internet";
  if (/(landline|home phone|phone line)/.test(text)) return "landline";
  return "mobility";
}

export function rankAddressSuggestions(query = "", areaCode = "") {
  const normQuery = query.trim().toLowerCase();
  const filteredByArea = areaCode ? mockAddresses.filter((item) => item.areaCode === areaCode) : mockAddresses;

  if (!normQuery) {
    return filteredByArea.slice(0, 5);
  }

  const score = (item) => {
    const haystack = `${item.line1} ${item.city} ${item.province} ${item.postalCode}`.toLowerCase();
    if (haystack.startsWith(normQuery)) return 3;
    if (haystack.includes(normQuery)) return 2;
    return 0;
  };

  return filteredByArea
    .map((item) => ({ item, rank: score(item) }))
    .filter((x) => x.rank > 0)
    .sort((a, b) => b.rank - a.rank)
    .map((x) => x.item)
    .slice(0, 5);
}
