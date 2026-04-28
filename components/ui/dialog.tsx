'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from '@phosphor-icons/react';
import { cn } from '@/lib/cn';

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

type Size = 'sm' | 'md' | 'lg' | 'xl';

const SIZE_CLASS: Record<Size, string> = {
  sm: '',
  md: '',
  lg: 'modal-lg',
  xl: 'modal-xl',
};

export function DialogContent({
  children,
  className,
  title,
  size = 'md',
}: {
  children: React.ReactNode;
  className?: string;
  title?: string;
  size?: Size;
}) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="modal-backdrop" />
      <DialogPrimitive.Content className={cn('modal', SIZE_CLASS[size], className)}>
        {title && (
          <div className="modal-header">
            <DialogPrimitive.Title>{title}</DialogPrimitive.Title>
            <DialogPrimitive.Close className="btn-ghost btn btn-sm">
              <X size={14} />
            </DialogPrimitive.Close>
          </div>
        )}
        <div className="modal-body">{children}</div>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function DialogFooter({ children }: { children: React.ReactNode }) {
  return <div className="modal-footer">{children}</div>;
}
