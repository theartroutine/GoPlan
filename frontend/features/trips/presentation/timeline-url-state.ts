type SearchSource = string | URLSearchParams | { toString(): string };

export type TimelineUrlState = {
  dayId: string | null;
  replacementHref: string | null;
};

export function buildDayHref(
  pathname: string,
  search: SearchSource,
  dayId: string,
): string {
  const params = toParams(search);
  params.set("day", dayId);
  params.delete("section");
  params.delete("openSections");
  return toHref(pathname, params);
}

export function buildOverviewHref(pathname: string, search: SearchSource): string {
  const params = toParams(search);
  params.delete("day");
  params.delete("section");
  params.delete("openSections");
  return toHref(pathname, params);
}

export function resolveTimelineUrlState({
  pathname,
  search,
  sectionIds,
}: {
  pathname: string;
  search: SearchSource;
  sectionIds: ReadonlySet<string>;
}): TimelineUrlState {
  const params = toParams(search);
  const day = params.get("day");
  const section = params.get("section");
  const hasLegacy = params.has("section") || params.has("openSections");

  if (params.has("day")) {
    if (!day || !sectionIds.has(day)) {
      return {
        dayId: null,
        replacementHref: buildOverviewHref(pathname, params),
      };
    }

    return {
      dayId: day,
      replacementHref: hasLegacy ? buildDayHref(pathname, params, day) : null,
    };
  }

  if (section && sectionIds.has(section)) {
    return {
      dayId: section,
      replacementHref: buildDayHref(pathname, params, section),
    };
  }

  if (hasLegacy) {
    return {
      dayId: null,
      replacementHref: buildOverviewHref(pathname, params),
    };
  }

  return {
    dayId: null,
    replacementHref: null,
  };
}

function toParams(search: SearchSource): URLSearchParams {
  return new URLSearchParams(typeof search === "string" ? search : search.toString());
}

function toHref(pathname: string, params: URLSearchParams): string {
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}
