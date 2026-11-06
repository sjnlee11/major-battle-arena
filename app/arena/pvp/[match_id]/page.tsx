import { Suspense } from "react";
import PvpBattle from "@/components/pvp/PvpBattle";

// 동적 라우트: 실제 처리는 클라이언트 컴포넌트(useParams)에서 한다. Cache Components 에서는 Suspense 로 감싸야 함.
export default function PvpMatchPage() {
  return (
    <Suspense fallback={null}>
      <PvpBattle />
    </Suspense>
  );
}
