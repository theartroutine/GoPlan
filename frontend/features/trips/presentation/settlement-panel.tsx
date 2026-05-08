"use client";

import { ArrowRight, CheckCircle2, Clock3, Send, WalletCards } from "lucide-react";
import { useState } from "react";

import type {
  SettlementTransfer,
  TripSettlement,
} from "@/features/trips/domain/expenses-types";
import {
  formatExpenseMoney,
  getSettlementTransferRoleState,
} from "@/features/trips/domain/expenses-money";
import { getExpenseErrorMessage } from "@/features/trips/domain/expenses-errors";
import {
  confirmSettlementTransferReceived,
  markSettlementTransferSent,
} from "@/features/trips/infrastructure/expenses-api";
import { cn } from "@/shared/lib/utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/shared/ui/alert-dialog";
import { Button } from "@/shared/ui/button";

type SettlementPanelProps = {
  tripId: string;
  settlement: TripSettlement | null;
  currentUserId: string | null;
  currencyCode: string;
  onChanged: () => void | Promise<void>;
};

type PendingAction = "sent" | "received";

export function SettlementPanel({
  tripId,
  settlement,
  currentUserId,
  currencyCode,
  onChanged,
}: SettlementPanelProps) {
  const [pendingTransferIds, setPendingTransferIds] = useState<Set<string>>(() => new Set());
  const [errors, setErrors] = useState<Record<string, string>>({});

  if (!settlement || settlement.status !== "FINALIZED" || settlement.transfers.length === 0) {
    return null;
  }

  async function handleTransferAction(transfer: SettlementTransfer, action: PendingAction) {
    if (pendingTransferIds.has(transfer.id)) return;

    setPendingTransferIds((current) => new Set(current).add(transfer.id));
    setErrors((current) => ({ ...current, [transfer.id]: "" }));

    try {
      if (action === "sent") {
        await markSettlementTransferSent(tripId, transfer.id);
      } else {
        await confirmSettlementTransferReceived(tripId, transfer.id);
      }

      await onChanged();
    } catch (err) {
      setErrors((current) => ({
        ...current,
        [transfer.id]: getExpenseErrorMessage(
          err,
          "Could not update the transfer. Try again later.",
        ),
      }));
      // Refresh dashboard so the user sees the authoritative state when the
      // failure was caused by concurrent updates (e.g., transfer no longer
      // exists, settlement reopened, role changed).
      await onChanged();
    } finally {
      setPendingTransferIds((current) => {
        const next = new Set(current);
        next.delete(transfer.id);
        return next;
      });
    }
  }

  return (
    <section
      className="animate-in fade-in-0 slide-in-from-bottom-2 fill-mode-both rounded-xl border border-border bg-card p-4 shadow-xs motion-reduce:animate-none"
      style={{ animationDuration: "450ms", animationDelay: "80ms" }}
      aria-label="Settlement transfer list"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex size-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
              <WalletCards className="size-4" />
            </span>
            <h2 className="text-base font-semibold">Transfer list</h2>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            Track each transfer. Realtime notifications will come in a later step.
          </p>
        </div>
        <span className="rounded-full border border-border bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
          {formatTransferCount(settlement.transfers.length)}
        </span>
      </div>

      <div className="mt-4 space-y-3">
        {settlement.transfers.map((transfer) => {
          const roleState = currentUserId
            ? getSettlementTransferRoleState(transfer, currentUserId)
            : null;
          const canMarkSent = roleState?.canMarkSent ?? false;
          const canConfirmReceived = roleState?.canConfirmReceived ?? false;
          const isPending = pendingTransferIds.has(transfer.id);
          const transferGuidance = getTransferGuidance(transfer, roleState);

          return (
            <article
              key={transfer.id}
              data-confirmed={Boolean(transfer.recipient_confirmed_at)}
              className={cn(
                "transition duration-300 data-[confirmed=true]:border-emerald-200 data-[confirmed=true]:bg-emerald-50 dark:data-[confirmed=true]:border-emerald-900/60 dark:data-[confirmed=true]:bg-emerald-950/30 motion-reduce:transition-none",
                "rounded-lg border border-border bg-background p-3",
              )}
            >
              <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto] md:items-center">
                <TransferPerson
                  label="Payer"
                  name={transfer.payer.display_name}
                  tag={transfer.payer.identify_tag}
                />
                <ArrowRight className="hidden size-4 text-muted-foreground md:block" />
                <TransferPerson
                  label="Recipient"
                  name={transfer.recipient.display_name}
                  tag={transfer.recipient.identify_tag}
                />
                <p className="break-words text-left text-base font-semibold tabular-nums md:text-right">
                  {formatExpenseMoney(transfer.amount, currencyCode)}
                </p>
              </div>

              {transferGuidance && (
                <p className="mt-3 rounded-md bg-muted/60 px-3 py-2 text-xs font-medium text-muted-foreground">
                  {transferGuidance}
                </p>
              )}

              <div className="mt-3 grid gap-3 border-t border-border pt-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                <div className="flex flex-wrap items-center gap-2">
                  <TransferStatusBadge
                    completed={Boolean(transfer.payer_marked_sent_at)}
                    pendingLabel="Not sent"
                    doneLabel="Sent"
                  />
                  <TransferStatusBadge
                    completed={Boolean(transfer.recipient_confirmed_at)}
                    pendingLabel="Not received"
                    doneLabel="Received"
                  />
                </div>

                {canMarkSent && (
                  <TransferActionDialog
                    action="sent"
                    disabled={isPending}
                    transfer={transfer}
                    onConfirm={() => void handleTransferAction(transfer, "sent")}
                  />
                )}

                {canConfirmReceived && (
                  <TransferActionDialog
                    action="received"
                    disabled={isPending}
                    transfer={transfer}
                    onConfirm={() => void handleTransferAction(transfer, "received")}
                  />
                )}

                {!canMarkSent && !canConfirmReceived && (
                  <span className="text-xs font-medium text-muted-foreground sm:text-right">Tracking</span>
                )}
              </div>

              {errors[transfer.id] && (
                <p className="mt-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm font-medium text-destructive">
                  {errors[transfer.id]}
                </p>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function getTransferGuidance(
  transfer: SettlementTransfer,
  roleState: ReturnType<typeof getSettlementTransferRoleState> | null,
): string | null {
  if (!transfer.payer_marked_sent_at || transfer.recipient_confirmed_at) return null;

  if (roleState?.isRecipient) {
    return `${transfer.payer.display_name} marked this as sent. Confirm only after the money arrives.`;
  }

  return `Waiting for ${transfer.recipient.display_name} to confirm receipt.`;
}

function TransferActionDialog({
  action,
  disabled,
  transfer,
  onConfirm,
}: {
  action: PendingAction;
  disabled: boolean;
  transfer: SettlementTransfer;
  onConfirm: () => void;
}) {
  const isSentAction = action === "sent";
  const buttonLabel = isSentAction ? "I sent it" : "I received it";
  const title = isSentAction ? "Confirm transfer sent?" : "Confirm transfer received?";
  const description = isSentAction
    ? `You are confirming that you sent money to ${transfer.recipient.display_name}.`
    : `You are confirming that you received money from ${transfer.payer.display_name}.`;

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant={isSentAction ? "default" : "secondary"}
          className="w-full justify-center sm:w-auto"
          disabled={disabled}
        >
          {isSentAction ? <Send className="size-4" /> : <CheckCircle2 className="size-4" />}
          {buttonLabel}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={disabled}>Cancel</AlertDialogCancel>
          <AlertDialogAction disabled={disabled} onClick={onConfirm}>
            Confirm
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function TransferPerson({
  label,
  name,
  tag,
}: {
  label: "Payer" | "Recipient";
  name: string;
  tag: string | null;
}) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-semibold uppercase text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold">{name}</p>
      {tag && <p className="truncate text-xs text-muted-foreground">{tag}</p>}
    </div>
  );
}

function formatTransferCount(count: number): string {
  return `${count} ${count === 1 ? "transfer" : "transfers"}`;
}

function TransferStatusBadge({
  completed,
  pendingLabel,
  doneLabel,
}: {
  completed: boolean;
  pendingLabel: string;
  doneLabel: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
      {completed ? (
        <CheckCircle2 className="size-3.5 text-emerald-600" />
      ) : (
        <Clock3 className="size-3.5 text-amber-600" />
      )}
      {completed ? doneLabel : pendingLabel}
    </span>
  );
}
