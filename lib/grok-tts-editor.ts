const INSTANT_TAGS = [
  '[pause]',
  '[long-pause]',
  '[laugh]',
  '[chuckle]',
  '[giggle]',
  '[cry]',
  '[sigh]',
  '[breath]',
  '[inhale]',
  '[exhale]',
  '[tsk]',
  '[tongue-click]',
  '[lip-smack]',
  '[hum-tune]',
] as const;

const WRAPPER_TAGS = [
  ['<soft>', '</soft>'],
  ['<whisper>', '</whisper>'],
  ['<loud>', '</loud>'],
  ['<emphasis>', '</emphasis>'],
  ['<slow>', '</slow>'],
  ['<fast>', '</fast>'],
  ['<higher-pitch>', '</higher-pitch>'],
  ['<lower-pitch>', '</lower-pitch>'],
  ['<build-intensity>', '</build-intensity>'],
  ['<decrease-intensity>', '</decrease-intensity>'],
  ['<laugh-speak>', '</laugh-speak>'],
  ['<sing-song>', '</sing-song>'],
] as const;

export type GrokInstantTag = (typeof INSTANT_TAGS)[number];
export type GrokWrapperOpenTag = (typeof WRAPPER_TAGS)[number][0];
export type GrokWrapperCloseTag = (typeof WRAPPER_TAGS)[number][1];
export type GrokWrapperTagPair = (typeof WRAPPER_TAGS)[number];
export type GrokTagText =
  | GrokInstantTag
  | GrokWrapperOpenTag
  | GrokWrapperCloseTag;

export interface GrokTextToken {
  type: 'text';
  value: string;
}

export interface GrokInstantTagToken {
  tag: GrokInstantTag;
  type: 'instant-tag';
}

export interface GrokWrapperTagToken {
  children: GrokEditorToken[];
  closeTag: GrokWrapperCloseTag;
  openTag: GrokWrapperOpenTag;
  type: 'wrapper-tag';
}

export type GrokEditorToken =
  | GrokTextToken
  | GrokInstantTagToken
  | GrokWrapperTagToken;

export interface GrokEditorParseResult {
  tokens: GrokEditorToken[];
}

export interface GrokTipTapTextNode {
  text: string;
  type: 'text';
}

export interface GrokTipTapInstantTagNode {
  attrs: {
    tag: GrokInstantTag;
  };
  type: 'instantTag';
}

export interface GrokTipTapWrapperTagNode {
  attrs: {
    openTag: GrokWrapperOpenTag;
    closeTag: GrokWrapperCloseTag;
  };
  content: GrokTipTapInlineNode[];
  type: 'wrapperTag';
}

export type GrokTipTapInlineNode =
  | GrokTipTapTextNode
  | GrokTipTapInstantTagNode
  | GrokTipTapWrapperTagNode;

export interface GrokTipTapParagraphNode {
  content?: GrokTipTapInlineNode[];
  type: 'paragraph';
}

export interface GrokTipTapDocNode {
  content: GrokTipTapParagraphNode[];
  type: 'doc';
}

interface WrapperTagConfig {
  closeTag: GrokWrapperCloseTag;
  openTag: GrokWrapperOpenTag;
}

const INSTANT_TAG_SET = new Set<string>(INSTANT_TAGS);

const WRAPPER_OPEN_TO_CLOSE = new Map<GrokWrapperOpenTag, GrokWrapperCloseTag>(
  WRAPPER_TAGS.map(([openTag, closeTag]) => [openTag, closeTag]),
);

const WRAPPER_CLOSE_TO_OPEN = new Map<GrokWrapperCloseTag, GrokWrapperOpenTag>(
  WRAPPER_TAGS.map(([openTag, closeTag]) => [closeTag, openTag]),
);

const SORTED_TAG_CANDIDATES = [...INSTANT_TAGS, ...WRAPPER_TAGS.flat()].sort(
  (a, b) => b.length - a.length,
);

interface WrapperFrame {
  children: GrokEditorToken[];
  closeTag: GrokWrapperCloseTag;
  openTag: GrokWrapperOpenTag;
}

function isInstantTag(tag: string): tag is GrokInstantTag {
  return INSTANT_TAG_SET.has(tag);
}

function isWrapperOpenTag(tag: string): tag is GrokWrapperOpenTag {
  return WRAPPER_OPEN_TO_CLOSE.has(tag as GrokWrapperOpenTag);
}

function isWrapperCloseTag(tag: string): tag is GrokWrapperCloseTag {
  return WRAPPER_CLOSE_TO_OPEN.has(tag as GrokWrapperCloseTag);
}

function appendText(target: GrokEditorToken[], value: string) {
  if (!value) {
    return;
  }

  const previous = target.at(-1);
  if (previous?.type === 'text') {
    previous.value += value;
    return;
  }

  target.push({
    type: 'text',
    value,
  });
}

function getMatchingTagAt(input: string, index: number): string | null {
  for (const candidate of SORTED_TAG_CANDIDATES) {
    if (input.startsWith(candidate, index)) {
      return candidate;
    }
  }

  return null;
}

function splitTextByLines(value: string): string[] {
  return value.split('\n');
}

function tokensToParagraphs(
  tokens: GrokEditorToken[],
): GrokTipTapParagraphNode[] {
  const paragraphs: GrokTipTapInlineNode[][] = [[]];

  const appendInlineNode = (node: GrokTipTapInlineNode) => {
    const currentParagraph = paragraphs.at(-1);
    if (!currentParagraph) {
      return;
    }
    currentParagraph.push(node);
  };

  const pushText = (value: string) => {
    const lines = splitTextByLines(value);

    lines.forEach((line, index) => {
      if (line) {
        appendInlineNode({
          type: 'text',
          text: line,
        });
      }

      if (index < lines.length - 1) {
        paragraphs.push([]);
      }
    });
  };

  for (const token of tokens) {
    if (token.type === 'text') {
      pushText(token.value);
      continue;
    }

    if (token.type === 'instant-tag') {
      appendInlineNode({
        type: 'instantTag',
        attrs: {
          tag: token.tag,
        },
      });
      continue;
    }

    appendInlineNode({
      type: 'wrapperTag',
      attrs: {
        openTag: token.openTag,
        closeTag: token.closeTag,
      },
      content: tokensToInlineNodes(token.children),
    });
  }

  return paragraphs.map((content) =>
    content.length > 0
      ? {
          type: 'paragraph',
          content,
        }
      : {
          type: 'paragraph',
        },
  );
}

function tokensToInlineNodes(
  tokens: GrokEditorToken[],
): GrokTipTapInlineNode[] {
  const doc = tokensToParagraphs(tokens);

  if (doc.length <= 1) {
    return doc[0]?.content ?? [];
  }

  const nodes: GrokTipTapInlineNode[] = [];

  doc.forEach((paragraph, index) => {
    if (paragraph.content) {
      nodes.push(...paragraph.content);
    }

    if (index < doc.length - 1) {
      nodes.push({
        type: 'text',
        text: '\n',
      });
    }
  });

  return nodes;
}

function serializeInlineNode(node: unknown): string {
  if (!node || typeof node !== 'object') {
    return '';
  }

  const maybeNode = node as {
    attrs?: Record<string, unknown>;
    content?: unknown[];
    text?: unknown;
    type?: string;
  };

  if (maybeNode.type === 'text') {
    return typeof maybeNode.text === 'string' ? maybeNode.text : '';
  }

  if (maybeNode.type === 'instantTag') {
    const tag = maybeNode.attrs?.tag;
    return typeof tag === 'string' && isInstantTag(tag) ? tag : '';
  }

  if (maybeNode.type === 'wrapperTag') {
    const openTag = maybeNode.attrs?.openTag;
    const closeTag = maybeNode.attrs?.closeTag;

    if (
      typeof openTag !== 'string' ||
      typeof closeTag !== 'string' ||
      !isWrapperOpenTag(openTag) ||
      !isWrapperCloseTag(closeTag)
    ) {
      return '';
    }

    const children = Array.isArray(maybeNode.content)
      ? maybeNode.content.map(serializeInlineNode).join('')
      : '';

    return `${openTag}${children}${closeTag}`;
  }

  return '';
}

function serializeParagraphNode(node: unknown): string {
  if (!node || typeof node !== 'object') {
    return '';
  }

  const maybeNode = node as {
    content?: unknown[];
    type?: string;
  };

  if (maybeNode.type !== 'paragraph') {
    return '';
  }

  if (!Array.isArray(maybeNode.content)) {
    return '';
  }

  return maybeNode.content.map(serializeInlineNode).join('');
}

export function getGrokInstantTags(): readonly GrokInstantTag[] {
  return INSTANT_TAGS;
}

export function getGrokWrapperTags(): readonly GrokWrapperTagPair[] {
  return WRAPPER_TAGS;
}

export function isKnownGrokTag(tag: string): tag is GrokTagText {
  return isInstantTag(tag) || isWrapperOpenTag(tag) || isWrapperCloseTag(tag);
}

export function parseGrokTtsText(input: string): GrokEditorParseResult {
  const rootTokens: GrokEditorToken[] = [];
  const stack: WrapperFrame[] = [];

  const getCurrentTarget = () => stack.at(-1)?.children ?? rootTokens;

  let cursor = 0;

  while (cursor < input.length) {
    const match = getMatchingTagAt(input, cursor);

    if (!match) {
      appendText(getCurrentTarget(), input[cursor] ?? '');
      cursor += 1;
      continue;
    }

    const matchLength = match.length;

    if (isInstantTag(match)) {
      getCurrentTarget().push({
        type: 'instant-tag',
        tag: match,
      });
      cursor += matchLength;
      continue;
    }

    if (isWrapperOpenTag(match)) {
      const config: WrapperTagConfig = {
        closeTag: WRAPPER_OPEN_TO_CLOSE.get(match)!,
        openTag: match,
      };

      stack.push({
        children: [],
        closeTag: config.closeTag,
        openTag: config.openTag,
      });
      cursor += matchLength;
      continue;
    }

    if (isWrapperCloseTag(match)) {
      const top = stack.at(-1);

      if (!(top && top.closeTag === match)) {
        appendText(getCurrentTarget(), match);
        cursor += matchLength;
        continue;
      }

      stack.pop();

      const wrapperToken: GrokWrapperTagToken = {
        type: 'wrapper-tag',
        openTag: top.openTag,
        closeTag: top.closeTag,
        children: top.children,
      };

      getCurrentTarget().push(wrapperToken);
      cursor += matchLength;
      continue;
    }

    appendText(getCurrentTarget(), match);
    cursor += matchLength;
  }

  while (stack.length > 0) {
    const unclosed = stack.pop()!;
    appendText(
      getCurrentTarget(),
      `${unclosed.openTag}${serializeGrokEditorTokens(unclosed.children)}`,
    );
  }

  return {
    tokens: rootTokens,
  };
}

export function serializeGrokEditorTokens(tokens: GrokEditorToken[]): string {
  return tokens
    .map((token) => {
      if (token.type === 'text') {
        return token.value;
      }

      if (token.type === 'instant-tag') {
        return token.tag;
      }

      return `${token.openTag}${serializeGrokEditorTokens(
        token.children,
      )}${token.closeTag}`;
    })
    .join('');
}

export function grokTextToTipTapDoc(input: string): GrokTipTapDocNode {
  const parsed = parseGrokTtsText(input);

  return {
    type: 'doc',
    content: tokensToParagraphs(parsed.tokens),
  };
}

export function grokTipTapDocToText(doc: unknown): string {
  if (!doc || typeof doc !== 'object') {
    return '';
  }

  const maybeDoc = doc as {
    content?: unknown[];
    type?: string;
  };

  if (maybeDoc.type !== 'doc' || !Array.isArray(maybeDoc.content)) {
    return '';
  }

  return maybeDoc.content.map(serializeParagraphNode).join('\n');
}
