import OpenAI from "openai";
import type {
  AskOptions,
  AskResult,
  AskToolsOptions,
  ChatInstance,
  ToolCall,
  ToolDef,
} from "../AskAI";

type Role = "user" | "assistant";

function parseToolArgs(raw: unknown): Record<string, any> {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, any>;
  }
  if (typeof raw !== "string") {
    return {};
  }
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, any>;
    }
  } catch {
    return {};
  }
  return {};
}

export class OpenAIChat implements ChatInstance {
  private readonly client: OpenAI;
  private readonly model: string;
  private readonly messages: { role: Role; content: string }[] = [];
  private instructions?: string;

  constructor(
    apiKey: string,
    baseURL: string,
    model: string,
  ) {
    const defaultHeaders = { "HTTP-Referer": "https://github.com/aaaxn/ai-scripts" };
    this.client = new OpenAI({ apiKey, baseURL, defaultHeaders });
    this.model = model;
  }

  private updateInstructions(options: AskOptions): void {
    if (typeof options.system === "string") {
      this.instructions = options.system;
    }
  }

  async ask(
    userMessage: string | null,
    options: AskOptions = {},
  ): Promise<string | { messages: any[] }> {
    if (userMessage === null) {
      return { messages: this.messages };
    }

    const wantStream = options.stream !== false;
    this.updateInstructions(options);
    this.messages.push({ role: "user", content: userMessage });

    return this.askViaChatCompletions({ options, wantStream });
  }

  async askTools(userMessage: string, options: AskToolsOptions): Promise<AskResult> {
    const tools = options.tools ?? [];
    if (tools.length === 0) {
      const reply = await this.ask(userMessage, options);
      return {
        text: typeof reply === "string" ? reply : "",
        toolCalls: [],
      };
    }

    this.updateInstructions(options);
    this.messages.push({ role: "user", content: userMessage });

    return this.askToolsViaChatCompletions({ options, tools });
  }

  private async askToolsViaChatCompletions({
    options,
    tools,
  }: {
    options: AskToolsOptions;
    tools: ToolDef[];
  }): Promise<AskResult> {
    const chatMessages = [
      ...(this.instructions ? [{ role: "system", content: this.instructions }] : []),
      ...this.messages.map((m) => ({ role: m.role, content: m.content })),
    ];

    const params: Record<string, any> = {
      model: this.model,
      messages: chatMessages,
      tools: tools.map((tool) => ({
        type: "function",
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.inputSchema ?? { type: "object", properties: {} },
        },
      })),
    };

    if (typeof options.temperature === "number") {
      params.temperature = options.temperature;
    }
    if (typeof options.max_tokens === "number") {
      params.max_tokens = options.max_tokens;
    }

    const resp: any = await (this.client.chat.completions.create as any)(params);
    const message = resp?.choices?.[0]?.message ?? {};
    const content = typeof message.content === "string" ? message.content : "";
    if (content) {
      process.stdout.write(content + "\n");
    }

    const toolCalls: ToolCall[] = [];
    const responseToolCalls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
    for (const call of responseToolCalls) {
      const fn = call?.function ?? {};
      const name = typeof fn.name === "string" ? fn.name : "";
      if (!name) {
        continue;
      }
      toolCalls.push({
        id: typeof call?.id === "string" ? call.id : undefined,
        name,
        input: parseToolArgs(fn.arguments),
      });
    }

    this.messages.push({ role: "assistant", content });
    return { text: content, toolCalls };
  }

  private async askViaChatCompletions({
    options,
    wantStream,
  }: {
    options: AskOptions;
    wantStream: boolean;
  }): Promise<string> {
    const chatMessages = [
      ...(this.instructions ? [{ role: "system", content: this.instructions }] : []),
      ...this.messages.map((m) => ({ role: m.role, content: m.content })),
    ];

    const params: Record<string, any> = {
      model: this.model,
      messages: chatMessages,
    };

    if (typeof options.temperature === "number") {
      params.temperature = options.temperature;
    }
    if (typeof options.max_tokens === "number") {
      params.max_tokens = options.max_tokens;
    }

    let visible = "";

    if (wantStream) {
      const stream: AsyncIterable<any> = await (this.client.chat.completions.create as any)({
        ...params,
        stream: true,
      });
      for await (const chunk of stream) {
        const delta: any = chunk.choices?.[0]?.delta ?? {};
        if (delta.content) {
          process.stdout.write(delta.content);
          visible += delta.content;
        }
      }
      process.stdout.write("\n");
    } else {
      const resp: any = await (this.client.chat.completions.create as any)(params);
      const message = resp?.choices?.[0]?.message;
      const content = message?.content ?? "";
      process.stdout.write(content + "\n");
      visible = content;
    }

    this.messages.push({ role: "assistant", content: visible });
    return visible;
  }
}
