export type TripPhotoUser = {
  id: string | null;
  display_name: string;
  identify_tag: string | null;
  avatar_url: string | null;
};

export type TripPhoto = {
  id: string;
  created_at: string;
  uploaded_by: TripPhotoUser;
  width: number;
  height: number;
  thumbnail_width: number;
  thumbnail_height: number;
  medium_width: number;
  medium_height: number;
  can_delete: boolean;
};

export type TripPhotoListResponse = {
  next: string | null;
  previous: string | null;
  results: TripPhoto[];
};

export type TripPhotoPage = {
  nextCursor: string | null;
  previousCursor: string | null;
  results: TripPhoto[];
};

export type TripPhotoUploadResponse = {
  photos: TripPhoto[];
};

export type TripPhotoVariant = "thumbnail" | "medium";
