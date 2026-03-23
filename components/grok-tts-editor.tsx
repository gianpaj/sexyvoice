'use client';

import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { ChevronDown, Sparkles } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { GrokWrapperMark } from '@/components/grok-tts/extensions/grok-wrapper-mark';
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
import {
  type GrokInstantTag,
  getGrokInstantTags,
  grokTextToTipTapDoc,
  grokTipTapDocToText,
} from '@/lib/grok-tts-editor';
import { cn } from '@/lib/utils';

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
] as const;

type InstantTagDef = (typeof INSTANT_TAGS)[number];
type WrapperTagDef = (typeof WRAPPER_TAGS)[number];
type TagDef = InstantTagDef | WrapperTagDef;

const KNOWN_INSTANT_TAGS = new Set(getGrokInstantTags());

function isKnownInstantTag(tag: string): tag is GrokInstantTag {
  return KNOWN_INSTANT_TAGS.has(tag as GrokInstantTag);
}

interface GrokTTSEditorProps {
  maxLength: number;
  onChange: (text: string) => void;
  placeholder?: string;
  value: string;
}

function plainTextToDoc(value: string) {
  return grokTextToTipTapDoc(value);
}

export function GrokTTSEditor({
  maxLength,
  onChange,
  placeholder,
  value,
}: GrokTTSEditorProps) {
  const [effectsOpen, setEffectsOpen] = useState(false);
  const [currentLength, setCurrentLength] = useState(value.length);

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
      GrokWrapperMark,
    ],
    content: plainTextToDoc(value),
    editorProps: {
      attributes: {
        'aria-label': placeholder ?? 'Grok TTS editor',
        role: 'textbox',
        'aria-multiline': 'true',
        class:
          'min-h-[8rem] w-full bg-transparent text-sm leading-6 outline-none whitespace-pre-wrap break-words',
      },
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

      const serialized = grokTipTapDocToText(editor.getJSON());
      const nextLength = serialized.length + tag.tag.length;

      if (nextLength > maxLength) {
        return;
      }

      editor.chain().focus().insertContent(createInstantTagNode(tag.tag)).run();
      setEffectsOpen(false);
    },
    [editor, maxLength],
  );

  const insertWrapperTag = useCallback(
    (tag: WrapperTagDef) => {
      if (!editor) {
        return;
      }

      const { empty } = editor.state.selection;
      if (empty) {
        return;
      }

      const serialized = grokTipTapDocToText(editor.getJSON());
      const nextLength =
        serialized.length + tag.tag.length + tag.closeTag.length;

      if (nextLength > maxLength) {
        return;
      }

      editor
        .chain()
        .focus()
        .setMark('grokWrapper', {
          closeTag: tag.closeTag,
          openTag: tag.tag,
        })
        .run();
      setEffectsOpen(false);
    },
    [editor, maxLength],
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
          <EditorContent editor={editor} />

          {currentLength === 0 && placeholder && (
            <div className="pointer-events-none absolute top-3 left-3 text-muted-foreground text-sm">
              {placeholder}
            </div>
          )}
        </div>

        <div className="mt-2 flex items-center gap-2">
          <Popover onOpenChange={setEffectsOpen} open={effectsOpen}>
            <PopoverTrigger asChild>
              <Button className="h-8" size="sm" variant="outline">
                <Sparkles className="mr-1.5 size-3.5" />
                Effects
                <ChevronDown className="ml-1 size-3" />
              </Button>
            </PopoverTrigger>

            <PopoverContent align="start" className="w-80 bg-background p-0">
              <div className="max-h-[400px] overflow-y-auto">
                <div className="border-border border-b p-3">
                  <h4 className="mb-2 font-medium text-sm">Instant Tags</h4>
                  <div className="grid grid-cols-2 gap-1">
                    {INSTANT_TAGS.map((tag) => (
                      <button
                        className="rounded-sm px-2 py-1.5 text-left text-xs hover:bg-accent"
                        key={tag.tag}
                        onClick={() => handleInsertTag(tag)}
                        type="button"
                      >
                        <div className="font-medium">
                          {isKnownInstantTag(tag.tag)
                            ? tag.tag
                            : `[${tag.label}]`}
                        </div>
                        <div className="text-muted-foreground">
                          {tag.description}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="p-3">
                  <h4 className="mb-2 font-medium text-sm">Wrapper Tags</h4>
                  <div className="grid grid-cols-2 gap-1">
                    {WRAPPER_TAGS.map((tag) => (
                      <button
                        className="rounded-sm px-2 py-1.5 text-left text-xs hover:bg-accent"
                        key={tag.tag}
                        onClick={() => handleInsertTag(tag)}
                        type="button"
                      >
                        <div className="font-medium">
                          {'<'}
                          {tag.label}
                          {'>'}
                        </div>
                        <div className="text-muted-foreground">
                          {tag.description}
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
          Type <kbd className="rounded bg-muted px-1 py-0.5 font-mono">[</kbd>{' '}
          for instant tags or{' '}
          <kbd className="rounded bg-muted px-1 py-0.5 font-mono">{'<'}</kbd>{' '}
          for wrapper tags
        </div>
      </div>
    </div>
  );
}
