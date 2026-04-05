'use client';

import { TextSelection } from '@tiptap/pm/state';
import { EditorContent, EditorContext, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { ChevronDown, Sparkles } from 'lucide-react';
import {
  type MouseEvent,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';

import {
  createWrapperBoundaryNode,
  WrapperBoundary,
} from '@/components/grok-tts/extensions/grok-wrapper-boundary';
import {
  createInstantTagNode,
  InstantTag,
} from '@/components/grok-tts/extensions/instant-tag';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useUiEditorState } from '@/hooks/tiptap/use-ui-editor-state';
import {
  GROK_EMPTY_WRAPPER_TEXT,
  type GrokInstantTag,
  getGrokInstantTags,
  grokTextToTipTapDoc,
  grokTipTapDocToText,
} from '@/lib/tts-editor';
import { cn } from '@/lib/utils';
import { MobileToolbar } from './grok-tts/notion-like-editor-mobile-toolbar';
import { NotionToolbarFloating } from './grok-tts/notion-like-editor-toolbar-floating';
import { UiState } from './tiptap/tiptap-extension/ui-state-extension';
import { SlashDropdownMenu } from './tiptap/tiptap-ui/slash-dropdown-menu';

const INSTANT_TAGS = [
  { tag: '[pause]', label: 'pause', description: 'Brief pause' },
  { tag: '[long-pause]', label: 'long-pause', description: 'Extended pause' },
  { tag: '[laugh]', label: 'laugh', description: 'Laughter' },
  { tag: '[chuckle]', label: 'chuckle', description: 'Soft laughter' },
  { tag: '[giggle]', label: 'giggle', description: 'Light laughter' },
  { tag: '[cry]', label: 'cry', description: 'Crying sound' },
  { tag: '[sigh]', label: 'sigh', description: 'Sighing' },
  { tag: '[breath]', label: 'breath', description: 'Breath sound' },
  { tag: '[inhale]', label: 'inhale', description: 'Inhalation' },
  { tag: '[exhale]', label: 'exhale', description: 'Exhalation' },
  { tag: '[tsk]', label: 'tsk', description: 'Disapproving tsk' },
  {
    tag: '[tongue-click]',
    label: 'tongue-click',
    description: 'Tongue click',
  },
  { tag: '[lip-smack]', label: 'lip-smack', description: 'Lip smacking' },
  {
    tag: '[hum-tune]',
    label: 'hum-tune',
    description: 'Humming vocalization',
  },
] as const;

const WRAPPER_TAGS = [
  {
    tag: '<soft>',
    closeTag: '</soft>',
    label: 'soft',
    description: 'Reduced volume',
  },
  {
    tag: '<whisper>',
    closeTag: '</whisper>',
    label: 'whisper',
    description: 'Whispered delivery',
  },
  {
    tag: '<loud>',
    closeTag: '</loud>',
    label: 'loud',
    description: 'Increased volume',
  },
  {
    tag: '<emphasis>',
    closeTag: '</emphasis>',
    label: 'emphasis',
    description: 'Emphasized word/phrase',
  },
  {
    tag: '<slow>',
    closeTag: '</slow>',
    label: 'slow',
    description: 'Slower delivery',
  },
  {
    tag: '<fast>',
    closeTag: '</fast>',
    label: 'fast',
    description: 'Faster delivery',
  },
  {
    tag: '<higher-pitch>',
    closeTag: '</higher-pitch>',
    label: 'higher-pitch',
    description: 'Raised pitch',
  },
  {
    tag: '<lower-pitch>',
    closeTag: '</lower-pitch>',
    label: 'lower-pitch',
    description: 'Lowered pitch',
  },
  {
    tag: '<build-intensity>',
    closeTag: '</build-intensity>',
    label: 'build-intensity',
    description: 'Crescendo effect',
  },
  {
    tag: '<decrease-intensity>',
    closeTag: '</decrease-intensity>',
    label: 'decrease-intensity',
    description: 'Diminuendo',
  },
  {
    tag: '<laugh-speak>',
    closeTag: '</laugh-speak>',
    label: 'laugh-speak',
    description: 'Speaking while laughing',
  },
  {
    tag: '<sing-song>',
    closeTag: '</sing-song>',
    label: 'sing-song',
    description: 'Melodic delivery',
  },
  {
    tag: '<singing>',
    closeTag: '</singing>',
    label: 'singing',
    description: 'Sung delivery',
  },
] as const;

type InstantTagDef = (typeof INSTANT_TAGS)[number];
type WrapperTagDef = (typeof WRAPPER_TAGS)[number];
type TagDef = InstantTagDef | WrapperTagDef;

const KNOWN_INSTANT_TAGS = new Set(getGrokInstantTags());

function isKnownInstantTag(tag: string): tag is GrokInstantTag {
  return KNOWN_INSTANT_TAGS.has(tag as GrokInstantTag);
}

interface GrokTTSEditorProps {
  dict: {
    effects: {
      breath: string;
      chuckle: string;
      cry: string;
      exhale: string;
      giggle: string;
      humTune: string;
      inhale: string;
      laugh: string;
      lipSmack: string;
      longPause: string;
      pause: string;
      sigh: string;
      tongueClick: string;
      tsk: string;
    };
    helperText: string;
    inlineEffectPlaceholder: string;
    wrappingEffectPlaceholder: string;
    wrappingTags: {
      buildIntensity: string;
      decreaseIntensity: string;
      emphasis: string;
      fast: string;
      higherPitch: string;
      laughSpeak: string;
      loud: string;
      lowerPitch: string;
      singSong: string;
      singing: string;
      slow: string;
      soft: string;
      whisper: string;
    };
  };
  maxLength: number;
  onChange: (text: string) => void;
  placeholder?: string;
  value: string;
}

interface EditorSelectionSnapshot {
  empty: boolean;
  from: number;
  to: number;
}

type EditorInstance = NonNullable<ReturnType<typeof useEditor>>;

type GrokDebugPhase =
  | 'create'
  | 'handleKeyDown'
  | 'handleTextInput'
  | 'selection'
  | 'transaction'
  | 'update';

interface GrokDebugEntry {
  doc: unknown;
  dom: string;
  phase: GrokDebugPhase;
  selection: EditorSelectionSnapshot;
  serialized: string;
  storedMarks: { attrs: Record<string, unknown>; type: string }[];
  timestamp: string;
}

declare global {
  interface Window {
    __SV_DEBUG_LOGS?: GrokDebugEntry[];
    __SV_GROK_DEBUG?: boolean;
  }
}

function plainTextToDoc(value: string) {
  return grokTextToTipTapDoc(value);
}

function getDomSelectionSnapshot(
  editor: EditorInstance,
): EditorSelectionSnapshot | null {
  const selection = window.getSelection();

  if (!(selection && selection.rangeCount > 0)) {
    return null;
  }

  const range = selection.getRangeAt(0);
  const editorDom = editor.view.dom;
  const startNode = range.startContainer;
  const endNode = range.endContainer;

  if (!(editorDom.contains(startNode) && editorDom.contains(endNode))) {
    return null;
  }

  try {
    const anchor = editor.view.posAtDOM(startNode, range.startOffset);
    const head = editor.view.posAtDOM(endNode, range.endOffset);

    return {
      empty: anchor === head,
      from: Math.min(anchor, head),
      to: Math.max(anchor, head),
    };
  } catch {
    return null;
  }
}

function snapshotSelection(selection: {
  empty: boolean;
  from: number;
  to: number;
}): EditorSelectionSnapshot {
  return {
    empty: selection.empty,
    from: selection.from,
    to: selection.to,
  };
}

function snapshotMarks(
  marks:
    | readonly {
        attrs: Record<string, unknown>;
        type: { name: string };
      }[]
    | null
    | undefined,
) {
  if (!marks) {
    return [];
  }

  return marks.map((mark) => ({
    attrs: mark.attrs,
    type: mark.type.name,
  }));
}

function isGrokDebugEnabled() {
  return typeof window !== 'undefined' && window.__SV_GROK_DEBUG === true;
}

function recordGrokDebug(phase: GrokDebugPhase, editor: EditorInstance) {
  if (!isGrokDebugEnabled()) {
    return;
  }

  const doc = editor.getJSON();
  const entry: GrokDebugEntry = {
    doc,
    dom: editor.view.dom.innerHTML,
    phase,
    selection: snapshotSelection(editor.state.selection),
    serialized: grokTipTapDocToText(doc),
    storedMarks: snapshotMarks(editor.state.storedMarks),
    timestamp: new Date().toISOString(),
  };

  window.__SV_DEBUG_LOGS ??= [];
  window.__SV_DEBUG_LOGS.push(entry);
  console.debug('[grok-tts-debug]', entry);
}

/**
 * EditorContent component that renders the actual editor
 */
export function EditorContentArea() {
  const { editor } = useContext(EditorContext)!;
  const { isDragging } = useUiEditorState(editor);

  // useScrollToHash()

  if (!editor) {
    return null;
  }

  return (
    <EditorContent
      className="notion-like-editor-content mx-auto flex h-full w-full max-w-3xl flex-1 flex-col"
      editor={editor}
      role="presentation"
      style={{
        cursor: isDragging ? 'grabbing' : 'auto',
      }}
    >
      <SlashDropdownMenu />
      <NotionToolbarFloating />

      {createPortal(<MobileToolbar />, document.body)}
    </EditorContent>
  );
}

export function GrokTTSEditor({
  dict,
  maxLength,
  onChange,
  placeholder,
  value,
}: GrokTTSEditorProps) {
  const [effectsOpen, setEffectsOpen] = useState(false);
  const [currentLength, setCurrentLength] = useState(value.length);
  const lastSelectionRef = useRef<EditorSelectionSnapshot>({
    empty: true,
    from: 1,
    to: 1,
  });

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        blockquote: false,
        bold: false,
        bulletList: false,
        code: false,
        codeBlock: false,
        dropcursor: false,
        gapcursor: false,
        heading: false,
        horizontalRule: false,
        italic: false,
        listItem: false,
        orderedList: false,
        strike: false,
      }),
      InstantTag,
      WrapperBoundary,
      UiState,
    ],
    content: plainTextToDoc(value),
    editorProps: {
      attributes: {
        'aria-label': placeholder ?? 'TTS editor',
        role: 'textbox',
        'aria-multiline': 'true',
        class:
          'min-h-[8rem] w-full bg-transparent text-sm leading-6 outline-none whitespace-pre-wrap break-words',
      },
      handleDOMEvents: {
        keydown: (_view) => {
          if (editor) {
            recordGrokDebug('handleKeyDown', editor);
          }

          return false;
        },
      },
      handleTextInput: (view) => {
        if (editor) {
          recordGrokDebug('handleTextInput', editor);
          return false;
        }

        const fallbackDoc = view.state.doc.toJSON();
        if (isGrokDebugEnabled()) {
          const entry: GrokDebugEntry = {
            doc: fallbackDoc,
            dom: view.dom.innerHTML,
            phase: 'handleTextInput',
            selection: snapshotSelection(view.state.selection),
            serialized: grokTipTapDocToText(fallbackDoc),
            storedMarks: snapshotMarks(view.state.storedMarks),
            timestamp: new Date().toISOString(),
          };

          window.__SV_DEBUG_LOGS ??= [];
          window.__SV_DEBUG_LOGS.push(entry);
          console.debug('[tts-debug]', entry);
        }

        return false;
      },
    },
    onCreate: ({ editor: nextEditor }) => {
      const { empty, from, to } = nextEditor.state.selection;
      lastSelectionRef.current = { empty, from, to };
      recordGrokDebug('create', nextEditor);
    },
    onSelectionUpdate: ({ editor: nextEditor }) => {
      const { empty, from, to } = nextEditor.state.selection;
      lastSelectionRef.current = { empty, from, to };
      recordGrokDebug('selection', nextEditor);
    },
    onTransaction: ({ editor: nextEditor }) => {
      recordGrokDebug('transaction', nextEditor);
    },
    onUpdate: ({ editor: nextEditor }) => {
      const fullText = grokTipTapDocToText(nextEditor.getJSON());
      const text = fullText.slice(0, maxLength);

      if (text !== fullText) {
        nextEditor.commands.setContent(plainTextToDoc(text));
      }

      setCurrentLength(text.length);
      onChange(text);
      recordGrokDebug('update', nextEditor);
    },
  });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.__SV_DEBUG_LOGS ??= [];
    }
  }, []);

  useEffect(() => {
    if (!editor) {
      return;
    }

    const current = grokTipTapDocToText(editor.getJSON());
    if (current === value) {
      setCurrentLength(current.length);
      return;
    }

    editor.commands.setContent(plainTextToDoc(value));
    setCurrentLength(value.length);
  }, [editor, value]);

  const insertInstantTag = useCallback(
    (tag: InstantTagDef) => {
      if (!editor) {
        return;
      }

      const selection = lastSelectionRef.current;
      const serialized = grokTipTapDocToText(editor.getJSON());
      const selectedTextLength = selection.empty
        ? 0
        : editor.state.doc.textBetween(selection.from, selection.to, '\n')
            .length;
      const nextLength =
        serialized.length - selectedTextLength + tag.tag.length;

      if (nextLength > maxLength) {
        return;
      }

      editor
        .chain()
        .focus()
        .setTextSelection({ from: selection.from, to: selection.to })
        .insertContent(createInstantTagNode(tag.tag))
        .run();
      setEffectsOpen(false);
    },
    [editor, maxLength],
  );

  const insertWrapperTag = useCallback(
    (tag: WrapperTagDef) => {
      if (!editor) {
        return;
      }

      const selection = lastSelectionRef.current;
      const wrapperLength = tag.tag.length + tag.closeTag.length;

      const serialized = grokTipTapDocToText(editor.getJSON());
      const nextLength = serialized.length + wrapperLength;

      if (nextLength > maxLength) {
        return;
      }

      const openBoundary = createWrapperBoundaryNode(
        'open',
        tag.tag,
        tag.closeTag,
      );
      const closeBoundary = createWrapperBoundaryNode(
        'close',
        tag.tag,
        tag.closeTag,
      );

      editor
        .chain()
        .focus()
        .setTextSelection({ from: selection.from, to: selection.to })
        .run();

      if (selection.empty) {
        const insertFrom = selection.from;
        const tr = editor.state.tr.replaceSelectionWith(
          editor.schema.nodeFromJSON(openBoundary),
        );

        tr.insert(insertFrom + 1, editor.schema.text(GROK_EMPTY_WRAPPER_TEXT));
        tr.insert(insertFrom + 2, editor.schema.nodeFromJSON(closeBoundary));

        const cursorPos = insertFrom + 2;
        tr.setSelection(TextSelection.create(tr.doc, cursorPos));
        editor.view.dispatch(tr);
        editor.chain().focus().setTextSelection(cursorPos).run();
      } else {
        const selectedSlice = editor.state.doc.slice(
          selection.from,
          selection.to,
        );
        const tr = editor.state.tr.replaceSelectionWith(
          editor.schema.nodeFromJSON(openBoundary),
        );

        tr.insert(selection.from + 1, selectedSlice.content);
        const closeBoundaryPos =
          selection.from + 1 + selectedSlice.content.size;
        tr.insert(closeBoundaryPos, editor.schema.nodeFromJSON(closeBoundary));

        const cursorPos = closeBoundaryPos + 1;
        tr.setSelection(TextSelection.create(tr.doc, cursorPos));
        editor.view.dispatch(tr);
        editor.chain().focus().setTextSelection(cursorPos).run();
      }

      setEffectsOpen(false);
    },
    [editor, maxLength],
  );

  const preserveSelection = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
    },
    [],
  );

  const preserveEditorSelection = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      if (editor) {
        const snapshot = getDomSelectionSnapshot(editor);

        if (snapshot) {
          lastSelectionRef.current = snapshot;
        }
      }

      event.preventDefault();
    },
    [editor],
  );

  const handleInsertTag = useCallback(
    (tag: TagDef) => {
      if ('closeTag' in tag) {
        insertWrapperTag(tag);
        return;
      }

      insertInstantTag(tag);
    },
    [insertInstantTag, insertWrapperTag],
  );

  if (!editor) {
    return (
      <div className="w-full">
        <div className="min-h-[8rem] rounded-md border border-input bg-background p-3" />
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="space-y-2">
        <div className="relative min-h-[8rem] rounded-md border border-input bg-background p-3 text-sm ring-offset-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
          <EditorContext.Provider value={{ editor }}>
            <EditorContentArea />
          </EditorContext.Provider>

          {currentLength === 0 && placeholder && (
            <div className="pointer-events-none absolute top-3 left-3 text-muted-foreground text-sm">
              {placeholder}
            </div>
          )}
        </div>

        <div className="mt-2 flex items-center gap-2">
          <Popover onOpenChange={setEffectsOpen} open={effectsOpen}>
            <PopoverTrigger asChild>
              <Button
                className="h-8"
                onMouseDown={preserveEditorSelection}
                size="sm"
                variant="outline"
              >
                <Sparkles className="mr-1.5 size-3.5" />
                {dict.inlineEffectPlaceholder}
                <ChevronDown className="ml-1 size-3" />
              </Button>
            </PopoverTrigger>

            <PopoverContent align="start" className="w-80 bg-background p-0">
              <div className="max-h-[400px] overflow-y-auto">
                <div className="border-border border-b p-3">
                  <h4 className="mb-2 font-medium text-sm">
                    {dict.inlineEffectPlaceholder}
                  </h4>
                  <div className="grid grid-cols-2 gap-1">
                    {INSTANT_TAGS.map((tag) => (
                      <button
                        className="rounded-sm px-2 py-1.5 text-left text-xs hover:bg-accent"
                        key={tag.tag}
                        onClick={() => handleInsertTag(tag)}
                        onMouseDown={preserveSelection}
                        type="button"
                      >
                        <div className="font-medium">
                          {isKnownInstantTag(tag.tag)
                            ? tag.tag
                            : `[${tag.label}]`}
                        </div>
                        <div className="text-muted-foreground">
                          {
                            {
                              '[pause]': dict.effects.pause,
                              '[long-pause]': dict.effects.longPause,
                              '[laugh]': dict.effects.laugh,
                              '[chuckle]': dict.effects.chuckle,
                              '[giggle]': dict.effects.giggle,
                              '[cry]': dict.effects.cry,
                              '[sigh]': dict.effects.sigh,
                              '[breath]': dict.effects.breath,
                              '[inhale]': dict.effects.inhale,
                              '[exhale]': dict.effects.exhale,
                              '[tsk]': dict.effects.tsk,
                              '[tongue-click]': dict.effects.tongueClick,
                              '[lip-smack]': dict.effects.lipSmack,
                              '[hum-tune]': dict.effects.humTune,
                            }[tag.tag]
                          }
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="p-3">
                  <h4 className="mb-2 font-medium text-sm">
                    {dict.wrappingEffectPlaceholder}
                  </h4>
                  <div className="grid grid-cols-2 gap-1">
                    {WRAPPER_TAGS.map((tag) => (
                      <button
                        className="rounded-sm px-2 py-1.5 text-left text-xs hover:bg-accent"
                        key={tag.tag}
                        onClick={() => handleInsertTag(tag)}
                        onMouseDown={preserveSelection}
                        type="button"
                      >
                        <div className="font-medium">
                          {
                            {
                              '<soft>': dict.wrappingTags.soft,
                              '<whisper>': dict.wrappingTags.whisper,
                              '<loud>': dict.wrappingTags.loud,
                              '<emphasis>': dict.wrappingTags.emphasis,
                              '<slow>': dict.wrappingTags.slow,
                              '<fast>': dict.wrappingTags.fast,
                              '<higher-pitch>': dict.wrappingTags.higherPitch,
                              '<lower-pitch>': dict.wrappingTags.lowerPitch,
                              '<build-intensity>':
                                dict.wrappingTags.buildIntensity,
                              '<decrease-intensity>':
                                dict.wrappingTags.decreaseIntensity,
                              '<laugh-speak>': dict.wrappingTags.laughSpeak,
                              '<sing-song>': dict.wrappingTags.singSong,
                              '<singing>': dict.wrappingTags.singing,
                            }[tag.tag]
                          }
                        </div>
                        <div className="text-muted-foreground">
                          {
                            {
                              '<soft>': dict.wrappingTags.soft,
                              '<whisper>': dict.wrappingTags.whisper,
                              '<loud>': dict.wrappingTags.loud,
                              '<emphasis>': dict.wrappingTags.emphasis,
                              '<slow>': dict.wrappingTags.slow,
                              '<fast>': dict.wrappingTags.fast,
                              '<higher-pitch>': dict.wrappingTags.higherPitch,
                              '<lower-pitch>': dict.wrappingTags.lowerPitch,
                              '<build-intensity>':
                                dict.wrappingTags.buildIntensity,
                              '<decrease-intensity>':
                                dict.wrappingTags.decreaseIntensity,
                              '<laugh-speak>': dict.wrappingTags.laughSpeak,
                              '<sing-song>': dict.wrappingTags.singSong,
                              '<singing>': dict.wrappingTags.singing,
                            }[tag.tag]
                          }
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </PopoverContent>
          </Popover>

          <div className="flex-1" />

          <span
            className={cn(
              'text-muted-foreground text-xs',
              currentLength > maxLength && 'font-bold text-red-500',
            )}
          >
            {currentLength} / {maxLength}
          </span>
        </div>

        <div className="mt-1 text-center text-muted-foreground text-xs">
          {dict.helperText}
        </div>
      </div>
    </div>
  );
}
