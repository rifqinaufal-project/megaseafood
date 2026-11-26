"use client";

import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cx } from "@/src/ui/cx";

type FieldText = { label: string; helper?: string; error?: string };

const baseControl =
  "w-full rounded-2xl border bg-surface-2 px-4 text-sm text-text placeholder:text-text-muted transition-colors focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-primary disabled:opacity-50";

function useFieldId(id?: string) {
  const generated = useId();
  return id ?? generated;
}

function messageId(id: string, helper?: string, error?: string) {
  if (error) return `${id}-error`;
  if (helper) return `${id}-help`;
  return undefined;
}

export function Field({ id, label, helper, error, children }: FieldText & { id: string; children: ReactNode }) {
  const message = messageId(id, helper, error);
  return (
    <div className="flex w-full flex-col gap-2">
      <label htmlFor={id} className="text-sm font-medium text-text">
        {label}
      </label>
      {children}
      {error ? (
        <p id={message} className="text-sm text-danger">
          {error}
        </p>
      ) : helper ? (
        <p id={message} className="text-sm text-text-muted">
          {helper}
        </p>
      ) : null}
    </div>
  );
}

export type InputProps = InputHTMLAttributes<HTMLInputElement> & FieldText & { prefix?: string };

export function Input({ label, helper, error, prefix, id, className, ...rest }: InputProps) {
  const fieldId = useFieldId(id);
  return (
    <Field id={fieldId} label={label} helper={helper} error={error}>
      <div className="relative">
        {prefix && (
          <span aria-hidden className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-sm text-text-muted">
            {prefix}
          </span>
        )}
        <input
          {...rest}
          id={fieldId}
          aria-invalid={error ? true : undefined}
          aria-describedby={messageId(fieldId, helper, error)}
          className={cx(baseControl, error ? "border-danger" : "border-border", "h-11", prefix && "pl-11", className)}
        />
      </div>
    </Field>
  );
}

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & FieldText;

export function Select({ label, helper, error, id, className, children, ...rest }: SelectProps) {
  const fieldId = useFieldId(id);
  return (
    <Field id={fieldId} label={label} helper={helper} error={error}>
      <select
        {...rest}
        id={fieldId}
        aria-invalid={error ? true : undefined}
        aria-describedby={messageId(fieldId, helper, error)}
        className={cx(baseControl, error ? "border-danger" : "border-border", "h-11 appearance-none", className)}
      >
        {children}
      </select>
    </Field>
  );
}

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & FieldText;

export function Textarea({ label, helper, error, id, className, ...rest }: TextareaProps) {
  const fieldId = useFieldId(id);
  return (
    <Field id={fieldId} label={label} helper={helper} error={error}>
      <textarea
        {...rest}
        id={fieldId}
        aria-invalid={error ? true : undefined}
        aria-describedby={messageId(fieldId, helper, error)}
        className={cx(baseControl, error ? "border-danger" : "border-border", "min-h-24 resize-y py-3", className)}
      />
    </Field>
  );
}
