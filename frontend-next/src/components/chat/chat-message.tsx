"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Bot, User, Info, Wrench } from "lucide-react";

type ToolCall = {
  name: string;
  args: Record<string, unknown>;
};

type ChatMessageRole = "user" | "assistant" | "system";

type ChatMessageProps = {
  role: ChatMessageRole;
  content: string;
  toolCalls?: ToolCall[];
};

function ChatMessage({ role, content, toolCalls }: ChatMessageProps) {
  if (role === "system") {
    return (
      <div className="flex justify-center px-4 py-2">
        <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-4 py-2 text-xs text-muted-foreground">
          <Info className="size-3.5" />
          <span>{content}</span>
        </div>
      </div>
    );
  }

  const isUser = role === "user";

  return (
    <div
      className={cn("flex gap-3 px-4 py-3", isUser ? "flex-row-reverse" : "")}
    >
      <div
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-lg",
          isUser
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-muted-foreground"
        )}
      >
        {isUser ? <User className="size-4" /> : <Bot className="size-4" />}
      </div>

      <div
        className={cn(
          "flex max-w-[80%] flex-col gap-2",
          isUser ? "items-end" : "items-start"
        )}
      >
        <div
          className={cn(
            "rounded-xl px-4 py-2.5 text-sm leading-relaxed",
            isUser
              ? "bg-primary text-primary-foreground"
              : "bg-card text-card-foreground ring-1 ring-foreground/10"
          )}
        >
          <p className="whitespace-pre-wrap">{content}</p>
        </div>

        {toolCalls && toolCalls.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {toolCalls.map((tool, idx) => (
              <Badge
                key={idx}
                variant="secondary"
                className="gap-1 font-mono text-[10px]"
              >
                <Wrench className="size-2.5" />
                {tool.name}
                {Object.keys(tool.args).length > 0 && (
                  <span className="text-muted-foreground">
                    ({Object.keys(tool.args).join(", ")})
                  </span>
                )}
              </Badge>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export { ChatMessage };
export type { ChatMessageProps, ChatMessageRole, ToolCall };
