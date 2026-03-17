"use client";

import { cn } from "@/lib/utils";
import {
  FileSearch,
  Brain,
  Code,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Loader2,
} from "lucide-react";

type StepStatus = "pending" | "active" | "completed" | "failed";

type GenerationProgressProps = {
  currentStage: number;
  totalStages: number;
  status: string;
};

const STEPS = [
  { label: "Parsing", icon: FileSearch },
  { label: "Analyzing", icon: Brain },
  { label: "Generating", icon: Code },
  { label: "Validating", icon: ShieldCheck },
  { label: "Complete", icon: CheckCircle2 },
];

function getStepStatus(
  stepIndex: number,
  currentStage: number,
  status: string
): StepStatus {
  if (status === "failed") {
    if (stepIndex === currentStage - 1) return "failed";
    if (stepIndex < currentStage - 1) return "completed";
    return "pending";
  }
  if (stepIndex < currentStage - 1) return "completed";
  if (stepIndex === currentStage - 1) return "active";
  return "pending";
}

function GenerationProgress({
  currentStage,
  totalStages,
  status,
}: GenerationProgressProps) {
  return (
    <div className="flex w-full flex-col gap-8">
      <div className="flex items-center justify-between">
        {STEPS.map((step, idx) => {
          const stepStatus = getStepStatus(idx, currentStage, status);
          const StepIcon = step.icon;

          return (
            <div key={step.label} className="flex flex-1 items-center">
              <div className="flex flex-col items-center gap-2">
                <div
                  className={cn(
                    "flex size-12 items-center justify-center rounded-xl border-2 transition-all duration-300",
                    stepStatus === "completed" &&
                      "border-primary bg-primary text-primary-foreground",
                    stepStatus === "active" &&
                      "animate-pulse border-primary bg-primary/10 text-primary",
                    stepStatus === "pending" &&
                      "border-muted bg-muted/50 text-muted-foreground",
                    stepStatus === "failed" &&
                      "border-destructive bg-destructive/10 text-destructive"
                  )}
                >
                  {stepStatus === "completed" ? (
                    <CheckCircle2 className="size-5" />
                  ) : stepStatus === "failed" ? (
                    <XCircle className="size-5" />
                  ) : stepStatus === "active" ? (
                    <Loader2 className="size-5 animate-spin" />
                  ) : (
                    <StepIcon className="size-5" />
                  )}
                </div>
                <span
                  className={cn(
                    "text-xs font-medium",
                    stepStatus === "completed" && "text-primary",
                    stepStatus === "active" && "text-primary",
                    stepStatus === "pending" && "text-muted-foreground",
                    stepStatus === "failed" && "text-destructive"
                  )}
                >
                  {step.label}
                </span>
              </div>

              {idx < STEPS.length - 1 && (
                <div
                  className={cn(
                    "mx-2 h-0.5 flex-1 rounded-full transition-all duration-500",
                    idx < currentStage - 1 ? "bg-primary" : "bg-muted"
                  )}
                />
              )}
            </div>
          );
        })}
      </div>

      <div className="text-center text-sm text-muted-foreground">
        Stage {Math.min(currentStage, totalStages)} of {totalStages}
      </div>
    </div>
  );
}

export { GenerationProgress };
export type { GenerationProgressProps };
