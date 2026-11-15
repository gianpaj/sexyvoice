import { Extension } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state';

import type { TagProvider } from './catalog';
import { docToTaggedText, type TagDocNode, taggedTextToDoc } from './text';

const AUTO_CONVERT_TAGS_PLUGIN_KEY = new PluginKey('autoConvertTags');

function getTextOffsetFromSelection(
  doc: ProseMirrorNode,
  position: number,
  provider: TagProvider,
) {
  return docToTaggedText(doc.cut(0, position).toJSON(), provider).length;
}

function getSelectionOffsets(
  doc: ProseMirrorNode,
  from: number,
  to: number,
  provider: TagProvider,
) {
  return {
    from: getTextOffsetFromSelection(doc, from, provider),
    to: getTextOffsetFromSelection(doc, to, provider),
  };
}

function resolveTextOffsetToDocPosition(
  doc: ProseMirrorNode,
  offset: number,
  provider: TagProvider,
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

    const text = docToTaggedText(
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

function docsAreEqual(currentDoc: ProseMirrorNode, normalizedDoc: TagDocNode) {
  return currentDoc.eq(currentDoc.type.schema.nodeFromJSON(normalizedDoc));
}

/** Turns tags typed as text into tag nodes by parsing the document again. */
export const AutoConvertTags = Extension.create<{
  provider: TagProvider;
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

          const normalizedDoc = taggedTextToDoc(
            docToTaggedText(newState.doc.toJSON(), provider),
            provider,
          );

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
        key: AUTO_CONVERT_TAGS_PLUGIN_KEY,
      }),
    ];
  },

  name: 'autoConvertTags',
});
