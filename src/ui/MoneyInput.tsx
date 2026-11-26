import { Input, type InputProps } from "@/src/ui/Input";

export type MoneyInputProps = Omit<InputProps, "type" | "inputMode" | "prefix">;

/** Nilai disimpan sebagai teks. Ubah ke angka dengan `asMoney` dari `src/domain/form-input`. */
export function MoneyInput(props: MoneyInputProps) {
  return <Input {...props} type="text" inputMode="numeric" autoComplete="off" placeholder={props.placeholder ?? "0"} prefix="Rp" />;
}
