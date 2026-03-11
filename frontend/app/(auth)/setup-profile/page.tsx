"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { SetupProfileForm, type SetupProfileFields } from "@/features/auth/presentation/setup-profile-form";
import { ProfilePreviewCard } from "@/features/auth/presentation/profile-preview-card";
import { IdentifyNameExplainer } from "@/features/auth/presentation/identify-name-explainer";
import { PendingProfileGuard } from "@/features/auth/presentation/pending-profile-guard";
import { VerifiedBanner } from "@/features/auth/presentation/verified-banner";

type ConnectorPoints = {
  input1Y: number;
  input2Y: number;
  input3Y: number;
  inputLeft: number;
  inputRight: number;
  formLeft: number;
  formRight: number;
  previewRight: number;
  explainerLeft: number;
  previewHeight: number;
  explainerHeight: number;
  gridWidth: number;
  gridHeight: number;
};

export default function SetupProfilePage() {
  const [fields, setFields] = useState<SetupProfileFields>({
    firstName: "",
    lastName: "",
    identifyName: "",
  });
  const [points, setPoints] = useState<ConnectorPoints | null>(null);
  const [gridNode, setGridNode] = useState<HTMLDivElement | null>(null);

  const gridCallbackRef = useCallback((node: HTMLDivElement | null) => {
    setGridNode(node);
  }, []);
  const formRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const explainerRef = useRef<HTMLDivElement>(null);
  const firstNameRef = useRef<HTMLInputElement>(null);
  const lastNameRef = useRef<HTMLInputElement>(null);
  const identifyNameRef = useRef<HTMLInputElement>(null);

  const handleFieldsChange = useCallback((f: SetupProfileFields) => {
    setFields(f);
  }, []);

  const measure = useCallback(() => {
    const grid = gridNode;
    const form = formRef.current;
    const preview = previewRef.current;
    const explainer = explainerRef.current;
    const i1 = firstNameRef.current;
    const i2 = lastNameRef.current;
    const i3 = identifyNameRef.current;

    if (!grid || !form || !preview || !explainer || !i1 || !i2 || !i3) return;

    const gr = grid.getBoundingClientRect();
    const fr = form.getBoundingClientRect();
    const pr = preview.getBoundingClientRect();
    const er = explainer.getBoundingClientRect();
    const r1 = i1.getBoundingClientRect();
    const r2 = i2.getBoundingClientRect();
    const r3 = i3.getBoundingClientRect();

    setPoints({
      input1Y: r1.top + r1.height / 2 - gr.top,
      input2Y: r2.top + r2.height / 2 - gr.top,
      input3Y: r3.top + r3.height / 2 - gr.top,
      inputLeft: r1.left - gr.left,
      inputRight: r1.right - gr.left,
      formLeft: fr.left - gr.left,
      formRight: fr.right - gr.left,
      previewRight: pr.right - gr.left,
      explainerLeft: er.left - gr.left,
      previewHeight: pr.height,
      explainerHeight: er.height,
      gridWidth: gr.width,
      gridHeight: gr.height,
    });
  }, [gridNode]);

  useEffect(() => {
    if (!gridNode) return;
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(gridNode);
    if (formRef.current) observer.observe(formRef.current);
    return () => observer.disconnect();
  }, [gridNode, measure]);

  // Build SVG connector paths (desktop only, ≥1024px)
  const isDesktop = points !== null && points.gridWidth >= 1024;

  let leftPath = "";
  let rightPath = "";

  if (points && isDesktop) {
    const splitX = points.previewRight + (points.formLeft - points.previewRight) / 2;
    const trunkY = points.input2Y;

    leftPath = [
      // Trunk: preview card → split point
      `M ${points.previewRight} ${trunkY} H ${splitX}`,
      // Vertical at split: input1 → input3
      `M ${splitX} ${points.input1Y} V ${points.input3Y}`,
      // Branch → First name
      `M ${splitX} ${points.input1Y} H ${points.inputLeft}`,
      // Branch → Last name
      `M ${splitX} ${points.input2Y} H ${points.inputLeft}`,
      // Branch → Identify name
      `M ${splitX} ${points.input3Y} H ${points.inputLeft}`,
    ].join(" ");

    // Right: Identify name → Explainer card
    rightPath = `M ${points.inputRight} ${points.input3Y} H ${points.explainerLeft}`;
  }

  return (
    <PendingProfileGuard>
      <main className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="w-full max-w-sm lg:max-w-5xl">
          <h1 className="text-center text-2xl font-semibold text-foreground">
            Complete your profile
          </h1>
          <p className="mt-2 text-center text-sm text-muted-foreground">
            Set up your name and identity to get started
          </p>

          <div ref={gridCallbackRef} className="relative mt-8 lg:grid lg:grid-cols-[1fr_384px_1fr] lg:gap-0">
            {/* SVG connector overlay (desktop only) */}
            {isDesktop && (
              <svg
                className="pointer-events-none absolute inset-0 z-10"
                width={points.gridWidth}
                height={points.gridHeight}
              >
                <path
                  d={leftPath}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeDasharray="6 4"
                  className="text-muted-foreground/30"
                />
                <path
                  d={rightPath}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeDasharray="6 4"
                  className="text-amber-400/50 dark:text-amber-600/50"
                />
              </svg>
            )}

            {/* Left: Preview card (desktop only) */}
            <div
              className="hidden lg:flex lg:justify-end lg:pr-6"
              style={{
                paddingTop: points
                  ? Math.max(0, points.input2Y - points.previewHeight / 2)
                  : 24,
              }}
            >
              <div ref={previewRef} className="w-full max-w-[260px] self-start">
                <ProfilePreviewCard
                  firstName={fields.firstName}
                  lastName={fields.lastName}
                  identifyName={fields.identifyName}
                />
              </div>
            </div>

            {/* Center: Form */}
            <div ref={formRef} className="rounded-xl border border-border bg-card p-6 shadow-sm">
              <div className="space-y-4">
                <VerifiedBanner />
                <SetupProfileForm
                  onFieldsChange={handleFieldsChange}
                  firstNameRef={firstNameRef}
                  lastNameRef={lastNameRef}
                  identifyNameRef={identifyNameRef}
                />
              </div>
            </div>

            {/* Right: Explainer card (desktop only) */}
            <div
              className="hidden lg:flex lg:pl-6"
              style={{
                paddingTop: points
                  ? Math.max(0, points.input3Y - points.explainerHeight / 2)
                  : 24,
              }}
            >
              <div ref={explainerRef} className="w-full max-w-[260px] self-start">
                <IdentifyNameExplainer />
              </div>
            </div>
          </div>
        </div>
      </main>
    </PendingProfileGuard>
  );
}
