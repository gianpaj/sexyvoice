import { Extension } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state';

import {
  GROK_INSTANT_TAGS,
  GROK_WRAPPING_TAGS,
  type GrokTipTapDocNode,
  type TtsEditorProvider,
  ttsTextToTipTapDoc,
  ttsTipTapDocToText,
} from '@/lib/tts-editor';
import { VOXTRAL_TAGS } from '@/lib/voxtral-tags';

const AUTO_CONVERT_GROK_TAGS_PLUGIN_KEY = new PluginKey('autoConvertGrokTags');

const WRAPPER_OPEN_TAGS = GROK_WRAPPING_TAGS.map(([openTag]) => openTag);

function getTextOffsetFromSelection(
  doc: ProseMirrorNode,
  position: number,
  provider: TtsEditorProvider,
) {
  return ttsTipTapDocToText(doc.cut(0, position).toJSON(), provider).length;
}

function getSelectionOffsets(
  doc: ProseMirrorNode,
  from: number,
  to: number,
  provider: TtsEditorProvider,
) {
  return {
    from: getTextOffsetFromSelection(doc, from, provider),
    to: getTextOffsetFromSelection(doc, to, provider),
  };
}

function resolveTextOffsetToDocPosition(
  doc: ProseMirrorNode,
  offset: number,
  provider: TtsEditorProvider,
) {
  let remaining = Math.max(0, offset);
  let resolvedPosition = 1;
  let resolved = false;

  doc.descendants((node, pos) => {
    if (resolved) return false;

    if (node.isBlock) {
      if (pos > 0) remaining -= 1;
      resolvedPosition = pos + 1;
      if (!node.childCount && remaining <= 0) resolved = true;
      return !resolved;
    }

    const text = ttsTipTapDocToText(
      {
        type: 'doc',
        content: [{ type: 'paragraph', content: [node.toJSON()] }],
      },
      provider,
    );

    if (remaining <= text.length) {
      let nodeOffset = remaining;
      if (!node.isText) {
        nodeOffset = remaining > 0 ? node.nodeSize : 0;
      }
      resolvedPosition = pos + nodeOffset;
      resolved = true;
      return false;
    }

    remaining -= text.length;
    resolvedPosition = pos + node.nodeSize;
    return false;
  });

  return resolvedPosition;
}

function docsAreEqual(
  currentDoc: ProseMirrorNode,
  normalizedDoc: GrokTipTapDocNode,
) {
  return currentDoc.eq(currentDoc.type.schema.nodeFromJSON(normalizedDoc));
}

export function normalizePartialInstantTags(
  input: string,
  provider: TtsEditorProvider = 'grok',
) {
  let normalized = input;

  for (const instantTag of provider === 'grok'
    ? GROK_INSTANT_TAGS
    : VOXTRAL_TAGS) {
    const partialTag = instantTag.slice(1);

    normalized = normalized.replaceAll(`[${partialTag}`, instantTag);
  }

  return normalized;
}

export function normalizePartialWrapperOpeningTags(input: string) {
  let normalized = input;

  for (const openTag of WRAPPER_OPEN_TAGS) {
    const partialTag = openTag.slice(1);

    normalized = normalized.replaceAll(`<${partialTag}`, openTag);
  }

  return normalized;
}

export const AutoConvertGrokTags = Extension.create<{
  provider: TtsEditorProvider;
}>({
  addOptions() {
    return { provider: 'grok' };
  },
  addProseMirrorPlugins() {
    const provider = this.options.provider;
    return [
      new Plugin({
        appendTransaction: (transactions, _oldState, newState) => {
          if (!transactions.some((transaction) => transaction.docChanged)) {
            return null;
          }

          const currentText = ttsTipTapDocToText(
            newState.doc.toJSON(),
            provider,
          );
          const instantText = normalizePartialInstantTags(
            currentText,
            provider,
          );
          const normalizedText =
            provider === 'grok'
              ? normalizePartialWrapperOpeningTags(instantText)
              : instantText;
          const normalizedDoc = ttsTextToTipTapDoc(normalizedText, provider);

          const docsEqual = docsAreEqual(newState.doc, normalizedDoc);

          if (docsEqual) {
            return null;
          }

          const selectionOffsets = getSelectionOffsets(
            newState.doc,
            newState.selection.from,
            newState.selection.to,
            provider,
          );

          const replacement = newState.schema.nodeFromJSON(normalizedDoc);
          const transaction = newState.tr.replace(
            0,
            newState.doc.content.size,
            replacement.slice(0),
          );

          const nextFrom = resolveTextOffsetToDocPosition(
            transaction.doc,
            selectionOffsets.from,
            provider,
          );
          const nextTo = resolveTextOffsetToDocPosition(
            transaction.doc,
            selectionOffsets.to,
            provider,
          );

          transaction.setSelection(
            TextSelection.create(
              transaction.doc,
              Math.min(nextFrom, nextTo),
              Math.max(nextFrom, nextTo),
            ),
          );

          return transaction;
        },
        key: AUTO_CONVERT_GROK_TAGS_PLUGIN_KEY,
      }),
    ];
  },

  name: 'autoConvertGrokTags',
});
