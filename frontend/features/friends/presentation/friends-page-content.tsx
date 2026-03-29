"use client";

import { useCallback, useEffect, useState } from "react";
import { UserPlus, Users } from "lucide-react";
import Link from "next/link";
import { isAxiosError } from "axios";

import type { Friend } from "@/features/friends/domain/types";
import { bffFriendList, bffRemoveFriend } from "@/features/friends/infrastructure/friends-api";
import { FriendCard } from "@/features/friends/presentation/friend-card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/ui/alert-dialog";
import { Button } from "@/shared/ui/button";
import { Spinner } from "@/shared/ui/spinner";

const PAGE_SIZE = 20;

export function FriendsPageContent() {
  const [friends, setFriends] = useState<Friend[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState<Friend | null>(null);

  const fetchFriends = useCallback(async () => {
    try {
      setError(null);
      const data = await bffFriendList(PAGE_SIZE, 0);
      setFriends(data.results);
      setCount(data.count);
      setOffset(0);
    } catch {
      setError("Failed to load friends.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFriends();
  }, [fetchFriends]);

  const handleRemove = async (friendshipId: string) => {
    setRemovingId(friendshipId);
    try {
      await bffRemoveFriend(friendshipId);
      setFriends((prev) => prev.filter((f) => f.friendship_id !== friendshipId));
      setCount((prev) => prev - 1);
      setConfirmTarget(null);
    } catch (err) {
      const message =
        isAxiosError(err) && typeof err.response?.data?.detail === "string"
          ? err.response.data.detail
          : "Failed to remove friend.";
      setError(message);
    } finally {
      setRemovingId(null);
    }
  };

  const handleLoadMore = async () => {
    const nextOffset = offset + PAGE_SIZE;
    setLoadingMore(true);
    try {
      const data = await bffFriendList(PAGE_SIZE, nextOffset);
      setFriends((prev) => [...prev, ...data.results]);
      setOffset(nextOffset);
    } catch {
      setError("Failed to load more friends.");
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <div className="space-y-4 p-4 lg:p-6">
      <div className="flex items-center gap-2">
        <Link href="/friends/add">
          <Button variant="outline" size="sm">
            <UserPlus className="mr-1.5 h-4 w-4" />
            Add Friend
          </Button>
        </Link>
        <Link href="/friends/requests">
          <Button variant="outline" size="sm">
            <Users className="mr-1.5 h-4 w-4" />
            Requests
          </Button>
        </Link>
      </div>

      {loading && (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      )}

      {error && (
        <p className="text-center text-sm text-destructive">{error}</p>
      )}

      {!loading && !error && friends.length === 0 && (
        <div className="rounded-xl border border-border bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground">
            No friends yet. Add friends to start planning trips together!
          </p>
        </div>
      )}

      {!loading && friends.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">{count} friend{count !== 1 ? "s" : ""}</p>
          {friends.map((friend) => (
            <FriendCard
              key={friend.friendship_id}
              user={friend.user}
              actions={
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  disabled={removingId === friend.friendship_id}
                  onClick={() => setConfirmTarget(friend)}
                >
                  {removingId === friend.friendship_id ? (
                    <Spinner className="h-4 w-4" />
                  ) : (
                    "Remove"
                  )}
                </Button>
              }
            />
          ))}
          {friends.length < count && (
            <div className="flex justify-center pt-2">
              <Button variant="outline" size="sm" onClick={handleLoadMore} disabled={loadingMore}>
                {loadingMore ? <Spinner className="h-4 w-4" /> : "Load more"}
              </Button>
            </div>
          )}
        </div>
      )}

      <AlertDialog open={!!confirmTarget} onOpenChange={(open) => !open && setConfirmTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove friend</AlertDialogTitle>
            <AlertDialogDescription>
              Remove {confirmTarget?.user.display_name} from your friends? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmTarget && handleRemove(confirmTarget.friendship_id)}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
