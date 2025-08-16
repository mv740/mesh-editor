'use client'

import * as React from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

type ConfirmDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title?: React.ReactNode
  description?: React.ReactNode
  content?: React.ReactNode
  confirmLabel?: string
  confirmVariant?: 'default' | 'destructive'
  cancelLabel?: string
  cancelVariant?: 'default' | 'destructive'
  onAction?: (actionResult: boolean) => void
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title = 'Confirm',
  description = 'Are you sure?',
  content,
  confirmLabel = 'Confirm',
  confirmVariant = 'default',
  cancelLabel = 'Cancel',
  cancelVariant = 'destructive',
  onAction,
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? (
            <DialogDescription>{description}</DialogDescription>
          ) : null}
        </DialogHeader>
        {content ? (
          <div className="mb-4 text-muted-foreground text-sm">{content}</div>
        ) : null}
        <DialogFooter className="flex gap-2">
          <Button
            variant={cancelVariant}
            onClick={() => {
              onOpenChange(false)
              onAction?.(false)
            }}
          >
            {cancelLabel}
          </Button>
          <Button
            variant={confirmVariant}
            onClick={() => {
              onOpenChange(false)
              onAction?.(true)
            }}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
