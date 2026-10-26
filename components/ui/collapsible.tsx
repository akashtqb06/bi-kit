/**
 * Rule: `nativeButton` must match the element that is actually rendered.
 * - The rendered element is a real <button> (including a shadcn <Button> or <button>):
 *   leave nativeButton at its default (true); remove the nativeButton={false} prop.
 * - The rendered element is NOT a button (a, Link, div, span, li):
 *   nativeButton={false} is required.
 */

"use client"

import { Collapsible as CollapsiblePrimitive } from "@base-ui/react/collapsible"
import { resolveNativeButton } from "./button"

function Collapsible({ ...props }: CollapsiblePrimitive.Root.Props) {
  return <CollapsiblePrimitive.Root data-slot="collapsible" {...props} />
}

function CollapsibleTrigger({
  nativeButton,
  render,
  ...props
}: CollapsiblePrimitive.Trigger.Props) {
  return (
    <CollapsiblePrimitive.Trigger
      data-slot="collapsible-trigger"
      nativeButton={resolveNativeButton(nativeButton, render)}
      render={render}
      {...props}
    />
  )
}

function CollapsibleContent({ ...props }: CollapsiblePrimitive.Panel.Props) {
  return (
    <CollapsiblePrimitive.Panel data-slot="collapsible-content" {...props} />
  )
}

export { Collapsible, CollapsibleTrigger, CollapsibleContent }
