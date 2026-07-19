import { useEffect, useRef } from "react";
import { useSearchParams } from "react-router";

import { RemoteAssistanceCard } from "./RemoteAssistanceCard.js";

export function RemoteAssistancePage({
  busy,
  connectCode,
  connectId,
  notice,
  onConnectCodeChange,
  onConnectIdChange,
  onStart,
}: {
  busy: string | null;
  connectCode: string;
  connectId: string;
  notice: string;
  onConnectCodeChange: (value: string) => void;
  onConnectIdChange: (value: string) => void;
  onStart: () => void;
}) {
  const [searchParams] = useSearchParams();
  const appliedPrefill = useRef(false);

  // 命令面板“按设备 ID 连接伙伴设备…”跳转带 ?id= 时，进入本页自动带入该 ID，仅生效一次。
  useEffect(() => {
    if (appliedPrefill.current) return;
    const prefillId = searchParams.get("id");
    if (prefillId) onConnectIdChange(prefillId.replace(/\D/g, ""));
    appliedPrefill.current = true;
  }, [searchParams, onConnectIdChange]);

  return (
    <>
      <header className="shell-page-topbar">
        <h1>远控伙伴</h1>
      </header>
      <div className="shell-page-body">
        <div className="shell-page-body-narrow">
          <RemoteAssistanceCard
            busy={busy}
            connectCode={connectCode}
            connectId={connectId}
            notice={notice}
            onConnectCodeChange={onConnectCodeChange}
            onConnectIdChange={onConnectIdChange}
            onStart={onStart}
          />
        </div>
      </div>
    </>
  );
}
