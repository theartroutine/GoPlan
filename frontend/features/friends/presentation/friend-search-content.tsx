"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Search } from "lucide-react";
import Link from "next/link";
import { isAxiosError } from "axios";

import type { FriendUser } from "@/features/friends/domain/types";
import {
  bffSearchUser,
  bffSendRequest,
} from "@/features/friends/infrastructure/friends-api";
import { FriendCard } from "@/features/friends/presentation/friend-card";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Spinner } from "@/shared/ui/spinner";

type SearchState = "idle" | "loading" | "found" | "not-found" | "sent" | "error";

export function FriendSearchContent() {
  const [query, setQuery] = useState("");
  const [state, setState] = useState<SearchState>("idle");
  const [foundUser, setFoundUser] = useState<FriendUser | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const handleSearch = useCallback(async () => {
    const trimmed = query.trim();
    if (trimmed.length < 2) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setState("loading");
    setError(null);
    setFoundUser(null);

    try {
      const data = await bffSearchUser(trimmed, controller.signal);
      if (data.user) {
        setFoundUser(data.user);
        setState("found");
      } else {
        setState("not-found");
      }
    } catch (err) {
      if (
        controller.signal.aborted ||
        (isAxiosError(err) && err.code === "ERR_CANCELED")
      ) {
        return;
      }
      const message =
        isAxiosError(err) && typeof err.response?.data?.detail === "string"
          ? err.response.data.detail
          : "Search failed. Please try again.";
      setError(message);
      setState("error");
    }
  }, [query]);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      abortRef.current?.abort();
      return;
    }

    const id = setTimeout(() => {
      void handleSearch();
    }, 300);

    return () => clearTimeout(id);
  }, [query, handleSearch]);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const handleSend = async () => {
    if (!foundUser) return;
    setSending(true);
    setError(null);

    try {
      await bffSendRequest(query.trim());
      setState("sent");
    } catch (err) {
      let message = "Failed to send friend request.";
      if (isAxiosError(err) && err.response?.data) {
        const data = err.response.data as Record<string, unknown>;
        if (typeof data.detail === "string") {
          message = data.detail;
        }
      }
      setError(message);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") void handleSearch();
  };

  return (
    <div className="space-y-4 p-4 lg:p-6">
      <Link href="/friends">
        <Button variant="ghost" size="sm">
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          Back to Friends
        </Button>
      </Link>

      <div className="flex gap-2">
        <Input
          placeholder="Enter identify tag (e.g. name#CODE)"
          value={query}
          onChange={(e) => {
            const nextQuery = e.target.value;
            abortRef.current?.abort();
            setQuery(nextQuery);
            if (state !== "idle") {
              setState("idle");
              setError(null);
              setFoundUser(null);
            }
          }}
          onKeyDown={handleKeyDown}
          className="flex-1"
        />
        <Button
          onClick={() => void handleSearch()}
          disabled={state === "loading" || query.trim().length < 2}
        >
          {state === "loading" ? (
            <Spinner className="h-4 w-4" />
          ) : (
            <>
              <Search className="mr-1.5 h-4 w-4" />
              Search
            </>
          )}
        </Button>
      </div>

      {error && (
        <p className="text-center text-sm text-destructive">{error}</p>
      )}

      {state === "not-found" && (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No user found with that identify tag.
        </p>
      )}

      {state === "found" && foundUser && (
        <FriendCard
          user={foundUser}
          actions={
            <Button size="sm" disabled={sending} onClick={handleSend}>
              {sending ? (
                <Spinner className="h-4 w-4" />
              ) : (
                "Send Request"
              )}
            </Button>
          }
        />
      )}

      {state === "sent" && (
        <div className="rounded-xl border border-border bg-card p-6 text-center">
          <p className="text-sm font-medium text-green-600">
            Friend request sent!
          </p>
        </div>
      )}
    </div>
  );
}
