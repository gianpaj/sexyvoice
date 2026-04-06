export const GROK_INSTANT_TAGS = [
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

export const GROK_WRAPPING_TAGS = [
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
  ['<singing>', '</singing>'],
] as const;

export const GROK_INSTANT_TAG_DEFINITIONS = GROK_INSTANT_TAGS.map((tag) => ({
  tag,
  label: tag.slice(1, -1),
  description: tag.slice(1, -1),
})) as readonly {
  tag: (typeof GROK_INSTANT_TAGS)[number];
  label: string;
  description: string;
}[];

export const GROK_WRAPPING_TAG_DEFINITIONS = GROK_WRAPPING_TAGS.map(
  ([openTag, closeTag]) => ({
    openTag,
    closeTag,
    label: openTag.slice(1, -1),
    description: openTag.slice(1, -1),
  }),
) as readonly {
  openTag: (typeof GROK_WRAPPING_TAGS)[number][0];
  closeTag: (typeof GROK_WRAPPING_TAGS)[number][1];
  label: string;
  description: string;
}[];

const INSTANT_TAGS = GROK_INSTANT_TAGS;

export type GrokInstantTag = (typeof GROK_INSTANT_TAGS)[number];
export type GrokWrapperOpenTag = (typeof GROK_WRAPPING_TAGS)[number][0];
export type GrokWrapperCloseTag = (typeof GROK_WRAPPING_TAGS)[number][1];
export type GrokWrapperTagPair = (typeof GROK_WRAPPING_TAGS)[number];
export type GrokInstantTagDefinition =
  (typeof GROK_INSTANT_TAG_DEFINITIONS)[number];
export type GrokWrappingTagDefinition =
  (typeof GROK_WRAPPING_TAG_DEFINITIONS)[number];
export type GrokWrapperBoundaryKind = 'open' | 'close';
export const GROK_EMPTY_WRAPPING_TEXT = '\u00a0';
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

export interface GrokWrapperOpenTagToken {
  closeTag: GrokWrapperCloseTag;
  openTag: GrokWrapperOpenTag;
  type: 'wrapper-open-tag';
}

export type GrokEditorToken =
  | GrokTextToken
  | GrokInstantTagToken
  | GrokWrapperTagToken
  | GrokWrapperOpenTagToken;

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

export interface GrokTipTapWrapperBoundaryNode {
  attrs: {
    closeTag: GrokWrapperCloseTag;
    kind: GrokWrapperBoundaryKind;
    openTag: GrokWrapperOpenTag;
  };
  type: 'wrapperBoundary';
}

export type GrokTipTapInlineNode =
  | GrokTipTapTextNode
  | GrokTipTapInstantTagNode
  | GrokTipTapWrapperBoundaryNode;

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

interface WrapperFrame {
  children: GrokEditorToken[];
  closeTag: GrokWrapperCloseTag;
  openTag: GrokWrapperOpenTag;
}

const INSTANT_TAG_SET = new Set<string>(INSTANT_TAGS);

const WRAPPER_OPEN_TO_CLOSE = new Map<GrokWrapperOpenTag, GrokWrapperCloseTag>(
  GROK_WRAPPING_TAGS.map(([openTag, closeTag]) => [openTag, closeTag]),
);

const WRAPPER_CLOSE_TO_OPEN = new Map<GrokWrapperCloseTag, GrokWrapperOpenTag>(
  GROK_WRAPPING_TAGS.map(([openTag, closeTag]) => [closeTag, openTag]),
);

const SORTED_TAG_CANDIDATES = [
  ...GROK_INSTANT_TAGS,
  ...GROK_WRAPPING_TAGS.flat(),
].sort((a, b) => b.length - a.length);

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

function createWrapperBoundaryNode(
  kind: GrokWrapperBoundaryKind,
  openTag: GrokWrapperOpenTag,
  closeTag: GrokWrapperCloseTag,
): GrokTipTapWrapperBoundaryNode {
  return {
    attrs: {
      closeTag,
      kind,
      openTag,
    },
    type: 'wrapperBoundary',
  };
}

function appendInlineNode(
  paragraphs: GrokTipTapInlineNode[][],
  node: GrokTipTapInlineNode,
) {
  const currentParagraph = paragraphs.at(-1);
  if (!currentParagraph) {
    return;
  }

  const previous = currentParagraph.at(-1);
  if (previous?.type === 'text' && node.type === 'text') {
    previous.text += node.text;
    return;
  }

  currentParagraph.push(node);
}

function pushText(paragraphs: GrokTipTapInlineNode[][], value: string) {
  const lines = value.split('\n');

  lines.forEach((line, index) => {
    if (line) {
      appendInlineNode(paragraphs, {
        text: line,
        type: 'text',
      });
    }

    if (index < lines.length - 1) {
      paragraphs.push([]);
    }
  });
}

function appendTokensToParagraphs(
  tokens: GrokEditorToken[],
  paragraphs: GrokTipTapInlineNode[][],
) {
  for (const token of tokens) {
    if (token.type === 'text') {
      pushText(paragraphs, token.value);
      continue;
    }

    if (token.type === 'instant-tag') {
      appendInlineNode(paragraphs, {
        attrs: {
          tag: token.tag,
        },
        type: 'instantTag',
      });
      continue;
    }

    appendInlineNode(
      paragraphs,
      createWrapperBoundaryNode('open', token.openTag, token.closeTag),
    );

    if (token.type === 'wrapper-open-tag') {
      continue;
    }

    if (token.children.length === 0) {
      pushText(paragraphs, GROK_EMPTY_WRAPPING_TEXT);
    } else {
      appendTokensToParagraphs(token.children, paragraphs);
    }

    appendInlineNode(
      paragraphs,
      createWrapperBoundaryNode('close', token.openTag, token.closeTag),
    );
  }
}

function tokensToParagraphs(
  tokens: GrokEditorToken[],
): GrokTipTapParagraphNode[] {
  const paragraphs: GrokTipTapInlineNode[][] = [[]];

  appendTokensToParagraphs(tokens, paragraphs);

  return paragraphs.map((content) =>
    content.length > 0
      ? {
          content,
          type: 'paragraph',
        }
      : {
          type: 'paragraph',
        },
  );
}

function isWrapperBoundaryNode(
  node: unknown,
): node is GrokTipTapWrapperBoundaryNode {
  if (!node || typeof node !== 'object') {
    return false;
  }

  const maybeNode = node as {
    attrs?: Record<string, unknown>;
    type?: string;
  };

  const openTag = maybeNode.attrs?.openTag;
  const closeTag = maybeNode.attrs?.closeTag;
  const kind = maybeNode.attrs?.kind;

  return (
    maybeNode.type === 'wrapperBoundary' &&
    typeof openTag === 'string' &&
    typeof closeTag === 'string' &&
    (kind === 'open' || kind === 'close') &&
    isWrapperOpenTag(openTag) &&
    isWrapperCloseTag(closeTag)
  );
}

function serializeInlineNode(node: unknown): string {
  if (!node || typeof node !== 'object') {
    return '';
  }

  const maybeNode = node as {
    attrs?: Record<string, unknown>;
    text?: unknown;
    type?: string;
  };

  if (maybeNode.type === 'text') {
    return typeof maybeNode.text === 'string'
      ? maybeNode.text.replaceAll(GROK_EMPTY_WRAPPING_TEXT, '')
      : '';
  }

  if (maybeNode.type === 'instantTag') {
    const tag = maybeNode.attrs?.tag;
    return typeof tag === 'string' && isInstantTag(tag) ? tag : '';
  }

  if (isWrapperBoundaryNode(maybeNode)) {
    return maybeNode.attrs.kind === 'open'
      ? maybeNode.attrs.openTag
      : maybeNode.attrs.closeTag;
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

  if (maybeNode.type !== 'paragraph' || !Array.isArray(maybeNode.content)) {
    return '';
  }

  return maybeNode.content.map(serializeInlineNode).join('');
}

export function getGrokInstantTagDefinitions(): readonly GrokInstantTagDefinition[] {
  return GROK_INSTANT_TAG_DEFINITIONS;
}

export function getGrokWrappingTagDefinitions(): readonly GrokWrappingTagDefinition[] {
  return GROK_WRAPPING_TAG_DEFINITIONS;
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
        tag: match,
        type: 'instant-tag',
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

      getCurrentTarget().push({
        children: top.children,
        closeTag: top.closeTag,
        openTag: top.openTag,
        type: 'wrapper-tag',
      });
      cursor += matchLength;
      continue;
    }

    appendText(getCurrentTarget(), match);
    cursor += matchLength;
  }

  while (stack.length > 0) {
    const unclosed = stack.pop()!;
    const target = getCurrentTarget();

    target.push({
      closeTag: unclosed.closeTag,
      openTag: unclosed.openTag,
      type: 'wrapper-open-tag',
    });

    if (unclosed.children.length > 0) {
      target.push(...unclosed.children);
    }
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

      if (token.type === 'wrapper-open-tag') {
        return token.openTag;
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
    content: tokensToParagraphs(parsed.tokens),
    type: 'doc',
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
