export const TRIP_DESCRIPTION_MAX_LENGTH = 180;

export function isTripDescriptionTooLong(description: string): boolean {
  return description.length > TRIP_DESCRIPTION_MAX_LENGTH;
}
