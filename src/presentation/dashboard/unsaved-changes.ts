export function confirmDiscardChanges() {
  if (
    typeof document === "undefined" ||
    !document.querySelector('[data-unsaved="true"]')
  )
    return true;
  return window.confirm("Ada input yang belum disimpan. Tinggalkan perubahan?");
}
