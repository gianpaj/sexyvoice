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
export const GROK_EMPTY_WRAPPER_TEXT = '\u00a0';
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

export interface GrokTipTapWrapperMark {
  attrs: {
    closeTag: GrokWrapperCloseTag;
    openTag: GrokWrapperOpenTag;
  };
  type: 'grokWrapper';
}

export type GrokTipTapMark = GrokTipTapWrapperMark;

export interface GrokTipTapTextNode {
  marks?: GrokTipTapMark[];
  text: string;
  type: 'text';
}

export interface GrokTipTapInstantTagNode {
  attrs: {
    tag: GrokInstantTag;
  };
  marks?: GrokTipTapMark[];
  type: 'instantTag';
}

export type GrokTipTapInlineNode =
  | GrokTipTapTextNode
  | GrokTipTapInstantTagNode;

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
  WRAPPER_TAGS.map(([openTag, closeTag]) => [openTag, closeTag]),
);

const WRAPPER_CLOSE_TO_OPEN = new Map<GrokWrapperCloseTag, GrokWrapperOpenTag>(
  WRAPPER_TAGS.map(([openTag, closeTag]) => [closeTag, openTag]),
);

const SORTED_TAG_CANDIDATES = [...INSTANT_TAGS, ...WRAPPER_TAGS.flat()].sort(
  (a, b) => b.length - a.length,
);

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

function createWrapperMark(
  openTag: GrokWrapperOpenTag,
  closeTag: GrokWrapperCloseTag,
): GrokTipTapWrapperMark {
  return {
    attrs: {
      closeTag,
      openTag,
    },
    type: 'grokWrapper',
  };
}

function marksEqual(
  a: GrokTipTapMark[] | undefined,
  b: GrokTipTapMark[] | undefined,
) {
  if (!(a || b)) {
    return true;
  }

  if (!(a && b) || a.length !== b.length) {
    return false;
  }

  return a.every((mark, index) => {
    const other = b[index];

    return (
      other?.type === mark.type &&
      other.attrs.openTag === mark.attrs.openTag &&
      other.attrs.closeTag === mark.attrs.closeTag
    );
  });
}

function cloneMarks(marks: readonly GrokTipTapMark[]) {
  if (marks.length === 0) {
    return undefined;
  }

  return marks.map((mark) => ({
    attrs: {
      closeTag: mark.attrs.closeTag,
      openTag: mark.attrs.openTag,
    },
    type: mark.type,
  }));
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
  if (
    previous?.type === 'text' &&
    node.type === 'text' &&
    marksEqual(previous.marks, node.marks)
  ) {
    previous.text += node.text;
    return;
  }

  currentParagraph.push(node);
}

function pushText(
  paragraphs: GrokTipTapInlineNode[][],
  value: string,
  activeMarks: readonly GrokTipTapMark[],
) {
  const lines = value.split('\n');
  const marks = cloneMarks(activeMarks);

  lines.forEach((line, index) => {
    if (line) {
      appendInlineNode(paragraphs, {
        ...(marks ? { marks } : {}),
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
  activeMarks: readonly GrokTipTapMark[] = [],
) {
  for (const token of tokens) {
    if (token.type === 'text') {
      pushText(paragraphs, token.value, activeMarks);
      continue;
    }

    if (token.type === 'instant-tag') {
      const marks = cloneMarks(activeMarks);

      appendInlineNode(paragraphs, {
        ...(marks ? { marks } : {}),
        attrs: {
          tag: token.tag,
        },
        type: 'instantTag',
      });
      continue;
    }

    if (token.children.length === 0) {
      pushText(paragraphs, GROK_EMPTY_WRAPPER_TEXT, [
        ...activeMarks,
        createWrapperMark(token.openTag, token.closeTag),
      ]);
      continue;
    }

    appendTokensToParagraphs(token.children, paragraphs, [
      ...activeMarks,
      createWrapperMark(token.openTag, token.closeTag),
    ]);
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

function isWrapperMark(mark: unknown): mark is GrokTipTapWrapperMark {
  if (!mark || typeof mark !== 'object') {
    return false;
  }

  const maybeMark = mark as {
    attrs?: Record<string, unknown>;
    type?: string;
  };

  const openTag = maybeMark.attrs?.openTag;
  const closeTag = maybeMark.attrs?.closeTag;

  return (
    maybeMark.type === 'grokWrapper' &&
    typeof openTag === 'string' &&
    typeof closeTag === 'string' &&
    isWrapperOpenTag(openTag) &&
    isWrapperCloseTag(closeTag)
  );
}

function getNodeMarks(node: unknown): GrokTipTapWrapperMark[] {
  if (!node || typeof node !== 'object') {
    return [];
  }

  const maybeNode = node as {
    marks?: unknown[];
  };

  if (!Array.isArray(maybeNode.marks)) {
    return [];
  }

  return maybeNode.marks.filter(isWrapperMark);
}

function serializeInlineNodeText(node: unknown): string {
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
      ? maybeNode.text.replaceAll(GROK_EMPTY_WRAPPER_TEXT, '')
      : '';
  }

  if (maybeNode.type === 'instantTag') {
    const tag = maybeNode.attrs?.tag;
    return typeof tag === 'string' && isInstantTag(tag) ? tag : '';
  }

  return '';
}

function getCommonPrefixLength(
  current: readonly GrokTipTapWrapperMark[],
  next: readonly GrokTipTapWrapperMark[],
) {
  const max = Math.min(current.length, next.length);
  let index = 0;

  while (
    index < max &&
    current[index]?.attrs.openTag === next[index]?.attrs.openTag &&
    current[index]?.attrs.closeTag === next[index]?.attrs.closeTag
  ) {
    index += 1;
  }

  return index;
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

  let result = '';
  let activeMarks: GrokTipTapWrapperMark[] = [];

  for (const child of maybeNode.content) {
    const nextMarks = getNodeMarks(child);
    const prefixLength = getCommonPrefixLength(activeMarks, nextMarks);

    for (
      let index = activeMarks.length - 1;
      index >= prefixLength;
      index -= 1
    ) {
      result += activeMarks[index]?.attrs.closeTag ?? '';
    }

    for (let index = prefixLength; index < nextMarks.length; index += 1) {
      result += nextMarks[index]?.attrs.openTag ?? '';
    }

    result += serializeInlineNodeText(child);
    activeMarks = nextMarks;
  }

  for (let index = activeMarks.length - 1; index >= 0; index -= 1) {
    result += activeMarks[index]?.attrs.closeTag ?? '';
  }

  return result;
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
