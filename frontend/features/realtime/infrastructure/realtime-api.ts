import { bff } from "@/shared/http/bff-client";

type WsTicketResponse = {
  ticket: string;
};

export async function bffWsTicket(): Promise<WsTicketResponse> {
  const res = await bff.post<WsTicketResponse>("/api/realtime/ws-ticket");
  return res.data;
}

export async function bffRefreshWsTicket(): Promise<WsTicketResponse> {
  const res = await bff.post<WsTicketResponse>("/api/realtime/ws-ticket/refresh");
  return res.data;
}
