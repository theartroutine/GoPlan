const MIN_PHOTO_PAGE_SIZE = 20;
const MAX_PHOTO_PAGE_SIZE = 60;
const LOAD_MORE_BLOCK_HEIGHT = 56;

export type PhotoPageSizeInput = {
  viewportWidth: number;
  viewportHeight: number;
  contentTop: number;
  contentWidth: number;
};

function getPhotoGridColumns(viewportWidth: number): number {
  if (viewportWidth >= 1280) return 7;
  if (viewportWidth >= 1024) return 6;
  if (viewportWidth >= 768) return 5;
  if (viewportWidth >= 640) return 4;
  return 3;
}

export function calculateInitialPhotoPageSize({
  viewportWidth,
  viewportHeight,
  contentTop,
  contentWidth,
}: PhotoPageSizeInput): number {
  const columns = getPhotoGridColumns(viewportWidth);
  const horizontalBleed = viewportWidth >= 640 ? 48 : 32;
  const gridWidth = contentWidth > 0 ? contentWidth + horizontalBleed : viewportWidth;
  const tileSize = Math.max(gridWidth / columns, 1);
  const availableHeight = Math.max(viewportHeight - contentTop, tileSize);
  const rowsForViewport = Math.ceil(
    Math.max(availableHeight - LOAD_MORE_BLOCK_HEIGHT, tileSize) / tileSize,
  );
  const minRows = Math.ceil(MIN_PHOTO_PAGE_SIZE / columns);
  const maxRows = Math.max(minRows, Math.floor(MAX_PHOTO_PAGE_SIZE / columns));
  const rows = Math.min(Math.max(rowsForViewport, minRows), maxRows);

  return rows * columns;
}

export function calculateInitialPhotoPageSizeFromElement(
  element: HTMLElement | null,
): number {
  if (typeof window === "undefined") return MIN_PHOTO_PAGE_SIZE;

  const rect = element?.getBoundingClientRect();
  return calculateInitialPhotoPageSize({
    contentTop: rect?.top ?? 0,
    contentWidth: rect?.width ?? 0,
    viewportHeight: window.innerHeight,
    viewportWidth: window.innerWidth,
  });
}
