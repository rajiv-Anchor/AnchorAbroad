const BAD = /#ERROR!|#N\/A|#VALUE!|^undefined$|^null$/i;

export function clean(value) {
  if (value === undefined || value === null) return "";
  const text = String(value).replace(/\s+/g, " ").trim();
  if (BAD.test(text)) throw new Error(`Invalid poster value: ${text}`);
  return text;
}

export function validatePoster(input) {
  const poster = {
    orderCode: clean(input.orderCode),
    country: clean(input.country),
    headline: clean(input.headline || `RECRUITMENT OPPORTUNITY IN ${input.country || ""}`),
    status: clean(input.status || "Recruiting"),
    logoUrl: clean(input.logoUrl),
    heroImageUrl: clean(input.heroImageUrl),
    facts: Array.isArray(input.facts) ? input.facts : [],
    roles: Array.isArray(input.roles) ? input.roles : []
  };

  if (!poster.logoUrl) throw new Error("The bundled official Anchor Abroad logo could not be loaded.");
  if (!poster.heroImageUrl) throw new Error("heroImageUrl is required; use an approved Drive-hosted role image.");
  if (!poster.country) throw new Error("country is required.");
  if (poster.roles.length < 1 || poster.roles.length > 4) throw new Error("Provide between 1 and 4 roles.");

  poster.roles = poster.roles.map((role, i) => {
    const normalized = {
      title: clean(role.title),
      vacancies: clean(role.vacancies),
      localSalary: clean(role.localSalary),
      inrSalary: clean(role.inrSalary)
    };
    if (!normalized.title) throw new Error(`Role ${i + 1}: title is required.`);
    if (!normalized.localSalary) throw new Error(`Role ${i + 1}: localSalary is required.`);
    if (!normalized.inrSalary) throw new Error(`Role ${i + 1}: inrSalary is required.`);
    return normalized;
  });

  poster.facts = poster.facts
    .map(f => ({ label: clean(f.label), value: clean(f.value), icon: clean(f.icon || "•") }))
    .filter(f => f.label && f.value && !/^unknown$|^not stated$/i.test(f.value))
    .slice(0, 14);
  return poster;
}
