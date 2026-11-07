import {
  EMPTY_WRAPPER_TEXT,
  instantTags,
  TAG_CATALOGS,
  type TagProvider,
} from './catalog';

/**
 * Tagged speech text is plain text: tags count toward limits, unknown tags stay
 * literal, and the API receives the text unchanged. These helpers convert it
 * to and from the tag editor's document.
 */

export interface TextToken {
  type: 'text';
  value: string;
}

export interface InstantTagToken {
  tag: string;
  type: 'instant-tag';
}

export interface WrapperTagToken {
  children: TagToken[];
  closeTag: string;
  openTag: string;
  type: 'wrapper-tag';
}

/** An open wrapper tag that never closes; its text follows as siblings. */
export interface WrapperOpenTagToken {
  closeTag: string;
  openTag: string;
  type: 'wrapper-open-tag';
}

export type TagToken =
  | TextToken
  | InstantTagToken
  | WrapperTagToken
  | WrapperOpenTagToken;

interface TextNode {
  text: string;
  type: 'text';
}

interface InstantTagNode {
  attrs: { tag: string };
  type: 'instantTag';
}

type WrapperBoundaryKind = 'open' | 'close';

interface WrapperBoundaryNode {
  attrs: { closeTag: string; kind: WrapperBoundaryKind; openTag: string };
  type: 'wrapperBoundary';
}

type InlineNode = TextNode | InstantTagNode | WrapperBoundaryNode;

interface ParagraphNode {
  content?: InlineNode[];
  type: 'paragraph';
}

export interface TagDocNode {
  content: ParagraphNode[];
  type: 'doc';
}

interface WrapperFrame {
  children: TagToken[];
  closeTag: string;
  openTag: string;
}

interface ProviderTags {
  /** Every tag, longest first, so the longest match wins. */
  candidates: string[];
  closeTags: Set<string>;
  instantTags: Set<string>;
  openToClose: Map<string, string>;
}

const PROVIDER_TAGS = Object.fromEntries(
  (Object.keys(TAG_CATALOGS) as TagProvider[]).map((provider) => {
    const { wrappers } = TAG_CATALOGS[provider];
    const instant = instantTags(provider);
    const tags: ProviderTags = {
      candidates: [...instant, ...wrappers.flat()].sort(
        (a, b) => b.length - a.length,
      ),
      closeTags: new Set(wrappers.map(([, closeTag]) => closeTag)),
      instantTags: new Set(instant),
      openToClose: new Map(wrappers),
    };
    return [provider, tags];
  }),
) as Record<TagProvider, ProviderTags>;

export function isKnownTag(tag: string, provider: TagProvider): boolean {
  const tags = PROVIDER_TAGS[provider];
  return (
    tags.instantTags.has(tag) ||
    tags.openToClose.has(tag) ||
    tags.closeTags.has(tag)
  );
}

function appendText(target: TagToken[], value: string) {
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

function getMatchingTagAt(
  input: string,
  index: number,
  provider: TagProvider,
): string | null {
  for (const candidate of PROVIDER_TAGS[provider].candidates) {
    if (input.startsWith(candidate, index)) {
      return candidate;
    }
  }

  return null;
}

export function createWrapperBoundaryNode(
  kind: WrapperBoundaryKind,
  openTag: string,
  closeTag: string,
): WrapperBoundaryNode {
  return {
    attrs: {
      closeTag,
      kind,
      openTag,
    },
    type: 'wrapperBoundary',
  };
}

function appendInlineNode(paragraphs: InlineNode[][], node: InlineNode) {
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

function pushText(paragraphs: InlineNode[][], value: string) {
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
  tokens: TagToken[],
  paragraphs: InlineNode[][],
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
      pushText(paragraphs, EMPTY_WRAPPER_TEXT);
    } else {
      appendTokensToParagraphs(token.children, paragraphs);
    }

    appendInlineNode(
      paragraphs,
      createWrapperBoundaryNode('close', token.openTag, token.closeTag),
    );
  }
}

function tokensToParagraphs(tokens: TagToken[]): ParagraphNode[] {
  const paragraphs: InlineNode[][] = [[]];

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
  provider: TagProvider,
): node is WrapperBoundaryNode {
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
  const tags = PROVIDER_TAGS[provider];

  return (
    maybeNode.type === 'wrapperBoundary' &&
    typeof openTag === 'string' &&
    typeof closeTag === 'string' &&
    (kind === 'open' || kind === 'close') &&
    tags.openToClose.has(openTag) &&
    tags.closeTags.has(closeTag)
  );
}

function serializeInlineNode(node: unknown, provider: TagProvider): string {
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
      ? maybeNode.text.replaceAll(EMPTY_WRAPPER_TEXT, '')
      : '';
  }

  if (maybeNode.type === 'instantTag') {
    const tag = maybeNode.attrs?.tag;
    return typeof tag === 'string' &&
      PROVIDER_TAGS[provider].instantTags.has(tag)
      ? tag
      : '';
  }

  if (isWrapperBoundaryNode(maybeNode, provider)) {
    return maybeNode.attrs.kind === 'open'
      ? maybeNode.attrs.openTag
      : maybeNode.attrs.closeTag;
  }

  return '';
}

function serializeParagraphNode(node: unknown, provider: TagProvider): string {
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

  return maybeNode.content
    .map((child) => serializeInlineNode(child, provider))
    .join('');
}

export function parseTaggedText(
  input: string,
  provider: TagProvider,
): TagToken[] {
  const tags = PROVIDER_TAGS[provider];
  const rootTokens: TagToken[] = [];
  const stack: WrapperFrame[] = [];

  const getCurrentTarget = () => stack.at(-1)?.children ?? rootTokens;

  let cursor = 0;

  while (cursor < input.length) {
    const match = getMatchingTagAt(input, cursor, provider);

    if (!match) {
      appendText(getCurrentTarget(), input[cursor] ?? '');
      cursor += 1;
      continue;
    }

    cursor += match.length;

    if (tags.instantTags.has(match)) {
      getCurrentTarget().push({
        tag: match,
        type: 'instant-tag',
      });
      continue;
    }

    const closeTag = tags.openToClose.get(match);
    if (closeTag) {
      stack.push({ children: [], closeTag, openTag: match });
      continue;
    }

    const top = stack.at(-1);
    if (!(top && top.closeTag === match)) {
      appendText(getCurrentTarget(), match);
      continue;
    }

    stack.pop();
    getCurrentTarget().push({
      children: top.children,
      closeTag: top.closeTag,
      openTag: top.openTag,
      type: 'wrapper-tag',
    });
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

  return rootTokens;
}

export function serializeTokens(tokens: TagToken[]): string {
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

      return `${token.openTag}${serializeTokens(token.children)}${token.closeTag}`;
    })
    .join('');
}

export function taggedTextToDoc(
  input: string,
  provider: TagProvider,
): TagDocNode {
  return {
    content: tokensToParagraphs(parseTaggedText(input, provider)),
    type: 'doc',
  };
}

export function docToTaggedText(doc: unknown, provider: TagProvider): string {
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

  return maybeDoc.content
    .map((node) => serializeParagraphNode(node, provider))
    .join('\n');
}
