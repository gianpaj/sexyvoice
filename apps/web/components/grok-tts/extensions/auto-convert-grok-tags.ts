import { Extension } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state';

import {
  GROK_INSTANT_TAGS,
  GROK_WRAPPING_TAGS,
  type GrokTipTapDocNode,
  grokTextToTipTapDoc,
  grokTipTapDocToText,
} from '@/lib/tts-editor';

const AUTO_CONVERT_GROK_TAGS_PLUGIN_KEY = new PluginKey('autoConvertGrokTags');

const INSTANT_TAGS = GROK_INSTANT_TAGS;

const WRAPPER_OPEN_TAGS = GROK_WRAPPING_TAGS.map(([openTag]) => openTag);

function getTextOffsetFromSelection(doc: ProseMirrorNode, position: number) {
  let offset = 0;

  doc.descendants((node, pos) => {
    if (!node.isText) {
      return;
    }

    const nodeStart = pos;
    const nodeEnd = pos + node.nodeSize;

    if (position <= nodeStart) {
      return false;
    }

    if (position >= nodeEnd) {
      offset += node.text?.length ?? 0;
      return;
    }

    offset += Math.max(0, position - nodeStart);
    return false;
  });

  return offset;
}

function getSelectionOffsets(doc: ProseMirrorNode, from: number, to: number) {
  return {
    from: getTextOffsetFromSelection(doc, from),
    to: getTextOffsetFromSelection(doc, to),
  };
}

function resolveTextOffsetToDocPosition(doc: ProseMirrorNode, offset: number) {
  let remaining = Math.max(0, offset);
  let resolvedPosition = 1;

  doc.descendants((node, pos) => {
    if (!node.isText) {
      return;
    }

    const textLength = node.text?.length ?? 0;

    if (remaining <= textLength) {
      resolvedPosition = pos + remaining;
      return false;
    }

    remaining -= textLength;
    resolvedPosition = pos + textLength;
  });

  return resolvedPosition;
}

function docsAreEqual(
  currentDoc: ProseMirrorNode,
  normalizedDoc: GrokTipTapDocNode,
) {
  return currentDoc.eq(currentDoc.type.schema.nodeFromJSON(normalizedDoc));
}

export function normalizePartialInstantTags(input: string) {
  let normalized = input;

  for (const instantTag of INSTANT_TAGS) {
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

export const AutoConvertGrokTags = Extension.create({
  addProseMirrorPlugins() {
    return [
      new Plugin({
        appendTransaction: (transactions, _oldState, newState) => {
          if (!transactions.some((transaction) => transaction.docChanged)) {
            return null;
          }

          const currentText = grokTipTapDocToText(newState.doc.toJSON());
          const normalizedText = normalizePartialWrapperOpeningTags(
            normalizePartialInstantTags(currentText),
          );
          const normalizedDoc = grokTextToTipTapDoc(normalizedText);

          const docsEqual = docsAreEqual(newState.doc, normalizedDoc);

          if (docsEqual) {
            return null;
          }

          const selectionOffsets = getSelectionOffsets(
            newState.doc,
            newState.selection.from,
            newState.selection.to,
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
          );
          const nextTo = resolveTextOffsetToDocPosition(
            transaction.doc,
            selectionOffsets.to,
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
