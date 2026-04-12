'use client';

import { Placeholder } from '@tiptap/extensions';
import { TextSelection } from '@tiptap/pm/state';
import { EditorContent, EditorContext, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { ChevronDown, Crown, Sparkles } from 'lucide-react';
import {
  type MouseEvent,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { AutoConvertGrokTags } from '@/components/grok-tts/extensions/auto-convert-grok-tags';
import {
  createWrapperBoundaryNode,
  WrapperBoundary,
} from '@/components/grok-tts/extensions/grok-wrapper-boundary';
import {
  createInstantTagNode,
  InstantTag,
} from '@/components/grok-tts/extensions/instant-tag';
import { UnsupportedGrokTagHighlight } from '@/components/grok-tts/extensions/unsupported-grok-tag-highlight';
import { SpotlightField } from '@/components/spotlight-field';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useUiEditorState } from '@/hooks/tiptap/use-ui-editor-state';
import {
  GROK_EMPTY_WRAPPING_TEXT,
  GROK_INSTANT_TAG_DEFINITIONS,
  GROK_INSTANT_TAGS,
  GROK_WRAPPING_TAG_DEFINITIONS,
  type GrokInstantTag,
  grokTextToTipTapDoc,
  grokTipTapDocToText,
} from '@/lib/tts-editor';
import { cn } from '@/lib/utils';
import type messages from '@/messages/en.json';
import { UiState } from './tiptap/tiptap-extension/ui-state-extension';
import { SlashDropdownMenu } from './tiptap/tiptap-ui/slash-dropdown-menu';
import type {
  SuggestionItem,
  SuggestionMenuProps,
} from './tiptap/tiptap-ui-utils/suggestion-menu';

import './grok-tts-editor.css';

const INSTANT_TAGS = GROK_INSTANT_TAG_DEFINITIONS;

const WRAPPING_TAGS = GROK_WRAPPING_TAG_DEFINITIONS.map(
  ({ closeTag, description, label, openTag }) => ({
    closeTag,
    description,
    label,
    tag: openTag,
  }),
);

type InstantTagDef = (typeof INSTANT_TAGS)[number];
type WrapperTagDef = (typeof WRAPPING_TAGS)[number];
type TagDef = InstantTagDef | WrapperTagDef;

const KNOWN_INSTANT_TAGS = new Set(GROK_INSTANT_TAGS);

function isKnownInstantTag(tag: string): tag is GrokInstantTag {
  return KNOWN_INSTANT_TAGS.has(tag as GrokInstantTag);
}

const XAI_LANGUAGE_OPTIONS = [
  { value: 'ar-EG', label: 'langArabicEgypt' },
  { value: 'ar-SA', label: 'langArabicSaudiArabia' },
  { value: 'ar-AE', label: 'langArabicUnitedArabEmirates' },
  { value: 'bn', label: 'langBengali' },
  { value: 'zh', label: 'langChinese' },
  { value: 'fr', label: 'langFrench' },
  { value: 'de', label: 'langGerman' },
  { value: 'hi', label: 'langHindi' },
  { value: 'id', label: 'langIndonesian' },
  { value: 'it', label: 'langItalian' },
  { value: 'ja', label: 'langJapanese' },
  { value: 'ko', label: 'langKorean' },
  { value: 'pt-BR', label: 'langPortugueseBrazil' },
  { value: 'pt-PT', label: 'langPortuguesePortugal' },
  { value: 'ru', label: 'langRussian' },
  { value: 'es-ES', label: 'langSpanishSpain' },
  { value: 'es-MX', label: 'langSpanishMexico' },
  { value: 'tr', label: 'langTurkish' },
  { value: 'vi', label: 'langVietnamese' },
] as const;

interface GrokTTSEditorProps {
  dict: (typeof messages)['generate']['grok'];
  isPaidUser?: boolean;
  maxLength: number;
  onChange: (text: string) => void;
  placeholder?: string;
  selectedGrokLanguage: string;
  setSelectedGrokLanguage: (text: string) => void;
  value: string;
}

interface EditorSelectionSnapshot {
  empty: boolean;
  from: number;
  to: number;
}

type EditorInstance = NonNullable<ReturnType<typeof useEditor>>;

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

interface GrokSlashMenuConfig {
  allow?: NonNullable<SuggestionMenuProps['allow']>;
  customItems: SuggestionItem[];
  pluginKey: string;
  triggerChar: '[' | '<';
}

interface EditorContentAreaProps {
  slashMenus: GrokSlashMenuConfig[];
}

function createInstantTagSuggestionItem(
  tag: InstantTagDef,
  onSelect: () => void,
): SuggestionItem {
  return {
    title: tag.label,
    subtext: tag.description,
    keywords: [tag.label, tag.tag, tag.description],
    onSelect,
  };
}

function createWrapperTagSuggestionItem(
  tag: WrapperTagDef,
  onSelect: () => void,
): SuggestionItem {
  return {
    title: tag.label,
    subtext: tag.description,
    keywords: [tag.label, tag.tag, tag.closeTag, tag.description],
    onSelect,
  };
}

/**
 * EditorContent component that renders the actual editor
 */
export function EditorContentArea({ slashMenus }: EditorContentAreaProps) {
  const { editor } = useContext(EditorContext)!;
  const { isDragging } = useUiEditorState(editor);

  // useScrollToHash()

  if (!editor) {
    return null;
  }

  return (
    <EditorContent
      className="editor-content mx-auto flex h-full w-full max-w-3xl flex-1 flex-col"
      editor={editor}
      role="presentation"
      style={{
        cursor: isDragging ? 'grabbing' : 'auto',
      }}
    >
      {slashMenus.map((menu) => (
        <SlashDropdownMenu
          allow={menu.allow}
          char={menu.triggerChar}
          config={{
            customItems: menu.customItems,
            enabledItems: [],
            showGroups: false,
          }}
          key={menu.pluginKey}
          pluginKey={menu.pluginKey}
        />
      ))}
    </EditorContent>
  );
}

export function GrokTTSEditor({
  dict,
  isPaidUser,
  maxLength,
  onChange,
  placeholder,
  selectedGrokLanguage,
  setSelectedGrokLanguage,
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
      Placeholder.configure({
        placeholder,
        emptyNodeClass: 'is-empty with-slash',
      }),
      InstantTag,
      WrapperBoundary,
      UnsupportedGrokTagHighlight,
      AutoConvertGrokTags,
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
        autoCorrect: 'false',
        spellCheck: 'false',
      },
      handleDOMEvents: {
        keydown: () => false,
      },
      handleTextInput: () => false,
    },
    onCreate: ({ editor: nextEditor }) => {
      const { empty, from, to } = nextEditor.state.selection;
      lastSelectionRef.current = { empty, from, to };
    },
    onSelectionUpdate: ({ editor: nextEditor }) => {
      const { empty, from, to } = nextEditor.state.selection;
      lastSelectionRef.current = { empty, from, to };
    },
    onUpdate: ({ editor: nextEditor }) => {
      const fullText = grokTipTapDocToText(nextEditor.getJSON());
      const text = fullText.slice(0, maxLength);

      if (text !== fullText) {
        nextEditor.commands.setContent(plainTextToDoc(text));
      }

      setCurrentLength(text.length);
      onChange(text);
    },
  });

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

        tr.insert(insertFrom + 1, editor.schema.text(GROK_EMPTY_WRAPPING_TEXT));
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

  const translatedGrokLanguages = useMemo(
    () => [
      { value: 'auto', label: dict.langAutomatic },
      { value: 'en', label: dict.langEnglish },
      ...XAI_LANGUAGE_OPTIONS.map(({ value, label }) => ({
        value,
        label: dict[label as keyof typeof dict] as string,
      })),
    ],
    [dict],
  );

  const slashMenus = useMemo<GrokSlashMenuConfig[]>(
    () => [
      {
        customItems: INSTANT_TAGS.map((tag) =>
          createInstantTagSuggestionItem(tag, () => handleInsertTag(tag)),
        ),
        pluginKey: 'grokInstantTagMenu',
        triggerChar: '[',
      },
      {
        allow: ({
          editor,
          range,
        }: Parameters<NonNullable<SuggestionMenuProps['allow']>>[0]) => {
          const resolvedPosition = editor.state.doc.resolve(range.to);
          const nodeAfter = resolvedPosition.nodeAfter;
          const nextText = nodeAfter?.isText ? (nodeAfter.text ?? '') : '';
          const previousNode = resolvedPosition.nodeBefore;
          const previousText = previousNode?.isText
            ? (previousNode.text ?? '')
            : '';
          const combinedTagText = `${previousText}${nextText}`;

          return !WRAPPING_TAGS.some((tag) => {
            const partialOpenTag = tag.tag.slice(1);
            return (
              combinedTagText.startsWith(partialOpenTag) ||
              combinedTagText.startsWith(tag.tag)
            );
          });
        },
        customItems: WRAPPING_TAGS.map((tag) =>
          createWrapperTagSuggestionItem(tag, () => handleInsertTag(tag)),
        ),
        pluginKey: 'grokWrapperTagMenu',
        triggerChar: '<',
      },
    ],
    [handleInsertTag],
  );

  if (!editor) {
    return (
      <div className="w-full">
        <div className="min-h-[8rem] rounded-md border border-input bg-background p-3" />
      </div>
    );
  }

  return (
    <>
      <div className="space-y-2 sm:w-1/3">
        <div className="font-medium text-sm">{dict.languageLabel}</div>
        <Select
          onValueChange={setSelectedGrokLanguage}
          value={selectedGrokLanguage}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder={dict.languageSelectPlaceholder} />
          </SelectTrigger>
          <SelectContent>
            {translatedGrokLanguages.map(({ value, label }) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="w-full">
        <div className="space-y-2">
          <SpotlightField>
            <div className="editor-wrapper relative min-h-[8rem] rounded-md bg-transparent p-3 text-sm ring-offset-background">
              <EditorContext.Provider value={{ editor }}>
                <EditorContentArea slashMenus={slashMenus} />
              </EditorContext.Provider>
            </div>
          </SpotlightField>

          <div className="mt-2 flex items-center gap-2">
            <Popover onOpenChange={setEffectsOpen} open={effectsOpen}>
              <PopoverTrigger asChild>
                <Button
                  // className="w-1.3"
                  onMouseDown={preserveEditorSelection}
                  size="sm"
                  variant="outline"
                >
                  <Sparkles className="mr-1.5 size-3.5" />
                  {dict.inlineEffectPlaceholder}
                  <ChevronDown className="ml-1 size-3" />
                </Button>
              </PopoverTrigger>

              <PopoverContent
                align="start"
                className="bg-background p-0 sm:w-100"
              >
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
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="p-3">
                    <h4 className="mb-2 font-medium text-sm">
                      {dict.wrappingEffectPlaceholder}
                    </h4>
                    <div className="grid grid-cols-2 gap-1">
                      {WRAPPING_TAGS.map((tag) => (
                        <button
                          className="w-full min-w-0 rounded-sm px-2 py-1.5 text-left text-xs hover:bg-accent"
                          key={tag.tag}
                          onClick={() => handleInsertTag(tag)}
                          onMouseDown={preserveSelection}
                          type="button"
                        >
                          <div className="min-w-0 font-medium">
                            <span className="inline-block whitespace-nowrap">
                              {tag.tag}
                              ...
                            </span>
                            <wbr />
                            <span className="inline-block whitespace-nowrap">
                              {tag.closeTag}
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </PopoverContent>
            </Popover>

            <div className="flex-1" />

            <div
              className={cn(
                'flex items-center justify-end gap-1.5 text-muted-foreground text-sm',
                currentLength > maxLength ? 'font-bold text-red-500' : '',
              )}
            >
              {currentLength} / {maxLength}
              <TooltipProvider>
                <Tooltip delayDuration={100} /*supportMobileTap*/>
                  <TooltipTrigger asChild>
                    <Crown
                      className={cn(
                        'h-3.5 w-3.5 cursor-default',
                        isPaidUser
                          ? 'text-muted-foreground/50'
                          : 'text-yellow-400',
                      )}
                    />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>
                      {isPaidUser
                        ? 'Paid users enjoy 2× character limit'
                        : 'Upgrade to a paid plan for 2× character limit'}
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
