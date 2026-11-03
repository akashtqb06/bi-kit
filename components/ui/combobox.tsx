'use client';

import * as React from 'react';
import { Combobox as ComboboxPrimitive } from '@base-ui/react/combobox';
import { cn } from '@/lib/utils';
import { ChevronDownIcon, CheckIcon, XIcon } from 'lucide-react';
import { resolveNativeButton } from './button';

const Combobox = ComboboxPrimitive.Root;

function ComboboxInputGroup({
  className,
  ...props
}: ComboboxPrimitive.InputGroup.Props) {
  return (
    <ComboboxPrimitive.InputGroup
      data-slot="combobox-input-group"
      className={cn(
        'relative flex w-full min-w-0 items-center rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm transition-colors outline-none focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30',
        className
      )}
      {...props}
    />
  );
}

function ComboboxInput({
  className,
  ...props
}: ComboboxPrimitive.Input.Props) {
  return (
    <ComboboxPrimitive.Input
      data-slot="combobox-input"
      className={cn(
        'w-full min-w-0 bg-transparent text-xs text-foreground placeholder:text-muted-foreground outline-none border-0 p-0 h-7 disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      {...props}
    />
  );
}

function ComboboxTrigger({
  className,
  nativeButton,
  render,
  children,
  ...props
}: ComboboxPrimitive.Trigger.Props) {
  return (
    <ComboboxPrimitive.Trigger
      data-slot="combobox-trigger"
      className={cn(
        'flex shrink-0 items-center justify-center p-0.5 text-muted-foreground hover:text-foreground outline-none transition-colors cursor-pointer',
        className
      )}
      nativeButton={resolveNativeButton(nativeButton, render)}
      render={render}
      {...props}
    >
      {children || <ChevronDownIcon className="size-3.5" />}
    </ComboboxPrimitive.Trigger>
  );
}

function ComboboxClear({
  className,
  children,
  ...props
}: ComboboxPrimitive.Clear.Props) {
  return (
    <ComboboxPrimitive.Clear
      data-slot="combobox-clear"
      className={cn(
        'flex shrink-0 items-center justify-center p-0.5 text-muted-foreground hover:text-foreground outline-none transition-colors cursor-pointer mr-0.5',
        className
      )}
      {...props}
    >
      {children || <XIcon className="size-3" />}
    </ComboboxPrimitive.Clear>
  );
}

const ComboboxPortal = ComboboxPrimitive.Portal;

function ComboboxPositioner({
  className,
  side = 'bottom',
  align = 'start',
  sideOffset = 4,
  ...props
}: ComboboxPrimitive.Positioner.Props) {
  return (
    <ComboboxPrimitive.Positioner
      data-slot="combobox-positioner"
      side={side}
      align={align}
      sideOffset={sideOffset}
      className={cn('isolate z-50', className)}
      {...props}
    />
  );
}

function ComboboxPopup({
  className,
  ...props
}: ComboboxPrimitive.Popup.Props) {
  return (
    <ComboboxPrimitive.Popup
      data-slot="combobox-popup"
      className={cn(
        'relative isolate z-50 max-h-[280px] w-[var(--anchor-width)] min-w-40 origin-[var(--transform-origin)] overflow-x-hidden overflow-y-auto rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95',
        className
      )}
      {...props}
    />
  );
}

function ComboboxList({
  className,
  ...props
}: ComboboxPrimitive.List.Props) {
  return (
    <ComboboxPrimitive.List
      data-slot="combobox-list"
      className={cn('scroll-py-1 outline-none', className)}
      {...props}
    />
  );
}

function ComboboxItem({
  className,
  ...props
}: ComboboxPrimitive.Item.Props) {
  return (
    <ComboboxPrimitive.Item
      data-slot="combobox-item"
      className={cn(
        'relative flex w-full cursor-pointer select-none items-center gap-2 rounded-md px-2 py-1.5 text-xs outline-none transition-colors data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
        className
      )}
      {...props}
    />
  );
}

function ComboboxItemIndicator({
  className,
  children,
  ...props
}: ComboboxPrimitive.ItemIndicator.Props) {
  return (
    <ComboboxPrimitive.ItemIndicator
      data-slot="combobox-item-indicator"
      className={cn('ml-auto shrink-0', className)}
      {...props}
    >
      {children || <CheckIcon className="size-3.5 text-primary" />}
    </ComboboxPrimitive.ItemIndicator>
  );
}

function ComboboxEmpty({
  className,
  children,
  ...props
}: ComboboxPrimitive.Empty.Props) {
  return (
    <ComboboxPrimitive.Empty
      data-slot="combobox-empty"
      className={cn('py-4 text-center text-xs text-muted-foreground', className)}
      {...props}
    >
      {children || 'No results found'}
    </ComboboxPrimitive.Empty>
  );
}

const ComboboxSeparator = ComboboxPrimitive.Separator;
const ComboboxGroup = ComboboxPrimitive.Group;
const ComboboxGroupLabel = ComboboxPrimitive.GroupLabel;

export {
  Combobox,
  ComboboxInputGroup,
  ComboboxInput,
  ComboboxTrigger,
  ComboboxClear,
  ComboboxPortal,
  ComboboxPositioner,
  ComboboxPopup,
  ComboboxList,
  ComboboxItem,
  ComboboxItemIndicator,
  ComboboxEmpty,
  ComboboxSeparator,
  ComboboxGroup,
  ComboboxGroupLabel,
};

