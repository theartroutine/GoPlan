type ApiErrorResponse = {
  status?: unknown;
  data?: unknown;
  headers?: unknown;
};

type ApiErrorLike = {
  response?: ApiErrorResponse;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function getApiErrorResponse(error: unknown): ApiErrorResponse | null {
  if (!isRecord(error)) return null;
  const response = (error as ApiErrorLike).response;
  return response && typeof response === "object" ? response : null;
}

export function getApiErrorData(error: unknown): unknown {
  return getApiErrorResponse(error)?.data;
}

export function getApiErrorStatus(error: unknown): number | null {
  const status = getApiErrorResponse(error)?.status;
  return typeof status === "number" ? status : null;
}

export function getApiErrorCode(error: unknown): string | null {
  const data = getApiErrorData(error);
  if (!isRecord(data)) return null;
  const code = data.error_code;
  return typeof code === "string" && code.trim() ? code : null;
}

export function extractApiErrorMessage(data: unknown): string | null {
  if (!isRecord(data)) return null;

  const detail = data.detail;
  if (typeof detail === "string" && detail.trim()) return detail;

  const nonFieldMessage = extractFirstMessage(data.non_field_errors);
  if (nonFieldMessage) return nonFieldMessage;

  for (const [field, value] of Object.entries(data)) {
    const message = extractFirstMessage(value);
    if (message) return `${field}: ${message}`;
  }

  return null;
}

function extractFirstMessage(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value;
  if (!Array.isArray(value)) return null;

  for (const item of value) {
    if (typeof item === "string" && item.trim()) return item;
    if (isRecord(item)) {
      const message = item.message;
      if (typeof message === "string" && message.trim()) return message;
    }
  }

  return null;
}

function getHeaderValue(headers: unknown, key: string): string | null {
  if (!isRecord(headers)) return null;

  const getter = (headers as { get?: (name: string) => unknown }).get;
  if (typeof getter === "function") {
    const value = getter.call(headers, key);
    if (typeof value === "string" && value.trim()) return value;
  }

  const lowerKey = key.toLowerCase();
  for (const [name, value] of Object.entries(headers)) {
    if (name.toLowerCase() !== lowerKey) continue;
    return typeof value === "string" && value.trim() ? value : null;
  }

  return null;
}

function isJsonContentType(value: string | null): boolean {
  if (!value) return false;
  const contentType = value.toLowerCase();
  return contentType.includes("application/json") || contentType.includes("+json");
}

async function parseJsonErrorBlob(
  data: unknown,
  headers: unknown,
): Promise<unknown | null> {
  if (typeof Blob === "undefined" || !(data instanceof Blob)) return null;

  const contentType = getHeaderValue(headers, "content-type") || data.type;
  if (!isJsonContentType(contentType)) return null;

  const text = await readBlobText(data);
  if (!text.trim()) return null;

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function readBlobWithFileReader(data: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve(typeof reader.result === "string" ? reader.result : "");
    };
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read blob."));
    reader.readAsText(data);
  });
}

async function readBlobText(data: Blob): Promise<string> {
  if (typeof data.text === "function") return data.text();
  if (typeof data.arrayBuffer === "function") {
    return new TextDecoder().decode(await data.arrayBuffer());
  }
  if (typeof FileReader !== "undefined") return readBlobWithFileReader(data);
  return new Response(data).text();
}

export async function throwWithParsedBlobJsonError(error: unknown): Promise<never> {
  const response = getApiErrorResponse(error);
  if (response) {
    const parsed = await parseJsonErrorBlob(response.data, response.headers);
    if (parsed !== null) response.data = parsed;
  }
  throw error;
}
