import { type llm, voice } from '@livekit/agents';

export class CallMemoryAgent extends voice.Agent {
  private readonly recall: (text: string) => Promise<string>;
  private readonly seededIds: Set<string>;

  constructor(
    options: ConstructorParameters<typeof voice.Agent>[0],
    recall: (text: string) => Promise<string>,
  ) {
    super(options);
    this.recall = recall;
    this.seededIds = new Set(options.chatCtx?.items.map(({ id }) => id));
  }

  override async llmNode(
    ...[chatCtx, tools, settings]: Parameters<voice.Agent['llmNode']>
  ) {
    const turn = chatCtx.items
      .filter(
        (item): item is llm.ChatMessage =>
          item.type === 'message' && item.role === 'user',
      )
      .at(-1);
    const recalled =
      turn?.textContent && !this.seededIds.has(turn.id)
        ? await this.recall(turn.textContent)
        : '';
    const context = recalled ? chatCtx.copy() : chatCtx;
    if (recalled) context.addMessage({ role: 'system', content: recalled });
    return super.llmNode(context, tools, settings);
  }
}
