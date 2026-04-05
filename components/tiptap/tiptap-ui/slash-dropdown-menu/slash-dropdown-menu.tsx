import { useEffect, useMemo, useRef } from 'react';

// --- Hooks ---
import type { SlashMenuConfig } from '@/components/tiptap/tiptap-ui/slash-dropdown-menu/use-slash-dropdown-menu';
import { useSlashDropdownMenu } from '@/components/tiptap/tiptap-ui/slash-dropdown-menu/use-slash-dropdown-menu';
import {
  Button,
  ButtonGroup,
} from '@/components/tiptap/tiptap-ui-primitive/button';
import {
  Card,
  CardBody,
  CardGroupLabel,
  CardItemGroup,
} from '@/components/tiptap/tiptap-ui-primitive/card';
import { Separator } from '@/components/tiptap/tiptap-ui-primitive/separator';
// --- Tiptap UI ---
import type {
  SuggestionItem,
  SuggestionMenuProps,
  SuggestionMenuRenderProps,
} from '@/components/tiptap/tiptap-ui-utils/suggestion-menu';
import {
  filterSuggestionItems,
  SuggestionMenu,
} from '@/components/tiptap/tiptap-ui-utils/suggestion-menu';
// --- UI Primitives ---
// import { Button, ButtonGroup } from '@/components/ui/button';
// --- Lib ---
import { cn, getElementOverflowPosition } from '@/lib/tiptap-utils';

type SlashDropdownMenuProps = Omit<
  SuggestionMenuProps,
  'items' | 'children'
> & {
  config?: SlashMenuConfig;
  selector?: string;
  triggerChar?: string;
  pluginKey?: string;
};

export const SlashDropdownMenu = (props: SlashDropdownMenuProps) => {
  const {
    config,
    pluginKey = 'slashDropdownMenu',
    selector = 'tiptap-slash-dropdown-menu',
    triggerChar = '/',
    ...restProps
  } = props;
  const { getSlashMenuItems } = useSlashDropdownMenu(config);

  return (
    <SuggestionMenu
      char={triggerChar}
      decorationClass="inline-block bg-gray-800 rounded-sm outline-[5.5px] outline-gray-800 [&.is-empty]:after:content-[attr(data-decoration-content)] [&.is-empty]:after:text-gray-500"
      decorationContent="Filter..."
      items={({ query, editor }) =>
        filterSuggestionItems(getSlashMenuItems(editor), query)
      }
      pluginKey={pluginKey}
      selector={selector}
      {...restProps}
    >
      {(props) => <List {...props} config={config} selector={selector} />}
    </SuggestionMenu>
  );
};

const Item = (props: {
  item: SuggestionItem;
  isSelected: boolean;
  onSelect: () => void;
  selector?: string;
}) => {
  const { item, isSelected, onSelect } = props;
  const itemRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const selector = document.querySelector(
      `[data-selector="${props.selector ?? 'tiptap-slash-dropdown-menu'}"]`,
    ) as HTMLElement;
    if (!(itemRef.current && isSelected && selector)) return;

    const overflow = getElementOverflowPosition(itemRef.current, selector);

    if (overflow === 'top') {
      itemRef.current.scrollIntoView(true);
    } else if (overflow === 'bottom') {
      itemRef.current.scrollIntoView(false);
    }
  }, [isSelected, props.selector]);

  const BadgeIcon = item.badge;

  return (
    <Button
      className={cn(
        'w-full justify-start text-left',
        isSelected && 'bg-gray-800',
      )}
      onClick={onSelect}
      ref={itemRef}
      variant="ghost"
    >
      {BadgeIcon && <BadgeIcon className="mr-2 h-4 w-4" />}
      <div className="flex-1 truncate">{item.title}</div>
    </Button>
  );
};

const List = ({
  items,
  selectedIndex,
  onSelect,
  config,
  selector,
}: SuggestionMenuRenderProps & {
  config?: SlashMenuConfig;
  selector?: string;
}) => {
  const renderedItems = useMemo(() => {
    const rendered: React.ReactElement[] = [];
    const showGroups = config?.showGroups !== false;

    if (!showGroups) {
      items.forEach((item, index) => {
        rendered.push(
          <Item
            isSelected={index === selectedIndex}
            item={item}
            key={`item-${index}-${item.title}`}
            onSelect={() => onSelect(item)}
            selector={selector}
          />,
        );
      });
      return rendered;
    }

    const groups: {
      [groupLabel: string]: { items: SuggestionItem[]; indices: number[] };
    } = {};

    items.forEach((item, index) => {
      const groupLabel = item.group || '';
      if (!groups[groupLabel]) {
        groups[groupLabel] = { items: [], indices: [] };
      }
      groups[groupLabel].items.push(item);
      groups[groupLabel].indices.push(index);
    });

    Object.entries(groups).forEach(([groupLabel, groupData], groupIndex) => {
      if (groupIndex > 0) {
        rendered.push(
          <Separator
            className="my-1"
            key={`separator-${groupIndex}`}
            orientation="horizontal"
          />,
        );
      }

      const groupItems = groupData.items.map((item, itemIndex) => {
        const originalIndex = groupData.indices[itemIndex];
        return (
          <Item
            isSelected={originalIndex === selectedIndex}
            item={item}
            key={`item-${originalIndex}-${item.title}`}
            onSelect={() => onSelect(item)}
            selector={selector}
          />
        );
      });

      if (groupLabel) {
        rendered.push(
          <CardItemGroup
            className="w-full"
            key={`group-${groupIndex}-${groupLabel}`}
          >
            <CardGroupLabel>{groupLabel}</CardGroupLabel>
            <ButtonGroup className="flex w-full flex-col gap-0.5">
              {groupItems}
            </ButtonGroup>
          </CardItemGroup>,
        );
      } else {
        rendered.push(...groupItems);
      }
    });

    return rendered;
  }, [items, selectedIndex, onSelect, config?.showGroups, selector]);

  if (!renderedItems.length) {
    return null;
  }

  return (
    <Card
      className="min-w-[15rem] overflow-hidden"
      style={{
        maxHeight: 'var(--suggestion-menu-max-height)',
      }}
    >
      <CardBody className="w-full p-2">{renderedItems}</CardBody>
    </Card>
  );
};
