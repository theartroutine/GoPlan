type SearchSource = string | URLSearchParams | { toString(): string };

export type TimelineUrlState = {
  dayId: string | null;
  targetActivityId?: string;
  replacementHref: string | null;
};

export const TIMELINE_NOW_FOCUS_QUERY_PARAM = "now";
export const TIMELINE_NOW_FOCUS_QUERY_VALUE = "1";

const EMPTY_ACTIVITY_SECTION_IDS: ReadonlyMap<string, string> = new Map();

export function buildDayHref(
  pathname: string,
  search: SearchSource,
  dayId: string,
): string {
  const params = toParams(search);
  params.set("day", dayId);
  params.delete("activity");
  params.delete("section");
  params.delete("openSections");
  params.delete(TIMELINE_NOW_FOCUS_QUERY_PARAM);
  return toHref(pathname, params);
}

export function buildNowHref(
  pathname: string,
  search: SearchSource,
  dayId: string,
): string {
  const params = toParams(search);
  params.set("day", dayId);
  params.delete("activity");
  params.delete("section");
  params.delete("openSections");
  params.set(TIMELINE_NOW_FOCUS_QUERY_PARAM, TIMELINE_NOW_FOCUS_QUERY_VALUE);
  return toHref(pathname, params);
}

export function buildOverviewHref(pathname: string, search: SearchSource): string {
  const params = toParams(search);
  params.delete("day");
  params.delete("activity");
  params.delete("section");
  params.delete("openSections");
  params.delete(TIMELINE_NOW_FOCUS_QUERY_PARAM);
  return toHref(pathname, params);
}

export function buildActivityHref(
  pathname: string,
  search: SearchSource,
  activityId: string,
): string {
  const params = toParams(search);
  params.delete("day");
  params.delete("activity");
  params.delete("section");
  params.delete("openSections");
  params.delete(TIMELINE_NOW_FOCUS_QUERY_PARAM);
  params.set("activity", activityId);
  return toHref(pathname, params);
}

export function resolveTimelineUrlState({
  pathname,
  search,
  sectionIds,
  activitySectionIds = EMPTY_ACTIVITY_SECTION_IDS,
}: {
  pathname: string;
  search: SearchSource;
  sectionIds: ReadonlySet<string>;
  activitySectionIds?: ReadonlyMap<string, string>;
}): TimelineUrlState {
  const params = toParams(search);
  const activity = params.get("activity");
  const hasActivity = params.has("activity");

  if (hasActivity) {
    const targetDayId = activity ? activitySectionIds.get(activity) : undefined;

    if (activity && targetDayId) {
      const hasLegacy = params.has("section") || params.has("openSections");
      const shouldNormalize = params.get("day") !== targetDayId || hasLegacy;

      return {
        dayId: targetDayId,
        targetActivityId: activity,
        replacementHref: shouldNormalize
          ? buildCanonicalActivityHref(pathname, params, targetDayId, activity)
          : null,
      };
    }

    params.delete("activity");
    const fallback = resolveTimelineUrlStateWithoutActivity({
      pathname,
      params,
      sectionIds,
    });

    return {
      ...fallback,
      replacementHref: fallback.replacementHref ?? toHref(pathname, params),
    };
  }

  return resolveTimelineUrlStateWithoutActivity({
    pathname,
    params,
    sectionIds,
  });
}

function resolveTimelineUrlStateWithoutActivity({
  pathname,
  params,
  sectionIds,
}: {
  pathname: string;
  params: URLSearchParams;
  sectionIds: ReadonlySet<string>;
}): TimelineUrlState {
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

function buildCanonicalActivityHref(
  pathname: string,
  search: SearchSource,
  dayId: string,
  activityId: string,
): string {
  const params = toParams(search);
  params.delete("day");
  params.delete("activity");
  params.delete("section");
  params.delete("openSections");
  params.delete(TIMELINE_NOW_FOCUS_QUERY_PARAM);
  params.set("day", dayId);
  params.set("activity", activityId);
  return toHref(pathname, params);
}
