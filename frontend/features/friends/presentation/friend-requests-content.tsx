"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { isAxiosError } from "axios";

import type { FriendRequest } from "@/features/friends/domain/types";
import {
  bffAcceptRequest,
  bffCancelRequest,
  bffDeclineRequest,
  bffIncomingRequests,
  bffOutgoingRequests,
} from "@/features/friends/infrastructure/friends-api";
import { FriendCard } from "@/features/friends/presentation/friend-card";
import { Button } from "@/shared/ui/button";
import { Spinner } from "@/shared/ui/spinner";

type Tab = "incoming" | "outgoing";

const PAGE_SIZE = 20;

export function FriendRequestsContent() {
  const [tab, setTab] = useState<Tab>("incoming");
  const [incoming, setIncoming] = useState<FriendRequest[]>([]);
  const [outgoing, setOutgoing] = useState<FriendRequest[]>([]);
  const [incomingCount, setIncomingCount] = useState(0);
  const [outgoingCount, setOutgoingCount] = useState(0);
  const [incomingOffset, setIncomingOffset] = useState(0);
  const [outgoingOffset, setOutgoingOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);

  const fetchRequests = useCallback(async () => {
    try {
      setError(null);
      setLoading(true);
      const [inc, out] = await Promise.all([
        bffIncomingRequests(PAGE_SIZE, 0),
        bffOutgoingRequests(PAGE_SIZE, 0),
      ]);
      setIncoming(inc.results);
      setIncomingCount(inc.count);
      setIncomingOffset(0);
      setOutgoing(out.results);
      setOutgoingCount(out.count);
      setOutgoingOffset(0);
    } catch {
      setError("Failed to load friend requests.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  const handleAction = async (
    id: string,
    action: "accept" | "decline" | "cancel",
  ) => {
    if (actionId !== null) return;
    setActionId(id);
    try {
      if (action === "accept") {
        await bffAcceptRequest(id);
      } else if (action === "decline") {
        await bffDeclineRequest(id);
      } else {
        await bffCancelRequest(id);
      }
      if (action === "cancel") {
        setOutgoing((prev) => prev.filter((r) => r.id !== id));
        setOutgoingCount((prev) => prev - 1);
      } else {
        setIncoming((prev) => prev.filter((r) => r.id !== id));
        setIncomingCount((prev) => prev - 1);
      }
    } catch (err) {
      const message =
        isAxiosError(err) && typeof err.response?.data?.detail === "string"
          ? err.response.data.detail
          : "Action failed. Please try again.";
      setError(message);
    } finally {
      setActionId(null);
    }
  };

  const handleLoadMore = async () => {
    if (loadingMore) return;
    setLoadingMore(true);
    try {
      if (tab === "incoming") {
        const nextOffset = incomingOffset + PAGE_SIZE;
        const data = await bffIncomingRequests(PAGE_SIZE, nextOffset);
        setIncoming((prev) => [...prev, ...data.results]);
        setIncomingOffset(nextOffset);
      } else {
        const nextOffset = outgoingOffset + PAGE_SIZE;
        const data = await bffOutgoingRequests(PAGE_SIZE, nextOffset);
        setOutgoing((prev) => [...prev, ...data.results]);
        setOutgoingOffset(nextOffset);
      }
    } catch {
      setError("Failed to load more requests.");
    } finally {
      setLoadingMore(false);
    }
  };

  const currentList = tab === "incoming" ? incoming : outgoing;
  const currentCount = tab === "incoming" ? incomingCount : outgoingCount;

  return (
    <div className="space-y-4 p-4 lg:p-6">
      <Link href="/friends">
        <Button variant="ghost" size="sm">
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          Back to Friends
        </Button>
      </Link>

      <div className="flex gap-1 rounded-lg bg-muted p-1">
        <button
          type="button"
          className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            tab === "incoming"
              ? "bg-background shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
          onClick={() => setTab("incoming")}
        >
          Incoming{incomingCount > 0 ? ` (${incomingCount})` : ""}
        </button>
        <button
          type="button"
          className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            tab === "outgoing"
              ? "bg-background shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
          onClick={() => setTab("outgoing")}
        >
          Outgoing{outgoingCount > 0 ? ` (${outgoingCount})` : ""}
        </button>
      </div>

      {loading && (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      )}

      {error && (
        <p className="text-center text-sm text-destructive">{error}</p>
      )}

      {!loading && currentList.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">
          {tab === "incoming"
            ? "No incoming friend requests."
            : "No outgoing friend requests."}
        </p>
      )}

      {!loading && (
        <div className="space-y-2">
          {tab === "incoming" &&
            incoming.map((req) => (
              <FriendCard
                key={req.id}
                user={req.sender}
                actions={
                  <>
                    <Button
                      size="sm"
                      disabled={actionId === req.id}
                      onClick={() => handleAction(req.id, "accept")}
                    >
                      {actionId === req.id ? (
                        <Spinner className="h-4 w-4" />
                      ) : (
                        "Accept"
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={actionId === req.id}
                      onClick={() => handleAction(req.id, "decline")}
                    >
                      Decline
                    </Button>
                  </>
                }
              />
            ))}
          {tab === "outgoing" &&
            outgoing.map((req) => (
              <FriendCard
                key={req.id}
                user={req.receiver}
                actions={
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={actionId === req.id}
                    onClick={() => handleAction(req.id, "cancel")}
                  >
                    {actionId === req.id ? (
                      <Spinner className="h-4 w-4" />
                    ) : (
                      "Cancel"
                    )}
                  </Button>
                }
              />
            ))}
          {currentList.length < currentCount && (
            <div className="flex justify-center pt-2">
              <Button variant="outline" size="sm" onClick={handleLoadMore} disabled={loadingMore}>
                {loadingMore ? <Spinner className="h-4 w-4" /> : "Load more"}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
