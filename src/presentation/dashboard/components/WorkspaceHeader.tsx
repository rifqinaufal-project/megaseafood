import type { ReactNode } from "react";

type WorkspaceHeaderProps = {
  eyebrow: ReactNode;
  title: ReactNode;
  description: ReactNode;
  actions?: ReactNode;
};

/** Shared page heading for every dashboard workspace. */
export default function WorkspaceHeader({
  eyebrow,
  title,
  description,
  actions,
}: WorkspaceHeaderProps) {
  return (
    <div className="workspace-page-head">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {actions ? <div className="workspace-actions">{actions}</div> : null}
    </div>
  );
}
