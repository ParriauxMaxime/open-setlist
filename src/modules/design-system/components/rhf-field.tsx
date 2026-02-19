import { cloneElement, type ReactElement } from "react";
import { type Control, type FieldPath, type FieldValues, useController } from "react-hook-form";
import { Field } from "./form";

interface RhfFieldProps<T extends FieldValues> {
  label: string;
  name: FieldPath<T>;
  control: Control<T>;
  children: ReactElement<{ value: unknown; onChange: (...args: unknown[]) => void }>;
}

export function RhfField<T extends FieldValues>({
  label,
  name,
  control,
  children,
}: RhfFieldProps<T>) {
  const { field, fieldState } = useController({ name, control });

  return (
    <Field label={label} error={fieldState.error?.message}>
      {cloneElement(children, {
        value: field.value,
        onChange: field.onChange,
      })}
    </Field>
  );
}
