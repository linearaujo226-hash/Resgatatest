import { Suspense } from "react";
import AuthScreen from "@/components/auth-screen";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <AuthScreen mode="login" />
    </Suspense>
  );
}
